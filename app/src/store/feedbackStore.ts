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
  visibleColumnCount: number; // how many callers are visible in the window columns
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
    const wasHidden = get().hiddenCallerIds.includes(session.callerId);
    set((state) => ({
      sessions: [...state.sessions, session],
    }));
    // Auto-unhide caller when a new pending session arrives
    if (session.status === "pending") {
      get().unhideCaller(session.callerId);
    }
    // Move caller to visible columns' last position if it was outside the visible window
    if (session.status === "pending") {
      const { callerOrder, hiddenCallerIds, visibleColumnCount, callers } = get();
      if (visibleColumnCount > 0) {
        const order = callerOrder.length > 0 ? callerOrder : callers.map(c => c.id);
        const visibleOrder = order.filter(id => !hiddenCallerIds.includes(id));
        const posInVisible = visibleOrder.indexOf(session.callerId);
        // Only move if caller exists and is outside the visible columns
        if (posInVisible >= visibleColumnCount || (wasHidden && posInVisible === -1)) {
          // Remove from current position and insert at the last visible column position
          const newOrder = order.filter(id => id !== session.callerId);
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
            newOrder.push(session.callerId);
          } else {
            newOrder.splice(insertAfterIdx, 0, session.callerId);
          }
          get().setCallerOrder(newOrder);
        }
      }
    }
    // Update pending count for the caller
    get().updateCallerPendingCount(session.callerId);
    // Auto-trim sessions per caller if limit is set
    get().trimCallerSessions(session.callerId);
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

  removeCaller: async (callerId) => {
    await invoke("remove_caller", { callerId });
    const { callers, callerOrder, hiddenCallerIds, sessions, activeCallerId } = get();
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
    set({
      callers: newCallers,
      callerOrder: newCallerOrder,
      hiddenCallerIds: newHiddenCallerIds,
      sessions: remaining,
      activeCallerId: newActiveCallerId,
      activeSessionId: newActiveSessionId,
    });
  },

  removeEmptyCallers: async () => {
    const removedIds: string[] = await invoke("remove_empty_callers");
    if (removedIds.length === 0) return removedIds;
    const { callers, callerOrder, hiddenCallerIds, activeCallerId } = get();
    const removedSet = new Set(removedIds);
    const newCallers = callers.filter((c) => !removedSet.has(c.id));
    const newCallerOrder = callerOrder.filter((id) => !removedSet.has(id));
    const newHiddenCallerIds = hiddenCallerIds.filter((id) => !removedSet.has(id));
    try { localStorage.setItem("mlf-hidden-callers", JSON.stringify(newHiddenCallerIds)); } catch {}
    const newActiveCallerId = activeCallerId && removedSet.has(activeCallerId)
      ? (newCallerOrder.length > 0 ? newCallerOrder[0] : null)
      : activeCallerId;
    set({
      callers: newCallers,
      callerOrder: newCallerOrder,
      hiddenCallerIds: newHiddenCallerIds,
      activeCallerId: newActiveCallerId,
    });
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
