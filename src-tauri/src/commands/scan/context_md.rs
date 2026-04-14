//! `project-context.md` 합성 — do_scan이 수집한 데이터를 Markdown 문서로 조립.
//! Rule Files / Tech Stack / 추출 섹션 / Fallback(트리·언어·README)을 배너 순으로 렌더링.

use super::grader::{extract_section, grade_label, quality_label, DocEntry};
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

    // Rule Files
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

    // CLAUDE.md 추출 섹션 (grade >= partial 일 때만)
    if let Some(content) = claude_content {
        if let Some(table) = extract_section(
            content,
            &["작업 유형", "task-type", "task type", "트리거", "trigger"],
        ) {
            out.push_str("## Task-Type → Doc Mapping (from CLAUDE.md)\n");
            out.push_str(&table);
            out.push_str("\n\n");
        }
        if let Some(rules) = extract_section(content, &["즉시 규칙", "immediate rules"]) {
            out.push_str("## Immediate Rules (verbatim)\n");
            out.push_str(&rules);
            out.push_str("\n\n");
        }
        if let Some(pitfalls) = extract_section(
            content,
            &["반복 지적", "반복 지적 패턴", "common pitfalls", "금지 패턴"],
        ) {
            out.push_str("## Common Pitfalls (verbatim)\n");
            out.push_str(&pitfalls);
            out.push_str("\n\n");
        }
        if let Some(forbidden) = extract_section(content, &["금지 경로", "forbidden"]) {
            out.push_str("## Forbidden Paths\n");
            out.push_str(&forbidden);
            out.push_str("\n\n");
        }
    }

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
