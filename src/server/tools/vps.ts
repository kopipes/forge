import { exec } from 'child_process';
import { promisify } from 'util';
import si from 'systeminformation';
import { Tool, ToolExecutionContext } from './base.js';
import { ToolDefinition } from '../../shared/types.js';

const execAsync = promisify(exec);

export class VPSHealthTool implements Tool {
  definition: ToolDefinition = {
    name: 'vps_health',
    description: 'Returns VPS system health metrics: CPU load, RAM usage, disk usage per partition, and uptime.',
    parameters: {
      type: 'object',
      properties: {}
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    const [load, mem, fsSize, time] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.time()
    ]);

    const ramUsedGB = (mem.active / (1024 ** 3)).toFixed(2);
    const ramTotalGB = (mem.total / (1024 ** 3)).toFixed(2);
    const ramPercent = ((mem.active / mem.total) * 100).toFixed(1);

    const uptimeHours = (time.uptime / 3600).toFixed(1);

    const diskSummary = fsSize.map(disk =>
      `${disk.fs} (${disk.mount}): ${(disk.used / (1024 ** 3)).toFixed(1)}GB / ${(disk.size / (1024 ** 3)).toFixed(1)}GB (${disk.use}%)`
    ).join('\n');

    return `=== VPS Health Summary ===
CPU Load: ${load.currentLoad.toFixed(1)}%
RAM Usage: ${ramUsedGB} GB / ${ramTotalGB} GB (${ramPercent}%)
Uptime: ${uptimeHours} hours

Disks:
${diskSummary}
`;
  }
}

export class PSListTool implements Tool {
  definition: ToolDefinition = {
    name: 'ps_list',
    description: 'Lists active running processes on VPS.',
    parameters: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Filter keyword for process name or command' }
      }
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    const filter = args.filter ? args.filter.replace(/[^a-zA-Z0-9_\-]/g, '') : '';
    const cmd = filter ? `ps aux | grep -i "${filter}" | head -n 25` : `ps aux --sort=-%cpu | head -n 20`;
    try {
      const { stdout } = await execAsync(cmd);
      return stdout || 'No matching processes.';
    } catch (e: any) {
      return `Failed to list processes: ${e.message}`;
    }
  }
}

export class SystemctlStatusTool implements Tool {
  definition: ToolDefinition = {
    name: 'systemctl_status',
    description: 'Checks status of systemd services or lists active units.',
    parameters: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service name (e.g. nginx, pm2, docker). Leave empty to list running units.' }
      }
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    const service = args.service ? args.service.replace(/[^a-zA-Z0-9_\-\.]/g, '') : '';
    const cmd = service ? `systemctl status ${service}` : `systemctl list-units --type=service --state=running --no-pager | head -n 30`;
    try {
      const { stdout, stderr } = await execAsync(cmd);
      return stdout || stderr || 'No systemd output.';
    } catch (e: any) {
      return e.stdout || e.message || `Failed to check service status.`;
    }
  }
}

export class SystemctlActionTool implements Tool {
  definition: ToolDefinition = {
    name: 'systemctl_action',
    description: 'Executes restart, start, stop, enable, or disable on a systemd service.',
    requiresConfirmation: true,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['restart', 'start', 'stop', 'enable', 'disable'] },
        service: { type: 'string', description: 'Service name' }
      },
      required: ['action', 'service']
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    const action = args.action;
    const service = args.service.replace(/[^a-zA-Z0-9_\-\.]/g, '');
    const cmd = `systemctl ${action} ${service}`;
    try {
      const { stdout, stderr } = await execAsync(cmd);
      return stdout || stderr || `Successfully executed systemctl ${action} ${service}`;
    } catch (e: any) {
      return `Failed systemctl action: ${e.stderr || e.message}`;
    }
  }
}

export class CrontabListTool implements Tool {
  definition: ToolDefinition = {
    name: 'crontab_list',
    description: 'Lists current user crontab schedules.',
    parameters: {
      type: 'object',
      properties: {}
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    try {
      const { stdout } = await execAsync('crontab -l');
      return stdout || '(Crontab is empty)';
    } catch (e: any) {
      return e.stderr?.includes('no crontab') ? '(No crontab for current user)' : `Crontab list error: ${e.message}`;
    }
  }
}

export class CrontabEditTool implements Tool {
  definition: ToolDefinition = {
    name: 'crontab_edit',
    description: 'Appends or updates a cron schedule entry.',
    requiresConfirmation: true,
    parameters: {
      type: 'object',
      properties: {
        newCrontabContent: { type: 'string', description: 'Full new crontab file content' }
      },
      required: ['newCrontabContent']
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    try {
      const escaped = args.newCrontabContent.replace(/"/g, '\\"');
      await execAsync(`echo "${escaped}" | crontab -`);
      return 'Crontab updated successfully.';
    } catch (e: any) {
      return `Failed to update crontab: ${e.message}`;
    }
  }
}

export class JournalctlTailTool implements Tool {
  definition: ToolDefinition = {
    name: 'journalctl_tail',
    description: 'Tails recent systemd or app service logs.',
    parameters: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service name (e.g. nginx, forge)' },
        lines: { type: 'number', description: 'Number of log lines to retrieve (default 100)' }
      },
      required: ['service']
    }
  };

  async execute(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    const service = args.service.replace(/[^a-zA-Z0-9_\-\.]/g, '');
    const lines = Math.min(args.lines || 100, 500);
    const cmd = `journalctl -u ${service} -n ${lines} --no-pager`;
    try {
      const { stdout, stderr } = await execAsync(cmd);
      return stdout || stderr || '(No logs found)';
    } catch (e: any) {
      return `Journalctl error: ${e.stdout || e.message}`;
    }
  }
}
