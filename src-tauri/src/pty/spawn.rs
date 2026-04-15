use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// Claude CLI 자식 프로세스를 실행하고 stdout을 라인 단위로 스트리밍.
/// stderr는 별도 스레드로 수거해 프로세스 종료 시 에러 이벤트로 방출.
pub fn spawn_and_stream(
    cwd: &str,
    cmd: &str,
    event_id: &str,
    app: &AppHandle,
    pid_holder: Arc<Mutex<Option<u32>>>,
) -> Result<(), String> {
    #[cfg(unix)]
    let child = std::process::Command::new("zsh")
        .args(["-l", "-c", cmd])
        .current_dir(cwd)
        .env("TERM", "dumb")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn();
    #[cfg(windows)]
    let child = std::process::Command::new("cmd")
        .args(["/C", cmd])
        .current_dir(cwd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn();

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
