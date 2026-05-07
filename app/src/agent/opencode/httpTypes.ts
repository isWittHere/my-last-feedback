import type { AgentProviderRuntimeInfo } from "../types";

export interface OpenCodeAuthOptions {
  username: string;
  password: string;
}

export interface OpenCodeHttpClientOptions {
  baseUrl: string;
  auth: OpenCodeAuthOptions;
  directory?: string;
}

export interface OpenCodeRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  accept?: string;
  signal?: AbortSignal;
}

export interface OpenCodeHealthResponse {
  healthy: boolean;
  version?: string;
}

export interface OpenCodeSessionTime {
  created?: number;
  updated?: number;
}

export interface OpenCodeSessionInfo {
  id: string;
  slug?: string;
  version?: string;
  projectID?: string;
  directory?: string;
  path?: string;
  title?: string;
  time?: OpenCodeSessionTime;
  permission?: OpenCodePermissionRule[];
  [key: string]: unknown;
}

export type OpenCodeSessionStatusMap = Record<string, string>;

export interface OpenCodeProviderModel {
  id: string;
  name?: string;
  status?: string;
  context?: number;
  cost?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenCodeProviderInfo {
  id: string;
  name?: string;
  models?: Record<string, OpenCodeProviderModel>;
  [key: string]: unknown;
}

export interface OpenCodeProviderResponse {
  all?: OpenCodeProviderInfo[];
  connected?: string[];
  [key: string]: unknown;
}

export interface OpenCodeAgentInfo {
  name: string;
  description?: string;
  mode?: "subagent" | "primary" | "all";
  builtIn?: boolean;
  native?: boolean;
  hidden?: boolean;
  model?: OpenCodePromptModel;
  [key: string]: unknown;
}

export type OpenCodeCommandSource = "command" | "mcp" | "skill";

export interface OpenCodeCommandInfo {
  name: string;
  description?: string;
  agent?: string;
  model?: string;
  source?: OpenCodeCommandSource;
  subtask?: boolean;
  hints?: string[];
  [key: string]: unknown;
}

export type OpenCodePermissionAction = "allow" | "deny" | "ask";
export type OpenCodePermissionReply = "once" | "always" | "reject";

export interface OpenCodePermissionRule {
  permission: string;
  pattern: string;
  action: OpenCodePermissionAction;
}

export interface OpenCodePermissionReplyRequest {
  response: OpenCodePermissionReply;
}

export interface OpenCodePromptPart {
  type: "text";
  text: string;
}

export interface OpenCodePromptModel {
  providerID: string;
  modelID: string;
}

export interface OpenCodeMessageTokens {
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: {
    read?: number;
    write?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface OpenCodePromptRequest {
  parts: OpenCodePromptPart[];
  model?: OpenCodePromptModel;
  agent?: string;
}

export interface OpenCodeCommandFilePart {
  id?: string;
  type: "file";
  mime: string;
  url: string;
  filename?: string;
  source?: unknown;
}

export interface OpenCodeCommandRequest {
  command: string;
  arguments: string;
  agent?: string;
  model?: string;
  variant?: string;
  messageID?: string;
  parts?: OpenCodeCommandFilePart[];
}

export interface OpenCodeMessageInfo {
  id: string;
  sessionID?: string;
  parentID?: string;
  role?: "user" | "assistant" | "system";
  model?: OpenCodePromptModel;
  modelID?: string;
  providerID?: string;
  mode?: string;
  agent?: string;
  cost?: number;
  tokens?: OpenCodeMessageTokens;
  finish?: string;
  time?: {
    created?: number;
    completed?: number;
    [key: string]: unknown;
  };
  error?: OpenCodeErrorInfo;
  [key: string]: unknown;
}

export type OpenCodeMessagePart = Record<string, unknown> & {
  id?: string;
  type?: string;
  sessionID?: string;
  messageID?: string;
};

export interface OpenCodeMessage {
  info?: OpenCodeMessageInfo;
  parts?: OpenCodeMessagePart[];
  [key: string]: unknown;
}

export interface OpenCodeTodoItem {
  id?: string;
  title?: string;
  content?: string;
  status?: string;
  priority?: string;
  [key: string]: unknown;
}

export interface OpenCodeErrorInfo {
  name?: string;
  message?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenCodeBusEvent<TProperties = Record<string, unknown>> {
  type: string;
  properties: TProperties;
  raw: unknown;
}

export interface OpenCodeSseCollectorHandlers {
  onEvent?: (event: OpenCodeBusEvent) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface OpenCodeRuntimeInfo extends AgentProviderRuntimeInfo {
  baseUrl: string;
  username: string;
  processId?: string;
}
