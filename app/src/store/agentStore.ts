import { create } from "zustand";
import { AcpClient } from "../agent/acp/client";
import type { AcpInitializeResult, AcpNewSessionResult, AcpSessionListItem, AcpSessionListResult } from "../agent/acp/types";
import { hasAgentComposerContent } from "../agent/composer";
import { createOpenCodeAcpStartOptions, createOpenCodeInitializeParams } from "../agent/opencode/provider";
import { createAgentSession } from "../agent/sessionFactory";
import { buildSubmittedComposerPayload } from "../composer/submittedFeedback";
import { getAgentConsoleSettings } from "../agentConsoleSettings";
import { setOpenCodePreferredModel, syncOpenCodeModels } from "../openCodeSettings";
import type { AgentChoiceOption, AgentContentBlock, AgentDiagnosticEntry, AgentMessage, AgentSession } from "../agent/types";
import type { AgentProviderId } from "../agent/types";
import type { GitAction, ImageAttachment, MlcAttachment, WebAttachment } from "./feedbackStore";

export interface AgentProviderSessionListState {
  providerId: AgentProviderId;
  status: "idle" | "loading" | "ready" | "error" | "unsupported";
  capability: "supported" | "unsupported" | "unknown";
  sessions: AcpSessionListItem[];
  nextCursor?: string | null;
  error?: string;
  updatedAt?: string;
}

interface AgentAcpRuntimeEntry {
  sessionId: string;
  client: AcpClient;
}

const acpRuntimes = new Map<string, AgentAcpRuntimeEntry>();
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
  startOpenCodeAcp: (sessionId: string) => Promise<void>;
  stopOpenCodeAcp: (sessionId: string) => Promise<void>;
  receiveAgentProcessOutput: (processId: string, data: string) => void;
  receiveAgentProcessStderr: (processId: string, data: string) => void;
  receiveAgentProcessExit: (processId: string, exitCode: number | null) => void;
  receiveAgentProcessError: (processId: string, message: string) => void;
  sendAgentPrompt: (sessionId: string) => Promise<void>;
  refreshProviderSessions: (providerId: AgentProviderId, cursor?: string | null) => Promise<void>;
  restoreProviderSession: (providerId: AgentProviderId, providerSessionId: string) => Promise<void>;
  resolveMockPermission: (sessionId: string, requestId: string, optionId: string) => void;
  resetAgentSession: () => void;
}

function newId(prefix: string): string {
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

function createUserMessage(content: string): AgentMessage {
  return {
    id: newId("agent_user_msg"),
    role: "user",
    status: "complete",
    blocks: [textBlock(content)],
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

function normalizeAcpMethod(method: string): string {
  return method.replace(/[\/_-]/g, "").toLowerCase();
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

function optionCategory(option: unknown): string {
  if (!option || typeof option !== "object") return "";
  const value = option as Record<string, unknown>;
  return typeof value.category === "string" ? value.category : typeof value.id === "string" ? value.id : "";
}

function choicesFromConfigOption(option: unknown): AgentChoiceOption[] {
  if (!option || typeof option !== "object") return [];
  const value = option as Record<string, unknown>;
  if (!Array.isArray(value.options)) return [];
  return value.options
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const optionValue = item as Record<string, unknown>;
      return toChoiceOption(optionValue.value, optionValue.name, optionValue.description, optionValue);
    })
    .filter((choice): choice is AgentChoiceOption => Boolean(choice));
}

function currentValueFromConfigOption(option: unknown): string | undefined {
  if (!option || typeof option !== "object") return undefined;
  const currentValue = (option as Record<string, unknown>).currentValue;
  return typeof currentValue === "string" && currentValue ? currentValue : undefined;
}

function applyAcpSessionSetupResult(session: AgentSession, result: AcpNewSessionResult): AgentSession {
  const configOptions = Array.isArray(result.configOptions) ? result.configOptions : [];
  const modelConfig = configOptions.find((option) => optionCategory(option) === "model");
  const modeConfig = configOptions.find((option) => optionCategory(option) === "mode");
  const availableModels = Array.isArray(result.models?.availableModels)
    ? result.models.availableModels
      .map((model) => toChoiceOption(model.modelId, model.name, model.description, model))
      .filter((option): option is AgentChoiceOption => Boolean(option))
    : choicesFromConfigOption(modelConfig).length > 0 ? choicesFromConfigOption(modelConfig) : session.availableModels || [];
  const availableModes = Array.isArray(result.modes?.availableModes)
    ? result.modes.availableModes
      .map((mode) => toChoiceOption(mode.id, mode.name, mode.description))
      .filter((option): option is AgentChoiceOption => Boolean(option))
    : choicesFromConfigOption(modeConfig).length > 0 ? choicesFromConfigOption(modeConfig) : session.availableModes || [];
  const serverModelId = result.models?.currentModelId || currentValueFromConfigOption(modelConfig) || session.modelId || availableModels[0]?.id;
  const openCodeSettings = availableModels.length > 0 ? syncOpenCodeModels(availableModels, serverModelId) : null;
  const modelId = openCodeSettings?.preferredModelId || serverModelId;
  const modeId = result.modes?.currentModeId || currentValueFromConfigOption(modeConfig) || session.modeId || availableModes[0]?.id;

  return {
    ...session,
    providerSessionId: result.sessionId || session.providerSessionId,
    modelId,
    modeId,
    availableModels,
    availableModes,
    contextUsage: session.modelId === modelId ? session.contextUsage : undefined,
    configOptions: configOptions.length > 0 ? configOptions : session.configOptions,
    updatedAt: nowIso(),
  };
}

function runtimeForSession(session: AgentSession | undefined, sessions: AgentSession[] = []): AgentAcpRuntimeEntry | null {
  const processId = session?.providerRuntime?.processId;
  if (processId) return acpRuntimes.get(processId) || null;
  if (!session) return null;
  const providerRuntimeSession = sessions.find((item) => item.providerId === session.providerId && item.providerRuntime?.processId && item.providerRuntime.initialized);
  const providerProcessId = providerRuntimeSession?.providerRuntime?.processId;
  return providerProcessId ? acpRuntimes.get(providerProcessId) || null : null;
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
  return session.providerId === providerId &&
    session.providerSessionState === "provisional" &&
    !hasLocalSessionContent(session) &&
    session.status !== "running" &&
    session.status !== "starting" &&
    session.status !== "cancelling";
}

function describeAcpSessionSetup(result: AcpNewSessionResult): string {
  const modelCount = result.models?.availableModels?.length ?? choicesFromConfigOption((result.configOptions || []).find((option) => optionCategory(option) === "model")).length;
  const modeCount = result.modes?.availableModes?.length ?? choicesFromConfigOption((result.configOptions || []).find((option) => optionCategory(option) === "mode")).length;
  return `OpenCode ACP session created: ${result.sessionId} (${modelCount} models, ${modeCount} modes)`;
}

function extractTextContent(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const value = content as Record<string, unknown>;
  return value.type === "text" && typeof value.text === "string" ? value.text : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function providerSessionListCapability(session: AgentSession | undefined): AgentProviderSessionListState["capability"] {
  const capabilities = session?.providerRuntime?.agentCapabilities;
  if (!isRecord(capabilities)) return "unknown";
  const sessionCapabilities = isRecord(capabilities.sessionCapabilities) ? capabilities.sessionCapabilities : undefined;
  if (isRecord(sessionCapabilities?.list)) return "supported";
  if (sessionCapabilities && "list" in sessionCapabilities) return "unsupported";
  return "unknown";
}

function providerLoadSessionCapability(session: AgentSession | undefined): "supported" | "unsupported" | "unknown" {
  const capabilities = session?.providerRuntime?.agentCapabilities;
  if (!isRecord(capabilities)) return "unknown";
  if (capabilities.loadSession === true) return "supported";
  if ("loadSession" in capabilities) return "unsupported";
  return "unknown";
}

function normalizeAcpSessionListResult(result: unknown): { sessions: AcpSessionListItem[]; nextCursor?: string | null } {
  const rawSessions = Array.isArray(result)
    ? result
    : isRecord(result) && Array.isArray(result.sessions)
      ? result.sessions
      : [];
  const sessions = rawSessions
    .filter(isRecord)
    .map((item) => ({
      ...item,
      sessionId: typeof item.sessionId === "string" ? item.sessionId : typeof item.id === "string" ? item.id : "",
      cwd: typeof item.cwd === "string" ? item.cwd : null,
      title: typeof item.title === "string" ? item.title : null,
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : null,
      _meta: isRecord(item._meta) ? item._meta : null,
    }))
    .filter((item): item is AcpSessionListItem => Boolean(item.sessionId));
  return {
    sessions,
    nextCursor: isRecord(result) && typeof result.nextCursor === "string" ? result.nextCursor : null,
  };
}

function isMethodUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { message?: unknown; code?: unknown };
  const message = typeof value.message === "string" ? value.message.toLowerCase() : "";
  return value.code === -32601 || message.includes("method not found") || message.includes("not implemented") || message.includes("unknown method");
}

function insertProcessBlock(blocks: AgentContentBlock[], block: AgentContentBlock): AgentContentBlock[] {
  const firstResultIndex = blocks.findIndex((item) => item.origin.phase === "result");
  if (firstResultIndex < 0) return [...blocks, block];
  return [...blocks.slice(0, firstResultIndex), block, ...blocks.slice(firstResultIndex)];
}

function toolStatusFromAcp(status: unknown): "pending" | "running" | "completed" | "failed" | undefined {
  if (status === "pending") return "pending";
  if (status === "running" || status === "in_progress") return "running";
  if (status === "completed") return "completed";
  if (status === "failed" || status === "error") return "failed";
  return undefined;
}

function extractToolContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!isRecord(item)) return "";
        if (item.type === "content") return extractToolContentText(item.content);
        return extractTextContent(item);
      })
      .filter(Boolean)
      .join("\n");
  }
  if (isRecord(content)) return extractTextContent(content);
  return "";
}

function extractToolResult(update: Record<string, unknown>): string | undefined {
  const rawOutput = isRecord(update.rawOutput) ? update.rawOutput : undefined;
  if (typeof rawOutput?.output === "string" && rawOutput.output) return rawOutput.output;
  const contentText = extractToolContentText(update.content);
  return contentText || undefined;
}

function toolArgsFromRawInput(rawInput: unknown): Record<string, unknown> | undefined {
  if (rawInput == null) return undefined;
  if (isRecord(rawInput)) return rawInput;
  return { input: rawInput };
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

function taskStatusFromAcp(status: unknown): "not-started" | "in-progress" | "completed" {
  if (status === "in_progress" || status === "in-progress" || status === "running") return "in-progress";
  if (status === "completed" || status === "cancelled") return "completed";
  return "not-started";
}

function taskPriorityFromAcp(priority: unknown): "high" | "medium" | "low" | undefined {
  return priority === "high" || priority === "medium" || priority === "low" ? priority : undefined;
}

function taskEntriesFromUnknown(value: unknown): Array<{ content: string; status: unknown; priority: unknown }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const content = typeof item.content === "string" ? item.content : typeof item.title === "string" ? item.title : "";
      if (!content.trim()) return null;
      return { content, status: item.status, priority: item.priority };
    })
    .filter((item): item is { content: string; status: unknown; priority: unknown } => Boolean(item));
}

function todoEntriesFromToolUpdate(update: Record<string, unknown>): Array<{ content: string; status: unknown; priority: unknown }> {
  const rawInput = isRecord(update.rawInput) ? update.rawInput : undefined;
  const inputTodos = taskEntriesFromUnknown(rawInput?.todos);
  if (inputTodos.length > 0) return inputTodos;

  const rawOutput = isRecord(update.rawOutput) ? update.rawOutput : undefined;
  if (typeof rawOutput?.output === "string") {
    try {
      const parsed = JSON.parse(rawOutput.output) as unknown;
      const outputTodos = taskEntriesFromUnknown(parsed);
      if (outputTodos.length > 0) return outputTodos;
    } catch {}
  }

  const contentText = extractToolContentText(update.content);
  if (contentText) {
    try {
      const parsed = JSON.parse(contentText) as unknown;
      return taskEntriesFromUnknown(parsed);
    } catch {}
  }
  return [];
}

function isTodoToolUpdate(update: Record<string, unknown>): boolean {
  const title = typeof update.title === "string" ? update.title.toLowerCase() : "";
  const rawInput = isRecord(update.rawInput) ? update.rawInput : undefined;
  return title === "todowrite" || Array.isArray(rawInput?.todos);
}

function taskListTitle(completedCount: number, totalCount: number): string {
  return `待办事项 (${completedCount}/${totalCount})`;
}

function appendAssistantTextChunkImmediate(session: AgentSession, phase: "process" | "result", text: string, messageId?: string): AgentSession {
  if (!text) return session;
  const messages = [...session.messages];
  const lastMessage = messages[messages.length - 1];
  let assistantMessage = lastMessage?.role === "assistant" && lastMessage.status === "streaming" ? lastMessage : null;
  if (!assistantMessage) {
    assistantMessage = createStreamingAssistantMessage(messageId);
    messages.push(assistantMessage);
  }

  const targetType = phase === "process" ? "thinking" : "text";
  const blockIndex = assistantMessage.blocks.findIndex((block) => block.type === targetType && block.origin.phase === phase);
  let blocks = [...assistantMessage.blocks];
  if (blockIndex >= 0) {
    const block = blocks[blockIndex];
    if (block.type === "text") blocks[blockIndex] = { ...block, content: block.content + text, updatedAt: nowIso() };
    if (block.type === "thinking") blocks[blockIndex] = { ...block, content: block.content + text, status: "running", updatedAt: nowIso() };
  } else if (phase === "process") {
    blocks = insertProcessBlock(blocks, {
      id: newId("agent_thinking"),
      type: "thinking",
      content: text,
      status: "running",
      origin: { phase: "process", placement: "standalone" },
      createdAt: nowIso(),
    });
  } else {
    blocks.push(textBlock(text, "result"));
  }

  messages[messages.length - 1] = { ...assistantMessage, blocks, updatedAt: nowIso() };
  return { ...session, messages, updatedAt: nowIso() };
}

function pacedBufferKey(sessionId: string, phase: "process" | "result", messageId?: string): string {
  return `${sessionId}:${messageId || "active"}:${phase}`;
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
      sessions: updateSession(state.sessions, buffer.sessionId, (session) => appendAssistantTextChunkImmediate(session, buffer.phase, text, buffer.messageId)),
    }));
  }

  if (buffer.pending) {
    buffer.timer = setTimeout(() => flushPacedTextBuffer(key), buffer.draining ? STREAM_DRAIN_INTERVAL_MS : STREAM_FLUSH_INTERVAL_MS);
    return;
  }
  pacedTextBuffers.delete(key);
  resolvePacedBuffer(buffer);
}

function appendAssistantTextChunk(session: AgentSession, phase: "process" | "result", text: string, messageId?: string): AgentSession {
  if (!text) return session;
  if (!getAgentConsoleSettings().smoothStreamingOutput) {
    return appendAssistantTextChunkImmediate(session, phase, text, messageId);
  }

  const key = pacedBufferKey(session.id, phase, messageId);
  const buffer = pacedTextBuffers.get(key) || {
    sessionId: session.id,
    phase,
    messageId,
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

function applyAcpToolCallUpdate(session: AgentSession, update: Record<string, unknown>, messageId?: string): AgentSession {
  const toolCallId = typeof update.toolCallId === "string" && update.toolCallId ? update.toolCallId : undefined;
  if (!toolCallId) return appendDiagnosticToSession(session, "warn", "ACP tool update did not include a toolCallId.");

  const messages = [...session.messages];
  const blockId = `agent_tool_${toolCallId}`;
  let targetMessageIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.blocks.some((block) => block.type === "tool_call" && block.id === blockId)) {
      targetMessageIndex = index;
      break;
    }
  }
  if (targetMessageIndex < 0) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant" && message.status === "streaming") {
        targetMessageIndex = index;
        break;
      }
    }
  }
  if (targetMessageIndex < 0) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant") {
        targetMessageIndex = index;
        break;
      }
    }
  }

  let assistantMessage = targetMessageIndex >= 0 ? messages[targetMessageIndex] : null;
  if (!assistantMessage) {
    assistantMessage = createStreamingAssistantMessage(messageId);
    messages.push(assistantMessage);
    targetMessageIndex = messages.length - 1;
  }

  const status = toolStatusFromAcp(update.status);
  const title = typeof update.title === "string" && update.title ? update.title : undefined;
  const kind = typeof update.kind === "string" && update.kind ? update.kind : undefined;
  const name = kind || title || toolCallId;
  const label = title || kind || toolCallId;
  const args = toolArgsFromRawInput(update.rawInput);
  const result = extractToolResult(update);
  let blocks = [...assistantMessage.blocks];
  const blockIndex = blocks.findIndex((block) => block.type === "tool_call" && block.id === blockId);

  if (blockIndex >= 0) {
    const block = blocks[blockIndex];
    if (block.type === "tool_call") {
      blocks[blockIndex] = {
        ...block,
        name: name || block.name,
        title: title || block.title,
        label: label || block.label,
        status: status || block.status,
        args: args || block.args,
        result: result || block.result,
        updatedAt: nowIso(),
      };
    }
  } else {
    blocks = insertProcessBlock(blocks, {
      id: blockId,
      type: "tool_call",
      name,
      title,
      label,
      status: status || "pending",
      args,
      result,
      origin: { phase: "process", placement: "standalone" },
      createdAt: nowIso(),
    });
  }

  messages[targetMessageIndex] = { ...assistantMessage, blocks, updatedAt: nowIso() };
  return { ...session, messages, updatedAt: nowIso() };
}

function applyAcpTaskListUpdate(session: AgentSession, entries: Array<{ content: string; status: unknown; priority: unknown }>, messageId?: string): AgentSession {
  if (entries.length === 0) return session;
  const tasks = entries.map((entry, index) => ({
    id: `agent_task_${index}_${stableHash(entry.content)}`,
    title: entry.content,
    status: taskStatusFromAcp(entry.status),
    priority: taskPriorityFromAcp(entry.priority),
  }));
  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const title = taskListTitle(completedCount, tasks.length);
  const messages = [...session.messages];
  let targetMessageIndex = -1;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.blocks.some((block) => block.type === "task_list")) {
      targetMessageIndex = index;
      break;
    }
  }
  if (targetMessageIndex < 0) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant" && message.status === "streaming") {
        targetMessageIndex = index;
        break;
      }
    }
  }
  if (targetMessageIndex < 0) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant") {
        targetMessageIndex = index;
        break;
      }
    }
  }

  let assistantMessage = targetMessageIndex >= 0 ? messages[targetMessageIndex] : null;
  if (!assistantMessage) {
    assistantMessage = createStreamingAssistantMessage(messageId);
    messages.push(assistantMessage);
    targetMessageIndex = messages.length - 1;
  }

  let blocks = [...assistantMessage.blocks];
  const blockIndex = blocks.findIndex((block) => block.type === "task_list");
  if (blockIndex >= 0) {
    const block = blocks[blockIndex];
    if (block.type === "task_list") {
      blocks[blockIndex] = { ...block, title, tasks, updatedAt: nowIso() };
    }
  } else {
    blocks = insertProcessBlock(blocks, {
      id: newId("agent_task_list"),
      type: "task_list",
      title,
      tasks,
      origin: { phase: "process", placement: "standalone" },
      createdAt: nowIso(),
    });
  }

  messages[targetMessageIndex] = { ...assistantMessage, blocks, updatedAt: nowIso() };
  return { ...session, messages, updatedAt: nowIso() };
}

function removeToolCallBlock(session: AgentSession, toolCallId: unknown): AgentSession {
  if (typeof toolCallId !== "string" || !toolCallId) return session;
  const blockId = `agent_tool_${toolCallId}`;
  let changed = false;
  const messages = session.messages.map((message) => {
    const blocks = message.blocks.filter((block) => !(block.type === "tool_call" && block.id === blockId));
    if (blocks.length === message.blocks.length) return message;
    changed = true;
    return { ...message, blocks, updatedAt: nowIso() };
  });
  return changed ? { ...session, messages, updatedAt: nowIso() } : session;
}

function completeStreamingAssistant(session: AgentSession): AgentSession {
  return {
    ...session,
    messages: session.messages.map((message) => message.role === "assistant" && message.status === "streaming"
      ? {
        ...message,
        status: "complete",
        blocks: message.blocks.map((block) => block.type === "thinking" ? { ...block, status: "completed", updatedAt: nowIso() } : block),
        updatedAt: nowIso(),
      }
      : message),
    updatedAt: nowIso(),
  };
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

function applyAcpSessionUpdate(session: AgentSession, params: unknown): AgentSession {
  if (!params || typeof params !== "object") return session;
  const payload = params as Record<string, unknown>;
  const update = payload.update;
  if (!update || typeof update !== "object") return session;
  const value = update as Record<string, unknown>;
  const updateType = typeof value.sessionUpdate === "string" ? value.sessionUpdate : "";
  const messageId = typeof value.messageId === "string" ? value.messageId : undefined;

  if (updateType === "agent_message_chunk") {
    return appendAssistantTextChunk(session, "result", extractTextContent(value.content), messageId);
  }
  if (updateType === "agent_thought_chunk") {
    return appendAssistantTextChunk(session, "process", extractTextContent(value.content), messageId);
  }
  if (updateType === "plan") {
    return applyAcpTaskListUpdate(session, taskEntriesFromUnknown(value.entries), messageId);
  }
  if (updateType === "tool_call" || updateType === "tool_call_update") {
    if (isTodoToolUpdate(value)) {
      const withTasks = applyAcpTaskListUpdate(session, todoEntriesFromToolUpdate(value), messageId);
      return removeToolCallBlock(withTasks, value.toolCallId);
    }
    return applyAcpToolCallUpdate(session, value, messageId);
  }
  if (updateType === "user_message_chunk") {
    return session;
  }
  if (updateType === "usage_update") {
    const usedTokens = finitePositiveNumber(value.used);
    const contextLimit = finitePositiveNumber(value.size);
    if (!usedTokens || !contextLimit) return appendDiagnosticToSession(session, "info", "ACP usage update did not include context size.");
    const cost = value.cost && typeof value.cost === "object" ? value.cost as Record<string, unknown> : undefined;
    return {
      ...session,
      contextUsage: {
        usedTokens,
        contextLimit,
        cost: cost ? {
          amount: finitePositiveNumber(cost.amount),
          currency: typeof cost.currency === "string" ? cost.currency : undefined,
        } : undefined,
        updatedAt: nowIso(),
      },
      updatedAt: nowIso(),
    };
  }
  return appendDiagnosticToSession(session, "info", `ACP update: ${updateType || "unknown"}`);
}

const AGENT_COMMAND_PROMPTS = [
  { name: "plan", description: "Plan the agent task before editing", content: "Analyze the task, inspect relevant files, and outline the implementation plan before making changes.", icon: "checklist" },
  { name: "edit", description: "Implement the requested change", content: "Implement the requested change using the existing project conventions and keep the edit focused.", icon: "edit" },
  { name: "review", description: "Review current code and risks", content: "Review the relevant code for bugs, regressions, missing validation, and risks before summarizing findings.", icon: "search" },
  { name: "test", description: "Run or prepare validation steps", content: "Validate the change with the appropriate diagnostics, tests, or build checks for this project.", icon: "play" },
];

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

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  setSessionMode: (sessionId, modeId) => {
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (session) => ({ ...session, modeId, updatedAt: nowIso() })),
    }));
    const session = get().sessions.find((item) => item.id === sessionId);
    const runtime = runtimeForSession(session, get().sessions);
    if (!runtime || !session?.providerSessionId) return;
    void runtime.client.request("session/set_mode", { sessionId: session.providerSessionId, modeId })
      .catch((error) => get().appendAgentDiagnostic(sessionId, "error", `Failed to set ACP mode: ${error instanceof Error ? error.message : String(error)}`));
  },

  setSessionModel: (sessionId, modelId) => {
    setOpenCodePreferredModel(modelId);
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (session) => ({ ...session, modelId, contextUsage: undefined, updatedAt: nowIso() })),
    }));
    const session = get().sessions.find((item) => item.id === sessionId);
    const runtime = runtimeForSession(session, get().sessions);
    if (!runtime || !session?.providerSessionId) return;
    void runtime.client.request("session/set_model", { sessionId: session.providerSessionId, modelId })
      .catch((error) => get().appendAgentDiagnostic(sessionId, "error", `Failed to set ACP model: ${error instanceof Error ? error.message : String(error)}`));
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

  startOpenCodeAcp: async (sessionId) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    if (!session) return;
    if (session.providerRuntime?.processId) {
      await get().stopOpenCodeAcp(sessionId);
    }

    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
        ...item,
        status: "starting",
        providerRuntime: { initialized: false },
      }, "info", "Starting OpenCode ACP provider...")),
    }));

    const client = new AcpClient({
      onDiagnostic: (level, message) => get().appendAgentDiagnostic(sessionId, level, message),
      onNotification: (method, params) => {
        const normalized = normalizeAcpMethod(method);
        if (normalized === "sessionupdate") {
          set((state) => ({
            sessions: updateSession(state.sessions, sessionId, (item) => applyAcpSessionUpdate(item, params)),
          }));
          return;
        }
        get().appendAgentDiagnostic(sessionId, "info", `ACP notification: ${method}`);
      },
      onRequest: (method, params) => {
        const normalized = normalizeAcpMethod(method);
        if (normalized === "sessionupdate") {
          set((state) => ({
            sessions: updateSession(state.sessions, sessionId, (item) => applyAcpSessionUpdate(item, params)),
          }));
          return null;
        }
        if (normalized === "requestpermission") {
          get().appendAgentDiagnostic(sessionId, "warn", "ACP permission requests are visible in diagnostics only for this build; rejecting by default.");
          return { outcome: { outcome: "cancelled" } };
        }
        get().appendAgentDiagnostic(sessionId, "warn", `ACP client request is not implemented yet: ${method}`);
        throw new Error(`ACP client request is not implemented yet: ${method}`);
      },
    });

    try {
      const info = await client.start(createOpenCodeAcpStartOptions(session.cwd));
      acpRuntimes.set(info.processId, { sessionId, client });
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => ({
          ...item,
          cwd: info.cwd,
          status: "running",
          providerRuntime: {
            processId: info.processId,
            command: info.command,
            args: info.args,
            initialized: false,
          },
          updatedAt: nowIso(),
        })),
      }));

      get().appendAgentDiagnostic(sessionId, "info", "Sending ACP initialize request...");
      const initializeResult = await client.request<AcpInitializeResult>("initialize", createOpenCodeInitializeParams());
      get().appendAgentDiagnostic(sessionId, "info", `ACP initialize returned${initializeResult.agentInfo?.version ? `: OpenCode ${initializeResult.agentInfo.version}` : "."}`);
      const canLoadExistingSession = Boolean(
        session.providerSessionId &&
        session.providerSessionState !== "provisional" &&
        providerLoadSessionCapability({
          ...session,
          providerRuntime: { ...session.providerRuntime, agentCapabilities: initializeResult.agentCapabilities },
        }) === "supported"
      );
      if (canLoadExistingSession) {
        get().appendAgentDiagnostic(sessionId, "info", "Loading OpenCode ACP session...");
        const sessionResult = await client.request<AcpNewSessionResult>("session/load", {
          sessionId: session.providerSessionId,
          cwd: info.cwd,
          mcpServers: [],
        });
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
            ...applyAcpSessionSetupResult(item, sessionResult),
            providerSessionState: item.providerSessionState || "restored",
            status: "idle",
            providerRuntime: {
              ...item.providerRuntime,
              initialized: true,
              protocolVersion: initializeResult.protocolVersion,
              agentInfo: initializeResult.agentInfo,
              agentCapabilities: initializeResult.agentCapabilities,
              authMethods: initializeResult.authMethods,
            },
          }, "info", `OpenCode ACP session loaded: ${sessionResult.sessionId || session.providerSessionId}.`)),
        }));
        const configuredSession = get().sessions.find((item) => item.id === sessionId);
        if (configuredSession?.providerSessionId && configuredSession.modelId && configuredSession.modelId !== sessionResult.models?.currentModelId) {
          await client.request("session/set_model", { sessionId: configuredSession.providerSessionId, modelId: configuredSession.modelId })
            .then(() => get().appendAgentDiagnostic(sessionId, "info", `OpenCode model selected: ${configuredSession.modelId}`))
            .catch((error) => get().appendAgentDiagnostic(sessionId, "warn", `Failed to apply preferred OpenCode model: ${error instanceof Error ? error.message : String(error)}`));
        }
      } else {
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
            ...item,
            status: "idle",
            providerRuntime: {
              ...item.providerRuntime,
              initialized: true,
              protocolVersion: initializeResult.protocolVersion,
              agentInfo: initializeResult.agentInfo,
              agentCapabilities: initializeResult.agentCapabilities,
              authMethods: initializeResult.authMethods,
            },
            updatedAt: nowIso(),
          }, "info", "OpenCode ACP provider initialized. Session will be created on first prompt.")),
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await client.stop().catch(() => undefined);
      for (const [processId, entry] of acpRuntimes) {
        if (entry.client === client) acpRuntimes.delete(processId);
      }
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
          ...item,
          status: "error",
          providerRuntime: { ...item.providerRuntime, processId: undefined, initialized: false },
        }, "error", `Failed to start OpenCode ACP: ${message}`)),
      }));
    }
  },

  stopOpenCodeAcp: async (sessionId) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    const processId = session?.providerRuntime?.processId;
    if (!processId) return;
    const runtime = acpRuntimes.get(processId);
    acpRuntimes.delete(processId);
    clearPacedTextBuffers(sessionId);
    await runtime?.client.stop().catch(() => undefined);
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
        ...item,
        status: "disconnected",
        providerRuntime: { ...item.providerRuntime, processId: undefined, initialized: false },
      }, "info", "OpenCode ACP provider stopped.")),
    }));
  },

  receiveAgentProcessOutput: (processId, data) => {
    acpRuntimes.get(processId)?.client.handleStdout(data);
  },

  receiveAgentProcessStderr: (processId, data) => {
    acpRuntimes.get(processId)?.client.handleStderr(data);
  },

  receiveAgentProcessExit: (processId, exitCode) => {
    const runtime = acpRuntimes.get(processId);
    if (!runtime) return;
    runtime.client.handleExit(exitCode);
    acpRuntimes.delete(processId);
    set((state) => ({
      sessions: updateSession(state.sessions, runtime.sessionId, (session) => appendDiagnosticToSession({
        ...session,
        status: "disconnected",
        providerRuntime: { ...session.providerRuntime, processId: undefined, initialized: false },
      }, exitCode === 0 || exitCode === null ? "info" : "warn", `OpenCode ACP process exited${exitCode === null ? "" : ` with code ${exitCode}`}.`)),
    }));
  },

  receiveAgentProcessError: (processId, message) => {
    const runtime = acpRuntimes.get(processId);
    if (!runtime) return;
    get().appendAgentDiagnostic(runtime.sessionId, "error", message);
  },

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
      prompts: AGENT_COMMAND_PROMPTS,
      mainHeading: "User Prompt",
      quickActionHeading: "Agent Requirement",
      includeSystemReminder: false,
      includePayloadRouting: false,
    });

    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (item) => ({
        ...item,
        status: "running",
        draft: "",
        testLogText: "",
        gitAction: null,
        images: [],
        mlcAttachments: [],
        webAttachments: [],
        messages: [...item.messages, createUserMessage(submittedPrompt.markdown), createStreamingAssistantMessage()],
        updatedAt: nowIso(),
      })),
    }));

    try {
      session = get().sessions.find((item) => item.id === sessionId);
      if (!runtimeForSession(session, get().sessions)) {
        await get().startOpenCodeAcp(sessionId);
      }
      session = get().sessions.find((item) => item.id === sessionId);
      if (!session) throw new Error("OpenCode ACP provider is not connected");
      const runtime = runtimeForSession(session, get().sessions);
      if (!runtime) throw new Error("OpenCode ACP runtime is not available");

      let providerSessionId = session.providerSessionId;
      if (!providerSessionId) {
        const result = await runtime.client.request<AcpNewSessionResult>("session/new", {
          cwd: session.cwd,
          mcpServers: [],
        });
        providerSessionId = result.sessionId;
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
            ...applyAcpSessionSetupResult(item, result),
            providerSessionState: "provisional",
          }, "info", `OpenCode ACP session created: ${providerSessionId}`)),
        }));
        const configuredSession = get().sessions.find((item) => item.id === sessionId);
        if (configuredSession?.providerSessionId && configuredSession.modelId && configuredSession.modelId !== result.models?.currentModelId) {
          await runtime.client.request("session/set_model", { sessionId: configuredSession.providerSessionId, modelId: configuredSession.modelId })
            .then(() => get().appendAgentDiagnostic(sessionId, "info", `OpenCode model selected: ${configuredSession.modelId}`))
            .catch((error) => get().appendAgentDiagnostic(sessionId, "warn", `Failed to apply preferred OpenCode model: ${error instanceof Error ? error.message : String(error)}`));
        }
      }

      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => ({
          ...item,
          providerSessionState: "active",
          updatedAt: nowIso(),
        })),
      }));

      await runtime.client.request("session/prompt", {
        sessionId: providerSessionId,
        prompt: [{ type: "text", text: submittedPrompt.historyText || submittedPrompt.markdown }],
      }, 10 * 60 * 1000);
      await drainPacedTextBuffers(sessionId);

      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => ({
          ...completeStreamingAssistant(item),
          providerSessionState: "active",
          status: "idle",
        })),
      }));
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

  refreshProviderSessions: async (providerId, cursor = null) => {
    const session = get().sessions.find((item) => item.providerId === providerId) || get().getActiveSession();
    const capability = providerSessionListCapability(session);
    const existing = get().providerSessionLists[providerId];
    set((state) => ({
      providerSessionLists: {
        ...state.providerSessionLists,
        [providerId]: {
          providerId,
          status: capability === "unsupported" ? "unsupported" : "loading",
          capability,
          sessions: cursor ? existing?.sessions || [] : [],
          nextCursor: cursor,
          error: capability === "unsupported" ? "Provider does not advertise ACP session/list support." : undefined,
          updatedAt: existing?.updatedAt,
        },
      },
    }));
    if (capability === "unsupported") return;
    const runtime = runtimeForSession(session, get().sessions);
    if (!session || !runtime || !session.providerRuntime?.initialized) {
      set((state) => ({
        providerSessionLists: {
          ...state.providerSessionLists,
          [providerId]: {
            providerId,
            status: "error",
            capability,
            sessions: existing?.sessions || [],
            nextCursor: existing?.nextCursor,
            error: "Start the provider before listing ACP sessions.",
            updatedAt: existing?.updatedAt,
          },
        },
      }));
      return;
    }

    try {
      const result = await runtime.client.request<AcpSessionListResult>("session/list", {
        cwd: session.cwd || undefined,
        cursor: cursor || undefined,
      });
      const normalized = normalizeAcpSessionListResult(result);
      set((state) => ({
        providerSessionLists: {
          ...state.providerSessionLists,
          [providerId]: {
            providerId,
            status: "ready",
            capability: capability === "unknown" ? "supported" : capability,
            sessions: cursor ? [...(existing?.sessions || []), ...normalized.sessions] : normalized.sessions,
            nextCursor: normalized.nextCursor,
            updatedAt: nowIso(),
          },
        },
      }));
    } catch (error) {
      const unsupported = isMethodUnavailableError(error);
      set((state) => ({
        providerSessionLists: {
          ...state.providerSessionLists,
          [providerId]: {
            providerId,
            status: unsupported ? "unsupported" : "error",
            capability: unsupported ? "unsupported" : capability,
            sessions: existing?.sessions || [],
            nextCursor: existing?.nextCursor,
            error: error instanceof Error ? error.message : String(error),
            updatedAt: existing?.updatedAt,
          },
        },
      }));
    }
  },

  restoreProviderSession: async (providerId, providerSessionId) => {
    const state = get();
    const runtimeOwner = initializedProviderSession(providerId, state.sessions);
    const existingSession = state.sessions.find((item) => item.providerId === providerId && item.providerSessionId === providerSessionId && item.providerSessionState !== "provisional");
    if (existingSession) {
      set((state) => ({
        activeSessionId: existingSession.id,
        sessions: runtimeOwner?.providerRuntime ? updateSession(state.sessions, existingSession.id, (item) => ({
          ...item,
          providerRuntime: runtimeOwner.providerRuntime,
          updatedAt: nowIso(),
        })) : state.sessions,
      }));
      return;
    }

    const session = runtimeOwner || state.sessions.find((item) => item.providerId === providerId) || state.getActiveSession();
    const runtime = runtimeForSession(session, state.sessions);
    const loadCapability = providerLoadSessionCapability(runtimeOwner || session);
    if (!session || !runtime || !runtimeOwner?.providerRuntime?.initialized) {
      throw new Error("Start the provider before restoring ACP sessions.");
    }
    if (loadCapability !== "supported") {
      throw new Error("Provider does not advertise ACP session/load support.");
    }

    const listItem = state.providerSessionLists[providerId]?.sessions.find((item) => item.sessionId === providerSessionId);
    const activeSession = state.getActiveSession();
    const reusableSession = activeSession && isReusableProvisionalSession(activeSession, providerId)
      ? activeSession
      : state.sessions.find((item) => isReusableProvisionalSession(item, providerId));
    const targetSessionId = reusableSession?.id || newId("agent_session");

    const result = await runtime.client.request<AcpNewSessionResult>("session/load", {
      sessionId: providerSessionId,
      cwd: session.cwd,
      mcpServers: [],
    });
    set((state) => ({
      activeSessionId: targetSessionId,
      sessions: reusableSession
        ? updateSession(state.sessions, reusableSession.id, (item) => appendDiagnosticToSession({
          ...applyAcpSessionSetupResult({
            ...item,
            title: listItem?.title || item.title,
            cwd: listItem?.cwd || item.cwd || session.cwd,
            providerRuntime: runtimeOwner.providerRuntime || item.providerRuntime,
          }, { ...result, sessionId: result.sessionId || providerSessionId }),
          providerSessionState: "restored",
          status: "idle",
        }, "info", `ACP session restored: ${providerSessionId}`))
        : [...state.sessions, appendDiagnosticToSession({
          ...applyAcpSessionSetupResult({
            ...createAgentSession(),
            id: targetSessionId,
            providerId,
            title: listItem?.title || session.title,
            cwd: listItem?.cwd || session.cwd,
            providerRuntime: runtimeOwner.providerRuntime || session.providerRuntime,
            modelId: session.modelId,
            modeId: session.modeId,
            availableModels: session.availableModels || [],
            availableModes: session.availableModes || [],
            configOptions: session.configOptions || [],
            status: "idle",
            createdAt: nowIso(),
            updatedAt: nowIso(),
          }, { ...result, sessionId: result.sessionId || providerSessionId }),
          providerSessionState: "restored",
          status: "idle",
        }, "info", `ACP session restored: ${providerSessionId}`)],
    }));
  },

  resolveMockPermission: (sessionId, requestId, optionId) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => ({
      ...session,
      pendingPermissionIds: session.pendingPermissionIds.filter((id) => id !== requestId),
      messages: session.messages.map((message) => ({
        ...message,
        blocks: message.blocks.map((block) => block.type === "permission" && block.requestId === requestId
          ? { ...block, status: "resolved", selectedOptionId: optionId, updatedAt: nowIso() }
          : block),
      })),
      updatedAt: nowIso(),
    })),
  })),

  resetAgentSession: () => {
    for (const runtime of acpRuntimes.values()) {
      void runtime.client.stop().catch(() => undefined);
    }
    acpRuntimes.clear();
    clearPacedTextBuffers();
    set(() => ({
      sessions: [createAgentSession()],
      activeSessionId: "agent-session-opencode",
      providerSessionLists: {},
    }));
  },
}));