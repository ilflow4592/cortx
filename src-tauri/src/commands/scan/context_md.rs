//! `project-context.md` 합성 — do_scan이 수집한 데이터를 Markdown 문서로 조립.
//!
//! 전략: rich/partial 등급 문서는 본문을 통째로 임베드한다. 예전엔 특정 헤더
//! 키워드(`## 즉시 규칙` 등)만 뽑았지만, 팀마다 헤더 네이밍이 달라 rich
//! 문서에서 0건 추출되는 일이 잦았다 (ex. TOMS-server). 헤더 컨벤션을
//! 프로젝트에 강요하지 않기 위해 전체 본문을 포함하고, 다운스트림 파이프라인이
//! 필요한 부분만 골라 쓰도록 한다.

use super::grader::{grade_label, quality_label, DocEntry, DocGrade};
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
    claude_content: &Option<String>,
    agents_content: &Option<String>,
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

    // Embedded rule documents — 헤더 컨벤션 무관하게 본문을 통째로 포함
    append_embedded_doc(&mut out, "CLAUDE.md", claude_md.grade, claude_content);
    append_embedded_doc(&mut out, "AGENTS.md", agents_md.grade, agents_content);

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

fn append_embedded_doc(
    out: &mut String,
    name: &str,
    grade: DocGrade,
    content: &Option<String>,
) {
    if !matches!(grade, DocGrade::Rich | DocGrade::Partial) {
        return;
    }
    let Some(body) = content else {
        return;
    };
    out.push_str(&format!("## {} (full content)\n\n", name));
    out.push_str(body);
    if !body.ends_with('\n') {
        out.push('\n');
    }
    out.push('\n');
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
    fn rich_claude_md_is_embedded_verbatim() {
        let claude = doc(DocGrade::Rich, 500);
        let agents = doc(DocGrade::Missing, 0);
        let body = "# Proj\n## 필수 행동\n- 규칙1\n- 규칙2\n".to_string();
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
            &Some(body.clone()),
            &None,
            &[],
            &[],
            &None,
        );
        assert!(out.contains("## CLAUDE.md (full content)"));
        assert!(out.contains("필수 행동"));
        assert!(out.contains("- 규칙1"));
        assert!(out.contains("- 규칙2"));
    }

    #[test]
    fn partial_doc_is_also_embedded() {
        let claude = doc(DocGrade::Partial, 150);
        let agents = doc(DocGrade::Missing, 0);
        let body = "# P\nsmall body".to_string();
        let out = compose_context_md(
            "p",
            "t",
            &[],
            &claude,
            &agents,
            &[],
            &None,
            SotStatus::None,
            ProjectQuality::Partial,
            false,
            &Some(body),
            &None,
            &[],
            &[],
            &None,
        );
        assert!(out.contains("## CLAUDE.md (full content)"));
        assert!(out.contains("small body"));
    }

    #[test]
    fn empty_or_missing_doc_is_not_embedded() {
        let claude = doc(DocGrade::Empty, 30);
        let agents = doc(DocGrade::Missing, 0);
        let out = compose_context_md(
            "p",
            "t",
            &[],
            &claude,
            &agents,
            &[],
            &None,
            SotStatus::None,
            ProjectQuality::Sparse,
            true,
            &Some("noise".into()),
            &None,
            &[],
            &[],
            &None,
        );
        assert!(!out.contains("## CLAUDE.md (full content)"));
        assert!(!out.contains("## AGENTS.md (full content)"));
    }

    #[test]
    fn both_rule_docs_embedded_when_rich() {
        let claude = doc(DocGrade::Rich, 500);
        let agents = doc(DocGrade::Rich, 500);
        let out = compose_context_md(
            "p",
            "t",
            &[],
            &claude,
            &agents,
            &[],
            &None,
            SotStatus::None,
            ProjectQuality::Rich,
            false,
            &Some("claude body".into()),
            &Some("agents body".into()),
            &[],
            &[],
            &None,
        );
        assert!(out.contains("## CLAUDE.md (full content)"));
        assert!(out.contains("claude body"));
        assert!(out.contains("## AGENTS.md (full content)"));
        assert!(out.contains("agents body"));
    }

    #[test]
    fn toms_style_headers_embedded_without_keyword_match() {
        // TOMS-server 스타일: 헤더에 "즉시 규칙"/"task-type" 같은 키워드 없음
        let body = "# TOMS-server\n\n@.claude/principles.md\n\n\
            ## ⛔ AI 에이전트 필수 행동\n| 상황 | 조치 |\n|---|---|\n| 시작 | worktree |\n\n\
            ## 문서 맵\n| 질문 | 문서 |\n|---|---|\n| 아키텍처 | ARCHITECTURE.md |\n\n\
            ## 보호 파일\n- build.gradle\n"
            .to_string();
        let claude = doc(DocGrade::Rich, 500);
        let agents = doc(DocGrade::Missing, 0);
        let out = compose_context_md(
            "TOMS-server",
            "t",
            &[],
            &claude,
            &agents,
            &[],
            &None,
            SotStatus::None,
            ProjectQuality::Rich,
            false,
            &Some(body),
            &None,
            &[],
            &[],
            &None,
        );
        // 예전 로직은 이 헤더들을 0건 추출했음 — 이제 본문 통째로 포함됨
        assert!(out.contains("AI 에이전트 필수 행동"));
        assert!(out.contains("문서 맵"));
        assert!(out.contains("보호 파일"));
        assert!(out.contains("build.gradle"));
    }
}
