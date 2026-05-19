use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntry {
    pub hash: String,
    pub author_name: String,
    pub author_email: String,
    pub date: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchInfo {
    pub current: String,
    pub all: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogResult {
    pub branch: GitBranchInfo,
    pub commits: Vec<GitLogEntry>,
}

#[tauri::command]
pub async fn git_log(project_directory: String) -> Result<GitLogResult, String> {
    let branch_output = Command::new("git")
        .args(["branch", "--list"])
        .current_dir(&project_directory)
        .output()
        .map_err(|e| format!("Failed to run git branch: {}", e))?;

    if !branch_output.status.success() {
        return Err(String::from_utf8_lossy(&branch_output.stderr).to_string());
    }

    let branch_stdout = String::from_utf8_lossy(&branch_output.stdout);
    let mut current = String::new();
    let mut all_branches = Vec::new();
    for line in branch_stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if line.starts_with('*') {
            current = trimmed.trim_start_matches('*').trim().to_string();
        }
        all_branches.push(trimmed.trim_start_matches('*').trim().to_string());
    }

    let log_output = Command::new("git")
        .args([
            "log",
            "--oneline",
            "--max-count=50",
            "--format=%H%n%an%n%ae%n%ai%n%s%n---",
        ])
        .current_dir(&project_directory)
        .output()
        .map_err(|e| format!("Failed to run git log: {}", e))?;

    if !log_output.status.success() {
        return Err(String::from_utf8_lossy(&log_output.stderr).to_string());
    }

    let log_stdout = String::from_utf8_lossy(&log_output.stdout);
    let mut commits = Vec::new();
    let mut lines = log_stdout.lines();

    loop {
        let hash = match lines.next() {
            Some(h) if !h.is_empty() => h.to_string(),
            _ => break,
        };
        let author_name = lines.next().unwrap_or("").to_string();
        let author_email = lines.next().unwrap_or("").to_string();
        let date = lines.next().unwrap_or("").to_string();
        let message = lines.next().unwrap_or("").to_string();
        let _separator = lines.next();

        commits.push(GitLogEntry {
            hash,
            author_name,
            author_email,
            date,
            message,
        });
    }

    Ok(GitLogResult {
        branch: GitBranchInfo {
            current,
            all: all_branches,
        },
        commits,
    })
}

#[tauri::command]
pub async fn git_changes_count(project_directory: String) -> Result<usize, String> {
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&project_directory)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let count = stdout.lines().filter(|l| !l.is_empty()).count();
    Ok(count)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffFile {
    pub path: String,
    pub status: String,
    pub patch: String,
    pub additions: usize,
    pub deletions: usize,
}

#[tauri::command]
pub async fn git_diff(project_directory: String) -> Result<Vec<GitDiffFile>, String> {
    let output = Command::new("git")
        .args(["diff", "--no-color"])
        .current_dir(&project_directory)
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_diff_files(&stdout))
}

fn parse_diff_files(output: &str) -> Vec<GitDiffFile> {
    let mut files: Vec<GitDiffFile> = Vec::new();
    let mut path = String::new();
    let mut status = String::from("modified");
    let mut patch = String::new();
    let mut additions = 0usize;
    let mut deletions = 0usize;
    let mut in_file = false;

    for line in output.lines() {
        if line.starts_with("diff --git ") {
            if in_file {
                files.push(GitDiffFile {
                    path: std::mem::take(&mut path),
                    status: std::mem::take(&mut status),
                    patch: std::mem::take(&mut patch),
                    additions,
                    deletions,
                });
                additions = 0;
                deletions = 0;
            }
            in_file = true;
            status = String::from("modified");
            if let Some(b_path) = line.split(" b/").nth(1) {
                path = b_path.to_string();
            }
        } else if line.starts_with("new file mode") {
            status = String::from("added");
        } else if line.starts_with("deleted file mode") {
            status = String::from("deleted");
        }

        if in_file {
            if line.starts_with('+') && !line.starts_with("+++") {
                additions += 1;
            } else if line.starts_with('-') && !line.starts_with("---") {
                deletions += 1;
            }
            patch.push_str(line);
            patch.push('\n');
        }
    }

    if in_file {
        files.push(GitDiffFile {
            path,
            status,
            patch,
            additions,
            deletions,
        });
    }

    files
}
