//! `~/.claude.json` 읽기/쓰기 헬퍼 — 다른 키는 보존하며 mcpServers만 갱신.

use serde_json::{json, Value};
use std::path::PathBuf;

pub fn claude_json_path() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or_else(|| "HOME not set".to_string())?;
    Ok(std::path::Path::new(&home).join(".claude.json"))
}

/// 파일이 없으면 빈 객체를 반환 — 쓰기 시 덮어씀.
pub fn read_claude_json() -> Result<Value, String> {
    let path = claude_json_path()?;
    if !path.exists() {
        return Ok(json!({}));
    }
    let content = std::fs::read_to_string(&path).map_err(|e| format!("Read failed: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Parse failed: {}", e))
}

pub fn write_claude_json(value: &Value) -> Result<(), String> {
    let path = claude_json_path()?;
    let content =
        serde_json::to_string_pretty(value).map_err(|e| format!("Serialize failed: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("Write failed: {}", e))
}
