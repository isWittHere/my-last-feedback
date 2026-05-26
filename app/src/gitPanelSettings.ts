import { useSyncExternalStore } from "react";

export type GitDiffPathDisplayMode = "fullPath" | "fileName";

export interface GitPanelSettings {
  diffPathDisplayMode: GitDiffPathDisplayMode;
}

export const GIT_PANEL_SETTINGS_EVENT = "mlfb-git-panel-settings-changed";

const STORAGE_KEY = "mlfb-git-panel-settings";

const DEFAULT_SETTINGS: GitPanelSettings = {
  diffPathDisplayMode: "fullPath",
};

function normalizeSettings(
  value: Partial<GitPanelSettings> | null | undefined,
): GitPanelSettings {
  return {
    diffPathDisplayMode:
      value?.diffPathDisplayMode === "fileName" ? "fileName" : "fullPath",
  };
}

export function getGitPanelSettings(): GitPanelSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveGitPanelSettings(settings: GitPanelSettings): GitPanelSettings {
  const normalized = normalizeSettings(settings);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch {}
  try { window.dispatchEvent(new CustomEvent(GIT_PANEL_SETTINGS_EVENT, { detail: normalized })); } catch {}
  return normalized;
}

function subscribe(onStoreChange: () => void): () => void {
  const handler = () => onStoreChange();
  window.addEventListener(GIT_PANEL_SETTINGS_EVENT, handler as EventListener);
  return () => window.removeEventListener(GIT_PANEL_SETTINGS_EVENT, handler as EventListener);
}

export function useGitPanelSettings(): GitPanelSettings {
  return useSyncExternalStore(subscribe, getGitPanelSettings, () => DEFAULT_SETTINGS);
}

