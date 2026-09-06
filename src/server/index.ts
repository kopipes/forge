import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import si from 'systeminformation';
import { initDatabase } from './db.js';
import { Repository } from './repo.js';
import { ProviderRegistry } from './providers/registry.js';
import { ToolRegistry } from './tools/registry.js';
import { AgentEngine } from './agent.js';
import { sendPingOTP, verifyPingOTP } from './auth/otp.js';

const execAsync = promisify(exec);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());
app.use(cookieParser());

const db = initDatabase();
const repo = new Repository(db);
const providerRegistry = new ProviderRegistry();
const toolRegistry = new ToolRegistry();
const agentEngine = new AgentEngine(repo, providerRegistry, toolRegistry);

// Session Cookie name & secret token validation
const AUTH_COOKIE_NAME = 'forge_session';

// Helper to validate session
function validateSessionToken(token?: string): boolean {
  if (!token) return false;
  const savedToken = repo.getSetting('active_session_token');
  return !!savedToken && savedToken === token;
}

function authMiddleware(req: Request, res: Response, next: express.NextFunction) {
  const token = req.cookies[AUTH_COOKIE_NAME] || req.headers['x-forge-auth'];
  if (validateSessionToken(token as string)) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// 1. Request OTP code by email
app.post('/api/auth/send-code', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  const challengeId = `chal_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const result = await sendPingOTP(challengeId, email);

  if (!result.success) {
    return res.status(400).json({ error: result.error || 'Failed to send login code' });
  }

  return res.json({
    success: true,
    challengeId,
    email: email.toLowerCase().trim()
  });
});

// 2. Verify OTP code and establish login session
app.post('/api/auth/verify-code', (req: Request, res: Response) => {
  const { challengeId, code } = req.body;

  if (!challengeId || !code) {
    return res.status(400).json({ error: 'Challenge ID and Code are required' });
  }

  const result = verifyPingOTP(challengeId, code);
  if (!result.valid) {
    return res.status(400).json({ error: result.reason || 'Invalid verification code' });
  }

  // Generate secure session token & store in settings DB
  const sessionToken = crypto.randomBytes(32).toString('hex');
  repo.setSetting('active_session_token', sessionToken);
  repo.setSetting('logged_in_email', result.email || '');

  res.cookie(AUTH_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 3600 * 1000 // 30 days
  });

  return res.json({ success: true, email: result.email });
});

// Logout
app.post('/api/auth/logout', (req: Request, res: Response) => {
  repo.setSetting('active_session_token', '');
  res.clearCookie(AUTH_COOKIE_NAME);
  return res.json({ success: true });
});

// Check auth status
app.get('/api/auth/check', (req: Request, res: Response) => {
  const token = req.cookies[AUTH_COOKIE_NAME] || req.headers['x-forge-auth'];
  const authenticated = validateSessionToken(token as string);
  const email = authenticated ? repo.getSetting('logged_in_email') : null;
  return res.json({ authenticated, email });
});

// Models API (Preconfigured list of named models)
app.get('/api/models', authMiddleware, (req: Request, res: Response) => {
  const raw = repo.getSetting('configured_models');
  if (raw) {
    try {
      const list = JSON.parse(raw);
      return res.json(list);
    } catch {}
  }

  // Default models with Provider - Model format
  const defaultList = [
    { id: 'gpt-4o', name: 'OpenAI - gpt-4o', provider: 'openai-compatible', modelId: 'gpt-4o' },
    { id: 'claude-3-5-sonnet', name: 'Anthropic - claude-3-5-sonnet-latest', provider: 'anthropic', modelId: 'claude-3-5-sonnet-latest' },
    { id: 'gemini-2-flash', name: 'Gemini - gemini-2.0-flash', provider: 'gemini', modelId: 'gemini-2.0-flash' },
    { id: 'deepseek-chat', name: 'DeepSeek - deepseek-chat', provider: 'openai-compatible', modelId: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' },
    { id: 'deepseek-reasoner', name: 'DeepSeek - deepseek-reasoner', provider: 'openai-compatible', modelId: 'deepseek-reasoner', baseUrl: 'https://api.deepseek.com' }
  ];
  res.json(defaultList);
});

// Auto-discover / Fetch available models from provider API
app.post('/api/models/fetch-from-provider', authMiddleware, async (req: Request, res: Response) => {
  const { provider, apiKey, baseUrl } = req.body;

  if (!provider) {
    return res.status(400).json({ error: 'Provider is required' });
  }

  try {
    let modelIds: string[] = [];

    if (provider === 'openai-compatible') {
      const url = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const response = await fetch(`${url}/models`, { method: 'GET', headers });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch models (${response.status}): ${errText}`);
      }
      const data: any = await response.json();
      const list = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : []);
      modelIds = list.map((m: any) => typeof m === 'string' ? m : (m.id || m.name)).filter(Boolean);
    } else if (provider === 'anthropic') {
      try {
        const response = await fetch('https://api.anthropic.com/v1/models', {
          method: 'GET',
          headers: {
            'x-api-key': apiKey || '',
            'anthropic-version': '2023-06-01'
          }
        });
        if (response.ok) {
          const data: any = await response.json();
          if (Array.isArray(data.data)) {
            modelIds = data.data.map((m: any) => m.id);
          }
        }
      } catch {}

      if (modelIds.length === 0) {
        // Fallback standard Anthropic models
        modelIds = [
          'claude-3-7-sonnet-latest',
          'claude-3-5-sonnet-latest',
          'claude-3-5-haiku-latest',
          'claude-3-opus-latest'
        ];
      }
    } else if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey || ''}`;
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch Gemini models (${response.status}): ${errText}`);
      }
      const data: any = await response.json();
      if (Array.isArray(data.models)) {
        modelIds = data.models
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => m.name.replace(/^models\//, ''));
      }
    }

    // Sort models
    modelIds.sort((a, b) => a.localeCompare(b));
    return res.json({ models: modelIds });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to fetch models from provider' });
  }
});

app.post('/api/models', authMiddleware, (req: Request, res: Response) => {
  const models = req.body.models;
  if (!Array.isArray(models)) {
    return res.status(400).json({ error: 'Expected array of models' });
  }
  repo.setSetting('configured_models', JSON.stringify(models));
  res.json({ success: true, models });
});
app.get('/api/settings', authMiddleware, (req: Request, res: Response) => {
  const openaiApiKey = repo.getSetting('OPENAI_API_KEY') || process.env.OPENAI_API_KEY || '';
  const anthropicApiKey = repo.getSetting('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY || '';
  const geminiApiKey = repo.getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY || '';
  const openaiBaseUrl = repo.getSetting('OPENAI_BASE_URL') || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  res.json({
    hasOpenAI: !!openaiApiKey,
    openaiApiKey: openaiApiKey ? `${openaiApiKey.substring(0, 7)}...${openaiApiKey.slice(-4)}` : '',
    hasAnthropic: !!anthropicApiKey,
    anthropicApiKey: anthropicApiKey ? `${anthropicApiKey.substring(0, 7)}...${anthropicApiKey.slice(-4)}` : '',
    hasGemini: !!geminiApiKey,
    geminiApiKey: geminiApiKey ? `${geminiApiKey.substring(0, 6)}...${geminiApiKey.slice(-3)}` : '',
    openaiBaseUrl
  });
});

app.post('/api/settings', authMiddleware, (req: Request, res: Response) => {
  const { openaiApiKey, anthropicApiKey, geminiApiKey, openaiBaseUrl } = req.body;

  if (openaiApiKey !== undefined && !openaiApiKey.includes('...')) {
    repo.setSetting('OPENAI_API_KEY', openaiApiKey.trim());
  }
  if (anthropicApiKey !== undefined && !anthropicApiKey.includes('...')) {
    repo.setSetting('ANTHROPIC_API_KEY', anthropicApiKey.trim());
  }
  if (geminiApiKey !== undefined && !geminiApiKey.includes('...')) {
    repo.setSetting('GEMINI_API_KEY', geminiApiKey.trim());
  }
  if (openaiBaseUrl !== undefined) {
    repo.setSetting('OPENAI_BASE_URL', openaiBaseUrl.trim() || 'https://api.openai.com/v1');
  }

  res.json({ success: true });
});

// Providers & Models
app.get('/api/providers', authMiddleware, (req: Request, res: Response) => {
  res.json(providerRegistry.getAvailableProviders());
});

// Projects
app.get('/api/projects', authMiddleware, (req: Request, res: Response) => {
  res.json(repo.getProjects());
});

app.post('/api/projects', authMiddleware, async (req: Request, res: Response) => {
  const { name, projectPath, gitRemote, defaultProvider, defaultModel, deployCmd, cloneFromRemote } = req.body;

  if (!name || !projectPath) {
    return res.status(400).json({ error: 'Name and projectPath are required' });
  }

  const resolvedPath = path.resolve(projectPath);

  // If user requested to clone from remote repository
  if (cloneFromRemote && gitRemote) {
    if (fs.existsSync(resolvedPath) && fs.readdirSync(resolvedPath).length > 0) {
      return res.status(400).json({ error: `Directory ${resolvedPath} already exists and is not empty.` });
    }
    try {
      const parentDir = path.dirname(resolvedPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      await execAsync(`git clone "${gitRemote}" "${resolvedPath}"`);
    } catch (err: any) {
      return res.status(500).json({ error: `Git clone failed: ${err.message}` });
    }
  } else {
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }
  }

  const now = new Date().toISOString();
  const id = `proj_${Date.now()}`;
  const project = {
    id,
    name,
    path: resolvedPath,
    gitRemote,
    defaultProvider: defaultProvider || 'openai-compatible',
    defaultModel: defaultModel || 'gpt-4o',
    deployCmd,
    createdAt: now,
    updatedAt: now
  };

  repo.createProject(project);
  res.json(project);
});

app.get('/api/projects/:id', authMiddleware, (req: Request, res: Response) => {
  const project = repo.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

app.delete('/api/projects/:id', authMiddleware, (req: Request, res: Response) => {
  repo.deleteProject(req.params.id);
  res.json({ success: true });
});

// Project Git Status & Diff
app.get('/api/projects/:id/git-status', authMiddleware, async (req: Request, res: Response) => {
  const project = repo.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  try {
    const { stdout: status } = await execAsync('git status -s', { cwd: project.path });
    const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: project.path });
    res.json({ branch: branch.trim(), status: status.trim() });
  } catch (e: any) {
    res.json({ branch: 'unknown', status: 'not a git repo or error' });
  }
});

app.get('/api/projects/:id/git-diff', authMiddleware, async (req: Request, res: Response) => {
  const project = repo.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  try {
    const { stdout: diff } = await execAsync('git diff HEAD', { cwd: project.path });
    res.json({ diff });
  } catch (e: any) {
    res.json({ diff: '' });
  }
});

// Git Pull for project
app.post('/api/projects/:id/git-pull', authMiddleware, async (req: Request, res: Response) => {
  const project = repo.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  try {
    const { stdout, stderr } = await execAsync('git pull', { cwd: project.path });
    res.json({ success: true, output: stdout || stderr || 'Already up to date.' });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message, output: e.stdout || e.stderr });
  }
});

// Update project settings (e.g. devPort, deployCmd)
app.patch('/api/projects/:id', authMiddleware, (req: Request, res: Response) => {
  const { devPort, deployCmd, name, gitRemote } = req.body;
  repo.updateProject(req.params.id, {
    devPort: devPort !== undefined ? (devPort ? parseInt(devPort, 10) : undefined) : undefined,
    deployCmd,
    name,
    gitRemote
  });
  res.json({ success: true, project: repo.getProject(req.params.id) });
});

// App Live Dev Preview Reverse Proxy
app.all('/api/projects/:id/preview*', authMiddleware, async (req: Request, res: Response) => {
  const project = repo.getProject(req.params.id);
  if (!project) return res.status(404).send('Project not found');

  const port = project.devPort || 4000;
  const subPath = req.params[0] || '/';

  try {
    const targetUrl = `http://127.0.0.1:${port}${subPath}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`;

    const headers: Record<string, string> = { ...req.headers as any };
    delete headers['host'];

    const proxyRes = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body)
    });

    res.status(proxyRes.status);
    proxyRes.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });

    const bodyBuffer = await proxyRes.arrayBuffer();
    res.send(Buffer.from(bodyBuffer));
  } catch (err: any) {
    res.status(502).send(`
      <html>
        <head><title>Preview Not Running</title></head>
        <body style="background:#09090b;color:#f4f4f5;font-family:monospace;padding:24px;text-align:center;">
          <h2 style="color:#ef4444;">App Dev Server is not running on port ${port}</h2>
          <p style="color:#a1a1aa;font-size:13px;">To test and view your app in live preview, ask Forge in the chat:</p>
          <div style="background:#18181b;padding:12px;border:1px solid #27272a;border-radius:6px;display:inline-block;margin:12px 0;">
            <code>"Jalankan app ini di background di port ${port}"</code>
          </div>
          <p style="color:#71717a;font-size:11px;">Error: ${err.message}</p>
        </body>
      </html>
    `);
  }
});

// Deploy project
app.post('/api/projects/:id/deploy', authMiddleware, async (req: Request, res: Response) => {
  const project = repo.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.deployCmd) return res.status(400).json({ error: 'No deploy command configured' });

  try {
    const { stdout, stderr } = await execAsync(project.deployCmd, { cwd: project.path });
    res.json({ success: true, output: stdout + (stderr ? `\n${stderr}` : '') });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message, output: e.stdout || e.stderr });
  }
});

// Sessions
app.get('/api/sessions', authMiddleware, (req: Request, res: Response) => {
  const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
  res.json(repo.getSessions(projectId));
});

app.post('/api/sessions', authMiddleware, (req: Request, res: Response) => {
  const { projectId, title, provider, model } = req.body;
  const now = new Date().toISOString();
  const id = `ses_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const session = {
    id,
    projectId: projectId || null,
    title: title || (projectId ? 'Coding Session' : 'VPS Ops Session'),
    provider: provider || 'openai-compatible',
    model: model || 'gpt-4o',
    status: 'idle' as const,
    createdAt: now,
    updatedAt: now
  };

  repo.createSession(session);
  res.json(session);
});

app.get('/api/sessions/:id', authMiddleware, (req: Request, res: Response) => {
  const session = repo.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// Messages in session
app.get('/api/sessions/:id/messages', authMiddleware, (req: Request, res: Response) => {
  res.json(repo.getMessages(req.params.id));
});

// Tasks & Prompt submission
app.post('/api/sessions/:id/prompt', authMiddleware, async (req: Request, res: Response) => {
  const session = repo.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { prompt, provider, model } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  let targetProvider = provider || session.provider;
  let targetModel = model || session.model;

  // Check if model matches a configured model preset ID
  const rawModels = repo.getSetting('configured_models');
  if (rawModels) {
    try {
      const modelsList: any[] = JSON.parse(rawModels);
      const matched = modelsList.find(m => m.id === model || m.modelId === model);
      if (matched) {
        targetProvider = matched.provider || targetProvider;
        targetModel = matched.modelId || targetModel;
      }
    } catch {}
  }

  repo.updateSession(session.id, {
    provider: targetProvider,
    model: targetModel
  });

  // 1. Add user message
  const userMsgId = `msg_${Date.now()}`;
  repo.createMessage({
    id: userMsgId,
    sessionId: session.id,
    role: 'user',
    content: prompt,
    createdAt: new Date().toISOString()
  });

  // 2. Create Task
  const taskId = `task_${Date.now()}`;
  const now = new Date().toISOString();
  const task = {
    id: taskId,
    sessionId: session.id,
    prompt,
    status: 'pending' as const,
    createdAt: now,
    updatedAt: now
  };
  repo.createTask(task);

  // 3. Trigger Agent Task in background
  agentEngine.runTask(taskId).catch(err => {
    console.error('Agent execution error:', err);
  });

  res.json({ taskId, sessionId: session.id });
});

// Confirmation resolve
app.post('/api/tasks/:id/confirm', authMiddleware, async (req: Request, res: Response) => {
  const { approved } = req.body;
  try {
    await agentEngine.resolveConfirmation(req.params.id, !!approved);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Stop task
app.post('/api/tasks/:id/stop', authMiddleware, (req: Request, res: Response) => {
  agentEngine.stopTask(req.params.id);
  res.json({ success: true });
});

// SSE Streaming for real-time agent output & events
app.get('/api/sessions/:id/events', authMiddleware, (req: Request, res: Response) => {
  const sessionId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

  const handler = (event: any) => {
    if (event.sessionId === sessionId) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };

  agentEngine.on('event', handler);

  req.on('close', () => {
    agentEngine.removeListener('event', handler);
  });
});

// Command logs
app.get('/api/sessions/:id/logs', authMiddleware, (req: Request, res: Response) => {
  res.json(repo.getCommandLogs(req.params.id));
});

// VPS Quick Health API
app.get('/api/vps/health', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [load, mem, fsSize, time] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.time()
    ]);

    res.json({
      cpuLoad: load.currentLoad.toFixed(1),
      memUsedGB: (mem.active / (1024 ** 3)).toFixed(2),
      memTotalGB: (mem.total / (1024 ** 3)).toFixed(2),
      memPercent: ((mem.active / mem.total) * 100).toFixed(1),
      uptimeHours: (time.uptime / 3600).toFixed(1),
      disks: fsSize.map(d => ({
        fs: d.fs,
        mount: d.mount,
        usedGB: (d.used / (1024 ** 3)).toFixed(1),
        sizeGB: (d.size / (1024 ** 3)).toFixed(1),
        percent: d.use
      }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend static build in production
const clientDist = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

export { app, PORT, repo, agentEngine };

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Forge server running at http://localhost:${PORT}`);
  });
}
