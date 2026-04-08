import { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { ArrowUp, Square, Paperclip } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useContextPackStore } from '../stores/contextPackStore';
import { useTaskStore } from '../stores/taskStore';
import type { ContextItem } from '../types/contextPack';
import type { PipelinePhase, PhaseStatus, PipelineState, PipelinePhaseEntry } from '../types/task';
import { CORTX_SKILLS } from '../skills/pipelineSkills';

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
const PHASE_KEYS = new Set<PipelinePhase>(['grill_me', 'obsidian_save', 'dev_plan', 'implement', 'commit_pr', 'review_loop', 'done']);
const PHASE_ORDER: PipelinePhase[] = ['grill_me', 'obsidian_save', 'dev_plan', 'implement', 'commit_pr', 'review_loop', 'done'];
const PHASE_NAMES: Record<PipelinePhase, string> = {
  grill_me: 'Grill-me', obsidian_save: 'Save', dev_plan: 'Dev Plan',
  implement: 'Implement', commit_pr: 'PR', review_loop: 'Review', done: 'Done',
};

function sendNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  } else if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission().then((p) => { if (p === 'granted') new Notification(title, { body }); });
  }
}

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
      if (item.metadata?.fullText) parts.push(`\n${item.metadata.fullText}`);
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentReqIdRef = useRef<string>('');
  const claudeSessionIdRef = useRef<string>('');
  const messagesRef = useRef<Message[]>([]);

  // Slash command state
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  // Load slash commands on mount — override descriptions for Cortx pipeline commands
  const CORTX_DESCRIPTIONS: Record<string, string> = {
    'pipeline:dev-task': 'Grill-me + 개발 계획서 작성',
    'pipeline:dev-implement': '개발 계획 수립 + 구현 + 테스트 + 커밋/PR',
    'pipeline:dev-resume': '중단된 파이프라인 재개',
  };
  useEffect(() => {
    invoke<SlashCommand[]>('list_slash_commands', { projectCwd: cwd || null })
      .then((cmds) => setSlashCommands(cmds.map((cmd) =>
        CORTX_DESCRIPTIONS[cmd.name] ? { ...cmd, description: CORTX_DESCRIPTIONS[cmd.name] } : cmd
      )))
      .catch(() => {});
  }, [cwd]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    messagesRef.current = messages;
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
    let args = parts.slice(1).join(' ');

    // Auto-fill pipeline args from current task
    const currentTask = useTaskStore.getState().tasks.find((t) => t.id === taskId);
    if (cmdName.startsWith('pipeline:') && currentTask) {
      const branch = currentTask.branchName || '';
      const title = currentTask.title || '';
      if (!args.trim()) {
        args = `${branch} ${title}`.trim();
      }
    }

    // Check for Cortx-specific pipeline skills first
    const skillKey = cmdName.replace(/:/g, '/');
    if (CORTX_SKILLS[skillKey]) {
      let prompt = CORTX_SKILLS[skillKey];
      prompt = prompt.replace(/\$ARGUMENTS/g, args);
      // Replace task placeholders
      if (currentTask) {
        prompt = prompt.replace(/\{TASK_ID\}/g, currentTask.branchName || '');
        prompt = prompt.replace(/\{TASK_NAME\}/g, currentTask.title || '');
      }
      return prompt;
    }

    // Fall back to file-based skill resolution
    const filePath = skillKey + '.md';
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

  // Parse pipeline markers from Claude's text output and update task state
  const PIPELINE_MARKER_RE = /\[PIPELINE:([a-zA-Z_]+):([a-zA-Z_]+)(?::([^\]]*))?\]/g;
  const parsePipelineMarkers = (text: string): string => {
    let cleaned = text;
    let match: RegExpExecArray | null;
    const re = new RegExp(PIPELINE_MARKER_RE.source, 'g');
    while ((match = re.exec(text)) !== null) {
      const [fullMatch, key, value, memo] = match;
      const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
      if (!task?.pipeline?.enabled) continue;

      const phases = { ...task.pipeline.phases };

      if (key === 'complexity') {
        useTaskStore.getState().updateTask(taskId, {
          pipeline: { ...task.pipeline, complexity: value },
        });
      } else if (key === 'pr') {
        useTaskStore.getState().updateTask(taskId, {
          pipeline: { ...task.pipeline, prNumber: parseInt(value) || 0, prUrl: memo || '' },
        });
      } else if (PHASE_KEYS.has(key as PipelinePhase)) {
        const phase = key as PipelinePhase;
        const status = value as PhaseStatus;
        const now = new Date().toISOString();
        phases[phase] = {
          ...phases[phase],
          status,
          ...(status === 'in_progress' ? { startedAt: now } : {}),
          ...(status === 'done' || status === 'skipped' ? { completedAt: now } : {}),
          ...(memo ? { memo } : {}),
        };
        const updates: Partial<PipelineState> = { ...task.pipeline, phases };
        // Save dev plan from all assistant messages when dev_plan completes
        if (phase === 'dev_plan' && status === 'done') {
          const planMessages = messagesRef.current
            .filter((m) => m.role === 'assistant')
            .map((m) => m.content)
            .join('\n\n---\n\n');
          if (planMessages.length > 50) {
            const t = useTaskStore.getState().tasks.find((tt) => tt.id === taskId);
            if (t?.pipeline) {
              useTaskStore.getState().updateTask(taskId, {
                pipeline: { ...t.pipeline, devPlan: planMessages },
              });
            }
          }
        }
        useTaskStore.getState().updateTask(taskId, { pipeline: updates });

        // macOS notification on phase completion
        if (status === 'done') {
          sendNotification('Cortx Pipeline', `${PHASE_NAMES[phase] || phase} completed`);
        }
      }

      // Remove marker from display text
      cleaned = cleaned.replace(fullMatch, '');
    }
    return cleaned;
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

    // On resume: auto-fill pipeline args but skip skill resolution
    // On first message: full skill resolution
    let resolvedText: string;
    if (claudeSessionIdRef.current) {
      // Resume — just auto-fill args if pipeline command
      const parts = text.startsWith('/') ? text.slice(1).split(/\s+/) : [];
      const cmdName = parts[0] || '';
      let args = parts.slice(1).join(' ');
      if (cmdName.startsWith('pipeline:') && !args.trim()) {
        const t = useTaskStore.getState().tasks.find((t) => t.id === taskId);
        if (t) args = `${t.branchName || ''} ${t.title || ''}`.trim();
      }
      resolvedText = args ? `/${cmdName} ${args}` : text;
    } else {
      resolvedText = await resolveSlashCommand(text);
    }

    const reqId = `claude-${taskId}-${Date.now()}`;
    currentReqIdRef.current = reqId;
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

          // Capture session_id from init event for conversation continuity
          if (evt.type === 'system' && evt.subtype === 'init' && evt.session_id) {
            claudeSessionIdRef.current = evt.session_id;
          }

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
              response = parsePipelineMarkers(textBlocks.join('')).trimStart();
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
            response = parsePipelineMarkers(response + evt.delta.text).trimStart();
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
            // Final result — only add if it differs from current response (avoid duplicates)
            if (evt.result) {
              const resultText = parsePipelineMarkers(evt.result).trim();
              if (resultText && resultText !== response.trim()) {
                turnCounter++;
                const resultId = `${reqId}-result`;
                response = resultText;
                setMessages((prev) => {
                  const filtered = prev.filter((m) => m.id !== activityId);
                  return [...filtered, { id: resultId, role: 'assistant', content: response }];
                });
              }
            }
            // Track token usage per active pipeline phase
            if (evt.usage) {
              const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
              if (task?.pipeline?.enabled) {
                const inTok = (evt.usage.input_tokens || 0);
                const outTok = evt.usage.output_tokens || 0;
                const cost = evt.total_cost_usd || 0;
                // Find current active phase
                const activePhase = PHASE_ORDER.find((p) =>
                  PHASE_KEYS.has(p) && task.pipeline!.phases[p]?.status === 'in_progress'
                );
                if (activePhase) {
                  const phases = { ...task.pipeline!.phases };
                  const entry = { ...phases[activePhase] };
                  entry.inputTokens = (entry.inputTokens || 0) + inTok;
                  entry.outputTokens = (entry.outputTokens || 0) + outTok;
                  entry.costUsd = (entry.costUsd || 0) + cost;
                  phases[activePhase] = entry;
                  useTaskStore.getState().updateTask(taskId, {
                    pipeline: { ...task.pipeline!, phases },
                  });
                }
              }
            }
          }
        } catch {
          // Not JSON — treat as plain text (fallback), append to current message
          response = parsePipelineMarkers(response + line + '\n');
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

      const hasExistingSession = !!claudeSessionIdRef.current;
      const isPipeline = text.startsWith('/pipeline:');

      let contextSummary = '';
      let contextFiles: string[] = [];

      // Pipeline tracking directive — always send for pipeline commands (even on resume)
      if (isPipeline) {
        contextSummary = [
          '## CORTX_PIPELINE_TRACKING',
          'You are running inside the Cortx app. To update the pipeline dashboard, emit phase markers in your text output.',
          'Format: [PIPELINE:phase:status] or [PIPELINE:phase:status:memo]',
          'Valid phases: grill_me, obsidian_save, dev_plan, implement, commit_pr, review_loop, done',
          'Valid statuses: in_progress, done, skipped',
          'Examples:',
          '  [PIPELINE:dev_plan:in_progress]',
          '  [PIPELINE:implement:done:빌드 성공, 4개 파일 변경]',
          '  [PIPELINE:commit_pr:done:PR #4920]',
          'Emit a marker at the START and END of each phase. These markers are parsed by the app and hidden from the user.',
          'Also emit [PIPELINE:complexity:Simple] or Medium/Complex when determined.',
          'Also emit [PIPELINE:pr:NUMBER:URL] when PR is created.',
          '',
          '## CORTX_DASHBOARD',
          'Do NOT update Obsidian _dashboard.md or _pipeline-state.json — the Cortx app manages its own dashboard.',
        ].join('\n');
      }

      // Only send full context on first message (no existing session)
      if (!hasExistingSession) {
        const nonFileItems = contextItems.filter(
          (item) => !item.url || item.url.startsWith('http') || item.sourceType !== 'pin'
        );
        const itemsSummary = serializeContextItems(nonFileItems);

        if (isPipeline && contextItems.length > 0) {
          contextSummary += '\n\n---\n\n## CORTX_CONTEXT_PACK_MODE\n'
            + 'This pipeline was invoked from the Cortx app with Context Pack data.\n'
            + 'Use the Context Pack data provided below as the task specification instead of reading from Obsidian dev-plan.\n'
            + 'Skip Obsidian file lookups (dev-plan.md, _pipeline-state.json) — the Context Pack IS your source of truth.\n'
            + 'If a dev-plan is needed, generate it from the Context Pack data.';
        }

        if (itemsSummary) {
          contextSummary = contextSummary
            ? `${contextSummary}\n\n---\n\n${itemsSummary}`
            : itemsSummary;
        }

        contextFiles = contextItems
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
      }

      // Pipeline state init + timer (always, even on resume)
      if (isPipeline) {
        const currentTask = useTaskStore.getState().tasks.find((t) => t.id === taskId);
        if (currentTask && !currentTask.pipeline?.enabled) {
          const defaultPhases: Record<PipelinePhase, PipelinePhaseEntry> = {
            grill_me: { status: 'pending' },
            obsidian_save: { status: 'pending' },
            dev_plan: { status: 'pending' },
            implement: { status: 'pending' },
            commit_pr: { status: 'pending' },
            review_loop: { status: 'pending' },
            done: { status: 'pending' },
          };
          useTaskStore.getState().updateTask(taskId, {
            pipeline: { enabled: true, phases: defaultPhases },
          });
        }
        const taskNow = useTaskStore.getState().tasks.find((t) => t.id === taskId);
        if (taskNow && (taskNow.status === 'waiting' || taskNow.status === 'paused')) {
          useTaskStore.getState().startTask(taskId);
        }
      }

      await invoke('claude_spawn', {
        id: reqId,
        cwd: cwd || '/',
        message: resolvedText,
        contextFiles: contextFiles.length > 0 ? contextFiles : null,
        contextSummary: contextSummary || null,
        allowAllTools: text.startsWith('/') || null,
        sessionId: claudeSessionIdRef.current || null,
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
              <div className="empty-state-icon" />
              <div className="empty-state-title">Claude Code</div>
              <div className="empty-state-sub">
                Uses your Claude CLI authentication.<br />
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
                  Type <code style={{ color: '#7dbdbd', background: '#242d38', padding: '1px 4px', borderRadius: 3, fontSize: 11 }}>/</code> for commands
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
                <div className="msg-name">
                  {msg.role === 'user' ? 'You' : 'Claude Code'}
                </div>
                <div className="msg-text" style={{ wordBreak: 'break-word' }}>
                  {msg.role === 'assistant' ? (
                    <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                  ) : (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                  )}
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
              <span style={{ fontSize: 13, color: '#4d5868' }}>Claude is thinking...</span>
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

        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setShowSlashMenu(false), 150)}
          placeholder="Send a message or type / for commands..."
          rows={1}
          style={{ resize: 'none', overflow: 'hidden', minHeight: 40, maxHeight: 120 }}
          onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }}
        />
        {messages.length > 0 && !loading && (
          <button
            onClick={() => { setMessages([]); setError(''); claudeSessionIdRef.current = ''; }}
            style={{
              background: 'none', border: '1px solid #2a3642', borderRadius: 6,
              color: '#4d5868', cursor: 'pointer', fontSize: 10, padding: '4px 8px',
              fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
            title="Clear chat"
          >Clear</button>
        )}
        <div className="model-select" style={{ cursor: 'default' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 4px #34d399' }} />
          Opus 4.6
          {contextTotalCount > 0 && (
            <span style={{ color: '#7dbdbd', marginLeft: 6, fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Paperclip size={11} strokeWidth={1.5} />
              {contextTotalCount}
            </span>
          )}
        </div>
        {loading ? (
          <button className="send-btn" onClick={() => {
            // Stop current response — kill process + unlisten + remove activity + reset pipeline
            if (currentReqIdRef.current) {
              invoke('claude_stop', { id: currentReqIdRef.current }).catch(() => {});
            }
            unlistenRefs.current.forEach((fn) => fn());
            unlistenRefs.current = [];
            setMessages((prev) => prev.filter((m) => m.role !== 'activity'));
            setLoading(false);
          }} style={{ background: '#ef4444' }} title="Stop response"><Square size={14} fill="white" strokeWidth={0} /></button>
        ) : (
          <button className="send-btn" onClick={handleSend} disabled={!input.trim()}><ArrowUp size={16} strokeWidth={1.5} /></button>
        )}
      </div>
    </>
  );
}
