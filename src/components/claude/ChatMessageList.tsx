import { memo, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Paperclip } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from './types';

interface ChatMessageListProps {
  messages: Message[];
  loading: boolean;
  error: string;
  contextTotalCount: number;
  contextFileCount: number;
  endRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Virtualized chat message list with memoized message rendering.
 * - @tanstack/react-virtual handles windowing — only visible messages mount.
 * - MessageItem is memoized so streaming updates only re-render the changing message.
 * - Auto-scrolls to bottom when new messages arrive (unless user has scrolled up).
 */
export function ChatMessageList({
  messages,
  loading,
  error,
  contextTotalCount,
  contextFileCount,
  endRef,
}: ChatMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  // eslint-disable-next-line react-hooks/incompatible-library -- @tanstack/react-virtual returns memoized fns by design
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 8,
    measureElement:
      typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
  });

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
  }, [messages.length, loading]);

  if (messages.length === 0 && !loading) {
    return (
      <div className="chat-messages">
        <div className="empty-state" style={{ height: '100%' }}>
          <div className="empty-state-inner">
            <div className="empty-state-icon" />
            <div className="empty-state-title">Claude Code</div>
            <div className="empty-state-sub">
              Uses your Claude CLI authentication.
              <br />
              No API key or credits needed.
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

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div ref={parentRef} className="chat-messages" style={{ overflowY: 'auto' }}>
      <div style={{ height: totalSize, position: 'relative', width: '100%' }}>
        {items.map((virtualItem) => {
          const msg = messages[virtualItem.index];
          return (
            <div
              key={msg.id}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <MessageItem msg={msg} />
            </div>
          );
        })}
      </div>

      {loading && !messages.some((m) => m.role === 'assistant' || m.role === 'activity') && (
        <div className="msg">
          <div className="msg-avatar ai">C</div>
          <div className="msg-body" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
            <div className="loading-dot" />
            <span style={{ fontSize: 13, color: 'var(--fg-faint)' }}>Claude is thinking...</span>
          </div>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}
      <div ref={endRef} />
    </div>
  );
}

/**
 * Memoized message renderer.
 * Re-renders only when the message's id or content changes,
 * so Markdown parsing doesn't run for unchanged messages during streaming.
 */
const MessageItem = memo(
  function MessageItem({ msg }: { msg: Message }) {
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
          <div style={{ fontFamily: "'Fira Code', 'JetBrains Mono', monospace", whiteSpace: 'pre-wrap' }}>
            {msg.content}
          </div>
        </div>
      );
    }

    return (
      <div className="msg">
        <div className={`msg-avatar ${msg.role === 'user' ? 'user' : 'ai'}`}>{msg.role === 'user' ? 'U' : 'C'}</div>
        <div className="msg-body">
          <div className="msg-name">{msg.role === 'user' ? 'You' : 'Claude Code'}</div>
          <div className="msg-text" style={{ wordBreak: 'break-word' }}>
            {msg.role === 'assistant' ? (
              <Markdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{msg.content}</Markdown>
            ) : (
              <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.msg.id === next.msg.id && prev.msg.content === next.msg.content && prev.msg.role === next.msg.role,
);
