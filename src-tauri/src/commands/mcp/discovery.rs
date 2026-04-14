//! MCP 서버 발견 — `.mcp.json` (project) > `~/.claude.json` (global) >
//! `~/.claude/settings.json` (global) > claude.ai cloud > built-in 우선순위.
//!
//! 같은 이름이 여러 곳에 있으면 먼저 등장한 source가 이긴다.

use super::{McpServerInfo, parse_mcp_env};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// JSON 파일에서 mcpServers 객체를 읽어 servers 벡터에 추가.
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

    // ~/.claude.json projects 섹션의 disabled/enabled 목록 — disabled 상태의 SSOT
    let mut disabled_servers: HashSet<String> = HashSet::new();
    let mut enabled_local_servers: HashSet<String> = HashSet::new();
    let mut has_enabled_list = false;
    let mut project_mcp_servers: Vec<(String, serde_json::Value)> = vec![];

    // worktree 경로에서 메인 repo root 찾기
    let find_repo_root = |cwd: &str| -> Option<PathBuf> {
        let git_path = Path::new(cwd).join(".git");
        if !git_path.is_file() {
            return None;
        }
        let content = std::fs::read_to_string(&git_path).ok()?;
        let gitdir = content.strip_prefix("gitdir: ").map(|s| s.trim())?;
        Path::new(gitdir).parent()?.parent()?.parent().map(|p| p.to_path_buf())
    };

    // ~/.claude.json의 projects[projectPath] 섹션 읽기
    if let Some(cwd) = &project_cwd {
        let project_path = find_repo_root(cwd).unwrap_or_else(|| PathBuf::from(cwd));
        let project_key = project_path.to_string_lossy().to_string();

        if let Some(home) = std::env::var_os("HOME") {
            let claude_json = Path::new(&home).join(".claude.json");
            if let Ok(content) = std::fs::read_to_string(&claude_json) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(proj) = json.get("projects").and_then(|p| p.get(&project_key)) {
                        // disabledMcpServers — 모든 MCP 타입의 master disabled 목록
                        if let Some(arr) = proj.get("disabledMcpServers").and_then(|v| v.as_array()) {
                            for item in arr {
                                if let Some(name) = item.as_str() {
                                    disabled_servers.insert(name.to_string());
                                }
                            }
                        }
                        // disabledMcpjsonServers — .mcp.json 서버 전용
                        if let Some(arr) = proj.get("disabledMcpjsonServers").and_then(|v| v.as_array()) {
                            for item in arr {
                                if let Some(name) = item.as_str() {
                                    disabled_servers.insert(name.to_string());
                                }
                            }
                        }
                        // enabledMcpjsonServers — 비어있지 않을 때만 활성 필터
                        if let Some(arr) = proj.get("enabledMcpjsonServers").and_then(|v| v.as_array()) {
                            if !arr.is_empty() {
                                has_enabled_list = true;
                                for item in arr {
                                    if let Some(name) = item.as_str() {
                                        enabled_local_servers.insert(name.to_string());
                                    }
                                }
                            }
                        }
                        // Project-scoped mcpServers (Local MCPs)
                        if let Some(mcp) = proj.get("mcpServers").and_then(|v| v.as_object()) {
                            for (name, config) in mcp {
                                project_mcp_servers.push((name.clone(), config.clone()));
                            }
                        }
                    }
                }
            }
        }
    }

    // 1. Project-level .mcp.json (최우선)
    if let Some(cwd) = &project_cwd {
        let cwd_path = Path::new(cwd);
        let project_mcp = cwd_path.join(".mcp.json");
        parse_mcp_file(&project_mcp, "project", &mut servers, &disabled_servers, &enabled_local_servers, has_enabled_list);

        // worktree면 메인 repo root의 .mcp.json도 확인
        if let Some(root) = find_repo_root(cwd) {
            let root_mcp = root.join(".mcp.json");
            parse_mcp_file(&root_mcp, "project", &mut servers, &disabled_servers, &enabled_local_servers, has_enabled_list);
        }

        // 1.5. Local MCPs — ~/.claude.json projects[path].mcpServers
        for (name, config) in &project_mcp_servers {
            if servers.iter().any(|s| s.name == *name) {
                continue;
            }
            let is_disabled =
                disabled_servers.contains(name) || config.get("disabled").and_then(|v| v.as_bool()).unwrap_or(false);
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
                source: "local".to_string(),
                disabled: is_disabled,
            });
        }
    }

    // 2. Global ~/.claude.json
    if let Some(home) = std::env::var_os("HOME") {
        let config_path = Path::new(&home).join(".claude.json");
        parse_mcp_file(&config_path, "global", &mut servers, &disabled_servers, &enabled_local_servers, has_enabled_list);

        // 3. Global ~/.claude/settings.json
        let settings_path = Path::new(&home).join(".claude").join("settings.json");
        parse_mcp_file(&settings_path, "global", &mut servers, &disabled_servers, &enabled_local_servers, has_enabled_list);

        // 4. claude.ai cloud MCPs (claudeAiMcpEverConnected 키)
        let config_path = Path::new(&home).join(".claude.json");
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(arr) = json.get("claudeAiMcpEverConnected").and_then(|v| v.as_array()) {
                    for item in arr {
                        if let Some(name) = item.as_str() {
                            if !servers.iter().any(|s| s.name == name) {
                                servers.push(McpServerInfo {
                                    name: name.to_string(),
                                    command: String::new(),
                                    args: vec![],
                                    env: std::collections::HashMap::new(),
                                    server_type: "cloud".to_string(),
                                    url: String::new(),
                                    source: "claude.ai".to_string(),
                                    disabled: false,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // 4.5. Synthetic local entries — 설정 리스트엔 있는데 어디에도 정의되지 않은 서버
    for name in disabled_servers.iter().chain(enabled_local_servers.iter()) {
        if !servers.iter().any(|s| s.name == *name) {
            servers.push(McpServerInfo {
                name: name.clone(),
                command: String::new(),
                args: vec![],
                env: std::collections::HashMap::new(),
                server_type: String::new(),
                url: String::new(),
                source: "local".to_string(),
                disabled: !enabled_local_servers.contains(name),
            });
        }
    }

    // 5. Built-in MCPs (항상 사용 가능)
    let builtins = ["computer-use"];
    for name in &builtins {
        if !servers.iter().any(|s| s.name == *name) {
            servers.push(McpServerInfo {
                name: name.to_string(),
                command: String::new(),
                args: vec![],
                env: std::collections::HashMap::new(),
                server_type: "builtin".to_string(),
                url: String::new(),
                source: "built-in".to_string(),
                disabled: true,
            });
        }
    }

    servers
}
