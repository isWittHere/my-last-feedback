import type { GitAction, ImageAttachment, MlcAttachment, WebAttachment } from "../store/feedbackStore";

export type AgentProviderId = "opencode";

export type AgentSessionStatus = "idle" | "starting" | "running" | "cancelling" | "disconnected" | "error";
export type AgentProviderSessionState = "provisional" | "active" | "restored";

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
  staleRunningState?: boolean;
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

export interface AgentCompactionBlock extends AgentBlockBase {
  type: "compaction";
  status: "running" | "completed" | "failed";
  auto?: boolean;
  overflow?: boolean;
  content?: string;
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
  permission?: string;
  title: string;
  patterns?: string[];
  metadata?: Record<string, unknown>;
  toolCallId?: string;
  status: "pending" | "resolved";
  options: AgentPermissionOption[];
  selectedOptionId?: string;
}

export interface AgentTaskItem {
  id: string;
  title: string;
  status: "not-started" | "in-progress" | "completed";
  priority?: "high" | "medium" | "low";
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
  | AgentCompactionBlock
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
  providerMessageId?: string;
  providerMessageIds?: string[];
  providerParentMessageId?: string;
  providerParts?: AgentProviderMessagePart[];
  composerDraft?: string;
  submittedMarkdown?: string;
  submittedAttachmentTags?: AgentSubmittedAttachmentTag[];
  createdAt: string;
  updatedAt?: string;
}

export type AgentSubmittedAttachmentKind = "image" | "test-log" | "git" | "mlc" | "web" | "resource";

export interface AgentSubmittedAttachmentTag {
  id: string;
  kind: AgentSubmittedAttachmentKind;
  label?: string;
  detail?: string;
}

export interface AgentProviderMessagePart {
  id?: string;
  type?: string;
  text?: string;
  synthetic?: boolean;
  ignored?: boolean;
}

export interface AgentDiagnosticEntry {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
  createdAt: string;
}

export type AgentOpenCodePermissionAction = "allow" | "ask" | "deny";

export interface AgentOpenCodePermissionRule {
  permission: string;
  pattern: string;
  action: AgentOpenCodePermissionAction;
}

export interface AgentProviderRuntimeInfo {
  transport?: "http";
  processId?: string;
  command?: string;
  args?: string[];
  baseUrl?: string;
  username?: string;
  initialized?: boolean;
  protocolVersion?: number | string;
  agentInfo?: {
    name?: string;
    version?: string;
  };
  agentCapabilities?: Record<string, unknown>;
  authMethods?: unknown[];
}

export interface AgentModelInputCapabilities {
  text?: boolean;
  audio?: boolean;
  image?: boolean;
  video?: boolean;
  pdf?: boolean;
}

export interface AgentModelCapabilities {
  attachment?: boolean;
  input?: AgentModelInputCapabilities;
}

export interface AgentChoiceOption {
  id: string;
  label: string;
  description?: string;
  contextLimit?: number;
  capabilities?: AgentModelCapabilities;
}

export interface AgentContextUsage {
  usedTokens: number;
  contextLimit: number;
  cost?: {
    amount?: number;
    currency?: string;
  };
  updatedAt: string;
}

export interface AgentSession {
  id: string;
  providerId: AgentProviderId;
  providerSessionId?: string;
  providerSessionState?: AgentProviderSessionState;
  providerRuntime?: AgentProviderRuntimeInfo;
  title: string;
  cwd: string;
  modelId?: string;
  modeId?: string;
  availableModels?: AgentChoiceOption[];
  availableModes?: AgentChoiceOption[];
  availableCommands?: AgentChoiceOption[];
  contextUsage?: AgentContextUsage;
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
  openCodePermissionRules?: AgentOpenCodePermissionRule[];
  openCodePermissionUpdating?: boolean;
  openCodePermissionError?: string;
  sessionDiffs?: AgentSessionFileDiff[];
  sessionDiffLoading?: boolean;
  sessionDiffError?: string;
  compacting?: boolean;
  compactError?: string;
  draftSource?: {
    kind: "fork";
    sourceSessionId: string;
    sourceMessageId: string;
  };
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

export interface AgentSessionFileDiff {
  file: string;
  patch: string;
  additions: number;
  deletions: number;
  status?: "added" | "deleted" | "modified";
}