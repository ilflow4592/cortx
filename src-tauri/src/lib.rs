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
            pty_spawn,
            pty_write,
            pty_resize,
            pty_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
