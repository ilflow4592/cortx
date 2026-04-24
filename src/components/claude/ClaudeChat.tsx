import { useCallback, useEffect, useState } from 'react';
import { useClaudeSession } from './useClaudeSession';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import { ChatSearchBox } from './ChatSearchBox';
import { useTaskStore } from '../../stores/taskStore';
import type { ClaudeChatProps } from './types';

export function ClaudeChat({ taskId, cwd, onSwitchTab }: ClaudeChatProps) {
  const {
    messages,
    loading,
    error,
    input,
    setInput,
    slashCommands,
    handleSend,
    handleStop,
    handleClearMessages,
    inputRef,
    endRef,
    contextFileCount,
    contextTotalCount,
  } = useClaudeSession(taskId, cwd, onSwitchTab);

  const pipeline = useTaskStore((s) => s.tasks.find((t) => t.id === taskId)?.pipeline);

  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(false);

  const toggleRawEvents = useCallback((messageId: string) => {
    setExpandedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  // Ctrl/Cmd+O: CLI Claude의 "확장 로그" 토글 UX를 재현. 가장 최근 raw 이벤트가 있는
  // assistant 메시지를 펼치거나 접는다. input에 포커스가 있어도 동작.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'o' || e.key === 'O') {
        const target = [...messages].reverse().find((m) => m.role === 'assistant' && (m.rawEvents?.length ?? 0) > 0);
        if (!target) return;
        e.preventDefault();
        toggleRawEvents(target.id);
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [messages, toggleRawEvents]);

  // The Stop button must stay visible while Claude is actively working.
  // `loading` alone is unreliable: it can flip to false mid-stream due to
  // claude-done firing prematurely or loadingCache sync races. As a defensive
  // fallback, treat the presence of a trailing `activity` message (a live
  // tool-use indicator like "Using Edit...") as "still working".
  const lastMsg = messages[messages.length - 1];
  const hasLiveActivity = lastMsg?.role === 'activity';
  const isBusy = loading || hasLiveActivity;

  return (
    <>
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {searchOpen && <ChatSearchBox onClose={() => setSearchOpen(false)} />}
        <ChatMessageList
          messages={messages}
          loading={loading}
          error={error}
          contextTotalCount={contextTotalCount}
          contextFileCount={contextFileCount}
          endRef={endRef}
          taskId={taskId}
          pipeline={pipeline}
          expandedMessageIds={expandedMessageIds}
          onToggleRawEvents={toggleRawEvents}
        />
      </div>
      <ChatInput
        input={input}
        loading={isBusy}
        slashCommands={slashCommands}
        pipeline={pipeline}
        contextTotalCount={contextTotalCount}
        onInputChange={setInput}
        onSend={handleSend}
        onStop={handleStop}
        onClearMessages={handleClearMessages}
        hasMessages={messages.length > 0}
        inputRef={inputRef}
      />
    </>
  );
}
