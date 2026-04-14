//! 문서 품질 등급 산정.
//!
//! `grade_document`은 파일 크기·섹션 수·마크다운 요소를 종합해 Rich/Partial/
//! Empty/Missing 4단계로 분류한다. AUTO-GENERATED 마커가 포함되면 Empty로
//! 간주해 재생성 대상이 된다.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use super::{ProjectQuality, AUTO_GEN_MARKER};

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DocGrade {
    Rich,
    Partial,
    Empty,
    Missing,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocEntry {
    pub path: String,
    pub grade: DocGrade,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
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
    let has_bullet_or_table =
        content.lines().any(|l| l.trim_start().starts_with("- ") || l.trim_start().starts_with("| "));
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

/// CLAUDE.md 류 문서에서 "## 섹션_이름" 블록을 통째로 추출. 다음 `## ` 헤더
/// 또는 파일 끝까지를 반환.
pub fn extract_section(content: &str, headings: &[&str]) -> Option<String> {
    let lines: Vec<&str> = content.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        if !line.starts_with("## ") {
            continue;
        }
        let title = line.trim_start_matches("## ").trim().to_lowercase();
        let matched = headings.iter().any(|h| title.contains(&h.to_lowercase()));
        if !matched {
            continue;
        }
        let mut out = String::new();
        for next in &lines[i + 1..] {
            if next.starts_with("## ") {
                break;
            }
            out.push_str(next);
            out.push('\n');
        }
        let trimmed = out.trim().to_string();
        if trimmed.is_empty() {
            return None;
        }
        return Some(trimmed);
    }
    None
}

/// CLAUDE.md에서 `SOT: {경로}` 패턴을 찾아 경로 반환 (따옴표/백틱 제거).
pub fn extract_sot_path(content: &str) -> Option<String> {
    for line in content.lines() {
        if let Some(idx) = line.find("SOT:") {
            let rest = line[idx + "SOT:".len()..].trim();
            let cleaned: String = rest
                .chars()
                .take_while(|c| !c.is_whitespace() || *c == '/' || *c == '.')
                .filter(|c| *c != '`' && *c != '"' && *c != '\'' && *c != '*')
                .collect();
            let trimmed = cleaned.trim().trim_end_matches(&[',', '.', ';'][..]);
            if !trimmed.is_empty() && trimmed.contains('.') {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

pub fn collect_ai_docs(root: &Path) -> Vec<DocEntry> {
    let ai_dir = root.join(".ai/docs");
    let Ok(reader) = fs::read_dir(&ai_dir) else { return Vec::new() };
    let mut docs: Vec<DocEntry> = Vec::new();
    for entry in reader.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let (grade, size, first_h1) = grade_document(&path);
        let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().to_string();
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

pub fn overall_quality(claude: &DocEntry, agents: &DocEntry, ai_docs: &[DocEntry]) -> ProjectQuality {
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
