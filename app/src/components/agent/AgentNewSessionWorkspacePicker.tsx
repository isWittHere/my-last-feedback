import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveNewSessionWorkspacePath, useAgentSessionSettings } from "../../agentSessionSettings";
import type { AgentSession } from "../../agent/types";
import { useAgentStore } from "../../store/agentStore";
import { useFeedbackStore } from "../../store/feedbackStore";
import { useTerminalStore } from "../../store/terminalStore";
import { normalizeWorkspacePath, workspacePathKey } from "../../workspace/workspacePaths";
import { Icon } from "../Icons";

interface WorkspacePathOption {
  value: string;
  label: string;
}

interface WorkspaceHistoryItem {
  path: string;
  updatedAt: string;
}

const RECENT_SESSION_WORKSPACE_LIMIT = 20;

export function AgentNewSessionWorkspacePicker({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const agentSessionSettings = useAgentSessionSettings();
  const setSessionWorkspace = useAgentStore((state) => state.setSessionWorkspace);
  const refreshProviderSessions = useAgentStore((state) => state.refreshProviderSessions);
  const providerSessionListStatus = useAgentStore((state) => state.providerSessionLists.opencode?.status || "idle");
  const agentSessionWorkspaceKey = useAgentStore((state) => state.sessions.map((item) => `local\t${item.id}\t${item.cwd || ""}\t${item.updatedAt || item.createdAt}`).join("\n"));
  const providerSessionWorkspaceKey = useAgentStore((state) => Object.values(state.providerSessionLists)
    .flatMap((list) => list.sessions.map((item) => `${list.providerId}\t${item.sessionId}\t${item.cwd || ""}\t${item.updatedAt || ""}`))
    .join("\n"));
  const setMlcActiveWorkspacePath = useFeedbackStore((state) => state.setMlcActiveWorkspacePath);
  const recordRecentPath = useTerminalStore((state) => state.recordRecentPath);

  const recentSessionWorkspaces = useMemo<WorkspaceHistoryItem[]>(() => {
    const byPathKey = new Map<string, WorkspaceHistoryItem>();
    const add = (path: string, updatedAt: string) => {
      const cleanPath = normalizeWorkspacePath(path);
      const key = workspacePathKey(cleanPath);
      if (!cleanPath || !key) return;
      const existing = byPathKey.get(key);
      if (!existing || updatedAt.localeCompare(existing.updatedAt) > 0) byPathKey.set(key, { path: cleanPath, updatedAt });
    };
    for (const line of `${agentSessionWorkspaceKey}\n${providerSessionWorkspaceKey}`.split("\n")) {
      if (!line) continue;
      const parts = line.split("\t");
      add(parts[2] || "", parts[3] || "");
    }
    return [...byPathKey.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, RECENT_SESSION_WORKSPACE_LIMIT);
  }, [agentSessionWorkspaceKey, providerSessionWorkspaceKey]);

  const recentSessionWorkspacePath = recentSessionWorkspaces[0]?.path || "";
  const resolvedConfiguredWorkspacePath = useMemo(
    () => resolveNewSessionWorkspacePath(agentSessionSettings, recentSessionWorkspacePath),
    [agentSessionSettings, recentSessionWorkspacePath],
  );

  const workspacePathOptions = useMemo<WorkspacePathOption[]>(() => {
    const seen = new Set<string>();
    const options: WorkspacePathOption[] = [];
    const add = (path: string) => {
      const cleanPath = normalizeWorkspacePath(path);
      const key = workspacePathKey(cleanPath);
      if (!cleanPath || !key || seen.has(key)) return;
      seen.add(key);
      options.push({ value: cleanPath, label: cleanPath });
    };
    for (const item of recentSessionWorkspaces) add(item.path);
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
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const value = normalizeWorkspacePath(session.cwd) || "";
  const displayPath = value || t("agentConsole.workspaceNotSelectedPrompt", "No workspace selected, please choose");
  const actionLabel = value ? t("agentConsole.workspaceSwitch", "Switch") : t("agentConsole.workspaceChoose", "Choose");
  return (
    <div className={`agent-header-path agent-new-session-workspace-row${open ? " open" : ""}`} ref={containerRef}>
      <Icon name="folder" size={12} />
      <span className="agent-new-session-workspace-text" title={displayPath}>
        <span className="agent-new-session-workspace-path">{displayPath}</span>
      </span>
      <button
        type="button"
        className={`agent-new-session-workspace-button${open ? " open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={t("agentConsole.workspace", "Workspace")}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {actionLabel}
      </button>
      {open ? (
        <div className="agent-new-session-workspace-panel" role="listbox" aria-label={t("agentConsole.workspace", "Workspace")}>
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
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}