import { useState } from 'react';
import type { ContextSourceConfig, ContextSourceType } from '../../types/contextPack';
import { SourceCard } from './SourceCard';

export function SourcesSettings({
  sources,
  onAdd,
  onUpdate,
  onRemove,
}: {
  sources: ContextSourceConfig[];
  onAdd: (s: ContextSourceConfig) => void;
  onUpdate: (i: number, u: Partial<ContextSourceConfig>) => void;
  onRemove: (i: number) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const types: { type: ContextSourceType; label: string }[] = [
    { type: 'github', label: '🐙 GitHub' },
    { type: 'slack', label: '💬 Slack' },
    { type: 'notion', label: '📄 Notion' },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span className="field-label" style={{ margin: 0 }}>
          Context Sources
        </span>
        <div style={{ position: 'relative' }}>
          <button className="ctx-btn ctx-btn-collect" style={{ fontSize: 11 }} onClick={() => setShowAdd(!showAdd)}>
            + Add Source
          </button>
          {showAdd && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: 4,
                background: '#0c0c10',
                border: '1px solid var(--bg-chip)',
                borderRadius: 8,
                padding: 4,
                zIndex: 10,
                minWidth: 160,
              }}
            >
              {types.map((t) => (
                <button
                  key={t.type}
                  onClick={() => {
                    onAdd({
                      type: t.type,
                      enabled: true,
                      ...(t.type === 'github' ? { owner: '', repo: '' } : {}),
                      ...(t.type === 'slack' ? { slackChannel: '' } : {}),
                      ...(t.type === 'notion' ? { notionDatabaseId: '' } : {}),
                    });
                    setShowAdd(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--fg-muted)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    borderRadius: 6,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {sources.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 12, color: 'var(--fg-faint)' }}>
          No sources configured. Add GitHub, Slack, or Notion.
        </div>
      )}
      {sources.map((s, i) => (
        <SourceCard key={i} source={s} onUpdate={(u) => onUpdate(i, u)} onRemove={() => onRemove(i)} />
      ))}
      <div className="field-hint" style={{ marginTop: 16 }}>
        Scope only — tokens are stored in OS Keychain via the Integrations tab. API calls go directly from your machine
        to each provider.
      </div>
    </>
  );
}
