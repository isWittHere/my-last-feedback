use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::process::Command;

#[cfg(windows)]
fn git_command() -> Command {
    use std::os::windows::process::CommandExt;
    let mut cmd = Command::new("git");
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd
}

#[cfg(not(windows))]
fn git_command() -> Command {
    Command::new("git")
}

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
    let branch_output = git_command()
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

    let log_output = git_command()
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
    let output = git_command()
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
pub struct GitChangesBreakdown {
    pub modified: usize,
    pub added: usize,
    pub deleted: usize,
}

#[tauri::command]
pub async fn git_changes_breakdown(
    project_directory: String,
) -> Result<GitChangesBreakdown, String> {
    let output = git_command()
        .args(["status", "--porcelain"])
        .current_dir(&project_directory)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut modified = 0usize;
    let mut added = 0usize;
    let mut deleted = 0usize;

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if line.len() < 2 {
            continue;
        }
        let xy = &line.as_bytes()[..2];
        match xy {
            [b'?', b'?'] => added += 1,
            [b'A', _] => added += 1,
            [b'D', _] | [b' ', b'D'] => deleted += 1,
            [b' ', b'M'] | [b'M', _] | [b'R', _] | [b' ', b'R'] | [b'C', _] | [b' ', b'C'] => {
                modified += 1
            }
            _ => {}
        }
    }

    Ok(GitChangesBreakdown {
        modified,
        added,
        deleted,
    })
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
    let output = git_command()
        .args(["diff", "--no-color"])
        .current_dir(&project_directory)
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let staged_output = git_command()
        .args(["diff", "--cached", "--no-color"])
        .current_dir(&project_directory)
        .output()
        .map_err(|e| format!("Failed to run git diff --cached: {}", e))?;

    if !staged_output.status.success() {
        return Err(String::from_utf8_lossy(&staged_output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let staged_stdout = String::from_utf8_lossy(&staged_output.stdout);

    let mut files = parse_diff_files(&stdout);
    files.extend(parse_diff_files(&staged_stdout));
    files = merge_git_diff_files(files);

    let untracked = git_command()
        .args(["ls-files", "--others", "--exclude-standard", "-z"])
        .current_dir(&project_directory)
        .output()
        .map_err(|e| format!("Failed to run git ls-files: {}", e))?;

    if untracked.status.success() {
        for raw_path in untracked.stdout.split(|b| *b == 0) {
            if raw_path.is_empty() {
                continue;
            }
            let path = String::from_utf8_lossy(raw_path).trim().to_string();
            if path.is_empty() {
                continue;
            }
            if let Some(diff_file) = build_untracked_diff(path, &project_directory) {
                files.push(diff_file);
            }
        }
    }

    Ok(files)
}

fn merge_git_diff_files(files: Vec<GitDiffFile>) -> Vec<GitDiffFile> {
    let mut merged: Vec<GitDiffFile> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for file in files {
        if file.path.is_empty() {
            continue;
        }
        if seen.insert(file.path.clone()) {
            merged.push(file);
            continue;
        }
        if let Some(existing) = merged.iter_mut().find(|f| f.path == file.path) {
            existing.additions += file.additions;
            existing.deletions += file.deletions;
            if !file.patch.is_empty() {
                if !existing.patch.is_empty() {
                    existing.patch.push('\n');
                }
                existing.patch.push_str(&file.patch);
            }
            if existing.status != "deleted" && file.status == "deleted" {
                existing.status = file.status;
            } else if existing.status != "added" && file.status == "added" {
                existing.status = file.status;
            }
        }
    }

    merged
}

fn build_untracked_diff(path: String, project_directory: &str) -> Option<GitDiffFile> {
    let full_path = format!("{}/{}", project_directory, path);
    let mut patch = String::new();
    patch.push_str(&format!("diff --git a/{} b/{}\n", path, path));
    patch.push_str("new file mode 100644\n");
    patch.push_str("index 0000000..0000000\n");
    patch.push_str("--- /dev/null\n");
    patch.push_str(&format!("+++ b/{}\n", path));
    let additions = match fs::read_to_string(&full_path) {
        Ok(content) => {
            let line_count = content.lines().count();
            patch.push_str(&format!("@@ -0,0 +1,{} @@\n", line_count));
            for line in content.lines() {
                patch.push('+');
                patch.push_str(line);
                patch.push('\n');
            }
            line_count
        }
        Err(_) => {
            let bytes = fs::read(&full_path).ok()?;
            patch.push_str("@@ -0,0 +1,1 @@\n");
            patch.push_str(&format!("+<binary file: {} bytes>\n", bytes.len()));
            1
        }
    };
    Some(GitDiffFile {
        path,
        status: String::from("added"),
        patch,
        additions,
        deletions: 0,
    })
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
            path = extract_diff_header_path(line);
        } else if line.starts_with("new file mode") {
            status = String::from("added");
        } else if line.starts_with("deleted file mode") {
            status = String::from("deleted");
        } else if line.starts_with("+++ b/") {
            path = line.trim_start_matches("+++ b/").to_string();
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

fn extract_diff_header_path(line: &str) -> String {
    if !line.starts_with("diff --git ") {
        return String::new();
    }
    let rest = line.trim_start_matches("diff --git ").trim();
    if let Some((_, right)) = rest.split_once(" b/") {
        return right.trim_matches('"').to_string();
    }
    String::new()
}

#[tauri::command]
pub async fn git_quick_backup(
    project_directory: String,
    message: String,
) -> Result<String, String> {
    let add_output = git_command()
        .args(["add", "-A"])
        .current_dir(&project_directory)
        .output()
        .map_err(|e| format!("Failed to run git add: {}", e))?;

    if !add_output.status.success() {
        return Err(String::from_utf8_lossy(&add_output.stderr).to_string());
    }

    let commit_output = git_command()
        .args(["commit", "-m", &message])
        .current_dir(&project_directory)
        .output()
        .map_err(|e| format!("Failed to run git commit: {}", e))?;

    if !commit_output.status.success() {
        return Err(String::from_utf8_lossy(&commit_output.stderr).to_string());
    }

    Ok(message)
}
