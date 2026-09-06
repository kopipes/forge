import React, { useState } from 'react';
import { apiRequest } from '../api';
import { Terminal, Mail, KeyRound, ArrowRight, RotateCcw } from 'lucide-react';

export const LoginView: React.FC<{ onLoginSuccess: () => void }> = ({ onLoginSuccess }) => {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfoMessage('');

    try {
      const res = await apiRequest<{ success: boolean; challengeId: string }>('/api/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      setChallengeId(res.challengeId);
      setStep('code');
      setInfoMessage(`Verification code sent to your Ping chat! Please check Ping.`);
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await apiRequest('/api/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({
          challengeId,
          code: code.trim()
        })
      });
      onLoginSuccess();
    } catch (err: any) {
      setError(err.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<{ success: boolean; challengeId: string }>('/api/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      setChallengeId(res.challengeId);
      setInfoMessage('New verification code sent to Ping chat.');
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-sm border border-border bg-surface rounded-lg p-6 shadow-2xl">
        <div className="flex items-center space-x-3 mb-4">
          <Terminal className="w-7 h-7 text-accent" />
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">FORGE</h1>
        </div>

        <p className="text-xs text-zinc-400 mb-6">
          Mobile Coding & VPS Ops Companion. Authenticate via Ping Chat.
        </p>

        {error && (
          <div className="mb-4 text-xs text-danger border border-danger/30 bg-danger/10 p-2.5 rounded">
            {error}
          </div>
        )}

        {infoMessage && (
          <div className="mb-4 text-xs text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 p-2.5 rounded">
            {infoMessage}
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div>
              <label className="block text-[10px] text-zinc-400 mb-1 font-medium">EMAIL ADDRESS</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-accent"
                  autoFocus
                  required
                />
                <Mail className="w-4 h-4 text-zinc-600 absolute right-3 top-2.5" />
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">A login verification code will be sent to your Ping chat.</p>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full bg-accent hover:bg-emerald-600 text-zinc-950 font-bold py-2 rounded text-sm transition-colors disabled:opacity-50 flex items-center justify-center space-x-1.5"
            >
              <span>{loading ? 'Sending Code...' : 'Send Login Code to Ping'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] text-zinc-400 font-medium">6-DIGIT VERIFICATION CODE</label>
                <button
                  type="button"
                  onClick={() => setStep('email')}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 underline"
                >
                  Change email
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  maxLength={6}
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="123456"
                  className="w-full bg-background border border-border rounded px-3 py-2.5 text-center tracking-widest text-lg font-bold text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-accent font-mono"
                  autoFocus
                  required
                />
                <KeyRound className="w-4 h-4 text-zinc-600 absolute right-3 top-3.5" />
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                Check Ping DM sent to <strong>{email.replace(/(.{2})(.*)(?=@)/, (_m, p1, p2) => p1 + '*'.repeat(p2.length))}</strong>.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full bg-accent hover:bg-emerald-600 text-zinc-950 font-bold py-2 rounded text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={loading}
                className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center justify-center space-x-1 mx-auto"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Resend Code to Ping</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
