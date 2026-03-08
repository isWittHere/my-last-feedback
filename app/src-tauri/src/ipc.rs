use crate::session::{FeedbackPayload, SharedSessionManager};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::{Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::oneshot;

/// Port range for auto-selection
const PORT_START: u16 = 19850;
const PORT_END: u16 = 19860;

/// Lock file path to store the active port
fn lock_file_path() -> std::path::PathBuf {
    std::env::temp_dir().join("my-last-feedback.port")
}

/// Incoming request from MCP Server
#[derive(Debug, Deserialize)]
struct IpcRequest {
    #[serde(rename = "type")]
    msg_type: String,
    session_id: String,
    #[serde(default)]
    caller: Option<CallerField>,
    #[serde(default)]
    payload: Option<RequestPayload>,
}

#[derive(Debug, Deserialize)]
struct CallerField {
    name: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    client_name: String,
    #[serde(default)]
    alias: String,
}

#[derive(Debug, Deserialize)]
struct RequestPayload {
    summary: String,
    #[serde(default)]
    request_name: String,
    #[serde(default)]
    project_directory: String,
    #[serde(default)]
    questions: Vec<QuestionField>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct QuestionField {
    label: String,
    #[serde(default)]
    options: Vec<String>,
}

/// Outgoing response to MCP Server
#[derive(Debug, Serialize)]
struct IpcResponse {
    #[serde(rename = "type")]
    msg_type: String,
    session_id: String,
    payload: FeedbackPayload,
}

/// Event payload emitted to Tauri frontend
#[derive(Debug, Clone, Serialize)]
pub struct NewSessionEvent {
    pub session_id: String,
    pub caller_id: String,
    pub caller_name: String,
    pub caller_color: String,
    pub caller_client_name: String,
    pub caller_alias: String,
    pub request_name: String,
    pub summary: String,
    pub project_directory: String,
    pub questions: Vec<QuestionField>,
}

/// Event emitted when a session is cancelled (client disconnected)
#[derive(Debug, Clone, Serialize)]
pub struct SessionCancelledEvent {
    pub session_id: String,
}

/// Start the IPC TCP server. Tries ports in range, writes lock file, listens for connections.
pub async fn start_ipc_server(
    session_mgr: SharedSessionManager,
    app_handle: AppHandle,
) -> Result<u16, String> {
    let listener = bind_listener().await?;
    let port = listener.local_addr().unwrap().port();

    // Write port to lock file so MCP Servers can discover it
    if let Err(e) = std::fs::write(lock_file_path(), port.to_string()) {
        eprintln!("[IPC] Warning: could not write lock file: {}", e);
    }

    // Spawn accept loop
    let mgr = session_mgr.clone();
    let handle = app_handle.clone();
    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, addr)) => {
                    eprintln!("[IPC] New connection from {}", addr);
                    let mgr = mgr.clone();
                    let handle = handle.clone();
                    tokio::spawn(handle_connection(stream, mgr, handle));
                }
                Err(e) => {
                    eprintln!("[IPC] Accept error: {}", e);
                }
            }
        }
    });

    eprintln!("[IPC] Server listening on port {}", port);
    Ok(port)
}

async fn bind_listener() -> Result<TcpListener, String> {
    for port in PORT_START..=PORT_END {
        match TcpListener::bind(format!("127.0.0.1:{}", port)).await {
            Ok(listener) => return Ok(listener),
            Err(_) => continue,
        }
    }
    Err(format!(
        "Could not bind to any port in range {}-{}",
        PORT_START, PORT_END
    ))
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    session_mgr: SharedSessionManager,
    app_handle: AppHandle,
) {
    let (reader, mut writer) = stream.into_split();
    let buf_reader = BufReader::new(reader);
    let mut lines = buf_reader.lines();

    // Track session IDs created by this connection, so we can cancel them on disconnect
    let mut pending_session_ids: Vec<String> = Vec::new();

    'outer: loop {
        let line = match lines.next_line().await {
            Ok(Some(line)) => line,
            Ok(None) => {
                eprintln!("[IPC] Connection closed by remote");
                break;
            }
            Err(e) => {
                eprintln!("[IPC] Read error: {}", e);
                break;
            }
        };

        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        let request: IpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[IPC] Invalid JSON: {}", e);
                continue;
            }
        };

        match request.msg_type.as_str() {
            "session_cancel" => {
                let session_id = request.session_id.clone();
                eprintln!("[IPC] Received session_cancel for: {}", session_id);

                let mut mgr = session_mgr.lock().await;
                if let Err(e) = mgr.cancel_session(&session_id) {
                    eprintln!("[IPC] Failed to cancel session: {}", e);
                } else {
                    pending_session_ids.retain(|id| id != &session_id);
                    let event = SessionCancelledEvent { session_id };
                    if let Err(e) = app_handle.emit("session-cancelled", &event) {
                        eprintln!("[IPC] Failed to emit cancel event: {}", e);
                    }
                }
            }

            "feedback_request" => {
                let caller_field = match request.caller {
                    Some(c) => c,
                    None => {
                        eprintln!("[IPC] feedback_request missing caller field");
                        continue;
                    }
                };
                let payload_field = match request.payload {
                    Some(p) => p,
                    None => {
                        eprintln!("[IPC] feedback_request missing payload field");
                        continue;
                    }
                };

                let session_id = request.session_id.clone();

                // Create oneshot channel for response
                let (tx, rx) = oneshot::channel::<FeedbackPayload>();

                // Register caller and session
                let event = {
                    let mut mgr = session_mgr.lock().await;
                    let caller = mgr.ensure_caller(&caller_field.name, &caller_field.version, &caller_field.client_name, &caller_field.alias);
                    let questions_json: Vec<serde_json::Value> = payload_field.questions.iter().map(|q| {
                        serde_json::json!({
                            "label": q.label,
                            "options": q.options,
                        })
                    }).collect();
                    mgr.add_session(
                        caller.id.clone(),
                        session_id.clone(),
                        payload_field.request_name.clone(),
                        payload_field.summary.clone(),
                        payload_field.project_directory.clone(),
                        questions_json,
                        tx,
                    );
                    NewSessionEvent {
                        session_id: session_id.clone(),
                        caller_id: caller.id.clone(),
                        caller_name: caller.name.clone(),
                        caller_color: caller.color.clone(),
                        caller_client_name: caller.client_name.clone(),
                        caller_alias: caller.alias.clone(),
                        request_name: payload_field.request_name,
                        summary: payload_field.summary,
                        project_directory: payload_field.project_directory,
                        questions: payload_field.questions,
                    }
                };

                pending_session_ids.push(session_id.clone());

                // Emit event to frontend
                if let Err(e) = app_handle.emit("new-feedback-request", &event) {
                    eprintln!("[IPC] Failed to emit event: {}", e);
                }

                // Show and focus window
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }

                // Wait for EITHER user response OR TCP disconnect.
                // Using select! ensures we detect client disconnect even while waiting.
                let mut rx = rx;
                'wait: loop {
                    tokio::select! {
                        biased;
                        result = &mut rx => {
                            pending_session_ids.retain(|id| id != &session_id);
                            match result {
                                Ok(payload) => {
                                    let response = IpcResponse {
                                        msg_type: "feedback_response".to_string(),
                                        session_id: session_id.clone(),
                                        payload,
                                    };
                                    let json = serde_json::to_string(&response).unwrap_or_default();
                                    if let Err(e) = writer.write_all(format!("{}\n", json).as_bytes()).await {
                                        eprintln!("[IPC] Failed to send response: {}", e);
                                    }
                                    if let Err(e) = writer.flush().await {
                                        eprintln!("[IPC] Flush error: {}", e);
                                    }
                                }
                                Err(_) => {
                                    eprintln!("[IPC] Response channel closed (cancelled or dropped)");
                                }
                            }
                            break 'wait;
                        }
                        next = lines.next_line() => {
                            match next {
                                Ok(Some(line)) => {
                                    // Got another message while waiting (e.g. a cancel for another session)
                                    let line = line.trim().to_string();
                                    if !line.is_empty() {
                                        if let Ok(req) = serde_json::from_str::<IpcRequest>(&line) {
                                            if req.msg_type == "session_cancel" {
                                                eprintln!("[IPC] Received inline session_cancel for: {}", req.session_id);
                                                let mut mgr = session_mgr.lock().await;
                                                if let Err(e) = mgr.cancel_session(&req.session_id) {
                                                    eprintln!("[IPC] Failed to cancel session: {}", e);
                                                } else {
                                                    pending_session_ids.retain(|id| id != &req.session_id);
                                                    let event = SessionCancelledEvent { session_id: req.session_id };
                                                    if let Err(e) = app_handle.emit("session-cancelled", &event) {
                                                        eprintln!("[IPC] Failed to emit cancel event: {}", e);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    // Continue waiting for the original session's response
                                    continue 'wait;
                                }
                                _ => {
                                    // TCP disconnected while waiting for session response
                                    eprintln!("[IPC] TCP disconnected while waiting for session {}", session_id);
                                    break 'outer;
                                }
                            }
                        }
                    }
                }
            }

            other => {
                eprintln!("[IPC] Unknown message type: {}", other);
            }
        }
    }

    // Connection closed — cancel all remaining pending sessions from this connection
    if !pending_session_ids.is_empty() {
        eprintln!("[IPC] Cancelling {} pending sessions due to disconnect", pending_session_ids.len());
        let mut mgr = session_mgr.lock().await;
        for session_id in &pending_session_ids {
            if let Err(e) = mgr.cancel_session(session_id) {
                eprintln!("[IPC] Failed to cancel session {}: {}", session_id, e);
            } else {
                let event = SessionCancelledEvent { session_id: session_id.clone() };
                if let Err(e) = app_handle.emit("session-cancelled", &event) {
                    eprintln!("[IPC] Failed to emit cancel event: {}", e);
                }
            }
        }
    }

    eprintln!("[IPC] Connection fully closed");
}

/// Remove the port lock file on shutdown
pub fn cleanup_lock_file() {
    let _ = std::fs::remove_file(lock_file_path());
}
