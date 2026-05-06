import { useSyncExternalStore } from "react";

export type AgentTopbarIndicatorMode = "hidden" | "text" | "textAndGraphic";
export type AgentDiffColorPresetId = "classic" | "soft" | "vscode";

export interface AgentDiffColorPreset {
  id: AgentDiffColorPresetId;
  labelKey: string;
  defaultLabel: string;
  additions: string;
  deletions: string;
}

export interface AgentDiffVisualSettings {
  colorPresetId: AgentDiffColorPresetId;
  additionsOffsetX: number;
  additionsOffsetY: number;
  deletionsOffsetX: number;
  deletionsOffsetY: number;
}

export interface AgentConsoleSettings {
  diffIndicatorMode: AgentTopbarIndicatorMode;
  contextIndicatorMode: AgentTopbarIndicatorMode;
  diffVisual: AgentDiffVisualSettings;
}

export const AGENT_DIFF_COLOR_PRESETS: AgentDiffColorPreset[] = [
  { id: "classic", labelKey: "settings.acpDiffColorClassic", defaultLabel: "Classic", additions: "#22c55e", deletions: "#ef4444" },
  { id: "soft", labelKey: "settings.acpDiffColorSoft", defaultLabel: "Soft", additions: "#4ec9b0", deletions: "#f06060" },
  { id: "vscode", labelKey: "settings.acpDiffColorVscode", defaultLabel: "VS Code", additions: "#6a9955", deletions: "#f06060" },
];

const STORAGE_KEY = "mlfb-agent-console-settings-v1";
const CHANGE_EVENT = "mlfb-agent-console-settings-changed";

const DEFAULT_SETTINGS: AgentConsoleSettings = {
  diffIndicatorMode: "textAndGraphic",
  contextIndicatorMode: "textAndGraphic",
  diffVisual: {
    colorPresetId: "classic",
    additionsOffsetX: 0,
    additionsOffsetY: 0,
    deletionsOffsetX: 0,
    deletionsOffsetY: 0,
  },
};

let cachedRaw: string | null = null;
let cachedSettings: AgentConsoleSettings = DEFAULT_SETTINGS;

function isIndicatorMode(value: unknown): value is AgentTopbarIndicatorMode {
  return value === "hidden" || value === "text" || value === "textAndGraphic";
}

function isColorPresetId(value: unknown): value is AgentDiffColorPresetId {
  return AGENT_DIFF_COLOR_PRESETS.some((preset) => preset.id === value);
}

function clampTextOffset(value: unknown): number {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(-4, Math.min(4, Math.round(numericValue * 2) / 2));
}

export function getAgentDiffColorPreset(id: AgentDiffColorPresetId): AgentDiffColorPreset {
  return AGENT_DIFF_COLOR_PRESETS.find((preset) => preset.id === id) ?? AGENT_DIFF_COLOR_PRESETS[0];
}

export function getAgentConsoleSettings(): AgentConsoleSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedSettings;
    cachedRaw = raw;
    if (!raw) {
      cachedSettings = DEFAULT_SETTINGS;
      return cachedSettings;
    }
    const parsed = JSON.parse(raw) as Partial<AgentConsoleSettings>;
    const parsedDiffVisual = parsed.diffVisual as (Partial<AgentDiffVisualSettings> & { textOffsetX?: unknown; textOffsetY?: unknown }) | undefined;
    const legacyOffsetX = clampTextOffset(parsedDiffVisual?.textOffsetX);
    const legacyOffsetY = clampTextOffset(parsedDiffVisual?.textOffsetY);
    cachedSettings = {
      diffIndicatorMode: isIndicatorMode(parsed.diffIndicatorMode) ? parsed.diffIndicatorMode : DEFAULT_SETTINGS.diffIndicatorMode,
      contextIndicatorMode: isIndicatorMode(parsed.contextIndicatorMode) ? parsed.contextIndicatorMode : DEFAULT_SETTINGS.contextIndicatorMode,
      diffVisual: {
        colorPresetId: isColorPresetId(parsedDiffVisual?.colorPresetId) ? parsedDiffVisual.colorPresetId : DEFAULT_SETTINGS.diffVisual.colorPresetId,
        additionsOffsetX: parsedDiffVisual?.additionsOffsetX == null ? legacyOffsetX : clampTextOffset(parsedDiffVisual.additionsOffsetX),
        additionsOffsetY: parsedDiffVisual?.additionsOffsetY == null ? legacyOffsetY : clampTextOffset(parsedDiffVisual.additionsOffsetY),
        deletionsOffsetX: parsedDiffVisual?.deletionsOffsetX == null ? legacyOffsetX : clampTextOffset(parsedDiffVisual.deletionsOffsetX),
        deletionsOffsetY: parsedDiffVisual?.deletionsOffsetY == null ? legacyOffsetY : clampTextOffset(parsedDiffVisual.deletionsOffsetY),
      },
    };
    return cachedSettings;
  } catch {
    cachedSettings = DEFAULT_SETTINGS;
    return cachedSettings;
  }
}

export function saveAgentConsoleSettings(settings: AgentConsoleSettings) {
  const raw = JSON.stringify(settings);
  cachedRaw = raw;
  cachedSettings = settings;
  try { localStorage.setItem(STORAGE_KEY, raw); } catch {}
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useAgentConsoleSettings(): AgentConsoleSettings {
  return useSyncExternalStore(subscribe, getAgentConsoleSettings, () => DEFAULT_SETTINGS);
}
