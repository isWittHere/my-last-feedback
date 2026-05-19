import { Fragment, useState, useEffect, useCallback, useMemo, type DragEvent as ReactDragEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { getAgentSessionSettings, saveAgentSessionSettings, type AgentSessionSettings, type NewSessionWorkspacePathMode } from "../agentSessionSettings";
import { useFeedbackStore, type DockColumnId, type DockTabId } from "../store/feedbackStore";
import { useAgentStore } from "../store/agentStore";
import { PromptIcon } from "./PromptIcons";
import { McpConfigHelper } from "./McpConfigHelper";
import { CallerManager } from "./CallerManager";
import { Icon, MlcLogoIcon } from "./Icons";
import { createMockAgentSession } from "../agent/mockData";
import { AgentSessionHeader } from "./agent/AgentSessionHeader";
import { invoke } from "@tauri-apps/api/core";
import { formatAutostartError, getAutostart, setAutostartEnabled } from "../autostartSettings";
import { applyTheme, getStoredTheme, type Theme } from "../theme";
import { getNotificationSettings, saveNotificationSettings, syncAutoFocusNewRequest, type NotificationSettings } from "../notificationSettings";
import { getSubmittedViewSettings, saveSubmittedViewSettings, SUBMITTED_VIEW_SECTION_CONFIGS, type SubmittedViewSectionId, type SubmittedViewSettings } from "../submittedViewSettings";
import { getTerminalSettings, saveTerminalSettings, type TerminalSettings, type TerminalShellId } from "../terminalSettings";
import { getComposerSettings, saveComposerSettings, type ComposerSettings } from "../composerSettings";
import { formatGitFolderBlacklistText, getGitOperationSettings, GIT_TIMED_REMINDER_MAX_MINUTES, GIT_TIMED_REMINDER_MIN_MINUTES, GIT_TIMED_REMINDER_STEP_MINUTES, parseGitFolderBlacklistText, saveGitOperationSettings, type GitOperationSettings } from "../gitOperationSettings";
import { AGENT_DIFF_COLOR_PRESETS, getAgentConsoleSettings, saveAgentConsoleSettings, type AgentApprovalDisplayMode, type AgentConsoleSettings, type AgentDiffColorPresetId, type AgentNavigationGroupBackgroundMode, type AgentNavigationIndicatorOrder, type AgentNavigationVisualizationMode, type AgentProcessStepDefaultMode, type AgentTaskPanelTemplateStyle, type AgentTimelineStreamingStepMode, type AgentTodoUpdateDisplayMode, type AgentTopbarIndicatorMode } from "../agentConsoleSettings";
import { getOpenCodePermissionPresetAction, getOpenCodePermissionPresetId, getOpenCodeSettings, OPEN_CODE_PERMISSION_DEFINITIONS, OPEN_CODE_PERMISSION_PRESETS, setOpenCodeDefaultPermissionAction, setOpenCodeDefaultPermissionPreset, setOpenCodeModelEnabled, setOpenCodePreferredModel, type OpenCodePermissionPresetId, type OpenCodePermissionSettingAction, type OpenCodeSettings } from "../openCodeSettings";
import { SESSION_LIST_MODE_OPTIONS } from "../sessionNavigationSettings";
import { normalizeWorkspacePath } from "../workspace/workspacePaths";
import { SessionNavigationModeIcon } from "./SessionNavigationModeIcon";
import { AppSelect, type AppSelectOption } from "./AppSelect";
import { SettingsSegmentedControl } from "./SettingsSegmentedControl";
import { isAgentUiDisabled } from "../agent/agentUiFlags";

type Tab = "general" | "display" | "callers" | "submitted" | "prompts" | "sessionNavigation" | "gitOperations" | "layoutPanels" | "agentConsole" | "agentStepDisplay" | "agentChat" | "agentSessionManager" | "openCode" | "openCodePermissions" | "terminal" | "resources" | "markdownPreview" | "notification" | "about";
type SettingsGroupId = "mlfb" | "agent" | "layout";

function renderStickyUserMessageText(text: string, mergeLines: boolean): ReactNode {
  if (mergeLines) return text.replace(/\s*(?:\r\n|\n|\r)\s*/g, " ").trim();
  return text.split(/\r\n|\n|\r/).map((line, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {line}
    </Fragment>
  ));
}

const SETTINGS_DOCK_COLUMN_IDS: DockColumnId[] = ["leftSidebar", "leftPage", "rightPage", "rightSidebar"];
const SETTINGS_DOCK_TAB_IDS: DockTabId[] = isAgentUiDisabled
  ? ["mlc", "mlcPreview", "resources", "previewBrowser", "previewInfo", "terminal", "git"]
  : ["mlc", "mlcPreview", "resources", "previewBrowser", "previewInfo", "agentConsole", "agentSessions", "terminal", "git"];
const AGENT_TOPBAR_INDICATOR_MODE_OPTIONS: AgentTopbarIndicatorMode[] = ["hidden", "text", "textAndGraphic"];
const AGENT_PROCESS_STEP_MODE_OPTIONS: AgentProcessStepDefaultMode[] = ["tabs", "timeline"];
const AGENT_TIMELINE_STREAMING_STEP_MODE_OPTIONS: AgentTimelineStreamingStepMode[] = ["hidden", "collapseHistory", "expandAll"];
const AGENT_TODO_UPDATE_DISPLAY_MODE_OPTIONS: AgentTodoUpdateDisplayMode[] = ["countOnly", "panel"];
const AGENT_TASK_PANEL_TEMPLATE_STYLE_OPTIONS: AgentTaskPanelTemplateStyle[] = ["list", "tags"];
const AGENT_APPROVAL_DISPLAY_MODE_OPTIONS: AgentApprovalDisplayMode[] = ["step", "statusPanel", "all"];
const AGENT_NAVIGATION_VISUALIZATION_MODE_OPTIONS: AgentNavigationVisualizationMode[] = ["bars", "lineArea"];
const AGENT_NAVIGATION_INDICATOR_ORDER_OPTIONS: AgentNavigationIndicatorOrder[] = ["leftToRight", "rightToLeft"];
const AGENT_NAVIGATION_GROUP_BACKGROUND_MODE_OPTIONS: AgentNavigationGroupBackgroundMode[] = ["hidden", "hover", "alternate"];
const OPEN_CODE_PERMISSION_ACTIONS: OpenCodePermissionSettingAction[] = ["allow", "ask", "deny"];
const OPEN_CODE_BASH_PERMISSION_ACTIONS: OpenCodePermissionSettingAction[] = ["override", "allow", "ask", "deny"];

function openCodePermissionPresetVariant(presetId: OpenCodePermissionPresetId): OpenCodePermissionSettingAction | undefined {
  if (presetId === "default") return "ask";
  if (presetId === "controlledAuto") return "allow";
  if (presetId === "overrideAuto") return "override";
}

type OpenCodeModelItem = OpenCodeSettings["models"][number];

function openCodeModelProviderId(modelId: string): string {
  const [provider] = modelId.split("/");
  return provider || "other";
}

function openCodeProviderLabel(providerId: string): string {
  if (!providerId || providerId === "other") return "Other";
  return providerId.charAt(0).toUpperCase() + providerId.slice(1);
}

function openCodeModelFamily(model: OpenCodeModelItem): { id: string; label: string } {
  const rawModelId = model.id.split("/").slice(1).join("/") || model.id;
  const source = `${model.label} ${rawModelId}`.toLowerCase();
  if (/(^|[-:_/\s])free($|[-:_/\s])|:free|free[-_\s]?tier/.test(source)) return { id: "free", label: "Free" };
  const normalized = source.replace(/[_/.:]+/g, "-").replace(/\s+/g, "-");
  const familyRules: Array<[RegExp, string, string]> = [
    [/claude/, "claude", "Claude"],
    [/\bgpt-5\b/, "gpt-5", "GPT 5"],
    [/\bgpt-4\.1\b|\bgpt-4-1\b/, "gpt-4-1", "GPT 4.1"],
    [/\bgpt-4o\b|\bgpt-4-o\b/, "gpt-4o", "GPT 4o"],
    [/\bgpt-4\b/, "gpt-4", "GPT 4"],
    [/\bo[1-9]\b|\bo[1-9]-/, "openai-o", "OpenAI o-series"],
    [/gemini-2-5|gemini-2\.5/, "gemini-2-5", "Gemini 2.5"],
    [/gemini-2-0|gemini-2\.0/, "gemini-2-0", "Gemini 2.0"],
    [/gemini/, "gemini", "Gemini"],
    [/deepseek/, "deepseek", "DeepSeek"],
    [/qwen|qwq/, "qwen", "Qwen"],
    [/llama/, "llama", "Llama"],
    [/mistral/, "mistral", "Mistral"],
    [/mixtral/, "mixtral", "Mixtral"],
    [/codestral/, "codestral", "Codestral"],
    [/kimi|moonshot/, "kimi", "Kimi"],
    [/grok/, "grok", "Grok"],
    [/command/, "command", "Command"],
    [/phi/, "phi", "Phi"],
  ];
  const matchedRule = familyRules.find(([pattern]) => pattern.test(normalized));
  if (matchedRule) return { id: matchedRule[1], label: matchedRule[2] };
  const fallback = rawModelId.split(/[\s:._/-]+/).filter(Boolean)[0] || model.label.split(/\s+/).filter(Boolean)[0] || "Other";
  return { id: fallback.toLowerCase(), label: fallback.charAt(0).toUpperCase() + fallback.slice(1) };
}

function groupOpenCodeModelsByFamily(models: OpenCodeModelItem[]) {
  const groups = new Map<string, { label: string; models: OpenCodeModelItem[] }>();
  for (const model of models) {
    const family = openCodeModelFamily(model);
    const current = groups.get(family.id) || { label: family.label, models: [] };
    groups.set(family.id, { ...current, models: [...current.models, model] });
  }
  return [...groups.entries()].map(([familyId, group]) => ({
    familyId,
    label: group.label,
    models: group.models,
    enabledCount: group.models.filter((model) => model.enabled).length,
  })).sort((a, b) => Number(b.familyId === "free") - Number(a.familyId === "free"));
}

function groupOpenCodeModelsByProvider(models: OpenCodeModelItem[]) {
  const groups = new Map<string, OpenCodeModelItem[]>();
  for (const model of models) {
    const providerId = openCodeModelProviderId(model.id);
    groups.set(providerId, [...(groups.get(providerId) || []), model]);
  }
  return [...groups.entries()].map(([providerId, groupModels]) => ({
    providerId,
    label: openCodeProviderLabel(providerId),
    models: groupModels,
    enabledCount: groupModels.filter((model) => model.enabled).length,
    families: groupOpenCodeModelsByFamily(groupModels),
  }));
}

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
  const [collapsedGroups, setCollapsedGroups] = useState<Record<SettingsGroupId, boolean>>({ mlfb: false, agent: false, layout: false });
  const [draggedDockTab, setDraggedDockTab] = useState<DockTabId | null>(null);
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [autostart, setAutostart] = useState(false);
  const [autostartMessage, setAutostartMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [diffOffsetCollapsed, setDiffOffsetCollapsed] = useState(true);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(getNotificationSettings);
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettings>(getTerminalSettings);
  const [composerSettings, setComposerSettings] = useState<ComposerSettings>(getComposerSettings);
  const [gitOperationSettings, setGitOperationSettings] = useState<GitOperationSettings>(getGitOperationSettings);
  const [agentConsoleSettings, setAgentConsoleSettings] = useState<AgentConsoleSettings>(getAgentConsoleSettings);
  const [agentSessionSettings, setAgentSessionSettings] = useState<AgentSessionSettings>(getAgentSessionSettings);
  const [openCodeSettings, setOpenCodeSettings] = useState<OpenCodeSettings>(getOpenCodeSettings);
  const [openCodeModelQuery, setOpenCodeModelQuery] = useState("");
  const [agentCleanupMessage, setAgentCleanupMessage] = useState<string | null>(null);
  const [zoomSettings, setZoomSettings] = useState<ZoomSettings>(getZoomSettings);

  useEffect(() => {
    if (!isAgentUiDisabled) return;
    if (tab === "agentConsole" || tab === "agentStepDisplay" || tab === "agentChat" || tab === "agentSessionManager" || tab === "openCode" || tab === "openCodePermissions") {
      setTab("general");
    }
  }, [tab]);
  const [submittedViewSettings, setSubmittedViewSettings] = useState<SubmittedViewSettings>(getSubmittedViewSettings);
  const gitReminderIntervalLabel = useMemo(() => {
    const minutes = gitOperationSettings.timedReminderIntervalMinutes;
    if (minutes < 60) return t("settings.gitTimedReminderIntervalMinutesValue", "{{count}} min", { count: minutes });
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (remainder === 0) return t("settings.gitTimedReminderIntervalHoursValue", "{{count}} h", { count: hours });
    return t("settings.gitTimedReminderIntervalHoursMinutesValue", "{{hours}} h {{minutes}} min", { hours, minutes: remainder });
  }, [gitOperationSettings.timedReminderIntervalMinutes, t]);
  const agentPreviewSession = useMemo(() => {
    const session = createMockAgentSession();
    const latestDiagnostic = session.diagnostics[session.diagnostics.length - 1];
    return {
      ...session,
      diagnostics: latestDiagnostic ? [
        {
          ...latestDiagnostic,
          message: t("settings.agentPreviewDiagnosticMessage", "Session created: ses_preview_openCode_http_stream. This notification wraps across lines and scrolls when the message is longer than the available header space."),
        },
      ] : [],
    };
  }, [t]);
  const prompts = useFeedbackStore((s) => s.prompts);
  const disabledPrompts = useFeedbackStore((s) => s.disabledPrompts);
  const showPromptButtons = useFeedbackStore((s) => s.showPromptButtons);
  const showTransferSubmitUi = useFeedbackStore((s) => s.showTransferSubmitUi);
  const resourceIconTheme = useFeedbackStore((s) => s.resourceIconTheme);
  const mlcPreviewShowYaml = useFeedbackStore((s) => s.mlcPreviewShowYaml);
  const sessionListMode = useFeedbackStore((s) => s.sessionListMode);
  const showSessionNavigationAttachmentDots = useFeedbackStore((s) => s.showSessionNavigationAttachmentDots);
  const useSessionNavigationColorCards = useFeedbackStore((s) => s.useSessionNavigationColorCards);
  const dockLayout = useFeedbackStore((s) => s.dockLayout);
  const setShowPromptButtons = useFeedbackStore((s) => s.setShowPromptButtons);
  const setShowTransferSubmitUi = useFeedbackStore((s) => s.setShowTransferSubmitUi);
  const setResourceIconTheme = useFeedbackStore((s) => s.setResourceIconTheme);
  const setMlcPreviewShowYaml = useFeedbackStore((s) => s.setMlcPreviewShowYaml);
  const setSessionListMode = useFeedbackStore((s) => s.setSessionListMode);
  const setShowSessionNavigationAttachmentDots = useFeedbackStore((s) => s.setShowSessionNavigationAttachmentDots);
  const setUseSessionNavigationColorCards = useFeedbackStore((s) => s.setUseSessionNavigationColorCards);
  const togglePromptDisabled = useFeedbackStore((s) => s.togglePromptDisabled);
  const moveDockTabToColumn = useFeedbackStore((s) => s.moveDockTabToColumn);
  const cleanupEmptyAgentSessions = useAgentStore((s) => s.cleanupEmptySessions);

  // Load autostart state
  useEffect(() => {
    if (!open) return;
    setTheme(getStoredTheme());
    setNotifSettings(getNotificationSettings());
    setTerminalSettings(getTerminalSettings());
    setComposerSettings(getComposerSettings());
    setGitOperationSettings(getGitOperationSettings());
    setAgentConsoleSettings(getAgentConsoleSettings());
    setAgentSessionSettings(getAgentSessionSettings());
    setAgentCleanupMessage(null);
    setAutostartMessage(null);
    setOpenCodeSettings(getOpenCodeSettings());
    setSubmittedViewSettings(getSubmittedViewSettings());
    getAutostart().then(setAutostart).catch(() => {});
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
    setAutostartMessage(null);
    setAutostartEnabled(newVal)
      .then(() => setAutostart(newVal))
      .catch((error) => setAutostartMessage(formatAutostartError(t, error)));
  }, [autostart, t]);

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

  const handleAgentCollapseOutputBlankLinesToggle = useCallback(() => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, collapseConsecutiveOutputBlankLines: !prev.collapseConsecutiveOutputBlankLines };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentMergeThinkingToolStepsToggle = useCallback(() => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, mergeThinkingToolSteps: !prev.mergeThinkingToolSteps };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentCollapseEditApprovalDiffToggle = useCallback(() => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, collapseEditApprovalDiffByDefault: !prev.collapseEditApprovalDiffByDefault };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentAutoCleanupToggle = useCallback(() => {
    let shouldCleanup = false;
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, autoCleanupEmptySessions: !prev.autoCleanupEmptySessions };
      saveAgentConsoleSettings(next);
      shouldCleanup = next.autoCleanupEmptySessions;
      return next;
    });
    if (shouldCleanup) {
      setAgentCleanupMessage(t("settings.agentSessionCleanupRunning", "Cleaning empty sessions..."));
      void cleanupEmptyAgentSessions()
        .then((removedCount) => setAgentCleanupMessage(t("settings.agentSessionCleanupDone", "Cleaned {{count}} empty sessions", { count: removedCount })))
        .catch((error) => setAgentCleanupMessage(error instanceof Error ? error.message : String(error)));
    }
  }, [cleanupEmptyAgentSessions, t]);

  const updateAgentSessionSettings = useCallback((updater: (current: AgentSessionSettings) => AgentSessionSettings) => {
    setAgentSessionSettings((current) => saveAgentSessionSettings(updater(current)));
  }, []);

  const handleNewSessionWorkspacePathModeChange = useCallback((newSessionWorkspacePathMode: NewSessionWorkspacePathMode) => {
    updateAgentSessionSettings((current) => ({ ...current, newSessionWorkspacePathMode }));
  }, [updateAgentSessionSettings]);

  const handleDefaultWorkspacePathChange = useCallback((defaultWorkspacePath: string) => {
    updateAgentSessionSettings((current) => ({ ...current, defaultWorkspacePath }));
  }, [updateAgentSessionSettings]);

  const handleChooseDefaultWorkspacePath = useCallback(async () => {
    try {
      const selectedPath = await invoke<string | null>("select_directory", {
        title: t("settings.agentDefaultWorkspacePathChoose", "Choose default workspace folder"),
        initialDirectory: normalizeWorkspacePath(agentSessionSettings.defaultWorkspacePath) || null,
      });
      if (typeof selectedPath === "string" && selectedPath.trim()) handleDefaultWorkspacePathChange(selectedPath);
    } catch {}
  }, [agentSessionSettings.defaultWorkspacePath, handleDefaultWorkspacePathChange, t]);

  const handleAgentCleanupNow = useCallback(() => {
    setAgentCleanupMessage(t("settings.agentSessionCleanupRunning", "Cleaning empty sessions..."));
    void cleanupEmptyAgentSessions()
      .then((removedCount) => setAgentCleanupMessage(t("settings.agentSessionCleanupDone", "Cleaned {{count}} empty sessions", { count: removedCount })))
      .catch((error) => setAgentCleanupMessage(error instanceof Error ? error.message : String(error)));
  }, [cleanupEmptyAgentSessions, t]);

  const handleAgentMessageSpeakerToggle = useCallback(() => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, showMessageSpeakerLine: !prev.showMessageSpeakerLine };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentHeaderDefaultExpandToggle = useCallback(() => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, defaultExpandHeaderDetails: !prev.defaultExpandHeaderDetails };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentStickyUserMessageBarToggle = useCallback(() => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, showStickyUserMessageBar: !prev.showStickyUserMessageBar };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentStickyUserMergeLinesToggle = useCallback(() => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, mergeStickyUserMessageLines: !prev.mergeStickyUserMessageLines };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentNavigationIndicatorOrderChange = useCallback((navigationIndicatorOrder: AgentNavigationIndicatorOrder) => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, navigationIndicatorOrder };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentNavigationVisualizationModeChange = useCallback((navigationVisualizationMode: AgentNavigationVisualizationMode) => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, navigationVisualizationMode };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentNavigationGroupBackgroundModeChange = useCallback((navigationGroupBackgroundMode: AgentNavigationGroupBackgroundMode) => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, navigationGroupBackgroundMode };
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

  const handleAgentProcessStepModeSwitchingToggle = useCallback(() => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, allowProcessStepModeSwitching: !prev.allowProcessStepModeSwitching };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentTimelineStreamingStepModeChange = useCallback((timelineStreamingStepMode: AgentTimelineStreamingStepMode) => {
    setAgentConsoleSettings((prev) => {
      const next: AgentConsoleSettings = {
        ...prev,
        timelineStreamingStepMode,
        approvalDisplayMode: timelineStreamingStepMode === "hidden" && prev.approvalDisplayMode === "step" ? "all" : prev.approvalDisplayMode,
      };
      saveAgentConsoleSettings(next);
      return getAgentConsoleSettings();
    });
  }, []);

  const handleAgentTodoUpdateDisplayModeChange = useCallback((todoUpdateDisplayMode: AgentTodoUpdateDisplayMode) => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, todoUpdateDisplayMode };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentTaskPanelTemplateStyleChange = useCallback((taskPanelTemplateStyle: AgentTaskPanelTemplateStyle) => {
    setAgentConsoleSettings((prev) => {
      const next = { ...prev, taskPanelTemplateStyle };
      saveAgentConsoleSettings(next);
      return next;
    });
  }, []);

  const handleAgentApprovalDisplayModeChange = useCallback((approvalDisplayMode: AgentApprovalDisplayMode) => {
    setAgentConsoleSettings((prev) => {
      const stepOnlyDisabled = prev.processStepDefaultMode === "timeline" && prev.timelineStreamingStepMode === "hidden";
      const next = {
        ...prev,
        approvalDisplayMode: stepOnlyDisabled && approvalDisplayMode === "step" ? "all" : approvalDisplayMode,
      };
      saveAgentConsoleSettings(next);
      return getAgentConsoleSettings();
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

  const handleOpenCodePreferredModelChange = useCallback((modelId: string) => {
    setOpenCodeSettings(setOpenCodePreferredModel(modelId));
  }, []);

  const handleOpenCodePermissionActionChange = useCallback((permission: string, action: OpenCodePermissionSettingAction) => {
    setOpenCodeSettings(setOpenCodeDefaultPermissionAction(permission, action));
  }, []);

  const handleOpenCodePermissionPresetChange = useCallback((presetId: OpenCodePermissionPresetId) => {
    setOpenCodeSettings(setOpenCodeDefaultPermissionPreset(presetId));
  }, []);

  const filteredOpenCodeModels = useMemo(() => {
    const query = openCodeModelQuery.trim().toLowerCase();
    const models = query
      ? openCodeSettings.models.filter((model) => `${model.label} ${model.id} ${model.description || ""}`.toLowerCase().includes(query))
      : openCodeSettings.models;
    return models;
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

  const updateGitOperationSettings = useCallback((updater: (current: GitOperationSettings) => GitOperationSettings) => {
    setGitOperationSettings((current) => saveGitOperationSettings(updater(current)));
  }, []);

  const handleGitReminderEnabledToggle = useCallback(() => {
    updateGitOperationSettings((current) => ({ ...current, timedReminderEnabled: !current.timedReminderEnabled }));
  }, [updateGitOperationSettings]);

  const handleGitReminderIntervalChange = useCallback((value: number) => {
    updateGitOperationSettings((current) => ({ ...current, timedReminderIntervalMinutes: value }));
  }, [updateGitOperationSettings]);

  const handleGitReminderThemeToggle = useCallback(() => {
    updateGitOperationSettings((current) => ({ ...current, timedReminderTheme: current.timedReminderTheme === "caller" ? "amber" : "caller" }));
  }, [updateGitOperationSettings]);

  const handleGitFolderBlacklistChange = useCallback((value: string) => {
    updateGitOperationSettings((current) => ({ ...current, folderBlacklist: parseGitFolderBlacklistText(value) }));
  }, [updateGitOperationSettings]);

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
    if (mode === "hidden") return t("settings.agentIndicatorHidden", "Hidden");
    if (mode === "text") return t("settings.agentIndicatorText", "Text only");
    return t("settings.agentIndicatorTextAndGraphic", "Text and graphic");
  };

  const renderAgentIndicatorModeGroup = (key: keyof AgentConsoleSettings, currentMode: AgentTopbarIndicatorMode, ariaLabel: string) => (
    <SettingsSegmentedControl
      ariaLabel={ariaLabel}
      value={currentMode}
      onChange={(mode) => handleAgentIndicatorModeChange(key, mode as AgentTopbarIndicatorMode)}
      options={AGENT_TOPBAR_INDICATOR_MODE_OPTIONS.map((mode) => {
        const label = agentIndicatorModeLabel(mode);
        return { id: mode, label, icon: <AgentTopbarIndicatorModeIcon mode={mode} />, ariaLabel: `${ariaLabel}: ${label}` };
      })}
    />
  );

  const processStepModeLabel = (mode: AgentProcessStepDefaultMode) => mode === "tabs"
    ? t("settings.agentProcessStepModeTabs", "Tabs")
    : t("settings.agentProcessStepModeTimeline", "Timeline");

  const renderAgentProcessStepModeGroup = () => (
    <SettingsSegmentedControl
      ariaLabel={t("settings.agentProcessStepDefaultMode", "Step process default view")}
      value={agentConsoleSettings.processStepDefaultMode}
      onChange={(mode) => handleAgentProcessStepModeChange(mode as AgentProcessStepDefaultMode)}
      options={AGENT_PROCESS_STEP_MODE_OPTIONS.map((mode) => {
        const label = processStepModeLabel(mode);
        return { id: mode, label, icon: <Icon name={mode === "tabs" ? "rows" : "list"} size={13} /> };
      })}
    />
  );

  const timelineStreamingStepModeLabel = (mode: AgentTimelineStreamingStepMode) => {
    if (mode === "hidden") return t("settings.agentTimelineStreamingStepHidden", "Hidden");
    if (mode === "expandAll") return t("settings.agentTimelineStreamingStepExpandAll", "Expand all");
    return t("settings.agentTimelineStreamingStepCollapseHistory", "Collapse history");
  };

  const renderAgentTimelineStreamingStepModeGroup = () => (
    <SettingsSegmentedControl
      ariaLabel={t("settings.agentTimelineStreamingStepMode", "Streaming step default style")}
      value={agentConsoleSettings.timelineStreamingStepMode}
      onChange={(mode) => handleAgentTimelineStreamingStepModeChange(mode as AgentTimelineStreamingStepMode)}
      options={AGENT_TIMELINE_STREAMING_STEP_MODE_OPTIONS.map((mode) => {
        const label = timelineStreamingStepModeLabel(mode);
        return { id: mode, label, icon: <Icon name={mode === "hidden" ? "eye-off" : mode === "expandAll" ? "rows" : "list"} size={13} /> };
      })}
    />
  );

  const todoUpdateDisplayModeLabel = (mode: AgentTodoUpdateDisplayMode) => mode === "countOnly"
    ? t("settings.agentTodoUpdateCountOnly", "Count only")
    : t("settings.agentTodoUpdatePanel", "Panel");

  const renderAgentTodoUpdateDisplayModeGroup = () => (
    <SettingsSegmentedControl
      ariaLabel={t("settings.agentTodoUpdateDisplayMode", "Todo update style")}
      value={agentConsoleSettings.todoUpdateDisplayMode}
      onChange={(mode) => handleAgentTodoUpdateDisplayModeChange(mode as AgentTodoUpdateDisplayMode)}
      options={AGENT_TODO_UPDATE_DISPLAY_MODE_OPTIONS.map((mode) => {
        const label = todoUpdateDisplayModeLabel(mode);
        return { id: mode, label, icon: <Icon name={mode === "countOnly" ? "list" : "checklist"} size={13} /> };
      })}
    />
  );

  const taskPanelTemplateStyleLabel = (style: AgentTaskPanelTemplateStyle) => style === "tags"
    ? t("settings.agentTaskPanelTemplateTags", "Tags")
    : t("settings.agentTaskPanelTemplateList", "List");

  const renderAgentTaskPanelTemplateStyleGroup = () => (
    <SettingsSegmentedControl
      ariaLabel={t("settings.agentTaskPanelTemplateStyle", "Task management panel style")}
      value={agentConsoleSettings.taskPanelTemplateStyle}
      onChange={(style) => handleAgentTaskPanelTemplateStyleChange(style as AgentTaskPanelTemplateStyle)}
      options={AGENT_TASK_PANEL_TEMPLATE_STYLE_OPTIONS.map((style) => {
        const label = taskPanelTemplateStyleLabel(style);
        return { id: style, label, icon: <Icon name={style === "tags" ? "rows" : "list"} size={13} /> };
      })}
    />
  );

  const approvalDisplayModeLabel = (mode: AgentApprovalDisplayMode) => {
    if (mode === "step") return t("settings.agentApprovalDisplayStep", "In step");
    if (mode === "statusPanel") return t("settings.agentApprovalDisplayStatusPanel", "Permission panel");
    return t("settings.agentApprovalDisplayAll", "All");
  };

  const renderAgentApprovalDisplayModeGroup = () => (
    <SettingsSegmentedControl
      ariaLabel={t("settings.agentApprovalDisplayMode", "Approval handling style")}
      value={agentConsoleSettings.approvalDisplayMode}
      onChange={(mode) => handleAgentApprovalDisplayModeChange(mode as AgentApprovalDisplayMode)}
      options={AGENT_APPROVAL_DISPLAY_MODE_OPTIONS.map((mode) => {
        const label = approvalDisplayModeLabel(mode);
        const disabled = mode === "step" && agentConsoleSettings.processStepDefaultMode === "timeline" && agentConsoleSettings.timelineStreamingStepMode === "hidden";
        return { id: mode, label, disabled, icon: <Icon name={mode === "step" ? "list" : mode === "statusPanel" ? "shield" : "rows"} size={13} /> };
      })}
    />
  );

  const navigationIndicatorOrderLabel = (navigationIndicatorOrder: AgentNavigationIndicatorOrder) => navigationIndicatorOrder === "leftToRight"
    ? t("settings.agentNavigationIndicatorOrderLeftToRight", "Left to right")
    : t("settings.agentNavigationIndicatorOrderRightToLeft", "Right to left");

  const navigationVisualizationModeLabel = (mode: AgentNavigationVisualizationMode) => mode === "bars"
    ? t("settings.agentNavigationVisualizationBars", "Bars")
    : t("settings.agentNavigationVisualizationLineArea", "Line area");

  const renderAgentNavigationVisualizationModeGroup = () => (
    <SettingsSegmentedControl
      ariaLabel={t("settings.agentNavigationVisualizationMode", "Navigation visualization")}
      value={agentConsoleSettings.navigationVisualizationMode}
      onChange={(mode) => handleAgentNavigationVisualizationModeChange(mode as AgentNavigationVisualizationMode)}
      className="settings-segmented-icon-only"
      options={AGENT_NAVIGATION_VISUALIZATION_MODE_OPTIONS.map((mode) => {
        const label = navigationVisualizationModeLabel(mode);
        return { id: mode, label, ariaLabel: `${t("settings.agentNavigationVisualizationMode", "Navigation visualization")}: ${label}`, icon: <Icon name={mode === "bars" ? "rows" : "line-chart"} size={13} /> };
      })}
    />
  );

  const renderAgentNavigationIndicatorOrderGroup = () => (
    <SettingsSegmentedControl
      ariaLabel={t("settings.agentNavigationIndicatorOrder", "Navigation indicator order")}
      value={agentConsoleSettings.navigationIndicatorOrder}
      onChange={(navigationIndicatorOrder) => handleAgentNavigationIndicatorOrderChange(navigationIndicatorOrder as AgentNavigationIndicatorOrder)}
      options={AGENT_NAVIGATION_INDICATOR_ORDER_OPTIONS.map((navigationIndicatorOrder) => {
        const label = navigationIndicatorOrderLabel(navigationIndicatorOrder);
        return { id: navigationIndicatorOrder, label, ariaLabel: `${t("settings.agentNavigationIndicatorOrder", "Navigation indicator order")}: ${label}`, icon: <Icon name="arrow-right" size={13} style={{ transform: navigationIndicatorOrder === "rightToLeft" ? "rotate(180deg)" : undefined }} /> };
      })}
    />
  );

  const navigationGroupBackgroundModeLabel = (mode: AgentNavigationGroupBackgroundMode) => {
    if (mode === "hidden") return t("settings.agentNavigationGroupBackgroundHidden", "No background");
    if (mode === "hover") return t("settings.agentNavigationGroupBackgroundHover", "On hover");
    return t("settings.agentNavigationGroupBackgroundAlternate", "Always alternate");
  };

  const navigationGroupBackgroundModeIcon = (mode: AgentNavigationGroupBackgroundMode) => {
    if (mode === "hidden") return <Icon name="eye-off" size={13} />;
    if (mode === "hover") return <Icon name="eye" size={13} />;
    return <Icon name="rows" size={13} style={{ transform: "rotate(90deg)" }} />;
  };

  const renderAgentNavigationGroupBackgroundModeGroup = () => (
    <SettingsSegmentedControl
      ariaLabel={t("settings.agentNavigationGroupBackgroundMode", "Round group background")}
      value={agentConsoleSettings.navigationGroupBackgroundMode}
      onChange={(mode) => handleAgentNavigationGroupBackgroundModeChange(mode as AgentNavigationGroupBackgroundMode)}
      options={AGENT_NAVIGATION_GROUP_BACKGROUND_MODE_OPTIONS.map((mode) => {
        const label = navigationGroupBackgroundModeLabel(mode);
        return { id: mode, label, icon: navigationGroupBackgroundModeIcon(mode), ariaLabel: `${t("settings.agentNavigationGroupBackgroundMode", "Round group background")}: ${label}` };
      })}
    />
  );

  const renderAgentDiffOffsetControl = (label: string, key: "additionsOffsetX" | "additionsOffsetY" | "deletionsOffsetX" | "deletionsOffsetY") => {
    const value = agentConsoleSettings.diffVisual[key];
    const displayValue = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return (
      <div className="settings-agent-offset-row">
        <span className="settings-agent-offset-label">{label}</span>
        <div className="settings-agent-offset-stepper" role="group" aria-label={label}>
          <button
            type="button"
            className="settings-agent-offset-button"
            disabled={value <= -4}
            onClick={() => handleAgentDiffTextOffsetChange(key, value - 0.5)}
            aria-label={`${label} -0.5px`}
          >
            -
          </button>
          <span className="settings-agent-offset-value">{displayValue}px</span>
          <button
            type="button"
            className="settings-agent-offset-button"
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

  const renderAgentPreview = () => {
    const stickyUserPreviewText = t("settings.agentStickyUserMessageBarPreview", "Please run the checklist:\n1. Create a markdown file\n2. Edit it and add content\n3. Delete the test files");
    return (
      <div className="settings-agent-preview" aria-label={t("settings.agentPreview", "Agent preview")}>
        <AgentSessionHeader session={agentPreviewSession} />
        {agentConsoleSettings.showStickyUserMessageBar && (
          <div className="settings-agent-sticky-user-preview" aria-hidden="true">
            <div className="agent-sticky-user-bar settings-agent-sticky-user-bar-preview">
              <span className="agent-sticky-user-letter-text">{renderStickyUserMessageText(stickyUserPreviewText, agentConsoleSettings.mergeStickyUserMessageLines)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const openCodePermissionActionLabel = (action: OpenCodePermissionSettingAction) => {
    if (action === "allow") return t("settings.openCodePermissionAllow", "Allow");
    if (action === "override") return t("settings.openCodePermissionOverride", "Override");
    if (action === "deny") return t("settings.openCodePermissionDeny", "Deny");
    return t("settings.openCodePermissionAsk", "Ask");
  };

  const openCodePermissionActionIcon = (action: OpenCodePermissionSettingAction) => {
    if (action === "allow") return "check";
    if (action === "override") return "rocket";
    if (action === "deny") return "circle-x";
    return "warning";
  };

  const renderOpenCodePermissionDefaults = () => {
    const activePresetId = getOpenCodePermissionPresetId(openCodeSettings.defaultPermissionPreset);
    return (
      <div className="settings-section settings-opencode-section">
        <div className="settings-row settings-row-stacked">
          <div className="settings-opencode-permission-summary-row">
            <div className="settings-row-info">
              <span className="settings-label">{t("settings.openCodePermissions", "OpenCode default permissions")}</span>
              <span className="settings-sublabel">{t("settings.openCodePermissionsDesc", "These permissions apply by default to the next new OpenCode session. Existing sessions keep their current rules.")}</span>
            </div>
            <SettingsSegmentedControl
              ariaLabel={t("settings.openCodePermissionPresets", "Permission presets")}
              value={activePresetId || ""}
              onChange={(presetId) => handleOpenCodePermissionPresetChange(presetId as OpenCodePermissionPresetId)}
              className="settings-opencode-preset-options"
              options={OPEN_CODE_PERMISSION_PRESETS.map((preset) => ({
                id: preset.id,
                label: t(preset.labelKey, preset.defaultLabel),
                icon: <Icon name={preset.icon} size={11} />,
                variant: openCodePermissionPresetVariant(preset.id),
              }))}
            />
          </div>
          <div className="settings-submitted-section-list settings-opencode-permission-list">
            <div className="settings-submitted-section-head settings-opencode-permission-head">
              <span>{t("settings.openCodePermission", "Permission")}</span>
              <span>{t("settings.openCodeDefault", "Default")}</span>
            </div>
            {OPEN_CODE_PERMISSION_DEFINITIONS.map((definition) => {
              const currentAction = getOpenCodePermissionPresetAction(openCodeSettings.defaultPermissionPreset, definition.permission);
              const description = t(definition.descriptionKey, definition.defaultDescription);
              const actionOptions = definition.permission === "bash" ? OPEN_CODE_BASH_PERMISSION_ACTIONS : OPEN_CODE_PERMISSION_ACTIONS;
              return (
                <div key={definition.permission} className="settings-submitted-section-item settings-opencode-permission-item">
                  <span className="settings-submitted-section-name settings-opencode-permission-name-cell">
                    <span className="settings-list-icon-slot"><Icon name={definition.icon} size={13} /></span>
                    <span className="settings-opencode-permission-title-line">
                      <span>{t(definition.labelKey, definition.defaultLabel)}</span>
                      <span className="settings-opencode-permission-inline-desc">{description}</span>
                    </span>
                  </span>
                  <SettingsSegmentedControl
                    ariaLabel={t(definition.labelKey, definition.defaultLabel)}
                    value={currentAction}
                    onChange={(action) => handleOpenCodePermissionActionChange(definition.permission, action as OpenCodePermissionSettingAction)}
                    className="settings-opencode-permission-actions"
                    options={actionOptions.map((action) => ({
                      id: action,
                      label: openCodePermissionActionLabel(action),
                      icon: <Icon name={openCodePermissionActionIcon(action)} size={11} />,
                      variant: action,
                    }))}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderOpenCodeModelLibrary = () => {
    const enabledCount = openCodeSettings.models.filter((model) => model.enabled).length;
    const preferredModel = openCodeSettings.models.find((model) => model.id === openCodeSettings.preferredModelId);
    const modelGroups = groupOpenCodeModelsByProvider(filteredOpenCodeModels);
    return (
      <div className="settings-section settings-opencode-section">
        <div className="settings-row settings-row-stacked">
          <div className="settings-row-info">
            <span className="settings-label">{t("settings.openCodeModelLibrary", "OpenCode model library")}</span>
            <span className="settings-sublabel">{t("settings.openCodeModelLibraryDesc", "Models are discovered from OpenCode. Enable the models that should appear in the compact Agent Console switcher.")}</span>
          </div>
          <div className="settings-opencode-summary-row">
            <span>{t("settings.openCodeModelsTotal", "{{count}} models", { count: openCodeSettings.models.length })}</span>
            <span>{t("settings.openCodeModelsEnabled", "{{count}} enabled", { count: enabledCount })}</span>
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
              <span>{t("settings.openCodeModelLibraryEmpty", "Run an Agent session once to discover available models.")}</span>
            </div>
          ) : (
            <div className="settings-opencode-model-list">
              {modelGroups.map((group) => (
                <div key={group.providerId} className="settings-opencode-model-group">
                  <div className="settings-opencode-model-group-head">
                    <span>{group.label}</span>
                    <span className="settings-opencode-model-count-badge">{t("settings.openCodeProviderModelSummary", "{{enabled}}/{{total}} enabled", { enabled: group.enabledCount, total: group.models.length })}</span>
                  </div>
                  <div className="settings-opencode-model-family-list">
                    {group.families.map((family) => (
                      <div key={family.familyId} className="settings-opencode-model-family">
                        <div className="settings-opencode-model-family-head">
                          <span>{family.label}</span>
                          <span className="settings-opencode-model-count-badge">{t("settings.openCodeProviderModelSummary", "{{enabled}}/{{total}} enabled", { enabled: family.enabledCount, total: family.models.length })}</span>
                        </div>
                        <div className="settings-opencode-model-cloud">
                          {family.models.map((model) => {
                            const isPreferred = openCodeSettings.preferredModelId === model.id;
                            return (
                              <div key={model.id} className={`settings-opencode-model-tag${model.enabled ? " enabled" : ""}${isPreferred ? " preferred" : ""}`}>
                                <span className="settings-opencode-model-tag-main">
                                  <span className="settings-opencode-model-tag-label">{model.label}</span>
                                </span>
                                <span className="settings-opencode-model-actions">
                                  <button
                                    type="button"
                                    className={`settings-opencode-model-icon-button${isPreferred ? " active" : ""}`}
                                    onClick={() => handleOpenCodePreferredModelChange(model.id)}
                                    aria-label={isPreferred ? t("settings.openCodeCurrentDefault", "Current default") : t("settings.openCodeSetDefault", "Set as default")}
                                  >
                                    <Icon name={isPreferred ? "check" : "circle-check"} size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    className={`settings-opencode-model-icon-button${model.enabled ? " active" : ""}`}
                                    onClick={() => handleOpenCodeModelEnabledChange(model.id, !model.enabled)}
                                    aria-label={model.enabled ? t("settings.openCodeDisableModel", "Hide from switcher") : t("settings.openCodeEnableModel", "Show in switcher")}
                                  >
                                    <Icon name={model.enabled ? "eye" : "eye-off"} size={12} />
                                  </button>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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
    if (tabId === "agentSessions") return t("agentSessions.title", "Sessions");
    if (tabId === "terminal") return t("terminal.title", "Terminal");
    if (tabId === "git") return t("git.title", "Git");
    return t("resources.title", "Project resources");
  };

  const renderDockTabIcon = (tabId: DockTabId) => {
    if (tabId === "mlc") return <MlcLogoIcon size={13} />;
    if (tabId === "mlcPreview") return <Icon name="file-text" size={13} />;
    if (tabId === "previewBrowser") return <Icon name="globe" size={13} />;
    if (tabId === "previewInfo") return <Icon name="code" size={13} />;
    if (tabId === "agentConsole") return <Icon name="robot" size={13} />;
    if (tabId === "agentSessions") return <Icon name="message" size={13} />;
    if (tabId === "terminal") return <Icon name="terminal" size={13} />;
    if (tabId === "git") return <Icon name="git-commit" size={13} />;
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
    if (sectionId === "timedGitReminder") return <Icon name="clock" size={13} />;
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
            {renderSettingsNavGroup("mlfb", t("settings.mlfb", "MLFB"), ["callers", "submitted", "prompts", "sessionNavigation", "gitOperations"], (
              <>
                {renderSettingsNavItem("callers", "users", t("settings.callers"), true)}
                {renderSettingsNavItem("submitted", "checklist", t("settings.submittedFeedback", "Submitted feedback"), true)}
                {renderSettingsNavItem("prompts", "file-text", t("settings.prompts"), true)}
                {renderSettingsNavItem("sessionNavigation", "list-tree", t("settings.sessionNavigation", "Session navigation"), true)}
                {renderSettingsNavItem("gitOperations", "git-branch", t("settings.gitOperations", "Git operations"), true)}
              </>
            ))}
            {!isAgentUiDisabled && renderSettingsNavGroup("agent", t("settings.agent", "Agent"), ["agentConsole", "agentStepDisplay", "agentChat", "agentSessionManager", "openCode", "openCodePermissions"], (
              <>
                {renderSettingsNavItem("agentConsole", "robot", t("settings.agentConsoleDisplay", "Navigation bar"), true)}
                {renderSettingsNavItem("agentStepDisplay", "rows", t("settings.agentStepDisplay", "Step display"), true)}
                {renderSettingsNavItem("agentChat", "message-dot", t("settings.agentChat", "Chat"), true)}
                {renderSettingsNavItem("agentSessionManager", "message", t("settings.agentSessionManager", "Session manager"), true)}
                {renderSettingsNavItem("openCode", "code", t("settings.openCode", "Models"), true)}
                {renderSettingsNavItem("openCodePermissions", "checklist", t("settings.openCodeApprovalPermissions", "Approval permissions"), true)}
              </>
            ))}
            {renderSettingsNavGroup("layout", t("settings.layout", "Layout"), ["layoutPanels", "terminal", "resources", "markdownPreview"], (
              <>
                {renderSettingsNavItem("layoutPanels", "page-sidebar", t("settings.panelManagement", "Panel management"), true)}
                {renderSettingsNavItem("terminal", "terminal", t("settings.terminal", "Terminal"), true)}
                {renderSettingsNavItem("resources", "folder", t("settings.resourceExplorer", "Resource explorer"), true)}
                {renderSettingsNavItem("markdownPreview", "file-text", t("settings.markdownPreview", "Markdown preview"), true)}
              </>
            ))}
            {renderSettingsNavItem("notification", "bell", t("settings.notification"))}
            {renderSettingsNavItem("about", "info", t("settings.about"))}
          </div>

          {/* Content */}
          <div className={`settings-content${tab === "agentConsole" ? " settings-content-agent" : ""}`}>
            {tab === "general" && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.autostart")}</span>
                    <span className={`settings-sublabel${autostartMessage ? " settings-sublabel-warning" : ""}`}>
                      {autostartMessage || t("settings.autostartDesc")}
                    </span>
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
                    <div className="settings-command-actions">
                      <button
                        className="settings-command-button danger"
                        onClick={() => setConfirmClear(true)}
                      >
                        {t("settings.clearHistoryBtn")}
                      </button>
                    </div>
                  ) : (
                    <div className="settings-command-actions">
                      <button
                        className="settings-command-button danger active"
                        onClick={async () => {
                          await useFeedbackStore.getState().clearAllHistory();
                          setConfirmClear(false);
                        }}
                      >
                        {t("settings.clearHistoryConfirm")}
                      </button>
                      <button
                        className="settings-command-button"
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
                  <SettingsSegmentedControl
                    ariaLabel={t("settings.theme")}
                    value={theme}
                    onChange={(value) => handleThemeChange(value as Theme)}
                    options={[
                      { id: "dark", label: t("settings.themeDark"), icon: <Icon name="moon" size={12} /> },
                      { id: "light", label: t("settings.themeLight"), icon: <Icon name="sun-full" size={12} /> },
                    ]}
                  />
                </div>

                {/* Language */}
                <div className="settings-row">
                  <span className="settings-label">{t("settings.language")}</span>
                  <SettingsSegmentedControl
                    ariaLabel={t("settings.language")}
                    value={i18n.language.startsWith("zh") ? "zh" : "en"}
                    onChange={handleLangChange}
                    options={[
                      { id: "zh", label: "中文" },
                      { id: "en", label: "English" },
                    ]}
                  />
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
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.sessionNavigationMode", "Navigation display mode")}</span>
                    <span className="settings-sublabel">{t("settings.sessionNavigationModeDesc", "Choose how sessions are shown inside each caller panel.")}</span>
                  </div>
                  <SettingsSegmentedControl
                    ariaLabel={t("settings.sessionNavigationMode", "Navigation display mode")}
                    value={sessionListMode}
                    onChange={(mode) => setSessionListMode(mode as typeof sessionListMode)}
                    className="settings-segmented-icon-only settings-segmented-visual-options settings-session-nav-options session-nav-mode-group"
                    options={SESSION_LIST_MODE_OPTIONS.map((option) => {
                      const label = t(option.labelKey, option.defaultLabel);
                      return { id: option.mode, label, icon: <SessionNavigationModeIcon mode={option.mode} />, ariaLabel: `${t("settings.sessionNavigationMode", "Navigation display mode")}: ${label}` };
                    })}
                  />
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
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.sessionNavigationColorCards", "Use color cards")}</span>
                    <span className="settings-sublabel">{t("settings.sessionNavigationColorCardsDesc", "Color topbar stats blocks by request type while keeping critical status colors visible.")}</span>
                  </div>
                  <button
                    className={`settings-toggle${useSessionNavigationColorCards ? " settings-toggle-on" : ""}`}
                    onClick={() => setUseSessionNavigationColorCards(!useSessionNavigationColorCards)}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </div>
            )}

            {tab === "gitOperations" && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.gitTimedReminder", "Timed Git backup reminder")}</span>
                    <span className="settings-sublabel">{t("settings.gitTimedReminderDesc", "Inject a scheduled reminder into submitted feedback when no manual Git Action is selected.")}</span>
                  </div>
                  <button
                    className={`settings-toggle${gitOperationSettings.timedReminderEnabled ? " settings-toggle-on" : ""}`}
                    onClick={handleGitReminderEnabledToggle}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.gitTimedReminderInterval", "Reminder interval")}</span>
                    <span className="settings-sublabel">{t("settings.gitTimedReminderIntervalDesc", "Minimum minutes between scheduled Git backup reminders per workspace.")}</span>
                  </div>
                  <div className="settings-range-with-value">
                    <input
                      type="range"
                      min={GIT_TIMED_REMINDER_MIN_MINUTES}
                      max={GIT_TIMED_REMINDER_MAX_MINUTES}
                      step={GIT_TIMED_REMINDER_STEP_MINUTES}
                      value={gitOperationSettings.timedReminderIntervalMinutes}
                      onChange={(event) => handleGitReminderIntervalChange(Number(event.target.value))}
                      className="settings-range"
                    />
                    <span className="settings-range-value">
                      {gitReminderIntervalLabel}
                    </span>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.gitTimedReminderCallerTheme", "Use caller color for timed Git")}</span>
                    <span className="settings-sublabel">{t("settings.gitTimedReminderCallerThemeDesc", "Color the timed Git countdown and ready state with the caller workspace theme. Turn off to keep the amber style.")}</span>
                  </div>
                  <button
                    className={`settings-toggle${gitOperationSettings.timedReminderTheme === "caller" ? " settings-toggle-on" : ""}`}
                    onClick={handleGitReminderThemeToggle}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-row settings-row-stacked">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.gitFolderBlacklist", "Git folder blacklist")}</span>
                    <span className="settings-sublabel">{t("settings.gitFolderBlacklistDesc", "Folders listed here are included in Git Action and timed Git reminder instructions as paths that must not be staged or committed.")}</span>
                  </div>
                  <textarea
                    className="settings-git-blacklist-textarea"
                    rows={5}
                    spellCheck={false}
                    value={formatGitFolderBlacklistText(gitOperationSettings.folderBlacklist)}
                    onChange={(event) => handleGitFolderBlacklistChange(event.target.value)}
                  />
                </div>
                <div className="settings-row settings-row-stacked">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.gitReminderPreview", "Injected reminder preview")}</span>
                    <span className="settings-sublabel">{t("settings.gitReminderPreviewDesc", "Manual Git Action and scheduled reminders both include these safety requirements.")}</span>
                  </div>
                  <pre className="settings-git-reminder-preview">{[
                    "Configured folder blacklist:",
                    ...(gitOperationSettings.folderBlacklist.length > 0 ? gitOperationSettings.folderBlacklist.map((entry) => `- ${entry}`) : ["- (none)"]),
                    "",
                    "Requirements:",
                    "- Do not stage or commit files under the configured blacklisted folders.",
                    "- When committing, write a meaningful git commit message that briefly summarizes the recent activity being backed up.",
                  ].join("\n")}</pre>
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

            {!isAgentUiDisabled && tab === "agentSessionManager" && (
              <div className="settings-section settings-agent-section">
                <div className="settings-row settings-row-stacked">
                  <div className="settings-row settings-agent-toggle-row">
                    <div className="settings-row-info">
                      <span className="settings-label">{t("settings.agentNewSessionWorkspacePath", "New session workspace path")}</span>
                      <span className="settings-sublabel">{t("settings.agentNewSessionWorkspacePathDesc", "Choose which workspace path new Agent sessions use by default.")}</span>
                    </div>
                    <SettingsSegmentedControl
                      ariaLabel={t("settings.agentNewSessionWorkspacePath", "New session workspace path")}
                      value={agentSessionSettings.newSessionWorkspacePathMode}
                      onChange={(value) => handleNewSessionWorkspacePathModeChange(value as NewSessionWorkspacePathMode)}
                      options={[
                        { id: "default", label: t("settings.agentNewSessionWorkspaceDefault", "Default workspace path") },
                        { id: "recentSession", label: t("settings.agentNewSessionWorkspaceRecent", "Recent session workspace path") },
                      ]}
                    />
                  </div>
                  <div className="settings-row settings-agent-toggle-row settings-row-stacked">
                    <div className="settings-row-info">
                      <span className="settings-label">{t("settings.agentDefaultWorkspacePath", "Default workspace path")}</span>
                      <span className="settings-sublabel">{t("settings.agentDefaultWorkspacePathDesc", "Used when new sessions are configured to start from the default workspace path.")}</span>
                    </div>
                    <div className="settings-path-control">
                      <input
                        type="text"
                        className="settings-path-input"
                        value={agentSessionSettings.defaultWorkspacePath}
                        onChange={(event) => handleDefaultWorkspacePathChange(event.target.value)}
                        placeholder={t("settings.agentDefaultWorkspacePathPlaceholder", "No default workspace path")}
                      />
                      <button type="button" className="settings-command-button" onClick={() => void handleChooseDefaultWorkspacePath()}>
                        {t("settings.chooseFolder", "Choose folder")}
                      </button>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <span className="settings-label">{t("settings.agentAutoCleanupEmptySessions", "Auto-clean empty sessions")}</span>
                      <span className="settings-sublabel">{t("settings.agentAutoCleanupEmptySessionsDesc", "Remove inactive empty Agent sessions when switching sessions.")}</span>
                    </div>
                    <button
                      type="button"
                      className={`settings-toggle${agentConsoleSettings.autoCleanupEmptySessions ? " settings-toggle-on" : ""}`}
                      onClick={handleAgentAutoCleanupToggle}
                      aria-label={t("settings.agentAutoCleanupEmptySessions", "Auto-clean empty sessions")}
                      aria-pressed={agentConsoleSettings.autoCleanupEmptySessions}
                    >
                      <span className="settings-toggle-knob" />
                    </button>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <span className="settings-label">{t("settings.agentCleanupEmptySessionsNow", "Clean empty sessions now")}</span>
                      <span className="settings-sublabel">{agentCleanupMessage || t("settings.agentCleanupEmptySessionsNowDesc", "Immediately remove inactive empty Agent sessions.")}</span>
                    </div>
                    <div className="settings-command-actions">
                      <button type="button" className="settings-command-button" onClick={handleAgentCleanupNow}>
                        {t("settings.agentCleanupEmptySessionsButton", "Clean now")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!isAgentUiDisabled && tab === "agentStepDisplay" && (
              <div className="settings-section settings-agent-section">
                <div className="settings-row settings-row-stacked">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.agentStepDisplay", "Step display")}</span>
                    <span className="settings-sublabel">{t("settings.agentStepDisplayDesc", "Configure how Agent step progress is shown in chat.")}</span>
                  </div>
                  <div className="settings-row settings-agent-toggle-row settings-agent-step-primary-row">
                    <div className="settings-row-info">
                      <span className="settings-label">{t("settings.agentProcessStepDefaultMode", "Step process default view")}</span>
                      <span className="settings-sublabel">{t("settings.agentProcessStepDefaultModeDesc", "Choose whether new Agent process steps open in tabs or timeline view by default.")}</span>
                    </div>
                    {renderAgentProcessStepModeGroup()}
                  </div>
                  <div className="settings-row settings-agent-toggle-row">
                    <div className="settings-row-info">
                      <span className="settings-label">{t("settings.agentAllowProcessStepModeSwitching", "Allow switching Step display during sessions")}</span>
                      <span className="settings-sublabel">{t("settings.agentAllowProcessStepModeSwitchingDesc", "When enabled, the Step view switch appears on hover in the process row during a session.")}</span>
                    </div>
                    <button
                      type="button"
                      className={`settings-toggle${agentConsoleSettings.allowProcessStepModeSwitching ? " settings-toggle-on" : ""}`}
                      onClick={handleAgentProcessStepModeSwitchingToggle}
                      aria-label={t("settings.agentAllowProcessStepModeSwitching", "Allow switching Step display during sessions")}
                      aria-pressed={agentConsoleSettings.allowProcessStepModeSwitching}
                    >
                      <span className="settings-toggle-knob" />
                    </button>
                  </div>
                  <div className="settings-agent-topbar-options settings-agent-step-options">
                    {agentConsoleSettings.processStepDefaultMode === "timeline" && (
                      <>
                        <div className="settings-row settings-agent-toggle-row settings-agent-control-card">
                          <div className="settings-row-info">
                            <span className="settings-label">{t("settings.agentTimelineStreamingStepMode", "Streaming step default style")}</span>
                            <span className="settings-sublabel">{t("settings.agentTimelineStreamingStepModeDesc", "Only affects how steps expand while an Agent is streaming in timeline view.")}</span>
                          </div>
                          {renderAgentTimelineStreamingStepModeGroup()}
                        </div>
                        <div className="settings-row settings-agent-toggle-row settings-agent-control-card">
                          <div className="settings-row-info">
                            <span className="settings-label">{t("settings.agentTodoUpdateDisplayMode", "Todo update style")}</span>
                            <span className="settings-sublabel">{t("settings.agentTodoUpdateDisplayModeDesc", "Choose whether timeline todo updates show a count summary or the task panel.")}</span>
                          </div>
                          {renderAgentTodoUpdateDisplayModeGroup()}
                        </div>
                      </>
                    )}
                    <div className="settings-row settings-agent-toggle-row">
                      <div className="settings-row-info">
                        <span className="settings-label">{t("settings.agentCollapseOutputBlankLines", "Collapse consecutive blank lines in output")}</span>
                        <span className="settings-sublabel">{t("settings.agentCollapseOutputBlankLinesDesc", "When enabled, repeated blank lines in Agent output are reduced to a single blank line.")}</span>
                      </div>
                      <button
                        type="button"
                        className={`settings-toggle${agentConsoleSettings.collapseConsecutiveOutputBlankLines ? " settings-toggle-on" : ""}`}
                        onClick={handleAgentCollapseOutputBlankLinesToggle}
                        aria-label={t("settings.agentCollapseOutputBlankLines", "Collapse consecutive blank lines in output")}
                        aria-pressed={agentConsoleSettings.collapseConsecutiveOutputBlankLines}
                      >
                        <span className="settings-toggle-knob" />
                      </button>
                    </div>
                    <div className="settings-row settings-agent-toggle-row">
                      <div className="settings-row-info">
                        <span className="settings-label">{t("settings.agentMergeThinkingToolSteps", "Merge tool steps with thinking")}</span>
                        <span className="settings-sublabel">{t("settings.agentMergeThinkingToolStepsDesc", "When a visible thinking step precedes a tool step, show the tool card inside the thinking step instead of as a separate step.")}</span>
                      </div>
                      <button
                        type="button"
                        className={`settings-toggle${agentConsoleSettings.mergeThinkingToolSteps ? " settings-toggle-on" : ""}`}
                        onClick={handleAgentMergeThinkingToolStepsToggle}
                        aria-label={t("settings.agentMergeThinkingToolSteps", "Merge tool steps with thinking")}
                        aria-pressed={agentConsoleSettings.mergeThinkingToolSteps}
                      >
                        <span className="settings-toggle-knob" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!isAgentUiDisabled && tab === "agentChat" && (
              <div className="settings-section settings-agent-section">
                <div className="settings-row settings-row-stacked">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.agentChat", "Chat")}</span>
                    <span className="settings-sublabel">{t("settings.agentChatDesc", "Configure Agent conversation behavior.")}</span>
                  </div>
                  <div className="settings-agent-topbar-options settings-agent-chat-options">
                    <div className="settings-row settings-agent-toggle-row">
                      <div className="settings-row-info">
                        <span className="settings-label">{t("settings.agentMessageSpeakerLine", "Show session avatar and name during chat")}</span>
                        <span className="settings-sublabel">{t("settings.agentMessageSpeakerLineDesc", "Show the session avatar and name above each Agent message.")}</span>
                      </div>
                      <button
                        type="button"
                        className={`settings-toggle${agentConsoleSettings.showMessageSpeakerLine ? " settings-toggle-on" : ""}`}
                        onClick={handleAgentMessageSpeakerToggle}
                        aria-label={t("settings.agentMessageSpeakerLine", "Show session avatar and name during chat")}
                        aria-pressed={agentConsoleSettings.showMessageSpeakerLine}
                      >
                        <span className="settings-toggle-knob" />
                      </button>
                    </div>
                    <div className="settings-row settings-agent-toggle-row settings-agent-control-card">
                      <div className="settings-row-info">
                        <span className="settings-label">{t("settings.agentTaskPanelTemplateStyle", "Task management panel style")}</span>
                        <span className="settings-sublabel">{t("settings.agentTaskPanelTemplateStyleDesc", "Choose how the task management panel above the composer lays out tasks.")}</span>
                      </div>
                      {renderAgentTaskPanelTemplateStyleGroup()}
                    </div>
                    <div className="settings-row settings-agent-toggle-row">
                      <div className="settings-row-info">
                        <span className="settings-label">{t("settings.agentSmoothStreamingOutput", "Smooth streaming output")}</span>
                        <span className="settings-sublabel">{t("settings.agentSmoothStreamingOutputDesc", "Pace Agent text updates so fast model chunks still appear progressively.")}</span>
                      </div>
                      <button
                        type="button"
                        className={`settings-toggle${agentConsoleSettings.smoothStreamingOutput ? " settings-toggle-on" : ""}`}
                        onClick={handleAgentSmoothStreamingToggle}
                        aria-label={t("settings.agentSmoothStreamingOutput", "Smooth streaming output")}
                        aria-pressed={agentConsoleSettings.smoothStreamingOutput}
                      >
                        <span className="settings-toggle-knob" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!isAgentUiDisabled && tab === "agentConsole" && (
              <>
                {renderAgentPreview()}
                <div className="settings-section settings-agent-section">
                  <div className="settings-row settings-row-stacked">
                    <div className="settings-row-info">
                      <span className="settings-label">{t("settings.agentTopbarIndicators", "Topbar indicators")}</span>
                      <span className="settings-sublabel">{t("settings.agentTopbarIndicatorsDesc", "Configure how Agent Console diff and context indicators appear in the topbar.")}</span>
                    </div>
                    <div className="settings-row settings-agent-toggle-row settings-agent-navigation-primary-row">
                      <div className="settings-row-info">
                        <span className="settings-label">{t("settings.agentNavigationVisualizationMode", "Navigation visualization")}</span>
                        <span className="settings-sublabel">{t("settings.agentNavigationVisualizationModeDesc", "Choose whether Agent navigation uses compact bars or a smooth line-area chart.")}</span>
                      </div>
                      {renderAgentNavigationVisualizationModeGroup()}
                    </div>
                    <div className="settings-agent-topbar-options">
                      <div className="settings-row settings-agent-toggle-row settings-agent-control-card">
                        <div className="settings-row-info">
                          <span className="settings-label">{t("settings.agentNavigationIndicatorOrder", "Navigation indicator order")}</span>
                          <span className="settings-sublabel">{t("settings.agentNavigationIndicatorOrderDesc", "Choose whether process indicator columns read from oldest to newest or newest to oldest.")}</span>
                        </div>
                        {renderAgentNavigationIndicatorOrderGroup()}
                      </div>
                      {agentConsoleSettings.navigationVisualizationMode === "bars" && (
                        <div className="settings-row settings-agent-toggle-row settings-agent-control-card">
                          <div className="settings-row-info">
                            <span className="settings-label">{t("settings.agentNavigationGroupBackgroundMode", "Round group background")}</span>
                            <span className="settings-sublabel">{t("settings.agentNavigationGroupBackgroundModeDesc", "Choose when conversation-round grouping backgrounds appear in the Agent navigation bar.")}</span>
                          </div>
                          {renderAgentNavigationGroupBackgroundModeGroup()}
                        </div>
                      )}
                    </div>
                    <div className="settings-row settings-row-stacked settings-agent-navigation-behavior-group">
                      <div className="settings-row-info">
                        <span className="settings-label">{t("settings.agentNavigationBehavior", "Navigation behavior")}</span>
                        <span className="settings-sublabel">{t("settings.agentNavigationBehaviorDesc", "Configure the navigation detail row and sticky user-message row behavior.")}</span>
                      </div>
                      <div className="settings-agent-topbar-options settings-agent-navigation-behavior-options">
                        <div className="settings-row settings-agent-toggle-row">
                          <div className="settings-row-info">
                            <span className="settings-label">{t("settings.agentDefaultExpandHeaderDetails", "Default-expand second row")}</span>
                            <span className="settings-sublabel">{t("settings.agentDefaultExpandHeaderDetailsDesc", "Open the Agent navigation detail row by default for each session.")}</span>
                          </div>
                          <button
                            type="button"
                            className={`settings-toggle${agentConsoleSettings.defaultExpandHeaderDetails ? " settings-toggle-on" : ""}`}
                            onClick={handleAgentHeaderDefaultExpandToggle}
                            aria-label={t("settings.agentDefaultExpandHeaderDetails", "Default-expand second row")}
                            aria-pressed={agentConsoleSettings.defaultExpandHeaderDetails}
                          >
                            <span className="settings-toggle-knob" />
                          </button>
                        </div>
                        <div className="settings-agent-toggle-row settings-agent-sticky-user-card">
                          <div className="settings-row-info settings-agent-sticky-user-info">
                            <span className="settings-label">{t("settings.agentStickyUserMessageBar", "Show sticky user message row")}</span>
                            <span className="settings-sublabel">{t("settings.agentStickyUserMessageBarDesc", "Keep the latest scrolled-past user message visible at the top of the chat timeline.")}</span>
                          </div>
                          <button
                            type="button"
                            className={`settings-toggle settings-agent-sticky-user-main-toggle${agentConsoleSettings.showStickyUserMessageBar ? " settings-toggle-on" : ""}`}
                            onClick={handleAgentStickyUserMessageBarToggle}
                            aria-label={t("settings.agentStickyUserMessageBar", "Show sticky user message row")}
                            aria-pressed={agentConsoleSettings.showStickyUserMessageBar}
                          >
                            <span className="settings-toggle-knob" />
                          </button>
                          <div className="settings-agent-sticky-user-subrow">
                            <div className="settings-agent-inline-mini-toggle">
                              <span>{t("settings.agentStickyUserMergeLines", "Merge lines")}</span>
                              <button
                                type="button"
                                className={`settings-toggle settings-toggle-sm${agentConsoleSettings.mergeStickyUserMessageLines ? " settings-toggle-on" : ""}`}
                                onClick={handleAgentStickyUserMergeLinesToggle}
                                aria-label={t("settings.agentStickyUserMergeLines", "Merge lines")}
                                aria-pressed={agentConsoleSettings.mergeStickyUserMessageLines}
                              >
                                <span className="settings-toggle-knob" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="settings-row settings-row-stacked settings-agent-indicator-group">
                      <div className="settings-row-info">
                        <span className="settings-label">{t("settings.agentIndicatorGroup", "Indicators")}</span>
                        <span className="settings-sublabel">{t("settings.agentIndicatorGroupDesc", "Configure how Agent topbar diff and context indicators are shown.")}</span>
                      </div>
                      <div className="settings-agent-indicator-list">
                        <div className="settings-row settings-agent-toggle-row settings-agent-control-card">
                          <div className="settings-row-info">
                            <span className="settings-label">{t("settings.agentDiffIndicator", "Diff indicator")}</span>
                            <span className="settings-sublabel">{t("settings.agentDiffIndicatorDesc", "Choose whether diff activity appears as text, graphics, or stays hidden in the Agent topbar.")}</span>
                          </div>
                          {renderAgentIndicatorModeGroup("diffIndicatorMode", agentConsoleSettings.diffIndicatorMode, t("settings.agentDiffIndicator", "Diff indicator"))}
                        </div>
                        <div className="settings-row settings-agent-toggle-row settings-agent-control-card">
                          <div className="settings-row-info">
                            <span className="settings-label">{t("settings.agentContextIndicator", "Context indicator")}</span>
                            <span className="settings-sublabel">{t("settings.agentContextIndicatorDesc", "Choose whether context usage appears as text, graphics, or stays hidden in the Agent topbar.")}</span>
                          </div>
                          {renderAgentIndicatorModeGroup("contextIndicatorMode", agentConsoleSettings.contextIndicatorMode, t("settings.agentContextIndicator", "Context indicator"))}
                        </div>
                      </div>
                    </div>
                    <div className="settings-agent-visual-group settings-agent-toggle-row">
                      <div className="settings-row-info">
                        <span className="settings-label">{t("settings.agentDiffVisualAdjustment", "Diff visual adjustment")}</span>
                        <span className="settings-sublabel">{t("settings.agentDiffVisualAdjustmentDesc", "Tune the color preset for added and deleted diff content.")}</span>
                      </div>
                      <SettingsSegmentedControl
                        ariaLabel={t("settings.agentDiffColorPreset", "Diff color preset")}
                        value={agentConsoleSettings.diffVisual.colorPresetId}
                        onChange={(value) => handleAgentDiffColorPresetChange(value as AgentDiffColorPresetId)}
                        className="settings-segmented-icon-only settings-segmented-visual-options settings-agent-color-options"
                        options={AGENT_DIFF_COLOR_PRESETS.map((preset) => {
                          const label = t(preset.labelKey, preset.defaultLabel);
                          return {
                            id: preset.id,
                            label,
                            ariaLabel: `${t("settings.agentDiffColorPreset", "Diff color preset")}: ${label}`,
                            icon: (
                              <span className="settings-agent-color-swatch-pair" aria-hidden="true">
                              <span style={{ background: preset.additions }} />
                              <span style={{ background: preset.deletions }} />
                              </span>
                            ),
                          };
                        })}
                      />
                    </div>
                    <div className="settings-agent-offset-card settings-agent-toggle-row">
                      <div className="settings-row settings-agent-offset-card-header">
                        <div className="settings-row-info">
                          <span className="settings-label">{t("settings.agentDiffTextOffsetAdvanced", "Text offset fine tuning")}</span>
                          <span className="settings-sublabel">{t("settings.agentDiffTextOffsetAdvancedDesc", "Adjust the compact diff text position independently for additions and deletions.")}</span>
                        </div>
                        <button
                          type="button"
                          className="settings-agent-offset-toggle"
                          onClick={() => setDiffOffsetCollapsed((value) => !value)}
                          aria-expanded={!diffOffsetCollapsed}
                        >
                          <Icon name={diffOffsetCollapsed ? "chevron-right" : "chevron-down"} size={13} />
                          <span>{diffOffsetCollapsed ? t("settings.agentDiffTextOffsetExpand", "Expand") : t("settings.agentDiffTextOffsetCollapse", "Collapse")}</span>
                        </button>
                      </div>
                      {!diffOffsetCollapsed && (
                        <div className="settings-agent-offset-list">
                          <div className="settings-agent-offset-title">{t("settings.agentDiffAddTextOffset", "Addition text offset")}</div>
                          {renderAgentDiffOffsetControl(t("settings.agentDiffTextOffsetX", "Horizontal offset"), "additionsOffsetX")}
                          {renderAgentDiffOffsetControl(t("settings.agentDiffTextOffsetY", "Vertical offset"), "additionsOffsetY")}
                          <div className="settings-agent-offset-title">{t("settings.agentDiffDeleteTextOffset", "Deletion text offset")}</div>
                          {renderAgentDiffOffsetControl(t("settings.agentDiffTextOffsetX", "Horizontal offset"), "deletionsOffsetX")}
                          {renderAgentDiffOffsetControl(t("settings.agentDiffTextOffsetY", "Vertical offset"), "deletionsOffsetY")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {!isAgentUiDisabled && tab === "openCode" && renderOpenCodeModelLibrary()}
            {!isAgentUiDisabled && tab === "openCodePermissions" && (
              <>
                <div className="settings-section settings-agent-section">
                  <div className="settings-row settings-row-stacked">
                    <div className="settings-row-info">
                      <span className="settings-label">{t("settings.openCodeApprovalPermissions", "Approval permissions")}</span>
                      <span className="settings-sublabel">{t("settings.agentApprovalPermissionsDesc", "Configure how Agent approval requests appear and how edit details open by default.")}</span>
                    </div>
                    <div className="settings-agent-topbar-options settings-agent-approval-options">
                      <div className="settings-row settings-agent-toggle-row settings-agent-control-card">
                        <div className="settings-row-info">
                          <span className="settings-label">{t("settings.agentApprovalDisplayMode", "Approval handling style")}</span>
                          <span className="settings-sublabel">{agentConsoleSettings.processStepDefaultMode === "timeline" && agentConsoleSettings.timelineStreamingStepMode === "hidden"
                            ? t("settings.agentApprovalDisplayModeStepDisabledDesc", "In-step approval is disabled when streaming steps are hidden by default.")
                            : t("settings.agentApprovalDisplayModeDesc", "Choose where pending approval actions appear.")}</span>
                        </div>
                        {renderAgentApprovalDisplayModeGroup()}
                      </div>
                      <div className="settings-row settings-agent-toggle-row">
                        <div className="settings-row-info">
                          <span className="settings-label">{t("settings.agentCollapseEditApprovalDiff", "Collapse edit approval details by default")}</span>
                          <span className="settings-sublabel">{t("settings.agentCollapseEditApprovalDiffDesc", "When enabled, file edit details in the approval panel start collapsed.")}</span>
                        </div>
                        <button
                          type="button"
                          className={`settings-toggle${agentConsoleSettings.collapseEditApprovalDiffByDefault ? " settings-toggle-on" : ""}`}
                          onClick={handleAgentCollapseEditApprovalDiffToggle}
                          aria-label={t("settings.agentCollapseEditApprovalDiff", "Collapse edit approval details by default")}
                          aria-pressed={agentConsoleSettings.collapseEditApprovalDiffByDefault}
                        >
                          <span className="settings-toggle-knob" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {renderOpenCodePermissionDefaults()}
              </>
            )}

            {tab === "resources" && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-row-info" style={{ flex: 1 }}>
                    <span className="settings-label">{t("settings.resourceIconTheme", "Resource icon theme")}</span>
                    <span className="settings-sublabel">{t("settings.resourceIconThemeDesc", "Choose the file icon theme used by project resources and resource links.")}</span>
                  </div>
                  <SettingsSegmentedControl
                    ariaLabel={t("settings.resourceIconTheme", "Resource icon theme")}
                    value={resourceIconTheme}
                    onChange={(value) => setResourceIconTheme(value as typeof resourceIconTheme)}
                    options={[
                      { id: "default", label: t("settings.resourceIconThemeDefault", "Default"), icon: <Icon name="file-text" size={12} /> },
                      { id: "catppuccin", label: t("settings.resourceIconThemeCatppuccin", "Catppuccin"), icon: <Icon name="folder" size={12} /> },
                    ]}
                  />
                </div>
              </div>
            )}

            {tab === "markdownPreview" && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-label">{t("settings.markdownPreviewShowYaml", "Show YAML")}</span>
                    <span className="settings-sublabel">{t("settings.markdownPreviewShowYamlDesc", "Display YAML frontmatter in the markdown content preview.")}</span>
                  </div>
                  <button
                    className={`settings-toggle${mlcPreviewShowYaml ? " settings-toggle-on" : ""}`}
                    onClick={() => setMlcPreviewShowYaml(!mlcPreviewShowYaml)}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
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
