import type { Dispatch, SetStateAction } from 'react';
import { GitHubIcon, SlackIcon, NotionIcon, ObsidianIcon } from '../SourceIcons';
import { SEARCH_MCP_REGISTRY } from '../../config/searchResources';
import type { McpServerStatus } from '../../stores/contextPackStore';

interface SearchResourcesGridProps {
  mcpServers: McpServerStatus[];
  searchResources: Set<string>;
  setSearchResources: Dispatch<SetStateAction<Set<string>>>;
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  github: <GitHubIcon size={12} color="currentColor" />,
  notion: <NotionIcon size={12} color="currentColor" />,
  slack: <SlackIcon size={12} />,
  obsidian: <ObsidianIcon size={12} />,
  context7: <span style={{ fontSize: 11 }}>📚</span>,
  tavily: <span style={{ fontSize: 11 }}>🔍</span>,
  secall: <span style={{ fontSize: 11 }}>🧠</span>,
  serena: <span style={{ fontSize: 11 }}>🔬</span>,
};

const CATEGORIES: { key: 'services' | 'research'; label: string }[] = [
  { key: 'services', label: 'Services' },
  { key: 'research', label: 'Research' },
];

export function SearchResourcesGrid({ mcpServers, searchResources, setSearchResources }: SearchResourcesGridProps) {
  const searchableServices = mcpServers.filter(
    (s) => s.serviceType !== 'other' && s.status === 'ready' && SEARCH_MCP_REGISTRY[s.serviceType],
  );
  const uniqueServices = searchableServices.filter(
    (s, i, arr) => arr.findIndex((x) => x.serviceType === s.serviceType) === i,
  );
  if (uniqueServices.length === 0) return null;

  return (
    <div style={{ marginBottom: 10 }}>
      {CATEGORIES.map((cat) => {
        const catServices = uniqueServices.filter(
          (s) => SEARCH_MCP_REGISTRY[s.serviceType]?.category === cat.key,
        );
        if (catServices.length === 0) return null;
        return (
          <div key={cat.key} style={{ marginBottom: 8 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 1,
                color: 'var(--fg-faint)',
                marginBottom: 5,
              }}
            >
              {cat.label}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {catServices.map((s) => {
                const checked = searchResources.has(s.serviceType);
                const entry = SEARCH_MCP_REGISTRY[s.serviceType];
                return (
                  <div key={s.serviceType} style={{ position: 'relative' }} className="search-resource-item">
                    <button
                      onClick={() => {
                        setSearchResources((prev) => {
                          const next = new Set(prev);
                          if (next.has(s.serviceType)) next.delete(s.serviceType);
                          else next.add(s.serviceType);
                          return next;
                        });
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 12px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 500,
                        background: checked ? 'var(--accent-bg)' : 'var(--bg-chip)',
                        border: `1px solid ${checked ? 'var(--accent-bg)' : 'var(--bg-surface-hover)'}`,
                        color: checked ? 'var(--accent-bright)' : 'var(--fg-faint)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          border: `1.5px solid ${checked ? 'var(--accent-bright)' : 'var(--fg-dim)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 8,
                          flexShrink: 0,
                        }}
                      >
                        {checked && '✓'}
                      </span>
                      {SERVICE_ICONS[s.serviceType]}
                      {entry?.label || s.serviceType}
                    </button>
                    <div className="search-resource-tooltip">
                      {entry?.description || s.serviceType}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
