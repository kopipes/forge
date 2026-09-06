import { LLMMessage, ToolDefinition, LLMResponse } from '../../shared/types.js';

export interface ProviderAdapter {
  id: string;
  name: string;
  generateResponse(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    model: string,
    systemPrompt: string,
    options?: { apiKey?: string; baseUrl?: string }
  ): Promise<LLMResponse>;
}
