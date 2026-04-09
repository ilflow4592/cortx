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

export function ChatMessageList({
  messages,
  loading,
  error,
  contextTotalCount,
  contextFileCount,
  endRef,
}: ChatMessageListProps) {
  return (
    <div className="chat-messages">
      {messages.length === 0 && !loading && (
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
                  <span style={{ color: '#7dbdbd', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Paperclip size={12} strokeWidth={1.5} /> {contextTotalCount} context items
                    {contextFileCount > 0 && ` (${contextFileCount} files)`}
                  </span>{' '}
                  will be included
                </>
              )}
              <br />
              <span style={{ color: '#4d5868', fontSize: 11 }}>
                Type{' '}
                <code
                  style={{
                    color: '#7dbdbd',
                    background: '#242d38',
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
      )}

      {messages.map((msg) =>
        msg.role === 'activity' ? (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              alignItems: msg.content.includes('\n') ? 'flex-start' : 'center',
              gap: 8,
              padding: '4px 16px',
              fontSize: 11,
              color: '#6b6b78',
            }}
          >
            <div
              className="spinner"
              style={{
                width: 10,
                height: 10,
                borderWidth: 1.5,
                flexShrink: 0,
                marginTop: msg.content.includes('\n') ? 2 : 0,
              }}
            />
            <div style={{ fontFamily: "'Fira Code', 'JetBrains Mono', monospace", whiteSpace: 'pre-wrap' }}>
              {msg.content}
            </div>
          </div>
        ) : (
          <div key={msg.id} className="msg">
            <div className={`msg-avatar ${msg.role === 'user' ? 'user' : 'ai'}`}>
              {msg.role === 'user' ? 'U' : 'C'}
            </div>
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
        ),
      )}

      {loading && (
        <div className="msg">
          <div className="msg-avatar ai">C</div>
          <div className="msg-body" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
            <div className="loading-dot" />
            <span style={{ fontSize: 13, color: '#4d5868' }}>Claude is thinking...</span>
          </div>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}
      <div ref={endRef} />
    </div>
  );
}
