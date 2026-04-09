import { useCallback, useMemo, useState } from "react";
import { useMLRAStore, type Launcher, ROLE_COLORS, type AgentRole, type StartMode } from "../store/mlraStore";
import { Icon } from "./Icons";

interface LauncherHomeProps {
  launcher: Launcher | null;
}

const ROLES: { value: AgentRole; label: string }[] = [
  { value: "planning-expert", label: "规划专家" },
  { value: "planning-inspector", label: "规划监察" },
  { value: "execution-expert", label: "执行专家" },
  { value: "execution-inspector", label: "执行监察" },
  { value: "ceo", label: "CEO" },
  { value: "worker", label: "Worker" },
];

const WORKER_ROLE_PRESETS = ["前端开发", "后端开发", "API 设计", "测试编写", "文档撰写", "数据库", "DevOps"];

/**
 * MLRA Launcher homepage.
 * - No launcher: shows create prompt
 * - Configuring launcher: flat agent list with inline role buttons
 */
export function LauncherHome({ launcher }: LauncherHomeProps) {
  const createLauncher = useMLRAStore((s) => s.createLauncher);
  const startOrchestration = useMLRAStore((s) => s.startOrchestration);
  const assignRole = useMLRAStore((s) => s.assignRole);
  const daemonAssignRole = useMLRAStore((s) => s.daemonAssignRole);
  const setWorkerRole = useMLRAStore((s) => s.setWorkerRole);
  const removeRegisteredAgent = useMLRAStore((s) => s.removeRegisteredAgent);
  const [taskName, setTaskName] = useState(launcher?.name || "");

  const handleCreate = useCallback(() => {
    if (!taskName.trim()) return;
    createLauncher(taskName.trim());
    setTaskName("");
  }, [taskName, createLauncher]);

  // ── Readiness checks for two start modes ──
  const readiness = useMemo(() => {
    if (!launcher) return { full: { ready: false, missing: [] as string[], workerCount: 0 }, direct: { ready: false, missing: [] as string[], workerCount: 0 } };
    const agents = launcher.registeredAgents;
    const hasRole = (role: string) => agents.some((a) => a.assignedRole === role);
    const workerCount = agents.filter((a) => a.assignedRole === "worker").length;

    // Full start: all 5 main roles + ≥1 worker
    const fullRequired: { role: AgentRole; label: string }[] = [
      { role: "planning-expert", label: "规划专家" },
      { role: "planning-inspector", label: "规划监察" },
      { role: "execution-expert", label: "执行专家" },
      { role: "execution-inspector", label: "执行监察" },
      { role: "ceo", label: "CEO" },
    ];
    const fullMissing = fullRequired.filter((r) => !hasRole(r.role)).map((r) => r.label);
    if (workerCount < 1) fullMissing.push("≥1 Worker");

    // Direct execution: exec-expert + exec-inspector + ceo + ≥1 worker
    const directRequired: { role: AgentRole; label: string }[] = [
      { role: "execution-expert", label: "执行专家" },
      { role: "execution-inspector", label: "执行监察" },
      { role: "ceo", label: "CEO" },
    ];
    const directMissing = directRequired.filter((r) => !hasRole(r.role)).map((r) => r.label);
    if (workerCount < 1) directMissing.push("≥1 Worker");

    return {
      full: { ready: fullMissing.length === 0, missing: fullMissing, workerCount },
      direct: { ready: directMissing.length === 0, missing: directMissing, workerCount },
    };
  }, [launcher]);

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
                          onClick={() => {
                            const newRole = active ? null : r.value;
                            assignRole(launcher.id, agent.id, newRole);
                            daemonAssignRole(launcher.id, agent.id, newRole);
                          }}
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
                  {agent.assignedRole === "worker" && (
                    <div className="mlra-worker-role-row">
                      <div className="mlra-worker-role-presets">
                        {WORKER_ROLE_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            className={`mlra-worker-preset-chip${agent.workerRole === preset ? " active" : ""}`}
                            onClick={() => setWorkerRole(launcher.id, agent.id, agent.workerRole === preset ? "" : preset)}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        className="mlra-worker-role-input"
                        placeholder="自定义路由角色..."
                        value={agent.workerRole}
                        onChange={(e) => setWorkerRole(launcher.id, agent.id, e.target.value)}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Start Modes */}
        <div className="mlra-home-actions">
          <div className="mlra-start-modes">
            <button
              className="btn btn-primary mlra-start-btn"
              disabled={!readiness.full.ready}
              onClick={() => startOrchestration(launcher.id, "full" as StartMode)}
              title={readiness.full.ready ? "全部5个主Agent + Worker 就位，从规划对峙阶段开始" : `缺少: ${readiness.full.missing.join(", ")}`}
            >
              <Icon name="send" size={14} />
              全开局
            </button>
            <button
              className="btn mlra-start-btn mlra-start-btn-direct"
              disabled={!readiness.direct.ready}
              onClick={() => startOrchestration(launcher.id, "direct-execution" as StartMode)}
              title={readiness.direct.ready ? "跳过规划，直接进入实施阶段" : `缺少: ${readiness.direct.missing.join(", ")}`}
            >
              <Icon name="send" size={14} />
              直接执行
            </button>
          </div>
          {launcher.registeredAgents.length > 0 && (!readiness.full.ready || !readiness.direct.ready) && (
            <div className="mlra-start-hints">
              {!readiness.full.ready && (
                <span className="mlra-start-hint">全开局缺少: {readiness.full.missing.join(", ")}</span>
              )}
              {!readiness.direct.ready && (
                <span className="mlra-start-hint">直接执行缺少: {readiness.direct.missing.join(", ")}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
