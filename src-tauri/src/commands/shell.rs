use std::process::Command;
use serde::{Deserialize, Serialize};
use crate::types::CommandResult;

/// Metadata extracted from a URL for link preview cards.
#[derive(Serialize, Deserialize)]
pub struct LinkPreview {
    pub url: String,
    pub title: String,
    pub description: String,
    pub success: bool,
}

/// Configuration loaded from a project's cortx.yaml/cortx.yml file.
#[derive(Serialize, Deserialize)]
pub struct CortxConfig {
    /// Shell commands to run during project setup.
    pub setup: Vec<String>,
    /// Shell commands to run when archiving/cleaning up a task.
    pub archive: Vec<String>,
}

/// Execute an arbitrary shell command via `zsh -l -c` in a background thread.
/// Returns stdout, stderr, and success status. Used for git operations and file I/O.
#[tauri::command]
pub async fn run_shell_command(cwd: String, command: String) -> CommandResult {
    tauri::async_runtime::spawn_blocking(move || {
        match Command::new("zsh").args(["-l", "-c", &command]).current_dir(&cwd)
            .env("TERM", "dumb")
            .output() {
            Ok(out) => CommandResult {
                success: out.status.success(),
                output: String::from_utf8_lossy(&out.stdout).to_string(),
                error: String::from_utf8_lossy(&out.stderr).to_string(),
            },
            Err(e) => CommandResult { success: false, output: String::new(), error: e.to_string() },
        }
    }).await.unwrap_or_else(|e| CommandResult { success: false, output: String::new(), error: e.to_string() })
}

/// Execute a list of shell scripts sequentially in the given working directory.
/// Used to run project setup commands from cortx.yaml.
#[tauri::command]
pub fn run_setup_scripts(cwd: String, scripts: Vec<String>) -> Vec<CommandResult> {
    scripts.iter().map(|script| {
        match Command::new("zsh").args(["-l", "-c", script]).current_dir(&cwd).output() {
            Ok(out) => CommandResult {
                success: out.status.success(),
                output: String::from_utf8_lossy(&out.stdout).to_string(),
                error: String::from_utf8_lossy(&out.stderr).to_string(),
            },
            Err(e) => CommandResult { success: false, output: String::new(), error: e.to_string() },
        }
    }).collect()
}

/// Read and parse the project's cortx.yaml (or cortx.yml) configuration file.
/// Returns an empty config if no file exists.
#[tauri::command]
pub fn read_cortx_yaml(repo_path: String) -> Result<CortxConfig, String> {
    let path = std::path::Path::new(&repo_path).join("cortx.yaml");
    if !path.exists() {
        let path_yml = std::path::Path::new(&repo_path).join("cortx.yml");
        if !path_yml.exists() {
            return Ok(CortxConfig { setup: vec![], archive: vec![] });
        }
        let content = std::fs::read_to_string(path_yml).map_err(|e| e.to_string())?;
        return parse_cortx_yaml(&content);
    }
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    parse_cortx_yaml(&content)
}

/// Fetch a URL via curl and extract OpenGraph/meta title and description
/// for rendering link preview cards in the UI. Times out after 5 seconds.
#[tauri::command]
pub fn fetch_link_preview(url: String) -> LinkPreview {
    let result = Command::new("curl")
        .args(["-sL", "--max-time", "5", &url])
        .output();

    match result {
        Ok(output) if output.status.success() => {
            let html = String::from_utf8_lossy(&output.stdout);
            let title = extract_meta(&html, "<title>", "</title>")
                .or_else(|| extract_meta_attr(&html, "og:title"))
                .unwrap_or_default();
            let description = extract_meta_attr(&html, "og:description")
                .or_else(|| extract_meta_attr(&html, "description"))
                .unwrap_or_default();
            LinkPreview { url, title, description, success: true }
        }
        _ => LinkPreview { url, title: String::new(), description: String::new(), success: false },
    }
}

/// Simple line-based YAML parser for the cortx.yaml format (setup/archive sections only).
fn parse_cortx_yaml(content: &str) -> Result<CortxConfig, String> {
    let mut setup = vec![];
    let mut archive = vec![];
    let mut current_section = "";

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "setup:" { current_section = "setup"; continue; }
        if trimmed == "archive:" { current_section = "archive"; continue; }
        if trimmed.starts_with("- ") {
            let cmd = trimmed[2..].trim().to_string();
            match current_section {
                "setup" => setup.push(cmd),
                "archive" => archive.push(cmd),
                _ => {}
            }
        }
    }
    Ok(CortxConfig { setup, archive })
}

/// Extract text content between HTML tags (e.g., <title>...</title>).
fn extract_meta(html: &str, start_tag: &str, end_tag: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find(&start_tag.to_lowercase())? + start_tag.len();
    let end = lower[start..].find(&end_tag.to_lowercase())? + start;
    Some(html[start..end].trim().to_string())
}

/// Extract the `content` attribute from a <meta> tag matching the given property/name.
fn extract_meta_attr(html: &str, name: &str) -> Option<String> {
    let lower = html.to_lowercase();
    // Look for <meta property="og:title" content="..."> or <meta name="description" content="...">
    let patterns = [
        format!("property=\"{}\"", name),
        format!("name=\"{}\"", name),
    ];
    for pattern in &patterns {
        if let Some(pos) = lower.find(&pattern.to_lowercase()) {
            let after = &html[pos..];
            if let Some(content_start) = after.to_lowercase().find("content=\"") {
                let start = content_start + 9;
                if let Some(end) = after[start..].find('"') {
                    return Some(after[start..start + end].to_string());
                }
            }
        }
    }
    None
}
