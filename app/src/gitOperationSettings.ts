export interface GitOperationSettings {
  timedReminderEnabled: boolean;
  timedReminderIntervalMinutes: number;
  folderBlacklist: string[];
}

export const GIT_OPERATION_SETTINGS_EVENT = "mlf-git-operation-settings-changed";

const STORAGE_KEY = "mlf-git-operation-settings";
const LAST_INJECTED_STORAGE_PREFIX = "mlf-git-reminder-last-injected-at::";

export const GIT_TIMED_REMINDER_MIN_MINUTES = 15;
export const GIT_TIMED_REMINDER_MAX_MINUTES = 180;
export const GIT_TIMED_REMINDER_STEP_MINUTES = 15;

export const DEFAULT_GIT_OPERATION_SETTINGS: GitOperationSettings = {
  timedReminderEnabled: true,
  timedReminderIntervalMinutes: 30,
  folderBlacklist: ["ref-repos"],
};

function normalizeIntervalMinutes(value: unknown): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_GIT_OPERATION_SETTINGS.timedReminderIntervalMinutes;
  const rounded = Math.round(numericValue / GIT_TIMED_REMINDER_STEP_MINUTES) * GIT_TIMED_REMINDER_STEP_MINUTES;
  return Math.max(GIT_TIMED_REMINDER_MIN_MINUTES, Math.min(GIT_TIMED_REMINDER_MAX_MINUTES, rounded));
}

function normalizeFolderEntry(value: string): string | null {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  return normalized ? normalized : null;
}

export function parseGitFolderBlacklistText(value: string): string[] {
  const seen = new Set<string>();
  const entries = value
    .split(/[\n,]+/)
    .map(normalizeFolderEntry)
    .filter((entry): entry is string => Boolean(entry));
  return entries.filter((entry) => {
    const key = entry.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function formatGitFolderBlacklistText(entries: string[]): string {
  return entries.join("\n");
}

export function normalizeGitOperationSettings(value: Partial<GitOperationSettings> | null | undefined): GitOperationSettings {
  const parsedBlacklist = Array.isArray(value?.folderBlacklist)
    ? parseGitFolderBlacklistText(value.folderBlacklist.join("\n"))
    : DEFAULT_GIT_OPERATION_SETTINGS.folderBlacklist;
  return {
    timedReminderEnabled: value?.timedReminderEnabled ?? DEFAULT_GIT_OPERATION_SETTINGS.timedReminderEnabled,
    timedReminderIntervalMinutes: normalizeIntervalMinutes(value?.timedReminderIntervalMinutes),
    folderBlacklist: parsedBlacklist,
  };
}

export function getGitOperationSettings(): GitOperationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GIT_OPERATION_SETTINGS;
    return normalizeGitOperationSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_GIT_OPERATION_SETTINGS;
  }
}

export function saveGitOperationSettings(settings: GitOperationSettings): GitOperationSettings {
  const normalized = normalizeGitOperationSettings(settings);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch {}
  try { window.dispatchEvent(new CustomEvent(GIT_OPERATION_SETTINGS_EVENT, { detail: normalized })); } catch {}
  return normalized;
}

function reminderWorkspaceKey(projectDirectory?: string): string {
  return `${LAST_INJECTED_STORAGE_PREFIX}${encodeURIComponent(projectDirectory?.trim() || "global")}`;
}

export function readTimedGitReminderLastInjectedAt(projectDirectory?: string): number | null {
  try {
    const stored = localStorage.getItem(reminderWorkspaceKey(projectDirectory));
    const value = stored ? Number(stored) : NaN;
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function shouldInjectTimedGitReminder(projectDirectory: string | undefined, now = Date.now(), settings = getGitOperationSettings()): boolean {
  if (!settings.timedReminderEnabled) return false;
  const lastInjectedAt = readTimedGitReminderLastInjectedAt(projectDirectory);
  if (!lastInjectedAt) return true;
  return now - lastInjectedAt >= settings.timedReminderIntervalMinutes * 60 * 1000;
}

export function getMinutesUntilTimedGitReminder(projectDirectory: string | undefined, now = Date.now(), settings = getGitOperationSettings()): number | null {
  if (!settings.timedReminderEnabled) return null;
  const lastInjectedAt = readTimedGitReminderLastInjectedAt(projectDirectory);
  if (!lastInjectedAt) return 0;
  const nextReminderAt = lastInjectedAt + settings.timedReminderIntervalMinutes * 60 * 1000;
  return Math.max(0, Math.ceil((nextReminderAt - now) / 60_000));
}

export function getTimedGitReminderProgress(projectDirectory: string | undefined, now = Date.now(), settings = getGitOperationSettings()): { enabled: boolean; ready: boolean; minutesUntil: number | null; progress: number } {
  if (!settings.timedReminderEnabled) return { enabled: false, ready: false, minutesUntil: null, progress: 0 };
  const lastInjectedAt = readTimedGitReminderLastInjectedAt(projectDirectory);
  if (!lastInjectedAt) return { enabled: true, ready: true, minutesUntil: 0, progress: 1 };

  const intervalMs = settings.timedReminderIntervalMinutes * 60 * 1000;
  const nextReminderAt = lastInjectedAt + intervalMs;
  const remainingMs = nextReminderAt - now;
  if (remainingMs <= 0) return { enabled: true, ready: true, minutesUntil: 0, progress: 1 };

  const progress = Math.max(0, Math.min(1, 1 - remainingMs / intervalMs));
  return {
    enabled: true,
    ready: false,
    minutesUntil: Math.ceil(remainingMs / 60_000),
    progress,
  };
}

export function markTimedGitReminderInjected(projectDirectory?: string, now = Date.now()) {
  try { localStorage.setItem(reminderWorkspaceKey(projectDirectory), String(now)); } catch {}
}
