import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useFeedbackStore, type PickedElement, type WebAttachment, type WebConsoleEntry } from "./feedbackStore";

export type PreviewLoadStatus = "idle" | "loading" | "loaded" | "error";
export type PreviewPickerMode = "off" | "arming" | "active";
export type PreviewInspectorMode = "selected" | "console" | "attachments";

export interface PreviewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreviewBrowserTab {
  id: string;
  webviewLabel: string;
  url: string;
  pendingUrl: string;
  title: string;
  status: PreviewLoadStatus;
  errorMessage?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  selectedElement: PickedElement | null;
  consoleEntries: WebConsoleEntry[];
  createdAt: string;
  updatedAt: string;
}

interface PreviewTabPayload {
  id: string;
  webviewLabel: string;
  url: string;
  title: string;
}

interface PreviewBrowserState {
  tabs: PreviewBrowserTab[];
  activeTabId: string | null;
  pickerMode: PreviewPickerMode;
  inspectorMode: PreviewInspectorMode;
  consoleFilter: "all" | "warnings-errors" | "errors";
  createTab: (url?: string) => Promise<string>;
  closeTab: (tabId: string) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  navigate: (tabId: string, url: string) => Promise<void>;
  reload: (tabId: string) => Promise<void>;
  goBack: (tabId: string) => Promise<void>;
  goForward: (tabId: string) => Promise<void>;
  setBounds: (tabId: string, bounds: PreviewBounds, visible: boolean) => Promise<void>;
  hideTab: (tabId: string) => Promise<void>;
  startPicker: (tabId: string) => Promise<void>;
  stopPicker: (tabId: string) => Promise<void>;
  clearConsole: (tabId: string) => void;
  setInspectorMode: (mode: PreviewInspectorMode) => void;
  setConsoleFilter: (filter: "all" | "warnings-errors" | "errors") => void;
  handleTabUpdated: (payload: Partial<PreviewBrowserTab> & { id: string }) => void;
  handleLoadStarted: (payload: { tabId: string; url: string }) => void;
  handleLoadFinished: (payload: { tabId: string; url: string }) => void;
  handleLoadError: (payload: { tabId: string; url: string; error: string }) => void;
  handlePickerReady: (payload: { tabId: string }) => void;
  handlePickerCancelled: (payload: { tabId: string }) => void;
  handleElementPicked: (payload: { tabId: string; element: PickedElement }) => void;
  handleConsoleEntry: (payload: { tabId: string; entry: WebConsoleEntry }) => void;
  attachSelectedElement: (tabId: string) => boolean;
  attachConsoleSnapshot: (tabId: string) => boolean;
}

function toTab(payload: PreviewTabPayload): PreviewBrowserTab {
  const now = new Date().toISOString();
  return {
    id: payload.id,
    webviewLabel: payload.webviewLabel,
    url: payload.url,
    pendingUrl: payload.url === "about:blank" ? "" : payload.url,
    title: payload.title || payload.url || "Preview",
    status: payload.url === "about:blank" ? "idle" : "loading",
    canGoBack: false,
    canGoForward: false,
    selectedElement: null,
    consoleEntries: [],
    createdAt: now,
    updatedAt: now,
  };
}

function updateTab(tabs: PreviewBrowserTab[], tabId: string, patch: Partial<PreviewBrowserTab>): PreviewBrowserTab[] {
  return tabs.map((tab) => tab.id === tabId ? { ...tab, ...patch, updatedAt: new Date().toISOString() } : tab);
}

function addAttachmentToFocusedTarget(attachment: WebAttachment): boolean {
  const feedback = useFeedbackStore.getState();
  const target = feedback.focusedComposer;
  if (!target) return false;
  if (target.kind === "queuedDraft") {
    feedback.addQueuedDraftWebAttachment(target.callerId, attachment);
    return true;
  }
  if (!target.sessionId) return false;
  feedback.addSessionWebAttachment(target.sessionId, attachment);
  return true;
}

export const usePreviewBrowserStore = create<PreviewBrowserState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  pickerMode: "off",
  inspectorMode: "selected",
  consoleFilter: "warnings-errors",

  createTab: async (url) => {
    const payload = await invoke<PreviewTabPayload>("preview_create_tab", { url: url || null });
    const tab = toTab(payload);
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }));
    return tab.id;
  },

  closeTab: async (tabId) => {
    await invoke("preview_close_tab", { tabId });
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.id === tabId);
      const tabs = state.tabs.filter((tab) => tab.id !== tabId);
      const activeTabId = state.activeTabId === tabId
        ? (tabs[Math.min(index, tabs.length - 1)]?.id || tabs[tabs.length - 1]?.id || null)
        : state.activeTabId;
      return { tabs, activeTabId };
    });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId, pickerMode: "off" }),

  navigate: async (tabId, url) => {
    set((state) => ({ tabs: updateTab(state.tabs, tabId, { pendingUrl: url, status: "loading", errorMessage: undefined }) }));
    await invoke("preview_navigate", { tabId, url });
  },

  reload: async (tabId) => { await invoke("preview_reload", { tabId }); },
  goBack: async (tabId) => { await invoke("preview_go_back", { tabId }); },
  goForward: async (tabId) => { await invoke("preview_go_forward", { tabId }); },
  setBounds: async (tabId, bounds, visible) => { await invoke("preview_set_bounds", { tabId, bounds, visible }); },
  hideTab: async (tabId) => { await invoke("preview_hide_tab", { tabId }); },

  startPicker: async (tabId) => {
    set({ pickerMode: "arming", inspectorMode: "selected" });
    await invoke("preview_start_picker", { tabId });
  },

  stopPicker: async (tabId) => {
    await invoke("preview_stop_picker", { tabId });
    set({ pickerMode: "off" });
  },

  clearConsole: (tabId) => set((state) => ({ tabs: updateTab(state.tabs, tabId, { consoleEntries: [] }) })),
  setInspectorMode: (inspectorMode) => set({ inspectorMode }),
  setConsoleFilter: (consoleFilter) => set({ consoleFilter }),

  handleTabUpdated: (payload) => {
    set((state) => ({ tabs: updateTab(state.tabs, payload.id, payload) }));
  },

  handleLoadStarted: ({ tabId, url }) => {
    set((state) => ({ tabs: updateTab(state.tabs, tabId, { url, pendingUrl: url, status: "loading", errorMessage: undefined }) }));
  },

  handleLoadFinished: ({ tabId, url }) => {
    set((state) => ({ tabs: updateTab(state.tabs, tabId, { url, pendingUrl: url, status: "loaded", errorMessage: undefined }) }));
  },

  handleLoadError: ({ tabId, url, error }) => {
    set((state) => ({ tabs: updateTab(state.tabs, tabId, { url, pendingUrl: url, status: "error", errorMessage: error }) }));
  },

  handlePickerReady: ({ tabId }) => {
    if (get().activeTabId === tabId) set({ pickerMode: "active", inspectorMode: "selected" });
  },

  handlePickerCancelled: ({ tabId }) => {
    if (get().activeTabId === tabId) set({ pickerMode: "off" });
  },

  handleElementPicked: ({ tabId, element }) => {
    set((state) => ({ tabs: updateTab(state.tabs, tabId, { selectedElement: element }), pickerMode: "off", inspectorMode: "selected" }));
  },

  handleConsoleEntry: ({ tabId, entry }) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => tab.id === tabId
        ? { ...tab, consoleEntries: [...tab.consoleEntries, entry].slice(-500), updatedAt: new Date().toISOString() }
        : tab),
    }));
  },

  attachSelectedElement: (tabId) => {
    const tab = get().tabs.find((item) => item.id === tabId);
    if (!tab?.selectedElement) return false;
    const attachment: WebAttachment = {
      id: `web-element-${tab.id}-${Date.now()}`,
      kind: "element",
      sourceUrl: tab.selectedElement.sourceUrl || tab.url,
      pageTitle: tab.title,
      capturedAt: new Date().toISOString(),
      element: tab.selectedElement,
    };
    return addAttachmentToFocusedTarget(attachment);
  },

  attachConsoleSnapshot: (tabId) => {
    const tab = get().tabs.find((item) => item.id === tabId);
    if (!tab || tab.consoleEntries.length === 0) return false;
    const filtered = get().consoleFilter === "errors"
      ? tab.consoleEntries.filter((entry) => entry.level === "error")
      : get().consoleFilter === "warnings-errors"
        ? tab.consoleEntries.filter((entry) => entry.level === "warn" || entry.level === "error")
        : tab.consoleEntries;
    const entries = (filtered.length > 0 ? filtered : tab.consoleEntries).slice(-80);
    const attachment: WebAttachment = {
      id: `web-console-${tab.id}-${Date.now()}`,
      kind: "console",
      sourceUrl: tab.url,
      pageTitle: tab.title,
      capturedAt: new Date().toISOString(),
      consoleEntries: entries,
    };
    return addAttachmentToFocusedTarget(attachment);
  },
}));
