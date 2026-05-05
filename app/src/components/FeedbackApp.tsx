import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFeedbackStore, type CallerColumnMode, type DockColumnId, type DockTabId } from "../store/feedbackStore";
import { CallerTabs } from "./CallerTabs";
import { CallerPanel } from "./CallerPanel";
import { SettingsDialog } from "./SettingsDialog";
import { WelcomeHome } from "./WelcomeHome";
import { DockColumn } from "./DockColumn";
import { PreviewBrowserEventBridge } from "./PreviewBrowserEventBridge";
import { MLRAView } from "./MLRAView";
import { MLRACallerTabs } from "./MLRACallerTabs";
import { Icon, MlcLogoIcon } from "./Icons";
import { toggleTheme } from "../theme";
import { useIsLightTheme } from "./useIsLightTheme";
import i18n from "../i18n";
import React from "react";
import {
  ORCHESTRATION_PRESETS,
  useMLRAStore,
  ROLE_COLORS,
  type OrchestrationPresetId,
  type RoundRecord,
  type StageBlueprint,
} from "../store/mlraStore";

/** Format milliseconds to MM:SS or H:MM:SS */
function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const ROLE_LABEL_MAP: Record<string, string> = {
  expert: "Expert",
  inspector: "Inspector",
  ceo: "CEO",
  worker: "Worker",
};

function dockTabTitle(tabId: DockTabId, translate: (key: string, defaultValue: string) => string): string {
  if (tabId === "mlc") return translate("mlc.title", "My Last Chat");
  if (tabId === "mlcPreview") return translate("mlcPreview.title", "MLC Preview");
  if (tabId === "previewBrowser") return translate("previewBrowser.title", "Preview Browser");
  if (tabId === "previewInfo") return translate("previewBrowser.infoTitle", "Preview Info");
  if (tabId === "terminal") return translate("terminal.title", "Terminal");
  return translate("resources.title", "Project resources");
}

function dockTabDragIcon(tabId: DockTabId) {
  if (tabId === "terminal") return "terminal";
  if (tabId === "mlcPreview") return "file-text";
  if (tabId === "previewBrowser") return "globe";
    if (tabId === "previewInfo") return "code";
  return "folder";
}

function DockDragPreview() {
  const { t } = useTranslation();
  const draggingDockTab = useFeedbackStore((s) => s.draggingDockTab);
  if (!draggingDockTab) return null;
  const label = dockTabTitle(draggingDockTab.tabId, t);
  return (
    <div className="dock-tab-drag-preview" style={{ left: draggingDockTab.pointerX + 12, top: draggingDockTab.pointerY + 10 }}>
      {draggingDockTab.tabId === "mlc" ? <MlcLogoIcon size={15} /> : <Icon name={dockTabDragIcon(draggingDockTab.tabId)} size={15} />}
      <span>{label}</span>
    </div>
  );
}

function StageFlowPopover({ stages, currentStageId }: { stages: StageBlueprint[]; currentStageId: string | null }) {
  const { t } = useTranslation();
  const currentIndex = stages.findIndex((stage) => stage.id === currentStageId);

  if (stages.length === 0) {
    return (
      <div className="mlra-stage-flow-popover">
        <div className="mlra-stage-flow-empty">{t("mlra.stage.noStages", "No stages")}</div>
      </div>
    );
  }

  return (
    <div className="mlra-stage-flow-popover">
      <div className="mlra-stage-flow-list">
        {stages.map((stage, index) => {
          const isCurrent = stage.id === currentStageId;
          const isDone = currentIndex >= 0 && index < currentIndex;
          return (
            <React.Fragment key={stage.id}>
              <div className={`mlra-stage-flow-item${isCurrent ? " current" : ""}${isDone ? " done" : ""}${stage.isClosing ? " closing" : ""}`}>
                <span className="mlra-stage-flow-node">
                  <Icon name={stage.icon || "flag"} size={12} />
                </span>
                <span className="mlra-stage-flow-copy">
                  <span className="mlra-stage-flow-name">{stage.name || t("mlra.stage.fallbackName", "Stage {{index}}", { index: index + 1 })}</span>
                  <span className="mlra-stage-flow-meta">
                    {index + 1}/{stages.length}{stage.exitGateEnabled ? " · Gate" : ""}
                  </span>
                </span>
              </div>
              {index < stages.length - 1 ? <span className={`mlra-stage-flow-connector${isDone ? " done" : ""}`} /> : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/** Stats popover shown on timer hover */
function TimerStatsPopover({ rounds, stages, onRequestStop }: { rounds: RoundRecord[]; stages: StageBlueprint[]; onRequestStop: () => void }) {
  const { t } = useTranslation();
  const [stageFilter, setStageFilter] = useState<string>("all");
  const roundDuration = (round: RoundRecord) => {
    const end = round.endedAt ? new Date(round.endedAt).getTime() : Date.now();
    return Math.max(0, end - new Date(round.startedAt).getTime());
  };
  const stageStats = stages.map((stage, index) => {
    const stageRounds = rounds.filter((round) => round.stageId === stage.id);
    return {
      id: stage.id,
      icon: stage.icon || "flag",
      name: stage.name || t("mlra.stage.fallbackName", "Stage {{index}}", { index: index + 1 }),
      index,
      count: stageRounds.length,
      totalMs: stageRounds.reduce((sum, round) => sum + roundDuration(round), 0),
    };
  });
  const unassignedRounds = rounds.filter((round) => !round.stageId || !stages.some((stage) => stage.id === round.stageId));
  if (unassignedRounds.length > 0) {
    stageStats.push({
      id: "__unassigned",
      icon: "info",
      name: t("mlra.timer.unassigned", "Unassigned"),
      index: stageStats.length,
      count: unassignedRounds.length,
      totalMs: unassignedRounds.reduce((sum, round) => sum + roundDuration(round), 0),
    });
  }
  const visibleRounds = stageFilter === "all"
    ? rounds
    : stageFilter === "__unassigned"
      ? unassignedRounds
      : rounds.filter((round) => round.stageId === stageFilter);

  // Aggregate per-role stats
  const roleStats: Record<string, { count: number; totalMs: number }> = {};
  for (const r of visibleRounds) {
    const dur = roundDuration(r);
    if (!roleStats[r.role]) roleStats[r.role] = { count: 0, totalMs: 0 };
    roleStats[r.role].count++;
    roleStats[r.role].totalMs += dur;
  }

  // Compute global time bounds for Gantt positioning + dynamic height
  const MAX_H = 28; // px – maximum bar height / track height
  const MIN_BAR_W = 6; // minimum bar width in px
  const CANVAS_W = 300; // base canvas width
  const GAP_PX = 0; // no gap between merged segments

  const starts = visibleRounds.map((r) => new Date(r.startedAt).getTime());
  const ends = visibleRounds.map((r) => (r.endedAt ? new Date(r.endedAt).getTime() : Date.now()));

  // Build merged active segments (union of all round intervals)
  const intervals = visibleRounds.map((_r, i) => ({ s: starts[i], e: ends[i] }));
  intervals.sort((a, b) => a.s - b.s);
  const merged: { s: number; e: number }[] = [];
  for (const iv of intervals) {
    if (merged.length > 0 && iv.s <= merged[merged.length - 1].e) {
      merged[merged.length - 1].e = Math.max(merged[merged.length - 1].e, iv.e);
    } else {
      merged.push({ s: iv.s, e: iv.e });
    }
  }

  // Compact time mapping: total active ms determines canvas scale
  const totalActiveMs = merged.reduce((s, seg) => s + (seg.e - seg.s), 0) || 1;
  const shortestDur = visibleRounds.length > 0 ? Math.max(1, Math.min(...visibleRounds.map((_r, i) => ends[i] - starts[i]))) : 1;
  const totalGapPx = Math.max(0, (merged.length - 1) * GAP_PX);
  const pxPerMs = Math.max((CANVAS_W - totalGapPx) / totalActiveMs, MIN_BAR_W / shortestDur);
  const totalW = Math.ceil(totalActiveMs * pxPerMs + totalGapPx);

  // Map real timestamp → compact pixel position
  const timeToX = (t: number): number => {
    let x = 0;
    for (let i = 0; i < merged.length; i++) {
      const seg = merged[i];
      if (t <= seg.e) {
        return x + Math.max(0, t - seg.s) * pxPerMs;
      }
      x += (seg.e - seg.s) * pxPerMs + GAP_PX;
    }
    return x;
  };

  // Split into tracks & compute per-track average for dynamic height
  const mainRounds = visibleRounds.filter((r) => r.role !== "worker");
  const workerRounds = visibleRounds.filter((r) => r.role === "worker");

  const avgDur = (arr: RoundRecord[]) => {
    if (arr.length === 0) return 1;
    const total = arr.reduce((s, r) => {
      const e = r.endedAt ? new Date(r.endedAt).getTime() : Date.now();
      return s + (e - new Date(r.startedAt).getTime());
    }, 0);
    return total / arr.length;
  };
  const mainAvg = avgDur(mainRounds);

  // Wheel → horizontal scroll
  const timelineRef = useRef<HTMLDivElement>(null);
  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (timelineRef.current && e.deltaY !== 0) {
      e.preventDefault();
      timelineRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  // Assign swimlanes to worker rounds (greedy: pick lowest available lane)
  const sortedWorkers = [...workerRounds].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );
  const laneEnds: number[] = []; // track when each lane becomes free
  const workerLanes = new Map<string, number>();
  for (const w of sortedWorkers) {
    const ws = new Date(w.startedAt).getTime();
    let lane = laneEnds.findIndex((end) => end <= ws);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = w.endedAt ? new Date(w.endedAt).getTime() : Date.now();
    workerLanes.set(w.id, lane);
  }
  const totalLanes = Math.max(1, laneEnds.length);

  const renderMainBars = () =>
    mainRounds.map((r, i) => {
      const s = new Date(r.startedAt).getTime();
      const e = r.endedAt ? new Date(r.endedAt).getTime() : Date.now();
      const dur = e - s;
      const left = timeToX(s) + 0.5;
      const right = timeToX(e);
      const w = Math.max(MIN_BAR_W, right - left - 1);
      const h = Math.max(4, Math.min(MAX_H, Math.round((dur / mainAvg) * MAX_H)));
      const color = (ROLE_COLORS as Record<string, string>)[r.role] || ROLE_COLORS.worker;
      return (
        <div
          key={r.id || i}
          className="timer-stats-bar"
          style={{ position: "absolute", left, width: w, height: h, background: color, bottom: 0 }}
          title={`${ROLE_LABEL_MAP[r.role] || r.role}  ${formatDuration(dur)}`}
        />
      );
    });

  const workerTrackH = MAX_H;
  const laneH = workerTrackH / totalLanes;

  const renderWorkerBars = () =>
    workerRounds.map((r, i) => {
      const s = new Date(r.startedAt).getTime();
      const e = r.endedAt ? new Date(r.endedAt).getTime() : Date.now();
      const dur = e - s;
      const left = timeToX(s) + 0.5;
      const right = timeToX(e);
      const w = Math.max(MIN_BAR_W, right - left - 1);
      const lane = workerLanes.get(r.id) ?? 0;
      const color = (ROLE_COLORS as Record<string, string>)[r.role] || ROLE_COLORS.worker;
      return (
        <div
          key={r.id || i}
          className="timer-stats-bar"
          style={{ position: "absolute", left, width: w, height: laneH - 1, background: color, top: lane * laneH }}
          title={`${ROLE_LABEL_MAP[r.role] || r.role}  ${formatDuration(dur)}`}
        />
      );
    });

  return (
    <div className="timer-stats-popover">
      {stageStats.length > 0 ? (
        <div className="timer-stats-stage-strip">
          <button className={`timer-stats-stage-chip${stageFilter === "all" ? " active" : ""}`} onClick={() => setStageFilter("all")}>
            {t("previewBrowser.filterAll", "All")}
            <span>{formatDuration(stageStats.reduce((sum, stage) => sum + stage.totalMs, 0))}</span>
          </button>
          {stageStats.map((stage) => (
            <button
              key={stage.id}
              className={`timer-stats-stage-chip${stageFilter === stage.id ? " active" : ""}`}
              onClick={() => setStageFilter(stage.id)}
            >
              <Icon name={stage.icon} size={10} />
              <span className="timer-stats-stage-chip-name">{stage.index + 1}. {stage.name}</span>
              <span>{formatDuration(stage.totalMs)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Dual-track Gantt timeline */}
      <div className="timer-stats-dual" ref={timelineRef} onWheel={onWheel}>
        {visibleRounds.length === 0 ? (
          <div className="timer-stats-empty">{t("mlra.timer.noRounds", "No round records")}</div>
        ) : (
          <div style={{ width: totalW, flexShrink: 0 }}>
            <div className="timer-stats-track timer-stats-track-main" style={{ height: MAX_H }}>
              {renderMainBars()}
            </div>
            <div className="timer-stats-track-divider" />
            <div className="timer-stats-track timer-stats-track-worker" style={{ height: workerTrackH }}>
              {renderWorkerBars()}
            </div>
          </div>
        )}
      </div>

      {/* Row 2: donut chart + summary table */}
      <div className="timer-stats-summary-section">
        {/* Donut chart */}
        {Object.keys(roleStats).length > 0 && (() => {
          const total = Object.values(roleStats).reduce((s, r) => s + r.totalMs, 0) || 1;
          const entries = Object.entries(roleStats);
          const R = 28, r = 18, cx = 36, cy = 36;
          let cumAngle = -Math.PI / 2;
          const arcs = entries.map(([role, stat]) => {
            const frac = stat.totalMs / total;
            const pct = Math.round(frac * 100);
            const startAngle = cumAngle;
            cumAngle += frac * 2 * Math.PI;
            const endAngle = cumAngle;
            const largeArc = frac > 0.5 ? 1 : 0;
            const x1o = cx + R * Math.cos(startAngle), y1o = cy + R * Math.sin(startAngle);
            const x2o = cx + R * Math.cos(endAngle), y2o = cy + R * Math.sin(endAngle);
            const x1i = cx + r * Math.cos(endAngle), y1i = cy + r * Math.sin(endAngle);
            const x2i = cx + r * Math.cos(startAngle), y2i = cy + r * Math.sin(startAngle);
            const d = `M${x1o},${y1o} A${R},${R} 0 ${largeArc},1 ${x2o},${y2o} L${x1i},${y1i} A${r},${r} 0 ${largeArc},0 ${x2i},${y2i} Z`;
            return (
              <path key={role} d={d} fill={(ROLE_COLORS as Record<string, string>)[role] || ROLE_COLORS.worker} className="timer-stats-donut-arc">
                <title>{`${ROLE_LABEL_MAP[role] || role}  ${pct}%  ${formatDuration(stat.totalMs)}`}</title>
              </path>
            );
          });
          return (
            <svg className="timer-stats-donut" viewBox="0 0 72 72" width="60" height="60">
              {arcs}
            </svg>
          );
        })()}

        {/* Summary list */}
        <div className="timer-stats-summary">
          {Object.entries(roleStats).map(([role, stat]) => {
            const total = Object.values(roleStats).reduce((s, r) => s + r.totalMs, 0) || 1;
            const pct = Math.round((stat.totalMs / total) * 100);
            return (
              <div key={role} className="timer-stats-row">
                <span className="timer-stats-dot" style={{ background: (ROLE_COLORS as Record<string, string>)[role] || ROLE_COLORS.worker }} />
                <span className="timer-stats-role">{ROLE_LABEL_MAP[role] || role}</span>
                <span className="timer-stats-count">{t("mlra.timer.roundCount", "{{count}} rounds", { count: stat.count })}</span>
                <span className="timer-stats-pct">{pct}%</span>
                <span className="timer-stats-time">{formatDuration(stat.totalMs)}</span>
              </div>
            );
          })}
          {Object.keys(roleStats).length === 0 && (
            <div className="timer-stats-empty">{t("mlra.timer.noStats", "No statistics")}</div>
          )}
        </div>
      </div>
      <div className="timer-stats-danger-zone">
        <button type="button" className="timer-stop-entry" onClick={onRequestStop}>
          <Icon name="close" size={12} />
          {t("mlra.timer.stop", "Stop current MLRA")}
        </button>
      </div>
    </div>
  );
}

/** Error boundary to catch MLRA render crashes */
class MLRAErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[MLRA crash]", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#f06060", padding: 20, fontSize: 13, flexDirection: "column", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>MLRA Render Error</div>
          <div style={{ color: "#999", fontSize: 11, maxWidth: 500, wordBreak: "break-all" }}>{this.state.error.message}</div>
          <div style={{ color: "#666", fontSize: 10, maxWidth: 500, wordBreak: "break-all" }}>{this.state.error.stack?.split("\n").slice(0, 5).join("\n")}</div>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 12, padding: "4px 12px", background: "#333", color: "#ddd", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}>
            {i18n.t("common.retry", "Retry")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { getCurrentWindow } from "@tauri-apps/api/window";

const PANEL_MIN_WIDTH = 520;
const IS_MACOS = navigator.userAgent.includes('Macintosh');

/** Running timer — counts up from startedAt, subtracting paused time */
function RunningTimer() {
  const { t } = useTranslation();
  const launcher = useMLRAStore((s) => s.getActiveLauncher());
  const daemonCancelOrchestration = useMLRAStore((s) => s.daemonCancelOrchestration);
  const pushNativeWebViewBlocker = useFeedbackStore((s) => s.pushNativeWebViewBlocker);
  const popNativeWebViewBlocker = useFeedbackStore((s) => s.popNativeWebViewBlocker);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!stopConfirmOpen) return;
    pushNativeWebViewBlocker("mlra-stop-confirm");
    return () => popNativeWebViewBlocker("mlra-stop-confirm");
  }, [popNativeWebViewBlocker, pushNativeWebViewBlocker, stopConfirmOpen]);

  useEffect(() => {
    if (!launcher?.startedAt) { setElapsed(0); return; }
    const startMs = new Date(launcher.startedAt).getTime();

    const tick = () => {
      if (launcher.status === "paused" && launcher.pausedAt) {
        const pausedMs = new Date(launcher.pausedAt).getTime() - startMs - launcher.pausedElapsed;
        setElapsed(Math.max(0, pausedMs));
      } else {
        const now = Date.now();
        setElapsed(Math.max(0, now - startMs - launcher.pausedElapsed));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [launcher?.startedAt, launcher?.status, launcher?.pausedAt, launcher?.pausedElapsed]);

  const display = formatDuration(elapsed);
  const rounds = launcher?.roundHistory ?? [];

  return (
    <>
      <span className="mlra-timer-wrapper">
        <span className="mlra-timer">
          <Icon name="clock" size={10} />
          {display}
        </span>
        <TimerStatsPopover rounds={rounds} stages={launcher?.blueprint.stages ?? []} onRequestStop={() => setStopConfirmOpen(true)} />
      </span>
      {stopConfirmOpen && (
        <div className="timer-stop-overlay" onClick={() => setStopConfirmOpen(false)}>
          <div className="timer-stop-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="timer-stop-dialog-header">
              <span>{t("mlra.timer.stopConfirmTitle", "Stop current MLRA?")}</span>
              <button type="button" className="settings-close-btn" onClick={() => setStopConfirmOpen(false)}>
                <Icon name="win-close" size={10} />
              </button>
            </div>
            <div className="timer-stop-dialog-body">{t("mlra.timer.stopConfirmBody", "The current orchestration will be cancelled and blocked role calls will be released.")}</div>
            <div className="timer-stop-dialog-actions">
              <button type="button" className="timer-stop-secondary" onClick={() => setStopConfirmOpen(false)}>
                {t("sidebar.cancel", "Cancel")}
              </button>
              <button
                type="button"
                className="timer-stop-entry timer-stop-confirm-button"
                onClick={() => {
                  setStopConfirmOpen(false);
                  daemonCancelOrchestration();
                }}
              >
                <Icon name="close" size={12} />
                {t("mlra.timer.stopConfirmAction", "Stop")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** MLRA title bar Row 2 */
function MLRARow2() {
  const { t } = useTranslation();
  const launcher = useMLRAStore((s) => s.getActiveLauncher());
  const isActive = launcher?.status === "running" || launcher?.status === "paused" || launcher?.status === "awaiting-user";
  const runtime = launcher?.blueprintRuntime;
  const fallbackStage = launcher?.blueprint.stages.find((stage) => stage.id === launcher.selectedStageId) ?? launcher?.blueprint.stages[0] ?? null;
  const currentStage = runtime?.currentStage ?? fallbackStage;
  const currentStageBlueprint = currentStage && launcher
    ? launcher.blueprint.stages.find((stage) => stage.id === currentStage.id) ?? fallbackStage
    : fallbackStage;
  const currentStageIcon = currentStageBlueprint?.icon ?? "flag";
  const currentStageIndex = runtime?.currentStage
    ? runtime.currentStageIndex
    : currentStage && launcher
      ? launcher.blueprint.stages.findIndex((stage) => stage.id === currentStage.id)
      : -1;
  const totalStages = runtime?.totalStages || launcher?.blueprint.stages.length || 0;
  const currentStageNo = totalStages > 0 && currentStageIndex >= 0 ? `${currentStageIndex + 1}/${totalStages}` : null;

  return (
    <div data-tauri-drag-region className="flex items-center gap-2 px-3" style={{ height: 26 }}>
      {isActive && launcher && (
        <div className="mlra-control-mode-switcher">
          {ORCHESTRATION_PRESETS.map(({ id, label, description, icon, policy }) => (
            <button
              key={id}
              className={`mlra-control-mode-btn${launcher.orchestrationPolicy.preset === id ? " active" : ""}`}
              onClick={() => {
                const nextPolicy = { ...policy, preset: id as OrchestrationPresetId };
                useMLRAStore.getState().setOrchestrationPolicy(launcher.id, nextPolicy);
                useMLRAStore.getState().daemonSetOrchestrationPolicy(nextPolicy);
              }}
              title={t(`mlra.orchestration.${id}.description`, description)}
            >
              <Icon name={icon} size={11} />
              {t(`mlra.orchestration.${id}.label`, label)}
            </button>
          ))}
        </div>
      )}
      {isActive && launcher?.humanGate?.active && (
        <span
          style={{
            fontSize: 11,
            color: "#F59E0B",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            borderRadius: 999,
            padding: "2px 8px",
            background: "rgba(245, 158, 11, 0.1)",
          }}
        >
          {t("mlra.humanGate.blocked", "Blocked: {{title}}", { title: launcher.humanGate.title })}
        </span>
      )}
      {isActive && launcher?.stageExitPending?.active && !launcher?.humanGate?.active && (
        <span
          style={{
            fontSize: 11,
            color: "#818CF8",
            border: "1px solid rgba(129, 140, 248, 0.35)",
            borderRadius: 999,
            padding: "2px 8px",
            background: "rgba(129, 140, 248, 0.1)",
          }}
        >
          {t("mlra.humanGate.exitPending", "Exit certification pending")}
        </span>
      )}
      <div style={{ flex: 1 }} />
      {isActive && currentStage && (
        <span className="mlra-stage-indicator-wrapper">
          <span className={`mlra-stage-indicator${currentStage.isClosing ? " closing" : ""}`}>
            <Icon name={currentStageIcon} size={10} />
            {currentStageNo ? <span className="mlra-stage-indicator-index">{currentStageNo}</span> : null}
            <span className="mlra-stage-indicator-name">{currentStage.name}</span>
          </span>
          <StageFlowPopover stages={launcher?.blueprint.stages ?? []} currentStageId={currentStage.id} />
        </span>
      )}
      {isActive && <RunningTimer />}
    </div>
  );
}

export function FeedbackApp() {
  const { t } = useTranslation();
  const [appView, setAppView] = useState<"MLFB" | "MLRA">("MLFB");
  const callers = useFeedbackStore((s) => s.callers);
  const callerOrder = useFeedbackStore((s) => s.callerOrder);
  const hiddenCallerIds = useFeedbackStore((s) => s.hiddenCallerIds);
  const activeCallerId = useFeedbackStore((s) => s.activeCallerId);
  const dockColumns = useFeedbackStore((s) => s.dockLayout.columns);
  const leftSidebarColumn = dockColumns.leftSidebar;
  const leftPageColumn = dockColumns.leftPage;
  const rightPageColumn = dockColumns.rightPage;
  const rightSidebarColumn = dockColumns.rightSidebar;
  const setDockColumnCollapsed = useFeedbackStore((s) => s.setDockColumnCollapsed);

  // Caller workspace width tracking for responsive multi-column layout
  const callerWorkspaceRef = useRef<HTMLDivElement>(null);
  const [callerWorkspaceWidth, setCallerWorkspaceWidth] = useState(window.innerWidth);
  useEffect(() => {
    const node = callerWorkspaceRef.current;
    if (!node) return;
    const update = () => setCallerWorkspaceWidth(node.getBoundingClientRect().width || window.innerWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Visible callers (excluding hidden ones)
  const visibleCallers = useMemo(() => callers.filter(c => !hiddenCallerIds.includes(c.id)), [callers, hiddenCallerIds]);

  // ── Layout mode: auto / 1 / 2 / 3 ──
  const callerColumnMode = useFeedbackStore((s) => s.callerColumnMode);
  const setCallerColumnMode = useFeedbackStore((s) => s.setCallerColumnMode);
  const layoutModes: CallerColumnMode[] = ["auto", 1, 2, 3];
  const cycleLayoutMode = useCallback(() => {
    const idx = layoutModes.indexOf(callerColumnMode);
    setCallerColumnMode(layoutModes[(idx + 1) % layoutModes.length]);
  }, [callerColumnMode, setCallerColumnMode]);

  // Dynamic parallel: how many columns can fit?
  const autoMaxColumns = Math.max(1, Math.floor(callerWorkspaceWidth / PANEL_MIN_WIDTH));
  const maxColumns = callerColumnMode === "auto" ? autoMaxColumns : callerColumnMode;
  const canMultiColumn = visibleCallers.length > 1 && maxColumns >= 2;

  // Column callers = first N from user-ordered list, excluding hidden ones
  const columnCallerIds = useMemo(() => {
    if (visibleCallers.length <= 1) return [] as string[];
    const order = callerOrder.length > 0 ? callerOrder : callers.map(c => c.id);
    const visibleOrder = order.filter(id => !hiddenCallerIds.includes(id));
    return visibleOrder.slice(0, Math.min(visibleOrder.length, maxColumns));
  }, [callers, callerOrder, hiddenCallerIds, maxColumns, visibleCallers.length]);

  const columnCount = visibleCallers.length > 1 ? Math.min(visibleCallers.length, maxColumns) : 0;
  const useMultiColumn = canMultiColumn && columnCallerIds.length >= 2;

  // Sync columnCount to store so addSession can use it for auto-positioning
  const setVisibleColumnCount = useFeedbackStore((s) => s.setVisibleColumnCount);
  useEffect(() => {
    setVisibleColumnCount(columnCount);
  }, [columnCount, setVisibleColumnCount]);

  const [alwaysOnTop, setAlwaysOnTop] = useState(true);

  const toggleAlwaysOnTop = useCallback(async () => {
    const next = !alwaysOnTop;
    await getCurrentWindow().setAlwaysOnTop(next);
    setAlwaysOnTop(next);
  }, [alwaysOnTop]);

  const toggleDockColumn = useCallback((columnId: DockColumnId) => {
    const column = dockColumns[columnId];
    if (column.tabIds.length === 0) return;
    setDockColumnCollapsed(columnId, !column.collapsed);
  }, [dockColumns, setDockColumnCollapsed]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const pushNativeWebViewBlocker = useFeedbackStore((s) => s.pushNativeWebViewBlocker);
  const popNativeWebViewBlocker = useFeedbackStore((s) => s.popNativeWebViewBlocker);
  const isLightTheme = useIsLightTheme();

  useEffect(() => {
    if (!settingsOpen) return;
    pushNativeWebViewBlocker("settings-dialog");
    return () => popNativeWebViewBlocker("settings-dialog");
  }, [popNativeWebViewBlocker, pushNativeWebViewBlocker, settingsOpen]);

  return (
    <div className="flex flex-col h-screen select-none" data-app-view={appView} style={{ background: "var(--color-bg-base)" }}>
      <PreviewBrowserEventBridge />
      {/* Content wrapper – blurred when settings overlay is open */}
      <div className={`flex flex-col flex-1 min-h-0${settingsOpen ? " content-blurred" : ""}`}>
      {/* Custom title bar */}
      <div
        data-tauri-drag-region
        className={`relative flex flex-col shrink-0 titlebar${appView === "MLRA" ? " titlebar-mlra" : ""}`}
        style={{
          background: "var(--color-bg-surface)",
          borderBottom: "1px solid var(--color-border-subtle)",
          cursor: "default",
          userSelect: "none",
          ...(IS_MACOS ? { paddingLeft: 78 } : {}),
        }}
      >
        {/* Row 1: main title bar */}
        <div data-tauri-drag-region className="relative flex items-center justify-between px-3" style={{ height: 34 }}>
        {/* Left: title or request name */}
        <div data-tauri-drag-region className="flex items-center gap-2 min-w-0 flex-shrink-0 z-10" style={{ maxWidth: "40%" }}>
          <svg data-tauri-drag-region width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
            <path d="M4,3L11.995,3L11.995,4L4,4C3.45,4 3,4.45 3,5L3,10C3,10.55 3.45,11.001 4,11.001L6,11.001L6,13.001L8.75,11.001C8.75,11.001 10.744,11.001 12,11C12.265,11.001 12.52,10.895 12.707,10.708C12.895,10.52 13,10.266 13,10.001L13,5.004L14,5.004L14,10.017C14,11.115 13.115,12.008 12.017,12.017C10.625,12.029 9.012,12.042 9.012,12.042L6.59,13.81C5.93,14.291 5,13.82 5,13.001L5,12.001L4,12.001C2.9,12 2,11.1 2,10L2,5C2,3.9 2.9,3.001 4,3Z" fillRule="nonzero"/>
            <g transform="matrix(1,0,0,1,1.4995,1)"><path d="M12.364,0L14.5,2.137L7.637,9L5.5,9L5.5,6.864L12.364,0ZM13.086,2.137L12.364,1.414L6.5,7.278L6.5,8L7.223,8L13.086,2.137Z"/></g>
            <g transform="matrix(6.12323e-17,-1,1,6.12323e-17,-2,15)"><path d="M6,4.487C6,4.218 5.782,4 5.513,4C5.513,4 5.512,4 5.512,4C5.229,4 5,4.229 5,4.512C5,6.126 5,11 5,11L6,11L6,4.487Z"/></g>
          </svg>
          <div className="app-view-toggle">
            <button
              className={`app-view-toggle-btn${appView === "MLFB" ? " app-view-toggle-active" : ""}`}
              onClick={() => setAppView("MLFB")}
              title={t("app.title", "My Last Feedback")}
            >
              <Icon name="message" size={12} />
              MLFB
            </button>
            <button
              className={`app-view-toggle-btn${appView === "MLRA" ? " app-view-toggle-active" : ""}`}
              onClick={() => setAppView("MLRA")}
              title={t("mlra.title", "My Long Running Agents")}
            >
              <Icon name="clock" size={12} />
              MLRA
            </button>
          </div>
          {appView === "MLFB" && (leftSidebarColumn.tabIds.length > 0 || leftPageColumn.tabIds.length > 0) && (
            <div className="titlebar-dock-group">
              {leftSidebarColumn.tabIds.length > 0 && (
                <button
                  onClick={() => toggleDockColumn("leftSidebar")}
                  className={`titlebar-btn titlebar-side-toggle titlebar-side-toggle-left${!leftSidebarColumn.collapsed ? " titlebar-btn-active" : ""}`}
                  title={!leftSidebarColumn.collapsed ? t("dock.closeLeftSidebar", "Close left sidebar") : t("dock.openLeftSidebar", "Open left sidebar")}
                >
                  <Icon name="sidebar" size={13} />
                </button>
              )}
              {leftPageColumn.tabIds.length > 0 && (
                <button
                  onClick={() => toggleDockColumn("leftPage")}
                  className={`titlebar-btn titlebar-side-toggle titlebar-side-toggle-left-page${!leftPageColumn.collapsed ? " titlebar-btn-active" : ""}`}
                  title={!leftPageColumn.collapsed ? t("dock.closeLeftPage", "Close left page panel") : t("dock.openLeftPage", "Open left page panel")}
                >
                  <Icon name="page-sidebar" size={13} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Center: Caller tabs */}
        {appView === "MLFB" && visibleCallers.length > 1 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={IS_MACOS ? { left: 70 } : undefined}>
            <div className="pointer-events-auto">
              <CallerTabs columnCount={columnCount} />
            </div>
          </div>
        )}
        {/* Center: MLRA role tabs when in MLRA mode with active running launcher */}
        {appView === "MLRA" && (
          <MLRAErrorBoundary>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={IS_MACOS ? { left: 70 } : undefined}>
            <div className="pointer-events-auto">
              <MLRACallerTabs />
            </div>
          </div>
          </MLRAErrorBoundary>
        )}

        {/* Right: controls */}
        <div className="flex items-center gap-1 shrink-0 z-10 ml-auto">
          {visibleCallers.length > 1 && (
            <>
            <button onClick={() => useFeedbackStore.getState().sortCallersByName()} className="titlebar-btn" title={t("titlebar.sortByWorkspace")}>
              <Icon name="sort" size={13} style={{ transform: "rotate(-90deg)" }} />
            </button>
            <LayoutModeButton layoutMode={callerColumnMode} onCycle={cycleLayoutMode} onSelect={setCallerColumnMode} />
            </>
          )}
          {appView === "MLFB" && (rightPageColumn.tabIds.length > 0 || rightSidebarColumn.tabIds.length > 0) && (
            <div className="titlebar-dock-group">
              {rightPageColumn.tabIds.length > 0 && (
                <button
                  onClick={() => toggleDockColumn("rightPage")}
                  className={`titlebar-btn titlebar-side-toggle titlebar-side-toggle-right-page${!rightPageColumn.collapsed ? " titlebar-btn-active" : ""}`}
                  title={!rightPageColumn.collapsed ? t("dock.closeRightPage", "Close right page panel") : t("dock.openRightPage", "Open right page panel")}
                >
                  <Icon name="page-sidebar" size={13} style={{ transform: "scaleX(-1)" }} />
                </button>
              )}
              {rightSidebarColumn.tabIds.length > 0 && (
                <button
                  onClick={() => toggleDockColumn("rightSidebar")}
                  className={`titlebar-btn titlebar-side-toggle titlebar-side-toggle-right${!rightSidebarColumn.collapsed ? " titlebar-btn-active" : ""}`}
                  title={!rightSidebarColumn.collapsed ? t("dock.closeRightSidebar", "Close right sidebar") : t("dock.openRightSidebar", "Open right sidebar")}
                >
                  <Icon name="sidebar" size={13} />
                </button>
              )}
            </div>
          )}
          <button
            onClick={() => toggleTheme()}
            className="titlebar-btn"
            title={isLightTheme ? t("titlebar.toggleDarkTheme") : t("titlebar.toggleLightTheme")}
          >
            <Icon name={isLightTheme ? "moon" : "sun-full"} size={13} />
          </button>
          <button onClick={() => setSettingsOpen(true)} className="titlebar-btn" title={t("settings.title")}>
            <Icon name="gear" size={13} />
          </button>
          <button
            onClick={toggleAlwaysOnTop}
            className={`titlebar-btn${alwaysOnTop ? " titlebar-btn-active" : ""}`}
            title={alwaysOnTop ? t("titlebar.unpin", "Unpin") : t("titlebar.pinOnTop", "Pin on top")}
          >
            <Icon name="pin" size={12} fill={alwaysOnTop ? "currentColor" : "none"} />
          </button>
          {!IS_MACOS && (
            <>
          <button onClick={() => getCurrentWindow().minimize()} className="titlebar-btn" title={t("titlebar.minimize", "Minimize")}>
            <Icon name="win-minimize" size={10} />
          </button>
          <button onClick={() => getCurrentWindow().toggleMaximize()} className="titlebar-btn" title={t("titlebar.maximize", "Maximize")}>
            <Icon name="win-maximize" size={10} />
          </button>
          <button onClick={() => getCurrentWindow().close()} className="titlebar-btn titlebar-close" title={t("titlebar.close", "Close")}>
            <Icon name="win-close" size={10} />
          </button>
            </>
          )}
        </div>
        </div>
        {/* Row 1 end */}

        {/* Row 2: MLRA second bar — ☰ launcher + Control Mode + Pause/Resume + Timer */}
        {appView === "MLRA" && (
          <MLRARow2 />
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {appView === "MLRA" ? (
          /* MLRA view — wrapped in error boundary to prevent full app crash */
          <MLRAErrorBoundary>
            <MLRAView />
          </MLRAErrorBoundary>
        ) : (
          <>
            <DockColumn columnId="leftSidebar" />
            <DockColumn columnId="leftPage" />
            <div ref={callerWorkspaceRef} className="caller-workspace">
              {useMultiColumn ? (
                /* Multi-column: parallel CallerPanels for column callers */
                columnCallerIds.map((id) => (
                  <CallerPanel key={id} callerId={id} />
                ))
              ) : columnCallerIds.length === 1 ? (
                /* Single column with multiple callers: show first from callerOrder */
                <CallerPanel key={columnCallerIds[0]} callerId={columnCallerIds[0]} />
              ) : activeCallerId ? (
                /* Single column: one CallerPanel for the active caller */
                <CallerPanel key={activeCallerId} callerId={activeCallerId} />
              ) : (
                /* No callers yet — show welcome page with key settings */
                <WelcomeHome />
              )}
            </div>
            <DockColumn columnId="rightPage" />
            <DockColumn columnId="rightSidebar" />
          </>
        )}
      </div>
      </div>{/* end content-blurred wrapper */}

      <DockDragPreview />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/** Layout mode toggle button with click-to-cycle and hover dropdown */
function LayoutModeButton({
  layoutMode,
  onCycle,
  onSelect,
}: {
  layoutMode: CallerColumnMode;
  onCycle: () => void;
  onSelect: (mode: CallerColumnMode) => void;
}) {
  const { t } = useTranslation();
  const pushNativeWebViewBlocker = useFeedbackStore((s) => s.pushNativeWebViewBlocker);
  const popNativeWebViewBlocker = useFeedbackStore((s) => s.popNativeWebViewBlocker);
  const [showDropdown, setShowDropdown] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!showDropdown) return;
    pushNativeWebViewBlocker("layout-dropdown");
    return () => popNativeWebViewBlocker("layout-dropdown");
  }, [popNativeWebViewBlocker, pushNativeWebViewBlocker, showDropdown]);

  const handleMouseEnter = () => {
    clearTimeout(hideTimer.current);
    setShowDropdown(true);
  };
  const handleMouseLeave = () => {
    hideTimer.current = setTimeout(() => setShowDropdown(false), 200);
  };

  const modeLabel = (m: CallerColumnMode) => {
    if (m === "auto") return t("titlebar.layoutAuto", "Auto");
    return `${m}`;
  };

  const modeIcon = (m: CallerColumnMode) => {
    // Simple column icons
    const cols = m === "auto" ? 0 : m;
    if (cols === 0) {
      // Auto: "A" label
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="11" fontWeight="bold" fontFamily="sans-serif">A</text>
        </svg>
      );
    }
    // Draw column dividers inside a rectangle
    const dividers: React.ReactNode[] = [];
    for (let i = 1; i < cols; i++) {
      const x = 3 + (18 / cols) * i;
      dividers.push(<line key={i} x1={x} y1="3" x2={x} y2="21" />);
    }
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        {dividers}
      </svg>
    );
  };

  const allModes: CallerColumnMode[] = ["auto", 1, 2, 3];

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={onCycle}
        className={`titlebar-btn${layoutMode !== "auto" ? " titlebar-btn-active" : ""}`}
        title={t("titlebar.layoutMode", "Layout: {{mode}}", { mode: modeLabel(layoutMode) })}
      >
        {modeIcon(layoutMode)}
      </button>
      {showDropdown && (
        <div className="layout-dropdown">
          {allModes.map((m) => (
            <button
              key={String(m)}
              className={`layout-dropdown-item${m === layoutMode ? " active" : ""}`}
              onClick={() => { onSelect(m); setShowDropdown(false); }}
            >
              {modeIcon(m)}
              <span>{modeLabel(m)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

