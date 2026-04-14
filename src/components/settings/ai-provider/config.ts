import type { ProviderConfig } from './types';

/** 지원하는 AI 프로바이더 카탈로그. 순서대로 선택 UI에 렌더된다. */
export const providerConfigs: ProviderConfig[] = [
  {
    value: 'claude',
    label: 'Claude',
    icon: '🟣',
    model: 'claude-sonnet-4-20250514',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPageLabel: 'Anthropic Console',
    placeholder: 'sk-ant-api03-...',
    steps: [
      'Click "Connect" to open Anthropic Console',
      'Sign in or create an Anthropic account',
      'Click "Create Key" and copy it',
      'Paste your key below',
    ],
  },
  {
    value: 'openai',
    label: 'OpenAI',
    icon: '🟢',
    model: 'gpt-4o',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPageLabel: 'OpenAI Platform',
    placeholder: 'sk-proj-...',
    steps: [
      'Click "Connect" to open OpenAI Platform',
      'Sign in to your OpenAI account',
      'Click "Create new secret key" and copy it',
      'Paste your key below',
    ],
  },
  {
    value: 'ollama',
    label: 'Ollama',
    icon: '🦙',
    model: 'llama3.2',
    keyUrl: '',
    keyPageLabel: '',
    placeholder: '',
    steps: [
      'Install Ollama from ollama.com',
      'Run: ollama pull llama3.2',
      'Make sure Ollama is running locally',
      'Click "Test Connection" to verify',
    ],
  },
];
