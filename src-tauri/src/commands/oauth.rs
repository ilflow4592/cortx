use std::io::{Read, Write as IoWrite};
use std::net::TcpListener;
use crate::types::OAuthCallbackResult;

/// Start a local TCP server on the given port to receive the OAuth callback redirect.
/// Blocks (on a background thread) until either a callback is received or 5 minutes elapse.
/// Returns the authorization code and state from the callback query parameters.
#[tauri::command]
pub async fn start_oauth_callback_server(port: u16) -> OAuthCallbackResult {
    tauri::async_runtime::spawn_blocking(move || {
        oauth_callback_listen(port)
    }).await.unwrap_or_else(|e| OAuthCallbackResult {
        code: String::new(), state: String::new(), success: false,
        error: format!("Thread error: {}", e),
    })
}

/// Internal: blocking TCP listener that waits for the OAuth callback GET request.
fn oauth_callback_listen(port: u16) -> OAuthCallbackResult {
    let addr = format!("127.0.0.1:{}", port);
    let listener = match TcpListener::bind(&addr) {
        Ok(l) => l,
        Err(e) => return OAuthCallbackResult {
            code: String::new(), state: String::new(), success: false,
            error: format!("Failed to bind to {}: {}", addr, e),
        },
    };

    // 5분 타임아웃 — nonblocking 모드로 WouldBlock 수신 시 sleep/retry, 그래야 timeout 루프가 작동한다.
    // (기존: set_nonblocking(false)로 영구 블록 → timeout이 의미 없음)
    listener.set_nonblocking(true).ok();
    let _ = listener.set_ttl(300);
    use std::time::Duration;
    let timeout = Duration::from_secs(300);
    let start = std::time::Instant::now();

    // Poll with short accepts so we can check timeout
    loop {
        if start.elapsed() > timeout {
            return OAuthCallbackResult {
                code: String::new(), state: String::new(), success: false,
                error: "Login timed out (5 minutes)".to_string(),
            };
        }

        match listener.accept() {
        Ok((mut stream, _)) => {
            // accept된 소켓은 nonblocking 속성을 상속하므로 blocking 모드로 전환 + read timeout
            let _ = stream.set_nonblocking(false);
            let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
            let mut buf = [0u8; 4096];
            let n = stream.read(&mut buf).unwrap_or(0);
            let request = String::from_utf8_lossy(&buf[..n]).to_string();

            // Parse GET /callback?code=xxx&state=yyy
            let mut code = String::new();
            let mut state = String::new();
            let mut error = String::new();

            if let Some(query_start) = request.find("/callback?") {
                let query_part = &request[query_start + 10..];
                let query_end = query_part.find(' ').unwrap_or(query_part.len());
                let query = &query_part[..query_end];

                for param in query.split('&') {
                    let mut kv = param.splitn(2, '=');
                    let key = kv.next().unwrap_or("");
                    let value = kv.next().unwrap_or("");
                    let decoded = urlencoding_decode(value);
                    match key {
                        "code" => code = decoded,
                        "state" => state = decoded,
                        "error" => error = decoded,
                        _ => {}
                    }
                }
            }

            // Send response HTML
            let html = if !code.is_empty() {
                "<html><body style='background:#06060a;color:#e4e4e7;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center'><h1 style='font-size:48px;margin-bottom:16px'>✅</h1><h2>Connected to Anthropic</h2><p style='color:#71717a;margin-top:8px'>You can close this tab and return to Cortx.</p></div></body></html>"
            } else {
                "<html><body style='background:#06060a;color:#e4e4e7;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center'><h1 style='font-size:48px;margin-bottom:16px'>❌</h1><h2>Authentication Failed</h2><p style='color:#71717a;margin-top:8px'>Please try again in Cortx.</p></div></body></html>"
            };

            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                html.len(), html
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();

            return OAuthCallbackResult {
                code, state, success: error.is_empty(),
                error,
            };
        }
        Err(e) => {
            // Non-blocking would give WouldBlock — just retry
            if e.kind() == std::io::ErrorKind::WouldBlock {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            return OAuthCallbackResult {
                code: String::new(), state: String::new(), success: false,
                error: format!("Failed to accept connection: {}", e),
            };
        }
    }
    } // end loop
}

/// Percent-decoding for URL query parameter values.
pub fn urlencoding_decode(s: &str) -> String {
    urlencoding::decode(s).unwrap_or_else(|_| std::borrow::Cow::Borrowed(s)).into_owned()
}
