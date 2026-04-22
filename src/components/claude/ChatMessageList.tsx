import { memo, useEffect, useRef, useState } from 'react';
import { Paperclip, ChevronRight } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useT } from '../../i18n';
import type { Message, RawEvent } from './types';
import type { PipelineState } from '../../types/task';
import { PlanApprovalCard } from './PlanApprovalCard';
import { colorForKind, summarizeEvent } from './rawEventFormatter';

/**
 * Live elapsed-seconds counter for an activity message. Updates every second
 * so the user can tell "slow" vs "genuinely stuck".
 */
function ElapsedCounter({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const label = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
  const stale = seconds >= 60;
  return (
    <span
      style={{
        fontSize: 10,
        color: stale ? 'var(--fg-faint, #f59e0b)' : 'var(--fg-dim)',
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

interface ChatMessageListProps {
  messages: Message[];
  loading: boolean;
  error: string;
  contextTotalCount: number;
  contextFileCount: number;
  endRef: React.RefObject<HTMLDivElement | null>;
  taskId: string;
  pipeline?: PipelineState;
  expandedMessageIds: Set<string>;
  onToggleRawEvents: (messageId: string) => void;
}

/**
 * Chat message list with memoized message rendering.
 * Uses simple scroll container instead of virtualizer to avoid
 * absolute-positioning issues during streaming content updates.
 * Auto-scrolls to bottom when new messages arrive (unless user has scrolled up).
 */
export function ChatMessageList({
  messages,
  loading,
  error,
  contextTotalCount,
  contextFileCount,
  endRef,
  taskId,
  pipeline,
  expandedMessageIds,
  onToggleRawEvents,
}: ChatMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const t = useT();

  // Track whether user has scrolled away from the bottom
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 80;
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll to bottom on new messages (only if user is near the bottom)
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = parentRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  if (messages.length === 0 && !loading) {
    return (
      <div className="chat-messages">
        <div className="empty-state" style={{ height: '100%' }}>
          <div className="empty-state-inner">
            <div className="empty-state-icon" />
            <div className="empty-state-title">{t('empty.claudeCode')}</div>
            <div className="empty-state-sub">
              {t('empty.claudeCode.sub1')}
              <br />
              {t('empty.claudeCode.sub2')}
              {contextTotalCount > 0 && (
                <>
                  <br />
                  <span style={{ color: 'var(--accent-bright)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Paperclip size={12} strokeWidth={1.5} /> {contextTotalCount} context items
                    {contextFileCount > 0 && ` (${contextFileCount} files)`}
                  </span>{' '}
                  will be included
                </>
              )}
              <br />
              <span style={{ color: 'var(--fg-faint)', fontSize: 11 }}>
                Type{' '}
                <code
                  style={{
                    color: 'var(--accent-bright)',
                    background: 'var(--bg-surface-hover)',
                    padding: '1px 4px',
                    borderRadius: 3,
                    fontSize: 11,
                  }}
                >
                  /
                </code>{' '}
                for commands
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show thinking indicator when loading and last message is from user (waiting for response)
  const lastMsg = messages[messages.length - 1];
  const showThinking = loading && (!lastMsg || lastMsg.role === 'user');

  return (
    <div ref={parentRef} className="chat-messages" style={{ overflowY: 'auto' }}>
      {messages.map((msg) => (
        <MessageItem key={msg.id} msg={msg} expanded={expandedMessageIds.has(msg.id)} onToggleRaw={onToggleRawEvents} />
      ))}

      {showThinking && (
        <div className="msg">
          <div className="msg-avatar ai">C</div>
          <div className="msg-body" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
            <div className="loading-dot" />
            <span style={{ fontSize: 13, color: 'var(--fg-faint)' }}>{t('chat.thinking')}</span>
          </div>
        </div>
      )}

      {pipeline?.pendingPlanApproval && (
        <PlanApprovalCard
          taskId={taskId}
          plan={pipeline.pendingPlanApproval.plan}
          planFilePath={pipeline.pendingPlanApproval.planFilePath}
        />
      )}

      {error && <div className="error-box">{error}</div>}
      <div ref={endRef as React.RefObject<HTMLDivElement>} />
    </div>
  );
}

/**
 * Memoized message renderer.
 * Re-renders only when the message's id or content changes,
 * so Markdown parsing doesn't run for unchanged messages during streaming.
 */
const MessageItem = memo(
  function MessageItem({
    msg,
    expanded,
    onToggleRaw,
  }: {
    msg: Message;
    expanded: boolean;
    onToggleRaw: (id: string) => void;
  }) {
    if (msg.role === 'activity') {
      const multiline = msg.content.includes('\n');
      return (
        <div
          style={{
            display: 'flex',
            alignItems: multiline ? 'flex-start' : 'center',
            gap: 8,
            padding: '4px 16px',
            fontSize: 11,
            color: 'var(--fg-subtle)',
          }}
        >
          <div
            className="spinner"
            style={{
              width: 10,
              height: 10,
              borderWidth: 1.5,
              flexShrink: 0,
              marginTop: multiline ? 2 : 0,
            }}
          />
          <div
            style={{
              fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
              whiteSpace: 'pre-wrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {msg.content}
          </div>
          {msg.startedAt && <ElapsedCounter startedAt={msg.startedAt} />}
        </div>
      );
    }

    const rawEventCount = msg.rawEvents?.length ?? 0;
    const showRawToggle = msg.role === 'assistant' && rawEventCount > 0;

    return (
      <div className="msg">
        <div className={`msg-avatar ${msg.role === 'user' ? 'user' : 'ai'}`}>{msg.role === 'user' ? 'U' : 'C'}</div>
        <div className="msg-body">
          <div
            className="msg-name"
            style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{msg.role === 'user' ? 'You' : 'Claude Code'}</span>
              <GuardrailMarks marks={msg.guardrailMarks} />
            </span>
            {showRawToggle && (
              <button
                type="button"
                onClick={() => onToggleRaw(msg.id)}
                title={expanded ? 'Collapse raw log (⌘/Ctrl+O)' : 'Expand raw log (⌘/Ctrl+O)'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 10,
                  padding: '2px 6px',
                  border: '1px solid var(--border, #333)',
                  borderRadius: 3,
                  background: expanded ? 'var(--bg-surface-hover, #2a2a2a)' : 'transparent',
                  color: 'var(--fg-dim)',
                  cursor: 'pointer',
                  fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                }}
              >
                <ChevronRight
                  size={10}
                  style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}
                />
                {rawEventCount} event{rawEventCount === 1 ? '' : 's'}
              </button>
            )}
          </div>
          <div className="msg-text" style={{ wordBreak: 'break-word' }}>
            {msg.role === 'assistant' ? (
              <Markdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{msg.content}</Markdown>
            ) : (
              <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
            )}
          </div>
          {showRawToggle && expanded && <RawEventsPanel events={msg.rawEvents!} />}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.msg.id === next.msg.id &&
    prev.msg.content === next.msg.content &&
    prev.msg.role === next.msg.role &&
    prev.msg.startedAt === next.msg.startedAt &&
    (prev.msg.guardrailMarks?.length || 0) === (next.msg.guardrailMarks?.length || 0) &&
    (prev.msg.rawEvents?.length || 0) === (next.msg.rawEvents?.length || 0) &&
    prev.expanded === next.expanded &&
    prev.onToggleRaw === next.onToggleRaw,
);

function RawEventsPanel({ events }: { events: RawEvent[] }) {
  return (
    <div
      style={{
        marginTop: 8,
        border: '1px solid var(--border, #333)',
        borderRadius: 4,
        background: 'var(--bg-surface, #1a1a1a)',
        fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
        fontSize: 11,
      }}
    >
      {events.map((ev, i) => (
        <RawEventRow key={i} event={ev} />
      ))}
    </div>
  );
}

function RawEventRow({ event }: { event: RawEvent }) {
  const [open, setOpen] = useState(false);
  const summary = summarizeEvent(event);
  const colors = colorForKind(event.kind);
  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle, #222)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          textAlign: 'left',
          padding: '4px 8px',
          background: 'transparent',
          border: 'none',
          color: 'var(--fg)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 'inherit',
        }}
      >
        <ChevronRight size={10} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }} />
        <span
          style={{
            display: 'inline-block',
            padding: '0 5px',
            border: `1px solid ${colors.border}`,
            background: colors.bg,
            color: colors.fg,
            borderRadius: 2,
            fontSize: 9,
            fontWeight: 600,
            minWidth: 64,
            textAlign: 'center',
          }}
        >
          {event.kind}
        </span>
        <span
          style={{
            color: 'var(--fg-dim)',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {summary.label}
          {summary.detail && <span style={{ color: 'var(--fg-faint)' }}> — {summary.detail}</span>}
        </span>
      </button>
      {open && (
        <pre
          style={{
            margin: 0,
            padding: '6px 10px 10px 26px',
            maxHeight: 400,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--fg-dim)',
            fontSize: 10.5,
            lineHeight: 1.5,
          }}
        >
          {summary.pretty}
        </pre>
      )}
    </div>
  );
}

const MARK_LABEL: Record<string, { label: string; color: string }> = {
  secret_masked: { label: '🛡 secret masked', color: '#ef4444' },
  q_trimmed: { label: '🛡 Q trimmed', color: '#f59e0b' },
  confirmation_added: { label: '🛡 confirmation added', color: '#f59e0b' },
  canary_blocked: { label: '🛡 injection blocked', color: '#dc2626' },
};

function GuardrailMarks({ marks }: { marks?: { type: string; detail?: string }[] }) {
  if (!marks || marks.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {marks.map((m, i) => {
        const meta = MARK_LABEL[m.type];
        if (!meta) return null;
        return (
          <span
            key={i}
            title={m.detail ? `${meta.label}: ${m.detail}` : meta.label}
            style={{
              fontSize: 9,
              color: meta.color,
              border: `1px solid ${meta.color}`,
              borderRadius: 3,
              padding: '0 4px',
              fontWeight: 600,
            }}
          >
            {meta.label}
          </span>
        );
      })}
    </span>
  );
}
