import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
import { AppSelect, type AppSelectOption } from "./AppSelect";

interface AgentColumnProps {
  role: "expert" | "inspector" | "ceo";
}

const ROLE_LABELS: Record<string, string> = {
  expert: "Expert",
  inspector: "Inspector",
  ceo: "CEO",
};

function AgentPolicySelect({ role }: { role: "expert" | "inspector" | "ceo" }) {
  const { t } = useTranslation();
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
  const submitPolicyOptions: Array<AppSelectOption<SubmitReleasePolicy>> = [
    { value: "auto", label: t("mlra.policy.auto", "Auto"), icon: "play", description: t("mlra.policy.submitAutoDesc", "Release this role automatically after it submits.") },
    { value: "user-review", label: t("mlra.policy.manual", "Manual"), icon: "users", description: t("mlra.policy.submitManualDesc", "Pause after this role submits for manual review, edits, or rollback.") },
  ];
  const ceoPolicyOptions: Array<AppSelectOption<CeoGateMode>> = [
    { value: "auto", label: t("mlra.policy.auto", "Auto"), icon: "play", description: t("mlra.policy.ceoAutoDesc", "CEO reviews and releases the verdict automatically.") },
    { value: "user", label: t("mlra.policy.manual", "Manual"), icon: "users", description: t("mlra.policy.ceoManualDesc", "Skip automatic CEO verdicts and let the user decide the gate directly.") },
    { value: "review", label: t("mlra.policy.semiAuto", "Semi-auto"), icon: "eye", description: t("mlra.policy.ceoReviewDesc", "CEO produces a verdict, then waits for user confirmation.") },
  ];
  const options = isCeo ? ceoPolicyOptions : submitPolicyOptions;

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
    <AppSelect
      className="agent-column-policy-select"
      value={value}
      options={options}
      onChange={handleChange}
      ariaLabel={t("mlra.agent.policyAria", "{{role}} automation level", { role: ROLE_LABELS[role] })}
    />
  );
}

function SessionPoolBadge({ pool }: { pool: SessionPool }) {
  const { t } = useTranslation();
  const standbyCount = pool.standbys.length;
  const primaryStatus = pool.primary?.status || "unknown";
  const isDerailed = primaryStatus === "derailed";
  const isBroken = primaryStatus === "broken";

  if (isBroken && standbyCount === 0) {
    return (
      <span className="session-pool-badge session-pool-broken" title={t("mlra.agent.noStandby", "No standby sessions available")}>
        {t("mlra.agent.poolBroken", "Disconnected")}
      </span>
    );
  }

  if (isDerailed) {
    return (
      <span className="session-pool-badge session-pool-derailed" title={t("mlra.agent.retryTitle", "Retry {{current}}/{{max}}", { current: pool.retryCount, max: pool.maxRetries })}>
        {t("mlra.agent.derailedCount", "Derailed {{current}}/{{max}}", { current: pool.retryCount, max: pool.maxRetries })}
      </span>
    );
  }

  if (standbyCount > 0) {
    return (
      <span className="session-pool-badge session-pool-ok" title={t("mlra.agent.standbyCount", "{{count}} standby session(s)", { count: standbyCount })}>
        ● 1+{standbyCount}
      </span>
    );
  }

  if (pool.failoverCount > 0) {
    return (
      <span className="session-pool-badge session-pool-failover" title={t("mlra.agent.failoverTitle", "Failed over {{count}} time(s)", { count: pool.failoverCount })}>
        {t("mlra.agent.failoverCount", "Failover x{{count}}", { count: pool.failoverCount })}
      </span>
    );
  }

  return null;
}

/** Inline message input for expert columns — allows user to inject messages to experts */
function ExpertMessageInput({ callerId }: { callerId: string }) {
  const { t } = useTranslation();
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
        placeholder={t("mlra.agent.injectPlaceholder", "Send instructions to Expert...")}
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
  const { t } = useTranslation();
  const activeLauncher = useMLRAStore((s) => s.getActiveLauncher());
  const color = ROLE_COLORS[role];
  const slot: AgentSlot | null = activeLauncher ? activeLauncher.agents[role] : null;
  const pool: SessionPool | undefined = activeLauncher ? activeLauncher.sessionPools[role] : undefined;

  const isStandby = !slot || slot.status === "standby";
  const isExpert = role === "expert";

  const standbyMessages: Record<string, string> = {
    expert: t("mlra.agent.standbyExpert", "Waiting for Expert to join this stage"),
    inspector: t("mlra.agent.standbyInspector", "Waiting for Inspector to join this stage"),
    ceo: t("mlra.agent.standbyCeo", "CEO will join at gates or the closing stage"),
  };
  const statusLabels: Record<string, string> = {
    active: t("mlra.status.active", "Active"),
    standby: t("mlra.status.standby", "Standby"),
    idle: t("mlra.status.idle", "Idle"),
    blocked: t("mlra.status.blocked", "Blocked"),
    "waiting-human-review": t("mlra.status.waitingHumanReview", "Waiting for human"),
    "waiting-peer": t("mlra.status.waitingPeer", "Waiting for peer"),
    "waiting-gate": t("mlra.status.waitingGate", "Waiting for gate"),
    disconnected: t("mlra.status.disconnected", "Disconnected"),
    derailed: t("mlra.status.derailed", "Derailed"),
    broken: t("mlra.status.broken", "Broken"),
  };

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
              {statusLabels[slot.status]}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      {isStandby ? (
        <StandbyPlaceholder
          role={ROLE_LABELS[role]}
          message={standbyMessages[role] || t("mlra.agent.standbyDefault", "This role is not participating in the current stage")}
        />
      ) : (
        <div className="agent-column-content">
          <div className="agent-column-session-placeholder">
            <Icon name="message" size={20} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 12, marginTop: 8, fontWeight: 500, color: "var(--color-text-secondary)" }}>
              {slot.displayName}
            </div>
            <div style={{ fontSize: 10, marginTop: 4, color: "var(--color-text-muted)" }}>
              {t("mlra.agent.sessionPending", "Session content will appear after the backend connects")}
            </div>
          </div>
          {/* Expert message injection */}
          {isExpert && slot && <ExpertMessageInput callerId={slot.id} />}
        </div>
      )}
    </div>
  );
}
