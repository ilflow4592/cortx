import { useState } from 'react';
import { useSettingsStore, type AIProvider } from '../stores/settingsStore';
import { useContextPackStore } from '../stores/contextPackStore';
import type { ContextSourceConfig, ContextSourceType } from '../types/contextPack';

type STab = 'ai' | 'sources';

const providers: { value: AIProvider; label: string; model: string }[] = [
  { value: 'claude', label: 'Claude (Anthropic)', model: 'claude-sonnet-4-20250514' },
  { value: 'openai', label: 'OpenAI', model: 'gpt-4o' },
  { value: 'ollama', label: 'Ollama (Local)', model: 'llama3.2' },
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useSettingsStore();
  const { sources, addSource, updateSource, removeSource } = useContextPackStore();
  const [tab, setTab] = useState<STab>('ai');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-tabs">
          <button className={`modal-tab ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>🤖 AI Provider</button>
          <button className={`modal-tab ${tab === 'sources' ? 'active' : ''}`} onClick={() => setTab('sources')}>📦 Context Sources</button>
        </div>
        <div className="modal-body">
          {tab === 'ai' && (
            <>
              <div className="field">
                <span className="field-label">AI Provider (BYOK)</span>
                <div className="provider-grid">
                  {providers.map((p) => (
                    <button key={p.value} className={`provider-btn ${settings.aiProvider === p.value ? 'active' : ''}`} onClick={() => settings.setSettings({ aiProvider: p.value, modelId: p.model })}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              {settings.aiProvider !== 'ollama' && (
                <div className="field">
                  <span className="field-label">API Key</span>
                  <input className="field-input mono" type="password" value={settings.apiKey} onChange={(e) => settings.setSettings({ apiKey: e.target.value })} placeholder={settings.aiProvider === 'claude' ? 'sk-ant-...' : 'sk-...'} />
                  <span className="field-hint">Stored locally only. Never sent to Cortx servers.</span>
                </div>
              )}
              {settings.aiProvider === 'ollama' && (
                <div className="field">
                  <span className="field-label">Ollama URL</span>
                  <input className="field-input mono" value={settings.ollamaUrl} onChange={(e) => settings.setSettings({ ollamaUrl: e.target.value })} placeholder="http://localhost:11434" />
                </div>
              )}
              <div className="field">
                <span className="field-label">Model ID</span>
                <input className="field-input mono" value={settings.modelId} onChange={(e) => settings.setSettings({ modelId: e.target.value })} />
              </div>
            </>
          )}
          {tab === 'sources' && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <span className="field-label" style={{ margin:0 }}>Context Sources</span>
                <AddSourceDropdown onAdd={(type) => addSource({ type, enabled: true, token: '', ...(type === 'github' ? { owner: '', repo: '' } : {}), ...(type === 'slack' ? { slackChannel: '' } : {}), ...(type === 'notion' ? { notionDatabaseId: '' } : {}) })} />
              </div>
              {sources.length === 0 && (
                <div style={{ textAlign:'center', padding:'32px 0', fontSize:12, color:'#3f3f46' }}>
                  No sources configured. Add GitHub, Slack, or Notion.
                </div>
              )}
              {sources.map((s, i) => (
                <SourceCard key={i} source={s} onUpdate={(u) => updateSource(i, u)} onRemove={() => removeSource(i)} />
              ))}
              <div className="field-hint" style={{ marginTop:16 }}>
                Tokens are stored locally only. API calls go directly from your machine to each provider.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AddSourceDropdown({ onAdd }: { onAdd: (type: ContextSourceType) => void }) {
  const [open, setOpen] = useState(false);
  const types: { type: ContextSourceType; label: string }[] = [
    { type: 'github', label: '🐙 GitHub' },
    { type: 'slack', label: '💬 Slack' },
    { type: 'notion', label: '📄 Notion' },
  ];
  return (
    <div style={{ position:'relative' }}>
      <button className="ctx-btn ctx-btn-collect" style={{ fontSize:11 }} onClick={() => setOpen(!open)}>+ Add Source</button>
      {open && (
        <div style={{ position:'absolute', right:0, top:'100%', marginTop:4, background:'#0c0c10', border:'1px solid #18181b', borderRadius:8, padding:4, zIndex:10, minWidth:160 }}>
          {types.map((t) => (
            <button key={t.type} onClick={() => { onAdd(t.type); setOpen(false); }} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', background:'none', border:'none', color:'#a1a1aa', fontSize:12, cursor:'pointer', fontFamily:'inherit', borderRadius:6 }}>
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceCard({ source, onUpdate, onRemove }: { source: ContextSourceConfig; onUpdate: (u: Partial<ContextSourceConfig>) => void; onRemove: () => void }) {
  const label = source.type === 'github' ? '🐙 GitHub' : source.type === 'slack' ? '💬 Slack' : '📄 Notion';
  return (
    <div className="source-card">
      <div className="source-card-header">
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span className="source-card-title">{label}</span>
          <button className={`source-toggle ${source.enabled ? 'on' : 'off'}`} onClick={() => onUpdate({ enabled: !source.enabled })}>
            {source.enabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <button className="source-remove" onClick={onRemove}>Remove</button>
      </div>
      <div className="field" style={{ marginBottom:10 }}>
        <span className="field-label">Token</span>
        <input className="field-input mono" type="password" value={source.token} onChange={(e) => onUpdate({ token: e.target.value })} placeholder={source.type === 'github' ? 'ghp_...' : source.type === 'slack' ? 'xoxb-...' : 'secret_...'} />
      </div>
      {source.type === 'github' && (
        <div className="source-row">
          <div className="field" style={{ flex:1, marginBottom:0 }}>
            <span className="field-label">Owner</span>
            <input className="field-input mono" value={source.owner || ''} onChange={(e) => onUpdate({ owner: e.target.value })} placeholder="org-or-user" />
          </div>
          <div className="field" style={{ flex:1, marginBottom:0 }}>
            <span className="field-label">Repo</span>
            <input className="field-input mono" value={source.repo || ''} onChange={(e) => onUpdate({ repo: e.target.value })} placeholder="repo-name" />
          </div>
        </div>
      )}
      {source.type === 'slack' && (
        <div className="field" style={{ marginBottom:0 }}>
          <span className="field-label">Channel ID (optional)</span>
          <input className="field-input mono" value={source.slackChannel || ''} onChange={(e) => onUpdate({ slackChannel: e.target.value })} placeholder="C01234567" />
        </div>
      )}
      {source.type === 'notion' && (
        <div className="field" style={{ marginBottom:0 }}>
          <span className="field-label">Database ID (optional)</span>
          <input className="field-input mono" value={source.notionDatabaseId || ''} onChange={(e) => onUpdate({ notionDatabaseId: e.target.value })} placeholder="abc123..." />
        </div>
      )}
    </div>
  );
}
