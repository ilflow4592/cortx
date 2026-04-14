use portable_pty::{Child, MasterPty};
use std::io::Write;

/// A single PTY session holding the master side, writer handle, and child process.
/// `child`는 Option으로 둬 Drop 시 take()로 안전하게 소유권 이동이 가능하도록 한다.
pub struct PtySession {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child: Option<Box<dyn Child + Send + Sync>>,
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
