/**
 * @module main
 * Cortx 앱 진입점.
 * ErrorBoundary로 전체 앱을 감싸 크래시 시 에러 화면을 표시하고,
 * macOS 자동완성 비활성화 및 알림 권한 요청을 초기화한다.
 */

import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/**
 * React ErrorBoundary — 렌더링 중 발생하는 에러를 잡아서
 * 검은 화면 대신 에러 메시지와 스택트레이스를 표시한다.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ color: '#ef4444', padding: 40, fontFamily: 'monospace', fontSize: 14, whiteSpace: 'pre-wrap', background: '#0c0c12', height: '100vh', overflow: 'auto' }}>
          <h1 style={{ color: '#fafafa', marginBottom: 16 }}>Cortx crashed</h1>
          <p style={{ color: '#eab308', marginBottom: 8 }}>{this.state.error.message}</p>
          <pre style={{ color: '#888', fontSize: 12 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

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

// 앱 시작 시 브라우저 알림 권한 요청 (아직 미결정 상태인 경우에만)
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission().catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
