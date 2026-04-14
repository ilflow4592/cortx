/** 오른쪽 패널 상단 탭 바 (Projects / Changes) + Open-via 메뉴. */
import { ExternalLink, Braces, Code2, FolderOpen, TerminalSquare } from 'lucide-react';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export type UpperTab = 'projects' | 'changes';

interface Props {
  tabs: { key: UpperTab; label: string }[];
  active: UpperTab;
  onChange: (key: UpperTab) => void;
  cwd: string;
  showOpenMenu: boolean;
  onToggleOpenMenu: (v: boolean) => void;
}

export function UpperTabBar({ tabs, active, onChange, cwd, showOpenMenu, onToggleOpenMenu }: Props) {
  return (
    <div className="rp-tabs">
      {tabs.map((t) => (
        <button key={t.key} className={`rp-tab ${active === t.key ? 'active' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
      <div style={{ marginLeft: 'auto', position: 'relative', alignSelf: 'center' }}>
        <button
          onClick={() => onToggleOpenMenu(!showOpenMenu)}
          onBlur={() => setTimeout(() => onToggleOpenMenu(false), 150)}
          className="icon-btn-subtle"
          style={{
            background: 'none',
            border: '1px solid var(--border-strong)',
            borderRadius: 5,
            color: 'var(--fg-subtle)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            fontSize: 10,
            fontFamily: 'inherit',
          }}
        >
          <ExternalLink size={11} strokeWidth={1.5} />
          Open via
        </button>
        {showOpenMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => onToggleOpenMenu(false)} />
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: 4,
                background: 'var(--bg-chip)',
                border: '1px solid var(--border-strong)',
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                padding: 4,
                zIndex: 50,
                width: 180,
              }}
            >
              {[
                {
                  label: 'IntelliJ IDEA',
                  icon: <Braces size={14} color="var(--accent)" strokeWidth={1.5} />,
                  cmd: `open -a "IntelliJ IDEA" "${cwd}"`,
                },
                {
                  label: 'VS Code',
                  icon: <Code2 size={14} color="var(--accent)" strokeWidth={1.5} />,
                  cmd: `open -a "Visual Studio Code" --args "${cwd}"`,
                },
                {
                  label: 'Finder',
                  icon: <FolderOpen size={14} color="var(--accent)" strokeWidth={1.5} />,
                  cmd: `open "${cwd}"`,
                },
                {
                  label: 'Terminal',
                  icon: <TerminalSquare size={14} color="var(--accent)" strokeWidth={1.5} />,
                  cmd: `open -a Terminal "${cwd}"`,
                },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    invoke('run_shell_command', { cwd: '/', command: item.cmd }).catch(() => {});
                    onToggleOpenMenu(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    borderRadius: 5,
                    color: 'var(--fg-secondary)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--accent-bg)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'none';
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
