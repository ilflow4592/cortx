//! Claude CLI · PTY · slash command · popout window 관련 Tauri 커맨드 모음.
//!
//! 서브모듈:
//! - `slash` — ~/.claude/commands/ + .claude/commands/ 관리 (list/read/write/delete)
//! - `spawn` — Claude CLI 프로세스 (claude_spawn/send/stop/stop_task)
//! - `pty_proxy` — 터미널 PTY (pty_spawn/write/resize/close)
//! - `window` — popout 웹뷰 (open_task_window)
//!
//! Tauri `generate_handler!`는 함수 정의 경로를 직접 참조하므로 lib.rs에서는
//! `commands::claude::slash::list_slash_commands` 형태로 호출한다.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub mod pty_proxy;
pub mod slash;
pub mod spawn;
pub mod window;

/// A slash command entry for the autocomplete menu in the chat UI.
#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct SlashCommand {
    pub name: String,
    pub description: String,
    /// Origin of the command: "builtin", "user" (~/.claude/commands/), or "project" (.claude/commands/).
    pub source: String,
}
