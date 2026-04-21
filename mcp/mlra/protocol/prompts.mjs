// mcp/mlra/protocol/prompts.mjs
// Phase 3 skeleton: routing / initial-prompt templates for v2's 3-role topology.
// Full template set is populated during Phase 4 (daemon migration) / Phase 5 (skill merge).

import { ROLES, ROLE_LABELS, PHASES } from "./roles.mjs";

const SKILL_PATHS = {
  [ROLES.CEO]: "skills/skill_ceo.md",
  [ROLES.EXPERT]: "skills/skill_expert.md",
  [ROLES.INSPECTOR]: "skills/skill_inspector.md",
};

/**
 * Build the system-message routing hint appended by the daemon on every
 * relayed message. Keeps the agent aware of the current phase and the tool
 * expected for the next action.
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
      "[MLRA Routing]",
      `Phase: ${phase}`,
      `Expected action: ${action}`,
      `Skill reference: Read \`## Phase: ${capitalize(phase)}\` section of ${SKILL_PATHS[role]}`,
    ].join("\n");
  }
  if (role === ROLES.INSPECTOR) {
    return [
      "[MLRA Routing]",
      `Phase: ${phase}`,
      `Expected action: inspector_submit({ passed: boolean, content })`,
      `Skill reference: Read \`## Phase: ${capitalize(phase)}\` section of ${SKILL_PATHS[role]}`,
    ].join("\n");
  }
  if (role === ROLES.CEO) {
    return [
      "[MLRA Routing]",
      `Phase: ${phase}`,
      `Expected action: ceo_verdict({ verdict: "approved"|"rejected"|"arbitration", reason, targets? })`,
      `Skill reference: ${SKILL_PATHS[role]}`,
    ].join("\n");
  }
  return "[MLRA Routing] Unknown role — no guidance available.";
}

/**
 * Build the initial prompt sent to a role when the workflow starts.
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
  const header = `## Role: ${label}`;
  const skillRef = skill
    ? `\n\n## Behavior\nBefore starting, read:\n- \`${skill}\` — your role guide and submission templates\n- \`AGENTS.md\` — project architecture & conventions`
    : "";

  const taskBlock = `\n\n## Task\n\n${userTask}`;
  const phaseBlock = `\n\n## Current phase: ${phase}`;

  if (role === ROLES.EXPERT) {
    const action = phase === PHASES.PLANNING
      ? "Analyse the task, draft a plan, and submit it via `expert_submit(type=\"plan_draft\", ...)`."
      : "Execute the approved plan phase by phase. After each phase, submit a progress report via `expert_submit(type=\"phase_complete\", ...)`.";
    return `${header}${skillRef}${taskBlock}${phaseBlock}\n\n## Action\n${action}`;
  }

  if (role === ROLES.INSPECTOR) {
    const action = phase === PHASES.PLANNING
      ? "Wait for the Expert to submit a plan draft; then review it per your Skill and submit a structured review via `inspector_submit({passed, content})`."
      : "Wait for the Expert's phase-complete report; then verify the code directly and submit your review via `inspector_submit({passed, content})`.";
    return `${header}${skillRef}${taskBlock}${phaseBlock}\n\n## Action\n${action}`;
  }

  if (role === ROLES.CEO) {
    return `${header}${skillRef}${taskBlock}${phaseBlock}\n\n## Action\nYou are on standby. You will be woken at critical gates (planning approval, final verification, arbitration). When woken, use \`ceo_verdict\` to submit your decision.`;
  }

  return `${header}${skillRef}${taskBlock}`;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export { SKILL_PATHS };

// ── Routing prompt templates (v2, 3-role × 2-phase) ──
// Key formats:
//   "<source>→<target>"                (standard relay, phase-agnostic)
//   "<source>→<target>:<phase>"        (phase-specific variant, tried before the phase-agnostic key)
//   "<source>→<target>:<reason>"       (special routing reason, e.g. "rejection", "transition")
//   "<source>:<reason>"                (source-only special trigger)
//
// During Phase 5 the Skill files will provide richer per-phase guidance; keep
// these prompts short and tool-oriented so they survive a Skill rewrite.

const ROUTING_TEMPLATES = Object.freeze({
  // ── expert ↔ inspector, planning phase ──
  "expert→inspector:planning": {
    prefix: "规划专家提交了方案。作为 Inspector（当前 Phase: planning），请按你的 Skill 中的 `## Phase: Planning` 小节进行全面审查，输出结构化审查报告。",
    suffix: "完成后使用 inspector_submit({passed, content}) 提交审查结果。如果你认为方案已足够成熟，也可以使用 inspector_vote 投票。",
  },
  "inspector→expert:planning": {
    prefix: "Inspector 的审查反馈已送达。作为 Expert（当前 Phase: planning），请逐条分析每条反馈的决策级别，针对性修改方案，修改完成后自检再提交。",
    suffix: "完成后使用 expert_submit(type=\"plan_draft\", ...) 提交修改后的方案。若你认为方案已足够成熟，也可以使用 expert_vote 投票。",
  },

  // ── expert ↔ inspector, execution phase ──
  "expert→inspector:execution": {
    prefix: "Expert 提交了阶段完成报告。作为 Inspector（当前 Phase: execution），请直接检查仓库代码（不信专家自述），按 Skill 中的 `## Phase: Execution` 小节审查规范输出报告。",
    suffix: "完成后使用 inspector_submit({passed, content}) 提交审查结果。",
  },
  "inspector→expert:execution": {
    prefix: "Inspector 的审查报告已送达。作为 Expert（当前 Phase: execution），请按报告中的决策级别处理每条反馈，完成修复后先自检再提交。",
    suffix: "完成后使用 expert_submit(type=\"phase_complete\", ...) 提交修复后的阶段报告。",
  },

  // ── orchestrator → CEO (gates) ──
  "orchestrator→ceo:planning_gate": {
    prefix: "规划投票已通过，Expert 与 Inspector 已就方案达成一致。作为 CEO，请先勘察项目现状（阅读 AGENTS.md + 核心代码），再审查规划方案。",
    suffix: "审查后使用 ceo_verdict({verdict: \"approved\"|\"rejected\", reason}) 提交裁决。",
  },
  "orchestrator→ceo:final_review": {
    prefix: "全部实施已完成。作为 CEO，请对最终产出进行全面验证 — 直接检查代码确认所有需求已实现。",
    suffix: "验证后使用 ceo_verdict({verdict, reason}) 提交裁决。",
  },
  "orchestrator→ceo:stagnation_arbitration": {
    prefix: "系统检测到编排停滞 — Expert / Inspector 反复提交相同内容，无实质进展。作为 CEO，请介入仲裁，判断根本原因并给出明确指令打破僵局。",
    suffix: "请使用 ceo_verdict({verdict: \"approved\"|\"rejected\"|\"arbitration\", reason, targets?}) 提交仲裁裁决。targets 可指定需要接收裁决的角色（expert / inspector）。",
  },
  "orchestrator→ceo:defensive_review": {
    prefix: "你的 approved 裁决已被系统防御性降级为「进一步审查」。这是 CEO Gate 的防御机制 — 为避免轻率放行，前 N 轮的 approved 会被强制转为 rejected。",
    suffix: "请利用这次机会更深入地审视方案，寻找遗漏的问题和风险。审查后使用 ceo_verdict 再次提交你的裁决。",
  },
  "orchestrator→ceo:consecutive_confirm": {
    prefix: "你的 approved 裁决已记录。系统要求连续多次确认才能最终通过。",
    suffix: "请再次仔细确认。确认无误后使用 ceo_verdict({verdict: \"approved\", reason}) 再次提交。",
  },

  // ── CEO → expert / inspector (rejection fallback) ──
  "ceo→expert:rejection": {
    prefix: "CEO 退回了方案 / 阶段报告，请根据以下退回理由修改后重新提交。",
    suffix: "修改完成后使用 expert_submit 提交修改后的内容。",
  },
  "ceo→inspector:rejection": {
    prefix: "CEO 退回了方案 / 阶段报告。请等待 Expert 修改后重新审查。以下是 CEO 的退回理由：",
    suffix: "等待 Expert 提交修改后的内容，届时按 Skill 规范重新审查。",
  },

  // ── Transition planning → execution ──
  "orchestrator→expert:transition": {
    prefix: "规划已通过 CEO 审批，现在进入 execution 阶段。以下是最终规划书，请按规划执行。",
    suffix: "请阅读你的 Skill 中的 `## Phase: Execution` 小节了解执行流程和提交格式。按 Phase 顺序逐步执行，每个 Phase 完成后使用 expert_submit(type=\"phase_complete\", ...) 提交报告。",
  },
  "orchestrator→inspector:transition": {
    prefix: "规划已通过 CEO 审批，现在进入 execution 阶段。以下是最终规划书供审查参考。",
    suffix: "请等待 Expert 提交阶段完成报告后，按 Skill 中的 `## Phase: Execution` 审查规范进行代码审查。",
  },

  // ── Phase advance (inspector passed in execution) ──
  "orchestrator→expert:phase_advance": {
    prefix: "Inspector 已通过当前 Phase 的审查。请继续执行下一个 Phase。以下是 Inspector 的审查通过报告：",
    suffix: "请继续按规划书执行下一个 Phase，完成后使用 expert_submit(type=\"phase_complete\", ...) 提交报告。",
  },

  // ── CEO arbitration delivery ──
  "ceo:arbitration": {
    prefix: "CEO 做出了仲裁裁决。请遵照以下裁决执行：",
    suffix: "",
  },
});

/**
 * Build a routing prompt used by the daemon to wrap a relayed message.
 *
 * Lookup order:
 *   1. `${source}→${target}:${routingReason}`   (special reason takes precedence)
 *   2. `${source}:${routingReason}`              (source-only special reason)
 *   3. `${source}→${target}:${phase}`            (phase-scoped standard relay)
 *   4. `${source}→${target}`                     (plain relay, phase-agnostic)
 *   5. Generic fallback
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

  const targetLabel = ROLE_LABELS[targetRole] || targetRole;
  const sourceLabel = ROLE_LABELS[sourceRole] || sourceRole;
  return {
    prefix: `来自 ${sourceLabel} 的消息（Phase: ${phase}）：`,
    suffix: `你是 ${targetLabel}。请使用相应的 submit 工具提交你的工作结果。`,
  };
}
