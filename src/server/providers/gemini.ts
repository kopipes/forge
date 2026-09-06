import { ProviderAdapter } from './base.js';
import { LLMMessage, ToolDefinition, LLMResponse, ToolCall } from '../../shared/types.js';

export class GeminiAdapter implements ProviderAdapter {
  id = 'gemini';
  name = 'Google Gemini';

  async generateResponse(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    model: string,
    systemPrompt: string,
    options?: { apiKey?: string; baseUrl?: string }
  ): Promise<LLMResponse> {
    const apiKey = options?.apiKey || process.env.GEMINI_API_KEY || process.env.FORGE_LLM_API_KEY || '';
    const baseUrl = options?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';

    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }]
        });
      } else if (msg.role === 'assistant') {
        const parts: any[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments
              }
            });
          }
        }
        contents.push({
          role: 'model',
          parts: parts.length > 0 ? parts : [{ text: '' }]
        });
      } else if (msg.role === 'tool' && msg.toolResults) {
        const parts = msg.toolResults.map(tr => ({
          functionResponse: {
            name: tr.name,
            response: { output: tr.output }
          }
        }));
        contents.push({
          role: 'user',
          parts
        });
      }
    }

    const functionDeclarations = tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));

    const payload: any = {
      contents,
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      ...(functionDeclarations.length > 0
        ? { tools: [{ functionDeclarations }] }
        : {})
    };

    const targetModel = model.startsWith('gemini-') ? model : `gemini-${model}`;
    const url = `${baseUrl.replace(/\/+$/, '')}/models/${targetModel}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const resText = await response.text();

    if (!response.ok) {
      throw new Error(`Gemini API error (${response.status}): ${resText}`);
    }

    const data: any = JSON.parse(resText);
    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content) {
      throw new Error('No candidates returned from Gemini API.');
    }

    let textContent = '';
    const toolCalls: ToolCall[] = [];

    if (Array.isArray(candidate.content.parts)) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          textContent += part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args || {}
          });
        }
      }
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop'
    };
  }
}
