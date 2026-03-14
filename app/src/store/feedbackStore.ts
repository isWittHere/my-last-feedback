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
  // Agent questions
  questions: QuestionItem[];
}

export type AppMode = "legacy" | "persistent";

export interface FeedbackState {
  // App mode
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;

  // ── Legacy mode fields (backward compatible) ──
  summary: string;
  requestName: string;
  projectDirectory: string;
  outputFile: string;
  feedbackText: string;
  testLogText: string;
  images: ImageAttachment[];
  commandLogs: string;
  enableEnhancement: boolean;
  prompts: PromptItem[];
  isSubmitting: boolean;
  isSubmitted: boolean;

  // Legacy actions
  setSummary: (summary: string) => void;
  setRequestName: (name: string) => void;
  setProjectDirectory: (dir: string) => void;
  setOutputFile: (file: string) => void;
  setFeedbackText: (text: string) => void;
  setTestLogText: (text: string) => void;
  addImage: (img: ImageAttachment) => void;
  removeImage: (path: string) => void;
  clearImages: () => void;
  setCommandLogs: (logs: string) => void;
  setEnableEnhancement: (value: boolean) => void;
  setPrompts: (prompts: PromptItem[]) => void;
  setSubmitting: (value: boolean) => void;
  setSubmitted: (value: boolean) => void;

  // Prompt visibility
  disabledPrompts: string[];
  setDisabledPrompts: (names: string[]) => void;
  togglePromptDisabled: (name: string) => void;

  // ── Persistent mode fields ──
  callers: Caller[];
  callerOrder: string[]; // user-controlled display order of caller IDs
  unreadCallerIds: string[]; // callers with unread new sessions
  hiddenCallerIds: string[]; // callers hidden from top bar tabs
  sessions: Session[];
  activeCallerId: string | null;
  activeSessionId: string | null;

  // Persistent mode actions
  addCaller: (caller: Caller) => void;
  updateCallerColor: (id: string, color: string) => void;
  setActiveCaller: (id: string) => void;
  setCallerOrder: (order: string[]) => void;
  sortCallersByName: () => void;
  renameCaller: (callerId: string, newName: string) => Promise<void>;
  mergeCallers: (sourceId: string, targetId: string) => Promise<void>;
  clearAllHistory: () => Promise<void>;
  addSession: (session: Session) => void;
  setActiveSession: (id: string) => void;
  updateSessionField: (sessionId: string, field: keyof Pick<Session, "feedbackText" | "testLogText" | "commandLogs">, value: string) => void;
  addSessionImage: (sessionId: string, img: ImageAttachment) => void;
  removeSessionImage: (sessionId: string, path: string) => void;
  clearSessionImages: (sessionId: string) => void;
  markSessionResponded: (sessionId: string) => void;
  markSessionCancelled: (sessionId: string) => void;
  removeSession: (sessionId: string) => void;
  updateSessionAnswer: (sessionId: string, questionIndex: number, answer: string) => void;
  toggleSessionOption: (sessionId: string, questionIndex: number, option: string) => void;
  updateCallerPendingCount: (callerId: string) => void;
  markCallerRead: (callerId: string) => void;
  toggleCallerHidden: (callerId: string) => void;
  unhideCaller: (callerId: string) => void;

  // Derived getters
  getActiveCaller: () => Caller | null;
  getActiveCallerSessions: () => Session[];
  getActiveSession: () => Session | null;
}

const IMAGE_MAX_COUNT = 5;
const IMAGE_MAX_SIZE_MB = 5;
const IMAGE_MAX_TOTAL_MB = 20;

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  // App mode
  appMode: "legacy",
  setAppMode: (mode) => set({ appMode: mode }),

  // ── Legacy mode defaults ──
  summary: "",
  requestName: "",
  projectDirectory: "",
  outputFile: "",
  feedbackText: "",
  testLogText: "",
  images: [],
  commandLogs: "",
  enableEnhancement: true,
  prompts: [],
  isSubmitting: false,
  isSubmitted: false,

  setSummary: (summary) => set({ summary }),
  setRequestName: (name) => set({ requestName: name }),
  setProjectDirectory: (dir) => set({ projectDirectory: dir }),
  setOutputFile: (file) => set({ outputFile: file }),
  setFeedbackText: (text) => set({ feedbackText: text }),
  setTestLogText: (text) => set({ testLogText: text }),

  addImage: (img) => {
    const { images } = get();
    if (images.length >= IMAGE_MAX_COUNT) return;
    if (img.sizeKB / 1024 > IMAGE_MAX_SIZE_MB) return;
    const totalMB = images.reduce((acc, i) => acc + i.sizeKB / 1024, 0);
    if (totalMB + img.sizeKB / 1024 > IMAGE_MAX_TOTAL_MB) return;
    if (images.find((i) => i.path === img.path)) return;
    set({ images: [...images, img] });
  },

  removeImage: (path) =>
    set((state) => ({ images: state.images.filter((i) => i.path !== path) })),

  clearImages: () => set({ images: [] }),

  setCommandLogs: (logs) => set({ commandLogs: logs }),
  setEnableEnhancement: (value) => {
    set({ enableEnhancement: value });
    try { localStorage.setItem("mlf-enhancement", String(value)); } catch {}
  },
  setPrompts: (prompts) => set({ prompts }),

  setSubmitting: (value) => set({ isSubmitting: value }),
  setSubmitted: (value) => set({ isSubmitted: value }),

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
  hiddenCallerIds: (() => {
    try {
      const stored = localStorage.getItem("mlf-hidden-callers");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  })(),
  sessions: [],
  activeCallerId: null,
  activeSessionId: null,

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
    const { callers, callerOrder, hiddenCallerIds, sessions, activeCallerId, activeSessionId } = get();
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
    // If active session belonged to source, keep it (it's now under target)
    set({
      callers: newCallers,
      callerOrder: newCallerOrder,
      hiddenCallerIds: newHiddenCallerIds,
      sessions: updatedSessions,
      activeCallerId: newActiveCallerId,
      activeSessionId: newActiveSessionId,
    });
  },

  clearAllHistory: async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("clear_all_history");
    try { localStorage.removeItem("mlf-hidden-callers"); } catch {}
    set({
      callers: [],
      callerOrder: [],
      hiddenCallerIds: [],
      sessions: [],
      activeCallerId: null,
      activeSessionId: null,
      unreadCallerIds: [],
    });
  },

  addSession: (session) => {
    set((state) => ({
      sessions: [...state.sessions, session],
    }));
    // Auto-unhide caller when a new pending session arrives
    if (session.status === "pending") {
      get().unhideCaller(session.callerId);
    }
    // Update pending count for the caller
    get().updateCallerPendingCount(session.callerId);
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

  markSessionResponded: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status: "responded" as const } : s
      ),
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
    set({ sessions: remaining });
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
      set({
        callers: newCallers,
        callerOrder: newCallerOrder,
        activeCallerId: newActiveCallerId,
        activeSessionId: newActiveSessionId,
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
