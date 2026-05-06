import { create } from "zustand";
import { AcpClient } from "../agent/acp/client";
import type { AcpInitializeResult, AcpNewSessionResult } from "../agent/acp/types";
import { hasAgentComposerContent } from "../agent/composer";
import { createOpenCodeAcpStartOptions, createOpenCodeInitializeParams } from "../agent/opencode/provider";
import { createAgentSession } from "../agent/sessionFactory";
import { buildSubmittedComposerPayload } from "../composer/submittedFeedback";
import type { AgentChoiceOption, AgentContentBlock, AgentDiagnosticEntry, AgentMessage, AgentSession } from "../agent/types";
import type { GitAction, ImageAttachment, MlcAttachment, WebAttachment } from "./feedbackStore";

interface AgentAcpRuntimeEntry {
  sessionId: string;
  client: AcpClient;
}

const acpRuntimes = new Map<string, AgentAcpRuntimeEntry>();

interface AgentStoreState {
  sessions: AgentSession[];
  activeSessionId: string | null;
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

function toChoiceOption(id: unknown, label: unknown, description: unknown): AgentChoiceOption | null {
  if (typeof id !== "string" || !id) return null;
  return {
    id,
    label: typeof label === "string" && label ? label : id,
    description: typeof description === "string" && description ? description : undefined,
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
      return toChoiceOption(optionValue.value, optionValue.name, optionValue.description);
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
      .map((model) => toChoiceOption(model.modelId, model.name, model.description))
      .filter((option): option is AgentChoiceOption => Boolean(option))
    : choicesFromConfigOption(modelConfig).length > 0 ? choicesFromConfigOption(modelConfig) : session.availableModels || [];
  const availableModes = Array.isArray(result.modes?.availableModes)
    ? result.modes.availableModes
      .map((mode) => toChoiceOption(mode.id, mode.name, mode.description))
      .filter((option): option is AgentChoiceOption => Boolean(option))
    : choicesFromConfigOption(modeConfig).length > 0 ? choicesFromConfigOption(modeConfig) : session.availableModes || [];
  const modelId = result.models?.currentModelId || currentValueFromConfigOption(modelConfig) || session.modelId || availableModels[0]?.id;
  const modeId = result.modes?.currentModeId || currentValueFromConfigOption(modeConfig) || session.modeId || availableModes[0]?.id;

  return {
    ...session,
    providerSessionId: result.sessionId || session.providerSessionId,
    modelId,
    modeId,
    availableModels,
    availableModes,
    configOptions: configOptions.length > 0 ? configOptions : session.configOptions,
    updatedAt: nowIso(),
  };
}

function runtimeForSession(session: AgentSession | undefined): AgentAcpRuntimeEntry | null {
  const processId = session?.providerRuntime?.processId;
  return processId ? acpRuntimes.get(processId) || null : null;
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

function appendAssistantTextChunk(session: AgentSession, phase: "process" | "result", text: string, messageId?: string): AgentSession {
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
  const blocks = [...assistantMessage.blocks];
  if (blockIndex >= 0) {
    const block = blocks[blockIndex];
    if (block.type === "text") blocks[blockIndex] = { ...block, content: block.content + text, updatedAt: nowIso() };
    if (block.type === "thinking") blocks[blockIndex] = { ...block, content: block.content + text, status: "running", updatedAt: nowIso() };
  } else if (phase === "process") {
    blocks.push({
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
  if (updateType === "user_message_chunk") {
    return session;
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
    const runtime = runtimeForSession(session);
    if (!runtime || !session?.providerSessionId) return;
    void runtime.client.request("session/set_mode", { sessionId: session.providerSessionId, modeId })
      .catch((error) => get().appendAgentDiagnostic(sessionId, "error", `Failed to set ACP mode: ${error instanceof Error ? error.message : String(error)}`));
  },

  setSessionModel: (sessionId, modelId) => {
    set((state) => ({
      sessions: updateSession(state.sessions, sessionId, (session) => ({ ...session, modelId, updatedAt: nowIso() })),
    }));
    const session = get().sessions.find((item) => item.id === sessionId);
    const runtime = runtimeForSession(session);
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
      get().appendAgentDiagnostic(sessionId, "info", "Creating OpenCode ACP session...");
      const sessionResult = await client.request<AcpNewSessionResult>("session/new", {
        cwd: info.cwd,
        mcpServers: [],
      });
      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => appendDiagnosticToSession({
          ...applyAcpSessionSetupResult(item, sessionResult),
          status: "idle",
          providerRuntime: {
            ...item.providerRuntime,
            initialized: true,
            protocolVersion: initializeResult.protocolVersion,
            agentInfo: initializeResult.agentInfo,
            agentCapabilities: initializeResult.agentCapabilities,
            authMethods: initializeResult.authMethods,
          },
        }, "info", `${describeAcpSessionSetup(sessionResult)}.`)),
      }));
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
      if (!session?.providerRuntime?.initialized) {
        await get().startOpenCodeAcp(sessionId);
      }
      session = get().sessions.find((item) => item.id === sessionId);
      const processId = session?.providerRuntime?.processId;
      if (!session || !processId) throw new Error("OpenCode ACP provider is not connected");
      const runtime = acpRuntimes.get(processId);
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
          }, "info", `OpenCode ACP session created: ${providerSessionId}`)),
        }));
      }

      await runtime.client.request("session/prompt", {
        sessionId: providerSessionId,
        prompt: [{ type: "text", text: submittedPrompt.historyText || submittedPrompt.markdown }],
      }, 10 * 60 * 1000);

      set((state) => ({
        sessions: updateSession(state.sessions, sessionId, (item) => ({
          ...completeStreamingAssistant(item),
          status: "idle",
        })),
      }));
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
    set(() => ({
      sessions: [createAgentSession()],
      activeSessionId: "agent-session-opencode",
    }));
  },
}));