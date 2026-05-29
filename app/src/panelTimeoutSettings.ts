export interface PanelTimeoutSettings {
  timeoutHours: number;
}

export const PANEL_TIMEOUT_SETTINGS_EVENT = "mlfb-panel-timeout-changed";

const STORAGE_KEY = "mlfb-panel-timeout-v1";
const DEFAULT_TIMEOUT_HOURS = 3;

function normalizeSettings(value: Partial<PanelTimeoutSettings> | null | undefined): PanelTimeoutSettings {
  return {
    timeoutHours:
      typeof value?.timeoutHours === "number" && Number.isFinite(value.timeoutHours) && value.timeoutHours >= 0
        ? value.timeoutHours
        : DEFAULT_TIMEOUT_HOURS,
  };
}

export function getPanelTimeoutSettings(): PanelTimeoutSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { timeoutHours: DEFAULT_TIMEOUT_HOURS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { timeoutHours: DEFAULT_TIMEOUT_HOURS };
  }
}

export function savePanelTimeoutSettings(settings: PanelTimeoutSettings) {
  const normalized = normalizeSettings(settings);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch {}
  try { window.dispatchEvent(new CustomEvent(PANEL_TIMEOUT_SETTINGS_EVENT, { detail: normalized })); } catch {}
}
