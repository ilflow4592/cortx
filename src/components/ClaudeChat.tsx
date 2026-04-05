import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useContextPackStore } from '../stores/contextPackStore';

interface ClaudeChatProps {
  taskId: string;
  cwd: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const EMPTY_ARR: never[] = [];

export function ClaudeChat({ taskId, cwd }: ClaudeChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const contextItemsRaw = useContextPackStore((s) => s.items[taskId]);
  const contextItems = contextItemsRaw || EMPTY_ARR;
  const endRef = useRef<HTMLDivElement>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      unlistenRefs.current.forEach((fn) => fn());
      unlistenRefs.current = [];
    };
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setError('');
    setLoading(true);

    // Add user message
    const userMsg: Message = { id: Date.now().toString(36), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);

    // Unique ID for this request
    const reqId = `claude-${taskId}-${Date.now()}`;
    let response = '';

    try {
      // Listen for response data
      const unData = await listen<string>(`claude-data-${reqId}`, (event) => {
        response += event.payload;
        const assistantId = `${reqId}-reply`;
        setMessages((prev) => {
          const existing = prev.find((m) => m.id === assistantId);
          if (existing) {
            return prev.map((m) => m.id === assistantId ? { ...m, content: response } : m);
          }
          return [...prev, { id: assistantId, role: 'assistant', content: response }];
        });
      });
      unlistenRefs.current.push(unData);

      // Listen for completion
      const donePromise = new Promise<void>((resolve) => {
        listen(`claude-done-${reqId}`, () => {
          resolve();
        }).then((un) => unlistenRefs.current.push(un));
      });

      // Spawn claude -p "message" with context files
      const contextFiles = contextItems
        .filter((item) => item.url && !item.url.startsWith('http'))
        .map((item) => item.url);
      await invoke('claude_spawn', { id: reqId, cwd: cwd || '/', message: text, contextFiles: contextFiles.length > 0 ? contextFiles : null });

      // Wait for done
      await donePromise;

      if (!response.trim()) {
        setError('No response from Claude. Make sure `claude` CLI is installed and authenticated.');
      }
    } catch (err) {
      setError(`Failed: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="chat-messages">
        {messages.length === 0 && !loading && (
          <div className="empty-state" style={{ height: '100%' }}>
            <div className="empty-state-inner">
              <div className="empty-state-icon">🤖</div>
              <div className="empty-state-title">Claude Code</div>
              <div className="empty-state-sub">
                Uses your Claude CLI authentication.<br />
                No API key or credits needed.
                {contextItems.length > 0 && (
                  <><br /><span style={{ color: '#818cf8' }}>📎 {contextItems.filter(i => i.url && !i.url.startsWith('http')).length} files</span> will be included as context</>
                )}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="msg">
            <div className={`msg-avatar ${msg.role === 'user' ? 'user' : 'ai'}`}>
              {msg.role === 'user' ? 'U' : 'C'}
            </div>
            <div className="msg-body">
              <div className="msg-name">
                {msg.role === 'user' ? 'You' : 'Claude Code'}
              </div>
              <div className="msg-text" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="msg">
            <div className="msg-avatar ai">C</div>
            <div className="msg-body" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
              <div className="loading-dot" />
              <span style={{ fontSize: 13, color: '#52525b' }}>Claude is thinking...</span>
            </div>
          </div>
        )}

        {error && <div className="error-box">{error}</div>}
        <div ref={endRef} />
      </div>

      <div className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Send a message to Claude..."
          disabled={loading}
        />
        <div className="model-select" style={{ cursor: 'default' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 4px #34d399' }} />
          Claude Code (CLI)
        </div>
        <button className="send-btn" onClick={handleSend} disabled={!input.trim() || loading}>↑</button>
      </div>
    </>
  );
}
