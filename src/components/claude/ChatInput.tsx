import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ArrowUp, Square, Paperclip } from 'lucide-react';
import { useT } from '../../i18n';
import type { SlashCommand } from './types';
import type { PipelineState, PipelinePhase } from '../../types/task';
import { filterSlashCommandsByPipeline, isPipelineCommandRunning } from './pipelineCommandFilter';
import {
  PHASE_MODELS,
  PHASE_EFFORT,
  modelVersionFor,
  MODEL_ALIAS_TO_LABEL,
  MODEL_VERSIONS,
  type EffortLevel,
} from '../../constants/pipeline';
import type { ClaudeCliSettings } from '../../types/generated/ClaudeCliSettings';
import { ModelPicker, type ModelAlias } from './ModelPicker';

async function fetchCliSettings(): Promise<ClaudeCliSettings | null> {
  try {
    const mod = await import('@tauri-apps/api/core');
    return await mod.invoke<ClaudeCliSettings>('claude_cli_settings_read');
  } catch {
    return null;
  }
}

async function writeCliSettings(model: ModelAlias | null, effortLevel: EffortLevel | null): Promise<void> {
  try {
    const mod = await import('@tauri-apps/api/core');
    await mod.invoke('claude_cli_settings_write', { model, effortLevel });
  } catch {
    /* best effort */
  }
}

// Pipeline command priority order for the slash menu
const PIPELINE_ORDER: Record<string, number> = {
  'pipeline:dev-task': 0,
  'pipeline:dev-implement': 1,
  'pipeline:dev-review-loop': 2,
  'pipeline:dev-resume': 3,
  'pipeline:pr-review-fu': 4,
};

interface ChatInputProps {
  input: string;
  loading: boolean;
  slashCommands: SlashCommand[];
  pipeline: PipelineState | undefined;
  contextTotalCount: number;
  onInputChange: (val: string) => void;
  onSend: () => void;
  onStop: () => void;
  onClearMessages: () => void;
  hasMessages: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatInput({
  input,
  loading,
  slashCommands,
  pipeline,
  contextTotalCount,
  onInputChange,
  onSend,
  onStop,
  onClearMessages,
  hasMessages,
  inputRef,
}: ChatInputProps) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [showClearHint, setShowClearHint] = useState(false);
  const [cliSettings, setCliSettings] = useState<ClaudeCliSettings | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const clearHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = useT();

  const resetClearHint = useCallback(() => {
    setShowClearHint(false);
    if (clearHintTimerRef.current) {
      clearTimeout(clearHintTimerRef.current);
      clearHintTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (clearHintTimerRef.current) clearTimeout(clearHintTimerRef.current);
    };
  }, []);

  // CLI `/model` 설정을 뱃지에 표시. 창 focus 마다 새로고침 — 사용자가 별도
  // 터미널 claude 세션에서 /model 변경해도 Cortx 재진입 시 반영.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      fetchCliSettings().then((s) => {
        if (!cancelled) setCliSettings(s);
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const pipelineFiltered = useMemo(
    () => filterSlashCommandsByPipeline(slashCommands, pipeline),
    [slashCommands, pipeline],
  );

  // 활성 phase. Cortx 가 Sonnet 강제하는 단계면 뱃지/Picker 는 그걸 우선.
  const activePhase = useMemo(() => {
    const phases = pipeline?.phases;
    return (
      phases ? Object.keys(phases).find((p) => phases[p as PipelinePhase]?.status === 'in_progress') : undefined
    ) as PipelinePhase | undefined;
  }, [pipeline]);

  const cortxOverridePhase = activePhase && ['dev_plan', 'implement', 'review_loop'].includes(activePhase);

  const cliAlias = (cliSettings?.model?.toLowerCase() as ModelAlias | undefined) ?? 'opus';
  const cliEffort = (cliSettings?.effortLevel as EffortLevel | undefined) ?? 'medium';

  const activeModelBadge = useMemo(() => {
    if (cortxOverridePhase && activePhase) {
      const model = PHASE_MODELS[activePhase];
      const version = modelVersionFor(model);
      const effort = PHASE_EFFORT[activePhase];
      return effort ? `${model} ${version} · ${effort}` : `${model} ${version}`;
    }
    const label = MODEL_ALIAS_TO_LABEL[cliAlias] ?? 'Opus';
    const version = MODEL_VERSIONS[label] ?? '';
    return `${label} ${version} · ${cliEffort}`.trim();
  }, [activePhase, cortxOverridePhase, cliAlias, cliEffort]);

  const handleChangeModel = useCallback(
    (m: ModelAlias) => {
      setCliSettings((s) => ({ ...(s ?? {}), model: m }));
      void writeCliSettings(m, cliEffort);
    },
    [cliEffort],
  );

  const handleChangeEffort = useCallback(
    (e: EffortLevel) => {
      setCliSettings((s) => ({ ...(s ?? {}), effortLevel: e }));
      void writeCliSettings(cliAlias, e);
    },
    [cliAlias],
  );

  const filteredCommands = showSlashMenu
    ? pipelineFiltered
        .filter((cmd) => cmd.name.toLowerCase().includes(slashFilter.toLowerCase()))
        .sort((a, b) => {
          const aOrder = PIPELINE_ORDER[a.name] ?? 100;
          const bOrder = PIPELINE_ORDER[b.name] ?? 100;
          if (aOrder !== bOrder) return aOrder - bOrder;
          // Pipeline commands first, then others alphabetically
          const aIsPipeline = a.name.startsWith('pipeline:') ? 0 : 1;
          const bIsPipeline = b.name.startsWith('pipeline:') ? 0 : 1;
          if (aIsPipeline !== bIsPipeline) return aIsPipeline - bIsPipeline;
          return a.name.localeCompare(b.name);
        })
    : [];

  // Reset index when filter changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset index on filter change, not cascading
    setSlashIndex(0);
  }, [slashFilter]);

  // Scroll active slash item into view
  useEffect(() => {
    if (showSlashMenu && slashMenuRef.current) {
      const active = slashMenuRef.current.querySelector('.slash-item-active');
      active?.scrollIntoView({ block: 'nearest' });
    }
  }, [slashIndex, showSlashMenu]);

  const selectSlashCommand = useCallback(
    (cmd: SlashCommand) => {
      if (isPipelineCommandRunning(cmd.name, pipeline)) return;
      onInputChange(`/${cmd.name} `);
      setShowSlashMenu(false);
      setSlashFilter('');
      inputRef.current?.focus();
    },
    [onInputChange, inputRef, pipeline],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    // Any edit cancels a pending "Esc again to clear" prompt.
    if (showClearHint) resetClearHint();
    onInputChange(val);

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

    // ESC with no slash menu open → same as Claude CLI: interrupt current generation.
    if (e.key === 'Escape' && loading) {
      e.preventDefault();
      resetClearHint();
      onStop();
      return;
    }

    // ESC with input content → two-step clear, matching Claude CLI's "Esc again to clear".
    if (e.key === 'Escape' && input.length > 0) {
      e.preventDefault();
      if (showClearHint) {
        onInputChange('');
        resetClearHint();
      } else {
        setShowClearHint(true);
        if (clearHintTimerRef.current) clearTimeout(clearHintTimerRef.current);
        clearHintTimerRef.current = setTimeout(() => setShowClearHint(false), 1000);
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="chat-input" style={{ position: 'relative' }}>
      {showClearHint && (
        <div
          role="status"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            left: 12,
            fontSize: 10,
            color: 'var(--fg-faint)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 4,
            padding: '2px 6px',
            pointerEvents: 'none',
          }}
        >
          Esc again to clear
        </div>
      )}
      {/* Slash command menu */}
      {showSlashMenu && filteredCommands.length > 0 && (
        <div className="slash-menu" ref={slashMenuRef}>
          {filteredCommands.map((cmd, i) => {
            const disabled = isPipelineCommandRunning(cmd.name, pipeline);
            return (
              <div
                key={cmd.name}
                role="option"
                aria-selected={i === slashIndex}
                aria-disabled={disabled}
                tabIndex={-1}
                className={`slash-item ${i === slashIndex ? 'slash-item-active' : ''}${disabled ? ' slash-item-disabled' : ''}`}
                style={disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                onMouseEnter={() => setSlashIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (disabled) return;
                  selectSlashCommand(cmd);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (disabled) return;
                    selectSlashCommand(cmd);
                  }
                }}
              >
                <div className="slash-item-name">
                  /{cmd.name}
                  {cmd.source !== 'builtin' && <span className="slash-item-source">{cmd.source}</span>}
                  {disabled && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 10,
                        color: 'var(--fg-faint)',
                        fontStyle: 'italic',
                      }}
                    >
                      실행 중
                    </span>
                  )}
                </div>
                <div className="slash-item-desc">{cmd.description}</div>
              </div>
            );
          })}
        </div>
      )}

      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={input}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowSlashMenu(false), 150)}
        placeholder={t('chat.placeholder')}
        rows={1}
        style={{ resize: 'none', overflow: 'hidden', minHeight: 40, maxHeight: 120 }}
        onInput={(e) => {
          const t = e.currentTarget;
          t.style.height = 'auto';
          t.style.height = Math.min(t.scrollHeight, 120) + 'px';
        }}
      />

      {hasMessages && !loading && (
        <button
          onClick={onClearMessages}
          style={{
            background: 'none',
            border: '1px solid var(--border-strong)',
            borderRadius: 6,
            color: 'var(--fg-faint)',
            cursor: 'pointer',
            fontSize: 10,
            padding: '4px 8px',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
          title="Clear chat"
        >
          Clear
        </button>
      )}

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          className="model-select"
          onClick={() => !cortxOverridePhase && setShowPicker((v) => !v)}
          disabled={cortxOverridePhase}
          title={cortxOverridePhase ? 'Pipeline 단계가 모델을 강제 중' : '모델 및 effort 설정'}
          style={{
            cursor: cortxOverridePhase ? 'not-allowed' : 'pointer',
            background: 'none',
            border: 'none',
            padding: 0,
            font: 'inherit',
            color: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            opacity: cortxOverridePhase ? 0.7 : 1,
          }}
        >
          <span
            style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 4px #34d399' }}
          />
          {activeModelBadge}
          {contextTotalCount > 0 && (
            <span
              style={{
                color: 'var(--accent-bright)',
                marginLeft: 6,
                fontSize: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Paperclip size={11} strokeWidth={1.5} />
              {contextTotalCount}
            </span>
          )}
        </button>
        {showPicker && !cortxOverridePhase && (
          <ModelPicker
            model={cliAlias}
            effort={cliEffort}
            onChangeModel={handleChangeModel}
            onChangeEffort={handleChangeEffort}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>

      {loading ? (
        <button className="send-btn" onClick={onStop} style={{ background: '#ef4444' }} title="응답 중단 (ESC)">
          <Square size={14} fill="#e5e5e5" strokeWidth={0} />
        </button>
      ) : (
        <button className="send-btn" onClick={onSend} disabled={!input.trim()}>
          <ArrowUp size={16} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
