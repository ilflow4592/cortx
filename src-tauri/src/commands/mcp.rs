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

/// Discover MCP servers from ~/.claude.json and ~/.claude/settings.json.
/// Returns server configs for the frontend to display connection status.
#[tauri::command]
pub fn list_mcp_servers() -> Vec<McpServerInfo> {
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
