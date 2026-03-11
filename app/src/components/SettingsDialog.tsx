import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { useFeedbackStore } from "../store/feedbackStore";
import { PromptIcon } from "./PromptIcons";
import { McpConfigHelper } from "./McpConfigHelper";
import { CallerManager } from "./CallerManager";
import { invoke } from "@tauri-apps/api/core";

type Tab = "general" | "callers" | "display" | "notification" | "prompts" | "about";
type Theme = "dark" | "light";

interface NotificationSettings {
  taskbarFlash: boolean;
  systemNotification: boolean;
  persistentUnread: boolean;
}

function getNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem("mlf-notification-settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      return { taskbarFlash: parsed.taskbarFlash !== false, systemNotification: parsed.systemNotification !== false, persistentUnread: parsed.persistentUnread !== false };
    }
  } catch {}
  return { taskbarFlash: true, systemNotification: true, persistentUnread: true };
}

function saveNotificationSettings(settings: NotificationSettings) {
  try { localStorage.setItem("mlf-notification-settings", JSON.stringify(settings)); } catch {}
}

export interface ZoomSettings {
  global: number;
  summary: number;
  input: number;
}

export function getZoomSettings(): ZoomSettings {
  try {
    const raw = localStorage.getItem("mlf-zoom-settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        global: parsed.global ?? 100,
        summary: parsed.summary ?? 100,
        input: parsed.input ?? 100,
      };
    }
  } catch {}
  return { global: 100, summary: 100, input: 100 };
}

function saveZoomSettings(settings: ZoomSettings) {
  try { localStorage.setItem("mlf-zoom-settings", JSON.stringify(settings)); } catch {}
}

export function applyZoomSettings(settings?: ZoomSettings) {
  const s = settings || getZoomSettings();
  document.documentElement.style.setProperty("--zoom-global", String(s.global / 100));
  document.documentElement.style.setProperty("--zoom-summary", String(s.summary / 100));
  document.documentElement.style.setProperty("--zoom-input", String(s.input / 100));
}

// Initialize zoom on module load
applyZoomSettings();

function getStoredTheme(): Theme {
  return (localStorage.getItem("mlf-theme") as Theme) || "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("mlf-theme", theme);
}

// Initialize theme on module load
applyTheme(getStoredTheme());

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("general");
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [autostart, setAutostart] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(getNotificationSettings);
  const [zoomSettings, setZoomSettings] = useState<ZoomSettings>(getZoomSettings);
  const prompts = useFeedbackStore((s) => s.prompts);
  const disabledPrompts = useFeedbackStore((s) => s.disabledPrompts);
  const togglePromptDisabled = useFeedbackStore((s) => s.togglePromptDisabled);

  // Load autostart state
  useEffect(() => {
    if (!open) return;
    invoke<boolean>("get_autostart").then(setAutostart).catch(() => {});
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleThemeChange = useCallback((t: Theme) => {
    setTheme(t);
    applyTheme(t);
  }, []);

  const handleLangChange = useCallback((lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("mlf-lang", lang);
  }, []);

  const handleAutostartToggle = useCallback(() => {
    const newVal = !autostart;
    invoke("set_autostart", { enabled: newVal })
      .then(() => setAutostart(newVal))
      .catch(() => {});
  }, [autostart]);

  const handleNotifToggle = useCallback((key: keyof NotificationSettings) => {
    setNotifSettings((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveNotificationSettings(next);
      return next;
    });
  }, []);

  const handleZoomChange = useCallback((key: keyof ZoomSettings, value: number) => {
    setZoomSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveZoomSettings(next);
      applyZoomSettings(next);
      return next;
    });
  }, []);

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-header">
          <span className="settings-header-title">{t("settings.title")}</span>
          <button className="settings-close-btn" onClick={onClose}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.4" />
              <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          {/* Left nav */}
          <div className="settings-nav">
            <button
              className={`settings-nav-item${tab === "general" ? " settings-nav-active" : ""}`}
              onClick={() => setTab("general")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              {t("settings.general")}
            </button>
            <button
              className={`settings-nav-item${tab === "callers" ? " settings-nav-active" : ""}`}
              onClick={() => setTab("callers")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {t("settings.callers")}
            </button>
            <button
              className={`settings-nav-item${tab === "display" ? " settings-nav-active" : ""}`}
              onClick={() => setTab("display")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
              {t("settings.display")}
            </button>
            <button
              className={`settings-nav-item${tab === "notification" ? " settings-nav-active" : ""}`}
              onClick={() => setTab("notification")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {t("settings.notification")}
            </button>
            <button
              className={`settings-nav-item${tab === "prompts" ? " settings-nav-active" : ""}`}
              onClick={() => setTab("prompts")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              {t("settings.prompts")}
            </button>
            <button
              className={`settings-nav-item${tab === "about" ? " settings-nav-active" : ""}`}
              onClick={() => setTab("about")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              {t("settings.about")}
            </button>
          </div>

          {/* Content */}
          <div className="settings-content">
            {tab === "general" && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.autostart")}</span>
                    <span className="settings-sublabel">{t("settings.autostartDesc")}</span>
                  </div>
                  <button
                    className={`settings-toggle${autostart ? " settings-toggle-on" : ""}`}
                    onClick={handleAutostartToggle}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <McpConfigHelper />

                {/* Clear all history */}
                <div className="settings-row" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12, marginTop: 8 }}>
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.clearHistory")}</span>
                    <span className="settings-sublabel">{t("settings.clearHistoryDesc")}</span>
                  </div>
                  {!confirmClear ? (
                    <div className="settings-btn-group">
                      <button
                        className="settings-btn-option danger"
                        onClick={() => setConfirmClear(true)}
                      >
                        {t("settings.clearHistoryBtn")}
                      </button>
                    </div>
                  ) : (
                    <div className="settings-btn-group">
                      <button
                        className="settings-btn-option danger active"
                        onClick={async () => {
                          await useFeedbackStore.getState().clearAllHistory();
                          setConfirmClear(false);
                        }}
                      >
                        {t("settings.clearHistoryConfirm")}
                      </button>
                      <button
                        className="settings-btn-option"
                        onClick={() => setConfirmClear(false)}
                      >
                        {t("settings.clearHistoryCancel")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "callers" && (
              <CallerManager />
            )}

            {tab === "display" && (
              <div className="settings-section">
                {/* Theme */}
                <div className="settings-row">
                  <span className="settings-label">{t("settings.theme")}</span>
                  <div className="settings-btn-group">
                    <button
                      className={`settings-btn-option${theme === "dark" ? " active" : ""}`}
                      onClick={() => handleThemeChange("dark")}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                      {t("settings.themeDark")}
                    </button>
                    <button
                      className={`settings-btn-option${theme === "light" ? " active" : ""}`}
                      onClick={() => handleThemeChange("light")}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="5" />
                        <line x1="12" y1="1" x2="12" y2="3" />
                        <line x1="12" y1="21" x2="12" y2="23" />
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                        <line x1="1" y1="12" x2="3" y2="12" />
                        <line x1="21" y1="12" x2="23" y2="12" />
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                      </svg>
                      {t("settings.themeLight")}
                    </button>
                  </div>
                </div>

                {/* Language */}
                <div className="settings-row">
                  <span className="settings-label">{t("settings.language")}</span>
                  <div className="settings-btn-group">
                    <button
                      className={`settings-btn-option${i18n.language === "zh" ? " active" : ""}`}
                      onClick={() => handleLangChange("zh")}
                    >
                      中文
                    </button>
                    <button
                      className={`settings-btn-option${i18n.language === "en" ? " active" : ""}`}
                      onClick={() => handleLangChange("en")}
                    >
                      English
                    </button>
                  </div>
                </div>

                {/* Zoom: Global */}
                <div className="settings-row" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12, marginTop: 4 }}>
                  <div className="settings-row-info" style={{ flex: 1 }}>
                    <span className="settings-label">{t("settings.zoomGlobal")}</span>
                  </div>
                  <div className="settings-zoom-control">
                    <input type="range" min={70} max={140} step={5} value={zoomSettings.global} onChange={(e) => handleZoomChange("global", Number(e.target.value))} className="settings-range" />
                    <span className="settings-zoom-value">{zoomSettings.global}%</span>
                  </div>
                </div>

                {/* Zoom: Summary */}
                <div className="settings-row">
                  <div className="settings-row-info" style={{ flex: 1 }}>
                    <span className="settings-label">{t("settings.zoomSummary")}</span>
                  </div>
                  <div className="settings-zoom-control">
                    <input type="range" min={70} max={160} step={5} value={zoomSettings.summary} onChange={(e) => handleZoomChange("summary", Number(e.target.value))} className="settings-range" />
                    <span className="settings-zoom-value">{zoomSettings.summary}%</span>
                  </div>
                </div>

                {/* Zoom: Input */}
                <div className="settings-row">
                  <div className="settings-row-info" style={{ flex: 1 }}>
                    <span className="settings-label">{t("settings.zoomInput")}</span>
                  </div>
                  <div className="settings-zoom-control">
                    <input type="range" min={70} max={140} step={5} value={zoomSettings.input} onChange={(e) => handleZoomChange("input", Number(e.target.value))} className="settings-range" />
                    <span className="settings-zoom-value">{zoomSettings.input}%</span>
                  </div>
                </div>
              </div>
            )}

            {tab === "notification" && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.taskbarFlash")}</span>
                    <span className="settings-sublabel">{t("settings.taskbarFlashDesc")}</span>
                  </div>
                  <button
                    className={`settings-toggle${notifSettings.taskbarFlash ? " settings-toggle-on" : ""}`}
                    onClick={() => handleNotifToggle("taskbarFlash")}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.systemNotification")}</span>
                    <span className="settings-sublabel">{t("settings.systemNotificationDesc")}</span>
                  </div>
                  <button
                    className={`settings-toggle${notifSettings.systemNotification ? " settings-toggle-on" : ""}`}
                    onClick={() => handleNotifToggle("systemNotification")}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.persistentUnread")}</span>
                    <span className="settings-sublabel">{t("settings.persistentUnreadDesc")}</span>
                  </div>
                  <button
                    className={`settings-toggle${notifSettings.persistentUnread ? " settings-toggle-on" : ""}`}
                    onClick={() => handleNotifToggle("persistentUnread")}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </div>
            )}

            {tab === "prompts" && (
              <div className="settings-section">
                {prompts.length === 0 ? (
                  <div className="settings-prompt-empty">
                    {t("settings.promptsEmpty")}
                  </div>
                ) : (
                  <div className="settings-prompt-list">
                    {prompts.map((p) => {
                      const enabled = !disabledPrompts.includes(p.name);
                      return (
                        <div key={p.name} className="settings-prompt-item">
                          <div className="settings-prompt-info">
                            {p.icon && <PromptIcon name={p.icon} size={14} />}
                            <span className="settings-prompt-name">{p.name}</span>
                            {p.description && (
                              <span className="settings-prompt-desc">{p.description}</span>
                            )}
                          </div>
                          <button
                            className={`settings-toggle${enabled ? " settings-toggle-on" : ""}`}
                            onClick={() => togglePromptDisabled(p.name)}
                            title={enabled ? t("settings.promptDisable") : t("settings.promptEnable")}
                          >
                            <span className="settings-toggle-knob" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === "about" && (
              <div className="settings-section">
                <div className="settings-about">
                  <div className="settings-about-icon">
                    <svg width="32" height="32" viewBox="0 0 16 16" fill="var(--color-primary)">
                      <path d="M4,3L11.995,3L11.995,4L4,4C3.45,4 3,4.45 3,5L3,10C3,10.55 3.45,11.001 4,11.001L6,11.001L6,13.001L8.75,11.001C8.75,11.001 10.744,11.001 12,11C12.265,11.001 12.52,10.895 12.707,10.708C12.895,10.52 13,10.266 13,10.001L13,5.004L14,5.004L14,10.017C14,11.115 13.115,12.008 12.017,12.017C10.625,12.029 9.012,12.042 9.012,12.042L6.59,13.81C5.93,14.291 5,13.82 5,13.001L5,12.001L4,12.001C2.9,12 2,11.1 2,10L2,5C2,3.9 2.9,3.001 4,3Z" fillRule="nonzero"/>
                      <g transform="matrix(1,0,0,1,1.4995,1)"><path d="M12.364,0L14.5,2.137L7.637,9L5.5,9L5.5,6.864L12.364,0ZM13.086,2.137L12.364,1.414L6.5,7.278L6.5,8L7.223,8L13.086,2.137Z"/></g>
                      <g transform="matrix(6.12323e-17,-1,1,6.12323e-17,-2,15)"><path d="M6,4.487C6,4.218 5.782,4 5.513,4C5.513,4 5.512,4 5.512,4C5.229,4 5,4.229 5,4.512C5,6.126 5,11 5,11L6,11L6,4.487Z"/></g>
                    </svg>
                  </div>
                  <div className="settings-about-name">My Last Feedback</div>
                  <div className="settings-about-version">v0.1.0</div>
                  <div className="settings-about-desc">{t("settings.aboutDesc")}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
