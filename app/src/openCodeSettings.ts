import { useSyncExternalStore } from "react";
import type { AgentChoiceOption } from "./agent/types";
import type { OpenCodePermissionAction, OpenCodePermissionRule } from "./agent/opencode";

export type { OpenCodePermissionAction };

export interface OpenCodeModelSettings extends AgentChoiceOption {
  enabled: boolean;
  favorite: boolean;
  lastSeenAt?: string;
}

export interface OpenCodeSettings {
  models: OpenCodeModelSettings[];
  preferredModelId?: string;
  defaultPermissionPreset: OpenCodePermissionPresetItem[];
}

export interface OpenCodePermissionPresetItem {
  permission: string;
  action: OpenCodePermissionAction;
}

export interface OpenCodePermissionDefinition {
  permission: string;
  labelKey: string;
  defaultLabel: string;
  descriptionKey: string;
  defaultDescription: string;
  defaultAction: OpenCodePermissionAction;
  icon: string;
}

export const OPEN_CODE_PERMISSION_DEFINITIONS: OpenCodePermissionDefinition[] = [
  { permission: "glob", labelKey: "settings.openCodePermissionGlob", defaultLabel: "File matching", descriptionKey: "settings.openCodePermissionGlobDesc", defaultDescription: "Find files by pattern inside the workspace.", defaultAction: "allow", icon: "file" },
  { permission: "grep", labelKey: "settings.openCodePermissionGrep", defaultLabel: "Content search", descriptionKey: "settings.openCodePermissionGrepDesc", defaultDescription: "Search text in workspace files.", defaultAction: "allow", icon: "search" },
  { permission: "read", labelKey: "settings.openCodePermissionRead", defaultLabel: "Read files", descriptionKey: "settings.openCodePermissionReadDesc", defaultDescription: "Read files from the active workspace.", defaultAction: "allow", icon: "eye" },
  { permission: "list", labelKey: "settings.openCodePermissionList", defaultLabel: "List directories", descriptionKey: "settings.openCodePermissionListDesc", defaultDescription: "Inspect workspace directory structure.", defaultAction: "allow", icon: "list" },
  { permission: "edit", labelKey: "settings.openCodePermissionEdit", defaultLabel: "Modify files", descriptionKey: "settings.openCodePermissionEditDesc", defaultDescription: "Create, edit, or patch files.", defaultAction: "ask", icon: "edit" },
  { permission: "bash", labelKey: "settings.openCodePermissionBash", defaultLabel: "Command execution", descriptionKey: "settings.openCodePermissionBashDesc", defaultDescription: "Run shell commands through OpenCode.", defaultAction: "ask", icon: "terminal" },
  { permission: "task", labelKey: "settings.openCodePermissionTask", defaultLabel: "Subtasks", descriptionKey: "settings.openCodePermissionTaskDesc", defaultDescription: "Delegate work to OpenCode subagents.", defaultAction: "ask", icon: "checklist" },
  { permission: "webfetch", labelKey: "settings.openCodePermissionWebFetch", defaultLabel: "Read webpages", descriptionKey: "settings.openCodePermissionWebFetchDesc", defaultDescription: "Fetch external webpage content.", defaultAction: "ask", icon: "globe" },
  { permission: "websearch", labelKey: "settings.openCodePermissionWebSearch", defaultLabel: "Web search", descriptionKey: "settings.openCodePermissionWebSearchDesc", defaultDescription: "Search the web from OpenCode.", defaultAction: "ask", icon: "search" },
  { permission: "external_directory", labelKey: "settings.openCodePermissionExternalDirectory", defaultLabel: "External directories", descriptionKey: "settings.openCodePermissionExternalDirectoryDesc", defaultDescription: "Access files outside the active workspace.", defaultAction: "deny", icon: "folder" },
  { permission: "skill", labelKey: "settings.openCodePermissionSkill", defaultLabel: "Skills", descriptionKey: "settings.openCodePermissionSkillDesc", defaultDescription: "Load extra skill instructions.", defaultAction: "ask", icon: "book" },
];

const STORAGE_KEY = "mlfb-opencode-settings-v1";
const CHANGE_EVENT = "mlfb-opencode-settings-changed";

const DEFAULT_SETTINGS: OpenCodeSettings = {
  models: [],
  preferredModelId: undefined,
  defaultPermissionPreset: OPEN_CODE_PERMISSION_DEFINITIONS.map((item) => ({ permission: item.permission, action: item.defaultAction })),
};

let cachedRaw: string | null = null;
let cachedSettings: OpenCodeSettings = DEFAULT_SETTINGS;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeModel(model: unknown): OpenCodeModelSettings | null {
  if (!model || typeof model !== "object") return null;
  const value = model as Partial<OpenCodeModelSettings>;
  if (typeof value.id !== "string" || !value.id) return null;
  return {
    id: value.id,
    label: typeof value.label === "string" && value.label ? value.label : value.id,
    description: typeof value.description === "string" && value.description ? value.description : undefined,
    contextLimit: typeof value.contextLimit === "number" && Number.isFinite(value.contextLimit) && value.contextLimit > 0 ? value.contextLimit : undefined,
    enabled: Boolean(value.enabled),
    favorite: Boolean(value.favorite),
    lastSeenAt: typeof value.lastSeenAt === "string" ? value.lastSeenAt : undefined,
  };
}

function normalizePermissionAction(action: unknown, fallback: OpenCodePermissionAction): OpenCodePermissionAction {
  return action === "allow" || action === "ask" || action === "deny" ? action : fallback;
}

function normalizePermissionPreset(value: unknown): OpenCodePermissionPresetItem[] {
  const byPermission = new Map<string, OpenCodePermissionAction>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const parsed = item as Partial<OpenCodePermissionPresetItem>;
      if (typeof parsed.permission !== "string" || !parsed.permission) continue;
      const definition = OPEN_CODE_PERMISSION_DEFINITIONS.find((entry) => entry.permission === parsed.permission);
      byPermission.set(parsed.permission, normalizePermissionAction(parsed.action, definition?.defaultAction || "ask"));
    }
  }
  return OPEN_CODE_PERMISSION_DEFINITIONS.map((definition) => ({
    permission: definition.permission,
    action: byPermission.get(definition.permission) || definition.defaultAction,
  }));
}

function normalizeSettings(value: unknown): OpenCodeSettings {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS;
  const parsed = value as Partial<OpenCodeSettings>;
  const models = Array.isArray(parsed.models)
    ? parsed.models.map(normalizeModel).filter((model): model is OpenCodeModelSettings => Boolean(model))
    : [];
  const preferredModelId = typeof parsed.preferredModelId === "string" && parsed.preferredModelId ? parsed.preferredModelId : undefined;
  const defaultPermissionPreset = normalizePermissionPreset(parsed.defaultPermissionPreset);
  return { models, preferredModelId, defaultPermissionPreset };
}

export function getOpenCodeSettings(): OpenCodeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedSettings;
    cachedRaw = raw;
    cachedSettings = raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
    return cachedSettings;
  } catch {
    cachedSettings = DEFAULT_SETTINGS;
    return cachedSettings;
  }
}

export function saveOpenCodeSettings(settings: OpenCodeSettings) {
  const normalized = normalizeSettings(settings);
  const raw = JSON.stringify(normalized);
  cachedRaw = raw;
  cachedSettings = normalized;
  try { localStorage.setItem(STORAGE_KEY, raw); } catch {}
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function openCodePermissionPresetToRules(preset: OpenCodePermissionPresetItem[]): OpenCodePermissionRule[] {
  return normalizePermissionPreset(preset).map((item) => ({ permission: item.permission, pattern: "*", action: item.action }));
}

export function getOpenCodeDefaultPermissionRules(): OpenCodePermissionRule[] {
  return openCodePermissionPresetToRules(getOpenCodeSettings().defaultPermissionPreset);
}

export function getOpenCodePermissionPresetAction(preset: OpenCodePermissionPresetItem[] | undefined, permission: string): OpenCodePermissionAction {
  const definition = OPEN_CODE_PERMISSION_DEFINITIONS.find((item) => item.permission === permission);
  const normalized = normalizePermissionPreset(preset);
  return normalized.find((item) => item.permission === permission)?.action || definition?.defaultAction || "ask";
}

export function setOpenCodeDefaultPermissionAction(permission: string, action: OpenCodePermissionAction): OpenCodeSettings {
  const current = getOpenCodeSettings();
  const next = {
    ...current,
    defaultPermissionPreset: normalizePermissionPreset(current.defaultPermissionPreset).map((item) => item.permission === permission ? { ...item, action } : item),
  };
  saveOpenCodeSettings(next);
  return next;
}

export function syncOpenCodeModels(models: AgentChoiceOption[], currentModelId?: string): OpenCodeSettings {
  const current = getOpenCodeSettings();
  const previousById = new Map(current.models.map((model) => [model.id, model]));
  const seenAt = nowIso();
  const nextModels = models.map((model) => {
    const previous = previousById.get(model.id);
    return {
      id: model.id,
      label: model.label || model.id,
      description: model.description,
      contextLimit: model.contextLimit ?? previous?.contextLimit,
      enabled: previous ? previous.enabled : model.id === currentModelId,
      favorite: previous ? previous.favorite : model.id === currentModelId,
      lastSeenAt: seenAt,
    };
  });

  const hasEnabledModel = nextModels.some((model) => model.enabled);
  const normalizedModels = hasEnabledModel || nextModels.length === 0
    ? nextModels
    : nextModels.map((model, index) => ({ ...model, enabled: model.id === currentModelId || (!currentModelId && index === 0), favorite: model.id === currentModelId }));

  const preferredModelId = current.preferredModelId && normalizedModels.some((model) => model.id === current.preferredModelId)
    ? current.preferredModelId
    : currentModelId || normalizedModels.find((model) => model.enabled)?.id;
  const next = { ...current, models: normalizedModels, preferredModelId };
  saveOpenCodeSettings(next);
  return next;
}

export function setOpenCodeModelEnabled(modelId: string, enabled: boolean): OpenCodeSettings {
  const current = getOpenCodeSettings();
  const nextModels = current.models.map((model) => model.id === modelId ? { ...model, enabled } : model);
  const preferredModelId = enabled ? current.preferredModelId || modelId : current.preferredModelId === modelId ? nextModels.find((model) => model.enabled && model.id !== modelId)?.id : current.preferredModelId;
  const next = { ...current, models: nextModels, preferredModelId };
  saveOpenCodeSettings(next);
  return next;
}

export function setOpenCodeModelFavorite(modelId: string, favorite: boolean): OpenCodeSettings {
  const current = getOpenCodeSettings();
  const next = {
    ...current,
    models: current.models.map((model) => model.id === modelId ? { ...model, favorite, enabled: favorite ? true : model.enabled } : model),
  };
  saveOpenCodeSettings(next);
  return next;
}

export function setOpenCodePreferredModel(modelId: string): OpenCodeSettings {
  const current = getOpenCodeSettings();
  const next = {
    ...current,
    preferredModelId: modelId,
    models: current.models.map((model) => model.id === modelId ? { ...model, enabled: true } : model),
  };
  saveOpenCodeSettings(next);
  return next;
}

export function getEnabledOpenCodeModels(sessionModels: AgentChoiceOption[] = [], currentModelId?: string): AgentChoiceOption[] {
  const settings = getOpenCodeSettings();
  const sessionById = new Map(sessionModels.map((model) => [model.id, model]));
  const enabled = settings.models
    .filter((model) => model.enabled || model.id === currentModelId)
    .map((model) => ({ ...model, ...(sessionById.get(model.id) || {}) }));

  if (enabled.length > 0) return enabled;

  if (currentModelId) {
    const currentModel = sessionById.get(currentModelId);
    if (currentModel) return [currentModel];
  }
  return sessionModels.slice(0, 1);
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useOpenCodeSettings(): OpenCodeSettings {
  return useSyncExternalStore(subscribe, getOpenCodeSettings, () => DEFAULT_SETTINGS);
}