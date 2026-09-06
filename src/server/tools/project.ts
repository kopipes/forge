import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolExecutionContext } from './base.js';
import { ToolDefinition } from '../../shared/types.js';

const execAsync = promisify(exec);

// Path guard: prevent access outside project folder or forbidden system paths
function validatePath(targetPath: string, projectPath: string): string {
  const resolvedProject = path.resolve(projectPath);
  const resolvedTarget = path.resolve(targetPath.startsWith('/') ? targetPath : path.join(resolvedProject, targetPath));

  if (!resolvedTarget.startsWith(resolvedProject)) {
    throw new Error(`Security Violation: Access to path "${targetPath}" outside project directory "${projectPath}" is forbidden.`);
  }

  const forbiddenPrefixes = ['/etc', '/var', '/usr', '/bin', '/sbin', '/root', '/home', '/Users/bob/.ssh'];
  for (const forbidden of forbiddenPrefixes) {
    if (resolvedTarget.startsWith(forbidden) && !resolvedTarget.startsWith(resolvedProject)) {
      throw new Error(`Security Violation: Path "${targetPath}" is restricted.`);
    }
  }

  return resolvedTarget;
}

export class RepoTreeTool implements Tool {
  definition: ToolDefinition = {
    name: 'repo_tree',
    description: 'Lists files and directories inside the project workspace.',
    parameters: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: 'Relative path inside project (defaults to root ".")' }
      }
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.projectPath) throw new Error('Project context required for repo_tree');
    const targetDir = validatePath(args.dirPath || '.', context.projectPath);

    function buildTree(dir: string, depth = 0, maxDepth = 3): string[] {
      if (depth > maxDepth) return ['...'];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const lines: string[] = [];
      for (const entry of entries) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.DS_Store') continue;
        const relative = path.relative(context.projectPath!, path.join(dir, entry.name));
        if (entry.isDirectory()) {
          lines.push(`${relative}/`);
          lines.push(...buildTree(path.join(dir, entry.name), depth + 1, maxDepth));
        } else {
          lines.push(relative);
        }
      }
      return lines;
    }

    const fileList = buildTree(targetDir);
    return fileList.join('\n') || '(Empty directory)';
  }
}

export class ReadFileTool implements Tool {
  definition: ToolDefinition = {
    name: 'read_file',
    description: 'Reads content of a file in the project workspace.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Relative path to file' }
      },
      required: ['filePath']
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.projectPath) throw new Error('Project context required');
    const fullPath = validatePath(args.filePath, context.projectPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${args.filePath}`);
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      throw new Error(`Path is a directory, not a file: ${args.filePath}`);
    }

    return fs.readFileSync(fullPath, 'utf-8');
  }
}

export class WriteFileTool implements Tool {
  definition: ToolDefinition = {
    name: 'write_file',
    description: 'Creates or overwrites a file in the project workspace.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Relative path to file' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['filePath', 'content']
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.projectPath) throw new Error('Project context required');
    const fullPath = validatePath(args.filePath, context.projectPath);

    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, args.content, 'utf-8');
    return `Successfully wrote file: ${args.filePath}`;
  }
}

export class ApplyPatchTool implements Tool {
  definition: ToolDefinition = {
    name: 'apply_patch',
    description: 'Replaces specific old text with new text in a file (exact string replacement).',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Relative path to file' },
        oldText: { type: 'string', description: 'Existing text snippet to replace' },
        newText: { type: 'string', description: 'New replacement text' }
      },
      required: ['filePath', 'oldText', 'newText']
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.projectPath) throw new Error('Project context required');
    const fullPath = validatePath(args.filePath, context.projectPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${args.filePath}`);
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    if (!content.includes(args.oldText)) {
      throw new Error(`Target text to replace was not found in ${args.filePath}`);
    }

    const updated = content.replace(args.oldText, args.newText);
    fs.writeFileSync(fullPath, updated, 'utf-8');
    return `Successfully patched file: ${args.filePath}`;
  }
}

export class RunCommandTool implements Tool {
  definition: ToolDefinition = {
    name: 'run_command',
    description: 'Executes a command inside the project directory.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' }
      },
      required: ['command']
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.projectPath) throw new Error('Project context required');

    // Security check: block harmful direct commands
    const cmd = args.command.trim();
    if (cmd.startsWith('rm -rf /') || cmd.includes('sudo') || cmd.includes('mkfs')) {
      throw new Error(`Security Violation: Refused execution of high-risk command: "${cmd}"`);
    }

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: context.projectPath,
        timeout: 60000, // 1 minute timeout
        env: { ...process.env, PATH: process.env.PATH }
      });
      let result = stdout;
      if (stderr) result += `\n[stderr]\n${stderr}`;
      return result.trim() || '(Command completed with no output)';
    } catch (err: any) {
      return `Command failed with exit code ${err.code || 1}:\n${err.stdout || ''}\n${err.stderr || err.message}`;
    }
  }
}

export class GitStatusTool implements Tool {
  definition: ToolDefinition = {
    name: 'git_status',
    description: 'Checks Git working tree status.',
    parameters: {
      type: 'object',
      properties: {}
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.projectPath) throw new Error('Project context required');
    const { stdout } = await execAsync('git status', { cwd: context.projectPath });
    return stdout;
  }
}

export class GitDiffTool implements Tool {
  definition: ToolDefinition = {
    name: 'git_diff',
    description: 'Displays current unstaged or staged git diff.',
    parameters: {
      type: 'object',
      properties: {
        staged: { type: 'boolean', description: 'Whether to show staged diff (--staged)' }
      }
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.projectPath) throw new Error('Project context required');
    const flag = args.staged ? '--staged' : '';
    const { stdout } = await execAsync(`git diff ${flag}`, { cwd: context.projectPath });
    return stdout || '(No changes)';
  }
}

export class GitCommitTool implements Tool {
  definition: ToolDefinition = {
    name: 'git_commit',
    description: 'Stages changes and creates a Git commit with automated Forge metadata trailer.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit title/message' }
      },
      required: ['message']
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.projectPath) throw new Error('Project context required');

    // Stage all changes
    await execAsync('git add -A', { cwd: context.projectPath });

    // Format commit message with Forge trailer (Section 4.4 PRD v2.2)
    const commitMsg = `${args.message.trim()}\n\nDibuat via Forge (mobile)\nForge-Session: ${context.sessionId}\nForge-Model: ${context.provider}/${context.model}`;

    const escapedMsg = commitMsg.replace(/"/g, '\\"');
    const { stdout } = await execAsync(`git commit -m "${escapedMsg}"`, { cwd: context.projectPath });
    return stdout;
  }
}

export class GitPushTool implements Tool {
  definition: ToolDefinition = {
    name: 'git_push',
    description: 'Pushes committed changes to remote repository.',
    parameters: {
      type: 'object',
      properties: {
        remote: { type: 'string', description: 'Remote name (defaults to origin)' },
        branch: { type: 'string', description: 'Branch name (defaults to current branch)' }
      }
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.projectPath) throw new Error('Project context required');
    const remote = args.remote || 'origin';
    const branch = args.branch || '';
    const { stdout, stderr } = await execAsync(`git push ${remote} ${branch}`.trim(), { cwd: context.projectPath });
    return stdout || stderr || 'Push successful.';
  }
}

export class GitSyncCheckTool implements Tool {
  definition: ToolDefinition = {
    name: 'git_sync_check',
    description: 'Fetches remote and checks if local workspace is behind remote branch (PRD v2.2 Section 4.4 sync check).',
    parameters: {
      type: 'object',
      properties: {}
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.projectPath) throw new Error('Project context required');
    try {
      await execAsync('git fetch', { cwd: context.projectPath });
      const { stdout: branchOut } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: context.projectPath });
      const branch = branchOut.trim();

      const { stdout: statusOut } = await execAsync(`git rev-list --count HEAD..origin/${branch}`, { cwd: context.projectPath });
      const behindCount = parseInt(statusOut.trim(), 10) || 0;

      if (behindCount > 0) {
        return `WARNING: Local workspace is behind origin/${branch} by ${behindCount} commit(s). User should pull before making modifications.`;
      }
      return `SYNC OK: Workspace is up to date with origin/${branch}.`;
    } catch (e: any) {
      return `Sync check warning: ${e.message}`;
    }
  }
}
