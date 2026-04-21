// ── MLRA Protocol Definitions ──
// Shared message types between MCP Server ↔ Daemon ↔ Tauri App

import { NO_WORKER_NOTICE } from "./feature-flags.mjs";

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
  // CEO verdict (blocking)
  CEO_VERDICT: "ceo_verdict",
  // Agent queries
  GET_TASK_CONTEXT: "get_task_context",
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
  MLRA_CEO_GATE_STATUS: "mlra_ceo_gate_status",
  MLRA_SESSION_DERAILED: "mlra_session_derailed",
  MLRA_SESSION_RECOVERED: "mlra_session_recovered",
  MLRA_SESSION_FAILOVER: "mlra_session_failover",
  MLRA_SESSION_BROKEN: "mlra_session_broken",
  MLRA_SESSION_POOL_UPDATE: "mlra_session_pool_update",
  MLRA_BUDGET_UPDATE: "mlra_budget_update",
  MLRA_BUDGET_PAUSE: "mlra_budget_pause",

  // ── Tauri App → Daemon (user actions) ──
  MLRA_ASSIGN_ROLE: "mlra_assign_role",
  MLRA_START_ORCHESTRATION: "mlra_start_orchestration",
  MLRA_SET_CONTROL_MODE: "mlra_set_control_mode",
  MLRA_REVIEW_APPROVED: "mlra_review_approved",
  MLRA_REVIEW_REJECTED: "mlra_review_rejected",
  MLRA_INJECT_MESSAGE: "mlra_inject_message",
  MLRA_TERMINATE: "mlra_terminate",
  MLRA_SET_BUDGET: "mlra_set_budget",
  MLRA_INCREASE_BUDGET: "mlra_increase_budget",

  // ── Hook → Daemon (session notifications) ──
  SESSION_HOOK_NOTIFY: "session_hook_notify",
};

// ── Start Modes ──
// NOTE: Worker sub-agents are currently disabled (see feature-flags.mjs WORKER_ENABLED=false).
// minWorkers is set to 0 so orchestration can start with main agents only.
export const START_MODES = {
  FULL: "full",                    // All 5 main agents
  DIRECT_EXECUTION: "direct-execution", // execution-expert + execution-inspector + ceo
};

export const START_MODE_REQUIREMENTS = {
  [START_MODES.FULL]: {
    required: ["planning-expert", "planning-inspector", "execution-expert", "execution-inspector", "ceo"],
    minWorkers: 0,
  },
  [START_MODES.DIRECT_EXECUTION]: {
    required: ["execution-expert", "execution-inspector", "ceo"],
    minWorkers: 0,
  },
};

// ── Role labels ──

export const ROLE_LABELS = {
  "planning-expert": "规划专家 (Planning Expert)",
  "planning-inspector": "规划监察 (Planning Inspector)",
  "execution-expert": "实施专家 (Execution Expert)",
  "execution-inspector": "实施监察 (Execution Inspector)",
  ceo: "CEO",
  worker: "子Agent (Worker)",
};

// ── Skill file paths per role ──
// NOTE: Skill files live under `skills/` in the workspace root.
// The `worker` entry is intentionally omitted because workers are dormant
// (see feature-flags.mjs WORKER_ENABLED). Re-add it when re-activating.

const SKILL_PATHS = {
  "planning-expert": "skills/skill_planning_expert.md",
  "planning-inspector": "skills/skill_planning_inspector.md",
  "execution-expert": "skills/skill_execution_expert.md",
  "execution-inspector": "skills/skill_execution_inspector.md",
  ceo: "skills/skill_ceo.md",
};

// ── Routing prompt templates ──
// Key: "sourceRole→targetRole" or special routing reasons

const ROUTING_TEMPLATES = {
  // Planning phase: expert ↔ inspector
  "planning-expert→planning-inspector": {
    prefix: "规划专家提交了方案。作为规划监察，请按照你的 Skill 规范进行全面审查，输出结构化审查报告。",
    suffix: "请在审查完成后使用 submit 工具提交审查结果。如果你认为方案已足够成熟，也可以使用 router_vote 工具投票。",
  },
  "planning-inspector→planning-expert": {
    prefix: "监察的审查反馈已送达。作为规划专家，请逐条分析每个反馈项的决策级别，针对性修改方案，修改完成后进行自检再提交。",
    suffix: "请在修改完成后使用 submit 工具提交修改后的方案。如果你认为方案已足够成熟，也可以使用 router_vote 工具投票。",
  },

  // Implementation phase: expert ↔ inspector
  "execution-expert→execution-inspector": {
    prefix: "实施专家提交了阶段完成报告。作为实施监察，请直接检查仓库代码（不信专家自述），按你的 Skill 审查规范输出报告。",
    suffix: "请在审查完成后使用 submit 工具提交审查结果。",
  },
  "execution-inspector→execution-expert": {
    prefix: "监察的审查报告已送达。作为实施专家，请按报告中的决策级别处理每条反馈，完成修复后先自检再提交。",
    suffix: "请使用 submit 工具提交修复后的阶段报告。",
  },

  // CEO triggers
  "orchestrator→ceo:planning_gate": {
    prefix: "规划投票已通过，专家和监察已就方案达成一致。作为CEO，请先勘察项目现状（阅读 AGENTS.md + 核心代码），再审查规划方案。请参考阅读规划书。",
    suffix: "审查后请使用 ceo_verdict 工具提交你的裁决（approved/rejected）。",
  },
  "orchestrator→ceo:final_review": {
    prefix: "全部实施已完成。作为CEO，请对最终产出进行全面验证 — 直接检查代码确认所有需求已实现。请参考阅读规划书。",
    suffix: "验证后请使用 ceo_verdict 工具提交你的裁决（approved/rejected）。",
  },

  // CEO rejection fallback
  "ceo→planning-expert:rejection": {
    prefix: "CEO 退回了方案，请根据以下退回理由修改方案后重新提交。",
    suffix: "修改完成后使用 submit 工具提交修改后的方案。",
  },
  "ceo→planning-inspector:rejection": {
    prefix: "CEO 退回了方案。请等待专家修改后重新审查。以下是 CEO 的退回理由：",
    suffix: "等待专家提交修改后的方案，届时按 Skill 规范重新审查。",
  },
  "ceo→execution-expert:rejection": {
    prefix: "CEO 终审未通过，请根据以下反馈修复后重新提交。",
    suffix: "修复完成后使用 submit 工具提交报告。",
  },
  "ceo→execution-inspector:rejection": {
    prefix: "CEO 终审未通过。请等待专家修复后重新审查。以下是 CEO 的反馈：",
    suffix: "等待专家提交修复后的报告，届时按 Skill 规范重新审查。",
  },

  // Transition to implementation
  "orchestrator→execution-expert:transition": {
    prefix: "规划已通过 CEO 审批，现在进入实施阶段。以下是最终规划书，请按规划执行。",
    suffix: "请阅读你的 Skill 规范了解执行流程和提交格式。按 Phase 顺序逐步执行，每个 Phase 完成后使用 submit 工具提交报告。",
  },
  "orchestrator→execution-inspector:transition": {
    prefix: "规划已通过 CEO 审批，现在进入实施阶段。以下是最终规划书供审查参考。",
    suffix: "请等待实施专家提交阶段完成报告后，按你的 Skill 审查规范进行代码审查。",
  },

  // Phase advance (implementation inspector approved)
  "orchestrator→execution-expert:phase_advance": {
    prefix: "监察已通过当前 Phase 的审查。请继续执行下一个 Phase。以下是监察的审查通过报告：",
    suffix: "请继续按规划书执行下一个 Phase，完成后使用 submit 工具提交报告。",
  },

  // CEO arbitration
  "ceo:arbitration": {
    prefix: "CEO 做出了仲裁裁决。请遵照以下裁决执行：",
    suffix: "",
  },

  // CEO stagnation arbitration
  "orchestrator→ceo:stagnation_arbitration": {
    prefix: "系统检测到编排停滞 — 角色之间反复提交相同内容，无实质进展。作为CEO，请介入仲裁，判断根本原因并给出明确指令打破僵局。",
    suffix: "请使用 ceo_verdict 工具提交你的仲裁裁决。可选择：\n- approved: 认为当前成果已足够，直接推进\n- rejected: 指出问题并给出具体修改方向\n你可以在 targets 中指定需要接收裁决的角色。",
  },

  // CEO defensive review (rejection lock)
  "orchestrator→ceo:defensive_review": {
    prefix: "你的审批已被系统驳斥锁降级为「进一步审查」。这是防御性审查机制。",
    suffix: "请利用这次机会更深入地审视方案，寻找遗漏的问题和风险。审查后使用 ceo_verdict 工具提交裁决。",
  },
  "orchestrator→ceo:consecutive_confirm": {
    prefix: "你的审批已记录，需要连续多次确认才能最终通过。",
    suffix: "请再次仔细确认你的审批决定。确认无误后使用 ceo_verdict 工具再次提交 approved。",
  },
};

/**
 * Build routing prompt for message wrapping.
 * The orchestrator uses this to wrap agent-submitted content with contextual guidance.
 *
 * @param {string} sourceRole - Message source role (e.g. "planning-expert")
 * @param {string} targetRole - Message target role (e.g. "planning-inspector")
 * @param {"planning"|"implementation"} phase - Current orchestration phase
 * @param {object} [context] - Additional routing context
 * @param {string} [context.routingReason] - Special routing reason (e.g. "planning_gate", "final_review", "transition", "phase_advance", "rejection", "arbitration")
 * @returns {{ prefix: string, suffix: string }}
 */
export function buildRoutingPrompt(sourceRole, targetRole, phase, context = {}) {
  const { routingReason } = context;

  // Try special routing keys first
  if (routingReason) {
    const specialKey = `${sourceRole}→${targetRole}:${routingReason}`;
    if (ROUTING_TEMPLATES[specialKey]) return { ...ROUTING_TEMPLATES[specialKey] };

    // Try source-only special key (e.g. "ceo:arbitration")
    const sourceSpecial = `${sourceRole}:${routingReason}`;
    if (ROUTING_TEMPLATES[sourceSpecial]) return { ...ROUTING_TEMPLATES[sourceSpecial] };
  }

  // Standard routing key
  const standardKey = `${sourceRole}→${targetRole}`;
  if (ROUTING_TEMPLATES[standardKey]) return { ...ROUTING_TEMPLATES[standardKey] };

  // Fallback
  const targetLabel = ROLE_LABELS[targetRole] || targetRole;
  return {
    prefix: `来自 ${ROLE_LABELS[sourceRole] || sourceRole} 的消息：`,
    suffix: `你是${targetLabel}。请使用 submit 工具提交你的工作结果。`,
  };
}

/**
 * Build initial prompt for agent startup.
 * Includes role identity, core behavior points, skill file reference, and user task.
 *
 * @param {string} role - Agent role
 * @param {string} userTask - The user's original task description
 * @param {"planning"|"implementation"} phase - Current phase
 * @param {object} [options]
 * @param {boolean} [options.isDirectExecution] - Whether in direct execution mode
 * @returns {string}
 */
export function buildInitialPrompt(role, userTask, phase, options = {}) {
  const label = ROLE_LABELS[role] || role;
  const skillPath = SKILL_PATHS[role];
  const skillRef = skillPath
    ? `\n\n## 行为规范\n在开始工作之前，请阅读以下文件获取你的详细行为指南和提交模板：\n- \`${skillPath}\`\n- 项目根目录的 \`AGENTS.md\` — 项目架构、技术栈和规范`
    : `\n\n## 行为规范\n请阅读项目根目录的 \`AGENTS.md\` 了解项目架构和规范。`;

  if (role === "planning-expert") {
    return `## 角色: ${label}\n\n你是 MLRA 编排系统中的规划专家，负责将任务分解为可执行的规划方案。${skillRef}\n\n## 当前任务\n\n${userTask}\n\n## 行动\n请分析任务需求，制定详细的规划方案，然后使用 submit 工具提交。`;
  }

  if (role === "planning-inspector") {
    return `## 角色: ${label}\n\n你是 MLRA 编排系统中的规划监察，负责独立审查规划方案。${skillRef}\n\n## 当前任务\n\n${userTask}\n\n## 行动\n等待规划专家提交方案后，按 Skill 规范进行全面审查，使用 submit 工具提交审查报告。`;
  }

  if (role === "execution-expert") {
    if (options.isDirectExecution) {
      return `## 角色: ${label}（直接执行模式）\n\n你是 MLRA 编排系统中的实施专家。已跳过规划阶段，直接进入实施。${skillRef}\n\n## 执行纪律\n\n${NO_WORKER_NOTICE}\n\n## 当前任务\n\n${userTask}\n\n## 行动\n1. 分析任务并亲自制定执行计划\n2. 亲自完成所有代码改动与验证工作\n3. 每个 Phase 完成后使用 submit 工具提交进度报告\n4. 提交前进行自检（参照 Skill 中的 re_verify 流程）`;
    }
    return `## 角色: ${label}\n\n你是 MLRA 编排系统中的实施专家。当前处于规划阶段，等待规划完成后进入实施。${skillRef}\n\n## 执行纪律\n\n${NO_WORKER_NOTICE}\n\n## 原始任务\n\n${userTask}\n\n## 行动\n等待规划阶段完成并通过审批后，你将收到最终规划书和实施指令。`;
  }

  if (role === "execution-inspector") {
    if (options.isDirectExecution) {
      return `## 角色: ${label}（直接执行模式）\n\n你是 MLRA 编排系统中的实施监察。已跳过规划阶段，直接进入审查模式。${skillRef}\n\n## 原始任务\n\n${userTask}\n\n## 行动\n等待实施专家提交阶段报告后，直接检查仓库代码进行审查，使用 submit 工具提交审查结果。`;
    }
    return `## 角色: ${label}\n\n你是 MLRA 编排系统中的实施监察。当前处于规划阶段，等待进入实施后开始审查。${skillRef}\n\n## 原始任务\n\n${userTask}\n\n## 行动\n等待实施阶段开始后，审查执行专家的提交。`;
  }

  if (role === "ceo") {
    return `## 角色: CEO\n\n你是 MLRA 编排系统中的 CEO，负责在关键节点进行审查和裁决。${skillRef}\n\n## 原始任务\n\n${userTask}\n\n## 行动\n当前待命中。你将在关键节点（规划审批、终审、仲裁）被唤醒。`;
  }

  if (role === "worker") {
    return `## 角色: ${label}\n\n你是 MLRA 编排系统中的 Worker 子Agent。${skillRef}\n\n## 行动\n等待专家通过 order 工具分配任务给你。收到任务后精准执行，完成后使用 submit_feedback 工具提交结果。`;
  }

  // Fallback
  return `## 角色: ${label}${skillRef}\n\n## 当前任务\n\n${userTask}\n\n请使用 submit 工具提交你的工作结果。`;
}

// ── Legacy: buildTailInjection (deprecated, kept for compatibility) ──

/** @deprecated Use buildRoutingPrompt or buildInitialPrompt instead */
export function buildTailInjection(role, phase, phaseId) {
  const label = ROLE_LABELS[role] || role;
  return `\n\n[SYSTEM REMINDER]\n你是 ${label}。请使用 submit 工具提交你的工作结果。`;
}
