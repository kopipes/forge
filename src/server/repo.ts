import Database from 'better-sqlite3';
import { Project, Session, Message, Task, CommandLog } from '../shared/types.js';

export class Repository {
  constructor(private db: Database.Database) {}

  // Projects
  getProjects(): Project[] {
    const rows = this.db.prepare(`SELECT * FROM projects ORDER BY updated_at DESC`).all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      path: r.path,
      gitRemote: r.git_remote,
      defaultProvider: r.default_provider,
      defaultModel: r.default_model,
      deployCmd: r.deploy_cmd,
      devPort: r.dev_port || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  getProject(id: string): Project | null {
    const r = this.db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      path: r.path,
      gitRemote: r.git_remote,
      defaultProvider: r.default_provider,
      defaultModel: r.default_model,
      deployCmd: r.deploy_cmd,
      devPort: r.dev_port || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  createProject(p: Project): void {
    this.db.prepare(`
      INSERT INTO projects (id, name, path, git_remote, default_provider, default_model, deploy_cmd, dev_port, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(p.id, p.name, p.path, p.gitRemote || null, p.defaultProvider, p.defaultModel, p.deployCmd || null, p.devPort || null, p.createdAt, p.updatedAt);
  }

  updateProject(id: string, updates: Partial<Project>): void {
    const project = this.getProject(id);
    if (!project) return;
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE projects
      SET name = ?, path = ?, git_remote = ?, default_provider = ?, default_model = ?, deploy_cmd = ?, dev_port = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updates.name ?? project.name,
      updates.path ?? project.path,
      updates.gitRemote ?? project.gitRemote ?? null,
      updates.defaultProvider ?? project.defaultProvider,
      updates.defaultModel ?? project.defaultModel,
      updates.deployCmd ?? project.deployCmd ?? null,
      updates.devPort !== undefined ? updates.devPort : (project.devPort || null),
      now,
      id
    );
  }

  deleteProject(id: string): void {
    this.db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  }

  // Sessions
  getSessions(projectId?: string | null): Session[] {
    let query = `SELECT * FROM sessions`;
    const params: any[] = [];
    if (projectId !== undefined) {
      if (projectId === null) {
        query += ` WHERE project_id IS NULL`;
      } else {
        query += ` WHERE project_id = ?`;
        params.push(projectId);
      }
    }
    query += ` ORDER BY updated_at DESC`;
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(r => ({
      id: r.id,
      projectId: r.project_id,
      title: r.title,
      provider: r.provider,
      model: r.model,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  getSession(id: string): Session | null {
    const r = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      projectId: r.project_id,
      title: r.title,
      provider: r.provider,
      model: r.model,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  createSession(s: Session): void {
    this.db.prepare(`
      INSERT INTO sessions (id, project_id, title, provider, model, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(s.id, s.projectId || null, s.title, s.provider, s.model, s.status, s.createdAt, s.updatedAt);
  }

  updateSession(id: string, updates: Partial<Session>): void {
    const session = this.getSession(id);
    if (!session) return;
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE sessions
      SET title = ?, provider = ?, model = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updates.title ?? session.title,
      updates.provider ?? session.provider,
      updates.model ?? session.model,
      updates.status ?? session.status,
      now,
      id
    );
  }

  // Messages
  getMessages(sessionId: string): Message[] {
    const rows = this.db.prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC`).all(sessionId) as any[];
    return rows.map(r => ({
      id: r.id,
      sessionId: r.session_id,
      role: r.role,
      content: r.content,
      model: r.model || undefined,
      toolCalls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
      toolResults: r.tool_results ? JSON.parse(r.tool_results) : undefined,
      createdAt: r.created_at
    }));
  }

  createMessage(m: Message): void {
    this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, model, tool_calls, tool_results, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      m.id,
      m.sessionId,
      m.role,
      m.content,
      m.model || null,
      m.toolCalls ? JSON.stringify(m.toolCalls) : null,
      m.toolResults ? JSON.stringify(m.toolResults) : null,
      m.createdAt
    );
  }

  // Tasks
  getTask(id: string): Task | null {
    const r = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      sessionId: r.session_id,
      prompt: r.prompt,
      status: r.status,
      pendingConfirmation: r.pending_confirmation ? JSON.parse(r.pending_confirmation) : null,
      error: r.error,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  getActiveTaskForSession(sessionId: string): Task | null {
    const r = this.db.prepare(`
      SELECT * FROM tasks
      WHERE session_id = ? AND status IN ('pending', 'running', 'waiting_confirmation')
      ORDER BY created_at DESC LIMIT 1
    `).get(sessionId) as any;
    if (!r) return null;
    return {
      id: r.id,
      sessionId: r.session_id,
      prompt: r.prompt,
      status: r.status,
      pendingConfirmation: r.pending_confirmation ? JSON.parse(r.pending_confirmation) : null,
      error: r.error,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  createTask(t: Task): void {
    this.db.prepare(`
      INSERT INTO tasks (id, session_id, prompt, status, pending_confirmation, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      t.id,
      t.sessionId,
      t.prompt,
      t.status,
      t.pendingConfirmation ? JSON.stringify(t.pendingConfirmation) : null,
      t.error || null,
      t.createdAt,
      t.updatedAt
    );
  }

  updateTask(id: string, updates: Partial<Task>): void {
    const task = this.getTask(id);
    if (!task) return;
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE tasks
      SET status = ?, pending_confirmation = ?, error = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updates.status ?? task.status,
      updates.pendingConfirmation !== undefined
        ? (updates.pendingConfirmation ? JSON.stringify(updates.pendingConfirmation) : null)
        : (task.pendingConfirmation ? JSON.stringify(task.pendingConfirmation) : null),
      updates.error ?? task.error ?? null,
      now,
      id
    );
  }

  // Command Logs
  createCommandLog(log: CommandLog): void {
    this.db.prepare(`
      INSERT INTO command_logs (id, project_id, session_id, task_id, command, cwd, exit_code, stdout, stderr, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      log.id,
      log.projectId || null,
      log.sessionId,
      log.taskId || null,
      log.command,
      log.cwd,
      log.exitCode,
      log.stdout,
      log.stderr,
      log.createdAt
    );
  }

  getCommandLogs(sessionId: string, limit = 50): CommandLog[] {
    const rows = this.db.prepare(`
      SELECT * FROM command_logs
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(sessionId, limit) as any[];

    return rows.map(r => ({
      id: r.id,
      projectId: r.project_id,
      sessionId: r.session_id,
      taskId: r.task_id,
      command: r.command,
      cwd: r.cwd,
      exitCode: r.exit_code,
      stdout: r.stdout,
      stderr: r.stderr,
      createdAt: r.created_at
    }));
  }

  // Settings
  getSetting(key: string): string | null {
    const r = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as any;
    return r ? r.value : null;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }
}
