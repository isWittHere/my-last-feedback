import { create } from "zustand";
import { hasAgentComposerContent } from "../agent/composer";
import { createMockAgentSession, createMockAssistantBlocks } from "../agent/mockData";
import { buildSubmittedComposerPayload } from "../composer/submittedFeedback";
import type { AgentContentBlock, AgentMessage, AgentSession } from "../agent/types";
import type { GitAction, ImageAttachment, MlcAttachment, WebAttachment } from "./feedbackStore";

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
  sendMockPrompt: (sessionId: string) => void;
  resolveMockPermission: (sessionId: string, requestId: string, optionId: string) => void;
  resetMockSession: () => void;
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

function createAssistantMessage(prompt: string): AgentMessage {
  return {
    id: newId("agent_assistant_msg"),
    role: "assistant",
    status: "complete",
    modelId: "opencode/mock",
    blocks: createMockAssistantBlocks(prompt).map((block) => ({ ...block, id: newId(block.type) })),
    createdAt: nowIso(),
  };
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
  sessions: [createMockAgentSession()],
  activeSessionId: "agent-session-mock",

  getActiveSession: () => {
    const state = get();
    return state.sessions.find((session) => session.id === state.activeSessionId) || null;
  },

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  setSessionMode: (sessionId, modeId) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => ({ ...session, modeId, updatedAt: nowIso() })),
  })),

  setSessionModel: (sessionId, modelId) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => ({ ...session, modelId, updatedAt: nowIso() })),
  })),

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

  sendMockPrompt: (sessionId) => set((state) => ({
    sessions: updateSession(state.sessions, sessionId, (session) => {
      if (!hasAgentComposerContent(session)) return session;
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
      return {
        ...session,
        status: "idle",
        draft: "",
        testLogText: "",
        gitAction: null,
        images: [],
        mlcAttachments: [],
        webAttachments: [],
        messages: [...session.messages, createUserMessage(submittedPrompt.markdown), createAssistantMessage(submittedPrompt.historyText || submittedPrompt.markdown)],
        updatedAt: nowIso(),
      };
    }),
  })),

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

  resetMockSession: () => set(() => ({
    sessions: [createMockAgentSession()],
    activeSessionId: "agent-session-mock",
  })),
}));