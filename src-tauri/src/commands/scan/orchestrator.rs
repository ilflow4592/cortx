//! Project scan orchestrator — rule docs grading, tech stack detection, auto-fill,
//! context file composition 전체 파이프라인을 실행한다.

use std::fs;
use std::path::PathBuf;

use super::context_md::compose_context_md;
use super::fallback::{collect_file_tree, collect_language_histogram};
use super::grader::{
    collect_ai_docs, doc_entry_for, extract_sot_path, overall_quality, read_to_string_safe,
    DocGrade,
};
use super::scaffold::{detect_modules, safe_write, scaffold_architecture_md, scaffold_claude_md};
use super::tech_stack::detect_tech_stack;
use super::time_utils::iso_now;
use super::{ProjectMetadata, ProjectQuality, SotStatus, CONTEXT_FILE_REL, SCANNER_VERSION};

pub fn do_scan(
    project_name: &str,
    project_path: &str,
    auto_fill: bool,
) -> Result<ProjectMetadata, String> {
    let root = PathBuf::from(project_path);
    if !root.is_dir() {
        return Err(format!("path is not a directory: {}", project_path));
    }

    let scanned_at = iso_now();

    // 1) Rule docs
    let claude_md = doc_entry_for(&root, "CLAUDE.md");
    let agents_md = doc_entry_for(&root, "AGENTS.md");
    let ai_docs = collect_ai_docs(&root);

    // 2) Parse CLAUDE.md if partial+
    let claude_content =
        if claude_md.grade == DocGrade::Rich || claude_md.grade == DocGrade::Partial {
            read_to_string_safe(&root.join("CLAUDE.md"))
        } else {
            None
        };
    let sot_doc_raw = claude_content.as_ref().and_then(|c| extract_sot_path(c));

    // 3) Tech stack
    let tech_stack = detect_tech_stack(&root);
    let modules = detect_modules(&root);

    // 4) Quality + SOT resolution
    let quality = overall_quality(&claude_md, &agents_md, &ai_docs);
    let used_fallback = matches!(quality, ProjectQuality::Sparse);

    let (sot_doc, sot_status) = if let Some(p) = sot_doc_raw.clone() {
        let entry = doc_entry_for(&root, &p);
        match entry.grade {
            DocGrade::Rich | DocGrade::Partial => (Some(p), SotStatus::Resolved),
            _ => (Some(p), SotStatus::ReferencedButEmpty),
        }
    } else {
        (None, SotStatus::None)
    };

    // 5) Fallback data
    let (tree_entries, total_files) = if used_fallback {
        let (entries, count) = collect_file_tree(&root, 2);
        (entries, Some(count))
    } else {
        (Vec::new(), None)
    };
    let lang_hist = if used_fallback {
        collect_language_histogram(&root)
    } else {
        Vec::new()
    };
    let readme_excerpt = read_to_string_safe(&root.join("README.md"))
        .map(|c| c.lines().take(50).collect::<Vec<_>>().join("\n"));

    // 6) Auto-fill (before composing context, so new files are reflected)
    let mut auto_generated_files: Vec<String> = Vec::new();
    if auto_fill {
        let claude_path = root.join("CLAUDE.md");
        if matches!(claude_md.grade, DocGrade::Missing | DocGrade::Empty) {
            let content = scaffold_claude_md(project_name, &scanned_at, &tech_stack, &modules);
            if safe_write(&claude_path, &content).unwrap_or(false) {
                auto_generated_files.push("CLAUDE.md".to_string());
            }
        }

        // SOT 참조가 있으나 empty/missing인 경우 초안 생성
        if matches!(sot_status, SotStatus::ReferencedButEmpty) {
            if let Some(ref rel) = sot_doc {
                let sot_path = root.join(rel);
                let content =
                    scaffold_architecture_md(project_name, &scanned_at, &tech_stack, &modules);
                if safe_write(&sot_path, &content).unwrap_or(false) {
                    auto_generated_files.push(rel.clone());
                }
            }
        }
    }

    // 7) Re-grade after auto-fill (files may have been created)
    let claude_md_final = doc_entry_for(&root, "CLAUDE.md");
    let agents_md_final = doc_entry_for(&root, "AGENTS.md");
    let ai_docs_final = collect_ai_docs(&root);
    let claude_content_final = if claude_md_final.grade != DocGrade::Missing {
        read_to_string_safe(&root.join("CLAUDE.md"))
    } else {
        None
    };
    let quality_final = overall_quality(&claude_md_final, &agents_md_final, &ai_docs_final);
    let used_fallback_final = matches!(quality_final, ProjectQuality::Sparse);

    // 8) Compose context file
    let context = compose_context_md(
        project_name,
        &scanned_at,
        &tech_stack,
        &claude_md_final,
        &agents_md_final,
        &ai_docs_final,
        &sot_doc,
        sot_status,
        quality_final,
        used_fallback_final,
        &claude_content_final,
        &tree_entries,
        &lang_hist,
        &readme_excerpt,
    );

    let context_path = root.join(CONTEXT_FILE_REL);
    if let Some(parent) = context_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create .cortx/: {}", e))?;
    }
    fs::write(&context_path, &context).map_err(|e| format!("write context file: {}", e))?;

    Ok(ProjectMetadata {
        scanned_at,
        scanner_version: SCANNER_VERSION,
        tech_stack,
        claude_md: claude_md_final,
        agents_md: agents_md_final,
        ai_docs: ai_docs_final,
        sot_doc,
        sot_status,
        context_file_path: CONTEXT_FILE_REL.to_string(),
        used_fallback: used_fallback_final,
        file_count: total_files,
        overall_quality: quality_final,
        auto_generated_files,
        auto_fill_enabled: auto_fill,
    })
}
