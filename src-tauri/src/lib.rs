mod pty;

use std::process::Command;
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use pty::{PtyManager, SharedPtyManager};

#[derive(Serialize, Deserialize)]
pub struct CommandResult {
    pub success: bool,
    pub output: String,
    pub error: String,
}

// ── Git worktree commands ──

#[tauri::command]
fn create_worktree(repo_path: String, worktree_path: String, branch_name: String) -> CommandResult {
    run_git(&repo_path, &["worktree", "add", &worktree_path, "-b", &branch_name])
}

#[tauri::command]
fn remove_worktree(repo_path: String, worktree_path: String) -> CommandResult {
    run_git(&repo_path, &["worktree", "remove", &worktree_path, "--force"])
}

#[tauri::command]
fn list_worktrees(repo_path: String) -> CommandResult {
    run_git(&repo_path, &["worktree", "list", "--porcelain"])
}

#[tauri::command]
fn git_diff(repo_path: String, branch_name: String) -> CommandResult {
    // diff between current branch and its merge-base with main
    let base_result = Command::new("git")
        .args(["merge-base", "HEAD", "main"])
        .current_dir(&repo_path)
        .output();

    let base = match base_result {
        Ok(out) if out.status.success() => {
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        }
        _ => "HEAD~1".to_string(),
    };

    run_git(&repo_path, &["diff", "--stat", &base, "HEAD"])
}

#[tauri::command]
fn git_diff_full(repo_path: String) -> CommandResult {
    let base_result = Command::new("git")
        .args(["merge-base", "HEAD", "main"])
        .current_dir(&repo_path)
        .output();

    let base = match base_result {
        Ok(out) if out.status.success() => {
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        }
        _ => "HEAD~1".to_string(),
    };

    run_git(&repo_path, &["diff", &base, "HEAD"])
}

#[tauri::command]
fn git_diff_staged(repo_path: String) -> CommandResult {
    run_git(&repo_path, &["diff", "--cached"])
}

#[tauri::command]
fn git_diff_unstaged(repo_path: String) -> CommandResult {
    run_git(&repo_path, &["diff"])
}

#[derive(Serialize, Deserialize)]
pub struct LinkPreview {
    pub url: String,
    pub title: String,
    pub description: String,
    pub success: bool,
}

#[tauri::command]
fn fetch_link_preview(url: String) -> LinkPreview {
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

fn extract_meta(html: &str, start_tag: &str, end_tag: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find(&start_tag.to_lowercase())? + start_tag.len();
    let end = lower[start..].find(&end_tag.to_lowercase())? + start;
    Some(html[start..end].trim().to_string())
}

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

fn run_git(cwd: &str, args: &[&str]) -> CommandResult {
    match Command::new("git").args(args).current_dir(cwd).output() {
        Ok(out) => CommandResult {
            success: out.status.success(),
            output: String::from_utf8_lossy(&out.stdout).to_string(),
            error: String::from_utf8_lossy(&out.stderr).to_string(),
        },
        Err(e) => CommandResult { success: false, output: String::new(), error: e.to_string() },
    }
}

// ── PTY commands ──

#[tauri::command]
fn pty_spawn(id: String, cwd: String, state: tauri::State<'_, SharedPtyManager>, app: tauri::AppHandle) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.spawn(&id, &cwd, &app)
}

#[tauri::command]
fn pty_write(id: String, data: String, state: tauri::State<'_, SharedPtyManager>) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.write(&id, &data)
}

#[tauri::command]
fn pty_resize(id: String, rows: u16, cols: u16, state: tauri::State<'_, SharedPtyManager>) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.resize(&id, rows, cols)
}

#[tauri::command]
fn pty_close(id: String, state: tauri::State<'_, SharedPtyManager>) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.close(&id);
    Ok(())
}

// ── App entry ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pty_manager: SharedPtyManager = Arc::new(Mutex::new(PtyManager::new()));

    tauri::Builder::default()
        .manage(pty_manager)
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_worktree,
            remove_worktree,
            list_worktrees,
            git_diff,
            git_diff_full,
            git_diff_staged,
            git_diff_unstaged,
            fetch_link_preview,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
