export interface AgentProcessInfo {
  processId: string;
  cwd: string;
  command: string;
  args: string[];
}

export interface AgentProcessStartOptions {
  command: string;
  args?: string[];
  cwd?: string | null;
  env?: Record<string, string> | null;
}
