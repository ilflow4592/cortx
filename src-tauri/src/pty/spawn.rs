use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// Claude CLI 자식 프로세스를 실행하고 stdout을 라인 단위로 스트리밍.
/// stderr는 별도 스레드로 수거해 프로세스 종료 시 에러 이벤트로 방출.
///
/// Unix 에서는 자식을 **자기 자신이 leader 인 새 process group** 으로 분리한다.
/// 이렇게 해야 이후 `killpg(child_pid)` 가 Claude CLI + MCP subprocess 전체를
/// 묶어 종료할 수 있다. 그렇지 않으면 SIGTERM 이 Claude 에만 전달되고 MCP 가
/// orphan 으로 남아 stdio/socket 점유를 유지 → 다음 spawn 의 첫 tool 호출이
/// hang 되는 재현 케이스 존재.
///
/// `extra_env` 는 자식 프로세스에 주입할 추가 환경변수. 예: BASH_DEFAULT_TIMEOUT_MS
/// 로 Claude CLI 의 Bash tool 기본 타임아웃 단축 (runaway find/grep 차단).
pub fn spawn_and_stream(
    cwd: &str,
    cmd: &str,
    event_id: &str,
    app: &AppHandle,
    pid_holder: Arc<Mutex<Option<u32>>>,
    extra_env: &[(String, String)],
) -> Result<(), String> {
    #[cfg(unix)]
    let child = {
        use std::os::unix::process::CommandExt;
        let mut builder = std::process::Command::new("zsh");
        builder
            .args(["-l", "-c", cmd])
            .current_dir(cwd)
            .env("TERM", "dumb")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .process_group(0);
        for (k, v) in extra_env {
            builder.env(k, v);
        }
        builder.spawn()
    };
    #[cfg(windows)]
    let child = {
        let mut builder = std::process::Command::new("cmd");
        builder
            .args(["/C", cmd])
            .current_dir(cwd)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        for (k, v) in extra_env {
            builder.env(k, v);
        }
        builder.spawn()
    };

    let mut proc = child.map_err(|e| e.to_string())?;

    if let Ok(mut pid_lock) = pid_holder.lock() {
        *pid_lock = Some(proc.id());
    }

    // stderr를 별도 스레드로 수거 — stdout 스트리밍을 블로킹하지 않도록
    let stderr_handle = proc.stderr.take().map(|stderr| {
        std::thread::spawn(move || {
            use std::io::Read;
            let mut buf = String::new();
            let mut reader = std::io::BufReader::new(stderr);
            let _ = reader.read_to_string(&mut buf);
            buf
        })
    });

    if let Some(stdout) = proc.stdout.take() {
        use std::io::BufRead;
        let reader = std::io::BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let _ = app.emit(&format!("claude-data-{}", event_id), l);
                }
                Err(_) => break,
            }
        }
    }
    let _ = proc.wait();

    if let Some(handle) = stderr_handle {
        if let Ok(stderr_output) = handle.join() {
            let trimmed = stderr_output.trim();
            if !trimmed.is_empty() {
                let escaped = trimmed
                    .replace('\\', "\\\\")
                    .replace('"', "\\\"")
                    .replace('\n', "\\n");
                let _ = app.emit(
                    &format!("claude-data-{}", event_id),
                    format!("{{\"type\":\"error\",\"content\":\"{}\" }}", escaped),
                );
            }
        }
    }

    Ok(())
}
