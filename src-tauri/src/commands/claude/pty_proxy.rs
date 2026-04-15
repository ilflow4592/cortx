//! Terminal PTY 세션 커맨드 — PtyManager의 spawn/write/resize/close를 Tauri invoke로 노출.

use crate::pty::SharedPtyManager;

/// Spawn an interactive terminal shell (zsh) for the given task ID.
#[tauri::command]
pub fn pty_spawn(
    id: String,
    cwd: String,
    state: tauri::State<'_, SharedPtyManager>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.spawn(&id, &cwd, &app)
}

/// Write keystrokes/data to a terminal PTY session.
#[tauri::command]
pub fn pty_write(
    id: String,
    data: String,
    state: tauri::State<'_, SharedPtyManager>,
) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.write(&id, &data)
}

/// Resize a terminal PTY to match the frontend terminal panel dimensions.
#[tauri::command]
pub fn pty_resize(
    id: String,
    rows: u16,
    cols: u16,
    state: tauri::State<'_, SharedPtyManager>,
) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.resize(&id, rows, cols)
}

/// Close a terminal PTY session, releasing its resources.
#[tauri::command]
pub fn pty_close(id: String, state: tauri::State<'_, SharedPtyManager>) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.close(&id);
    Ok(())
}
