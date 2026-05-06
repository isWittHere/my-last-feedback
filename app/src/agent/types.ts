import type { GitAction, ImageAttachment, MlcAttachment, WebAttachment } from "../store/feedbackStore";

export type AgentProviderId = "opencode";

export type AgentSessionStatus = "idle" | "starting" | "running" | "cancelling" | "disconnected" | "error";

export type AgentBlockPhase = "process" | "result";
export type AgentBlockPlacement = "inline" | "standalone";

export interface AgentBlockOrigin {
  phase: AgentBlockPhase;
  placement: AgentBlockPlacement;
  group_id?: string;
  groupId?: string;
}

export interface AgentBlockBase {
  id: string;
  origin: AgentBlockOrigin;
  createdAt: string;
  updatedAt?: string;
}

export interface AgentTextBlock extends AgentBlockBase {
  type: "text";
  content: string;
}

export interface AgentThinkingBlock extends AgentBlockBase {
  type: "thinking";
  content: string;
  status?: "running" | "completed";
}

export interface AgentToolCallBlock extends AgentBlockBase {
  type: "tool_call";
  name: string;
  title?: string;
  label?: string;
  status?: "pending" | "running" | "completed" | "failed";
  args?: Record<string, unknown>;
  result?: string;
}

export interface AgentPermissionOption {
  id: string;
  label: string;
  kind: "allow_once" | "allow_session" | "allow_always" | "reject_once";
}

export interface AgentPermissionBlock extends AgentBlockBase {
  type: "permission";
  requestId: string;
  title: string;
  toolCallId?: string;
  status: "pending" | "resolved";
  options: AgentPermissionOption[];
  selectedOptionId?: string;
}

export interface AgentTaskItem {
  id: string;
  title: string;
  status: "not-started" | "in-progress" | "completed";
}

export interface AgentTaskListBlock extends AgentBlockBase {
  type: "task_list";
  title?: string;
  tasks: AgentTaskItem[];
}

export interface AgentFileChangeBlock extends AgentBlockBase {
  type: "file_change";
  path: string;
  changeType: "create" | "edit" | "delete";
  status: "pending" | "applied" | "failed";
  summary?: string;
}

export interface AgentArtifactBlock extends AgentBlockBase {
  type: "artifact";
  title: string;
  kind: "markdown" | "diff" | "log" | "other";
  content: string;
}

export interface AgentCitationBlock extends AgentBlockBase {
  type: "citation";
  sources: Array<{ title: string; uri: string }>;
}

export interface AgentErrorBlock extends AgentBlockBase {
  type: "error";
  message: string;
  detail?: string;
}

export type AgentContentBlock =
  | AgentTextBlock
  | AgentThinkingBlock
  | AgentToolCallBlock
  | AgentPermissionBlock
  | AgentTaskListBlock
  | AgentFileChangeBlock
  | AgentArtifactBlock
  | AgentCitationBlock
  | AgentErrorBlock;

export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system";
  blocks: AgentContentBlock[];
  status: "streaming" | "complete" | "error";
  modelId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AgentDiagnosticEntry {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
  createdAt: string;
}

export interface AgentProviderRuntimeInfo {
  processId?: string;
  command?: string;
  args?: string[];
  initialized?: boolean;
  protocolVersion?: number | string;
  agentInfo?: {
    name?: string;
    version?: string;
  };
  agentCapabilities?: Record<string, unknown>;
  authMethods?: unknown[];
}

export interface AgentChoiceOption {
  id: string;
  label: string;
  description?: string;
}

export interface AgentSession {
  id: string;
  providerId: AgentProviderId;
  providerSessionId?: string;
  providerRuntime?: AgentProviderRuntimeInfo;
  title: string;
  cwd: string;
  modelId?: string;
  modeId?: string;
  availableModels?: AgentChoiceOption[];
  availableModes?: AgentChoiceOption[];
  configOptions?: unknown[];
  status: AgentSessionStatus;
  draft: string;
  testLogText: string;
  gitAction: GitAction | null;
  images: ImageAttachment[];
  mlcAttachments: MlcAttachment[];
  webAttachments: WebAttachment[];
  messages: AgentMessage[];
  pendingPermissionIds: string[];
  diagnostics: AgentDiagnosticEntry[];
  createdAt: string;
  updatedAt: string;
}

export type AgentProcessStepKind = "thinking" | "tool" | "permission" | "task_list" | "file_change" | "artifact" | "error";

export interface AgentProcessStep {
  id: string;
  kind: AgentProcessStepKind;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  summary?: string;
  blocks: AgentContentBlock[];
  startedAt?: string;
  endedAt?: string;
}