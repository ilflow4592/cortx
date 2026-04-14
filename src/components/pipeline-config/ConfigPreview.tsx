import { AlertTriangle } from 'lucide-react';

interface ConfigPreviewProps {
  error: string;
}

export function ConfigPreview({ error }: ConfigPreviewProps) {
  if (!error) return null;
  return (
    <div
      style={{
        padding: '8px 18px',
        background: 'rgba(239,68,68,0.08)',
        borderBottom: '1px solid rgba(239,68,68,0.2)',
        color: '#ef4444',
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <AlertTriangle size={12} strokeWidth={1.5} />
      {error}
    </div>
  );
}

export function ConfigFooter() {
  return (
    <div
      style={{
        padding: '10px 18px',
        borderTop: '1px solid var(--border-muted)',
        fontSize: 10,
        color: 'var(--fg-faint)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      <div>
        Supported keys: <code style={{ color: 'var(--fg-subtle)' }}>names</code>,{' '}
        <code style={{ color: 'var(--fg-subtle)' }}>models</code>,{' '}
        <code style={{ color: 'var(--fg-subtle)' }}>hidden</code>
      </div>
      <div>ESC to close · ⌘S to save</div>
    </div>
  );
}
