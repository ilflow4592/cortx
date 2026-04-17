//! Cortx 바이너리에 내장된 커스텀 파이프라인 템플릿.
//!
//! `.cortx/pipelines/*.json` (project) / `~/.cortx/pipelines/*.json` (user) 와 별개로,
//! 어느 프로젝트에서든 드롭다운에 `[builtin]` 으로 표시되는 읽기 전용 템플릿.
//! 사용자는 **Duplicate** 로 project 로 복사한 후 자유롭게 편집.
//!
//! 변경 시 `.cortx/pipelines/default-dev.json` 동기화 (include_str! 경로).

pub const DEFAULT_DEV: &str = include_str!("../../../../.cortx/pipelines/default-dev.json");

/// 각 내장 템플릿 엔트리 — (id, name, description, phase_count, body)
pub struct BuiltinPipelineEntry {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub phase_count: u32,
    pub body: &'static str,
}

pub const BUILTIN_PIPELINES: &[BuiltinPipelineEntry] = &[BuiltinPipelineEntry {
    id: "default-dev",
    name: "개발 (기본)",
    description: "Cortx 내장 7단계 파이프라인을 커스텀 형식으로 복사한 기본 템플릿. 'Duplicate' 로 복사 후 자유롭게 편집하세요.",
    phase_count: 5,
    body: DEFAULT_DEV,
}];

/// id → embedded body 조회.
pub fn get_builtin_pipeline(id: &str) -> Option<&'static str> {
    BUILTIN_PIPELINES.iter().find(|p| p.id == id).map(|p| p.body)
}
