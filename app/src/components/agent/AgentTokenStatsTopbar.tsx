import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type WheelEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAgentConsoleSettings } from "../../agentConsoleSettings";
import type { AgentSession } from "../../agent/types";
import { type AgentTokenStatKind, type AgentStepStatus } from "../../agent/steps";
import { getAgentStepTypeLabel, getAgentStepVisualDescriptor } from "../../agent/stepVisuals";
import { getAgentTokenStatsSummary } from "../../agent/tokenStats";
import { Icon } from "../Icons";

const TOKEN_ITEM_MIN_WIDTH = 14;
const TOKEN_ITEM_MAX_WIDTH = 44;
const TOKEN_ITEM_COMPACT_MIN_WIDTH = 9;
const TOKEN_ITEM_COMPACT_MAX_WIDTH = 32;
const TOKEN_ITEM_MIN_HEIGHT = 8;
const TOKEN_ITEM_MAX_HEIGHT = 22;
const TOKEN_ITEM_HEIGHT_LIMIT = 800;
const TOKEN_ITEM_WIDTH_LIMIT = 8000;

function getTokenItemShape(tokenCount: number, kind: AgentTokenStatKind) {
  const compactWidth = kind === "thinking" || kind === "tool";
  const minWidth = compactWidth ? TOKEN_ITEM_COMPACT_MIN_WIDTH : TOKEN_ITEM_MIN_WIDTH;
  const maxWidth = compactWidth ? TOKEN_ITEM_COMPACT_MAX_WIDTH : TOKEN_ITEM_MAX_WIDTH;
  const heightTokenLimit = TOKEN_ITEM_HEIGHT_LIMIT * (minWidth / TOKEN_ITEM_MIN_WIDTH);
  const heightProgress = Math.min(tokenCount, heightTokenLimit) / heightTokenLimit;
  const height = Math.round(TOKEN_ITEM_MIN_HEIGHT + (TOKEN_ITEM_MAX_HEIGHT - TOKEN_ITEM_MIN_HEIGHT) * heightProgress);
  let width = minWidth;

  if (tokenCount > heightTokenLimit) {
    const widthProgress = Math.min(
      tokenCount - heightTokenLimit,
      TOKEN_ITEM_WIDTH_LIMIT - heightTokenLimit,
    ) / (TOKEN_ITEM_WIDTH_LIMIT - heightTokenLimit);
    width = Math.round(minWidth + (maxWidth - minWidth) * widthProgress);
  }

  return { width, height };
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
  return label;
}

function formatTokenCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  return String(count);
}

function focusAgentStat(messageId: string, stepId?: string) {
  const messageElement = document.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(messageId)}"]`);
  messageElement?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (!stepId) return;
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
  iconName: string;
  kind: string;
  status: string;
  tokens: string;
}

export function AgentTokenStatsTopbar({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const { navigationIndicatorOrder, navigationGroupBackgroundMode } = useAgentConsoleSettings();
  const summary = useMemo(() => getAgentTokenStatsSummary(session), [session]);
  const stats = summary.stats;
  const groupedStats = useMemo(() => {
    let groupIndex = -1;
    return stats.map((stat) => {
      if (stat.kind === "user" || groupIndex < 0) groupIndex += 1;
      return { ...stat, groupIndex };
    });
  }, [stats]);
  const displayStats = useMemo(() => navigationIndicatorOrder === "rightToLeft" ? [...groupedStats].reverse() : groupedStats, [navigationIndicatorOrder, groupedStats]);
  const displayGroups = useMemo(() => {
    const groups: { groupIndex: number; stats: typeof groupedStats }[] = [];
    for (const stat of displayStats) {
      const currentGroup = groups[groups.length - 1];
      if (!currentGroup || currentGroup.groupIndex !== stat.groupIndex) groups.push({ groupIndex: stat.groupIndex, stats: [stat] });
      else currentGroup.stats.push(stat);
    }
    return groups;
  }, [displayStats]);
  const currentIndex = stats.findIndex((stat) => stat.status === "running" || stat.status === "pending");
  const highlightedIndex = currentIndex >= 0 ? currentIndex : stats.length - 1;
  const highlightedStat = highlightedIndex >= 0 ? stats.find((stat) => stat.index === highlightedIndex) : undefined;
  const topbarRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TokenTooltipState | null>(null);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    if (container.scrollWidth <= container.clientWidth) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;
    container.scrollLeft += delta;
    event.preventDefault();
  }, []);

  useEffect(() => {
    const container = listRef.current;
    if (!container || stats.length === 0 || highlightedIndex < 0) return;
    const frame = requestAnimationFrame(() => {
      const currentItem = container.querySelector<HTMLElement>('[data-agent-token-current="true"]');
      currentItem?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [highlightedIndex, highlightedStat?.id, highlightedStat?.tokenCount, navigationIndicatorOrder, stats.length]);

  if (stats.length === 0) {
    return <div className="agent-token-topbar-empty">{t("agentConsole.noSteps", "No process steps")}</div>;
  }

  return (
    <div ref={topbarRef} className="agent-token-topbar" aria-label={t("agentConsole.tokenStats", "Agent step token statistics")}>
      <div ref={listRef} className="agent-token-topbar-list" data-group-background-mode={navigationGroupBackgroundMode} onWheel={handleWheel}>
        {displayGroups.map((group) => (
          <div key={group.groupIndex} className="agent-token-topbar-group" data-group-tone={group.groupIndex % 2 === 0 ? "normal" : "alternate"}>
            {group.stats.map((stat) => {
              const shape = getTokenItemShape(stat.tokenCount, stat.kind);
              const label = statLabel(stat.kind, stat.label, t);
              const title = label;
              const visual = getAgentStepVisualDescriptor(stat);
              const kind = getAgentStepTypeLabel(stat, t);
              const status = stat.staleRunningState ? t("agentConsole.stepStatus.staleRunning", "Stale running state") : statusLabel(stat.status, t);
              const tokens = t(stat.estimated ? "agentConsole.estimatedTokens" : "agentConsole.tokens", stat.estimated ? "{{value}} tokens estimated" : "{{value}} tokens", { value: formatTokenCount(stat.tokenCount) });
              const ariaLabel = [title, `${kind} · ${status}`, tokens].join("\n");
              return (
                <button
                  key={stat.id}
                  type="button"
                  className={`agent-token-topbar-item agent-token-topbar-item-${stat.kind}${stat.tone ? ` agent-token-topbar-tone-${stat.tone}` : ""} agent-token-topbar-item-${stat.status}${stat.staleRunningState ? " agent-token-topbar-item-stale-running" : ""}${stat.index === highlightedIndex ? " current" : ""}`}
                  data-agent-token-current={stat.index === highlightedIndex ? "true" : undefined}
                  aria-label={ariaLabel}
                  onClick={() => focusAgentStat(stat.messageId, stat.target === "step" ? (stat.stepId || stat.blockIds[0]) : undefined)}
                  onPointerEnter={(event) => {
                    const root = topbarRef.current;
                    if (!root) return;
                    const rootRect = root.getBoundingClientRect();
                    const itemRect = event.currentTarget.getBoundingClientRect();
                    setTooltip({ left: getTooltipLeft(rootRect, itemRect), title, iconName: visual.iconName, kind, status, tokens });
                  }}
                  onPointerLeave={() => setTooltip(null)}
                  onFocus={(event) => {
                    const root = topbarRef.current;
                    if (!root) return;
                    const rootRect = root.getBoundingClientRect();
                    const itemRect = event.currentTarget.getBoundingClientRect();
                    setTooltip({ left: getTooltipLeft(rootRect, itemRect), title, iconName: visual.iconName, kind, status, tokens });
                  }}
                  onBlur={() => setTooltip(null)}
                  style={{ width: shape.width, minWidth: shape.width, height: shape.height }}
                />
              );
            })}
          </div>
        ))}
      </div>
      {tooltip && (
        <div className="agent-token-topbar-tooltip" style={{ "--agent-token-tooltip-left": `${tooltip.left}px` } as CSSProperties}>
          <span className="agent-token-topbar-tooltip-meta">
            <Icon name={tooltip.iconName} size={12} className="agent-token-topbar-tooltip-meta-icon" />
            <strong>{tooltip.kind}</strong>
            <span>{tooltip.status}</span>
          </span>
          <span className="agent-token-topbar-tooltip-title">{tooltip.title}</span>
          <span className="agent-token-topbar-tooltip-tokens">{tooltip.tokens}</span>
        </div>
      )}
    </div>
  );
}