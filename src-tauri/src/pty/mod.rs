//! PTY 관리 — 터미널 세션과 Claude CLI 프로세스를 통합 관리.
//!
//! 서브모듈:
//! - `session`: `PtySession` 래퍼 (portable_pty master/writer/child + Drop 정리)
//! - `secure_temp`: 0o600 임시 파일 RAII (`SecureTempFile`)
//! - `claude_command`: `claude` CLI 인자 빌더 + 시스템 프롬프트/add-dir 유틸
//! - `spawn`: `spawn_and_stream` — 자식 프로세스 실행 + stdout 라인 스트리밍
//!
//! 외부 호출자(`commands::claude`, `lib.rs`)는 `crate::pty::SharedPtyManager` 등
//! 재-export된 심볼만 사용.

mod claude_command;
mod secure_temp;
mod session;
mod spawn;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

use claude_command::{build_system_prompt, derive_add_dirs, ClaudeCommand};
use secure_temp::SecureTempFile;
use session::PtySession;
use spawn::spawn_and_stream;

/// Thread-safe handle to the PTY manager, shared across Tauri command handlers.
pub type SharedPtyManager = Arc<Mutex<PtyManager>>;

/// Manages multiple PTY sessions (terminal shells) and Claude CLI processes.
/// Each session is keyed by a task ID so the frontend can multiplex terminals.
pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
    /// Tracks Claude CLI process IDs for graceful termination via `stop_claude`.
    claude_pids: HashMap<String, Arc<Mutex<Option<u32>>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            claude_pids: HashMap::new(),
        }
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
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
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
    // Tauri command가 직접 호출 — 구조체 래퍼 도입 시 JS 측 호출 시그니처 깨짐.
    #[allow(clippy::too_many_arguments)]
    pub fn spawn_claude(
        &mut self,
        id: &str,
        cwd: &str,
        message: &str,
        context_files: &[String],
        context_summary: &str,
        _allow_all_tools: bool,
        session_id: Option<&str>,
        model: Option<&str>,
        effort: Option<&str>,
        disallowed_tools: &[String],
        disable_project_mcp: bool,
        bash_timeout_ms: Option<u64>,
        permission_mode: Option<&str>,
        app: &AppHandle,
    ) -> Result<(), String> {
        self.sessions.remove(id);

        let event_id = id.to_string();
        let app_handle = app.clone();
        let cwd_owned = cwd.to_string();
        let msg_owned = message.to_string();
        let files_owned: Vec<String> = context_files.to_vec();
        let summary_owned = context_summary.to_string();
        let session_id_owned = session_id.map(|s| s.to_string());
        let model_owned = model.unwrap_or("claude-opus-4-6").to_string();
        let effort_owned = effort.map(|s| s.to_string());
        let disallowed_tools_owned: Vec<String> = disallowed_tools.to_vec();
        // None 이면 기존 동작(bypassPermissions) 유지. "plan" 지정 시 Claude CLI 가
        // Write/Edit 을 하드 차단하고 Claude 가 ExitPlanMode 로 계획 제출 → 세션
        // 종료. Cortx 가 이벤트 인식해 승인 UI 렌더.
        let permission_mode_owned = permission_mode.unwrap_or("bypassPermissions").to_string();

        let pid_holder: Arc<Mutex<Option<u32>>> = Arc::new(Mutex::new(None));
        self.claude_pids.insert(id.to_string(), pid_holder.clone());

        thread::spawn(move || {
            let msg_file = SecureTempFile::create("cortx-msg-", &event_id, &msg_owned);
            // 컨텍스트 요약은 있을 때만 기록 — 파일 생성 자체를 건너뜀
            let _ctx_file_guard = if !summary_owned.is_empty() {
                Some(SecureTempFile::create(
                    "cortx-ctx-",
                    &event_id,
                    &summary_owned,
                ))
            } else {
                None
            };

            // disable_project_mcp=true 면 빈 MCP 설정 파일 생성 → Claude CLI 가
            // 프로젝트 .mcp.json / ~/.claude.json mcpServers 스캔을 스킵하고
            // MCP 서버를 하나도 띄우지 않음. 죽은 MCP (예: 존재하지 않는
            // sequential-thinking.js) handshake 대기로 인한 tool 호출 hang 차단.
            let mcp_guard = if disable_project_mcp {
                Some(SecureTempFile::create_with_suffix(
                    "cortx-mcp-",
                    &event_id,
                    ".json",
                    r#"{"mcpServers":{}}"#,
                ))
            } else {
                None
            };

            let system_prompt = build_system_prompt(&summary_owned, &files_owned);
            let add_dirs = derive_add_dirs(&files_owned);

            let mut cmd_builder = ClaudeCommand::new(msg_file.path(), &model_owned)
                .with_permission_mode(&permission_mode_owned)
                .with_session(session_id_owned.as_deref())
                .with_effort(effort_owned.as_deref())
                .with_disallowed_tools(&disallowed_tools_owned)
                .with_system_prompt(&system_prompt)
                .with_add_dirs(&add_dirs);
            if let Some(g) = mcp_guard.as_ref() {
                cmd_builder = cmd_builder.with_mcp_config(g.path());
            }
            let full_cmd = cmd_builder.build();
            // mcp_guard 는 Drop 시 파일 제거 → spawn 끝날 때까지 살아있어야 함.
            // spawn_and_stream 은 동기 호출이라 이 스레드가 끝나야 반환 → OK.
            let _keep_mcp = mcp_guard;

            // Bash tool 기본/최대 타임아웃을 Claude CLI 환경변수로 주입. runaway
            // find/grep 가 수 분 hang 되는 걸 CLI 레벨에서 차단. None 이면 기본값
            // (default 120s, max 600s) 유지.
            let mut extra_env: Vec<(String, String)> = Vec::new();
            if let Some(ms) = bash_timeout_ms {
                extra_env.push(("BASH_DEFAULT_TIMEOUT_MS".into(), ms.to_string()));
                extra_env.push(("BASH_MAX_TIMEOUT_MS".into(), ms.to_string()));
            }

            if let Err(e) = spawn_and_stream(
                &cwd_owned,
                &full_cmd,
                &event_id,
                &app_handle,
                pid_holder,
                &extra_env,
            ) {
                let escaped = e
                    .replace('\\', "\\\\")
                    .replace('"', "\\\"")
                    .replace('\n', "\\n");
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
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Resize the PTY to match the frontend terminal dimensions.
    pub fn resize(&mut self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let session = self.sessions.get(id).ok_or("No PTY session")?;
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
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
        let matching_ids: Vec<String> = self
            .claude_pids
            .keys()
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
