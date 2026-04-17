//! Claude CLI 프로세스 생명주기 — PtyManager::spawn_claude/stop_claude로 위임.

use crate::pty::SharedPtyManager;

/// Spawn a new Claude CLI process for the given task, passing prompt and context.
// Tauri command 직접 호출 경로라 구조체 래퍼로 묶으면 JS 측 시그니처가 깨짐.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn claude_spawn(
    id: String,
    cwd: String,
    message: String,
    context_files: Option<Vec<String>>,
    context_summary: Option<String>,
    allow_all_tools: Option<bool>,
    session_id: Option<String>,
    model: Option<String>,
    effort: Option<String>,
    disallowed_tools: Option<Vec<String>>,
    disable_project_mcp: Option<bool>,
    bash_timeout_ms: Option<u64>,
    state: tauri::State<'_, SharedPtyManager>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    let disallowed = disallowed_tools.unwrap_or_default();
    mgr.spawn_claude(
        &id,
        &cwd,
        &message,
        context_files.as_deref().unwrap_or(&[]),
        context_summary.as_deref().unwrap_or(""),
        allow_all_tools.unwrap_or(false),
        session_id.as_deref(),
        model.as_deref(),
        effort.as_deref(),
        &disallowed,
        disable_project_mcp.unwrap_or(false),
        bash_timeout_ms,
        &app,
    )
}

/// Send SIGTERM to stop a running Claude CLI process.
#[tauri::command]
pub fn claude_stop(id: String, state: tauri::State<'_, SharedPtyManager>) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.stop_claude(&id)
}

#[tauri::command]
pub fn claude_stop_task(
    task_id: String,
    state: tauri::State<'_, SharedPtyManager>,
) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.stop_claude_by_prefix(&format!("claude-{}", task_id));
    Ok(())
}

/// Send a follow-up message to an existing Claude CLI session via its PTY.
#[tauri::command]
pub fn claude_send(
    id: String,
    message: String,
    state: tauri::State<'_, SharedPtyManager>,
) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    if !mgr.has_session(&id) {
        return Err("Claude session not running. Try reconnecting.".to_string());
    }
    mgr.write(&id, &format!("{}\n", message))
}
