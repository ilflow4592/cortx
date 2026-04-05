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
}

impl PtyManager {
    pub fn new() -> Self {
        Self { sessions: HashMap::new() }
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

    pub fn spawn_claude(&mut self, id: &str, cwd: &str, message: &str, context_files: &[String], app: &AppHandle) -> Result<(), String> {
        self.sessions.remove(id);

        let event_id = id.to_string();
        let app_handle = app.clone();
        let cwd_owned = cwd.to_string();
        let msg_owned = message.to_string();
        let files_owned: Vec<String> = context_files.to_vec();

        thread::spawn(move || {
            // Build claude command with context
            let mut cmd_parts = vec![
                "claude".to_string(),
                "-p".to_string(),
                shell_escape(&msg_owned),
                "--verbose".to_string(),
            ];

            // Add context files as system prompt context
            if !files_owned.is_empty() {
                let context_prompt = format!(
                    "The user has pinned the following files as relevant context for this task. Read and understand them before responding:\n{}",
                    files_owned.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n")
                );
                cmd_parts.push("--append-system-prompt".to_string());
                cmd_parts.push(shell_escape(&context_prompt));

                // Add directories containing the files so Claude can access them
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
            let output = std::process::Command::new("zsh")
                .args(["-l", "-c", &full_cmd])
                .current_dir(&cwd_owned)
                .env("TERM", "dumb")
                .output();

            match output {
                Ok(out) => {
                    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                    let response = if stdout.is_empty() { stderr } else { stdout };
                    let _ = app_handle.emit(&format!("claude-data-{}", event_id), response);
                    let _ = app_handle.emit(&format!("claude-done-{}", event_id), ());
                }
                Err(e) => {
                    let _ = app_handle.emit(&format!("claude-data-{}", event_id), format!("Error: {}", e));
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
}

fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

pub type SharedPtyManager = Arc<Mutex<PtyManager>>;
