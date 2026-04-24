// mcp/mlra/protocol/roles.mjs
// MLRA v2 roles — collapsed from the 5-role v1 system to 3 dedicated servers.
//
// Each role corresponds to a MCP server binary under mcp/mlra/servers/.
// Planning/execution remain internal protocol keys tracked by the daemon, not
// by role identity. UI-facing layers should map them to higher-level
// collaboration terminology instead of exposing them directly as authoring
// concepts.

export const ROLES = Object.freeze({
  CEO: "ceo",
  EXPERT: "expert",
  INSPECTOR: "inspector",
});

/** @type {ReadonlyArray<"ceo"|"expert"|"inspector">} */
export const ROLE_LIST = Object.freeze([ROLES.CEO, ROLES.EXPERT, ROLES.INSPECTOR]);

export const ROLE_LABELS = Object.freeze({
  [ROLES.CEO]: "CEO",
  [ROLES.EXPERT]: "Expert",
  [ROLES.INSPECTOR]: "Inspector",
});

export const PHASES = Object.freeze({
  PLANNING: "planning",
  EXECUTION: "execution",
});

export const START_MODES = Object.freeze({
  FULL: "full",
  DIRECT_EXECUTION: "direct-execution",
});

/** Roles required to be connected before the daemon can start a workflow. */
export const REQUIRED_ROLES_BY_START_MODE = Object.freeze({
  [START_MODES.FULL]: [ROLES.CEO, ROLES.EXPERT, ROLES.INSPECTOR],
  [START_MODES.DIRECT_EXECUTION]: [ROLES.CEO, ROLES.EXPERT, ROLES.INSPECTOR],
});
