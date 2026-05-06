import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getAgentSessionIdentity } from "../../agent/sessionIdentity";
import type { AgentSession } from "../../agent/types";
import { Icon } from "../Icons";
import { IdenticonAvatar } from "../IdenticonAvatar";
import { AgentContextIndicator } from "./AgentContextIndicator";
import { AgentDiffIndicator } from "./AgentDiffIndicator";
import { AgentHeaderDetailsRow } from "./AgentHeaderDetailsRow";
import { OpenCodeInitialAvatar } from "./OpenCodeInitialAvatar";
import { AgentTokenStatsTopbar } from "./AgentTokenStatsTopbar";

interface AgentSessionHeaderProps {
  session: AgentSession;
  sessions: AgentSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onStartAcp: (sessionId: string) => Promise<void>;
  onStopAcp: (sessionId: string) => Promise<void>;
  previewMode?: boolean;
}

function basename(value: string): string {
  return value.replace(/\\/g, "/").split("/").filter(Boolean).pop() || value;
}

function sessionStatusClass(status: AgentSession["status"]): string {
  if (status === "running" || status === "starting" || status === "cancelling") return "pending";
  if (status === "error" || status === "disconnected") return "cancelled";
  return "responded";
}

export function AgentSessionHeader({ session, sessions, activeSessionId, onSelectSession, onStartAcp, onStopAcp, previewMode = false }: AgentSessionHeaderProps) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const identity = getAgentSessionIdentity(session, i18n.language.startsWith("zh") ? "zh" : "en");
  const processId = session.providerRuntime?.processId;
  const isStarting = session.status === "starting";
  const isConnected = Boolean(processId);
  const identityTitle = identity.code ? `${identity.name} (${identity.code}) · ${identity.providerName}` : identity.providerName;

  const handleAvatarClick = () => {
    if (!identity.code) return;
    navigator.clipboard.writeText(identity.code).then(() => {
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1200);
    }).catch(() => undefined);
  };

  return (
    <div className={`agent-console-header${expanded ? " expanded" : ""}${previewMode ? " agent-console-header-preview" : ""}`} data-preview-overlay>
      <div className="agent-console-header-main">
        <div className="agent-console-topbar-caller">
          {identity.code ? (
            <button
              type="button"
              className="agent-console-session-avatar"
              onClick={handleAvatarClick}
              data-tooltip={codeCopied ? t("agentConsole.sessionCodeCopied", "Copied!") : t("agentConsole.copySessionCode", "Click to copy code: {{code}}", { code: identity.code })}
              aria-label={codeCopied ? t("agentConsole.sessionCodeCopied", "Copied!") : t("agentConsole.copySessionCode", "Click to copy code: {{code}}", { code: identity.code })}
            >
              <IdenticonAvatar alias={identity.code} color={identity.color} size={18} style={{ opacity: codeCopied ? 0.5 : 1, transition: "opacity 0.15s" }} />
              {codeCopied && <Icon name="check" size={10} color={identity.color} strokeWidth={3} className="agent-console-session-avatar-check" />}
            </button>
          ) : (
            <span className="agent-console-session-avatar agent-console-session-avatar-static" title={identity.providerName}>
              <OpenCodeInitialAvatar size={18} />
            </span>
          )}
          <span className="agent-console-topbar-caller-name" style={{ color: identity.color }} title={identityTitle}>{identity.name}</span>
        </div>
        <AgentTokenStatsTopbar session={session} />
        <div className="agent-console-topbar-actions">
          {sessions.length > 1 && (
            <div className="agent-console-session-switcher" role="tablist" aria-label={t("agentConsole.sessions", "Agent sessions")}>
              {sessions.map((item) => {
                const isActive = item.id === activeSessionId;
                const title = `${item.title || t("agentConsole.title", "Agent Console")} · ${basename(item.cwd)}`;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`agent-console-session-dot agent-console-session-dot-${sessionStatusClass(item.status)}${isActive ? " active" : ""}`}
                    onClick={() => onSelectSession(item.id)}
                    title={title}
                    aria-label={title}
                    aria-selected={isActive}
                    role="tab"
                  />
                );
              })}
            </div>
          )}
          {(!expanded || previewMode) && <><AgentDiffIndicator session={session} /><AgentContextIndicator session={session} /></>}
          {!previewMode && (
            <>
              <button
                type="button"
                className={`agent-console-topbar-action${isConnected ? " active" : ""}`}
                onClick={() => { void (isConnected ? onStopAcp(session.id) : onStartAcp(session.id)); }}
                title={isConnected ? t("agentConsole.stopProvider", "Stop OpenCode ACP") : t("agentConsole.startProvider", "Start OpenCode ACP")}
                disabled={isStarting}
              >
                <Icon name={isStarting ? "spinner" : isConnected ? "close" : "play"} size={13} />
              </button>
              <button type="button" className="agent-console-topbar-action" onClick={() => setExpanded((value) => !value)} title={expanded ? t("agentConsole.collapseHeader", "Collapse details") : t("agentConsole.expandHeader", "Expand details")} aria-expanded={expanded}>
                <Icon name="chevron-down" size={13} style={{ transform: expanded ? "rotate(180deg)" : undefined }} />
              </button>
            </>
          )}
        </div>
      </div>
      {expanded && !previewMode && <AgentHeaderDetailsRow session={session} />}
    </div>
  );
}