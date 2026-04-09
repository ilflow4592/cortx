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
        loading={loading}
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
