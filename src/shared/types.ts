export type Role = 'user' | 'assistant' | 'system' | 'tool';

export interface ModelConfig {
  id: string;
  name: string; // e.g. "DeepSeek V3", "Claude 3.7 Sonnet (Reasoning)", "OpenAI GPT-4o", "Groq Llama 3.3"
  provider: 'openai-compatible' | 'anthropic' | 'gemini';
  modelId: string; // e.g. "deepseek-chat", "claude-3-7-sonnet-latest"
  apiKey?: string;
  baseUrl?: string;
  pinned?: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: 'anthropic' | 'openai-compatible' | 'gemini';
  baseUrl?: string;
  apiKey?: string;
  defaultModel: string;
  availableModels: string[];
}

export interface Project {
  id: string;
  name: string;
  path: string;
  gitRemote?: string;
  defaultProvider: string;
  defaultModel: string;
  deployCmd?: string;
  devPort?: number; // Port of live dev preview server running on VPS
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  projectId?: string | null; // null for VPS Ops
  title: string;
  provider: string;
  model: string;
  status: 'idle' | 'running' | 'waiting_confirmation' | 'error';
  createdAt: string;
  updatedAt: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  output: string;
  isError?: boolean;
}

export interface Message {
  id: string;
  sessionId: string;
  role: Role;
  content: string;
  model?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  createdAt: string;
}

export interface ConfirmationRequest {
  id: string;
  taskId: string;
  action: string;
  description: string;
  command?: string;
  details?: Record<string, any>;
}

export interface Task {
  id: string;
  sessionId: string;
  prompt: string;
  status: 'pending' | 'running' | 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled';
  pendingConfirmation?: ConfirmationRequest | null;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommandLog {
  id: string;
  projectId?: string | null;
  sessionId: string;
  taskId?: string | null;
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  createdAt: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  requiresConfirmation?: boolean;
}

export interface LLMMessage {
  role: Role;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason?: 'stop' | 'tool_calls' | 'content_filter' | 'length' | 'error';
}
