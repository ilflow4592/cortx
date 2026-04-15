//! Notion REST API proxy — WebView fetch는 CORS로 차단되므로 Rust에서 reqwest로 호출.
//!
//! 토큰은 Keychain에서 직접 읽어 TS 레이어를 거치지 않는다 (토큰 DevTools 노출 방지).
//! Keychain에 토큰 없으면 Err 반환 → TS 쪽이 MCP 폴백으로 분기.

use serde_json::Value;

const NOTION_BASE: &str = "https://api.notion.com/v1";
const NOTION_VERSION: &str = "2022-06-28";
const KEYCHAIN_SERVICE: &str = "cortx";
const KEYCHAIN_KEY: &str = "notion-api-token";

fn load_token() -> Result<String, String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_KEY)
        .map_err(|e| format!("keyring entry: {}", e))?;
    entry.get_password().map_err(|e| match e {
        keyring::Error::NoEntry => "notion token not configured".to_string(),
        other => format!("keyring get: {}", other),
    })
}

async fn get_json(path: &str) -> Result<Value, String> {
    let token = load_token()?;
    let url = format!("{}{}", NOTION_BASE, path);
    let resp = reqwest::Client::new()
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Notion-Version", NOTION_VERSION)
        .send()
        .await
        .map_err(|e| format!("request: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("http {}: {}", status.as_u16(), body));
    }
    resp.json::<Value>().await.map_err(|e| format!("json: {}", e))
}

/// 페이지 블록(본문) 조회. `/v1/blocks/{page_id}/children?page_size=100`.
/// 성공 시 전체 JSON 반환 (TS 측에서 blocksToMarkdown으로 변환).
#[tauri::command]
pub async fn notion_fetch_blocks(page_id: String) -> Result<Value, String> {
    let path = format!("/blocks/{}/children?page_size=100", page_id);
    get_json(&path).await
}

/// 페이지 메타데이터 조회. `/v1/pages/{page_id}`. 현재 미사용 but 향후 사용 대비.
#[tauri::command]
pub async fn notion_fetch_page(page_id: String) -> Result<Value, String> {
    let path = format!("/pages/{}", page_id);
    get_json(&path).await
}

/// `/v1/search` POST 호출 — 쿼리 텍스트로 integration 공유된 페이지 검색.
/// 최신 수정 순 정렬, 페이지만 반환 (DB 필터 제외).
#[tauri::command]
pub async fn notion_search(query: String, page_size: Option<u32>) -> Result<Value, String> {
    let token = load_token()?;
    let body = serde_json::json!({
        "query": query,
        "filter": { "property": "object", "value": "page" },
        "page_size": page_size.unwrap_or(20).min(100),
        "sort": { "direction": "descending", "timestamp": "last_edited_time" }
    });
    let resp = reqwest::Client::new()
        .post(format!("{}/search", NOTION_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .header("Notion-Version", NOTION_VERSION)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("request: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("http {}: {}", status.as_u16(), body));
    }
    resp.json::<Value>().await.map_err(|e| format!("json: {}", e))
}
