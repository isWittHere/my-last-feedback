import { useState, useEffect, useCallback, useMemo, type DragEvent as ReactDragEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { useFeedbackStore, type DockColumnId, type DockTabId } from "../store/feedbackStore";
import { PromptIcon } from "./PromptIcons";
import { McpConfigHelper } from "./McpConfigHelper";
import { CallerManager } from "./CallerManager";
import { Icon, MlcLogoIcon } from "./Icons";
import { createMockAgentSession } from "../agent/mockData";
import { AgentSessionHeader } from "./agent/AgentSessionHeader";
import { invoke } from "@tauri-apps/api/core";
import { applyTheme, getStoredTheme, type Theme } from "../theme";
import { getNotificationSettings, saveNotificationSettings, syncAutoFocusNewRequest, type NotificationSettings } from "../notificationSettings";
import { getSubmittedViewSettings, saveSubmittedViewSettings, SUBMITTED_VIEW_SECTION_CONFIGS, type SubmittedViewSectionId, type SubmittedViewSettings } from "../submittedViewSettings";
import { getTerminalSettings, saveTerminalSettings, type TerminalSettings, type TerminalShellId } from "../terminalSettings";
import { getComposerSettings, saveComposerSettings, type ComposerSettings } from "../composerSettings";
import { AGENT_DIFF_COLOR_PRESETS, getAgentConsoleSettings, saveAgentConsoleSettings, type AgentConsoleSettings, type AgentDiffColorPresetId, type AgentProcessStepDefaultMode, type AgentTopbarIndicatorMode } from "../agentConsoleSettings";
import { getOpenCodeSettings, setOpenCodeModelEnabled, setOpenCodeModelFavorite, setOpenCodePreferredModel, type OpenCodeSettings } from "../openCodeSettings";
import { SESSION_LIST_MODE_OPTIONS } from "../sessionNavigationSettings";
import { SessionNavigationModeIcon } from "./SessionNavigationModeIcon";
import { AppSelect, type AppSelectOption } from "./AppSelect";

type Tab = "general" | "display" | "callers" | "submitted" | "prompts" | "sessionNavigation" | "layoutPanels" | "acpConsole" | "openCode" | "terminal" | "resources" | "notification" | "about";
type SettingsGroupId = "mlfb" | "acp" | "layout";

const SETTINGS_DOCK_COLUMN_IDS: DockColumnId[] = ["leftSidebar", "leftPage", "rightPage", "rightSidebar"];
const SETTINGS_DOCK_TAB_IDS: DockTabId[] = ["mlc", "mlcPreview", "resources", "previewBrowser", "previewInfo", "agentConsole", "terminal"];
const AGENT_TOPBAR_INDICATOR_MODE_OPTIONS: AgentTopbarIndicatorMode[] = ["hidden", "text", "textAndGraphic"];
const AGENT_PROCESS_STEP_MODE_OPTIONS: AgentProcessStepDefaultMode[] = ["tabs", "timeline"];

function isSettingsDockTabId(value: string): value is DockTabId {
  return SETTINGS_DOCK_TAB_IDS.includes(value as DockTabId);
}

function AgentTopbarIndicatorModeIcon({ mode }: { mode: AgentTopbarIndicatorMode }) {
  if (mode === "hidden") return <Icon name="eye-off" size={15} />;
  if (mode === "text") return <Icon name="list" size={15} />;
  return <Icon name="sort" size={15} />;
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

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("general");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<SettingsGroupId, boolean>>({ mlfb: false, acp: false, layout: false });
  const [draggedDockTab, setDraggedDockTab] = useState<DockTabId | null>(null);
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [autostart, setAutostart] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [diffOffsetCollapsed, setDiffOffsetCollapsed] = useState(true);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(getNotificationSettings);
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettings>(getTerminalSettings);
  const [composerSettings, setComposerSettings] = useState<ComposerSettings>(getComposerSettings);
  const [agentConsoleSettings, setAgentConsoleSettings] = useState<AgentConsoleSettings>(getAgentConsoleSettings);
  const [openCodeSettings, setOpenCodeSettings] = useState<OpenCodeSettings>(getOpenCodeSettings);
  const [openCodeModelQuery, setOpenCodeModelQuery] = useState("");
  const [zoomSettings, setZoomSettings] = useState<ZoomSettings>(getZoomSettings);
  const [submittedViewSettings, setSubmittedViewSettings] = useState<SubmittedViewSettings>(getSubmittedViewSettings);
  const acpPreviewSession = useMemo(() => createMockAgentSession(), []);
  const prompts = useFeedbackStore((s) => s.prompts);
  const disabledPrompts = useFeedbackStore((s) => s.disabledPrompts);
  const showPromptButtons = useFeedbackStore((s) => s.showPromptButtons);
  const showTransferSubmitUi = useFeedbackStore((s) => s.showTransferSubmitUi);
  const resourceIconTheme = useFeedbackStore((s) => s.resourceIconTheme);
  const sessionListMode = useFeedbackStore((s) => s.sessionListMode);
  const showSessionNavigationAttachmentDots = useFeedbackStore((s) => s.showSessionNavigationAttachmentDots);
  const dockLayout = useFeedbackStore((s) => s.dockLayout);
  const setShowPromptButtons = useFeedbackStore((s) => s.setShowPromptButtons);
  const setShowTransferSubmitUi = useFeedbackStore((s) => s.setShowTransferSubmitUi);
  const setResourceIconTheme = useFeedbackStore((s) => s.setResourceIconTheme);
  const setSessionListMode = useFeedbackStore((s) => s.setSessionListMode);
  const setShowSessionNavigationAttachmentDots = useFeedbackStore((s) => s.setShowSessionNavigationAttachmentDots);
  const togglePromptDisabled = useFeedbackStore((s) => s.togglePromptDisabled);
  const moveDockTabToColumn = useFeedbackStore((s) => s.moveDockTabToColumn);

  // Load autostart state
  useEffect(() => {
    if (!open) return;
    setTheme(getStoredTheme());
    setNotifSettings(getNotificationSettings());
    setTerminalSettings(getTerminalSettings());
    setComposerSettings(getComposerSettings());
    setAgentConsoleSettings(getAgentConsoleSettings());
    setOpenCodeSettings(getOpenCodeSettings());
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

  const handleTerminalToggle = useCallback((key: "middleClickClosesTab") => {
    setTerminalSettings((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveTerminalSettings(next);
      return next;
    });
  }, []);

  const handleTerminalShellChange = useCallback((defaultShell: TerminalShellId) => {
    setTerminalSettings((prev) => {
      const next = { ...prev, defaultShell };
      saveTerminalSettings(next);
      return next;
    });
  }, []);

  const handleComposerToggle = useCallback((key: keyof ComposerSettings) => {
    setComposerSettings((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveComposerSettings(next);
      return next;
    });
  }, []);

  const handleAgentIndicatorModeChange = useCallback((key: keyof AgentConsoleSettings, value: AgentTopbarIndicatorMode) => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentSmoothStreamingToggle = useCallback(() => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, smoothStreamingOutput: !prev.smoothStreamingOutput };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentMessageSpeakerToggle = useCallback(() => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, showMessageSpeakerLine: !prev.showMessageSpeakerLine };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentProcessStepModeChange = useCallback((processStepDefaultMode: AgentProcessStepDefaultMode) => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, processStepDefaultMode };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentDiffColorPresetChange = useCallback((colorPresetId: AgentDiffColorPresetId) => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, diffVisual: { ...prev.diffVisual, colorPresetId } };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentDiffTextOffsetChange = useCallback((key: "additionsOffsetX" | "additionsOffsetY" | "deletionsOffsetX" | "deletionsOffsetY", value: number) => {
    const boundedValue = Math.max(-4, Math.min(4, Math.round(value * 2) / 2));
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, diffVisual: { ...prev.diffVisual, [key]: boundedValue } };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleOpenCodeModelEnabledChange = useCallback((modelId: string, enabled: boolean) => {
    setOpenCodeSettings(setOpenCodeModelEnabled(modelId, enabled));
  }, []);

  const handleOpenCodeModelFavoriteChange = useCallback((modelId: string, favorite: boolean) => {
    setOpenCodeSettings(setOpenCodeModelFavorite(modelId, favorite));
  }, []);

  const handleOpenCodePreferredModelChange = useCallback((modelId: string) => {
    setOpenCodeSettings(setOpenCodePreferredModel(modelId));
  }, []);

  const filteredOpenCodeModels = useMemo(() => {
    const query = openCodeModelQuery.trim().toLowerCase();
    const models = query
      ? openCodeSettings.models.filter((model) => `${model.label} ${model.id} ${model.description || ""}`.toLowerCase().includes(query))
      : openCodeSettings.models;
    return [...models].sort((a, b) => Number(b.favorite) - Number(a.favorite) || Number(b.enabled) - Number(a.enabled) || a.label.localeCompare(b.label));
  }, [openCodeModelQuery, openCodeSettings.models]);

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

  const toggleSettingsGroup = useCallback((groupId: SettingsGroupId) => {
    setCollapsedGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  }, []);

  const renderSettingsNavItem = (targetTab: Tab, icon: string, label: string, nested = false) => (
    <button
      type="button"
      className={`settings-nav-item${nested ? " settings-nav-item-nested" : ""}${tab === targetTab ? " settings-nav-active" : ""}`}
      onClick={() => setTab(targetTab)}
    >
      <Icon name={icon} size={14} />
      <span>{label}</span>
    </button>
  );

  const renderSettingsNavGroup = (groupId: SettingsGroupId, label: string, childTabs: Tab[], children: ReactNode) => {
    const collapsed = collapsedGroups[groupId];
    const active = childTabs.includes(tab);
    return (
      <div className={`settings-nav-group${active ? " settings-nav-group-active" : ""}`}>
        <button type="button" className="settings-nav-group-toggle" onClick={() => toggleSettingsGroup(groupId)}>
          <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={14} />
          <span>{label}</span>
        </button>
        {!collapsed && <div className="settings-nav-group-items">{children}</div>}
      </div>
    );
  };

  const agentIndicatorModeLabel = (mode: AgentTopbarIndicatorMode) => {
    if (mode === "hidden") return t("settings.acpIndicatorHidden", "Hidden");
    if (mode === "text") return t("settings.acpIndicatorText", "Text only");
    return t("settings.acpIndicatorTextAndGraphic", "Text and graphic");
  };

  const renderAgentIndicatorModeGroup = (key: keyof AgentConsoleSettings, currentMode: AgentTopbarIndicatorMode, ariaLabel: string) => (
    <div className="cm-column-mode-group settings-acp-mode-group" role="group" aria-label={ariaLabel}>
      {AGENT_TOPBAR_INDICATOR_MODE_OPTIONS.map((mode) => {
        const label = agentIndicatorModeLabel(mode);
        return (
          <button
            key={mode}
            type="button"
            className={`cm-column-mode-button settings-acp-mode-button${currentMode === mode ? " active" : ""}`}
            title={label}
            aria-label={`${ariaLabel}: ${label}`}
            onClick={() => handleAgentIndicatorModeChange(key, mode)}
          >
            <AgentTopbarIndicatorModeIcon mode={mode} />
          </button>
        );
      })}
    </div>
  );

  const processStepModeLabel = (mode: AgentProcessStepDefaultMode) => mode === "tabs"
    ? t("settings.acpProcessStepModeTabs", "Tabs")
    : t("settings.acpProcessStepModeTimeline", "Timeline");

  const renderAgentProcessStepModeGroup = () => (
    <div className="settings-btn-group" role="group" aria-label={t("settings.acpProcessStepDefaultMode", "Step process default view")}> 
      {AGENT_PROCESS_STEP_MODE_OPTIONS.map((mode) => {
        const label = processStepModeLabel(mode);
        return (
          <button
            key={mode}
            type="button"
            className={`settings-btn-option${agentConsoleSettings.processStepDefaultMode === mode ? " active" : ""}`}
            onClick={() => handleAgentProcessStepModeChange(mode)}
            title={label}
          >
            <Icon name={mode === "tabs" ? "rows" : "list"} size={13} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );

  const renderAgentDiffOffsetControl = (label: string, key: "additionsOffsetX" | "additionsOffsetY" | "deletionsOffsetX" | "deletionsOffsetY") => {
    const value = agentConsoleSettings.diffVisual[key];
    const displayValue = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return (
      <div className="settings-acp-offset-row">
        <span className="settings-acp-offset-label">{label}</span>
        <div className="settings-acp-offset-stepper" role="group" aria-label={label}>
          <button
            type="button"
            className="settings-acp-offset-button"
            disabled={value <= -4}
            onClick={() => handleAgentDiffTextOffsetChange(key, value - 0.5)}
            aria-label={`${label} -0.5px`}
          >
            -
          </button>
          <span className="settings-acp-offset-value">{displayValue}px</span>
          <button
            type="button"
            className="settings-acp-offset-button"
            disabled={value >= 4}
            onClick={() => handleAgentDiffTextOffsetChange(key, value + 0.5)}
            aria-label={`${label} +0.5px`}
          >
            +
          </button>
        </div>
      </div>
    );
  };

  const renderAcpPreview = () => {
    return (
      <div className="settings-acp-preview" aria-label={t("settings.acpPreview", "ACP preview")}>
        <AgentSessionHeader
          session={acpPreviewSession}
          sessions={[acpPreviewSession]}
          activeSessionId={acpPreviewSession.id}
          onSelectSession={() => {}}
          onStartAcp={async () => {}}
          onStopAcp={async () => {}}
          previewMode
        />
      </div>
    );
  };

  const renderOpenCodeModelLibrary = () => {
    const enabledCount = openCodeSettings.models.filter((model) => model.enabled).length;
    const favoriteCount = openCodeSettings.models.filter((model) => model.favorite).length;
    const preferredModel = openCodeSettings.models.find((model) => model.id === openCodeSettings.preferredModelId);
    return (
      <div className="settings-section settings-opencode-section">
        <div className="settings-row settings-row-stacked">
          <div className="settings-row-info">
            <span className="settings-label">{t("settings.openCodeModelLibrary", "OpenCode model library")}</span>
            <span className="settings-sublabel">{t("settings.openCodeModelLibraryDesc", "Models are discovered from the real ACP session. Enable the models that should appear in the compact Agent Console switcher.")}</span>
          </div>
          <div className="settings-opencode-summary-row">
            <span>{t("settings.openCodeModelsTotal", "{{count}} models", { count: openCodeSettings.models.length })}</span>
            <span>{t("settings.openCodeModelsEnabled", "{{count}} enabled", { count: enabledCount })}</span>
            <span>{t("settings.openCodeModelsFavorite", "{{count}} favorites", { count: favoriteCount })}</span>
            {preferredModel && <span>{t("settings.openCodePreferredModel", "Default: {{model}}", { model: preferredModel.label })}</span>}
          </div>
          <div className="settings-opencode-toolbar">
            <Icon name="search" size={13} />
            <input
              value={openCodeModelQuery}
              onChange={(event) => setOpenCodeModelQuery(event.target.value)}
              placeholder={t("settings.openCodeSearchModels", "Search models...")}
              className="settings-opencode-search"
            />
          </div>
          {openCodeSettings.models.length === 0 ? (
            <div className="settings-opencode-empty">
              <Icon name="robot" size={15} />
              <span>{t("settings.openCodeModelLibraryEmpty", "Connect OpenCode ACP once to discover available models.")}</span>
            </div>
          ) : (
            <div className="settings-opencode-model-list">
              <div className="settings-opencode-model-head">
                <span>{t("settings.openCodeModel", "Model")}</span>
                <span>{t("settings.openCodeDefault", "Default")}</span>
                <span>{t("settings.openCodeEnabled", "Enabled")}</span>
              </div>
              {filteredOpenCodeModels.map((model) => {
                const isPreferred = openCodeSettings.preferredModelId === model.id;
                return (
                  <div key={model.id} className="settings-opencode-model-item">
                    <div className="settings-opencode-model-info">
                      <button
                        type="button"
                        className={`settings-opencode-star${model.favorite ? " active" : ""}`}
                        title={model.favorite ? t("settings.openCodeRemoveFavorite", "Remove favorite") : t("settings.openCodeAddFavorite", "Add favorite")}
                        onClick={() => handleOpenCodeModelFavoriteChange(model.id, !model.favorite)}
                      >
                        <Icon name={model.favorite ? "star-full" : "star-empty"} size={13} />
                      </button>
                      <span className="settings-opencode-model-title-stack">
                        <span className="settings-opencode-model-name">{model.label}</span>
                        <span className="settings-opencode-model-id">{model.id}</span>
                        {model.description && <span className="settings-opencode-model-desc">{model.description}</span>}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`settings-opencode-default-button${isPreferred ? " active" : ""}`}
                      onClick={() => handleOpenCodePreferredModelChange(model.id)}
                      title={isPreferred ? t("settings.openCodeCurrentDefault", "Current default") : t("settings.openCodeSetDefault", "Set as default")}
                    >
                      {isPreferred ? <Icon name="check" size={12} /> : <Icon name="pin" size={12} />}
                      <span>{isPreferred ? t("settings.openCodeDefaultActive", "Default") : t("settings.openCodeSetDefaultShort", "Set")}</span>
                    </button>
                    <button
                      type="button"
                      className={`settings-toggle settings-toggle-sm${model.enabled ? " settings-toggle-on" : ""}`}
                      onClick={() => handleOpenCodeModelEnabledChange(model.id, !model.enabled)}
                      title={model.enabled ? t("settings.openCodeDisableModel", "Hide from switcher") : t("settings.openCodeEnableModel", "Show in switcher")}
                    >
                      <span className="settings-toggle-knob" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const dockColumnLabel = (columnId: DockColumnId) => {
    if (columnId === "leftSidebar") return t("settings.dockLeftSidebar", "Left sidebar");
    if (columnId === "leftPage") return t("settings.dockLeftPage", "Left page");
    if (columnId === "rightPage") return t("settings.dockRightPage", "Right page");
    return t("settings.dockRightSidebar", "Right sidebar");
  };

  const dockTabLabel = (tabId: DockTabId) => {
    if (tabId === "mlc") return t("mlc.title", "My Last Chat");
    if (tabId === "mlcPreview") return t("mlcPreview.title", "MLC Preview");
    if (tabId === "previewBrowser") return t("previewBrowser.title", "Preview Browser");
    if (tabId === "previewInfo") return t("previewBrowser.infoTitle", "Preview Info");
    if (tabId === "agentConsole") return t("agentConsole.title", "Agent Console");
    if (tabId === "terminal") return t("terminal.title", "Terminal");
    return t("resources.title", "Project resources");
  };

  const renderDockTabIcon = (tabId: DockTabId) => {
    if (tabId === "mlc") return <MlcLogoIcon size={13} />;
    if (tabId === "mlcPreview") return <Icon name="file-text" size={13} />;
    if (tabId === "previewBrowser") return <Icon name="globe" size={13} />;
    if (tabId === "previewInfo") return <Icon name="code" size={13} />;
    if (tabId === "agentConsole") return <Icon name="robot" size={13} />;
    if (tabId === "terminal") return <Icon name="terminal" size={13} />;
    return <Icon name="folder" size={13} />;
  };

  const dockColumnIcon = (columnId: DockColumnId) => (
    columnId === "leftPage" || columnId === "rightPage" ? "page-sidebar" : "sidebar"
  );

  const getDraggedDockTab = (event: ReactDragEvent): DockTabId | null => {
    if (draggedDockTab) return draggedDockTab;
    const transferredTabId = event.dataTransfer.getData("text/plain");
    return isSettingsDockTabId(transferredTabId) ? transferredTabId : null;
  };

  const handleDockTabDragStart = (event: ReactDragEvent<HTMLButtonElement>, dockTabId: DockTabId) => {
    setDraggedDockTab(dockTabId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dockTabId);
  };

  const handleDockPanelDragOver = (event: ReactDragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDockPanelDrop = (event: ReactDragEvent, columnId: DockColumnId, targetIndex?: number) => {
    event.preventDefault();
    const dockTabId = getDraggedDockTab(event);
    if (!dockTabId) return;
    moveDockTabToColumn(dockTabId, columnId, targetIndex);
    setDraggedDockTab(null);
  };

  const renderSubmittedSectionIcon = (sectionId: SubmittedViewSectionId) => {
    if (sectionId === "userFeedback") return <Icon name="message-dot" size={13} />;
    if (sectionId === "slashExpansions") return <Icon name="code" size={13} />;
    if (sectionId === "userRequirement") return <Icon name="checklist" size={13} />;
    if (sectionId === "questions") return <Icon name="message" size={13} />;
    if (sectionId === "gitAction") return <Icon name="git-branch" size={13} />;
    if (sectionId === "images") return <Icon name="image" size={13} />;
    if (sectionId === "resourceLinks") return <Icon name="paperclip" size={13} />;
    if (sectionId === "testLogs") return <Icon name="file-text" size={13} />;
    if (sectionId === "commandLogs") return <Icon name="terminal" size={13} />;
    if (sectionId === "mlcReferences") return <MlcLogoIcon size={13} />;
    if (sectionId === "webPreview") return <Icon name="globe" size={13} />;
    if (sectionId === "payloadRouting") return <Icon name="arrow-right-left" size={13} />;
    if (sectionId === "system") return <Icon name="gear" size={13} />;
    return <Icon name="file" size={13} />;
  };

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className={`settings-dialog${tab === "callers" ? " settings-dialog-caller-manager" : ""}`} onClick={(e) => e.stopPropagation()}>
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
            {renderSettingsNavItem("general", "gear", t("settings.general"))}
            {renderSettingsNavItem("display", "sun", t("settings.display"))}
            {renderSettingsNavGroup("mlfb", t("settings.mlfb", "MLFB"), ["callers", "submitted", "prompts", "sessionNavigation"], (
              <>
                {renderSettingsNavItem("callers", "users", t("settings.callers"), true)}
                {renderSettingsNavItem("submitted", "checklist", t("settings.submittedFeedback", "Submitted feedback"), true)}
                {renderSettingsNavItem("prompts", "file-text", t("settings.prompts"), true)}
                {renderSettingsNavItem("sessionNavigation", "list-tree", t("settings.sessionNavigation", "Session navigation"), true)}
              </>
            ))}
            {renderSettingsNavGroup("acp", t("settings.acp", "ACP"), ["acpConsole", "openCode"], (
              <>
                {renderSettingsNavItem("acpConsole", "robot", t("settings.acpConsoleDisplay", "Navigation bar"), true)}
                {renderSettingsNavItem("openCode", "code", t("settings.openCode", "OpenCode"), true)}
              </>
            ))}
            {renderSettingsNavGroup("layout", t("settings.layout", "Layout"), ["layoutPanels", "terminal", "resources"], (
              <>
                {renderSettingsNavItem("layoutPanels", "page-sidebar", t("settings.panelManagement", "Panel management"), true)}
                {renderSettingsNavItem("terminal", "terminal", t("settings.terminal", "Terminal"), true)}
                {renderSettingsNavItem("resources", "folder", t("settings.resourceExplorer", "Resource explorer"), true)}
              </>
            ))}
            {renderSettingsNavItem("notification", "bell", t("settings.notification"))}
            {renderSettingsNavItem("about", "info", t("settings.about"))}
          </div>

          {/* Content */}
          <div className={`settings-content${tab === "acpConsole" ? " settings-content-acp" : ""}`}>
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
              </div>
            )}

            {tab === "submitted" && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.showTransferSubmitUi", "Show transfer submit")}</span>
                    <span className="settings-sublabel">{t("settings.showTransferSubmitUiDesc", "Show the transfer control beside the submit button to hand off agent_name after submitting.")}</span>
                  </div>
                  <button
                    className={`settings-toggle${showTransferSubmitUi ? " settings-toggle-on" : ""}`}
                    onClick={() => setShowTransferSubmitUi(!showTransferSubmitUi)}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-row settings-row-stacked">
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
                    {SUBMITTED_VIEW_SECTION_CONFIGS.map((section) => {
                      const sectionLabel = t(section.labelKey, section.defaultLabel);
                      const showEnglishTitle = sectionLabel !== section.defaultLabel;
                      return (
                        <div key={section.id} className="settings-submitted-section-item">
                          <span className="settings-submitted-section-name">
                            <span className="settings-list-icon-slot">{renderSubmittedSectionIcon(section.id)}</span>
                            <span className="settings-submitted-section-title-stack">
                              <span>{sectionLabel}</span>
                              {showEnglishTitle && <span className="settings-submitted-section-english">{section.defaultLabel}</span>}
                            </span>
                          </span>
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
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {tab === "sessionNavigation" && (
              <div className="settings-section">
                <div className="settings-row settings-row-stacked">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.sessionNavigationMode", "Navigation display mode")}</span>
                    <span className="settings-sublabel">{t("settings.sessionNavigationModeDesc", "Choose how sessions are shown inside each caller panel.")}</span>
                  </div>
                  <div className="cm-column-mode-group session-nav-mode-group" role="group" aria-label={t("settings.sessionNavigationMode", "Navigation display mode")}>
                    {SESSION_LIST_MODE_OPTIONS.map((option) => (
                      <button
                        key={option.mode}
                        className={`cm-column-mode-button${sessionListMode === option.mode ? " active" : ""}`}
                        title={t(option.labelKey, option.defaultLabel)}
                        aria-label={`${t("settings.sessionNavigationMode", "Navigation display mode")}: ${t(option.labelKey, option.defaultLabel)}`}
                        onClick={() => setSessionListMode(option.mode)}
                      >
                        <SessionNavigationModeIcon mode={option.mode} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.sessionNavigationAttachmentDots", "Show attachment dots in compact navigation")}</span>
                    <span className="settings-sublabel">{t("settings.sessionNavigationAttachmentDotsDesc", "Show small dots on compact session items when a session has attachments or extra submitted resources.")}</span>
                  </div>
                  <button
                    className={`settings-toggle${showSessionNavigationAttachmentDots ? " settings-toggle-on" : ""}`}
                    onClick={() => setShowSessionNavigationAttachmentDots(!showSessionNavigationAttachmentDots)}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </div>
            )}

            {tab === "layoutPanels" && (
              <div className="settings-section">
                <div className="settings-row settings-row-stacked">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.panelManagement", "Panel management")}</span>
                    <span className="settings-sublabel">{t("settings.panelManagementDesc", "Drag panel tabs into the dock columns where they should appear.")}</span>
                  </div>
                  <div className="settings-dock-board">
                    {SETTINGS_DOCK_COLUMN_IDS.map((columnId) => {
                      const columnTabIds = dockLayout.columns[columnId].tabIds.filter((dockTabId) => SETTINGS_DOCK_TAB_IDS.includes(dockTabId));
                      return (
                        <div
                          key={columnId}
                          className="settings-dock-board-column"
                          onDragOver={handleDockPanelDragOver}
                          onDrop={(event) => handleDockPanelDrop(event, columnId)}
                        >
                          <div className="settings-dock-board-head">
                            <Icon name={dockColumnIcon(columnId)} size={13} />
                            <span>{dockColumnLabel(columnId)}</span>
                            <span className="settings-dock-board-count">{columnTabIds.length}</span>
                          </div>
                          <div className="settings-dock-board-list">
                            {columnTabIds.length === 0 && (
                              <div className="settings-dock-board-empty">{t("settings.emptyDockColumn", "Empty")}</div>
                            )}
                            {columnTabIds.map((dockTabId, dockTabIndex) => (
                              <button
                                key={dockTabId}
                                type="button"
                                className={`settings-dock-board-chip${draggedDockTab === dockTabId ? " dragging" : ""}`}
                                draggable
                                onDragStart={(event) => handleDockTabDragStart(event, dockTabId)}
                                onDragEnd={() => setDraggedDockTab(null)}
                                onDragOver={(event) => {
                                  event.stopPropagation();
                                  handleDockPanelDragOver(event);
                                }}
                                onDrop={(event) => {
                                  event.stopPropagation();
                                  handleDockPanelDrop(event, columnId, dockTabIndex);
                                }}
                              >
                                {renderDockTabIcon(dockTabId)}
                                <span>{dockTabLabel(dockTabId)}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {tab === "acpConsole" && (
              <>
                {renderAcpPreview()}
                <div className="settings-section settings-acp-section">
                  <div className="settings-row settings-row-stacked">
                    <div className="settings-row">
                      <div className="settings-row-info">
                        <span className="settings-label">{t("settings.acpSmoothStreamingOutput", "Smooth streaming output")}</span>
                        <span className="settings-sublabel">{t("settings.acpSmoothStreamingOutputDesc", "Pace Agent text updates on the frontend so fast ACP chunks still appear progressively.")}</span>
                      </div>
                      <button
                        type="button"
                        className={`settings-toggle${agentConsoleSettings.smoothStreamingOutput ? " settings-toggle-on" : ""}`}
                        onClick={handleAgentSmoothStreamingToggle}
                        aria-label={t("settings.acpSmoothStreamingOutput", "Smooth streaming output")}
                        aria-pressed={agentConsoleSettings.smoothStreamingOutput}
                      >
                        <span className="settings-toggle-knob" />
                      </button>
                    </div>
                    <div className="settings-row">
                      <div className="settings-row-info">
                        <span className="settings-label">{t("settings.acpProcessStepDefaultMode", "Step process default view")}</span>
                        <span className="settings-sublabel">{t("settings.acpProcessStepDefaultModeDesc", "Choose whether new Agent process steps open in tabs or timeline view by default.")}</span>
                      </div>
                      {renderAgentProcessStepModeGroup()}
                    </div>
                    <div className="settings-row">
                      <div className="settings-row-info">
                        <span className="settings-label">{t("settings.acpMessageSpeakerLine", "Message speaker line")}</span>
                        <span className="settings-sublabel">{t("settings.acpMessageSpeakerLineDesc", "Show the avatar and speaker label above each Agent message.")}</span>
                      </div>
                      <button
                        type="button"
                        className={`settings-toggle${agentConsoleSettings.showMessageSpeakerLine ? " settings-toggle-on" : ""}`}
                        onClick={handleAgentMessageSpeakerToggle}
                        aria-label={t("settings.acpMessageSpeakerLine", "Message speaker line")}
                        aria-pressed={agentConsoleSettings.showMessageSpeakerLine}
                      >
                        <span className="settings-toggle-knob" />
                      </button>
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-label">{t("settings.acpTopbarIndicators", "Topbar indicators")}</span>
                      <span className="settings-sublabel">{t("settings.acpTopbarIndicatorsDesc", "Configure how Agent Console diff and context indicators appear in the topbar.")}</span>
                    </div>
                    <div className="settings-acp-indicator-list">
                      <div className="settings-acp-indicator-row">
                        <span className="settings-acp-indicator-label">{t("settings.acpDiffIndicator", "Diff indicator")}</span>
                        {renderAgentIndicatorModeGroup("diffIndicatorMode", agentConsoleSettings.diffIndicatorMode, t("settings.acpDiffIndicator", "Diff indicator"))}
                      </div>
                      <div className="settings-acp-indicator-row">
                        <span className="settings-acp-indicator-label">{t("settings.acpContextIndicator", "Context indicator")}</span>
                        {renderAgentIndicatorModeGroup("contextIndicatorMode", agentConsoleSettings.contextIndicatorMode, t("settings.acpContextIndicator", "Context indicator"))}
                      </div>
                    </div>
                    <div className="settings-acp-visual-group">
                      <div className="settings-row-info">
                        <span className="settings-label">{t("settings.acpDiffVisualAdjustment", "Diff visual adjustment")}</span>
                        <span className="settings-sublabel">{t("settings.acpDiffVisualAdjustmentDesc", "Tune diff colors and compact topbar text position.")}</span>
                      </div>
                      <div className="settings-acp-color-presets" role="group" aria-label={t("settings.acpDiffColorPreset", "Diff color preset")}>
                        {AGENT_DIFF_COLOR_PRESETS.map((preset) => {
                          const label = t(preset.labelKey, preset.defaultLabel);
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              className={`settings-acp-color-preset${agentConsoleSettings.diffVisual.colorPresetId === preset.id ? " active" : ""}`}
                              title={label}
                              aria-label={`${t("settings.acpDiffColorPreset", "Diff color preset")}: ${label}`}
                              onClick={() => handleAgentDiffColorPresetChange(preset.id)}
                            >
                              <span style={{ background: preset.additions }} />
                              <span style={{ background: preset.deletions }} />
                            </button>
                          );
                        })}
                      </div>
                      <div className="settings-acp-offset-panel">
                        <button
                          type="button"
                          className="settings-acp-offset-toggle"
                          onClick={() => setDiffOffsetCollapsed((value) => !value)}
                          aria-expanded={!diffOffsetCollapsed}
                        >
                          <Icon name={diffOffsetCollapsed ? "chevron-right" : "chevron-down"} size={13} />
                          <span>{t("settings.acpDiffTextOffsetAdvanced", "Text offset fine tuning")}</span>
                        </button>
                        {!diffOffsetCollapsed && (
                          <div className="settings-acp-offset-list">
                            <div className="settings-acp-offset-title">{t("settings.acpDiffAddTextOffset", "Addition text offset")}</div>
                            {renderAgentDiffOffsetControl(t("settings.acpDiffTextOffsetX", "Horizontal offset"), "additionsOffsetX")}
                            {renderAgentDiffOffsetControl(t("settings.acpDiffTextOffsetY", "Vertical offset"), "additionsOffsetY")}
                            <div className="settings-acp-offset-title">{t("settings.acpDiffDeleteTextOffset", "Deletion text offset")}</div>
                            {renderAgentDiffOffsetControl(t("settings.acpDiffTextOffsetX", "Horizontal offset"), "deletionsOffsetX")}
                            {renderAgentDiffOffsetControl(t("settings.acpDiffTextOffsetY", "Vertical offset"), "deletionsOffsetY")}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {tab === "openCode" && renderOpenCodeModelLibrary()}

            {tab === "resources" && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-row-info" style={{ flex: 1 }}>
                    <span className="settings-label">{t("settings.resourceIconTheme", "Resource icon theme")}</span>
                    <span className="settings-sublabel">{t("settings.resourceIconThemeDesc", "Choose the file icon theme used by project resources and resource links.")}</span>
                  </div>
                  <div className="settings-btn-group">
                    <button
                      className={`settings-btn-option${resourceIconTheme === "default" ? " active" : ""}`}
                      onClick={() => setResourceIconTheme("default")}
                    >
                      <Icon name="file-text" size={12} />
                      {t("settings.resourceIconThemeDefault", "Default")}
                    </button>
                    <button
                      className={`settings-btn-option${resourceIconTheme === "catppuccin" ? " active" : ""}`}
                      onClick={() => setResourceIconTheme("catppuccin")}
                    >
                      <Icon name="folder" size={12} />
                      {t("settings.resourceIconThemeCatppuccin", "Catppuccin")}
                    </button>
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

            {tab === "terminal" && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.terminalDefaultShell", "Default shell")}</span>
                    <span className="settings-sublabel">{t("settings.terminalDefaultShellDesc", "Used when creating or restarting terminal tabs.")}</span>
                  </div>
                  <AppSelect
                    value={terminalSettings.defaultShell}
                    options={[
                      { value: "auto", label: t("settings.terminalShellAuto", "Auto"), description: t("settings.terminalShellAutoDesc", "Try Command Prompt, PowerShell 7, then Windows PowerShell."), icon: "terminal" },
                      { value: "pwsh", label: t("settings.terminalShellPwsh", "PowerShell 7"), description: "pwsh.exe", icon: "terminal" },
                      { value: "powershell", label: t("settings.terminalShellWindowsPowerShell", "Windows PowerShell"), description: "powershell.exe", icon: "terminal" },
                      { value: "cmd", label: t("settings.terminalShellCmd", "Command Prompt"), description: t("settings.terminalShellCmdDesc", "Default: cmd.exe"), icon: "terminal" },
                      { value: "git-bash", label: t("settings.terminalShellGitBash", "Git Bash"), description: t("settings.terminalShellGitBashDesc", "Uses common Git for Windows install paths or bash.exe."), icon: "terminal" },
                      { value: "wsl", label: t("settings.terminalShellWsl", "WSL Bash"), description: "wsl.exe", icon: "terminal" },
                    ] satisfies Array<AppSelectOption<TerminalShellId>>}
                    onChange={handleTerminalShellChange}
                    ariaLabel={t("settings.terminalDefaultShell", "Default shell")}
                    className="settings-select-control"
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.terminalMiddleClickClose", "Close terminal tabs with middle click")}</span>
                    <span className="settings-sublabel">{t("settings.terminalMiddleClickCloseDesc", "Middle-clicking a terminal tab kills its PTY session and removes the tab.")}</span>
                  </div>
                  <button
                    className={`settings-toggle${terminalSettings.middleClickClosesTab ? " settings-toggle-on" : ""}`}
                    onClick={() => handleTerminalToggle("middleClickClosesTab")}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </div>
            )}

            {tab === "prompts" && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.commandSearchIncludesDescription", "Command shortcut matching includes descriptions")}</span>
                    <span className="settings-sublabel">{t("settings.commandSearchIncludesDescriptionDesc", "When enabled, slash command suggestions can match description text after id and name matches.")}</span>
                  </div>
                  <button
                    className={`settings-toggle${composerSettings.commandSearchIncludesDescription ? " settings-toggle-on" : ""}`}
                    onClick={() => handleComposerToggle("commandSearchIncludesDescription")}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.showPromptButtons", "Show prompt buttons")}</span>
                    <span className="settings-sublabel">{t("settings.showPromptButtonsDesc", "Display legacy prompt buttons below the composer. Clicking one inserts its slash command at the start of the feedback text.")}</span>
                  </div>
                  <button
                    className={`settings-toggle${showPromptButtons ? " settings-toggle-on" : ""}`}
                    onClick={() => setShowPromptButtons(!showPromptButtons)}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                {prompts.length === 0 ? (
                  <div className="settings-prompt-empty">
                    {t("settings.promptsEmpty")}
                  </div>
                ) : (
                  <div className="settings-prompt-list">
                    <div className="settings-prompt-head">
                      <span>{t("settings.promptListCommand", "Command")}</span>
                      <span>{t("settings.promptListEnabled", "Enabled")}</span>
                    </div>
                    {prompts.map((p) => {
                      const enabled = !disabledPrompts.includes(p.name);
                      return (
                        <div key={p.name} className="settings-prompt-item">
                          <div className="settings-prompt-info">
                            <span className="settings-list-icon-slot">
                              {p.icon && <PromptIcon name={p.icon} size={14} />}
                            </span>
                            <span className="settings-prompt-title-stack">
                              <span className="settings-prompt-name">{p.name}</span>
                              {p.description && (
                                <span className="settings-prompt-desc">{p.description}</span>
                              )}
                            </span>
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
                  <div className="settings-about-version">v{__APP_VERSION__}</div>
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
