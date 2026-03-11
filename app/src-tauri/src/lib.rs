mod ipc;
mod session;

use std::sync::Mutex;
use tauri::{Manager, State};
use serde::{Deserialize, Serialize};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use session::{
    CallerInfo, FeedbackPayload, SessionDetail, SessionSummary, SharedSessionManager,
};

/// Running mode: legacy (CLI args + output file) or persistent (IPC)
#[derive(Debug, Clone, PartialEq)]
pub enum AppMode {
    Legacy,
    Persistent,
}

/// App arguments passed from CLI or MCP server (legacy mode)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppArgs {
    pub summary: String,
    pub request_name: String,
    pub project_directory: String,
    pub output_file: String,
    pub command_logs: String,
}

/// Global app state holding CLI arguments and mode
pub struct AppState {
    pub args: Mutex<AppArgs>,
    pub mode: AppMode,
}

/// Image data for submission
#[derive(Debug, Deserialize)]
pub struct ImageData {
    pub path: String,
    pub data_url: Option<String>,
}

/// Prompt template loaded from mcp_prompts/ folder
#[derive(Debug, Serialize)]
pub struct PromptItem {
    pub name: String,
    pub description: String,
    pub content: String,
    pub icon: String,
}

/// Return the app args to the frontend (legacy mode compatibility)
#[tauri::command]
fn get_app_args(state: State<AppState>) -> AppArgs {
    state.args.lock().unwrap().clone()
}

/// Return the current app mode to the frontend
#[tauri::command]
fn get_app_mode(state: State<AppState>) -> String {
    match state.mode {
        AppMode::Legacy => "legacy".to_string(),
        AppMode::Persistent => "persistent".to_string(),
    }
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
    };

    let mut mgr = session_mgr.lock().await;
    mgr.submit_feedback(&session_id, payload)
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

/// Get the server.mjs path for MCP config
#[tauri::command]
fn get_server_path() -> String {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    if let Some(dir) = exe_dir {
        // 1) Next to executable (production layout)
        let server_path = dir.join("server.mjs");
        if server_path.exists() {
            return server_path.to_string_lossy().to_string();
        }
        // 2) Dev mode: exe is at app/src-tauri/target/{profile}/, server.mjs at workspace root
        //    Walk up to find server.mjs (max 6 levels)
        let mut ancestor = dir.clone();
        for _ in 0..6 {
            if let Some(parent) = ancestor.parent() {
                let candidate = parent.join("server.mjs");
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
                ancestor = parent.to_path_buf();
            } else {
                break;
            }
        }
    }
    // Fallback: show placeholder
    "/path/to/my-last-feedback/server.mjs".to_string()
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

/// Submit user feedback and write result to output file (legacy mode)
#[tauri::command]
fn submit_feedback(
    state: State<AppState>,
    output_file: String,
    feedback_text: String,
    command_logs: String,
    images: Vec<ImageData>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let out_path = if output_file.is_empty() {
        state.args.lock().unwrap().output_file.clone()
    } else {
        output_file
    };

    if out_path.is_empty() {
        return Err("No output file specified".to_string());
    }

    let result = serde_json::json!({
        "interactive_feedback": feedback_text,
        "command_logs": command_logs,
        "images": images.iter().filter_map(|img| {
            img.data_url.as_ref().map(|data| {
                let parts: Vec<&str> = data.splitn(2, ',').collect();
                if parts.len() == 2 {
                    let mime_part = parts[0];
                    let mime = mime_part.trim_start_matches("data:").split(';').next().unwrap_or("image/png");
                    serde_json::json!({
                        "type": mime,
                        "data": parts[1],
                        "path": img.path
                    })
                } else {
                    serde_json::Value::Null
                }
            })
        }).filter(|v| !v.is_null()).collect::<Vec<_>>()
    });

    std::fs::write(&out_path, serde_json::to_string_pretty(&result).unwrap())
        .map_err(|e| format!("Failed to write output: {e}"))?;

    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.close().ok();
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let mut app_args = AppArgs::default();

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--prompt" | "--summary" => {
                if i + 1 < args.len() {
                    app_args.summary = args[i + 1].clone();
                    i += 2;
                } else { i += 1; }
            }
            "--request-name" => {
                if i + 1 < args.len() {
                    app_args.request_name = args[i + 1].clone();
                    i += 2;
                } else { i += 1; }
            }
            "--project-directory" => {
                if i + 1 < args.len() {
                    app_args.project_directory = args[i + 1].clone();
                    i += 2;
                } else { i += 1; }
            }
            "--output-file" => {
                if i + 1 < args.len() {
                    app_args.output_file = args[i + 1].clone();
                    i += 2;
                } else { i += 1; }
            }
            _ => { i += 1; }
        }
    }

    // Determine mode: legacy if --output-file is provided, persistent otherwise
    let mode = if app_args.output_file.is_empty() {
        AppMode::Persistent
    } else {
        AppMode::Legacy
    };

    // Determine data directory for history persistence
    let data_dir = {
        #[cfg(target_os = "windows")]
        {
            std::env::var("APPDATA")
                .map(|a| std::path::PathBuf::from(a).join("my-last-feedback"))
                .unwrap_or_else(|_| std::env::temp_dir().join("my-last-feedback"))
        }
        #[cfg(target_os = "macos")]
        {
            std::env::var("HOME")
                .map(|h| {
                    std::path::PathBuf::from(h)
                        .join("Library/Application Support/my-last-feedback")
                })
                .unwrap_or_else(|_| std::env::temp_dir().join("my-last-feedback"))
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
                .join("my-last-feedback")
        }
    };

    let session_mgr = session::create_session_manager(data_dir);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .manage(AppState {
            args: Mutex::new(app_args),
            mode: mode.clone(),
        })
        .manage(session_mgr.clone())
        .invoke_handler(tauri::generate_handler![
            get_app_args,
            get_app_mode,
            submit_feedback,
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
            load_history,
            remove_session,
            clear_all_history,
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();

            if mode == AppMode::Persistent {
                // Start IPC server in persistent mode
                let mgr = session_mgr.clone();
                let handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    match ipc::start_ipc_server(mgr, handle).await {
                        Ok(port) => eprintln!("[App] IPC server started on port {}", port),
                        Err(e) => eprintln!("[App] Failed to start IPC server: {}", e),
                    }
                });

                // In persistent mode, set up system tray
                use tauri::tray::TrayIconBuilder;
                use tauri::menu::{MenuBuilder, MenuItemBuilder};

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
            }

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

                // In persistent mode, intercept close to hide instead of quit
                if mode == AppMode::Persistent {
                    let window_clone = window.clone();
                    window.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = window_clone.hide();
                        }
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
