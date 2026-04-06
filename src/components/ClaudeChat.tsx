import { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useContextPackStore } from '../stores/contextPackStore';
import type { ContextItem } from '../types/contextPack';

interface ClaudeChatProps {
  taskId: string;
  cwd: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface SlashCommand {
  name: string;
  description: string;
  source: string;
}

const EMPTY_ARR: never[] = [];

function serializeContextItems(items: ContextItem[]): string {
  if (items.length === 0) return '';

  const sections: string[] = [];
  const bySource: Record<string, ContextItem[]> = {};

  for (const item of items) {
    const key = item.sourceType;
    if (!bySource[key]) bySource[key] = [];
    bySource[key].push(item);
  }

  const sourceLabels: Record<string, string> = {
    github: 'GitHub',
    slack: 'Slack',
    notion: 'Notion',
    pin: 'Pinned',
  };

  for (const [source, sourceItems] of Object.entries(bySource)) {
    const label = sourceLabels[source] || source;
    const lines = sourceItems.map((item) => {
      const parts = [`- **${item.title}**`];
      if (item.summary && item.summary !== 'Pinned') parts.push(`  ${item.summary}`);
      if (item.url && item.url.startsWith('http')) parts.push(`  ${item.url}`);
      if (item.metadata?.fullText) parts.push(`  > ${item.metadata.fullText.slice(0, 300)}`);
      return parts.join('\n');
    });
    sections.push(`## ${label}\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}

export function ClaudeChat({ taskId, cwd }: ClaudeChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const contextItemsRaw = useContextPackStore((s) => s.items[taskId]);
  const contextItems = contextItemsRaw || EMPTY_ARR;
  const endRef = useRef<HTMLDivElement>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Slash command state
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  // Load slash commands on mount
  useEffect(() => {
    invoke<SlashCommand[]>('list_slash_commands', { projectCwd: cwd || null })
      .then(setSlashCommands)
      .catch(() => {});
  }, [cwd]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      unlistenRefs.current.forEach((fn) => fn());
      unlistenRefs.current = [];
    };
  }, []);

  const filteredCommands = showSlashMenu
    ? slashCommands.filter((cmd) =>
        cmd.name.toLowerCase().includes(slashFilter.toLowerCase())
      )
    : [];

  // Reset index when filter changes
  useEffect(() => {
    setSlashIndex(0);
  }, [slashFilter]);

  // Scroll active slash item into view
  useEffect(() => {
    if (showSlashMenu && slashMenuRef.current) {
      const active = slashMenuRef.current.querySelector('.slash-item-active');
      active?.scrollIntoView({ block: 'nearest' });
    }
  }, [slashIndex, showSlashMenu]);

  const selectSlashCommand = useCallback((cmd: SlashCommand) => {
    setInput(`/${cmd.name} `);
    setShowSlashMenu(false);
    setSlashFilter('');
    inputRef.current?.focus();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);

    // Detect slash command trigger
    if (val.startsWith('/')) {
      const query = val.slice(1).split(' ')[0];
      // Only show menu if no space yet (still typing command name)
      if (!val.includes(' ') || val.indexOf(' ') > val.length - 1) {
        if (!val.includes(' ')) {
          setSlashFilter(query);
          setShowSlashMenu(true);
          return;
        }
      }
    }
    setShowSlashMenu(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSlashMenu && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        selectSlashCommand(filteredCommands[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setShowSlashMenu(false);
    setError('');
    setLoading(true);

    const userMsg: Message = { id: Date.now().toString(36), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);

    const reqId = `claude-${taskId}-${Date.now()}`;
    let response = '';

    try {
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

      const donePromise = new Promise<void>((resolve) => {
        listen(`claude-done-${reqId}`, () => {
          resolve();
        }).then((un) => unlistenRefs.current.push(un));
      });

      // Serialize all context items (non-file items as summary)
      const nonFileItems = contextItems.filter(
        (item) => !item.url || item.url.startsWith('http') || item.sourceType !== 'pin'
      );
      const contextSummary = serializeContextItems(nonFileItems);

      // Local file paths for --add-dir
      const contextFiles = contextItems
        .filter((item) => item.url && !item.url.startsWith('http'))
        .map((item) => item.url);

      await invoke('claude_spawn', {
        id: reqId,
        cwd: cwd || '/',
        message: text,
        contextFiles: contextFiles.length > 0 ? contextFiles : null,
        contextSummary: contextSummary || null,
      });

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

  const contextFileCount = contextItems.filter((i) => i.url && !i.url.startsWith('http')).length;
  const contextTotalCount = contextItems.length;

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
                {contextTotalCount > 0 && (
                  <>
                    <br />
                    <span style={{ color: '#818cf8' }}>
                      📎 {contextTotalCount} context items
                      {contextFileCount > 0 && ` (${contextFileCount} files)`}
                    </span>{' '}
                    will be included
                  </>
                )}
                <br />
                <span style={{ color: '#52525e', fontSize: 11 }}>
                  Type <code style={{ color: '#818cf8', background: '#232330', padding: '1px 4px', borderRadius: 3, fontSize: 11 }}>/</code> for commands
                </span>
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

      <div className="chat-input" style={{ position: 'relative' }}>
        {/* Slash command menu */}
        {showSlashMenu && filteredCommands.length > 0 && (
          <div className="slash-menu" ref={slashMenuRef}>
            {filteredCommands.map((cmd, i) => (
              <div
                key={cmd.name}
                className={`slash-item ${i === slashIndex ? 'slash-item-active' : ''}`}
                onMouseEnter={() => setSlashIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSlashCommand(cmd);
                }}
              >
                <div className="slash-item-name">
                  /{cmd.name}
                  {cmd.source !== 'builtin' && (
                    <span className="slash-item-source">{cmd.source}</span>
                  )}
                </div>
                <div className="slash-item-desc">{cmd.description}</div>
              </div>
            ))}
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setShowSlashMenu(false), 150)}
          placeholder="Send a message or type / for commands..."
          disabled={loading}
        />
        <div className="model-select" style={{ cursor: 'default' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 4px #34d399' }} />
          Claude Code (CLI)
          {contextTotalCount > 0 && (
            <span style={{ color: '#818cf8', marginLeft: 4, fontSize: 10 }}>
              📎{contextTotalCount}
            </span>
          )}
        </div>
        <button className="send-btn" onClick={handleSend} disabled={!input.trim() || loading}>↑</button>
      </div>
    </>
  );
}
