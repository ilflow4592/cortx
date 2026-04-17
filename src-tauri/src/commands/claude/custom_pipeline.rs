//! Custom pipeline storage + agent scan — `.cortx/pipelines/*.json` (project) + `~/.cortx/pipelines/*.json` (user) CRUD,
//! `~/.claude/agents/*.md` 스캔. slash.rs 의 path-traversal 방어 패턴을 복제.
//!
//! 파일 포맷: JSON (YAML 라이브러리 회피 — 기존 인프라와 일관성).
//! 전체 스키마는 프론트 `types/customPipeline.ts` 의 CustomPipelineConfig 와 일치.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// list_custom_pipelines 반환용 경량 메타 (본문 로드 없음).
#[derive(Serialize, Deserialize, TS, Debug)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CustomPipelineMeta {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub description: Option<String>,
    /// "user" (~/.cortx/pipelines) 또는 "project" (.cortx/pipelines)
    pub source: String,
    pub phase_count: u32,
    pub updated_at: String,
}

/// ~/.claude/agents/ 스캔 결과. 내장 agent 와 머지 시 사용 (프론트 side).
#[derive(Serialize, Deserialize, TS, Debug)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ClaudeAgent {
    /// Agent tool 의 subagent_type 값 (파일 stem)
    pub subagent_type: String,
    pub display_name: String,
    pub description: String,
    pub file_path: String,
}

/// JSON 파일 파싱 시 상위 레벨만 읽어 메타 추출 (전체 검증은 프론트에서).
#[derive(Deserialize, Debug)]
struct PipelineFileHead {
    id: Option<String>,
    name: Option<String>,
    description: Option<String>,
    phases: Option<Vec<serde_json::Value>>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
}

/// 경로 해석 + path-traversal 방어. source = "user" | "project".
fn resolve_pipeline_path(
    id: &str,
    source: &str,
    project_cwd: Option<&str>,
) -> Result<std::path::PathBuf, String> {
    if id.contains("..") || id.contains('/') || id.contains('\\') {
        return Err(format!("Invalid pipeline id: {}", id));
    }
    let base = pipeline_base_dir(source, project_cwd)?;
    let candidate = base.join(format!("{}.json", id));
    // canonicalize 하위 확인 (심볼릭 링크 우회 방지). 파일 없을 수 있으니 부모 기준.
    if let (Ok(base_canon), Some(parent)) = (base.canonicalize(), candidate.parent()) {
        if let Ok(parent_canon) = parent.canonicalize() {
            if !parent_canon.starts_with(&base_canon) {
                return Err(format!("Path traversal detected: {}", id));
            }
        }
    }
    Ok(candidate)
}

fn pipeline_base_dir(source: &str, project_cwd: Option<&str>) -> Result<std::path::PathBuf, String> {
    match source {
        "user" => {
            let home = std::env::var_os("HOME").ok_or_else(|| "HOME not set".to_string())?;
            Ok(std::path::Path::new(&home).join(".cortx").join("pipelines"))
        }
        "project" => {
            let cwd = project_cwd
                .ok_or_else(|| "project_cwd required for project source".to_string())?;
            Ok(std::path::Path::new(cwd).join(".cortx").join("pipelines"))
        }
        _ => Err(format!("Invalid source: {}", source)),
    }
}

fn scan_pipelines(source: &str, dir: &std::path::Path, out: &mut Vec<CustomPipelineMeta>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return, // 디렉토리 없음 — 정상 (아직 저장된 파이프라인 없는 프로젝트)
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };
        let head: PipelineFileHead = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue, // 손상된 파일 skip
        };
        let phase_count = head.phases.as_ref().map(|p| p.len()).unwrap_or(0) as u32;
        // id 는 반드시 파일 stem 사용 (JSON 내부 id 필드와 파일명 불일치 시 read 실패).
        // head.id 는 무시 — list/read 경로 일관성 보장.
        out.push(CustomPipelineMeta {
            id: stem.to_string(),
            name: head.name.unwrap_or_else(|| stem.to_string()),
            description: head.description,
            source: source.to_string(),
            phase_count,
            updated_at: head.updated_at.unwrap_or_default(),
        });
    }
}

/// project 우선 머지. 동일 id 가 양쪽에 있으면 project 가 user 를 가린다.
#[tauri::command]
pub fn list_custom_pipelines(project_cwd: Option<String>) -> Vec<CustomPipelineMeta> {
    let mut all: Vec<CustomPipelineMeta> = Vec::new();

    if let Some(home) = std::env::var_os("HOME") {
        let user_dir = std::path::Path::new(&home).join(".cortx").join("pipelines");
        scan_pipelines("user", &user_dir, &mut all);
    }
    if let Some(cwd) = project_cwd.as_deref() {
        let proj_dir = std::path::Path::new(cwd).join(".cortx").join("pipelines");
        let mut proj: Vec<CustomPipelineMeta> = Vec::new();
        scan_pipelines("project", &proj_dir, &mut proj);
        // project 우선: 동일 id 가 user 에 있으면 제거
        let proj_ids: std::collections::HashSet<String> =
            proj.iter().map(|p| p.id.clone()).collect();
        all.retain(|p| p.source != "user" || !proj_ids.contains(&p.id));
        all.extend(proj);
    }

    all
}

#[tauri::command]
pub fn read_custom_pipeline(
    id: String,
    source: String,
    project_cwd: Option<String>,
) -> Result<String, String> {
    let path = resolve_pipeline_path(&id, &source, project_cwd.as_deref())?;
    std::fs::read_to_string(&path).map_err(|e| format!("Read failed: {}", e))
}

#[tauri::command]
pub fn write_custom_pipeline(
    id: String,
    source: String,
    content: String,
    project_cwd: Option<String>,
) -> Result<(), String> {
    let path = resolve_pipeline_path(&id, &source, project_cwd.as_deref())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Mkdir failed: {}", e))?;
    }
    std::fs::write(&path, content).map_err(|e| format!("Write failed: {}", e))
}

#[tauri::command]
pub fn delete_custom_pipeline(
    id: String,
    source: String,
    project_cwd: Option<String>,
) -> Result<(), String> {
    let path = resolve_pipeline_path(&id, &source, project_cwd.as_deref())?;
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }
    std::fs::remove_file(&path).map_err(|e| format!("Delete failed: {}", e))
}

/// Export — 지정된 경로로 파이프라인 JSON 을 복사 (사용자가 공유/백업 목적).
#[tauri::command]
pub fn export_custom_pipeline(
    id: String,
    source: String,
    dest_path: String,
    project_cwd: Option<String>,
) -> Result<(), String> {
    let src = resolve_pipeline_path(&id, &source, project_cwd.as_deref())?;
    let content = std::fs::read_to_string(&src).map_err(|e| format!("Read failed: {}", e))?;
    // dest_path 는 사용자 임의 경로 (파일 다이얼로그 결과). 쓰기만 허용.
    let dest = std::path::PathBuf::from(&dest_path);
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Mkdir failed: {}", e))?;
        }
    }
    std::fs::write(&dest, content).map_err(|e| format!("Export failed: {}", e))
}

/// Import — 외부 JSON 파일을 읽어 검증 후 저장. 파일 stem = pipeline id.
/// 기본 동작: 같은 id 가 이미 있으면 덮어씀 (사용자 경고는 프론트에서).
#[tauri::command]
pub fn import_custom_pipeline(
    src_path: String,
    source: String,
    project_cwd: Option<String>,
) -> Result<CustomPipelineMeta, String> {
    let src = std::path::PathBuf::from(&src_path);
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid source path".to_string())?
        .to_string();
    let content = std::fs::read_to_string(&src).map_err(|e| format!("Read failed: {}", e))?;
    let head: PipelineFileHead =
        serde_json::from_str(&content).map_err(|e| format!("Invalid pipeline JSON: {}", e))?;
    let id = head.id.clone().unwrap_or_else(|| stem.clone());
    // id 재검증 (외부 파일 id 가 신뢰 불가)
    if id.contains("..") || id.contains('/') || id.contains('\\') {
        return Err(format!("Invalid pipeline id: {}", id));
    }
    // destination 경로 확정 후 쓰기
    let dest = resolve_pipeline_path(&id, &source, project_cwd.as_deref())?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Mkdir failed: {}", e))?;
    }
    std::fs::write(&dest, &content).map_err(|e| format!("Write failed: {}", e))?;

    Ok(CustomPipelineMeta {
        id: id.clone(),
        name: head.name.unwrap_or_else(|| id.clone()),
        description: head.description,
        source,
        phase_count: head.phases.as_ref().map(|p| p.len()).unwrap_or(0) as u32,
        updated_at: head.updated_at.unwrap_or_default(),
    })
}

/// ~/.claude/agents/*.md 스캔. 각 파일의 첫 라인 (# 헤더) 을 description 으로.
/// 내장 agent 는 프론트 `constants/agentRegistry.ts` 에 하드코딩되므로 여기서는 커스텀만.
#[tauri::command]
pub fn list_claude_agents() -> Vec<ClaudeAgent> {
    let mut out: Vec<ClaudeAgent> = Vec::new();
    let Some(home) = std::env::var_os("HOME") else {
        return out;
    };
    let agents_dir = std::path::Path::new(&home).join(".claude").join("agents");
    let Ok(entries) = std::fs::read_dir(&agents_dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        // 첫 라인을 description 으로 — 마크다운 # 헤더 제거
        let desc = std::fs::read_to_string(&path)
            .ok()
            .and_then(|c| c.lines().next().map(|l| l.trim_start_matches('#').trim().to_string()))
            .unwrap_or_default();
        out.push(ClaudeAgent {
            subagent_type: stem.to_string(),
            display_name: stem.to_string(),
            description: desc,
            file_path: path.to_string_lossy().to_string(),
        });
    }
    out
}

/// 특정 커스텀 agent 본문 읽기 (편집 UI 용).
#[tauri::command]
pub fn read_claude_agent(name: String) -> Result<String, String> {
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err(format!("Invalid agent name: {}", name));
    }
    let home = std::env::var_os("HOME").ok_or_else(|| "HOME not set".to_string())?;
    let path = std::path::Path::new(&home)
        .join(".claude")
        .join("agents")
        .join(format!("{}.md", name));
    std::fs::read_to_string(&path).map_err(|e| format!("Read failed: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_rejects_path_traversal() {
        let err = resolve_pipeline_path("../etc/passwd", "user", None);
        assert!(err.is_err());
        let err2 = resolve_pipeline_path("foo/bar", "user", None);
        assert!(err2.is_err());
    }

    #[test]
    fn resolve_rejects_invalid_source() {
        let err = resolve_pipeline_path("my-pipe", "cloud", None);
        assert!(err.is_err());
    }

    #[test]
    fn resolve_requires_cwd_for_project() {
        let err = resolve_pipeline_path("my-pipe", "project", None);
        assert!(err.is_err());
    }
}
