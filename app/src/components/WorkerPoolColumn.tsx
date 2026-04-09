import { useState } from "react";
import { useMLRAStore, type WorkerSlot, ROLE_COLORS } from "../store/mlraStore";
import { StandbyPlaceholder } from "./StandbyPlaceholder";
import { Icon } from "./Icons";
import { IdenticonAvatar } from "./IdenticonAvatar";

const WORKER_STATUS_COLORS: Record<string, string> = {
  ready: "#10B981",
  working: "#3B82F6",
  broken: "#EF4444",
};

const WORKER_STATUS_LABELS: Record<string, string> = {
  ready: "就绪",
  working: "工作中",
  broken: "异常",
};

const WORKER_STATUS_ICONS: Record<string, string> = {
  ready: "check",
  working: "spinner",
  broken: "close",
};

/**
 * MLRA Worker Pool column — shows a list of worker cards.
 * In planning phase, shows standby. In implementation phase, shows worker list.
 */
export function WorkerPoolColumn() {
  const activeLauncher = useMLRAStore((s) => s.getActiveLauncher());
  const phaseView = useMLRAStore((s) => s.phaseView);
  const color = ROLE_COLORS.worker;

  const workers: WorkerSlot[] = activeLauncher?.agents.workers ?? [];
  const isStandby = phaseView === "planning";

  const activeCount = workers.filter((w) => w.status === "working").length;

  // Sort: working > broken > ready
  const sortedWorkers = [...workers].sort((a, b) => {
    const order = { working: 0, broken: 1, ready: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  return (
    <div
      className="agent-column worker-pool-column"
      style={{ borderLeftColor: `${color}44`, "--caller-color": color } as React.CSSProperties}
    >
      {/* Column header */}
      <div className="agent-column-header">
        <IdenticonAvatar alias="Worker Pool" color={color} size={18} />
        <span className="agent-column-role" style={{ color }}>
          Worker Pool ({activeCount}/{workers.length} 活跃)
        </span>
      </div>

      {/* Body */}
      {isStandby ? (
        <StandbyPlaceholder
          role="Worker Pool"
          message="Worker 在实施阶段由专家按需委派"
        />
      ) : workers.length === 0 ? (
        <div className="agent-column-content">
          <div className="agent-column-session-placeholder">
            <Icon name="users" size={20} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 12, marginTop: 8, color: "var(--color-text-muted)" }}>
              暂无 Worker
            </div>
            <div style={{ fontSize: 10, marginTop: 4, color: "var(--color-text-muted)", opacity: 0.6 }}>
              Worker 将由专家在实施阶段按需创建
            </div>
          </div>
        </div>
      ) : (
        <div className="worker-pool-list">
          {sortedWorkers.map((worker) => (
            <WorkerCard key={worker.id} worker={worker} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkerCard({ worker }: { worker: WorkerSlot }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = WORKER_STATUS_COLORS[worker.status];

  return (
    <div className={`worker-card${expanded ? " worker-card-expanded" : ""}`}>
      {/* Collapsed header */}
      <div className="worker-card-header" onClick={() => setExpanded(!expanded)}>
        <span className="worker-card-status-icon" style={{ color: statusColor }}>
          <Icon name={WORKER_STATUS_ICONS[worker.status]} size={10} />
        </span>
        <span className="worker-card-name">{worker.displayName}</span>
        <span className="worker-card-role-tag">({worker.role})</span>
        <span className="worker-card-expand-btn">
          <Icon name="chevron-down" size={10} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </span>
      </div>

      {/* Status + task line */}
      <div className="worker-card-meta">
        <span className="worker-card-status-label" style={{ color: statusColor }}>
          {WORKER_STATUS_LABELS[worker.status]}
        </span>
        {worker.currentTask && (
          <>
            <span className="worker-card-sep"> - </span>
            <span className="worker-card-task">"{worker.currentTask}"</span>
          </>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="worker-card-detail">
          <div className="worker-card-detail-info">
            <span>Model: {worker.model}</span>
            <span>Sessions: {worker.sessionIds.length}</span>
          </div>
          {worker.status === "broken" && (
            <div className="worker-card-actions">
              <button className="btn worker-card-action-btn">
                <Icon name="play" size={10} /> 重试
              </button>
              <button className="btn worker-card-action-btn worker-card-action-danger">
                <Icon name="trash" size={10} /> 销毁重建
              </button>
            </div>
          )}
          <div className="worker-card-placeholder">
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", textAlign: "center", padding: "12px 0" }}>
              Mini CallerPanel 将在后端连接后集成
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
