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
  const contextTokenLabel = summary.contextTokens == null ? null : formatCompactTokenCount(summary.contextTokens);
  const contextTotal = summary.contextLimit ?? summary.totalTokens;
  const idleTokens = summary.contextLimit == null ? 0 : Math.max(0, (summary.usableLimit ?? summary.contextLimit) - summary.totalTokens);
  const reservedVisibleTokens = summary.contextLimit == null || summary.reservedTokens == null || summary.usableLimit == null
    ? 0
    : Math.max(0, summary.contextLimit - Math.max(summary.totalTokens, summary.usableLimit));
  const compactDisabled = !session.providerSessionId || session.compacting;

  const combinedBar = (
    <>
      <span className="agent-context-segment-user" style={{ width: percentWidth(summary.userTokens, contextTotal) }} />
      <span className="agent-context-segment-process" style={{ width: percentWidth(summary.processTokens, contextTotal) }} />
      <span className="agent-context-segment-result" style={{ width: percentWidth(summary.resultTokens, contextTotal) }} />
      <span className="agent-context-segment-idle" style={{ width: percentWidth(idleTokens, contextTotal) }} />
      <span className="agent-context-segment-reserved" style={{ width: percentWidth(reservedVisibleTokens, contextTotal) }} />
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
          <div className="agent-context-popover-metric agent-context-popover-metric-wide">
            <span>{t("agentConsole.model", "Model")}</span>
            <strong>{session.modelId || t("agentConsole.unknown", "Unknown")}</strong>
          </div>
          <div className="agent-context-popover-metric">
            <span>{t("agentConsole.window", "Window")}</span>
            <strong>{windowLabel}</strong>
          </div>
          <div className="agent-context-popover-metric">
            <span>{t("agentConsole.used", "Used")}</span>
            <strong>{formatCompactTokenCount(summary.totalTokens)} {summary.estimated ? t("agentConsole.estimatedShort", "est.") : ""}</strong>
          </div>
          <div className="agent-context-popover-metric">
            <span>{t("agentConsole.remaining", "Remaining")}</span>
            <strong>{remainingLabel}</strong>
          </div>
          {contextTokenLabel && (
            <div className="agent-context-popover-metric">
              <span>{t("agentConsole.contextTokens", "Input context")}</span>
              <strong>{contextTokenLabel}</strong>
            </div>
          )}
          {summary.inputTokens != null && (
            <div className="agent-context-popover-metric">
              <span>{t("agentConsole.inputTokens", "Input")}</span>
              <strong>{formatCompactTokenCount(summary.inputTokens)}</strong>
            </div>
          )}
          {summary.outputTokens != null && (
            <div className="agent-context-popover-metric">
              <span>{t("agentConsole.outputTokens", "Output")}</span>
              <strong>{formatCompactTokenCount(summary.outputTokens)}</strong>
            </div>
          )}
          {summary.reasoningTokens != null && summary.reasoningTokens > 0 && (
            <div className="agent-context-popover-metric">
              <span>{t("agentConsole.reasoningTokens", "Reasoning")}</span>
              <strong>{formatCompactTokenCount(summary.reasoningTokens)}</strong>
            </div>
          )}
          {(summary.cacheReadTokens != null || summary.cacheWriteTokens != null) && (
            <div className="agent-context-popover-metric">
              <span>{t("agentConsole.cacheTokens", "Cache")}</span>
              <strong>{formatCompactTokenCount(summary.cacheReadTokens ?? 0)} / {formatCompactTokenCount(summary.cacheWriteTokens ?? 0)}</strong>
            </div>
          )}
        </div>
        <div className="agent-context-combined-bar" aria-label={t("agentConsole.contextUsage", "Context usage")}>
          {combinedBar}
        </div>
        <div className="agent-context-popover-legend">
          <span><i className="agent-context-segment-user" />{t("agentConsole.userTokens", "User")} {formatCompactTokenCount(summary.userTokens)}</span>
          <span><i className="agent-context-segment-process" />{t("agentConsole.processTokens", "Process")} {formatCompactTokenCount(summary.processTokens)}</span>
          <span><i className="agent-context-segment-result" />{t("agentConsole.outputTokens", "Output")} {formatCompactTokenCount(summary.resultTokens)}</span>
          <span><i className="agent-context-segment-idle" />{t("agentConsole.idleContext", "Idle")} {formatCompactTokenCount(idleTokens)}</span>
          {summary.reservedTokens != null && <span><i className="agent-context-segment-reserved" />{t("agentConsole.reservedContextShort", "Reserved")} {formatCompactTokenCount(summary.reservedTokens)}</span>}
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