/**
 * Reusable React ErrorBoundary.
 * - Full-screen mode (default): used at app root in main.tsx
 * - Section mode (with `label` prop): used per panel so a crash in one
 *   panel doesn't take down the whole app
 */
import { Component, type ReactNode } from 'react';
import { recordCrash } from '../services/telemetry';

interface Props {
  children: ReactNode;
  /** When set, renders a compact inline error card instead of full screen. */
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ''}]`, error, info);
    // Report to telemetry (no-op if telemetry is disabled)
    try {
      recordCrash(error, this.props.label);
    } catch {
      /* ignore telemetry failures */
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    // Compact section error card
    if (this.props.label) {
      return (
        <div
          style={{
            padding: 16,
            margin: 12,
            borderRadius: 8,
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.25)',
            color: '#ef4444',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            overflow: 'auto',
            maxHeight: '100%',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            {this.props.label} crashed
          </div>
          <div style={{ color: '#eab308', marginBottom: 8, fontSize: 11 }}>{this.state.error.message}</div>
          <button
            onClick={this.reset}
            style={{
              marginTop: 8,
              padding: '4px 10px',
              fontSize: 11,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 4,
              color: '#ef4444',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    // Full-screen fatal error
    return (
      <div
        style={{
          color: '#ef4444',
          padding: 40,
          fontFamily: 'monospace',
          fontSize: 14,
          whiteSpace: 'pre-wrap',
          background: 'var(--bg-panel)',
          height: '100vh',
          overflow: 'auto',
        }}
      >
        <h1 style={{ color: 'var(--fg-primary)', marginBottom: 16 }}>Cortx crashed</h1>
        <p style={{ color: '#eab308', marginBottom: 8 }}>{this.state.error.message}</p>
        <pre style={{ color: '#888', fontSize: 12 }}>{this.state.error.stack}</pre>
      </div>
    );
  }
}
