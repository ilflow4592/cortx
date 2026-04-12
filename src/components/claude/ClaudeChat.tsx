import { useClaudeSession } from './useClaudeSession';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
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
      <ChatMessageList
        messages={messages}
        loading={loading}
        error={error}
        contextTotalCount={contextTotalCount}
        contextFileCount={contextFileCount}
        endRef={endRef}
      />
      <ChatInput
        input={input}
        loading={isBusy}
        slashCommands={slashCommands}
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
