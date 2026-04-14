/**
 * MainPanel의 탭 바 — Claude/Terminal/Context + 선택적 에디터 닫기 버튼.
 */
import { FileText, X } from 'lucide-react';

export type MainTab = 'claude' | 'terminal' | 'context' | 'editor';

export interface TabDef {
  key: MainTab;
  label: string;
  badge?: number;
  closable?: boolean;
}

interface Props {
  tabs: TabDef[];
  activeTab: MainTab;
  onSelect: (tab: MainTab) => void;
  onCloseEditor: () => void;
}

export function TaskTabBar({ tabs, activeTab, onSelect, onCloseEditor }: Props) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`tab ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => onSelect(tab.key)}
        >
          {tab.closable && <FileText size={14} strokeWidth={1.5} style={{ marginRight: 4 }} />}
          {tab.label}
          {tab.badge && tab.badge > 0 && <span className="badge">{tab.badge}</span>}
          {tab.closable && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Close editor"
              onClick={(e) => {
                e.stopPropagation();
                onCloseEditor();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onCloseEditor();
                }
              }}
              style={{
                marginLeft: 6,
                color: 'var(--fg-subtle)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <X size={12} strokeWidth={1.5} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
