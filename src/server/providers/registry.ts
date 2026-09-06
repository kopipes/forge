import { ProviderAdapter } from './base.js';
import { OpenAIAdapter } from './openai.js';
import { AnthropicAdapter } from './anthropic.js';
import { GeminiAdapter } from './gemini.js';
import { ProviderConfig } from '../../shared/types.js';

export class ProviderRegistry {
  private adapters: Map<string, ProviderAdapter> = new Map();

  constructor() {
    this.register(new OpenAIAdapter());
    this.register(new AnthropicAdapter());
    this.register(new GeminiAdapter());
  }

  register(adapter: ProviderAdapter) {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(providerId: string): ProviderAdapter {
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      // default fallback to openai-compatible
      const fallback = this.adapters.get('openai-compatible');
      if (fallback) return fallback;
      throw new Error(`Provider adapter "${providerId}" not found.`);
    }
    return adapter;
  }

  getAvailableProviders(): ProviderConfig[] {
    return [
      {
        id: 'openai-compatible',
        name: 'OpenAI / Compatible (Groq, DeepSeek, xAI, etc.)',
        type: 'openai-compatible',
        defaultModel: 'gpt-4o',
        availableModels: [
          'gpt-4o',
          'gpt-4o-mini',
          'o1',
          'o3-mini',
          'deepseek-chat',
          'deepseek-reasoner',
          'claude-3-7-sonnet',
          'llama-3.3-70b-versatile'
        ]
      },
      {
        id: 'anthropic',
        name: 'Anthropic Claude',
        type: 'anthropic',
        defaultModel: 'claude-3-5-sonnet-latest',
        availableModels: [
          'claude-3-5-sonnet-latest',
          'claude-3-7-sonnet-latest',
          'claude-3-5-haiku-latest',
          'claude-3-opus-latest'
        ]
      },
      {
        id: 'gemini',
        name: 'Google Gemini',
        type: 'gemini',
        defaultModel: 'gemini-2.0-flash',
        availableModels: [
          'gemini-2.0-flash',
          'gemini-2.0-pro-exp',
          'gemini-1.5-pro',
          'gemini-1.5-flash'
        ]
      }
    ];
  }
}
