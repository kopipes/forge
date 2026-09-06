import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import { ModelConfig } from '../../shared/types';
import { Settings, X, Save, Key, Globe, CheckCircle2, Plus, Trash2, Cpu } from 'lucide-react';

export const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'keys' | 'models'>('models');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [showAddModel, setShowAddModel] = useState(false);
  const [newModel, setNewModel] = useState<Partial<ModelConfig>>({
    name: '',
    provider: 'openai-compatible',
    modelId: '',
    baseUrl: '',
    apiKey: ''
  });

  const [settings, setSettings] = useState({
    openaiApiKey: '',
    anthropicApiKey: '',
    geminiApiKey: '',
    openaiBaseUrl: 'https://api.openai.com/v1',
    hasOpenAI: false,
    hasAnthropic: false,
    hasGemini: false
  });

  const loadData = async () => {
    try {
      const [settingsData, modelsData] = await Promise.all([
        apiRequest('/api/settings'),
        apiRequest<ModelConfig[]>('/api/models')
      ]);
      setSettings(settingsData);
      setModels(modelsData);
    } catch (err: any) {
      console.error('Error loading settings:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setSaved(false);
      setError('');
    }
  }, [isOpen]);

  const handleSaveKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSaved(false);

    try {
      await apiRequest('/api/settings', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleAddModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModel.name || !newModel.modelId) return;

    const id = `model_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const updatedList: ModelConfig[] = [
      ...models,
      {
        id,
        name: newModel.name!,
        provider: newModel.provider || 'openai-compatible',
        modelId: newModel.modelId!,
        baseUrl: newModel.baseUrl || undefined,
        apiKey: newModel.apiKey || undefined
      }
    ];

    try {
      setLoading(true);
      await apiRequest('/api/models', {
        method: 'POST',
        body: JSON.stringify({ models: updatedList })
      });
      setModels(updatedList);
      setShowAddModel(false);
      setNewModel({
        name: '',
        provider: 'openai-compatible',
        modelId: '',
        baseUrl: '',
        apiKey: ''
      });
    } catch (err: any) {
      setError(err.message || 'Failed to add model');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteModel = async (id: string) => {
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
      <div className="bg-surface border border-border rounded-lg max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <Settings className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold text-zinc-100">LLM & Models Configuration</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-border bg-surface/50 text-[11px] shrink-0">
          <button
            onClick={() => setActiveTab('models')}
            className={`flex-1 py-2 text-center border-b-2 font-medium ${activeTab === 'models' ? 'border-accent text-accent' : 'border-transparent text-zinc-400'}`}
          >
            My Models ({models.length})
          </button>
          <button
            onClick={() => setActiveTab('keys')}
            className={`flex-1 py-2 text-center border-b-2 font-medium ${activeTab === 'keys' ? 'border-accent text-accent' : 'border-transparent text-zinc-400'}`}
          >
            Provider API Keys
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 text-xs">
          {saved && (
            <div className="mb-3 flex items-center space-x-1.5 p-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>Saved successfully!</span>
            </div>
          )}

          {error && (
            <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded text-xs">
              {error}
            </div>
          )}

          {/* TAB 1: MODELS */}
          {activeTab === 'models' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 font-semibold uppercase">Active Models in Dropdown</span>
                <button
                  onClick={() => setShowAddModel(!showAddModel)}
                  className="flex items-center space-x-1 text-[11px] text-accent bg-accent/10 border border-accent/30 px-2 py-0.5 rounded hover:bg-accent/20"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Model</span>
                </button>
              </div>

              {/* Add Model Form */}
              {showAddModel && (
                <form onSubmit={handleAddModel} className="p-3 bg-background rounded-lg border border-border space-y-2.5">
                  <div className="text-xs font-bold text-zinc-200">Add New Model Preset</div>

                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-0.5">DISPLAY NAME</label>
                    <input
                      type="text"
                      placeholder="e.g. DeepSeek V3, Claude 3.7, Groq Llama"
                      value={newModel.name}
                      onChange={e => setNewModel({ ...newModel, name: e.target.value })}
                      className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-zinc-100"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-0.5">PROVIDER TYPE</label>
                      <select
                        value={newModel.provider}
                        onChange={e => setNewModel({ ...newModel, provider: e.target.value as any })}
                        className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-zinc-100"
                      >
                        <option value="openai-compatible">OpenAI Compatible</option>
                        <option value="anthropic">Anthropic Claude</option>
                        <option value="gemini">Google Gemini</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-0.5">MODEL ID</label>
                      <input
                        type="text"
                        placeholder="e.g. deepseek-chat, gpt-4o"
                        value={newModel.modelId}
                        onChange={e => setNewModel({ ...newModel, modelId: e.target.value })}
                        className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-zinc-100 font-mono"
                        required
                      />
                    </div>
                  </div>

                  {newModel.provider === 'openai-compatible' && (
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-0.5">CUSTOM BASE URL (OPTIONAL)</label>
                      <input
                        type="text"
                        placeholder="e.g. https://api.deepseek.com or https://api.groq.com/openai/v1"
                        value={newModel.baseUrl}
                        onChange={e => setNewModel({ ...newModel, baseUrl: e.target.value })}
                        className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-zinc-100 font-mono"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-0.5">CUSTOM API KEY FOR THIS MODEL (OPTIONAL)</label>
                    <input
                      type="password"
                      placeholder="Leave empty to use global provider key"
                      value={newModel.apiKey}
                      onChange={e => setNewModel({ ...newModel, apiKey: e.target.value })}
                      className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-zinc-100 font-mono"
                    />
                  </div>

                  <div className="flex space-x-2 pt-1">
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 bg-accent hover:bg-emerald-600 text-zinc-950 font-bold py-1 rounded text-xs"
                    >
                      Save Model
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddModel(false)}
                      className="px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-1 rounded text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Models List */}
              <div className="space-y-1.5">
                {models.map(m => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2.5 bg-background border border-border rounded-lg"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <Cpu className="w-3.5 h-3.5 text-accent" />
                        <span className="font-semibold text-zinc-100">{m.name}</span>
                        <span className="text-[9px] text-zinc-400 bg-surface border border-border px-1 py-0.2 rounded font-mono">
                          {m.provider}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        id: {m.modelId} {m.baseUrl ? `(${m.baseUrl})` : ''}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteModel(m.id)}
                      title="Delete model"
                      className="p-1 text-zinc-500 hover:text-red-400 rounded hover:bg-surface"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: GLOBAL KEYS */}
          {activeTab === 'keys' && (
            <form onSubmit={handleSaveKeys} className="space-y-3.5">
              {/* OpenAI / Compatible */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-zinc-400 font-semibold flex items-center space-x-1">
                    <Key className="w-3 h-3 text-emerald-400" />
                    <span>DEFAULT OPENAI / COMPATIBLE API KEY</span>
                  </label>
                  {settings.hasOpenAI && (
                    <span className="text-[9px] text-emerald-400 font-mono bg-emerald-950/60 px-1 rounded">Configured</span>
                  )}
                </div>
                <input
                  type="password"
                  placeholder={settings.openaiApiKey || "sk-..."}
                  value={settings.openaiApiKey}
                  onChange={e => setSettings({ ...settings, openaiApiKey: e.target.value })}
                  className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-accent font-mono"
                />
              </div>

              {/* Custom Base URL (OpenAI / DeepSeek / Groq) */}
              <div>
                <label className="text-[10px] text-zinc-400 font-semibold flex items-center space-x-1 mb-1">
                  <Globe className="w-3 h-3 text-sky-400" />
                  <span>DEFAULT OPENAI-COMPATIBLE BASE URL</span>
                </label>
                <input
                  type="text"
                  placeholder="https://api.openai.com/v1"
                  value={settings.openaiBaseUrl}
                  onChange={e => setSettings({ ...settings, openaiBaseUrl: e.target.value })}
                  className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-accent font-mono"
                />
              </div>

              {/* Anthropic Claude */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-zinc-400 font-semibold flex items-center space-x-1">
                    <Key className="w-3 h-3 text-amber-400" />
                    <span>DEFAULT ANTHROPIC CLAUDE API KEY</span>
                  </label>
                  {settings.hasAnthropic && (
                    <span className="text-[9px] text-emerald-400 font-mono bg-emerald-950/60 px-1 rounded">Configured</span>
                  )}
                </div>
                <input
                  type="password"
                  placeholder={settings.anthropicApiKey || "sk-ant-..."}
                  value={settings.anthropicApiKey}
                  onChange={e => setSettings({ ...settings, anthropicApiKey: e.target.value })}
                  className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-accent font-mono"
                />
              </div>

              {/* Google Gemini */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-zinc-400 font-semibold flex items-center space-x-1">
                    <Key className="w-3 h-3 text-indigo-400" />
                    <span>DEFAULT GOOGLE GEMINI API KEY</span>
                  </label>
                  {settings.hasGemini && (
                    <span className="text-[9px] text-emerald-400 font-mono bg-emerald-950/60 px-1 rounded">Configured</span>
                  )}
                </div>
                <input
                  type="password"
                  placeholder={settings.geminiApiKey || "AIzaSy..."}
                  value={settings.geminiApiKey}
                  onChange={e => setSettings({ ...settings, geminiApiKey: e.target.value })}
                  className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-accent font-mono"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-accent hover:bg-emerald-600 text-zinc-950 font-bold py-2 rounded text-xs flex items-center justify-center space-x-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{loading ? 'Saving Keys...' : 'Save Global API Keys'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
