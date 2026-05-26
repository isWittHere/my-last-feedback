// mcp/mlra/protocol/roles.mjs
// MLRA 3-role system — ceo / expert / inspector are fixed identities.
// Each role corresponds to a MCP server binary under mcp/mlra/servers/.
// Collaboration rhythm is driven entirely by the user-authored stage pipeline,
// not by an internal planning/execution split.

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

/** Roles required to be connected before the daemon can start a workflow. */
export const REQUIRED_ROLES = Object.freeze([ROLES.CEO, ROLES.EXPERT, ROLES.INSPECTOR]);
