/**
 * @module oauth
 * Anthropic OAuth 2.0 + PKCE 인증 플로우.
 * Tauri 백엔드의 콜백 서버를 사용하여 authorization code를 수신하고,
 * access token으로 교환한다. API key 없이 Claude API를 사용할 수 있게 해준다.
 *
 * 플로우: PKCE 생성 -> 브라우저에서 인증 -> 로컬 콜백 서버로 code 수신 -> token 교환
 */

import { invoke } from '@tauri-apps/api/core';
import { open as openUrl } from '@tauri-apps/plugin-shell';

/** Tauri 백엔드에서 OAuth 콜백을 수신할 로컬 서버 포트 */
const OAUTH_PORT = 10000;
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`;

// Anthropic OAuth endpoints
const ANTHROPIC_AUTH_URL = 'https://platform.claude.com/oauth/authorize';
const ANTHROPIC_TOKEN_URL = 'https://platform.claude.com/oauth/token';
const ANTHROPIC_SCOPES = 'org:create_api_key user:profile user:inference';

/**
 * localStorage에서 사용자가 설정한 OAuth Client ID를 읽어온다.
 * Anthropic에 등록된 Client ID가 필요하며, Settings에서 설정 가능.
 */
function getClientId(): string {
  try {
    const raw = localStorage.getItem('cortx-settings');
    if (raw) {
      const data = JSON.parse(raw);
      if (data.oauthClientId) return data.oauthClientId;
    }
  } catch {
    /* ignore */
  }
  return '';
}

// ── PKCE (Proof Key for Code Exchange) helpers ──

/** Generate a cryptographically random string for PKCE verifier/state */
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join('');
}

/** SHA-256 hash using Web Crypto API */
async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(plain));
}

/** Base64url encode (RFC 7636) — replaces +/= with URL-safe characters */
function base64urlencode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** OAuth token 교환 결과 */
export interface OAuthResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

/**
 * Anthropic OAuth 인증 플로우를 시작한다.
 * 1) PKCE code verifier/challenge 생성
 * 2) Tauri 백엔드에서 콜백 서버 시작
 * 3) 브라우저에서 Anthropic 인증 페이지 열기
 * 4) 콜백으로 authorization code 수신
 * 5) Code를 access token으로 교환
 * @returns OAuth 결과 (access token 또는 error)
 */
export async function startAnthropicOAuth(): Promise<OAuthResult> {
  const clientId = getClientId();
  if (!clientId) {
    return {
      accessToken: '',
      error:
        'OAuth requires a registered Client ID. Enter your Client ID in the field below, or use an API key instead.',
    };
  }

  // 1. Generate PKCE
  const codeVerifier = generateRandomString(64);
  const codeChallenge = base64urlencode(await sha256(codeVerifier));
  const state = generateRandomString(48);

  // 2. Build authorization URL
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: ANTHROPIC_SCOPES,
    access_type: 'offline',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });
  const authUrl = `${ANTHROPIC_AUTH_URL}?${params.toString()}`;

  // 3. Start callback server AND open browser concurrently
  //    Server must start first, then browser opens
  const callbackPromise = invoke<{
    code: string;
    state: string;
    success: boolean;
    error: string;
  }>('start_oauth_callback_server', { port: OAUTH_PORT });

  // Small delay to ensure server is listening before browser opens
  await new Promise((r) => setTimeout(r, 200));

  // 4. Open browser (fire-and-forget, don't block)
  openUrl(authUrl).catch(() => {
    // Fallback: try window.open
    try {
      window.open(authUrl, '_blank');
    } catch {
      /* ignore */
    }
  });

  // 5. Wait for callback from the OAuth redirect
  const callback = await callbackPromise;

  if (!callback.success || !callback.code) {
    return { accessToken: '', error: callback.error || 'Authentication cancelled' };
  }

  if (callback.state !== state) {
    return { accessToken: '', error: 'State mismatch — possible CSRF attack' };
  }

  // 6. Exchange code for token
  try {
    const tokenResp = await fetch(ANTHROPIC_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: callback.code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      }).toString(),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      return { accessToken: '', error: `Token exchange failed: ${err}` };
    }

    const tokenData = await tokenResp.json();
    return {
      accessToken: tokenData.access_token || '',
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
    };
  } catch (err) {
    return { accessToken: '', error: `Token exchange error: ${err}` };
  }
}
