import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../api';
import { Session, Message, ConfirmationRequest, ProviderConfig, ModelConfig } from '../../shared/types';
import { SettingsModal } from './SettingsModal';
import {
  ArrowLeft,
  Server,
  Activity,
  Cpu,
  HardDrive,
  List,
  Terminal,
  Clock,
  FileText,
  Send,
  AlertTriangle,
  RotateCcw,
  Settings
} from 'lucide-react';

export const VPSOpsView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'health' | 'services' | 'cron'>('chat');
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState('');
  const [healthData, setHealthData] = useState<any>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [modelsList, setModelsList] = useState<ModelConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('gpt-4o');
  const [selectedProvider, setSelectedProvider] = useState('openai-compatible');
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [showSettings, setShowSettings] = useState(false);

  const loadModels = async () => {
    try {
      const list = await apiRequest<ModelConfig[]>('/api/models');
      setModelsList(list);
    } catch (e) {
      console.error('Error loading models list:', e);
    }
  };
  const [activeConfirmation, setActiveConfirmation] = useState<ConfirmationRequest | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  const chatBottomRef = useRef<HTMLDivElement>(null);

  const loadProviders = async () => {
    try {
      const provs = await apiRequest<ProviderConfig[]>('/api/providers');
      setProviders(provs);
    } catch (e) {
      console.error('Error loading providers:', e);
    }
  };

  const initVPSSession = async () => {
    try {
      const sessions = await apiRequest<Session[]>('/api/sessions?projectId=null');
      if (sessions.length > 0) {
        setSession(sessions[0]);
        setSelectedProvider(sessions[0].provider);
        setSelectedModel(sessions[0].model);
      } else {
        const newSes = await apiRequest<Session>('/api/sessions', {
          method: 'POST',
          body: JSON.stringify({
            projectId: null,
            title: 'VPS Ops Session',
            provider: 'openai-compatible',
            model: 'gpt-4o'
          })
        });
        setSession(newSes);
        setSelectedProvider(newSes.provider);
        setSelectedModel(newSes.model);
      }
    } catch (e) {
      console.error('Error init VPS session:', e);
    }
  };

  const loadMessages = async (sessionId: string) => {
    try {
      const msgs = await apiRequest<Message[]>(`/api/sessions/${sessionId}/messages`);
      setMessages(msgs);
    } catch (e) {
      console.error('Error loading messages:', e);
    }
  };

  const loadHealth = async () => {
    try {
      const res = await apiRequest('/api/vps/health');
      setHealthData(res);
    } catch (e) {
      console.error('Health fetch error:', e);
    }
  };

  useEffect(() => {
    loadProviders();
    loadModels();
    initVPSSession();
    loadHealth();
  }, []);

  useEffect(() => {
    if (session) {
      loadMessages(session.id);

      const evtSource = new EventSource(`/api/sessions/${session.id}/events`);
      evtSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === 'token') {
            setIsStreaming(true);
            setStreamingText(prev => prev + (event.data.content || ''));
          } else if (event.type === 'tool_call_start' || event.type === 'tool_call_result') {
            loadMessages(session.id);
          } else if (event.type === 'waiting_confirmation') {
            setActiveConfirmation(event.data);
            setIsStreaming(false);
          } else if (event.type === 'completed' || event.type === 'error') {
            setIsStreaming(false);
            setStreamingText('');
            loadMessages(session.id);
          }
        } catch (err) {
          console.error('SSE parse error:', err);
        }
      };

      return () => {
        evtSource.close();
      };
    }
  }, [session?.id]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, activeConfirmation]);

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !session) return;

    const userText = prompt;
    setPrompt('');
    setIsStreaming(true);

    try {
      await apiRequest(`/api/sessions/${session.id}/prompt`, {
        method: 'POST',
        body: JSON.stringify({
          prompt: userText,
          provider: selectedProvider,
          model: selectedModel
        })
      });
      loadMessages(session.id);
    } catch (err: any) {
      alert(`Error sending prompt: ${err.message}`);
      setIsStreaming(false);
    }
  };

  const handleConfirmation = async (approved: boolean) => {
    if (!activeConfirmation) return;
    try {
      await apiRequest(`/api/tasks/${activeConfirmation.taskId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ approved })
      });
      setActiveConfirmation(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleQuickTool = async (promptText: string) => {
    setActiveTab('chat');
    setPrompt(promptText);
  };

  const selectedProviderConfig = providers.find(p => p.id === selectedProvider);

  return (
    <div className="flex flex-col h-screen bg-background text-zinc-100 max-w-lg mx-auto border-x border-border">
      {/* Top Header Bar */}
      <div className="p-3 border-b border-border bg-surface flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <button onClick={onBack} className="p-1 hover:bg-zinc-800 rounded">
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </button>
          <div className="flex items-center space-x-1.5">
            <Server className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold">VPS Ops Companion</span>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setShowSettings(true)}
            title="LLM API Settings"
            className="p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800 rounded"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={loadHealth}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800 rounded text-[10px] flex items-center space-x-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Model Selector for VPS Ops */}
      <div className="px-3 py-1.5 border-b border-border/80 bg-background/50 flex items-center justify-between text-[11px] shrink-0">
        <div className="flex items-center space-x-1.5">
          <span className="text-zinc-500">Ops Model:</span>
          <select
            value={selectedModelId}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedModelId(val);
              const found = modelsList.find(m => m.id === val || m.modelId === val);
              if (found) {
                setSelectedProvider(found.provider);
                setSelectedModel(found.modelId);
              } else {
                setSelectedModel(val);
              }
            }}
            className="bg-surface border border-border rounded px-2 py-0.5 text-accent text-[11px] font-semibold"
          >
            {modelsList.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.provider})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setShowSettings(true)}
          className="text-[10px] text-zinc-400 hover:text-accent underline"
        >
          + Manage Models
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-surface/50 text-[11px] shrink-0">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-2 text-center border-b-2 font-medium ${activeTab === 'chat' ? 'border-accent text-accent' : 'border-transparent text-zinc-400'}`}
        >
          Ops Chat
        </button>
        <button
          onClick={() => setActiveTab('health')}
          className={`flex-1 py-2 text-center border-b-2 font-medium ${activeTab === 'health' ? 'border-accent text-accent' : 'border-transparent text-zinc-400'}`}
        >
          Health
        </button>
        <button
          onClick={() => {
            setActiveTab('services');
            handleQuickTool('List all active systemd services and listening ports');
          }}
          className={`flex-1 py-2 text-center border-b-2 font-medium ${activeTab === 'services' ? 'border-accent text-accent' : 'border-transparent text-zinc-400'}`}
        >
          Services
        </button>
        <button
          onClick={() => {
            setActiveTab('cron');
            handleQuickTool('Show all crontab schedule entries');
          }}
          className={`flex-1 py-2 text-center border-b-2 font-medium ${activeTab === 'cron' ? 'border-accent text-accent' : 'border-transparent text-zinc-400'}`}
        >
          Cron
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'chat' && (
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className="text-xs">
                {m.role === 'user' && (
                  <div className="bg-zinc-800 border border-border rounded-lg p-2.5 text-zinc-100 max-w-[90%] ml-auto whitespace-pre-wrap">
                    {m.content}
                  </div>
                )}

                {m.role === 'assistant' && (
                  <div className="space-y-1.5">
                    {m.content && (
                      <div className="bg-surface border border-border rounded-lg p-2.5 text-zinc-200 whitespace-pre-wrap">
                        {m.content}
                      </div>
                    )}
                    {m.toolCalls && m.toolCalls.map(tc => (
                      <div key={tc.id} className="bg-zinc-900 border border-zinc-800 rounded p-2 text-[11px] text-zinc-400 font-mono">
                        <span className="text-emerald-400 font-semibold">⚡ {tc.name}</span>
                        <pre className="mt-1 text-[10px] text-zinc-500 overflow-x-auto">
                          {JSON.stringify(tc.arguments, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}

                {m.role === 'tool' && m.toolResults && (
                  <div className="space-y-1 my-1">
                    {m.toolResults.map(tr => (
                      <div key={tr.toolCallId} className="border border-border/60 bg-zinc-950/60 rounded p-2 text-[10px] font-mono text-zinc-300">
                        <div className="text-zinc-500 mb-0.5">VPS Tool Result ({tr.name}):</div>
                        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap text-zinc-400">
                          {tr.output}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isStreaming && streamingText && (
              <div className="bg-surface border border-accent/40 rounded-lg p-2.5 text-xs text-zinc-200 whitespace-pre-wrap">
                {streamingText}
                <span className="inline-block w-2 h-3 ml-1 bg-accent animate-pulse" />
              </div>
            )}

            {/* Confirmation Gate Prompt */}
            {activeConfirmation && (
              <div className="border border-amber-500/50 bg-amber-950/30 rounded-lg p-3 text-xs space-y-2">
                <div className="flex items-center space-x-1.5 text-amber-400 font-bold">
                  <AlertTriangle className="w-4 h-4" />
                  <span>VPS Action Confirmation Required</span>
                </div>
                <p className="text-zinc-300">{activeConfirmation.description}</p>
                <div className="flex space-x-2 pt-1">
                  <button
                    onClick={() => handleConfirmation(true)}
                    className="flex-1 bg-accent hover:bg-emerald-600 text-zinc-950 font-bold py-1.5 rounded text-xs"
                  >
                    Confirm & Execute
                  </button>
                  <button
                    onClick={() => handleConfirmation(false)}
                    className="flex-1 bg-red-800 hover:bg-red-700 text-white font-bold py-1.5 rounded text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>
        )}

        {activeTab === 'health' && healthData && (
          <div className="space-y-3 text-xs">
            <div className="bg-surface border border-border rounded-lg p-3 space-y-2">
              <div className="font-bold text-zinc-200">System Metrics</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-background p-2.5 rounded border border-border">
                  <span className="text-[10px] text-zinc-500 block">CPU LOAD</span>
                  <span className="text-base font-bold text-zinc-100">{healthData.cpuLoad}%</span>
                </div>
                <div className="bg-background p-2.5 rounded border border-border">
                  <span className="text-[10px] text-zinc-500 block">RAM USED</span>
                  <span className="text-base font-bold text-zinc-100">{healthData.memUsedGB} GB / {healthData.memTotalGB} GB</span>
                </div>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-lg p-3 space-y-2">
              <div className="font-bold text-zinc-200">Disk Partitions</div>
              {healthData.disks.map((d: any, idx: number) => (
                <div key={idx} className="bg-background p-2 rounded border border-border font-mono text-[11px]">
                  <div className="flex justify-between text-zinc-300 mb-1">
                    <span>{d.mount} ({d.fs})</span>
                    <span>{d.usedGB} GB / {d.sizeGB} GB</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${d.percent > 85 ? 'bg-red-500' : 'bg-accent'}`}
                      style={{ width: `${d.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input Prompt Box for VPS Ops */}
      {activeTab === 'chat' && (
        <form onSubmit={handleSendPrompt} className="p-2 border-t border-border bg-surface flex items-center space-x-2 shrink-0">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="VPS instruction (e.g. check why nginx failed, restart pm2...)"
            className="flex-1 bg-background border border-border rounded px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || isStreaming}
            className="bg-accent hover:bg-emerald-600 text-zinc-950 p-2 rounded transition-colors disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
};
