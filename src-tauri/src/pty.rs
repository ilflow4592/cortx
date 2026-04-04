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

    pub fn spawn(&mut self, id: &str, cwd: &str, app: &AppHandle) -> Result<(), String> {
        // Close existing session if any
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

        // Spawn reader thread that emits data to frontend
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

pub type SharedPtyManager = Arc<Mutex<PtyManager>>;
