import { useState, useRef, useEffect } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useContextPackStore } from '../stores/contextPackStore';
import { callAI } from '../services/ai';
import type { ChatMessage } from '../types/task';
import type { AIProvider } from '../stores/settingsStore';

const presetModels: { provider: AIProvider; models: string[] }[] = [
  { provider: 'claude', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-20250414'] },
  { provider: 'openai', models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'] },
  { provider: 'ollama', models: ['llama3.2', 'mistral', 'codellama'] },
];

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
  const endRef = useRef<HTMLDivElement>(null);

  const contextItemsRaw = useContextPackStore((s) => s.items[taskId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [task?.chatHistory.length]);

  if (!task) return null;

  // Resolve model: task override > global settings
  const provider = task.modelOverride?.provider || aiProvider;
  const resolvedModelId = task.modelOverride?.modelId || modelId;
  const resolvedOllamaUrl = ollamaUrl;
  const resolvedAuthMethod = (authMethod === 'oauth' && oauthAccessToken) ? 'oauth' as const : 'api-key' as const;
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

    const userMsg: ChatMessage = { id: Date.now().toString(36), role: 'user', content: text, timestamp: new Date().toISOString() };
    addChatMessage(taskId, userMsg);
    setInput('');
    setIsLoading(true);

    try {
      const resp = await callAI({
        provider, apiKey: resolvedApiKey, modelId: resolvedModelId, ollamaUrl: resolvedOllamaUrl,
        oauthToken: oauthAccessToken,
        authMethod: resolvedAuthMethod,
        messages: [...task.chatHistory, userMsg],
        taskTitle: buildSystemContext(),
      });
      addChatMessage(taskId, { id: (Date.now()+1).toString(36), role: 'assistant', content: resp, model: resolvedModelId, timestamp: new Date().toISOString() });
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

  const displayModel = modelId.split('-').slice(0, 3).join(' ');

  return (
    <>
      <div className="chat-messages">
        {task.chatHistory.length === 0 && (
          <div className="empty-state" style={{ height:'100%' }}>
            <div className="empty-state-inner">
              <div className="empty-state-icon">💬</div>
              <div className="empty-state-title">Start a conversation</div>
              <div className="empty-state-sub">
                {apiKey ? `Using ${displayModel}` : 'Configure API key in Settings'}
                {contextItems.length > 0 && <><br/>{contextItems.length} context items will be included</>}
              </div>
            </div>
          </div>
        )}
        {task.chatHistory.map((msg) => (
          <div key={msg.id} className="msg">
            <div className={`msg-avatar ${msg.role === 'assistant' ? 'ai' : 'user'}`}>
              {msg.role === 'assistant' ? 'C' : 'IL'}
            </div>
            <div className="msg-body">
              <div className="msg-name">{msg.role === 'assistant' ? (msg.model || 'AI') : 'ilya'}</div>
              <div className="msg-text" style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{msg.content}</div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="msg">
            <div className="msg-avatar ai">C</div>
            <div className="msg-body" style={{ display:'flex', alignItems:'center', gap:8, paddingTop:4 }}>
              <div className="loading-dot" />
              <span style={{ fontSize:13, color:'#52525b' }}>Thinking...</span>
            </div>
          </div>
        )}
        {error && <div className="error-box">{error}</div>}
        <div ref={endRef} />
      </div>
      <div className="chat-input">
        <input
          type="text" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="메시지를 입력하세요..."
        />
        <div style={{ position:'relative' }}>
          <div className="model-select" onClick={() => setShowModelPicker(!showModelPicker)}>
            <span className="m-dot" />
            {displayModel} ▾
          </div>
          {showModelPicker && (
            <div style={{ position:'absolute', bottom:'100%', right:0, marginBottom:4, background:'#0c0c10', border:'1px solid #18181b', borderRadius:10, padding:6, zIndex:20, minWidth:220, maxHeight:300, overflowY:'auto' }}>
              {task.modelOverride && (
                <button
                  onClick={() => { updateTask(taskId, { modelOverride: undefined }); setShowModelPicker(false); }}
                  style={{ display:'block', width:'100%', textAlign:'left', padding:'6px 10px', background:'none', border:'none', color:'#ef4444', fontSize:11, cursor:'pointer', fontFamily:'inherit', borderRadius:6, marginBottom:4 }}
                >
                  ✕ Use global default
                </button>
              )}
              {presetModels.map((group) => (
                <div key={group.provider}>
                  <div style={{ padding:'6px 10px', fontSize:9, fontWeight:600, color:'#3f3f46', textTransform:'uppercase', letterSpacing:1 }}>
                    {group.provider}
                  </div>
                  {group.models.map((m) => (
                    <button
                      key={m}
                      onClick={() => handleSelectModel(group.provider, m)}
                      style={{
                        display:'block', width:'100%', textAlign:'left', padding:'6px 10px',
                        background: modelId === m ? 'rgba(99,102,241,0.08)' : 'none',
                        border:'none', color: modelId === m ? '#818cf8' : '#a1a1aa',
                        fontSize:11, cursor:'pointer', fontFamily:"'JetBrains Mono', monospace", borderRadius:6,
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="send-btn" onClick={handleSend} disabled={!input.trim() || isLoading}>↑</button>
      </div>
    </>
  );
}
