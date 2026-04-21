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
