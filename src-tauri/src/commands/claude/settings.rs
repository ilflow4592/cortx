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

fn settings_path() -> Option<std::path::PathBuf> {
    let home = std::env::var("HOME").ok().filter(|h| !h.is_empty())?;
    Some(
        std::path::PathBuf::from(home)
            .join(".claude")
            .join("settings.json"),
    )
}

/// `~/.claude/settings.json` 에서 model / effortLevel 만 뽑아 반환. 파일이 없거나
/// 파싱 실패 시 기본값 (모든 필드 None) 반환 — 에러로 올리지 않음.
#[tauri::command]
pub fn claude_cli_settings_read() -> ClaudeCliSettings {
    let path = match settings_path() {
        Some(p) => p,
        None => return ClaudeCliSettings::default(),
    };
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

/// `~/.claude/settings.json` 의 `model` / `effortLevel` 키만 업데이트. 다른 키는
/// 보존. `None` 전달 시 해당 키 삭제. 파일이 없으면 새로 생성.
/// 값 검증: model ∈ {"opus", "sonnet", "haiku"}, effort ∈ {"low","medium","high","max"}.
#[tauri::command]
pub fn claude_cli_settings_write(
    model: Option<String>,
    effort_level: Option<String>,
) -> Result<(), String> {
    if let Some(m) = model.as_deref() {
        if !matches!(m, "opus" | "sonnet" | "haiku") {
            return Err(format!("invalid model alias: {m}"));
        }
    }
    if let Some(e) = effort_level.as_deref() {
        // Opus 는 xhigh 추가 지원. 여기선 union 으로 허용 — 잘못된 조합은 CLI 가 거부.
        if !matches!(e, "low" | "medium" | "high" | "xhigh" | "max") {
            return Err(format!("invalid effort level: {e}"));
        }
    }
    let path = settings_path().ok_or("HOME not set")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut value: serde_json::Value = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let obj = value.as_object_mut().ok_or("settings.json not an object")?;
    match model {
        Some(m) => {
            obj.insert("model".into(), serde_json::Value::String(m));
        }
        None => {
            obj.remove("model");
        }
    }
    match effort_level {
        Some(e) => {
            obj.insert("effortLevel".into(), serde_json::Value::String(e));
        }
        None => {
            obj.remove("effortLevel");
        }
    }
    let pretty = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    std::fs::write(&path, pretty).map_err(|e| e.to_string())?;
    Ok(())
}
