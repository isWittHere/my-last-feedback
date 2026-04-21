// mcp/mlra/protocol/prompts.mjs
// v2 routing / initial-prompt templates for the 3-role MLRA topology.
//
// Design philosophy:
// - Agent identity lives in the user's Copilot chatmode files
//   (%APPDATA%\Code\User\prompts\mlra-*.agent.md). We do NOT restate identity here.
// - Skills are action-oriented tutorials living in ~/.copilot/skills/mlra/.
//   The orchestrator references them by short logical name; the agent loads
//   the file on demand.
// - Orchestrator-delivered messages provide:
//     1. Task / phase context
//     2. Short list of relevant skill references
//     3. Expected next tool call
// - Every agent should feel as if the USER is speaking to it. Other agents
//   remain invisible; relayed content is framed as input from the user.

import { ROLES, PHASES } from "./roles.mjs";

// Skill library — keys are short logical names, values are paths relative to
// the agent's skill root (~/.copilot/skills/mlra/).
const SKILL_ROOT = "~/.copilot/skills/mlra";

const SKILLS = {
  submit_plan_draft: `${SKILL_ROOT}/submit_plan_draft.md`,
  submit_phase_report: `${SKILL_ROOT}/submit_phase_report.md`,
  review_plan: `${SKILL_ROOT}/review_plan.md`,
  review_phase: `${SKILL_ROOT}/review_phase.md`,
  decision_levels: `${SKILL_ROOT}/decision_levels.md`,
  hallucination_check: `${SKILL_ROOT}/hallucination_check.md`,
  ceo_verdict: `${SKILL_ROOT}/ceo_verdict.md`,
  re_verify: `${SKILL_ROOT}/re_verify.md`,
  vote_discipline: `${SKILL_ROOT}/vote_discipline.md`,
  intent_classification: `${SKILL_ROOT}/intent_classification.md`,
  codebase_assessment: `${SKILL_ROOT}/codebase_assessment.md`,
  failure_recovery: `${SKILL_ROOT}/failure_recovery.md`,
};

// Back-compat export consumed by the daemon for validation/listing.
export const SKILL_PATHS = Object.freeze({ ...SKILLS });

function renderSkillRefs(keys) {
  if (!keys || keys.length === 0) return "";
  const lines = keys
    .map((k) => (SKILLS[k] ? `- skill: \`${SKILLS[k]}\`` : null))
    .filter(Boolean);
  if (lines.length === 0) return "";
  return `\n\n## Suggested skills\n${lines.join("\n")}`;
}

/**
 * Short routing hint appended to every relayed message.
 *
 * @param {"ceo"|"expert"|"inspector"} role
 * @param {"planning"|"execution"} phase
 * @returns {string}
 */
export function buildRoutingHint(role, phase) {
  if (role === ROLES.EXPERT) {
    const skills = phase === PHASES.PLANNING
      ? ["submit_plan_draft", "decision_levels", "hallucination_check"]
      : ["submit_phase_report", "re_verify", "decision_levels", "hallucination_check"];
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
      `Relevant skills: ${SKILLS.ceo_verdict}, ${SKILLS.hallucination_check}`,
    ].join("\n");
  }
  return "[Context] Unknown role.";
}

/**
 * Initial message delivered to a role at workflow start.
 *
 * @param {"ceo"|"expert"|"inspector"} role
 * @param {string} userTask
 * @param {"planning"|"execution"} phase
 * @param {{ isDirectExecution?: boolean }} [options]
 * @returns {string}
 */
export function buildInitialPrompt(role, userTask, phase, options = {}) {
  const phaseBlock = `## Current Phase\n${phase}`;
  const taskBlock = `\n\n## Task\n\n${userTask}`;
  const preparation = `\n\n## Preparation\nBefore starting, read \`AGENTS.md\` at the project root to understand architecture and conventions.`;

  if (role === ROLES.EXPERT) {
    if (phase === PHASES.PLANNING) {
      const skills = renderSkillRefs([
        "intent_classification",
        "codebase_assessment",
        "submit_plan_draft",
        "decision_levels",
        "hallucination_check",
        "vote_discipline",
      ]);
      return `${phaseBlock}${taskBlock}${preparation}${skills}\n\n## Action\nAnalyze the task and submit a plan via \`expert_submit(type="plan_draft", content=...)\`. You will then receive review feedback — iterate accordingly. When the plan is mature, use \`expert_vote(vote="pass", reason=...)\` to advance.`;
    }
    const skills = renderSkillRefs([
      "submit_phase_report",
      "re_verify",
      "failure_recovery",
      "decision_levels",
      "hallucination_check",
      "vote_discipline",
    ]);
    if (options.isDirectExecution) {
      return `${phaseBlock} (direct execution mode)${taskBlock}${preparation}${skills}\n\n## Action\n\n1. Analyze the task and form an execution plan\n2. Implement all code changes and local verification yourself\n3. After each Phase, submit \`expert_submit(type="phase_complete", content=..., progress="Phase N/M")\`\n4. Walk the re-verify flow before every submission`;
    }
    return `${phaseBlock}${taskBlock}${preparation}${skills}\n\n## Action\nStanding by. When work arrives, handle it per the referenced skills.`;
  }

  if (role === ROLES.INSPECTOR) {
    const skills = phase === PHASES.PLANNING
      ? renderSkillRefs(["review_plan", "decision_levels", "hallucination_check", "vote_discipline"])
      : renderSkillRefs(["review_phase", "decision_levels", "hallucination_check", "vote_discipline"]);
    return `${phaseBlock}${taskBlock}${preparation}${skills}\n\n## Action\nStanding by. When material arrives for review, produce a structured report per the relevant skill and submit via \`inspector_submit({ passed, content })\`. When mature, use \`inspector_vote(vote="pass", reason=...)\` to advance.`;
  }

  if (role === ROLES.CEO) {
    const skills = renderSkillRefs(["ceo_verdict", "hallucination_check"]);
    return `${phaseBlock}${taskBlock}${preparation}${skills}\n\n## Action\nStanding by. You will be woken at key gates (plan gate, final verification, arbitration) with review material. Issue a ruling via \`ceo_verdict({ verdict, reason, targets? })\`.`;
  }

  return `${phaseBlock}${taskBlock}${preparation}`;
}

// ── Routing prompt templates (v2, user-voice, English) ──
// Templates keep prefixes/suffixes short: they bridge context and reference
// the relevant skill. Operational details (review dimensions, report format)
// live in the skill files, not here.
//
// Key formats:
//   "<source>→<target>"                standard relay
//   "<source>→<target>:<phase>"        phase-specific variant
//   "<source>→<target>:<reason>"       special reason (rejection/transition/...)
//   "<source>:<reason>"                source-only special trigger
//
// IMPORTANT: never name the source role. Frame content as material delivered
// to the recipient for action.

const ROUTING_TEMPLATES = Object.freeze({
  // Planning: plan ↔ review
  "expert→inspector:planning": {
    prefix: "The following is a plan draft awaiting your independent review.",
    suffix: `See skill \`${SKILLS.review_plan}\`. Submit your review via \`inspector_submit({ passed, content })\`. When mature, use \`inspector_vote(vote="pass", ...)\`.`,
  },
  "inspector→expert:planning": {
    prefix: "The following is review feedback on your previous plan.",
    suffix: `See skill \`${SKILLS.decision_levels}\`. Address each item, then resubmit via \`expert_submit(type="plan_draft", content=...)\`. When mature, use \`expert_vote(vote="pass", ...)\`.`,
  },

  // Execution: phase report ↔ review
  "expert→inspector:execution": {
    prefix: "The following is a phase-completion report awaiting your review. Do not trust the report narrative alone — open the cited files and verify against actual code.",
    suffix: `See skill \`${SKILLS.review_phase}\`. Submit via \`inspector_submit({ passed, content })\`.`,
  },
  "inspector→expert:execution": {
    prefix: "The following is review feedback on your previous phase report.",
    suffix: `See skill \`${SKILLS.decision_levels}\`. Address each item and resubmit via \`expert_submit(type="phase_complete", content=...)\`.`,
  },

  // Gate triggers → CEO
  "orchestrator→ceo:planning_gate": {
    prefix: "The following is a plan that has reached consensus and awaits your approval. Before ruling, survey the project state (AGENTS.md + core code).",
    suffix: `See skill \`${SKILLS.ceo_verdict}\`. Submit via \`ceo_verdict({verdict, reason})\`.`,
  },
  "orchestrator→ceo:final_review": {
    prefix: "The following is the final output of all execution work. Verify thoroughly by opening the code — do not rely on report self-descriptions.",
    suffix: `See skills \`${SKILLS.ceo_verdict}\` and \`${SKILLS.hallucination_check}\`. Submit final verdict via \`ceo_verdict({verdict, reason})\`.`,
  },
  "orchestrator→ceo:stagnation_arbitration": {
    prefix: "The orchestrator has detected stagnation — repeated submissions without substantive progress. Intervene as arbitrator: diagnose the root cause and issue clear directives to break the deadlock.",
    suffix: "Submit via `ceo_verdict({verdict, reason, targets?})`. `targets` may scope the ruling to specific roles.",
  },
  "orchestrator→ceo:defensive_review": {
    prefix: `Your \`approved\` verdict has been defensively downgraded to "further review". See the defensive-lock section of \`${SKILLS.ceo_verdict}\`.`,
    suffix: "Use this round to dig deeper — look for issues and risks that may have been missed. Then submit via `ceo_verdict` again.",
  },
  "orchestrator→ceo:consecutive_confirm": {
    prefix: "Your `approved` verdict has been recorded. The system requires consecutive confirmations before final passage.",
    suffix: 'Confirm once more carefully, then submit via `ceo_verdict({verdict: "approved", reason})` again.',
  },

  // CEO rejection → expert / inspector (source identity hidden)
  "ceo→expert:rejection": {
    prefix: "Your previous submission received rejection feedback (below).",
    suffix: "Address the feedback and resubmit via `expert_submit(...)`.",
  },
  "ceo→inspector:rejection": {
    prefix: "The previously reviewed material received rejection feedback (below). A revised version will arrive shortly.",
    suffix: "Wait for the revised version and continue the review cycle.",
  },

  // Planning → execution transition
  "orchestrator→expert:transition": {
    prefix: "The planning phase has been approved. Below is the final plan — enter the execution phase.",
    suffix: `See skills \`${SKILLS.submit_phase_report}\` and \`${SKILLS.re_verify}\`. Execute Phase-by-Phase and after each Phase submit via \`expert_submit(type="phase_complete", content=...)\`.`,
  },
  "orchestrator→inspector:transition": {
    prefix: "The planning phase has been approved. Below is the final plan for your future review reference.",
    suffix: `Phase-completion reports will arrive shortly. Review each per skill \`${SKILLS.review_phase}\`.`,
  },

  // Phase advance (passed)
  "orchestrator→expert:phase_advance": {
    prefix: "The current Phase passed review. Below is the approved review report — proceed to the next Phase.",
    suffix: 'Continue executing per the plan; submit the next Phase via `expert_submit(type="phase_complete", content=...)`.',
  },

  // CEO arbitration delivery (source identity hidden)
  "ceo:arbitration": {
    prefix: "The following is an arbitration ruling. Execute per its directives:",
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
    prefix: `The following material is delivered to you (Phase: ${phase}):`,
    suffix: "Handle it per the relevant skill and submit via the corresponding tool.",
  };
}
