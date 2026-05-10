import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getAgentProviderSessionIdentity, getAgentSessionIdentity, type AgentSessionIdentity } from "../../agent/sessionIdentity";
import type { AgentProviderId, AgentSession } from "../../agent/types";
import { resolveWorkspaceIdentity, type WorkspaceColorCandidate } from "../../identity/workspaceIdentity";
import { useAgentStore } from "../../store/agentStore";
import { useFeedbackStore } from "../../store/feedbackStore";
import { useTerminalStore, type TerminalPathSource } from "../../store/terminalStore";
import { pushWorkspacePathCandidate, type WorkspacePathCandidate } from "../../workspace/workspaceCandidates";
import { normalizeWorkspacePath, workspacePathKey } from "../../workspace/workspacePaths";
import { Icon } from "../Icons";
import { IdenticonAvatar } from "../IdenticonAvatar";
import { OpenCodeInitialAvatar } from "./OpenCodeInitialAvatar";
import { getTimeGroup, timeAgo, type TimeGroup } from "../timeUtils";

const GROUP_ORDER: TimeGroup[] = ["today", "yesterday", "lastWeek", "earlier"];
type AgentWorkspacePathSource = TerminalPathSource | "agent" | "provider";

type AgentWorkspacePathCandidate = WorkspacePathCandidate<AgentWorkspacePathSource>;

function AgentSessionGroup({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="session-group">
      <button className="session-group-header" onClick={() => setCollapsed((value) => !value)}>
        <Icon name="chevron-down" size={8} className="app-disclosure-icon" style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }} />
        <span>{label}</span>
        <span className="session-group-count">{count}</span>
      </button>
      {!collapsed && children}
    </div>
  );
}

function shortId(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function folderNameFromPath(value?: string | null): string | null {
  const workspacePath = normalizeWorkspacePath(value);
  if (!workspacePath) return null;
  const normalized = workspacePath.replace(/\/+$/, "");
  return normalized.split("/").filter(Boolean).pop() || normalized || null;
}

function agentPathSourceLabel(source: AgentWorkspacePathSource, translate: (key: string, defaultValue: string) => string, callerName?: string): string {
  if (source === "recent") return translate("agentSessions.pathSourceRecent", "Recent");
  if (source === "activeSession") return translate("agentSessions.pathSourceActiveSession", "Active request");
  if (source === "workspace") return translate("agentSessions.pathSourceWorkspace", "Workspace");
  if (source === "caller") return callerName ? `${translate("agentSessions.pathSourceCaller", "Caller")}: ${callerName}` : translate("agentSessions.pathSourceCaller", "Caller");
  if (source === "agent") return translate("agentSessions.pathSourceAgent", "Agent");
  if (source === "provider") return translate("agentSessions.pathSourceSession", "Session");
  return translate("agentSessions.pathSourceFallback", "Fallback");
}

function toTerminalPathSource(source: AgentWorkspacePathSource): TerminalPathSource {
  if (source === "caller" || source === "activeSession" || source === "workspace" || source === "fallback") return source;
  return "recent";
}

function formatFullTimestamp(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function sessionMetaTitle(timeValue?: string | null, cwd?: string | null): string | undefined {
  const timestamp = formatFullTimestamp(timeValue);
  const workspacePath = normalizeWorkspacePath(cwd);
  return [timestamp, workspacePath].filter(Boolean).join("\n") || undefined;
}

function providerLabel(providerId: AgentProviderId): string {
  return providerId === "opencode" ? "OpenCode" : providerId;
}

function hasLocalSessionActivity(session: AgentSession): boolean {
  return Boolean(
    session.messages.length > 0 ||
    session.draft.trim() ||
    session.testLogText.trim() ||
    session.gitAction ||
    session.images.length > 0 ||
    session.mlcAttachments.length > 0 ||
    session.webAttachments.length > 0
  );
}

function isUnstartedLocalSession(session: AgentSession): boolean {
  return (!session.providerSessionId || session.providerSessionState === "provisional") && !hasLocalSessionActivity(session);
}

function sessionStatusTone(status: AgentSession["status"]): string {
  if (status === "running" || status === "starting" || status === "cancelling") return "running";
  if (status === "error") return "error";
  if (status === "disconnected") return "muted";
  return "ready";
}

function HistorySessionAvatar({ identity, sessionId, status }: { identity: AgentSessionIdentity; sessionId?: string; status?: AgentSession["status"] }) {
  const sourceCode = identity.code || identity.providerName;
  const title = sessionId ? `${identity.name} ${sourceCode}\n${sessionId}` : `${identity.name} ${sourceCode}`;
  return (
    <span className="agent-session-history-avatar" title={title}>
      {identity.code ? (
        <IdenticonAvatar alias={identity.code} color={identity.color} size={16} />
      ) : (
        <OpenCodeInitialAvatar size={16} color={identity.color} />
      )}
      {status ? <span className={`agent-session-history-status-dot ${sessionStatusTone(status)}`} /> : null}
    </span>
  );
}

export function AgentSessionManagerPanel() {
  const { t, i18n } = useTranslation();
  const sessions = useAgentStore((state) => state.sessions);
  const activeSessionId = useAgentStore((state) => state.activeSessionId);
  const providerSessionLists = useAgentStore((state) => state.providerSessionLists);
  const createNewSession = useAgentStore((state) => state.createNewSession);
  const setActiveSession = useAgentStore((state) => state.setActiveSession);
  const refreshProviderSessions = useAgentStore((state) => state.refreshProviderSessions);
  const restoreProviderSession = useAgentStore((state) => state.restoreProviderSession);
  const renameProviderSession = useAgentStore((state) => state.renameProviderSession);
  const deleteProviderSession = useAgentStore((state) => state.deleteProviderSession);
  const recentPaths = useTerminalStore((state) => state.recentPaths);
  const lastUsedCwd = useTerminalStore((state) => state.lastUsedCwd);
  const recordRecentPath = useTerminalStore((state) => state.recordRecentPath);
  const focusedComposer = useFeedbackStore((state) => state.focusedComposer);
  const openDockTab = useFeedbackStore((state) => state.openDockTab);
  const activeWorkspacePath = useFeedbackStore((state) => state.mlcActiveWorkspacePath || "");
  const callerDataKey = useFeedbackStore((state) => state.callers.map((caller) => `${caller.id}\t${caller.name}\t${caller.alias || ""}\t${caller.workspaceKey || ""}\t${caller.color || ""}`).join("\n"));
  const recentRequestPathsKey = useFeedbackStore((state) => state.sessions.map((session) => `${session.id}\t${session.projectDirectory}\t${session.callerId}\t${session.createdAt}`).join("\n"));
  const pathMenuRef = useRef<HTMLDivElement>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pathMenuOpen, setPathMenuOpen] = useState(false);
  const autoLoadedProvidersRef = useRef(new Set<AgentProviderId>());
  const refreshRunIdRef = useRef(0);

  const activeSession = sessions.find((session) => session.id === activeSessionId) || null;

  const providers = useMemo(() => {
    const seen = new Set<AgentProviderId>();
    for (const session of sessions) seen.add(session.providerId);
    if (seen.size === 0) seen.add("opencode");
    return [...seen];
  }, [sessions]);

  useEffect(() => {
    for (const providerId of providers) {
      const listState = providerSessionLists[providerId];
      if (autoLoadedProvidersRef.current.has(providerId) || listState?.status === "loading" || listState?.status === "ready") continue;
      autoLoadedProvidersRef.current.add(providerId);
      setBusyAction((current) => current || `${providerId}:autoload`);
      setActionError(null);
      void refreshProviderSessions(providerId)
        .catch((error) => {
          autoLoadedProvidersRef.current.delete(providerId);
          setActionError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          setBusyAction((current) => current === `${providerId}:autoload` ? null : current);
        });
    }
  }, [providers, providerSessionLists, refreshProviderSessions]);

  useEffect(() => {
    if (!pathMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (pathMenuRef.current?.contains(event.target as Node)) return;
      setPathMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPathMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pathMenuOpen]);

  const callerData = useMemo(() => new Map(callerDataKey
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, name, alias, workspaceKey, color] = line.split("\t");
      return [id, { name: name || id, alias: alias || "", workspaceKey: workspaceKey || "", color: color || "" }] as const;
    })), [callerDataKey]);

  const recentRequestPaths = useMemo(() => recentRequestPathsKey
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, projectDirectory, callerId, createdAt] = line.split("\t");
      return { id, projectDirectory, callerId, createdAt };
    }), [recentRequestPathsKey]);

  const workspaceColorCandidates = useMemo<WorkspaceColorCandidate[]>(() => recentRequestPaths.map((requestSession) => {
    const caller = callerData.get(requestSession.callerId);
    return {
      workspaceKey: caller?.workspaceKey,
      workspacePath: requestSession.projectDirectory,
      color: caller?.color,
    };
  }), [callerData, recentRequestPaths]);

  const pathCandidates = useMemo(() => {
    const candidates: AgentWorkspacePathCandidate[] = [];
    const seen = new Set<string>();
    if (activeSession?.cwd) pushWorkspacePathCandidate(candidates, seen, { path: activeSession.cwd, source: "agent" });
    if (lastUsedCwd) pushWorkspacePathCandidate(candidates, seen, { path: lastUsedCwd, source: "recent" });
    for (const recentPath of recentPaths) {
      pushWorkspacePathCandidate(candidates, seen, {
        path: recentPath.path,
        label: recentPath.label,
        source: recentPath.source,
        callerName: recentPath.callerName,
        lastUsedAt: recentPath.lastUsedAt,
      });
    }
    if (focusedComposer?.projectDirectory) {
      pushWorkspacePathCandidate(candidates, seen, {
        path: focusedComposer.projectDirectory,
        source: "caller",
        callerName: callerData.get(focusedComposer.callerId)?.name,
        lastUsedAt: focusedComposer.focusedAt,
      });
    }
    if (activeWorkspacePath) pushWorkspacePathCandidate(candidates, seen, { path: activeWorkspacePath, source: "workspace" });
    for (const session of [...sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 10)) {
      pushWorkspacePathCandidate(candidates, seen, { path: session.cwd, source: "agent", lastUsedAt: session.updatedAt });
    }
    for (const listState of Object.values(providerSessionLists)) {
      for (const providerSession of (listState?.sessions || []).slice(0, 12)) {
        pushWorkspacePathCandidate(candidates, seen, { path: providerSession.cwd || "", source: "provider", lastUsedAt: providerSession.updatedAt });
      }
    }
    for (const requestSession of [...recentRequestPaths].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 10)) {
      pushWorkspacePathCandidate(candidates, seen, {
        path: requestSession.projectDirectory,
        source: "caller",
        callerName: callerData.get(requestSession.callerId)?.name,
        lastUsedAt: requestSession.createdAt,
      });
    }
    return candidates;
  }, [activeSession?.cwd, activeWorkspacePath, callerData, focusedComposer, lastUsedCwd, providerSessionLists, recentPaths, recentRequestPaths, sessions]);

  const defaultCwd = activeSession?.cwd || lastUsedCwd || pathCandidates[0]?.path || null;

  const showAgentPanel = useCallback(() => {
    openDockTab("agentConsole", "rightPage");
  }, [openDockTab]);

  const createFromPath = useCallback((cwd: string | null, source: AgentWorkspacePathSource = "recent") => {
    const cleanPath = cwd?.trim() || null;
    const sessionId = createNewSession({ cwd: cleanPath, workspaceKey: workspacePathKey(cleanPath || "") });
    if (cleanPath) recordRecentPath(cleanPath, toTerminalPathSource(source));
    setPathMenuOpen(false);
    showAgentPanel();
    return sessionId;
  }, [createNewSession, recordRecentPath, showAgentPanel]);

  const chooseWorkspaceFolder = useCallback(async () => {
    setActionError(null);
    try {
      const selectedPath = await invoke<string | null>("select_directory", {
        title: t("agentSessions.chooseWorkspaceFolder", "Choose workspace folder"),
        initialDirectory: defaultCwd || null,
      });
      if (typeof selectedPath === "string" && selectedPath.trim()) createFromPath(selectedPath, "workspace");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }, [createFromPath, defaultCwd, t]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyAction(key);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const forceRefreshSessions = useCallback(async () => {
    const runId = refreshRunIdRef.current + 1;
    refreshRunIdRef.current = runId;
    autoLoadedProvidersRef.current.clear();
    setRefreshing(true);
    setActionError(null);
    try {
      await Promise.all(providers.map((providerId) => refreshProviderSessions(providerId)));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      if (refreshRunIdRef.current === runId) setRefreshing(false);
    }
  }, [providers, refreshProviderSessions]);

  const errorLabel = (message: string | undefined) => {
    if (!message) return "";
    return message;
  };

  const renderPathButton = (candidate: AgentWorkspacePathCandidate) => (
    <button key={`${candidate.source}-${candidate.path}`} type="button" className="agent-session-manager-path-item" onClick={() => createFromPath(candidate.path, candidate.source)}>
      <Icon name={candidate.source === "workspace" ? "folder-open" : candidate.source === "agent" ? "message" : "folder"} size={12} />
      <span className="agent-session-manager-path-main">
        <span>{candidate.label || folderNameFromPath(candidate.path) || candidate.path}</span>
        <small>{candidate.path}</small>
      </span>
      <em>{agentPathSourceLabel(candidate.source, t, candidate.callerName)}</em>
    </button>
  );

  return (
    <div className="agent-session-manager-panel">
      <div className="agent-session-manager-toolbar">
        <div ref={pathMenuRef} className="agent-session-manager-new-split">
          <button type="button" className="agent-session-manager-new-button" onClick={() => createFromPath(defaultCwd, "recent")} title={defaultCwd || t("agentSessions.newSession", "New session")}>
            <Icon name="plus" size={12} />
            <span>{t("agentSessions.newSession", "New session")}</span>
          </button>
          <button
            type="button"
            className="agent-session-manager-new-caret"
            onClick={() => setPathMenuOpen((value) => !value)}
            aria-label={t("agentSessions.chooseWorkspacePath", "Choose workspace path")}
            aria-haspopup="menu"
            aria-expanded={pathMenuOpen}
            title={t("agentSessions.chooseWorkspacePath", "Choose workspace path")}
          >
            <Icon name="chevron-down" size={12} />
          </button>
          {pathMenuOpen ? (
            <div className="agent-session-manager-path-menu" data-preview-overlay>
              {pathCandidates.length > 0 ? pathCandidates.slice(0, 10).map(renderPathButton) : (
                <div className="agent-session-manager-path-empty">{t("agentSessions.noPathCandidates", "No recent paths")}</div>
              )}
              <button type="button" className="agent-session-manager-path-item browse" onClick={() => void chooseWorkspaceFolder()}>
                <Icon name="folder-open" size={12} />
                <span className="agent-session-manager-path-main">
                  <span>{t("agentSessions.browseWorkspace", "Choose folder...")}</span>
                  <small>{t("agentSessions.browseWorkspaceDesc", "Create the session in another workspace")}</small>
                </span>
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="agent-session-manager-refresh-button"
          onClick={() => void forceRefreshSessions()}
          aria-busy={refreshing}
          title={t("agentSessions.refresh", "Refresh sessions")}
          aria-label={t("agentSessions.refresh", "Refresh sessions")}
        >
          <Icon name={refreshing ? "spinner" : "refresh"} size={12} />
        </button>
      </div>

      {actionError ? (
        <div className="agent-session-manager-error"><Icon name="warning" size={13} />{errorLabel(actionError)}</div>
      ) : null}

      <div className="agent-session-manager-provider-list">
        {providers.map((providerId) => {
          const providerSessions = sessions.filter((session) => session.providerId === providerId);
          const meaningfulProviderSessionIds = new Set(providerSessions
            .filter((session) => session.providerSessionId && session.providerSessionState !== "provisional")
            .map((session) => session.providerSessionId));
          const provisionalProviderSessionIds = new Set(providerSessions
            .filter((session) => session.providerSessionId && session.providerSessionState === "provisional")
            .map((session) => session.providerSessionId));
          const listState = providerSessionLists[providerId];
          const remoteSessions = listState?.sessions || [];
          const visibleRemoteSessions = remoteSessions.filter((item) => {
            if (meaningfulProviderSessionIds.has(item.sessionId)) return true;
            if (provisionalProviderSessionIds.has(item.sessionId)) return false;
            return true;
          });
          const loadMoreKey = `${providerId}:more`;
          const localOnlySessions = providerSessions.filter((session) => {
            if (isUnstartedLocalSession(session)) return false;
            if (!session.providerSessionId) return true;
            return !visibleRemoteSessions.some((item) => item.sessionId === session.providerSessionId);
          });
          const sessionRows = [
            ...visibleRemoteSessions.map((item) => ({ type: "provider" as const, item, updatedAt: item.updatedAt })),
            ...localOnlySessions.map((session) => ({ type: "local" as const, session, updatedAt: session.updatedAt })),
          ].sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));

          return (
            <section key={providerId} className="agent-session-manager-provider">
              {listState?.status === "unsupported" ? (
                <div className="agent-session-manager-empty">{t("agentSessions.listUnavailable", "Session list is unavailable.")}</div>
              ) : listState?.status === "error" ? (
                <div className="agent-session-manager-empty error">{errorLabel(listState.error)}</div>
              ) : listState?.status === "loading" && listState.sessions.length === 0 ? (
                <div className="agent-session-manager-empty">{t("agentSessions.loading", "Loading sessions...")}</div>
              ) : sessionRows.length ? (
                <>
                  {(() => {
                    const groupLabels: Record<TimeGroup, string> = {
                      today: t("sidebar.groupToday", "Today"),
                      yesterday: t("sidebar.groupYesterday", "Yesterday"),
                      lastWeek: t("sidebar.groupLastWeek", "Past week"),
                      earlier: t("sidebar.groupEarlier", "Earlier"),
                    };
                    const groups = new Map<TimeGroup, typeof sessionRows>();
                    for (const row of sessionRows) {
                      const g = getTimeGroup(row.updatedAt || "");
                      if (!groups.has(g)) groups.set(g, []);
                      groups.get(g)!.push(row);
                    }
                    return GROUP_ORDER
                      .filter(g => groups.has(g))
                      .map(g => (
                        <AgentSessionGroup key={g} label={groupLabels[g]} count={groups.get(g)!.length}>
                          {groups.get(g)!.map((row) => {
                            if (row.type === "local") {
                              const session = row.session;
                              const workspaceIdentity = resolveWorkspaceIdentity({ workspacePath: session.cwd, workspaceKey: session.workspaceKey, candidates: workspaceColorCandidates });
                              const identity = getAgentSessionIdentity(session, i18n.language.startsWith("zh") ? "zh" : "en", { color: workspaceIdentity.color });
                              const folderName = folderNameFromPath(session.cwd);
                              const metaTitle = sessionMetaTitle(session.updatedAt || session.createdAt, session.cwd);
                              return (
                                <button
                                  key={session.id}
                                  type="button"
                                  className={`session-item${session.id === activeSessionId ? " session-item-active" : ""}`}
                                  onClick={() => {
                                    setActiveSession(session.id);
                                    showAgentPanel();
                                  }}
                                >
                                  <div className="session-item-row1">
                                    <HistorySessionAvatar identity={identity} sessionId={session.providerSessionId} status={session.status} />
                                    <span className="session-item-name">{identity.code ? session.title : identity.name}</span>
                                  </div>
                                  <div className="session-item-row2">
                                    <span className="session-item-time" title={metaTitle}>{timeAgo(session.updatedAt || session.createdAt, t)}</span>
                                    {folderName ? <span className="session-item-folder" title={metaTitle}>{folderName}</span> : null}
                                  </div>
                                </button>
                              );
                            }
                            const item = row.item;
                            const restoreKey = `${providerId}:restore:${item.sessionId}`;
                            const renameKey = `${providerId}:rename:${item.sessionId}`;
                            const deleteKey = `${providerId}:delete:${item.sessionId}`;
                            const boundSession = providerSessions.find((session) => session.providerSessionId === item.sessionId && session.providerSessionState !== "provisional");
                            const workspacePath = item.cwd || boundSession?.cwd;
                            const workspaceIdentity = resolveWorkspaceIdentity({ workspacePath, workspaceKey: boundSession?.workspaceKey, candidates: workspaceColorCandidates });
                            const identityLanguage = i18n.language.startsWith("zh") ? "zh" : "en";
                            const identity = boundSession
                              ? getAgentSessionIdentity(boundSession, identityLanguage, { color: workspaceIdentity.color })
                              : getAgentProviderSessionIdentity(providerId, item.sessionId, identityLanguage, providerLabel(providerId), { color: workspaceIdentity.color });
                            const folderName = folderNameFromPath(workspacePath);
                            const metaTitle = sessionMetaTitle(item.updatedAt, workspacePath);
                            const isActiveRemoteSession = boundSession?.id === activeSessionId;
                            const restoreTitle = boundSession
                              ? t("agentSessions.switchSession", "Switch session")
                              : t("agentSessions.restore", "Restore session");
                            const handleRestore = () => {
                              if (busyAction !== null) return;
                              showAgentPanel();
                              void runAction(restoreKey, () => restoreProviderSession(providerId, item.sessionId));
                            };
                            const handleDelete = () => {
                              if (busyAction !== null) return;
                              const confirmed = window.confirm(t("agentSessions.deleteConfirm", "Delete this session?"));
                              if (!confirmed) return;
                              void runAction(deleteKey, () => deleteProviderSession(providerId, item.sessionId));
                            };
                            const handleRename = () => {
                              if (busyAction !== null) return;
                              const nextTitle = window.prompt(t("agentSessions.renamePrompt", "Rename session"), item.title || "");
                              if (nextTitle === null || nextTitle.trim() === "" || nextTitle.trim() === (item.title || "")) return;
                              void runAction(renameKey, () => renameProviderSession(providerId, item.sessionId, nextTitle));
                            };
                            return (
                              <div
                                key={item.sessionId}
                                className={`session-item${isActiveRemoteSession ? " session-item-active" : ""}`}
                                role="button"
                                tabIndex={0}
                                aria-label={restoreTitle}
                                onClick={handleRestore}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    handleRestore();
                                  }
                                }}
                              >
                                <div className="session-item-row1">
                                  <HistorySessionAvatar identity={identity} sessionId={item.sessionId} />
                                  <span className="session-item-name">{item.title || shortId(item.sessionId)}</span>
                                </div>
                                <div className="session-item-row2">
                                  <span className="session-item-time" title={metaTitle}>{timeAgo(item.updatedAt || "", t)}</span>
                                  {folderName ? <span className="session-item-folder" title={metaTitle}>{folderName}</span> : null}
                                  <span className="session-item-actions">
                                    <button
                                      type="button"
                                      className="session-item-cancel"
                                      onClick={(event) => { event.stopPropagation(); handleRename(); }}
                                      disabled={busyAction !== null}
                                      title={t("agentSessions.rename", "Rename session")}
                                    >
                                      <Icon name={busyAction === renameKey ? "spinner" : "edit"} size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      className="session-item-delete"
                                      onClick={(event) => { event.stopPropagation(); handleDelete(); }}
                                      disabled={busyAction !== null}
                                      title={t("agentSessions.delete", "Delete session")}
                                    >
                                      <Icon name={busyAction === deleteKey ? "spinner" : "trash"} size={11} />
                                    </button>
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </AgentSessionGroup>
                      ));
                  })()}
                  {listState?.nextCursor ? (
                    <button
                      type="button"
                      className="agent-session-manager-load-more"
                      onClick={() => runAction(loadMoreKey, () => refreshProviderSessions(providerId, listState.nextCursor))}
                      disabled={busyAction !== null}
                    >
                      <Icon name={busyAction === loadMoreKey ? "spinner" : "chevron-down"} size={12} />
                      {t("agentSessions.loadMore", "Load more")}
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="agent-session-manager-empty">{t("agentSessions.noSessions", "No sessions yet.")}</div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
