/** 오른쪽 패널 하단 탭 바 (Dashboard / Worktree / Context / History) + 배지. */

export type LowerTab = 'dashboard' | 'worktree' | 'context' | 'history';

interface Props {
  tabs: { key: LowerTab; label: string; badge?: number }[];
  active: LowerTab;
  onChange: (key: LowerTab) => void;
}

export function LowerTabBar({ tabs, active, onChange }: Props) {
  return (
    <div className="rp-tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`rp-tab ${active === t.key ? 'active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.badge && t.badge > 0 && (
            <span className="cp-new" style={{ marginLeft: 4 }}>
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
