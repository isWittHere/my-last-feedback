import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useFeedbackStore, type ElementScreenshotRef, type ImageAttachment, type PickedElement, type WebAttachment, type WebConsoleEntry } from "./feedbackStore";

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
  zoom: number;
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
  boundsByTab: Record<string, PreviewBounds>;
  activeTabId: string | null;
  pickerMode: PreviewPickerMode;
  inspectorMode: PreviewInspectorMode;
  consoleFilter: "all" | "warnings-errors" | "errors";
  createTab: (url?: string) => Promise<string>;
  ensureInitialTab: () => Promise<string | null>;
  closeTab: (tabId: string) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  navigate: (tabId: string, url: string) => Promise<void>;
  reload: (tabId: string) => Promise<void>;
  setZoom: (tabId: string, zoom: number) => Promise<void>;
  goBack: (tabId: string) => Promise<void>;
  goForward: (tabId: string) => Promise<void>;
  setBounds: (tabId: string, bounds: PreviewBounds, visible: boolean) => Promise<void>;
  hideTab: (tabId: string) => Promise<void>;
  startPicker: (tabId: string) => Promise<void>;
  stopPicker: (tabId: string) => Promise<void>;
  clearConsole: (tabId: string) => void;
  captureElementScreenshot: (tabId: string, element: PickedElement) => Promise<void>;
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

let initialTabPromise: Promise<string> | null = null;

function toTab(payload: PreviewTabPayload): PreviewBrowserTab {
  const now = new Date().toISOString();
  return {
    id: payload.id,
    webviewLabel: payload.webviewLabel,
    url: payload.url,
    pendingUrl: payload.url === "about:blank" ? "" : payload.url,
    title: payload.title || payload.url || "Preview",
    status: payload.url === "about:blank" ? "idle" : "loading",
    zoom: 1,
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

function addImageToFocusedTarget(image: ImageAttachment): boolean {
  const feedback = useFeedbackStore.getState();
  const target = feedback.focusedComposer;
  if (!target) return false;
  if (target.kind === "queuedDraft") {
    feedback.addQueuedDraftImage(target.callerId, image);
    return true;
  }
  if (!target.sessionId) return false;
  feedback.addSessionImage(target.sessionId, image);
  return true;
}

function imageSizeKBFromDataUrl(dataUrl?: string): number {
  if (!dataUrl) return 0;
  const base64 = dataUrl.split(",", 2)[1]?.replace(/\s/g, "");
  if (!base64) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(1, Math.ceil(((base64.length * 3) / 4 - padding) / 1024));
}

export const usePreviewBrowserStore = create<PreviewBrowserState>((set, get) => ({
  tabs: [],
  boundsByTab: {},
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

  ensureInitialTab: async () => {
    const existing = get().activeTabId || get().tabs[0]?.id || null;
    if (existing) return existing;
    if (initialTabPromise) return initialTabPromise;
    initialTabPromise = get().createTab().finally(() => { initialTabPromise = null; });
    return initialTabPromise;
  },

  closeTab: async (tabId) => {
    await invoke("preview_close_tab", { tabId });
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.id === tabId);
      const tabs = state.tabs.filter((tab) => tab.id !== tabId);
      const activeTabId = state.activeTabId === tabId
        ? (tabs[Math.min(index, tabs.length - 1)]?.id || tabs[tabs.length - 1]?.id || null)
        : state.activeTabId;
      const boundsByTab = { ...state.boundsByTab };
      delete boundsByTab[tabId];
      return { tabs, activeTabId, boundsByTab };
    });
  },

  setActiveTab: (tabId) => {
    const current = get().activeTabId;
    if (current && current !== tabId && get().pickerMode !== "off") {
      void invoke("preview_stop_picker", { tabId: current }).catch(() => undefined);
    }
    set({ activeTabId: tabId, pickerMode: "off" });
  },

  navigate: async (tabId, url) => {
    if (get().pickerMode !== "off") await invoke("preview_stop_picker", { tabId }).catch(() => undefined);
    set({ pickerMode: "off" });
    set((state) => ({ tabs: updateTab(state.tabs, tabId, { pendingUrl: url, status: "loading", errorMessage: undefined }) }));
    await invoke("preview_navigate", { tabId, url });
  },

  reload: async (tabId) => {
    const tab = get().tabs.find((item) => item.id === tabId);
    if (!tab || tab.url === "about:blank") return;
    if (get().pickerMode !== "off") await invoke("preview_stop_picker", { tabId }).catch(() => undefined);
    set({ pickerMode: "off" });
    set((state) => ({ tabs: updateTab(state.tabs, tabId, { status: "loading", errorMessage: undefined }) }));
    await invoke("preview_reload", { tabId });
  },
  setZoom: async (tabId, zoom) => {
    const nextZoom = Math.min(2, Math.max(0.5, Math.round(zoom * 100) / 100));
    set((state) => ({ tabs: updateTab(state.tabs, tabId, { zoom: nextZoom }) }));
    await invoke("preview_set_zoom", { tabId, zoom: nextZoom });
  },
  goBack: async (tabId) => { await invoke("preview_go_back", { tabId }); },
  goForward: async (tabId) => { await invoke("preview_go_forward", { tabId }); },
  setBounds: async (tabId, bounds, visible) => {
    await invoke("preview_set_bounds", { tabId, bounds, visible });
    set((state) => ({ boundsByTab: { ...state.boundsByTab, [tabId]: bounds } }));
  },
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
  captureElementScreenshot: async (tabId, element) => {
    if (!element.rect) return;
    const bounds = get().boundsByTab[tabId];
    if (!bounds) return;
    try {
      const screenshot = await invoke<ElementScreenshotRef>("preview_capture_element", {
        request: {
          tabId,
          rect: element.rect,
          bounds,
          devicePixelRatio: window.devicePixelRatio || 1,
        },
      });
      set((state) => ({
        tabs: state.tabs.map((item) => item.id === tabId && item.selectedElement
          ? { ...item, selectedElement: { ...item.selectedElement, screenshot }, updatedAt: new Date().toISOString() }
          : item),
      }));
    } catch (error) {
      const screenshot: ElementScreenshotRef = {
        id: `element-shot-failed-${Date.now()}`,
        kind: "element",
        mimeType: "image/png",
        width: 0,
        height: 0,
        devicePixelRatio: window.devicePixelRatio || 1,
        rect: element.rect,
        capturedAt: new Date().toISOString(),
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
      set((state) => ({
        tabs: state.tabs.map((item) => item.id === tabId && item.selectedElement
          ? { ...item, selectedElement: { ...item.selectedElement, screenshot }, updatedAt: new Date().toISOString() }
          : item),
      }));
    }
  },
  setInspectorMode: (inspectorMode) => set({ inspectorMode }),
  setConsoleFilter: (consoleFilter) => set({ consoleFilter }),

  handleTabUpdated: (payload) => {
    set((state) => ({ tabs: updateTab(state.tabs, payload.id, payload) }));
  },

  handleLoadStarted: ({ tabId, url }) => {
    set((state) => ({ tabs: updateTab(state.tabs, tabId, { url, pendingUrl: url, status: "loading", errorMessage: undefined }) }));
  },

  handleLoadFinished: ({ tabId, url }) => {
    const tab = get().tabs.find((item) => item.id === tabId);
    set((state) => ({ tabs: updateTab(state.tabs, tabId, { url, pendingUrl: url, status: "loaded", errorMessage: undefined }) }));
    if (tab?.zoom && tab.zoom !== 1) void get().setZoom(tabId, tab.zoom);
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
    void get().captureElementScreenshot(tabId, element);
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
    const attached = addAttachmentToFocusedTarget(attachment);
    const screenshot = tab.selectedElement.screenshot;
    if (attached && screenshot?.status === "ready" && screenshot.filePath && screenshot.dataUrl) {
      addImageToFocusedTarget({
        path: screenshot.filePath,
        name: screenshot.fileName || "element-screenshot.png",
        sizeKB: screenshot.sizeKB || screenshot.sizeKb || imageSizeKBFromDataUrl(screenshot.dataUrl),
        dataUrl: screenshot.dataUrl,
      });
    }
    return attached;
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
