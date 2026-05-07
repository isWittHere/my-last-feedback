import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAgentConsoleSettings } from "../../agentConsoleSettings";
import type { AgentSession } from "../../agent/types";
import { formatCompactTokenCount, getAgentTokenStatsSummary } from "../../agent/tokenStats";
import { useAgentStore } from "../../store/agentStore";

function percentWidth(value: number, total: number): string {
  if (total <= 0 || value <= 0) return "0%";
  return `${Math.min(100, (value / total) * 100)}%`;
}

export function AgentContextIndicator({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const { contextIndicatorMode } = useAgentConsoleSettings();
  const compactAgentSession = useAgentStore((state) => state.compactAgentSession);
  const summary = useMemo(() => getAgentTokenStatsSummary(session), [session]);
  const usedPercent = summary.usedPercent ?? 0;
  const tone = summary.contextLimit == null ? "unknown" : usedPercent >= 95 ? "danger" : usedPercent >= 80 ? "warn" : "ok";
  const compactLabel = summary.contextLimit == null
    ? `${formatCompactTokenCount(summary.totalTokens)}/?`
    : `${formatCompactTokenCount(summary.totalTokens)}/${formatCompactTokenCount(summary.contextLimit)}`;
  const windowLabel = summary.contextLimit == null ? t("agentConsole.unknown", "Unknown") : formatCompactTokenCount(summary.contextLimit);
  const remainingLabel = summary.remainingTokens == null ? t("agentConsole.unknown", "Unknown") : formatCompactTokenCount(summary.remainingTokens);
  const contextTotal = summary.contextLimit ?? summary.totalTokens;
  const idleTokens = summary.contextLimit == null ? 0 : Math.max(0, summary.contextLimit - summary.totalTokens);
  const compactDisabled = !session.providerSessionId || session.compacting;

  const combinedBar = (
    <>
      <span className="agent-context-segment-user" style={{ width: percentWidth(summary.userTokens, contextTotal) }} />
      <span className="agent-context-segment-process" style={{ width: percentWidth(summary.processTokens, contextTotal) }} />
      <span className="agent-context-segment-result" style={{ width: percentWidth(summary.resultTokens, contextTotal) }} />
      <span className="agent-context-segment-idle" style={{ width: percentWidth(idleTokens, contextTotal) }} />
    </>
  );

  if (contextIndicatorMode === "hidden") return null;
  if (session.messages.length === 0 || summary.totalTokens === 0) return null;

  return (
    <div className="agent-context-indicator-wrap">
      <button type="button" className={`agent-context-indicator agent-context-indicator-${tone}${contextIndicatorMode === "text" ? " agent-context-indicator-text-only" : ""}`} aria-label={t("agentConsole.contextStats", "Context statistics")}>
        <span className="agent-context-indicator-text">{compactLabel}</span>
        {contextIndicatorMode === "textAndGraphic" && (
          <span className="agent-context-indicator-track" aria-hidden="true">
            {combinedBar}
          </span>
        )}
      </button>
      <div className="agent-context-popover" data-preview-overlay>
        <div className="agent-context-popover-head">
          <span>{t("agentConsole.contextSpace", "Context space")}</span>
          <strong>{summary.contextLimit == null ? t("agentConsole.estimated", "estimated") : `${usedPercent}%`}</strong>
        </div>
        <div className="agent-context-popover-grid">
          <span>{t("agentConsole.model", "Model")}</span>
          <strong>{session.modelId || t("agentConsole.unknown", "Unknown")}</strong>
          <span>{t("agentConsole.window", "Window")}</span>
          <strong>{windowLabel}</strong>
          <span>{t("agentConsole.used", "Used")}</span>
          <strong>{formatCompactTokenCount(summary.totalTokens)} {summary.estimated ? t("agentConsole.estimatedShort", "est.") : ""}</strong>
          <span>{t("agentConsole.remaining", "Remaining")}</span>
          <strong>{remainingLabel}</strong>
        </div>
        <div className="agent-context-combined-bar" aria-label={t("agentConsole.contextUsage", "Context usage")}>
          {combinedBar}
        </div>
        <div className="agent-context-popover-legend">
          <span><i className="agent-context-segment-user" />{t("agentConsole.userTokens", "User")} {formatCompactTokenCount(summary.userTokens)}</span>
          <span><i className="agent-context-segment-process" />{t("agentConsole.processTokens", "Process")} {formatCompactTokenCount(summary.processTokens)}</span>
          <span><i className="agent-context-segment-result" />{t("agentConsole.outputTokens", "Output")} {formatCompactTokenCount(summary.resultTokens)}</span>
          <span><i className="agent-context-segment-idle" />{t("agentConsole.idleContext", "Idle")} {formatCompactTokenCount(idleTokens)}</span>
        </div>
        <div className="agent-context-popover-path">{session.cwd}</div>
        <button
          type="button"
          className="btn agent-context-compress-button"
          disabled={compactDisabled}
          title={session.compacting ? t("agentConsole.compactingContext", "Compacting context") : !session.providerSessionId ? t("agentConsole.compactContextPending", "Context compression requires an active OpenCode session") : t("agentConsole.compactContext", "Compress context")}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (compactDisabled) return;
            void compactAgentSession(session.id);
          }}
        >
          {session.compacting ? t("agentConsole.compactingContext", "Compacting context") : t("agentConsole.compactContext", "Compress context")}
        </button>
      </div>
    </div>
  );
}