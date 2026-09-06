import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import { ModelConfig } from '../../shared/types';
import { Settings, X, Save, Key, Globe, CheckCircle2, Plus, Trash2, Cpu, Edit3 } from 'lucide-react';

export const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<Partial<ModelConfig>>({
    name: '',
    provider: 'openai-compatible',
    modelId: '',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: ''
  });

  const loadData = async () => {
    try {
      const modelsData = await apiRequest<ModelConfig[]>('/api/models');
      setModels(modelsData);
    } catch (err: any) {
      console.error('Error loading models:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setSaved(false);
      setError('');
      setEditingId(null);
    }
  }, [isOpen]);

  const handleSaveModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name || !formState.modelId) return;

    let updatedList: ModelConfig[];
    if (editingId) {
      updatedList = models.map(m => m.id === editingId ? {
        ...m,
        name: formState.name!,
        provider: formState.provider || 'openai-compatible',
        modelId: formState.modelId!,
        baseUrl: formState.baseUrl || undefined,
        apiKey: formState.apiKey || undefined
      } : m);
    } else {
      const id = `model_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      updatedList = [
        ...models,
        {
          id,
          name: formState.name!,
          provider: formState.provider || 'openai-compatible',
          modelId: formState.modelId!,
          baseUrl: formState.baseUrl || undefined,
          apiKey: formState.apiKey || undefined
        }
      ];
    }

    try {
      setLoading(true);
      await apiRequest('/api/models', {
        method: 'POST',
        body: JSON.stringify({ models: updatedList })
      });
      setModels(updatedList);
      setSaved(true);
      setEditingId(null);
      setFormState({
        name: '',
        provider: 'openai-compatible',
        modelId: '',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: ''
      });
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to save model');
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (m: ModelConfig) => {
    setEditingId(m.id);
    setFormState({
      name: m.name,
      provider: m.provider,
      modelId: m.modelId,
      baseUrl: m.baseUrl || '',
      apiKey: m.apiKey || ''
    });
  };

  const handleDeleteModel = async (id: string) => {
    if (!confirm('Remove this model configuration?')) return;
    const updatedList = models.filter(m => m.id !== id);
    try {
      await apiRequest('/api/models', {
        method: 'POST',
        body: JSON.stringify({ models: updatedList })
      });
      setModels(updatedList);
    } catch (err: any) {
      setError(err.message || 'Failed to delete model');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 p-4 flex flex-col justify-center items-center">
      <div className="bg-surface border border-border rounded-lg max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <Settings className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold text-zinc-100">Providers & LLM Models (Kilo-Style)</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 text-xs space-y-4">
          {saved && (
            <div className="flex items-center space-x-1.5 p-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>Provider & Model settings saved successfully!</span>
            </div>
          )}

          {error && (
            <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded text-xs">
              {error}
            </div>
          )}

          {/* Add / Edit Form */}
          <form onSubmit={handleSaveModel} className="p-3 bg-background rounded-lg border border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-200">
                {editingId ? 'Edit Model Configuration' : 'Add New Provider / Model'}
              </span>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setFormState({
                      name: '',
                      provider: 'openai-compatible',
                      modelId: '',
                      baseUrl: 'https://api.openai.com/v1',
                      apiKey: ''
                    });
                  }}
                  className="text-[10px] text-zinc-400 underline"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div>
              <label className="block text-[10px] text-zinc-400 mb-0.5">DISPLAY LABEL / NAME</label>
              <input
                type="text"
                placeholder="e.g. DeepSeek V3, Claude 3.7 Sonnet, Groq Llama 3.3"
                value={formState.name}
                onChange={e => setFormState({ ...formState, name: e.target.value })}
                className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-zinc-100"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-zinc-400 mb-0.5">PROVIDER TYPE</label>
                <select
                  value={formState.provider}
                  onChange={e => setFormState({ ...formState, provider: e.target.value as any })}
                  className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-zinc-100"
                >
                  <option value="openai-compatible">OpenAI Compatible (DeepSeek, Groq, xAI, etc.)</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 mb-0.5">MODEL ID</label>
                <input
                  type="text"
                  placeholder="e.g. deepseek-chat, gpt-4o, claude-3-7-sonnet"
                  value={formState.modelId}
                  onChange={e => setFormState({ ...formState, modelId: e.target.value })}
                  className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-zinc-100 font-mono"
                  required
                />
              </div>
            </div>

            {formState.provider === 'openai-compatible' && (
              <div>
                <label className="block text-[10px] text-zinc-400 mb-0.5">BASE URL</label>
                <input
                  type="text"
                  placeholder="https://api.openai.com/v1 (or https://api.deepseek.com, https://api.groq.com/openai/v1)"
                  value={formState.baseUrl}
                  onChange={e => setFormState({ ...formState, baseUrl: e.target.value })}
                  className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-zinc-100 font-mono"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] text-zinc-400 mb-0.5">API KEY</label>
              <input
                type="password"
                placeholder="sk-..."
                value={formState.apiKey}
                onChange={e => setFormState({ ...formState, apiKey: e.target.value })}
                className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-zinc-100 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-emerald-600 text-zinc-950 font-bold py-1.5 rounded text-xs flex items-center justify-center space-x-1"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{editingId ? 'Update Model' : 'Save to My Models'}</span>
            </button>
          </form>

          {/* Configured Models List */}
          <div className="space-y-1.5">
            <div className="text-[10px] text-zinc-400 font-semibold uppercase">
              Configured Models Available in Dropdown ({models.length})
            </div>

            {models.map(m => (
              <div
                key={m.id}
                className="flex items-center justify-between p-2.5 bg-background border border-border rounded-lg"
              >
                <div className="overflow-hidden pr-2">
                  <div className="flex items-center space-x-1.5">
                    <Cpu className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="font-semibold text-zinc-100 truncate">{m.name}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                    {m.provider} • {m.modelId}
                  </div>
                  {m.baseUrl && (
                    <div className="text-[9px] text-zinc-600 font-mono truncate">
                      {m.baseUrl}
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    onClick={() => handleStartEdit(m)}
                    title="Edit model"
                    className="p-1 text-zinc-400 hover:text-zinc-100 rounded hover:bg-surface"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteModel(m.id)}
                    title="Delete model"
                    className="p-1 text-zinc-400 hover:text-red-400 rounded hover:bg-surface"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
