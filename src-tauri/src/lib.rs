mod pty;

use std::process::Command;
use std::sync::{Arc, Mutex};
use std::io::{Read, Write as IoWrite};
use std::net::TcpListener;
use serde::{Deserialize, Serialize};
use pty::{PtyManager, SharedPtyManager};

/// Result of a shell/git command execution, returned to the frontend.
#[derive(Serialize, Deserialize)]
pub struct CommandResult {
    pub success: bool,
    pub output: String,
    pub error: String,
}

// ── Git worktree commands ──

/// Create a new git worktree with an associated branch.
/// If `base_branch` is provided, the new branch is based on it; otherwise uses HEAD.
#[tauri::command]
fn create_worktree(repo_path: String, worktree_path: String, branch_name: String, base_branch: Option<String>) -> CommandResult {
    let base = base_branch.unwrap_or_default();
    eprintln!("[cortx] create_worktree: repo={}, worktree={}, branch={}, base='{}'", repo_path, worktree_path, branch_name, base);
    if base.is_empty() {
        run_git(&repo_path, &["worktree", "add", &worktree_path, "-b", &branch_name])
    } else {
        // git worktree add <path> -b <new-branch> <base-branch>
        run_git(&repo_path, &["worktree", "add", &worktree_path, "-b", &branch_name, &base])
    }
}

/// Force-remove a git worktree directory.
#[tauri::command]
fn remove_worktree(repo_path: String, worktree_path: String) -> CommandResult {
    run_git(&repo_path, &["worktree", "remove", &worktree_path, "--force"])
}

/// List all worktrees in porcelain format for machine parsing.
#[tauri::command]
fn list_worktrees(repo_path: String) -> CommandResult {
    run_git(&repo_path, &["worktree", "list", "--porcelain"])
}

/// Get a summarized diff (--stat) between the current HEAD and its merge-base with main.
#[tauri::command]
fn git_diff(repo_path: String, branch_name: String) -> CommandResult {
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

/// Get the full unified diff between the current HEAD and its merge-base with main.
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

/// Get the diff of staged (cached) changes only.
#[tauri::command]
fn git_diff_staged(repo_path: String) -> CommandResult {
    run_git(&repo_path, &["diff", "--cached"])
}

/// Get the diff of unstaged working directory changes only.
#[tauri::command]
fn git_diff_unstaged(repo_path: String) -> CommandResult {
    run_git(&repo_path, &["diff"])
}

/// Metadata extracted from a URL for link preview cards.
#[derive(Serialize, Deserialize)]
pub struct LinkPreview {
    pub url: String,
    pub title: String,
    pub description: String,
    pub success: bool,
}

/// Fetch a URL via curl and extract OpenGraph/meta title and description
/// for rendering link preview cards in the UI. Times out after 5 seconds.
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

/// Configuration loaded from a project's cortx.yaml/cortx.yml file.
#[derive(Serialize, Deserialize)]
pub struct CortxConfig {
    /// Shell commands to run during project setup.
    pub setup: Vec<String>,
    /// Shell commands to run when archiving/cleaning up a task.
    pub archive: Vec<String>,
}

/// Read and parse the project's cortx.yaml (or cortx.yml) configuration file.
/// Returns an empty config if no file exists.
#[tauri::command]
fn read_cortx_yaml(repo_path: String) -> Result<CortxConfig, String> {
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

/// Execute a list of shell scripts sequentially in the given working directory.
/// Used to run project setup commands from cortx.yaml.
#[tauri::command]
fn run_setup_scripts(cwd: String, scripts: Vec<String>) -> Vec<CommandResult> {
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

// ── OAuth callback server ──

/// Result from the local OAuth callback server after receiving the redirect.
#[derive(Serialize, Deserialize)]
pub struct OAuthCallbackResult {
    pub code: String,
    pub state: String,
    pub success: bool,
    pub error: String,
}

/// Start a local TCP server on the given port to receive the OAuth callback redirect.
/// Blocks (on a background thread) until either a callback is received or 5 minutes elapse.
/// Returns the authorization code and state from the callback query parameters.
#[tauri::command]
async fn start_oauth_callback_server(port: u16) -> OAuthCallbackResult {
    tauri::async_runtime::spawn_blocking(move || {
        oauth_callback_listen(port)
    }).await.unwrap_or_else(|e| OAuthCallbackResult {
        code: String::new(), state: String::new(), success: false,
        error: format!("Thread error: {}", e),
    })
}

/// Internal: blocking TCP listener that waits for the OAuth callback GET request.
fn oauth_callback_listen(port: u16) -> OAuthCallbackResult {
    let addr = format!("127.0.0.1:{}", port);
    let listener = match TcpListener::bind(&addr) {
        Ok(l) => l,
        Err(e) => return OAuthCallbackResult {
            code: String::new(), state: String::new(), success: false,
            error: format!("Failed to bind to {}: {}", addr, e),
        },
    };

    // 5 minute timeout
    listener.set_nonblocking(false).ok();
    let _ = listener.set_ttl(300);
    use std::time::Duration;
    let timeout = Duration::from_secs(300);
    let start = std::time::Instant::now();

    // Poll with short accepts so we can check timeout
    loop {
        if start.elapsed() > timeout {
            return OAuthCallbackResult {
                code: String::new(), state: String::new(), success: false,
                error: "Login timed out (5 minutes)".to_string(),
            };
        }
        // Set a short accept timeout
        let _ = listener.set_nonblocking(false);

        match listener.accept() {
        Ok((mut stream, _)) => {
            let mut buf = [0u8; 4096];
            let n = stream.read(&mut buf).unwrap_or(0);
            let request = String::from_utf8_lossy(&buf[..n]).to_string();

            // Parse GET /callback?code=xxx&state=yyy
            let mut code = String::new();
            let mut state = String::new();
            let mut error = String::new();

            if let Some(query_start) = request.find("/callback?") {
                let query_part = &request[query_start + 10..];
                let query_end = query_part.find(' ').unwrap_or(query_part.len());
                let query = &query_part[..query_end];

                for param in query.split('&') {
                    let mut kv = param.splitn(2, '=');
                    let key = kv.next().unwrap_or("");
                    let value = kv.next().unwrap_or("");
                    let decoded = urlencoding_decode(value);
                    match key {
                        "code" => code = decoded,
                        "state" => state = decoded,
                        "error" => error = decoded,
                        _ => {}
                    }
                }
            }

            // Send response HTML
            let html = if !code.is_empty() {
                "<html><body style='background:#06060a;color:#e4e4e7;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center'><h1 style='font-size:48px;margin-bottom:16px'>✅</h1><h2>Connected to Anthropic</h2><p style='color:#71717a;margin-top:8px'>You can close this tab and return to Cortx.</p></div></body></html>"
            } else {
                "<html><body style='background:#06060a;color:#e4e4e7;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center'><h1 style='font-size:48px;margin-bottom:16px'>❌</h1><h2>Authentication Failed</h2><p style='color:#71717a;margin-top:8px'>Please try again in Cortx.</p></div></body></html>"
            };

            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                html.len(), html
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();

            return OAuthCallbackResult {
                code, state, success: error.is_empty(),
                error,
            };
        }
        Err(e) => {
            // Non-blocking would give WouldBlock — just retry
            if e.kind() == std::io::ErrorKind::WouldBlock {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            return OAuthCallbackResult {
                code: String::new(), state: String::new(), success: false,
                error: format!("Failed to accept connection: {}", e),
            };
        }
    }
    } // end loop
}

/// Simple percent-decoding for URL query parameter values.
/// Handles %XX hex sequences and '+' as space.
fn urlencoding_decode(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let h1 = chars.next().unwrap_or(0);
            let h2 = chars.next().unwrap_or(0);
            let hex = format!("{}{}", h1 as char, h2 as char);
            if let Ok(val) = u8::from_str_radix(&hex, 16) {
                result.push(val as char);
            }
        } else if b == b'+' {
            result.push(' ');
        } else {
            result.push(b as char);
        }
    }
    result
}

/// Information about a configured MCP (Model Context Protocol) server.
#[derive(Serialize, Deserialize)]
pub struct McpServerInfo {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: std::collections::HashMap<String, String>,
    /// Transport type: "stdio" for local processes, "http" for remote servers.
    pub server_type: String,
    /// URL for HTTP-type MCP servers (empty for stdio).
    pub url: String,
}

/// Extract environment variables from an MCP server config JSON object.
fn parse_mcp_env(config: &serde_json::Value) -> std::collections::HashMap<String, String> {
    let mut env = std::collections::HashMap::new();
    if let Some(env_obj) = config.get("env").and_then(|v| v.as_object()) {
        for (k, v) in env_obj {
            if let Some(val) = v.as_str() {
                env.insert(k.clone(), val.to_string());
            }
        }
    }
    env
}

/// Discover MCP servers from ~/.claude.json and ~/.claude/settings.json.
/// Returns server configs for the frontend to display connection status.
#[tauri::command]
fn list_mcp_servers() -> Vec<McpServerInfo> {
    let mut servers = vec![];

    // Check ~/.claude.json
    if let Some(home) = std::env::var_os("HOME") {
        let config_path = std::path::Path::new(&home).join(".claude.json");
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(mcp) = json.get("mcpServers").and_then(|v| v.as_object()) {
                    for (name, config) in mcp {
                        let command = config.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let args: Vec<String> = config.get("args")
                            .and_then(|v| v.as_array())
                            .map(|arr| arr.iter().filter_map(|a| a.as_str().map(|s| s.to_string())).collect())
                            .unwrap_or_default();
                        let env = parse_mcp_env(config);
                        let server_type = config.get("type").and_then(|v| v.as_str()).unwrap_or("stdio").to_string();
                        let url = config.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        servers.push(McpServerInfo { name: name.clone(), command, args, env, server_type, url });
                    }
                }
            }
        }

        // Also check ~/.claude/settings.json
        let settings_path = std::path::Path::new(&home).join(".claude").join("settings.json");
        if let Ok(content) = std::fs::read_to_string(&settings_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(mcp) = json.get("mcpServers").and_then(|v| v.as_object()) {
                    for (name, config) in mcp {
                        if servers.iter().any(|s| s.name == *name) { continue; }
                        let command = config.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let args: Vec<String> = config.get("args")
                            .and_then(|v| v.as_array())
                            .map(|arr| arr.iter().filter_map(|a| a.as_str().map(|s| s.to_string())).collect())
                            .unwrap_or_default();
                        let env = parse_mcp_env(config);
                        let server_type = config.get("type").and_then(|v| v.as_str()).unwrap_or("stdio").to_string();
                        let url = config.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        servers.push(McpServerInfo { name: name.clone(), command, args, env, server_type, url });
                    }
                }
            }
        }
    }

    servers
}

/// Execute an arbitrary shell command via `zsh -l -c` in a background thread.
/// Returns stdout, stderr, and success status. Used for git operations and file I/O.
#[tauri::command]
async fn run_shell_command(cwd: String, command: String) -> CommandResult {
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

/// Helper: run a git command with the given arguments in the specified directory.
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

// ── Claude Code CLI ──

/// Spawn a new Claude CLI process for the given task, passing prompt and context.
#[tauri::command]
fn claude_spawn(id: String, cwd: String, message: String, context_files: Option<Vec<String>>, context_summary: Option<String>, allow_all_tools: Option<bool>, session_id: Option<String>, state: tauri::State<'_, SharedPtyManager>, app: tauri::AppHandle) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.spawn_claude(&id, &cwd, &message, context_files.as_deref().unwrap_or(&[]), context_summary.as_deref().unwrap_or(""), allow_all_tools.unwrap_or(false), session_id.as_deref(), &app)
}

/// Send SIGTERM to stop a running Claude CLI process.
#[tauri::command]
fn claude_stop(id: String, state: tauri::State<'_, SharedPtyManager>) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.stop_claude(&id)
}

/// Send a follow-up message to an existing Claude CLI session via its PTY.
#[tauri::command]
fn claude_send(id: String, message: String, state: tauri::State<'_, SharedPtyManager>) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    if !mgr.has_session(&id) {
        return Err("Claude session not running. Try reconnecting.".to_string());
    }
    mgr.write(&id, &format!("{}\n", message))
}

/// A slash command entry for the autocomplete menu in the chat UI.
#[derive(Serialize, Deserialize)]
pub struct SlashCommand {
    pub name: String,
    pub description: String,
    /// Origin of the command: "builtin", "user" (~/.claude/commands/), or "project" (.claude/commands/).
    pub source: String,
}

/// List all available slash commands: built-in Claude commands + user/project custom commands.
/// Scans ~/.claude/commands/ and <project>/.claude/commands/ recursively for .md files.
#[tauri::command]
fn list_slash_commands(project_cwd: Option<String>) -> Vec<SlashCommand> {
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

// ── PTY commands ──

/// Spawn an interactive terminal shell (zsh) for the given task ID.
#[tauri::command]
fn pty_spawn(id: String, cwd: String, state: tauri::State<'_, SharedPtyManager>, app: tauri::AppHandle) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.spawn(&id, &cwd, &app)
}

/// Write keystrokes/data to a terminal PTY session.
#[tauri::command]
fn pty_write(id: String, data: String, state: tauri::State<'_, SharedPtyManager>) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.write(&id, &data)
}

/// Resize a terminal PTY to match the frontend terminal panel dimensions.
#[tauri::command]
fn pty_resize(id: String, rows: u16, cols: u16, state: tauri::State<'_, SharedPtyManager>) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.resize(&id, rows, cols)
}

/// Close a terminal PTY session, releasing its resources.
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
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
            read_cortx_yaml,
            start_oauth_callback_server,
            run_setup_scripts,
            run_shell_command,
            list_mcp_servers,
            list_slash_commands,
            claude_spawn,
            claude_stop,
            claude_send,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
