// mcp/mlra/protocol/messages.mjs
// TCP message types used on the daemon ↔ MCP server and daemon ↔ App UI channels.
// The MCP server's role is fixed at spawn time, so the handshake simply
// declares "I am role X". Collaboration rhythm is driven by the stage pipeline.

export const MSG = Object.freeze({
  // ── MCP server → daemon ──
  ROLE_HELLO: "role_hello",             // { role, workspace, model, clientName }
  ROLE_BYE: "role_bye",

  EXPERT_SUBMIT: "expert_submit",       // { content }
  EXPERT_VOTE: "expert_vote",           // { vote: "pass" | "reject", reason, certification? }

  INSPECTOR_SUBMIT: "inspector_submit", // { content }
  INSPECTOR_VOTE: "inspector_vote",     // { vote: "pass" | "reject", reason, certification? }

  CEO_VERDICT: "ceo_verdict",           // { verdict, reason, targets? }

  GET_TASK_CONTEXT: "get_task_context",

  // ── Daemon → MCP server (responses) ──
  RESOLVE: "resolve",
  ERROR: "error",

  // ── App UI → daemon ──
  MLRA_START: "mlra_start",             // { config: { launcherId, userTask, taskType, blueprint } }
  MLRA_CANCEL: "mlra_cancel",
  MLRA_STATUS: "mlra_status",

  // ── Daemon → App UI (push events) ──
  MLRA_ROLE_CONNECTED: "mlra_role_connected",
  MLRA_ROLE_DISCONNECTED: "mlra_role_disconnected",
  MLRA_STAGE_CHANGE: "mlra_stage_change",    // { launcherId, stageFrom, stageTo }
  MLRA_GATE_STATUS: "mlra_gate_status",
  MLRA_WORKFLOW_COMPLETE: "mlra_workflow_complete",
  MLRA_WORKFLOW_PAUSED: "mlra_workflow_paused",
});
