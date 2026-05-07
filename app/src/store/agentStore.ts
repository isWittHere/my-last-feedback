import { create } from "zustand";
import { hasAgentComposerContent } from "../agent/composer";
import { normalizeOpenCodeEvent, normalizeOpenCodePart, normalizeOpenCodeTodos, startOpenCodeServerRuntime } from "../agent/opencode";
import type { OpenCodeAgentInfo, OpenCodeBusEvent, OpenCodeCommandFilePart, OpenCodeCommandInfo, OpenCodeMessage, OpenCodeMessageInfo, OpenCodeMessagePart, OpenCodePermissionReply, OpenCodePermissionRule, OpenCodeProviderResponse, OpenCodeServerRuntime, OpenCodeSessionInfo, OpenCodeSseConnection } from "../agent/opencode";
import { createAgentSession } from "../agent/sessionFactory";
import { buildSubmittedComposerPayload } from "../composer/submittedFeedback";
import { getAgentConsoleSettings } from "../agentConsoleSettings";
import { setOpenCodePreferredModel, syncOpenCodeModels } from "../openCodeSettings";
import type { AgentChoiceOption, AgentContentBlock, AgentContextUsage, AgentDiagnosticEntry, AgentMessage, AgentProviderMessagePart, AgentSession, AgentSessionFileDiff } from "../agent/types";
import type { AgentProviderId } from "../agent/types";
import type { GitAction, ImageAttachment, MlcAttachment, WebAttachment } from "./feedbackStore";

export interface AgentProviderSessionListState {
  providerId: AgentProviderId;
  status: "idle" | "loading" | "ready" | "error" | "unsupported";
  capability: "supported" | "unsupported" | "unknown";
  sessions: AgentProviderSessionItem[];
  nextCursor?: string | null;
  error?: string;
  updatedAt?: string;
}

export interface AgentProviderSessionItem {
  sessionId: string;
  cwd?: string | null;
  title?: string | null;
  updatedAt?: string | null;
  _meta?: Record<string, unknown> | null;
  [key: string]: unknown;
}

interface AgentOpenCodeHttpRuntimeEntry {
  sessionId: string;
  runtime: OpenCodeServerRuntime;
  events: OpenCodeSseConnection;
}

const openCodeHttpRuntimes = new Map<string, AgentOpenCodeHttpRuntimeEntry>();
const STREAM_FLUSH_INTERVAL_MS = 40;
const STREAM_DRAIN_INTERVAL_MS = 16;
const STREAM_RATE_WINDOW_MS = 900;
const STREAM_RATE_MULTIPLIER = 1.35;
const STREAM_BASE_CHARS_PER_TICK = 16;
const STREAM_MAX_CHARS_PER_TICK = 160;
const STREAM_DRAIN_TICK_TARGET = 4;
const STREAM_DRAIN_MIN_CHARS_PER_TICK = 160;
const STREAM_DRAIN_MAX_CHARS_PER_TICK = 1400;

interface PacedTextBuffer {
  sessionId: string;
  phase: "process" | "result";
  messageId?: string;
  partId?: string;
  pending: string;
  draining: boolean;
  inputWindowStartedAt: number;
  inputCharsInWindow: number;
  lastInputAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  waiters: Array<() => void>;
}

const pacedTextBuffers = new Map<string, PacedTextBuffer>();

interface AgentStoreState {
  sessions: AgentSession[];
  activeSessionId: string | null;
  providerSessionLists: Partial<Record<AgentProviderId, AgentProviderSessionListState>>;
  getActiveSession: () => AgentSession | null;
  createNewSession: (options?: { cwd?: string | null }) => string;
  setActiveSession: (sessionId: string) => void;
  setSessionMode: (sessionId: string, modeId: string) => void;
  setSessionModel: (sessionId: string, modelId: string) => void;
  addImage: (sessionId: string, image: ImageAttachment) => void;
  removeImage: (sessionId: string, imagePath: string) => void;
  clearImages: (sessionId: string) => void;
  addMlcAttachment: (sessionId: string, attachment: MlcAttachment) => void;
  removeMlcAttachment: (sessionId: string, filePath: string) => void;
  clearMlcAttachments: (sessionId: string) => void;
  addWebAttachment: (sessionId: string, attachment: WebAttachment) => void;
  removeWebAttachment: (sessionId: string, attachmentId: string) => void;
  clearWebAttachments: (sessionId: string) => void;
  updateTestLog: (sessionId: string, text: string) => void;
  setGitAction: (sessionId: string, action: GitAction | null) => void;
  updateGitBranchName: (sessionId: string, branchName: string) => void;
  updateDraft: (sessionId: string, draft: string) => void;
  appendAgentDiagnostic: (sessionId: string, level: AgentDiagnosticEntry["level"], message: string) => void;
  startOpenCodeProvider: (sessionId: string) => Promise<void>;
  stopOpenCodeProvider: (sessionId: string) => Promise<void>;
  receiveAgentProcessOutput: (processId: string, data: string) => void;
  receiveAgentProcessStderr: (processId: string, data: string) => void;
  receiveAgentProcessExit: (processId: string, exitCode: number | null) => void;
  receiveAgentProcessError: (processId: string, message: string) => void;
  sendAgentPrompt: (sessionId: string) => Promise<void>;
  abortAgentPrompt: (sessionId: string) => Promise<void>;
  editAgentMessage: (sessionId: string, messageId: string) => Promise<void>;
  restoreAgentRevertedMessage: (sessionId: string, messageId: string) => Promise<void>;
  forkAgentSessionFromMessage: (sessionId: string, messageId: string) => Promise<void>;
  refreshProviderSessions: (providerId: AgentProviderId, cursor?: string | null) => Promise<void>;
  restoreProviderSession: (providerId: AgentProviderId, providerSessionId: string) => Promise<void>;
  renameProviderSession: (providerId: AgentProviderId, providerSessionId: string, title: string) => Promise<void>;
  deleteProviderSession: (providerId: AgentProviderId, providerSessionId: string) => Promise<void>;
  resolveAgentPermission: (sessionId: string, requestId: string, optionId: string) => void;
  refreshAgentSessionDiff: (sessionId: string) => Promise<void>;
  compactAgentSession: (sessionId: string) => Promise<void>;
  cleanupEmptySessions: () => Promise<number>;
  resetAgentSession: () => void;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

function newOpenCodeId(prefix: "msg" | "prt"): string {
  return `${prefix}_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function textBlock(content: string, phase: "process" | "result" = "result"): AgentContentBlock {
  return {
    id: newId("agent_text"),
    type: "text",
    content,
    origin: { phase, placement: "standalone" },
    createdAt: nowIso(),
  };
}

function createUserMessage(content: string, options: Partial<Pick<AgentMessage, "id" | "providerMessageId" | "providerParts" | "composerDraft">> = {}): AgentMessage {
  return {
    id: options.id || newId("agent_user_msg"),
    role: "user",
    status: "complete",
    blocks: [textBlock(content)],
    providerMessageId: options.providerMessageId || options.id,
    providerParts: options.providerParts,
    composerDraft: options.composerDraft,
    createdAt: nowIso(),
  };
}

function createStreamingAssistantMessage(messageId?: string): AgentMessage {
  return {
    id: messageId || newId("agent_assistant_msg"),
    role: "assistant",
    status: "streaming",
    blocks: [],
    createdAt: nowIso(),
  };
}

function createDiagnostic(level: AgentDiagnosticEntry["level"], message: string): AgentDiagnosticEntry {
  return {
    id: newId("agent_diag"),
    level,
    message,
    createdAt: nowIso(),
  };
}

function appendDiagnosticToSession(session: AgentSession, level: AgentDiagnosticEntry["level"], message: string): AgentSession {
  return {
    ...session,
    diagnostics: [...session.diagnostics, createDiagnostic(level, message)].slice(-80),
    updatedAt: nowIso(),
  };
}

function finitePositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function extractModelContextLimit(model: unknown): number | undefined {
  if (!model || typeof model !== "object") return undefined;
  const value = model as Record<string, unknown>;
  const meta = value._meta && typeof value._meta === "object" ? value._meta as Record<string, unknown> : undefined;
  const limit = value.limit && typeof value.limit === "object" ? value.limit as Record<string, unknown> : undefined;
  const metaLimit = meta?.limit && typeof meta.limit === "object" ? meta.limit as Record<string, unknown> : undefined;
  return finitePositiveNumber(value.contextLimit)
    ?? finitePositiveNumber(value.context)
    ?? finitePositiveNumber(value.maxInputTokens)
    ?? finitePositiveNumber(value.max_input_tokens)
    ?? finitePositiveNumber(limit?.context)
    ?? finitePositiveNumber(meta?.contextLimit)
    ?? finitePositiveNumber(meta?.context)
    ?? finitePositiveNumber(meta?.maxInputTokens)
    ?? finitePositiveNumber(meta?.max_input_tokens)
    ?? finitePositiveNumber(metaLimit?.context);
}

function toChoiceOption(id: unknown, label: unknown, description: unknown, source?: unknown): AgentChoiceOption | null {
  if (typeof id !== "string" || !id) return null;
  return {
    id,
    label: typeof label === "string" && label ? label : id,
    description: typeof description === "string" && description ? description : undefined,
    contextLimit: extractModelContextLimit(source),
  };
}

function openCodeHttpRuntimeForSession(session: AgentSession | null | undefined, sessions: AgentSession[] = []): AgentOpenCodeHttpRuntimeEntry | null {
  const processId = session?.providerRuntime?.transport === "http" ? session.providerRuntime.processId : undefined;
  if (processId) return openCodeHttpRuntimes.get(processId) || null;
  if (!session) return null;
  const providerRuntimeSession = sessions.find((item) => item.providerId === session.providerId && item.providerRuntime?.transport === "http" && item.providerRuntime.processId && item.providerRuntime.initialized);
  const providerProcessId = providerRuntimeSession?.providerRuntime?.processId;
  return providerProcessId ? openCodeHttpRuntimes.get(providerProcessId) || null : null;
}

function createOpenCodeHttpPort(): number {
  return 41000 + Math.floor(Math.random() * 12000);
}

function openCodeReadOnlyPermissionRules(): OpenCodePermissionRule[] {
  return [
    { permission: "glob", pattern: "*", action: "allow" },
    { permission: "grep", pattern: "*", action: "allow" },
    { permission: "read", pattern: "*", action: "allow" },
    { permission: "list", pattern: "*", action: "allow" },
    { permission: "external_directory", pattern: "*", action: "deny" },
    { permission: "edit", pattern: "*", action: "ask" },
    { permission: "bash", pattern: "*", action: "deny" },
  ];
}

function normalizeOpenCodeFileDiffs(diff: unknown[]): AgentSessionFileDiff[] {
  return diff
    .map((item) => (typeof item === "object" && item !== null ? item as Record<string, unknown> : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const file = typeof item.file === "string" ? item.file : "";
      const patch = typeof item.patch === "string" ? item.patch : "";
      const additions = typeof item.additions === "number" ? item.additions : 0;
      const deletions = typeof item.deletions === "number" ? item.deletions : 0;
      const status = item.status;
      return {
        file,
        patch,
        additions,
        deletions,
        ...(status === "added" || status === "deleted" || status === "modified" ? { status } : {}),
      };
    })
    .filter((item) => item.file);
}

function choicesFromOpenCodeProviders(providerData: OpenCodeProviderResponse): AgentChoiceOption[] {
  const connected = new Set(providerData.connected || []);
  const providers = Array.isArray(providerData.all) ? providerData.all : [];
  return providers.flatMap((provider) => {
    if (connected.size > 0 && !connected.has(provider.id)) return [];
    return Object.values(provider.models || {})
      .filter((model) => !model.status || model.status === "active")
      .map((model) => toChoiceOption(`${provider.id}/${model.id}`, model.name || model.id, provider.name, model))
      .filter((option): option is AgentChoiceOption => Boolean(option));
  });
}

function choicesFromOpenCodeAgents(agents: OpenCodeAgentInfo[]): AgentChoiceOption[] {
  const visiblePrimaryAgents = agents.filter((agent) => !agent.hidden && (agent.mode === "primary" || agent.mode === "all"));
  const visibleAgents = visiblePrimaryAgents.length > 0 ? visiblePrimaryAgents : agents.filter((agent) => !agent.hidden);
  return visibleAgents
    .map((agent) => toChoiceOption(agent.name, agent.name, agent.description, agent))
    .filter((option): option is AgentChoiceOption => Boolean(option));
}

function choicesFromOpenCodeCommands(commands: OpenCodeCommandInfo[]): AgentChoiceOption[] {
  return commands
    .filter((command) => command.name)
    .map((command) => ({
      id: command.name,
      label: command.name,
      description: [command.description, command.source ? `source: ${command.source}` : undefined].filter(Boolean).join(" · "),
    }));
}

function fallbackOpenCodeAgentChoices(): AgentChoiceOption[] {
  return [
    { id: "build", label: "build", description: "The default OpenCode agent." },
    { id: "plan", label: "plan", description: "Plan mode with edit tools disabled." },
  ];
}

function selectOpenCodeAgentMode(currentModeId: string | undefined, availableModes: AgentChoiceOption[]): string | undefined {
  if (currentModeId && availableModes.some((mode) => mode.id === currentModeId)) return currentModeId;
  return availableModes.find((mode) => mode.id === "build")?.id || availableModes[0]?.id;
}

function openCodeModelFromSession(session: AgentSession): { providerID: string; modelID: string } | undefined {
  if (!session.modelId) return undefined;
  const [providerID, ...modelParts] = session.modelId.split("/");
  const modelID = modelParts.join("/");
  return providerID && modelID ? { providerID, modelID } : undefined;
}

function openCodeCommandModelFromSession(session: AgentSession): string | undefined {
  const model = openCodeModelFromSession(session);
  return model ? `${model.providerID}/${model.modelID}` : undefined;
}

function parseOpenCodeSlashCommandDraft(text: string): { name: string; arguments: string } | null {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("/")) return null;
  const firstWhitespaceIndex = trimmed.search(/\s/);
  const rawName = firstWhitespaceIndex === -1 ? trimmed.slice(1) : trimmed.slice(1, firstWhitespaceIndex);
  const name = rawName.trim();
  if (!name) return null;
  return {
    name,
    arguments: firstWhitespaceIndex === -1 ? "" : trimmed.slice(firstWhitespaceIndex).trimStart(),
  };
}

function findOpenCodeCommand(session: AgentSession, name: string): AgentChoiceOption | undefined {
  const normalized = name.toLowerCase();
  return (session.availableCommands || []).find((command) => command.id.toLowerCase() === normalized);
}

function openCodeCommandFilePartsFromSession(session: AgentSession): OpenCodeCommandFilePart[] {
  return session.images
    .filter((image) => Boolean(image.dataUrl))
    .map((image) => ({
      type: "file",
      mime: /^data:([^;,]+)/.exec(image.dataUrl || "")?.[1] || "image/png",
      url: image.dataUrl || "",
      filename: image.name,
    }));
}

function openCodeModelIdFromInfo(info: OpenCodeMessageInfo | undefined): string | undefined {
  if (!info) return undefined;
  if (info.model?.providerID && info.model.modelID) return `${info.model.providerID}/${info.model.modelID}`;
  return [info.providerID, info.modelID].filter(Boolean).join("/") || undefined;
}

function openCodeSelectionFromMessages(messages: OpenCodeMessage[]): { modelId?: string; modeId?: string } {
  const selection: { modelId?: string; modeId?: string } = {};
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const info = messages[index].info;
    if (!info) continue;
    selection.modelId ||= openCodeModelIdFromInfo(info);
    selection.modeId ||= typeof info.agent === "string" && info.agent ? info.agent : typeof info.mode === "string" && info.mode ? info.mode : undefined;
    if (selection.modelId && selection.modeId) break;
  }
  return selection;
}

function contextLimitForModel(availableModels: AgentChoiceOption[] | undefined, modelId: string | undefined): number | undefined {
  if (!modelId) return undefined;
  return availableModels?.find((model) => model.id === modelId)?.contextLimit;
}

function openCodeMessageUsedTokens(info: OpenCodeMessageInfo | undefined): number | undefined {
  const tokens = info?.tokens;
  if (!tokens) return undefined;
  const input = finitePositiveNumber(tokens.input) ?? 0;
  const output = finitePositiveNumber(tokens.output) ?? 0;
  const reasoning = finitePositiveNumber(tokens.reasoning) ?? 0;
  const cacheRead = finitePositiveNumber(tokens.cache?.read) ?? 0;
  const cacheWrite = finitePositiveNumber(tokens.cache?.write) ?? 0;
  const contextUsed = input + cacheRead;
  const totalUsed = input + output + reasoning + cacheRead + cacheWrite;
  return contextUsed > 0 ? contextUsed : totalUsed > 0 ? totalUsed : undefined;
}

function openCodeContextUsageFromInfo(info: OpenCodeMessageInfo | undefined, contextLimit: number | undefined, costAmount?: number): AgentContextUsage | undefined {
  const usedTokens = openCodeMessageUsedTokens(info);
  if (!usedTokens || !contextLimit) return undefined;
  return {
    usedTokens,
    contextLimit,
    ...(costAmount !== undefined && costAmount > 0 ? { cost: { amount: costAmount, currency: "USD" } } : {}),
    updatedAt: nowIso(),
  };
}

function openCodeContextUsageFromMessages(messages: OpenCodeMessage[], contextLimit: number | undefined): AgentContextUsage | undefined {
  const assistantMessages = messages.filter((message) => message.info?.role === "assistant");
  const lastAssistantWithUsage = [...assistantMessages].reverse().find((message) => openCodeMessageUsedTokens(message.info) !== undefined);
  const totalCost = assistantMessages.reduce((sum, message) => sum + (finitePositiveNumber(message.info?.cost) ?? 0), 0);
  return openCodeContextUsageFromInfo(lastAssistantWithUsage?.info, contextLimit, totalCost);
}

function summarizeOpenCodeParts(parts: OpenCodeMessagePart[] | undefined): AgentProviderMessagePart[] {
  return (parts || []).map((part) => ({
    id: typeof part.id === "string" ? part.id : undefined,
    type: typeof part.type === "string" ? part.type : undefined,
    text: typeof part.text === "string" ? part.text : undefined,
    synthetic: part.synthetic === true,
    ignored: part.ignored === true,
  }));
}

function promptDraftFromProviderParts(parts: AgentProviderMessagePart[] | undefined): string {
  return (parts || [])
    .filter((part) => part.type === "text" && !part.synthetic && !part.ignored && typeof part.text === "string")
    .map((part) => part.text || "")
    .join("\n\n")
    .trim();
}

function messageDraftText(message: AgentMessage): string {
  const draft = message.composerDraft?.trim();
  if (draft) return draft;
  const providerDraft = promptDraftFromProviderParts(message.providerParts);
  if (providerDraft) return providerDraft;
  return message.blocks
    .map((block) => block.type === "text" ? block.content : "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function messageProviderId(message: AgentMessage): string {
  return message.providerMessageId || message.id;
}

function revertStateFromOpenCodeSession(session: OpenCodeSessionInfo | undefined): AgentSession["revert"] {
  const messageId = session?.revert?.messageID;
  if (!messageId) return undefined;
  return {
    messageId,
    partId: session.revert?.partID,
    diff: normalizeOpenCodeFileDiffs(session.revert?.diff || []),
  };
}

function agentMessagesFromOpenCodeMessages(messages: OpenCodeMessage[]): AgentMessage[] {
  const mappedMessages = messages.map((message) => {
    const updatedTime = typeof message.info?.time?.updated === "number" ? message.info.time.updated : null;
    const messageStatus = message.info?.time?.completed || message.info?.status === "complete" ? "complete" : message.info?.status === "error" ? "error" : "complete";
    const blocks = (message.parts || [])
      .map((part) => normalizeOpenCodePart(part))
      .filter((block): block is AgentContentBlock => Boolean(block))
      .filter((block) => block.type !== "text" || Boolean(block.content.trim()))
      .map((block) => messageStatus === "complete" && (block.type === "thinking" || block.type === "compaction") ? { ...block, status: "completed" as const, updatedAt: block.updatedAt || nowIso() } : block);
    const isCompactionOnlyMessage = blocks.length > 0 && blocks.every((block) => block.type === "compaction");
    const role = message.info?.role === "user" && !isCompactionOnlyMessage ? "user" : "assistant";
    const providerParts = summarizeOpenCodeParts(message.parts);
    return {
      id: message.info?.id || newId("msg"),
      role,
      status: messageStatus,
      blocks,
      providerMessageId: message.info?.id,
      providerParentMessageId: message.info?.parentID,
      providerParts,
      composerDraft: role === "user" ? promptDraftFromProviderParts(providerParts) : undefined,
      modelId: openCodeModelIdFromInfo(message.info),
      createdAt: message.info?.time?.created ? new Date(message.info.time.created).toISOString() : nowIso(),
      updatedAt: updatedTime ? new Date(updatedTime).toISOString() : nowIso(),
    } satisfies AgentMessage;
  });
  return mergeContiguousAssistantMessages(mappedMessages);
}

function mergeMessageStatus(current: AgentMessage["status"], next: AgentMessage["status"]): AgentMessage["status"] {
  if (current === "error" || next === "error") return "error";
  if (current === "streaming" || next === "streaming") return "streaming";
  return "complete";
}

function latestIso(current?: string, next?: string): string | undefined {
  if (!current) return next;
  if (!next) return current;
  return new Date(next).getTime() > new Date(current).getTime() ? next : current;
}

function mergeContiguousAssistantMessages(messages: AgentMessage[]): AgentMessage[] {
  const merged: AgentMessage[] = [];
  for (const message of messages) {
    const previous = merged[merged.length - 1];
    if (message.role === "assistant" && previous?.role === "assistant") {
      merged[merged.length - 1] = {
        ...previous,
        blocks: [...previous.blocks, ...message.blocks],
        status: mergeMessageStatus(previous.status, message.status),
        modelId: previous.modelId || message.modelId,
        updatedAt: latestIso(previous.updatedAt || previous.createdAt, message.updatedAt || message.createdAt),
      };
      continue;
    }
    merged.push(message);
  }
  return merged;
}

function cleanupRevertedMessagesForSubmit(session: AgentSession): AgentSession {
  const revertMessageId = session.revert?.messageId;
  if (!revertMessageId) return session;
  const revertIndex = session.messages.findIndex((message) => messageProviderId(message) === revertMessageId);
  return {
    ...session,
    messages: revertIndex >= 0 ? session.messages.slice(0, revertIndex) : session.messages,
    revert: undefined,
    revertLoading: false,
    revertError: undefined,
    draftSource: undefined,
    updatedAt: nowIso(),
  };
}

function appendRestoredTaskList(messages: AgentMessage[], todos: unknown[], providerSessionId: string): AgentMessage[] {
  if (todos.length === 0) return messages;
  const block = normalizeOpenCodeTodos(todos, providerSessionId);
  if (block.tasks.length === 0) return messages;
  let targetIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "assistant") {
      targetIndex = index;
      break;
    }
  }
  if (targetIndex < 0) return messages;
  return messages.map((message, index) => index === targetIndex ? {
    ...message,
    blocks: replaceLatestTaskListBlock(message.blocks, block),
    updatedAt: nowIso(),
  } : message);
}

function replaceLatestTaskListBlock(blocks: AgentContentBlock[], block: AgentContentBlock): AgentContentBlock[] {
  if (block.type !== "task_list") return blocks;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (blocks[index].type === "task_list") {
      return blocks.map((item, itemIndex) => itemIndex === index ? block : item);
    }
  }
  return [...blocks, block];
}

function upsertLatestTaskListBlock(session: AgentSession, block: AgentContentBlock): AgentSession {
  if (block.type !== "task_list") return upsertAssistantBlock(session, block);
  const messages = [...session.messages];
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message.role !== "assistant") continue;
    if (!message.blocks.some((item) => item.type === "task_list")) continue;
    messages[messageIndex] = {
      ...message,
      blocks: replaceLatestTaskListBlock(message.blocks, block),
      updatedAt: nowIso(),
    };
    return { ...session, messages, updatedAt: nowIso() };
  }
  return upsertAssistantBlock(session, block);
}

function initializedProviderSession(providerId: AgentProviderId, sessions: AgentSession[]): AgentSession | undefined {
  return sessions.find((session) => session.providerId === providerId && session.providerRuntime?.processId && session.providerRuntime.initialized);
}

function hasLocalSessionContent(session: AgentSession): boolean {
  return Boolean(
    session.messages.length > 0 ||
    session.draft.trim() ||
    session.testLogText.trim() ||
    session.gitAction ||
    session.images.length > 0 ||
    session.mlcAttachments.length > 0 ||
    session.webAttachments.length > 0 ||
    session.diagnostics.some((entry) => entry.level !== "info")
  );
}

function isReusableProvisionalSession(session: AgentSession, providerId: AgentProviderId): boolean {
  return session.providerId === providerId && isEmptyAgentSession(session);
}

function isEmptyAgentSession(session: AgentSession): boolean {
  return !hasLocalSessionContent(session) &&
    (!session.providerSessionId || session.providerSessionState === "provisional") &&
    session.status !== "running" &&
    session.status !== "starting" &&
    session.status !== "cancelling";
}

function cleanupEmptyAgentSessions(sessions: AgentSession[], activeSessionId: string | null, preserveSessionIds: string[] = []): { sessions: AgentSession[]; activeSessionId: string | null; removedCount: number } {
  if (sessions.length <= 1) return { sessions, activeSessionId, removedCount: 0 };
  const preserveIds = new Set<string>([...preserveSessionIds, ...(activeSessionId ? [activeSessionId] : [])]);
  const nextSessions = sessions.filter((session, index) => {
    if (!isEmptyAgentSession(session)) return true;
    if (preserveIds.has(session.id)) return true;
    if (sessions.length === 1 && index === 0) return true;
    return false;
  });
  if (nextSessions.length === 0) {
    const fallback = sessions.find((session) => activeSessionId && session.id === activeSessionId) || sessions[0];
    return { sessions: [fallback], activeSessionId: fallback.id, removedCount: sessions.length - 1 };
  }
  const nextActiveSessionId = nextSessions.some((session) => session.id === activeSessionId)
    ? activeSessionId
    : nextSessions[0].id;
  return { sessions: nextSessions, activeSessionId: nextActiveSessionId, removedCount: sessions.length - nextSessions.length };
}

function providerStatusIsBusy(status: unknown): boolean {
  if (typeof status === "string") return status === "busy" || status === "running" || status === "retry";
  if (typeof status === "object" && status !== null) {
    const type = (status as Record<string, unknown>).type;
    return type === "busy" || type === "running" || type === "retry";
  }
  return false;
}

async function ensureOpenCodeRuntime(providerId: AgentProviderId, get: () => AgentStoreState): Promise<AgentOpenCodeHttpRuntimeEntry | null> {
  if (providerId !== "opencode") return null;
  let state = get();
  let session = initializedProviderSession(providerId, state.sessions) || state.sessions.find((item) => item.providerId === providerId) || state.getActiveSession();
  let httpRuntime = openCodeHttpRuntimeForSession(session, state.sessions);
  if (!httpRuntime && session?.providerId === "opencode") {
    await get().startOpenCodeProvider(session.id);
    state = get();
    session = initializedProviderSession(providerId, state.sessions) || state.sessions.find((item) => item.id === session?.id) || state.sessions.find((item) => item.providerId === providerId) || state.getActiveSession();
    httpRuntime = openCodeHttpRuntimeForSession(session, state.sessions);
  }
  return httpRuntime;
}

async function cleanupEmptyProviderSessions(httpRuntime: AgentOpenCodeHttpRuntimeEntry): Promise<Set<string>> {
  const deletedSessionIds = new Set<string>();
  const [providerSessions, statuses] = await Promise.all([
    httpRuntime.runtime.client.listSessions(),
    httpRuntime.runtime.client.sessionStatuses().catch((): Record<string, unknown> => ({})),
  ]);
  for (const providerSession of providerSessions) {
    if (!providerSession.id || providerStatusIsBusy(statuses[providerSession.id])) continue;
    const messages = await httpRuntime.runtime.client.messages(providerSession.id).catch(() => null);
    if (!messages || messages.length > 0) continue;
    const deleted = await httpRuntime.runtime.client.deleteSession(providerSession.id).catch(() => false);
    if (deleted) deletedSessionIds.add(providerSession.id);
  }
  return deletedSessionIds;
}

function removeDeletedProviderSessions(state: AgentStoreState, providerId: AgentProviderId, deletedSessionIds: Set<string>): Partial<AgentStoreState> {
  if (deletedSessionIds.size === 0) return {};
  const sessions = state.sessions.map((session) => session.providerId === providerId && session.providerSessionId && deletedSessionIds.has(session.providerSessionId)
    ? {
      ...session,
      providerSessionId: undefined,
      providerSessionState: undefined,
      updatedAt: nowIso(),
    }
    : session);
  const cleaned = cleanupEmptyAgentSessions(sessions, null);
  return {
    sessions: cleaned.sessions,
    activeSessionId: cleaned.activeSessionId,
    providerSessionLists: {
      ...state.providerSessionLists,
      [providerId]: state.providerSessionLists[providerId]
        ? {
          ...state.providerSessionLists[providerId],
          sessions: state.providerSessionLists[providerId].sessions.filter((item) => !deletedSessionIds.has(item.sessionId)),
          updatedAt: nowIso(),
        }
        : undefined,
    },
  };
}

function insertProcessBlock(blocks: AgentContentBlock[], block: AgentContentBlock): AgentContentBlock[] {
  const firstResultIndex = blocks.findIndex((item) => item.origin.phase === "result");
  if (firstResultIndex < 0) return [...blocks, block];
  return [...blocks.slice(0, firstResultIndex), block, ...blocks.slice(firstResultIndex)];
}

function appendAssistantTextChunkImmediate(session: AgentSession, phase: "process" | "result", text: string, messageId?: string, partId?: string): AgentSession {
  if (!text) return session;
  const messages = [...session.messages];
  const lastMessage = messages[messages.length - 1];
  let assistantMessage = lastMessage?.role === "assistant" && lastMessage.status === "streaming" ? lastMessage : null;
  if (!assistantMessage) {
    assistantMessage = createStreamingAssistantMessage(messageId);
    messages.push(assistantMessage);
  }

  const targetType = phase === "process" ? "thinking" : "text";
  const blockIndex = assistantMessage.blocks.findIndex((block) => partId ? block.id === partId : block.type === targetType && block.origin.phase === phase);
  let blocks = [...assistantMessage.blocks];
  if (blockIndex >= 0) {
    const block = blocks[blockIndex];
    if (block.type === "text") blocks[blockIndex] = { ...block, content: block.content + text, updatedAt: nowIso() };
    if (block.type === "thinking") blocks[blockIndex] = { ...block, content: block.content + text, status: "running", updatedAt: nowIso() };
  } else if (phase === "process") {
    blocks = insertProcessBlock(blocks, {
      id: partId || newId("agent_thinking"),
      type: "thinking",
      content: text,
      status: "running",
      origin: { phase: "process", placement: "standalone" },
      createdAt: nowIso(),
    });
  } else {
    blocks.push(partId ? { ...textBlock(text, "result"), id: partId } : textBlock(text, "result"));
  }

  messages[messages.length - 1] = { ...assistantMessage, blocks, updatedAt: nowIso() };
  return { ...session, messages, updatedAt: nowIso() };
}

function pacedBufferKey(sessionId: string, phase: "process" | "result", messageId?: string, partId?: string): string {
  return `${sessionId}:${messageId || "active"}:${partId || "part"}:${phase}`;
}

function charsForBacklog(length: number): number {
  if (length > 1200) return STREAM_MAX_CHARS_PER_TICK;
  if (length > 600) return 64;
  if (length > 240) return 32;
  return STREAM_BASE_CHARS_PER_TICK;
}

function notePacedBufferInput(buffer: PacedTextBuffer, textLength: number) {
  const time = Date.now();
  if (time - buffer.inputWindowStartedAt > STREAM_RATE_WINDOW_MS) {
    buffer.inputWindowStartedAt = time;
    buffer.inputCharsInWindow = 0;
  }
  buffer.inputCharsInWindow += textLength;
  buffer.lastInputAt = time;
}

function charsForPacedBuffer(buffer: PacedTextBuffer): number {
  if (buffer.draining) {
    const catchUpSize = Math.ceil(buffer.pending.length / STREAM_DRAIN_TICK_TARGET);
    return Math.min(STREAM_DRAIN_MAX_CHARS_PER_TICK, Math.max(STREAM_DRAIN_MIN_CHARS_PER_TICK, catchUpSize));
  }

  const elapsed = Math.max(1, Date.now() - buffer.inputWindowStartedAt);
  const upstreamCharsPerTick = Math.ceil((buffer.inputCharsInWindow / elapsed) * STREAM_FLUSH_INTERVAL_MS * STREAM_RATE_MULTIPLIER);
  return Math.max(charsForBacklog(buffer.pending.length), Math.min(STREAM_MAX_CHARS_PER_TICK, upstreamCharsPerTick));
}

function resolvePacedBuffer(buffer: PacedTextBuffer) {
  for (const resolve of buffer.waiters.splice(0)) resolve();
}

function flushPacedTextBuffer(key: string) {
  const buffer = pacedTextBuffers.get(key);
  if (!buffer) return;
  buffer.timer = null;
  const releaseLength = Math.min(charsForPacedBuffer(buffer), buffer.pending.length);
  const text = buffer.pending.slice(0, releaseLength);
  buffer.pending = buffer.pending.slice(releaseLength);

  if (text) {
    useAgentStore.setState((state) => ({
      sessions: updateSession(state.sessions, buffer.sessionId, (session) => appendAssistantTextChunkImmediate(session, buffer.phase, text, buffer.messageId, buffer.partId)),
    }));
  }

  if (buffer.pending) {
    buffer.timer = setTimeout(() => flushPacedTextBuffer(key), buffer.draining ? STREAM_DRAIN_INTERVAL_MS : STREAM_FLUSH_INTERVAL_MS);
    return;
  }
  pacedTextBuffers.delete(key);
  resolvePacedBuffer(buffer);
}

function appendAssistantTextChunk(session: AgentSession, phase: "process" | "result", text: string, messageId?: string, partId?: string): AgentSession {
  if (!text) return session;
  if (!getAgentConsoleSettings().smoothStreamingOutput) {
    return appendAssistantTextChunkImmediate(session, phase, text, messageId, partId);
  }

  const key = pacedBufferKey(session.id, phase, messageId, partId);
  const buffer = pacedTextBuffers.get(key) || {
    sessionId: session.id,
    phase,
    messageId,
    partId,
    pending: "",
    draining: false,
    inputWindowStartedAt: Date.now(),
    inputCharsInWindow: 0,
    lastInputAt: Date.now(),
    timer: null,
    waiters: [],
  };
  buffer.pending += text;
  notePacedBufferInput(buffer, text.length);
  pacedTextBuffers.set(key, buffer);
  if (!buffer.timer) {
    buffer.timer = setTimeout(() => flushPacedTextBuffer(key), STREAM_FLUSH_INTERVAL_MS);
  }
  return session;
}

function waitForPacedTextBuffers(sessionId: string): Promise<void> {
  const buffers = [...pacedTextBuffers.values()].filter((buffer) => buffer.sessionId === sessionId);
  if (buffers.length === 0) return Promise.resolve();
  return Promise.all(buffers.map((buffer) => new Promise<void>((resolve) => buffer.waiters.push(resolve)))).then(() => undefined);
}

function drainPacedTextBuffers(sessionId: string): Promise<void> {
  const buffers = [...pacedTextBuffers.entries()].filter(([, buffer]) => buffer.sessionId === sessionId);
  if (buffers.length === 0) return Promise.resolve();
  for (const [key, buffer] of buffers) {
    buffer.draining = true;
    if (buffer.timer) clearTimeout(buffer.timer);
    buffer.timer = setTimeout(() => flushPacedTextBuffer(key), 0);
  }
  return waitForPacedTextBuffers(sessionId);
}

function clearPacedTextBuffers(sessionId?: string) {
  for (const [key, buffer] of pacedTextBuffers) {
    if (sessionId && buffer.sessionId !== sessionId) continue;
    if (buffer.timer) clearTimeout(buffer.timer);
    pacedTextBuffers.delete(key);
    resolvePacedBuffer(buffer);
  }
}

function clearPacedTextBufferForPart(sessionId: string, phase: "process" | "result", messageId?: string, partId?: string) {
  const keys = [...new Set([
    pacedBufferKey(sessionId, phase, messageId, partId),
    pacedBufferKey(sessionId, phase, messageId, undefined),
  ])];
  for (const key of keys) {
    const buffer = pacedTextBuffers.get(key);
    if (!buffer) continue;
    if (buffer.timer) clearTimeout(buffer.timer);
    pacedTextBuffers.delete(key);
    resolvePacedBuffer(buffer);
  }
}

function completeStreamingAssistant(session: AgentSession): AgentSession {
  return {
    ...session,
    messages: session.messages.map((message) => message.role === "assistant" && message.status === "streaming"
      ? {
        ...message,
        status: "complete",
        blocks: message.blocks.map((block) => block.type === "thinking" || block.type === "compaction" ? { ...block, status: "completed", updatedAt: nowIso() } : block),
        updatedAt: nowIso(),
      }
      : message),
    updatedAt: nowIso(),
  };
}

function isOpenCodeAbortError(error: { name?: string } | undefined): boolean {
  return error?.name === "MessageAbortedError";
}

function failStreamingAssistant(session: AgentSession, message: string): AgentSession {
  const completed = completeStreamingAssistant(session);
  const messages = [...completed.messages];
  const lastIndex = messages.length - 1;
  const lastMessage = messages[lastIndex];
  if (lastMessage?.role === "assistant") {
    messages[lastIndex] = {
      ...lastMessage,
      status: "error",
      blocks: [...lastMessage.blocks, {
        id: newId("agent_error"),
        type: "error",
        message,
        origin: { phase: "result", placement: "standalone" },
        createdAt: nowIso(),
      }],
      updatedAt: nowIso(),
    };
  }
  return { ...completed, messages, updatedAt: nowIso() };
}

function findAssistantMessageIndex(messages: AgentMessage[], blockId?: string): number {
  if (blockId) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant" && message.blocks.some((block) => block.id === blockId)) return index;
    }
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.status === "streaming") return index;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "assistant") return index;
  }
  return -1;
}

function upsertAssistantBlock(session: AgentSession, block: AgentContentBlock, messageId?: string): AgentSession {
  const messages = [...session.messages];
  let targetIndex = findAssistantMessageIndex(messages, block.id);
  let assistantMessage = targetIndex >= 0 ? messages[targetIndex] : null;
  if (!assistantMessage) {
    assistantMessage = createStreamingAssistantMessage(messageId);
    messages.push(assistantMessage);
    targetIndex = messages.length - 1;
  }

  let blocks = [...assistantMessage.blocks];
  let blockIndex = blocks.findIndex((item) => item.id === block.id);
  if (blockIndex < 0 && (block.type === "text" || block.type === "thinking" || block.type === "compaction")) {
    blockIndex = blocks.findIndex((item) => item.type === block.type && item.origin.phase === block.origin.phase);
  }
  if (blockIndex >= 0) {
    blocks[blockIndex] = { ...blocks[blockIndex], ...block, updatedAt: nowIso() } as AgentContentBlock;
  } else if (block.origin.phase === "process") {
    blocks = insertProcessBlock(blocks, block);
  } else {
    blocks.push(block);
  }
  messages[targetIndex] = { ...assistantMessage, blocks, updatedAt: nowIso() };
  return { ...session, messages, updatedAt: nowIso() };
}

function completeCompactionInSession(session: AgentSession): AgentSession {
  let changed = false;
  const messages = session.messages.map((message) => {
    let messageChanged = false;
    const blocks = message.blocks.map((block) => {
      if (block.type !== "compaction" || block.status === "completed") return block;
      changed = true;
      messageChanged = true;
      return { ...block, status: "completed" as const, updatedAt: nowIso() };
    });
    return messageChanged ? { ...message, blocks, status: message.status === "streaming" ? "complete" : message.status, updatedAt: nowIso() } : message;
  });
  return {
    ...session,
    messages: changed ? messages : session.messages,
    status: "idle",
    compacting: false,
    compactError: undefined,
    updatedAt: nowIso(),
  };
}

function startCompactionInSession(session: AgentSession): AgentSession {
  const started = upsertAssistantBlock(session, {
    id: `compaction-${session.id}`,
    type: "compaction",
    status: "running",
    origin: { phase: "process", placement: "standalone" },
    createdAt: nowIso(),
  });
  return { ...started, compacting: true, compactError: undefined, status: "running", updatedAt: nowIso() };
}

function failCompactionInSession(session: AgentSession, message: string): AgentSession {
  let changed = false;
  const messages = session.messages.map((agentMessage) => {
    let messageChanged = false;
    const blocks = agentMessage.blocks.map((block) => {
      if (block.type !== "compaction" || block.status !== "running") return block;
      changed = true;
      messageChanged = true;
      return { ...block, status: "failed" as const, content: message, updatedAt: nowIso() };
    });
    return messageChanged ? { ...agentMessage, blocks, status: agentMessage.status === "streaming" ? "error" : agentMessage.status, updatedAt: nowIso() } : agentMessage;
  });
  return {
    ...session,
    messages: changed ? messages : session.messages,
    compacting: false,
    compactError: message,
    status: session.status === "running" ? "idle" : session.status,
    updatedAt: nowIso(),
  };
}

function applyOpenCodeBusEvent(session: AgentSession, event: OpenCodeBusEvent): AgentSession {
  let nextSession = session;
  for (const normalized of normalizeOpenCodeEvent(event)) {
    if (normalized.type !== "unknown" && normalized.sessionId && normalized.sessionId !== nextSession.providerSessionId) continue;
    if (normalized.type === "text.delta") {
      if (nextSession.status === "cancelling") continue;
      nextSession = appendAssistantTextChunk(nextSession, normalized.phase, normalized.delta, normalized.messageId, normalized.partId);
      continue;
    }
    if (normalized.type === "block.updated") {
      if (normalized.block.type === "text" || normalized.block.type === "thinking") {
        clearPacedTextBufferForPart(nextSession.id, normalized.block.origin.phase, normalized.messageId, normalized.partId);
      }
      nextSession = upsertAssistantBlock(nextSession, normalized.block, normalized.messageId);
      continue;
    }
    if (normalized.type === "permission.asked") {
      nextSession = upsertAssistantBlock(nextSession, normalized.block);
      nextSession = nextSession.pendingPermissionIds.includes(normalized.requestId)
        ? nextSession
        : { ...nextSession, pendingPermissionIds: [...nextSession.pendingPermissionIds, normalized.requestId], updatedAt: nowIso() };
      continue;
    }
    if (normalized.type === "permission.replied") {
      nextSession = resolvePermissionInSession(nextSession, normalized.requestId, normalized.reply || "once");
      continue;
    }
    if (normalized.type === "session.diff") {
      nextSession = { ...nextSession, sessionDiffs: normalized.diff, sessionDiffLoading: false, sessionDiffError: undefined, updatedAt: nowIso() };
      continue;
    }
    if (normalized.type === "session.compacted") {
      nextSession = completeCompactionInSession(nextSession);
      continue;
    }
    if (normalized.type === "todo.updated") {
      nextSession = upsertLatestTaskListBlock(nextSession, normalized.block);
      continue;
    }
    if (normalized.type === "session.status") {
      if (normalized.status === "idle") clearPacedTextBuffers(nextSession.id);
      nextSession = {
        ...(normalized.status === "idle" ? completeStreamingAssistant(nextSession) : nextSession),
        status: normalized.status === "idle" ? "idle" : normalized.status === "running" ? "running" : nextSession.status,
        compacting: normalized.status === "idle" ? false : nextSession.compacting,
        updatedAt: nowIso(),
      };
      continue;
    }
    if (normalized.type === "session.error") {
      const isAbort = isOpenCodeAbortError(normalized.error);
      if (isAbort) clearPacedTextBuffers(nextSession.id);
      nextSession = {
        ...(isAbort ? completeStreamingAssistant(nextSession) : failStreamingAssistant(nextSession, normalized.error.message || normalized.error.name || "OpenCode session error")),
        status: isAbort ? "idle" : "error",
        updatedAt: nowIso(),
      };
      continue;
    }
    if (normalized.type === "message.updated") {
      const isAbortUpdate = isOpenCodeAbortError(normalized.info?.error);
      const modelId = normalized.modelId || openCodeModelIdFromInfo(normalized.info) || nextSession.modelId;
      if (modelId) {
        const contextLimit = contextLimitForModel(nextSession.availableModels, modelId) ?? nextSession.contextUsage?.contextLimit;
        const contextUsage = normalized.info?.role === "assistant"
          ? openCodeContextUsageFromInfo(normalized.info, contextLimit, nextSession.contextUsage?.cost?.amount)
          : undefined;
        nextSession = {
          ...nextSession,
          modelId,
          ...(contextUsage ? { contextUsage } : {}),
          updatedAt: nowIso(),
        };
      }
      if (normalized.info?.agent || normalized.info?.mode) nextSession = { ...nextSession, modeId: normalized.info.agent || normalized.info.mode, updatedAt: nowIso() };
      if (isAbortUpdate) {
        clearPacedTextBuffers(nextSession.id);
        nextSession = { ...completeStreamingAssistant(nextSession), status: "idle", updatedAt: nowIso() };
        continue;
      }
      if (normalized.status === "complete") nextSession = completeStreamingAssistant(nextSession);
      if (normalized.status === "error") nextSession = { ...nextSession, status: "error", updatedAt: nowIso() };
    }
  }
  return nextSession;
}

function handleOpenCodeBusEvent(sessionId: string, event: OpenCodeBusEvent) {
  useAgentStore.setState((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => applyOpenCodeBusEvent(session, event)),
  }));
}

function handleOpenCodePermissionRequest(sessionId: string, request: Record<string, unknown>) {
  handleOpenCodeBusEvent(sessionId, { type: "permission.asked", properties: request } as OpenCodeBusEvent);
}

function openCodePermissionReplyFromOption(optionId: string): OpenCodePermissionReply {
  if (optionId === "always") return "always";
  if (optionId === "reject" || optionId === "deny") return "reject";
  return "once";
}

function resolvePermissionInSession(session: AgentSession, requestId: string, optionId: string): AgentSession {
  return {
    ...session,
    pendingPermissionIds: session.pendingPermissionIds.filter((id) => id !== requestId),
    messages: session.messages.map((message) => ({
      ...message,
      blocks: message.blocks.map((block) => block.type === "permission" && block.requestId === requestId
        ? { ...block, status: "resolved", selectedOptionId: optionId, updatedAt: nowIso() }
        : block),
    })),
    updatedAt: nowIso(),
  };
}

function updateSession(sessions: AgentSession[], sessionId: string, updater: (session: AgentSession) => AgentSession): AgentSession[] {
  return sessions.map((session) => session.id === sessionId ? updater(session) : session);
}

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  sessions: [createAgentSession()],
  activeSessionId: "agent-session-opencode",
  providerSessionLists: {},

  getActiveSession: () => {
    const state = get();
    return state.sessions.find((session) => session.id === state.activeSessionId) || null;
  },

  createNewSession: (options = {}) => {
    const state = get();
    const activeSession = state.getActiveSession();
    const requestedCwd = options.cwd?.trim();
    const inheritOpenCodeCommands = !requestedCwd || requestedCwd === activeSession?.cwd;
    const createdAt = nowIso();
    const sessionId = newId("agent_session");
    const session: AgentSession = {
      ...createAgentSession(),
      id: sessionId,
      title: "New Agent Session",
      cwd: requestedCwd || activeSession?.cwd || "",
      modelId: activeSession?.modelId,
      modeId: activeSession?.modeId,
      availableModels: activeSession?.availableModels || [],
      availableModes: activeSession?.availableModes || [],
      availableCommands: inheritOpenCodeCommands ? activeSession?.availableCommands || [] : [],
      configOptions: activeSession?.configOptions || [],
      status: "idle",
      createdAt,
      updatedAt: createdAt,
    };
    const cleaned = getAgentConsoleSettings().autoCleanupEmptySessions
      ? cleanupEmptyAgentSessions(state.sessions, sessionId, [sessionId])
      : { sessions: state.sessions, activeSessionId: sessionId, removedCount: 0 };
    set({ sessions: [...cleaned.sessions, session], activeSessionId: sessionId });
    return sessionId;
  },

  setActiveSession: (sessionId) => set((state) => {
    if (!getAgentConsoleSettings().autoCleanupEmptySessions) return { activeSessionId: sessionId };
    const cleaned = cleanupEmptyAgentSessions(state.sessions, sessionId, [sessionId]);
    return { sessions: cleaned.sessions, activeSessionId: cleaned.activeSessionId || sessionId };
  }),

  setSessionMode: (sessionId, modeId) => {
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (session) => ({ ...session, modeId, updatedAt: nowIso() })),
    }));
  },

  setSessionModel: (sessionId, modelId) => {
    setOpenCodePreferredModel(modelId);
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (session) => ({ ...session, modelId, contextUsage: undefined, updatedAt: nowIso() })),
    }));
  },

  addImage: (sessionId, image) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => ({
      ...session,
      images: session.images.some((item) => item.path === image.path) ? session.images : [...session.images, image],
      updatedAt: nowIso(),
    })),
  })),

  removeImage: (sessionId, imagePath) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => ({
      ...session,
      images: session.images.filter((image) => image.path !== imagePath),
      updatedAt: nowIso(),
    })),
  })),

  clearImages: (sessionId) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => ({ ...session, images: [], updatedAt: nowIso() })),
  })),

  addMlcAttachment: (sessionId, attachment) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => ({
      ...session,
      mlcAttachments: session.mlcAttachments.some((item) => item.filePath === attachment.filePath) ? session.mlcAttachments : [...session.mlcAttachments, attachment],
      updatedAt: nowIso(),
    })),
  })),

  removeMlcAttachment: (sessionId, filePath) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => ({
      ...session,
      mlcAttachments: session.mlcAttachments.filter((item) => item.filePath !== filePath),
      updatedAt: nowIso(),
    })),
  })),

  clearMlcAttachments: (sessionId) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => ({ ...session, mlcAttachments: [], updatedAt: nowIso() })),
  })),

  addWebAttachment: (sessionId, attachment) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => ({
      ...session,
      webAttachments: session.webAttachments.some((item) => item.id === attachment.id) ? session.webAttachments : [...session.webAttachments, attachment],
      updatedAt: nowIso(),
    })),
  })),

  removeWebAttachment: (sessionId, attachmentId) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => ({
      ...session,
      webAttachments: session.webAttachments.filter((attachment) => attachment.id !== attachmentId),
      updatedAt: nowIso(),
    })),
  })),

  clearWebAttachments: (sessionId) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => ({ ...session, webAttachments: [], updatedAt: nowIso() })),
  })),

  updateTestLog: (sessionId, text) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => ({ ...session, testLogText: text, updatedAt: nowIso() })),
  })),

  setGitAction: (sessionId, action) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => ({ ...session, gitAction: action, updatedAt: nowIso() })),
  })),

  updateGitBranchName: (sessionId, branchName) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => session.gitAction?.type === "create-branch"
      ? { ...session, gitAction: { ...session.gitAction, branchName }, updatedAt: nowIso() }
      : session),
  })),

  updateDraft: (sessionId, draft) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => ({ ...session, draft, updatedAt: nowIso() })),
  })),

  appendAgentDiagnostic: (sessionId, level, message) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => appendDiagnosticToSession(session, level, message)),
  })),

  startOpenCodeProvider: async (sessionId) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    if (!session) return;
    if (session.providerRuntime?.processId) {
      await get().stopOpenCodeProvider(sessionId);
    }

    if (session.providerId === "opencode") {
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
          ...item,
          status: "starting",
          providerRuntime: { transport: "http", initialized: false },
        }, "info", "Preparing Agent session...")),
      }));

      try {
        const runtime = await startOpenCodeServerRuntime({ cwd: session.cwd, port: createOpenCodeHttpPort() });
        const events = runtime.client.openEvents({
          onEvent: (event) => handleOpenCodeBusEvent(sessionId, event),
          onError: (error) => get().appendAgentDiagnostic(sessionId, "error", `Agent event stream error: ${error.message}`),
          onOpen: () => get().appendAgentDiagnostic(sessionId, "info", "Agent event stream connected."),
          onClose: () => get().appendAgentDiagnostic(sessionId, "info", "Agent event stream closed."),
        });
        events.start();
        openCodeHttpRuntimes.set(runtime.processInfo.processId, { sessionId, runtime, events });
        const [providers, agents, commands, pendingPermissions] = await Promise.all([
          runtime.client.providers(),
          runtime.client.agents().catch(() => [] as OpenCodeAgentInfo[]),
          runtime.client.commands().catch(() => [] as OpenCodeCommandInfo[]),
          runtime.client.permissions().catch(() => []),
        ]);
        const availableModels = choicesFromOpenCodeProviders(providers);
        const availableModes = choicesFromOpenCodeAgents(agents);
        const availableCommands = choicesFromOpenCodeCommands(commands);
        const modeOptions = availableModes.length > 0 ? availableModes : fallbackOpenCodeAgentChoices();
        const serverModelId = session.modelId || availableModels[0]?.id;
        const openCodeSettings = availableModels.length > 0 ? syncOpenCodeModels(availableModels, serverModelId) : null;
        const modelId = openCodeSettings?.preferredModelId || serverModelId;
        const modeId = selectOpenCodeAgentMode(session.modeId, modeOptions);
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
            ...item,
            status: "idle",
            providerRuntime: {
              ...runtime.runtimeInfo,
              transport: "http",
              initialized: true,
              agentCapabilities: {
                sessionCapabilities: { list: {}, load: {}, delete: {}, update: {} },
                loadSession: true,
                promptAsync: true,
                abort: true,
                events: true,
                tools: true,
              },
            },
            availableModels: availableModels.length > 0 ? availableModels : item.availableModels,
            availableModes: modeOptions,
            availableCommands,
            modelId,
            modeId,
            updatedAt: nowIso(),
          }, "info", "Agent session ready.")),
        }));
        for (const request of pendingPermissions) handleOpenCodePermissionRequest(sessionId, request as Record<string, unknown>);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
            ...item,
            status: "error",
            providerRuntime: { ...item.providerRuntime, transport: "http", processId: undefined, initialized: false },
          }, "error", `Failed to prepare Agent session: ${message}`)),
        }));
      }
      return;
    }
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
        ...item,
        status: "error",
        providerRuntime: { ...item.providerRuntime, initialized: false },
      }, "error", "This Agent backend is not supported.")),
    }));
  },

  stopOpenCodeProvider: async (sessionId) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    const processId = session?.providerRuntime?.processId;
    if (!processId) return;
    const httpRuntime = openCodeHttpRuntimes.get(processId);
    if (httpRuntime) {
      openCodeHttpRuntimes.delete(processId);
      clearPacedTextBuffers(sessionId);
      httpRuntime.events.stop();
      await httpRuntime.runtime.stop().catch(() => undefined);
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
          ...item,
          status: "disconnected",
          providerRuntime: { ...item.providerRuntime, processId: undefined, initialized: false },
        }, "info", "Agent session stopped.")),
      }));
      return;
    }
    clearPacedTextBuffers(sessionId);
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
        ...item,
        status: "disconnected",
        providerRuntime: { ...item.providerRuntime, processId: undefined, initialized: false },
      }, "warn", "Agent session process was not found.")),
    }));
  },

  receiveAgentProcessOutput: (_processId, _data) => {},

  receiveAgentProcessStderr: (_processId, _data) => {},

  receiveAgentProcessExit: (processId, exitCode) => {
    const httpRuntime = openCodeHttpRuntimes.get(processId);
    if (httpRuntime) {
      httpRuntime.events.stop();
      openCodeHttpRuntimes.delete(processId);
      set((state) => ({
        sessions: updateSession(state.sessions, httpRuntime.sessionId, (session) => appendDiagnosticToSession({
          ...session,
          status: "disconnected",
          providerRuntime: { ...session.providerRuntime, processId: undefined, initialized: false },
        }, exitCode === 0 || exitCode === null ? "info" : "warn", `Agent session exited${exitCode === null ? "" : ` with code ${exitCode}`}.`)),
      }));
      return;
    }
    return;
  },

  receiveAgentProcessError: (_processId, _message) => {},

  sendAgentPrompt: async (sessionId) => {
    let session = get().sessions.find((item) => item.id === sessionId);
    if (!session || !hasAgentComposerContent(session)) return;
    const submittedPrompt = buildSubmittedComposerPayload({
      text: session.draft,
      projectDirectory: session.cwd,
      images: session.images,
      mlcAttachments: session.mlcAttachments,
      webAttachments: session.webAttachments,
      testLogText: session.testLogText,
      gitAction: session.gitAction,
    }, {
      prompts: [],
      mainHeading: "User Prompt",
      quickActionHeading: "Agent Requirement",
      includeSystemReminder: false,
      includePayloadRouting: false,
    });
    const composerDraft = session.draft;
    const openCodeMessageId = newOpenCodeId("msg");
    const openCodeTextPartId = newOpenCodeId("prt");

    try {
      if (session.providerId === "opencode") {
        if (!openCodeHttpRuntimeForSession(session, get().sessions)) {
          await get().startOpenCodeProvider(sessionId);
        }
        session = get().sessions.find((item) => item.id === sessionId);
        if (!session) throw new Error("Agent session is not ready");
        const slashCommand = parseOpenCodeSlashCommandDraft(session.draft);
        if (slashCommand && (!session.availableCommands || session.availableCommands.length === 0)) {
          const httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
          if (httpRuntime) {
            const commands = await httpRuntime.runtime.client.commands().catch(() => [] as OpenCodeCommandInfo[]);
            set((state) => ({
              sessions: updateSession(state.sessions, sessionId, (item) => ({
                ...item,
                availableCommands: choicesFromOpenCodeCommands(commands),
                updatedAt: nowIso(),
              })),
            }));
            session = get().sessions.find((item) => item.id === sessionId) || session;
          }
        }
        const openCodeCommand = slashCommand ? findOpenCodeCommand(session, slashCommand.name) : undefined;
        if (slashCommand && !openCodeCommand) {
          set((state) => ({
            sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
              ...item,
              updatedAt: nowIso(),
            }, "warn", `OpenCode command not found: /${slashCommand.name}`)),
          }));
          return;
        }
        if (slashCommand && openCodeCommand) {
          const httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
          if (!httpRuntime) throw new Error("Agent session is not available");

          let providerSessionId = session.providerSessionId;
          if (!providerSessionId) {
            const created = await httpRuntime.runtime.client.createSession();
            providerSessionId = created.id;
            await httpRuntime.runtime.client.updateSession(providerSessionId, { permission: openCodeReadOnlyPermissionRules() }).catch((error) => {
              get().appendAgentDiagnostic(sessionId, "warn", `Failed to apply read-only permissions: ${error instanceof Error ? error.message : String(error)}`);
            });
          }

          const configuredSession = get().sessions.find((item) => item.id === sessionId) || session;
          const commandParts = openCodeCommandFilePartsFromSession(configuredSession);
          set((state) => ({
            sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
              ...item,
              providerSessionId,
              providerSessionState: "active",
              status: "running",
              draft: "",
              draftSource: undefined,
              testLogText: "",
              gitAction: null,
              images: [],
              mlcAttachments: [],
              webAttachments: [],
              updatedAt: nowIso(),
            }, "info", `Running OpenCode command: /${openCodeCommand.id}`)),
          }));

          void httpRuntime.runtime.client.command(providerSessionId, {
            command: openCodeCommand.id,
            arguments: slashCommand.arguments,
            ...(configuredSession.modeId ? { agent: configuredSession.modeId } : {}),
            ...(openCodeCommandModelFromSession(configuredSession) ? { model: openCodeCommandModelFromSession(configuredSession) } : {}),
            ...(commandParts.length > 0 ? { parts: commandParts } : {}),
          }).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            void drainPacedTextBuffers(sessionId).finally(() => {
              set((state) => ({
                sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
                  ...item,
                  status: "error",
                  updatedAt: nowIso(),
                }, "error", `OpenCode command failed: ${message}`)),
              }));
            });
          });
          return;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
          ...item,
          status: "error",
          updatedAt: nowIso(),
        }, "error", `OpenCode command failed: ${message}`)),
      }));
      return;
    }

    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (item) => {
        const cleaned = cleanupRevertedMessagesForSubmit(item);
        return {
          ...cleaned,
          status: "running",
          draft: "",
          draftSource: undefined,
          testLogText: "",
          gitAction: null,
          images: [],
          mlcAttachments: [],
          webAttachments: [],
          messages: [
            ...cleaned.messages,
            createUserMessage(submittedPrompt.markdown, {
              id: openCodeMessageId,
              providerParts: [{ id: openCodeTextPartId, type: "text", text: composerDraft }],
              composerDraft,
            }),
            createStreamingAssistantMessage(),
          ],
          updatedAt: nowIso(),
        };
      }),
    }));

    try {
      session = get().sessions.find((item) => item.id === sessionId);
      if (session?.providerId === "opencode") {
        if (!openCodeHttpRuntimeForSession(session, get().sessions)) {
          await get().startOpenCodeProvider(sessionId);
        }
        session = get().sessions.find((item) => item.id === sessionId);
        if (!session) throw new Error("Agent session is not ready");
        const httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
        if (!httpRuntime) throw new Error("Agent session is not available");

        let providerSessionId = session.providerSessionId;
        if (!providerSessionId) {
          const created = await httpRuntime.runtime.client.createSession();
          providerSessionId = created.id;
          await httpRuntime.runtime.client.updateSession(providerSessionId, { permission: openCodeReadOnlyPermissionRules() }).catch((error) => {
            get().appendAgentDiagnostic(sessionId, "warn", `Failed to apply read-only permissions: ${error instanceof Error ? error.message : String(error)}`);
          });
          set((state) => ({
            sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
              ...item,
              providerSessionId,
              providerSessionState: "active",
              title: item.title || created.title || item.title,
              updatedAt: nowIso(),
            }, "info", `Session created: ${providerSessionId}`)),
          }));
        }

        const configuredSession = get().sessions.find((item) => item.id === sessionId) || session;
        await httpRuntime.runtime.client.promptAsync(providerSessionId, {
          messageID: openCodeMessageId,
          parts: [{ id: openCodeTextPartId, type: "text", text: submittedPrompt.historyText || submittedPrompt.markdown }],
          model: openCodeModelFromSession(configuredSession),
          ...(configuredSession.modeId ? { agent: configuredSession.modeId } : {}),
        });
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, (item) => ({
            ...item,
            providerSessionId,
            providerSessionState: "active",
            status: "running",
            updatedAt: nowIso(),
          })),
        }));
        return;
      }
      throw new Error("This Agent backend is not supported.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await drainPacedTextBuffers(sessionId);
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
          ...failStreamingAssistant(item, message),
          status: "error",
        }, "error", `Agent prompt failed: ${message}`)),
      }));
    }
  },

  abortAgentPrompt: async (sessionId) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    if (!session) return;
    const httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
    if (httpRuntime && session.providerSessionId) {
      clearPacedTextBuffers(sessionId);
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
          ...item,
          status: "cancelling",
          updatedAt: nowIso(),
        }, "info", "Aborting session...")),
      }));
      try {
        await httpRuntime.runtime.client.abort(session.providerSessionId);
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, (item) => ({
            ...completeStreamingAssistant(item),
            status: item.status === "cancelling" ? "idle" : item.status,
            updatedAt: nowIso(),
          })),
        }));
      } catch (error) {
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
            ...item,
            status: "error",
            updatedAt: nowIso(),
          }, "error", `Failed to abort session: ${error instanceof Error ? error.message : String(error)}`)),
        }));
      }
      return;
    }
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession(item, "warn", "Abort is not available for this session.")),
    }));
  },

  editAgentMessage: async (sessionId, messageId) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    const message = session?.messages.find((item) => item.id === messageId);
    const httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
    if (!session?.providerSessionId || !message || message.role !== "user" || !httpRuntime) return;
    const providerMessageId = messageProviderId(message);
    const draft = messageDraftText(message);
    const previousDraft = session.draft;
    const previousSource = session.draftSource;
    const previousRevert = session.revert;
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (item) => ({
        ...item,
        draft,
        draftSource: { kind: "message-edit", sourceSessionId: sessionId, sourceMessageId: message.id },
        revertLoading: true,
        revertError: undefined,
        updatedAt: nowIso(),
      })),
    }));
    try {
      if (session.status === "running" || session.status === "cancelling") {
        clearPacedTextBuffers(session.id);
        await httpRuntime.runtime.client.abort(session.providerSessionId).catch(() => false);
      }
      const updated = await httpRuntime.runtime.client.revertSession(session.providerSessionId, { messageID: providerMessageId });
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => ({
          ...item,
          revert: revertStateFromOpenCodeSession(updated) || { messageId: providerMessageId },
          sessionDiffs: Array.isArray(updated.revert?.diff) ? normalizeOpenCodeFileDiffs(updated.revert.diff) : item.sessionDiffs,
          revertLoading: false,
          revertError: undefined,
          status: item.status === "running" || item.status === "cancelling" ? "idle" : item.status,
          updatedAt: nowIso(),
        })),
      }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
          ...item,
          draft: previousDraft,
          draftSource: previousSource,
          revert: previousRevert,
          revertLoading: false,
          revertError: detail,
          updatedAt: nowIso(),
        }, "error", `Failed to edit message: ${detail}`)),
      }));
    }
  },

  restoreAgentRevertedMessage: async (sessionId, messageId) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    const httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
    if (!session?.providerSessionId || !session.revert || !httpRuntime) return;
    const revertIndex = session.messages.findIndex((message) => messageProviderId(message) === session.revert!.messageId);
    if (revertIndex < 0) return;
    const rolledUserMessages = session.messages.slice(revertIndex).filter((message) => message.role === "user");
    const selectedIndex = rolledUserMessages.findIndex((message) => message.id === messageId || messageProviderId(message) === messageId);
    const selected = selectedIndex >= 0 ? rolledUserMessages[selectedIndex] : undefined;
    if (!selected) return;
    const next = rolledUserMessages[selectedIndex + 1];
    const previousDraft = session.draft;
    const previousSource = session.draftSource;
    const previousRevert = session.revert;
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (item) => ({ ...item, revertLoading: true, revertError: undefined, updatedAt: nowIso() })),
    }));
    try {
      const updated = next
        ? await httpRuntime.runtime.client.revertSession(session.providerSessionId, { messageID: messageProviderId(next) })
        : await httpRuntime.runtime.client.unrevertSession(session.providerSessionId);
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => ({
          ...item,
          revert: revertStateFromOpenCodeSession(updated),
          sessionDiffs: Array.isArray(updated.revert?.diff) ? normalizeOpenCodeFileDiffs(updated.revert.diff) : item.sessionDiffs,
          draft: next ? messageDraftText(next) : "",
          draftSource: next ? { kind: "message-edit", sourceSessionId: sessionId, sourceMessageId: next.id } : undefined,
          revertLoading: false,
          revertError: undefined,
          updatedAt: nowIso(),
        })),
      }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
          ...item,
          draft: previousDraft,
          draftSource: previousSource,
          revert: previousRevert,
          revertLoading: false,
          revertError: detail,
          updatedAt: nowIso(),
        }, "error", `Failed to restore reverted message: ${detail}`)),
      }));
    }
  },

  forkAgentSessionFromMessage: async (sessionId, messageId) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    const message = session?.messages.find((item) => item.id === messageId);
    const httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
    if (!session?.providerSessionId || !message || message.role !== "user" || !httpRuntime) return;
    const providerMessageId = messageProviderId(message);
    const draft = messageDraftText(message);
    try {
      const forked = await httpRuntime.runtime.client.forkSession(session.providerSessionId, { messageID: providerMessageId });
      const messages = await httpRuntime.runtime.client.messages(forked.id).catch(() => [] as OpenCodeMessage[]);
      const todos = await httpRuntime.runtime.client.todos(forked.id).catch(() => []);
      const newSessionId = get().createNewSession({ cwd: session.cwd });
      const replayedMessages = appendRestoredTaskList(agentMessagesFromOpenCodeMessages(messages), todos, forked.id);
      set((state) => ({
        sessions: updateSession(state.sessions, newSessionId, (item) => ({
          ...item,
          title: forked.title || `${session.title} fork`,
          providerSessionId: forked.id,
          providerSessionState: "active",
          providerRuntime: session.providerRuntime,
          messages: replayedMessages,
          draft,
          draftSource: { kind: "fork", sourceSessionId: sessionId, sourceMessageId: message.id },
          modelId: session.modelId,
          modeId: session.modeId,
          availableModels: session.availableModels || [],
          availableModes: session.availableModes || [],
          availableCommands: session.availableCommands || [],
          configOptions: session.configOptions || [],
          status: "idle",
          updatedAt: nowIso(),
        })),
        activeSessionId: newSessionId,
      }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      get().appendAgentDiagnostic(sessionId, "error", `Failed to fork session: ${detail}`);
    }
  },

  refreshProviderSessions: async (providerId, cursor = null) => {
    let session = get().sessions.find((item) => item.providerId === providerId) || get().getActiveSession();
    let httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
    if (!httpRuntime && session?.providerId === "opencode") {
      await get().startOpenCodeProvider(session.id);
      session = get().sessions.find((item) => item.id === session?.id) || get().sessions.find((item) => item.providerId === providerId) || get().getActiveSession();
      httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
    }
    if (httpRuntime) {
      const existing = get().providerSessionLists[providerId];
      set((state) => ({
        providerSessionLists: {
          ...state.providerSessionLists,
          [providerId]: {
            providerId,
            status: "loading",
            capability: "supported",
            sessions: cursor ? existing?.sessions || [] : [],
            nextCursor: null,
            updatedAt: existing?.updatedAt,
          },
        },
      }));
      try {
        const [sessions, statuses] = await Promise.all([
          httpRuntime.runtime.client.listSessions(),
          httpRuntime.runtime.client.sessionStatuses().catch((): Record<string, string> => ({})),
        ]);
        const normalized: AgentProviderSessionItem[] = sessions.map((item) => ({
          sessionId: item.id,
          cwd: item.directory || null,
          title: item.title || null,
          updatedAt: item.time?.updated ? new Date(item.time.updated).toISOString() : null,
          _meta: { slug: item.slug, path: item.path, status: statuses[item.id] },
        }));
        set((state) => ({
          providerSessionLists: {
            ...state.providerSessionLists,
            [providerId]: {
              providerId,
              status: "ready",
              capability: "supported",
              sessions: normalized,
              nextCursor: null,
              updatedAt: nowIso(),
            },
          },
        }));
      } catch (error) {
        set((state) => ({
          providerSessionLists: {
            ...state.providerSessionLists,
            [providerId]: {
              providerId,
              status: "error",
              capability: "supported",
              sessions: existing?.sessions || [],
              nextCursor: null,
              error: error instanceof Error ? error.message : String(error),
              updatedAt: existing?.updatedAt,
            },
          },
        }));
      }
      return;
    }
    const existing = get().providerSessionLists[providerId];
    set((state) => ({
      providerSessionLists: {
        ...state.providerSessionLists,
        [providerId]: {
          providerId,
          status: "error",
          capability: "unknown",
          sessions: existing?.sessions || [],
          nextCursor: existing?.nextCursor,
          error: "Session list is not available.",
          updatedAt: existing?.updatedAt,
        },
      },
    }));
  },

  restoreProviderSession: async (providerId, providerSessionId) => {
    let state = get();
    let runtimeOwner = initializedProviderSession(providerId, state.sessions);
    const existingSession = state.sessions.find((item) => item.providerId === providerId && item.providerSessionId === providerSessionId && item.providerSessionState !== "provisional");
    if (existingSession) {
      const providerRuntime = runtimeOwner?.providerRuntime;
      set((state) => ({
        activeSessionId: existingSession.id,
        sessions: providerRuntime ? updateSession(state.sessions, existingSession.id, (item) => ({
          ...item,
          providerRuntime,
          updatedAt: nowIso(),
        })) : state.sessions,
      }));
      return;
    }

    let session = runtimeOwner || state.sessions.find((item) => item.providerId === providerId) || state.getActiveSession();
    let httpRuntime = openCodeHttpRuntimeForSession(session, state.sessions);
    if (!httpRuntime && session?.providerId === "opencode") {
      await get().startOpenCodeProvider(session.id);
      state = get();
      runtimeOwner = initializedProviderSession(providerId, state.sessions);
      session = runtimeOwner || state.sessions.find((item) => item.id === session?.id) || state.sessions.find((item) => item.providerId === providerId) || state.getActiveSession();
      httpRuntime = openCodeHttpRuntimeForSession(session, state.sessions);
    }
    if (session && httpRuntime) {
      const listItem = state.providerSessionLists[providerId]?.sessions.find((item) => item.sessionId === providerSessionId);
      const activeSession = state.getActiveSession();
      const reusableSession = activeSession && isReusableProvisionalSession(activeSession, providerId)
        ? activeSession
        : state.sessions.find((item) => isReusableProvisionalSession(item, providerId));
      const targetSessionId = reusableSession?.id || newId("agent_session");

      const [messages, todos, providerSessions, sessionDiffs, pendingPermissions] = await Promise.all([
        httpRuntime.runtime.client.messages(providerSessionId),
        httpRuntime.runtime.client.todos(providerSessionId).catch(() => []),
        httpRuntime.runtime.client.listSessions().catch(() => []),
        httpRuntime.runtime.client.sessionDiff(providerSessionId).catch(() => []),
        httpRuntime.runtime.client.permissions().catch(() => []),
      ]);
      const providerSession = providerSessions.find((item) => item.id === providerSessionId);
      const restoredRevert = revertStateFromOpenCodeSession(providerSession);
      const replayedMessages = appendRestoredTaskList(agentMessagesFromOpenCodeMessages(messages), todos, providerSessionId);
      const restoredSelection = openCodeSelectionFromMessages(messages);
      const restoredModelId = restoredSelection.modelId || session.modelId;
      const restoredModeId = selectOpenCodeAgentMode(restoredSelection.modeId || session.modeId, session.availableModes || []);
      const restoredContextUsage = openCodeContextUsageFromMessages(messages, contextLimitForModel(session.availableModels, restoredModelId));
      set((state) => ({
        activeSessionId: targetSessionId,
        sessions: reusableSession
          ? updateSession(state.sessions, reusableSession.id, (item) => appendDiagnosticToSession({
            ...item,
            title: providerSession?.title || listItem?.title || item.title,
            cwd: providerSession?.directory || listItem?.cwd || item.cwd || session.cwd,
            providerRuntime: runtimeOwner?.providerRuntime || session.providerRuntime,
            providerSessionId,
            providerSessionState: "restored",
            messages: replayedMessages,
            modelId: restoredModelId,
            modeId: restoredModeId,
            availableModels: session.availableModels || [],
            availableModes: session.availableModes || [],
            configOptions: session.configOptions || [],
            contextUsage: restoredContextUsage,
            sessionDiffs: normalizeOpenCodeFileDiffs(sessionDiffs),
            sessionDiffLoading: false,
            sessionDiffError: undefined,
            revert: restoredRevert,
            revertLoading: false,
            revertError: undefined,
            status: "idle",
            updatedAt: nowIso(),
          }, "info", `Session restored: ${providerSessionId}`))
          : [...state.sessions, appendDiagnosticToSession({
            ...createAgentSession(),
            id: targetSessionId,
            providerId,
            title: providerSession?.title || listItem?.title || session.title,
            cwd: providerSession?.directory || listItem?.cwd || session.cwd,
            providerRuntime: runtimeOwner?.providerRuntime || session.providerRuntime,
            providerSessionId,
            providerSessionState: "restored",
            messages: replayedMessages,
            modelId: restoredModelId,
            modeId: restoredModeId,
            availableModels: session.availableModels || [],
            availableModes: session.availableModes || [],
            configOptions: session.configOptions || [],
            contextUsage: restoredContextUsage,
            sessionDiffs: normalizeOpenCodeFileDiffs(sessionDiffs),
            sessionDiffLoading: false,
            sessionDiffError: undefined,
            revert: restoredRevert,
            revertLoading: false,
            revertError: undefined,
            status: "idle",
            createdAt: nowIso(),
            updatedAt: nowIso(),
          }, "info", `Session restored: ${providerSessionId}`)],
      }));
      for (const request of pendingPermissions) handleOpenCodePermissionRequest(targetSessionId, request as Record<string, unknown>);
      return;
    }

    throw new Error("Session restore is not available.");
  },

  renameProviderSession: async (providerId, providerSessionId, title) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    let state = get();
    let session = initializedProviderSession(providerId, state.sessions) || state.sessions.find((item) => item.providerId === providerId) || state.getActiveSession();
    let httpRuntime = openCodeHttpRuntimeForSession(session, state.sessions);
    if (!httpRuntime && session?.providerId === "opencode") {
      await get().startOpenCodeProvider(session.id);
      state = get();
      session = initializedProviderSession(providerId, state.sessions) || state.sessions.find((item) => item.id === session?.id) || state.sessions.find((item) => item.providerId === providerId) || state.getActiveSession();
      httpRuntime = openCodeHttpRuntimeForSession(session, state.sessions);
    }
    if (!httpRuntime) throw new Error("Session rename is not available.");
    const updated = await httpRuntime.runtime.client.updateSession(providerSessionId, { title: trimmedTitle });
    const nextTitle = updated.title || trimmedTitle;
    set((state) => ({
      providerSessionLists: {
        ...state.providerSessionLists,
        [providerId]: state.providerSessionLists[providerId]
          ? {
            ...state.providerSessionLists[providerId],
            sessions: state.providerSessionLists[providerId].sessions.map((item) => item.sessionId === providerSessionId ? { ...item, title: nextTitle, updatedAt: nowIso() } : item),
            updatedAt: nowIso(),
          }
          : undefined,
      },
      sessions: state.sessions.map((item) => item.providerId === providerId && item.providerSessionId === providerSessionId
        ? appendDiagnosticToSession({
          ...item,
          title: nextTitle,
          updatedAt: nowIso(),
        }, "info", `Session renamed: ${nextTitle}`)
        : item),
    }));
  },

  deleteProviderSession: async (providerId, providerSessionId) => {
    let state = get();
    let session = initializedProviderSession(providerId, state.sessions) || state.sessions.find((item) => item.providerId === providerId) || state.getActiveSession();
    let httpRuntime = openCodeHttpRuntimeForSession(session, state.sessions);
    if (!httpRuntime && session?.providerId === "opencode") {
      await get().startOpenCodeProvider(session.id);
      state = get();
      session = initializedProviderSession(providerId, state.sessions) || state.sessions.find((item) => item.id === session?.id) || state.sessions.find((item) => item.providerId === providerId) || state.getActiveSession();
      httpRuntime = openCodeHttpRuntimeForSession(session, state.sessions);
    }
    if (!httpRuntime) throw new Error("Session delete is not available.");
    await httpRuntime.runtime.client.deleteSession(providerSessionId);
    set((state) => ({
      providerSessionLists: {
        ...state.providerSessionLists,
        [providerId]: state.providerSessionLists[providerId]
          ? {
            ...state.providerSessionLists[providerId],
            sessions: state.providerSessionLists[providerId].sessions.filter((item) => item.sessionId !== providerSessionId),
            updatedAt: nowIso(),
          }
          : undefined,
      },
      sessions: state.sessions.map((item) => item.providerId === providerId && item.providerSessionId === providerSessionId
        ? appendDiagnosticToSession({
          ...item,
          providerSessionId: undefined,
          providerSessionState: undefined,
          status: item.status === "running" || item.status === "cancelling" ? "idle" : item.status,
          updatedAt: nowIso(),
        }, "info", `Session deleted: ${providerSessionId}`)
        : item),
    }));
  },

  resolveAgentPermission: (sessionId, requestId, optionId) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    const httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
    if (session?.providerSessionId && httpRuntime) {
      const reply = openCodePermissionReplyFromOption(optionId);
      void httpRuntime.runtime.client.replyPermission(requestId, { reply })
        .catch(() => httpRuntime.runtime.client.respondPermission(session.providerSessionId!, requestId, reply))
        .catch((error) => get().appendAgentDiagnostic(sessionId, "error", `Failed to answer OpenCode permission: ${error instanceof Error ? error.message : String(error)}`));
    }
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (session) => resolvePermissionInSession(session, requestId, optionId)),
    }));
  },

  refreshAgentSessionDiff: async (sessionId) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    const httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
    if (!session?.providerSessionId || !httpRuntime) return;
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (item) => ({ ...item, sessionDiffLoading: true, sessionDiffError: undefined, updatedAt: nowIso() })),
    }));
    try {
      const diff = await httpRuntime.runtime.client.sessionDiff(session.providerSessionId);
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => ({ ...item, sessionDiffs: normalizeOpenCodeFileDiffs(diff), sessionDiffLoading: false, sessionDiffError: undefined, updatedAt: nowIso() })),
      }));
    } catch (error) {
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => ({ ...item, sessionDiffLoading: false, sessionDiffError: error instanceof Error ? error.message : String(error), updatedAt: nowIso() })),
      }));
    }
  },

  compactAgentSession: async (sessionId) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    const httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
    const model = session ? openCodeModelFromSession(session) : undefined;
    if (!session?.providerSessionId || !httpRuntime || !model) {
      get().appendAgentDiagnostic(sessionId, "warn", "Cannot compact context until an OpenCode session and model are ready.");
      return;
    }
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, startCompactionInSession),
    }));
    try {
      await httpRuntime.runtime.client.summarizeSession(session.providerSessionId, { ...model, auto: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => failCompactionInSession(item, message)),
      }));
      get().appendAgentDiagnostic(sessionId, "error", `Failed to compact context: ${message}`);
    }
  },

  cleanupEmptySessions: async () => {
    let state = get();
    let removedCount = 0;
    const cleaned = cleanupEmptyAgentSessions(state.sessions, null);
    if (cleaned.removedCount > 0) {
      removedCount += cleaned.removedCount;
      set({ sessions: cleaned.sessions, activeSessionId: cleaned.activeSessionId });
      state = get();
    }

    const providerIds = new Set<AgentProviderId>([
      ...state.sessions.map((session) => session.providerId),
      ...(Object.keys(state.providerSessionLists) as AgentProviderId[]),
      "opencode",
    ]);
    for (const providerId of providerIds) {
      const httpRuntime = await ensureOpenCodeRuntime(providerId, get);
      if (!httpRuntime) continue;
      const deletedSessionIds = await cleanupEmptyProviderSessions(httpRuntime);
      if (deletedSessionIds.size === 0) continue;
      removedCount += deletedSessionIds.size;
      set((state) => removeDeletedProviderSessions(state, providerId, deletedSessionIds));
      state = get();
    }

    return removedCount;
  },

  resetAgentSession: () => {
    for (const entry of openCodeHttpRuntimes.values()) {
      entry.events.stop();
      void entry.runtime.stop().catch(() => undefined);
    }
    openCodeHttpRuntimes.clear();
    clearPacedTextBuffers();
    set(() => ({
      sessions: [createAgentSession()],
      activeSessionId: "agent-session-opencode",
      providerSessionLists: {},
    }));
  },
}));