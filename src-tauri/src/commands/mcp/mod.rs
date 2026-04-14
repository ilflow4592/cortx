//! MCP (Model Context Protocol) 서버 관리.
//!
//! - `discovery`: project/global/builtin 우선순위로 서버 목록 수집
//! - `mutate`: ~/.claude.json의 mcpServers 추가/수정/삭제
//! - `toggle`: 프로젝트 settings.local.json에서 enable/disable 토글
//! - `json_io`: ~/.claude.json 읽기/쓰기 헬퍼
use serde::{Deserialize, Serialize};
use ts_rs::TS;

// 서브모듈은 pub — Tauri `generate_handler!`가 함수 정의 위치를 직접 참조하므로
// re-export로는 부족하고 lib.rs에서 `commands::mcp::discovery::...`로 호출한다.
pub mod discovery;
mod json_io;
pub mod mutate;
pub mod toggle;

/// Information about a configured MCP (Model Context Protocol) server.
/// 프론트엔드 RawServer (mcp-manager/types.ts)와 1:1 매핑.
#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
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

/// MCP 서버 config의 env 객체에서 string value만 추출.
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
