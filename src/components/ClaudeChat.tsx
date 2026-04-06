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
  role: 'user' | 'assistant' | 'activity';
  content: string;
  toolName?: string;
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

  const resolveSlashCommand = async (text: string): Promise<string> => {
    if (!text.startsWith('/')) return text;

    const parts = text.slice(1).split(/\s+/);
    const cmdName = parts[0];
    const args = parts.slice(1).join(' ');
    const filePath = cmdName.replace(/:/g, '/') + '.md';

    for (const base of ['~/.claude/commands', `${cwd}/.claude/commands`]) {
      try {
        const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
          cwd: '/',
          command: `cat "${base}/${filePath}" 2>/dev/null`,
        });
        if (result.success && result.output.trim()) {
          let prompt = result.output;
          prompt = prompt.replace(/\$ARGUMENTS/g, args);
          return prompt;
        }
      } catch { /* continue */ }
    }

    return text;
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;

    setInput('');
    setShowSlashMenu(false);
    setError('');

    setLoading(true);

    const userMsg: Message = { id: Date.now().toString(36), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);

    // Resolve slash command to full prompt
    const resolvedText = await resolveSlashCommand(text);

    const reqId = `claude-${taskId}-${Date.now()}`;
    let response = '';

    try {
      // Track current message ID — each new assistant turn gets a new ID
      let currentMsgId = '';
      let turnCounter = 0;
      const activityId = `${reqId}-activity`;

      const unData = await listen<string>(`claude-data-${reqId}`, (event) => {
        const line = event.payload;

        // Try to parse stream-json
        try {
          const evt = JSON.parse(line);

          if (evt.type === 'assistant' && evt.message?.content) {
            // Check for text content
            const textBlocks = (evt.message.content as Array<{ type: string; text?: string }>)
              .filter((b: { type: string }) => b.type === 'text')
              .map((b: { text?: string }) => b.text || '');

            // Check for tool_use content
            const toolBlocks = (evt.message.content as Array<{ type: string; name?: string }>)
              .filter((b: { type: string }) => b.type === 'tool_use');

            if (textBlocks.length > 0) {
              // New assistant turn — create a new message
              turnCounter++;
              currentMsgId = `${reqId}-turn-${turnCounter}`;
              response = textBlocks.join('');
              setMessages((prev) => {
                const filtered = prev.filter((m) => m.id !== activityId);
                return [...filtered, { id: currentMsgId, role: 'assistant', content: response }];
              });
            }

            if (toolBlocks.length > 0) {
              const toolLabel = toolBlocks.map((b) => b.name || 'tool').join(', ');
              setMessages((prev) => {
                const filtered = prev.filter((m) => m.id !== activityId);
                return [...filtered, { id: activityId, role: 'activity', content: `Using ${toolLabel}...`, toolName: toolLabel }];
              });
            }
          } else if (evt.type === 'content_block_delta' && evt.delta?.text) {
            // Append to current turn's message
            response += evt.delta.text;
            if (!currentMsgId) {
              turnCounter++;
              currentMsgId = `${reqId}-turn-${turnCounter}`;
            }
            const msgId = currentMsgId;
            setMessages((prev) => {
              const existing = prev.find((m) => m.id === msgId);
              if (existing) {
                return prev.map((m) => m.id === msgId ? { ...m, content: response } : m);
              }
              return [...prev.filter((m) => m.id !== activityId), { id: msgId, role: 'assistant', content: response }];
            });
          } else if (evt.type === 'error') {
            // Error from claude CLI (stderr or spawn failure)
            const errMsg = evt.content || 'Unknown error from Claude CLI';
            setError(errMsg);
          } else if (evt.type === 'result') {
            // Final result — add as the last message
            if (evt.result) {
              turnCounter++;
              const resultId = `${reqId}-result`;
              response = evt.result;
              setMessages((prev) => {
                const filtered = prev.filter((m) => m.id !== activityId);
                return [...filtered, { id: resultId, role: 'assistant', content: response }];
              });
            }
          }
        } catch {
          // Not JSON — treat as plain text (fallback), append to current message
          response += line + '\n';
          if (!currentMsgId) {
            turnCounter++;
            currentMsgId = `${reqId}-turn-${turnCounter}`;
          }
          const msgId = currentMsgId;
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === msgId);
            if (existing) {
              return prev.map((m) => m.id === msgId ? { ...m, content: response } : m);
            }
            return [...prev, { id: msgId, role: 'assistant', content: response }];
          });
        }
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
      let contextSummary = serializeContextItems(nonFileItems);

      // For pipeline commands invoked from Cortx with Context Pack data,
      // instruct the pipeline to use Context Pack instead of Obsidian dev-plan
      const isPipeline = text.startsWith('/pipeline:');
      if (isPipeline && contextItems.length > 0) {
        const cortxDirective = [
          '## CORTX_CONTEXT_PACK_MODE',
          'This pipeline was invoked from the Cortx app with Context Pack data.',
          'Use the Context Pack data provided below as the task specification instead of reading from Obsidian dev-plan.',
          'Skip Obsidian file lookups (dev-plan.md, _pipeline-state.json) — the Context Pack IS your source of truth.',
          'If a dev-plan is needed, generate it from the Context Pack data.',
        ].join('\n');
        contextSummary = contextSummary
          ? `${cortxDirective}\n\n---\n\n${contextSummary}`
          : cortxDirective;
      }

      // Local file paths for --add-dir
      const contextFiles = contextItems
        .filter((item) => item.url && !item.url.startsWith('http'))
        .map((item) => item.url);

      // Show loaded context items before Claude starts
      if (isPipeline && contextItems.length > 0) {
        const sourceIcons: Record<string, string> = {
          github: 'GitHub', slack: 'Slack', notion: 'Notion', pin: 'Pin',
        };
        const lines = contextItems.map((item) => {
          const src = sourceIcons[item.sourceType] || item.sourceType;
          return `  [${src}] ${item.title}`;
        });
        const contextLoadMsg = `Loading Context Pack (${contextItems.length} items)\n${lines.join('\n')}`;
        const ctxMsgId = `${reqId}-context-load`;
        setMessages((prev) => [...prev, { id: ctxMsgId, role: 'activity', content: contextLoadMsg, toolName: 'Context Pack' }]);
      }

      await invoke('claude_spawn', {
        id: reqId,
        cwd: cwd || '/',
        message: resolvedText,
        contextFiles: contextFiles.length > 0 ? contextFiles : null,
        contextSummary: contextSummary || null,
        allowAllTools: text.startsWith('/') || null,
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
          msg.role === 'activity' ? (
            <div key={msg.id} style={{
              display: 'flex', alignItems: msg.content.includes('\n') ? 'flex-start' : 'center',
              gap: 8, padding: '4px 16px',
              fontSize: 11, color: '#6b6b78',
            }}>
              <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5, flexShrink: 0, marginTop: msg.content.includes('\n') ? 2 : 0 }} />
              <div style={{ fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </div>
            </div>
          ) : (
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
          )
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
        />
        <div className="model-select" style={{ cursor: 'default' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 4px #34d399' }} />
          Opus 4.6
          {contextTotalCount > 0 && (
            <span style={{ color: '#818cf8', marginLeft: 4, fontSize: 10 }}>
              📎{contextTotalCount}
            </span>
          )}
        </div>
        {loading ? (
          <button className="send-btn" onClick={() => {
            // Stop current response
            unlistenRefs.current.forEach((fn) => fn());
            unlistenRefs.current = [];
            setLoading(false);
          }} style={{ background: '#ef4444' }} title="Stop response">■</button>
        ) : (
          <button className="send-btn" onClick={handleSend} disabled={!input.trim()}>↑</button>
        )}
      </div>
    </>
  );
}
