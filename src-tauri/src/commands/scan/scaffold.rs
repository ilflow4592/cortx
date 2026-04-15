//! 규칙 문서 auto-fill 템플릿과 안전 쓰기 헬퍼.
//!
//! 핵심 안전장치: `safe_write`는 대상 파일이 이미 Rich/Partial이면 덮어쓰지 않는다.
//! Empty/Missing 등급만 템플릿으로 채우고, 모든 템플릿은 AUTO-GENERATED 마커를
//! 포함해 사용자가 롤백할 수 있게 한다.

use std::fs;
use std::path::Path;

use super::grader::{grade_document, DocGrade};
use super::{AUTO_GEN_MARKER, SCANNER_VERSION, SCAN_IGNORE_DIRS};

fn auto_gen_header(now: &str) -> String {
    format!(
        "{} v{} on {} — edit freely, remove marker when curated -->\n\n",
        AUTO_GEN_MARKER, SCANNER_VERSION, now
    )
}

pub fn scaffold_claude_md(
    project_name: &str,
    now: &str,
    tech_stack: &[String],
    modules: &[String],
) -> String {
    let mut s = auto_gen_header(now);
    s.push_str(&format!("# {} — 개발 규칙\n\n", project_name));
    s.push_str("## 즉시 규칙\n\n");
    s.push_str("- 커밋/PR 전 코드 컨벤션 확인\n");
    s.push_str("- 테스트 없이 상태 변경 로직 머지 금지\n");
    s.push_str("- `main`/`master` 직접 푸시 금지, 피처 브랜치 사용\n\n");

    if !tech_stack.is_empty() {
        s.push_str("## 기술 스택\n\n");
        for t in tech_stack {
            s.push_str(&format!("- {}\n", t));
        }
        s.push('\n');
    }

    if !modules.is_empty() {
        s.push_str("## 모듈\n\n");
        for m in modules {
            s.push_str(&format!("- `{}`\n", m));
        }
        s.push('\n');
    }

    s.push_str("## 작업 유형별 로드 규칙\n\n");
    s.push_str("| 트리거 | 로드 대상 | 비고 |\n");
    s.push_str("|---|---|---|\n");
    s.push_str("| 구현/리팩토링 | `.ai/docs/architecture.md` | SOT 문서 |\n");
    s.push_str("| 테스트 | `.ai/docs/test_guide.md` | 테스트 규칙 |\n");
    s.push_str("| 위에 해당 없음 | 없음 | CLAUDE.md만으로 답변 |\n\n");
    s.push_str("> SOT: `.ai/docs/architecture.md`\n\n");

    s.push_str("## 반복 지적 패턴\n\n");
    s.push_str(
        "<!-- TODO: PR 리뷰 기록에서 추출. `/pipeline:dev-task` 중 Claude가 보강 가능 -->\n",
    );
    s
}

pub fn scaffold_architecture_md(
    project_name: &str,
    now: &str,
    tech_stack: &[String],
    modules: &[String],
) -> String {
    let mut s = auto_gen_header(now);
    s.push_str(&format!("# {} Architecture (초안)\n\n", project_name));
    s.push_str("## 모듈 (디렉토리 감지 기반)\n\n");
    if modules.is_empty() {
        s.push_str("<!-- TODO: 모듈 트리가 비어있음. 수동으로 채워주세요 -->\n\n");
    } else {
        for m in modules {
            s.push_str(&format!("- `{}`\n", m));
        }
        s.push('\n');
    }
    s.push_str("## Tech Stack (매니페스트 파싱)\n\n");
    for t in tech_stack {
        s.push_str(&format!("- {}\n", t));
    }
    s.push('\n');
    s.push_str("## 도메인 용어\n\n");
    s.push_str("<!-- TODO: 패키지 이름/엔티티에서 추출 예정 -->\n\n");
    s.push_str("## 금지 패턴\n\n");
    s.push_str("<!-- CLAUDE.md의 \"반복 지적 패턴\" 참고 -->\n");
    s
}

/// 최상위 디렉토리 중 "모듈" 후보 이름을 추출 (camelCase dir, 소스 포함 등).
pub fn detect_modules(root: &Path) -> Vec<String> {
    let Ok(reader) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut mods: Vec<String> = Vec::new();
    for entry in reader.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if SCAN_IGNORE_DIRS.contains(&name.as_str()) {
            continue;
        }
        if matches!(
            name.as_str(),
            "src" | "tests" | "test" | "docs" | "examples"
        ) {
            continue;
        }
        mods.push(name);
    }
    mods.sort();
    mods
}

/// 파일 쓰기 — 대상이 존재할 경우 grade가 Empty/Missing일 때만 덮어씀.
/// Auto-fill 안전 규칙의 최종 gate.
pub fn safe_write(path: &Path, content: &str) -> std::io::Result<bool> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    if path.exists() {
        let (grade, _, _) = grade_document(path);
        if grade != DocGrade::Empty && grade != DocGrade::Missing {
            return Ok(false);
        }
    }
    fs::write(path, content)?;
    Ok(true)
}
