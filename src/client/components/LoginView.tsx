import React, { useState } from 'react';
import { apiRequest } from '../api';
import { Terminal, Lock } from 'lucide-react';

export const LoginView: React.FC<{ onLoginSuccess: () => void }> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      onLoginSuccess();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-sm border border-border bg-surface rounded-lg p-6 shadow-2xl">
        <div className="flex items-center space-x-3 mb-6">
          <Terminal className="w-7 h-7 text-accent" />
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">FORGE</h1>
        </div>

        <p className="text-xs text-zinc-400 mb-6">
          Mobile Coding & VPS Ops Companion. Enter password to connect.
        </p>

        {error && (
          <div className="mb-4 text-xs text-danger border border-danger/30 bg-danger/10 p-2.5 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1 font-medium">PASSWORD</label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-accent"
                autoFocus
                required
              />
              <Lock className="w-4 h-4 text-zinc-600 absolute right-3 top-2.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-emerald-600 text-zinc-950 font-bold py-2 rounded text-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Connect to VPS'}
          </button>
        </form>
      </div>
    </div>
  );
};
