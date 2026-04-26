use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

const MLC_PREVIEW_MAX_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MlcSearchRequest {
    pub workspace_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MlcDocument {
    pub file_path: String,
    pub file_name: String,
    pub title: String,
    pub description: String,
    pub project: String,
    #[serde(rename = "type")]
    pub document_type: String,
    pub created_at: String,
    pub updated_at: String,
    pub favorite: bool,
    pub tags: Vec<String>,
    pub folder_name: Option<String>,
    pub folder_path: Option<String>,
    pub workspace_name: String,
    pub workspace_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MlcDocumentContent {
    pub file_path: String,
    pub title: String,
    pub markdown: String,
    pub updated_at: String,
}

struct MlcRoot {
    workspace_name: String,
    workspace_path: PathBuf,
    storage_path: PathBuf,
}

#[tauri::command]
pub async fn mlc_search_documents(request: MlcSearchRequest) -> Result<Vec<MlcDocument>, String> {
    let roots = discover_roots(request.workspace_paths)?;
    let mut documents = Vec::new();

    for root in roots {
        scan_storage_root(&root, &mut documents);
    }

    documents.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(documents)
}

#[tauri::command]
pub async fn mlc_read_document(file_path: String) -> Result<MlcDocumentContent, String> {
    let path = canonical_markdown_file(&file_path)?;
    if !is_inside_mlc_storage(&path) {
        return Err("Markdown file is not inside a .myLastChat directory".to_string());
    }
    let stats = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if stats.len() > MLC_PREVIEW_MAX_BYTES {
        return Err("Markdown file is too large to preview".to_string());
    }

    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let frontmatter = extract_frontmatter(&content);
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "Markdown".to_string());
    let updated_at = frontmatter
        .scalar("updatedAt")
        .or_else(|| stats.modified().ok().map(system_time_to_iso))
        .unwrap_or_else(|| Utc::now().to_rfc3339());

    Ok(MlcDocumentContent {
        file_path: display_path(&path),
        title: frontmatter.scalar("title").unwrap_or_else(|| file_name.trim_end_matches(".md").to_string()),
        markdown: markdown_body(&content),
        updated_at,
    })
}

#[tauri::command]
pub async fn mlc_toggle_favorite(file_path: String) -> Result<bool, String> {
    let path = canonical_markdown_file(&file_path)?;
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let frontmatter = extract_frontmatter(&content);
    let next_favorite = !frontmatter
        .scalar("favorite")
        .map(|value| value.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let updated = upsert_frontmatter_scalars(
        &content,
        &[
            ("favorite", if next_favorite { "true" } else { "false" }.to_string()),
            ("updatedAt", Utc::now().to_rfc3339()),
        ],
    );
    std::fs::write(&path, updated).map_err(|e| e.to_string())?;
    Ok(next_favorite)
}

#[tauri::command]
pub async fn mlc_delete_document(file_path: String) -> Result<(), String> {
    let path = canonical_markdown_file(&file_path)?;
    std::fs::remove_file(path).map_err(|e| e.to_string())
}

fn canonical_markdown_file(file_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(file_path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !path.is_file() || !is_markdown(&path) {
        return Err("Not a markdown file".to_string());
    }
    Ok(path)
}

fn is_inside_mlc_storage(path: &Path) -> bool {
    path.ancestors().any(|ancestor| {
        ancestor
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case(".myLastChat"))
    })
}

fn markdown_body(content: &str) -> String {
    let trimmed = content.trim_start_matches('\u{feff}');
    if let Some((_, _, body_start)) = frontmatter_bounds(trimmed) {
        trimmed[body_start..].trim_start_matches(|ch| ch == '\r' || ch == '\n').to_string()
    } else {
        trimmed.to_string()
    }
}

fn discover_roots(workspace_paths: Vec<String>) -> Result<Vec<MlcRoot>, String> {
    let mut roots = Vec::new();
    let mut seen = HashSet::new();

    for raw_path in workspace_paths {
        if raw_path.trim().is_empty() {
            continue;
        }
        let workspace_path = PathBuf::from(raw_path);
        let workspace_path = match workspace_path.canonicalize() {
            Ok(path) if path.is_dir() => path,
            _ => continue,
        };

        add_root(&mut roots, &mut seen, &workspace_path);

        let entries = match std::fs::read_dir(&workspace_path) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() || entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            if path.join(".git").is_dir() {
                if let Ok(child_workspace) = path.canonicalize() {
                    add_root(&mut roots, &mut seen, &child_workspace);
                }
            }
        }
    }

    Ok(roots)
}

fn add_root(roots: &mut Vec<MlcRoot>, seen: &mut HashSet<PathBuf>, workspace_path: &Path) {
    let storage_path = workspace_path.join(".myLastChat");
    if !storage_path.is_dir() {
        return;
    }
    let storage_path = match storage_path.canonicalize() {
        Ok(path) => path,
        Err(_) => return,
    };
    if !seen.insert(storage_path.clone()) {
        return;
    }
    roots.push(MlcRoot {
        workspace_name: workspace_path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| workspace_path.to_string_lossy().to_string()),
        workspace_path: workspace_path.to_path_buf(),
        storage_path,
    });
}

fn scan_storage_root(root: &MlcRoot, documents: &mut Vec<MlcDocument>) {
    let entries = match std::fs::read_dir(&root.storage_path) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && is_markdown(&path) {
            if let Some(document) = parse_document(root, &path, None, None) {
                documents.push(document);
            }
        } else if path.is_dir() && !entry.file_name().to_string_lossy().starts_with('.') {
            scan_folder(root, &path, documents);
        }
    }
}

fn scan_folder(root: &MlcRoot, folder_path: &Path, documents: &mut Vec<MlcDocument>) {
    let folder_name = folder_path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    let entries = match std::fs::read_dir(folder_path) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && is_markdown(&path) {
            if let Some(document) = parse_document(root, &path, Some(folder_name.clone()), Some(folder_path.to_path_buf())) {
                documents.push(document);
            }
        }
    }
}

fn parse_document(root: &MlcRoot, file_path: &Path, folder_name: Option<String>, folder_path: Option<PathBuf>) -> Option<MlcDocument> {
    let content = std::fs::read_to_string(file_path).ok()?;
    let frontmatter = extract_frontmatter(&content);
    let stats = std::fs::metadata(file_path).ok();
    let created_at = frontmatter
        .scalar("createdAt")
        .or_else(|| stats.as_ref().and_then(|m| m.created().ok()).map(system_time_to_iso))
        .unwrap_or_else(|| Utc::now().to_rfc3339());
    let updated_at = frontmatter
        .scalar("updatedAt")
        .or_else(|| stats.as_ref().and_then(|m| m.modified().ok()).map(system_time_to_iso))
        .unwrap_or_else(|| created_at.clone());
    let file_name = file_path.file_name()?.to_string_lossy().to_string();

    Some(MlcDocument {
        file_path: display_path(file_path),
        file_name: file_name.clone(),
        title: frontmatter.scalar("title").unwrap_or_else(|| file_name.trim_end_matches(".md").to_string()),
        description: frontmatter.scalar("description").unwrap_or_default(),
        project: frontmatter.scalar("project").unwrap_or_default(),
        document_type: frontmatter.scalar("type").unwrap_or_default(),
        created_at,
        updated_at,
        favorite: frontmatter.scalar("favorite").map(|value| value.eq_ignore_ascii_case("true")).unwrap_or(false),
        tags: frontmatter.array("tags"),
        folder_name,
        folder_path: folder_path.map(|path| display_path(&path)),
        workspace_name: root.workspace_name.clone(),
        workspace_path: display_path(&root.workspace_path),
    })
}

fn display_path(path: &Path) -> String {
    let text = path.to_string_lossy().to_string();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{}", rest)
    } else if let Some(rest) = text.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        text
    }
}

#[derive(Default)]
struct Frontmatter {
    values: HashMap<String, Vec<String>>,
}

impl Frontmatter {
    fn scalar(&self, key: &str) -> Option<String> {
        self.values.get(key).and_then(|values| values.first()).cloned().filter(|value| !value.is_empty())
    }

    fn array(&self, key: &str) -> Vec<String> {
        self.values.get(key).cloned().unwrap_or_default().into_iter().filter(|value| !value.is_empty()).collect()
    }
}

fn extract_frontmatter(content: &str) -> Frontmatter {
    let trimmed = content.trim_start_matches('\u{feff}');
    if !trimmed.starts_with("---") {
        return Frontmatter::default();
    }
    let rest = &trimmed[3..];
    let Some(end_index) = rest.find("\n---") else {
        return Frontmatter::default();
    };
    parse_frontmatter_block(&rest[..end_index])
}

fn parse_frontmatter_block(block: &str) -> Frontmatter {
    let mut frontmatter = Frontmatter::default();
    let mut current_array_key: Option<String> = None;

    for raw_line in block.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(key) = &current_array_key {
            if let Some(value) = line.strip_prefix('-') {
                frontmatter.values.entry(key.clone()).or_default().push(clean_yaml_value(value.trim()));
                continue;
            }
            current_array_key = None;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim().to_string();
        let value = value.trim();
        if value.is_empty() {
            current_array_key = Some(key.clone());
            frontmatter.values.entry(key).or_default();
        } else if value.starts_with('[') && value.ends_with(']') {
            let values = value.trim_start_matches('[').trim_end_matches(']')
                .split(',')
                .map(|item| clean_yaml_value(item.trim()))
                .filter(|item| !item.is_empty())
                .collect();
            frontmatter.values.insert(key, values);
        } else {
            frontmatter.values.insert(key, vec![clean_yaml_value(value)]);
        }
    }

    frontmatter
}

fn upsert_frontmatter_scalars(content: &str, updates: &[(&str, String)]) -> String {
    let Some((block_start, marker_start, body_start)) = frontmatter_bounds(content) else {
        let mut block = String::new();
        for (key, value) in updates {
            block.push_str(&format!("{}: {}\n", key, value));
        }
        return format!("---\n{}---\n\n{}", block, content);
    };

    let block = &content[block_start..marker_start];
    let updated_block = upsert_frontmatter_block(block, updates);
    format!("---\n{}---\n{}", updated_block, &content[body_start..])
}

fn frontmatter_bounds(content: &str) -> Option<(usize, usize, usize)> {
    if !content.starts_with("---") {
        return None;
    }
    let rest = &content[3..];
    let end_index = rest.find("\n---")?;
    let marker_start = 3 + end_index;
    let mut body_start = marker_start + 4;
    if content[body_start..].starts_with("\r\n") {
        body_start += 2;
    } else if content[body_start..].starts_with('\n') {
        body_start += 1;
    }
    Some((3, marker_start, body_start))
}

fn upsert_frontmatter_block(block: &str, updates: &[(&str, String)]) -> String {
    let mut seen = HashSet::new();
    let mut lines = Vec::new();

    for raw_line in block.trim_matches('\n').lines() {
      let line = raw_line.trim_start_matches('\r');
      if let Some((key, _)) = line.split_once(':') {
          let key = key.trim();
          if let Some((_, value)) = updates.iter().find(|(update_key, _)| *update_key == key) {
              lines.push(format!("{}: {}", key, value));
              seen.insert(key.to_string());
              continue;
          }
      }
      lines.push(line.to_string());
    }

    for (key, value) in updates {
        if !seen.contains(*key) {
            lines.push(format!("{}: {}", key, value));
        }
    }

    format!("{}\n", lines.join("\n"))
}

fn clean_yaml_value(value: &str) -> String {
    value.trim().trim_matches('"').trim_matches('\'').to_string()
}

fn is_markdown(path: &Path) -> bool {
    path.extension().and_then(|ext| ext.to_str()).is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
}

fn system_time_to_iso(time: std::time::SystemTime) -> String {
    DateTime::<Utc>::from(time).to_rfc3339()
}