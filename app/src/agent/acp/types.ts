export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: JsonRpcErrorObject;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

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

export interface AcpInitializeResult {
  protocolVersion?: number | string;
  agentCapabilities?: Record<string, unknown>;
  authMethods?: unknown[];
  agentInfo?: {
    name?: string;
    version?: string;
  };
  [key: string]: unknown;
}

export interface AcpModelInfo {
  modelId: string;
  name: string;
  description?: string | null;
}

export interface AcpModeInfo {
  id: string;
  name: string;
  description?: string | null;
}

export interface AcpSessionModelState {
  currentModelId?: string;
  availableModels?: AcpModelInfo[] | null;
}

export interface AcpSessionModeState {
  currentModeId?: string;
  availableModes?: AcpModeInfo[] | null;
}

export interface AcpNewSessionResult {
  sessionId: string;
  models?: AcpSessionModelState | null;
  modes?: AcpSessionModeState | null;
  configOptions?: unknown[] | null;
  [key: string]: unknown;
}

export interface AcpSessionListItem {
  sessionId: string;
  cwd?: string | null;
  title?: string | null;
  updatedAt?: string | null;
  _meta?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface AcpSessionListResult {
  sessions?: AcpSessionListItem[] | null;
  nextCursor?: string | null;
  [key: string]: unknown;
}