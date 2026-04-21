import { useCallback, useMemo, useState } from "react";
import { useMLRAStore, type Launcher, ROLE_COLORS, type AgentRole, type StartMode } from "../store/mlraStore";
import { Icon } from "./Icons";

const TASK_TYPES = [
  { value: "brainstorm", label: "头脑风暴" },
  { value: "shortlist", label: "海选题" },
  { value: "architecture", label: "规划架构构思" },
  { value: "execution", label: "计划落地" },
  { value: "full-chain", label: "全链路" },
] as const;

interface LauncherHomeProps {
  launcher: Launcher | null;
}

const ROLES: { value: AgentRole; label: string }[] = [
  { value: "planning-expert", label: "规划专家" },
  { value: "planning-inspector", label: "规划监察" },
  { value: "execution-expert", label: "执行专家" },
  { value: "execution-inspector", label: "执行监察" },
  { value: "ceo", label: "CEO" },
  // { value: "worker", label: "Worker" }, // Dormant: hidden while WORKER_ENABLED=false
];

const WORKER_ROLE_PRESETS = ["前端开发", "后端开发", "API 设计", "测试编写", "文档撰写", "数据库", "DevOps"];

/**
 * MLRA Launcher unified page.
 * Combines "create launcher" and "configure agents" into a single layout.
 * When no launcher exists, the create input is active and config sections show
 * disabled/empty placeholders. Once a launcher is created, the same layout
 * transitions to fully interactive configuration.
 */
export function LauncherHome({ launcher }: LauncherHomeProps) {
  const createLauncher = useMLRAStore((s) => s.createLauncher);
  const startOrchestration = useMLRAStore((s) => s.startOrchestration);
  const assignRole = useMLRAStore((s) => s.assignRole);
  const daemonAssignRole = useMLRAStore((s) => s.daemonAssignRole);
  const setWorkerRole = useMLRAStore((s) => s.setWorkerRole);
  const removeRegisteredAgent = useMLRAStore((s) => s.removeRegisteredAgent);
  const setTaskType = useMLRAStore((s) => s.setTaskType);
  const setUserTask = useMLRAStore((s) => s.setUserTask);

  // Local draft state (used before a launcher is created).
  // Once a launcher exists, edits go directly into the store.
  const [draftName, setDraftName] = useState("");
  const [draftTaskType, setDraftTaskType] = useState<string | null>(null);
  const [draftUserTask, setDraftUserTask] = useState("");

  const hasLauncher = !!launcher;

  // Ensure a launcher exists. If missing, creates one from the draft state and
  // flushes draft task-type / user-task into the store. Returns launcher id,
  // or null if no name is provided.
  const ensureLauncher = useCallback((): string | null => {
    if (launcher) return launcher.id;
    const name = draftName.trim();
    if (!name) return null;
    const id = createLauncher(name);
    if (draftTaskType) setTaskType(id, draftTaskType as any);
    if (draftUserTask.trim()) setUserTask(id, draftUserTask);
    return id;
  }, [launcher, draftName, draftTaskType, draftUserTask, createLauncher, setTaskType, setUserTask]);

  // Commit draft name → create launcher (on blur/Enter). Agents need an
  // existing launcher to register against, so we materialize early.
  const commitName = useCallback(() => {
    if (!draftName.trim()) return;
    ensureLauncher();
  }, [draftName, ensureLauncher]);

  const handleTaskTypeClick = useCallback((value: string) => {
    if (launcher) {
      setTaskType(launcher.id, launcher.taskType === value ? null : (value as any));
    } else {
      setDraftTaskType((prev) => (prev === value ? null : value));
    }
  }, [launcher, setTaskType]);

  const handleUserTaskChange = useCallback((v: string) => {
    if (launcher) setUserTask(launcher.id, v);
    else setDraftUserTask(v);
  }, [launcher, setUserTask]);

  const handleStart = useCallback((mode: StartMode) => {
    const id = ensureLauncher();
    if (!id) return;
    startOrchestration(id, mode);
  }, [ensureLauncher, startOrchestration]);

  // ── Readiness checks for two start modes ──
  const readiness = useMemo(() => {
    if (!launcher) {
      // No launcher yet: need name first.
      const missing: string[] = [];
      if (!draftName.trim()) missing.push("请填写 Launcher 名称");
      return {
        full: { ready: draftName.trim().length > 0, missing, workerCount: 0 },
        direct: { ready: draftName.trim().length > 0, missing, workerCount: 0 },
      };
    }
    const agents = launcher.registeredAgents;

    // v2 mode: 0 registered agents means MCP clients auto-connect on start.
    // Only require a task description.
    if (agents.length === 0) {
      const missing: string[] = [];
      if (!launcher.userTask.trim() && !launcher.name.trim()) missing.push("请填写任务描述");
      const ready = missing.length === 0;
      return {
        full: { ready, missing, workerCount: 0 },
        direct: { ready, missing, workerCount: 0 },
      };
    }

    // v1 mode: full role readiness check.
    const hasRole = (role: string) => agents.some((a) => a.assignedRole === role);
    const workerCount = agents.filter((a) => a.assignedRole === "worker").length;

    const fullRequired: { role: AgentRole; label: string }[] = [
      { role: "planning-expert", label: "规划专家" },
      { role: "planning-inspector", label: "规划监察" },
      { role: "execution-expert", label: "执行专家" },
      { role: "execution-inspector", label: "执行监察" },
      { role: "ceo", label: "CEO" },
    ];
    const fullMissing = fullRequired.filter((r) => !hasRole(r.role)).map((r) => r.label);
    if (workerCount < 1) fullMissing.push("≥1 Worker");

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
  }, [launcher, draftName]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto">
      <div className="mlra-home-config">
        {/* Header — unified title */}
        <div className="mlra-config-title-row">
          <div className="mlra-home-icon" style={{ marginRight: 12 }}>
            <Icon name="clock" size={20} style={{ opacity: 0.55 }} />
          </div>
          <span className="mlra-config-title">
            {hasLauncher ? launcher!.name : "MLRA — My Long-Running Agent"}
          </span>
        </div>

        {!hasLauncher && (
          <p className="mlra-home-desc" style={{ marginTop: -4, marginBottom: 12 }}>
            填写信息并点击"开局"即可同步创建 Launcher 并启动编排。Agent 将在命名后自动注册到此 Launcher。
          </p>
        )}

        {/* Two-column body: left = task config + start, right = agent list */}
        <div className="mlra-home-two-col">
          <div className="mlra-home-col-left">
            {/* Launcher creation / summary row */}
            <div className="mlra-task-config">
              <div className="mlra-task-desc-row">
                <label className="mlra-task-label">Launcher 名称</label>
                {hasLauncher ? (
                  <input
                    type="text"
                    className="mlra-task-desc-input"
                    value={launcher!.name}
                    disabled
                    readOnly
                    style={{ opacity: 0.7 }}
                  />
                ) : (
                  <input
                    type="text"
                    placeholder="输入任务描述，例如：重构用户登录系统"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitName();
                      }
                    }}
                    className="mlra-task-desc-input"
                    style={{ flex: 1 }}
                  />
                )}
              </div>

              {/* Task type chips */}
              <div className="mlra-task-type-row">
                <label className="mlra-task-label">任务类型</label>
                <div className="mlra-task-type-chips">
                  {TASK_TYPES.map((t) => {
                    const active = hasLauncher ? launcher!.taskType === t.value : draftTaskType === t.value;
                    return (
                      <button
                        key={t.value}
                        className={`mlra-task-type-chip${active ? " active" : ""}`}
                        onClick={() => handleTaskTypeClick(t.value)}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Task description */}
              <div className="mlra-task-desc-row">
                <label className="mlra-task-label">任务描述</label>
                <textarea
                  className="mlra-task-desc-input"
                  placeholder="描述你的任务需求，例如：重构用户登录系统，支持 OAuth2 和 MFA..."
                  value={hasLauncher ? launcher!.userTask : draftUserTask}
                  onChange={(e) => handleUserTaskChange(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            {/* Start Modes */}
            <div className="mlra-home-actions">
              <div className="mlra-start-modes">
                <button
                  className="btn btn-primary mlra-start-btn"
                  disabled={!readiness.full.ready}
                  onClick={() => handleStart("full" as StartMode)}
                  title={readiness.full.ready ? "全部5个主Agent + Worker 就位，从规划对峙阶段开始" : `缺少: ${readiness.full.missing.join(", ")}`}
                >
                  <Icon name="send" size={14} />
                  全开局
                </button>
                <button
                  className="btn mlra-start-btn mlra-start-btn-direct"
                  disabled={!readiness.direct.ready}
                  onClick={() => handleStart("direct-execution" as StartMode)}
                  title={readiness.direct.ready ? "跳过规划，直接进入实施阶段" : `缺少: ${readiness.direct.missing.join(", ")}`}
                >
                  <Icon name="send" size={14} />
                  直接执行
                </button>
              </div>
              {(!readiness.full.ready || !readiness.direct.ready) && (
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

          {/* Right column — Agent list */}
          <div className="mlra-home-col-right">
            <div className="mlra-home-col-header">
              <span className="mlra-home-col-title">已注册 Agent</span>
              <span className="mlra-home-col-count">
                {hasLauncher ? launcher!.registeredAgents.length : 0}
              </span>
            </div>
            <div className="mlra-config-list">
              {!hasLauncher ? (
                <div className="mlra-config-empty">
                  <Icon name="radio" size={24} style={{ opacity: 0.3 }} />
                  <span>填写名称后，注册的 Agent 会在这里显示并可分配角色</span>
                </div>
              ) : launcher!.registeredAgents.length === 0 ? (
                <div className="mlra-config-empty">
                  <Icon name="radio" size={24} style={{ opacity: 0.3 }} />
                  <span>等待 Agent 注册...</span>
                </div>
              ) : (
                launcher!.registeredAgents.map((agent) => {
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
                                assignRole(launcher!.id, agent.id, newRole);
                                daemonAssignRole(launcher!.id, agent.id, newRole);
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
                        onClick={() => removeRegisteredAgent(launcher!.id, agent.id)}
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
                                onClick={() => setWorkerRole(launcher!.id, agent.id, agent.workerRole === preset ? "" : preset)}
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
                            onChange={(e) => setWorkerRole(launcher!.id, agent.id, e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
