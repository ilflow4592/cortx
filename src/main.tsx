/**
 * @module main
 * Cortx 앱 진입점.
 * ErrorBoundary로 전체 앱을 감싸 크래시 시 에러 화면을 표시하고,
 * macOS 자동완성 비활성화 및 알림 권한 요청을 초기화한다.
 */

import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';

/**
 * macOS 자동완성/자동수정 비활성화.
 * MutationObserver로 동적 추가되는 input/textarea도 처리한다.
 */
const disableAutocomplete = (el: Element) => {
  el.setAttribute('autocomplete', 'off');
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('autocapitalize', 'off');
  el.setAttribute('spellcheck', 'false');
};
// DOM에 새로 추가되는 input/textarea를 감시하여 자동완성 속성 제거
new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node instanceof HTMLElement) {
        if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') disableAutocomplete(node);
        node.querySelectorAll('input, textarea').forEach(disableAutocomplete);
      }
    }
  }
}).observe(document.body, { childList: true, subtree: true });
// 초기 로드 시 이미 존재하는 input/textarea 처리
document.querySelectorAll('input, textarea').forEach(disableAutocomplete);

// 브라우저 알림 권한 — 반드시 user gesture 컨텍스트에서 호출해야 하므로
// 첫 클릭/키 입력 때 한 번만 요청. module load 시 직접 호출하면 Chrome이
// "Notification prompting can only be done from a user gesture" 경고로 차단.
if ('Notification' in window && Notification.permission === 'default') {
  const askPermission = () => {
    window.removeEventListener('pointerdown', askPermission, true);
    window.removeEventListener('keydown', askPermission, true);
    Notification.requestPermission().catch(() => {});
  };
  window.addEventListener('pointerdown', askPermission, true);
  window.addEventListener('keydown', askPermission, true);
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
