import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentSessionSettings } from "../../agentSessionSettings";
import type { AgentSession } from "../../agent/types";
import { useAgentStore } from "../../store/agentStore";
import { useFeedbackStore } from "../../store/feedbackStore";
import { useTerminalStore } from "../../store/terminalStore";
import { pushWorkspacePathCandidate, type WorkspacePathCandidate } from "../../workspace/workspaceCandidates";
import { normalizeWorkspacePath, workspaceBasename } from "../../workspace/workspacePaths";
import { AppSelect, type AppSelectOption } from "../AppSelect";
import { AgentComposer } from "./AgentComposer";
import { AgentCurrentStatusRow } from "./AgentCurrentStatusRow";
import { AgentMessageTimeline } from "./AgentMessageTimeline";
import { AgentTaskPanel } from "./AgentTaskPanel";

const INPUT_DEFAULT = 0.28;
const INPUT_AUTO_MAX = 0.58;
const PANEL_MIN_SIZE = 0.08;
type AgentPageWorkspacePathSource = "current" | "default" | "recentSession" | "workspace" | "recent" | "caller";

function AgentNewSessionWorkspacePicker({ session }: { session: AgentSession }) {
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

  const showWorkspacePathSelector = !session.providerSessionId && session.providerSessionState === "provisional" && (session.status === "idle" || session.status === "error");
  if (!showWorkspacePathSelector) return null;

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

function AgentStatusPanelSlot({ session }: { session: AgentSession }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const updateHeight = () => setHeight(node.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [session.id]);

  const open = height > 0;

  return (
    <div className="agent-session-status-stack" data-open={open ? "true" : "false"} aria-hidden={open ? undefined : true}>
      <div ref={innerRef} className="agent-session-status-stack-inner">
        <AgentCurrentStatusRow session={session} />
        <AgentTaskPanel session={session} />
      </div>
    </div>
  );
}

export function AgentConsolePanel() {
  const activeSession = useAgentStore((state) => state.getActiveSession());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputPanelRef = useRef<HTMLDivElement>(null);
  const [panelSizes, setPanelSizes] = useState([1 - INPUT_DEFAULT, INPUT_DEFAULT]);
  const panelSizesRef = useRef(panelSizes);
  const resizingRef = useRef<{ index: number; startY: number; startSizes: number[] } | null>(null);
  const userResizedRef = useRef(false);

  panelSizesRef.current = panelSizes;

  const handleMouseDown = useCallback((index: number, event: React.MouseEvent) => {
    event.preventDefault();
    userResizedRef.current = true;
    resizingRef.current = { index, startY: event.clientY, startSizes: [...panelSizesRef.current] };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current || !containerRef.current) return;
      const { index: currentIndex, startY, startSizes } = resizingRef.current;
      const containerHeight = containerRef.current.getBoundingClientRect().height;
      if (containerHeight <= 0) return;
      const delta = (moveEvent.clientY - startY) / containerHeight;
      const combined = startSizes[currentIndex] + startSizes[currentIndex + 1];
      let previous = startSizes[currentIndex] + delta;
      let next = startSizes[currentIndex + 1] - delta;
      if (previous < PANEL_MIN_SIZE) {
        previous = PANEL_MIN_SIZE;
        next = combined - PANEL_MIN_SIZE;
      }
      if (next < PANEL_MIN_SIZE) {
        next = PANEL_MIN_SIZE;
        previous = combined - PANEL_MIN_SIZE;
      }
      const newSizes = [...startSizes];
      newSizes[currentIndex] = previous;
      newSizes[currentIndex + 1] = next;
      setPanelSizes(newSizes);
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  useEffect(() => {
    if (!activeSession || userResizedRef.current) return;
    const panel = inputPanelRef.current;
    const container = containerRef.current;
    if (!panel || !container) return;
    const composerInput = panel.querySelector<HTMLElement>("[data-composer-input='true']");
    if (!composerInput) return;
    const containerHeight = container.getBoundingClientRect().height;
    if (containerHeight <= 0) return;
    const extraPixels = composerInput.scrollHeight - composerInput.clientHeight;
    if (extraPixels <= 4) return;
    const nextInputSize = Math.min(panelSizes[1] + extraPixels / containerHeight, INPUT_AUTO_MAX);
    if (nextInputSize > panelSizes[1]) {
      setPanelSizes([1 - nextInputSize, nextInputSize]);
    }
  }, [activeSession, activeSession?.draft, activeSession?.testLogText, activeSession?.gitAction, activeSession?.images.length, activeSession?.mlcAttachments.length, activeSession?.webAttachments.length, panelSizes]);

  if (!activeSession) return null;

  return (
    <div className="agent-console-panel">
      <div ref={containerRef} className="agent-console-resizable-body">
        <div className="agent-console-timeline-region panel-card" style={{ flex: `0 0 calc(${panelSizes[0] * 100}% - 1px)`, minHeight: 48 }}>
          <AgentNewSessionWorkspacePicker session={activeSession} />
          <AgentMessageTimeline session={activeSession} />
          <AgentStatusPanelSlot session={activeSession} />
        </div>
        <div className="resize-handle" onMouseDown={(event) => handleMouseDown(0, event)} />
        <div ref={inputPanelRef} className="agent-console-input-region panel-card panel-feedback panel-feedback-editable" data-tooltip-placement="top" style={{ flex: `0 0 ${panelSizes[1] * 100}%`, minHeight: 92, position: "relative" }}>
          <div className="agent-composer-area">
            <AgentComposer session={activeSession} />
          </div>
        </div>
      </div>
    </div>
  );
}