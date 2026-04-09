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
  return `

[SYSTEM REMINDER]
你是 ${label}。你正在与工程团队负责人交流。
当前阶段: ${phase === "planning" ? "规划对峙" : "实施循环"}${phaseId ? `\n当前Phase: ${phaseId}` : ""}
你必须使用 submit 工具提交你的工作结果。
不要在没有提交结果的情况下结束对话。`;
}
