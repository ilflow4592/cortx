//! Task popout 윈도우 — WebviewWindowBuilder로 단일 task 전용 창을 엶.

use tauri::Manager;

/// Open a new webview window showing a single task in popout mode.
/// Query params: ?task=<taskId>&mode=popout
#[tauri::command]
pub fn open_task_window(task_id: String, task_title: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;

    // Unique label per task so reopening focuses instead of duplicating
    let label = format!("task-{}", task_id.replace(|c: char| !c.is_alphanumeric(), "-"));

    // If a window with this label already exists, just focus it
    if let Some(existing) = app.get_webview_window(&label) {
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let url = format!("index.html?task={}&mode=popout", task_id);
    WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App(url.into()))
        .title(format!("Cortx — {}", task_title))
        .inner_size(1100.0, 750.0)
        .min_inner_size(700.0, 500.0)
        .decorations(true)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}
