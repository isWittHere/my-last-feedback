import { useCallback, useState } from "react";
import { useMLRAStore, type Launcher, ROLE_COLORS, type AgentRole } from "../store/mlraStore";
import { Icon } from "./Icons";

interface LauncherHomeProps {
  launcher: Launcher | null;
}

const ROLES: { value: AgentRole; label: string }[] = [
  { value: "expert", label: "专家" },
  { value: "inspector", label: "监察" },
  { value: "ceo", label: "CEO" },
  { value: "worker", label: "Worker" },
];

/**
 * MLRA Launcher homepage.
 * - No launcher: shows create prompt
 * - Configuring launcher: flat agent list with inline role buttons
 */
export function LauncherHome({ launcher }: LauncherHomeProps) {
  const createLauncher = useMLRAStore((s) => s.createLauncher);
  const startOrchestration = useMLRAStore((s) => s.startOrchestration);
  const addRegisteredAgent = useMLRAStore((s) => s.addRegisteredAgent);
  const assignRole = useMLRAStore((s) => s.assignRole);
  const removeRegisteredAgent = useMLRAStore((s) => s.removeRegisteredAgent);
  const [taskName, setTaskName] = useState(launcher?.name || "");

  const handleCreate = useCallback(() => {
    if (!taskName.trim()) return;
    createLauncher(taskName.trim());
    setTaskName("");
  }, [taskName, createLauncher]);

  const canStart = launcher
    ? launcher.registeredAgents.some((a) => a.assignedRole === "expert") &&
      launcher.registeredAgents.some((a) => a.assignedRole === "inspector")
    : false;

  // Mock agent for dev testing
  const handleAddMockAgent = useCallback(() => {
    if (!launcher) return;
    const aliases = ["A1B2", "X9Y8", "K7M3", "P4Q6", "R2D2", "J5N1"];
    const models = ["Claude Sonnet 4", "GPT-4.1", "Claude Opus", "Gemini 2.5 Pro"];
    const idx = launcher.registeredAgents.length;
    addRegisteredAgent(launcher.id, {
      id: `mock-agent-${Date.now()}-${idx}`,
      alias: aliases[idx % aliases.length],
      clientName: "VS Code Copilot",
      model: models[idx % models.length],
      workspace: "my-last-feedback",
      assignedRole: null,
      registeredAt: new Date().toISOString(),
    });
  }, [launcher, addRegisteredAgent]);

  // ── No launcher: create prompt ──
  if (!launcher) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="mlra-home-create">
          <div className="mlra-home-icon">
            <Icon name="clock" size={48} style={{ opacity: 0.4 }} />
          </div>
          <h2 className="mlra-home-title">MLRA — My Long-Running Agent</h2>
          <p className="mlra-home-desc">
            创建一个 Launcher 来开始多 Agent 编排任务。
          </p>
          <div className="mlra-home-input-row">
            <input
              type="text"
              placeholder="输入任务描述，例如：重构用户登录系统"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="mlra-home-input"
            />
            <button
              onClick={handleCreate}
              disabled={!taskName.trim()}
              className="btn btn-primary mlra-home-create-btn"
            >
              <Icon name="send" size={14} />
              新建 Launcher
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Configuring launcher: simple flat agent list ──
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto">
      <div className="mlra-home-config">
        {/* Title row */}
        <div className="mlra-config-title-row">
          <span className="mlra-config-title">{launcher.name}</span>
          <button className="btn mlra-mock-btn" onClick={handleAddMockAgent} title="添加模拟 Agent（开发调试用）">
            + Mock
          </button>
        </div>

        {/* Agent list */}
        <div className="mlra-config-list">
          {launcher.registeredAgents.length === 0 ? (
            <div className="mlra-config-empty">
              <Icon name="radio" size={24} style={{ opacity: 0.3 }} />
              <span>等待 Agent 注册...</span>
            </div>
          ) : (
            launcher.registeredAgents.map((agent) => {
              const roleColor = agent.assignedRole ? ROLE_COLORS[agent.assignedRole] : undefined;
              return (
                <div key={agent.id} className="mlra-config-row" style={roleColor ? { borderLeftColor: roleColor } : undefined}>
                  <span className="mlra-config-alias" style={roleColor ? { color: roleColor } : undefined}>
                    {agent.alias}
                  </span>
                  <span className="mlra-config-model">{agent.model}</span>
                  <div className="mlra-config-roles">
                    {ROLES.map((r) => {
                      const active = agent.assignedRole === r.value;
                      return (
                        <button
                          key={r.value}
                          className={`mlra-config-role-btn${active ? " mlra-config-role-active" : ""}`}
                          style={active ? { background: ROLE_COLORS[r.value], borderColor: ROLE_COLORS[r.value] } : undefined}
                          onClick={() => assignRole(launcher.id, agent.id, active ? null : r.value)}
                          title={r.label}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="mlra-config-remove"
                    onClick={() => removeRegisteredAgent(launcher.id, agent.id)}
                    title="移除"
                  >
                    <Icon name="win-close" size={8} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Start */}
        <div className="mlra-home-actions">
          <button
            className="btn btn-primary mlra-start-btn"
            disabled={!canStart}
            onClick={() => startOrchestration(launcher.id)}
          >
            <Icon name="send" size={14} />
            开始编排
          </button>
          {!canStart && launcher.registeredAgents.length > 0 && (
            <span className="mlra-start-hint">需要分配专家和监察</span>
          )}
        </div>
      </div>
    </div>
  );
}
