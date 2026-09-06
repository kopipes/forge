import { ToolDefinition } from '../../shared/types.js';

export interface ToolExecutionContext {
  projectId?: string | null;
  projectPath?: string | null;
  sessionId: string;
  taskId?: string;
  provider: string;
  model: string;
}

export interface Tool {
  definition: ToolDefinition;
  execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string>;
}
