/**
 * @module utils/time
 * 시간 관련 유틸리티 함수.
 */

/**
 * 초(seconds)를 사람이 읽기 쉬운 시:분:초 문자열로 변환한다.
 * - 1시간 미만: "MM:SS" (예: "05:30")
 * - 1시간 이상: "HH:MM:SS" (예: "02:05:30")
 */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
