/** AI Provider 설정 UI에서 쓰는 외부 I/O 래퍼.
 *  Tauri API는 CLAUDE.md 규칙에 따라 항상 동적 import로 로드한다. */

/** 시스템 브라우저로 URL을 연다 (Tauri shell 플러그인 래퍼). */
export async function openUrl(url: string): Promise<void> {
  const mod = await import('@tauri-apps/plugin-shell');
  await mod.open(url);
}

/** OpenAI API 키 유효성 검증. true면 키가 유효. */
export async function verifyOpenAIKey(apiKey: string): Promise<boolean> {
  const resp = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return resp.ok;
}

/** Ollama 로컬 서버 응답 여부 확인. true면 응답 OK. */
export async function testOllama(baseUrl: string): Promise<boolean> {
  const resp = await fetch(`${baseUrl}/api/tags`);
  return resp.ok;
}
