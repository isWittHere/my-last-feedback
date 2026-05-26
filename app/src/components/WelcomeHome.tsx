import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../i18n";
import { useFeedbackStore } from "../store/feedbackStore";
import { PromptIcon } from "./PromptIcons";
import { McpConfigHelper } from "./McpConfigHelper";

type Theme = "dark" | "light";

function getStoredTheme(): Theme {
  return (localStorage.getItem("mlf-theme") as Theme) || "dark";
}

export function WelcomeHome() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [autostart, setAutostart] = useState(false);
  const prompts = useFeedbackStore((s) => s.prompts);
  const disabledPrompts = useFeedbackStore((s) => s.disabledPrompts);
  const togglePromptDisabled = useFeedbackStore((s) => s.togglePromptDisabled);

  useEffect(() => {
    invoke<boolean>("get_autostart").then(setAutostart).catch(() => {});
  }, []);

  const handleThemeChange = useCallback((t: Theme) => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("mlf-theme", t);
  }, []);

  const handleAutostartToggle = useCallback(() => {
    const newVal = !autostart;
    invoke("set_autostart", { enabled: newVal })
      .then(() => setAutostart(newVal))
      .catch(() => {});
  }, [autostart]);

  return (
    <div className="welcome-home">
      {/* Logo */}
      <div className="welcome-logo">
        <svg width="48" height="48" viewBox="0 0 16 16" fill="var(--color-primary)">
          <path d="M4,3L11.995,3L11.995,4L4,4C3.45,4 3,4.45 3,5L3,10C3,10.55 3.45,11.001 4,11.001L6,11.001L6,13.001L8.75,11.001C8.75,11.001 10.744,11.001 12,11C12.265,11.001 12.52,10.895 12.707,10.708C12.895,10.52 13,10.266 13,10.001L13,5.004L14,5.004L14,10.017C14,11.115 13.115,12.008 12.017,12.017C10.625,12.029 9.012,12.042 9.012,12.042L6.59,13.81C5.93,14.291 5,13.82 5,13.001L5,12.001L4,12.001C2.9,12 2,11.1 2,10L2,5C2,3.9 2.9,3.001 4,3Z" fillRule="nonzero"/>
          <g transform="matrix(1,0,0,1,1.4995,1)"><path d="M12.364,0L14.5,2.137L7.637,9L5.5,9L5.5,6.864L12.364,0ZM13.086,2.137L12.364,1.414L6.5,7.278L6.5,8L7.223,8L13.086,2.137Z"/></g>
          <g transform="matrix(6.12323e-17,-1,1,6.12323e-17,-2,15)"><path d="M6,4.487C6,4.218 5.782,4 5.513,4C5.513,4 5.512,4 5.512,4C5.229,4 5,4.229 5,4.512C5,6.126 5,11 5,11L6,11L6,4.487Z"/></g>
        </svg>
        <div className="welcome-title">My Last Feedback</div>
        <div className="welcome-subtitle">{t("session.waitingForRequest", "Waiting for feedback request...")}</div>
      </div>

      {/* Two-column cards */}
      <div className="welcome-cards">
        {/* Left: Quick settings */}
        <div className="welcome-settings">
          {/* Autostart */}
          <div className="welcome-row">
            <span className="welcome-label">{t("settings.autostart")}</span>
            <button
              className={`settings-toggle${autostart ? " settings-toggle-on" : ""}`}
              onClick={handleAutostartToggle}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>

          {/* Theme */}
          <div className="welcome-row">
            <span className="welcome-label">{t("settings.theme")}</span>
            <div className="settings-btn-group">
              <button
                className={`settings-btn-option${theme === "dark" ? " active" : ""}`}
                onClick={() => handleThemeChange("dark")}
              >
                {t("settings.themeDark")}
              </button>
              <button
                className={`settings-btn-option${theme === "light" ? " active" : ""}`}
                onClick={() => handleThemeChange("light")}
              >
                {t("settings.themeLight")}
              </button>
            </div>
          </div>

          {/* Language */}
          <div className="welcome-row">
            <span className="welcome-label">{t("settings.language")}</span>
            <div className="settings-btn-group">
              <button
                className={`settings-btn-option${i18n.language === "zh" ? " active" : ""}`}
                onClick={() => { i18n.changeLanguage("zh"); localStorage.setItem("mlf-lang", "zh"); }}
              >
                中文
              </button>
              <button
                className={`settings-btn-option${i18n.language === "en" ? " active" : ""}`}
                onClick={() => { i18n.changeLanguage("en"); localStorage.setItem("mlf-lang", "en"); }}
              >
                EN
              </button>
            </div>
          </div>

          {/* Prompts */}
          {prompts.length > 0 && (
            <div className="welcome-prompts">
              <span className="welcome-label">{t("settings.prompts")}</span>
              <div className="welcome-prompt-list">
                {prompts.map((p) => {
                  const enabled = !disabledPrompts.includes(p.name);
                  return (
                    <div key={p.name} className="welcome-prompt-item">
                      <div className="welcome-prompt-info">
                        {p.icon && <PromptIcon name={p.icon} size={12} />}
                        <span>{p.name}</span>
                      </div>
                      <button
                        className={`settings-toggle settings-toggle-sm${enabled ? " settings-toggle-on" : ""}`}
                        onClick={() => togglePromptDisabled(p.name)}
                      >
                        <span className="settings-toggle-knob" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: MCP Configuration helper */}
        <McpConfigHelper compact />
      </div>
    </div>
  );
}
