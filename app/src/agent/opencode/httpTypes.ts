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
  attachment?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
    [key: string]: unknown;
  };
  capabilities?: {
    attachment?: boolean;
    input?: {
      text?: boolean;
      audio?: boolean;
      image?: boolean;
      video?: boolean;
      pdf?: boolean;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
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
export type OpenCodeFileDiffStatus = "added" | "deleted" | "modified";
export type OpenCodeVcsDiffMode = "git" | "branch";

export interface OpenCodePermissionRule {
  permission: string;
  pattern: string;
  action: OpenCodePermissionAction;
}

export interface OpenCodePermissionReplyRequest {
  response: OpenCodePermissionReply;
}

export interface OpenCodePermissionReplyBody {
  reply: OpenCodePermissionReply;
  message?: string;
}

export interface OpenCodePermissionToolRef {
  messageID?: string;
  callID?: string;
}

export interface OpenCodePermissionRequest {
  id: string;
  sessionID?: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
  tool?: OpenCodePermissionToolRef;
  [key: string]: unknown;
}

export interface OpenCodePermissionPatchFile {
  filePath: string;
  relativePath?: string;
  type?: "add" | "update" | "delete" | "move";
  patch: string;
  additions?: number;
  deletions?: number;
  movePath?: string;
}

export interface OpenCodeFileDiff {
  file: string;
  patch: string;
  additions: number;
  deletions: number;
  status?: OpenCodeFileDiffStatus;
}

export interface OpenCodeVcsInfo {
  branch?: string;
  default_branch?: string;
}

export interface OpenCodeSummarizeRequest {
  providerID: string;
  modelID: string;
  auto?: boolean;
}

export interface OpenCodePromptTextPart {
  id?: string;
  type: "text";
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
}

export interface OpenCodeFilePart {
  id?: string;
  type: "file";
  mime: string;
  url: string;
  filename?: string;
  source?: unknown;
}

export type OpenCodePromptPart = OpenCodePromptTextPart | OpenCodeFilePart;

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
  messageID?: string;
  parts: OpenCodePromptPart[];
  model?: OpenCodePromptModel;
  agent?: string;
}

export interface OpenCodeForkRequest {
  messageID: string;
}

export type OpenCodeCommandFilePart = OpenCodeFilePart;

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
