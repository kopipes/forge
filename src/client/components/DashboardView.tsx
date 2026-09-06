import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api';
import { Project, ProviderConfig } from '../../shared/types';
import { SettingsModal } from './SettingsModal';
import { Terminal, Activity, FolderGit2, Plus, Server, ChevronRight, RefreshCw, Cpu, HardDrive, Settings, LogOut } from 'lucide-react';

export const DashboardView: React.FC<{
  onSelectProject: (p: Project) => void;
  onOpenVPSOps: () => void;
  onLogout: () => void;
}> = ({ onSelectProject, onOpenVPSOps, onLogout }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [cloneFromRemote, setCloneFromRemote] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    projectPath: '',
    gitRemote: '',
    defaultProvider: 'openai-compatible',
    defaultModel: 'gpt-4o',
    deployCmd: ''
  });

  const loadData = async () => {
    try {
      const [projList, provList, healthData] = await Promise.all([
        apiRequest<Project[]>('/api/projects'),
        apiRequest<ProviderConfig[]>('/api/providers'),
        apiRequest('/api/vps/health')
      ]);
      setProjects(projList);
      setProviders(provList);
      setHealth(healthData);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          ...newProject,
          cloneFromRemote
        })
      });
      setShowAddProject(false);
      setCloneFromRemote(false);
      setNewProject({
        name: '',
        projectPath: '',
        gitRemote: '',
        defaultProvider: 'openai-compatible',
        defaultModel: 'gpt-4o',
        deployCmd: ''
      });
      loadData();
    } catch (err: any) {
      alert(`Error creating project: ${err.message}`);
    }
  };

  return (
    <div className="p-4 max-w-lg mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
        <div className="flex items-center space-x-2">
          <Terminal className="w-5 h-5 text-accent" />
          <span className="font-bold tracking-tight text-sm text-zinc-100">FORGE COMPANION</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setShowSettings(true)}
            title="LLM API Settings"
            className="p-1.5 text-zinc-400 hover:text-zinc-100 bg-surface border border-border rounded"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={loadData}
            title="Refresh"
            className="p-1.5 text-zinc-400 hover:text-zinc-100 bg-surface border border-border rounded"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onLogout}
            title="Logout"
            className="p-1.5 text-zinc-400 hover:text-red-400 bg-surface border border-border rounded"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* VPS Health Card (Quick Overview) */}
      <div
        onClick={onOpenVPSOps}
        className="cursor-pointer border border-border bg-surface hover:border-zinc-600 rounded-lg p-3.5 mb-6 transition-colors shadow-sm"
      >
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center space-x-2">
            <Server className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-zinc-200">VPS Health & Ops</span>
          </div>
          <span className="text-[10px] text-zinc-400 flex items-center">
            Open Ops <ChevronRight className="w-3 h-3 ml-0.5" />
          </span>
        </div>

        {health ? (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-background/80 p-2 rounded border border-border/50">
              <div className="text-[10px] text-zinc-500 flex items-center mb-0.5">
                <Cpu className="w-3 h-3 mr-1 text-zinc-400" /> CPU
              </div>
              <div className="font-semibold text-zinc-200">{health.cpuLoad}%</div>
            </div>

            <div className="bg-background/80 p-2 rounded border border-border/50">
              <div className="text-[10px] text-zinc-500 flex items-center mb-0.5">
                <Activity className="w-3 h-3 mr-1 text-zinc-400" /> RAM
              </div>
              <div className="font-semibold text-zinc-200">{health.memPercent}%</div>
            </div>

            <div className="bg-background/80 p-2 rounded border border-border/50">
              <div className="text-[10px] text-zinc-500 flex items-center mb-0.5">
                <HardDrive className="w-3 h-3 mr-1 text-zinc-400" /> UPTIME
              </div>
              <div className="font-semibold text-zinc-200">{health.uptimeHours}h</div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-zinc-500">Loading VPS stats...</div>
        )}
      </div>

      {/* Projects Section */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-zinc-400 tracking-wide">PROJECTS ({projects.length})</span>
        <button
          onClick={() => setShowAddProject(!showAddProject)}
          className="flex items-center space-x-1 text-xs text-accent bg-accent/10 border border-accent/30 px-2 py-1 rounded hover:bg-accent/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Project</span>
        </button>
      </div>

      {/* Add Project Form */}
      {showAddProject && (
        <form onSubmit={handleCreateProject} className="mb-4 border border-border bg-surface p-3.5 rounded-lg space-y-3">
          <div className="text-xs font-semibold text-zinc-200 mb-2">New Project Setup</div>
          <div>
            <label className="block text-[10px] text-zinc-400 mb-1">PROJECT NAME</label>
            <input
              type="text"
              placeholder="e.g. My Website"
              value={newProject.name}
              onChange={e => setNewProject({ ...newProject, name: e.target.value })}
              className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-zinc-100"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] text-zinc-400 mb-1">GITHUB / GIT REMOTE URL</label>
            <input
              type="text"
              placeholder="e.g. https://github.com/user/my-repo.git"
              value={newProject.gitRemote}
              onChange={e => setNewProject({ ...newProject, gitRemote: e.target.value })}
              className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-[10px] text-zinc-400 mb-1">PROJECT DIRECTORY PATH ON VPS</label>
            <input
              type="text"
              placeholder="e.g. /srv/apps/my-app or ./my-app"
              value={newProject.projectPath}
              onChange={e => setNewProject({ ...newProject, projectPath: e.target.value })}
              className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-zinc-100"
              required
            />
          </div>

          {newProject.gitRemote && (
            <div className="flex items-center space-x-2 bg-background p-2 rounded border border-border">
              <input
                type="checkbox"
                id="cloneFromRemote"
                checked={cloneFromRemote}
                onChange={e => setCloneFromRemote(e.target.checked)}
                className="rounded text-accent focus:ring-0"
              />
              <label htmlFor="cloneFromRemote" className="text-xs text-zinc-300 cursor-pointer">
                Clone app from GitHub repository onto VPS
              </label>
            </div>
          )}

          <div>
            <label className="block text-[10px] text-zinc-400 mb-1">DEPLOY COMMAND (OPTIONAL)</label>
            <input
              type="text"
              placeholder="e.g. git pull && npm run build && pm2 restart my-app"
              value={newProject.deployCmd}
              onChange={e => setNewProject({ ...newProject, deployCmd: e.target.value })}
              className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-zinc-100"
            />
          </div>

          <div className="flex space-x-2 pt-1">
            <button
              type="submit"
              className="flex-1 bg-accent hover:bg-emerald-600 text-zinc-950 font-bold py-1.5 rounded text-xs"
            >
              {cloneFromRemote ? 'Clone & Create Project' : 'Save Project'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddProject(false)}
              className="px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-1.5 rounded text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Project list */}
      <div className="space-y-2">
        {projects.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-zinc-500">
            No projects added yet. Tap "Add Project" to connect a repository.
          </div>
        ) : (
          projects.map(p => (
            <div
              key={p.id}
              onClick={() => onSelectProject(p)}
              className="border border-border bg-surface hover:border-zinc-500 rounded-lg p-3 cursor-pointer transition-colors flex items-center justify-between"
            >
              <div className="overflow-hidden pr-2">
                <div className="flex items-center space-x-2 mb-1">
                  <FolderGit2 className="w-4 h-4 text-accent shrink-0" />
                  <span className="text-xs font-bold text-zinc-100 truncate">{p.name}</span>
                </div>
                <div className="text-[10px] text-zinc-500 truncate">{p.path}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </div>
          ))
        )}
      </div>
    </div>
  );
};
