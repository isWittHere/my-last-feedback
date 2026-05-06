import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentSession } from "../../agent/types";
import { Icon } from "../Icons";
import { IdenticonAvatar } from "../IdenticonAvatar";
import { AgentContextIndicator } from "./AgentContextIndicator";
import { AgentDiffIndicator } from "./AgentDiffIndicator";
import { AgentHeaderDetailsRow } from "./AgentHeaderDetailsRow";
import { AgentTokenStatsTopbar } from "./AgentTokenStatsTopbar";

interface AgentSessionHeaderProps {
  session: AgentSession;
  sessions: AgentSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onReset: () => void;
}

function basename(value: string): string {
  return value.replace(/\\/g, "/").split("/").filter(Boolean).pop() || value;
}

function sessionStatusClass(status: AgentSession["status"]): string {
  if (status === "running" || status === "starting" || status === "cancelling") return "pending";
  if (status === "error" || status === "disconnected") return "cancelled";
  return "responded";
}

export function AgentSessionHeader({ session, sessions, activeSessionId, onSelectSession, onReset }: AgentSessionHeaderProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const providerName = session.providerId === "opencode" ? "OpenCode" : session.providerId;
  const providerColor = "#0d9488";

  return (
    <div className={`agent-console-header${expanded ? " expanded" : ""}`} data-preview-overlay>
      <div className="agent-console-header-main">
        <div className="agent-console-topbar-caller">
          <IdenticonAvatar alias={providerName} color={providerColor} size={18} />
          <span className="agent-console-topbar-caller-name" style={{ color: providerColor }}>{providerName}</span>
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
          {!expanded && <><AgentDiffIndicator session={session} /><AgentContextIndicator session={session} /></>}
          <button type="button" className="agent-console-topbar-action" onClick={() => setExpanded((value) => !value)} title={expanded ? t("agentConsole.collapseHeader", "Collapse details") : t("agentConsole.expandHeader", "Expand details")} aria-expanded={expanded}>
            <Icon name="chevron-down" size={13} style={{ transform: expanded ? "rotate(180deg)" : undefined }} />
          </button>
          <button type="button" className="agent-console-topbar-action" onClick={onReset} title={t("agentConsole.resetMock", "Reset mock session")}>
            <Icon name="refresh" size={13} />
          </button>
        </div>
      </div>
      {expanded && <AgentHeaderDetailsRow session={session} />}
    </div>
  );
}