use serde::{Deserialize, Serialize};
use tauri::Manager;
use crate::pty::SharedPtyManager;

/// A slash command entry for the autocomplete menu in the chat UI.
#[derive(Serialize, Deserialize)]
pub struct SlashCommand {
    pub name: String,
    pub description: String,
    /// Origin of the command: "builtin", "user" (~/.claude/commands/), or "project" (.claude/commands/).
    pub source: String,
}

/// Spawn a new Claude CLI process for the given task, passing prompt and context.
#[tauri::command]
pub fn claude_spawn(id: String, cwd: String, message: String, context_files: Option<Vec<String>>, context_summary: Option<String>, allow_all_tools: Option<bool>, session_id: Option<String>, model: Option<String>, state: tauri::State<'_, SharedPtyManager>, app: tauri::AppHandle) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.spawn_claude(&id, &cwd, &message, context_files.as_deref().unwrap_or(&[]), context_summary.as_deref().unwrap_or(""), allow_all_tools.unwrap_or(false), session_id.as_deref(), model.as_deref(), &app)
}

/// Send SIGTERM to stop a running Claude CLI process.
#[tauri::command]
pub fn claude_stop(id: String, state: tauri::State<'_, SharedPtyManager>) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.stop_claude(&id)
}

#[tauri::command]
pub fn claude_stop_task(task_id: String, state: tauri::State<'_, SharedPtyManager>) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.stop_claude_by_prefix(&format!("claude-{}", task_id));
    Ok(())
}

/// Send a follow-up message to an existing Claude CLI session via its PTY.
#[tauri::command]
pub fn claude_send(id: String, message: String, state: tauri::State<'_, SharedPtyManager>) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    if !mgr.has_session(&id) {
        return Err("Claude session not running. Try reconnecting.".to_string());
    }
    mgr.write(&id, &format!("{}\n", message))
}

/// List all available slash commands: built-in Claude commands + user/project custom commands.
/// Scans ~/.claude/commands/ and <project>/.claude/commands/ recursively for .md files.
#[tauri::command]
pub fn list_slash_commands(project_cwd: Option<String>) -> Vec<SlashCommand> {
    let mut commands = vec![
        SlashCommand { name: "bug".into(), description: "Report a bug".into(), source: "builtin".into() },
        SlashCommand { name: "clear".into(), description: "Clear conversation".into(), source: "builtin".into() },
        SlashCommand { name: "compact".into(), description: "Compact conversation history".into(), source: "builtin".into() },
        SlashCommand { name: "config".into(), description: "View/modify configuration".into(), source: "builtin".into() },
        SlashCommand { name: "cost".into(), description: "Show token usage".into(), source: "builtin".into() },
        SlashCommand { name: "doctor".into(), description: "Check Claude Code setup".into(), source: "builtin".into() },
        SlashCommand { name: "help".into(), description: "Get help".into(), source: "builtin".into() },
        SlashCommand { name: "init".into(), description: "Initialize project with CLAUDE.md".into(), source: "builtin".into() },
        SlashCommand { name: "login".into(), description: "Switch accounts".into(), source: "builtin".into() },
        SlashCommand { name: "logout".into(), description: "Sign out".into(), source: "builtin".into() },
        SlashCommand { name: "mcp".into(), description: "Manage MCP servers".into(), source: "builtin".into() },
        SlashCommand { name: "memory".into(), description: "Edit CLAUDE.md memory".into(), source: "builtin".into() },
        SlashCommand { name: "model".into(), description: "Switch model".into(), source: "builtin".into() },
        SlashCommand { name: "permissions".into(), description: "Manage tool permissions".into(), source: "builtin".into() },
        SlashCommand { name: "pr-comments".into(), description: "View PR comments".into(), source: "builtin".into() },
        SlashCommand { name: "review".into(), description: "Code review".into(), source: "builtin".into() },
        SlashCommand { name: "status".into(), description: "View account status".into(), source: "builtin".into() },
        SlashCommand { name: "terminal-setup".into(), description: "Install shell integration".into(), source: "builtin".into() },
        SlashCommand { name: "vim".into(), description: "Toggle vim mode".into(), source: "builtin".into() },
    ];

    // Scan user commands: ~/.claude/commands/**/*.md (recursive, subdirs become prefix)
    if let Some(home) = std::env::var_os("HOME") {
        let user_cmd_dir = std::path::Path::new(&home).join(".claude").join("commands");
        scan_commands_recursive(&user_cmd_dir, &user_cmd_dir, "user", &mut commands);
    }

    // Scan project commands: <cwd>/.claude/commands/**/*.md
    if let Some(cwd) = project_cwd {
        let proj_cmd_dir = std::path::Path::new(&cwd).join(".claude").join("commands");
        scan_commands_recursive(&proj_cmd_dir, &proj_cmd_dir, "project", &mut commands);
    }

    commands
}

/// Recursively scan a directory for .md command files, building names from relative paths
/// (e.g., pipeline/dev-task.md → "pipeline:dev-task").
fn scan_commands_recursive(base: &std::path::Path, dir: &std::path::Path, source: &str, commands: &mut Vec<SlashCommand>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_commands_recursive(base, &path, source, commands);
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                // Build name from relative path: pipeline/dev-task.md -> "pipeline:dev-task"
                let name = if let Ok(rel) = path.strip_prefix(base) {
                    let parent = rel.parent().unwrap_or(std::path::Path::new(""));
                    if parent.as_os_str().is_empty() {
                        stem.to_string()
                    } else {
                        format!("{}:{}", parent.to_string_lossy().replace('/', ":"), stem)
                    }
                } else {
                    stem.to_string()
                };

                // Skip if duplicate
                if commands.iter().any(|c| c.name == name) {
                    continue;
                }

                let desc = std::fs::read_to_string(&path)
                    .ok()
                    .and_then(|c| c.lines().next().map(|l| l.trim_start_matches('#').trim().to_string()))
                    .unwrap_or_default();
                commands.push(SlashCommand { name, description: desc, source: source.into() });
            }
        }
    }
}

/// Resolve the absolute .md path for a slash command by name + source.
/// name format: "pipeline:dev-task" → "pipeline/dev-task.md"
fn resolve_command_path(name: &str, source: &str, project_cwd: Option<&str>) -> Result<std::path::PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or_else(|| "HOME not set".to_string())?;
    let base = match source {
        "user" => std::path::Path::new(&home).join(".claude").join("commands"),
        "project" => {
            let cwd = project_cwd.ok_or_else(|| "project_cwd required for project source".to_string())?;
            std::path::Path::new(cwd).join(".claude").join("commands")
        }
        _ => return Err(format!("Invalid source: {}", source)),
    };
    // Convert colons in name to path separators: "pipeline:dev-task" -> "pipeline/dev-task"
    let rel = name.replace(':', "/");
    Ok(base.join(format!("{}.md", rel)))
}

/// Read the contents of a slash command .md file.
#[tauri::command]
pub fn read_slash_command(name: String, source: String, project_cwd: Option<String>) -> Result<String, String> {
    let path = resolve_command_path(&name, &source, project_cwd.as_deref())?;
    std::fs::read_to_string(&path).map_err(|e| format!("Read failed: {}", e))
}

/// Write (create or update) a slash command .md file.
#[tauri::command]
pub fn write_slash_command(
    name: String,
    source: String,
    content: String,
    project_cwd: Option<String>,
) -> Result<(), String> {
    let path = resolve_command_path(&name, &source, project_cwd.as_deref())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Mkdir failed: {}", e))?;
    }
    std::fs::write(&path, content).map_err(|e| format!("Write failed: {}", e))
}

/// Delete a slash command .md file.
#[tauri::command]
pub fn delete_slash_command(name: String, source: String, project_cwd: Option<String>) -> Result<(), String> {
    let path = resolve_command_path(&name, &source, project_cwd.as_deref())?;
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }
    std::fs::remove_file(&path).map_err(|e| format!("Delete failed: {}", e))
}

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

// ── PTY commands ──

/// Spawn an interactive terminal shell (zsh) for the given task ID.
#[tauri::command]
pub fn pty_spawn(id: String, cwd: String, state: tauri::State<'_, SharedPtyManager>, app: tauri::AppHandle) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.spawn(&id, &cwd, &app)
}

/// Write keystrokes/data to a terminal PTY session.
#[tauri::command]
pub fn pty_write(id: String, data: String, state: tauri::State<'_, SharedPtyManager>) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.write(&id, &data)
}

/// Resize a terminal PTY to match the frontend terminal panel dimensions.
#[tauri::command]
pub fn pty_resize(id: String, rows: u16, cols: u16, state: tauri::State<'_, SharedPtyManager>) -> Result<(), String> {
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
