import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { useFeedbackStore } from "../store/feedbackStore";
import { PromptIcon } from "./PromptIcons";
import { McpConfigHelper } from "./McpConfigHelper";
import { CallerManager } from "./CallerManager";
import { Icon } from "./Icons";
import { invoke } from "@tauri-apps/api/core";
import { applyTheme, getStoredTheme, type Theme } from "../theme";
import { getNotificationSettings, saveNotificationSettings, syncAutoFocusNewRequest, type NotificationSettings } from "../notificationSettings";
import { getSubmittedViewSettings, saveSubmittedViewSettings, SUBMITTED_VIEW_SECTION_CONFIGS, type SubmittedViewSectionId, type SubmittedViewSettings } from "../submittedViewSettings";

type Tab = "general" | "callers" | "display" | "notification" | "prompts" | "about";

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

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("general");
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [autostart, setAutostart] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(getNotificationSettings);
  const [zoomSettings, setZoomSettings] = useState<ZoomSettings>(getZoomSettings);
  const [submittedViewSettings, setSubmittedViewSettings] = useState<SubmittedViewSettings>(getSubmittedViewSettings);
  const prompts = useFeedbackStore((s) => s.prompts);
  const disabledPrompts = useFeedbackStore((s) => s.disabledPrompts);
  const togglePromptDisabled = useFeedbackStore((s) => s.togglePromptDisabled);

  // Load autostart state
  useEffect(() => {
    if (!open) return;
    setTheme(getStoredTheme());
    setNotifSettings(getNotificationSettings());
    setSubmittedViewSettings(getSubmittedViewSettings());
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
      if (key === "autoFocusNewRequest") {
        syncAutoFocusNewRequest(next.autoFocusNewRequest);
      }
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

  const updateSubmittedViewSettings = useCallback((updater: (current: SubmittedViewSettings) => SubmittedViewSettings) => {
    setSubmittedViewSettings((current) => {
      const next = updater(current);
      saveSubmittedViewSettings(next);
      return next;
    });
  }, []);

  const handleSubmittedSectionVisibleToggle = useCallback((id: SubmittedViewSectionId) => {
    updateSubmittedViewSettings((current) => ({
      ...current,
      visibleSections: { ...current.visibleSections, [id]: !current.visibleSections[id] },
    }));
  }, [updateSubmittedViewSettings]);

  const handleSubmittedSectionCollapsedToggle = useCallback((id: SubmittedViewSectionId) => {
    updateSubmittedViewSettings((current) => ({
      ...current,
      collapsedSections: { ...current.collapsedSections, [id]: !current.collapsedSections[id] },
    }));
  }, [updateSubmittedViewSettings]);

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-header">
          <span className="settings-header-title">{t("settings.title")}</span>
          <button className="settings-close-btn" onClick={onClose}>
            <Icon name="win-close" size={10} />
          </button>
        </div>

        <div className="settings-body">
          {/* Left nav */}
          <div className="settings-nav">
            <button
              className={`settings-nav-item${tab === "general" ? " settings-nav-active" : ""}`}
              onClick={() => setTab("general")}
            >
              <Icon name="gear" size={14} />
              {t("settings.general")}
            </button>
            <button
              className={`settings-nav-item${tab === "callers" ? " settings-nav-active" : ""}`}
              onClick={() => setTab("callers")}
            >
              <Icon name="users" size={14} />
              {t("settings.callers")}
            </button>
            <button
              className={`settings-nav-item${tab === "display" ? " settings-nav-active" : ""}`}
              onClick={() => setTab("display")}
            >
              <Icon name="sun" size={14} />
              {t("settings.display")}
            </button>
            <button
              className={`settings-nav-item${tab === "notification" ? " settings-nav-active" : ""}`}
              onClick={() => setTab("notification")}
            >
              <Icon name="bell" size={14} />
              {t("settings.notification")}
            </button>
            <button
              className={`settings-nav-item${tab === "prompts" ? " settings-nav-active" : ""}`}
              onClick={() => setTab("prompts")}
            >
              <Icon name="file-text" size={14} />
              {t("settings.prompts")}
            </button>
            <button
              className={`settings-nav-item${tab === "about" ? " settings-nav-active" : ""}`}
              onClick={() => setTab("about")}
            >
              <Icon name="info" size={14} />
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
                      <Icon name="moon" size={12} />
                      {t("settings.themeDark")}
                    </button>
                    <button
                      className={`settings-btn-option${theme === "light" ? " active" : ""}`}
                      onClick={() => handleThemeChange("light")}
                    >
                      <Icon name="sun-full" size={12} />
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

                <div className="settings-row settings-row-stacked" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12, marginTop: 4 }}>
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.submittedView", "Submitted feedback view")}</span>
                    <span className="settings-sublabel">{t("settings.submittedViewDesc", "Choose which audit sections are shown and whether each section starts collapsed.")}</span>
                  </div>
                  <div className="settings-submitted-section-list">
                    <div className="settings-submitted-section-head">
                      <span>{t("settings.submittedSection", "Section")}</span>
                      <span>{t("settings.submittedVisible", "Show")}</span>
                      <span>{t("settings.submittedCollapsed", "Collapse")}</span>
                    </div>
                    {SUBMITTED_VIEW_SECTION_CONFIGS.map((section) => (
                      <div key={section.id} className="settings-submitted-section-item">
                        <span className="settings-submitted-section-name">{t(section.labelKey, section.defaultLabel)}</span>
                        <button
                          className={`settings-toggle settings-toggle-sm${submittedViewSettings.visibleSections[section.id] ? " settings-toggle-on" : ""}`}
                          onClick={() => handleSubmittedSectionVisibleToggle(section.id)}
                          title={submittedViewSettings.visibleSections[section.id] ? t("settings.submittedHide", "Hide") : t("settings.submittedShow", "Show")}
                        >
                          <span className="settings-toggle-knob" />
                        </button>
                        <button
                          className={`settings-toggle settings-toggle-sm${submittedViewSettings.collapsedSections[section.id] ? " settings-toggle-on" : ""}`}
                          onClick={() => handleSubmittedSectionCollapsedToggle(section.id)}
                          title={submittedViewSettings.collapsedSections[section.id] ? t("settings.submittedStartCollapsed", "Starts collapsed") : t("settings.submittedStartExpanded", "Starts expanded")}
                        >
                          <span className="settings-toggle-knob" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "notification" && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.autoFocusNewRequest")}</span>
                    <span className="settings-sublabel">{t("settings.autoFocusNewRequestDesc")}</span>
                  </div>
                  <button
                    className={`settings-toggle${notifSettings.autoFocusNewRequest ? " settings-toggle-on" : ""}`}
                    onClick={() => handleNotifToggle("autoFocusNewRequest")}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
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
