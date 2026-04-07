use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
}

pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
    claude_pids: HashMap<String, Arc<Mutex<Option<u32>>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self { sessions: HashMap::new(), claude_pids: HashMap::new() }
    }

    pub fn has_session(&self, id: &str) -> bool {
        self.sessions.contains_key(id)
    }

    pub fn spawn(&mut self, id: &str, cwd: &str, app: &AppHandle) -> Result<(), String> {
        self.sessions.remove(id);

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;

        let mut cmd = CommandBuilder::new("zsh");
        cmd.arg("-l");
        cmd.cwd(cwd);
        cmd.env("TERM", "xterm-256color");
        cmd.env("CORTX_TASK", id);

        let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
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

        self.sessions.insert(id.to_string(), PtySession { master: pair.master, writer });
        Ok(())
    }

    pub fn spawn_claude(&mut self, id: &str, cwd: &str, message: &str, context_files: &[String], context_summary: &str, allow_all_tools: bool, app: &AppHandle) -> Result<(), String> {
        self.sessions.remove(id);

        let event_id = id.to_string();
        let app_handle = app.clone();
        let cwd_owned = cwd.to_string();
        let msg_owned = message.to_string();
        let files_owned: Vec<String> = context_files.to_vec();
        let summary_owned = context_summary.to_string();
        let allow_tools = allow_all_tools;

        let pid_holder: Arc<Mutex<Option<u32>>> = Arc::new(Mutex::new(None));
        self.claude_pids.insert(id.to_string(), pid_holder.clone());

        thread::spawn(move || {
            // Write message to temp file (avoids shell escape issues with long prompts)
            let msg_path = format!("/tmp/cortx-msg-{}.md", event_id);
            let _ = std::fs::write(&msg_path, &msg_owned);

            // Write context summary to temp file if present
            let tmp_path = format!("/tmp/cortx-ctx-{}.md", event_id);
            let has_summary = !summary_owned.is_empty();
            if has_summary {
                let _ = std::fs::write(&tmp_path, &summary_owned);
            }

            // Build claude command — read message from temp file via stdin, stream JSON output
            let mut cmd_parts = vec![
                format!("cat {} |", shell_escape(&msg_path)),
                "claude".to_string(),
                "-p".to_string(),
                "-".to_string(),
                "--output-format".to_string(),
                "stream-json".to_string(),
                "--verbose".to_string(),
                "--model".to_string(),
                "claude-opus-4-6".to_string(),
            ];

            // Always bypass permissions — Cortx app runs non-interactively
            cmd_parts.extend([
                "--permission-mode".to_string(),
                "bypassPermissions".to_string(),
            ]);

            // Build system prompt from context summary + file list
            let mut system_parts: Vec<String> = vec![];

            if has_summary {
                system_parts.push(format!(
                    "The following is the user's collected context for this task (from GitHub, Slack, Notion, and pinned items). Use it to understand the task background:\n\n{}",
                    summary_owned
                ));
            }

            if !files_owned.is_empty() {
                system_parts.push(format!(
                    "The user has pinned the following local files as relevant context. Read and understand them before responding:\n{}",
                    files_owned.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n")
                ));
            }

            if !system_parts.is_empty() {
                cmd_parts.push("--append-system-prompt".to_string());
                cmd_parts.push(shell_escape(&system_parts.join("\n\n---\n\n")));
            }

            // Add directories containing the files so Claude can access them
            if !files_owned.is_empty() {
                let mut dirs: Vec<String> = files_owned.iter()
                    .filter_map(|f| {
                        let p = std::path::Path::new(f);
                        p.parent().map(|d| d.to_string_lossy().to_string())
                    })
                    .collect();
                dirs.sort();
                dirs.dedup();
                for dir in &dirs {
                    cmd_parts.push("--add-dir".to_string());
                    cmd_parts.push(shell_escape(dir));
                }
            }

            let full_cmd = cmd_parts.join(" ");
            let child = std::process::Command::new("zsh")
                .args(["-l", "-c", &full_cmd])
                .current_dir(&cwd_owned)
                .env("TERM", "dumb")
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn();

            match child {
                Ok(mut proc) => {
                    // Store PID for stop support
                    if let Ok(mut pid_lock) = pid_holder.lock() {
                        *pid_lock = Some(proc.id());
                    }

                    // Read stderr in a separate thread so it doesn't block stdout streaming
                    let stderr_handle = proc.stderr.take().map(|stderr| {
                        std::thread::spawn(move || {
                            use std::io::Read;
                            let mut buf = String::new();
                            let mut reader = std::io::BufReader::new(stderr);
                            let _ = reader.read_to_string(&mut buf);
                            buf
                        })
                    });

                    // Stream stdout line by line
                    if let Some(stdout) = proc.stdout.take() {
                        use std::io::BufRead;
                        let reader = std::io::BufReader::new(stdout);
                        for line in reader.lines() {
                            match line {
                                Ok(l) => {
                                    let _ = app_handle.emit(&format!("claude-data-{}", event_id), l);
                                }
                                Err(_) => break,
                            }
                        }
                    }
                    let _ = proc.wait();

                    // If stderr has content, emit it as an error event
                    if let Some(handle) = stderr_handle {
                        if let Ok(stderr_output) = handle.join() {
                            let trimmed = stderr_output.trim();
                            if !trimmed.is_empty() {
                                let escaped = trimmed.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n");
                                let _ = app_handle.emit(&format!("claude-data-{}", event_id), format!("{{\"type\":\"error\",\"content\":\"{}\" }}", escaped));
                            }
                        }
                    }

                    // Clean up temp files
                    let _ = std::fs::remove_file(&msg_path);
                    if has_summary {
                        let _ = std::fs::remove_file(&tmp_path);
                    }

                    let _ = app_handle.emit(&format!("claude-done-{}", event_id), ());
                }
                Err(e) => {
                    let _ = std::fs::remove_file(&msg_path);
                    if has_summary {
                        let _ = std::fs::remove_file(&tmp_path);
                    }
                    let _ = app_handle.emit(&format!("claude-data-{}", event_id), format!("{{\"type\":\"error\",\"content\":\"{}\" }}", e));
                    let _ = app_handle.emit(&format!("claude-done-{}", event_id), ());
                }
            }
        });

        Ok(())
    }

    pub fn write(&mut self, id: &str, data: &str) -> Result<(), String> {
        let session = self.sessions.get_mut(id).ok_or("No PTY session")?;
        session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn resize(&mut self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let session = self.sessions.get(id).ok_or("No PTY session")?;
        session.master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())
    }

    pub fn close(&mut self, id: &str) {
        self.sessions.remove(id);
    }

    pub fn stop_claude(&mut self, id: &str) -> Result<(), String> {
        if let Some(pid_holder) = self.claude_pids.remove(id) {
            if let Ok(lock) = pid_holder.lock() {
                if let Some(pid) = *lock {
                    // Kill the process group (zsh + claude + children)
                    unsafe {
                        libc::kill(-(pid as i32), libc::SIGTERM);
                    }
                    // Also kill the specific PID
                    unsafe {
                        libc::kill(pid as i32, libc::SIGTERM);
                    }
                    return Ok(());
                }
            }
        }
        Err("No claude process found".to_string())
    }
}

fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

pub type SharedPtyManager = Arc<Mutex<PtyManager>>;
