import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Square, Paperclip } from 'lucide-react';
import { useT } from '../../i18n';
import type { SlashCommand } from './types';

// Pipeline command priority order for the slash menu
const PIPELINE_ORDER: Record<string, number> = {
  'pipeline:dev-task': 0,
  'pipeline:dev-implement': 1,
  'pipeline:dev-review-loop': 2,
  'pipeline:dev-resume': 3,
};

interface ChatInputProps {
  input: string;
  loading: boolean;
  slashCommands: SlashCommand[];
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
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const t = useT();

  const filteredCommands = showSlashMenu
    ? slashCommands
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
      onInputChange(`/${cmd.name} `);
      setShowSlashMenu(false);
      setSlashFilter('');
      inputRef.current?.focus();
    },
    [onInputChange, inputRef],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
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

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
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
                {cmd.source !== 'builtin' && <span className="slash-item-source">{cmd.source}</span>}
              </div>
              <div className="slash-item-desc">{cmd.description}</div>
            </div>
          ))}
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

      <div className="model-select" style={{ cursor: 'default' }}>
        <span
          style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 4px #34d399' }}
        />
        Opus 4.6
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
      </div>

      {loading ? (
        <button
          className="send-btn"
          onClick={onStop}
          style={{ background: '#ef4444' }}
          title="Stop response"
        >
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
