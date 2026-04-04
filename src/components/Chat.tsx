import { useState, useRef, useEffect } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useSettingsStore } from '../stores/settingsStore';
import { callAI } from '../services/ai';
import type { ChatMessage } from '../types/task';

export function Chat({ taskId }: { taskId: string }) {
  const { tasks, addChatMessage } = useTaskStore();
  const settings = useSettingsStore();
  const task = tasks.find((t) => t.id === taskId);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [task?.chatHistory.length]);

  if (!task) return null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setError(null);

    const userMsg: ChatMessage = { id: Date.now().toString(36), role: 'user', content: text, timestamp: new Date().toISOString() };
    addChatMessage(taskId, userMsg);
    setInput('');
    setIsLoading(true);

    try {
      const resp = await callAI({ provider: settings.aiProvider, apiKey: settings.apiKey, modelId: settings.modelId, ollamaUrl: settings.ollamaUrl, messages: [...task.chatHistory, userMsg], taskTitle: task.title });
      addChatMessage(taskId, { id: (Date.now()+1).toString(36), role: 'assistant', content: resp, model: settings.modelId, timestamp: new Date().toISOString() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="chat-messages">
        {task.chatHistory.length === 0 && (
          <div className="empty-state" style={{ height:'100%' }}>
            <div className="empty-state-inner">
              <div className="empty-state-icon">💬</div>
              <div className="empty-state-title">Start a conversation</div>
              <div className="empty-state-sub">{settings.apiKey ? `Using ${settings.modelId}` : 'Configure API key in Settings'}</div>
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
        <div className="model-select">
          <span className="m-dot" />
          {settings.modelId.split('/').pop()?.split('-').slice(0,3).join(' ') || 'No model'} ▾
        </div>
        <button className="send-btn" onClick={handleSend} disabled={!input.trim() || isLoading}>↑</button>
      </div>
    </>
  );
}
