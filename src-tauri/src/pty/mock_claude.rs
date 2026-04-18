//! E2E mock mode — `CORTX_E2E=1` 일 때 `claude` CLI spawn 을 건너뛰고
//! 결정적인(scripted) stream-json 이벤트 시퀀스를 emit 한다.
//!
//! 목적:
//! - Playwright E2E 가 실제 Claude API 를 호출하지 않아도 full workflow 재현
//! - 비용 / latency / non-determinism 제거
//! - 내장 파이프라인의 phase 전환 마커도 시뮬레이션
//!
//! 활성화: 앱 실행 시 `CORTX_E2E=1` 환경변수. 런타임 토글은 없음 (의도적으로
//! 프로덕션 빌드와 혼용되지 않도록 환경 분리).
//!
//! 미지원 (의도): plan mode ExitPlanMode 시뮬레이션, MCP tool_use 이벤트.
//! 이런 경로는 실제 Claude CLI 가 필요해 E2E 스코프에서 제외.

use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// `CORTX_E2E` 가 설정돼 있는지 확인. `1` 또는 `true` 허용.
pub fn is_enabled() -> bool {
    match std::env::var("CORTX_E2E") {
        Ok(v) => matches!(v.as_str(), "1" | "true" | "TRUE" | "yes"),
        Err(_) => false,
    }
}

/// 스크립트된 stream-json 시퀀스를 emit 한다.
///
/// 이 함수는 spawn_claude 의 worker 스레드에서 호출되어 `spawn_and_stream` 을
/// 대체한다. claude-data / claude-done 이벤트는 동일한 형식으로 emit 되므로
/// 프론트엔드는 실제 CLI 와 구분할 수 없다.
///
/// 동작:
/// - `system` init 이벤트 (session_id: "cortx-e2e-{event_id}")
/// - 입력 메시지 기반 분기:
///   - `/pipeline:dev-task` 포함 → grill_me phase 마커 + Q1 샘플 질문
///   - 그 외 → 일반 에코 응답
/// - `result` 이벤트 (0 토큰)
/// - `claude-done` 종료
pub fn run_mock_stream(event_id: &str, message: &str, app: &AppHandle) {
    let emit = |payload: &str| {
        let _ = app.emit(&format!("claude-data-{}", event_id), payload.to_string());
    };

    // 1) system init — session_id 를 sessionCache 에 저장하도록
    let session_id = format!("cortx-e2e-{}", event_id);
    emit(&format!(
        r#"{{"type":"system","subtype":"init","session_id":"{}"}}"#,
        session_id
    ));
    thread::sleep(Duration::from_millis(30));

    // 2) assistant — 입력 기반 분기
    let mock_text = generate_mock_response(message);
    let escaped = escape_json_string(&mock_text);
    emit(&format!(
        r#"{{"type":"assistant","message":{{"content":[{{"type":"text","text":"{}"}}]}}}}"#,
        escaped
    ));
    thread::sleep(Duration::from_millis(30));

    // 3) result — 0 토큰 / $0
    emit(r#"{"type":"result","result":"mock","usage":{"input_tokens":0,"output_tokens":0},"total_cost_usd":0.0}"#);

    // 4) done
    let _ = app.emit(&format!("claude-done-{}", event_id), ());
}

fn generate_mock_response(message: &str) -> String {
    if message.contains("/pipeline:dev-task") {
        [
            "[PIPELINE:grill_me:in_progress]",
            "",
            "[E2E MOCK] dev-task 파이프라인 시작.",
            "",
            "Q1. 사용자 인증 방식으로 OAuth vs 이메일/비밀번호 중 어느 쪽인가요?",
        ]
        .join("\n")
    } else if message.contains("/pipeline:dev-implement") {
        [
            "[PIPELINE:dev_plan:in_progress]",
            "",
            "[E2E MOCK] 개발 계획서:",
            "1. 파일 A 수정",
            "2. 파일 B 추가",
            "",
            "계획대로 진행할까요? (y/수정사항)",
        ]
        .join("\n")
    } else {
        format!("[E2E MOCK] 입력 받음: {}", truncate(message, 80))
    }
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(n).collect();
        format!("{}…", truncated)
    }
}

fn escape_json_string(s: &str) -> String {
    s.replace('\\', r"\\")
        .replace('"', r#"\""#)
        .replace('\n', r"\n")
        .replace('\r', r"\r")
        .replace('\t', r"\t")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_mock_response_dev_task_branch() {
        let r = generate_mock_response("/pipeline:dev-task BE-123 feat");
        assert!(r.contains("[PIPELINE:grill_me:in_progress]"));
        assert!(r.contains("Q1."));
    }

    #[test]
    fn generate_mock_response_dev_implement_branch() {
        let r = generate_mock_response("/pipeline:dev-implement BE-123 feat");
        assert!(r.contains("[PIPELINE:dev_plan:in_progress]"));
        assert!(r.contains("계획대로 진행할까요?"));
    }

    #[test]
    fn generate_mock_response_echo() {
        let r = generate_mock_response("hello world");
        assert!(r.contains("[E2E MOCK]"));
        assert!(r.contains("hello world"));
    }

    #[test]
    fn escape_json_string_handles_quotes_newlines() {
        assert_eq!(escape_json_string(r#"a"b"#), r#"a\"b"#);
        assert_eq!(escape_json_string("a\nb"), r"a\nb");
        assert_eq!(escape_json_string(r"a\b"), r"a\\b");
    }

    #[test]
    fn truncate_preserves_short() {
        assert_eq!(truncate("hi", 10), "hi");
    }

    #[test]
    fn truncate_cuts_long() {
        let s = "a".repeat(100);
        let r = truncate(&s, 10);
        assert_eq!(r.chars().count(), 11); // 10 chars + ellipsis
        assert!(r.ends_with('…'));
    }

    #[test]
    fn is_enabled_false_when_unset() {
        // 테스트 격리를 위해 임시 값 확인만 수행 (env 건드리지 않음).
        // 이 테스트가 돌 때 CORTX_E2E 미설정 상태를 가정.
        if std::env::var("CORTX_E2E").is_err() {
            assert!(!is_enabled());
        }
    }
}
