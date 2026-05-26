import { useSyncExternalStore } from "react";

export type GitDiffPathDisplayMode = "fullPath" | "fileName";
export type GitTimelineStyle = "timeline" | "none";
export type GitListItemStyle = "compact" | "detailed";

export interface GitPanelSettings {
  diffPathDisplayMode: GitDiffPathDisplayMode;
  timelineStyle: GitTimelineStyle;
  listItemStyle: GitListItemStyle;
}

export const GIT_PANEL_SETTINGS_EVENT = "mlfb-git-panel-settings-changed";

const STORAGE_KEY = "mlfb-git-panel-settings";

const DEFAULT_SETTINGS: GitPanelSettings = {
  diffPathDisplayMode: "fullPath",
  timelineStyle: "timeline",
  listItemStyle: "compact",
};
let cachedSettings: GitPanelSettings | null = null;

function normalizeSettings(
  value: Partial<GitPanelSettings> | null | undefined,
): GitPanelSettings {
  return {
    diffPathDisplayMode:
      value?.diffPathDisplayMode === "fileName" ? "fileName" : "fullPath",
    timelineStyle: value?.timelineStyle === "none" ? "none" : "timeline",
    listItemStyle: value?.listItemStyle === "detailed" ? "detailed" : "compact",
  };
}

export function getGitPanelSettings(): GitPanelSettings {
  if (cachedSettings) return cachedSettings;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cachedSettings = raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
    return cachedSettings;
  } catch {
    cachedSettings = DEFAULT_SETTINGS;
    return cachedSettings;
  }
}

export function saveGitPanelSettings(settings: GitPanelSettings): GitPanelSettings {
  const normalized = normalizeSettings(settings);
  cachedSettings = normalized;
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
