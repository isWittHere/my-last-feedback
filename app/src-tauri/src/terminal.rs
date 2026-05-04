use portable_pty::{Child, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

const MAX_OUTPUT_BUFFER_BYTES: usize = 1024 * 1024;

#[derive(Clone, Default)]
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send>,
    cwd: String,
    shell: String,
    output: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionInfo {
    terminal_id: String,
    cwd: String,
    shell: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionSnapshot {
    terminal_id: String,
    cwd: String,
    shell: String,
    output: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputEvent {
    terminal_id: String,
    data: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalExitEvent {
    terminal_id: String,
    exit_code: Option<i32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalErrorEvent {
    terminal_id: String,
    message: String,
}

impl TerminalManager {
    fn insert(&self, terminal_id: String, session: TerminalSession) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|_| "Terminal state is unavailable".to_string())?;
        sessions.insert(terminal_id, session);
        Ok(())
    }

    fn remove(&self, terminal_id: &str) -> Option<TerminalSession> {
        self.sessions.lock().ok()?.remove(terminal_id)
    }

    fn append_output(&self, terminal_id: &str, data: &str) {
        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(session) = sessions.get_mut(terminal_id) {
                session.output.push_str(data);
                trim_output_buffer(&mut session.output);
            }
        }
    }

    fn list(&self) -> Result<Vec<TerminalSessionSnapshot>, String> {
        let sessions = self.sessions.lock().map_err(|_| "Terminal state is unavailable".to_string())?;
        Ok(sessions
            .iter()
            .map(|(terminal_id, session)| TerminalSessionSnapshot {
                terminal_id: terminal_id.clone(),
                cwd: session.cwd.clone(),
                shell: session.shell.clone(),
                output: session.output.clone(),
            })
            .collect())
    }

    fn read_buffer(&self, terminal_id: &str) -> Result<String, String> {
        let sessions = self.sessions.lock().map_err(|_| "Terminal state is unavailable".to_string())?;
        sessions
            .get(terminal_id)
            .map(|session| session.output.clone())
            .ok_or_else(|| "Terminal session not found".to_string())
    }

    pub fn kill_all(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            for (_, mut session) in sessions.drain() {
                let _ = session.child.kill();
            }
        }
    }
}

fn trim_output_buffer(buffer: &mut String) {
    if buffer.len() <= MAX_OUTPUT_BUFFER_BYTES {
        return;
    }
    let mut trim_to = buffer.len().saturating_sub(MAX_OUTPUT_BUFFER_BYTES);
    while trim_to < buffer.len() && !buffer.is_char_boundary(trim_to) {
        trim_to += 1;
    }
    if trim_to > 0 && trim_to <= buffer.len() {
        buffer.drain(..trim_to);
    }
}

fn emit_error(app: &AppHandle, terminal_id: &str, message: impl Into<String>) {
    let _ = app.emit("terminal-error", TerminalErrorEvent {
        terminal_id: terminal_id.to_string(),
        message: message.into(),
    });
}

fn resolve_cwd(cwd: Option<String>) -> PathBuf {
    if let Some(raw_cwd) = cwd {
        let path = PathBuf::from(raw_cwd);
        if path.is_dir() {
            return path;
        }
    }
    std::env::current_dir()
        .ok()
        .filter(|path| path.is_dir())
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from).filter(|path| path.is_dir()))
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from).filter(|path| path.is_dir()))
        .unwrap_or_else(std::env::temp_dir)
}

fn default_shell_candidates(shell: Option<String>) -> Vec<String> {
    if let Some(shell) = shell.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) {
        return vec![shell];
    }
    #[cfg(target_os = "windows")]
    {
        vec!["pwsh.exe".to_string(), "powershell.exe".to_string(), "cmd.exe".to_string()]
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut candidates = Vec::new();
        if let Some(shell) = std::env::var_os("SHELL").map(|value| value.to_string_lossy().to_string()).filter(|value| !value.is_empty()) {
            candidates.push(shell);
        }
        candidates.push("/bin/bash".to_string());
        candidates.push("/bin/sh".to_string());
        candidates
    }
}

fn pty_size(cols: Option<u16>, rows: Option<u16>) -> PtySize {
    PtySize {
        rows: rows.unwrap_or(24).max(2),
        cols: cols.unwrap_or(80).max(10),
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn spawn_terminal_session(
    cwd: &PathBuf,
    shell_candidates: &[String],
    size: PtySize,
) -> Result<(String, Box<dyn Read + Send>, TerminalSession), String> {
    let pty_system = NativePtySystem::default();
    let mut last_error = String::new();

    for shell in shell_candidates {
        let pair = pty_system.openpty(size).map_err(|error| error.to_string())?;
        let mut command = CommandBuilder::new(shell);
        command.cwd(cwd);
        match pair.slave.spawn_command(command) {
            Ok(child) => {
                let reader = pair.master.try_clone_reader().map_err(|error| error.to_string())?;
                let writer = pair.master.take_writer().map_err(|error| error.to_string())?;
                return Ok((shell.clone(), reader, TerminalSession {
                    master: pair.master,
                    writer,
                    child,
                    cwd: cwd.to_string_lossy().to_string(),
                    shell: shell.clone(),
                    output: String::new(),
                }));
            }
            Err(error) => {
                last_error = error.to_string();
            }
        }
    }

    Err(if last_error.is_empty() { "No shell candidates available".to_string() } else { last_error })
}

#[tauri::command]
pub fn terminal_create(
    app: AppHandle,
    state: State<TerminalManager>,
    cwd: Option<String>,
    shell: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<TerminalSessionInfo, String> {
    let terminal_id = format!("term_{}", Uuid::new_v4().simple());
    let resolved_cwd = resolve_cwd(cwd);
    let size = pty_size(cols, rows);
    let shell_candidates = default_shell_candidates(shell);
    let (shell, mut reader, session) = spawn_terminal_session(&resolved_cwd, &shell_candidates, size)?;

    state.insert(terminal_id.clone(), session)?;

    let app_for_thread = app.clone();
    let manager_for_thread = state.inner().clone();
    let thread_terminal_id = terminal_id.clone();
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                    manager_for_thread.append_output(&thread_terminal_id, &data);
                    let _ = app_for_thread.emit("terminal-output", TerminalOutputEvent {
                        terminal_id: thread_terminal_id.clone(),
                        data,
                    });
                }
                Err(error) => {
                    emit_error(&app_for_thread, &thread_terminal_id, error.to_string());
                    break;
                }
            }
        }
        manager_for_thread.remove(&thread_terminal_id);
        let _ = app_for_thread.emit("terminal-exit", TerminalExitEvent {
            terminal_id: thread_terminal_id,
            exit_code: None,
        });
    });

    Ok(TerminalSessionInfo {
        terminal_id,
        cwd: resolved_cwd.to_string_lossy().to_string(),
        shell,
    })
}

#[tauri::command]
pub fn terminal_list(state: State<TerminalManager>) -> Result<Vec<TerminalSessionSnapshot>, String> {
    state.list()
}

#[tauri::command]
pub fn terminal_read_buffer(state: State<TerminalManager>, terminal_id: String) -> Result<String, String> {
    state.read_buffer(&terminal_id)
}

#[tauri::command]
pub fn terminal_write(state: State<TerminalManager>, terminal_id: String, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|_| "Terminal state is unavailable".to_string())?;
    let session = sessions.get_mut(&terminal_id).ok_or_else(|| "Terminal session not found".to_string())?;
    session.writer.write_all(data.as_bytes()).map_err(|error| error.to_string())?;
    session.writer.flush().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn terminal_resize(state: State<TerminalManager>, terminal_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|_| "Terminal state is unavailable".to_string())?;
    let session = sessions.get(&terminal_id).ok_or_else(|| "Terminal session not found".to_string())?;
    session.master.resize(pty_size(Some(cols), Some(rows))).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn terminal_kill(state: State<TerminalManager>, terminal_id: String) -> Result<(), String> {
    if let Some(mut session) = state.remove(&terminal_id) {
        session.child.kill().map_err(|error| error.to_string())?;
    }
    Ok(())
}