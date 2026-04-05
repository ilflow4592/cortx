import { invoke } from '@tauri-apps/api/core';
import { open as openUrl } from '@tauri-apps/plugin-shell';

const OAUTH_PORT = 10000;
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`;

// Anthropic OAuth config
const ANTHROPIC_AUTH_URL = 'https://platform.claude.com/oauth/authorize';
const ANTHROPIC_TOKEN_URL = 'https://platform.claude.com/oauth/token';
const ANTHROPIC_SCOPES = 'org:create_api_key user:profile user:inference';

// Client ID must be registered with Anthropic.
// Users can set their own in Settings if they have one.
function getClientId(): string {
  try {
    const raw = localStorage.getItem('cortx-settings');
    if (raw) {
      const data = JSON.parse(raw);
      if (data.oauthClientId) return data.oauthClientId;
    }
  } catch { /* ignore */ }
  return '';
}

// PKCE helpers
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join('');
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(plain));
}

function base64urlencode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface OAuthResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

export async function startAnthropicOAuth(): Promise<OAuthResult> {
  const clientId = getClientId();
  if (!clientId) {
    return { accessToken: '', error: 'OAuth requires a registered Client ID. Enter your Client ID in the field below, or use an API key instead.' };
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
    try { window.open(authUrl, '_blank'); } catch { /* ignore */ }
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
