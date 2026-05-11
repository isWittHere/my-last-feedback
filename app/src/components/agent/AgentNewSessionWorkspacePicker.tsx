import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAgentSessionSettings } from "../../agentSessionSettings";
import type { AgentSession } from "../../agent/types";
import { useAgentStore } from "../../store/agentStore";
import { useFeedbackStore } from "../../store/feedbackStore";
import { useTerminalStore } from "../../store/terminalStore";
import { pushWorkspacePathCandidate, type WorkspacePathCandidate } from "../../workspace/workspaceCandidates";
import { normalizeWorkspacePath, workspaceBasename } from "../../workspace/workspacePaths";
import { AppSelect, type AppSelectOption } from "../AppSelect";

type AgentPageWorkspacePathSource = "current" | "default" | "recentSession" | "workspace" | "recent" | "caller";

export function AgentNewSessionWorkspacePicker({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
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

  const workspacePathOptions = useMemo<AppSelectOption<string>[]>(() => {
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

  const value = workspacePathOptions.some((option) => option.value === session.cwd) ? session.cwd : "";
  return (
    <div className="agent-new-session-workspace-row">
      <span className="agent-new-session-workspace-label">{t("agentConsole.workspace", "Workspace")}</span>
      <AppSelect
        value={value}
        options={workspacePathOptions}
        onChange={handleWorkspacePathSelect}
        ariaLabel={t("agentConsole.workspace", "Workspace")}
        className="agent-new-session-workspace-select"
      />
    </div>
  );
}