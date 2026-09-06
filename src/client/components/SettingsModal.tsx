import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import { Settings, X, Save, Key, Globe, CheckCircle2 } from 'lucide-react';

export const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState({
    openaiApiKey: '',
    anthropicApiKey: '',
    geminiApiKey: '',
    openaiBaseUrl: 'https://api.openai.com/v1',
    hasOpenAI: false,
    hasAnthropic: false,
    hasGemini: false
  });

  const loadSettings = async () => {
    try {
      const data = await apiRequest('/api/settings');
      setSettings(data);
    } catch (err: any) {
      console.error('Error loading settings:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      setSaved(false);
      setError('');
    }
  }, [isOpen]);

  const handleSave = async (e: React.FormEvent) => {
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
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 p-4 flex flex-col justify-center items-center">
      <div className="bg-surface border border-border rounded-lg max-w-md w-full overflow-hidden shadow-2xl">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Settings className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold text-zinc-100">LLM Provider & Model Settings</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-3.5 text-xs">
          {saved && (
            <div className="flex items-center space-x-1.5 p-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>Settings saved successfully!</span>
            </div>
          )}

          {error && (
            <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded text-xs">
              {error}
            </div>
          )}

          {/* OpenAI / Compatible */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-zinc-400 font-semibold flex items-center space-x-1">
                <Key className="w-3 h-3 text-emerald-400" />
                <span>OPENAI / COMPATIBLE API KEY</span>
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
              <span>OPENAI-COMPATIBLE BASE URL</span>
            </label>
            <input
              type="text"
              placeholder="https://api.openai.com/v1 (or DeepSeek, Groq, OpenRouter)"
              value={settings.openaiBaseUrl}
              onChange={e => setSettings({ ...settings, openaiBaseUrl: e.target.value })}
              className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-accent font-mono"
            />
            <p className="text-[9px] text-zinc-500 mt-0.5">
              Default is https://api.openai.com/v1. You can use https://api.deepseek.com or https://api.groq.com/openai/v1.
            </p>
          </div>

          {/* Anthropic Claude */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-zinc-400 font-semibold flex items-center space-x-1">
                <Key className="w-3 h-3 text-amber-400" />
                <span>ANTHROPIC CLAUDE API KEY</span>
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
                <span>GOOGLE GEMINI API KEY</span>
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

          <div className="pt-2 flex space-x-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-accent hover:bg-emerald-600 text-zinc-950 font-bold py-2 rounded text-xs flex items-center justify-center space-x-1"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{loading ? 'Saving...' : 'Save API Settings'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
