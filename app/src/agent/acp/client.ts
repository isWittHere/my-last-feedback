import { invoke } from "@tauri-apps/api/core";
import { AcpLineBuffer } from "./lineBuffer";
import type { AgentProcessInfo, AgentProcessStartOptions, JsonRpcMessage, JsonRpcRequest, JsonRpcResponse } from "./types";

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export interface AcpClientHandlers {
  onDiagnostic?: (level: "info" | "warn" | "error", message: string) => void;
  onNotification?: (method: string, params: unknown) => void;
  onRequest?: (method: string, params: unknown) => unknown | Promise<unknown>;
  onExit?: (exitCode: number | null) => void;
}

export class AcpClient {
  private readonly handlers: AcpClientHandlers;
  private readonly lineBuffer = new AcpLineBuffer();
  private readonly pendingRequests = new Map<number | string, PendingRequest>();
  private processInfo: AgentProcessInfo | null = null;
  private nextId = 1;

  constructor(handlers: AcpClientHandlers = {}) {
    this.handlers = handlers;
  }

  get processId(): string | null {
    return this.processInfo?.processId || null;
  }

  get info(): AgentProcessInfo | null {
    return this.processInfo;
  }

  async start(options: AgentProcessStartOptions): Promise<AgentProcessInfo> {
    const info = await invoke<AgentProcessInfo>("agent_process_start", { options });
    this.processInfo = info;
    this.handlers.onDiagnostic?.("info", `Started ACP process: ${info.command} ${info.args.join(" ")}`.trim());
    return info;
  }

  async stop(): Promise<void> {
    const processId = this.processId;
    if (!processId) return;
    await invoke("agent_process_kill", { processId }).catch(() => undefined);
    this.dispose(new Error("ACP process stopped"));
  }

  async request<T = unknown>(method: string, params?: unknown, timeoutMs = 30000): Promise<T> {
    const id = this.nextId++;
    const message: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    const promise = new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`ACP request timed out: ${method}`));
      }, timeoutMs);
      this.pendingRequests.set(id, {
        method,
        resolve: (value) => resolve(value as T),
        reject,
        timeoutId,
      });
    });
    try {
      await this.send(message);
    } catch (error) {
      const pending = this.pendingRequests.get(id);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(id);
      }
      throw error;
    }
    return promise;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await this.send({ jsonrpc: "2.0", method, params });
  }

  handleStdout(data: string) {
    for (const line of this.lineBuffer.push(data)) {
      this.handleLine(line);
    }
  }

  handleStderr(data: string) {
    const message = data.trim();
    if (message) this.handlers.onDiagnostic?.("warn", message);
  }

  handleExit(exitCode: number | null) {
    this.handlers.onExit?.(exitCode);
    this.dispose(new Error(`ACP process exited${exitCode === null ? "" : ` with code ${exitCode}`}`));
  }

  handleError(message: string) {
    this.handlers.onDiagnostic?.("error", message);
  }

  private async send(message: JsonRpcMessage): Promise<void> {
    const processId = this.processId;
    if (!processId) throw new Error("ACP process is not started");
    await invoke("agent_process_write", {
      processId,
      data: `${JSON.stringify(message)}\n`,
    });
  }

  private handleLine(line: string) {
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch (error) {
      this.handlers.onDiagnostic?.("error", `Invalid ACP JSON line: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    if ("id" in message && ("result" in message || "error" in message)) {
      this.handleResponse(message as JsonRpcResponse);
      return;
    }

    if ("method" in message && "id" in message) {
      void this.handleRequest(message as JsonRpcRequest);
      return;
    }

    if ("method" in message) {
      this.handlers.onNotification?.(message.method, message.params);
    }
  }

  private handleResponse(response: JsonRpcResponse) {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      this.handlers.onDiagnostic?.("warn", `Received ACP response for unknown request id: ${String(response.id)}`);
      return;
    }
    this.pendingRequests.delete(response.id);
    clearTimeout(pending.timeoutId);
    if (response.error) {
      pending.reject(new Error(response.error.message || `ACP request failed: ${response.error.code}`));
    } else {
      this.handlers.onDiagnostic?.("info", `Received ACP response: ${pending.method}`);
      pending.resolve(response.result);
    }
  }

  private async handleRequest(request: JsonRpcRequest) {
    try {
      if (!this.handlers.onRequest) throw new Error(`ACP client method not implemented: ${request.method}`);
      const result = await this.handlers.onRequest(request.method, request.params);
      await this.send({ jsonrpc: "2.0", id: request.id, result });
    } catch (error) {
      await this.send({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32601,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private dispose(reason: Error) {
    this.lineBuffer.clear();
    this.processInfo = null;
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(reason);
    }
    this.pendingRequests.clear();
  }
}