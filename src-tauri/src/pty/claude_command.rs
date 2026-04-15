/// Escape a string for safe use inside single quotes in a shell command.
pub fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Claude CLI 커맨드 파츠 빌더. 각 with_* 는 설정이 유효할 때만 인자를 추가한다.
pub struct ClaudeCommand {
    parts: Vec<String>,
}

impl ClaudeCommand {
    pub fn new(msg_path: &str, model: &str) -> Self {
        let mut parts: Vec<String> = vec![
            format!("cat {} |", shell_escape(msg_path)),
            "claude".into(),
            "-p".into(),
            "-".into(),
            "--output-format".into(),
            "stream-json".into(),
            "--verbose".into(),
            "--model".into(),
            model.into(),
            "--max-turns".into(),
            "30".into(),
            // Cortx는 비대화형 실행 — 항상 우회
            "--permission-mode".into(),
            "bypassPermissions".into(),
        ];
        // Opus 사용 시 rate limit/장애 대비 Sonnet으로 자동 fallback
        if model.contains("opus") {
            parts.extend(["--fallback-model".into(), "claude-sonnet-4-6".into()]);
        }
        Self { parts }
    }

    pub fn with_session(mut self, session_id: Option<&str>) -> Self {
        if let Some(sid) = session_id {
            self.parts.extend(["--resume".into(), sid.to_string()]);
        }
        self
    }

    /// Claude CLI `--effort` 플래그 (low | medium | high | max). None이면 CLI 기본값 사용.
    /// 잘못된 값은 무시해 CLI 에러를 피한다.
    pub fn with_effort(mut self, effort: Option<&str>) -> Self {
        if let Some(level) = effort {
            if matches!(level, "low" | "medium" | "high" | "max") {
                self.parts.extend(["--effort".into(), level.to_string()]);
            }
        }
        self
    }

    pub fn with_system_prompt(mut self, prompt: &str) -> Self {
        if !prompt.is_empty() {
            self.parts.push("--append-system-prompt".into());
            self.parts.push(shell_escape(prompt));
        }
        self
    }

    pub fn with_add_dirs(mut self, dirs: &[String]) -> Self {
        for dir in dirs {
            self.parts.push("--add-dir".into());
            self.parts.push(shell_escape(dir));
        }
        self
    }

    pub fn build(self) -> String {
        self.parts.join(" ")
    }
}

/// Context summary + pinned file list를 Claude 시스템 프롬프트 블록으로 결합
pub fn build_system_prompt(summary: &str, files: &[String]) -> String {
    let mut parts: Vec<String> = vec![];
    if !summary.is_empty() {
        parts.push(format!(
            "The following is the user's collected context for this task (from GitHub, Slack, Notion, and pinned items). Use it to understand the task background:\n\n{}",
            summary
        ));
    }
    if !files.is_empty() {
        parts.push(format!(
            "The user has pinned the following local files as relevant context. Read and understand them before responding:\n{}",
            files.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n")
        ));
    }
    parts.join("\n\n---\n\n")
}

/// pinned 파일들의 부모 디렉토리를 중복 없이 정렬된 목록으로 추출 (--add-dir 값)
pub fn derive_add_dirs(files: &[String]) -> Vec<String> {
    let mut dirs: Vec<String> = files
        .iter()
        .filter_map(|f| {
            std::path::Path::new(f)
                .parent()
                .map(|d| d.to_string_lossy().to_string())
        })
        .collect();
    dirs.sort();
    dirs.dedup();
    dirs
}
