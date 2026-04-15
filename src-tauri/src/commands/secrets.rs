//! OS Keychain 기반 비밀 저장 — Notion API token 등 민감 정보를 OS 보안 저장소에
//! 보관한다. localStorage(plaintext, DevTools 노출)과 mcp.json(파일 plaintext)에
//! 비해 암호화 + OS 인증 필요로 보안 수준 ↑.
//!
//! 백엔드:
//! - macOS: Keychain (apple-native)
//! - Windows: Credential Manager (windows-native)
//! - Linux: Secret Service (libsecret 등)
//!
//! 모든 호출은 service 이름으로 격리되며 cortx는 `cortx`를 사용한다.
//! key는 자유 — 예: `notion-api-token`, `github-pat`.

use keyring::Entry;

/// 시크릿 저장. 같은 service+key가 이미 있으면 덮어씀. value 빈 문자열은 삭제로 처리.
#[tauri::command]
pub fn set_secret(service: String, key: String, value: String) -> Result<(), String> {
    if value.is_empty() {
        return delete_secret(service, key);
    }
    let entry = Entry::new(&service, &key).map_err(|e| format!("keyring entry: {}", e))?;
    entry
        .set_password(&value)
        .map_err(|e| format!("keyring set: {}", e))
}

/// 시크릿 조회. 없으면 None. 다른 에러는 Err로 전파.
#[tauri::command]
pub fn get_secret(service: String, key: String) -> Result<Option<String>, String> {
    let entry = Entry::new(&service, &key).map_err(|e| format!("keyring entry: {}", e))?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring get: {}", e)),
    }
}

/// 시크릿 삭제. 이미 없어도 OK (idempotent).
#[tauri::command]
pub fn delete_secret(service: String, key: String) -> Result<(), String> {
    let entry = Entry::new(&service, &key).map_err(|e| format!("keyring entry: {}", e))?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keyring delete: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 통합 테스트는 OS Keychain에 실제로 쓰는 부작용이 있어 CI에선 스킵.
    // 로컬에서 ENABLE_KEYCHAIN_TESTS=1로 활성화.
    fn keychain_tests_enabled() -> bool {
        std::env::var("ENABLE_KEYCHAIN_TESTS").map(|v| v == "1").unwrap_or(false)
    }

    #[test]
    fn set_get_delete_roundtrip() -> Result<(), String> {
        if !keychain_tests_enabled() {
            return Ok(());
        }
        let service = "cortx-test".to_string();
        let key = format!("test-key-{}", std::process::id());
        // cleanup
        let _ = delete_secret(service.clone(), key.clone());

        // get when missing → None
        assert_eq!(get_secret(service.clone(), key.clone())?, None);

        // set
        set_secret(service.clone(), key.clone(), "secret123".to_string())?;
        assert_eq!(get_secret(service.clone(), key.clone())?, Some("secret123".to_string()));

        // overwrite
        set_secret(service.clone(), key.clone(), "newvalue".to_string())?;
        assert_eq!(get_secret(service.clone(), key.clone())?, Some("newvalue".to_string()));

        // empty value = delete
        set_secret(service.clone(), key.clone(), "".to_string())?;
        assert_eq!(get_secret(service.clone(), key.clone())?, None);

        // delete idempotent
        delete_secret(service, key)?;
        Ok(())
    }
}
