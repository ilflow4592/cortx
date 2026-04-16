//! Cortx 바이너리에 내장된 pipeline 스킬.
//!
//! `.claude/commands/pipeline/*.md` 를 `include_str!` 로 컴파일 타임에 임베드한다.
//! `/pipeline:*` 커맨드는 **항상 내장 버전을 우선 사용**하도록 설계.
//! 이유: 프로젝트 로컬(`{cwd}/.claude/commands/pipeline/`)이나 글로벌
//! (`~/.claude/commands/pipeline/`)에 오래된 스킬이 있어도 Cortx 앱이 기대하는
//! 동작(마커, 브랜치 규칙, save phase 등)을 보장하기 위함.
//!
//! `/git:*`, `/sc:*` 등 다른 스킬은 기존 경로 해석을 따른다.

const DEV_TASK: &str = include_str!("../../../../.claude/commands/pipeline/dev-task.md");
const DEV_IMPLEMENT: &str = include_str!("../../../../.claude/commands/pipeline/dev-implement.md");
const DEV_REVIEW_LOOP: &str = include_str!("../../../../.claude/commands/pipeline/dev-review-loop.md");
const DEV_RESUME: &str = include_str!("../../../../.claude/commands/pipeline/dev-resume.md");
const PR_REVIEW_FU: &str = include_str!("../../../../.claude/commands/pipeline/pr-review-fu.md");

/// 내장 pipeline 스킬 조회. `name`은 `pipeline/dev-task` 같은 slash-separated key.
/// 내장 스킬이 없으면 `None` 반환 → 호출자가 파일 시스템 fallback 진행.
#[tauri::command]
pub fn get_builtin_pipeline_skill(name: String) -> Option<String> {
    match name.as_str() {
        "pipeline/dev-task" => Some(DEV_TASK.to_string()),
        "pipeline/dev-implement" => Some(DEV_IMPLEMENT.to_string()),
        "pipeline/dev-review-loop" => Some(DEV_REVIEW_LOOP.to_string()),
        "pipeline/dev-resume" => Some(DEV_RESUME.to_string()),
        "pipeline/pr-review-fu" => Some(PR_REVIEW_FU.to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_task_is_embedded_non_empty() {
        let content = get_builtin_pipeline_skill("pipeline/dev-task".to_string())
            .expect("dev-task should be embedded");
        assert!(content.len() > 500, "dev-task.md too short — include_str! may be failing");
        assert!(content.contains("Grill-me"));
    }

    #[test]
    fn dev_implement_is_embedded() {
        let content = get_builtin_pipeline_skill("pipeline/dev-implement".to_string())
            .expect("dev-implement should be embedded");
        assert!(content.contains("dev-implement"));
        // 새 버전 검증: 브랜치 생성이 아닌 확인만 해야 함
        assert!(content.contains("브랜치 확인"));
        assert!(!content.contains("git checkout -b feat/{TASK_ID}"));
    }

    #[test]
    fn unknown_skill_returns_none() {
        assert!(get_builtin_pipeline_skill("pipeline/unknown".to_string()).is_none());
        assert!(get_builtin_pipeline_skill("git/commit".to_string()).is_none());
    }
}
