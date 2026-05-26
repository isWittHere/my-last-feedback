use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

const FIXED_IGNORES: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache",
    "coverage",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectResourceListRequest {
    pub workspace_path: String,
    pub directory_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectResourceEntry {
    pub name: String,
    pub absolute_path: String,
    pub relative_path: String,
    pub kind: String,
    pub ignored: bool,
}

#[tauri::command]
pub async fn project_list_directory(
    request: ProjectResourceListRequest,
) -> Result<Vec<ProjectResourceEntry>, String> {
    let workspace = canonical_dir(&request.workspace_path)?;
    let directory = canonical_dir(&request.directory_path)?;
    if !directory.starts_with(&workspace) {
        return Err("Directory is outside the workspace".to_string());
    }

    let ignore_rules = read_root_gitignore(&workspace);
    let fixed_ignores: HashSet<&str> = FIXED_IGNORES.iter().copied().collect();
    let mut entries = Vec::new();

    for entry in fs::read_dir(&directory).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = file_type.is_dir();
        let path = entry.path();
        let relative_path = path
            .strip_prefix(&workspace)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");

        let ignored =
            fixed_ignores.contains(name.as_str())
                || is_gitignored(&relative_path, &name, is_dir, &ignore_rules);

        entries.push(ProjectResourceEntry {
            name,
            absolute_path: display_path(&path),
            relative_path,
            kind: if is_dir { "folder" } else { "file" }.to_string(),
            ignored,
        });
    }

    entries.sort_by(|a, b| match (a.kind.as_str(), b.kind.as_str()) {
        ("folder", "file") => std::cmp::Ordering::Less,
        ("file", "folder") => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

fn canonical_dir(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path).canonicalize().map_err(|e| e.to_string())?;
    if !path.is_dir() {
        return Err("Not a directory".to_string());
    }
    Ok(path)
}

fn read_root_gitignore(workspace: &Path) -> Vec<String> {
    let content = fs::read_to_string(workspace.join(".gitignore")).unwrap_or_default();
    content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with('!'))
        .map(|line| line.trim_start_matches('/').replace('\\', "/"))
        .collect()
}

fn is_gitignored(relative_path: &str, name: &str, is_dir: bool, rules: &[String]) -> bool {
    let normalized = relative_path.trim_start_matches('/');
    for rule in rules {
        let rule = rule.trim();
        if rule.is_empty() {
            continue;
        }
        let dir_only = rule.ends_with('/');
        if dir_only && !is_dir {
            continue;
        }
        let pattern = rule.trim_end_matches('/');
        if !pattern.contains('/') {
            if wildcard_match(pattern, name) {
                return true;
            }
            if is_dir && wildcard_match(pattern, normalized) {
                return true;
            }
            continue;
        }
        if wildcard_match(pattern, normalized) || normalized.starts_with(&format!("{}/", pattern)) {
            return true;
        }
    }
    false
}

fn wildcard_match(pattern: &str, value: &str) -> bool {
    if pattern == value {
        return true;
    }
    if !pattern.contains('*') {
        return false;
    }
    let parts: Vec<&str> = pattern.split('*').collect();
    let mut remaining = value;
    for (index, part) in parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }
        if index == 0 && !remaining.starts_with(part) {
            return false;
        }
        match remaining.find(part) {
            Some(position) => remaining = &remaining[position + part.len()..],
            None => return false,
        }
    }
    pattern.ends_with('*') || parts.last().is_some_and(|last| value.ends_with(last))
}

fn display_path(path: &Path) -> String {
    let mut value = path.to_string_lossy().replace('\\', "/");
    if let Some(stripped) = value.strip_prefix("//?/") {
        value = stripped.to_string();
    }
    if let Some(stripped) = value.strip_prefix("UNC/") {
        value = format!("//{}", stripped);
    }
    value
}
