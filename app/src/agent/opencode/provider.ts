import type { AgentProcessStartOptions } from "../acp/types";

export const OPENCODE_PROVIDER_ID = "opencode" as const;

export const OPENCODE_ACP_COMMAND = "opencode";
export const OPENCODE_ACP_ARGS = ["acp"];

export function createOpenCodeAcpStartOptions(cwd: string): AgentProcessStartOptions {
  return {
    command: OPENCODE_ACP_COMMAND,
    args: OPENCODE_ACP_ARGS,
    cwd: cwd || null,
    env: null,
  };
}

export function createOpenCodeInitializeParams() {
  return {
    protocolVersion: 1,
    clientCapabilities: {
      _meta: {
        "terminal-auth": true,
      },
    },
    clientInfo: {
      name: "My Last Feedback",
      version: "0.4.1",
    },
  };
}