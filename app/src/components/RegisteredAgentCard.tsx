import { useTranslation } from "react-i18next";
import { useMLRAStore, type RegisteredAgent, type AgentRole, ROLE_COLORS } from "../store/mlraStore";
import { Icon } from "./Icons";
import { timeAgo } from "./timeUtils";

interface RegisteredAgentCardProps {
  agent: RegisteredAgent;
  launcherId: string;
}

const ROLE_OPTIONS: { value: AgentRole | ""; label: string }[] = [
  { value: "", label: "未分配" },
  { value: "planning-expert", label: "规划专家" },
  { value: "planning-inspector", label: "规划监察" },
  { value: "execution-expert", label: "执行专家" },
  { value: "execution-inspector", label: "执行监察" },
  { value: "ceo", label: "CEO" },
  // { value: "worker", label: "Worker" }, // Dormant: hidden while WORKER_ENABLED=false
];

/**
 * Card for a registered agent in the Launcher homepage.
 * Shows alias, model, workspace, role selector, and status.
 */
export function RegisteredAgentCard({ agent, launcherId }: RegisteredAgentCardProps) {
  const { t } = useTranslation();
  const assignRole = useMLRAStore((s) => s.assignRole);
  const removeRegisteredAgent = useMLRAStore((s) => s.removeRegisteredAgent);

  const roleColor = agent.assignedRole ? ROLE_COLORS[agent.assignedRole] : undefined;

  return (
    <div
      className="mlra-agent-card"
      style={roleColor ? { borderColor: `${roleColor}44`, '--caller-color': roleColor } as React.CSSProperties : undefined}
    >
      {/* Top row: alias + model */}
      <div className="mlra-agent-card-header">
        <div className="mlra-agent-card-alias" style={roleColor ? { color: roleColor } : undefined}>
          {agent.alias}
        </div>
        <div className="mlra-agent-card-model">{agent.model}</div>
        <button
          className="mlra-agent-card-remove"
          onClick={() => removeRegisteredAgent(launcherId, agent.id)}
          title="移除此 Agent"
        >
          <Icon name="win-close" size={8} />
        </button>
      </div>

      {/* Info row */}
      <div className="mlra-agent-card-info">
        <span className="mlra-agent-card-client">
          <Icon name="message" size={10} />
          {agent.clientName}
        </span>
        <span className="mlra-agent-card-workspace">{agent.workspace}</span>
        <span className="mlra-agent-card-time">{timeAgo(agent.registeredAt, t)}</span>
      </div>

      {/* Role assignment row */}
      <div className="mlra-agent-card-role-row">
        <span className="mlra-agent-card-role-label">角色:</span>
        <select
          className="mlra-agent-card-role-select"
          value={agent.assignedRole || ""}
          onChange={(e) => assignRole(launcherId, agent.id, (e.target.value || null) as AgentRole | null)}
          style={roleColor ? { borderColor: roleColor, color: roleColor } : undefined}
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {agent.assignedRole && (
          <span className="mlra-agent-card-role-dot" style={{ background: roleColor }} />
        )}
      </div>

      {/* Status indicator */}
      <div className="mlra-agent-card-status">
        <span className="mlra-status-dot mlra-status-registered" />
        <span>已注册{agent.assignedRole ? `，${ROLE_OPTIONS.find((o) => o.value === agent.assignedRole)?.label}` : "，等待分配"}</span>
      </div>
    </div>
  );
}
