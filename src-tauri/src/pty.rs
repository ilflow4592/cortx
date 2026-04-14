use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

/// A single PTY session holding the master side, writer handle, and child process.
/// `child`는 Option으로 둬 Drop 시 take()로 안전하게 소유권 이동이 가능하도록 한다.
pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Option<Box<dyn Child + Send + Sync>>,
}

impl Drop for PtySession {
    /// 세션이 폐기될 때 child 프로세스를 반드시 정리 — 좀비 프로세스 방지.
    /// `close_all` 호출 누락 또는 panic 경로에서도 작동.
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Manages multiple PTY sessions (terminal shells) and Claude CLI processes.
/// Each session is keyed by a task ID so the frontend can multiplex terminals.
pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
    /// Tracks Claude CLI process IDs for graceful termination via `stop_claude`.
    claude_pids: HashMap<String, Arc<Mutex<Option<u32>>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self { sessions: HashMap::new(), claude_pids: HashMap::new() }
    }

    /// Returns true if a PTY session exists for the given task ID.
    pub fn has_session(&self, id: &str) -> bool {
        self.sessions.contains_key(id)
    }

    /// Spawn an interactive shell for the given task.
    /// Uses zsh on Unix, powershell on Windows.
    /// Emits `pty-data-{id}` events with stdout chunks and `pty-exit-{id}` on termination.
    pub fn spawn(&mut self, id: &str, cwd: &str, app: &AppHandle) -> Result<(), String> {
        self.sessions.remove(id);

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;

        #[cfg(unix)]
        let mut cmd = {
            let mut c = CommandBuilder::new("zsh");
            c.arg("-l");
            c
        };
        #[cfg(windows)]
        let mut cmd = CommandBuilder::new("powershell");
        cmd.cwd(cwd);
        cmd.env("TERM", "xterm-256color");
        cmd.env("CORTX_TASK", id);

        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        drop(pair.slave);

        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

        let event_id = id.to_string();
        let app_handle = app.clone();
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_handle.emit(&format!("pty-data-{}", event_id), data);
                    }
                    Err(_) => break,
                }
            }
            let _ = app_handle.emit(&format!("pty-exit-{}", event_id), ());
        });

        self.sessions.insert(
            id.to_string(),
            PtySession {
                master: pair.master,
                writer,
                child: Some(child),
            },
        );
        Ok(())
    }

    /// Spawn a Claude CLI process for the given task.
    ///
    /// 3단 책임을 서브컴포넌트로 분리:
    /// 1. `SecureTempFile` — 프롬프트/컨텍스트를 0o600 임시 파일로 기록, drop 시 자동 정리
    /// 2. `ClaudeCommand` 빌더 — 플래그 조합 (모델, fallback, resume, system prompt, add-dir)
    /// 3. `spawn_and_stream` — 자식 프로세스 실행 + stdout 라인 스트리밍 + stderr 비동기 수거
    ///
    /// `claude-data-{id}` · `claude-done-{id}` 이벤트는 동일하게 emit된다.
    /// `allow_all_tools`는 현재 미사용 (항상 bypassPermissions) — 기존 ABI 유지용.
    pub fn spawn_claude(&mut self, id: &str, cwd: &str, message: &str, context_files: &[String], context_summary: &str, _allow_all_tools: bool, session_id: Option<&str>, model: Option<&str>, app: &AppHandle) -> Result<(), String> {
        self.sessions.remove(id);

        let event_id = id.to_string();
        let app_handle = app.clone();
        let cwd_owned = cwd.to_string();
        let msg_owned = message.to_string();
        let files_owned: Vec<String> = context_files.to_vec();
        let summary_owned = context_summary.to_string();
        let session_id_owned = session_id.map(|s| s.to_string());
        let model_owned = model.unwrap_or("claude-opus-4-6").to_string();

        let pid_holder: Arc<Mutex<Option<u32>>> = Arc::new(Mutex::new(None));
        self.claude_pids.insert(id.to_string(), pid_holder.clone());

        thread::spawn(move || {
            let msg_file = SecureTempFile::create("cortx-msg-", &event_id, &msg_owned);
            // 컨텍스트 요약은 있을 때만 기록 — 파일 생성 자체를 건너뜀
            let _ctx_file_guard = if !summary_owned.is_empty() {
                Some(SecureTempFile::create("cortx-ctx-", &event_id, &summary_owned))
            } else {
                None
            };

            let system_prompt = build_system_prompt(&summary_owned, &files_owned);
            let add_dirs = derive_add_dirs(&files_owned);

            let full_cmd = ClaudeCommand::new(msg_file.path(), &model_owned)
                .with_session(session_id_owned.as_deref())
                .with_system_prompt(&system_prompt)
                .with_add_dirs(&add_dirs)
                .build();

            if let Err(e) = spawn_and_stream(&cwd_owned, &full_cmd, &event_id, &app_handle, pid_holder) {
                let escaped = e.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n");
                let _ = app_handle.emit(
                    &format!("claude-data-{}", event_id),
                    format!("{{\"type\":\"error\",\"content\":\"{}\" }}", escaped),
                );
            }

            let _ = app_handle.emit(&format!("claude-done-{}", event_id), ());
            // msg_file / _ctx_file_guard는 스코프 이탈 시 Drop으로 파일 삭제
        });

        Ok(())
    }

    /// Write raw data to the PTY session's stdin (used for terminal input).
    pub fn write(&mut self, id: &str, data: &str) -> Result<(), String> {
        let session = self.sessions.get_mut(id).ok_or("No PTY session")?;
        session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Resize the PTY to match the frontend terminal dimensions.
    pub fn resize(&mut self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let session = self.sessions.get(id).ok_or("No PTY session")?;
        session.master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())
    }

    /// Close and remove a PTY session, dropping the master handle.
    pub fn close(&mut self, id: &str) {
        self.sessions.remove(id);
    }

    /// Close all PTY sessions and kill all Claude processes. Used for graceful shutdown.
    pub fn close_all(&mut self) {
        let ids: Vec<String> = self.claude_pids.keys().cloned().collect();
        for id in &ids {
            let _ = self.stop_claude(id);
        }
        self.sessions.clear();
    }

    /// Terminate a running Claude CLI process by sending SIGTERM to its process group
    /// and the process itself. Removes the PID entry from tracking.
    /// Stop all Claude processes whose ID starts with the given prefix.
    pub fn stop_claude_by_prefix(&mut self, prefix: &str) {
        let matching_ids: Vec<String> = self.claude_pids.keys()
            .filter(|k| k.starts_with(prefix))
            .cloned()
            .collect();
        for id in matching_ids {
            let _ = self.stop_claude(&id);
        }
    }

    pub fn stop_claude(&mut self, id: &str) -> Result<(), String> {
        if let Some(pid_holder) = self.claude_pids.remove(id) {
            if let Ok(lock) = pid_holder.lock() {
                if let Some(pid) = *lock {
                    #[cfg(unix)]
                    {
                        // nix crate 사용 — unsafe libc 블록 제거, i32 오버플로 안전
                        use nix::sys::signal::{kill, killpg, Signal};
                        use nix::unistd::Pid;
                        // i32 범위 초과 PID는 리눅스/맥에서 발생하지 않지만 방어적으로 체크
                        if let Ok(pid_i32) = i32::try_from(pid) {
                            let pid_obj = Pid::from_raw(pid_i32);
                            // 프로세스 그룹에 먼저, 실패 시 개별 PID로
                            let _ = killpg(pid_obj, Signal::SIGTERM);
                            let _ = kill(pid_obj, Signal::SIGTERM);
                        } else {
                            log::warn!("[pty] PID {} exceeds i32 range, skip", pid);
                        }
                    }
                    #[cfg(windows)]
                    {
                        // On Windows, use taskkill to terminate the process tree
                        let _ = std::process::Command::new("taskkill")
                            .args(["/F", "/T", "/PID", &pid.to_string()])
                            .output();
                    }
                    return Ok(());
                }
            }
        }
        Err("No claude process found".to_string())
    }
}

/// Escape a string for safe use inside single quotes in a shell command.
fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Write content to a file with restricted permissions (owner read/write only).
/// Prevents other users on the system from reading potentially sensitive context.
fn write_secure_temp(path: &str, content: &str) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)?;
        file.write_all(content.as_bytes())?;
    }
    #[cfg(windows)]
    {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(path)?;
        file.write_all(content.as_bytes())?;
    }
    Ok(())
}

/// Thread-safe handle to the PTY manager, shared across Tauri command handlers.
pub type SharedPtyManager = Arc<Mutex<PtyManager>>;

// ─────────────────────────────────────────────────────────────────────────────
// Claude CLI 실행 보조 — spawn_claude를 분해한 빌더/헬퍼
// ─────────────────────────────────────────────────────────────────────────────

/// 0o600 권한 임시 파일의 RAII 래퍼.
///
/// tempfile 크레이트로 unique 경로 생성을 시도하고, 실패 시 `/tmp/{prefix}{event_id}.md`
/// fallback 경로를 사용한다. Drop 시 파일을 제거해 panic 경로나 early return에서도
/// 새어나가지 않는다.
struct SecureTempFile {
    path: String,
}

impl SecureTempFile {
    fn create(prefix: &str, event_id: &str, content: &str) -> Self {
        // 1) tempfile 크레이트가 unique suffix를 붙여 생성 시도
        if let Ok(f) = tempfile::Builder::new().prefix(prefix).suffix(".md").tempfile() {
            let path = f.path().to_string_lossy().to_string();
            f.keep().ok(); // claude CLI가 열 수 있도록 파일 유지 (Drop은 remove로 대체)
            match write_secure_temp(&path, content) {
                Ok(()) => return Self { path },
                Err(e) => {
                    log::warn!("[pty] write_secure_temp {} failed: {} — /tmp fallback 시도", prefix, e);
                    let _ = std::fs::remove_file(&path);
                }
            }
        }
        // 2) /tmp fallback — 고정 경로지만 event_id 수준의 unique성 보장
        let path = format!("/tmp/{}{}.md", prefix, event_id);
        if let Err(e) = write_secure_temp(&path, content) {
            log::warn!("[pty] fallback write {} failed: {}", prefix, e);
            let _ = std::fs::remove_file(&path);
        }
        Self { path }
    }

    fn path(&self) -> &str {
        &self.path
    }
}

impl Drop for SecureTempFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

/// Claude CLI 커맨드 파츠 빌더. 각 with_* 는 설정이 유효할 때만 인자를 추가한다.
struct ClaudeCommand {
    parts: Vec<String>,
}

impl ClaudeCommand {
    fn new(msg_path: &str, model: &str) -> Self {
        let mut parts: Vec<String> = vec![
            format!("cat {} |", shell_escape(msg_path)),
            "claude".into(),
            "-p".into(),
            "-".into(),
            "--output-format".into(),
            "stream-json".into(),
            "--verbose".into(),
            "--model".into(),
            model.into(),
            "--max-turns".into(),
            "30".into(),
            // Cortx는 비대화형 실행 — 항상 우회
            "--permission-mode".into(),
            "bypassPermissions".into(),
        ];
        // Opus 사용 시 rate limit/장애 대비 Sonnet으로 자동 fallback
        if model.contains("opus") {
            parts.extend(["--fallback-model".into(), "claude-sonnet-4-6".into()]);
        }
        Self { parts }
    }

    fn with_session(mut self, session_id: Option<&str>) -> Self {
        if let Some(sid) = session_id {
            self.parts.extend(["--resume".into(), sid.to_string()]);
        }
        self
    }

    fn with_system_prompt(mut self, prompt: &str) -> Self {
        if !prompt.is_empty() {
            self.parts.push("--append-system-prompt".into());
            self.parts.push(shell_escape(prompt));
        }
        self
    }

    fn with_add_dirs(mut self, dirs: &[String]) -> Self {
        for dir in dirs {
            self.parts.push("--add-dir".into());
            self.parts.push(shell_escape(dir));
        }
        self
    }

    fn build(self) -> String {
        self.parts.join(" ")
    }
}

/// Context summary + pinned file list를 Claude 시스템 프롬프트 블록으로 결합
fn build_system_prompt(summary: &str, files: &[String]) -> String {
    let mut parts: Vec<String> = vec![];
    if !summary.is_empty() {
        parts.push(format!(
            "The following is the user's collected context for this task (from GitHub, Slack, Notion, and pinned items). Use it to understand the task background:\n\n{}",
            summary
        ));
    }
    if !files.is_empty() {
        parts.push(format!(
            "The user has pinned the following local files as relevant context. Read and understand them before responding:\n{}",
            files.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n")
        ));
    }
    parts.join("\n\n---\n\n")
}

/// pinned 파일들의 부모 디렉토리를 중복 없이 정렬된 목록으로 추출 (--add-dir 값)
fn derive_add_dirs(files: &[String]) -> Vec<String> {
    let mut dirs: Vec<String> = files
        .iter()
        .filter_map(|f| std::path::Path::new(f).parent().map(|d| d.to_string_lossy().to_string()))
        .collect();
    dirs.sort();
    dirs.dedup();
    dirs
}

/// Claude CLI 자식 프로세스를 실행하고 stdout을 라인 단위로 스트리밍.
/// stderr는 별도 스레드로 수거해 프로세스 종료 시 에러 이벤트로 방출.
fn spawn_and_stream(
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
                let escaped = trimmed.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n");
                let _ = app.emit(
                    &format!("claude-data-{}", event_id),
                    format!("{{\"type\":\"error\",\"content\":\"{}\" }}", escaped),
                );
            }
        }
    }

    Ok(())
}
