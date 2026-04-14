use std::io::Write;

/// Write content to a file with restricted permissions (owner read/write only).
/// Prevents other users on the system from reading potentially sensitive context.
pub fn write_secure_temp(path: &str, content: &str) -> std::io::Result<()> {
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

/// 0o600 권한 임시 파일의 RAII 래퍼.
///
/// tempfile 크레이트로 unique 경로 생성을 시도하고, 실패 시 `/tmp/{prefix}{event_id}.md`
/// fallback 경로를 사용한다. Drop 시 파일을 제거해 panic 경로나 early return에서도
/// 새어나가지 않는다.
pub struct SecureTempFile {
    path: String,
}

impl SecureTempFile {
    pub fn create(prefix: &str, event_id: &str, content: &str) -> Self {
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

    pub fn path(&self) -> &str {
        &self.path
    }
}

impl Drop for SecureTempFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}
