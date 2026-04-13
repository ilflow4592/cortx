use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

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
    /// Where this config came from: "project" or "global"
    pub source: String,
    /// Whether this server is disabled in Claude Code settings
    pub disabled: bool,
}

/// Extract environment variables from an MCP server config JSON object.
pub fn parse_mcp_env(config: &serde_json::Value) -> std::collections::HashMap<String, String> {
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

/// Parse MCP servers from a JSON file containing `mcpServers` key.
fn parse_mcp_file(
    path: &std::path::Path,
    source: &str,
    servers: &mut Vec<McpServerInfo>,
    disabled_set: &std::collections::HashSet<String>,
    enabled_set: &std::collections::HashSet<String>,
    has_enabled_list: bool,
) {
    if let Ok(content) = std::fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(mcp) = json.get("mcpServers").and_then(|v| v.as_object()) {
                for (name, config) in mcp {
                    if servers.iter().any(|s| s.name == *name) { continue; }

                    let in_disabled_list = disabled_set.contains(name);
                    let in_enabled_list = enabled_set.contains(name);
                    let config_disabled = config.get("disabled").and_then(|v| v.as_bool()).unwrap_or(false);

                    // Source stays as declared — Local MCPs come from project_mcp_servers (step 1.5)
                    let actual_source = source;

                    // Determine disabled state:
                    // - Explicitly in disabled list or has disabled: true in config
                    // - For project/local sources: not in enabled list (if enabled list exists)
                    let is_project_local = actual_source == "project" || actual_source == "local";
                    let is_disabled = in_disabled_list
                        || config_disabled
                        || (is_project_local && has_enabled_list && !in_enabled_list);

                    let command = config.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let args: Vec<String> = config.get("args")
                        .and_then(|v| v.as_array())
                        .map(|arr| arr.iter().filter_map(|a| a.as_str().map(|s| s.to_string())).collect())
                        .unwrap_or_default();
                    let env = parse_mcp_env(config);
                    let server_type = config.get("type").and_then(|v| v.as_str()).unwrap_or("stdio").to_string();
                    let url = config.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    servers.push(McpServerInfo { name: name.clone(), command, args, env, server_type, url, source: actual_source.to_string(), disabled: is_disabled });
                }
            }
        }
    }
}

/// Discover MCP servers from project .mcp.json (highest priority),
/// then ~/.claude.json and ~/.claude/settings.json (global).
/// Project-local servers override global ones with the same name.
#[tauri::command]
pub fn list_mcp_servers(project_cwd: Option<String>) -> Vec<McpServerInfo> {
    let mut servers = vec![];

    // Collect disabled/enabled server names from ~/.claude.json projects section
    // This is the SINGLE SOURCE OF TRUTH for MCP disabled state
    let mut disabled_servers: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut enabled_local_servers: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut has_enabled_list = false;
    let mut project_mcp_servers: Vec<(String, serde_json::Value)> = vec![];

    // Helper: find main repo root from a worktree path
    let find_repo_root = |cwd: &str| -> Option<std::path::PathBuf> {
        let git_path = std::path::Path::new(cwd).join(".git");
        if git_path.is_file() {
            let content = std::fs::read_to_string(&git_path).ok()?;
            let gitdir = content.strip_prefix("gitdir: ").map(|s| s.trim())?;
            std::path::Path::new(gitdir).parent()?.parent()?.parent().map(|p| p.to_path_buf())
        } else {
            None
        }
    };

    // Read project config from ~/.claude.json → projects[projectPath]
    if let Some(cwd) = &project_cwd {
        // Resolve actual project path (worktree → main repo root)
        let project_path = find_repo_root(cwd)
            .unwrap_or_else(|| std::path::PathBuf::from(cwd));
        let project_key = project_path.to_string_lossy().to_string();

        if let Some(home) = std::env::var_os("HOME") {
            let claude_json = std::path::Path::new(&home).join(".claude.json");
            if let Ok(content) = std::fs::read_to_string(&claude_json) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(proj) = json.get("projects").and_then(|p| p.get(&project_key)) {
                        // disabledMcpServers — THE master disabled list (all MCP types)
                        if let Some(arr) = proj.get("disabledMcpServers").and_then(|v| v.as_array()) {
                            for item in arr {
                                if let Some(name) = item.as_str() { disabled_servers.insert(name.to_string()); }
                            }
                        }
                        // disabledMcpjsonServers — for .mcp.json servers
                        if let Some(arr) = proj.get("disabledMcpjsonServers").and_then(|v| v.as_array()) {
                            for item in arr {
                                if let Some(name) = item.as_str() { disabled_servers.insert(name.to_string()); }
                            }
                        }
                        // enabledMcpjsonServers
                        if let Some(arr) = proj.get("enabledMcpjsonServers").and_then(|v| v.as_array()) {
                            has_enabled_list = true;
                            for item in arr {
                                if let Some(name) = item.as_str() { enabled_local_servers.insert(name.to_string()); }
                            }
                        }
                        // Project-scoped mcpServers (Local MCPs)
                        if let Some(mcp) = proj.get("mcpServers").and_then(|v| v.as_object()) {
                            for (name, config) in mcp {
                                project_mcp_servers.push((name.clone(), config.clone()));
                            }
                        }
                    }
                }
            }
        }
    }

    // 1. Project-level .mcp.json (highest priority)
    if let Some(cwd) = &project_cwd {
        let cwd_path = std::path::Path::new(cwd);
        let project_mcp = cwd_path.join(".mcp.json");
        parse_mcp_file(&project_mcp, "project", &mut servers, &disabled_servers, &enabled_local_servers, has_enabled_list);

        // If cwd is a worktree, also check the main repo root
        if let Some(root) = find_repo_root(cwd) {
            let root_mcp = root.join(".mcp.json");
            parse_mcp_file(&root_mcp, "project", &mut servers, &disabled_servers, &enabled_local_servers, has_enabled_list);
        }

        // 1.5. Local MCPs — from ~/.claude.json projects[path].mcpServers
        for (name, config) in &project_mcp_servers {
            if servers.iter().any(|s| s.name == *name) { continue; }
            let is_disabled = disabled_servers.contains(name)
                || config.get("disabled").and_then(|v| v.as_bool()).unwrap_or(false);
            let command = config.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let args: Vec<String> = config.get("args")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|a| a.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();
            let env = parse_mcp_env(config);
            let server_type = config.get("type").and_then(|v| v.as_str()).unwrap_or("stdio").to_string();
            let url = config.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
            servers.push(McpServerInfo { name: name.clone(), command, args, env, server_type, url, source: "local".to_string(), disabled: is_disabled });
        }
    }

    // 2. Global ~/.claude.json
    if let Some(home) = std::env::var_os("HOME") {
        let config_path = std::path::Path::new(&home).join(".claude.json");
        parse_mcp_file(&config_path, "global", &mut servers, &disabled_servers, &enabled_local_servers, has_enabled_list);

        // 3. Global ~/.claude/settings.json
        let settings_path = std::path::Path::new(&home).join(".claude").join("settings.json");
        parse_mcp_file(&settings_path, "global", &mut servers, &disabled_servers, &enabled_local_servers, has_enabled_list);

        // 4. claude.ai cloud MCPs (from claudeAiMcpEverConnected key)
        let config_path = std::path::Path::new(&home).join(".claude.json");
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(arr) = json.get("claudeAiMcpEverConnected").and_then(|v| v.as_array()) {
                    for item in arr {
                        if let Some(name) = item.as_str() {
                            if !servers.iter().any(|s| s.name == name) {
                                servers.push(McpServerInfo {
                                    name: name.to_string(),
                                    command: String::new(),
                                    args: vec![],
                                    env: std::collections::HashMap::new(),
                                    server_type: "cloud".to_string(),
                                    url: String::new(),
                                    source: "claude.ai".to_string(),
                                    disabled: false,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // 4.5. Synthetic local entries — servers in project settings lists but not in any config file
    for name in disabled_servers.iter().chain(enabled_local_servers.iter()) {
        if !servers.iter().any(|s| s.name == *name) {
            servers.push(McpServerInfo {
                name: name.clone(),
                command: String::new(),
                args: vec![],
                env: std::collections::HashMap::new(),
                server_type: String::new(),
                url: String::new(),
                source: "local".to_string(),
                disabled: !enabled_local_servers.contains(name),
            });
        }
    }

    // 5. Built-in MCPs (always available)
    let builtins = ["computer-use"];
    for name in &builtins {
        if !servers.iter().any(|s| s.name == *name) {
            servers.push(McpServerInfo {
                name: name.to_string(),
                command: String::new(),
                args: vec![],
                env: std::collections::HashMap::new(),
                server_type: "builtin".to_string(),
                url: String::new(),
                source: "built-in".to_string(),
                disabled: true, // built-in은 기본 disabled
            });
        }
    }

    servers
}

/// Toggle an MCP server's enabled/disabled state in the project's settings.
/// `currently_disabled` tells the function the server's current visual state so it can invert correctly.
/// Returns the new disabled state (true = now disabled, false = now enabled).
#[tauri::command]
pub fn toggle_mcp_server(project_cwd: String, server_name: String, currently_disabled: bool) -> Result<bool, String> {
    // Find the settings file — check worktree first, then main repo root
    let cwd_path = std::path::Path::new(&project_cwd);
    let settings_path = {
        let direct = cwd_path.join(".claude").join("settings.local.json");
        if direct.exists() {
            direct
        } else {
            // Check if worktree → use main repo root
            let git_path = cwd_path.join(".git");
            if git_path.is_file() {
                if let Ok(content) = std::fs::read_to_string(&git_path) {
                    if let Some(gitdir) = content.strip_prefix("gitdir: ").map(|s| s.trim()) {
                        if let Some(root) = std::path::Path::new(gitdir).parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
                            let root_settings = root.join(".claude").join("settings.local.json");
                            if root_settings.exists() {
                                root_settings
                            } else {
                                direct // fallback, will create
                            }
                        } else { direct }
                    } else { direct }
                } else { direct }
            } else { direct }
        }
    };

    // Read existing settings
    let mut root = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<serde_json::Value>(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    let obj = root.as_object_mut().ok_or("Settings is not an object")?;

    // Get current lists
    let enabled: Vec<String> = obj.get("enabledMcpjsonServers")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();
    let disabled: Vec<String> = obj.get("disabledMcpjsonServers")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    let is_currently_enabled = enabled.contains(&server_name);
    let is_currently_disabled = disabled.contains(&server_name);

    let (new_enabled, new_disabled, now_disabled) = if is_currently_enabled {
        // Currently enabled → disable it
        let e: Vec<String> = enabled.into_iter().filter(|n| *n != server_name).collect();
        let mut d = disabled;
        d.push(server_name.clone());
        (e, d, true)
    } else if is_currently_disabled {
        // Currently disabled → enable it
        let mut e = enabled;
        e.push(server_name.clone());
        let d: Vec<String> = disabled.into_iter().filter(|n| *n != server_name).collect();
        (e, d, false)
    } else if currently_disabled {
        // Not in either list but visually disabled → enable it
        let mut e = enabled;
        e.push(server_name.clone());
        (e, disabled, false)
    } else {
        // Not in either list but visually enabled → disable it
        let mut d = disabled;
        d.push(server_name.clone());
        (enabled, d, true)
    };

    obj.insert("enabledMcpjsonServers".to_string(), json!(new_enabled));
    obj.insert("disabledMcpjsonServers".to_string(), json!(new_disabled));

    // Write back
    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, content).map_err(|e| e.to_string())?;

    Ok(now_disabled)
}

/// Path to ~/.claude.json
fn claude_json_path() -> Result<std::path::PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or_else(|| "HOME not set".to_string())?;
    Ok(std::path::Path::new(&home).join(".claude.json"))
}

/// Read ~/.claude.json as a JSON Value (returns empty object if missing).
fn read_claude_json() -> Result<Value, String> {
    let path = claude_json_path()?;
    if !path.exists() {
        return Ok(json!({}));
    }
    let content = std::fs::read_to_string(&path).map_err(|e| format!("Read failed: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Parse failed: {}", e))
}

/// Write a JSON Value back to ~/.claude.json, preserving all other keys.
fn write_claude_json(value: &Value) -> Result<(), String> {
    let path = claude_json_path()?;
    let content = serde_json::to_string_pretty(value).map_err(|e| format!("Serialize failed: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("Write failed: {}", e))
}

/// Input config for adding/updating an MCP server.
#[derive(Serialize, Deserialize, Debug)]
pub struct McpServerInput {
    pub name: String,
    /// "stdio" or "http"
    pub server_type: String,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<std::collections::HashMap<String, String>>,
    pub url: Option<String>,
}

/// Add or update an MCP server in ~/.claude.json. Returns the new server count.
#[tauri::command]
pub fn upsert_mcp_server(server: McpServerInput) -> Result<usize, String> {
    let mut root = read_claude_json()?;
    // Ensure root is an object
    if !root.is_object() {
        root = json!({});
    }
    let obj = root.as_object_mut().ok_or_else(|| "Root is not an object".to_string())?;
    // Get or create mcpServers
    if !obj.contains_key("mcpServers") {
        obj.insert("mcpServers".to_string(), json!({}));
    }
    let mcp = obj.get_mut("mcpServers").and_then(|v| v.as_object_mut()).ok_or_else(|| "mcpServers is not an object".to_string())?;

    let mut cfg = serde_json::Map::new();
    if server.server_type == "http" {
        cfg.insert("type".to_string(), json!("http"));
        cfg.insert("url".to_string(), json!(server.url.unwrap_or_default()));
    } else {
        cfg.insert("command".to_string(), json!(server.command.unwrap_or_default()));
        if let Some(args) = server.args {
            cfg.insert("args".to_string(), json!(args));
        }
    }
    if let Some(env) = server.env {
        if !env.is_empty() {
            cfg.insert("env".to_string(), json!(env));
        }
    }

    mcp.insert(server.name, Value::Object(cfg));
    let count = mcp.len();
    write_claude_json(&root)?;
    Ok(count)
}

/// Remove an MCP server by name from ~/.claude.json. Returns true if removed.
#[tauri::command]
pub fn remove_mcp_server(name: String) -> Result<bool, String> {
    let mut root = read_claude_json()?;
    let mcp = root.get_mut("mcpServers").and_then(|v| v.as_object_mut());
    let removed = match mcp {
        Some(m) => m.remove(&name).is_some(),
        None => false,
    };
    if removed {
        write_claude_json(&root)?;
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_mcp_env_extracts_string_values() {
        let config = json!({
            "command": "npx",
            "env": {
                "GITHUB_TOKEN": "ghp_xxx",
                "API_KEY": "sk-yyy"
            }
        });
        let env = parse_mcp_env(&config);
        assert_eq!(env.get("GITHUB_TOKEN"), Some(&"ghp_xxx".to_string()));
        assert_eq!(env.get("API_KEY"), Some(&"sk-yyy".to_string()));
        assert_eq!(env.len(), 2);
    }

    #[test]
    fn parse_mcp_env_returns_empty_when_no_env() {
        let config = json!({ "command": "npx" });
        let env = parse_mcp_env(&config);
        assert!(env.is_empty());
    }

    #[test]
    fn parse_mcp_env_skips_non_string_values() {
        let config = json!({
            "env": {
                "VALID": "yes",
                "NUMBER": 42,
                "OBJECT": { "nested": "value" }
            }
        });
        let env = parse_mcp_env(&config);
        assert_eq!(env.len(), 1);
        assert_eq!(env.get("VALID"), Some(&"yes".to_string()));
    }

    #[test]
    fn parse_mcp_env_handles_missing_env_key() {
        let config = json!(null);
        let env = parse_mcp_env(&config);
        assert!(env.is_empty());
    }
}
