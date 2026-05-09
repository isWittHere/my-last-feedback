import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type WheelEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAgentConsoleSettings } from "../../agentConsoleSettings";
import type { AgentSession, AgentTokenUsage } from "../../agent/types";
import { type AgentTokenStatKind, type AgentStepStatus, type AgentStepTone } from "../../agent/steps";
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
const TOKEN_LINE_CHART_HEIGHT = 30;
const TOKEN_LINE_CHART_BASELINE = 30;
const TOKEN_LINE_CHART_PADDING_X = 8;
const TOKEN_LINE_CHART_GAP = 5;
const TOKEN_LINE_CHART_MIN_POINT_HEIGHT = 5;
const TOKEN_LINE_CHART_MAX_POINT_HEIGHT = 27;

interface SmoothChartPoint {
  x: number;
  y: number;
}

interface SmoothChartSegment {
  path: string;
  fromIndex: number;
  toIndex: number;
}

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

function getLineChartPointHeight(tokenCount: number, minTokenCount: number, maxTokenCount: number): number {
  if (maxTokenCount <= minTokenCount) return (TOKEN_LINE_CHART_MIN_POINT_HEIGHT + TOKEN_LINE_CHART_MAX_POINT_HEIGHT) / 2;
  const minValue = Math.sqrt(Math.max(0, minTokenCount));
  const maxValue = Math.sqrt(Math.max(0, maxTokenCount));
  const currentValue = Math.sqrt(Math.max(0, tokenCount));
  const normalized = maxValue <= minValue ? 0.5 : (currentValue - minValue) / (maxValue - minValue);
  return TOKEN_LINE_CHART_MIN_POINT_HEIGHT + clampCoordinate(normalized, 0, 1) * (TOKEN_LINE_CHART_MAX_POINT_HEIGHT - TOKEN_LINE_CHART_MIN_POINT_HEIGHT);
}

function clampCoordinate(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getSmoothChartSegments(points: SmoothChartPoint[]): SmoothChartSegment[] {
  if (points.length < 2) return [];
  return points.slice(0, -1).map((currentPoint, index) => {
    const previousPoint = points[index - 1] || currentPoint;
    const nextPoint = points[index + 1];
    const afterNextPoint = points[index + 2] || nextPoint;
    const firstControlX = currentPoint.x + (nextPoint.x - previousPoint.x) / 6;
    const firstControlY = currentPoint.y + (nextPoint.y - previousPoint.y) / 6;
    const secondControlX = nextPoint.x - (afterNextPoint.x - currentPoint.x) / 6;
    const secondControlY = nextPoint.y - (afterNextPoint.y - currentPoint.y) / 6;
    return {
      path: [
        `M ${currentPoint.x.toFixed(2)} ${currentPoint.y.toFixed(2)}`,
        `C ${firstControlX.toFixed(2)} ${clampCoordinate(firstControlY, 2, TOKEN_LINE_CHART_BASELINE).toFixed(2)}`,
        `${secondControlX.toFixed(2)} ${clampCoordinate(secondControlY, 2, TOKEN_LINE_CHART_BASELINE).toFixed(2)}`,
        `${nextPoint.x.toFixed(2)} ${nextPoint.y.toFixed(2)}`,
      ].join(" "),
      fromIndex: index,
      toIndex: index + 1,
    };
  });
}

function getSmoothChartPath(points: SmoothChartPoint[], segments: SmoothChartSegment[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  return segments.map((segment, index) => index === 0 ? segment.path : segment.path.replace(/^M [^C]+ /, "")).join(" ");
}

function getTokenStatColor(stat: { kind: AgentTokenStatKind; status: AgentStepStatus; tone?: AgentStepTone; staleRunningState?: boolean }): string {
  if (stat.staleRunningState || stat.status === "running" || stat.status === "pending") return "var(--step-card-running)";
  if (stat.status === "failed" || stat.kind === "error" || stat.tone === "approval_rejected") return "var(--step-card-error)";
  if (stat.tone === "document_change") return "var(--step-card-edit)";
  if (stat.tone === "document_read" || stat.tone === "document_search" || stat.tone === "command_execution") return "var(--step-card-command)";
  if (stat.tone === "todo_update") return "var(--step-card-todo)";
  if (stat.tone === "artifact_output") return "var(--step-card-artifact)";
  if (stat.kind === "user") return "var(--step-card-user)";
  if (stat.kind === "model_step") return "var(--step-card-output)";
  if (stat.kind === "result") return "var(--step-card-output)";
  if (stat.kind === "thinking") return "var(--step-card-thinking)";
  if (stat.kind === "tool") return "var(--step-card-command)";
  if (stat.kind === "task_list") return "var(--step-card-todo)";
  if (stat.kind === "artifacts") return "var(--step-card-artifact)";
  if (stat.kind === "permission") return "var(--step-card-permission)";
  if (stat.kind === "compaction") return "var(--step-card-compaction)";
  return "var(--color-text-muted)";
}

function statusLabel(status: AgentStepStatus, t: (key: string, defaultValue: string) => string): string {
  if (status === "running") return t("agentConsole.stepStatus.running", "Running");
  if (status === "pending") return t("agentConsole.stepStatus.pending", "Pending");
  if (status === "failed") return t("agentConsole.stepStatus.failed", "Failed");
  return t("agentConsole.stepStatus.completed", "Completed");
}

function statLabel(kind: AgentTokenStatKind, label: string, t: (key: string, defaultValue: string, options?: Record<string, unknown>) => string): string {
  if (kind === "user") return t("agentConsole.userInput", "User input");
  if (kind === "model_step") return t("agentConsole.modelStep", "Model step");
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
  usage?: AgentTokenUsage;
}

function tokenUsageDetails(usage: AgentTokenUsage | undefined, t: (key: string, defaultValue: string) => string): string[] {
  if (!usage) return [];
  return [
    `${t("agentConsole.inputTokens", "Input")} ${formatTokenCount(usage.inputTokens)}`,
    `${t("agentConsole.outputTokens", "Output")} ${formatTokenCount(usage.outputTokens)}`,
    `${t("agentConsole.reasoningTokens", "Reasoning")} ${formatTokenCount(usage.reasoningTokens)}`,
    `${t("agentConsole.cacheTokens", "Cache")} ${formatTokenCount(usage.cacheReadTokens)}/${formatTokenCount(usage.cacheWriteTokens)}`,
  ];
}

export function AgentTokenStatsTopbar({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const { navigationIndicatorOrder, navigationGroupBackgroundMode, navigationVisualizationMode } = useAgentConsoleSettings();
  const chartUid = useId().replace(/:/g, "");
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
  const lineChart = useMemo(() => {
    let cursorX = TOKEN_LINE_CHART_PADDING_X;
    const tokenCounts = displayStats.map((stat) => stat.tokenCount);
    const minTokenCount = tokenCounts.length > 0 ? Math.min(...tokenCounts) : 0;
    const maxTokenCount = tokenCounts.length > 0 ? Math.max(...tokenCounts) : 0;
    const points = displayStats.map((stat) => {
      const shape = getTokenItemShape(stat.tokenCount, stat.kind);
      const pointHeight = getLineChartPointHeight(stat.tokenCount, minTokenCount, maxTokenCount);
      const x = cursorX + shape.width / 2;
      cursorX += shape.width + TOKEN_LINE_CHART_GAP;
      return {
        stat,
        x,
        y: TOKEN_LINE_CHART_BASELINE - pointHeight,
        width: shape.width,
        color: getTokenStatColor(stat),
      };
    });
    const width = Math.max(48, cursorX - TOKEN_LINE_CHART_GAP + TOKEN_LINE_CHART_PADDING_X);
    const smoothPoints = points.map((point) => ({ x: point.x, y: point.y }));
    const segments = getSmoothChartSegments(smoothPoints);
    const linePath = getSmoothChartPath(smoothPoints, segments);
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const areaPath = firstPoint && lastPoint && linePath
      ? `${linePath} L ${lastPoint.x.toFixed(2)} ${TOKEN_LINE_CHART_BASELINE} L ${firstPoint.x.toFixed(2)} ${TOKEN_LINE_CHART_BASELINE} Z`
      : "";
    const groupRanges = displayGroups.map((group) => {
      const firstIndex = points.findIndex((point) => point.stat.groupIndex === group.groupIndex);
      let lastIndex = -1;
      for (let pointIndex = points.length - 1; pointIndex >= 0; pointIndex -= 1) {
        if (points[pointIndex].stat.groupIndex === group.groupIndex) {
          lastIndex = pointIndex;
          break;
        }
      }
      if (firstIndex < 0 || lastIndex < 0) return null;
      const startX = firstIndex === 0 ? 0 : (points[firstIndex - 1].x + points[firstIndex].x) / 2;
      const endX = lastIndex === points.length - 1 ? width : (points[lastIndex].x + points[lastIndex + 1].x) / 2;
      return { groupIndex: group.groupIndex, x: startX, width: Math.max(1, endX - startX) };
    }).filter((range): range is { groupIndex: number; x: number; width: number } => Boolean(range));
    return { width, points, segments, linePath, areaPath, groupRanges };
  }, [displayGroups, displayStats]);
  const currentIndex = stats.findIndex((stat) => stat.status === "running" || stat.status === "pending");
  const highlightedIndex = currentIndex >= 0 ? currentIndex : stats.length - 1;
  const highlightedStat = highlightedIndex >= 0 ? stats.find((stat) => stat.index === highlightedIndex) : undefined;
  const topbarRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TokenTooltipState | null>(null);
  const [hoveredGroupIndex, setHoveredGroupIndex] = useState<number | null>(null);

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
      if (navigationVisualizationMode === "lineArea") {
        const currentPoint = lineChart.points.find((point) => point.stat.index === highlightedIndex);
        if (currentPoint) {
          container.scrollTo({ left: Math.max(0, currentPoint.x - container.clientWidth / 2), behavior: "smooth" });
          return;
        }
      }
      const currentItem = container.querySelector<Element>('[data-agent-token-current="true"]');
      currentItem?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [highlightedIndex, highlightedStat?.id, highlightedStat?.tokenCount, lineChart, navigationIndicatorOrder, navigationVisualizationMode, stats.length]);

  if (stats.length === 0) {
    return <div className="agent-token-topbar-empty">{t("agentConsole.noSteps", "No process steps")}</div>;
  }

  return (
    <div ref={topbarRef} className="agent-token-topbar" aria-label={t("agentConsole.tokenStats", "Agent step token statistics")}>
      <div
        ref={listRef}
        className={`agent-token-topbar-list${navigationVisualizationMode === "lineArea" ? " agent-token-topbar-list-line" : ""}`}
        data-group-background-mode={navigationGroupBackgroundMode}
        data-visualization-mode={navigationVisualizationMode}
        onWheel={handleWheel}
      >
        {navigationVisualizationMode === "lineArea" ? (
          <svg
            className="agent-token-line-chart"
            data-has-hovered-group={hoveredGroupIndex == null ? undefined : "true"}
            width={lineChart.width}
            height="100%"
            viewBox={`0 0 ${lineChart.width} ${TOKEN_LINE_CHART_HEIGHT}`}
            preserveAspectRatio="none"
            onPointerLeave={() => {
              setHoveredGroupIndex(null);
              setTooltip(null);
            }}
            aria-hidden="false"
          >
            <defs>
              <linearGradient id={`agent-token-line-gradient-${chartUid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={lineChart.width} y2="0">
                {lineChart.points.map((point) => (
                  <stop key={`${point.stat.id}-line`} offset={`${lineChart.width <= 0 ? 0 : (point.x / lineChart.width) * 100}%`} stopColor={point.color} />
                ))}
              </linearGradient>
              <linearGradient id={`agent-token-area-gradient-${chartUid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={lineChart.width} y2="0">
                {lineChart.points.map((point) => (
                  <stop key={`${point.stat.id}-area`} offset={`${lineChart.width <= 0 ? 0 : (point.x / lineChart.width) * 100}%`} stopColor={point.color} stopOpacity="0.3" />
                ))}
              </linearGradient>
            </defs>
            {lineChart.groupRanges.map((range) => (
              <rect
                key={range.groupIndex}
                className="agent-token-line-group-hit"
                x={range.x}
                y="0"
                width={range.width}
                height={TOKEN_LINE_CHART_HEIGHT}
                onPointerEnter={() => setHoveredGroupIndex(range.groupIndex)}
              />
            ))}
            {lineChart.areaPath && <path className="agent-token-line-area" d={lineChart.areaPath} fill={`url(#agent-token-area-gradient-${chartUid})`} data-muted={hoveredGroupIndex == null ? undefined : "true"} />}
            {lineChart.segments.map((segment) => {
              const fromPoint = lineChart.points[segment.fromIndex];
              const toPoint = lineChart.points[segment.toIndex];
              const muted = hoveredGroupIndex != null && fromPoint?.stat.groupIndex !== hoveredGroupIndex && toPoint?.stat.groupIndex !== hoveredGroupIndex;
              return <path key={`${fromPoint?.stat.id || segment.fromIndex}-${toPoint?.stat.id || segment.toIndex}`} className="agent-token-line-segment" d={segment.path} stroke={`url(#agent-token-line-gradient-${chartUid})`} data-muted={muted ? "true" : undefined} />;
            })}
            {lineChart.points.map((point) => {
              const stat = point.stat;
              const label = statLabel(stat.kind, stat.label, t);
              const title = label;
              const visual = getAgentStepVisualDescriptor(stat);
              const kind = getAgentStepTypeLabel(stat, t);
              const status = stat.staleRunningState ? t("agentConsole.stepStatus.staleRunning", "Stale running state") : statusLabel(stat.status, t);
              const tokens = t(stat.estimated ? "agentConsole.estimatedTokens" : "agentConsole.tokens", stat.estimated ? "{{value}} tokens estimated" : "{{value}} tokens", { value: formatTokenCount(stat.tokenCount) });
              const details = tokenUsageDetails(stat.usage, t);
              const ariaLabel = [title, `${kind} · ${status}`, tokens, ...details].join("\n");
              const muted = hoveredGroupIndex != null && stat.groupIndex !== hoveredGroupIndex;
              const active = hoveredGroupIndex === stat.groupIndex || stat.index === highlightedIndex;
              const focusStat = () => focusAgentStat(stat.messageId, stat.target === "step" ? (stat.stepId || stat.blockIds[0]) : undefined);
              const handleKeyDown = (event: KeyboardEvent<SVGCircleElement>) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                focusStat();
              };
              return (
                <g key={stat.id} className="agent-token-line-point-wrap" data-muted={muted ? "true" : undefined}>
                  <circle className="agent-token-line-point" cx={point.x} cy={point.y} r={active ? 3.2 : 2.5} fill={point.color} data-current={stat.index === highlightedIndex ? "true" : undefined} />
                  <circle
                    className="agent-token-line-hit"
                    cx={point.x}
                    cy={point.y}
                    r="8"
                    role="button"
                    tabIndex={0}
                    data-agent-token-current={stat.index === highlightedIndex ? "true" : undefined}
                    aria-label={ariaLabel}
                    onClick={focusStat}
                    onKeyDown={handleKeyDown}
                    onPointerEnter={(event) => {
                      setHoveredGroupIndex(stat.groupIndex);
                      const root = topbarRef.current;
                      if (!root) return;
                      const rootRect = root.getBoundingClientRect();
                      const itemRect = event.currentTarget.getBoundingClientRect();
                      setTooltip({ left: getTooltipLeft(rootRect, itemRect), title, iconName: visual.iconName, kind, status, tokens, usage: stat.usage });
                    }}
                    onPointerLeave={() => setTooltip(null)}
                    onFocus={(event) => {
                      setHoveredGroupIndex(stat.groupIndex);
                      const root = topbarRef.current;
                      if (!root) return;
                      const rootRect = root.getBoundingClientRect();
                      const itemRect = event.currentTarget.getBoundingClientRect();
                      setTooltip({ left: getTooltipLeft(rootRect, itemRect), title, iconName: visual.iconName, kind, status, tokens, usage: stat.usage });
                    }}
                    onBlur={() => {
                      setHoveredGroupIndex(null);
                      setTooltip(null);
                    }}
                  />
                </g>
              );
            })}
          </svg>
        ) : displayGroups.map((group) => (
          <div key={group.groupIndex} className="agent-token-topbar-group" data-group-tone={group.groupIndex % 2 === 0 ? "normal" : "alternate"}>
            {group.stats.map((stat) => {
              const shape = getTokenItemShape(stat.tokenCount, stat.kind);
              const label = statLabel(stat.kind, stat.label, t);
              const title = label;
              const visual = getAgentStepVisualDescriptor(stat);
              const kind = getAgentStepTypeLabel(stat, t);
              const status = stat.staleRunningState ? t("agentConsole.stepStatus.staleRunning", "Stale running state") : statusLabel(stat.status, t);
              const tokens = t(stat.estimated ? "agentConsole.estimatedTokens" : "agentConsole.tokens", stat.estimated ? "{{value}} tokens estimated" : "{{value}} tokens", { value: formatTokenCount(stat.tokenCount) });
              const details = tokenUsageDetails(stat.usage, t);
              const ariaLabel = [title, `${kind} · ${status}`, tokens, ...details].join("\n");
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
                    setTooltip({ left: getTooltipLeft(rootRect, itemRect), title, iconName: visual.iconName, kind, status, tokens, usage: stat.usage });
                  }}
                  onPointerLeave={() => setTooltip(null)}
                  onFocus={(event) => {
                    const root = topbarRef.current;
                    if (!root) return;
                    const rootRect = root.getBoundingClientRect();
                    const itemRect = event.currentTarget.getBoundingClientRect();
                    setTooltip({ left: getTooltipLeft(rootRect, itemRect), title, iconName: visual.iconName, kind, status, tokens, usage: stat.usage });
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
          {tokenUsageDetails(tooltip.usage, t).map((detail) => <span key={detail} className="agent-token-topbar-tooltip-detail">{detail}</span>)}
        </div>
      )}
    </div>
  );
}