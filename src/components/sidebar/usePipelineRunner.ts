import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTaskStore } from '../../stores/taskStore';
import { useProjectStore } from '../../stores/projectStore';
import { useContextPackStore } from '../../stores/contextPackStore';

export function usePipelineRunner() {
  const [runningPipelines, setRunningPipelines] = useState<Set<string>>(new Set());
  const [askingTasks, setAskingTasks] = useState<Set<string>>(new Set());

  const tasks = useTaskStore((s) => s.tasks);
  const projects = useProjectStore((s) => s.projects);

  const runPipelineForTask = async (taskId: string, command: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const branch = task.branchName || '';
    const title = task.title || '';
    const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
    const cwd = task.worktreePath || task.repoPath || project?.localPath || '';

    const args = `${branch} ${title}`.trim();
    const reqId = `claude-${taskId}-${Date.now()}`;
    setRunningPipelines((prev) => new Set(prev).add(taskId));

    // Clear previous messages and session — fresh start
    const { messageCache, sessionCache } = await import('../../utils/chatState');
    messageCache.delete(taskId);
    sessionCache.delete(taskId);

    // Reset timer + set active (without pausing other tasks)
    useTaskStore.getState().updateTask(taskId, { elapsedSeconds: 0, status: 'active' as const });
    // Initialize pipeline state
    if (!task.pipeline?.enabled) {
      useTaskStore.getState().updateTask(taskId, {
        pipeline: {
          enabled: true,
          phases: {
            grill_me: { status: 'in_progress', startedAt: new Date().toISOString() },
            obsidian_save: { status: 'pending' },
            dev_plan: { status: 'pending' },
            implement: { status: 'pending' },
            commit_pr: { status: 'pending' },
            review_loop: { status: 'pending' },
            done: { status: 'pending' },
          },
        },
      });
    }

    // Add user message immediately
    const msgs = messageCache.get(taskId) || [];
    msgs.push({ id: `${reqId}-user`, role: 'user' as const, content: command });

    // Resolve slash command from .claude/commands/ files (project first, then global)
    let resolvedPrompt = `${command} ${args}`;
    const cmdName = command.slice(1); // remove leading /
    const skillKey = cmdName.replace(/:/g, '/') + '.md';
    for (const base of [`${cwd}/.claude/commands`, '~/.claude/commands']) {
      try {
        const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
          cwd: '/',
          command: `cat "${base}/${skillKey}" 2>/dev/null`,
        });
        if (result.success && result.output.trim()) {
          let prompt = result.output;
          prompt = prompt.replace(/\$ARGUMENTS/g, args);
          prompt = prompt.replace(/\{TASK_ID\}/g, branch);
          prompt = prompt.replace(/\{TASK_NAME\}/g, title);
          resolvedPrompt = prompt;
          break;
        }
      } catch {
        /* continue */
      }
    }

    // Build context pack data — task-specific
    const contextItems = useContextPackStore.getState().items[taskId] || [];
    let contextFiles: string[] = [];
    if (contextItems.length > 0) {
      // Show loading activity
      const sourceIcons: Record<string, string> = { github: 'GitHub', slack: 'Slack', notion: 'Notion', pin: 'Pin' };
      const lines = contextItems.map((item) => {
        const src = sourceIcons[item.sourceType] || item.sourceType;
        return `  [${src}] ${item.title}`;
      });
      msgs.push({
        id: `${reqId}-context-load`,
        role: 'activity' as const,
        content: `Loading Context Pack (${contextItems.length} items)\n${lines.join('\n')}`,
      });

      contextFiles = contextItems.filter((item) => item.url && !item.url.startsWith('http')).map((item) => item.url);
    }
    messageCache.set(taskId, [...msgs]);

    // Strip pipeline markers from display text
    const stripMarkers = (text: string) => text.replace(/\[PIPELINE:[^\]]*\]/g, '').trimStart();

    // Listen for data — update messageCache in real-time
    // Uses same streaming logic as useClaudeSession to ensure identical message structure
    let turnCounter = 0;
    let currentResponse = '';
    let currentMsgId = '';
    const activityId = `${reqId}-activity`;

    const updateCache = (updater: (cached: typeof msgs) => typeof msgs) => {
      const cached = messageCache.get(taskId) || [];
      messageCache.set(taskId, updater(cached));
    };

    const unData = await listen<string>(`claude-data-${reqId}`, (event) => {
      // Stop processing if task was reset
      const currentTask = useTaskStore.getState().tasks.find((t) => t.id === taskId);
      if (!currentTask?.pipeline?.enabled) return;

      try {
        const evt = JSON.parse(event.payload);

        if (evt.type === 'system' && evt.subtype === 'init' && evt.session_id) {
          sessionCache.set(taskId, evt.session_id);
        }

        if (evt.type === 'assistant' && evt.message?.content) {
          const textBlocks = (evt.message.content as Array<{ type: string; text?: string }>)
            .filter((b: { type: string }) => b.type === 'text')
            .map((b: { text?: string }) => b.text || '');
          const toolBlocks = (evt.message.content as Array<{ type: string; name?: string }>).filter(
            (b: { type: string }) => b.type === 'tool_use',
          );

          if (textBlocks.length > 0) {
            const newText = textBlocks.join('');
            // Only start a new turn if no current message (first text or after tool use)
            if (!currentMsgId) {
              turnCounter++;
              currentMsgId = `${reqId}-turn-${turnCounter}`;
              currentResponse = stripMarkers(newText);
            } else {
              currentResponse = stripMarkers(currentResponse + newText);
            }
            if (currentResponse.trim()) {
              const msgId = currentMsgId;
              updateCache((cached) => {
                const filtered = cached.filter((m) => m.id !== activityId);
                const idx = filtered.findIndex((m) => m.id === msgId);
                if (idx >= 0) {
                  filtered[idx] = { ...filtered[idx], content: currentResponse };
                  return [...filtered];
                }
                return [...filtered, { id: msgId, role: 'assistant' as const, content: currentResponse }];
              });
            }
          }

          if (toolBlocks.length > 0) {
            // Reset current message so next text block starts a new turn
            currentMsgId = '';
            const toolLabel = toolBlocks.map((b) => b.name || 'tool').join(', ');
            updateCache((cached) => {
              const filtered = cached.filter((m) => m.id !== activityId);
              return [...filtered, { id: activityId, role: 'activity' as const, content: `Using ${toolLabel}...` }];
            });
          }
        } else if (evt.type === 'content_block_delta' && evt.delta?.text) {
          currentResponse = stripMarkers(currentResponse + evt.delta.text);
          if (!currentMsgId) {
            turnCounter++;
            currentMsgId = `${reqId}-turn-${turnCounter}`;
          }
          if (currentResponse.trim()) {
            const msgId = currentMsgId;
            updateCache((cached) => {
              const filtered = cached.filter((m) => m.id !== activityId);
              const idx = filtered.findIndex((m) => m.id === msgId);
              if (idx >= 0) {
                filtered[idx] = { ...filtered[idx], content: currentResponse };
                return [...filtered];
              }
              return [...filtered, { id: msgId, role: 'assistant' as const, content: currentResponse }];
            });
          }
        }

        // Track token usage
        if (evt.type === 'result' && evt.usage) {
          const t = useTaskStore.getState().tasks.find((tt) => tt.id === taskId);
          if (t?.pipeline?.enabled) {
            const inTok = evt.usage.input_tokens || 0;
            const outTok = evt.usage.output_tokens || 0;
            const cost = evt.total_cost_usd || 0;
            const phases = { ...t.pipeline.phases };
            const activePhase = Object.keys(phases).find(
              (p) => phases[p as keyof typeof phases]?.status === 'in_progress',
            ) as string | undefined;
            if (activePhase) {
              const entry = { ...phases[activePhase as keyof typeof phases] };
              entry.inputTokens = (entry.inputTokens || 0) + inTok;
              entry.outputTokens = (entry.outputTokens || 0) + outTok;
              entry.costUsd = (entry.costUsd || 0) + cost;
              (phases as Record<string, typeof entry>)[activePhase] = entry;
              useTaskStore
                .getState()
                .updateTask(taskId, { pipeline: { ...t.pipeline, phases: phases as typeof t.pipeline.phases } });
            }
          }
        }
      } catch {
        /* not JSON */
      }
    });

    const donePromise = new Promise<void>((resolve) => {
      listen(`claude-done-${reqId}`, () => resolve());
    });

    // Build context summary — same as ClaudeChat
    const summaryParts = [
      '## CORTX_PIPELINE_TRACKING',
      'You are running inside the Cortx app. To update the pipeline dashboard, emit phase markers in your text output.',
      'Format: [PIPELINE:phase:status] or [PIPELINE:phase:status:memo]',
      'Valid phases: grill_me, obsidian_save, dev_plan, implement, commit_pr, review_loop, done',
      'Valid statuses: in_progress, done, skipped',
      'Examples:',
      '- When starting grill-me: emit [PIPELINE:grill_me:in_progress]',
      '- When grill-me is complete: emit [PIPELINE:grill_me:done]',
      '- When dev plan starts: emit [PIPELINE:dev_plan:in_progress]',
      '- When commit/PR is done: emit [PIPELINE:commit_pr:done]',
      '- IMPORTANT: You MUST emit these markers. The dashboard will NOT update without them.',
      '',
      '## CORTX_RULES (MUST FOLLOW)',
      '- Do NOT update Obsidian _dashboard.md or _pipeline-state.json.',
      '- Do NOT search for dev-plan.md files. Obsidian is not used.',
      '- Do NOT re-explore the codebase if you already explored it in this session. Use previous context.',
      '- NEVER run git commit, git push, or gh pr create without asking the user first.',
      '- After implementation, ask "커밋하시겠습니까?" and STOP. Do not commit until user says yes.',
      '- After commit+push, ask "PR을 생성할까요?" and STOP. Do not create PR until user says yes.',
      '- NEVER skip tests. Run tests and fix failures until ALL tests pass before asking to commit.',
      '- 한국어로만 대화합니다.',
      '- Grill-me questions MUST use Q1., Q2., Q3. format (NOT "질문 1:" or "질문1:"). Always end with ?.',
    ];

    if (contextItems.length > 0) {
      // Serialize context items into summary
      summaryParts.push('', '---', '', '## CORTX_CONTEXT_PACK_MODE');
      summaryParts.push('This pipeline was invoked from the Cortx app with Context Pack data.');
      summaryParts.push(
        'Use the Context Pack data provided below as the task specification instead of reading from Obsidian dev-plan.',
      );
      summaryParts.push(
        'Skip Obsidian file lookups (dev-plan.md, _pipeline-state.json) — the Context Pack IS your source of truth.',
      );
      summaryParts.push('If a dev-plan is needed, generate it from the Context Pack data.');
      const sourceLabels: Record<string, string> = {
        github: 'GitHub',
        slack: 'Slack',
        notion: 'Notion',
        pin: 'Pinned',
      };
      const bySource: Record<string, typeof contextItems> = {};
      for (const item of contextItems) {
        const key = item.sourceType || 'other';
        (bySource[key] ??= []).push(item);
      }
      for (const [source, items] of Object.entries(bySource)) {
        const label = sourceLabels[source] || source;
        const lines = items.map((item) => {
          const parts = [`- **${item.title}**`];
          if (item.summary && item.summary !== 'Pinned') parts.push(`  ${item.summary}`);
          if (item.url && item.url.startsWith('http')) parts.push(`  ${item.url}`);
          if (item.metadata?.fullText) parts.push(`\n${item.metadata.fullText}`);
          return parts.join('\n');
        });
        summaryParts.push('', `## ${label}`, ...lines);
      }
    }

    const contextSummary = summaryParts.join('\n');

    await invoke('claude_spawn', {
      id: reqId,
      cwd: cwd || '/',
      message: resolvedPrompt,
      contextFiles: contextFiles.length > 0 ? contextFiles : null,
      contextSummary,
      allowAllTools: true,
      sessionId: null,
      model: null,
    });

    await donePromise;
    unData();

    // Check if Claude is asking a question
    const finalMsgs = messageCache.get(taskId) || [];
    const lastAssistant = [...finalMsgs].reverse().find((m) => m.role === 'assistant');
    const isQuestion = (text: string) => {
      const t = text.trim();
      if (t.endsWith('?') || t.endsWith('?')) return true;
      // Korean question patterns
      if (
        /(?:할까요|인가요|있나요|될까요|맞나요|괜찮을까요|건가요|하시나요|싶습니다|드릴까요|어떤가요|좋을까요|주세요|해줘)\s*[.?？]?\s*$/.test(
          t,
        )
      )
        return true;
      // English question patterns
      if (
        /(?:please confirm|what do you think|should we|would you|do you want|can you|is that correct|right\?|agree\?)\s*[.?]?\s*$/i.test(
          t,
        )
      )
        return true;
      // Q1., Q2., 질문 N: patterns in last 200 chars
      const tail = t.slice(-200);
      if (/(?:Q\d+[.:)]|질문\s*\d+\s*[:.)]).+[?？]/.test(tail)) return true;
      return false;
    };
    if (lastAssistant && isQuestion(lastAssistant.content)) {
      setAskingTasks((prev) => new Set(prev).add(taskId));
      try {
        if ('Notification' in window && Notification.permission === 'granted')
          new Notification('Cortx', { body: `${task.title} — 사용자 입력이 필요합니다` });
      } catch {
        /* ignore */
      }
    }

    setRunningPipelines((prev) => {
      const n = new Set(prev);
      n.delete(taskId);
      return n;
    });
  };

  const runSelectedPipelines = (selectedTasks: Set<string>, onDone: () => void) => {
    const selected = [...selectedTasks].filter((id) => tasks.some((t) => t.id === id && t.status !== 'done'));
    // Reset all timers to 0 simultaneously before starting
    selected.forEach((id) => useTaskStore.getState().updateTask(id, { elapsedSeconds: 0 }));
    // Start all pipelines in parallel
    selected.forEach((id) => runPipelineForTask(id, '/pipeline:dev-task'));
    onDone();
  };

  return {
    runningPipelines,
    setRunningPipelines,
    askingTasks,
    setAskingTasks,
    runPipelineForTask,
    runSelectedPipelines,
  };
}
