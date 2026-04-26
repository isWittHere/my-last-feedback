import { useState, useCallback } from "react";
import {
  customizeOrchestrationPolicy,
  getCeoGateMode,
  setPolicyCeoGateMode,
  useMLRAStore,
  type AgentSlot,
  type CeoGateMode,
  type SessionPool,
  type SubmitReleasePolicy,
  ROLE_COLORS,
} from "../store/mlraStore";
import { StandbyPlaceholder } from "./StandbyPlaceholder";
import { MLRARoleIcon } from "./MLRARoleIcon";
import { Icon } from "./Icons";

interface AgentColumnProps {
  role: "expert" | "inspector" | "ceo";
}

const ROLE_LABELS: Record<string, string> = {
  expert: "Expert",
  inspector: "Inspector",
  ceo: "CEO",
};

const STANDBY_MESSAGES: Record<string, string> = {
  expert: "等待 Expert 接入当前阶段",
  inspector: "等待 Inspector 接入当前阶段",
  ceo: "CEO 将在阶段门控或结束阶段介入",
};

const STATUS_LABELS: Record<string, string> = {
  active: "活跃",
  standby: "待命",
  idle: "空闲",
  blocked: "阻塞",
  "waiting-human-review": "待人工",
  "waiting-peer": "待对侧",
  "waiting-gate": "待门控",
  disconnected: "断开",
  derailed: "脱轨",
  broken: "断线",
};

const SUBMIT_POLICY_OPTIONS: Array<{ value: SubmitReleasePolicy; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "user-review", label: "人工" },
];

const CEO_POLICY_OPTIONS: Array<{ value: CeoGateMode; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "user", label: "人工" },
  { value: "review", label: "半自动" },
];

function AgentPolicySelect({ role }: { role: "expert" | "inspector" | "ceo" }) {
  const launcher = useMLRAStore((s) => s.getActiveLauncher());
  const setOrchestrationPolicy = useMLRAStore((s) => s.setOrchestrationPolicy);
  const daemonSetOrchestrationPolicy = useMLRAStore((s) => s.daemonSetOrchestrationPolicy);

  if (!launcher) return null;

  const policy = launcher.orchestrationPolicy;
  const isCeo = role === "ceo";
  const value = isCeo
    ? getCeoGateMode(policy)
    : role === "expert"
      ? policy.expertSubmit
      : policy.inspectorSubmit;
  const options = isCeo ? CEO_POLICY_OPTIONS : SUBMIT_POLICY_OPTIONS;

  const handleChange = (nextValue: string) => {
    const nextPolicy = isCeo
      ? setPolicyCeoGateMode(policy, nextValue as CeoGateMode)
      : customizeOrchestrationPolicy(policy, {
          [role === "expert" ? "expertSubmit" : "inspectorSubmit"]: nextValue as SubmitReleasePolicy,
        });
    setOrchestrationPolicy(launcher.id, nextPolicy);
    daemonSetOrchestrationPolicy(nextPolicy);
  };

  return (
    <select
      className="agent-column-policy-select"
      value={value}
      onChange={(event) => handleChange(event.target.value)}
      aria-label={`${ROLE_LABELS[role]} 自动程度`}
      title={`${ROLE_LABELS[role]} 自动程度`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function SessionPoolBadge({ pool }: { pool: SessionPool }) {
  const standbyCount = pool.standbys.length;
  const primaryStatus = pool.primary?.status || "unknown";
  const isDerailed = primaryStatus === "derailed";
  const isBroken = primaryStatus === "broken";

  if (isBroken && standbyCount === 0) {
    return (
      <span className="session-pool-badge session-pool-broken" title="无可用备用会话">
        ✕ 已断线
      </span>
    );
  }

  if (isDerailed) {
    return (
      <span className="session-pool-badge session-pool-derailed" title={`重试 ${pool.retryCount}/${pool.maxRetries}`}>
        ⚠ 脱轨 {pool.retryCount}/{pool.maxRetries}
      </span>
    );
  }

  if (standbyCount > 0) {
    return (
      <span className="session-pool-badge session-pool-ok" title={`${standbyCount} 个备用会话`}>
        ● 1+{standbyCount}
      </span>
    );
  }

  if (pool.failoverCount > 0) {
    return (
      <span className="session-pool-badge session-pool-failover" title={`已故障转移 ${pool.failoverCount} 次`}>
        ↻ 转移×{pool.failoverCount}
      </span>
    );
  }

  return null;
}

/** Inline message input for expert columns — allows user to inject messages to experts */
function ExpertMessageInput({ callerId }: { callerId: string }) {
  const [text, setText] = useState("");
  const daemonInjectMessage = useMLRAStore((s) => s.daemonInjectMessage);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    daemonInjectMessage(callerId, trimmed);
    setText("");
  }, [text, callerId, daemonInjectMessage]);

  return (
    <div className="agent-column-inject">
      <input
        type="text"
        className="agent-column-inject-input"
        placeholder="向专家发送指令..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
      />
      <button className="agent-column-inject-btn" onClick={handleSend} disabled={!text.trim()}>
        <Icon name="send" size={12} />
      </button>
    </div>
  );
}

/**
 * MLRA Agent column — wraps a main agent role (Expert / Inspector / CEO).
 * Shows StandbyPlaceholder when standby, or a mock panel when active.
 */
export function AgentColumn({ role }: AgentColumnProps) {
  const activeLauncher = useMLRAStore((s) => s.getActiveLauncher());
  const color = ROLE_COLORS[role];
  const slot: AgentSlot | null = activeLauncher ? activeLauncher.agents[role] : null;
  const pool: SessionPool | undefined = activeLauncher ? activeLauncher.sessionPools[role] : undefined;

  const isStandby = !slot || slot.status === "standby";
  const isExpert = role === "expert";

  return (
    <div
      className={`agent-column${isStandby ? " agent-column-standby" : ""}`}
      style={{ borderLeftColor: `${color}44`, "--caller-color": color } as React.CSSProperties}
    >
      {/* Column header */}
      <div className="agent-column-header">
        <MLRARoleIcon role={role} color={color} size={18} />
        <span className="agent-column-role" style={{ color }}>{ROLE_LABELS[role]}</span>
        {slot && (
          <span className="agent-column-model-tag">{slot.model}</span>
        )}
        {pool && <SessionPoolBadge pool={pool} />}
        <div className="agent-column-header-actions">
          <AgentPolicySelect role={role} />
          {slot && (
            <span className={`agent-column-status agent-column-status-${slot.status}`}>
              {STATUS_LABELS[slot.status]}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      {isStandby ? (
        <StandbyPlaceholder
          role={ROLE_LABELS[role]}
          message={STANDBY_MESSAGES[role] || "当前阶段暂不参与"}
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
          {/* Expert message injection */}
          {isExpert && slot && <ExpertMessageInput callerId={slot.id} />}
        </div>
      )}
    </div>
  );
}
