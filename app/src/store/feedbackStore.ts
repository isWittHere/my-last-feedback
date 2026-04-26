import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface ImageAttachment {
  path: string;
  name: string;
  sizeKB: number;
  dataUrl?: string;
}

export interface PromptItem {
  name: string;
  description: string;
  content: string;
  icon: string;
}

// ── Multi-session types ──

export type SessionStatus = "pending" | "responded" | "cancelled";

export interface QuestionItem {
  label: string;
  options?: string[];
  selectedOptions: string[];
  answer: string;
}

export interface Caller {
  id: string;
  name: string;
  version: string;
  color: string;
  pendingCount: number;
  clientName?: string;
  alias?: string;
}

export type GitActionType = "commit" | "commit-push" | "create-branch";

export interface GitAction {
  type: GitActionType;
  branchName?: string;
}

export interface MlcAttachment {
  filePath: string;
  title: string;
  description: string;
}

export type ComposerFocusKind = "feedback" | "testLog" | "question" | "queuedDraft";

export interface FocusedComposer {
  callerId: string;
  sessionId?: string;
  projectDirectory: string;
  kind: ComposerFocusKind;
  focusedAt: string;
}

export type MlcPanelPosition = "left" | "right";
export type SidePanelTab = "mlc" | "resources";

export type NewRequestAttentionMode = "interrupt" | "passive";

export interface AddSessionOptions {
  attentionMode?: NewRequestAttentionMode;
  applyQueuedDraft?: boolean;
}

export interface FeedbackDraft {
  feedbackText: string;
  testLogText: string;
  images: ImageAttachment[];
  gitAction: GitAction | null;
  mlcAttachments: MlcAttachment[];
  updatedAt: string;
}

export interface Session {
  id: string;
  callerId: string;
  requestName: string;
  summary: string;
  projectDirectory: string;
  status: SessionStatus;
  createdAt: string;
  // User input (editable when pending, readonly when responded)
  feedbackText: string;
  testLogText: string;
  images: ImageAttachment[];
  commandLogs: string;
  mlcAttachments: MlcAttachment[];
  // Agent questions
  questions: QuestionItem[];
  // Git action
  gitAction: GitAction | null;
}

export interface FeedbackState {
  prompts: PromptItem[];

  setPrompts: (prompts: PromptItem[]) => void;

  // Prompt visibility
  disabledPrompts: string[];
  setDisabledPrompts: (names: string[]) => void;
  togglePromptDisabled: (name: string) => void;

  // ── Persistent mode fields ──
  callers: Caller[];
  callerOrder: string[]; // user-controlled display order of caller IDs
  unreadCallerIds: string[]; // callers with unread new sessions
  hiddenCallerIds: string[]; // callers hidden from top bar tabs
  visibleColumnCount: number; // how many callers are visible in the window columns
  sessions: Session[];
  activeCallerId: string | null;
  activeSessionId: string | null;
  queuedDraftsByCallerId: Record<string, FeedbackDraft>;
  messageHistoryByCallerId: Record<string, string[]>;
  focusedComposer: FocusedComposer | null;
  mlcPanelVisible: boolean;
  mlcPanelCollapsed: boolean;
  mlcPanelPosition: MlcPanelPosition;
  mlcPanelWidth: number;
  mlcActiveWorkspacePath: string | null;
  sidePanelActiveTab: SidePanelTab;

  // Persistent mode actions
  addCaller: (caller: Caller) => void;
  updateCallerColor: (id: string, color: string) => void;
  setActiveCaller: (id: string) => void;
  setCallerOrder: (order: string[]) => void;
  sortCallersByName: () => void;
  renameCaller: (callerId: string, newName: string) => Promise<void>;
  mergeCallers: (sourceId: string, targetId: string) => Promise<void>;
  clearAllHistory: () => Promise<void>;
  addSession: (session: Session, options?: AddSessionOptions) => void;
  setActiveSession: (id: string) => void;
  updateSessionField: (sessionId: string, field: keyof Pick<Session, "feedbackText" | "testLogText" | "commandLogs">, value: string) => void;
  addSessionImage: (sessionId: string, img: ImageAttachment) => void;
  removeSessionImage: (sessionId: string, path: string) => void;
  clearSessionImages: (sessionId: string) => void;
  addSessionMlcAttachment: (sessionId: string, attachment: MlcAttachment) => void;
  removeSessionMlcAttachment: (sessionId: string, filePath: string) => void;
  clearSessionMlcAttachments: (sessionId: string) => void;
  setSessionGitAction: (sessionId: string, action: GitAction | null) => void;
  updateSessionGitBranchName: (sessionId: string, branchName: string) => void;
  markSessionResponded: (sessionId: string) => void;
  markSessionCancelled: (sessionId: string) => void;
  removeSession: (sessionId: string) => void;
  removeCaller: (callerId: string) => Promise<void>;
  removeEmptyCallers: () => Promise<string[]>;
  maxSessionsPerCaller: number;
  setMaxSessionsPerCaller: (value: number) => void;
  autoRemoveEmptyCallers: boolean;
  setAutoRemoveEmptyCallers: (value: boolean) => void;
  autoHideInactiveHours: number;
  setAutoHideInactiveHours: (value: number) => void;
  hideInactiveCallers: () => void;
  updateSessionAnswer: (sessionId: string, questionIndex: number, answer: string) => void;
  toggleSessionOption: (sessionId: string, questionIndex: number, option: string) => void;
  updateCallerPendingCount: (callerId: string) => void;
  markCallerRead: (callerId: string) => void;
  toggleCallerHidden: (callerId: string) => void;
  unhideCaller: (callerId: string) => void;
  trimCallerSessions: (callerId: string) => Promise<void>;
  setVisibleColumnCount: (count: number) => void;
  setQueuedDrafts: (drafts: Record<string, FeedbackDraft>) => void;
  getQueuedDraft: (callerId: string) => FeedbackDraft;
  updateQueuedDraftField: (callerId: string, field: "feedbackText" | "testLogText", value: string) => void;
  addQueuedDraftImage: (callerId: string, img: ImageAttachment) => void;
  removeQueuedDraftImage: (callerId: string, path: string) => void;
  clearQueuedDraftImages: (callerId: string) => void;
  addQueuedDraftMlcAttachment: (callerId: string, attachment: MlcAttachment) => void;
  removeQueuedDraftMlcAttachment: (callerId: string, filePath: string) => void;
  clearQueuedDraftMlcAttachments: (callerId: string) => void;
  setQueuedDraftGitAction: (callerId: string, action: GitAction | null) => void;
  updateQueuedDraftGitBranchName: (callerId: string, branchName: string) => void;
  clearQueuedDraft: (callerId: string) => void;
  applyQueuedDraftToSession: (callerId: string, sessionId: string) => void;
  pushMessageHistory: (callerId: string, text: string) => void;
  getMessageHistory: (callerId: string) => string[];
  clearMessageHistory: (callerId?: string) => void;
  setFocusedComposer: (focus: FocusedComposer) => void;
  clearFocusedComposer: (sessionId?: string) => void;
  setMlcPanelVisible: (visible: boolean) => void;
  setMlcPanelCollapsed: (collapsed: boolean) => void;
  setMlcPanelPosition: (position: MlcPanelPosition) => void;
  setMlcPanelWidth: (width: number) => void;
  setMlcActiveWorkspacePath: (path: string | null) => void;
  setSidePanelActiveTab: (tab: SidePanelTab) => void;

  // Derived getters
  getActiveCaller: () => Caller | null;
  getActiveCallerSessions: () => Session[];
  getActiveSession: () => Session | null;
}

const IMAGE_MAX_COUNT = 5;
const IMAGE_MAX_SIZE_MB = 5;
const IMAGE_MAX_TOTAL_MB = 20;
const MESSAGE_HISTORY_MAX = 50;
const MLC_PANEL_DEFAULT_WIDTH = 320;
const MLC_PANEL_MIN_WIDTH = 240;
const MLC_PANEL_MAX_WIDTH = 520;

function emptyDraft(): FeedbackDraft {
  return {
    feedbackText: "",
    testLogText: "",
    images: [],
    gitAction: null,
    mlcAttachments: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDraft(draft: Partial<FeedbackDraft> | null | undefined): FeedbackDraft {
  return {
    ...emptyDraft(),
    ...(draft || {}),
    images: draft?.images || [],
    mlcAttachments: draft?.mlcAttachments || [],
  };
}

function isDraftEmpty(draft: FeedbackDraft): boolean {
  return !draft.feedbackText.trim()
    && !draft.testLogText.trim()
    && draft.images.length === 0
    && draft.mlcAttachments.length === 0
    && !draft.gitAction;
}

function loadMessageHistory(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem("mlf-message-history-by-caller");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveMessageHistory(history: Record<string, string[]>) {
  try { localStorage.setItem("mlf-message-history-by-caller", JSON.stringify(history)); } catch {}
}

function persistQueuedDrafts(drafts: Record<string, FeedbackDraft>) {
  invoke("save_queued_drafts", { drafts }).catch((e: unknown) =>
    console.error("Failed to persist queued drafts:", e)
  );
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  // Prompt templates
  prompts: [],
  setPrompts: (prompts) => set({ prompts }),

  // Prompt visibility
  disabledPrompts: (() => {
    try {
      const stored = localStorage.getItem("mlf-disabled-prompts");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  })(),
  setDisabledPrompts: (names) => {
    set({ disabledPrompts: names });
    try { localStorage.setItem("mlf-disabled-prompts", JSON.stringify(names)); } catch {}
  },
  togglePromptDisabled: (name) => {
    const { disabledPrompts } = get();
    const next = disabledPrompts.includes(name)
      ? disabledPrompts.filter((n) => n !== name)
      : [...disabledPrompts, name];
    set({ disabledPrompts: next });
    try { localStorage.setItem("mlf-disabled-prompts", JSON.stringify(next)); } catch {}
  },

  // ── Persistent mode defaults ──
  callers: [],
  callerOrder: [],
  unreadCallerIds: [],
  visibleColumnCount: 0,
  hiddenCallerIds: (() => {
    try {
      const stored = localStorage.getItem("mlf-hidden-callers");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  })(),
  maxSessionsPerCaller: (() => {
    try {
      const stored = localStorage.getItem("mlf-max-sessions-per-caller");
      return stored ? Number(stored) : 200;
    } catch { return 200; }
  })(),
  autoRemoveEmptyCallers: (() => {
    try {
      const stored = localStorage.getItem("mlf-auto-remove-empty-callers");
      return stored === "true";
    } catch { return false; }
  })(),
  autoHideInactiveHours: (() => {
    try {
      const stored = localStorage.getItem("mlf-auto-hide-inactive-hours");
      return stored ? Number(stored) : 18;
    } catch { return 18; }
  })(),
  sessions: [],
  activeCallerId: null,
  activeSessionId: null,
  queuedDraftsByCallerId: {},
  messageHistoryByCallerId: loadMessageHistory(),
  focusedComposer: null,
  mlcPanelVisible: (() => {
    try { return localStorage.getItem("mlfb-mlc-panel-visible") === "true"; } catch { return false; }
  })(),
  mlcPanelCollapsed: (() => {
    try { return localStorage.getItem("mlfb-mlc-panel-collapsed") === "true"; } catch { return false; }
  })(),
  mlcPanelPosition: (() => {
    try {
      const stored = localStorage.getItem("mlfb-mlc-panel-position");
      return stored === "left" ? "left" : "right";
    } catch { return "right"; }
  })(),
  mlcPanelWidth: (() => {
    try {
      const stored = Number(localStorage.getItem("mlfb-mlc-panel-width"));
      return Number.isFinite(stored) && stored > 0
        ? Math.min(MLC_PANEL_MAX_WIDTH, Math.max(MLC_PANEL_MIN_WIDTH, stored))
        : MLC_PANEL_DEFAULT_WIDTH;
    } catch { return MLC_PANEL_DEFAULT_WIDTH; }
  })(),
  mlcActiveWorkspacePath: null,
  sidePanelActiveTab: (() => {
    try {
      const stored = localStorage.getItem("mlfb-side-panel-active-tab");
      return stored === "resources" ? "resources" : "mlc";
    } catch { return "mlc"; }
  })(),

  addCaller: (caller) => {
    const { callers, callerOrder } = get();
    const existing = callers.find((c) => c.id === caller.id);
    if (existing) {
      // Update clientName or alias if previously missing
      const needsUpdate = (!existing.clientName && caller.clientName) || (!existing.alias && caller.alias);
      if (needsUpdate) {
        set({ callers: callers.map((c) => c.id === caller.id ? {
          ...c,
          clientName: c.clientName || caller.clientName,
          alias: c.alias || caller.alias,
        } : c) });
      }
      return;
    }
    const nextOrder = callerOrder.includes(caller.id)
      ? callerOrder
      : [...callerOrder, caller.id];
    set({ callers: [...callers, caller], callerOrder: nextOrder });
  },

  updateCallerColor: (id, color) => {
    set((state) => ({
      callers: state.callers.map((c) =>
        c.id === id ? { ...c, color } : c
      ),
    }));
  },

  setActiveCaller: (id) => {
    set({ activeCallerId: id });
    // Mark caller as read when user navigates to it
    get().markCallerRead(id);
    // Auto-select the latest pending session for this caller
    const { sessions } = get();
    const callerSessions = sessions.filter((s) => s.callerId === id);
    const pending = callerSessions.filter((s) => s.status === "pending");
    if (pending.length > 0) {
      set({ activeSessionId: pending[pending.length - 1].id });
    } else if (callerSessions.length > 0) {
      set({ activeSessionId: callerSessions[callerSessions.length - 1].id });
    } else {
      set({ activeSessionId: null });
    }
  },

  setCallerOrder: (order) => {
    set({ callerOrder: order });
    invoke("update_caller_order", { order }).catch((e: unknown) =>
      console.error("Failed to persist caller order:", e)
    );
  },

  sortCallersByName: () => {
    const { callers, callerOrder } = get();
    const order = callerOrder.length > 0
      ? [...callerOrder]
      : callers.map((c) => c.id);
    const callerMap = new Map(callers.map((c) => [c.id, c]));
    // Group by workspace name, preserving original relative order within each group
    // Map insertion order = first-appearance order of each workspace
    const groups = new Map<string, string[]>();
    for (const id of order) {
      const name = callerMap.get(id)?.name ?? "";
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(id);
    }
    const nextOrder = [...groups.values()].flat();
    get().setCallerOrder(nextOrder);
  },

  renameCaller: async (callerId, newName) => {
    await invoke("rename_caller", { callerId, newName });
    set((state) => ({
      callers: state.callers.map((c) =>
        c.id === callerId ? { ...c, name: newName } : c
      ),
    }));
  },

  mergeCallers: async (sourceId, targetId) => {
    await invoke("merge_callers", { sourceId, targetId });
    const { callers, callerOrder, hiddenCallerIds, sessions, activeCallerId, activeSessionId, queuedDraftsByCallerId } = get();
    const targetCaller = callers.find((c) => c.id === targetId);
    const targetAlias = targetCaller?.alias || "";
    // Move all sessions from source to target; inject [System] notice into pending sessions
    const updatedSessions = sessions.map((s) => {
      if (s.callerId !== sourceId) return s;
      const moved = { ...s, callerId: targetId };
      if (moved.status === "pending" && targetAlias) {
        moved.summary = `[System] Agent merged: your identifier has been updated to agent_name="${targetAlias}". Use this in ALL subsequent interactive_feedback calls.\n\n${moved.summary}`;
      }
      return moved;
    });
    // Remove source caller
    const newCallers = callers.filter((c) => c.id !== sourceId);
    const newCallerOrder = callerOrder.filter((id) => id !== sourceId);
    const newHiddenCallerIds = hiddenCallerIds.filter((id) => id !== sourceId);
    try { localStorage.setItem("mlf-hidden-callers", JSON.stringify(newHiddenCallerIds)); } catch {}
    const newActiveCallerId = activeCallerId === sourceId ? targetId : activeCallerId;
    let newActiveSessionId = activeSessionId;
    const newQueuedDrafts = { ...queuedDraftsByCallerId };
    const sourceDraft = newQueuedDrafts[sourceId];
    if (sourceDraft) {
      const targetDraft = newQueuedDrafts[targetId];
      if (targetDraft) {
        newQueuedDrafts[targetId] = {
          feedbackText: [targetDraft.feedbackText.trim(), sourceDraft.feedbackText.trim()].filter(Boolean).join("\n\n"),
          testLogText: [targetDraft.testLogText.trim(), sourceDraft.testLogText.trim()].filter(Boolean).join("\n\n"),
          images: [...targetDraft.images, ...sourceDraft.images].slice(0, IMAGE_MAX_COUNT),
          gitAction: targetDraft.gitAction || sourceDraft.gitAction,
          mlcAttachments: [...(targetDraft.mlcAttachments || []), ...(sourceDraft.mlcAttachments || [])],
          updatedAt: new Date().toISOString(),
        };
      } else {
        newQueuedDrafts[targetId] = sourceDraft;
      }
      delete newQueuedDrafts[sourceId];
    }
    persistQueuedDrafts(newQueuedDrafts);
    // If active session belonged to source, keep it (it's now under target)
    set({
      callers: newCallers,
      callerOrder: newCallerOrder,
      hiddenCallerIds: newHiddenCallerIds,
      sessions: updatedSessions,
      activeCallerId: newActiveCallerId,
      activeSessionId: newActiveSessionId,
      queuedDraftsByCallerId: newQueuedDrafts,
    });
  },

  clearAllHistory: async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("clear_all_history");
    try { localStorage.removeItem("mlf-hidden-callers"); } catch {}
    saveMessageHistory({});
    persistQueuedDrafts({});
    set({
      callers: [],
      callerOrder: [],
      hiddenCallerIds: [],
      sessions: [],
      activeCallerId: null,
      activeSessionId: null,
      unreadCallerIds: [],
      queuedDraftsByCallerId: {},
      messageHistoryByCallerId: {},
      focusedComposer: null,
    });
  },

  addSession: (session, options) => {
    const normalizedSession = { ...session, mlcAttachments: session.mlcAttachments || [] };
    const attentionMode = options?.attentionMode ?? "interrupt";
    const shouldInterrupt = attentionMode !== "passive";
    const wasHidden = get().hiddenCallerIds.includes(normalizedSession.callerId);
    let inserted = false;
    set((state) => {
      // Idempotent upsert: if a session with the same id already exists,
      // replace it (covers StrictMode double-invoke of load_history and any
      // other duplicate-add path). Otherwise append.
      const idx = state.sessions.findIndex((s) => s.id === normalizedSession.id);
      if (idx >= 0) {
        const next = state.sessions.slice();
        next[idx] = normalizedSession;
        return { sessions: next };
      }
      inserted = true;
      return { sessions: [...state.sessions, normalizedSession] };
    });
    if (inserted && normalizedSession.status === "pending" && options?.applyQueuedDraft !== false) {
      get().applyQueuedDraftToSession(normalizedSession.callerId, normalizedSession.id);
    }
    // Auto-unhide caller when a new pending session arrives
    if (shouldInterrupt && normalizedSession.status === "pending") {
      get().unhideCaller(normalizedSession.callerId);
    }
    // Move caller to visible columns' last position if it was outside the visible window
    if (shouldInterrupt && normalizedSession.status === "pending") {
      const { callerOrder, hiddenCallerIds, visibleColumnCount, callers } = get();
      if (visibleColumnCount > 0) {
        const order = callerOrder.length > 0 ? callerOrder : callers.map(c => c.id);
        const visibleOrder = order.filter(id => !hiddenCallerIds.includes(id));
        const posInVisible = visibleOrder.indexOf(normalizedSession.callerId);
        // Only move if caller exists and is outside the visible columns
        if (posInVisible >= visibleColumnCount || (wasHidden && posInVisible === -1)) {
          // Remove from current position and insert at the last visible column position
          const newOrder = order.filter(id => id !== normalizedSession.callerId);
          // Find the index in newOrder where the (visibleColumnCount-1)th visible caller is
          let visibleSeen = 0;
          let insertAfterIdx = -1;
          for (let i = 0; i < newOrder.length; i++) {
            if (!hiddenCallerIds.includes(newOrder[i])) {
              visibleSeen++;
              if (visibleSeen === visibleColumnCount) {
                insertAfterIdx = i;
                break;
              }
            }
          }
          if (insertAfterIdx === -1) {
            // Less visible callers than columnCount, just append
            newOrder.push(normalizedSession.callerId);
          } else {
            newOrder.splice(insertAfterIdx, 0, normalizedSession.callerId);
          }
          get().setCallerOrder(newOrder);
        }
      }
    }
    // Update pending count for the caller
    get().updateCallerPendingCount(normalizedSession.callerId);
    // Auto-trim sessions per caller if limit is set
    get().trimCallerSessions(normalizedSession.callerId);
    // Auto-remove empty callers if enabled
    if (get().autoRemoveEmptyCallers) {
      get().removeEmptyCallers();
    }
    // Auto-hide inactive callers
    get().hideInactiveCallers();
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  updateSessionField: (sessionId, field, value) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId && s.status === "pending"
          ? { ...s, [field]: value }
          : s
      ),
    }));
  },

  addSessionImage: (sessionId, img) => {
    const { sessions } = get();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || session.status !== "pending") return;
    if (session.images.length >= IMAGE_MAX_COUNT) return;
    if (img.sizeKB / 1024 > IMAGE_MAX_SIZE_MB) return;
    const totalMB = session.images.reduce((acc, i) => acc + i.sizeKB / 1024, 0);
    if (totalMB + img.sizeKB / 1024 > IMAGE_MAX_TOTAL_MB) return;
    if (session.images.find((i) => i.path === img.path)) return;
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, images: [...s.images, img] }
          : s
      ),
    }));
  },

  removeSessionImage: (sessionId, path) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, images: s.images.filter((i) => i.path !== path) }
          : s
      ),
    }));
  },

  clearSessionImages: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, images: [] } : s
      ),
    }));
  },

  addSessionMlcAttachment: (sessionId, attachment) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session || session.status !== "pending") return;
    const normalized = {
      filePath: attachment.filePath,
      title: attachment.title || attachment.filePath,
      description: attachment.description || "",
    };
    if (!normalized.filePath || (session.mlcAttachments || []).some((item) => item.filePath === normalized.filePath)) return;
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, mlcAttachments: [...(s.mlcAttachments || []), normalized] }
          : s
      ),
    }));
  },

  removeSessionMlcAttachment: (sessionId, filePath) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId && s.status === "pending"
          ? { ...s, mlcAttachments: (s.mlcAttachments || []).filter((item) => item.filePath !== filePath) }
          : s
      ),
    }));
  },

  clearSessionMlcAttachments: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId && s.status === "pending" ? { ...s, mlcAttachments: [] } : s
      ),
    }));
  },

  setSessionGitAction: (sessionId, action) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId && s.status === "pending"
          ? { ...s, gitAction: action }
          : s
      ),
    }));
  },

  updateSessionGitBranchName: (sessionId, branchName) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId && s.status === "pending" && s.gitAction?.type === "create-branch"
          ? { ...s, gitAction: { ...s.gitAction, branchName } }
          : s
      ),
    }));
  },

  markSessionResponded: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status: "responded" as const } : s
      ),
      focusedComposer: state.focusedComposer?.sessionId === sessionId ? null : state.focusedComposer,
    }));
    // Find the caller and update pending count
    const session = get().sessions.find((s) => s.id === sessionId);
    if (session) {
      get().updateCallerPendingCount(session.callerId);
    }
  },

  markSessionCancelled: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status: "cancelled" as const } : s
      ),
      focusedComposer: state.focusedComposer?.sessionId === sessionId ? null : state.focusedComposer,
    }));
    invoke("cancel_session", { sessionId }).catch((e: unknown) =>
      console.error("Failed to persist cancelled session:", e)
    );
    const session = get().sessions.find((s) => s.id === sessionId);
    if (session) {
      get().updateCallerPendingCount(session.callerId);
    }
  },

  updateSessionAnswer: (sessionId, questionIndex, answer) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              questions: s.questions.map((q, i) =>
                i === questionIndex ? { ...q, answer } : q
              ),
            }
          : s
      ),
    }));
  },

  toggleSessionOption: (sessionId, questionIndex, option) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              questions: s.questions.map((q, i) => {
                if (i !== questionIndex) return q;
                const sel = q.selectedOptions || [];
                const has = sel.includes(option);
                return { ...q, selectedOptions: has ? sel.filter((o) => o !== option) : [...sel, option] };
              }),
            }
          : s
      ),
    }));
  },

  removeSession: (sessionId) => {
    const { sessions, activeSessionId, callers, callerOrder } = get();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const remaining = sessions.filter((s) => s.id !== sessionId);
    set((state) => ({
      sessions: remaining,
      focusedComposer: state.focusedComposer?.sessionId === sessionId ? null : state.focusedComposer,
    }));
    // If we removed the active session, select another one from the same caller
    if (activeSessionId === sessionId) {
      const callerSessions = remaining.filter((s) => s.callerId === session.callerId);
      if (callerSessions.length > 0) {
        set({ activeSessionId: callerSessions[callerSessions.length - 1].id });
      } else {
        set({ activeSessionId: null });
      }
    }
    // Remove caller if no sessions remain for it
    const callerHasSessions = remaining.some((s) => s.callerId === session.callerId);
    if (!callerHasSessions) {
      const newCallers = callers.filter((c) => c.id !== session.callerId);
      const newCallerOrder = callerOrder.filter((id) => id !== session.callerId);
      const wasActive = get().activeCallerId === session.callerId;
      // Switch to next available caller if the deleted one was active
      const newActiveCallerId = wasActive
        ? (newCallerOrder.length > 0 ? newCallerOrder[0] : null)
        : get().activeCallerId;
      // Also set activeSessionId for the new caller
      let newActiveSessionId = get().activeSessionId;
      if (wasActive && newActiveCallerId) {
        const nextCallerSessions = remaining.filter((s) => s.callerId === newActiveCallerId);
        newActiveSessionId = nextCallerSessions.length > 0
          ? nextCallerSessions[nextCallerSessions.length - 1].id
          : null;
      }
      const newQueuedDrafts = Object.fromEntries(Object.entries(get().queuedDraftsByCallerId).filter(([id]) => id !== session.callerId));
      persistQueuedDrafts(newQueuedDrafts);
      set({
        callers: newCallers,
        callerOrder: newCallerOrder,
        activeCallerId: newActiveCallerId,
        activeSessionId: newActiveSessionId,
        queuedDraftsByCallerId: newQueuedDrafts,
      });
    } else {
      // Update pending count
      get().updateCallerPendingCount(session.callerId);
    }
    // Sync deletion to backend persistence
    invoke("remove_session", { sessionId }).catch((e: unknown) =>
      console.error("Failed to remove session from backend:", e)
    );
  },

  updateCallerPendingCount: (callerId) => {
    const { sessions, callers } = get();
    const count = sessions.filter(
      (s) => s.callerId === callerId && s.status === "pending"
    ).length;
    const oldCount = callers.find((c) => c.id === callerId)?.pendingCount ?? 0;
    set((state) => ({
      callers: state.callers.map((c) =>
        c.id === callerId ? { ...c, pendingCount: count } : c
      ),
      // Only add to unread if count actually increased
      unreadCallerIds: count > oldCount
        ? [...new Set([...state.unreadCallerIds, callerId])]
        : state.unreadCallerIds,
    }));
    // Auto-clear when persistent unread is disabled
    if (count > oldCount) {
      try {
        const raw = localStorage.getItem("mlf-notification-settings");
        const settings = raw ? JSON.parse(raw) : {};
        if (settings.persistentUnread === false) {
          setTimeout(() => get().markCallerRead(callerId), 3000);
        }
      } catch {}
    }
  },
  markCallerRead: (callerId) => {
    set((state) => ({
      unreadCallerIds: state.unreadCallerIds.filter((id) => id !== callerId),
    }));
  },
  toggleCallerHidden: (callerId) => {
    const { hiddenCallerIds } = get();
    const next = hiddenCallerIds.includes(callerId)
      ? hiddenCallerIds.filter((id) => id !== callerId)
      : [...hiddenCallerIds, callerId];
    set({ hiddenCallerIds: next });
    try { localStorage.setItem("mlf-hidden-callers", JSON.stringify(next)); } catch {}
  },
  unhideCaller: (callerId) => {
    const { hiddenCallerIds } = get();
    if (!hiddenCallerIds.includes(callerId)) return;
    const next = hiddenCallerIds.filter((id) => id !== callerId);
    set({ hiddenCallerIds: next });
    try { localStorage.setItem("mlf-hidden-callers", JSON.stringify(next)); } catch {}
  },

  removeCaller: async (callerId) => {
    await invoke("remove_caller", { callerId });
    const { callers, callerOrder, hiddenCallerIds, sessions, activeCallerId, queuedDraftsByCallerId, messageHistoryByCallerId } = get();
    const remaining = sessions.filter((s) => s.callerId !== callerId);
    const newCallers = callers.filter((c) => c.id !== callerId);
    const newCallerOrder = callerOrder.filter((id) => id !== callerId);
    const newHiddenCallerIds = hiddenCallerIds.filter((id) => id !== callerId);
    try { localStorage.setItem("mlf-hidden-callers", JSON.stringify(newHiddenCallerIds)); } catch {}
    const wasActive = activeCallerId === callerId;
    const newActiveCallerId = wasActive
      ? (newCallerOrder.length > 0 ? newCallerOrder[0] : null)
      : activeCallerId;
    let newActiveSessionId = get().activeSessionId;
    if (wasActive && newActiveCallerId) {
      const nextCallerSessions = remaining.filter((s) => s.callerId === newActiveCallerId);
      newActiveSessionId = nextCallerSessions.length > 0
        ? nextCallerSessions[nextCallerSessions.length - 1].id
        : null;
    } else if (wasActive) {
      newActiveSessionId = null;
    }
    const newQueuedDrafts = Object.fromEntries(Object.entries(queuedDraftsByCallerId).filter(([id]) => id !== callerId));
    persistQueuedDrafts(newQueuedDrafts);
    set({
      callers: newCallers,
      callerOrder: newCallerOrder,
      hiddenCallerIds: newHiddenCallerIds,
      sessions: remaining,
      activeCallerId: newActiveCallerId,
      activeSessionId: newActiveSessionId,
      queuedDraftsByCallerId: newQueuedDrafts,
      messageHistoryByCallerId: Object.fromEntries(Object.entries(messageHistoryByCallerId).filter(([id]) => id !== callerId)),
      focusedComposer: get().focusedComposer?.callerId === callerId ? null : get().focusedComposer,
    });
    saveMessageHistory(get().messageHistoryByCallerId);
  },

  removeEmptyCallers: async () => {
    const removedIds: string[] = await invoke("remove_empty_callers");
    if (removedIds.length === 0) return removedIds;
    const { callers, callerOrder, hiddenCallerIds, activeCallerId, queuedDraftsByCallerId, messageHistoryByCallerId } = get();
    const removedSet = new Set(removedIds);
    const newCallers = callers.filter((c) => !removedSet.has(c.id));
    const newCallerOrder = callerOrder.filter((id) => !removedSet.has(id));
    const newHiddenCallerIds = hiddenCallerIds.filter((id) => !removedSet.has(id));
    try { localStorage.setItem("mlf-hidden-callers", JSON.stringify(newHiddenCallerIds)); } catch {}
    const newActiveCallerId = activeCallerId && removedSet.has(activeCallerId)
      ? (newCallerOrder.length > 0 ? newCallerOrder[0] : null)
      : activeCallerId;
    const newQueuedDrafts = Object.fromEntries(Object.entries(queuedDraftsByCallerId).filter(([id]) => !removedSet.has(id)));
    persistQueuedDrafts(newQueuedDrafts);
    set({
      callers: newCallers,
      callerOrder: newCallerOrder,
      hiddenCallerIds: newHiddenCallerIds,
      activeCallerId: newActiveCallerId,
      queuedDraftsByCallerId: newQueuedDrafts,
      messageHistoryByCallerId: Object.fromEntries(Object.entries(messageHistoryByCallerId).filter(([id]) => !removedSet.has(id))),
      focusedComposer: get().focusedComposer && removedSet.has(get().focusedComposer!.callerId) ? null : get().focusedComposer,
    });
    saveMessageHistory(get().messageHistoryByCallerId);
    return removedIds;
  },

  setMaxSessionsPerCaller: (value) => {
    set({ maxSessionsPerCaller: value });
    try { localStorage.setItem("mlf-max-sessions-per-caller", String(value)); } catch {}
  },

  setAutoRemoveEmptyCallers: (value) => {
    set({ autoRemoveEmptyCallers: value });
    try { localStorage.setItem("mlf-auto-remove-empty-callers", String(value)); } catch {}
  },

  setAutoHideInactiveHours: (value) => {
    set({ autoHideInactiveHours: value });
    try { localStorage.setItem("mlf-auto-hide-inactive-hours", String(value)); } catch {}
  },

  hideInactiveCallers: () => {
    const { autoHideInactiveHours, callers, sessions, hiddenCallerIds } = get();
    if (autoHideInactiveHours <= 0) return;
    const now = Date.now();
    const thresholdMs = autoHideInactiveHours * 60 * 60 * 1000;
    for (const caller of callers) {
      if (hiddenCallerIds.includes(caller.id)) continue;
      const callerSessions = sessions.filter((s) => s.callerId === caller.id);
      if (callerSessions.length === 0) continue; // empty callers handled by autoRemoveEmptyCallers
      const latestTime = Math.max(...callerSessions.map((s) => new Date(s.createdAt).getTime()));
      if (now - latestTime > thresholdMs) {
        get().toggleCallerHidden(caller.id);
      }
    }
  },

  trimCallerSessions: async (callerId) => {
    const { maxSessionsPerCaller, sessions } = get();
    if (maxSessionsPerCaller <= 0) return;
    const callerSessionCount = sessions.filter((s) => s.callerId === callerId).length;
    if (callerSessionCount <= maxSessionsPerCaller) return;
    const removed: number = await invoke("trim_caller_sessions", { callerId, maxPerCaller: maxSessionsPerCaller });
    if (removed > 0) {
      // Reload sessions from backend would be complex; instead trim locally
      const callerSessions = sessions
        .filter((s) => s.callerId === callerId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      // Non-pending first, then pending
      const nonPending = callerSessions.filter((s) => s.status !== "pending");
      const pending = callerSessions.filter((s) => s.status === "pending");
      const ordered = [...nonPending, ...pending];
      const toRemoveIds = new Set(ordered.slice(0, removed).map((s) => s.id));
      const remaining = sessions.filter((s) => !toRemoveIds.has(s.id));
      const { activeSessionId } = get();
      set({
        sessions: remaining,
        activeSessionId: activeSessionId && toRemoveIds.has(activeSessionId)
          ? (remaining.filter((s) => s.callerId === callerId).pop()?.id ?? null)
          : activeSessionId,
      });
    }
  },

  setVisibleColumnCount: (count) => set({ visibleColumnCount: count }),

  setQueuedDrafts: (drafts) => set({
    queuedDraftsByCallerId: Object.fromEntries(
      Object.entries(drafts || {}).map(([callerId, draft]) => [callerId, normalizeDraft(draft)])
    ),
  }),

  getQueuedDraft: (callerId) => normalizeDraft(get().queuedDraftsByCallerId[callerId]),

  updateQueuedDraftField: (callerId, field, value) => {
    set((state) => {
      const draft = state.queuedDraftsByCallerId[callerId] || emptyDraft();
      const next = {
        queuedDraftsByCallerId: {
          ...state.queuedDraftsByCallerId,
          [callerId]: { ...draft, [field]: value, updatedAt: new Date().toISOString() },
        },
      };
      persistQueuedDrafts(next.queuedDraftsByCallerId);
      return next;
    });
  },

  addQueuedDraftImage: (callerId, img) => {
    const draft = get().getQueuedDraft(callerId);
    if (draft.images.length >= IMAGE_MAX_COUNT) return;
    if (img.sizeKB / 1024 > IMAGE_MAX_SIZE_MB) return;
    const totalMB = draft.images.reduce((acc, i) => acc + i.sizeKB / 1024, 0);
    if (totalMB + img.sizeKB / 1024 > IMAGE_MAX_TOTAL_MB) return;
    if (draft.images.find((i) => i.path === img.path)) return;
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, images: [...draft.images, img], updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  removeQueuedDraftImage: (callerId, path) => {
    const draft = get().getQueuedDraft(callerId);
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, images: draft.images.filter((i) => i.path !== path), updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  clearQueuedDraftImages: (callerId) => {
    const draft = get().getQueuedDraft(callerId);
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, images: [], updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  addQueuedDraftMlcAttachment: (callerId, attachment) => {
    const draft = get().getQueuedDraft(callerId);
    if (draft.mlcAttachments.find((item) => item.filePath === attachment.filePath)) return;
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, mlcAttachments: [...draft.mlcAttachments, attachment], updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  removeQueuedDraftMlcAttachment: (callerId, filePath) => {
    const draft = get().getQueuedDraft(callerId);
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, mlcAttachments: draft.mlcAttachments.filter((item) => item.filePath !== filePath), updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  clearQueuedDraftMlcAttachments: (callerId) => {
    const draft = get().getQueuedDraft(callerId);
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, mlcAttachments: [], updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  setQueuedDraftGitAction: (callerId, action) => {
    const draft = get().getQueuedDraft(callerId);
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, gitAction: action, updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  updateQueuedDraftGitBranchName: (callerId, branchName) => {
    const draft = get().getQueuedDraft(callerId);
    if (draft.gitAction?.type !== "create-branch") return;
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, gitAction: { ...draft.gitAction!, branchName }, updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  clearQueuedDraft: (callerId) => {
    set((state) => {
      const next = { ...state.queuedDraftsByCallerId };
      delete next[callerId];
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  applyQueuedDraftToSession: (callerId, sessionId) => {
    const rawDraft = get().queuedDraftsByCallerId[callerId];
    const draft = normalizeDraft(rawDraft);
    if (!draft || isDraftEmpty(draft)) return;
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId && s.status === "pending"
          ? {
              ...s,
              feedbackText: draft.feedbackText,
              testLogText: draft.testLogText,
              images: draft.images,
              gitAction: draft.gitAction,
              mlcAttachments: draft.mlcAttachments,
            }
          : s
      ),
    }));
    get().clearQueuedDraft(callerId);
  },

  pushMessageHistory: (callerId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    set((state) => {
      const current = state.messageHistoryByCallerId[callerId] || [];
      const withoutSame = current.filter((item) => item !== trimmed);
      const nextForCaller = [...withoutSame, trimmed].slice(-MESSAGE_HISTORY_MAX);
      const next = { ...state.messageHistoryByCallerId, [callerId]: nextForCaller };
      saveMessageHistory(next);
      return { messageHistoryByCallerId: next };
    });
  },

  getMessageHistory: (callerId) => get().messageHistoryByCallerId[callerId] || [],

  clearMessageHistory: (callerId) => {
    set((state) => {
      const next = { ...state.messageHistoryByCallerId };
      if (callerId) delete next[callerId];
      else for (const key of Object.keys(next)) delete next[key];
      saveMessageHistory(next);
      return { messageHistoryByCallerId: next };
    });
  },

  setFocusedComposer: (focus) => set({ focusedComposer: focus, mlcActiveWorkspacePath: focus.projectDirectory || null }),

  clearFocusedComposer: (sessionId) => {
    set((state) => ({
      focusedComposer: !sessionId || state.focusedComposer?.sessionId === sessionId ? null : state.focusedComposer,
    }));
  },

  setMlcPanelVisible: (visible) => {
    set({ mlcPanelVisible: visible });
    try { localStorage.setItem("mlfb-mlc-panel-visible", String(visible)); } catch {}
  },

  setMlcPanelCollapsed: (collapsed) => {
    set({ mlcPanelCollapsed: collapsed });
    try { localStorage.setItem("mlfb-mlc-panel-collapsed", String(collapsed)); } catch {}
  },

  setMlcPanelPosition: (position) => {
    set({ mlcPanelPosition: position });
    try { localStorage.setItem("mlfb-mlc-panel-position", position); } catch {}
  },

  setMlcPanelWidth: (width) => {
    const nextWidth = Math.min(MLC_PANEL_MAX_WIDTH, Math.max(MLC_PANEL_MIN_WIDTH, width));
    set({ mlcPanelWidth: nextWidth });
    try { localStorage.setItem("mlfb-mlc-panel-width", String(nextWidth)); } catch {}
  },

  setMlcActiveWorkspacePath: (path) => set({ mlcActiveWorkspacePath: path }),

  setSidePanelActiveTab: (tab) => {
    set({ sidePanelActiveTab: tab });
    try { localStorage.setItem("mlfb-side-panel-active-tab", tab); } catch {}
  },

  // Derived getters
  getActiveCaller: () => {
    const { callers, activeCallerId } = get();
    return callers.find((c) => c.id === activeCallerId) || null;
  },

  getActiveCallerSessions: () => {
    const { sessions, activeCallerId } = get();
    if (!activeCallerId) return [];
    return sessions.filter((s) => s.callerId === activeCallerId);
  },

  getActiveSession: () => {
    const { sessions, activeSessionId } = get();
    if (!activeSessionId) return null;
    return sessions.find((s) => s.id === activeSessionId) || null;
  },
}));

export { IMAGE_MAX_COUNT, IMAGE_MAX_SIZE_MB, IMAGE_MAX_TOTAL_MB };
