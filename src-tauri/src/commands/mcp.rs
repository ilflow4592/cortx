use serde::{Deserialize, Serialize};

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
