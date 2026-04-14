import type { Project } from '../../types/project';
import type { TaskLayer } from '../../types/task';
import { LAYERS, slugify } from './types';
import { BranchPicker } from './BranchPicker';
import { openDialog } from './api';
import { useProjectStore } from '../../stores/projectStore';

interface TaskFormFieldsProps {
  title: string;
  setTitle: (v: string) => void;
  customBranch: string;
  setCustomBranch: (v: string) => void;
  projectId: string;
  setProjectId: (v: string) => void;
  layer: TaskLayer;
  setLayer: (v: TaskLayer) => void;
  projects: Project[];
  selectedProject: Project | undefined;
  branches: string[];
  showBranchPicker: boolean;
  setShowBranchPicker: (v: boolean) => void;
}

export function TaskFormFields({
  title,
  setTitle,
  customBranch,
  setCustomBranch,
  projectId,
  setProjectId,
  layer,
  setLayer,
  projects,
  selectedProject,
  branches,
  showBranchPicker,
  setShowBranchPicker,
}: TaskFormFieldsProps) {
  return (
    <>
      {/* Task title */}
      <div className="field">
        <span className="field-label">
          Task title <span style={{ color: '#6366f1' }}>*</span>
        </span>
        <input
          className="field-input"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. API 인증 리팩토링"
        />
        {/* Branch name */}
        {selectedProject?.localPath && (
          <div className="field">
            <span className="field-label">Branch name</span>
            <input
              className="field-input mono"
              style={{ fontSize: 12 }}
              value={customBranch}
              onChange={(e) => setCustomBranch(e.target.value)}
              placeholder={title.trim() ? `cortx/${slugify(title)}` : 'e.g. feat/auth-refactor'}
            />
          </div>
        )}

        {title.trim() && selectedProject?.localPath && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--fg-subtle)',
              marginTop: 2,
              marginBottom: 4,
              fontFamily: "'JetBrains Mono', monospace",
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span>{customBranch.trim() || `cortx/${slugify(title)}`}</span>
            <span style={{ color: 'var(--border-muted)' }}>·</span>
            <span>.worktrees/{slugify(title)}</span>
            <span style={{ color: 'var(--border-muted)' }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              from
              <BranchPicker
                branches={branches}
                currentBranch={selectedProject.baseBranch || 'main'}
                onSelect={(b) => {
                  useProjectStore.getState().updateProject(selectedProject.id, { baseBranch: b });
                  setShowBranchPicker(false);
                }}
                open={showBranchPicker}
                onToggle={() => setShowBranchPicker(!showBranchPicker)}
              />
            </span>
          </div>
        )}
      </div>

      {/* Project selector */}
      {projects.length > 0 && (
        <div className="field">
          <span className="field-label">Project</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button
              type="button"
              onClick={() => setProjectId('')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 500,
                border: !projectId ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--bg-chip)',
                background: !projectId ? 'rgba(99,102,241,0.06)' : 'var(--bg-surface)',
                color: !projectId ? '#818cf8' : 'var(--fg-subtle)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              None
            </button>
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProjectId(p.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 500,
                  border: projectId === p.id ? `1px solid ${p.color}40` : '1px solid var(--bg-chip)',
                  background: projectId === p.id ? `${p.color}0a` : 'var(--bg-surface)',
                  color: projectId === p.id ? p.color : '#71717a',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color, flexShrink: 0 }} />
                {p.name}
              </button>
            ))}
          </div>
          {selectedProject && !selectedProject.localPath && (
            <div
              style={{
                fontSize: 11,
                color: '#eab308',
                marginTop: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              ⚠ Project has no local path set.
              <button
                type="button"
                onClick={async () => {
                  try {
                    const selected = await openDialog({
                      directory: true,
                      multiple: false,
                      title: 'Select project folder',
                    });
                    if (selected && typeof selected === 'string') {
                      useProjectStore.getState().updateProject(selectedProject.id, { localPath: selected });
                    }
                  } catch {
                    /* cancelled */
                  }
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#818cf8',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  textDecoration: 'underline',
                }}
              >
                Set path
              </button>
            </div>
          )}
        </div>
      )}

      {/* Layer */}
      <div className="field">
        <span className="field-label">Layer</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {LAYERS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setLayer(l.value)}
              style={{
                flex: 1,
                padding: '8px 8px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 500,
                textAlign: 'center',
                border: layer === l.value ? `1px solid ${l.color}40` : '1px solid var(--bg-chip)',
                background: layer === l.value ? `${l.color}0a` : 'var(--bg-surface)',
                color: layer === l.value ? l.color : '#71717a',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {l.label}
              <br />
              <span style={{ fontSize: 9, opacity: 0.6 }}>{l.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
