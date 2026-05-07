export type SessionListMode = "expanded" | "rail" | "topbarCompact" | "topbarStats";

export interface SessionNavigationSettings {
  mode: SessionListMode;
  showAttachmentDots: boolean;
  useColorCards: boolean;
}

export const SESSION_LIST_MODE_OPTIONS: Array<{ mode: SessionListMode; labelKey: string; defaultLabel: string; icon: string }> = [
  { mode: "expanded", labelKey: "settings.sessionNavigationModeExpanded", defaultLabel: "Sidebar: details", icon: "sidebar" },
  { mode: "rail", labelKey: "settings.sessionNavigationModeRail", defaultLabel: "Sidebar: compact", icon: "menu" },
  { mode: "topbarCompact", labelKey: "settings.sessionNavigationModeTopbarCompact", defaultLabel: "Top: compact", icon: "list-tree" },
  { mode: "topbarStats", labelKey: "settings.sessionNavigationModeTopbarStats", defaultLabel: "Top: stats", icon: "sort" },
];

const SESSION_LIST_MODE_STORAGE_KEY = "mlf-session-list-mode";
const LEGACY_COLLAPSED_STORAGE_KEY = "mlf-sidebar-collapsed";
const SESSION_ATTACHMENT_DOTS_STORAGE_KEY = "mlf-session-navigation-show-attachment-dots";
const SESSION_COLOR_CARDS_STORAGE_KEY = "mlf-session-navigation-use-color-cards";

export function isSessionListMode(value: string | null): value is SessionListMode {
  return value === "expanded" || value === "rail" || value === "topbarCompact" || value === "topbarStats";
}

export function readSessionListMode(): SessionListMode {
  try {
    const stored = localStorage.getItem(SESSION_LIST_MODE_STORAGE_KEY);
    if (isSessionListMode(stored)) return stored;
    if (stored === "topbar") return "topbarStats";
    return localStorage.getItem(LEGACY_COLLAPSED_STORAGE_KEY) === "true" ? "rail" : "expanded";
  } catch {
    return "expanded";
  }
}

export function saveSessionListMode(mode: SessionListMode) {
  try { localStorage.setItem(SESSION_LIST_MODE_STORAGE_KEY, mode); } catch {}
  try { localStorage.setItem(LEGACY_COLLAPSED_STORAGE_KEY, String(mode === "rail")); } catch {}
}

export function readShowSessionNavigationAttachmentDots(): boolean {
  try {
    const stored = localStorage.getItem(SESSION_ATTACHMENT_DOTS_STORAGE_KEY);
    return stored == null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function saveShowSessionNavigationAttachmentDots(value: boolean) {
  try { localStorage.setItem(SESSION_ATTACHMENT_DOTS_STORAGE_KEY, String(value)); } catch {}
}

export function readUseSessionNavigationColorCards(): boolean {
  try {
    const stored = localStorage.getItem(SESSION_COLOR_CARDS_STORAGE_KEY);
    return stored == null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function saveUseSessionNavigationColorCards(value: boolean) {
  try { localStorage.setItem(SESSION_COLOR_CARDS_STORAGE_KEY, String(value)); } catch {}
}

export function getSessionNavigationSettings(): SessionNavigationSettings {
  return {
    mode: readSessionListMode(),
    showAttachmentDots: readShowSessionNavigationAttachmentDots(),
    useColorCards: readUseSessionNavigationColorCards(),
  };
}

export function saveSessionNavigationSettings(settings: SessionNavigationSettings) {
  saveSessionListMode(settings.mode);
  saveShowSessionNavigationAttachmentDots(settings.showAttachmentDots);
  saveUseSessionNavigationColorCards(settings.useColorCards);
}