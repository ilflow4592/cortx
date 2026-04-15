//! 매니페스트 기반 기술 스택 감지.
//!
//! 파일 내용 파싱은 최소화 — 단순 `contains` 검사만 한다. 정확한 버전 추출은
//! Gradle 설정에서만 시도 (Java sourceCompatibility/jvmTarget).

use std::path::Path;

fn read_to_string_safe(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

/// 루트 매니페스트 파일을 스캔해 감지된 기술 스택 문자열 목록 반환.
pub fn detect_tech_stack(root: &Path) -> Vec<String> {
    let mut stack: Vec<String> = Vec::new();

    // package.json
    if let Some(content) = read_to_string_safe(&root.join("package.json")) {
        stack.push("Node.js".to_string());
        if content.contains("\"next\"") {
            stack.push("Next.js".to_string());
        } else if content.contains("\"react\"") {
            stack.push("React".to_string());
        }
        if content.contains("\"express\"") {
            stack.push("Express".to_string());
        }
        if content.contains("\"@nestjs/core\"") {
            stack.push("NestJS".to_string());
        }
        if content.contains("\"vue\"") {
            stack.push("Vue".to_string());
        }
        if content.contains("\"@tauri-apps/api\"") {
            stack.push("Tauri".to_string());
        }
        if content.contains("\"typescript\"") {
            stack.push("TypeScript".to_string());
        }
    }

    // Cargo.toml
    if let Some(content) = read_to_string_safe(&root.join("Cargo.toml")) {
        stack.push("Rust".to_string());
        if content.contains("tauri") {
            stack.push("Tauri".to_string());
        }
        if content.contains("axum") {
            stack.push("Axum".to_string());
        }
        if content.contains("actix") {
            stack.push("Actix".to_string());
        }
    }

    // go.mod
    if read_to_string_safe(&root.join("go.mod")).is_some() {
        stack.push("Go".to_string());
    }

    // Python
    if let Some(content) = read_to_string_safe(&root.join("pyproject.toml")) {
        stack.push("Python".to_string());
        if content.contains("fastapi") {
            stack.push("FastAPI".to_string());
        }
        if content.contains("django") {
            stack.push("Django".to_string());
        }
    } else if root.join("requirements.txt").exists() {
        stack.push("Python".to_string());
    }

    // Java / JVM
    let gradle_kts = root.join("build.gradle.kts");
    let gradle = root.join("build.gradle");
    let pom = root.join("pom.xml");
    if let Some(content) = read_to_string_safe(&gradle_kts).or_else(|| read_to_string_safe(&gradle))
    {
        stack.push("Java/Gradle".to_string());
        if let Some(ver) = extract_gradle_java_version(&content) {
            stack.push(format!("Java {}", ver));
        }
        if content.contains("spring-boot") {
            stack.push("Spring Boot".to_string());
        }
        if content.contains("queryDsl") || content.contains("querydsl") {
            stack.push("QueryDSL".to_string());
        }
    } else if let Some(content) = read_to_string_safe(&pom) {
        stack.push("Java/Maven".to_string());
        if content.contains("spring-boot") {
            stack.push("Spring Boot".to_string());
        }
    }

    // 중복 제거 (순서 유지)
    let mut seen: Vec<String> = Vec::new();
    for item in stack {
        if !seen.contains(&item) {
            seen.push(item);
        }
    }
    seen
}

fn extract_gradle_java_version(content: &str) -> Option<String> {
    for line in content.lines() {
        let l = line.trim();
        if let Some(rest) = l.strip_prefix("sourceCompatibility") {
            return Some(
                rest.trim_start_matches(['=', ' '])
                    .trim()
                    .trim_matches('"')
                    .to_string(),
            );
        }
        if l.starts_with("jvmTarget") {
            return Some(
                l.trim_start_matches("jvmTarget")
                    .trim_start_matches(['=', ' '])
                    .trim()
                    .trim_matches('"')
                    .to_string(),
            );
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_gradle_java_version_parses_source_compatibility() {
        let content = r#"sourceCompatibility = "17"
targetCompatibility = "17""#;
        assert_eq!(extract_gradle_java_version(content), Some("17".to_string()));
    }

    #[test]
    fn extract_gradle_java_version_parses_jvm_target() {
        let content = r#"kotlin {
    jvmTarget = "21"
}"#;
        assert_eq!(extract_gradle_java_version(content), Some("21".to_string()));
    }

    #[test]
    fn extract_gradle_java_version_returns_none_when_missing() {
        assert_eq!(extract_gradle_java_version("plugins {}"), None);
    }
}
