import type { ChatMessage } from '../types/task';
import type { AIProvider } from '../stores/settingsStore';

interface AICallParams {
  provider: AIProvider;
  apiKey: string;
  modelId: string;
  ollamaUrl: string;
  messages: ChatMessage[];
  taskTitle: string;
}

export async function callAI(params: AICallParams): Promise<string> {
  const { provider, apiKey, modelId, ollamaUrl, messages, taskTitle } = params;

  const systemPrompt = `You are an AI coding assistant helping with the task: "${taskTitle}". Be concise and helpful.`;

  switch (provider) {
    case 'claude':
      return callClaude(apiKey, modelId, systemPrompt, messages);
    case 'openai':
      return callOpenAI(apiKey, modelId, systemPrompt, messages);
    case 'ollama':
      return callOllama(ollamaUrl, modelId, systemPrompt, messages);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

async function callClaude(apiKey: string, model: string, system: string, messages: ChatMessage[]): Promise<string> {
  if (!apiKey) throw new Error('Claude API key not set. Go to Settings to configure.');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Claude API error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return data.content?.[0]?.text || '(empty response)';
}

async function callOpenAI(apiKey: string, model: string, system: string, messages: ChatMessage[]): Promise<string> {
  if (!apiKey) throw new Error('OpenAI API key not set. Go to Settings to configure.');

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '(empty response)';
}

async function callOllama(baseUrl: string, model: string, system: string, messages: ChatMessage[]): Promise<string> {
  const resp = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Ollama error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return data.message?.content || '(empty response)';
}
