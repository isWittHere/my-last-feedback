import { useSyncExternalStore } from "react";
import type { AgentChoiceOption } from "./agent/types";

export interface OpenCodeModelSettings extends AgentChoiceOption {
  enabled: boolean;
  favorite: boolean;
  lastSeenAt?: string;
}

export interface OpenCodeSettings {
  models: OpenCodeModelSettings[];
  preferredModelId?: string;
}

const STORAGE_KEY = "mlfb-opencode-settings-v1";
const CHANGE_EVENT = "mlfb-opencode-settings-changed";

const DEFAULT_SETTINGS: OpenCodeSettings = {
  models: [],
  preferredModelId: undefined,
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

function normalizeSettings(value: unknown): OpenCodeSettings {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS;
  const parsed = value as Partial<OpenCodeSettings>;
  const models = Array.isArray(parsed.models)
    ? parsed.models.map(normalizeModel).filter((model): model is OpenCodeModelSettings => Boolean(model))
    : [];
  const preferredModelId = typeof parsed.preferredModelId === "string" && parsed.preferredModelId ? parsed.preferredModelId : undefined;
  return { models, preferredModelId };
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
  const next = { models: normalizedModels, preferredModelId };
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

  if (enabled.length > 0) return enabled.sort((a, b) => {
    const aFavorite = settings.models.find((model) => model.id === a.id)?.favorite ? 0 : 1;
    const bFavorite = settings.models.find((model) => model.id === b.id)?.favorite ? 0 : 1;
    return aFavorite - bFavorite || a.label.localeCompare(b.label);
  });

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