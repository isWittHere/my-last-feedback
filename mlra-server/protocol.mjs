// ── MLRA Protocol Definitions ──
// Shared message types between MCP Server ↔ Daemon ↔ Tauri App

// ── Agent Role Types ──

export const AGENT_ROLES = [
  "planning-expert",
  "planning-inspector",
  "execution-expert",
  "execution-inspector",
  "ceo",
  "worker",
];

export const PHASE_AGENTS = {
  planning: ["planning-expert", "planning-inspector"],
  implementation: ["execution-expert", "execution-inspector"],
  cross: ["ceo"],
};

export const CONTROL_MODES = ["autopilot", "ceo-override", "full-override"];

// ── MCP Server → Daemon Messages ──

export const MSG = {
  // Agent registration
  AGENT_REGISTER: "agent_register",
  // Agent submit (blocking)
  AGENT_SUBMIT: "agent_submit",
  // Agent vote
  AGENT_VOTE: "agent_vote",
  // Expert → Worker delegation
  AGENT_ORDER: "agent_order",
  // Expert check worker status
  AGENT_CHECK_ORDERS: "agent_check_orders",
  // Expert await worker
  AGENT_AWAIT_ORDER: "agent_await_order",
  // Worker feedback
  WORKER_SUBMIT_FEEDBACK: "worker_submit_feedback",

  // ── Daemon → MCP Server Responses ──
  RESOLVE: "resolve",
  ERROR: "error",
  ORDERS_STATUS: "orders_status",

  // ── Daemon → Tauri App (push events) ──
  MLRA_AGENT_REGISTERED: "mlra_agent_registered",
  MLRA_AGENT_STATUS: "mlra_agent_status",
  MLRA_PHASE_CHANGE: "mlra_phase_change",
  MLRA_HUMAN_REVIEW: "mlra_human_review",
  MLRA_ROUND_EVENT: "mlra_round_event",
  MLRA_WORKER_STATUS: "mlra_worker_status",
  MLRA_ORCHESTRATION_STATUS: "mlra_orchestration_status",

  // ── Tauri App → Daemon (user actions) ──
  MLRA_ASSIGN_ROLE: "mlra_assign_role",
  MLRA_START_ORCHESTRATION: "mlra_start_orchestration",
  MLRA_SET_CONTROL_MODE: "mlra_set_control_mode",
  MLRA_REVIEW_APPROVED: "mlra_review_approved",
  MLRA_REVIEW_REJECTED: "mlra_review_rejected",
  MLRA_INJECT_MESSAGE: "mlra_inject_message",
  MLRA_TERMINATE: "mlra_terminate",
};

// ── Role labels for tail injection ──

export const ROLE_LABELS = {
  "planning-expert": "规划专家 (Planning Expert)",
  "planning-inspector": "规划监察 (Planning Inspector)",
  "execution-expert": "实施专家 (Execution Expert)",
  "execution-inspector": "实施监察 (Execution Inspector)",
  ceo: "CEO",
  worker: "子Agent (Worker)",
};

// ── Tail injection template ──

export function buildTailInjection(role, phase, phaseId) {
  const label = ROLE_LABELS[role] || role;
  const agentsMdHint = ["planning-expert", "planning-inspector", "execution-expert", "execution-inspector"].includes(role)
    ? `\n如果你对项目现状、技术栈或代码规范不了解，请先阅读项目根目录的 AGENTS.md。\n在任务执行过程中如果你发现 AGENTS.md 需要更新（如技术栈变更、新增模块、规范调整），请主动更新它。`
    : role === "ceo"
    ? `\n[重要] 在做出任何审批或裁决之前，你必须先充分了解项目现状。请务必：\n1. 阅读项目根目录的 AGENTS.md 以了解项目架构、技术栈和规范\n2. 阅读与当前任务直接相关的核心代码文件\n3. 确保你的决策基于对代码库的实际了解，而不是仅凭方案文本做判断\n不要跳过现状勘察直接做出裁决。`
    : `\n如果你对项目现状不了解，请先阅读项目根目录的 AGENTS.md。`;
  return `\n\n[SYSTEM REMINDER]\n你是 ${label}。你正在与工程团队负责人交流。\n当前阶段: ${phase === "planning" ? "规划对峙" : "实施循环"}${phaseId ? `\n当前Phase: ${phaseId}` : ""}\n你必须使用 submit 工具提交你的工作结果。\n不要在没有提交结果的情况下结束对话。${agentsMdHint}`;
}
