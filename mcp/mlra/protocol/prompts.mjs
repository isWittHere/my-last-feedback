// mcp/mlra/protocol/prompts.mjs
// Routing / initial-prompt templates for the 3-role MLRA topology.
//
// Design philosophy:
// - Agent identity lives in the user's Copilot chatmode files
//   (%APPDATA%\Code\User\prompts\mlra-*.agent.md). We do NOT restate identity here.
// - Skills are action-oriented tutorials living in ~/.copilot/skills/mlra/.
//   The orchestrator references them by short logical name; the agent loads
//   the file on demand.
// - Collaboration rhythm is driven by the user-authored stage pipeline; this
//   module is stage-agnostic — stage-specific guidance arrives via the stage
//   object passed in (stage.promptOverride / stage.skillRefs / stage.name ...).
// - Every agent should feel as if the USER is speaking to it. Other agents
//   remain invisible; relayed content is framed as input from the user.

import { ROLES } from "./roles.mjs";

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

function renderStageContext(stage) {
  if (!stage) return "";
  const blocks = [`## Current Stage\n${stage.name || stage.id || "(unnamed)"}`];
  if (stage.description) blocks.push(`## Stage Notes\n${stage.description}`);
  return `\n\n${blocks.join("\n\n")}`;
}

function renderStageDirective(title, text) {
  if (!text) return "";
  return `\n\n## ${title}\n${text}`;
}

function isClosingStage(stage) {
  return Boolean(stage && stage.isClosing === true);
}

/**
 * Short routing hint appended to every relayed message.
 *
 * @param {"ceo"|"expert"|"inspector"} role
 * @param {object} stage
 * @returns {string}
 */
export function buildRoutingHint(role, stage) {
  const stageName = stage?.name || "(stage)";
  if (role === ROLES.EXPERT) {
    return [
      "[Context]",
      `Stage: ${stageName}`,
      `Next action: expert_submit({ content })`,
      `Vote when the user-facing work is ready: expert_vote({ vote, reason })`,
    ].join("\n");
  }
  if (role === ROLES.INSPECTOR) {
    return [
      "[Context]",
      `Stage: ${stageName}`,
      `Next action: inspector_submit({ content })`,
      `Vote when the user-facing material is ready: inspector_vote({ vote, reason })`,
    ].join("\n");
  }
  if (role === ROLES.CEO) {
    return [
      "[Context]",
      `Stage: ${stageName}`,
      `Next action: ceo_verdict({ verdict, reason, targets? })`,
      `Relevant skills: ${SKILLS.ceo_verdict}, ${SKILLS.hallucination_check}`,
    ].join("\n");
  }
  return "[Context] Unknown role.";
}

/**
 * Initial message delivered to a role when a stage becomes active.
 *
 * @param {"ceo"|"expert"|"inspector"} role
 * @param {string} userTask
 * @param {object} stage — the stage blueprint (StageBlueprint)
 * @param {{ carriedContent?: string }} [options]
 * @returns {string}
 */
export function buildInitialPrompt(role, userTask, stage, options = {}) {
  const stageBlock = renderStageContext(stage);
  const taskBlock = `\n\n## Task\n\n${userTask}`;
  const preparation = `\n\n## Preparation\nBefore starting, read \`AGENTS.md\` at the project root to understand architecture and conventions.`;
  const stageSkills = stage?.skillRefs?.length ? renderSkillRefs(stage.skillRefs) : "";
  const carried = options.carriedContent
    ? `\n\n## Carried-over material\n\n${options.carriedContent}`
    : "";

  if (isClosingStage(stage)) {
    // Closing stage: CEO solo performance.
    if (role !== ROLES.CEO) {
      // Should never be dispatched to expert/inspector — but return a safe noop.
      return `## Closing Stage\nThis launcher has entered its closing stage. You are off-duty. No further submissions are expected.`;
    }
    const closingPrompt = stage?.promptCeo || stage?.promptOverride || DEFAULT_CLOSING_CEO_PROMPT;
    return `${stageBlock}${taskBlock}${preparation}${stageSkills}\n\n## Closing Directive\n${closingPrompt}${carried}`;
  }

  // Non-closing stage:
  if (role === ROLES.EXPERT) {
    const override = stage?.promptExpert || stage?.promptOverride;
    const directive = override
      ? renderStageDirective("Stage Directive", override)
      : `\n\n## Action\nAnalyze the user's task and produce a user-facing deliverable. Submit via \`expert_submit({ content })\`. Treat routed feedback as user feedback. When the work is genuinely ready for final stage-exit review, use \`expert_vote(vote="pass", reason=...)\`.`;
    return `${stageBlock}${taskBlock}${preparation}${stageSkills}${directive}${carried}`;
  }

  if (role === ROLES.INSPECTOR) {
    const override = stage?.promptInspector || stage?.promptOverride;
    const directive = override
      ? renderStageDirective("Stage Directive", override)
      : `\n\n## Action\nWhen material arrives for review, evaluate it for the user. Produce a structured review and submit via \`inspector_submit({ content })\`. When the material is genuinely ready for final stage-exit review, use \`inspector_vote(vote="pass", reason=...)\`.`;
    return `${stageBlock}${taskBlock}${preparation}${stageSkills}${directive}${carried}`;
  }

  if (role === ROLES.CEO) {
    // CEO is usually standby during non-closing stages; only woken up at gates.
    // This branch is here for completeness only.
    const skills = renderSkillRefs(["ceo_verdict", "hallucination_check"]);
    return `${stageBlock}${taskBlock}${preparation}${skills}\n\n## Action\nYou may be consulted at the stage exit gate. Issue a ruling via \`ceo_verdict({ verdict, reason, targets? })\`. Any approval may require additional verification before taking effect.${carried}`;
  }

  return `${stageBlock}${taskBlock}${preparation}`;
}

const DEFAULT_CLOSING_CEO_PROMPT = `The workflow has reached its closing stage. Produce the final wrap-up for the user.

Produce a wrap-up document covering:
1. Task summary — the user's goal, important decisions, and final outcome.
2. Repository snapshot — files touched, notable changes, any remaining open ends.
3. Deliverables checklist — concrete artifacts, test evidence, how to verify.

After writing the document, call the blocking feedback tool (\`interactive_feedback\`) to stand by for the user's response.`;

// ── Routing prompt templates (user-voice, English) ──
// Templates keep prefixes/suffixes short: they bridge context and reference
// the relevant action. Stage-specific details (directives, skills) are
// rendered from the stage object by buildRoutingPrompt.
//
// Key formats:
//   "<source>→<target>"                standard relay
//   "<source>→<target>:<reason>"       special reason (rejection/transition/...)
//   "<source>:<reason>"                source-only special trigger
//
// IMPORTANT: never name the source role. Frame content as material delivered
// to the recipient for action.

const ROUTING_TEMPLATES = Object.freeze({
  // Generic relay between the two working roles
  "expert→inspector": {
    prefix: "Please review the following user-facing material independently. Do not trust the narrative alone — open the cited files and verify against actual code.",
    suffix: `See the stage directive. Submit your review via \`inspector_submit({ content })\`. When the material is genuinely ready for final stage-exit review, use \`inspector_vote(vote="pass", reason=...)\`.`,
  },
  "inspector→expert": {
    prefix: "The user-facing submission received the following review feedback.",
    suffix: `See skill \`${SKILLS.decision_levels}\`. Address each item and resubmit via \`expert_submit({ content })\`. When the work is genuinely ready for final stage-exit review, use \`expert_vote(vote="pass", reason=...)\`.`,
  },

  // Gate triggers → CEO (unified — no phase variants)
  "orchestrator→ceo:stage_gate": {
    prefix: "The following user-facing material awaits stage-exit approval. Before ruling, survey the project state (AGENTS.md + core code).",
    suffix: `See skill \`${SKILLS.ceo_verdict}\`. Submit via \`ceo_verdict({verdict, reason})\`.`,
  },
  "orchestrator→ceo:stagnation_arbitration": {
    prefix: "The workflow appears blocked without substantive movement. Diagnose the root cause and issue clear directives to unblock the user's task.",
    suffix: "Submit via `ceo_verdict({verdict, reason, targets?})`. `targets` may scope the ruling if needed.",
  },
  "orchestrator→ceo:defensive_review": {
    prefix: `Further verification is required before this approval can take effect. See the defensive-lock section of \`${SKILLS.ceo_verdict}\`.`,
    suffix: "Review carefully for issues and risks that may have been missed. Then submit via `ceo_verdict` again.",
  },
  "orchestrator→ceo:consecutive_confirm": {
    prefix: "Additional confirmation is required before final passage.",
    suffix: 'Confirm carefully, then submit via `ceo_verdict({verdict: "approved", reason})` again.',
  },

  // CEO rejection → expert / inspector (source identity hidden)
  "ceo→expert:rejection": {
    prefix: "Your previous user-facing submission was sent back with the following feedback.",
    suffix: "Address the feedback and resubmit via `expert_submit({ content })`.",
  },
  "ceo→inspector:rejection": {
    prefix: "The material you reviewed was sent back with the following feedback. A revised version will arrive shortly.",
    suffix: "Wait for the revised version and review it per the stage directive.",
  },

  // Stage advance (gate passed / gate disabled)
  "orchestrator→expert:stage_advance": {
    prefix: "The previous stage has been accepted. Below is the carried-over material — continue in the new stage context.",
    suffix: "Execute per the stage directive; submit via `expert_submit({ content })`.",
  },
  "orchestrator→inspector:stage_advance": {
    prefix: "The previous stage has been accepted. Below is the carried-over material for your awareness.",
    suffix: "Subsequent submissions from the working side will arrive shortly. Review per the stage directive.",
  },

  // CEO arbitration delivery (source identity hidden)
  "ceo:arbitration": {
    prefix: "Here is a directive for you. Execute per its instructions:",
    suffix: "",
  },
});

/**
 * Build a routing prompt used by the daemon to wrap a relayed message.
 *
 * @param {"ceo"|"expert"|"inspector"|"orchestrator"} sourceRole
 * @param {"ceo"|"expert"|"inspector"|"orchestrator"} targetRole
 * @param {object|null} stage — current stage blueprint (or null)
 * @param {{ routingReason?: string }} [context]
 * @returns {{ prefix: string, suffix: string }}
 */
export function buildRoutingPrompt(sourceRole, targetRole, stage, context = {}) {
  const { routingReason } = context;

  let prompt = null;

  if (routingReason) {
    const specialKey = `${sourceRole}→${targetRole}:${routingReason}`;
    if (ROUTING_TEMPLATES[specialKey]) prompt = { ...ROUTING_TEMPLATES[specialKey] };
    const sourceSpecial = `${sourceRole}:${routingReason}`;
    if (!prompt && ROUTING_TEMPLATES[sourceSpecial]) prompt = { ...ROUTING_TEMPLATES[sourceSpecial] };
  }

  if (!prompt) {
    const standardKey = `${sourceRole}→${targetRole}`;
    if (ROUTING_TEMPLATES[standardKey]) prompt = { ...ROUTING_TEMPLATES[standardKey] };
  }

  if (!prompt) {
    prompt = {
      prefix: `Here is material for you${stage?.name ? ` (stage: ${stage.name})` : ""}:`,
      suffix: "Handle it per the stage directive and submit via the corresponding tool.",
    };
  }

  const stagePrefix = renderStageContext(stage);
  const stageSkills = stage?.skillRefs?.length ? renderSkillRefs(stage.skillRefs) : "";
  const stageDirective = (() => {
    if (!stage) return "";
    const text = (targetRole === ROLES.EXPERT ? stage.promptExpert : null)
      || (targetRole === ROLES.INSPECTOR ? stage.promptInspector : null)
      || (targetRole === ROLES.CEO ? stage.promptCeo : null)
      || stage.promptOverride;
    return renderStageDirective("Stage Directive", text);
  })();
  const exitGateDirective = routingReason === "stage_gate" && stage?.exitGatePrompt
    ? renderStageDirective("Exit Gate Rule Prompt", stage.exitGatePrompt)
    : "";

  return {
    prefix: `${prompt.prefix}${stagePrefix}${stageDirective}${exitGateDirective}`,
    suffix: `${prompt.suffix}${stageSkills}`,
  };
}
