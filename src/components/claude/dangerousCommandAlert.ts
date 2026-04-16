/**
 * Dangerous command alert — 세션별 사용자 결정 저장.
 *
 * critical 명령 감지 시 다이얼로그 띄우기 전에 먼저 여기 물어봄.
 * 사용자가 "이 패턴 이번 세션은 무시" 선택하면 이후 같은 패턴은 조용히 넘김.
 *
 * 메모리 전용 — 앱 재시작 시 초기화.
 */

/** taskId → 무시할 패턴 집합 */
const sessionAllowlist = new Map<string, Set<string>>();

/** 패턴이 이 태스크의 세션 allowlist에 있는지 */
export function isAllowedInSession(taskId: string, pattern: string): boolean {
  return sessionAllowlist.get(taskId)?.has(pattern) ?? false;
}

/** 이 세션에서 해당 패턴을 계속 허용 */
export function allowPatternInSession(taskId: string, pattern: string): void {
  let set = sessionAllowlist.get(taskId);
  if (!set) {
    set = new Set();
    sessionAllowlist.set(taskId, set);
  }
  set.add(pattern);
}

/** 태스크 종료/리셋 시 초기화 */
export function clearAllowlist(taskId: string): void {
  sessionAllowlist.delete(taskId);
}

export function clearAllAllowlists(): void {
  sessionAllowlist.clear();
}
