import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentSessionSettings } from "../../agentSessionSettings";
import type { AgentSession } from "../../agent/types";
import { useAgentStore } from "../../store/agentStore";
import { useFeedbackStore } from "../../store/feedbackStore";
import { useTerminalStore } from "../../store/terminalStore";
import { pushWorkspacePathCandidate, type WorkspacePathCandidate } from "../../workspace/workspaceCandidates";
import { normalizeWorkspacePath, sameWorkspacePath, workspaceBasename } from "../../workspace/workspacePaths";

interface WorkspacePathOption {
  value: string;
  label: string;
  description?: string;
}

type AgentPageWorkspacePathSource = "current" | "default" | "recentSession" | "workspace" | "recent" | "caller";

export function AgentNewSessionWorkspacePicker({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const agentSessionSettings = useAgentSessionSettings();
  const setSessionWorkspace = useAgentStore((state) => state.setSessionWorkspace);
  const activeWorkspacePath = useFeedbackStore((state) => state.mlcActiveWorkspacePath || "");
  const setMlcActiveWorkspacePath = useFeedbackStore((state) => state.setMlcActiveWorkspacePath);
  const focusedComposer = useFeedbackStore((state) => state.focusedComposer);
  const recentRequestPathsKey = useFeedbackStore((state) => state.sessions.map((item) => `${item.id}\t${item.projectDirectory}\t${item.createdAt}`).join("\n"));
  const recentPaths = useTerminalStore((state) => state.recentPaths);
  const recordRecentPath = useTerminalStore((state) => state.recordRecentPath);

  const recentRequestPaths = useMemo(() => recentRequestPathsKey
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [, projectDirectory, createdAt] = line.split("\t");
      return { projectDirectory, createdAt };
    }), [recentRequestPathsKey]);

  const recentSessionWorkspacePath = useMemo(() => [...recentRequestPaths]
    .filter((item) => item.projectDirectory)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.projectDirectory || "", [recentRequestPaths]);

  const workspacePathOptions = useMemo<WorkspacePathOption[]>(() => {
    const candidates: WorkspacePathCandidate<AgentPageWorkspacePathSource>[] = [];
    const seen = new Set<string>();
    const sourceLabel = (source: AgentPageWorkspacePathSource) => {
      if (source === "current") return t("agentConsole.workspaceCurrent", "Current");
      if (source === "default") return t("agentConsole.workspaceDefault", "Default");
      if (source === "recentSession") return t("agentConsole.workspaceRecentSession", "Recent session");
      if (source === "workspace") return t("agentConsole.workspaceActive", "Workspace");
      if (source === "caller") return t("agentConsole.workspaceCaller", "Caller");
      return t("agentConsole.workspaceRecent", "Recent");
    };
    if (session.cwd) pushWorkspacePathCandidate(candidates, seen, { path: session.cwd, label: workspaceBasename(session.cwd), source: "current" });
    if (agentSessionSettings.defaultWorkspacePath) pushWorkspacePathCandidate(candidates, seen, { path: agentSessionSettings.defaultWorkspacePath, label: workspaceBasename(agentSessionSettings.defaultWorkspacePath), source: "default" });
    if (recentSessionWorkspacePath) pushWorkspacePathCandidate(candidates, seen, { path: recentSessionWorkspacePath, label: workspaceBasename(recentSessionWorkspacePath), source: "recentSession" });
    if (activeWorkspacePath) pushWorkspacePathCandidate(candidates, seen, { path: activeWorkspacePath, label: workspaceBasename(activeWorkspacePath), source: "workspace" });
    if (focusedComposer?.projectDirectory) pushWorkspacePathCandidate(candidates, seen, { path: focusedComposer.projectDirectory, label: workspaceBasename(focusedComposer.projectDirectory), source: "caller" });
    for (const recentPath of recentPaths.slice(0, 8)) {
      pushWorkspacePathCandidate(candidates, seen, { path: recentPath.path, label: recentPath.label || workspaceBasename(recentPath.path), source: "recent" });
    }
    for (const requestPath of [...recentRequestPaths].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 8)) {
      pushWorkspacePathCandidate(candidates, seen, { path: requestPath.projectDirectory, label: workspaceBasename(requestPath.projectDirectory), source: "recentSession" });
    }
    return [
      { value: "", label: t("agentConsole.workspaceEmpty", "No workspace") },
      ...candidates.map((candidate) => ({
        value: candidate.path,
        label: `${sourceLabel(candidate.source)}: ${candidate.label || workspaceBasename(candidate.path) || candidate.path}`,
        description: candidate.path,
      })),
    ];
  }, [activeWorkspacePath, agentSessionSettings.defaultWorkspacePath, focusedComposer?.projectDirectory, recentPaths, recentRequestPaths, recentSessionWorkspacePath, session.cwd, t]);

  const handleWorkspacePathSelect = useCallback((path: string) => {
    const cleanPath = normalizeWorkspacePath(path) || "";
    setSessionWorkspace(session.id, cleanPath);
    if (cleanPath) {
      recordRecentPath(cleanPath, "workspace");
      setMlcActiveWorkspacePath(cleanPath);
    }
  }, [recordRecentPath, session.id, setMlcActiveWorkspacePath, setSessionWorkspace]);

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

  const value = workspacePathOptions.some((option) => option.value === session.cwd) ? session.cwd : "";
  const displayPath = value || t("agentConsole.workspaceNotSelectedPrompt", "No workspace selected, please choose");
  const workspaceKind = value && agentSessionSettings.defaultWorkspacePath && sameWorkspacePath(value, agentSessionSettings.defaultWorkspacePath)
    ? t("agentConsole.workspaceDefaultTag", "Default workspace")
    : value && recentSessionWorkspacePath && sameWorkspacePath(value, recentSessionWorkspacePath)
      ? t("agentConsole.workspaceRecentTag", "Recent workspace")
      : value
        ? t("agentConsole.workspaceManualTag", "Workspace")
        : "";
  const actionLabel = value ? t("agentConsole.workspaceSwitch", "Switch") : t("agentConsole.workspaceChoose", "Choose");
  return (
    <div className={`agent-new-session-workspace-row${open ? " open" : ""}`} ref={containerRef}>
      <span className="agent-new-session-workspace-text" title={displayPath}>
        <span className="agent-new-session-workspace-path">{displayPath}</span>
        {workspaceKind ? <span className="agent-new-session-workspace-kind">{workspaceKind}</span> : null}
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
              {option.description ? <span className="agent-new-session-workspace-option-desc">{option.description}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}