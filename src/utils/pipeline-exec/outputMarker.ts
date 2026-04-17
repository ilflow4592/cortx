/**
 * Skill 간 산출물 교환을 위한 OUTPUT 마커 유틸.
 *
 * 규약:
 *   [OUTPUT:key]
 *   ...내용...
 *   [/OUTPUT:key]
 *
 * - key 는 영숫자+언더스코어만 (정규식 \w+)
 * - 같은 key 가 여러 번 등장하면 **마지막** 블록 채택
 * - 중첩 금지 (시작 태그 다음 같은 key 의 종료 태그까지)
 * - 추출 후 원문에서 stripping 해 UI 노출 최소화
 *
 * 대응 스킬 본문 변수 치환 ({key}) 는 substituteArtifacts 로.
 */

const OUTPUT_RE = /\[OUTPUT:(\w+)\]([\s\S]*?)\[\/OUTPUT:\1\]/g;

/**
 * 스트리밍 텍스트에서 OUTPUT 블록을 추출.
 * 반환: { artifacts: {key: content}, stripped: 마커 제거된 원문 }
 */
export function extractOutputMarkers(text: string): {
  artifacts: Record<string, string>;
  stripped: string;
} {
  const artifacts: Record<string, string> = {};
  // 반복 실행 — 같은 key 있으면 마지막 덮어씀
  let match;
  OUTPUT_RE.lastIndex = 0;
  while ((match = OUTPUT_RE.exec(text)) !== null) {
    const [, key, content] = match;
    artifacts[key] = content.trim();
  }
  const stripped = text.replace(OUTPUT_RE, '').trim();
  return { artifacts, stripped };
}

/**
 * 스킬 프롬프트 본문의 `{key}` 플레이스홀더를 artifacts[key] 값으로 치환.
 * `\{` 로 이스케이프된 리터럴 brace 는 치환 안 함.
 * 없는 key 는 빈 문자열로 치환 + 경고 반환.
 */
export function substituteArtifacts(
  template: string,
  artifacts: Record<string, string>,
): { result: string; missing: string[] } {
  const missing: string[] = [];
  // 이스케이프 토큰 임시 치환
  const ESC_OPEN = '\x00ESCOPEN\x00';
  const ESC_CLOSE = '\x00ESCCLOSE\x00';
  let s = template.replace(/\\{/g, ESC_OPEN).replace(/\\}/g, ESC_CLOSE);
  s = s.replace(/\{(\w+)\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(artifacts, key)) {
      return artifacts[key];
    }
    missing.push(key);
    return '';
  });
  s = s.replace(new RegExp(ESC_OPEN, 'g'), '{').replace(new RegExp(ESC_CLOSE, 'g'), '}');
  return { result: s, missing };
}

/**
 * `produces` 선언된 key 목록과 실제 추출된 artifacts 를 비교해 누락 경고 목록 반환.
 * 호출자가 UI 표시/로깅 결정.
 */
export function validateProducedArtifacts(declared: string[] | undefined, produced: Record<string, string>): string[] {
  if (!declared) return [];
  return declared.filter((k) => !Object.prototype.hasOwnProperty.call(produced, k));
}
