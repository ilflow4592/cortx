//! `## Build & Test Commands` 섹션 합성.
//!
//! `tech_stack::detect_tech_stack`의 출력(예: "Java/Gradle", "Node.js")을 받아
//! 프로젝트 타입별 build/test 명령 가이드를 Markdown으로 조립한다.
//!
//! 이 섹션은 project-context.md의 Tech Stack 다음에 삽입되며,
//! dev-implement 스킬이 이 섹션을 참조해 하드코딩 없이 올바른 명령을 쓰게 한다.
//!
//! 원칙: 명령 라인은 **참고용**이다. 복잡한 프로젝트는 CLAUDE.md에서
//! 정확한 명령을 덮어쓰도록 유도한다.

/// tech_stack 항목에서 어떤 빌드 시스템이 감지됐는지 판정하고,
/// 각 시스템에 해당하는 Build/Test 명령 섹션을 Markdown 문자열로 반환.
///
/// 감지 안 된 경우 안내 메시지만 포함 (언어 보편적 fallback).
pub fn compose_build_commands_section(tech_stack: &[String]) -> String {
    let systems = detect_build_systems(tech_stack);

    let mut out = String::from("## Build & Test Commands\n\n");

    if systems.is_empty() {
        out.push_str(
            "_감지된 빌드 시스템 없음_ — 프로젝트에 맞는 빌드/테스트 명령을 \
             CLAUDE.md 또는 README에 기록해 두시면 파이프라인이 자동으로 사용합니다.\n",
        );
        return out;
    }

    out.push_str(
        "파이프라인 스킬(`/pipeline:dev-implement` 등)은 아래 명령을 기본값으로 사용합니다.\n\
         프로젝트 실제 명령이 다르면 CLAUDE.md에 `## Build & Test Commands` 섹션을 두어 덮어쓰세요.\n\n",
    );

    for sys in &systems {
        out.push_str(&format_system_block(*sys));
        out.push('\n');
    }

    out
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BuildSystem {
    Gradle,
    Maven,
    Npm,
    Python,
    Cargo,
    Go,
}

/// tech_stack 문자열에서 빌드 시스템 추론. 중복 없는 순서 유지.
fn detect_build_systems(tech_stack: &[String]) -> Vec<BuildSystem> {
    let mut out = Vec::new();
    let has = |k: &str| tech_stack.iter().any(|s| s.eq_ignore_ascii_case(k));
    let has_prefix = |p: &str| {
        tech_stack
            .iter()
            .any(|s| s.to_ascii_lowercase().starts_with(&p.to_ascii_lowercase()))
    };

    if tech_stack.iter().any(|s| s.contains("Gradle")) {
        out.push(BuildSystem::Gradle);
    }
    if tech_stack.iter().any(|s| s.contains("Maven")) {
        out.push(BuildSystem::Maven);
    }
    // Node.js 계열 (Next/React/NestJS 등은 Node.js와 동반)
    if has("Node.js") {
        out.push(BuildSystem::Npm);
    }
    if has("Python") || has_prefix("Python") {
        out.push(BuildSystem::Python);
    }
    if has("Rust") {
        out.push(BuildSystem::Cargo);
    }
    if has("Go") {
        out.push(BuildSystem::Go);
    }
    out
}

fn format_system_block(sys: BuildSystem) -> String {
    match sys {
        BuildSystem::Gradle => String::from(
            "### Gradle (Java/Kotlin)\n\
             - Build: `./gradlew compileJava` (Kotlin: `./gradlew compileKotlin`)\n\
             - Test (all): `./gradlew test`\n\
             - Test (module): `./gradlew :{module}:test --tests \"{TestClass}\"`\n\
             - 모듈 결정: `settings.gradle` 또는 `settings.gradle.kts`에서 실제 변경 파일이 속한 모듈 이름 사용. 추측 금지.\n",
        ),
        BuildSystem::Maven => String::from(
            "### Maven (Java)\n\
             - Build: `mvn compile`\n\
             - Test (all): `mvn test`\n\
             - Test (class): `mvn test -Dtest={TestClass}`\n",
        ),
        BuildSystem::Npm => String::from(
            "### Node.js (npm)\n\
             - Build: `npm run build` (package.json `scripts`에 정의된 경우)\n\
             - Test: `npm test` 또는 `npm run test`\n\
             - Test (single file): `npx vitest run {path}` (vitest) / `npx jest {path}` (jest) / `npx playwright test {path}`\n\
             - Typecheck: `npx tsc --noEmit`\n\
             - Lint: `npm run lint`\n",
        ),
        BuildSystem::Python => String::from(
            "### Python\n\
             - Build: _(해석형 — 별도 빌드 없음)_\n\
             - Test (all): `pytest`\n\
             - Test (file): `pytest {path}`\n\
             - Test (class/method): `pytest {path}::{Class}::{method}`\n",
        ),
        BuildSystem::Cargo => String::from(
            "### Rust (cargo)\n\
             - Build: `cargo build`\n\
             - Test (all): `cargo test`\n\
             - Test (name filter): `cargo test {name}`\n\
             - Lint: `cargo clippy -- -D warnings`\n",
        ),
        BuildSystem::Go => String::from(
            "### Go\n\
             - Build: `go build ./...`\n\
             - Test (all): `go test ./...`\n\
             - Test (package): `go test ./{pkg}`\n\
             - Test (name filter): `go test -run {TestName} ./{pkg}`\n",
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stack(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn no_detected_systems_shows_fallback_message() {
        let out = compose_build_commands_section(&[]);
        assert!(out.contains("## Build & Test Commands"));
        assert!(out.contains("감지된 빌드 시스템 없음"));
    }

    #[test]
    fn gradle_block_includes_gradlew_commands() {
        let out = compose_build_commands_section(&stack(&["Java/Gradle", "Spring Boot"]));
        assert!(out.contains("./gradlew compileJava"));
        assert!(out.contains("./gradlew :{module}:test"));
    }

    #[test]
    fn maven_block() {
        let out = compose_build_commands_section(&stack(&["Java/Maven"]));
        assert!(out.contains("mvn compile"));
        assert!(out.contains("mvn test -Dtest={TestClass}"));
    }

    #[test]
    fn npm_block_for_nodejs() {
        let out = compose_build_commands_section(&stack(&["Node.js", "React", "TypeScript"]));
        assert!(out.contains("npm run build"));
        assert!(out.contains("npx tsc --noEmit"));
    }

    #[test]
    fn cargo_block_for_rust() {
        let out = compose_build_commands_section(&stack(&["Rust"]));
        assert!(out.contains("cargo build"));
        assert!(out.contains("cargo test"));
    }

    #[test]
    fn python_block() {
        let out = compose_build_commands_section(&stack(&["Python", "FastAPI"]));
        assert!(out.contains("pytest"));
        assert!(!out.contains("mvn"));
    }

    #[test]
    fn go_block() {
        let out = compose_build_commands_section(&stack(&["Go"]));
        assert!(out.contains("go build ./..."));
        assert!(out.contains("go test ./..."));
    }

    #[test]
    fn mixed_stack_includes_multiple_systems() {
        // Tauri 앱: Node + Rust 같이 있음
        let out = compose_build_commands_section(&stack(&["Node.js", "Tauri", "Rust"]));
        assert!(out.contains("### Node.js"));
        assert!(out.contains("### Rust"));
    }

    #[test]
    fn gradle_and_maven_coexist() {
        let out = compose_build_commands_section(&stack(&["Java/Gradle", "Java/Maven"]));
        assert!(out.contains("### Gradle"));
        assert!(out.contains("### Maven"));
    }

    #[test]
    fn detect_build_systems_returns_empty_when_unknown() {
        let result = detect_build_systems(&stack(&["Unknown", "Cobol"]));
        assert!(result.is_empty());
    }

    #[test]
    fn detect_build_systems_order_preserved() {
        let systems = detect_build_systems(&stack(&["Java/Gradle", "Node.js", "Rust"]));
        assert_eq!(systems, vec![BuildSystem::Gradle, BuildSystem::Npm, BuildSystem::Cargo]);
    }
}
