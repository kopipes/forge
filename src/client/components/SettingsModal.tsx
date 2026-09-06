import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import { ModelConfig } from '../../shared/types';
import { Settings, X, Save, Key, Globe, CheckCircle2, Plus, Trash2, Cpu, RefreshCw, Search, CheckSquare, Square } from 'lucide-react';

export const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [models, setModels] = useState<ModelConfig[]>([]);

  // Provider Form State
  const [providerType, setProviderType] = useState<'openai-compatible' | 'anthropic' | 'gemini'>('openai-compatible');
  const [providerName, setProviderName] = useState('OpenAI');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');

  // Discovered Models state
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [selectedDiscovered, setSelectedDiscovered] = useState<Set<string>>(new Set());
  const [modelSearch, setModelSearch] = useState('');

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
    }
  }, [isOpen]);

  // Update default name & baseUrl when provider changes
  const handleProviderTypeChange = (type: 'openai-compatible' | 'anthropic' | 'gemini') => {
    setProviderType(type);
    setDiscoveredModels([]);
    setSelectedDiscovered(new Set());
    if (type === 'anthropic') {
      setProviderName('Anthropic');
      setBaseUrl('https://api.anthropic.com/v1');
    } else if (type === 'gemini') {
      setProviderName('Gemini');
      setBaseUrl('https://generativelanguage.googleapis.com/v1beta');
    } else {
      setProviderName('OpenAI');
      setBaseUrl('https://api.openai.com/v1');
    }
  };

  // Detect provider name based on baseUrl
  const handleBaseUrlChange = (url: string) => {
    setBaseUrl(url);
    if (url.includes('deepseek')) {
      setProviderName('DeepSeek');
    } else if (url.includes('groq')) {
      setProviderName('Groq');
    } else if (url.includes('openrouter')) {
      setProviderName('OpenRouter');
    } else if (url.includes('together')) {
      setProviderName('Together');
    } else if (url.includes('openai.com')) {
      setProviderName('OpenAI');
    }
  };

  // Fetch available models from the provider
  const handleFetchModels = async () => {
    if (!apiKey.trim() && providerType !== 'openai-compatible') {
      setError('Please enter your API Key to fetch available models.');
      return;
    }

    setFetchingModels(true);
    setError('');
    setDiscoveredModels([]);
    setSelectedDiscovered(new Set());

    try {
      const res = await apiRequest<{ models: string[] }>('/api/models/fetch-from-provider', {
        method: 'POST',
        body: JSON.stringify({
          provider: providerType,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim()
        })
      });

      if (!res.models || res.models.length === 0) {
        setError('No models found from this provider.');
      } else {
        setDiscoveredModels(res.models);
        // Preselect popular models if matching
        const initialSelected = new Set<string>();
        for (const m of res.models) {
          if (
            m.includes('chat') ||
            m.includes('gpt-4') ||
            m.includes('sonnet') ||
            m.includes('flash') ||
            m.includes('llama-3.3')
          ) {
            initialSelected.add(m);
          }
        }
        if (initialSelected.size === 0 && res.models.length > 0) {
          initialSelected.add(res.models[0]);
        }
        setSelectedDiscovered(initialSelected);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch models from provider');
    } finally {
      setFetchingModels(false);
    }
  };

  // Toggle selection for a discovered model
  const toggleModelSelection = (modelId: string) => {
    const next = new Set(selectedDiscovered);
    if (next.has(modelId)) {
      next.delete(modelId);
    } else {
      next.add(modelId);
    }
    setSelectedDiscovered(next);
  };

  // Select / Deselect all filtered models
  const toggleSelectAll = () => {
    const filtered = filteredDiscovered();
    const allSelected = filtered.every(m => selectedDiscovered.has(m));
    const next = new Set(selectedDiscovered);
    if (allSelected) {
      filtered.forEach(m => next.delete(m));
    } else {
      filtered.forEach(m => next.add(m));
    }
    setSelectedDiscovered(next);
  };

  const filteredDiscovered = () => {
    if (!modelSearch.trim()) return discoveredModels;
    return discoveredModels.filter(m => m.toLowerCase().includes(modelSearch.toLowerCase().trim()));
  };

  // Save selected models with format: provider - model
  const handleSaveSelectedModels = async () => {
    if (selectedDiscovered.size === 0) {
      setError('Please select at least one model to add.');
      return;
    }

    setLoading(true);
    setError('');

    const prefix = providerName.trim() || 'Custom';
    const newEntries: ModelConfig[] = Array.from(selectedDiscovered).map(modelId => ({
      id: `model_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: `${prefix} - ${modelId}`,
      provider: providerType,
      modelId,
      baseUrl: providerType === 'openai-compatible' ? baseUrl.trim() : undefined,
      apiKey: apiKey.trim() || undefined
    }));

    // Filter out duplicates with existing model name
    const existingNames = new Set(models.map(m => m.name));
    const filteredNew = newEntries.filter(m => !existingNames.has(m.name));
    const updatedList = [...models, ...filteredNew];

    try {
      await apiRequest('/api/models', {
        method: 'POST',
        body: JSON.stringify({ models: updatedList })
      });
      setModels(updatedList);
      setSaved(true);
      setDiscoveredModels([]);
      setSelectedDiscovered(new Set());
      setApiKey('');
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to save models');
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
    <div className="fixed inset-0 bg-black/80 z-50 p-3 sm:p-4 flex flex-col justify-center items-center">
      <div className="bg-surface border border-border rounded-lg max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <Settings className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold text-zinc-100">LLM Providers & Models Setup</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 text-xs space-y-4">
          {saved && (
            <div className="flex items-center space-x-1.5 p-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>Models saved successfully! Available in dropdown.</span>
            </div>
          )}

          {error && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded text-xs">
              {error}
            </div>
          )}

          {/* Form to connect Provider & Fetch Models */}
          <div className="p-3 bg-background rounded-lg border border-border space-y-3">
            <div className="text-xs font-bold text-zinc-200 flex items-center justify-between">
              <span>Connect Provider & Auto-Fetch Models</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1 font-semibold">PROVIDER TYPE</label>
                <select
                  value={providerType}
                  onChange={e => handleProviderTypeChange(e.target.value as any)}
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-accent"
                >
                  <option value="openai-compatible">OpenAI-Compatible (DeepSeek, Groq, xAI, etc.)</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 mb-1 font-semibold">PROVIDER NAME (PREFIX)</label>
                <input
                  type="text"
                  placeholder="e.g. DeepSeek, Groq, OpenAI"
                  value={providerName}
                  onChange={e => setProviderName(e.target.value)}
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-accent"
                  required
                />
              </div>
            </div>

            {providerType === 'openai-compatible' && (
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1 font-semibold flex items-center space-x-1">
                  <Globe className="w-3 h-3 text-sky-400" />
                  <span>BASE URL</span>
                </label>
                <input
                  type="text"
                  placeholder="https://api.openai.com/v1 (or https://api.deepseek.com, https://api.groq.com/openai/v1)"
                  value={baseUrl}
                  onChange={e => handleBaseUrlChange(e.target.value)}
                  className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-accent"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] text-zinc-400 mb-1 font-semibold flex items-center space-x-1">
                <Key className="w-3 h-3 text-emerald-400" />
                <span>API KEY</span>
              </label>
              <input
                type="password"
                placeholder="Paste API Key here..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-accent"
              />
            </div>

            <button
              type="button"
              onClick={handleFetchModels}
              disabled={fetchingModels}
              className="w-full bg-surface hover:bg-zinc-800 border border-zinc-700 text-zinc-100 font-bold py-1.5 rounded text-xs flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${fetchingModels ? 'animate-spin text-accent' : 'text-zinc-400'}`} />
              <span>{fetchingModels ? 'Fetching Models from Provider...' : 'Fetch Available Models'}</span>
            </button>

            {/* Discovered Models Checkbox List */}
            {discoveredModels.length > 0 && (
              <div className="mt-3 p-3 bg-zinc-950 border border-border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-accent">
                    Discovered {discoveredModels.length} Models
                  </span>
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-[10px] text-zinc-400 hover:text-zinc-200 underline"
                  >
                    Select/Deselect All
                  </button>
                </div>

                {/* Model Search Box */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search models..."
                    value={modelSearch}
                    onChange={e => setModelSearch(e.target.value)}
                    className="w-full bg-surface border border-border rounded px-2.5 py-1 text-[11px] text-zinc-100 pl-7"
                  />
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2 top-2" />
                </div>

                {/* Scrollable Model Checkbox List */}
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {filteredDiscovered().map(modelId => {
                    const isSelected = selectedDiscovered.has(modelId);
                    return (
                      <div
                        key={modelId}
                        onClick={() => toggleModelSelection(modelId)}
                        className={`flex items-center justify-between p-1.5 rounded cursor-pointer border text-[11px] transition-colors ${
                          isSelected
                            ? 'bg-accent/10 border-accent/40 text-zinc-100'
                            : 'bg-surface/50 border-transparent text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate pr-2">
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-accent shrink-0" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                          )}
                          <span className="font-mono truncate">{modelId}</span>
                        </div>
                        <span className="text-[9px] text-zinc-500 shrink-0">
                          {providerName} - {modelId}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Save Selected Button */}
                <button
                  type="button"
                  onClick={handleSaveSelectedModels}
                  disabled={loading || selectedDiscovered.size === 0}
                  className="w-full bg-accent hover:bg-emerald-600 text-zinc-950 font-bold py-2 rounded text-xs flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-50 mt-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    Add {selectedDiscovered.size} Selected Models ({providerName} - model)
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* List of currently active models */}
          <div className="space-y-2">
            <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider flex items-center justify-between">
              <span>Active Models in Dropdown ({models.length})</span>
            </div>

            <div className="space-y-1.5">
              {models.map(m => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-2 bg-background border border-border rounded-lg"
                >
                  <div className="overflow-hidden pr-2">
                    <div className="flex items-center space-x-1.5">
                      <Cpu className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span className="font-semibold text-zinc-100 truncate text-[11px]">{m.name}</span>
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                      {m.provider} • id: {m.modelId} {m.baseUrl ? `(${m.baseUrl})` : ''}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteModel(m.id)}
                    title="Delete model"
                    className="p-1 text-zinc-500 hover:text-red-400 rounded hover:bg-surface shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
