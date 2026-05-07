import type { AgentSession } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

export function createAgentSession(): AgentSession {
  const createdAt = nowIso();
  return {
    id: "agent-session-opencode",
    providerId: "opencode",
    title: "OpenCode Agent Console",
    cwd: "",
    modelId: undefined,
    modeId: undefined,
    availableModels: [],
    availableModes: [],
    availableCommands: [],
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
    sessionDiffs: [],
    sessionDiffLoading: false,
    sessionDiffError: undefined,
    compacting: false,
    compactError: undefined,
    diagnostics: [],
    createdAt,
    updatedAt: createdAt,
  };
}