//! `project-context.md` 합성 — do_scan이 수집한 데이터를 Markdown 문서로 조립.
//!
//! 전략: CLAUDE.md / AGENTS.md 본문은 **embed 하지 않는다** (2026-04 결정).
//! 이유: Claude Code CLI 가 cwd 에서 CLAUDE.md 를 자동 로드하므로 embed 는
//! 중복 주입. 또 scan 시점 스냅샷이라 사용자가 CLAUDE.md 를 수정하면
//! project-context.md 의 embed 는 즉시 stale. 두 버전이 세션 내 공존해서
//! Claude 가 어느 쪽을 믿어야 할지 모호해지는 리스크 제거.
//!
//! 대신 metadata (등급/크기/SOT) 만 기록 — Claude 는 필요 시 Read 로 최신
//! 본문 조회. Fallback (파일 트리/언어 히스토그램) 은 docless 프로젝트에서
//! Claude 혼자 Glob 돌리는 걸 줄여주므로 유지.

use super::build_commands::compose_build_commands_section;
use super::grader::{grade_label, quality_label, DocEntry};
use super::{ProjectQuality, SotStatus, SCANNER_VERSION};

#[allow(clippy::too_many_arguments)]
pub fn compose_context_md(
    project_name: &str,
    scanned_at: &str,
    tech_stack: &[String],
    claude_md: &DocEntry,
    agents_md: &DocEntry,
    ai_docs: &[DocEntry],
    sot_doc: &Option<String>,
    sot_status: SotStatus,
    quality: ProjectQuality,
    used_fallback: bool,
    tree_entries: &[String],
    lang_hist: &[(String, u64)],
    readme_excerpt: &Option<String>,
) -> String {
    let mut out = String::new();
    out.push_str(&format!("# Project Context — {}\n", project_name));
    out.push_str(&format!(
        "_Generated: {} | Scanner: cortx v{}_\n\n",
        scanned_at, SCANNER_VERSION
    ));

    // Scan Quality 배너
    out.push_str("## Scan Quality\n");
    out.push_str(&format!("- Overall: **{}**\n", quality_label(quality)));
    match sot_status {
        SotStatus::Resolved => {
            if let Some(p) = sot_doc {
                out.push_str(&format!("- SOT: `{}`\n", p));
            }
        }
        SotStatus::ReferencedButEmpty => {
            out.push_str(&format!(
                "- ⚠️ SOT `{}`가 참조되었으나 비어있음 — dev-task가 질문해야 할 항목\n",
                sot_doc.clone().unwrap_or_else(|| "?".into())
            ));
        }
        SotStatus::None => {
            out.push_str("- SOT: 지정되지 않음\n");
        }
    }
    if used_fallback {
        out.push_str("- ⚠️ 규칙 문서 부족 — fallback (파일 트리/언어 통계)로 보완\n");
    }
    out.push('\n');

    // Tech Stack
    out.push_str("## Tech Stack\n");
    if tech_stack.is_empty() {
        out.push_str("_감지된 매니페스트 없음_\n");
    } else {
        for t in tech_stack {
            out.push_str(&format!("- {}\n", t));
        }
    }
    out.push('\n');

    // Build & Test Commands — tech_stack 기반 동적 생성
    out.push_str(&compose_build_commands_section(tech_stack));
    out.push('\n');

    // Rule Files (metadata)
    out.push_str("## Rule Files\n");
    out.push_str(&format!(
        "- `CLAUDE.md`: **{}** ({} bytes)\n",
        grade_label(claude_md.grade),
        claude_md.size_bytes
    ));
    out.push_str(&format!(
        "- `AGENTS.md`: **{}** ({} bytes)\n",
        grade_label(agents_md.grade),
        agents_md.size_bytes
    ));
    if !ai_docs.is_empty() {
        out.push_str("- `.ai/docs/`:\n");
        for d in ai_docs {
            out.push_str(&format!(
                "  - `{}` — {} ({} bytes)\n",
                d.path,
                grade_label(d.grade),
                d.size_bytes
            ));
        }
    }
    out.push('\n');

    // Rule 문서 본문은 embed 하지 않음 — Claude CLI 가 cwd 에서 자동 로드.
    // staleness + 중복 주입 리스크 제거. metadata 는 위 "Rule Files" 섹션에 이미 기록.

    // Fallback sections
    if used_fallback {
        if let Some(readme) = readme_excerpt {
            out.push_str("## README (excerpt)\n```\n");
            out.push_str(readme);
            out.push_str("\n```\n\n");
        }
        if !lang_hist.is_empty() {
            out.push_str("## Language Histogram (top 5 by file count)\n");
            for (ext, count) in lang_hist {
                out.push_str(&format!("- `.{}`: {}\n", ext, count));
            }
            out.push('\n');
        }
        if !tree_entries.is_empty() {
            out.push_str("## File Tree (depth 2)\n```\n");
            for e in tree_entries.iter().take(100) {
                out.push_str(e);
                out.push('\n');
            }
            out.push_str("```\n");
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::scan::grader::{DocEntry, DocGrade};
    use crate::commands::scan::{ProjectQuality, SotStatus};

    fn doc(grade: DocGrade, size: u64) -> DocEntry {
        DocEntry {
            path: "x".into(),
            grade,
            size_bytes: size,
            first_h1: None,
        }
    }

    #[test]
    fn rule_bodies_are_not_embedded() {
        // embed 제거 (2026-04): Claude CLI 가 cwd 에서 CLAUDE.md 자동 로드.
        // 중복 + staleness 리스크 제거.
        let claude = doc(DocGrade::Rich, 500);
        let agents = doc(DocGrade::Rich, 500);
        let out = compose_context_md(
            "proj",
            "2026-01-01T00:00:00Z",
            &[],
            &claude,
            &agents,
            &[],
            &None,
            SotStatus::None,
            ProjectQuality::Rich,
            false,
            &[],
            &[],
            &None,
        );
        // metadata 섹션은 유지
        assert!(out.contains("`CLAUDE.md`: **rich**"));
        assert!(out.contains("`AGENTS.md`: **rich**"));
        // full content 섹션은 제거됨
        assert!(!out.contains("## CLAUDE.md (full content)"));
        assert!(!out.contains("## AGENTS.md (full content)"));
    }

    #[test]
    fn fallback_includes_tree_and_histogram() {
        let claude = doc(DocGrade::Missing, 0);
        let agents = doc(DocGrade::Missing, 0);
        let out = compose_context_md(
            "p",
            "t",
            &["Node".into()],
            &claude,
            &agents,
            &[],
            &None,
            SotStatus::None,
            ProjectQuality::Sparse,
            true,
            &["src/index.ts".into(), "src/app.ts".into()],
            &[("ts".into(), 42)],
            &Some("# Readme\nsome text".into()),
        );
        assert!(out.contains("README (excerpt)"));
        assert!(out.contains("Language Histogram"));
        assert!(out.contains("File Tree"));
        assert!(out.contains("src/index.ts"));
    }
}
