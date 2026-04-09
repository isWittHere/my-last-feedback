import { useMLRAStore, type AgentSlot, ROLE_COLORS } from "../store/mlraStore";
import { StandbyPlaceholder } from "./StandbyPlaceholder";
import { IdenticonAvatar } from "./IdenticonAvatar";
import { Icon } from "./Icons";

interface AgentColumnProps {
  role: "planning-expert" | "planning-inspector" | "execution-expert" | "execution-inspector" | "ceo";
}

const ROLE_LABELS: Record<string, string> = {
  "planning-expert": "规划专家",
  "planning-inspector": "规划监察",
  "execution-expert": "执行专家",
  "execution-inspector": "执行监察",
  ceo: "CEO",
};

const STANDBY_MESSAGES: Record<string, Record<string, string>> = {
  "planning-expert": {
    implementation: "规划专家在执行阶段保持待命",
  },
  "planning-inspector": {
    implementation: "规划监察在执行阶段保持待命",
  },
  "execution-expert": {
    planning: "执行专家在规划阶段保持待命",
  },
  "execution-inspector": {
    planning: "执行监察在规划阶段保持待命",
  },
  ceo: {
    planning: "CEO 将在双方投票通过后介入门控审批",
    implementation: "CEO 将在所有 Phase 完成后进行终审",
  },
};

const STATUS_LABELS: Record<string, string> = {
  active: "活跃",
  standby: "待命",
  idle: "空闲",
};

/**
 * MLRA Agent column — wraps a main agent role (Expert / Inspector / CEO).
 * Shows StandbyPlaceholder when standby, or a mock panel when active.
 */
export function AgentColumn({ role }: AgentColumnProps) {
  const activeLauncher = useMLRAStore((s) => s.getActiveLauncher());
  const phaseView = useMLRAStore((s) => s.phaseView);
  const color = ROLE_COLORS[role];
  const slot: AgentSlot | null = activeLauncher?.agents[role] ?? null;

  const isStandby = !slot || slot.status === "standby";

  return (
    <div
      className={`agent-column${isStandby ? " agent-column-standby" : ""}`}
      style={{ borderLeftColor: `${color}44`, "--caller-color": color } as React.CSSProperties}
    >
      {/* Column header */}
      <div className="agent-column-header">
        <IdenticonAvatar alias={ROLE_LABELS[role]} color={color} size={18} />
        <span className="agent-column-role" style={{ color }}>{ROLE_LABELS[role]}</span>
        {slot && (
          <span className="agent-column-model-tag">{slot.model}</span>
        )}
        {slot && (
          <span className={`agent-column-status agent-column-status-${slot.status}`}>
            {STATUS_LABELS[slot.status]}
          </span>
        )}
      </div>

      {/* Body */}
      {isStandby ? (
        <StandbyPlaceholder
          role={ROLE_LABELS[role]}
          message={STANDBY_MESSAGES[role]?.[phaseView] || "当前阶段暂不参与"}
        />
      ) : (
        <div className="agent-column-content">
          <div className="agent-column-session-placeholder">
            <Icon name="message" size={20} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 12, marginTop: 8, fontWeight: 500, color: "var(--color-text-secondary)" }}>
              {slot.displayName}
            </div>
            <div style={{ fontSize: 10, marginTop: 4, color: "var(--color-text-muted)" }}>
              Session 内容将在后端连接后显示
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
