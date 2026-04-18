/**
 * Tauri WebKit 에서 HTML5 Native DnD 제약 대응 유틸.
 *
 * WebKit (특히 Tauri 내장 WKWebView) 이슈:
 *  1. custom MIME 만 setData 하면 drag 자체가 시작 안 됨 → 'text/plain' 도 같이 set
 *  2. dragover 중 dataTransfer.types 에 custom MIME 미노출 → 조건 분기 대신 항상 preventDefault
 *  3. React setState on dragover → 리렌더가 drop 이벤트를 무효화 → ref 기반 DOM 직접 조작
 *
 * 이 파일은 위 3가지 패턴을 공용 함수로 뽑아 DnD 가 중복되는 곳들에서 재사용한다.
 */
import type React from 'react';

/** dragstart 시 custom MIME + text/plain 동시 set (WebKit 이슈 #1 대응) */
export function setDragPayload(e: React.DragEvent, mime: string, payload: string): void {
  e.dataTransfer.setData(mime, payload);
  e.dataTransfer.setData('text/plain', payload);
}

/** drop 시 custom MIME 우선, 없으면 text/plain fallback (WebKit 이슈 #1 대응) */
export function getDragPayload(e: React.DragEvent, mime: string): string {
  return e.dataTransfer.getData(mime) || e.dataTransfer.getData('text/plain');
}

/** drop 에서 받은 raw 문자열을 JSON 파싱 + 타입 가드 (실패 시 null) */
export function parseDragJson<T>(raw: string, isValid: (v: unknown) => v is T): T | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * ref 기반 호버 시각 피드백 컨트롤러 (WebKit 이슈 #3 대응).
 * setState 대신 DOM style 을 직접 조작해 리렌더 회피 → drop 이벤트 무효화 방지.
 *
 * 사용:
 *   const hover = createHoverController(
 *     ref,
 *     { borderColor: 'var(--green)', background: 'rgba(0,255,0,0.05)' },
 *     { borderColor: 'var(--border-strong)', background: 'transparent' },
 *   );
 *   <div ref={ref} onDragEnter={hover.on} onDragLeave={hover.offIfLeft} onDrop={hover.off}>
 */
export function createHoverController(
  ref: React.RefObject<HTMLElement | null>,
  onStyle: Partial<CSSStyleDeclaration>,
  offStyle: Partial<CSSStyleDeclaration>,
) {
  const apply = (style: Partial<CSSStyleDeclaration>) => {
    const el = ref.current;
    if (!el) return;
    Object.assign(el.style, style);
  };
  return {
    on: () => apply(onStyle),
    off: () => apply(offStyle),
    /** dragleave 시: 자식 요소 간 이동은 무시 (contains(relatedTarget) 체크) */
    offIfLeft: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      apply(offStyle);
    },
  };
}

/**
 * onDragOver 공통 핸들러 — 항상 preventDefault + dropEffect 지정 (WebKit 이슈 #2).
 * 조건 분기 없이 호출자가 drop 단계에서 getDragPayload 로 필터링.
 */
export function makeDragOverHandler(effect: DataTransfer['dropEffect'] = 'copy'): (e: React.DragEvent) => void {
  return (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = effect;
  };
}
