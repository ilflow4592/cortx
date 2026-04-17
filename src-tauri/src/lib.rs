pub mod commands;
mod pty;
mod types;

use pty::{PtyManager, SharedPtyManager};
use std::sync::{Arc, Mutex};
use tauri::Manager;

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
        tauri_plugin_sql::Migration {
            version: 3,
            description: "add telemetry events table",
            sql: include_str!("../migrations/003_telemetry.sql"),
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 4,
            description: "add project scan metadata",
            sql: include_str!("../migrations/004_project_metadata.sql"),
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
        .plugin(tauri_plugin_process::init())
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
            commands::secrets::set_secret,
            commands::secrets::get_secret,
            commands::secrets::delete_secret,
            commands::notion_api::notion_fetch_blocks,
            commands::notion_api::notion_fetch_page,
            commands::shell::run_setup_scripts,
            commands::shell::run_shell_command,
            commands::mcp::discovery::list_mcp_servers,
            commands::mcp::mutate::upsert_mcp_server,
            commands::mcp::mutate::remove_mcp_server,
            commands::mcp::toggle::toggle_mcp_server,
            commands::claude::slash::list_slash_commands,
            commands::claude::slash::read_slash_command,
            commands::claude::slash::write_slash_command,
            commands::claude::slash::delete_slash_command,
            commands::claude::builtin_skills::get_builtin_pipeline_skill,
            commands::claude::custom_pipeline::list_custom_pipelines,
            commands::claude::custom_pipeline::read_custom_pipeline,
            commands::claude::custom_pipeline::write_custom_pipeline,
            commands::claude::custom_pipeline::delete_custom_pipeline,
            commands::claude::custom_pipeline::export_custom_pipeline,
            commands::claude::custom_pipeline::import_custom_pipeline,
            commands::claude::custom_pipeline::list_claude_agents,
            commands::claude::custom_pipeline::read_claude_agent,
            commands::claude::window::open_task_window,
            commands::claude::spawn::claude_spawn,
            commands::claude::spawn::claude_stop,
            commands::claude::spawn::claude_stop_task,
            commands::claude::spawn::claude_send,
            commands::claude::pty_proxy::pty_spawn,
            commands::claude::pty_proxy::pty_write,
            commands::claude::pty_proxy::pty_resize,
            commands::claude::pty_proxy::pty_close,
            commands::scan::scan_project,
            commands::scan::remove_auto_generated,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
