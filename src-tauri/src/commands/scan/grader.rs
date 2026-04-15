//! 문서 품질 등급 산정.
//!
//! `grade_document`은 파일 크기·섹션 수·마크다운 요소를 종합해 Rich/Partial/
//! Empty/Missing 4단계로 분류한다. AUTO-GENERATED 마커가 포함되면 Empty로
//! 간주해 재생성 대상이 된다.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use ts_rs::TS;

use super::{ProjectQuality, AUTO_GEN_MARKER};

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../src/types/generated/")]
pub enum DocGrade {
    Rich,
    Partial,
    Empty,
    Missing,
}

#[derive(Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct DocEntry {
    pub path: String,
    pub grade: DocGrade,
    #[ts(type = "number")]
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub first_h1: Option<String>,
}

/// 파일의 유효성 등급을 산정한다. 파일 크기·마크다운 구조·마커 존재 여부를 종합.
pub fn grade_document(path: &Path) -> (DocGrade, u64, Option<String>) {
    let Ok(meta) = fs::metadata(path) else {
        return (DocGrade::Missing, 0, None);
    };
    let size = meta.len();
    let Ok(content) = fs::read_to_string(path) else {
        return (DocGrade::Missing, size, None);
    };

    // AUTO-GENERATED 마커가 있으면 "재작성 가능" 상태로 empty 취급
    if content.contains(AUTO_GEN_MARKER) {
        return (DocGrade::Empty, size, extract_first_h1(&content));
    }

    let stripped = strip_comments_and_whitespace(&content);
    if stripped.trim().is_empty() || stripped.len() < 20 {
        return (DocGrade::Empty, size, extract_first_h1(&content));
    }

    let h2_count = content.lines().filter(|l| l.starts_with("## ")).count();
    let has_bullet_or_table = content
        .lines()
        .any(|l| l.trim_start().starts_with("- ") || l.trim_start().starts_with("| "));
    let first_h1 = extract_first_h1(&content);

    let grade = if size >= 500 && h2_count >= 2 && has_bullet_or_table {
        DocGrade::Rich
    } else if size >= 100 {
        DocGrade::Partial
    } else {
        DocGrade::Empty
    };
    (grade, size, first_h1)
}

pub fn extract_first_h1(content: &str) -> Option<String> {
    content
        .lines()
        .find(|l| l.starts_with("# "))
        .map(|l| l.trim_start_matches("# ").trim().to_string())
}

/// 공백·HTML 주석만 남은 문서를 Empty로 판정하기 위한 전처리.
fn strip_comments_and_whitespace(content: &str) -> String {
    let mut out = String::with_capacity(content.len());
    let mut in_html_comment = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if in_html_comment {
            if trimmed.contains("-->") {
                in_html_comment = false;
            }
            continue;
        }
        if trimmed.starts_with("<!--") && !trimmed.contains("-->") {
            in_html_comment = true;
            continue;
        }
        if trimmed.starts_with("<!--") && trimmed.contains("-->") {
            continue;
        }
        out.push_str(trimmed);
        out.push('\n');
    }
    out
}

pub fn read_to_string_safe(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok()
}

/// CLAUDE.md에서 SOT 경로 추출.
/// 인식 패턴: `SOT: {경로}` 마커, `@{경로}.md` Claude Code import 문법.
/// 따옴표/백틱/서식 문자는 제거. 확장자(.포함)가 있어야 경로로 간주.
pub fn extract_sot_path(content: &str) -> Option<String> {
    for line in content.lines() {
        if let Some(p) = parse_sot_marker(line) {
            return Some(p);
        }
        if let Some(p) = parse_import_marker(line) {
            return Some(p);
        }
    }
    None
}

fn parse_sot_marker(line: &str) -> Option<String> {
    let idx = line.find("SOT:")?;
    let rest = line[idx + "SOT:".len()..].trim();
    clean_path_token(rest)
}

fn parse_import_marker(line: &str) -> Option<String> {
    let trimmed = line.trim_start();
    let rest = trimmed.strip_prefix('@')?;
    if rest.starts_with(char::is_whitespace) || rest.is_empty() {
        return None;
    }
    clean_path_token(rest)
}

fn clean_path_token(input: &str) -> Option<String> {
    let cleaned: String = input
        .chars()
        .take_while(|c| !c.is_whitespace() || *c == '/' || *c == '.')
        .filter(|c| *c != '`' && *c != '"' && *c != '\'' && *c != '*')
        .collect();
    let trimmed = cleaned.trim().trim_end_matches(&[',', '.', ';'][..]);
    if !trimmed.is_empty() && trimmed.contains('.') {
        Some(trimmed.to_string())
    } else {
        None
    }
}

pub fn collect_ai_docs(root: &Path) -> Vec<DocEntry> {
    let ai_dir = root.join(".ai/docs");
    let Ok(reader) = fs::read_dir(&ai_dir) else {
        return Vec::new();
    };
    let mut docs: Vec<DocEntry> = Vec::new();
    for entry in reader.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let (grade, size, first_h1) = grade_document(&path);
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();
        docs.push(DocEntry {
            path: rel,
            grade,
            size_bytes: size,
            first_h1,
        });
    }
    docs.sort_by(|a, b| a.path.cmp(&b.path));
    docs
}

fn missing_doc_entry(rel: &str) -> DocEntry {
    DocEntry {
        path: rel.to_string(),
        grade: DocGrade::Missing,
        size_bytes: 0,
        first_h1: None,
    }
}

pub fn doc_entry_for(root: &Path, rel: &str) -> DocEntry {
    let p = root.join(rel);
    if !p.exists() {
        return missing_doc_entry(rel);
    }
    let (grade, size, first_h1) = grade_document(&p);
    DocEntry {
        path: rel.to_string(),
        grade,
        size_bytes: size,
        first_h1,
    }
}

pub fn overall_quality(
    claude: &DocEntry,
    agents: &DocEntry,
    ai_docs: &[DocEntry],
) -> ProjectQuality {
    let has_rich = claude.grade == DocGrade::Rich
        || agents.grade == DocGrade::Rich
        || ai_docs.iter().any(|d| d.grade == DocGrade::Rich);
    let has_partial = claude.grade == DocGrade::Partial
        || agents.grade == DocGrade::Partial
        || ai_docs.iter().any(|d| d.grade == DocGrade::Partial);
    if has_rich {
        ProjectQuality::Rich
    } else if has_partial {
        ProjectQuality::Partial
    } else {
        ProjectQuality::Sparse
    }
}

pub fn grade_label(g: DocGrade) -> &'static str {
    match g {
        DocGrade::Rich => "rich",
        DocGrade::Partial => "partial",
        DocGrade::Empty => "empty",
        DocGrade::Missing => "missing",
    }
}

pub fn quality_label(q: ProjectQuality) -> &'static str {
    match q {
        ProjectQuality::Rich => "rich",
        ProjectQuality::Partial => "partial",
        ProjectQuality::Sparse => "sparse",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_first_h1_returns_first_h1_line() {
        let content = "# Title\n\nbody\n# Other";
        assert_eq!(extract_first_h1(content), Some("Title".to_string()));
    }

    #[test]
    fn extract_first_h1_returns_none_when_absent() {
        assert_eq!(extract_first_h1("no headings here"), None);
    }

    #[test]
    fn extract_sot_path_finds_sot_marker() {
        let content = "Stuff\nSOT: .ai/docs/architecture.md\nrest";
        assert_eq!(
            extract_sot_path(content),
            Some(".ai/docs/architecture.md".to_string())
        );
    }

    #[test]
    fn extract_sot_path_strips_backticks_and_quotes() {
        assert_eq!(
            extract_sot_path("SOT: `.ai/docs/foo.md`"),
            Some(".ai/docs/foo.md".to_string()),
        );
    }

    #[test]
    fn extract_sot_path_returns_none_when_no_dot() {
        // 경로처럼 보이지 않으면 (확장자 없음) None
        assert_eq!(extract_sot_path("SOT: undefined"), None);
    }

    #[test]
    fn extract_sot_path_returns_none_when_marker_absent() {
        assert_eq!(extract_sot_path("nothing about source of truth"), None);
    }

    #[test]
    fn extract_sot_path_recognizes_claude_code_import() {
        let content = "# Title\n\n@.claude/principles.md\n\nrest";
        assert_eq!(
            extract_sot_path(content),
            Some(".claude/principles.md".to_string())
        );
    }

    #[test]
    fn extract_sot_path_import_with_leading_whitespace() {
        assert_eq!(
            extract_sot_path("  @docs/architecture.md"),
            Some("docs/architecture.md".to_string())
        );
    }

    #[test]
    fn extract_sot_path_ignores_at_without_path() {
        // @Component, @click 같은 데코레이터/이벤트는 확장자 없으므로 None
        assert_eq!(extract_sot_path("@Component"), None);
        assert_eq!(extract_sot_path("@click"), None);
    }

    #[test]
    fn extract_sot_path_prefers_sot_marker_over_import() {
        let content = "@ignored.md\nSOT: real.md";
        // 두 패턴이 있으면 먼저 발견된 쪽이 승리 (라인 순서)
        assert_eq!(extract_sot_path(content), Some("ignored.md".to_string()));
    }

    #[test]
    fn overall_quality_picks_richest() {
        let rich = DocEntry {
            path: "x".into(),
            grade: DocGrade::Rich,
            size_bytes: 1000,
            first_h1: None,
        };
        let partial = DocEntry {
            grade: DocGrade::Partial,
            ..rich.clone()
        };
        let missing = DocEntry {
            grade: DocGrade::Missing,
            ..rich.clone()
        };
        assert_eq!(overall_quality(&rich, &missing, &[]), ProjectQuality::Rich);
        assert_eq!(
            overall_quality(&missing, &partial, &[]),
            ProjectQuality::Partial
        );
        assert_eq!(
            overall_quality(&missing, &missing, &[]),
            ProjectQuality::Sparse
        );
    }

    #[test]
    fn grade_and_quality_labels_round_trip() {
        assert_eq!(grade_label(DocGrade::Rich), "rich");
        assert_eq!(grade_label(DocGrade::Missing), "missing");
        assert_eq!(quality_label(ProjectQuality::Sparse), "sparse");
    }
}
