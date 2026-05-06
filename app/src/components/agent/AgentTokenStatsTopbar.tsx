import { useCallback, useMemo, type WheelEvent } from "react";
import { useTranslation } from "react-i18next";
import type { AgentSession } from "../../agent/types";
import { collectAgentStepTokenStats, type AgentTokenStatKind, type AgentStepStatus } from "../../agent/steps";

const TOKEN_ITEM_MIN_WIDTH = 14;
const TOKEN_ITEM_MAX_WIDTH = 44;
const TOKEN_ITEM_MIN_HEIGHT = 8;
const TOKEN_ITEM_MAX_HEIGHT = 22;
const TOKEN_ITEM_HEIGHT_LIMIT = 800;
const TOKEN_ITEM_WIDTH_LIMIT = 8000;

function getTokenItemShape(tokenCount: number) {
  const heightProgress = Math.min(tokenCount, TOKEN_ITEM_HEIGHT_LIMIT) / TOKEN_ITEM_HEIGHT_LIMIT;
  const height = Math.round(TOKEN_ITEM_MIN_HEIGHT + (TOKEN_ITEM_MAX_HEIGHT - TOKEN_ITEM_MIN_HEIGHT) * heightProgress);
  let width = TOKEN_ITEM_MIN_WIDTH;

  if (tokenCount > TOKEN_ITEM_HEIGHT_LIMIT) {
    const widthProgress = Math.min(
      tokenCount - TOKEN_ITEM_HEIGHT_LIMIT,
      TOKEN_ITEM_WIDTH_LIMIT - TOKEN_ITEM_HEIGHT_LIMIT,
    ) / (TOKEN_ITEM_WIDTH_LIMIT - TOKEN_ITEM_HEIGHT_LIMIT);
    width = Math.round(TOKEN_ITEM_MIN_WIDTH + (TOKEN_ITEM_MAX_WIDTH - TOKEN_ITEM_MIN_WIDTH) * widthProgress);
  }

  return { width, height };
}

function kindLabel(kind: AgentTokenStatKind): string {
  if (kind === "user") return "User";
  if (kind === "result") return "Result";
  if (kind === "thinking") return "Thinking";
  if (kind === "tool") return "Tool";
  if (kind === "task_list") return "Tasks";
  if (kind === "permission") return "Permission";
  if (kind === "error") return "Error";
  return "Artifacts";
}

function statusLabel(status: AgentStepStatus): string {
  if (status === "running") return "Running";
  if (status === "pending") return "Pending";
  if (status === "failed") return "Failed";
  return "Completed";
}

function formatTokenCount(count: number): string {
  return count.toLocaleString();
}

function focusAgentStat(messageId: string, stepId?: string) {
  window.dispatchEvent(new CustomEvent("mlfb-agent-focus-step", {
    detail: { messageId, stepId },
  }));
}

export function AgentTokenStatsTopbar({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const stats = useMemo(() => collectAgentStepTokenStats(session), [session]);
  const totalTokens = useMemo(() => stats.reduce((sum, stat) => sum + stat.tokenCount, 0), [stats]);
  const currentIndex = stats.findIndex((stat) => stat.status === "running" || stat.status === "pending");
  const highlightedIndex = currentIndex >= 0 ? currentIndex : stats.length - 1;

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    if (container.scrollWidth <= container.clientWidth) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;
    container.scrollLeft += delta;
    event.preventDefault();
  }, []);

  if (stats.length === 0) {
    return <div className="agent-token-topbar-empty">{t("agentConsole.noSteps", "No process steps")}</div>;
  }

  return (
    <div className="agent-token-topbar" aria-label={t("agentConsole.tokenStats", "Agent step token statistics")}>
      <div className="agent-token-topbar-list" onWheel={handleWheel}>
        {stats.map((stat) => {
          const shape = getTokenItemShape(stat.tokenCount);
          const title = [
            `${stat.index + 1}. ${stat.label}`,
            `${kindLabel(stat.kind)} · ${statusLabel(stat.status)}`,
            `${formatTokenCount(stat.tokenCount)} ${stat.estimated ? "estimated " : ""}tokens`,
          ].join("\n");
          return (
            <button
              key={stat.id}
              type="button"
              className={`agent-token-topbar-item agent-token-topbar-item-${stat.kind} agent-token-topbar-item-${stat.status}${stat.index === highlightedIndex ? " current" : ""}`}
              title={title}
              aria-label={title}
              onClick={() => focusAgentStat(stat.messageId, stat.target === "step" ? (stat.stepId || stat.blockIds[0]) : undefined)}
              style={{ width: shape.width, minWidth: shape.width, height: shape.height }}
            />
          );
        })}
      </div>
      <div className="agent-token-topbar-total" title={t("agentConsole.totalEstimatedTokens", "Total estimated step tokens")}>{formatTokenCount(totalTokens)}</div>
    </div>
  );
}