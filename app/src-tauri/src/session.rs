use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{oneshot, Mutex as TokioMutex};

/// Predefined color pool for caller tabs (muted tones)
const COLOR_POOL: &[&str] = &[
    "#6b9fc8", // soft blue
    "#6aad8e", // sage green
    "#9a85b8", // muted purple
    "#c4a05a", // warm gold
    "#c07070", // dusty rose
    "#5fa8b5", // soft teal
    "#c08a5a", // muted orange
    "#b07a9a", // dusty pink
];

const MAX_HISTORY_SESSIONS: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Pending,
    Responded,
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
}

/// Feedback payload submitted by user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackPayload {
    pub interactive_feedback: String,
    pub command_logs: String,
    pub images: Vec<serde_json::Value>,
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
        let (callers, sessions, color_index) = Self::load_from_disk(&data_dir);
        Self {
            callers,
            sessions,
            color_index,
            data_dir,
        }
    }

    fn history_path(&self) -> PathBuf {
        self.data_dir.join("history.json")
    }

    fn images_dir(&self) -> PathBuf {
        self.data_dir.join("images")
    }

    /// Register or get a caller. Assigns a color from the pool on first sight.
    pub fn ensure_caller(&mut self, name: &str, version: &str, client_name: &str) -> CallerInfo {
        // Use a simple hash of the name as the caller id
        let id = format!("caller_{:x}", md5_simple(name));
        if let Some(existing) = self.callers.get(&id) {
            let result = existing.clone();
            // Update client_name if it was previously empty
            if result.client_name.is_empty() && !client_name.is_empty() {
                self.callers.get_mut(&id).unwrap().client_name = client_name.to_string();
                self.persist();
            }
            return result;
        }
        let color = COLOR_POOL[self.color_index % COLOR_POOL.len()].to_string();
        self.color_index += 1;
        let caller = CallerInfo {
            id: id.clone(),
            name: name.to_string(),
            version: version.to_string(),
            color,
            client_name: client_name.to_string(),
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

        // Send response back to waiting MCP Server via oneshot channel
        if let Some(tx) = entry.response_tx.take() {
            let _ = tx.send(payload);
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
