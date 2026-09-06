import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDatabase } from '../src/server/db';
import { Repository } from '../src/server/repo';
import { ToolRegistry } from '../src/server/tools/registry';
import path from 'path';
import fs from 'fs';

describe('Forge Core & DB', () => {
  let db: Database.Database;
  let repo: Repository;
  const testDbPath = path.resolve(process.cwd(), 'test-forge.db');

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    db = initDatabase(testDbPath);
    repo = new Repository(db);
  });

  it('should create and retrieve project, session, and message', () => {
    const proj = {
      id: 'proj_1',
      name: 'Test Project',
      path: process.cwd(),
      defaultProvider: 'openai-compatible',
      defaultModel: 'gpt-4o',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    repo.createProject(proj);

    const fetchedProj = repo.getProject('proj_1');
    expect(fetchedProj).toBeDefined();
    expect(fetchedProj?.name).toBe('Test Project');

    const ses = {
      id: 'ses_1',
      projectId: 'proj_1',
      title: 'Session 1',
      provider: 'openai-compatible',
      model: 'gpt-4o',
      status: 'idle' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    repo.createSession(ses);

    const fetchedSes = repo.getSession('ses_1');
    expect(fetchedSes?.title).toBe('Session 1');

    repo.createMessage({
      id: 'msg_1',
      sessionId: 'ses_1',
      role: 'user',
      content: 'Fix bug in auth',
      createdAt: new Date().toISOString()
    });

    const messages = repo.getMessages('ses_1');
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('Fix bug in auth');
  });

  it('should verify tool registry and path validation guard', async () => {
    const registry = new ToolRegistry();
    const projectTools = registry.getToolsForContext(true);
    const vpsTools = registry.getToolsForContext(false);

    expect(projectTools.some(t => t.name === 'read_file')).toBe(true);
    expect(projectTools.some(t => t.name === 'run_command')).toBe(true);
    expect(projectTools.some(t => t.name === 'git_commit')).toBe(true);

    expect(vpsTools.some(t => t.name === 'vps_health')).toBe(true);
    expect(vpsTools.some(t => t.name === 'systemctl_status')).toBe(true);

    const readFileTool = registry.getTool('read_file', true);
    expect(readFileTool).toBeDefined();

    // Verify reading package.json inside project works
    const content = await readFileTool!.execute({ filePath: 'package.json' }, {
      projectId: 'proj_1',
      projectPath: process.cwd(),
      sessionId: 'ses_1',
      provider: 'openai-compatible',
      model: 'gpt-4o'
    });
    expect(content).toContain('"name": "forge"');

    // Verify trying to escape project root throws security error
    await expect(
      readFileTool!.execute({ filePath: '../../../../etc/passwd' }, {
        projectId: 'proj_1',
        projectPath: process.cwd(),
        sessionId: 'ses_1',
        provider: 'openai-compatible',
        model: 'gpt-4o'
      })
    ).rejects.toThrow(/Security Violation/);
  });
});
