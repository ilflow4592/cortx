import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useContextPackStore } from '../stores/contextPackStore';
import { callAI } from '../services/ai';
import { MessageList } from './chat/MessageList';
import { InputArea } from './chat/InputArea';
import type { ChatMessage } from '../types/task';
import type { AIProvider } from '../stores/settingsStore';

const presetModels: { provider: AIProvider; models: string[] }[] = [
  { provider: 'claude', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-20250414'] },
  { provider: 'openai', models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'] },
  { provider: 'ollama', models: ['llama3.2', 'mistral', 'codellama'] },
];

/**
 * Simple chat orchestrator — wires up task state + AI provider config
 * and delegates rendering to MessageList / InputArea.
 */
export function Chat({ taskId }: { taskId: string }) {
  const tasks = useTaskStore((s) => s.tasks);
  const addChatMessage = useTaskStore((s) => s.addChatMessage);
  const updateTask = useTaskStore((s) => s.updateTask);
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const authMethod = useSettingsStore((s) => s.authMethod);
  const apiKey = useSettingsStore((s) => s.apiKey);
  const oauthAccessToken = useSettingsStore((s) => s.oauthAccessToken);
  const modelId = useSettingsStore((s) => s.modelId);
  const ollamaUrl = useSettingsStore((s) => s.ollamaUrl);
  // Don't subscribe to entire store — get items only when needed
  const task = tasks.find((t) => t.id === taskId);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);

  const contextItemsRaw = useContextPackStore((s) => s.items[taskId]);

  if (!task) return null;

  // Resolve model: task override > global settings
  const provider = task.modelOverride?.provider || aiProvider;
  const resolvedModelId = task.modelOverride?.modelId || modelId;
  const resolvedOllamaUrl = ollamaUrl;
  const resolvedAuthMethod =
    authMethod === 'oauth' && oauthAccessToken ? ('oauth' as const) : ('api-key' as const);
  const resolvedApiKey = resolvedAuthMethod === 'oauth' ? oauthAccessToken : apiKey;

  // Build context-aware system prompt
  const contextItems = contextItemsRaw || [];
  const buildSystemContext = (): string => {
    const parts: string[] = [];
    parts.push(`You are an AI coding assistant helping with the task: "${task.title}".`);
    if (task.branchName) parts.push(`Branch: ${task.branchName}`);
    if (task.memo) parts.push(`Current memo: ${task.memo}`);
    if (contextItems.length > 0) {
      parts.push('\nRelevant context:');
      contextItems.slice(0, 10).forEach((item) => {
        parts.push(`- [${item.sourceType}] ${item.title}: ${item.summary}`);
      });
    }
    parts.push('\nBe concise and helpful. Use code examples when appropriate.');
    return parts.join('\n');
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setError(null);

    const userMsg: ChatMessage = {
      id: Date.now().toString(36),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    addChatMessage(taskId, userMsg);
    setInput('');
    setIsLoading(true);

    try {
      const resp = await callAI({
        provider,
        apiKey: resolvedApiKey,
        modelId: resolvedModelId,
        ollamaUrl: resolvedOllamaUrl,
        oauthToken: oauthAccessToken,
        authMethod: resolvedAuthMethod,
        messages: [...task.chatHistory, userMsg],
        taskTitle: buildSystemContext(),
      });
      addChatMessage(taskId, {
        id: (Date.now() + 1).toString(36),
        role: 'assistant',
        content: resp,
        model: resolvedModelId,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectModel = (p: AIProvider, m: string) => {
    updateTask(taskId, { modelOverride: { provider: p, modelId: m } });
    setShowModelPicker(false);
  };

  const handleClearOverride = () => {
    updateTask(taskId, { modelOverride: undefined });
    setShowModelPicker(false);
  };

  const displayModel = modelId.split('-').slice(0, 3).join(' ');

  const emptyState = (
    <div className="empty-state" style={{ height: '100%' }}>
      <div className="empty-state-inner">
        <div className="empty-state-icon">💬</div>
        <div className="empty-state-title">Start a conversation</div>
        <div className="empty-state-sub">
          {apiKey ? `Using ${displayModel}` : 'Configure API key in Settings'}
          {contextItems.length > 0 && (
            <>
              <br />
              {contextItems.length} context items will be included
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <MessageList
        messages={task.chatHistory}
        isLoading={isLoading}
        error={error}
        emptyState={emptyState}
      />
      <InputArea
        input={input}
        isLoading={isLoading}
        displayModel={displayModel}
        activeModelId={modelId}
        hasOverride={!!task.modelOverride}
        showModelPicker={showModelPicker}
        presetModels={presetModels}
        onInputChange={setInput}
        onSend={handleSend}
        onToggleModelPicker={() => setShowModelPicker(!showModelPicker)}
        onSelectModel={handleSelectModel}
        onClearOverride={handleClearOverride}
      />
    </>
  );
}
