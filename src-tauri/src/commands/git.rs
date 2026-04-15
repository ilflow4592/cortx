use crate::types::CommandResult;
use std::process::Command;

/// Helper: run a git command with the given arguments in the specified directory.
pub fn run_git(cwd: &str, args: &[&str]) -> CommandResult {
    match Command::new("git").args(args).current_dir(cwd).output() {
        Ok(out) => CommandResult {
            success: out.status.success(),
            output: String::from_utf8_lossy(&out.stdout).to_string(),
            error: String::from_utf8_lossy(&out.stderr).to_string(),
        },
        Err(e) => CommandResult {
            success: false,
            output: String::new(),
            error: e.to_string(),
        },
    }
}

/// Create a new git worktree with an associated branch.
/// If `base_branch` is provided, the new branch is based on it; otherwise uses HEAD.
#[tauri::command]
pub fn create_worktree(
    repo_path: String,
    worktree_path: String,
    branch_name: String,
    base_branch: Option<String>,
) -> CommandResult {
    let base = base_branch.unwrap_or_default();
    eprintln!(
        "[cortx] create_worktree: repo={}, worktree={}, branch={}, base='{}'",
        repo_path, worktree_path, branch_name, base
    );
    if base.is_empty() {
        run_git(
            &repo_path,
            &["worktree", "add", &worktree_path, "-b", &branch_name],
        )
    } else {
        // git worktree add <path> -b <new-branch> <base-branch>
        run_git(
            &repo_path,
            &["worktree", "add", &worktree_path, "-b", &branch_name, &base],
        )
    }
}

/// Force-remove a git worktree directory.
#[tauri::command]
pub fn remove_worktree(repo_path: String, worktree_path: String) -> CommandResult {
    run_git(
        &repo_path,
        &["worktree", "remove", &worktree_path, "--force"],
    )
}

/// List all worktrees in porcelain format for machine parsing.
#[tauri::command]
pub fn list_worktrees(repo_path: String) -> CommandResult {
    run_git(&repo_path, &["worktree", "list", "--porcelain"])
}

/// Get a summarized diff (--stat) between the current HEAD and its merge-base with main.
#[tauri::command]
pub fn git_diff(repo_path: String, _branch_name: String) -> CommandResult {
    let base_result = Command::new("git")
        .args(["merge-base", "HEAD", "main"])
        .current_dir(&repo_path)
        .output();

    let base = match base_result {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        _ => "HEAD~1".to_string(),
    };

    run_git(&repo_path, &["diff", "--stat", &base, "HEAD"])
}

/// Get the full unified diff between the current HEAD and its merge-base with main.
#[tauri::command]
pub fn git_diff_full(repo_path: String) -> CommandResult {
    let base_result = Command::new("git")
        .args(["merge-base", "HEAD", "main"])
        .current_dir(&repo_path)
        .output();

    let base = match base_result {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        _ => "HEAD~1".to_string(),
    };

    run_git(&repo_path, &["diff", &base, "HEAD"])
}

/// Get the diff of staged (cached) changes only.
#[tauri::command]
pub fn git_diff_staged(repo_path: String) -> CommandResult {
    run_git(&repo_path, &["diff", "--cached"])
}

/// Get the diff of unstaged working directory changes only.
#[tauri::command]
pub fn git_diff_unstaged(repo_path: String) -> CommandResult {
    run_git(&repo_path, &["diff"])
}
