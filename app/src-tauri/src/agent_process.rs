use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

const MAX_PROCESS_BUFFER_BYTES: usize = 512 * 1024;
const BUFFER_TRIM_LINE_SCAN_BYTES: usize = 4096;

#[derive(Clone, Default)]
pub struct AgentProcessManager {
    processes: Arc<Mutex<HashMap<String, AgentProcessSession>>>,
}

struct AgentProcessSession {
    child: Arc<Mutex<Child>>,
    stdin: ChildStdin,
    cwd: String,
    command: String,
    args: Vec<String>,
    stdout_tail: String,
    stderr_tail: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProcessStartOptions {
    command: String,
    #[serde(default)]
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProcessInfo {
    process_id: String,
    cwd: String,
    command: String,
    args: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProcessSnapshot {
    process_id: String,
    cwd: String,
    command: String,
    args: Vec<String>,
    stdout_tail: String,
    stderr_tail: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentProcessOutputEvent {
    process_id: String,
    data: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentProcessExitEvent {
    process_id: String,
    exit_code: Option<i32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentProcessErrorEvent {
    process_id: String,
    message: String,
}

impl AgentProcessManager {
    fn processes_guard(&self) -> MutexGuard<'_, HashMap<String, AgentProcessSession>> {
        self.processes.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn insert(&self, process_id: String, session: AgentProcessSession) {
        self.processes_guard().insert(process_id, session);
    }

    fn remove(&self, process_id: &str) -> Option<AgentProcessSession> {
        self.processes_guard().remove(process_id)
    }

    fn append_stdout(&self, process_id: &str, data: &str) {
        let mut processes = self.processes_guard();
        if let Some(session) = processes.get_mut(process_id) {
            session.stdout_tail.push_str(data);
            trim_buffer(&mut session.stdout_tail);
        }
    }

    fn append_stderr(&self, process_id: &str, data: &str) {
        let mut processes = self.processes_guard();
        if let Some(session) = processes.get_mut(process_id) {
            session.stderr_tail.push_str(data);
            trim_buffer(&mut session.stderr_tail);
        }
    }

    fn list(&self) -> Vec<AgentProcessSnapshot> {
        self.processes_guard()
            .iter()
            .map(|(process_id, session)| AgentProcessSnapshot {
                process_id: process_id.clone(),
                cwd: session.cwd.clone(),
                command: session.command.clone(),
                args: session.args.clone(),
                stdout_tail: session.stdout_tail.clone(),
                stderr_tail: session.stderr_tail.clone(),
            })
            .collect()
    }

    pub fn kill_all(&self) {
        let mut processes = self.processes_guard();
        for (_, session) in processes.drain() {
            if let Ok(mut child) = session.child.lock() {
                let _ = child.kill();
            }
        }
    }
}

fn trim_buffer(buffer: &mut String) {
    if buffer.len() <= MAX_PROCESS_BUFFER_BYTES {
        return;
    }
    let mut trim_to = buffer.len().saturating_sub(MAX_PROCESS_BUFFER_BYTES);
    while trim_to < buffer.len() && !buffer.is_char_boundary(trim_to) {
        trim_to += 1;
    }
    let scan_end = trim_to.saturating_add(BUFFER_TRIM_LINE_SCAN_BYTES).min(buffer.len());
    if trim_to < scan_end {
        if let Some(newline_offset) = buffer.as_bytes()[trim_to..scan_end].iter().position(|byte| *byte == b'\n') {
            trim_to += newline_offset + 1;
        }
    }
    while trim_to < buffer.len() && !buffer.is_char_boundary(trim_to) {
        trim_to += 1;
    }
    if trim_to > 0 && trim_to <= buffer.len() {
        buffer.drain(..trim_to);
    }
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

#[cfg(target_os = "windows")]
fn has_path_separator(value: &str) -> bool {
    value.contains('\\') || value.contains('/')
}

#[cfg(target_os = "windows")]
fn windows_path_env() -> Option<OsString> {
    std::env::var_os("PATH").or_else(|| std::env::var_os("Path"))
}

#[cfg(target_os = "windows")]
fn windows_command_names(command: &str) -> Vec<String> {
    if std::path::Path::new(command).extension().is_some() {
        return vec![command.to_string()];
    }
    let mut extensions = vec![".exe".to_string(), ".cmd".to_string(), ".bat".to_string(), ".ps1".to_string()];
    if let Some(pathext) = std::env::var_os("PATHEXT") {
        for ext in pathext.to_string_lossy().split(';') {
            let ext = ext.trim().to_ascii_lowercase();
            if !ext.is_empty() && !extensions.iter().any(|item| item.eq_ignore_ascii_case(&ext)) {
                extensions.push(ext);
            }
        }
    }
    extensions.into_iter().map(|ext| format!("{}{}", command, ext)).collect()
}

#[cfg(target_os = "windows")]
fn common_windows_command_candidates(command: &str) -> Vec<PathBuf> {
    if !command.eq_ignore_ascii_case("opencode") {
        return Vec::new();
    }
    let home = std::env::var_os("USERPROFILE").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(""));
    let app_data = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join("AppData").join("Roaming"));
    let local_app_data = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join("AppData").join("Local"));
    let program_data = std::env::var_os("ProgramData").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("C:\\ProgramData"));

    vec![
        app_data.join("npm").join("opencode.cmd"),
        app_data.join("npm").join("opencode.ps1"),
        local_app_data.join("pnpm").join("opencode.cmd"),
        local_app_data.join("Programs").join("opencode").join("opencode.exe"),
        local_app_data.join("opencode").join("opencode.exe"),
        home.join(".bun").join("bin").join("opencode.exe"),
        home.join(".bun").join("bin").join("opencode.cmd"),
        home.join(".opencode").join("bin").join("opencode.exe"),
        home.join("scoop").join("shims").join("opencode.exe"),
        home.join("scoop").join("shims").join("opencode.cmd"),
        program_data.join("chocolatey").join("bin").join("opencode.exe"),
        program_data.join("chocolatey").join("bin").join("opencode.cmd"),
    ]
}

#[cfg(target_os = "windows")]
fn find_windows_command(command: &str) -> Option<PathBuf> {
    if has_path_separator(command) {
        let path = PathBuf::from(command);
        return path.is_file().then_some(path);
    }

    let names = windows_command_names(command);
    if let Some(path_value) = windows_path_env() {
        for dir in std::env::split_paths(&path_value) {
            for name in &names {
                let candidate = dir.join(name);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }

    common_windows_command_candidates(command).into_iter().find(|candidate| candidate.is_file())
}

#[cfg(target_os = "windows")]
fn parse_npm_cmd_node_target(command_path: &std::path::Path) -> Option<PathBuf> {
    let content = std::fs::read_to_string(command_path).ok()?;
    let marker = "\"%dp0%\\";
    let mut start = 0;
    while let Some(offset) = content[start..].find(marker) {
        let rel_start = start + offset + marker.len();
        let rel_end = content[rel_start..].find('"').map(|index| rel_start + index)?;
        let rel = &content[rel_start..rel_end];
        start = rel_end + 1;
        if !rel.to_ascii_lowercase().contains("node_modules") {
            continue;
        }
        let candidate = command_path.parent()?.join(rel);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn quote_cmd_arg(value: &str) -> String {
    if value.is_empty() || value.chars().any(|ch| ch.is_whitespace() || ch == '"') {
        format!("\"{}\"", value.replace('"', "\\\""))
    } else {
        value.to_string()
    }
}

#[cfg(target_os = "windows")]
fn resolve_windows_launch(command: &str, args: &[String]) -> (String, Vec<String>) {
    let Some(command_path) = find_windows_command(command) else {
        return (command.to_string(), args.to_vec());
    };
    let extension = command_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if extension == "cmd" || extension == "bat" {
        if let Some(node_target) = parse_npm_cmd_node_target(&command_path) {
            let node_command = find_windows_command("node")
                .unwrap_or_else(|| PathBuf::from("node"))
                .to_string_lossy()
                .to_string();
            let mut resolved_args = vec![node_target.to_string_lossy().to_string()];
            resolved_args.extend(args.iter().cloned());
            return (node_command, resolved_args);
        }
        let command_line = std::iter::once(quote_cmd_arg(&command_path.to_string_lossy()))
            .chain(args.iter().map(|arg| quote_cmd_arg(arg)))
            .collect::<Vec<_>>()
            .join(" ");
        return ("cmd.exe".to_string(), vec!["/d".to_string(), "/c".to_string(), command_line]);
    }

    if extension == "ps1" {
        let mut resolved_args = vec![
            "-NoProfile".to_string(),
            "-ExecutionPolicy".to_string(),
            "Bypass".to_string(),
            "-File".to_string(),
            command_path.to_string_lossy().to_string(),
        ];
        resolved_args.extend(args.iter().cloned());
        return ("powershell.exe".to_string(), resolved_args);
    }

    (command_path.to_string_lossy().to_string(), args.to_vec())
}

#[cfg(target_os = "windows")]
fn resolve_launch_command(command: &str, args: &[String]) -> (String, Vec<String>) {
    resolve_windows_launch(command, args)
}

#[cfg(not(target_os = "windows"))]
fn resolve_launch_command(command: &str, args: &[String]) -> (String, Vec<String>) {
    (command.to_string(), args.to_vec())
}

fn emit_error(app: &AppHandle, process_id: &str, message: impl Into<String>) {
    let _ = app.emit("agent-process-error", AgentProcessErrorEvent {
        process_id: process_id.to_string(),
        message: message.into(),
    });
}

#[tauri::command]
pub fn agent_process_start(
    app: AppHandle,
    state: State<AgentProcessManager>,
    options: AgentProcessStartOptions,
) -> Result<AgentProcessInfo, String> {
    let process_id = format!("agent_proc_{}", Uuid::new_v4().simple());
    let resolved_cwd = resolve_cwd(options.cwd);
    let (launch_command, launch_args) = resolve_launch_command(&options.command, &options.args);
    let mut command = Command::new(&launch_command);
    command
        .args(&launch_args)
        .current_dir(&resolved_cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(env) = &options.env {
        command.envs(env);
    }

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let stdin = child.stdin.take().ok_or_else(|| "Failed to open agent process stdin".to_string())?;
    let mut stdout = child.stdout.take().ok_or_else(|| "Failed to open agent process stdout".to_string())?;
    let mut stderr = child.stderr.take().ok_or_else(|| "Failed to open agent process stderr".to_string())?;
    let child = Arc::new(Mutex::new(child));

    state.insert(process_id.clone(), AgentProcessSession {
        child: child.clone(),
        stdin,
        cwd: resolved_cwd.to_string_lossy().to_string(),
        command: launch_command.clone(),
        args: launch_args.clone(),
        stdout_tail: String::new(),
        stderr_tail: String::new(),
    });

    let app_for_stdout = app.clone();
    let manager_for_stdout = state.inner().clone();
    let stdout_process_id = process_id.clone();
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match stdout.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                    manager_for_stdout.append_stdout(&stdout_process_id, &data);
                    let _ = app_for_stdout.emit("agent-process-output", AgentProcessOutputEvent {
                        process_id: stdout_process_id.clone(),
                        data,
                    });
                }
                Err(error) => {
                    emit_error(&app_for_stdout, &stdout_process_id, error.to_string());
                    break;
                }
            }
        }
    });

    let app_for_stderr = app.clone();
    let manager_for_stderr = state.inner().clone();
    let stderr_process_id = process_id.clone();
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match stderr.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                    manager_for_stderr.append_stderr(&stderr_process_id, &data);
                    let _ = app_for_stderr.emit("agent-process-stderr", AgentProcessOutputEvent {
                        process_id: stderr_process_id.clone(),
                        data,
                    });
                }
                Err(error) => {
                    emit_error(&app_for_stderr, &stderr_process_id, error.to_string());
                    break;
                }
            }
        }
    });

    let app_for_wait = app.clone();
    let manager_for_wait = state.inner().clone();
    let wait_process_id = process_id.clone();
    std::thread::spawn(move || {
        loop {
            let status = {
                let mut child = child.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                match child.try_wait() {
                    Ok(status) => status,
                    Err(error) => {
                        emit_error(&app_for_wait, &wait_process_id, error.to_string());
                        None
                    }
                }
            };
            if let Some(status) = status {
                manager_for_wait.remove(&wait_process_id);
                let _ = app_for_wait.emit("agent-process-exit", AgentProcessExitEvent {
                    process_id: wait_process_id,
                    exit_code: status.code(),
                });
                break;
            }
            std::thread::sleep(Duration::from_millis(250));
        }
    });

    Ok(AgentProcessInfo {
        process_id,
        cwd: resolved_cwd.to_string_lossy().to_string(),
        command: launch_command,
        args: launch_args,
    })
}

#[tauri::command]
pub fn agent_process_write(state: State<AgentProcessManager>, process_id: String, data: String) -> Result<(), String> {
    let mut processes = state.processes_guard();
    let session = processes.get_mut(&process_id).ok_or_else(|| "Agent process not found".to_string())?;
    session.stdin.write_all(data.as_bytes()).map_err(|error| error.to_string())?;
    session.stdin.flush().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn agent_process_kill(state: State<AgentProcessManager>, process_id: String) -> Result<(), String> {
    if let Some(session) = state.remove(&process_id) {
        let mut child = session.child.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        child.kill().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn agent_process_list(state: State<AgentProcessManager>) -> Result<Vec<AgentProcessSnapshot>, String> {
    Ok(state.list())
}