//! Built-in + synthetic MCP entries — 설정에는 있지만 어디에도 정의되지 않은 서버
//! (Local 리스트 유령) 및 항상 존재하는 built-in 서버를 servers에 추가.

use super::super::McpServerInfo;
use std::collections::HashSet;

/// 4.5. disabled/enabled 리스트에 이름만 있고 실제 config가 없는 서버는
/// "local" source의 synthetic entry로 보정한다.
pub fn add_synthetic_local_entries(
    disabled_servers: &HashSet<String>,
    enabled_local_servers: &HashSet<String>,
    servers: &mut Vec<McpServerInfo>,
) {
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
}

/// 5. 항상 표시되는 built-in MCP들 (기본 disabled).
pub fn add_builtin_entries(servers: &mut Vec<McpServerInfo>) {
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
                disabled: true,
            });
        }
    }
}
