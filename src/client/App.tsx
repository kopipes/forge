import React, { useState, useEffect } from 'react';
import { apiRequest } from './api';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { ProjectView } from './components/ProjectView';
import { VPSOpsView } from './components/VPSOpsView';
import { Project } from '../shared/types';

export const App: React.FC = () => {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'project' | 'vps'>('dashboard');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const checkAuth = async () => {
    try {
      const res = await apiRequest<{ authenticated: boolean }>('/api/auth/check');
      setAuthenticated(res.authenticated);
    } catch {
      setAuthenticated(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      setAuthenticated(false);
      setActiveView('dashboard');
      setSelectedProject(null);
    }
  };

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-xs text-zinc-500 font-mono">
        Loading Forge...
      </div>
    );
  }

  if (!authenticated) {
    return <LoginView onLoginSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-background text-zinc-100 font-mono">
      {activeView === 'dashboard' && (
        <DashboardView
          onSelectProject={(proj) => {
            setSelectedProject(proj);
            setActiveView('project');
          }}
          onOpenVPSOps={() => setActiveView('vps')}
          onLogout={handleLogout}
        />
      )}

      {activeView === 'project' && selectedProject && (
        <ProjectView
          project={selectedProject}
          onBack={() => setActiveView('dashboard')}
        />
      )}

      {activeView === 'vps' && (
        <VPSOpsView onBack={() => setActiveView('dashboard')} />
      )}
    </div>
  );
};
