export type TerminalShellId = "auto" | "pwsh" | "powershell" | "cmd" | "git-bash" | "wsl";

export interface TerminalSettings {
  middleClickClosesTab: boolean;
  defaultShell: TerminalShellId;
}

export const TERMINAL_SETTINGS_EVENT = "mlf-terminal-settings-changed";

const STORAGE_KEY = "mlf-terminal-settings";
const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  middleClickClosesTab: true,
  defaultShell: "cmd",
};

const TERMINAL_SHELL_IDS = new Set<TerminalShellId>(["auto", "pwsh", "powershell", "cmd", "git-bash", "wsl"]);

export function terminalShellToCommand(shell: TerminalShellId): string | null {
  return shell === "auto" ? null : shell;
}

function normalizeShell(value: unknown): TerminalShellId {
  return typeof value === "string" && TERMINAL_SHELL_IDS.has(value as TerminalShellId) ? value as TerminalShellId : "cmd";
}

function normalizeSettings(value: Partial<TerminalSettings> | null | undefined): TerminalSettings {
  return {
    middleClickClosesTab: value?.middleClickClosesTab !== false,
    defaultShell: normalizeShell(value?.defaultShell),
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
