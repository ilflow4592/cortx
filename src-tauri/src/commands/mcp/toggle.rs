//! `.claude/settings.local.json`의 enabledMcpjsonServers/disabledMcpjsonServers
//! 리스트를 토글한다. 워크트리면 메인 repo root의 settings를 우선 사용.

use serde_json::{json, Value};
use std::path::Path;

#[tauri::command]
pub fn toggle_mcp_server(
    project_cwd: String,
    server_name: String,
    currently_disabled: bool,
) -> Result<bool, String> {
    let cwd_path = Path::new(&project_cwd);
    let settings_path = resolve_settings_path(cwd_path);

    let mut root = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<Value>(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    let obj = root.as_object_mut().ok_or("Settings is not an object")?;

    let enabled: Vec<String> = obj
        .get("enabledMcpjsonServers")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let disabled: Vec<String> = obj
        .get("disabledMcpjsonServers")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let is_currently_enabled = enabled.contains(&server_name);
    let is_currently_disabled = disabled.contains(&server_name);

    let (new_enabled, new_disabled, now_disabled) = if is_currently_enabled {
        // enabled → disabled로 이동
        let e: Vec<String> = enabled.into_iter().filter(|n| *n != server_name).collect();
        let mut d = disabled;
        d.push(server_name.clone());
        (e, d, true)
    } else if is_currently_disabled {
        // disabled → enabled로 이동
        let mut e = enabled;
        e.push(server_name.clone());
        let d: Vec<String> = disabled.into_iter().filter(|n| *n != server_name).collect();
        (e, d, false)
    } else if currently_disabled {
        // 어느 리스트에도 없지만 시각적으로 disabled → enable
        let mut e = enabled;
        e.push(server_name.clone());
        (e, disabled, false)
    } else {
        // 어느 리스트에도 없지만 시각적으로 enabled → disable
        let mut d = disabled;
        d.push(server_name.clone());
        (enabled, d, true)
    };

    obj.insert("enabledMcpjsonServers".to_string(), json!(new_enabled));
    obj.insert("disabledMcpjsonServers".to_string(), json!(new_disabled));

    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, content).map_err(|e| e.to_string())?;

    Ok(now_disabled)
}

/// 워크트리에 settings가 없으면 메인 repo root를 우선 사용.
fn resolve_settings_path(cwd_path: &Path) -> std::path::PathBuf {
    let direct = cwd_path.join(".claude").join("settings.local.json");
    if direct.exists() {
        return direct;
    }
    let git_path = cwd_path.join(".git");
    if !git_path.is_file() {
        return direct;
    }
    let Ok(content) = std::fs::read_to_string(&git_path) else {
        return direct;
    };
    let Some(gitdir) = content.strip_prefix("gitdir: ").map(|s| s.trim()) else {
        return direct;
    };
    let Some(root) = Path::new(gitdir)
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
    else {
        return direct;
    };
    let root_settings = root.join(".claude").join("settings.local.json");
    if root_settings.exists() {
        root_settings
    } else {
        direct
    }
}
