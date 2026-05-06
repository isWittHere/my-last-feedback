import { useCallback, useMemo, useRef, useState, type CSSProperties, type WheelEvent } from "react";
import { useTranslation } from "react-i18next";
import type { AgentSession } from "../../agent/types";
import { type AgentTokenStatKind, type AgentStepStatus } from "../../agent/steps";
import { getAgentTokenStatsSummary } from "../../agent/tokenStats";

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

function kindLabel(kind: AgentTokenStatKind, t: (key: string, defaultValue: string) => string): string {
  if (kind === "user") return t("agentConsole.tokenKinds.user", "User");
  if (kind === "result") return t("agentConsole.tokenKinds.result", "Result");
  if (kind === "thinking") return t("agentConsole.tokenKinds.thinking", "Thinking");
  if (kind === "tool") return t("agentConsole.tokenKinds.tool", "Tool");
  if (kind === "task_list") return t("agentConsole.tokenKinds.taskList", "Tasks");
  if (kind === "permission") return t("agentConsole.tokenKinds.permission", "Permission");
  if (kind === "error") return t("agentConsole.tokenKinds.error", "Error");
  return t("agentConsole.tokenKinds.artifacts", "Artifacts");
}

function statusLabel(status: AgentStepStatus, t: (key: string, defaultValue: string) => string): string {
  if (status === "running") return t("agentConsole.stepStatus.running", "Running");
  if (status === "pending") return t("agentConsole.stepStatus.pending", "Pending");
  if (status === "failed") return t("agentConsole.stepStatus.failed", "Failed");
  return t("agentConsole.stepStatus.completed", "Completed");
}

function statLabel(kind: AgentTokenStatKind, label: string, t: (key: string, defaultValue: string, options?: Record<string, unknown>) => string): string {
  if (kind === "user") return t("agentConsole.userInput", "User input");
  if (kind === "result") return t("agentConsole.agentOutput", "Agent output");
  if (kind === "thinking" && label === "思考") return t("agentConsole.tokenKinds.thinking", "Thinking");
  if (kind === "error" && label === "错误") return t("agentConsole.tokenKinds.error", "Error");

  const taskMatch = /^待办事项 \((\d+)\/(\d+)\)$/.exec(label);
  if (kind === "task_list" && taskMatch) {
    return t("agentConsole.todoItems", "Tasks ({{completed}}/{{total}})", { completed: taskMatch[1], total: taskMatch[2] });
  }

  const artifactMatch = /^产物 \((\d+)\)$/.exec(label);
  if (kind === "artifacts" && artifactMatch) {
    return t("agentConsole.artifactItems", "Artifacts ({{count}})", { count: artifactMatch[1] });
  }

  return label;
}

function formatTokenCount(count: number): string {
  return count.toLocaleString();
}

function focusAgentStat(messageId: string, stepId?: string) {
  window.dispatchEvent(new CustomEvent("mlfb-agent-focus-step", {
    detail: { messageId, stepId },
  }));
}

function getTooltipLeft(rootRect: DOMRect, itemRect: DOMRect): number {
  const rawLeft = itemRect.left + itemRect.width / 2 - rootRect.left;
  const minLeft = Math.min(90, rootRect.width / 2);
  const maxLeft = Math.max(minLeft, rootRect.width - minLeft);
  return Math.min(maxLeft, Math.max(minLeft, rawLeft));
}

interface TokenTooltipState {
  left: number;
  title: string;
  kind: string;
  status: string;
  tokens: string;
}

export function AgentTokenStatsTopbar({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const summary = useMemo(() => getAgentTokenStatsSummary(session), [session]);
  const stats = summary.stats;
  const currentIndex = stats.findIndex((stat) => stat.status === "running" || stat.status === "pending");
  const highlightedIndex = currentIndex >= 0 ? currentIndex : stats.length - 1;
  const topbarRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TokenTooltipState | null>(null);

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
    <div ref={topbarRef} className="agent-token-topbar" aria-label={t("agentConsole.tokenStats", "Agent step token statistics")}>
      <div className="agent-token-topbar-list" onWheel={handleWheel}>
        {stats.map((stat) => {
          const shape = getTokenItemShape(stat.tokenCount);
          const label = statLabel(stat.kind, stat.label, t);
          const title = `${stat.index + 1}. ${label}`;
          const kind = kindLabel(stat.kind, t);
          const status = statusLabel(stat.status, t);
          const tokens = t(stat.estimated ? "agentConsole.estimatedTokens" : "agentConsole.tokens", stat.estimated ? "{{value}} estimated tokens" : "{{value}} tokens", { value: formatTokenCount(stat.tokenCount) });
          const ariaLabel = [title, `${kind} · ${status}`, tokens].join("\n");
          return (
            <button
              key={stat.id}
              type="button"
              className={`agent-token-topbar-item agent-token-topbar-item-${stat.kind} agent-token-topbar-item-${stat.status}${stat.index === highlightedIndex ? " current" : ""}`}
              aria-label={ariaLabel}
              onClick={() => focusAgentStat(stat.messageId, stat.target === "step" ? (stat.stepId || stat.blockIds[0]) : undefined)}
              onPointerEnter={(event) => {
                const root = topbarRef.current;
                if (!root) return;
                const rootRect = root.getBoundingClientRect();
                const itemRect = event.currentTarget.getBoundingClientRect();
                setTooltip({
                  left: getTooltipLeft(rootRect, itemRect),
                  title,
                  kind,
                  status,
                  tokens,
                });
              }}
              onPointerLeave={() => setTooltip(null)}
              onFocus={(event) => {
                const root = topbarRef.current;
                if (!root) return;
                const rootRect = root.getBoundingClientRect();
                const itemRect = event.currentTarget.getBoundingClientRect();
                setTooltip({
                  left: getTooltipLeft(rootRect, itemRect),
                  title,
                  kind,
                  status,
                  tokens,
                });
              }}
              onBlur={() => setTooltip(null)}
              style={{ width: shape.width, minWidth: shape.width, height: shape.height }}
            />
          );
        })}
      </div>
      {tooltip && (
        <div className="agent-token-topbar-tooltip" style={{ "--agent-token-tooltip-left": `${tooltip.left}px` } as CSSProperties}>
          <span className="agent-token-topbar-tooltip-title">{tooltip.title}</span>
          <span className="agent-token-topbar-tooltip-meta">
            <strong>{tooltip.kind}</strong>
            <span>{tooltip.status}</span>
          </span>
          <span className="agent-token-topbar-tooltip-tokens">{tooltip.tokens}</span>
        </div>
      )}
    </div>
  );
}