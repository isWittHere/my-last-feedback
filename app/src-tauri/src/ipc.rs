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
    caller: CallerField,
    payload: RequestPayload,
}

#[derive(Debug, Deserialize)]
struct CallerField {
    name: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    client_name: String,
}

#[derive(Debug, Deserialize)]
struct RequestPayload {
    summary: String,
    #[serde(default)]
    request_name: String,
    #[serde(default)]
    project_directory: String,
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
    pub request_name: String,
    pub summary: String,
    pub project_directory: String,
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
    let mut lines = BufReader::new(reader).lines();

    while let Ok(Some(line)) = lines.next_line().await {
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

        if request.msg_type != "feedback_request" {
            eprintln!("[IPC] Unknown message type: {}", request.msg_type);
            continue;
        }

        let session_id = request.session_id.clone();

        // Create oneshot channel for response
        let (tx, rx) = oneshot::channel::<FeedbackPayload>();

        // Register caller and session
        let event = {
            let mut mgr = session_mgr.lock().await;
            let caller = mgr.ensure_caller(&request.caller.name, &request.caller.version, &request.caller.client_name);
            mgr.add_session(
                caller.id.clone(),
                session_id.clone(),
                request.payload.request_name.clone(),
                request.payload.summary.clone(),
                request.payload.project_directory.clone(),
                tx,
            );
            NewSessionEvent {
                session_id: session_id.clone(),
                caller_id: caller.id.clone(),
                caller_name: caller.name.clone(),
                caller_color: caller.color.clone(),
                caller_client_name: caller.client_name.clone(),
                request_name: request.payload.request_name,
                summary: request.payload.summary,
                project_directory: request.payload.project_directory,
            }
        };

        // Emit event to frontend
        if let Err(e) = app_handle.emit("new-feedback-request", &event) {
            eprintln!("[IPC] Failed to emit event: {}", e);
        }

        // Show and focus window
        if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }

        // Wait for user response (blocking this connection's task)
        match rx.await {
            Ok(payload) => {
                let response = IpcResponse {
                    msg_type: "feedback_response".to_string(),
                    session_id,
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
                eprintln!("[IPC] Response channel closed for session (user may have cancelled)");
            }
        }
    }

    eprintln!("[IPC] Connection closed");
}

/// Remove the port lock file on shutdown
pub fn cleanup_lock_file() {
    let _ = std::fs::remove_file(lock_file_path());
}
