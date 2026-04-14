//! Global-scope MCP 수집 — `~/.claude.json` + `~/.claude/settings.json` + claude.ai cloud.

use super::super::McpServerInfo;
use super::parse_mcp_file;
use std::collections::HashSet;
use std::path::Path;

/// `~/.claude.json`과 `~/.claude/settings.json`의 mcpServers,
/// 그리고 `claudeAiMcpEverConnected` 리스트(cloud 서버)를 servers에 추가.
pub fn collect_global_servers(
    disabled_servers: &HashSet<String>,
    enabled_local_servers: &HashSet<String>,
    has_enabled_list: bool,
    servers: &mut Vec<McpServerInfo>,
) {
    let Some(home) = std::env::var_os("HOME") else { return };

    // 2. Global ~/.claude.json
    let config_path = Path::new(&home).join(".claude.json");
    parse_mcp_file(
        &config_path,
        "global",
        servers,
        disabled_servers,
        enabled_local_servers,
        has_enabled_list,
    );

    // 3. Global ~/.claude/settings.json
    let settings_path = Path::new(&home).join(".claude").join("settings.json");
    parse_mcp_file(
        &settings_path,
        "global",
        servers,
        disabled_servers,
        enabled_local_servers,
        has_enabled_list,
    );

    // 4. claude.ai cloud MCPs (claudeAiMcpEverConnected 키)
    let Ok(content) = std::fs::read_to_string(&config_path) else { return };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else { return };
    let Some(arr) = json.get("claudeAiMcpEverConnected").and_then(|v| v.as_array()) else { return };
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
