mod ipc;
mod mlc;
mod preview_browser;
mod project_resources;
mod remote;
mod session;

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};
use serde::{Deserialize, Serialize};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use session::{
    CallerInfo, FeedbackPayload, MlcAttachment, SessionDetail, SessionSummary, SharedSessionManager,
};
use ipc::SharedMlraWriter;
use mlc::{mlc_delete_document, mlc_read_document, mlc_search_documents, mlc_toggle_favorite};
use project_resources::project_list_directory;
use preview_browser::{
    preview_capture_element, preview_close_tab, preview_create_tab, preview_go_back, preview_go_forward,
    preview_hide_tab, preview_navigate, preview_reload, preview_set_bounds, preview_start_picker, preview_stop_picker,
    PreviewBrowserState,
};

/// Global app state shared by persistent-mode commands
pub struct AppState {
    pub auto_focus_new_request: Mutex<bool>,
    pub data_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppSettings {
    #[serde(default = "default_true")]
    auto_focus_new_request: bool,
}

fn default_true() -> bool { true }

impl Default for AppSettings {
    fn default() -> Self {
        Self { auto_focus_new_request: true }
    }
}

fn settings_path(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("settings.json")
}

fn load_app_settings(data_dir: &std::path::Path) -> AppSettings {
    let path = settings_path(data_dir);
    std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<AppSettings>(&content).ok())
        .unwrap_or_default()
}

fn save_app_settings(data_dir: &std::path::Path, settings: &AppSettings) {
    let _ = std::fs::create_dir_all(data_dir);
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = std::fs::write(settings_path(data_dir), json);
    }
}

/// Prompt template loaded from mcp_prompts/ folder
#[derive(Debug, Serialize)]
pub struct PromptItem {
    pub name: String,
    pub description: String,
    pub content: String,
    pub icon: String,
}

#[derive(Debug, Deserialize)]
pub struct ImageData {
    pub path: String,
    pub data_url: Option<String>,
}

#[tauri::command]
fn set_auto_focus_new_request(state: State<AppState>, enabled: bool) {
    if let Ok(mut value) = state.auto_focus_new_request.lock() {
        *value = enabled;
    }
    save_app_settings(&state.data_dir, &AppSettings { auto_focus_new_request: enabled });
}

#[tauri::command]
fn get_auto_focus_new_request(state: State<AppState>) -> bool {
    state.auto_focus_new_request.lock().map(|value| *value).unwrap_or(true)
}

fn queued_drafts_path(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("queued-drafts.json")
}

fn draft_images_dir(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("draft-images")
}

fn sanitize_file_part(input: &str) -> String {
    let sanitized: String = input
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '_' })
        .collect();
    if sanitized.is_empty() { "draft".to_string() } else { sanitized }
}

fn draft_mime_to_ext(mime: &str) -> &str {
    match mime {
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        _ => "png",
    }
}

fn split_data_url(data_url: &str) -> Option<(String, String)> {
    let (header, data) = data_url.split_once(',')?;
    let mime = header
        .trim_start_matches("data:")
        .split(';')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("image/png")
        .to_string();
    Some((mime, data.to_string()))
}

fn normalize_queued_drafts_for_save(data_dir: &std::path::Path, drafts: &mut serde_json::Value) -> Result<(), String> {
    let images_dir = draft_images_dir(data_dir);
    std::fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;
    let mut referenced_files = HashSet::new();

    if let Some(draft_map) = drafts.as_object_mut() {
        for (caller_id, draft) in draft_map.iter_mut() {
            let caller_part = sanitize_file_part(caller_id);
            let Some(images) = draft.get_mut("images").and_then(|value| value.as_array_mut()) else { continue; };

            for (index, image) in images.iter_mut().enumerate() {
                let Some(image_map) = image.as_object_mut() else { continue; };

                if let Some(data_url) = image_map
                    .remove("dataUrl")
                    .and_then(|value| value.as_str().map(|s| s.to_string()))
                {
                    if let Some((mime, data)) = split_data_url(&data_url) {
                        let file_name = format!("{}_{}.{}", caller_part, index, draft_mime_to_ext(&mime));
                        std::fs::write(images_dir.join(&file_name), data).map_err(|e| e.to_string())?;
                        referenced_files.insert(file_name.clone());
                        image_map.insert("draft_file".to_string(), serde_json::Value::String(file_name));
                        image_map.insert("draft_mime".to_string(), serde_json::Value::String(mime));
                    }
                } else if let Some(file_name) = image_map.get("draft_file").and_then(|value| value.as_str()) {
                    referenced_files.insert(file_name.to_string());
                }
            }
        }
    }

    if let Ok(entries) = std::fs::read_dir(&images_dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if !referenced_files.contains(&file_name) {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    Ok(())
}

fn hydrate_queued_drafts_from_files(data_dir: &std::path::Path, drafts: &mut serde_json::Value) {
    let images_dir = draft_images_dir(data_dir);
    let Some(draft_map) = drafts.as_object_mut() else { return; };

    for draft in draft_map.values_mut() {
        let Some(images) = draft.get_mut("images").and_then(|value| value.as_array_mut()) else { continue; };
        for image in images {
            let Some(image_map) = image.as_object_mut() else { continue; };
            if image_map.contains_key("dataUrl") {
                continue;
            }
            let Some(file_name) = image_map.get("draft_file").and_then(|value| value.as_str()) else { continue; };
            let mime = image_map
                .get("draft_mime")
                .and_then(|value| value.as_str())
                .unwrap_or("image/png");
            if let Ok(data) = std::fs::read_to_string(images_dir.join(file_name)) {
                image_map.insert("dataUrl".to_string(), serde_json::Value::String(format!("data:{};base64,{}", mime, data)));
            }
        }
    }
}

#[tauri::command]
fn load_queued_drafts(state: State<AppState>) -> serde_json::Value {
    let path = queued_drafts_path(&state.data_dir);
    let mut drafts = std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    hydrate_queued_drafts_from_files(&state.data_dir, &mut drafts);
    drafts
}

#[tauri::command]
fn save_queued_drafts(state: State<AppState>, mut drafts: serde_json::Value) -> Result<(), String> {
    std::fs::create_dir_all(&state.data_dir).map_err(|e| e.to_string())?;
    normalize_queued_drafts_for_save(&state.data_dir, &mut drafts)?;
    let json = serde_json::to_string_pretty(&drafts).map_err(|e| e.to_string())?;
    std::fs::write(queued_drafts_path(&state.data_dir), json).map_err(|e| e.to_string())
}

// ── Persistent-mode Tauri Commands ──

/// Get all registered callers
#[tauri::command]
async fn get_callers(session_mgr: State<'_, SharedSessionManager>) -> Result<Vec<CallerInfo>, String> {
    let mgr = session_mgr.lock().await;
    Ok(mgr.get_callers())
}

/// Get all sessions (summaries)
#[tauri::command]
async fn get_all_sessions(session_mgr: State<'_, SharedSessionManager>) -> Result<Vec<SessionSummary>, String> {
    let mgr = session_mgr.lock().await;
    Ok(mgr.get_all_sessions())
}

/// Get sessions for a specific caller
#[tauri::command]
async fn get_sessions_for_caller(
    session_mgr: State<'_, SharedSessionManager>,
    caller_id: String,
) -> Result<Vec<SessionSummary>, String> {
    let mgr = session_mgr.lock().await;
    Ok(mgr.get_sessions_for_caller(&caller_id))
}

/// Get full session detail
#[tauri::command]
async fn get_session_detail(
    session_mgr: State<'_, SharedSessionManager>,
    session_id: String,
) -> Result<Option<SessionDetail>, String> {
    let mgr = session_mgr.lock().await;
    Ok(mgr.get_session_detail(&session_id))
}

/// Submit feedback for a pending session (persistent mode)
#[tauri::command]
async fn submit_session_feedback(
    session_mgr: State<'_, SharedSessionManager>,
    session_id: String,
    feedback_text: String,
    command_logs: String,
    images: Vec<ImageData>,
    mlc_attachments: Vec<MlcAttachment>,
    transfer_to_alias: Option<String>,
) -> Result<(), String> {
    let image_values: Vec<serde_json::Value> = images
        .iter()
        .filter_map(|img| {
            img.data_url.as_ref().map(|data| {
                let parts: Vec<&str> = data.splitn(2, ',').collect();
                if parts.len() == 2 {
                    let mime_part = parts[0];
                    let mime = mime_part
                        .trim_start_matches("data:")
                        .split(';')
                        .next()
                        .unwrap_or("image/png");
                    serde_json::json!({
                        "type": mime,
                        "data": parts[1],
                        "path": img.path
                    })
                } else {
                    serde_json::Value::Null
                }
            })
        })
        .filter(|v| !v.is_null())
        .collect();

    let payload = FeedbackPayload {
        interactive_feedback: feedback_text,
        command_logs,
        images: image_values,
        caller_alias: None,
        transfer_to_alias: transfer_to_alias
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
    };

    let mut mgr = session_mgr.lock().await;
    mgr.submit_feedback(&session_id, payload, mlc_attachments)
}

/// Update caller tab color
#[tauri::command]
async fn update_caller_color(
    session_mgr: State<'_, SharedSessionManager>,
    caller_id: String,
    color: String,
) -> Result<(), String> {
    let mut mgr = session_mgr.lock().await;
    mgr.update_caller_color(&caller_id, color)
}

/// Rename a caller (change workspace name)
#[tauri::command]
async fn rename_caller(
    session_mgr: State<'_, SharedSessionManager>,
    caller_id: String,
    new_name: String,
) -> Result<(), String> {
    let mut mgr = session_mgr.lock().await;
    mgr.rename_caller(&caller_id, new_name)
}

/// Merge source caller into target caller
#[tauri::command]
async fn merge_callers(
    session_mgr: State<'_, SharedSessionManager>,
    source_id: String,
    target_id: String,
) -> Result<usize, String> {
    let mut mgr = session_mgr.lock().await;
    mgr.merge_callers(&source_id, &target_id)
}

/// Get pending count for a caller
#[tauri::command]
async fn get_pending_count(
    session_mgr: State<'_, SharedSessionManager>,
    caller_id: String,
) -> Result<usize, String> {
    let mgr = session_mgr.lock().await;
    Ok(mgr.pending_count(&caller_id))
}

/// Update caller display order
#[tauri::command]
async fn update_caller_order(
    session_mgr: State<'_, SharedSessionManager>,
    order: Vec<String>,
) -> Result<(), String> {
    let mut mgr = session_mgr.lock().await;
    mgr.update_caller_order(order);
    Ok(())
}

/// Cancel a pending session and persist status
#[tauri::command]
async fn cancel_session(
    session_mgr: State<'_, SharedSessionManager>,
    session_id: String,
) -> Result<(), String> {
    let mut mgr = session_mgr.lock().await;
    mgr.cancel_session(&session_id)
}

/// Load persisted history (callers + sessions without image data) for frontend init
#[derive(Serialize)]
struct HistoryPayload {
    callers: Vec<CallerInfo>,
    sessions: Vec<SessionDetail>,
}

#[tauri::command]
async fn load_history(
    session_mgr: State<'_, SharedSessionManager>,
) -> Result<HistoryPayload, String> {
    let mgr = session_mgr.lock().await;
    Ok(HistoryPayload {
        callers: mgr.get_callers(),
        sessions: mgr.get_all_details_lite(),
    })
}

/// Remove a session. Returns whether the caller was also removed (no remaining sessions).
#[tauri::command]
async fn remove_session(
    session_mgr: State<'_, SharedSessionManager>,
    session_id: String,
) -> Result<bool, String> {
    let mut mgr = session_mgr.lock().await;
    Ok(mgr.remove_session(&session_id))
}

/// Remove a caller and all its sessions
#[tauri::command]
async fn remove_caller(
    session_mgr: State<'_, SharedSessionManager>,
    caller_id: String,
) -> Result<usize, String> {
    let mut mgr = session_mgr.lock().await;
    mgr.remove_caller(&caller_id)
}

/// Remove all callers that have zero sessions
#[tauri::command]
async fn remove_empty_callers(
    session_mgr: State<'_, SharedSessionManager>,
) -> Result<Vec<String>, String> {
    let mut mgr = session_mgr.lock().await;
    Ok(mgr.remove_empty_callers())
}

/// Trim sessions for a caller to a maximum count
#[tauri::command]
async fn trim_caller_sessions(
    session_mgr: State<'_, SharedSessionManager>,
    caller_id: String,
    max_per_caller: usize,
) -> Result<usize, String> {
    let mut mgr = session_mgr.lock().await;
    Ok(mgr.trim_caller_sessions(&caller_id, max_per_caller))
}

#[tauri::command]
async fn clear_all_history(
    session_mgr: State<'_, SharedSessionManager>,
) -> Result<(), String> {
    let mut mgr = session_mgr.lock().await;
    mgr.clear_all_history();
    Ok(())
}

/// Get autostart enabled state
#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

/// Set autostart enabled state
#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e: tauri_plugin_autostart::Error| e.to_string())
    } else {
        autolaunch.disable().map_err(|e: tauri_plugin_autostart::Error| e.to_string())
    }
}

/// Get the MLFB MCP server entry-point path for MCP config.
/// Checks both the new location (`mcp/mlfb/index.mjs`) and the legacy
/// `server.mjs` for backward compatibility with older packaged bundles.
#[tauri::command]
fn get_server_path() -> String {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    // Candidates ordered by preference: new path first, legacy second.
    let rel_candidates = [
        std::path::PathBuf::from("mcp").join("mlfb").join("index.mjs"),
        std::path::PathBuf::from("server.mjs"),
    ];

    if let Some(dir) = exe_dir {
        // 1) Next to executable (production layout)
        for rel in &rel_candidates {
            let p = dir.join(rel);
            if p.exists() {
                return p.to_string_lossy().to_string();
            }
        }

        // 2) Dev mode: exe is at app/src-tauri/target/{profile}/, walk up (max 6 levels)
        let mut ancestor = dir.clone();
        for _ in 0..6 {
            if let Some(parent) = ancestor.parent() {
                for rel in &rel_candidates {
                    let p = parent.join(rel);
                    if p.exists() {
                        return p.to_string_lossy().to_string();
                    }
                }
                ancestor = parent.to_path_buf();
            } else {
                break;
            }
        }
    }
    // Fallback: show placeholder pointing at the new canonical path.
    "/path/to/my-last-feedback/mcp/mlfb/index.mjs".to_string()
}

/// Load .prompt.md files from the mcp_prompts/ directory next to the executable
#[tauri::command]
fn load_prompts() -> Vec<PromptItem> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    let mut dirs_to_check = Vec::new();
    if let Some(d) = &exe_dir {
        dirs_to_check.push(d.join("mcp_prompts"));
    }
    // Also check current working directory
    if let Ok(cwd) = std::env::current_dir() {
        dirs_to_check.push(cwd.join("mcp_prompts"));
    }

    let mut results = Vec::new();
    for prompts_dir in dirs_to_check {
        if !prompts_dir.is_dir() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&prompts_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().is_some_and(|e| e == "md")
                    && path.file_name().is_some_and(|n| n.to_string_lossy().ends_with(".prompt.md"))
                {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Some(item) = parse_prompt_file(&content, &path) {
                            results.push(item);
                        }
                    }
                }
            }
        }
        if !results.is_empty() {
            break;
        }
    }
    results
}

fn parse_prompt_file(content: &str, path: &std::path::Path) -> Option<PromptItem> {
    // Parse YAML front matter: ---\n...\n---\n body
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }
    let after_start = &trimmed[3..];
    let end_pos = after_start.find("\n---")?;
    let front_matter = &after_start[..end_pos];
    let body = after_start[end_pos + 4..].trim().to_string();

    let mut name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let mut description = String::new();
    let mut icon = String::new();

    for line in front_matter.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("name:") {
            name = val.trim().trim_matches(|c| c == '"' || c == '\'').to_string();
        } else if let Some(val) = line.strip_prefix("description:") {
            description = val.trim().trim_matches(|c| c == '"' || c == '\'').to_string();
        } else if let Some(val) = line.strip_prefix("icon:") {
            icon = val.trim().trim_matches(|c| c == '"' || c == '\'').to_string();
        }
    }

    Some(PromptItem { name, description, content: body, icon })
}

/// Send a JSON message to the MLRA daemon via its stored TCP writer
#[tauri::command]
async fn send_to_mlra_daemon(
    mlra_writer: State<'_, SharedMlraWriter>,
    message: String,
) -> Result<(), String> {
    let mut guard = mlra_writer.lock().await;
    match guard.as_mut() {
        Some(writer) => {
            use tokio::io::AsyncWriteExt;
            let data = format!("{}\n", message);
            writer
                .write_all(data.as_bytes())
                .await
                .map_err(|e| format!("Failed to write to MLRA daemon: {}", e))?;
            writer
                .flush()
                .await
                .map_err(|e| format!("Failed to flush to MLRA daemon: {}", e))?;
            Ok(())
        }
        None => Err("MLRA daemon not connected".to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Determine data directory for history persistence.
    // Debug builds use a separate directory to avoid conflicting with installed release builds.
    #[cfg(debug_assertions)]
    let app_dir_name = "my-last-feedback-dev";
    #[cfg(not(debug_assertions))]
    let app_dir_name = "my-last-feedback";

    let data_dir = {
        #[cfg(target_os = "windows")]
        {
            std::env::var("APPDATA")
                .map(|a| std::path::PathBuf::from(a).join(app_dir_name))
                .unwrap_or_else(|_| std::env::temp_dir().join(app_dir_name))
        }
        #[cfg(target_os = "macos")]
        {
            std::env::var("HOME")
                .map(|h| {
                    std::path::PathBuf::from(h)
                        .join("Library/Application Support")
                        .join(app_dir_name)
                })
                .unwrap_or_else(|_| std::env::temp_dir().join(app_dir_name))
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            std::env::var("XDG_DATA_HOME")
                .map(std::path::PathBuf::from)
                .or_else(|_| {
                    std::env::var("HOME")
                        .map(|h| std::path::PathBuf::from(h).join(".local/share"))
                })
                .unwrap_or_else(|_| std::env::temp_dir())
                .join(app_dir_name)
        }
    };

    let settings = load_app_settings(&data_dir);
    let session_mgr = session::create_session_manager(data_dir.clone());
    let mlra_writer: SharedMlraWriter = std::sync::Arc::new(tokio::sync::Mutex::new(None));

    let builder = tauri::Builder::default();
    // In debug builds, skip single-instance enforcement so dev binary and installed
    // release binary can run side-by-side for testing.
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .manage(AppState {
            auto_focus_new_request: Mutex::new(settings.auto_focus_new_request),
            data_dir: data_dir.clone(),
        })
        .manage(session_mgr.clone())
        .manage(mlra_writer.clone())
        .manage(PreviewBrowserState::default())
        .invoke_handler(tauri::generate_handler![
            set_auto_focus_new_request,
            get_auto_focus_new_request,
            load_queued_drafts,
            save_queued_drafts,
            load_prompts,
            get_autostart,
            set_autostart,
            get_server_path,
            // Persistent-mode commands
            get_callers,
            get_all_sessions,
            get_sessions_for_caller,
            get_session_detail,
            submit_session_feedback,
            update_caller_color,
            rename_caller,
            merge_callers,
            get_pending_count,
            update_caller_order,
            cancel_session,
            load_history,
            remove_session,
            remove_caller,
            remove_empty_callers,
            trim_caller_sessions,
            clear_all_history,
            mlc_delete_document,
            mlc_read_document,
            mlc_search_documents,
            mlc_toggle_favorite,
            project_list_directory,
            preview_create_tab,
            preview_navigate,
            preview_reload,
            preview_go_back,
            preview_go_forward,
            preview_set_bounds,
            preview_hide_tab,
            preview_capture_element,
            preview_close_tab,
            preview_start_picker,
            preview_stop_picker,
            send_to_mlra_daemon,
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();

            let mgr = session_mgr.clone();
            let handle = app_handle.clone();
            let mlra_w = mlra_writer.clone();
            tauri::async_runtime::spawn(async move {
                match ipc::start_ipc_server(mgr, handle, mlra_w).await {
                    Ok(port) => eprintln!("[App] IPC server started on port {}", port),
                    Err(e) => eprintln!("[App] Failed to start IPC server: {}", e),
                }
            });

            // Start remote HTTP+WS server (Phase 0 skeleton; opt-in via env).
            // See MLC_MLFB远程反馈_方案B_v0.2_*.md §3.1
            if remote::is_enabled() {
                tauri::async_runtime::spawn(async move {
                    match remote::start_remote_server().await {
                        Ok(port) => eprintln!("[Remote] server listening on 0.0.0.0:{}", port),
                        Err(e) => eprintln!("[Remote] failed to start: {}", e),
                    }
                });
            }

            use tauri::menu::{MenuBuilder, MenuItemBuilder};
            use tauri::tray::TrayIconBuilder;

            let show_item = MenuItemBuilder::with_id("show", "Show Window")
                .build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit")
                .build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let tray_icon_bytes = include_bytes!("../icons/tray-icon.png");
            let tray_image = tauri::image::Image::from_bytes(tray_icon_bytes)
                .expect("failed to load tray icon");

            let _tray = TrayIconBuilder::new()
                .icon(tray_image)
                .tooltip("My Last Feedback")
                .menu(&menu)
                .on_menu_event(move |app_handle, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            ipc::cleanup_lock_file();
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Show window
            if let Some(window) = app.get_webview_window("main") {
                // On non-macOS, remove native decorations for custom titlebar
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = window.set_decorations(false);
                }

                // Set high-res window icon for crisp taskbar display
                let window_icon_bytes = include_bytes!("../icons/128x128@2x.png");
                if let Ok(icon) = tauri::image::Image::from_bytes(window_icon_bytes) {
                    let _ = window.set_icon(icon);
                }

                let _ = window.show().ok();

                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
