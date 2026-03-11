use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{oneshot, Mutex as TokioMutex};

/// Golden angle ≈ 137.508° — maximally separates sequential hues
const GOLDEN_ANGLE: f64 = 137.508;

/// Generate a muted color from a sequential index using HSL golden-angle spacing
fn generate_color(index: usize) -> String {
    let hue = (index as f64 * GOLDEN_ANGLE) % 360.0;
    hsl_to_hex(hue, 0.42, 0.58)
}

/// Convert HSL (h in 0..360, s/l in 0..1) to a #rrggbb hex string
fn hsl_to_hex(h: f64, s: f64, l: f64) -> String {
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = l - c / 2.0;
    let (r, g, b) = if h < 60.0 {
        (c, x, 0.0)
    } else if h < 120.0 {
        (x, c, 0.0)
    } else if h < 180.0 {
        (0.0, c, x)
    } else if h < 240.0 {
        (0.0, x, c)
    } else if h < 300.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };
    format!(
        "#{:02x}{:02x}{:02x}",
        ((r + m) * 255.0).round() as u8,
        ((g + m) * 255.0).round() as u8,
        ((b + m) * 255.0).round() as u8,
    )
}

const MAX_HISTORY_SESSIONS: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Pending,
    Responded,
    Cancelled,
}

/// AI caller information (one per MCP client)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallerInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub color: String,
    #[serde(default)]
    pub client_name: String,
    #[serde(default)]
    pub alias: String,
}

/// Serializable session summary for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    pub caller_id: String,
    pub request_name: String,
    pub status: SessionStatus,
    pub created_at: DateTime<Utc>,
}

/// Full session detail for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionDetail {
    pub id: String,
    pub caller_id: String,
    pub request_name: String,
    pub summary: String,
    pub project_directory: String,
    pub status: SessionStatus,
    pub created_at: DateTime<Utc>,
    pub feedback_text: Option<String>,
    pub command_logs: Option<String>,
    pub images: Vec<serde_json::Value>,
    #[serde(default)]
    pub questions: Vec<serde_json::Value>,
}

/// Feedback payload submitted by user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackPayload {
    pub interactive_feedback: String,
    pub command_logs: String,
    pub images: Vec<serde_json::Value>,
    /// Set by backend when responding — the current caller alias (may differ from original after merge)
    #[serde(default, skip_deserializing)]
    pub caller_alias: Option<String>,
}

// ── Persistence types ──

#[derive(Serialize, Deserialize)]
struct PersistedHistory {
    callers: HashMap<String, CallerInfo>,
    sessions: Vec<PersistedSession>,
    color_index: usize,
}

#[derive(Serialize, Deserialize)]
struct PersistedSession {
    id: String,
    caller_id: String,
    request_name: String,
    summary: String,
    project_directory: String,
    status: SessionStatus,
    created_at: DateTime<Utc>,
    feedback_text: Option<String>,
    command_logs: Option<String>,
    image_refs: Vec<ImageRef>,
    #[serde(default)]
    questions: Vec<serde_json::Value>,
}

#[derive(Serialize, Deserialize)]
struct ImageRef {
    file_name: String,
    mime_type: String,
}

/// Internal session with response channel
pub struct SessionEntry {
    pub detail: SessionDetail,
    pub response_tx: Option<oneshot::Sender<FeedbackPayload>>,
}

/// Central session manager — shared across IPC and Tauri commands
pub struct SessionManager {
    pub callers: HashMap<String, CallerInfo>,
    pub sessions: Vec<SessionEntry>,
    color_index: usize,
    data_dir: PathBuf,
}

impl SessionManager {
    pub fn new(data_dir: PathBuf) -> Self {
        let (mut callers, sessions, _old_color_index) = Self::load_from_disk(&data_dir);
        // Reassign colors using golden-angle HSL for better separation
        let mut ws_index: HashMap<String, usize> = HashMap::new();
        let mut idx: usize = 0;
        let mut sorted_ids: Vec<_> = callers.keys().cloned().collect();
        sorted_ids.sort();
        for id in &sorted_ids {
            if let Some(c) = callers.get(id) {
                if !ws_index.contains_key(&c.name) {
                    ws_index.insert(c.name.clone(), idx);
                    idx += 1;
                }
            }
        }
        for caller in callers.values_mut() {
            if let Some(&i) = ws_index.get(&caller.name) {
                caller.color = generate_color(i);
            }
        }
        let mut mgr = Self {
            callers,
            sessions,
            color_index: idx,
            data_dir,
        };
        mgr.persist();
        mgr
    }

    fn history_path(&self) -> PathBuf {
        self.data_dir.join("history.json")
    }

    fn images_dir(&self) -> PathBuf {
        self.data_dir.join("images")
    }

    /// Register or get a caller. Assigns a color from the pool on first sight.
    /// The `alias` parameter is used to distinguish different agents within the same workspace.
    /// Color is assigned per workspace name, so agents in the same workspace share color.
    pub fn ensure_caller(&mut self, name: &str, version: &str, client_name: &str, alias: &str) -> CallerInfo {
        // Caller ID includes alias so different agents are separate callers
        let id_input = if alias.is_empty() { name.to_string() } else { format!("{}:{}", name, alias) };
        let id = format!("caller_{:x}", md5_simple(&id_input));
        if let Some(existing) = self.callers.get(&id) {
            let mut result = existing.clone();
            // Update client_name if it was previously empty
            if result.client_name.is_empty() && !client_name.is_empty() {
                self.callers.get_mut(&id).unwrap().client_name = client_name.to_string();
                result.client_name = client_name.to_string();
                self.persist();
            }
            // Update alias if it was previously empty
            if result.alias.is_empty() && !alias.is_empty() {
                self.callers.get_mut(&id).unwrap().alias = alias.to_string();
                result.alias = alias.to_string();
                self.persist();
            }
            return result;
        }
        // Assign color: reuse existing workspace color, or generate new via golden-angle
        let color = if let Some(existing_ws) = self.callers.values().find(|c| c.name == name) {
            existing_ws.color.clone()
        } else {
            let c = generate_color(self.color_index);
            self.color_index += 1;
            c
        };
        let caller = CallerInfo {
            id: id.clone(),
            name: name.to_string(),
            version: version.to_string(),
            color,
            client_name: client_name.to_string(),
            alias: alias.to_string(),
        };
        self.callers.insert(id, caller.clone());
        self.persist();
        caller
    }

    /// Add a new pending session. Returns its id.
    pub fn add_session(
        &mut self,
        caller_id: String,
        session_id: String,
        request_name: String,
        summary: String,
        project_directory: String,
        questions: Vec<serde_json::Value>,
        response_tx: oneshot::Sender<FeedbackPayload>,
    ) -> String {
        let detail = SessionDetail {
            id: session_id.clone(),
            caller_id,
            request_name,
            summary,
            project_directory,
            status: SessionStatus::Pending,
            created_at: Utc::now(),
            feedback_text: None,
            command_logs: None,
            images: Vec::new(),
            questions,
        };
        self.sessions.push(SessionEntry {
            detail,
            response_tx: Some(response_tx),
        });
        self.persist();
        session_id
    }

    /// Get all callers
    pub fn get_callers(&self) -> Vec<CallerInfo> {
        self.callers.values().cloned().collect()
    }

    /// Get sessions for a specific caller
    pub fn get_sessions_for_caller(&self, caller_id: &str) -> Vec<SessionSummary> {
        self.sessions
            .iter()
            .filter(|s| s.detail.caller_id == caller_id)
            .map(|s| SessionSummary {
                id: s.detail.id.clone(),
                caller_id: s.detail.caller_id.clone(),
                request_name: s.detail.request_name.clone(),
                status: s.detail.status,
                created_at: s.detail.created_at,
            })
            .collect()
    }

    /// Get all sessions as summaries
    pub fn get_all_sessions(&self) -> Vec<SessionSummary> {
        self.sessions
            .iter()
            .map(|s| SessionSummary {
                id: s.detail.id.clone(),
                caller_id: s.detail.caller_id.clone(),
                request_name: s.detail.request_name.clone(),
                status: s.detail.status,
                created_at: s.detail.created_at,
            })
            .collect()
    }

    /// Get all sessions as full details but without resolving image file references.
    /// Used for initial history load to avoid reading all image files from disk.
    pub fn get_all_details_lite(&self) -> Vec<SessionDetail> {
        self.sessions
            .iter()
            .map(|s| {
                let mut detail = s.detail.clone();
                // Count images but don't load actual data
                let count = detail.images.len();
                detail.images = (0..count)
                    .map(|_| serde_json::json!({ "placeholder": true }))
                    .collect();
                detail
            })
            .collect()
    }

    /// Get full detail for a session (resolves image file references to base64 data)
    pub fn get_session_detail(&self, session_id: &str) -> Option<SessionDetail> {
        self.sessions
            .iter()
            .find(|s| s.detail.id == session_id)
            .map(|s| {
                let mut detail = s.detail.clone();
                let images_dir = self.images_dir();
                detail.images = detail
                    .images
                    .iter()
                    .map(|img| {
                        if let Some(file_name) = img.get("file").and_then(|v| v.as_str()) {
                            let file_path = images_dir.join(file_name);
                            if let Ok(data) = std::fs::read_to_string(&file_path) {
                                let mime = img
                                    .get("type")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("image/png");
                                serde_json::json!({ "type": mime, "data": data })
                            } else {
                                img.clone()
                            }
                        } else {
                            img.clone()
                        }
                    })
                    .collect();
                detail
            })
    }

    /// Submit feedback for a pending session. Returns Ok(()) if successful.
    pub fn submit_feedback(
        &mut self,
        session_id: &str,
        payload: FeedbackPayload,
    ) -> Result<(), String> {
        let images_dir = self.images_dir();
        let _ = std::fs::create_dir_all(&images_dir);

        let entry = self
            .sessions
            .iter_mut()
            .find(|s| s.detail.id == session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        if entry.detail.status != SessionStatus::Pending {
            return Err("Session already responded".to_string());
        }

        // Look up the current caller alias (may have changed due to merge)
        let caller_alias = self.callers.get(&entry.detail.caller_id)
            .map(|c| c.alias.clone())
            .unwrap_or_default();

        entry.detail.status = SessionStatus::Responded;
        entry.detail.feedback_text = Some(payload.interactive_feedback.clone());
        entry.detail.command_logs = Some(payload.command_logs.clone());

        // Save images to separate files; store file references in detail
        let mut image_refs = Vec::new();
        for (i, img) in payload.images.iter().enumerate() {
            if let Some(data) = img.get("data").and_then(|v| v.as_str()) {
                let mime = img
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("image/png");
                let ext = mime_to_ext(mime);
                let file_name = format!("{}_{}.{}", session_id, i, ext);
                let _ = std::fs::write(images_dir.join(&file_name), data);
                image_refs.push(serde_json::json!({
                    "type": mime,
                    "file": file_name,
                }));
            }
        }
        entry.detail.images = image_refs;

        // Send response back to waiting MCP Server via oneshot channel (with caller alias)
        if let Some(tx) = entry.response_tx.take() {
            let mut response_payload = payload;
            if !caller_alias.is_empty() {
                response_payload.caller_alias = Some(caller_alias);
            }
            let _ = tx.send(response_payload);
        }

        self.persist();
        Ok(())
    }

    /// Count pending sessions for a caller
    pub fn pending_count(&self, caller_id: &str) -> usize {
        self.sessions
            .iter()
            .filter(|s| s.detail.caller_id == caller_id && s.detail.status == SessionStatus::Pending)
            .count()
    }

    /// Cancel a pending session (client disconnected). Drops the oneshot sender so the IPC handler unblocks.
    pub fn cancel_session(&mut self, session_id: &str) -> Result<(), String> {
        let entry = self
            .sessions
            .iter_mut()
            .find(|s| s.detail.id == session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        if entry.detail.status != SessionStatus::Pending {
            return Err("Session is not pending".to_string());
        }

        entry.detail.status = SessionStatus::Cancelled;
        // Drop the oneshot sender — this will cause the IPC handler's rx.await to return Err,
        // unblocking the connection task.
        let _ = entry.response_tx.take();

        self.persist();
        Ok(())
    }

    /// Remove a session and its image files. Returns true if caller has no remaining sessions.
    pub fn remove_session(&mut self, session_id: &str) -> bool {
        let images_dir = self.images_dir();
        // Find and remove the session, cleaning up image files
        if let Some(pos) = self.sessions.iter().position(|s| s.detail.id == session_id) {
            let entry = self.sessions.remove(pos);
            let caller_id = entry.detail.caller_id.clone();
            // Delete image files
            for img in &entry.detail.images {
                if let Some(file_name) = img.get("file").and_then(|v| v.as_str()) {
                    let _ = std::fs::remove_file(images_dir.join(file_name));
                }
            }
            let caller_empty = !self.sessions.iter().any(|s| s.detail.caller_id == caller_id);
            if caller_empty {
                self.callers.remove(&caller_id);
            }
            self.persist();
            return caller_empty;
        }
        false
    }

    /// Update caller color
    pub fn update_caller_color(&mut self, caller_id: &str, color: String) -> Result<(), String> {
        let caller = self
            .callers
            .get_mut(caller_id)
            .ok_or_else(|| format!("Caller not found: {}", caller_id))?;
        caller.color = color;
        self.persist();
        Ok(())
    }

    /// Rename a caller (change its workspace name)
    pub fn rename_caller(&mut self, caller_id: &str, new_name: String) -> Result<(), String> {
        let caller = self
            .callers
            .get_mut(caller_id)
            .ok_or_else(|| format!("Caller not found: {}", caller_id))?;
        caller.name = new_name;
        self.persist();
        Ok(())
    }

    /// Merge source caller into target caller: move all sessions from source to target, then remove source.
    /// Returns the number of sessions moved.
    pub fn merge_callers(&mut self, source_id: &str, target_id: &str) -> Result<usize, String> {
        if source_id == target_id {
            return Err("Cannot merge a caller into itself".to_string());
        }
        if !self.callers.contains_key(source_id) {
            return Err(format!("Source caller not found: {}", source_id));
        }
        if !self.callers.contains_key(target_id) {
            return Err(format!("Target caller not found: {}", target_id));
        }

        let target_alias = self.callers.get(target_id)
            .map(|c| c.alias.clone())
            .unwrap_or_default();

        let mut moved = 0usize;
        for entry in &mut self.sessions {
            if entry.detail.caller_id == source_id {
                entry.detail.caller_id = target_id.to_string();
                // Inject [System] notice into pending sessions so the agent learns its new alias
                if entry.detail.status == SessionStatus::Pending && !target_alias.is_empty() {
                    let notice = format!(
                        "[System] Agent merged: your identifier has been updated to agent_name=\"{}\". Use this in ALL subsequent interactive_feedback calls.\n\n",
                        target_alias
                    );
                    entry.detail.summary = format!("{}{}", notice, entry.detail.summary);
                }
                moved += 1;
            }
        }

        self.callers.remove(source_id);
        self.persist();
        Ok(moved)
    }

    /// Clear all history: remove all callers, sessions, and image files
    pub fn clear_all_history(&mut self) {
        // Delete all image files
        let images_dir = self.images_dir();
        if images_dir.exists() {
            let _ = std::fs::remove_dir_all(&images_dir);
            let _ = std::fs::create_dir_all(&images_dir);
        }
        self.callers.clear();
        self.sessions.clear();
        self.persist();
    }

    // ── Persistence methods ──

    /// Trim old sessions and save to disk
    fn persist(&mut self) {
        self.trim_sessions();
        self.save_to_disk();
    }

    /// Remove oldest sessions beyond MAX_HISTORY_SESSIONS, clean up their image files
    fn trim_sessions(&mut self) {
        if self.sessions.len() <= MAX_HISTORY_SESSIONS {
            return;
        }
        let to_remove = self.sessions.len() - MAX_HISTORY_SESSIONS;
        let removed: Vec<SessionEntry> = self.sessions.drain(..to_remove).collect();
        let images_dir = self.images_dir();
        for entry in &removed {
            for img in &entry.detail.images {
                if let Some(file_name) = img.get("file").and_then(|v| v.as_str()) {
                    let _ = std::fs::remove_file(images_dir.join(file_name));
                }
            }
        }
    }

    /// Write callers + sessions to history.json
    fn save_to_disk(&self) {
        let _ = std::fs::create_dir_all(&self.data_dir);

        let persisted_sessions: Vec<PersistedSession> = self
            .sessions
            .iter()
            .map(|entry| {
                let image_refs: Vec<ImageRef> = entry
                    .detail
                    .images
                    .iter()
                    .filter_map(|img| {
                        img.get("file").and_then(|v| v.as_str()).map(|file_name| ImageRef {
                            file_name: file_name.to_string(),
                            mime_type: img
                                .get("type")
                                .and_then(|v| v.as_str())
                                .unwrap_or("image/png")
                                .to_string(),
                        })
                    })
                    .collect();

                PersistedSession {
                    id: entry.detail.id.clone(),
                    caller_id: entry.detail.caller_id.clone(),
                    request_name: entry.detail.request_name.clone(),
                    summary: entry.detail.summary.clone(),
                    project_directory: entry.detail.project_directory.clone(),
                    status: entry.detail.status,
                    created_at: entry.detail.created_at,
                    feedback_text: entry.detail.feedback_text.clone(),
                    command_logs: entry.detail.command_logs.clone(),
                    image_refs,
                    questions: entry.detail.questions.clone(),
                }
            })
            .collect();

        let history = PersistedHistory {
            callers: self.callers.clone(),
            sessions: persisted_sessions,
            color_index: self.color_index,
        };

        if let Ok(json) = serde_json::to_string_pretty(&history) {
            if let Err(e) = std::fs::write(self.history_path(), &json) {
                eprintln!("[Persist] Failed to write history: {}", e);
            }
        }
    }

    /// Load callers + sessions from disk
    fn load_from_disk(
        data_dir: &Path,
    ) -> (HashMap<String, CallerInfo>, Vec<SessionEntry>, usize) {
        let history_path = data_dir.join("history.json");
        if !history_path.exists() {
            return (HashMap::new(), Vec::new(), 0);
        }

        let content = match std::fs::read_to_string(&history_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[Persist] Failed to read history: {}", e);
                return (HashMap::new(), Vec::new(), 0);
            }
        };

        let history: PersistedHistory = match serde_json::from_str(&content) {
            Ok(h) => h,
            Err(e) => {
                eprintln!("[Persist] Failed to parse history: {}", e);
                return (HashMap::new(), Vec::new(), 0);
            }
        };

        let sessions = history
            .sessions
            .into_iter()
            .map(|ps| {
                let images: Vec<serde_json::Value> = ps
                    .image_refs
                    .iter()
                    .map(|r| {
                        serde_json::json!({
                            "type": r.mime_type,
                            "file": r.file_name,
                        })
                    })
                    .collect();

                SessionEntry {
                    detail: SessionDetail {
                        id: ps.id,
                        caller_id: ps.caller_id,
                        request_name: ps.request_name,
                        summary: ps.summary,
                        project_directory: ps.project_directory,
                        status: ps.status,
                        created_at: ps.created_at,
                        feedback_text: ps.feedback_text,
                        command_logs: ps.command_logs,
                        images,
                        questions: ps.questions,
                    },
                    response_tx: None,
                }
            })
            .collect();

        eprintln!(
            "[Persist] Loaded {} callers, {} sessions",
            history.callers.len(),
            history.color_index
        );

        (history.callers, sessions, history.color_index)
    }
}

/// Simple hash for generating caller IDs (not cryptographic — just for dedup)
fn md5_simple(input: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in input.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// Map MIME type to file extension
fn mime_to_ext(mime: &str) -> &str {
    match mime {
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        _ => "png",
    }
}

/// Thread-safe shared session manager
pub type SharedSessionManager = Arc<TokioMutex<SessionManager>>;

pub fn create_session_manager(data_dir: PathBuf) -> SharedSessionManager {
    Arc::new(TokioMutex::new(SessionManager::new(data_dir)))
}
