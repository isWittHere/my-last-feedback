import { create } from "zustand";
import { hasAgentComposerContent } from "../agent/composer";
import { normalizeOpenCodeEvent, normalizeOpenCodePart, normalizeOpenCodeTodos, startOpenCodeServerRuntime } from "../agent/opencode";
import type { OpenCodeAgentInfo, OpenCodeBusEvent, OpenCodeCommandFilePart, OpenCodeCommandInfo, OpenCodeMessage, OpenCodeMessageInfo, OpenCodeMessagePart, OpenCodePermissionReply, OpenCodePermissionRule, OpenCodePromptPart, OpenCodeProviderResponse, OpenCodeServerRuntime, OpenCodeSessionInfo, OpenCodeSseConnection } from "../agent/opencode";
import { createAgentSession } from "../agent/sessionFactory";
import { buildSubmittedComposerPayload, collectSubmittedResourceLinks } from "../composer/submittedFeedback";
import { getAgentConsoleSettings } from "../agentConsoleSettings";
import { getOpenCodeDefaultPermissionRules, getOpenCodePermissionPresetRules, openCodePermissionActionToRules, setOpenCodePreferredModel, syncOpenCodeModels, type OpenCodePermissionPresetId, type OpenCodePermissionSettingAction } from "../openCodeSettings";
import type { AgentChoiceOption, AgentCompactionBlock, AgentContentBlock, AgentContextCompactionConfig, AgentContextUsage, AgentDiagnosticEntry, AgentMessage, AgentModelCapabilities, AgentProviderMessagePart, AgentSession, AgentSessionFileDiff, AgentSubmittedAttachmentTag, AgentThinkingBlock, AgentTokenUsage } from "../agent/types";
import type { AgentProviderId } from "../agent/types";
import type { GitAction, ImageAttachment, MlcAttachment, WebAttachment } from "./feedbackStore";
import { normalizeWorkspacePath, workspacePathKey } from "../workspace/workspacePaths";
import { resolveAgentName } from "../identity/agentIdentity";

export interface AgentProviderSessionListState {
  providerId: AgentProviderId;
  status: "idle" | "loading" | "ready" | "error" | "unsupported";
  preparationStatus?: "preparing" | "ready";
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

interface AgentSessionDiffRefreshOptions {
  silent?: boolean;
  preserveExistingOnEmpty?: boolean;
}

interface AgentOpenCodeHttpRuntimeEntry {
  sessionId: string;
  runtime: OpenCodeServerRuntime;
  events: OpenCodeSseConnection;
  lastBackfillAt?: number;
}

const openCodeHttpRuntimes = new Map<string, AgentOpenCodeHttpRuntimeEntry>();
const OPEN_CODE_RECONNECT_BACKFILL_MIN_INTERVAL_MS = 30_000;
const OPEN_CODE_SESSION_LIST_IDLE_REFRESH_DELAY_MS = 700;

let openCodeIdLastTimestamp = 0;
let openCodeIdCounter = 0;
const openCodeSessionListRefreshTimers = new Map<string, number>();

interface CompactionSummaryRoute {
  sessionId: string;
  blockId: string;
  providerCompactionMessageId?: string;
}

const compactionSummaryRoutes = new Map<string, CompactionSummaryRoute>();

interface AgentStoreState {
  sessions: AgentSession[];
  activeSessionId: string | null;
  providerSessionLists: Partial<Record<AgentProviderId, AgentProviderSessionListState>>;
  getActiveSession: () => AgentSession | null;
  createNewSession: (options?: { cwd?: string | null; workspaceKey?: string | null; fallbackToActiveCwd?: boolean }) => string;
  setActiveSession: (sessionId: string) => void;
  setSessionWorkspace: (sessionId: string, cwd: string | null) => void;
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
  startOpenCodeProvider: (sessionId: string, options?: { silent?: boolean }) => Promise<void>;
  stopOpenCodeProvider: (sessionId: string) => Promise<void>;
  ensureAgentCommands: (sessionId: string, options?: { force?: boolean }) => Promise<void>;
  receiveAgentProcessOutput: (processId: string, data: string) => void;
  receiveAgentProcessStderr: (processId: string, data: string) => void;
  receiveAgentProcessExit: (processId: string, exitCode: number | null) => void;
  receiveAgentProcessError: (processId: string, message: string) => void;
  sendAgentPrompt: (sessionId: string) => Promise<void>;
  abortAgentPrompt: (sessionId: string) => Promise<void>;
  forkAgentSessionFromMessage: (sessionId: string, messageId: string) => Promise<void>;
  refreshProviderSessions: (providerId: AgentProviderId, cursor?: string | null) => Promise<void>;
  restoreProviderSession: (providerId: AgentProviderId, providerSessionId: string) => Promise<void>;
  renameProviderSession: (providerId: AgentProviderId, providerSessionId: string, title: string) => Promise<void>;
  deleteProviderSession: (providerId: AgentProviderId, providerSessionId: string) => Promise<void>;
  updateOpenCodeSessionPermission: (sessionId: string, permission: string, action: OpenCodePermissionSettingAction) => Promise<void>;
  applyOpenCodeSessionPermissionPreset: (sessionId: string, presetId: OpenCodePermissionPresetId) => Promise<void>;
  resetOpenCodeSessionPermissions: (sessionId: string) => Promise<void>;
  resolveAgentPermission: (sessionId: string, requestId: string, optionId: string) => void;
  refreshAgentSessionDiff: (sessionId: string, options?: AgentSessionDiffRefreshOptions) => Promise<void>;
  compactAgentSession: (sessionId: string) => Promise<void>;
  cleanupEmptySessions: () => Promise<number>;
  resetAgentSession: () => void;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

function randomBase62(length: number): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(length);
  if (crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

function createOpenCodeAscendingId(prefix: "message" | "part"): string {
  const currentTimestamp = Date.now();
  if (currentTimestamp !== openCodeIdLastTimestamp) {
    openCodeIdLastTimestamp = currentTimestamp;
    openCodeIdCounter = 0;
  }
  openCodeIdCounter += 1;
  const prefixText = prefix === "message" ? "msg" : "prt";
  const encoded = BigInt(currentTimestamp) * BigInt(0x1000) + BigInt(openCodeIdCounter);
  const hex = encoded.toString(16).padStart(12, "0").slice(-12);
  return `${prefixText}_${hex}${randomBase62(14)}`;
}

function openCodePromptPartsWithIds(parts: OpenCodePromptPart[]): OpenCodePromptPart[] {
  return parts.map((part) => ({ ...part, id: part.id || createOpenCodeAscendingId("part") }));
}

function normalizeOpenCodeDirectory(value: string | null | undefined): string | undefined {
  const normalized = workspacePathKey(value);
  return normalized || undefined;
}

function normalizeAgentCwd(value?: string | null): string {
  return normalizeWorkspacePath(value) || "";
}

function openCodeRuntimeMatchesSessionCwd(runtime: AgentOpenCodeHttpRuntimeEntry | null | undefined, session: AgentSession): boolean {
  if (!runtime) return false;
  const sessionDirectory = normalizeOpenCodeDirectory(session.cwd);
  if (!sessionDirectory) return true;
  const runtimeDirectory = normalizeOpenCodeDirectory(runtime.runtime.processInfo.cwd);
  return runtimeDirectory === sessionDirectory;
}

function openCodeGlobalEventMatchesRuntime(event: OpenCodeBusEvent, runtime: OpenCodeServerRuntime, ownerSession: AgentSession): boolean {
  const eventDirectory = normalizeOpenCodeDirectory(event.directory);
  if (!eventDirectory) return true;
  const runtimeDirectory = normalizeOpenCodeDirectory(runtime.processInfo.cwd);
  const sessionDirectory = normalizeOpenCodeDirectory(ownerSession.cwd);
  return eventDirectory === runtimeDirectory || eventDirectory === sessionDirectory;
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

function mergeThinkingContent(existing: string, incoming: string): string {
  const existingContent = existing.trim();
  const incomingContent = incoming.trim();
  if (!existingContent) return incomingContent;
  if (!incomingContent) return existingContent;
  if (existingContent === incomingContent) return existingContent;
  if (incomingContent.length >= 12 && existingContent.endsWith(incomingContent)) return existingContent;
  if (existingContent.length >= 12 && incomingContent.startsWith(existingContent)) return incomingContent;
  return `${existingContent}\n\n${incomingContent}`;
}

function createUserMessage(content: string, options: Partial<Pick<AgentMessage, "id" | "providerMessageId" | "providerParts" | "composerDraft" | "submittedMarkdown" | "submittedAttachmentTags">> = {}): AgentMessage {
  return {
    id: options.id || newId("agent_user_msg"),
    role: "user",
    status: "complete",
    blocks: [textBlock(content)],
    providerMessageId: options.providerMessageId || options.id,
    providerParts: options.providerParts,
    composerDraft: options.composerDraft,
    submittedMarkdown: options.submittedMarkdown,
    submittedAttachmentTags: options.submittedAttachmentTags,
    createdAt: nowIso(),
  };
}

function createSubmittedAttachmentTag(kind: AgentSubmittedAttachmentTag["kind"], label?: string, detail?: string): AgentSubmittedAttachmentTag {
  return {
    id: newId("agent_attachment"),
    kind,
    label: label?.trim() || undefined,
    detail: detail?.trim() || undefined,
  };
}

function submittedGitActionDetail(gitAction: GitAction): string {
  if (gitAction.type === "commit-before") return "commit before work";
  if (gitAction.type === "commit") return "commit after work";
  if (gitAction.type === "commit-push") return "commit and push";
  if (gitAction.type === "create-branch") return gitAction.branchName ? `create branch ${gitAction.branchName}` : "create branch";
  return gitAction.type;
}

function buildSubmittedAttachmentTags(session: AgentSession): AgentSubmittedAttachmentTag[] {
  const tags: AgentSubmittedAttachmentTag[] = [];
  if (session.testLogText.trim()) tags.push(createSubmittedAttachmentTag("test-log", undefined, `${session.testLogText.trim().length} chars`));
  if (session.gitAction) tags.push(createSubmittedAttachmentTag("git", undefined, submittedGitActionDetail(session.gitAction)));
  session.images.forEach((image) => tags.push(createSubmittedAttachmentTag("image", image.name || image.path, image.path)));
  session.mlcAttachments.forEach((attachment) => tags.push(createSubmittedAttachmentTag("mlc", attachment.title || attachment.filePath, attachment.filePath)));
  session.webAttachments.forEach((attachment) => tags.push(createSubmittedAttachmentTag("web", attachment.pageTitle || attachment.sourceUrl, attachment.sourceUrl)));
  collectSubmittedResourceLinks(session.draft, session.cwd).forEach((link) => tags.push(createSubmittedAttachmentTag("resource", link.label, link.href)));
  return tags;
}

function createStreamingAssistantMessage(messageId?: string): AgentMessage {
  return {
    id: messageId || newId("agent_assistant_msg"),
    role: "assistant",
    status: "streaming",
    blocks: [],
    providerMessageId: messageId,
    providerMessageIds: messageId ? [messageId] : undefined,
    createdAt: nowIso(),
  };
}

function createCompactionBlock(options: Partial<AgentCompactionBlock> = {}): AgentCompactionBlock {
  return {
    id: options.id || newId("agent_compaction"),
    type: "compaction",
    status: options.status || "running",
    origin: options.origin || { phase: "process", placement: "standalone" },
    createdAt: options.createdAt || nowIso(),
    updatedAt: options.updatedAt,
    auto: options.auto,
    overflow: options.overflow,
    content: options.content,
    providerCompactionMessageId: options.providerCompactionMessageId,
    providerSummaryMessageId: options.providerSummaryMessageId,
    tailStartId: options.tailStartId,
    summaryComplete: options.summaryComplete,
  };
}

function createStandaloneCompactionMessage(block: AgentCompactionBlock): AgentMessage {
  const providerMessageIds = [block.providerCompactionMessageId, block.providerSummaryMessageId].filter((item): item is string => Boolean(item));
  return {
    id: newId("agent_assistant_msg"),
    role: "assistant",
    status: block.status === "failed" ? "error" : block.status === "completed" ? "complete" : "streaming",
    blocks: [block],
    providerMessageId: providerMessageIds[0],
    providerMessageIds: providerMessageIds.length > 0 ? providerMessageIds : undefined,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
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

function finiteNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function booleanFromUnknown(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArrayFromUnknown(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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

function extractModelInputLimit(model: unknown): number | undefined {
  if (!model || typeof model !== "object") return undefined;
  const value = model as Record<string, unknown>;
  const meta = value._meta && typeof value._meta === "object" ? value._meta as Record<string, unknown> : undefined;
  const limit = value.limit && typeof value.limit === "object" ? value.limit as Record<string, unknown> : undefined;
  const metaLimit = meta?.limit && typeof meta.limit === "object" ? meta.limit as Record<string, unknown> : undefined;
  return finitePositiveNumber(value.inputLimit)
    ?? finitePositiveNumber(value.input)
    ?? finitePositiveNumber(value.maxInputTokens)
    ?? finitePositiveNumber(value.max_input_tokens)
    ?? finitePositiveNumber(limit?.input)
    ?? finitePositiveNumber(meta?.inputLimit)
    ?? finitePositiveNumber(meta?.input)
    ?? finitePositiveNumber(meta?.maxInputTokens)
    ?? finitePositiveNumber(meta?.max_input_tokens)
    ?? finitePositiveNumber(metaLimit?.input);
}

function extractModelOutputLimit(model: unknown): number | undefined {
  if (!model || typeof model !== "object") return undefined;
  const value = model as Record<string, unknown>;
  const meta = value._meta && typeof value._meta === "object" ? value._meta as Record<string, unknown> : undefined;
  const limit = value.limit && typeof value.limit === "object" ? value.limit as Record<string, unknown> : undefined;
  const metaLimit = meta?.limit && typeof meta.limit === "object" ? meta.limit as Record<string, unknown> : undefined;
  return finitePositiveNumber(value.outputLimit)
    ?? finitePositiveNumber(value.output)
    ?? finitePositiveNumber(value.maxOutputTokens)
    ?? finitePositiveNumber(value.max_output_tokens)
    ?? finitePositiveNumber(limit?.output)
    ?? finitePositiveNumber(meta?.outputLimit)
    ?? finitePositiveNumber(meta?.output)
    ?? finitePositiveNumber(meta?.maxOutputTokens)
    ?? finitePositiveNumber(meta?.max_output_tokens)
    ?? finitePositiveNumber(metaLimit?.output);
}

function extractOpenCodeCompactionConfig(config: unknown): AgentContextCompactionConfig | undefined {
  const root = recordFromUnknown(config);
  const compaction = recordFromUnknown(root?.compaction);
  if (!compaction) return undefined;
  const auto = booleanFromUnknown(compaction.auto);
  const reservedTokens = finiteNonNegativeNumber(compaction.reserved);
  if (auto === undefined && reservedTokens === undefined) return undefined;
  return { auto, reservedTokens };
}

function inputCapabilityValue(input: Record<string, unknown> | undefined, modalities: string[], key: string): boolean | undefined {
  const explicit = booleanFromUnknown(input?.[key]);
  if (explicit !== undefined) return explicit;
  return modalities.includes(key) ? true : undefined;
}

function extractModelCapabilities(model: unknown): AgentModelCapabilities | undefined {
  const value = recordFromUnknown(model);
  if (!value) return undefined;
  const capabilities = recordFromUnknown(value.capabilities);
  const input = recordFromUnknown(capabilities?.input);
  const modalities = recordFromUnknown(value.modalities);
  const modalityInput = stringArrayFromUnknown(modalities?.input);
  const inputCapabilities = {
    text: inputCapabilityValue(input, modalityInput, "text"),
    audio: inputCapabilityValue(input, modalityInput, "audio"),
    image: inputCapabilityValue(input, modalityInput, "image"),
    video: inputCapabilityValue(input, modalityInput, "video"),
    pdf: inputCapabilityValue(input, modalityInput, "pdf"),
  };
  const hasInputCapability = Object.values(inputCapabilities).some((item) => item !== undefined);
  const attachment = booleanFromUnknown(capabilities?.attachment) ?? booleanFromUnknown(value.attachment);
  if (attachment === undefined && !hasInputCapability) return undefined;
  return {
    attachment,
    input: hasInputCapability ? inputCapabilities : undefined,
  };
}

function toChoiceOption(id: unknown, label: unknown, description: unknown, source?: unknown): AgentChoiceOption | null {
  if (typeof id !== "string" || !id) return null;
  return {
    id,
    label: typeof label === "string" && label ? label : id,
    description: typeof description === "string" && description ? description : undefined,
    contextLimit: extractModelContextLimit(source),
    inputLimit: extractModelInputLimit(source),
    outputLimit: extractModelOutputLimit(source),
    capabilities: extractModelCapabilities(source),
  };
}

function openCodeHttpRuntimeForSession(session: AgentSession | null | undefined, sessions: AgentSession[] = []): AgentOpenCodeHttpRuntimeEntry | null {
  const processId = session?.providerRuntime?.transport === "http" ? session.providerRuntime.processId : undefined;
  if (!session) return null;
  if (processId) {
    const runtime = openCodeHttpRuntimes.get(processId) || null;
    return openCodeRuntimeMatchesSessionCwd(runtime, session) ? runtime : null;
  }
  for (const item of sessions) {
    if (item.providerId !== session.providerId || item.providerRuntime?.transport !== "http" || !item.providerRuntime.processId || !item.providerRuntime.initialized) continue;
    const runtime = openCodeHttpRuntimes.get(item.providerRuntime.processId) || null;
    if (openCodeRuntimeMatchesSessionCwd(runtime, session)) return runtime;
  }
  return null;
}

function createOpenCodeHttpPort(): number {
  return 41000 + Math.floor(Math.random() * 12000);
}

function openCodeConfiguredPermissionRules(): OpenCodePermissionRule[] {
  return getOpenCodeDefaultPermissionRules();
}

function openCodeSessionPermissionRulesForCreate(session: AgentSession): OpenCodePermissionRule[] {
  return session.openCodePermissionRules && session.openCodePermissionRules.length > 0
    ? session.openCodePermissionRules
    : openCodeConfiguredPermissionRules();
}

function mergeOpenCodeSessionPermissionRules(session: AgentSession, permissionRules: OpenCodePermissionRule[]): OpenCodePermissionRule[] {
  const baseRules = session.openCodePermissionRules && session.openCodePermissionRules.length > 0
    ? session.openCodePermissionRules
    : openCodeConfiguredPermissionRules();
  return [...baseRules, ...permissionRules];
}

function normalizeOpenCodeFileDiffs(diff: unknown[]): AgentSessionFileDiff[] {
  return diff
    .map((item) => (typeof item === "object" && item !== null ? item as Record<string, unknown> : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item): AgentSessionFileDiff => {
      const file = typeof item.file === "string" ? item.file : "";
      const patch = typeof item.patch === "string" ? item.patch : "";
      const additions = typeof item.additions === "number" ? item.additions : 0;
      const deletions = typeof item.deletions === "number" ? item.deletions : 0;
      const status = item.status;
      const normalizedStatus = status === "added" || status === "deleted" || status === "modified" ? status : undefined;
      return {
        file,
        patch,
        additions,
        deletions,
        ...(normalizedStatus ? { status: normalizedStatus } : {}),
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

function selectedAgentModel(session: AgentSession): AgentChoiceOption | undefined {
  return session.modelId ? session.availableModels?.find((model) => model.id === session.modelId) : undefined;
}

function agentSessionSupportsImageInput(session: AgentSession): boolean {
  return selectedAgentModel(session)?.capabilities?.input?.image === true;
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

function imageMimeFromDataUrl(dataUrl: string | undefined): string {
  return /^data:([^;,]+)/.exec(dataUrl || "")?.[1] || "image/png";
}

function openCodeImageFilePartsFromSession(session: AgentSession): OpenCodeCommandFilePart[] {
  return session.images
    .filter((image) => Boolean(image.dataUrl))
    .map((image) => ({
      type: "file",
      mime: imageMimeFromDataUrl(image.dataUrl),
      url: image.dataUrl || "",
      filename: image.name,
    }));
}

function unsupportedImageInputNotice(images: ImageAttachment[]): string {
  const rows = images.map((image, index) => {
    const name = image.name || image.path || `image-${index + 1}`;
    return `- ${name} was not sent.`;
  });
  return [
    "## Attachment: Images Removed",
    "ERROR: Images were removed because the selected model does not support image input. Inform the user.",
    "",
    ...rows,
  ].join("\n");
}

function appendUnsupportedImageInputNotice(markdown: string, images: ImageAttachment[]): string {
  if (images.length === 0) return markdown;
  return [markdown.trim(), unsupportedImageInputNotice(images)].filter(Boolean).join("\n\n");
}

function openCodePromptPartsFromSession(session: AgentSession, markdown: string): { parts: OpenCodePromptPart[]; markdown: string; removedImageCount: number } {
  const imageParts = openCodeImageFilePartsFromSession(session);
  if (imageParts.length === 0) return { parts: [{ type: "text", text: markdown }], markdown, removedImageCount: 0 };
  if (!agentSessionSupportsImageInput(session)) {
    const filteredMarkdown = appendUnsupportedImageInputNotice(markdown, session.images);
    return { parts: [{ type: "text", text: filteredMarkdown }], markdown: filteredMarkdown, removedImageCount: imageParts.length };
  }
  return { parts: [{ type: "text", text: markdown }, ...imageParts], markdown, removedImageCount: 0 };
}

function openCodeModelIdFromInfo(info: OpenCodeMessageInfo | undefined): string | undefined {
  if (!info) return undefined;
  if (info.model?.providerID && info.model.modelID) return `${info.model.providerID}/${info.model.modelID}`;
  return [info.providerID, info.modelID].filter(Boolean).join("/") || undefined;
}

function isOpenCodeCompactionSummaryInfo(info: OpenCodeMessageInfo | undefined): boolean {
  return Boolean(info && info.role === "assistant" && (info.summary === true || info.mode === "compaction" || info.agent === "compaction"));
}

function isOpenCodeCompactionPart(part: OpenCodeMessagePart | undefined): boolean {
  return part?.type === "compaction";
}

function isOpenCodeCompactionOnlyMessage(message: OpenCodeMessage): boolean {
  const parts = message.parts || [];
  return message.info?.role === "user" && parts.length > 0 && parts.every(isOpenCodeCompactionPart);
}

function openCodePartText(part: OpenCodeMessagePart): string {
  return [part.text, part.content, part.summary]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join("\n\n")
    .trim();
}

function openCodeMessageText(message: OpenCodeMessage | undefined): string | undefined {
  const text = (message?.parts || [])
    .filter((part) => part.type === "text")
    .map(openCodePartText)
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return text || undefined;
}

function latestOpenCodeMessageTime(message: OpenCodeMessage | undefined): string | undefined {
  const time = message?.info?.time;
  const value = typeof time?.completed === "number" ? time.completed : typeof time?.created === "number" ? time.created : undefined;
  return value ? new Date(value).toISOString() : undefined;
}

function openCodeSelectionFromMessages(messages: OpenCodeMessage[]): { modelId?: string; modeId?: string } {
  const selection: { modelId?: string; modeId?: string } = {};
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const info = messages[index].info;
    if (!info) continue;
    selection.modelId ||= openCodeModelIdFromInfo(info);
    if (!isOpenCodeCompactionSummaryInfo(info)) {
      selection.modeId ||= typeof info.agent === "string" && info.agent ? info.agent : typeof info.mode === "string" && info.mode ? info.mode : undefined;
    }
    if (selection.modelId && selection.modeId) break;
  }
  return selection;
}

function contextLimitForModel(availableModels: AgentChoiceOption[] | undefined, modelId: string | undefined): number | undefined {
  if (!modelId) return undefined;
  return availableModels?.find((model) => model.id === modelId)?.contextLimit;
}

function openCodeTokenUsageFromInfo(info: OpenCodeMessageInfo | undefined, costAmount?: number): AgentTokenUsage | undefined {
  const tokens = info?.tokens;
  if (!tokens) return undefined;
  const inputTokens = finiteNonNegativeNumber(tokens.input) ?? 0;
  const outputTokens = finiteNonNegativeNumber(tokens.output) ?? 0;
  const reasoningTokens = finiteNonNegativeNumber(tokens.reasoning) ?? 0;
  const cacheReadTokens = finiteNonNegativeNumber(tokens.cache?.read) ?? 0;
  const cacheWriteTokens = finiteNonNegativeNumber(tokens.cache?.write) ?? 0;
  const calculatedTotal = inputTokens + outputTokens + reasoningTokens + cacheReadTokens + cacheWriteTokens;
  const totalTokens = finitePositiveNumber(tokens.total) ?? calculatedTotal;
  const contextTokens = inputTokens + cacheReadTokens;
  const cost = finitePositiveNumber(info?.cost) ?? finitePositiveNumber(costAmount);
  if (totalTokens <= 0 && contextTokens <= 0) return undefined;
  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: totalTokens > 0 ? totalTokens : contextTokens,
    contextTokens: contextTokens > 0 ? contextTokens : totalTokens,
    ...(cost !== undefined ? { cost } : {}),
    source: "opencode",
  };
}

function openCodeMessageUsedTokens(info: OpenCodeMessageInfo | undefined): number | undefined {
  return openCodeTokenUsageFromInfo(info)?.totalTokens;
}

function openCodeContextUsageFromInfo(info: OpenCodeMessageInfo | undefined, contextLimit: number | undefined, costAmount?: number): AgentContextUsage | undefined {
  const usage = openCodeTokenUsageFromInfo(info, costAmount);
  if (!usage || !contextLimit) return undefined;
  return {
    usedTokens: usage.totalTokens,
    totalTokens: usage.totalTokens,
    contextTokens: usage.contextTokens,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    contextLimit,
    ...(usage.cost !== undefined && usage.cost > 0 ? { cost: { amount: usage.cost, currency: "USD" } } : {}),
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
    reason: typeof part.reason === "string" ? part.reason : undefined,
    cost: finiteNonNegativeNumber(part.cost),
    tokens: part.tokens,
  }));
}

function promptDraftFromProviderParts(parts: AgentProviderMessagePart[] | undefined): string {
  return (parts || [])
    .filter((part) => part.type === "text" && !part.synthetic && !part.ignored && typeof part.text === "string")
    .map((part) => part.text || "")
    .join("\n\n")
    .trim();
}

function extractSubmittedPromptSection(markdown: string): string {
  const trimmedMarkdown = markdown.trim();
  const promptHeading = /^##\s+(?:User Prompt|User Feedback|用户提示|用户反馈)\s*\n/i.exec(trimmedMarkdown);
  if (!promptHeading) return "";
  const contentStart = promptHeading[0].length;
  const nextSectionIndex = trimmedMarkdown.slice(contentStart).search(/\n##\s+/);
  const contentEnd = nextSectionIndex >= 0 ? contentStart + nextSectionIndex : trimmedMarkdown.length;
  return trimmedMarkdown.slice(contentStart, contentEnd).trim();
}

function restoredUserMessagePayload(providerParts: AgentProviderMessagePart[]): { composerDraft?: string; submittedMarkdown?: string } {
  const providerText = promptDraftFromProviderParts(providerParts);
  if (!providerText) return {};
  const promptOnly = extractSubmittedPromptSection(providerText) || providerText;
  return {
    composerDraft: promptOnly,
    submittedMarkdown: promptOnly !== providerText ? providerText : undefined,
  };
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

function messageMatchesProviderId(message: AgentMessage, providerMessageId?: string): boolean {
  if (!providerMessageId) return false;
  return message.providerMessageId === providerMessageId || message.providerMessageIds?.includes(providerMessageId) || message.id === providerMessageId;
}

function isProviderUserMessage(session: AgentSession, providerMessageId?: string): boolean {
  return Boolean(providerMessageId && session.messages.some((message) => message.role === "user" && messageMatchesProviderId(message, providerMessageId)));
}

function bindAssistantProviderMessageId(message: AgentMessage, providerMessageId?: string): AgentMessage {
  if (!providerMessageId || messageMatchesProviderId(message, providerMessageId)) return message;
  return {
    ...message,
    providerMessageId: message.providerMessageId || providerMessageId,
    providerMessageIds: [...(message.providerMessageIds || (message.providerMessageId ? [message.providerMessageId] : [])), providerMessageId],
  };
}

function findLatestAssistantAfterLastUser(messages: AgentMessage[]): number {
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  for (let index = messages.length - 1; index > lastUserIndex; index -= 1) {
    if (messages[index].role === "assistant") return index;
  }
  return -1;
}

function isOpenCodeRestoreProcessPart(part: OpenCodeMessagePart): boolean {
  return part.type === "tool" || part.type === "reasoning" || part.type === "compaction";
}

function hasLaterOpenCodeProcessPart(parts: OpenCodeMessagePart[], index: number): boolean {
  return parts.slice(index + 1).some(isOpenCodeRestoreProcessPart);
}

function normalizeOpenCodePartForRestore(part: OpenCodeMessagePart, index: number, parts: OpenCodeMessagePart[], role?: string): AgentContentBlock | null {
  const block = normalizeOpenCodePart(part);
  if (!block || role === "user" || block.type !== "text" || !hasLaterOpenCodeProcessPart(parts, index)) return block;
  return {
    ...block,
    id: part.id || `thinking-${part.messageID || index}`,
    type: "thinking",
    status: "completed",
    origin: { phase: "process", placement: "standalone" },
  };
}

function mergeAdjacentThinkingBlocks(blocks: AgentContentBlock[]): AgentContentBlock[] {
  const merged: AgentContentBlock[] = [];
  for (const block of blocks) {
    const previous = merged[merged.length - 1];
    if (block.type === "thinking" && previous?.type === "thinking") {
      const content = mergeThinkingContent(previous.content, block.content);
      merged[merged.length - 1] = {
        ...previous,
        content,
        status: previous.status === "running" || block.status === "running" ? "running" : "completed",
        staleRunningState: previous.staleRunningState || block.staleRunningState,
        updatedAt: latestIso(previous.updatedAt || previous.createdAt, block.updatedAt || block.createdAt),
      };
      continue;
    }
    merged.push(block);
  }
  return merged;
}

function agentMessagesFromOpenCodeMessages(messages: OpenCodeMessage[]): AgentMessage[] {
  const summaryByParentId = new Map<string, OpenCodeMessage>();
  for (const message of messages) {
    if (isOpenCodeCompactionSummaryInfo(message.info) && message.info?.parentID) {
      summaryByParentId.set(message.info.parentID, message);
    }
  }
  const consumedSummaryIds = new Set<string>();
  const mappedMessages = messages.flatMap((message): AgentMessage[] => {
    if (message.info?.id && consumedSummaryIds.has(message.info.id)) return [];
    const updatedTime = typeof message.info?.time?.updated === "number" ? message.info.time.updated : null;
    const messageStatus = message.info?.time?.completed || message.info?.status === "complete" ? "complete" : message.info?.status === "error" ? "error" : "complete";
    if (isOpenCodeCompactionOnlyMessage(message)) {
      const summaryMessage = message.info?.id ? summaryByParentId.get(message.info.id) : undefined;
      if (summaryMessage?.info?.id) consumedSummaryIds.add(summaryMessage.info.id);
      const summaryText = openCodeMessageText(summaryMessage);
      const summaryTime = latestOpenCodeMessageTime(summaryMessage);
      const pairUpdatedAt = summaryTime || (updatedTime ? new Date(updatedTime).toISOString() : undefined);
      const summaryThinkingBlocks = (summaryMessage?.parts || [])
        .map((part) => normalizeOpenCodePart(part))
        .filter((block): block is AgentThinkingBlock => Boolean(block && block.type === "thinking"))
        .map((block) => ({ ...block, status: "completed" as const, updatedAt: block.updatedAt || summaryTime || nowIso() }));
      const blocks = (message.parts || [])
        .map((part) => normalizeOpenCodePart(part))
        .filter((block): block is AgentCompactionBlock => Boolean(block && block.type === "compaction"))
        .map((block) => ({
          ...block,
          status: summaryMessage?.info?.error ? "failed" as const : "completed" as const,
          content: summaryText || block.content,
          providerCompactionMessageId: message.info?.id || block.providerCompactionMessageId,
          providerSummaryMessageId: summaryMessage?.info?.id,
          updatedAt: summaryTime || block.updatedAt || nowIso(),
          summaryComplete: Boolean(summaryText),
        }));
      const block = blocks[0] || createCompactionBlock({
        status: summaryMessage?.info?.error ? "failed" : "completed",
        content: summaryText,
        providerCompactionMessageId: message.info?.id,
        providerSummaryMessageId: summaryMessage?.info?.id,
        createdAt: message.info?.time?.created ? new Date(message.info.time.created).toISOString() : nowIso(),
        updatedAt: summaryTime,
        summaryComplete: Boolean(summaryText),
      });
      const providerMessageIds = [message.info?.id, summaryMessage?.info?.id].filter((item): item is string => Boolean(item));
      return [{
        id: message.info?.id || newId("msg"),
        role: "assistant",
        status: block.status === "failed" ? "error" : "complete",
        blocks: [...summaryThinkingBlocks, block],
        providerMessageId: providerMessageIds[0],
        providerMessageIds: providerMessageIds.length > 0 ? providerMessageIds : undefined,
        providerParentMessageId: message.info?.parentID,
        providerParts: summarizeOpenCodeParts(message.parts),
        providerTokenUsage: openCodeTokenUsageFromInfo(summaryMessage?.info) || openCodeTokenUsageFromInfo(message.info),
        modelId: openCodeModelIdFromInfo(summaryMessage?.info) || openCodeModelIdFromInfo(message.info),
        createdAt: message.info?.time?.created ? new Date(message.info.time.created).toISOString() : nowIso(),
        updatedAt: pairUpdatedAt || nowIso(),
      } satisfies AgentMessage];
    }
    if (isOpenCodeCompactionSummaryInfo(message.info)) {
      const summaryText = openCodeMessageText(message);
      const summaryTime = latestOpenCodeMessageTime(message);
      const summaryThinkingBlocks = (message.parts || [])
        .map((part) => normalizeOpenCodePart(part))
        .filter((block): block is AgentThinkingBlock => Boolean(block && block.type === "thinking"))
        .map((block) => ({ ...block, status: "completed" as const, updatedAt: block.updatedAt || summaryTime || nowIso() }));
      const block = createCompactionBlock({
        status: message.info?.error ? "failed" : "completed",
        content: summaryText,
        providerSummaryMessageId: message.info?.id,
        createdAt: message.info?.time?.created ? new Date(message.info.time.created).toISOString() : nowIso(),
        updatedAt: summaryTime,
        summaryComplete: Boolean(summaryText),
      });
      const standalone = createStandaloneCompactionMessage(block);
      return [{ ...standalone, blocks: [...summaryThinkingBlocks, block] }];
    }
    const parts = message.parts || [];
    const blocks = mergeAdjacentThinkingBlocks(parts
      .map((part, index) => normalizeOpenCodePartForRestore(part, index, parts, message.info?.role))
      .filter((block): block is AgentContentBlock => Boolean(block))
      .filter((block) => block.type !== "text" || Boolean(block.content.trim()))
      .map((block) => messageStatus === "complete" && (block.type === "thinking" || block.type === "compaction") ? { ...block, status: "completed" as const, updatedAt: block.updatedAt || nowIso() } : block));
    const isCompactionOnlyMessage = blocks.length > 0 && blocks.every((block) => block.type === "compaction");
    const role = message.info?.role === "user" && !isCompactionOnlyMessage ? "user" : "assistant";
    const providerParts = summarizeOpenCodeParts(message.parts);
    const restoredPayload = role === "user" ? restoredUserMessagePayload(providerParts) : {};
    return [{
      id: message.info?.id || newId("msg"),
      role,
      status: messageStatus,
      blocks,
      providerMessageId: message.info?.id,
      providerMessageIds: message.info?.id ? [message.info.id] : undefined,
      providerParentMessageId: message.info?.parentID,
      providerParts,
      providerTokenUsage: role === "assistant" ? openCodeTokenUsageFromInfo(message.info) : undefined,
      composerDraft: restoredPayload.composerDraft,
      submittedMarkdown: restoredPayload.submittedMarkdown,
      modelId: openCodeModelIdFromInfo(message.info),
      createdAt: message.info?.time?.created ? new Date(message.info.time.created).toISOString() : nowIso(),
      updatedAt: updatedTime ? new Date(updatedTime).toISOString() : nowIso(),
    } satisfies AgentMessage];
  });
  return mergeContiguousAssistantMessages(mappedMessages);
}

function isCompactionUiMessage(message: AgentMessage): boolean {
  return message.blocks.some((block) => block.type === "compaction");
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
    if (message.role === "assistant" && previous?.role === "assistant" && !isCompactionUiMessage(previous) && !isCompactionUiMessage(message)) {
      merged[merged.length - 1] = {
        ...previous,
        blocks: [...previous.blocks, ...message.blocks],
        status: mergeMessageStatus(previous.status, message.status),
        modelId: previous.modelId || message.modelId,
        providerParts: [...(previous.providerParts || []), ...(message.providerParts || [])],
        providerTokenUsage: message.providerTokenUsage || previous.providerTokenUsage,
        providerMessageIds: [...new Set([...(previous.providerMessageIds || (previous.providerMessageId ? [previous.providerMessageId] : [])), ...(message.providerMessageIds || (message.providerMessageId ? [message.providerMessageId] : []))])],
        updatedAt: latestIso(previous.updatedAt || previous.createdAt, message.updatedAt || message.createdAt),
      };
      continue;
    }
    merged.push(message);
  }
  return merged;
}

function appendRestoredTaskList(messages: AgentMessage[], todos: unknown[], providerSessionId: string): AgentMessage[] {
  if (todos.length === 0) return messages;
  if (messages.some((message) => message.blocks.some((block) => block.type === "task_list"))) return messages;
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
      agentName: undefined,
      providerSessionId: undefined,
      providerSessionState: "provisional" as const,
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

function openCodeProviderSessionUpdatedAt(info?: OpenCodeSessionInfo): string | null {
  return info?.time?.updated ? new Date(info.time.updated).toISOString() : null;
}

function openCodeProviderSessionItemFromInfo(sessionId: string, info?: OpenCodeSessionInfo, existing?: AgentProviderSessionItem): AgentProviderSessionItem {
  const updatedAt = openCodeProviderSessionUpdatedAt(info) || existing?.updatedAt || nowIso();
  const cwd = info?.directory !== undefined ? normalizeWorkspacePath(info.directory) : existing?.cwd || null;
  return {
    ...existing,
    sessionId,
    cwd: cwd || null,
    title: info?.title !== undefined ? info.title || null : existing?.title || null,
    updatedAt,
    _meta: {
      ...(existing?._meta || {}),
      ...(info?.slug !== undefined ? { slug: info.slug } : {}),
      ...(info?.path !== undefined ? { path: info.path } : {}),
    },
  };
}

function applyOpenCodeProviderSessionLifecycle(providerId: AgentProviderId, event: OpenCodeBusEvent) {
  const lifecycleEvents = normalizeOpenCodeEvent(event).filter((normalized) => normalized.type === "session.lifecycle");
  if (lifecycleEvents.length === 0) return;
  useAgentStore.setState((state) => {
    let sessions = state.sessions;
    let providerSessionLists = state.providerSessionLists;
    for (const lifecycle of lifecycleEvents) {
      if (!lifecycle.sessionId) continue;
      if (lifecycle.action === "deleted") {
        sessions = sessions.map((session) => session.providerId === providerId && session.providerSessionId === lifecycle.sessionId
          ? {
            ...session,
            agentName: undefined,
            providerSessionId: undefined,
            providerSessionState: "provisional" as const,
            updatedAt: nowIso(),
          }
          : session);
        const existingList = providerSessionLists[providerId];
        if (existingList) {
          providerSessionLists = {
            ...providerSessionLists,
            [providerId]: {
              ...existingList,
              sessions: existingList.sessions.filter((item) => item.sessionId !== lifecycle.sessionId),
              updatedAt: nowIso(),
            },
          };
        }
        continue;
      }

      const lifecycleTitle = lifecycle.title?.trim();
      const lifecycleCwd = lifecycle.cwd !== undefined ? normalizeWorkspacePath(lifecycle.cwd) || "" : undefined;
      sessions = sessions.map((session) => {
        if (session.providerId !== providerId || session.providerSessionId !== lifecycle.sessionId) return session;
        const nextCwd = lifecycleCwd !== undefined ? lifecycleCwd || session.cwd : session.cwd;
        return {
          ...session,
          ...(lifecycleTitle ? { title: lifecycleTitle } : {}),
          cwd: nextCwd,
          workspaceKey: workspacePathKey(nextCwd),
          providerSessionState: session.providerSessionState === "provisional" ? "active" : session.providerSessionState,
          updatedAt: lifecycle.updatedAt || nowIso(),
        };
      });

      const existingList = providerSessionLists[providerId];
      const existingItems = existingList?.sessions || [];
      const existingItem = existingItems.find((item) => item.sessionId === lifecycle.sessionId);
      const nextItem = openCodeProviderSessionItemFromInfo(lifecycle.sessionId, lifecycle.info, existingItem);
      const nextItems = existingItem
        ? existingItems.map((item) => item.sessionId === lifecycle.sessionId ? nextItem : item)
        : [nextItem, ...existingItems];
      providerSessionLists = {
        ...providerSessionLists,
        [providerId]: {
          providerId,
          status: existingList?.status === "loading" ? "loading" : "ready",
          preparationStatus: existingList?.preparationStatus,
          capability: "supported",
          sessions: nextItems.sort((left, right) => Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || "")),
          nextCursor: existingList?.nextCursor || null,
          error: existingList?.error,
          updatedAt: nowIso(),
        },
      };
    }
    return { sessions, providerSessionLists };
  });
}

function scheduleOpenCodeProviderSessionListRefresh(providerId: AgentProviderId, providerSessionId: string) {
  const key = `${providerId}:${providerSessionId}`;
  const existingTimer = openCodeSessionListRefreshTimers.get(key);
  if (existingTimer) window.clearTimeout(existingTimer);
  const timer = window.setTimeout(() => {
    openCodeSessionListRefreshTimers.delete(key);
    void useAgentStore.getState().refreshProviderSessions(providerId);
  }, OPEN_CODE_SESSION_LIST_IDLE_REFRESH_DELAY_MS);
  openCodeSessionListRefreshTimers.set(key, timer);
}

function insertProcessBlock(blocks: AgentContentBlock[], block: AgentContentBlock): AgentContentBlock[] {
  const firstResultIndex = blocks.findIndex((item) => item.origin.phase === "result");
  if (firstResultIndex < 0) return [...blocks, block];
  return [...blocks.slice(0, firstResultIndex), block, ...blocks.slice(firstResultIndex)];
}

function completeStreamingAssistant(session: AgentSession, providerMessageId?: string): AgentSession {
  const completeProcessBlock = (block: AgentContentBlock): AgentContentBlock => {
    if (block.type === "thinking") return block.status === "completed" ? block : { ...block, status: "completed", updatedAt: nowIso() };
    if (block.type === "compaction") return block.status === "running" ? { ...block, status: "completed", staleRunningState: true, updatedAt: nowIso() } : block;
    if (block.type === "tool_call" && (block.status === "running" || block.status === "pending")) return { ...block, status: "completed", staleRunningState: true, updatedAt: nowIso() };
    return block;
  };
  const hasActiveProcessBlock = (message: AgentMessage): boolean => message.blocks.some((block) => {
    if (block.type === "thinking") return block.status === "running";
    if (block.type === "compaction") return block.status === "running";
    if (block.type === "tool_call") return block.status === "running" || block.status === "pending";
    return false;
  });
  return {
    ...session,
    messages: session.messages.map((message) => message.role === "assistant" && (!providerMessageId || messageMatchesProviderId(message, providerMessageId)) && (message.status === "streaming" || hasActiveProcessBlock(message))
      ? {
        ...message,
        ...(providerMessageId && !message.providerMessageId ? { providerMessageId } : {}),
        status: "complete",
        blocks: message.blocks.map(completeProcessBlock),
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

function findAssistantMessageIndex(messages: AgentMessage[], blockId?: string, providerMessageId?: string): number {
  if (providerMessageId) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant" && messageMatchesProviderId(message, providerMessageId)) return index;
    }
  }
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

function openCodeMessagePartId(part: OpenCodeMessagePart | undefined): string | undefined {
  return typeof part?.id === "string" ? part.id : undefined;
}

function openCodeMessagePartMessageId(part: OpenCodeMessagePart | undefined): string | undefined {
  return typeof part?.messageID === "string" ? part.messageID : undefined;
}

function assistantProviderParts(message: AgentMessage): OpenCodeMessagePart[] {
  return (message.providerParts || []) as OpenCodeMessagePart[];
}

function findAssistantProviderPartMessageIndex(messages: AgentMessage[], messageId?: string, partId?: string): number {
  if (messageId) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant" && messageMatchesProviderId(message, messageId)) return index;
    }
  }
  if (partId) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant" && assistantProviderParts(message).some((part) => openCodeMessagePartId(part) === partId)) return index;
    }
  }
  return -1;
}

function upsertAssistantProviderPart(session: AgentSession, part: OpenCodeMessagePart, messageId?: string): AgentSession {
  const partId = openCodeMessagePartId(part);
  const providerMessageId = openCodeMessagePartMessageId(part) || messageId;
  if (!partId) return session;
  const messages = [...session.messages];
  let targetIndex = findAssistantProviderPartMessageIndex(messages, providerMessageId, partId);
  if (targetIndex < 0 && providerMessageId) targetIndex = findLatestAssistantAfterLastUser(messages);
  let assistantMessage = targetIndex >= 0 ? messages[targetIndex] : null;
  if (!assistantMessage) {
    assistantMessage = createStreamingAssistantMessage(providerMessageId);
    messages.push(assistantMessage);
    targetIndex = messages.length - 1;
  }
  assistantMessage = bindAssistantProviderMessageId(assistantMessage, providerMessageId);
  const parts = [...assistantProviderParts(assistantMessage)];
  const nextPart = { ...part, ...(providerMessageId && !openCodeMessagePartMessageId(part) ? { messageID: providerMessageId } : {}) };
  const partIndex = parts.findIndex((item) => openCodeMessagePartId(item) === partId);
  if (partIndex >= 0) {
    parts[partIndex] = nextPart;
  } else {
    const insertIndex = parts.findIndex((item) => (openCodeMessagePartId(item) || "") > partId);
    if (insertIndex >= 0) parts.splice(insertIndex, 0, nextPart);
    else parts.push(nextPart);
  }
  messages[targetIndex] = { ...assistantMessage, providerParts: parts as AgentProviderMessagePart[], updatedAt: nowIso() };
  return { ...session, messages, updatedAt: nowIso() };
}

function applyAssistantProviderPartDelta(session: AgentSession, options: { messageId?: string; partId?: string; field?: string; delta: string }): { session: AgentSession; part?: OpenCodeMessagePart } {
  if (!options.messageId || !options.partId || !options.field || !options.delta) return { session };
  const messages = [...session.messages];
  const targetIndex = findAssistantProviderPartMessageIndex(messages, options.messageId, options.partId);
  if (targetIndex < 0) return { session };
  const assistantMessage = messages[targetIndex];
  if (assistantMessage.role !== "assistant") return { session };
  const parts = [...assistantProviderParts(assistantMessage)];
  const partIndex = parts.findIndex((item) => openCodeMessagePartId(item) === options.partId);
  if (partIndex < 0) return { session };
  const part = parts[partIndex];
  const existing = typeof part[options.field] === "string" ? part[options.field] : "";
  const nextPart = { ...part, messageID: openCodeMessagePartMessageId(part) || options.messageId, [options.field]: `${existing}${options.delta}` };
  parts[partIndex] = nextPart;
  messages[targetIndex] = { ...assistantMessage, providerParts: parts as AgentProviderMessagePart[], updatedAt: nowIso() };
  return { session: { ...session, messages, updatedAt: nowIso() }, part: nextPart };
}

function openCodePartFromEvent(event: OpenCodeBusEvent): OpenCodeMessagePart | undefined {
  const part = event.properties.part;
  return typeof part === "object" && part !== null ? part as OpenCodeMessagePart : undefined;
}

function openCodePartRelatedBlockIds(part: OpenCodeMessagePart): string[] {
  return [part.id, part.callID]
    .filter((item): item is string => typeof item === "string" && item.length > 0);
}

function syncAssistantProviderPartBlocks(session: AgentSession, messageId?: string, partId?: string): AgentSession {
  const messages = [...session.messages];
  const targetIndex = findAssistantProviderPartMessageIndex(messages, messageId, partId);
  if (targetIndex < 0) return session;
  const assistantMessage = messages[targetIndex];
  if (assistantMessage.role !== "assistant") return session;
  const providerParts = assistantProviderParts(assistantMessage);
  const relatedIds = new Set(providerParts.flatMap(openCodePartRelatedBlockIds));
  const providerBlocks = mergeAdjacentThinkingBlocks(providerParts
    .map((part, index) => normalizeOpenCodePartForRestore(part, index, providerParts, "assistant"))
    .filter((block): block is AgentContentBlock => Boolean(block))
    .filter((block) => block.type !== "text" || Boolean(block.content.trim())));
  const preservedBlocks = assistantMessage.blocks.filter((block) => !relatedIds.has(block.id));
  messages[targetIndex] = {
    ...assistantMessage,
    blocks: mergeAdjacentThinkingBlocks([...providerBlocks, ...preservedBlocks]),
    updatedAt: nowIso(),
  };
  return { ...session, messages, updatedAt: nowIso() };
}

function upsertAssistantBlock(session: AgentSession, block: AgentContentBlock, messageId?: string): AgentSession {
  const messages = [...session.messages];
  let targetIndex = findAssistantMessageIndex(messages, block.id, messageId);
  if (targetIndex < 0 && messageId) {
    const lastIndex = messages.length - 1;
    const lastMessage = messages[lastIndex];
    if (lastMessage?.role === "assistant" && lastMessage.status === "streaming" && !lastMessage.providerMessageId) targetIndex = lastIndex;
  }
  if (targetIndex < 0 && messageId) targetIndex = findLatestAssistantAfterLastUser(messages);
  let assistantMessage = targetIndex >= 0 ? messages[targetIndex] : null;
  if (!assistantMessage) {
    assistantMessage = createStreamingAssistantMessage(messageId);
    messages.push(assistantMessage);
    targetIndex = messages.length - 1;
  }
  assistantMessage = bindAssistantProviderMessageId(assistantMessage, messageId);

  let blocks = [...assistantMessage.blocks];
  let blockIndex = blocks.findIndex((item) => item.id === block.id);
  if (blockIndex < 0 && block.type === "compaction") {
    blockIndex = blocks.findIndex((item) => item.type === block.type && item.origin.phase === block.origin.phase);
  }
  if (blockIndex >= 0) {
    const existing = blocks[blockIndex];
    blocks[blockIndex] = {
      ...existing,
      ...block,
      ...((block.type === "text" || block.type === "thinking") && !block.content && (existing.type === "text" || existing.type === "thinking") && existing.content ? { content: existing.content } : {}),
      updatedAt: nowIso(),
    } as AgentContentBlock;
  } else if (block.origin.phase === "process") {
    blocks = insertProcessBlock(blocks, block);
  } else {
    blocks.push(block);
  }
  messages[targetIndex] = { ...assistantMessage, blocks, updatedAt: nowIso() };
  return { ...session, messages, updatedAt: nowIso() };
}

function bindProviderUserMessage(session: AgentSession, providerMessageId?: string, info?: OpenCodeMessageInfo): AgentSession {
  if (!providerMessageId || session.messages.some((message) => message.role === "user" && messageMatchesProviderId(message, providerMessageId))) return session;
  const messages = [...session.messages];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user" || message.providerMessageId) continue;
    messages[index] = {
      ...message,
      providerMessageId,
      providerParentMessageId: info?.parentID,
      modelId: openCodeModelIdFromInfo(info) || message.modelId,
      updatedAt: nowIso(),
    };
    return { ...session, messages, updatedAt: nowIso() };
  }
  return session;
}

function bindAssistantProviderMessageInfo(session: AgentSession, providerMessageId?: string, info?: OpenCodeMessageInfo): AgentSession {
  if (!providerMessageId) return session;
  const messages = [...session.messages];
  let targetIndex = findAssistantProviderPartMessageIndex(messages, providerMessageId);
  if (targetIndex < 0) targetIndex = findLatestAssistantAfterLastUser(messages);
  if (targetIndex < 0) return session;
  const message = messages[targetIndex];
  if (message.role !== "assistant") return session;
  const providerTokenUsage = openCodeTokenUsageFromInfo(info);
  messages[targetIndex] = {
    ...bindAssistantProviderMessageId(message, providerMessageId),
    providerParentMessageId: info?.parentID || message.providerParentMessageId,
    providerTokenUsage: providerTokenUsage || message.providerTokenUsage,
    modelId: openCodeModelIdFromInfo(info) || message.modelId,
    updatedAt: nowIso(),
  };
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

function addProviderMessageIds(message: AgentMessage, ids: Array<string | undefined>): AgentMessage {
  const nextIds = ids.filter((item): item is string => Boolean(item));
  if (nextIds.length === 0) return message;
  const existingIds = message.providerMessageIds || (message.providerMessageId ? [message.providerMessageId] : []);
  const providerMessageIds = [...new Set([...existingIds, ...nextIds])];
  return {
    ...message,
    providerMessageId: message.providerMessageId || providerMessageIds[0],
    providerMessageIds,
  };
}

function findCompactionBlockLocation(session: AgentSession, options: { providerCompactionMessageId?: string; providerSummaryMessageId?: string; blockId?: string } = {}): { messageIndex: number; blockIndex: number; block: AgentCompactionBlock } | null {
  for (let messageIndex = session.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = session.messages[messageIndex];
    if (message.role !== "assistant") continue;
    for (let blockIndex = message.blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const block = message.blocks[blockIndex];
      if (block.type !== "compaction") continue;
      if (options.blockId && block.id === options.blockId) return { messageIndex, blockIndex, block };
      if (options.providerSummaryMessageId && block.providerSummaryMessageId === options.providerSummaryMessageId) return { messageIndex, blockIndex, block };
      if (options.providerCompactionMessageId && block.providerCompactionMessageId === options.providerCompactionMessageId) return { messageIndex, blockIndex, block };
    }
  }
  if (!options.providerCompactionMessageId && !options.providerSummaryMessageId && !options.blockId) {
    for (let messageIndex = session.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const message = session.messages[messageIndex];
      if (message.role !== "assistant") continue;
      for (let blockIndex = message.blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
        const block = message.blocks[blockIndex];
        if (block.type === "compaction" && block.status === "running") return { messageIndex, blockIndex, block };
      }
    }
  }
  return null;
}

function updateCompactionBlock(session: AgentSession, location: { messageIndex: number; blockIndex: number }, update: (block: AgentCompactionBlock) => AgentCompactionBlock, providerMessageIds: Array<string | undefined> = []): AgentSession {
  const messages = [...session.messages];
  const message = messages[location.messageIndex];
  const blocks = [...message.blocks];
  const block = blocks[location.blockIndex];
  if (block.type !== "compaction") return session;
  blocks[location.blockIndex] = update(block);
  messages[location.messageIndex] = addProviderMessageIds({ ...message, blocks, updatedAt: nowIso() }, providerMessageIds);
  return { ...session, messages, updatedAt: nowIso() };
}

function bindCompactionSummaryMessage(session: AgentSession, info: OpenCodeMessageInfo): AgentSession {
  const location = findCompactionBlockLocation(session, { providerCompactionMessageId: info.parentID }) || findCompactionBlockLocation(session);
  if (!location || !info.id) return session;
  compactionSummaryRoutes.set(info.id, { sessionId: session.id, blockId: location.block.id, providerCompactionMessageId: info.parentID });
  return updateCompactionBlock(session, location, (block) => ({
    ...block,
    providerCompactionMessageId: block.providerCompactionMessageId || info.parentID,
    providerSummaryMessageId: info.id,
    updatedAt: nowIso(),
  }), [info.parentID, info.id]);
}

function appendCompactionSummaryText(session: AgentSession, route: CompactionSummaryRoute, text: string, providerSummaryMessageId?: string): AgentSession {
  if (!text) return session;
  const location = findCompactionBlockLocation(session, { blockId: route.blockId, providerSummaryMessageId })
    || findCompactionBlockLocation(session, { providerCompactionMessageId: route.providerCompactionMessageId });
  if (!location) return session;
  return updateCompactionBlock(session, location, (block) => ({
    ...block,
    providerSummaryMessageId: providerSummaryMessageId || block.providerSummaryMessageId,
    content: `${block.content || ""}${text}`,
    updatedAt: nowIso(),
  }), [route.providerCompactionMessageId, providerSummaryMessageId]);
}

function setCompactionSummaryText(session: AgentSession, route: CompactionSummaryRoute, text: string, providerSummaryMessageId?: string): AgentSession {
  const location = findCompactionBlockLocation(session, { blockId: route.blockId, providerSummaryMessageId })
    || findCompactionBlockLocation(session, { providerCompactionMessageId: route.providerCompactionMessageId });
  if (!location) return session;
  return updateCompactionBlock(session, location, (block) => ({
    ...block,
    providerSummaryMessageId: providerSummaryMessageId || block.providerSummaryMessageId,
    content: text || block.content,
    updatedAt: nowIso(),
  }), [route.providerCompactionMessageId, providerSummaryMessageId]);
}

function upsertBlockBeforeCompaction(session: AgentSession, route: CompactionSummaryRoute, block: AgentContentBlock, providerSummaryMessageId?: string): AgentSession {
  const location = findCompactionBlockLocation(session, { blockId: route.blockId, providerSummaryMessageId })
    || findCompactionBlockLocation(session, { providerCompactionMessageId: route.providerCompactionMessageId });
  if (!location) return session;
  const messages = [...session.messages];
  const message = messages[location.messageIndex];
  const blocks = [...message.blocks];
  const existingIndex = blocks.findIndex((item) => item.id === block.id);
  if (existingIndex >= 0) {
    const existing = blocks[existingIndex];
    blocks[existingIndex] = {
      ...existing,
      ...block,
      ...((block.type === "thinking" || block.type === "text") && !block.content && (existing.type === "thinking" || existing.type === "text") && existing.content ? { content: existing.content } : {}),
      updatedAt: nowIso(),
    } as AgentContentBlock;
  } else {
    blocks.splice(location.blockIndex, 0, block);
  }
  messages[location.messageIndex] = addProviderMessageIds({ ...message, blocks, updatedAt: nowIso() }, [route.providerCompactionMessageId, providerSummaryMessageId]);
  return { ...session, messages, updatedAt: nowIso() };
}

function startCompactionInSession(session: AgentSession): AgentSession {
  const block = createCompactionBlock();
  return {
    ...session,
    messages: [...session.messages, createStandaloneCompactionMessage(block)],
    compacting: true,
    compactError: undefined,
    status: "running",
    updatedAt: nowIso(),
  };
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
      if (isProviderUserMessage(nextSession, normalized.messageId)) continue;
      const compactionRoute = normalized.messageId ? compactionSummaryRoutes.get(normalized.messageId) : undefined;
      if (compactionRoute?.sessionId === nextSession.id) {
        nextSession = appendCompactionSummaryText(nextSession, compactionRoute, normalized.delta, normalized.messageId);
        continue;
      }
      const deltaResult = applyAssistantProviderPartDelta(nextSession, {
        messageId: normalized.messageId,
        partId: normalized.partId,
        field: normalized.field,
        delta: normalized.delta,
      });
      nextSession = deltaResult.session;
      if (deltaResult.part) nextSession = syncAssistantProviderPartBlocks(nextSession, normalized.messageId, normalized.partId);
      continue;
    }
    if (normalized.type === "block.updated") {
      if (isProviderUserMessage(nextSession, normalized.messageId)) {
        continue;
      }
      const compactionRoute = normalized.messageId ? compactionSummaryRoutes.get(normalized.messageId) : undefined;
      if (compactionRoute?.sessionId === nextSession.id && normalized.block.type === "text") {
        nextSession = setCompactionSummaryText(nextSession, compactionRoute, normalized.block.content, normalized.messageId);
        continue;
      }
      if (compactionRoute?.sessionId === nextSession.id && normalized.block.type === "thinking") {
        nextSession = upsertBlockBeforeCompaction(nextSession, compactionRoute, normalized.block, normalized.messageId);
        continue;
      }
      const part = openCodePartFromEvent(normalized.raw);
      if (part) {
        nextSession = upsertAssistantProviderPart(nextSession, part, normalized.messageId);
        nextSession = syncAssistantProviderPartBlocks(nextSession, normalized.messageId, normalized.partId);
      } else {
        nextSession = upsertAssistantBlock(nextSession, normalized.block, normalized.messageId);
      }
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
      continue;
    }
    if (normalized.type === "session.status") {
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
      nextSession = {
        ...(isAbort ? completeStreamingAssistant(nextSession) : failStreamingAssistant(nextSession, normalized.error.message || normalized.error.name || "OpenCode session error")),
        status: isAbort ? "idle" : "error",
        updatedAt: nowIso(),
      };
      continue;
    }
    if (normalized.type === "message.updated") {
      const isAbortUpdate = isOpenCodeAbortError(normalized.info?.error);
      const isCompactionSummary = isOpenCodeCompactionSummaryInfo(normalized.info);
      if (isCompactionSummary && normalized.info) {
        nextSession = bindCompactionSummaryMessage(nextSession, normalized.info);
      }
      const modelId = normalized.modelId || openCodeModelIdFromInfo(normalized.info) || nextSession.modelId;
      if (normalized.role === "user") {
        nextSession = bindProviderUserMessage(nextSession, normalized.messageId, normalized.info);
      }
      if (normalized.role === "assistant") {
        nextSession = bindAssistantProviderMessageInfo(nextSession, normalized.messageId, normalized.info);
      }
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
      if (!isCompactionSummary && (normalized.info?.agent || normalized.info?.mode)) nextSession = { ...nextSession, modeId: normalized.info.agent || normalized.info.mode, updatedAt: nowIso() };
      if (isAbortUpdate) {
        nextSession = { ...completeStreamingAssistant(nextSession), status: "idle", updatedAt: nowIso() };
        continue;
      }
      if (normalized.status === "complete") {
        if (normalized.role === "assistant" && nextSession.status !== "running") nextSession = completeStreamingAssistant(nextSession, normalized.messageId);
      }
      if (normalized.status === "error") nextSession = { ...nextSession, status: "error", updatedAt: nowIso() };
    }
  }
  return nextSession;
}

function openCodeEventProviderSessionId(event: OpenCodeBusEvent): string | undefined {
  const properties = event.properties as Record<string, unknown>;
  const part = typeof properties.part === "object" && properties.part !== null ? properties.part as Record<string, unknown> : undefined;
  const info = typeof properties.info === "object" && properties.info !== null ? properties.info as Record<string, unknown> : undefined;
  return typeof properties.sessionID === "string" ? properties.sessionID
    : typeof part?.sessionID === "string" ? part.sessionID
      : typeof info?.sessionID === "string" ? info.sessionID
        : undefined;
}

function openCodeEventShouldRefreshSessionDiff(event: OpenCodeBusEvent): boolean {
  return normalizeOpenCodeEvent(event).some((normalized) => normalized.type === "session.status" && normalized.status === "idle");
}

function handleOpenCodeBusEvent(runtimeOwnerSessionId: string, event: OpenCodeBusEvent) {
  const providerSessionId = openCodeEventProviderSessionId(event);
  const shouldRefreshSessionDiff = openCodeEventShouldRefreshSessionDiff(event);
  const sessionDiffRefreshIds = new Set<string>();
  applyOpenCodeProviderSessionLifecycle("opencode", event);
  useAgentStore.setState((state) => {
    let routed = false;
    const sessions = state.sessions.map((session) => {
      const matchesProviderSession = providerSessionId && session.providerId === "opencode" && session.providerSessionId === providerSessionId;
      const matchesRuntimeOwner = !providerSessionId && session.id === runtimeOwnerSessionId;
      if (!matchesProviderSession && !matchesRuntimeOwner) return session;
      routed = true;
      if (shouldRefreshSessionDiff && session.providerId === "opencode" && session.providerSessionId && !session.sessionDiffLoading) sessionDiffRefreshIds.add(session.id);
      return applyOpenCodeBusEvent(session, event);
    });
    return { sessions: routed ? sessions : state.sessions };
  });
  for (const sessionId of sessionDiffRefreshIds) {
    setTimeout(() => {
      void useAgentStore.getState().refreshAgentSessionDiff(sessionId, { silent: true, preserveExistingOnEmpty: true });
    }, 150);
  }
  if (providerSessionId && shouldRefreshSessionDiff) scheduleOpenCodeProviderSessionListRefresh("opencode", providerSessionId);
}

async function backfillOpenCodeSession(runtimeEntry: AgentOpenCodeHttpRuntimeEntry, sessionId: string, providerSessionId: string, options: { assumeBusyUntilAssistant?: boolean } = {}): Promise<boolean> {
  const statuses = await runtimeEntry.runtime.client.sessionStatuses().catch((): Record<string, unknown> => ({}));
  const [messages, todos] = await Promise.all([
    runtimeEntry.runtime.client.messages(providerSessionId),
    runtimeEntry.runtime.client.todos(providerSessionId).catch(() => []),
  ]).catch(() => [null, []] as const);
  if (!messages) return false;
  const session = useAgentStore.getState().sessions.find((item) => item.id === sessionId);
  if (!session || session.providerSessionId !== providerSessionId) return false;
  const replayedMessages = appendRestoredTaskList(agentMessagesFromOpenCodeMessages(messages), todos, providerSessionId);
  const restoredModelId = [...messages].reverse().map((message) => openCodeModelIdFromInfo(message.info)).find((modelId): modelId is string => Boolean(modelId));
  const restoredContextUsage = openCodeContextUsageFromMessages(messages, contextLimitForModel(session.availableModels, restoredModelId || session.modelId));
  const lastAssistant = [...messages].reverse().find((message) => message.info?.role === "assistant");
  const assistantComplete = Boolean(lastAssistant?.info?.time?.completed || lastAssistant?.info?.finish || lastAssistant?.info?.error);
  const providerBusy = providerStatusIsBusy(statuses[providerSessionId]) || (options.assumeBusyUntilAssistant && !lastAssistant) || Boolean(lastAssistant && !assistantComplete);
  useAgentStore.setState((current) => ({
    sessions: updateSession(current.sessions, sessionId, (item) => {
      if (item.providerSessionId !== providerSessionId) return item;
      return {
        ...item,
        messages: replayedMessages.length > 0 ? replayedMessages : item.messages,
        status: providerBusy ? "running" : item.status === "cancelling" ? item.status : "idle",
        providerSessionState: "active",
        ...(restoredModelId ? { modelId: restoredModelId } : {}),
        ...(restoredContextUsage ? { contextUsage: restoredContextUsage } : {}),
        updatedAt: nowIso(),
      };
    }),
  }));
  return providerBusy;
}

async function backfillOpenCodeRuntimeSessions(processId: string | undefined): Promise<void> {
  if (!processId) return;
  const runtimeEntry = openCodeHttpRuntimes.get(processId);
  if (!runtimeEntry) return;
  const state = useAgentStore.getState();
  const targetSessions = state.sessions.filter((session) => session.providerId === "opencode" && session.providerSessionId && openCodeHttpRuntimeForSession(session, state.sessions) === runtimeEntry);
  if (targetSessions.length === 0) return;
  const now = Date.now();
  if (runtimeEntry.lastBackfillAt && now - runtimeEntry.lastBackfillAt < OPEN_CODE_RECONNECT_BACKFILL_MIN_INTERVAL_MS) return;
  runtimeEntry.lastBackfillAt = now;
  await Promise.all(targetSessions.map((session) => session.providerSessionId ? backfillOpenCodeSession(runtimeEntry, session.id, session.providerSessionId) : Promise.resolve(false)));
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

function agentNameFromProviderSessionId(providerSessionId: string): string {
  return resolveAgentName({ id: providerSessionId });
}

const providerPreparationClearTimers = new Map<AgentProviderId, number>();

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  sessions: [{ ...createAgentSession(), openCodePermissionRules: openCodeConfiguredPermissionRules() }],
  activeSessionId: "agent-session-opencode",
  providerSessionLists: {},

  getActiveSession: () => {
    const state = get();
    return state.sessions.find((session) => session.id === state.activeSessionId) || null;
  },

  createNewSession: (options = {}) => {
    const state = get();
    const activeSession = state.getActiveSession();
    const requestedCwd = normalizeAgentCwd(options.cwd);
    const activeCwd = normalizeAgentCwd(activeSession?.cwd);
    const sessionCwd = requestedCwd || (options.fallbackToActiveCwd === false ? "" : activeCwd);
    const workspaceKey = workspacePathKey(options.workspaceKey) || workspacePathKey(sessionCwd);
    const inheritOpenCodeCommands = !!sessionCwd && sessionCwd === activeCwd;
    const createdAt = nowIso();
    const sessionId = newId("agent_session");
    const session: AgentSession = {
      ...createAgentSession(),
      id: sessionId,
      title: "New Agent Session",
      cwd: sessionCwd,
      workspaceKey,
      modelId: activeSession?.modelId,
      modeId: activeSession?.modeId,
      availableModels: activeSession?.availableModels || [],
      availableModes: activeSession?.availableModes || [],
      availableCommands: inheritOpenCodeCommands ? activeSession?.availableCommands || [] : [],
      availableCommandsLoading: false,
      availableCommandsError: inheritOpenCodeCommands ? activeSession?.availableCommandsError : undefined,
      availableCommandsLoadedAt: inheritOpenCodeCommands ? activeSession?.availableCommandsLoadedAt : undefined,
      configOptions: activeSession?.configOptions || [],
      providerSessionState: "provisional",
      openCodePermissionRules: openCodeConfiguredPermissionRules(),
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

  setSessionWorkspace: (sessionId, cwd) => {
    const nextCwd = normalizeAgentCwd(cwd);
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (session) => {
        if (session.cwd === nextCwd && session.workspaceKey === workspacePathKey(nextCwd)) return session;
        return {
          ...session,
          cwd: nextCwd,
          workspaceKey: workspacePathKey(nextCwd),
          availableCommands: [],
          availableCommandsLoading: false,
          availableCommandsError: undefined,
          availableCommandsLoadedAt: undefined,
          updatedAt: nowIso(),
        };
      }),
    }));
  },

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
    sessions: updateSession(state.sessions, sessionId, (session) => {
      if (!agentSessionSupportsImageInput(session)) {
        return appendDiagnosticToSession(session, "warn", "The selected model does not support image input. The image was not added.");
      }
      return {
        ...session,
        images: session.images.some((item) => item.path === image.path) ? session.images : [...session.images, image],
        updatedAt: nowIso(),
      };
    }),
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

  startOpenCodeProvider: async (sessionId, options = {}) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    if (!session) return;
    if (session.providerRuntime?.processId) {
      await get().stopOpenCodeProvider(sessionId);
    }

    if (session.providerId === "opencode") {
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => {
          const nextSession = {
            ...item,
            status: options.silent ? item.status : "starting" as const,
            providerRuntime: { transport: "http" as const, initialized: false },
          };
          return options.silent ? nextSession : appendDiagnosticToSession(nextSession, "info", "Preparing Agent session...");
        }),
      }));

      try {
        const runtime = await startOpenCodeServerRuntime({ cwd: session.cwd, port: createOpenCodeHttpPort() });
        const events = runtime.client.openGlobalEvents({
          onEvent: (event) => {
            if (!openCodeGlobalEventMatchesRuntime(event, runtime, session)) return;
            handleOpenCodeBusEvent(sessionId, event);
          },
          onError: (error) => get().appendAgentDiagnostic(sessionId, "error", `Agent event stream error: ${error.message}`),
          onOpen: () => {
            get().appendAgentDiagnostic(sessionId, "info", "Agent global event stream connected.");
            void backfillOpenCodeRuntimeSessions(runtime.processInfo.processId);
          },
          onClose: () => get().appendAgentDiagnostic(sessionId, "info", "Agent global event stream closed."),
        });
        openCodeHttpRuntimes.set(runtime.processInfo.processId, { sessionId, runtime, events });
        events.start();
        let commandLoadError: string | undefined;
        const [providers, agents, commands, pendingPermissions, openCodeConfig] = await Promise.all([
          runtime.client.providers(),
          runtime.client.agents().catch(() => [] as OpenCodeAgentInfo[]),
          runtime.client.commands().catch((error) => {
            commandLoadError = error instanceof Error ? error.message : String(error);
            return [] as OpenCodeCommandInfo[];
          }),
          runtime.client.permissions().catch(() => []),
          runtime.client.config().catch(() => undefined),
        ]);
        const availableModels = choicesFromOpenCodeProviders(providers);
        const availableModes = choicesFromOpenCodeAgents(agents);
        const availableCommands = choicesFromOpenCodeCommands(commands);
        const contextCompaction = extractOpenCodeCompactionConfig(openCodeConfig);
        const modeOptions = availableModes.length > 0 ? availableModes : fallbackOpenCodeAgentChoices();
        const serverModelId = session.modelId || availableModels[0]?.id;
        const openCodeSettings = availableModels.length > 0 ? syncOpenCodeModels(availableModels, serverModelId) : null;
        const modelId = openCodeSettings?.preferredModelId || serverModelId;
        const modeId = selectOpenCodeAgentMode(session.modeId, modeOptions);
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, (item) => {
            const nextSession = {
              ...item,
              status: options.silent ? item.status : "idle" as const,
              providerRuntime: {
                ...runtime.runtimeInfo,
                transport: "http" as const,
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
              availableCommandsLoading: false,
              availableCommandsError: commandLoadError,
              availableCommandsLoadedAt: commandLoadError ? item.availableCommandsLoadedAt : nowIso(),
              contextCompaction,
              modelId,
              modeId,
              updatedAt: nowIso(),
            };
            return options.silent ? nextSession : appendDiagnosticToSession(nextSession, commandLoadError ? "warn" : "info", commandLoadError ? `Agent session ready, but OpenCode commands failed to load: ${commandLoadError}` : "Agent session ready.");
          }),
        }));
        for (const request of pendingPermissions) handleOpenCodePermissionRequest(sessionId, request as Record<string, unknown>);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, (item) => {
            const nextSession = {
              ...item,
              status: options.silent ? item.status : "error" as const,
              providerRuntime: { ...item.providerRuntime, transport: "http" as const, processId: undefined, initialized: false },
            };
            return options.silent ? nextSession : appendDiagnosticToSession(nextSession, "error", `Failed to prepare Agent session: ${message}`);
          }),
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
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
        ...item,
        status: "disconnected",
        providerRuntime: { ...item.providerRuntime, processId: undefined, initialized: false },
      }, "warn", "Agent session process was not found.")),
    }));
  },

  ensureAgentCommands: async (sessionId, options = {}) => {
    let session = get().sessions.find((item) => item.id === sessionId);
    if (!session || session.providerId !== "opencode") return;
    if (session.availableCommandsLoading) return;
    if (!options.force && ((session.availableCommands?.length || 0) > 0 || (session.availableCommandsLoadedAt && !session.availableCommandsError))) return;

    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (item) => ({
        ...item,
        availableCommandsLoading: true,
        availableCommandsError: undefined,
        updatedAt: nowIso(),
      })),
    }));

    try {
      let httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
      if (!httpRuntime) {
        await get().startOpenCodeProvider(sessionId);
        session = get().sessions.find((item) => item.id === sessionId);
        if (!session) return;
        if (!options.force && (session.availableCommandsLoadedAt || session.availableCommandsError)) {
          set((state) => ({
            sessions: updateSession(state.sessions, sessionId, (item) => ({ ...item, availableCommandsLoading: false, updatedAt: nowIso() })),
          }));
          return;
        }
        httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
      }
      if (!httpRuntime) throw new Error("OpenCode runtime is not available");
      const commands = await httpRuntime.runtime.client.commands();
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => ({
          ...item,
          availableCommands: choicesFromOpenCodeCommands(commands),
          availableCommandsLoading: false,
          availableCommandsError: undefined,
          availableCommandsLoadedAt: nowIso(),
          updatedAt: nowIso(),
        })),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
          ...item,
          availableCommandsLoading: false,
          availableCommandsError: message,
          updatedAt: nowIso(),
        }, "warn", `OpenCode command list failed: ${message}`)),
      }));
    }
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
    const submittedAttachmentTags = buildSubmittedAttachmentTags(session);

    try {
      if (session.providerId === "opencode") {
        if (!openCodeHttpRuntimeForSession(session, get().sessions)) {
          await get().startOpenCodeProvider(sessionId);
        }
        session = get().sessions.find((item) => item.id === sessionId);
        if (!session) throw new Error("Agent session is not ready");
        const slashCommand = parseOpenCodeSlashCommandDraft(session.draft);
        if (slashCommand && (!session.availableCommands || session.availableCommands.length === 0)) {
          await get().ensureAgentCommands(sessionId);
          session = get().sessions.find((item) => item.id === sessionId) || session;
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
            const agentName = agentNameFromProviderSessionId(providerSessionId);
            const permissionRules = openCodeSessionPermissionRulesForCreate(session);
            await httpRuntime.runtime.client.updateSession(providerSessionId, { permission: permissionRules }).catch((error) => {
              get().appendAgentDiagnostic(sessionId, "warn", `Failed to apply OpenCode permissions: ${error instanceof Error ? error.message : String(error)}`);
            });
            set((state) => ({
              sessions: updateSession(state.sessions, sessionId, (item) => ({
                ...item,
                agentName,
                providerSessionId,
                providerSessionState: "active",
                openCodePermissionRules: permissionRules,
                openCodePermissionError: undefined,
                updatedAt: nowIso(),
              })),
            }));
          }

          const configuredSession = get().sessions.find((item) => item.id === sessionId) || session;
          const commandSupportsImages = agentSessionSupportsImageInput(configuredSession);
          const commandParts = commandSupportsImages ? openCodeImageFilePartsFromSession(configuredSession) : [];
          if (!commandSupportsImages && configuredSession.images.some((image) => Boolean(image.dataUrl))) {
            get().appendAgentDiagnostic(sessionId, "warn", "Images were removed because the selected model does not support image input.");
          }
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
            set((state) => ({
              sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
                ...item,
                status: "error",
                updatedAt: nowIso(),
              }, "error", `OpenCode command failed: ${message}`)),
            }));
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

    const promptSession = get().sessions.find((item) => item.id === sessionId) || session;
    if (!promptSession) return;
    const promptDelivery = openCodePromptPartsFromSession(promptSession, submittedPrompt.markdown);
    const promptMessageId = createOpenCodeAscendingId("message");
    const promptParts = openCodePromptPartsWithIds(promptDelivery.parts);
    if (promptDelivery.removedImageCount > 0) {
      get().appendAgentDiagnostic(sessionId, "warn", "Images were removed because the selected model does not support image input.");
    }

    if (promptSession.providerId === "opencode" && !promptSession.providerSessionId) {
      try {
        if (!openCodeHttpRuntimeForSession(promptSession, get().sessions)) await get().startOpenCodeProvider(sessionId);
        session = get().sessions.find((item) => item.id === sessionId);
        if (!session) throw new Error("Agent session is not ready");
        const httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
        if (!httpRuntime) throw new Error("Agent session is not available");
        const created = await httpRuntime.runtime.client.createSession();
        const providerSessionId = created.id;
        const agentName = agentNameFromProviderSessionId(providerSessionId);
        const permissionRules = openCodeSessionPermissionRulesForCreate(session);
        await httpRuntime.runtime.client.updateSession(providerSessionId, { permission: permissionRules }).catch((error) => {
          get().appendAgentDiagnostic(sessionId, "warn", `Failed to apply OpenCode permissions: ${error instanceof Error ? error.message : String(error)}`);
        });
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
            ...item,
            agentName,
            providerSessionId,
            providerSessionState: "active",
            openCodePermissionRules: permissionRules,
            openCodePermissionError: undefined,
            title: item.title || created.title || item.title,
            updatedAt: nowIso(),
          }, "info", `Session created: ${providerSessionId}`)),
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
            ...item,
            status: "error",
            updatedAt: nowIso(),
          }, "error", `Agent prompt failed: ${message}`)),
        }));
        return;
      }
    }

    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (item) => ({
          ...item,
          status: "running",
          draft: "",
          draftSource: undefined,
          testLogText: "",
          gitAction: null,
          images: [],
          mlcAttachments: [],
          webAttachments: [],
          messages: [
            ...item.messages,
            createUserMessage(composerDraft.trim() || submittedPrompt.historyText.trim(), {
              id: promptMessageId,
              providerMessageId: promptMessageId,
              providerParts: promptParts.map((part) => ({ ...part, messageID: promptMessageId })),
              composerDraft,
              submittedMarkdown: promptDelivery.markdown,
              submittedAttachmentTags,
            }),
            createStreamingAssistantMessage(),
          ],
          updatedAt: nowIso(),
      })),
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
          const agentName = agentNameFromProviderSessionId(providerSessionId);
          const permissionRules = openCodeSessionPermissionRulesForCreate(session);
          await httpRuntime.runtime.client.updateSession(providerSessionId, { permission: permissionRules }).catch((error) => {
            get().appendAgentDiagnostic(sessionId, "warn", `Failed to apply OpenCode permissions: ${error instanceof Error ? error.message : String(error)}`);
          });
          set((state) => ({
            sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
              ...item,
              agentName,
              providerSessionId,
              providerSessionState: "active",
              openCodePermissionRules: permissionRules,
              openCodePermissionError: undefined,
              title: item.title || created.title || item.title,
              updatedAt: nowIso(),
            }, "info", `Session created: ${providerSessionId}`)),
          }));
        }

        const configuredSession = get().sessions.find((item) => item.id === sessionId) || session;
        await httpRuntime.runtime.client.promptAsync(providerSessionId, {
          messageID: promptMessageId,
          parts: promptParts,
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
      const newSessionId = get().createNewSession({ cwd: session.cwd, workspaceKey: session.workspaceKey });
      const replayedMessages = appendRestoredTaskList(agentMessagesFromOpenCodeMessages(messages), todos, forked.id);
      set((state) => ({
        sessions: updateSession(state.sessions, newSessionId, (item) => ({
          ...item,
          title: forked.title || `${session.title} fork`,
          agentName: agentNameFromProviderSessionId(forked.id),
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
          availableCommandsLoading: false,
          availableCommandsError: session.availableCommandsError,
          availableCommandsLoadedAt: session.availableCommandsLoadedAt,
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
      const previousClearTimer = providerPreparationClearTimers.get(providerId);
      if (previousClearTimer) window.clearTimeout(previousClearTimer);
      providerPreparationClearTimers.delete(providerId);
      set((state) => {
        const existing = state.providerSessionLists[providerId];
        return {
          providerSessionLists: {
            ...state.providerSessionLists,
            [providerId]: {
              providerId,
              status: existing?.status || "idle",
              preparationStatus: "preparing",
              capability: existing?.capability || "unknown",
              sessions: existing?.sessions || [],
              nextCursor: existing?.nextCursor || null,
              error: existing?.error,
              updatedAt: existing?.updatedAt,
            },
          },
        };
      });
      await get().startOpenCodeProvider(session.id, { silent: true });
      session = get().sessions.find((item) => item.id === session?.id) || get().sessions.find((item) => item.providerId === providerId) || get().getActiveSession();
      httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
      if (httpRuntime) {
        set((state) => {
          const existing = state.providerSessionLists[providerId];
          return {
            providerSessionLists: {
              ...state.providerSessionLists,
              [providerId]: {
                providerId,
                status: existing?.status || "idle",
                preparationStatus: "ready",
                capability: existing?.capability || "supported",
                sessions: existing?.sessions || [],
                nextCursor: existing?.nextCursor || null,
                error: existing?.error,
                updatedAt: existing?.updatedAt,
              },
            },
          };
        });
        providerPreparationClearTimers.set(providerId, window.setTimeout(() => {
          providerPreparationClearTimers.delete(providerId);
          useAgentStore.setState((state) => {
            const existing = state.providerSessionLists[providerId];
            if (!existing || existing.preparationStatus !== "ready") return {};
            return {
              providerSessionLists: {
                ...state.providerSessionLists,
                [providerId]: { ...existing, preparationStatus: undefined },
              },
            };
          });
        }, 3200));
      }
    }
    if (httpRuntime) {
      const existing = get().providerSessionLists[providerId];
      set((state) => ({
        providerSessionLists: {
          ...state.providerSessionLists,
          [providerId]: {
            providerId,
            status: "loading",
            preparationStatus: existing?.preparationStatus,
            capability: "supported",
            sessions: existing?.sessions || [],
            nextCursor: null,
            updatedAt: existing?.updatedAt,
          },
        },
      }));
      try {
        const listAllSessionsQuery = { directory: undefined, roots: true, limit: 10000 };
        const [sessions, statuses] = await Promise.all([
          httpRuntime.runtime.client
            .listGlobalSessions(listAllSessionsQuery)
            .catch(() => httpRuntime.runtime.client.listSessions(listAllSessionsQuery)),
          httpRuntime.runtime.client.sessionStatuses().catch((): Record<string, string> => ({})),
        ]);
        const normalized: AgentProviderSessionItem[] = sessions.map((item) => ({
          sessionId: item.id,
          cwd: normalizeWorkspacePath(item.directory) || null,
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
              preparationStatus: existing?.preparationStatus,
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
              preparationStatus: undefined,
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
            preparationStatus: undefined,
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
        sessions: updateSession(state.sessions, existingSession.id, (item) => ({
          ...item,
          agentName: agentNameFromProviderSessionId(providerSessionId),
          providerRuntime: providerRuntime || item.providerRuntime,
          updatedAt: nowIso(),
        })),
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
      const replayedMessages = appendRestoredTaskList(agentMessagesFromOpenCodeMessages(messages), todos, providerSessionId);
      const restoredSelection = openCodeSelectionFromMessages(messages);
      const restoredModelId = restoredSelection.modelId || session.modelId;
      const restoredModeId = selectOpenCodeAgentMode(restoredSelection.modeId || session.modeId, session.availableModes || []);
      const restoredContextUsage = openCodeContextUsageFromMessages(messages, contextLimitForModel(session.availableModels, restoredModelId));
      const restoredCwd = normalizeAgentCwd(providerSession?.directory || listItem?.cwd || session.cwd);
      const restoredWorkspaceKey = workspacePathKey(restoredCwd);
      set((state) => ({
        activeSessionId: targetSessionId,
        sessions: reusableSession
          ? updateSession(state.sessions, reusableSession.id, (item) => appendDiagnosticToSession({
            ...item,
            agentName: agentNameFromProviderSessionId(providerSessionId),
            title: providerSession?.title || listItem?.title || item.title,
            cwd: restoredCwd || item.cwd,
            workspaceKey: restoredWorkspaceKey || item.workspaceKey,
            providerRuntime: runtimeOwner?.providerRuntime || session.providerRuntime,
            providerSessionId,
            providerSessionState: "restored",
            openCodePermissionRules: providerSession?.permission || item.openCodePermissionRules || [],
            openCodePermissionError: undefined,
            messages: replayedMessages,
            modelId: restoredModelId,
            modeId: restoredModeId,
            availableModels: session.availableModels || [],
            availableModes: session.availableModes || [],
            availableCommands: session.availableCommands || [],
            availableCommandsLoading: false,
            availableCommandsError: session.availableCommandsError,
            availableCommandsLoadedAt: session.availableCommandsLoadedAt,
            configOptions: session.configOptions || [],
            contextUsage: restoredContextUsage,
            sessionDiffs: normalizeOpenCodeFileDiffs(sessionDiffs),
            sessionDiffLoading: false,
            sessionDiffError: undefined,
            status: "idle",
            updatedAt: nowIso(),
          }, "info", `Session restored: ${providerSessionId}`))
          : [...state.sessions, appendDiagnosticToSession({
            ...createAgentSession(),
            id: targetSessionId,
            agentName: agentNameFromProviderSessionId(providerSessionId),
            providerId,
            title: providerSession?.title || listItem?.title || session.title,
            cwd: restoredCwd,
            workspaceKey: restoredWorkspaceKey,
            providerRuntime: runtimeOwner?.providerRuntime || session.providerRuntime,
            providerSessionId,
            providerSessionState: "restored",
            openCodePermissionRules: providerSession?.permission || [],
            openCodePermissionError: undefined,
            messages: replayedMessages,
            modelId: restoredModelId,
            modeId: restoredModeId,
            availableModels: session.availableModels || [],
            availableModes: session.availableModes || [],
            availableCommands: session.availableCommands || [],
            availableCommandsLoading: false,
            availableCommandsError: session.availableCommandsError,
            availableCommandsLoadedAt: session.availableCommandsLoadedAt,
            configOptions: session.configOptions || [],
            contextUsage: restoredContextUsage,
            sessionDiffs: normalizeOpenCodeFileDiffs(sessionDiffs),
            sessionDiffLoading: false,
            sessionDiffError: undefined,
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
    set((state) => {
      const resetSessions = state.sessions.map((item) => {
        if (item.providerId !== providerId || item.providerSessionId !== providerSessionId) return item;
        return appendDiagnosticToSession({
          ...createAgentSession(),
          id: item.id,
          providerId: item.providerId,
          providerSessionState: "provisional",
          providerRuntime: item.providerRuntime,
          title: "New Agent Session",
          cwd: normalizeAgentCwd(item.cwd),
          workspaceKey: workspacePathKey(item.workspaceKey) || workspacePathKey(item.cwd),
          modelId: item.modelId,
          modeId: item.modeId,
          availableModels: item.availableModels || [],
          availableModes: item.availableModes || [],
          availableCommands: item.availableCommands || [],
          availableCommandsLoading: false,
          availableCommandsError: item.availableCommandsError,
          availableCommandsLoadedAt: item.availableCommandsLoadedAt,
          configOptions: item.configOptions || [],
          status: "idle",
          createdAt: item.createdAt,
          updatedAt: nowIso(),
        }, "info", `Session deleted: ${providerSessionId}`);
      });
      const runtimeOwnerIds = resetSessions
        .filter((item) => item.providerRuntime?.processId)
        .map((item) => item.id);
      const cleaned = cleanupEmptyAgentSessions(resetSessions, state.activeSessionId, runtimeOwnerIds);
      return {
        activeSessionId: cleaned.activeSessionId,
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
        sessions: cleaned.sessions,
      };
    });
  },

  updateOpenCodeSessionPermission: async (sessionId, permission, action) => {
        const session = get().sessions.find((item) => item.id === sessionId);
        const httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
        if (!session) return;
        const permissionRules = openCodePermissionActionToRules(permission, action);
        const nextPermissionRules = mergeOpenCodeSessionPermissionRules(session, permissionRules);
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, (item) => ({
            ...item,
            openCodePermissionRules: nextPermissionRules,
            openCodePermissionUpdating: Boolean(session.providerSessionId && httpRuntime),
            openCodePermissionError: undefined,
            updatedAt: nowIso(),
          })),
        }));
        if (!session.providerSessionId || !httpRuntime) {
          return;
        }
        try {
          const updated = await httpRuntime.runtime.client.updateSession(session.providerSessionId, { permission: nextPermissionRules });
          const updatedRules = Array.isArray(updated.permission) ? updated.permission : nextPermissionRules;
          set((state) => ({
            sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
              ...item,
              openCodePermissionRules: updatedRules,
              openCodePermissionUpdating: false,
              openCodePermissionError: undefined,
              updatedAt: nowIso(),
            }, "info", `OpenCode permission updated: ${permission} -> ${action}`)),
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set((state) => ({
            sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
              ...item,
              openCodePermissionUpdating: false,
              openCodePermissionError: message,
              updatedAt: nowIso(),
            }, "error", `Failed to update OpenCode permission: ${message}`)),
          }));
    }
  },

  applyOpenCodeSessionPermissionPreset: async (sessionId, presetId) => {
        const session = get().sessions.find((item) => item.id === sessionId);
        const httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
        if (!session) return;
        const permissionRules = getOpenCodePermissionPresetRules(presetId);
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, (item) => ({
            ...item,
            openCodePermissionRules: permissionRules,
            openCodePermissionUpdating: Boolean(session.providerSessionId && httpRuntime),
            openCodePermissionError: undefined,
            updatedAt: nowIso(),
          })),
        }));
        if (!session.providerSessionId || !httpRuntime) {
          return;
        }
        try {
          const updated = await httpRuntime.runtime.client.updateSession(session.providerSessionId, { permission: permissionRules });
          const updatedRules = Array.isArray(updated.permission) ? updated.permission : permissionRules;
          set((state) => ({
            sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
              ...item,
              openCodePermissionRules: updatedRules,
              openCodePermissionUpdating: false,
              openCodePermissionError: undefined,
              updatedAt: nowIso(),
            }, "info", `OpenCode permission preset applied: ${presetId}.`)),
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set((state) => ({
            sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
              ...item,
              openCodePermissionUpdating: false,
              openCodePermissionError: message,
              updatedAt: nowIso(),
            }, "error", `Failed to apply OpenCode permission preset: ${message}`)),
          }));
    }
  },

  resetOpenCodeSessionPermissions: async (sessionId) => {
        const session = get().sessions.find((item) => item.id === sessionId);
        const httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
        if (!session) return;
        const permissionRules = openCodeConfiguredPermissionRules();
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, (item) => ({
            ...item,
            openCodePermissionRules: permissionRules,
            openCodePermissionUpdating: Boolean(session.providerSessionId && httpRuntime),
            openCodePermissionError: undefined,
            updatedAt: nowIso(),
          })),
        }));
        if (!session.providerSessionId || !httpRuntime) {
          return;
        }
        try {
          const updated = await httpRuntime.runtime.client.updateSession(session.providerSessionId, { permission: permissionRules });
          const updatedRules = Array.isArray(updated.permission) ? updated.permission : permissionRules;
          set((state) => ({
            sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
              ...item,
              openCodePermissionRules: updatedRules,
              openCodePermissionUpdating: false,
              openCodePermissionError: undefined,
              updatedAt: nowIso(),
            }, "info", "OpenCode permissions reset to defaults.")),
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set((state) => ({
            sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
              ...item,
              openCodePermissionUpdating: false,
              openCodePermissionError: message,
              updatedAt: nowIso(),
            }, "error", `Failed to reset OpenCode permissions: ${message}`)),
          }));
    }
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

  refreshAgentSessionDiff: async (sessionId, options) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    const httpRuntime = openCodeHttpRuntimeForSession(session, get().sessions);
    if (!session?.providerSessionId || !httpRuntime) return;
    if (!options?.silent) {
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => ({ ...item, sessionDiffLoading: true, sessionDiffError: undefined, updatedAt: nowIso() })),
      }));
    }
    try {
      const diff = await httpRuntime.runtime.client.sessionDiff(session.providerSessionId);
      const normalizedDiff = normalizeOpenCodeFileDiffs(diff);
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => {
          const preserveExistingDiff = options?.preserveExistingOnEmpty && normalizedDiff.length === 0 && (item.sessionDiffs?.length || 0) > 0;
          return { ...item, sessionDiffs: preserveExistingDiff ? item.sessionDiffs : normalizedDiff, sessionDiffLoading: false, sessionDiffError: undefined, updatedAt: nowIso() };
        }),
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
    set(() => ({
      sessions: [createAgentSession()],
      activeSessionId: "agent-session-opencode",
      providerSessionLists: {},
    }));
  },
}));