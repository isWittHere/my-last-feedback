import { useSyncExternalStore } from "react";
import { normalizeWorkspacePath } from "./workspace/workspacePaths";

export type NewSessionWorkspacePathMode = "default" | "recentSession";

export interface AgentSessionSettings {
  newSessionWorkspacePathMode: NewSessionWorkspacePathMode;
  defaultWorkspacePath: string;
}

const STORAGE_KEY = "mlfb-agent-session-settings-v1";
const CHANGE_EVENT = "mlfb-agent-session-settings-changed";

const DEFAULT_SETTINGS: AgentSessionSettings = {
  newSessionWorkspacePathMode: "default",
  defaultWorkspacePath: "",
};

function isWorkspacePathMode(value: unknown): value is NewSessionWorkspacePathMode {
  return value === "default" || value === "recentSession";
}

function normalizeSettings(value: Partial<AgentSessionSettings> | null | undefined): AgentSessionSettings {
  return {
    newSessionWorkspacePathMode: isWorkspacePathMode(value?.newSessionWorkspacePathMode) ? value.newSessionWorkspacePathMode : DEFAULT_SETTINGS.newSessionWorkspacePathMode,
    defaultWorkspacePath: normalizeWorkspacePath(value?.defaultWorkspacePath) || "",
  };
}

export function getAgentSessionSettings(): AgentSessionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveAgentSessionSettings(settings: AgentSessionSettings): AgentSessionSettings {
  const normalized = normalizeSettings(settings);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch {}
  try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: normalized })); } catch {}
  return normalized;
}

export function resolveNewSessionWorkspacePath(settings: AgentSessionSettings, recentSessionWorkspacePath?: string | null): string {
  if (settings.newSessionWorkspacePathMode === "recentSession") {
    return normalizeWorkspacePath(recentSessionWorkspacePath) || "";
  }
  return normalizeWorkspacePath(settings.defaultWorkspacePath) || "";
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useAgentSessionSettings(): AgentSessionSettings {
  return useSyncExternalStore(subscribe, getAgentSessionSettings, () => DEFAULT_SETTINGS);
}