export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'activity';
  content: string;
  toolName?: string;
}

export interface SlashCommand {
  name: string;
  description: string;
  source: string;
}

export interface ClaudeChatProps {
  taskId: string;
  cwd: string;
  onSwitchTab?: (tab: string) => void;
}
