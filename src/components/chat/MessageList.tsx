import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../../types/task';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  emptyState?: React.ReactNode;
}

/**
 * Scrollable chat message list — renders each message with an avatar,
 * the loading "Thinking..." indicator, and error box. Auto-scrolls to
 * the bottom when a new message is appended.
 */
export function MessageList({ messages, isLoading, error, emptyState }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="chat-messages">
      {messages.length === 0 && emptyState}
      {messages.map((msg) => (
        <div key={msg.id} className="msg">
          <div className={`msg-avatar ${msg.role === 'assistant' ? 'ai' : 'user'}`}>
            {msg.role === 'assistant' ? 'C' : 'IL'}
          </div>
          <div className="msg-body">
            <div className="msg-name">{msg.role === 'assistant' ? msg.model || 'AI' : 'ilya'}</div>
            <div className="msg-text" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {msg.content}
            </div>
          </div>
        </div>
      ))}
      {isLoading && (
        <div className="msg">
          <div className="msg-avatar ai">C</div>
          <div className="msg-body" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
            <div className="loading-dot" />
            <span style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>Thinking...</span>
          </div>
        </div>
      )}
      {error && <div className="error-box">{error}</div>}
      <div ref={endRef} />
    </div>
  );
}
