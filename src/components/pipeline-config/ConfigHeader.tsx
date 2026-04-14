import { useState } from 'react';
import { X, Save, FileCode, RotateCcw } from 'lucide-react';

interface ConfigHeaderProps {
  projectName: string;
  filePath: string;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  onRevert: () => void;
  onResetToDefault: () => void;
  onClose: () => void;
}

export function ConfigHeader({
  projectName,
  filePath,
  dirty,
  saving,
  saved,
  onSave,
  onRevert,
  onResetToDefault,
  onClose,
}: ConfigHeaderProps) {
  return (
    <div
      style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--border-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
      }}
    >
      <FileCode size={16} color="var(--accent)" strokeWidth={1.5} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)' }}>
          Pipeline Config {dirty && <span style={{ color: '#eab308', fontSize: 11 }}>● unsaved</span>}
          {saved && <span style={{ color: '#34d399', fontSize: 11 }}>✓ saved</span>}
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--fg-faint)',
            fontFamily: "'JetBrains Mono', monospace",
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={filePath}
        >
          {projectName} · .cortx/pipeline.json
        </div>
      </div>
      <HoverIconButton onClick={onResetToDefault} hoverColor="#eab308" title="Reset to default template">
        <RotateCcw size={14} strokeWidth={1.5} />
      </HoverIconButton>
      <HoverIconButton
        onClick={onRevert}
        hoverColor="var(--fg-subtle)"
        title="Revert unsaved changes"
        disabled={!dirty}
      >
        <X size={14} strokeWidth={1.5} />
      </HoverIconButton>
      <button
        onClick={onSave}
        disabled={saving || !dirty}
        style={{
          padding: '6px 14px',
          borderRadius: 5,
          fontSize: 11,
          fontWeight: 500,
          background: dirty ? 'var(--accent-bg)' : 'rgba(55,65,81,0.3)',
          border: `1px solid ${dirty ? 'var(--accent-border)' : 'var(--border-muted)'}`,
          color: dirty ? 'var(--accent-bright)' : 'var(--fg-faint)',
          cursor: dirty && !saving ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          transition: 'all 120ms ease',
        }}
      >
        <Save size={12} strokeWidth={1.5} />
        {saving ? 'Saving...' : 'Save'}
        <span style={{ fontSize: 9, color: 'var(--fg-faint)', marginLeft: 4 }}>⌘S</span>
      </button>
      <CloseButton onClose={onClose} />
    </div>
  );
}

function HoverIconButton({
  onClick,
  hoverColor,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  hoverColor: string;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      title={title}
      style={{
        background: !disabled && hovered ? `${hoverColor}15` : 'none',
        border: `1px solid ${!disabled && hovered ? `${hoverColor}40` : 'transparent'}`,
        color: disabled ? 'var(--fg-dim)' : hovered ? hoverColor : 'var(--fg-subtle)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        borderRadius: 5,
        transition: 'all 120ms ease',
      }}
    >
      {children}
    </button>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClose}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(239,68,68,0.1)' : 'none',
        border: `1px solid ${hovered ? 'rgba(239,68,68,0.25)' : 'transparent'}`,
        color: hovered ? '#ef4444' : 'var(--fg-faint)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        borderRadius: 5,
        transition: 'all 120ms ease',
      }}
    >
      <X size={16} strokeWidth={1.5} />
    </button>
  );
}
