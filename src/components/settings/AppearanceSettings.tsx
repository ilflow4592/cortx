/**
 * Appearance settings — theme picker (dark / midnight / light).
 */
import { useSettingsStore, type Theme } from '../../stores/settingsStore';

interface ThemeOption {
  id: Theme;
  label: string;
  description: string;
  preview: { bg: string; fg: string; accent: string; border: string };
}

const THEMES: ThemeOption[] = [
  {
    id: 'dark',
    label: 'Dark',
    description: 'Classic Cortx teal — the default',
    preview: { bg: '#0f1419', fg: '#e8eef5', accent: '#5aa5a5', border: '#2a3642' },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Deep black with purple accents',
    preview: { bg: '#050508', fg: 'var(--fg-primary)', accent: '#9f7aea', border: '#242430' },
  },
  {
    id: 'light',
    label: 'Light',
    description: 'Daytime-friendly bright theme',
    preview: { bg: '#f5f7fa', fg: '#1a1f2e', accent: '#388585', border: '#b0b9c8' },
  },
];

export function AppearanceSettings() {
  const theme = useSettingsStore((s) => s.theme);
  const setSettings = useSettingsStore((s) => s.setSettings);

  return (
    <div>
      <div className="field">
        <span className="field-label">Theme</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 6 }}>
          {THEMES.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSettings({ theme: t.id })}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: active ? 'var(--accent-bg)' : 'var(--bg-surface)',
                  border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border-muted)'}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  transition: 'all 150ms ease',
                  outline: 'none',
                }}
              >
                {/* Preview card */}
                <div
                  style={{
                    height: 60,
                    borderRadius: 6,
                    background: t.preview.bg,
                    border: `1px solid ${t.preview.border}`,
                    marginBottom: 10,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      right: 8,
                      height: 4,
                      background: t.preview.fg,
                      opacity: 0.6,
                      borderRadius: 2,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 18,
                      left: 8,
                      width: '60%',
                      height: 3,
                      background: t.preview.fg,
                      opacity: 0.3,
                      borderRadius: 2,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 8,
                      left: 8,
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      background: t.preview.accent,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 12,
                      left: 32,
                      width: '40%',
                      height: 4,
                      background: t.preview.accent,
                      borderRadius: 2,
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: active ? 'var(--accent-bright)' : 'var(--fg-primary)',
                    marginBottom: 4,
                  }}
                >
                  {t.label}
                  {active && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent-bright)' }}>✓</span>}
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{t.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          padding: 12,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-muted)',
          borderRadius: 6,
          fontSize: 11,
          color: 'var(--fg-muted)',
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: 'var(--fg-secondary)' }}>Note:</strong> Some components still use hard-coded colors
        and may not fully reflect the theme yet. CSS-class-based UI (sidebar, dock, status bar, main header) updates
        immediately. Inline-styled components will be migrated incrementally.
      </div>
    </div>
  );
}
