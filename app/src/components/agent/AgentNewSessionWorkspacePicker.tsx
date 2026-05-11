import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { resolveNewSessionWorkspacePath, useAgentSessionSettings } from "../../agentSessionSettings";
import type { AgentSession } from "../../agent/types";
import { collectRecentAgentWorkspaces, type AgentWorkspaceHistoryItem } from "../../agent/workspaceHistory";
import { useAgentStore } from "../../store/agentStore";
import { useFeedbackStore } from "../../store/feedbackStore";
import { useTerminalStore } from "../../store/terminalStore";
import { normalizeWorkspacePath, sameWorkspacePath, workspacePathKey } from "../../workspace/workspacePaths";
import { Icon } from "../Icons";
import { timeAgo } from "../timeUtils";

interface WorkspacePathOption {
  value: string;
  label: string;
  updatedAt: string;
}

const RECENT_SESSION_WORKSPACE_LIMIT = 20;

export function AgentNewSessionWorkspacePicker({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const [manualWorkspacePath, setManualWorkspacePath] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const agentSessionSettings = useAgentSessionSettings();
  const setSessionWorkspace = useAgentStore((state) => state.setSessionWorkspace);
  const refreshProviderSessions = useAgentStore((state) => state.refreshProviderSessions);
  const providerSessionListStatus = useAgentStore((state) => state.providerSessionLists.opencode?.status || "idle");
  const agentSessions = useAgentStore((state) => state.sessions);
  const providerSessionLists = useAgentStore((state) => state.providerSessionLists);
  const setMlcActiveWorkspacePath = useFeedbackStore((state) => state.setMlcActiveWorkspacePath);
  const recordRecentPath = useTerminalStore((state) => state.recordRecentPath);

  const recentSessionWorkspaces = useMemo<AgentWorkspaceHistoryItem[]>(() => {
    return collectRecentAgentWorkspaces(agentSessions, Object.values(providerSessionLists), RECENT_SESSION_WORKSPACE_LIMIT);
  }, [agentSessions, providerSessionLists]);

  const recentSessionWorkspacePath = recentSessionWorkspaces[0]?.path || "";
  const resolvedConfiguredWorkspacePath = useMemo(
    () => resolveNewSessionWorkspacePath(agentSessionSettings, recentSessionWorkspacePath),
    [agentSessionSettings, recentSessionWorkspacePath],
  );

  const workspacePathOptions = useMemo<WorkspacePathOption[]>(() => {
    const seen = new Set<string>();
    const options: WorkspacePathOption[] = [];
    const add = (path: string, updatedAt: string) => {
      const cleanPath = normalizeWorkspacePath(path);
      const key = workspacePathKey(cleanPath);
      if (!cleanPath || !key || seen.has(key)) return;
      seen.add(key);
      options.push({ value: cleanPath, label: cleanPath, updatedAt });
    };
    for (const item of recentSessionWorkspaces) add(item.path, item.updatedAt);
    return options;
  }, [recentSessionWorkspaces]);

  const handleWorkspacePathSelect = useCallback((path: string) => {
    const cleanPath = normalizeWorkspacePath(path) || "";
    setSessionWorkspace(session.id, cleanPath);
    if (cleanPath) {
      recordRecentPath(cleanPath, "workspace");
      setMlcActiveWorkspacePath(cleanPath);
    }
  }, [recordRecentPath, session.id, setMlcActiveWorkspacePath, setSessionWorkspace]);

  const submitManualWorkspacePath = useCallback(() => {
    const cleanPath = normalizeWorkspacePath(manualWorkspacePath) || "";
    if (!cleanPath) return;
    handleWorkspacePathSelect(cleanPath);
    setManualWorkspacePath("");
    setOpen(false);
  }, [handleWorkspacePathSelect, manualWorkspacePath]);

  const updatePanelPosition = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const maxWidth = Math.max(220, window.innerWidth - margin * 2);
    const width = Math.min(420, maxWidth);
    const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin));
    const maxHeight = Math.min(320, Math.max(160, window.innerHeight - margin * 2));
    const belowTop = rect.bottom + 5;
    const top = belowTop + maxHeight <= window.innerHeight - margin
      ? belowTop
      : Math.max(margin, rect.top - 5 - maxHeight);
    setPanelStyle({ left, top, width, maxHeight });
  }, []);

  useEffect(() => {
    if (agentSessionSettings.newSessionWorkspacePathMode !== "recentSession") return;
    if (recentSessionWorkspaces.length > 0) return;
    if (providerSessionListStatus === "loading" || providerSessionListStatus === "ready") return;
    void refreshProviderSessions("opencode").catch(() => undefined);
  }, [agentSessionSettings.newSessionWorkspacePathMode, providerSessionListStatus, recentSessionWorkspaces.length, refreshProviderSessions]);

  useEffect(() => {
    if (session.providerId !== "opencode") return;
    if (session.cwd || session.messages.length > 0 || !resolvedConfiguredWorkspacePath) return;
    setSessionWorkspace(session.id, resolvedConfiguredWorkspacePath);
    setMlcActiveWorkspacePath(resolvedConfiguredWorkspacePath);
  }, [resolvedConfiguredWorkspacePath, session.cwd, session.id, session.messages.length, session.providerId, setMlcActiveWorkspacePath, setSessionWorkspace]);

  useEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handleLayoutChange = () => updatePanelPosition();
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleLayoutChange);
    window.addEventListener("scroll", handleLayoutChange, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleLayoutChange);
      window.removeEventListener("scroll", handleLayoutChange, true);
    };
  }, [open, updatePanelPosition]);

  useLayoutEffect(() => {
    if (open) updatePanelPosition();
  }, [open, updatePanelPosition, workspacePathOptions.length]);

  const value = normalizeWorkspacePath(session.cwd) || "";
  const displayPath = value || t("agentConsole.workspaceNotSelectedPrompt", "No workspace selected, please choose");
  const workspaceKind = value && recentSessionWorkspacePath && sameWorkspacePath(value, recentSessionWorkspacePath)
    ? t("agentConsole.workspaceRecentTag", "Recent workspace")
    : "";
  const canSubmitManualWorkspacePath = Boolean(normalizeWorkspacePath(manualWorkspacePath));
  const panel = open ? (
    <div ref={panelRef} className="agent-new-session-workspace-panel" style={panelStyle} role="listbox" aria-label={t("agentConsole.workspace", "Workspace")}>
      <form
        className="agent-new-session-workspace-manual-row"
        onSubmit={(event) => {
          event.preventDefault();
          submitManualWorkspacePath();
        }}
      >
        <input
          className="agent-new-session-workspace-manual-input"
          value={manualWorkspacePath}
          onChange={(event) => setManualWorkspacePath(event.target.value)}
          placeholder={t("agentConsole.workspacePathInputPlaceholder", "Enter workspace path")}
          aria-label={t("agentConsole.workspacePathInputPlaceholder", "Enter workspace path")}
        />
        <button
          type="submit"
          className="agent-new-session-workspace-manual-submit"
          disabled={!canSubmitManualWorkspacePath}
          aria-label={t("agentConsole.workspacePathInputSubmit", "Use workspace path")}
          title={t("agentConsole.workspacePathInputSubmit", "Use workspace path")}
        >
          <Icon name="arrow-bend-down-right" size={13} />
        </button>
      </form>
      {workspacePathOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`agent-new-session-workspace-option${option.value === value ? " selected" : ""}`}
          role="option"
          aria-selected={option.value === value}
          onClick={() => {
            handleWorkspacePathSelect(option.value);
            setOpen(false);
          }}
        >
          <span className="agent-new-session-workspace-option-label">{option.label}</span>
          <span className="agent-new-session-workspace-option-time">{timeAgo(option.updatedAt, t)}</span>
        </button>
      ))}
    </div>
  ) : null;
  return (
    <div className={`agent-header-path agent-new-session-workspace-row${open ? " open" : ""}`} ref={containerRef}>
      <Icon name="folder" size={12} />
      <button
        type="button"
        className={`agent-new-session-workspace-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={t("agentConsole.workspace", "Workspace")}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="agent-new-session-workspace-path">{displayPath}</span>
        {workspaceKind ? <span className="agent-new-session-workspace-kind">{workspaceKind}</span> : null}
      </button>
      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
}