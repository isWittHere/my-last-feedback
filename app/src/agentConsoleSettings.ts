import { useSyncExternalStore } from "react";

export type AgentTopbarIndicatorMode = "hidden" | "text" | "textAndGraphic";
export type AgentDiffColorPresetId = "classic" | "soft" | "vscode";
export type AgentProcessStepDefaultMode = "tabs" | "timeline";
export type AgentTimelineStreamingStepMode = "hidden" | "collapseHistory" | "expandAll";
export type AgentTodoUpdateDisplayMode = "countOnly" | "panel";
export type AgentApprovalDisplayMode = "step" | "statusPanel" | "all";
export type AgentNavigationIndicatorOrder = "leftToRight" | "rightToLeft";
export type AgentNavigationGroupBackgroundMode = "hidden" | "hover" | "alternate";
export type AgentNavigationVisualizationMode = "bars" | "lineArea";

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
  smoothStreamingOutput: boolean;
  autoCleanupEmptySessions: boolean;
  processStepDefaultMode: AgentProcessStepDefaultMode;
  timelineStreamingStepMode: AgentTimelineStreamingStepMode;
  todoUpdateDisplayMode: AgentTodoUpdateDisplayMode;
  approvalDisplayMode: AgentApprovalDisplayMode;
  collapseConsecutiveOutputBlankLines: boolean;
  showMessageSpeakerLine: boolean;
  defaultExpandHeaderDetails: boolean;
  showStickyUserMessageBar: boolean;
  navigationVisualizationMode: AgentNavigationVisualizationMode;
  navigationIndicatorOrder: AgentNavigationIndicatorOrder;
  navigationGroupBackgroundMode: AgentNavigationGroupBackgroundMode;
  diffVisual: AgentDiffVisualSettings;
}

export const AGENT_DIFF_COLOR_PRESETS: AgentDiffColorPreset[] = [
  { id: "classic", labelKey: "settings.agentDiffColorClassic", defaultLabel: "Classic", additions: "#22c55e", deletions: "#ef4444" },
  { id: "soft", labelKey: "settings.agentDiffColorSoft", defaultLabel: "Soft", additions: "#4ec9b0", deletions: "#f06060" },
  { id: "vscode", labelKey: "settings.agentDiffColorVscode", defaultLabel: "VS Code", additions: "#6a9955", deletions: "#f06060" },
];

const STORAGE_KEY = "mlfb-agent-console-settings-v1";
const CHANGE_EVENT = "mlfb-agent-console-settings-changed";

const DEFAULT_SETTINGS: AgentConsoleSettings = {
  diffIndicatorMode: "textAndGraphic",
  contextIndicatorMode: "textAndGraphic",
  smoothStreamingOutput: false,
  autoCleanupEmptySessions: true,
  processStepDefaultMode: "tabs",
  timelineStreamingStepMode: "collapseHistory",
  todoUpdateDisplayMode: "panel",
  approvalDisplayMode: "all",
  collapseConsecutiveOutputBlankLines: false,
  showMessageSpeakerLine: true,
  defaultExpandHeaderDetails: false,
  showStickyUserMessageBar: true,
  navigationVisualizationMode: "bars",
  navigationIndicatorOrder: "leftToRight",
  navigationGroupBackgroundMode: "alternate",
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

function isProcessStepDefaultMode(value: unknown): value is AgentProcessStepDefaultMode {
  return value === "tabs" || value === "timeline";
}

function isTimelineStreamingStepMode(value: unknown): value is AgentTimelineStreamingStepMode {
  return value === "hidden" || value === "collapseHistory" || value === "expandAll";
}

function isTodoUpdateDisplayMode(value: unknown): value is AgentTodoUpdateDisplayMode {
  return value === "countOnly" || value === "panel";
}

function isApprovalDisplayMode(value: unknown): value is AgentApprovalDisplayMode {
  return value === "step" || value === "statusPanel" || value === "all";
}

function isNavigationIndicatorOrder(value: unknown): value is AgentNavigationIndicatorOrder {
  return value === "leftToRight" || value === "rightToLeft";
}

function isNavigationGroupBackgroundMode(value: unknown): value is AgentNavigationGroupBackgroundMode {
  return value === "hidden" || value === "hover" || value === "alternate";
}

function isNavigationVisualizationMode(value: unknown): value is AgentNavigationVisualizationMode {
  return value === "bars" || value === "lineArea";
}

function clampTextOffset(value: unknown): number {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(-4, Math.min(4, Math.round(numericValue * 2) / 2));
}

export function getAgentDiffColorPreset(id: AgentDiffColorPresetId): AgentDiffColorPreset {
  return AGENT_DIFF_COLOR_PRESETS.find((preset) => preset.id === id) ?? AGENT_DIFF_COLOR_PRESETS[0];
}

function normalizeAgentConsoleSettings(settings: AgentConsoleSettings): AgentConsoleSettings {
  if (settings.timelineStreamingStepMode === "hidden" && settings.approvalDisplayMode === "step") {
    return { ...settings, approvalDisplayMode: "all" };
  }
  return settings;
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
    cachedSettings = normalizeAgentConsoleSettings({
      diffIndicatorMode: isIndicatorMode(parsed.diffIndicatorMode) ? parsed.diffIndicatorMode : DEFAULT_SETTINGS.diffIndicatorMode,
      contextIndicatorMode: isIndicatorMode(parsed.contextIndicatorMode) ? parsed.contextIndicatorMode : DEFAULT_SETTINGS.contextIndicatorMode,
      smoothStreamingOutput: typeof parsed.smoothStreamingOutput === "boolean" ? parsed.smoothStreamingOutput : DEFAULT_SETTINGS.smoothStreamingOutput,
      autoCleanupEmptySessions: typeof parsed.autoCleanupEmptySessions === "boolean" ? parsed.autoCleanupEmptySessions : DEFAULT_SETTINGS.autoCleanupEmptySessions,
      processStepDefaultMode: isProcessStepDefaultMode(parsed.processStepDefaultMode) ? parsed.processStepDefaultMode : DEFAULT_SETTINGS.processStepDefaultMode,
      timelineStreamingStepMode: isTimelineStreamingStepMode(parsed.timelineStreamingStepMode) ? parsed.timelineStreamingStepMode : DEFAULT_SETTINGS.timelineStreamingStepMode,
      todoUpdateDisplayMode: isTodoUpdateDisplayMode(parsed.todoUpdateDisplayMode) ? parsed.todoUpdateDisplayMode : DEFAULT_SETTINGS.todoUpdateDisplayMode,
      approvalDisplayMode: isApprovalDisplayMode(parsed.approvalDisplayMode) ? parsed.approvalDisplayMode : DEFAULT_SETTINGS.approvalDisplayMode,
      collapseConsecutiveOutputBlankLines: typeof parsed.collapseConsecutiveOutputBlankLines === "boolean" ? parsed.collapseConsecutiveOutputBlankLines : DEFAULT_SETTINGS.collapseConsecutiveOutputBlankLines,
      showMessageSpeakerLine: typeof parsed.showMessageSpeakerLine === "boolean" ? parsed.showMessageSpeakerLine : DEFAULT_SETTINGS.showMessageSpeakerLine,
      defaultExpandHeaderDetails: typeof parsed.defaultExpandHeaderDetails === "boolean" ? parsed.defaultExpandHeaderDetails : DEFAULT_SETTINGS.defaultExpandHeaderDetails,
      showStickyUserMessageBar: typeof parsed.showStickyUserMessageBar === "boolean" ? parsed.showStickyUserMessageBar : DEFAULT_SETTINGS.showStickyUserMessageBar,
      navigationVisualizationMode: isNavigationVisualizationMode(parsed.navigationVisualizationMode) ? parsed.navigationVisualizationMode : DEFAULT_SETTINGS.navigationVisualizationMode,
      navigationIndicatorOrder: isNavigationIndicatorOrder(parsed.navigationIndicatorOrder) ? parsed.navigationIndicatorOrder : DEFAULT_SETTINGS.navigationIndicatorOrder,
      navigationGroupBackgroundMode: isNavigationGroupBackgroundMode(parsed.navigationGroupBackgroundMode) ? parsed.navigationGroupBackgroundMode : DEFAULT_SETTINGS.navigationGroupBackgroundMode,
      diffVisual: {
        colorPresetId: isColorPresetId(parsedDiffVisual?.colorPresetId) ? parsedDiffVisual.colorPresetId : DEFAULT_SETTINGS.diffVisual.colorPresetId,
        additionsOffsetX: parsedDiffVisual?.additionsOffsetX == null ? legacyOffsetX : clampTextOffset(parsedDiffVisual.additionsOffsetX),
        additionsOffsetY: parsedDiffVisual?.additionsOffsetY == null ? legacyOffsetY : clampTextOffset(parsedDiffVisual.additionsOffsetY),
        deletionsOffsetX: parsedDiffVisual?.deletionsOffsetX == null ? legacyOffsetX : clampTextOffset(parsedDiffVisual.deletionsOffsetX),
        deletionsOffsetY: parsedDiffVisual?.deletionsOffsetY == null ? legacyOffsetY : clampTextOffset(parsedDiffVisual.deletionsOffsetY),
      },
    });
    return cachedSettings;
  } catch {
    cachedSettings = DEFAULT_SETTINGS;
    return cachedSettings;
  }
}

export function saveAgentConsoleSettings(settings: AgentConsoleSettings) {
  const normalized = normalizeAgentConsoleSettings(settings);
  const raw = JSON.stringify(normalized);
  cachedRaw = raw;
  cachedSettings = normalized;
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
