//! Claude CLI 사용자 설정 리더 — `~/.claude/settings.json` 의 `model` / `effortLevel`
//! 만 뽑아 frontend 가 현재 활성 모델을 인지하도록 노출. Cortx 는 이 값을 CLI 에
//! 다시 전달하지 않음 — CLI 가 자체적으로 사용하므로 단순 참조 용도.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Serialize, Deserialize, TS, Default)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCliSettings {
    /// `/model` 로 선택한 alias ("opus" | "sonnet" | "haiku" | …). 미설정 시 None.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub model: Option<String>,
    /// Effort 레벨 ("low" | "medium" | "high" | "max"). 미설정 시 None.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub effort_level: Option<String>,
}

/// `~/.claude/settings.json` 에서 model / effortLevel 만 뽑아 반환. 파일이 없거나
/// 파싱 실패 시 기본값 (모든 필드 None) 반환 — 에러로 올리지 않음.
#[tauri::command]
pub fn claude_cli_settings_read() -> ClaudeCliSettings {
    let home = match std::env::var("HOME") {
        Ok(h) if !h.is_empty() => h,
        _ => return ClaudeCliSettings::default(),
    };
    let path = std::path::PathBuf::from(home)
        .join(".claude")
        .join("settings.json");
    let raw = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return ClaudeCliSettings::default(),
    };
    let value: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return ClaudeCliSettings::default(),
    };
    ClaudeCliSettings {
        model: value.get("model").and_then(|v| v.as_str()).map(String::from),
        effort_level: value
            .get("effortLevel")
            .and_then(|v| v.as_str())
            .map(String::from),
    }
}
