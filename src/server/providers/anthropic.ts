import { ProviderAdapter } from './base.js';
import { LLMMessage, ToolDefinition, LLMResponse, ToolCall } from '../../shared/types.js';

export class AnthropicAdapter implements ProviderAdapter {
  id = 'anthropic';
  name = 'Anthropic Claude';

  async generateResponse(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    model: string,
    systemPrompt: string,
    options?: { apiKey?: string; baseUrl?: string }
  ): Promise<LLMResponse> {
    const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY || process.env.FORGE_LLM_API_KEY || '';
    const baseUrl = options?.baseUrl || 'https://api.anthropic.com/v1';

    const formattedMessages: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        formattedMessages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        const contentBlocks: any[] = [];
        if (msg.content) {
          contentBlocks.push({ type: 'text', text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            contentBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments
            });
          }
        }
        formattedMessages.push({ role: 'assistant', content: contentBlocks.length > 0 ? contentBlocks : msg.content });
      } else if (msg.role === 'tool' && msg.toolResults) {
        const toolResultBlocks = msg.toolResults.map(tr => ({
          type: 'tool_result',
          tool_use_id: tr.toolCallId,
          content: tr.output,
          is_error: tr.isError || false
        }));
        formattedMessages.push({ role: 'user', content: toolResultBlocks });
      }
    }

    const formattedTools = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters
    }));

    const payload: any = {
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: formattedMessages,
      ...(formattedTools.length > 0 ? { tools: formattedTools } : {})
    };

    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errText}`);
    }

    const data: any = await response.json();
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          textContent += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input || {}
          });
        }
      }
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop'
    };
  }
}
