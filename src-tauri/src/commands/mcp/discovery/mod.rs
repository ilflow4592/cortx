//! MCP 서버 발견 — `.mcp.json` (project) > `~/.claude.json` (global) >
//! `~/.claude/settings.json` (global) > claude.ai cloud > built-in 우선순위.
//!
//! 같은 이름이 여러 곳에 있으면 먼저 등장한 source가 이긴다.
//!
//! 서브모듈:
//! - `project` — `.mcp.json` + Local MCPs + project settings 로딩
//! - `global` — `~/.claude.json` + `~/.claude/settings.json` + claude.ai cloud
//! - `builtin` — synthetic local entries + built-in 서버

use super::{parse_mcp_env, McpServerInfo};
use std::collections::HashSet;
use std::path::Path;

mod builtin;
mod global;
mod project;

use builtin::{add_builtin_entries, add_synthetic_local_entries};
use global::collect_global_servers;
use project::{collect_project_servers, load_project_settings};

/// JSON 파일에서 mcpServers 객체를 읽어 servers 벡터에 추가.
/// project/global submodules가 공유하므로 여기에 둔다.
pub fn parse_mcp_file(
    path: &Path,
    source: &str,
    servers: &mut Vec<McpServerInfo>,
    disabled_set: &HashSet<String>,
    enabled_set: &HashSet<String>,
    has_enabled_list: bool,
) {
    let Ok(content) = std::fs::read_to_string(path) else { return };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else { return };
    let Some(mcp) = json.get("mcpServers").and_then(|v| v.as_object()) else { return };

    for (name, config) in mcp {
        if servers.iter().any(|s| s.name == *name) {
            continue;
        }

        let in_disabled_list = disabled_set.contains(name);
        let in_enabled_list = enabled_set.contains(name);
        let config_disabled = config.get("disabled").and_then(|v| v.as_bool()).unwrap_or(false);

        // Source는 그대로 — Local MCPs는 별도 경로에서 처리됨
        let actual_source = source;

        // 비활성 판정: 명시적 disabled 리스트 / config의 disabled / project+local에서
        // enabled 리스트가 있고 거기 없는 경우
        let is_project_local = actual_source == "project" || actual_source == "local";
        let is_disabled =
            in_disabled_list || config_disabled || (is_project_local && has_enabled_list && !in_enabled_list);

        let command = config.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let args: Vec<String> = config
            .get("args")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|a| a.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();
        let env = parse_mcp_env(config);
        let server_type = config.get("type").and_then(|v| v.as_str()).unwrap_or("stdio").to_string();
        let url = config.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
        servers.push(McpServerInfo {
            name: name.clone(),
            command,
            args,
            env,
            server_type,
            url,
            source: actual_source.to_string(),
            disabled: is_disabled,
        });
    }
}

#[tauri::command]
pub fn list_mcp_servers(project_cwd: Option<String>) -> Vec<McpServerInfo> {
    let mut servers: Vec<McpServerInfo> = vec![];

    // ~/.claude.json projects 섹션의 disabled/enabled 목록 + Local MCPs
    let settings = if let Some(cwd) = &project_cwd {
        load_project_settings(cwd)
    } else {
        project::ProjectSettings {
            disabled_servers: HashSet::new(),
            enabled_local_servers: HashSet::new(),
            has_enabled_list: false,
            project_mcp_servers: Vec::new(),
        }
    };

    // 1. Project-level .mcp.json + Local MCPs (최우선)
    if let Some(cwd) = &project_cwd {
        collect_project_servers(cwd, &settings, &mut servers);
    }

    // 2-4. Global ~/.claude.json + ~/.claude/settings.json + claude.ai cloud
    collect_global_servers(
        &settings.disabled_servers,
        &settings.enabled_local_servers,
        settings.has_enabled_list,
        &mut servers,
    );

    // 4.5. Synthetic local entries — 설정 리스트엔 있는데 어디에도 정의되지 않은 서버
    add_synthetic_local_entries(&settings.disabled_servers, &settings.enabled_local_servers, &mut servers);

    // 5. Built-in MCPs (항상 사용 가능)
    add_builtin_entries(&mut servers);

    servers
}
