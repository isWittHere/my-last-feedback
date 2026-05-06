import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentProviderId } from "../../agent/types";
import { useAgentStore } from "../../store/agentStore";
import { Icon } from "../Icons";
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

function localSessionIcon(status: string): string {
  if (status === "error" || status === "disconnected") return "circle-x";
  if (status === "running" || status === "starting" || status === "cancelling") return "spinner";
  return "circle-check";
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
          const primarySession = providerSessions[0];
          const runtime = primarySession?.providerRuntime;
          const isConnected = Boolean(runtime?.processId);
          const isInitialized = Boolean(runtime?.initialized);
          const listState = providerSessionLists[providerId];
          const loadSupported = loadSessionSupported(runtime?.agentCapabilities);
          const listCapability = listState?.capability || "unknown";
          const loadCapability = loadSupported ? "supported" : "unsupported";
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
                {providerSessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    className={`agent-session-history-item${session.id === activeSessionId ? " active" : ""}`}
                    onClick={() => setActiveSession(session.id)}
                  >
                    <div className="agent-session-history-row1">
                      <span className="agent-session-history-icon"><Icon name={localSessionIcon(session.status)} size={11} /></span>
                      <span className="agent-session-history-name">{session.title}</span>
                    </div>
                    <div className="agent-session-history-row2">
                      <span className="agent-session-history-time">{formatDate(session.updatedAt, i18n.language)}</span>
                      <span className="agent-session-history-id">{session.providerSessionId ? shortId(session.providerSessionId) : t("agentSessions.noProviderSession", "no provider session")}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="agent-session-manager-remote-list">
                <div className="agent-session-manager-section-title">{t("agentSessions.providerSessions", "Provider sessions")}</div>
                {listState?.status === "unsupported" ? (
                  <div className="agent-session-manager-empty">{t("agentSessions.listUnsupported", "This provider does not advertise session/list.")}</div>
                ) : listState?.status === "error" ? (
                  <div className="agent-session-manager-empty error">{errorLabel(listState.error)}</div>
                ) : listState?.status === "loading" && listState.sessions.length === 0 ? (
                  <div className="agent-session-manager-empty">{t("agentSessions.loading", "Loading sessions...")}</div>
                ) : listState?.sessions.length ? (
                  <>
                    {listState.sessions.map((item) => {
                      const restoreKey = `${providerId}:restore:${item.sessionId}`;
                      return (
                        <div key={item.sessionId} className="agent-session-history-item agent-session-history-remote">
                          <div className="agent-session-history-row1">
                            <span className="agent-session-history-icon"><Icon name="message" size={11} /></span>
                            <span className="agent-session-history-name" title={item.title || item.sessionId}>{item.title || shortId(item.sessionId)}</span>
                            <span className="agent-session-history-actions">
                              <button
                                type="button"
                                className="session-item-cancel"
                                onClick={() => runAction(restoreKey, () => restoreProviderSession(providerId, item.sessionId))}
                                disabled={!loadSupported || busyAction !== null}
                                title={loadSupported ? t("agentSessions.restore", "Restore session") : t("agentSessions.loadUnsupported", "Provider does not advertise session/load")}
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
                  <div className="agent-session-manager-empty">{isInitialized ? t("agentSessions.refreshEmpty", "Refresh to discover provider sessions.") : t("agentSessions.startFirst", "Start the provider first.")}</div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
