import type { AgentSession } from "./types";
import { resolveAgentName } from "../identity/agentIdentity";

function nowIso(): string {
  return new Date().toISOString();
}

export function createAgentSession(): AgentSession {
  const createdAt = nowIso();
  return {
    id: "agent-session-opencode",
    providerId: "opencode",
    agentName: resolveAgentName({ id: "agent-session-opencode" }),
    title: "OpenCode Agent Console",
    cwd: "",
    workspaceKey: "",
    modelId: undefined,
    modeId: undefined,
    availableModels: [],
    availableModes: [],
    availableCommands: [],
    availableCommandsLoading: false,
    availableCommandsError: undefined,
    availableCommandsLoadedAt: undefined,
    contextUsage: undefined,
    configOptions: [],
    status: "disconnected",
    providerRuntime: { initialized: false },
    draft: "",
    testLogText: "",
    gitAction: null,
    images: [],
    mlcAttachments: [],
    webAttachments: [],
    messages: [],
    pendingPermissionIds: [],
    openCodePermissionRules: [],
    openCodePermissionUpdating: false,
    openCodePermissionError: undefined,
    sessionDiffs: [],
    sessionDiffLoading: false,
    sessionDiffError: undefined,
    compacting: false,
    compactError: undefined,
    draftSource: undefined,
    diagnostics: [],
    createdAt,
    updatedAt: createdAt,
  };
}