import { ProviderAdapter } from './base.js';
import { LLMMessage, ToolDefinition, LLMResponse, ToolCall } from '../../shared/types.js';

export class OpenAIAdapter implements ProviderAdapter {
  id = 'openai-compatible';
  name = 'OpenAI Compatible';

  async generateResponse(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    model: string,
    systemPrompt: string,
    options?: { apiKey?: string; baseUrl?: string }
  ): Promise<LLMResponse> {
    const apiKey = options?.apiKey || process.env.OPENAI_API_KEY || process.env.FORGE_LLM_API_KEY || '';
    const baseUrl = options?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    const formattedMessages: any[] = [{ role: 'system', content: systemPrompt }];

    for (const msg of messages) {
      if (msg.role === 'user') {
        formattedMessages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        const assistantMsg: any = { role: 'assistant', content: msg.content || null };
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          assistantMsg.tool_calls = msg.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments)
            }
          }));
        }
        formattedMessages.push(assistantMsg);
      } else if (msg.role === 'tool' && msg.toolResults) {
        for (const tr of msg.toolResults) {
          formattedMessages.push({
            role: 'tool',
            tool_call_id: tr.toolCallId,
            name: tr.name,
            content: tr.output
          });
        }
      }
    }

    const formattedTools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    const payload: any = {
      model,
      messages: formattedMessages,
      ...(formattedTools.length > 0 ? { tools: formattedTools } : {})
    };

    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errText}`);
    }

    const data: any = await response.json();
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('No choices returned from LLM provider.');
    }

    const message = choice.message;
    const toolCalls: ToolCall[] = [];

    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        let args = {};
        try {
          args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
        } catch (e) {
          args = { raw: tc.function.arguments };
        }
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: args
        });
      }
    }

    return {
      content: message.content || '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: choice.finish_reason === 'tool_calls' ? 'tool_calls' : 'stop'
    };
  }
}
