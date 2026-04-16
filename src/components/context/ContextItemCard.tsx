import { useContextPackStore } from '../../stores/contextPackStore';
import type { ContextItem } from '../../types/contextPack';
import { GitHubIcon, SlackIcon, NotionIcon, PinIcon } from '../SourceIcons';
import { deriveTrustLevel, scanForInjection } from '../../services/contextSanitizer';

interface ContextItemCardProps {
  taskId: string;
  item: ContextItem;
  onPreview: (url: string) => void;
}

function sourceIcon(t: string) {
  if (t === 'github') return <GitHubIcon size={14} color="var(--fg-muted)" />;
  if (t === 'slack') return <SlackIcon size={14} />;
  if (t === 'notion') return <NotionIcon size={14} color="var(--fg-muted)" />;
  return <PinIcon size={14} />;
}

/**
 * fullText fetch 상태 배지. URL이 있는 외부 소스에만 의미 있음 (로컬 파일 path는 skip).
 * - fetching: eager fetch 진행 중
 * - ready: fullText 채워짐 (대략 KB 단위 표시)
 * - missing: URL 있는데 본문 못 가져옴 → 사용자가 paste 권장
 */
function FullTextBadge({ item }: { item: ContextItem }) {
  if (!item.url || !item.url.startsWith('http')) return null;
  const ft = item.metadata?.fullText;
  if (item.metadata?.fetching === '1') return <span className="cp-badge fetching">fetching…</span>;
  if (ft) {
    const kb = (ft.length / 1024).toFixed(ft.length < 1024 ? 0 : 1);
    return <span className="cp-badge ready">ready · {kb}k</span>;
  }
  return <span className="cp-badge missing">no body</span>;
}

/** Trust level badge — Provenance marking (공격 표면 가시화) */
function TrustBadge({ sourceType }: { sourceType: string }) {
  const level = deriveTrustLevel(sourceType);
  const color = level === 'high' ? 'var(--accent-bright)' : level === 'medium' ? 'var(--fg-muted)' : '#f87171';
  const label = level === 'high' ? 'trusted' : level === 'medium' ? 'team' : 'untrusted';
  return (
    <span
      title={`Trust level: ${level}`}
      style={{
        fontSize: 9,
        color,
        border: `1px solid ${color}`,
        borderRadius: 3,
        padding: '0 4px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
      }}
    >
      {label}
    </span>
  );
}

/** Prompt injection 경고 배지 — fullText에 의심 패턴 있을 때만 표시 */
function InjectionWarningBadge({ item }: { item: ContextItem }) {
  const ft = item.metadata?.fullText;
  if (!ft) return null;
  const findings = scanForInjection(ft);
  if (findings.length === 0) return null;
  const worst = findings.reduce(
    (acc, f) => (severityRank(f.severity) > severityRank(acc) ? f.severity : acc),
    'low' as 'low' | 'medium' | 'high',
  );
  return (
    <span
      title={`Possible prompt injection (${findings.length}): ${findings.map((f) => f.pattern).join(', ')}`}
      style={{
        fontSize: 9,
        color: worst === 'high' ? '#ef4444' : '#f59e0b',
        border: `1px solid ${worst === 'high' ? '#ef4444' : '#f59e0b'}`,
        borderRadius: 3,
        padding: '0 4px',
        fontWeight: 600,
      }}
    >
      ⚠ injection?
    </span>
  );
}

function severityRank(s: 'low' | 'medium' | 'high'): number {
  return s === 'high' ? 3 : s === 'medium' ? 2 : 1;
}

export function ContextItemCard({ taskId, item, onPreview }: ContextItemCardProps) {
  return (
    <div className="cp-item" style={{ position: 'relative' }}>
      <div className="cp-icon">{sourceIcon(item.sourceType)}</div>
      <div className="cp-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {item.url ? (
            <button
              type="button"
              className="cp-name"
              style={{
                cursor: 'pointer',
                textDecoration: 'underline',
                textDecorationColor: 'var(--fg-dim)',
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'inherit',
                font: 'inherit',
                textAlign: 'left',
              }}
              onClick={() => onPreview(item.url)}
            >
              {item.title}
            </button>
          ) : (
            <span className="cp-name">{item.title}</span>
          )}
          {item.isNew && <span className="cp-new">NEW</span>}
          <TrustBadge sourceType={item.sourceType} />
          <InjectionWarningBadge item={item} />
          <FullTextBadge item={item} />
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 10, color: 'var(--fg-faint)', flexShrink: 0 }}
              title="Open in browser"
            >
              ↗
            </a>
          )}
        </div>
        <div className="cp-sub">{item.summary}</div>
      </div>
      <button
        onClick={() => useContextPackStore.getState().removeItem(taskId, item.id)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--fg-dim)',
          cursor: 'pointer',
          fontSize: 12,
          position: 'absolute',
          right: 0,
          top: 8,
        }}
      >
        ×
      </button>
    </div>
  );
}
