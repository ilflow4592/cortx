//! Project-scope MCP 수집 — `.mcp.json` (+ worktree 시 메인 repo의 `.mcp.json`) 및
//! `~/.claude.json` projects[path].mcpServers (Local MCPs).

use super::super::{parse_mcp_env, McpServerInfo};
use super::parse_mcp_file;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// worktree 경로에서 메인 repo root 찾기.
/// .git 파일(`gitdir: ...`)을 읽어 파싱, 아니면 None.
pub fn find_repo_root(cwd: &str) -> Option<PathBuf> {
    let git_path = Path::new(cwd).join(".git");
    if !git_path.is_file() {
        return None;
    }
    let content = std::fs::read_to_string(&git_path).ok()?;
    let gitdir = content.strip_prefix("gitdir: ").map(|s| s.trim())?;
    Path::new(gitdir)
        .parent()?
        .parent()?
        .parent()
        .map(|p| p.to_path_buf())
}

/// `~/.claude.json`의 `projects[projectPath]` 섹션에서 disabled/enabled 목록과
/// Local MCP 서버 config를 읽어낸다.
pub struct ProjectSettings {
    pub disabled_servers: HashSet<String>,
    pub enabled_local_servers: HashSet<String>,
    pub has_enabled_list: bool,
    pub project_mcp_servers: Vec<(String, serde_json::Value)>,
}

pub fn load_project_settings(project_cwd: &str) -> ProjectSettings {
    let mut out = ProjectSettings {
        disabled_servers: HashSet::new(),
        enabled_local_servers: HashSet::new(),
        has_enabled_list: false,
        project_mcp_servers: Vec::new(),
    };

    let project_path = find_repo_root(project_cwd).unwrap_or_else(|| PathBuf::from(project_cwd));
    let project_key = project_path.to_string_lossy().to_string();

    let Some(home) = std::env::var_os("HOME") else {
        return out;
    };
    let claude_json = Path::new(&home).join(".claude.json");
    let Ok(content) = std::fs::read_to_string(&claude_json) else {
        return out;
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else {
        return out;
    };
    let Some(proj) = json.get("projects").and_then(|p| p.get(&project_key)) else {
        return out;
    };

    // disabledMcpServers — 모든 MCP 타입의 master disabled 목록
    if let Some(arr) = proj.get("disabledMcpServers").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(name) = item.as_str() {
                out.disabled_servers.insert(name.to_string());
            }
        }
    }
    // disabledMcpjsonServers — .mcp.json 서버 전용
    if let Some(arr) = proj
        .get("disabledMcpjsonServers")
        .and_then(|v| v.as_array())
    {
        for item in arr {
            if let Some(name) = item.as_str() {
                out.disabled_servers.insert(name.to_string());
            }
        }
    }
    // enabledMcpjsonServers — 비어있지 않을 때만 활성 필터
    if let Some(arr) = proj.get("enabledMcpjsonServers").and_then(|v| v.as_array()) {
        if !arr.is_empty() {
            out.has_enabled_list = true;
            for item in arr {
                if let Some(name) = item.as_str() {
                    out.enabled_local_servers.insert(name.to_string());
                }
            }
        }
    }
    // Project-scoped mcpServers (Local MCPs)
    if let Some(mcp) = proj.get("mcpServers").and_then(|v| v.as_object()) {
        for (name, config) in mcp {
            out.project_mcp_servers.push((name.clone(), config.clone()));
        }
    }
    out
}

/// 프로젝트 `.mcp.json` (+ worktree 메인 repo)과 Local MCPs를 servers에 추가.
pub fn collect_project_servers(
    project_cwd: &str,
    settings: &ProjectSettings,
    servers: &mut Vec<McpServerInfo>,
) {
    // 1. Project-level .mcp.json (최우선)
    let cwd_path = Path::new(project_cwd);
    let project_mcp = cwd_path.join(".mcp.json");
    parse_mcp_file(
        &project_mcp,
        "project",
        servers,
        &settings.disabled_servers,
        &settings.enabled_local_servers,
        settings.has_enabled_list,
    );

    // worktree면 메인 repo root의 .mcp.json도 확인
    if let Some(root) = find_repo_root(project_cwd) {
        let root_mcp = root.join(".mcp.json");
        parse_mcp_file(
            &root_mcp,
            "project",
            servers,
            &settings.disabled_servers,
            &settings.enabled_local_servers,
            settings.has_enabled_list,
        );
    }

    // 1.5. Local MCPs — ~/.claude.json projects[path].mcpServers
    for (name, config) in &settings.project_mcp_servers {
        if servers.iter().any(|s| s.name == *name) {
            continue;
        }
        let is_disabled = settings.disabled_servers.contains(name)
            || config
                .get("disabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
        let command = config
            .get("command")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let args: Vec<String> = config
            .get("args")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|a| a.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        let env = parse_mcp_env(config);
        let server_type = config
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("stdio")
            .to_string();
        let url = config
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        servers.push(McpServerInfo {
            name: name.clone(),
            command,
            args,
            env,
            server_type,
            url,
            source: "local".to_string(),
            disabled: is_disabled,
        });
    }
}
