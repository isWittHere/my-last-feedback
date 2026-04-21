// mcp/mlra/protocol/prompts.mjs
// v2 routing / initial-prompt templates for the 3-role topology.
//
// Design philosophy (2026-02 clarification):
// Every agent should feel as if the USER is speaking to it. Other agents are
// INVISIBLE. Routing prompts never mention "the Expert submitted", "the
// Inspector reviewed", etc. — relayed content is framed as input from the
// user (or unattributed external material). An agent knows its own role
// (from Skill) but does not know other roles exist.

import { ROLES, ROLE_LABELS, PHASES } from "./roles.mjs";

const SKILL_PATHS = {
  [ROLES.CEO]: "skills/skill_ceo.md",
  [ROLES.EXPERT]: "skills/skill_expert.md",
  [ROLES.INSPECTOR]: "skills/skill_inspector.md",
};

export { SKILL_PATHS };

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Build a short routing hint appended (by the daemon) to every relayed
 * message. Keeps the agent oriented without mentioning other agents.
 *
 * @param {"ceo"|"expert"|"inspector"} role
 * @param {"planning"|"execution"} phase
 * @returns {string}
 */
export function buildRoutingHint(role, phase) {
  if (role === ROLES.EXPERT) {
    const action = phase === PHASES.PLANNING
      ? 'expert_submit(type="plan_draft", ...)'
      : 'expert_submit(type="phase_complete", ...)';
    return [
      "[Context]",
      `Current phase: ${phase}`,
      `Next action: call ${action}`,
      `Skill: \`${SKILL_PATHS[role]}\` — see section \`## Phase: ${capitalize(phase)}\``,
    ].join("\n");
  }
  if (role === ROLES.INSPECTOR) {
    return [
      "[Context]",
      `Current phase: ${phase}`,
      `Next action: call inspector_submit({ passed, content })`,
      `Skill: \`${SKILL_PATHS[role]}\` — see section \`## Phase: ${capitalize(phase)}\``,
    ].join("\n");
  }
  if (role === ROLES.CEO) {
    return [
      "[Context]",
      `Current phase: ${phase}`,
      `Next action: call ceo_verdict({ verdict, reason, targets? })`,
      `Skill: \`${SKILL_PATHS[role]}\``,
    ].join("\n");
  }
  return "[Context] Unknown role.";
}

/**
 * Build the initial system prompt delivered to a role at workflow start.
 * Written in user voice — no mention of other roles.
 *
 * @param {"ceo"|"expert"|"inspector"} role
 * @param {string} userTask
 * @param {"planning"|"execution"} phase
 * @param {{ isDirectExecution?: boolean }} [options]
 * @returns {string}
 */
export function buildInitialPrompt(role, userTask, phase, options = {}) {
  const label = ROLE_LABELS[role] || role;
  const skill = SKILL_PATHS[role];
  const phaseSection = `## Phase: ${capitalize(phase)}`;

  const skillRef = skill
    ? `\n\n## 行为规范\n开始工作前请阅读：\n- \`${skill}\` — 你的角色规范和提交模板（尤其是 \`${phaseSection}\` 小节）\n- 项目根目录 \`AGENTS.md\` — 项目架构与约束`
    : `\n\n## 行为规范\n请阅读项目根目录 \`AGENTS.md\`。`;

  const taskBlock = `\n\n## 我的任务\n\n${userTask}`;

  if (role === ROLES.EXPERT) {
    if (phase === PHASES.PLANNING) {
      return `## 角色\n你是 ${label}（当前 Phase: planning）。${skillRef}${taskBlock}\n\n## 行动\n请分析任务需求，制定详细的规划方案，然后使用 \`expert_submit(type="plan_draft", content=...)\` 提交。提交后你会陆续收到针对方案的审查反馈，请按反馈迭代修改。当你认为方案成熟时，可使用 \`expert_vote(vote="pass", ...)\` 投票进入下一阶段。`;
    }
    if (options.isDirectExecution) {
      return `## 角色\n你是 ${label}（当前 Phase: execution，直接执行模式）。${skillRef}${taskBlock}\n\n## 行动\n1. 分析任务并制定执行计划\n2. 亲自完成所有代码改动与验证工作\n3. 每个 Phase 完成后使用 \`expert_submit(type="phase_complete", content=...)\` 提交报告\n4. 提交前先自检（参照 Skill 中的 re_verify 流程）`;
    }
    return `## 角色\n你是 ${label}。${skillRef}${taskBlock}\n\n## 行动\n待命中。任务到达后按 Skill 指引处理。`;
  }

  if (role === ROLES.INSPECTOR) {
    return `## 角色\n你是 ${label}（当前 Phase: ${phase}）。${skillRef}${taskBlock}\n\n## 行动\n待命中。当收到需要审查的内容（如规划方案草案或阶段完成报告）时，按 Skill \`${phaseSection}\` 小节的审查规范输出结构化报告，使用 \`inspector_submit({ passed, content })\` 提交。当你认为方案/成果已成熟时，可使用 \`inspector_vote(vote="pass", ...)\` 投票。`;
  }

  if (role === ROLES.CEO) {
    return `## 角色\n你是 ${label}。${skillRef}${taskBlock}\n\n## 行动\n待命中。你会在关键节点（规划审批、终审、仲裁）被唤醒 — 届时会收到需要审查的材料。收到后使用 \`ceo_verdict({ verdict, reason, targets? })\` 提交裁决。`;
  }

  return `## 角色\n你是 ${label}。${skillRef}${taskBlock}`;
}

// ── Routing prompt templates (v2, user-voice) ──
// Key formats:
//   "<source>→<target>"                standard relay (phase-agnostic)
//   "<source>→<target>:<phase>"        phase-specific variant
//   "<source>→<target>:<reason>"       special reason (rejection/transition/...)
//   "<source>:<reason>"                source-only special trigger
//
// Lookup order handled by buildRoutingPrompt() below:
//   1. source→target:reason
//   2. source:reason
//   3. source→target:phase
//   4. source→target
//   5. generic fallback
//
// IMPORTANT: never mention the source role ("Expert/Inspector/CEO") to the
// recipient. Frame content as material delivered to the recipient for action.

const ROUTING_TEMPLATES = Object.freeze({
  // ── Planning phase: plan ↔ review ──
  "expert→inspector:planning": {
    prefix: "这是一份需要你独立审查的规划方案草案。请按你的 Skill `## Phase: Planning` 小节审查规范，对方案逐维度审查。",
    suffix: "完成后使用 `inspector_submit({passed, content})` 提交结构化审查报告。若你认为方案已成熟，也可使用 `inspector_vote(vote=\"pass\", ...)` 投票。",
  },
  "inspector→expert:planning": {
    prefix: "以下是针对你先前方案的审查反馈。请逐条分析每条反馈的决策级别（必须修复 / 建议改进 / 自行决定），针对性修改方案。",
    suffix: "修改完成后使用 `expert_submit(type=\"plan_draft\", content=...)` 提交修改版方案。若你认为方案已成熟，也可使用 `expert_vote(vote=\"pass\", ...)` 投票。",
  },

  // ── Execution phase: phase-complete ↔ review ──
  "expert→inspector:execution": {
    prefix: "这是一份需要你审查的阶段完成报告。不要仅凭报告自述下结论 — 请直接检查仓库代码确认。",
    suffix: "按你的 Skill `## Phase: Execution` 小节审查规范输出报告，完成后使用 `inspector_submit({passed, content})` 提交。",
  },
  "inspector→expert:execution": {
    prefix: "以下是针对你先前阶段报告的审查反馈。请按每条反馈的决策级别处理，完成修复工作。",
    suffix: "完成后使用 `expert_submit(type=\"phase_complete\", content=...)` 提交修复后的阶段报告。",
  },

  // ── Gate trigger → CEO ──
  "orchestrator→ceo:planning_gate": {
    prefix: "以下是一份已经过充分讨论、等待你审批的规划方案。在做出裁决前，请先勘察项目现状（阅读 AGENTS.md 与核心代码文件），再审查方案。",
    suffix: "审查后使用 `ceo_verdict({verdict: \"approved\"|\"rejected\", reason})` 提交裁决。",
  },
  "orchestrator→ceo:final_review": {
    prefix: "以下是全部实施工作的最终产出。请对产出进行全面验证 — 直接检查代码确认所有需求已实现。",
    suffix: "验证后使用 `ceo_verdict({verdict, reason})` 提交终审裁决。",
  },
  "orchestrator→ceo:stagnation_arbitration": {
    prefix: "系统检测到编排停滞 — 反复提交相同内容，无实质进展。请作为仲裁者介入，判断根本原因并给出明确指令打破僵局。",
    suffix: "请使用 `ceo_verdict({verdict: \"approved\"|\"rejected\"|\"arbitration\", reason, targets?})` 提交仲裁裁决。targets 可指定接收方（expert / inspector）。",
  },
  "orchestrator→ceo:defensive_review": {
    prefix: "你的 approved 裁决已被系统防御性降级为「进一步审查」。这是 CEO Gate 的防御机制 — 前若干轮的 approved 会被强制转为更深入的审查。",
    suffix: "请利用这次机会更深入地审视材料，寻找遗漏的问题和风险。审查后使用 `ceo_verdict` 再次提交你的裁决。",
  },
  "orchestrator→ceo:consecutive_confirm": {
    prefix: "你的 approved 裁决已记录。系统要求连续多次确认才能最终通过。",
    suffix: "请再次仔细确认。确认无误后使用 `ceo_verdict({verdict: \"approved\", reason})` 再次提交。",
  },

  // ── CEO rejection → expert / inspector (source identity hidden) ──
  "ceo→expert:rejection": {
    prefix: "你先前提交的内容收到了退回反馈（详见下文）。请根据反馈修改后重新提交。",
    suffix: "修改完成后使用 `expert_submit(...)` 提交修改版。",
  },
  "ceo→inspector:rejection": {
    prefix: "先前审查的内容收到了退回反馈（详见下文）。后续会有修改版送达，届时请按 Skill 规范重新审查。",
    suffix: "等待修改版到达后继续审查流程。",
  },

  // ── Transition planning → execution ──
  "orchestrator→expert:transition": {
    prefix: "规划阶段已通过审批。以下是最终规划书，请按规划进入执行阶段。",
    suffix: "请阅读你的 Skill `## Phase: Execution` 小节了解执行流程和提交格式。按 Phase 顺序逐步执行，每个 Phase 完成后使用 `expert_submit(type=\"phase_complete\", content=...)` 提交报告。",
  },
  "orchestrator→inspector:transition": {
    prefix: "规划阶段已通过审批。以下是最终规划书，供你后续审查参考。",
    suffix: "后续会有阶段完成报告送达，届时按 Skill `## Phase: Execution` 审查规范进行代码审查。",
  },

  // ── Phase advance (passed) ──
  "orchestrator→expert:phase_advance": {
    prefix: "当前 Phase 已通过审查。以下是审查通过报告，请继续执行下一个 Phase。",
    suffix: "继续按规划书执行下一个 Phase，完成后使用 `expert_submit(type=\"phase_complete\", content=...)` 提交报告。",
  },

  // ── CEO arbitration delivery (source identity hidden) ──
  "ceo:arbitration": {
    prefix: "以下是一份仲裁裁决，请遵照裁决内容执行：",
    suffix: "",
  },
});

/**
 * Build a routing prompt used by the daemon to wrap a relayed message.
 *
 * @param {"ceo"|"expert"|"inspector"|"orchestrator"} sourceRole
 * @param {"ceo"|"expert"|"inspector"|"orchestrator"} targetRole
 * @param {"planning"|"execution"} phase
 * @param {{ routingReason?: string }} [context]
 * @returns {{ prefix: string, suffix: string }}
 */
export function buildRoutingPrompt(sourceRole, targetRole, phase, context = {}) {
  const { routingReason } = context;

  if (routingReason) {
    const specialKey = `${sourceRole}→${targetRole}:${routingReason}`;
    if (ROUTING_TEMPLATES[specialKey]) return { ...ROUTING_TEMPLATES[specialKey] };
    const sourceSpecial = `${sourceRole}:${routingReason}`;
    if (ROUTING_TEMPLATES[sourceSpecial]) return { ...ROUTING_TEMPLATES[sourceSpecial] };
  }

  const phaseKey = `${sourceRole}→${targetRole}:${phase}`;
  if (ROUTING_TEMPLATES[phaseKey]) return { ...ROUTING_TEMPLATES[phaseKey] };

  const standardKey = `${sourceRole}→${targetRole}`;
  if (ROUTING_TEMPLATES[standardKey]) return { ...ROUTING_TEMPLATES[standardKey] };

  // Generic fallback — avoid naming other roles; frame as external material.
  return {
    prefix: `以下是送达给你的内容（Phase: ${phase}）：`,
    suffix: "请按你的 Skill 规范处理并使用相应的 submit 工具提交结果。",
  };
}
