export interface TerminalSettings {
  middleClickClosesTab: boolean;
}

export const TERMINAL_SETTINGS_EVENT = "mlf-terminal-settings-changed";

const STORAGE_KEY = "mlf-terminal-settings";
const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  middleClickClosesTab: true,
};

function normalizeSettings(value: Partial<TerminalSettings> | null | undefined): TerminalSettings {
  return {
    middleClickClosesTab: value?.middleClickClosesTab !== false,
  };
}

export function getTerminalSettings(): TerminalSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TERMINAL_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_TERMINAL_SETTINGS;
  }
}

export function saveTerminalSettings(settings: TerminalSettings) {
  const normalized = normalizeSettings(settings);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch {}
  try { window.dispatchEvent(new CustomEvent(TERMINAL_SETTINGS_EVENT, { detail: normalized })); } catch {}
}
