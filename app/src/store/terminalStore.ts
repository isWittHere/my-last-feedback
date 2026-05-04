import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export type TerminalTabStatus = "starting" | "running" | "exited" | "failed";
export type TerminalPathSource = "recent" | "caller" | "activeSession" | "workspace" | "fallback";

export interface TerminalSessionInfo {
  terminalId: string;
  cwd: string;
  shell: string;
}

export interface TerminalSessionSnapshot extends TerminalSessionInfo {
  output: string;
}

export interface TerminalPathCandidate {
  path: string;
  label: string;
  source: TerminalPathSource;
  callerName?: string;
  lastUsedAt?: string;
}

export interface TerminalTabState {
  id: string;
  terminalId: string | null;
  title: string;
  cwd: string;
  shell: string | null;
  status: TerminalTabStatus;
  output: string;
  error: string | null;
  createdAt: string;
  lastActiveAt: string;
}

interface CreateTerminalTabOptions {
  cols?: number;
  rows?: number;
  source?: TerminalPathSource;
}

interface TerminalWorkspaceState {
  tabs: TerminalTabState[];
  activeTabId: string | null;
  recentPaths: TerminalPathCandidate[];
  lastUsedCwd: string | null;
  restoreBackendTerminals: () => Promise<void>;
  createTerminalTab: (cwd?: string | null, options?: CreateTerminalTabOptions) => Promise<string>;
  restartTerminalTab: (tabId: string, options?: Pick<CreateTerminalTabOptions, "cols" | "rows">) => Promise<void>;
  closeTerminalTab: (tabId: string) => Promise<void>;
  killTerminalTab: (tabId: string) => Promise<void>;
  clearTerminalOutput: (tabId: string) => void;
  setActiveTerminalTab: (tabId: string | null) => void;
  appendTerminalOutput: (terminalId: string, data: string) => void;
  markTerminalExited: (terminalId: string, exitCode: number | null) => void;
  markTerminalFailed: (terminalId: string, message: string) => void;
  recordRecentPath: (path: string, source?: TerminalPathSource, callerName?: string) => void;
}

const RECENT_PATHS_STORAGE_KEY = "mlfb-terminal-recent-paths-v1";
const LAST_CWD_STORAGE_KEY = "mlfb-terminal-last-cwd-v1";
const OUTPUT_LIMIT = 240_000;
const RECENT_PATH_LIMIT = 12;

function basename(value: string): string {
  return value.replace(/\\/g, "/").split("/").filter(Boolean).pop() || value;
}

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function trimOutput(value: string): string {
  if (value.length <= OUTPUT_LIMIT) return value;
  return value.slice(value.length - OUTPUT_LIMIT);
}

function newTabId(): string {
  return `terminal_tab_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

function loadRecentPaths(): TerminalPathCandidate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_PATHS_STORAGE_KEY) || "[]") as TerminalPathCandidate[];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item?.path === "string" && item.path.trim()) : [];
  } catch {
    return [];
  }
}

function loadLastCwd(): string | null {
  try {
    const value = localStorage.getItem(LAST_CWD_STORAGE_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

function persistRecentPaths(paths: TerminalPathCandidate[], lastCwd: string | null) {
  try { localStorage.setItem(RECENT_PATHS_STORAGE_KEY, JSON.stringify(paths)); } catch {}
  try {
    if (lastCwd) localStorage.setItem(LAST_CWD_STORAGE_KEY, lastCwd);
    else localStorage.removeItem(LAST_CWD_STORAGE_KEY);
  } catch {}
}

function upsertRecentPath(paths: TerminalPathCandidate[], path: string, source: TerminalPathSource = "recent", callerName?: string): TerminalPathCandidate[] {
  const cleanPath = path.trim();
  if (!cleanPath) return paths;
  const key = normalizePath(cleanPath);
  const next: TerminalPathCandidate = {
    path: cleanPath,
    label: basename(cleanPath),
    source,
    callerName,
    lastUsedAt: new Date().toISOString(),
  };
  return [next, ...paths.filter((item) => normalizePath(item.path) !== key)].slice(0, RECENT_PATH_LIMIT);
}

function updateTab(tabs: TerminalTabState[], tabId: string, updater: (tab: TerminalTabState) => TerminalTabState): TerminalTabState[] {
  return tabs.map((tab) => (tab.id === tabId ? updater(tab) : tab));
}

function findTabByTerminalId(tabs: TerminalTabState[], terminalId: string): TerminalTabState | undefined {
  return tabs.find((tab) => tab.terminalId === terminalId);
}

export const useTerminalStore = create<TerminalWorkspaceState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  recentPaths: loadRecentPaths(),
  lastUsedCwd: loadLastCwd(),

  restoreBackendTerminals: async () => {
    const snapshots = await invoke<TerminalSessionSnapshot[]>("terminal_list").catch(() => []);
    if (snapshots.length === 0) return;
    const now = new Date().toISOString();
    set((state) => {
      let recentPaths = state.recentPaths;
      let lastUsedCwd = state.lastUsedCwd;
      const existingTerminalIds = new Set(state.tabs.map((tab) => tab.terminalId).filter(Boolean));
      const restoredTabs = snapshots
        .filter((snapshot) => snapshot.terminalId && !existingTerminalIds.has(snapshot.terminalId))
        .map<TerminalTabState>((snapshot) => {
          recentPaths = upsertRecentPath(recentPaths, snapshot.cwd, "recent");
          lastUsedCwd = snapshot.cwd || lastUsedCwd;
          return {
            id: newTabId(),
            terminalId: snapshot.terminalId,
            title: basename(snapshot.cwd),
            cwd: snapshot.cwd,
            shell: snapshot.shell,
            status: "running",
            output: trimOutput(snapshot.output || ""),
            error: null,
            createdAt: now,
            lastActiveAt: now,
          };
        });
      if (restoredTabs.length === 0) return state;
      persistRecentPaths(recentPaths, lastUsedCwd);
      return {
        tabs: [...state.tabs, ...restoredTabs],
        activeTabId: state.activeTabId || restoredTabs[0]?.id || null,
        recentPaths,
        lastUsedCwd,
      };
    });
  },

  createTerminalTab: async (cwd, options = {}) => {
    const requestedCwd = (cwd || get().lastUsedCwd || "").trim();
    const tabId = newTabId();
    const now = new Date().toISOString();
    const pendingTab: TerminalTabState = {
      id: tabId,
      terminalId: null,
      title: requestedCwd ? basename(requestedCwd) : "Terminal",
      cwd: requestedCwd,
      shell: null,
      status: "starting",
      output: "",
      error: null,
      createdAt: now,
      lastActiveAt: now,
    };
    set((state) => ({ tabs: [...state.tabs, pendingTab], activeTabId: tabId }));

    try {
      const info = await invoke<TerminalSessionInfo>("terminal_create", {
        cwd: requestedCwd || null,
        cols: options.cols,
        rows: options.rows,
      });
      set((state) => {
        const recentPaths = upsertRecentPath(state.recentPaths, info.cwd, options.source || "recent");
        persistRecentPaths(recentPaths, info.cwd);
        return {
          lastUsedCwd: info.cwd,
          recentPaths,
          tabs: updateTab(state.tabs, tabId, (tab) => ({
            ...tab,
            terminalId: info.terminalId,
            cwd: info.cwd,
            shell: info.shell,
            title: basename(info.cwd),
            status: "running",
            error: null,
          })),
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((state) => ({
        tabs: updateTab(state.tabs, tabId, (tab) => ({
          ...tab,
          status: "failed",
          error: message,
          output: trimOutput(`${tab.output}\r\n${message}\r\n`),
        })),
      }));
    }
    return tabId;
  },

  restartTerminalTab: async (tabId, options = {}) => {
    const tab = get().tabs.find((item) => item.id === tabId);
    if (!tab) return;
    if (tab.terminalId) await invoke("terminal_kill", { terminalId: tab.terminalId }).catch(() => undefined);
    set((state) => ({
      tabs: updateTab(state.tabs, tabId, (item) => ({ ...item, terminalId: null, status: "starting", output: "", error: null })),
      activeTabId: tabId,
    }));
    try {
      const info = await invoke<TerminalSessionInfo>("terminal_create", {
        cwd: tab.cwd || null,
        cols: options.cols,
        rows: options.rows,
      });
      set((state) => {
        const recentPaths = upsertRecentPath(state.recentPaths, info.cwd, "recent");
        persistRecentPaths(recentPaths, info.cwd);
        return {
          lastUsedCwd: info.cwd,
          recentPaths,
          tabs: updateTab(state.tabs, tabId, (item) => ({
            ...item,
            terminalId: info.terminalId,
            cwd: info.cwd,
            shell: info.shell,
            title: basename(info.cwd),
            status: "running",
            error: null,
          })),
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((state) => ({ tabs: updateTab(state.tabs, tabId, (item) => ({ ...item, status: "failed", error: message, output: message })) }));
    }
  },

  closeTerminalTab: async (tabId) => {
    const state = get();
    const tab = state.tabs.find((item) => item.id === tabId);
    if (tab?.terminalId) await invoke("terminal_kill", { terminalId: tab.terminalId }).catch(() => undefined);
    const nextTabs = state.tabs.filter((item) => item.id !== tabId);
    const nextActiveTabId = state.activeTabId === tabId ? nextTabs[Math.max(0, state.tabs.findIndex((item) => item.id === tabId) - 1)]?.id || nextTabs[0]?.id || null : state.activeTabId;
    set({ tabs: nextTabs, activeTabId: nextActiveTabId });
  },

  killTerminalTab: async (tabId) => {
    const tab = get().tabs.find((item) => item.id === tabId);
    if (!tab?.terminalId) return;
    const terminalId = tab.terminalId;
    await invoke("terminal_kill", { terminalId }).catch(() => undefined);
    set((state) => ({
      tabs: updateTab(state.tabs, tabId, (item) => ({
        ...item,
        terminalId: null,
        status: "exited",
        output: trimOutput(`${item.output}\r\n[process exited]\r\n`),
      })),
    }));
  },

  clearTerminalOutput: (tabId) => {
    set((state) => ({ tabs: updateTab(state.tabs, tabId, (tab) => ({ ...tab, output: "" })) }));
  },

  setActiveTerminalTab: (tabId) => {
    const now = new Date().toISOString();
    set((state) => ({
      activeTabId: tabId,
      tabs: tabId ? updateTab(state.tabs, tabId, (tab) => ({ ...tab, lastActiveAt: now })) : state.tabs,
    }));
  },

  appendTerminalOutput: (terminalId, data) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => tab.terminalId === terminalId
        ? { ...tab, output: trimOutput(tab.output + data), lastActiveAt: new Date().toISOString() }
        : tab),
    }));
  },

  markTerminalExited: (terminalId, exitCode) => {
    const tab = findTabByTerminalId(get().tabs, terminalId);
    if (!tab) return;
    const message = exitCode === null ? "[process exited]" : `[process exited: ${exitCode}]`;
    set((state) => ({
      tabs: updateTab(state.tabs, tab.id, (item) => ({
        ...item,
        terminalId: null,
        status: "exited",
        output: item.output.endsWith(`${message}\r\n`) ? item.output : trimOutput(`${item.output}\r\n${message}\r\n`),
      })),
    }));
  },

  markTerminalFailed: (terminalId, message) => {
    const tab = findTabByTerminalId(get().tabs, terminalId);
    if (!tab) return;
    set((state) => ({
      tabs: updateTab(state.tabs, tab.id, (item) => ({
        ...item,
        status: "failed",
        error: message,
        output: trimOutput(`${item.output}\r\n${message}\r\n`),
      })),
    }));
  },

  recordRecentPath: (path, source = "recent", callerName) => {
    set((state) => {
      const recentPaths = upsertRecentPath(state.recentPaths, path, source, callerName);
      persistRecentPaths(recentPaths, path);
      return { recentPaths, lastUsedCwd: path };
    });
  },
}));
