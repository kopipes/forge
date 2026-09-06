import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../api';
import { Project, Session, Message, ProviderConfig, ConfirmationRequest, ModelConfig } from '../../shared/types';
import {
  ArrowLeft,
  Send,
  GitBranch,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  UploadCloud,
  DownloadCloud,
  Terminal,
  StopCircle,
  Settings,
  Globe,
  ExternalLink
} from 'lucide-react';
import { SettingsModal } from './SettingsModal';

export const ProjectView: React.FC<{
  project: Project;
  onBack: () => void;
}> = ({ project, onBack }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState('');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [modelsList, setModelsList] = useState<ModelConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('gpt-4o');
  const [selectedProvider, setSelectedProvider] = useState(project.defaultProvider);
  const [selectedModel, setSelectedModel] = useState(project.defaultModel);

  const loadModels = async () => {
    try {
      const list = await apiRequest<ModelConfig[]>('/api/models');
      setModelsList(list);
      if (list.length > 0 && !list.some(m => m.id === selectedModelId)) {
        setSelectedModelId(list[0].id);
        setSelectedProvider(list[0].provider);
        setSelectedModel(list[0].modelId);
      }
    } catch (e) {
      console.error('Error loading models list:', e);
    }
  };
  const [gitStatus, setGitStatus] = useState<{ branch: string; status: string }>({ branch: '', status: '' });
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [deployOutput, setDeployOutput] = useState<string | null>(null);
  const [activeConfirmation, setActiveConfirmation] = useState<ConfirmationRequest | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  const chatBottomRef = useRef<HTMLDivElement>(null);

  const loadSessions = async () => {
    try {
      const ses = await apiRequest<Session[]>(`/api/sessions?projectId=${project.id}`);
      setSessions(ses);
      if (ses.length > 0 && !currentSession) {
        setCurrentSession(ses[0]);
      } else if (ses.length === 0) {
        // Create initial session
        const newSes = await apiRequest<Session>('/api/sessions', {
          method: 'POST',
          body: JSON.stringify({
            projectId: project.id,
            title: 'Coding Session',
            provider: selectedProvider,
            model: selectedModel
          })
        });
        setSessions([newSes]);
        setCurrentSession(newSes);
      }
    } catch (e) {
      console.error('Error loading sessions:', e);
    }
  };

  const loadGitInfo = async () => {
    try {
      const gs = await apiRequest(`/api/projects/${project.id}/git-status`);
      setGitStatus(gs);
    } catch (e) {
      console.error('Error loading git info:', e);
    }
  };

  const loadProviders = async () => {
    try {
      const provs = await apiRequest<ProviderConfig[]>('/api/providers');
      setProviders(provs);
    } catch (e) {
      console.error('Error loading providers:', e);
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

  useEffect(() => {
    loadProviders();
    loadModels();
    loadGitInfo();
    loadSessions();
  }, [project.id]);

  useEffect(() => {
    if (currentSession) {
      loadMessages(currentSession.id);
      setSelectedProvider(currentSession.provider);
      setSelectedModel(currentSession.model);

      // Connect SSE
      const evtSource = new EventSource(`/api/sessions/${currentSession.id}/events`);

      evtSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === 'token') {
            setIsStreaming(true);
            setStreamingText(prev => prev + (event.data.content || ''));
          } else if (event.type === 'tool_call_start' || event.type === 'tool_call_result') {
            loadMessages(currentSession.id);
            loadGitInfo();
          } else if (event.type === 'waiting_confirmation') {
            setActiveConfirmation(event.data);
            setIsStreaming(false);
          } else if (event.type === 'completed' || event.type === 'error') {
            setIsStreaming(false);
            setStreamingText('');
            loadMessages(currentSession.id);
            loadGitInfo();
          }
        } catch (err) {
          console.error('SSE parse error:', err);
        }
      };

      return () => {
        evtSource.close();
      };
    }
  }, [currentSession?.id]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, activeConfirmation]);

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !currentSession) return;

    const userText = prompt;
    setPrompt('');
    setIsStreaming(true);

    try {
      await apiRequest(`/api/sessions/${currentSession.id}/prompt`, {
        method: 'POST',
        body: JSON.stringify({
          prompt: userText,
          provider: selectedProvider,
          model: selectedModelId
        })
      });
      loadMessages(currentSession.id);
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

  const handleShowDiff = async () => {
    try {
      const res = await apiRequest<{ diff: string }>(`/api/projects/${project.id}/git-diff`);
      setDiffContent(res.diff || '(No uncommitted git changes)');
    } catch (err: any) {
      alert(`Error loading diff: ${err.message}`);
    }
  };

  const handlePull = async () => {
    try {
      const res = await apiRequest<{ success: boolean; output: string }>(`/api/projects/${project.id}/git-pull`, {
        method: 'POST'
      });
      alert(`Git Pull Result:\n${res.output}`);
      loadGitInfo();
    } catch (err: any) {
      alert(`Git Pull Error: ${err.message}`);
    }
  };

  const handleDeploy = async () => {
    if (!confirm(`Run deployment for ${project.name}?`)) return;
    try {
      const res = await apiRequest<{ success: boolean; output: string }>(`/api/projects/${project.id}/deploy`, {
        method: 'POST'
      });
      setDeployOutput(res.output);
    } catch (err: any) {
      setDeployOutput(`Deploy Error: ${err.message}`);
    }
  };

  const handleNewSession = async () => {
    try {
      const newSes = await apiRequest<Session>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          title: `Session ${sessions.length + 1}`,
          provider: selectedProvider,
          model: selectedModel
        })
      });
      setSessions([newSes, ...sessions]);
      setCurrentSession(newSes);
      setMessages([]);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const selectedProviderConfig = providers.find(p => p.id === selectedProvider);

  return (
    <div className="flex flex-col h-screen bg-background text-zinc-100 max-w-lg mx-auto border-x border-border">
      {/* Top Navigation Bar */}
      <div className="p-3 border-b border-border bg-surface flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <button onClick={onBack} className="p-1 hover:bg-zinc-800 rounded">
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </button>
          <div>
            <div className="text-xs font-bold truncate max-w-[150px]">{project.name}</div>
            <div className="flex items-center text-[10px] text-zinc-500 space-x-1">
              <GitBranch className="w-3 h-3 text-accent" />
              <span>{gitStatus.branch || 'main'}</span>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={handlePull}
            title="Git Pull"
            className="flex items-center space-x-1 text-[11px] bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded text-zinc-200"
          >
            <DownloadCloud className="w-3 h-3 text-sky-400" />
            <span>Pull</span>
          </button>

          <button
            onClick={() => setShowPreviewModal(true)}
            title="Live Preview App on VPS"
            className="flex items-center space-x-1 text-[11px] bg-emerald-950/70 border border-emerald-500/40 text-emerald-400 px-2 py-1 rounded hover:bg-emerald-900/50"
          >
            <Globe className="w-3 h-3" />
            <span>Preview</span>
          </button>

          <button
            onClick={handleShowDiff}
            className="flex items-center space-x-1 text-[11px] bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded text-zinc-200"
          >
            <FileCode className="w-3 h-3 text-amber-400" />
            <span>Diff</span>
          </button>

          {project.deployCmd && (
            <button
              onClick={handleDeploy}
              className="flex items-center space-x-1 text-[11px] bg-accent/20 border border-accent/40 text-accent px-2 py-1 rounded hover:bg-accent/30"
            >
              <UploadCloud className="w-3 h-3" />
              <span>Deploy</span>
            </button>
          )}

          <button
            onClick={() => setShowSettings(true)}
            title="LLM Settings"
            className="p-1 text-zinc-400 hover:text-zinc-100 bg-zinc-800 rounded"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleNewSession}
            title="New Chat Session"
            className="p-1 text-zinc-400 hover:text-zinc-100 bg-zinc-800 rounded"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => {
          setShowSettings(false);
          loadModels();
        }}
      />

      {/* Model Selector Bar */}
      <div className="px-3 py-1.5 border-b border-border/80 bg-background/50 flex items-center justify-between text-[11px] shrink-0 overflow-hidden">
        <div className="flex items-center space-x-1.5 min-w-0">
          <span className="text-zinc-500 shrink-0">Model:</span>
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
            className="bg-surface border border-border rounded px-2 py-0.5 text-accent text-[11px] font-semibold truncate max-w-[210px] focus:outline-none"
          >
            {modelsList.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setShowSettings(true)}
          className="text-[10px] text-zinc-400 hover:text-accent underline shrink-0 ml-1"
        >
          + Providers
        </button>
      </div>

      {/* Message Chat List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
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
                  <div key={tc.id} className="bg-zinc-900/90 border border-zinc-800 rounded p-2 text-[11px] text-zinc-400">
                    <span className="text-accent font-semibold font-mono">⚡ {tc.name}</span>
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
                    <div className="text-zinc-500 mb-0.5">Result ({tr.name}):</div>
                    <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap text-zinc-400">
                      {tr.output}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Live streaming bubble */}
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
              <span>Confirmation Required</span>
            </div>
            <p className="text-zinc-300">{activeConfirmation.description}</p>
            {activeConfirmation.command && (
              <pre className="bg-black/60 p-2 rounded text-[11px] text-zinc-200 font-mono overflow-x-auto">
                {activeConfirmation.command}
              </pre>
            )}
            <div className="flex space-x-2 pt-1">
              <button
                onClick={() => handleConfirmation(true)}
                className="flex-1 bg-accent hover:bg-emerald-600 text-zinc-950 font-bold py-1.5 rounded text-xs"
              >
                Approve & Execute
              </button>
              <button
                onClick={() => handleConfirmation(false)}
                className="flex-1 bg-red-800 hover:bg-red-700 text-white font-bold py-1.5 rounded text-xs"
              >
                Reject
              </button>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Input Prompt Box */}
      <form onSubmit={handleSendPrompt} className="p-2 border-t border-border bg-surface flex items-center space-x-2 shrink-0">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendPrompt(e);
            }
          }}
          placeholder="Instruct Forge (fix error, add feature, git commit...)"
          className="flex-1 bg-background border border-border rounded px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-accent resize-none h-10 max-h-24"
        />
        <button
          type="submit"
          disabled={!prompt.trim() || isStreaming}
          className="bg-accent hover:bg-emerald-600 text-zinc-950 p-2.5 rounded transition-colors disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Git Diff Modal */}
      {diffContent !== null && (
        <div className="fixed inset-0 bg-black/80 z-50 p-4 flex flex-col justify-center">
          <div className="bg-surface border border-border rounded-lg max-h-[85vh] flex flex-col overflow-hidden max-w-lg mx-auto w-full">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-200">Git Diff Overview</span>
              <button onClick={() => setDiffContent(null)} className="text-xs text-zinc-400 hover:text-zinc-100">Close</button>
            </div>
            <div className="p-3 overflow-y-auto flex-1 font-mono text-[11px] text-zinc-300 whitespace-pre-wrap bg-background">
              {diffContent}
            </div>
          </div>
        </div>
      )}

      {/* App Live Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/90 z-50 p-2 sm:p-4 flex flex-col justify-center">
          <div className="bg-surface border border-border rounded-lg h-[90vh] flex flex-col overflow-hidden max-w-xl mx-auto w-full">
            <div className="p-2.5 border-b border-border flex items-center justify-between bg-surface shrink-0">
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-zinc-100">{project.name} (Live Preview)</span>
                <span className="text-[10px] text-zinc-500 font-mono">Port {project.devPort || 4000}</span>
              </div>
              <div className="flex items-center space-x-2">
                <a
                  href={`/api/projects/${project.id}/preview/`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent hover:underline flex items-center space-x-1"
                >
                  <span>Open tab</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-100 p-1"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 bg-white">
              <iframe
                src={`/api/projects/${project.id}/preview/`}
                className="w-full h-full border-0"
                title={`${project.name} Preview`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Deploy Log Modal */}
      {deployOutput !== null && (
        <div className="fixed inset-0 bg-black/80 z-50 p-4 flex flex-col justify-center">
          <div className="bg-surface border border-border rounded-lg max-h-[85vh] flex flex-col overflow-hidden max-w-lg mx-auto w-full">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-xs font-bold text-accent">Deployment Output</span>
              <button onClick={() => setDeployOutput(null)} className="text-xs text-zinc-400 hover:text-zinc-100">Close</button>
            </div>
            <div className="p-3 overflow-y-auto flex-1 font-mono text-[11px] text-zinc-300 whitespace-pre-wrap bg-background">
              {deployOutput}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
