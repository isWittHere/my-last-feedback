// mcp/mlra/protocol/prompts.mjs
// v2 routing / initial-prompt templates for the 3-role topology.
//
// Design philosophy:
// - Agent identity is defined by the user's Copilot chatmode (external to
//   this repo, in %APPDATA%\Code\User\prompts\). We do NOT restate identity
//   here.
// - Skills are action-oriented tutorials (how to submit a plan, how to review,
//   etc.) that the agent loads on demand. We reference them by short name.
// - Orchestrator-delivered messages only provide:
//     1. Task / phase context
//     2. A short list of relevant skill references
//     3. The tool call expected next
// - Every agent should feel as if the USER is speaking to it. Other agents
//   are invisible. Relayed content is framed as input from the user.

import { ROLES, PHASES } from "./roles.mjs";

// Action-based skill library. Keys are short logical names; paths are
// workspace-relative. Agents load on demand (orchestrator just references).
const SKILLS = {
  submit_plan_draft: "skills/skill_submit_plan_draft.md",
  phase_complete_report: "skills/skill_phase_complete_report.md",
  review_plan: "skills/skill_review_plan.md",
  review_phase: "skills/skill_review_phase.md",
  decision_levels: "skills/skill_decision_levels.md",
  hallucination_check: "skills/skill_hallucination_check.md",
  ceo_verdict: "skills/skill_ceo_verdict.md",
  re_verify: "skills/skill_re_verify.md",
  vote_discipline: "skills/skill_vote_discipline.md",
};

// Back-compat export (used by daemon for validation). Returns the set of
// skill paths that should exist on disk.
export const SKILL_PATHS = Object.freeze({ ...SKILLS });

/**
 * Render a list of skill references as a short bullet list.
 * Prefers short names (agent resolves via repo skills/ directory).
 */
function renderSkillRefs(keys) {
  if (!keys || keys.length === 0) return "";
  const lines = keys.map((k) => {
    const path = SKILLS[k];
    return path ? `- 请参考 skill: \`${path}\`` : null;
  }).filter(Boolean);
  if (lines.length === 0) return "";
  return `\n\n## 建议加载的 skills\n${lines.join("\n")}`;
}

/**
 * Build a short routing hint appended to every relayed message. Keeps the
 * agent oriented without redefining identity.
 *
 * @param {"ceo"|"expert"|"inspector"} role
 * @param {"planning"|"execution"} phase
 * @returns {string}
 */
export function buildRoutingHint(role, phase) {
  if (role === ROLES.EXPERT) {
    const skills = phase === PHASES.PLANNING
      ? ["submit_plan_draft", "decision_levels", "hallucination_check"]
      : ["phase_complete_report", "re_verify", "decision_levels", "hallucination_check"];
    const action = phase === PHASES.PLANNING
      ? 'expert_submit(type="plan_draft", ...)'
      : 'expert_submit(type="phase_complete", ...)';
    return [
      "[Context]",
      `Phase: ${phase}`,
      `Next action: ${action}`,
      `Relevant skills: ${skills.map((k) => SKILLS[k]).join(", ")}`,
    ].join("\n");
  }
  if (role === ROLES.INSPECTOR) {
    const skills = phase === PHASES.PLANNING
      ? ["review_plan", "decision_levels", "hallucination_check"]
      : ["review_phase", "decision_levels", "hallucination_check"];
    return [
      "[Context]",
      `Phase: ${phase}`,
      `Next action: inspector_submit({ passed, content })`,
      `Relevant skills: ${skills.map((k) => SKILLS[k]).join(", ")}`,
    ].join("\n");
  }
  if (role === ROLES.CEO) {
    return [
      "[Context]",
      `Phase: ${phase}`,
      `Next action: ceo_verdict({ verdict, reason, targets? })`,
      `Relevant skills: ${SKILLS.ceo_verdict}`,
    ].join("\n");
  }
  return "[Context] Unknown role.";
}

/**
 * Build the initial message delivered to a role at workflow start.
 * Does NOT restate role identity (that's the agent's chatmode job).
 * Provides: task + phase + relevant skill references + expected tool call.
 *
 * @param {"ceo"|"expert"|"inspector"} role
 * @param {string} userTask
 * @param {"planning"|"execution"} phase
 * @param {{ isDirectExecution?: boolean }} [options]
 * @returns {string}
 */
export function buildInitialPrompt(role, userTask, phase, options = {}) {
  const phaseBlock = `## 当前阶段\n${phase}`;
  const taskBlock = `\n\n## 任务\n\n${userTask}`;
  const agentsMd = `\n\n## 通用准备\n开始前请阅读项目根目录的 \`AGENTS.md\` 了解架构与规范。`;

  if (role === ROLES.EXPERT) {
    if (phase === PHASES.PLANNING) {
      const skills = renderSkillRefs(["submit_plan_draft", "decision_levels", "hallucination_check", "vote_discipline"]);
      return `${phaseBlock}${taskBlock}${agentsMd}${skills}\n\n## 行动\n请分析任务需求并提交规划方案：\`expert_submit(type="plan_draft", content=...)\`。之后会收到针对方案的审查反馈，请迭代修改。方案成熟时可用 \`expert_vote(vote="pass", reason=...)\` 投票推进。`;
    }
    const skills = renderSkillRefs(["phase_complete_report", "re_verify", "decision_levels", "hallucination_check", "vote_discipline"]);
    if (options.isDirectExecution) {
      return `${phaseBlock}（直接执行模式）${taskBlock}${agentsMd}${skills}\n\n## 行动\n\n1. 分析任务并制定执行计划\n2. 亲自完成所有代码改动与本地验证\n3. 每个 Phase 完成后提交 \`expert_submit(type="phase_complete", content=..., progress="Phase N/M")\`\n4. 提交前先走一遍 re-verify`;
    }
    return `${phaseBlock}${taskBlock}${agentsMd}${skills}\n\n## 行动\n待命中。任务到达后按 skill 指引处理。`;
  }

  if (role === ROLES.INSPECTOR) {
    const skills = phase === PHASES.PLANNING
      ? renderSkillRefs(["review_plan", "decision_levels", "hallucination_check", "vote_discipline"])
      : renderSkillRefs(["review_phase", "decision_levels", "hallucination_check", "vote_discipline"]);
    return `${phaseBlock}${taskBlock}${agentsMd}${skills}\n\n## 行动\n待命中。收到需要审查的材料后，按 skill 规范输出结构化审查报告并使用 \`inspector_submit({ passed, content })\` 提交。方案/成果成熟时可用 \`inspector_vote(vote="pass", reason=...)\` 投票推进。`;
  }

  if (role === ROLES.CEO) {
    const skills = renderSkillRefs(["ceo_verdict", "hallucination_check"]);
    return `${phaseBlock}${taskBlock}${agentsMd}${skills}\n\n## 行动\n待命中。关键节点（规划审批、终审、仲裁）会被唤醒并收到需要审查的材料。收到后使用 \`ceo_verdict({ verdict, reason, targets? })\` 提交裁决。`;
  }

  return `${phaseBlock}${taskBlock}${agentsMd}`;
}

// ── Routing prompt templates (v2, user-voice) ──
// Templates keep prefixes/suffixes short: they bridge context + refer to the
// relevant skill. Operational details (review dimensions, report format) live
// in the skills themselves, not here.
//
// Key formats:
//   "<source>→<target>"                standard relay (phase-agnostic)
//   "<source>→<target>:<phase>"        phase-specific variant
//   "<source>→<target>:<reason>"       special reason (rejection/transition/...)
//   "<source>:<reason>"                source-only special trigger
//
// Lookup order in buildRoutingPrompt():
//   1. source→target:reason
//   2. source:reason
//   3. source→target:phase
//   4. source→target
//   5. generic fallback
//
// IMPORTANT: never mention the source role ("Expert/Inspector/CEO"). Frame
// content as material delivered to the recipient for action.

const ROUTING_TEMPLATES = Object.freeze({
  // ── Planning phase: plan ↔ review ──
  "expert→inspector:planning": {
    prefix: "以下是一份需要你独立审查的规划方案草案。",
    suffix: "请参考 skill `skills/skill_review_plan.md` 完成审查，并使用 `inspector_submit({ passed, content })` 提交。成熟时可用 `inspector_vote(vote=\"pass\", ...)` 投票。",
  },
  "inspector→expert:planning": {
    prefix: "以下是针对你先前方案的审查反馈。",
    suffix: "请参考 skill `skills/skill_decision_levels.md` 逐条处理反馈，然后使用 `expert_submit(type=\"plan_draft\", content=...)` 提交修改版。成熟时可用 `expert_vote(vote=\"pass\", ...)` 投票。",
  },

  // ── Execution phase: phase-complete ↔ review ──
  "expert→inspector:execution": {
    prefix: "以下是一份需要你审查的阶段完成报告。不要只看报告自述 — 请直接检查仓库代码确认。",
    suffix: "请参考 skill `skills/skill_review_phase.md` 完成审查，并使用 `inspector_submit({ passed, content })` 提交。",
  },
  "inspector→expert:execution": {
    prefix: "以下是针对你先前阶段报告的审查反馈。",
    suffix: "请参考 skill `skills/skill_decision_levels.md` 逐条处理，修复后使用 `expert_submit(type=\"phase_complete\", content=...)` 重新提交。",
  },

  // ── Gate trigger → CEO ──
  "orchestrator→ceo:planning_gate": {
    prefix: "以下是一份已经过充分讨论、等待你审批的规划方案。在裁决前请先勘察项目现状（AGENTS.md + 核心代码）。",
    suffix: "请参考 skill `skills/skill_ceo_verdict.md`，使用 `ceo_verdict({verdict, reason})` 提交裁决。",
  },
  "orchestrator→ceo:final_review": {
    prefix: "以下是全部实施工作的最终产出。请对产出进行全面验证 — 直接检查代码确认所有需求已实现。",
    suffix: "请参考 skill `skills/skill_ceo_verdict.md` 与 `skills/skill_hallucination_check.md`，使用 `ceo_verdict({verdict, reason})` 提交终审。",
  },
  "orchestrator→ceo:stagnation_arbitration": {
    prefix: "系统检测到编排停滞 — 反复提交相同内容，无实质进展。请作为仲裁者介入，判断根本原因并给出明确指令打破僵局。",
    suffix: "请使用 `ceo_verdict({verdict, reason, targets?})` 提交仲裁。targets 可指定接收方。",
  },
  "orchestrator→ceo:defensive_review": {
    prefix: "你的 approved 裁决已被系统防御性降级为「进一步审查」。参见 skill `skills/skill_ceo_verdict.md` 的驳斥锁机制说明。",
    suffix: "请利用这次机会更深入审视，寻找遗漏的问题和风险。审查后再次使用 `ceo_verdict` 提交。",
  },
  "orchestrator→ceo:consecutive_confirm": {
    prefix: "你的 approved 裁决已记录。系统要求连续多次确认才能最终通过。",
    suffix: "请再次仔细确认。确认无误后使用 `ceo_verdict({verdict: \"approved\", reason})` 再次提交。",
  },

  // ── CEO rejection → expert / inspector (source identity hidden) ──
  "ceo→expert:rejection": {
    prefix: "你先前提交的内容收到了退回反馈（详见下文）。",
    suffix: "请根据反馈修改后使用 `expert_submit(...)` 重新提交。",
  },
  "ceo→inspector:rejection": {
    prefix: "先前审查的内容收到了退回反馈（详见下文）。后续会有修改版送达。",
    suffix: "等待修改版到达后继续审查流程。",
  },

  // ── Transition planning → execution ──
  "orchestrator→expert:transition": {
    prefix: "规划阶段已通过审批。以下是最终规划书，请按规划进入执行阶段。",
    suffix: "请参考 skill `skills/skill_phase_complete_report.md` 与 `skills/skill_re_verify.md`。按 Phase 顺序逐步执行，每个 Phase 完成后使用 `expert_submit(type=\"phase_complete\", content=...)` 提交。",
  },
  "orchestrator→inspector:transition": {
    prefix: "规划阶段已通过审批。以下是最终规划书，供你后续审查参考。",
    suffix: "后续会有阶段完成报告送达，届时请参考 skill `skills/skill_review_phase.md` 进行审查。",
  },

  // ── Phase advance (passed) ──
  "orchestrator→expert:phase_advance": {
    prefix: "当前 Phase 已通过审查。以下是审查通过报告，请继续执行下一个 Phase。",
    suffix: "继续按规划书执行，完成后使用 `expert_submit(type=\"phase_complete\", content=...)` 提交。",
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
    suffix: "请按相关 skill 的规范处理并使用相应的 submit 工具提交结果。",
  };
}
