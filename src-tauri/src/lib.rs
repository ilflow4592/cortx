mod pty;
mod types;
pub mod commands;

use std::sync::{Arc, Mutex};
use tauri::Manager;
use pty::{PtyManager, SharedPtyManager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pty_manager: SharedPtyManager = Arc::new(Mutex::new(PtyManager::new()));

    // SQLite migrations — defines the schema for tasks, projects, chat messages, and interrupts
    let migrations = vec![
        tauri_plugin_sql::Migration {
            version: 1,
            description: "create initial schema",
            sql: include_str!("../migrations/001_initial_schema.sql"),
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 2,
            description: "add full-text search index",
            sql: include_str!("../migrations/002_fts_search.sql"),
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .manage(pty_manager)
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:cortx.db", migrations)
                .build(),
        )
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Graceful shutdown: close all PTY sessions and Claude processes
                if let Some(mgr) = window.try_state::<SharedPtyManager>() {
                    if let Ok(mut manager) = mgr.inner().lock() {
                        manager.close_all();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::git::create_worktree,
            commands::git::remove_worktree,
            commands::git::list_worktrees,
            commands::git::git_diff,
            commands::git::git_diff_full,
            commands::git::git_diff_staged,
            commands::git::git_diff_unstaged,
            commands::shell::fetch_link_preview,
            commands::shell::read_cortx_yaml,
            commands::oauth::start_oauth_callback_server,
            commands::shell::run_setup_scripts,
            commands::shell::run_shell_command,
            commands::mcp::list_mcp_servers,
            commands::claude::list_slash_commands,
            commands::claude::claude_spawn,
            commands::claude::claude_stop,
            commands::claude::claude_stop_task,
            commands::claude::claude_send,
            commands::claude::pty_spawn,
            commands::claude::pty_write,
            commands::claude::pty_resize,
            commands::claude::pty_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
