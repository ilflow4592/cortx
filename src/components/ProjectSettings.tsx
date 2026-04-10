import { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { Project } from '../types/project';

export function ProjectSettings({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { projects, updateProject } = useProjectStore();
  const project = projects.find((p) => p.id === projectId);
  const [branches, setBranches] = useState<string[]>([]);

  useEffect(() => {
    if (!project?.localPath) return;
    invoke<{ success: boolean; output: string }>('run_shell_command', {
      cwd: project.localPath,
      command: 'git branch -a --format="%(refname:short)"',
    })
      .then((r) => {
        if (r.success) setBranches(r.output.trim().split('\n').filter(Boolean));
      })
      .catch(() => {});
  }, [project?.localPath]);

  if (!project) return null;

  const update = (u: Partial<Project>) => updateProject(projectId, u);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: project.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--bg-surface)',
              }}
            >
              {project.name.charAt(0).toUpperCase()}
            </span>
            <h2>{project.name}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {/* Root path */}
          <div className="field">
            <span className="field-label">Root path</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="field-input mono"
                style={{ flex: 1 }}
                value={project.localPath}
                onChange={(e) => update({ localPath: e.target.value })}
                placeholder="Not set"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const selected = await open({ directory: true, multiple: false, title: 'Select root path' });
                    if (selected && typeof selected === 'string') update({ localPath: selected });
                  } catch {
                    /* ignore */
                  }
                }}
                style={{
                  padding: '0 14px',
                  background: 'var(--bg-chip)',
                  border: '1px solid #27272a',
                  borderRadius: 8,
                  color: 'var(--fg-muted)',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                }}
              >
                Browse...
              </button>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '12px 0' }} />

          {/* Base branch */}
          <div className="field">
            <span className="field-label">Branch new tasks from</span>
            <span className="field-hint" style={{ marginBottom: 8 }}>
              Each task creates an isolated worktree branched from this.
            </span>
            <BranchPicker
              value={project.baseBranch || 'main'}
              branches={branches}
              onChange={(b) => update({ baseBranch: b })}
            />
          </div>

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '12px 0' }} />

          {/* GitHub */}
          <div className="field">
            <span className="field-label">GitHub</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="field-input mono"
                style={{ flex: 1 }}
                value={project.githubOwner}
                onChange={(e) => update({ githubOwner: e.target.value })}
                placeholder="owner"
              />
              <span style={{ color: 'var(--fg-faint)', alignSelf: 'center', fontSize: 16 }}>/</span>
              <input
                className="field-input mono"
                style={{ flex: 1 }}
                value={project.githubRepo}
                onChange={(e) => update({ githubRepo: e.target.value })}
                placeholder="repo"
              />
            </div>
          </div>

          <div style={{ height: 1, background: '#1e1e26', margin: '12px 0' }} />

          {/* Slack channels */}
          <div className="field">
            <span className="field-label">Slack channels</span>
            <span className="field-hint" style={{ marginBottom: 8 }}>
              Link Slack channels to auto-collect relevant messages. AI filters for task relevance.
            </span>
            <SlackChannelInput
              channels={project.slackChannels || []}
              onChange={(channels) => update({ slackChannels: channels })}
            />
          </div>

          <div style={{ height: 1, background: '#1e1e26', margin: '12px 0' }} />

          {/* Project name */}
          <div className="field">
            <span className="field-label">Project name</span>
            <input className="field-input" value={project.name} onChange={(e) => update({ name: e.target.value })} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slack channel input ──
function SlackChannelInput({ channels, onChange }: { channels: string[]; onChange: (c: string[]) => void }) {
  const [input, setInput] = useState('');

  const addChannel = () => {
    const ch = input.trim();
    if (ch && !channels.includes(ch)) {
      onChange([...channels, ch]);
      setInput('');
    }
  };

  return (
    <div>
      {channels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {channels.map((ch) => (
            <span
              key={ch}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 6,
                background: 'var(--bg-chip)',
                border: '1px solid var(--border-muted)',
                fontSize: 11,
                color: 'var(--fg-muted)',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              #{ch}
              <button
                onClick={() => onChange(channels.filter((c) => c !== ch))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--fg-subtle)',
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: 0,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="field-input mono"
          style={{ flex: 1, fontSize: 12 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addChannel();
            }
          }}
          placeholder="Channel ID (e.g. C01234567)"
        />
        <button
          type="button"
          onClick={addChannel}
          disabled={!input.trim()}
          style={{
            padding: '0 14px',
            borderRadius: 8,
            fontSize: 12,
            background: input.trim() ? '#6366f1' : 'var(--bg-chip)',
            border: 'none',
            color: input.trim() ? '#fff' : 'var(--fg-subtle)',
            cursor: input.trim() ? 'pointer' : 'default',
            fontFamily: 'inherit',
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ── Searchable branch dropdown (Conductor style) ──
function BranchPicker({
  value,
  branches,
  onChange,
}: {
  value: string;
  branches: string[];
  onChange: (b: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = branches.filter((b) => b.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setSearch('');
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          background: 'var(--bg-chip)',
          border: '1px solid #27272a',
          borderRadius: 8,
          color: '#d4d4d8',
          fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace",
          cursor: 'pointer',
        }}
      >
        {value}
        <span style={{ fontSize: 10, color: 'var(--fg-subtle)', marginLeft: 4 }}>⌃</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            zIndex: 50,
            width: 320,
            background: '#0c0c10',
            border: '1px solid #27272a',
            borderRadius: 10,
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}
        >
          {/* Search */}
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--bg-chip)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ color: 'var(--fg-faint)', fontSize: 14 }}>🔍</span>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Select target branch..."
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#d4d4d8',
                fontSize: 13,
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Branch list */}
          <div style={{ maxHeight: 240, overflowY: 'auto', padding: 4 }}>
            {filtered.length === 0 && (
              <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--fg-faint)' }}>No branches found</div>
            )}
            {filtered.map((b) => (
              <button
                key={b}
                onClick={() => {
                  onChange(b);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '8px 12px',
                  background: value === b ? 'rgba(99,102,241,0.06)' : 'none',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 13,
                  color: value === b ? 'var(--fg-primary)' : 'var(--fg-muted)',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (value !== b) e.currentTarget.style.background = '#12121a';
                }}
                onMouseLeave={(e) => {
                  if (value !== b) e.currentTarget.style.background = 'none';
                }}
              >
                <span style={{ width: 16, textAlign: 'center', fontSize: 12, color: '#818cf8' }}>
                  {value === b ? '✓' : ''}
                </span>
                {b}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
