//! MCP 서버 추가/수정/삭제 — `~/.claude.json`의 mcpServers 블록 변형.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use ts_rs::TS;

use super::json_io::{read_claude_json, write_claude_json};

/// 새 MCP 서버 추가/수정 시의 입력. 프론트엔드 DraftServer 변환 결과.
#[derive(Serialize, Deserialize, Debug, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct McpServerInput {
    pub name: String,
    /// "stdio" or "http"
    pub server_type: String,
    #[ts(optional)]
    pub command: Option<String>,
    #[ts(optional)]
    pub args: Option<Vec<String>>,
    #[ts(optional)]
    pub env: Option<std::collections::HashMap<String, String>>,
    #[ts(optional)]
    pub url: Option<String>,
}

#[tauri::command]
pub fn upsert_mcp_server(server: McpServerInput) -> Result<usize, String> {
    let mut root = read_claude_json()?;
    if !root.is_object() {
        root = json!({});
    }
    let obj = root
        .as_object_mut()
        .ok_or_else(|| "Root is not an object".to_string())?;
    if !obj.contains_key("mcpServers") {
        obj.insert("mcpServers".to_string(), json!({}));
    }
    let mcp = obj
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| "mcpServers is not an object".to_string())?;

    let mut cfg = serde_json::Map::new();
    if server.server_type == "http" {
        cfg.insert("type".to_string(), json!("http"));
        cfg.insert("url".to_string(), json!(server.url.unwrap_or_default()));
    } else {
        cfg.insert(
            "command".to_string(),
            json!(server.command.unwrap_or_default()),
        );
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
