import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

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

// Disable macOS autocomplete/autocorrect on all inputs
const disableAutocomplete = (el: Element) => {
  el.setAttribute('autocomplete', 'off');
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('autocapitalize', 'off');
  el.setAttribute('spellcheck', 'false');
};
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
document.querySelectorAll('input, textarea').forEach(disableAutocomplete);

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
