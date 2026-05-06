import { invoke } from "@tauri-apps/api/core";
import type { AgentProcessInfo, AgentProcessStartOptions } from "../processTypes";
import { OpenCodeHttpClient } from "./httpClient";
import type { OpenCodeRuntimeInfo } from "./httpTypes";

export interface OpenCodeServerRuntimeOptions {
  cwd: string;
  bin?: string;
  hostname?: string;
  port?: number;
  username?: string;
  password?: string;
  startupTimeoutMs?: number;
}

export interface OpenCodeServerRuntime {
  client: OpenCodeHttpClient;
  runtimeInfo: OpenCodeRuntimeInfo;
  processInfo: AgentProcessInfo;
  stop: () => Promise<void>;
}

const DEFAULT_HOSTNAME = "127.0.0.1";
const DEFAULT_PORT = 40973;
const DEFAULT_USERNAME = "opencode";

function createPassword(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createOpenCodeServeStartOptions(options: Required<Pick<OpenCodeServerRuntimeOptions, "cwd" | "hostname" | "port" | "username" | "password">> & Pick<OpenCodeServerRuntimeOptions, "bin">): AgentProcessStartOptions {
  return {
    command: options.bin || "opencode",
    args: ["serve", "--hostname", options.hostname, "--port", String(options.port)],
    cwd: options.cwd || null,
    env: {
      OPENCODE_SERVER_USERNAME: options.username,
      OPENCODE_SERVER_PASSWORD: options.password,
      OPENCODE_CLIENT: "mlfb-opencode-http",
    },
  };
}

export async function startOpenCodeServerRuntime(options: OpenCodeServerRuntimeOptions): Promise<OpenCodeServerRuntime> {
  const hostname = options.hostname || DEFAULT_HOSTNAME;
  const port = options.port || DEFAULT_PORT;
  const username = options.username || DEFAULT_USERNAME;
  const password = options.password || createPassword();
  const baseUrl = `http://${hostname}:${port}`;
  const startOptions = createOpenCodeServeStartOptions({
    cwd: options.cwd,
    bin: options.bin,
    hostname,
    port,
    username,
    password,
  });
  const processInfo = await invoke<AgentProcessInfo>("agent_process_start", { options: startOptions });
  const client = new OpenCodeHttpClient({ baseUrl, auth: { username, password }, directory: options.cwd });
  await waitForOpenCodeHealth(client, options.startupTimeoutMs || 30000);
  const runtimeInfo: OpenCodeRuntimeInfo = {
    processId: processInfo.processId,
    command: processInfo.command,
    args: processInfo.args,
    initialized: true,
    agentInfo: { name: "OpenCode" },
    baseUrl,
    username,
  };
  return {
    client,
    processInfo,
    runtimeInfo,
    stop: async () => {
      await invoke("agent_process_kill", { processId: processInfo.processId }).catch(() => undefined);
    },
  };
}

export async function waitForOpenCodeHealth(client: OpenCodeHttpClient, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const health = await client.health();
      if (health.healthy) return;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError instanceof Error ? lastError : new Error("OpenCode server health check timed out");
}
