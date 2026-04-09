/**
 * @module ai
 * AI provider abstraction layer.
 * 태스크별 AI 채팅을 위한 통합 인터페이스 — Claude, OpenAI, Ollama를 지원한다.
 * 각 provider의 API 형식 차이를 내부적으로 변환하여 호출자는 provider를 신경 쓸 필요가 없다.
 */

import type { ChatMessage } from '../types/task';
import type { AIProvider } from '../stores/settingsStore';

/** Parameters for a unified AI call across all supported providers */
interface AICallParams {
  provider: AIProvider;
  apiKey: string;
  oauthToken?: string;
  authMethod?: 'api-key' | 'oauth';
  modelId: string;
  ollamaUrl: string;
  messages: ChatMessage[];
  taskTitle: string;
}

/**
 * AI provider 통합 호출 함수.
 * provider에 따라 Claude / OpenAI / Ollama API를 호출한다.
 * @param params - Provider, credentials, model, messages 등 호출에 필요한 모든 정보
 * @returns AI가 생성한 응답 텍스트
 */
export async function callAI(params: AICallParams): Promise<string> {
  const { provider, apiKey, modelId, ollamaUrl, messages, taskTitle } = params;

  const systemPrompt = `You are an AI coding assistant helping with the task: "${taskTitle}". Be concise and helpful.`;

  // OAuth 토큰이 있으면 우선 사용, 없으면 API key로 fallback
  const token = params.authMethod === 'oauth' && params.oauthToken ? params.oauthToken : apiKey;

  switch (provider) {
    case 'claude':
      return callClaude(token, modelId, systemPrompt, messages, params.authMethod === 'oauth');
    case 'openai':
      return callOpenAI(apiKey, modelId, systemPrompt, messages);
    case 'ollama':
      return callOllama(ollamaUrl, modelId, systemPrompt, messages);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Claude (Anthropic) Messages API 호출.
 * OAuth와 API key 두 가지 인증 방식을 지원한다.
 * NOTE: 'anthropic-dangerous-direct-browser-access' 헤더는 브라우저에서 직접 호출 시 필수
 */
async function callClaude(
  apiKey: string,
  model: string,
  system: string,
  messages: ChatMessage[],
  isOAuth = false,
): Promise<string> {
  if (!apiKey) throw new Error('Claude API key not set. Go to Settings to configure.');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };

  // OAuth는 Bearer token, API key는 x-api-key 헤더 사용
  if (isOAuth) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else {
    headers['x-api-key'] = apiKey;
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
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

/** OpenAI Chat Completions API 호출. system prompt를 messages 배열 첫 번째로 삽입한다. */
async function callOpenAI(apiKey: string, model: string, system: string, messages: ChatMessage[]): Promise<string> {
  if (!apiKey) throw new Error('OpenAI API key not set. Go to Settings to configure.');

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '(empty response)';
}

/** Ollama (로컬 LLM) Chat API 호출. stream: false로 전체 응답을 한 번에 받는다. */
async function callOllama(baseUrl: string, model: string, system: string, messages: ChatMessage[]): Promise<string> {
  const resp = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Ollama error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return data.message?.content || '(empty response)';
}
