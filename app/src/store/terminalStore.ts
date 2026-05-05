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
  outputBaseLength: number;
  outputGeneration: number;
  error: string | null;
  createdAt: string;
  lastActiveAt: string;
}

interface CreateTerminalTabOptions {
  cols?: number;
  rows?: number;
  source?: TerminalPathSource;
  shell?: string | null;
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
const OUTPUT_TRIM_LINE_SCAN_LIMIT = 4096;
const RECENT_PATH_LIMIT = 12;
const CSI_FRAGMENT_SCAN_LIMIT = 128;

interface TrimmedOutput {
  output: string;
  trimmedLength: number;
}

function basename(value: string): string {
  return value.replace(/\\/g, "/").split("/").filter(Boolean).pop() || value;
}

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function trimOutput(value: string): TrimmedOutput {
  if (value.length <= OUTPUT_LIMIT) return { output: value, trimmedLength: 0 };
  let trimStart = value.length - OUTPUT_LIMIT;
  const scanEnd = Math.min(value.length, trimStart + OUTPUT_TRIM_LINE_SCAN_LIMIT);
  const newlineIndex = value.indexOf("\n", trimStart);
  if (newlineIndex >= 0 && newlineIndex < scanEnd) trimStart = newlineIndex + 1;
  trimStart = skipLeadingCsiFragment(value, trimStart);
  while (trimStart < value.length) {
    const code = value.charCodeAt(trimStart);
    if (code < 0xdc00 || code > 0xdfff) break;
    trimStart += 1;
  }
  return { output: value.slice(trimStart), trimmedLength: trimStart };
}

function appendTabOutput(tab: TerminalTabState, data: string): TerminalTabState {
  const trimmed = trimOutput(tab.output + data);
  return {
    ...tab,
    output: trimmed.output,
    outputBaseLength: tab.outputBaseLength + trimmed.trimmedLength,
    lastActiveAt: new Date().toISOString(),
  };
}

function replaceTabOutput(tab: TerminalTabState, output: string): TerminalTabState {
  const trimmed = trimOutput(output);
  return {
    ...tab,
    output: trimmed.output,
    outputBaseLength: trimmed.trimmedLength,
    outputGeneration: tab.outputGeneration + 1,
  };
}

function skipLeadingCsiFragment(value: string, start: number): number {
  const firstChar = value[start];
  if (!firstChar || !/[0-9;:?]/.test(firstChar)) return start;
  const scanEnd = Math.min(value.length, start + CSI_FRAGMENT_SCAN_LIMIT);
  for (let index = start; index < scanEnd; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x1b || code === 0x0a || code === 0x0d) return start;
    if (code >= 0x40 && code <= 0x7e) return index + 1;
  }
  return start;
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
          const trimmedOutput = trimOutput(snapshot.output || "");
          return {
            id: newTabId(),
            terminalId: snapshot.terminalId,
            title: basename(snapshot.cwd),
            cwd: snapshot.cwd,
            shell: snapshot.shell,
            status: "running",
            output: trimmedOutput.output,
            outputBaseLength: trimmedOutput.trimmedLength,
            outputGeneration: 0,
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
      outputBaseLength: 0,
      outputGeneration: 0,
      error: null,
      createdAt: now,
      lastActiveAt: now,
    };
    set((state) => ({ tabs: [...state.tabs, pendingTab], activeTabId: tabId }));

    try {
      const info = await invoke<TerminalSessionInfo>("terminal_create", {
        cwd: requestedCwd || null,
        shell: options.shell || null,
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
          ...appendTabOutput(tab, `\r\n${message}\r\n`),
          status: "failed",
          error: message,
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
      tabs: updateTab(state.tabs, tabId, (item) => ({ ...item, terminalId: null, status: "starting", output: "", outputBaseLength: 0, outputGeneration: item.outputGeneration + 1, error: null })),
      activeTabId: tabId,
    }));
    try {
      const info = await invoke<TerminalSessionInfo>("terminal_create", {
        cwd: tab.cwd || null,
        shell: options.shell || null,
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
      set((state) => ({ tabs: updateTab(state.tabs, tabId, (item) => ({ ...replaceTabOutput(item, message), status: "failed", error: message })) }));
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
        ...appendTabOutput(item, "\r\n[process exited]\r\n"),
        terminalId: null,
        status: "exited",
      })),
    }));
  },

  clearTerminalOutput: (tabId) => {
    set((state) => ({ tabs: updateTab(state.tabs, tabId, (tab) => ({ ...tab, output: "", outputBaseLength: 0, outputGeneration: tab.outputGeneration + 1 })) }));
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
        ? appendTabOutput(tab, data)
        : tab),
    }));
  },

  markTerminalExited: (terminalId, exitCode) => {
    const tab = findTabByTerminalId(get().tabs, terminalId);
    if (!tab) return;
    const message = exitCode === null ? "[process exited]" : `[process exited: ${exitCode}]`;
    set((state) => ({
      tabs: updateTab(state.tabs, tab.id, (item) => ({
        ...(item.output.endsWith(`${message}\r\n`) ? item : appendTabOutput(item, `\r\n${message}\r\n`)),
        terminalId: null,
        status: "exited",
      })),
    }));
  },

  markTerminalFailed: (terminalId, message) => {
    const tab = findTabByTerminalId(get().tabs, terminalId);
    if (!tab) return;
    set((state) => ({
      tabs: updateTab(state.tabs, tab.id, (item) => ({
        ...appendTabOutput(item, `\r\n${message}\r\n`),
        status: "failed",
        error: message,
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
