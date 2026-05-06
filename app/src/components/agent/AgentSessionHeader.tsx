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
  previewMode?: boolean;
}

export function AgentSessionHeader({ session, previewMode = false }: AgentSessionHeaderProps) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const identity = getAgentSessionIdentity(session, i18n.language.startsWith("zh") ? "zh" : "en");
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
          {(!expanded || previewMode) && <><AgentDiffIndicator session={session} /><AgentContextIndicator session={session} /></>}
          {!previewMode && (
            <>
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