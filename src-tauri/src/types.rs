use serde::{Deserialize, Serialize};

/// Result of a shell/git command execution, returned to the frontend.
#[derive(Serialize, Deserialize)]
pub struct CommandResult {
    pub success: bool,
    pub output: String,
    pub error: String,
}

/// Result from the local OAuth callback server after receiving the redirect.
#[derive(Serialize, Deserialize)]
pub struct OAuthCallbackResult {
    pub code: String,
    pub state: String,
    pub success: bool,
    pub error: String,
}
