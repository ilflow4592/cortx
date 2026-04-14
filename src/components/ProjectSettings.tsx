import { useState, useEffect } from 'react';
import { useProjectStore } from '../stores/projectStore';
import type { Project } from '../types/project';
import { ProjectScanPanel } from './project-settings/ProjectScanPanel';
import { SlackChannelInput } from './project-settings/SlackChannelInput';
import { BranchPicker } from './project-settings/BranchPicker';

// Tauri API는 동적 import (CLAUDE.md 규칙 + quality gate).
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}
async function openDialog(opts: { directory?: boolean; multiple?: boolean; title?: string }) {
  const mod = await import('@tauri-apps/plugin-dialog');
  return mod.open(opts);
}

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
                    const selected = await openDialog({ directory: true, multiple: false, title: 'Select root path' });
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

          <div style={{ height: 1, background: '#1e1e26', margin: '12px 0' }} />

          {/* Project context scan */}
          <ProjectScanPanel project={project} />
        </div>
      </div>
    </div>
  );
}
