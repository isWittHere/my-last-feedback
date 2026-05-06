import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getAgentProviderSessionIdentity, getAgentSessionIdentity, type AgentSessionIdentity } from "../../agent/sessionIdentity";
import type { AgentProviderId, AgentSession } from "../../agent/types";
import { useAgentStore } from "../../store/agentStore";
import { Icon } from "../Icons";
import { IdenticonAvatar } from "../IdenticonAvatar";
import { OpenCodeInitialAvatar } from "./OpenCodeInitialAvatar";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "-";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(time);
}

function shortId(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function loadSessionSupported(capabilities: unknown): boolean {
  return isRecord(capabilities) && capabilities.loadSession === true;
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

function HistorySessionAvatar({ identity, status }: { identity: AgentSessionIdentity; status?: AgentSession["status"] }) {
  const title = identity.code ? `${identity.name} (${identity.code})` : identity.providerName;
  return (
    <span className="agent-session-history-avatar" title={title}>
      {identity.code ? (
        <IdenticonAvatar alias={identity.code} color={identity.color} size={16} />
      ) : (
        <OpenCodeInitialAvatar size={16} />
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
  const setActiveSession = useAgentStore((state) => state.setActiveSession);
  const startOpenCodeAcp = useAgentStore((state) => state.startOpenCodeAcp);
  const stopOpenCodeAcp = useAgentStore((state) => state.stopOpenCodeAcp);
  const refreshProviderSessions = useAgentStore((state) => state.refreshProviderSessions);
  const restoreProviderSession = useAgentStore((state) => state.restoreProviderSession);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const providers = useMemo(() => {
    const seen = new Set<AgentProviderId>();
    for (const session of sessions) seen.add(session.providerId);
    if (seen.size === 0) seen.add("opencode");
    return [...seen];
  }, [sessions]);

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

  const capabilityLabel = (value: "supported" | "unsupported" | "unknown") => {
    if (value === "supported") return t("agentSessions.capabilitySupported", "supported");
    if (value === "unsupported") return t("agentSessions.capabilityUnsupported", "unsupported");
    return t("agentSessions.capabilityUnknown", "unknown");
  };

  const errorLabel = (message: string | undefined) => {
    if (!message) return "";
    if (message === "Provider does not advertise ACP session/list support.") return t("agentSessions.errorListUnsupported", "Provider does not advertise ACP session/list support.");
    if (message === "Start the provider before listing ACP sessions.") return t("agentSessions.errorStartBeforeList", "Start the provider before listing ACP sessions.");
    if (message === "Start the provider before restoring ACP sessions.") return t("agentSessions.errorStartBeforeRestore", "Start the provider before restoring ACP sessions.");
    if (message === "Provider does not advertise ACP session/load support.") return t("agentSessions.errorLoadUnsupported", "Provider does not advertise ACP session/load support.");
    return message;
  };

  return (
    <div className="agent-session-manager-panel">
      <header className="agent-session-manager-header">
        <div className="agent-session-manager-title-row">
          <Icon name="message" size={15} />
          <span>{t("agentSessions.title", "ACP Sessions")}</span>
        </div>
        <div className="agent-session-manager-subtitle">
          {t("agentSessions.subtitle", "Create, discover, and restore provider conversation sessions.")}
        </div>
      </header>

      <section className="agent-session-manager-protocol panel-card">
        <div className="agent-session-manager-section-title">{t("agentSessions.protocol", "ACP session flow")}</div>
        <div className="agent-session-manager-flow">
          <span><strong>session/new</strong>{t("agentSessions.newDesc", " creates a conversation id")}</span>
          <span><strong>session/list</strong>{t("agentSessions.listDesc", " discovers persisted sessions when advertised")}</span>
          <span><strong>session/load</strong>{t("agentSessions.loadDesc", " restores a selected session when loadSession is true")}</span>
        </div>
      </section>

      {actionError ? (
        <div className="agent-session-manager-error"><Icon name="warning" size={13} />{errorLabel(actionError)}</div>
      ) : null}

      <div className="agent-session-manager-provider-list">
        {providers.map((providerId) => {
          const providerSessions = sessions.filter((session) => session.providerId === providerId);
          const nonEmptyLocalSessions = providerSessions.filter((session) => !isUnstartedLocalSession(session));
          const visibleLocalSessions = nonEmptyLocalSessions.length > 0 ? nonEmptyLocalSessions : providerSessions.slice(0, 1);
          const meaningfulProviderSessionIds = new Set(providerSessions
            .filter((session) => session.providerSessionId && session.providerSessionState !== "provisional")
            .map((session) => session.providerSessionId));
          const provisionalProviderSessionIds = new Set(providerSessions
            .filter((session) => session.providerSessionId && session.providerSessionState === "provisional")
            .map((session) => session.providerSessionId));
          const primarySession = providerSessions[0];
          const runtime = primarySession?.providerRuntime;
          const isConnected = Boolean(runtime?.processId);
          const isInitialized = Boolean(runtime?.initialized);
          const listState = providerSessionLists[providerId];
          const loadSupported = loadSessionSupported(runtime?.agentCapabilities);
          const listCapability = listState?.capability || "unknown";
          const loadCapability = loadSupported ? "supported" : "unsupported";
          const remoteSessions = listState?.sessions || [];
          const visibleRemoteSessions = remoteSessions.filter((item) => {
            if (meaningfulProviderSessionIds.has(item.sessionId)) return true;
            if (provisionalProviderSessionIds.has(item.sessionId)) return false;
            return true;
          });
          const hiddenEmptySessionCount = remoteSessions.length - visibleRemoteSessions.length;
          const refreshKey = `${providerId}:refresh`;
          const loadMoreKey = `${providerId}:more`;

          return (
            <section key={providerId} className="agent-session-manager-provider panel-card">
              <div className="agent-session-manager-provider-head">
                <div className="agent-session-manager-provider-name">
                  <OpenCodeInitialAvatar size={20} />
                  <div>
                    <strong>{providerLabel(providerId)}</strong>
                    <span>{isInitialized ? t("agentSessions.initialized", "initialized") : isConnected ? t("agentSessions.connected", "connected") : t("agentSessions.disconnected", "disconnected")}</span>
                  </div>
                </div>
                <div className="agent-session-manager-actions">
                  {primarySession ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => runAction(`${providerId}:start`, () => isConnected ? stopOpenCodeAcp(primarySession.id) : startOpenCodeAcp(primarySession.id))}
                      disabled={busyAction !== null}
                      title={isConnected ? t("agentSessions.stopProvider", "Stop provider") : t("agentSessions.startProvider", "Start provider")}
                    >
                      <Icon name={isConnected ? "close" : "play"} size={12} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => runAction(refreshKey, () => refreshProviderSessions(providerId))}
                    disabled={!isInitialized || busyAction !== null || listState?.status === "loading"}
                    title={t("agentSessions.refresh", "Refresh sessions")}
                  >
                    <Icon name={busyAction === refreshKey || listState?.status === "loading" ? "spinner" : "refresh"} size={12} />
                  </button>
                </div>
              </div>

              <div className="agent-session-manager-capabilities">
                <span data-state={listCapability}>{t("agentSessions.listCapability", "list")}: {capabilityLabel(listCapability)}</span>
                <span data-state={loadCapability}>{t("agentSessions.loadCapability", "load")}: {capabilityLabel(loadCapability)}</span>
                <span>{runtime?.agentInfo?.version || t("agentSessions.noVersion", "no version")}</span>
              </div>

              <div className="agent-session-manager-local-list">
                <div className="agent-session-manager-section-title">{t("agentSessions.localSessions", "Frontend sessions")}</div>
                {visibleLocalSessions.map((session) => {
                  const identity = getAgentSessionIdentity(session, i18n.language.startsWith("zh") ? "zh" : "en");
                  return (
                    <button
                      key={session.id}
                      type="button"
                      className={`agent-session-history-item${session.id === activeSessionId ? " active" : ""}${isUnstartedLocalSession(session) ? " provisional" : ""}`}
                      onClick={() => setActiveSession(session.id)}
                    >
                      <div className="agent-session-history-row1">
                        <HistorySessionAvatar identity={identity} status={session.status} />
                        <span className="agent-session-history-name">{session.title}</span>
                      </div>
                      <div className="agent-session-history-row2">
                        <span className="agent-session-history-time">{formatDate(session.updatedAt, i18n.language)}</span>
                        <span className="agent-session-history-id">{isUnstartedLocalSession(session) ? t("agentSessions.provisionalSession", "not started") : session.providerSessionId ? shortId(session.providerSessionId) : t("agentSessions.noProviderSession", "no provider session")}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="agent-session-manager-remote-list">
                <div className="agent-session-manager-section-title">{t("agentSessions.providerSessions", "Provider sessions")}</div>
                {listState?.status === "unsupported" ? (
                  <div className="agent-session-manager-empty">{t("agentSessions.listUnsupported", "This provider does not advertise session/list.")}</div>
                ) : listState?.status === "error" ? (
                  <div className="agent-session-manager-empty error">{errorLabel(listState.error)}</div>
                ) : listState?.status === "loading" && listState.sessions.length === 0 ? (
                  <div className="agent-session-manager-empty">{t("agentSessions.loading", "Loading sessions...")}</div>
                ) : visibleRemoteSessions.length ? (
                  <>
                    {visibleRemoteSessions.map((item) => {
                      const restoreKey = `${providerId}:restore:${item.sessionId}`;
                      const identity = getAgentProviderSessionIdentity(providerId, item.sessionId, i18n.language.startsWith("zh") ? "zh" : "en", providerLabel(providerId));
                      const boundSession = providerSessions.find((session) => session.providerSessionId === item.sessionId && session.providerSessionState !== "provisional");
                      const isActiveRemoteSession = boundSession?.id === activeSessionId;
                      const canSwitch = Boolean(boundSession || loadSupported);
                      const restoreTitle = boundSession
                        ? t("agentSessions.switchSession", "Switch session")
                        : loadSupported ? t("agentSessions.restore", "Restore session") : t("agentSessions.loadUnsupported", "Provider does not advertise session/load");
                      const handleRestore = () => {
                        if (!canSwitch || busyAction !== null) return;
                        void runAction(restoreKey, () => restoreProviderSession(providerId, item.sessionId));
                      };
                      return (
                        <div
                          key={item.sessionId}
                          className={`agent-session-history-item agent-session-history-remote${isActiveRemoteSession ? " active" : ""}${canSwitch ? " switchable" : ""}`}
                          role="button"
                          tabIndex={canSwitch ? 0 : -1}
                          onClick={handleRestore}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleRestore();
                            }
                          }}
                          title={restoreTitle}
                        >
                          <div className="agent-session-history-row1">
                            <HistorySessionAvatar identity={identity} />
                            <span className="agent-session-history-name" title={item.title || item.sessionId}>{item.title || shortId(item.sessionId)}</span>
                            <span className="agent-session-history-actions">
                              <button
                                type="button"
                                className="session-item-cancel"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRestore();
                                }}
                                disabled={!canSwitch || busyAction !== null}
                                title={restoreTitle}
                              >
                                <Icon name={busyAction === restoreKey ? "spinner" : "arrow-right-left"} size={11} />
                              </button>
                            </span>
                          </div>
                          <div className="agent-session-history-row2">
                            <span className="agent-session-history-time">{formatDate(item.updatedAt, i18n.language)}</span>
                            <span className="agent-session-history-id" title={item.sessionId}>{shortId(item.sessionId)}</span>
                            <span className="agent-session-history-cwd" title={item.cwd || ""}>{item.cwd || t("agentSessions.unknownCwd", "unknown cwd")}</span>
                          </div>
                        </div>
                      );
                    })}
                    {listState.nextCursor ? (
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
                  <div className="agent-session-manager-empty">{hiddenEmptySessionCount > 0 ? t("agentSessions.onlyEmptySessions", "Only empty sessions found.") : isInitialized ? t("agentSessions.refreshEmpty", "Refresh to discover provider sessions.") : t("agentSessions.startFirst", "Start the provider first.")}</div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
