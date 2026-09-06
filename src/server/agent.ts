import { EventEmitter } from 'events';
import { Repository } from './repo.js';
import { ProviderRegistry } from './providers/registry.js';
import { ToolRegistry } from './tools/registry.js';
import { LLMMessage, Task, ToolResult, Message } from '../shared/types.js';

export interface AgentEvent {
  type: 'token' | 'tool_call_start' | 'tool_call_result' | 'waiting_confirmation' | 'completed' | 'error';
  sessionId: string;
  taskId: string;
  data: any;
}

export class AgentEngine extends EventEmitter {
  private activeRuns: Map<string, { abortController: AbortController }> = new Map();

  constructor(
    private repo: Repository,
    private providerRegistry: ProviderRegistry,
    private toolRegistry: ToolRegistry
  ) {
    super();
  }

  async runTask(taskId: string): Promise<void> {
    const task = this.repo.getTask(taskId);
    if (!task) return;

    const session = this.repo.getSession(task.sessionId);
    if (!session) return;

    const project = session.projectId ? this.repo.getProject(session.projectId) : null;
    const isProjectContext = !!project;

    const abortController = new AbortController();
    this.activeRuns.set(taskId, { abortController });

    this.repo.updateTask(taskId, { status: 'running', error: undefined });
    this.repo.updateSession(session.id, { status: 'running' });

    try {
      // 1. Gather messages for context
      const dbMessages = this.repo.getMessages(session.id);
      const llmMessages: LLMMessage[] = dbMessages.map((m: Message) => ({
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        toolResults: m.toolResults
      }));

      // Setup system prompt
      const systemPrompt = isProjectContext
        ? `You are Forge, an expert coding companion running directly on the user's VPS.
Project Name: ${project.name}
Project Path: ${project.path}
${project.devPort ? `Configured Dev Test Port: ${project.devPort}` : ''}
Rules & Guidelines:
- Strictly adhere to the project root directory.
- Perform requested coding, bug fixing, test running, dev previewing, and git operations using your available tools.
- Never cd out of the project directory.
- DEPLOY & PATH SAFETY: Never hardcode absolute VPS server paths (e.g. /srv/apps/...) into client-side HTML, CSS, or frontend JavaScript asset URLs. Always use relative paths ('./', '/') or environment variables ('process.env.PORT', 'process.env.BASE_URL') so that the app works both in local preview and when deployed to production.
- For web apps, listen on process.env.PORT or port ${project.devPort || 4000}.`
        : `You are Forge VPS Ops Companion running directly on the server.
Rules:
- Help inspect system health, manage systemd services, check crontabs, view processes, and read service logs.
- VPS tools are strictly allowlisted. Destructive changes will ask for user confirmation.`;

      const tools = this.toolRegistry.getToolsForContext(isProjectContext);

      // Check if session.model matches a custom configured model preset
      let targetProvider = session.provider;
      let targetModelId = session.model;
      let apiKey = '';
      let baseUrl = '';

      const rawModels = this.repo.getSetting('configured_models');
      if (rawModels) {
        try {
          const modelsList: any[] = JSON.parse(rawModels);
          const matched = modelsList.find(m => m.id === session.model || m.modelId === session.model || m.name === session.model);
          if (matched) {
            targetProvider = matched.provider || targetProvider;
            targetModelId = matched.modelId || targetModelId;
            if (matched.apiKey) apiKey = matched.apiKey;
            if (matched.baseUrl) baseUrl = matched.baseUrl;
          }
        } catch {}
      }

      const adapter = this.providerRegistry.getAdapter(targetProvider);

      // Fallback API keys & base URLs from Settings DB with process.env fallback if not overridden per model
      if (!apiKey) {
        if (targetProvider === 'openai-compatible') {
          apiKey = this.repo.getSetting('OPENAI_API_KEY') || process.env.OPENAI_API_KEY || '';
        } else if (targetProvider === 'anthropic') {
          apiKey = this.repo.getSetting('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY || '';
        } else if (targetProvider === 'gemini') {
          apiKey = this.repo.getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY || '';
        }
      }

      if (!baseUrl && targetProvider === 'openai-compatible') {
        baseUrl = this.repo.getSetting('OPENAI_BASE_URL') || process.env.OPENAI_BASE_URL || '';
      }

      let modelDisplayName = targetModelId;
      if (rawModels) {
        try {
          const modelsList: any[] = JSON.parse(rawModels);
          const matched = modelsList.find(m => m.id === session.model || m.modelId === session.model || m.name === session.model);
          if (matched && matched.name) {
            modelDisplayName = matched.name;
          }
        } catch {}
      }

      let maxIterations = 15;
      let finished = false;

      while (maxIterations > 0 && !finished) {
        maxIterations--;

        const response = await adapter.generateResponse(
          llmMessages,
          tools,
          targetModelId,
          systemPrompt,
          { apiKey: apiKey || undefined, baseUrl: baseUrl || undefined }
        );

        if (response.content) {
          this.emit('event', {
            type: 'token',
            sessionId: session.id,
            taskId: task.id,
            data: { content: response.content }
          } as AgentEvent);
        }

        // If there are no tool calls, the model concluded its answer
        if (!response.toolCalls || response.toolCalls.length === 0) {
          // Save assistant message to DB
          const assistantMsgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          this.repo.createMessage({
            id: assistantMsgId,
            sessionId: session.id,
            role: 'assistant',
            content: response.content,
            model: modelDisplayName,
            createdAt: new Date().toISOString()
          });

          finished = true;
          break;
        }

        // Save assistant message with tool calls
        const assistantMsgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        this.repo.createMessage({
          id: assistantMsgId,
          sessionId: session.id,
          role: 'assistant',
          content: response.content,
          model: modelDisplayName,
          toolCalls: response.toolCalls,
          createdAt: new Date().toISOString()
        });

        llmMessages.push({
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls
        });

        const toolResults: ToolResult[] = [];

        for (const toolCall of response.toolCalls) {
          const requiresConfirm = this.toolRegistry.requiresConfirmation(
            toolCall.name,
            isProjectContext,
            toolCall.arguments
          );

          if (requiresConfirm) {
            // Need user confirmation before executing!
            const confirmationReq = {
              id: `conf_${Date.now()}`,
              taskId: task.id,
              action: toolCall.name,
              description: `Confirm execution of ${toolCall.name}`,
              command: toolCall.arguments.command,
              details: toolCall.arguments
            };

            this.repo.updateTask(task.id, {
              status: 'waiting_confirmation',
              pendingConfirmation: confirmationReq
            });
            this.repo.updateSession(session.id, { status: 'waiting_confirmation' });

            this.emit('event', {
              type: 'waiting_confirmation',
              sessionId: session.id,
              taskId: task.id,
              data: confirmationReq
            } as AgentEvent);

            return; // Wait for user approve/reject API call
          }

          this.emit('event', {
            type: 'tool_call_start',
            sessionId: session.id,
            taskId: task.id,
            data: { toolCall }
          } as AgentEvent);

          const tool = this.toolRegistry.getTool(toolCall.name, isProjectContext);
          let output = '';
          let isError = false;

          if (!tool) {
            output = `Tool ${toolCall.name} not found.`;
            isError = true;
          } else {
            try {
              output = await tool.execute(toolCall.arguments, {
                projectId: project?.id,
                projectPath: project?.path,
                sessionId: session.id,
                taskId: task.id,
                provider: session.provider,
                model: session.model
              });
            } catch (err: any) {
              output = `Tool execution error: ${err.message}`;
              isError = true;
            }
          }

          const tr: ToolResult = {
            toolCallId: toolCall.id,
            name: toolCall.name,
            output,
            isError
          };

          toolResults.push(tr);

          // Log command execution
          if (toolCall.name === 'run_command' || toolCall.name.startsWith('git_') || toolCall.name.startsWith('systemctl_')) {
            this.repo.createCommandLog({
              id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              projectId: project?.id,
              sessionId: session.id,
              taskId: task.id,
              command: toolCall.arguments.command || toolCall.name,
              cwd: project?.path || '/',
              exitCode: isError ? 1 : 0,
              stdout: output,
              stderr: isError ? output : '',
              createdAt: new Date().toISOString()
            });
          }

          this.emit('event', {
            type: 'tool_call_result',
            sessionId: session.id,
            taskId: task.id,
            data: tr
          } as AgentEvent);
        }

        // Save tool results message
        const toolMsgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        this.repo.createMessage({
          id: toolMsgId,
          sessionId: session.id,
          role: 'tool',
          content: 'Tool execution results',
          toolResults,
          createdAt: new Date().toISOString()
        });

        llmMessages.push({
          role: 'tool',
          content: 'Tool execution results',
          toolResults
        });
      }

      this.repo.updateTask(taskId, { status: 'completed' });
      this.repo.updateSession(session.id, { status: 'idle' });

      this.emit('event', {
        type: 'completed',
        sessionId: session.id,
        taskId: task.id,
        data: { message: 'Task finished successfully' }
      } as AgentEvent);

    } catch (err: any) {
      // Save explicit error message to DB so it renders in the chat UI
      const errorMsgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      this.repo.createMessage({
        id: errorMsgId,
        sessionId: session.id,
        role: 'assistant',
        content: `⚠️ Execution Error: ${err.message}`,
        createdAt: new Date().toISOString()
      });

      this.repo.updateTask(taskId, { status: 'failed', error: err.message });
      this.repo.updateSession(session.id, { status: 'error' });

      this.emit('event', {
        type: 'error',
        sessionId: session.id,
        taskId: task.id,
        data: { error: err.message }
      } as AgentEvent);
    } finally {
      this.activeRuns.delete(taskId);
    }
  }

  async resolveConfirmation(taskId: string, approved: boolean): Promise<void> {
    const task = this.repo.getTask(taskId);
    if (!task || task.status !== 'waiting_confirmation' || !task.pendingConfirmation) {
      throw new Error('Task is not waiting for confirmation');
    }

    const session = this.repo.getSession(task.sessionId);
    if (!session) return;
    const project = session.projectId ? this.repo.getProject(session.projectId) : null;
    const isProjectContext = !!project;

    const conf = task.pendingConfirmation;
    this.repo.updateTask(taskId, { pendingConfirmation: null });

    if (!approved) {
      // User rejected confirmation
      const toolMsgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      this.repo.createMessage({
        id: toolMsgId,
        sessionId: session.id,
        role: 'tool',
        content: `Action ${conf.action} was rejected by user.`,
        toolResults: [{
          toolCallId: conf.id,
          name: conf.action,
          output: 'Operation cancelled by user.',
          isError: true
        }],
        createdAt: new Date().toISOString()
      });

      this.repo.updateTask(taskId, { status: 'completed' });
      this.repo.updateSession(session.id, { status: 'idle' });
      return;
    }

    // User approved: execute the tool
    const tool = this.toolRegistry.getTool(conf.action, isProjectContext);
    let output = '';
    let isError = false;

    if (tool) {
      try {
        output = await tool.execute(conf.details || {}, {
          projectId: project?.id,
          projectPath: project?.path,
          sessionId: session.id,
          taskId: task.id,
          provider: session.provider,
          model: session.model
        });
      } catch (err: any) {
        output = `Execution failed: ${err.message}`;
        isError = true;
      }
    }

    const toolMsgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.repo.createMessage({
      id: toolMsgId,
      sessionId: session.id,
      role: 'tool',
      content: 'Tool executed upon confirmation',
      toolResults: [{
        toolCallId: conf.id,
        name: conf.action,
        output,
        isError
      }],
      createdAt: new Date().toISOString()
    });

    // Continue the agent task loop
    await this.runTask(taskId);
  }

  stopTask(taskId: string): void {
    const active = this.activeRuns.get(taskId);
    if (active) {
      active.abortController.abort();
      this.activeRuns.delete(taskId);
    }
    const task = this.repo.getTask(taskId);
    if (task) {
      this.repo.updateTask(taskId, { status: 'cancelled' });
      this.repo.updateSession(task.sessionId, { status: 'idle' });
    }
  }
}
