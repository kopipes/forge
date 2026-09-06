import { Tool, ToolExecutionContext } from './base.js';
import {
  RepoTreeTool,
  ReadFileTool,
  WriteFileTool,
  ApplyPatchTool,
  RunCommandTool,
  GitStatusTool,
  GitDiffTool,
  GitCommitTool,
  GitPushTool,
  GitPullTool,
  GitSyncCheckTool
} from './project.js';
import {
  VPSHealthTool,
  PSListTool,
  SystemctlStatusTool,
  SystemctlActionTool,
  CrontabListTool,
  CrontabEditTool,
  JournalctlTailTool
} from './vps.js';
import { ToolDefinition } from '../../shared/types.js';

export class ToolRegistry {
  private projectTools: Map<string, Tool> = new Map();
  private vpsTools: Map<string, Tool> = new Map();

  constructor() {
    // Project Tools
    this.registerProject(new RepoTreeTool());
    this.registerProject(new ReadFileTool());
    this.registerProject(new WriteFileTool());
    this.registerProject(new ApplyPatchTool());
    this.registerProject(new RunCommandTool());
    this.registerProject(new GitStatusTool());
    this.registerProject(new GitDiffTool());
    this.registerProject(new GitCommitTool());
    this.registerProject(new GitPushTool());
    this.registerProject(new GitPullTool());
    this.registerProject(new GitSyncCheckTool());

    // VPS Tools
    this.registerVPS(new VPSHealthTool());
    this.registerVPS(new PSListTool());
    this.registerVPS(new SystemctlStatusTool());
    this.registerVPS(new SystemctlActionTool());
    this.registerVPS(new CrontabListTool());
    this.registerVPS(new CrontabEditTool());
    this.registerVPS(new JournalctlTailTool());
  }

  private registerProject(tool: Tool) {
    this.projectTools.set(tool.definition.name, tool);
  }

  private registerVPS(tool: Tool) {
    this.vpsTools.set(tool.definition.name, tool);
  }

  getToolsForContext(isProjectContext: boolean): ToolDefinition[] {
    const map = isProjectContext ? this.projectTools : this.vpsTools;
    return Array.from(map.values()).map(t => t.definition);
  }

  getTool(name: string, isProjectContext: boolean): Tool | undefined {
    const map = isProjectContext ? this.projectTools : this.vpsTools;
    return map.get(name);
  }

  requiresConfirmation(name: string, isProjectContext: boolean, args: Record<string, any>): boolean {
    const tool = this.getTool(name, isProjectContext);
    if (!tool) return false;

    if (tool.definition.requiresConfirmation) return true;

    // Destructive command safety checks for run_command in project context
    if (isProjectContext && name === 'run_command') {
      const cmd = (args.command || '').trim();
      const destructivePatterns = [
        /rm\s+-rf/i,
        /git\s+reset\s+--hard/i,
        /git\s+clean\s+-fd/i,
        /drop\s+database/i,
        /npm\s+publish/i,
        /deploy/i
      ];
      return destructivePatterns.some(p => p.test(cmd));
    }

    return false;
  }
}
