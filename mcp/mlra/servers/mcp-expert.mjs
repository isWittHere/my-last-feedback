// mcp/mlra/servers/mcp-expert.mjs
// MLRA v2 Expert MCP server.
// Exposes: expert_submit, expert_vote, get_task_context
//
// The agent on the other end plays the Expert role (planning or execution —
// the phase is tracked by the daemon, not by role identity).

import { z } from "zod";
import { bootstrapMcpServer, installGlobalErrorHandlers } from "../../common/mcp-bootstrap.mjs";
import { connectRoleToDaemon, forwardBlocking, MSG } from "./_shared.mjs";
import { ROLES } from "../protocol/roles.mjs";

installGlobalErrorHandlers("MLRA-EXPERT");

/** @type {import("../daemon-client.mjs").DaemonClient|null} */
let client = null;

await bootstrapMcpServer({
  name: "MLRA Expert",
  version: "0.2.0",
  register(server) {
    server.tool(
      "expert_submit",
      `Submit your work result to the orchestrator.
This tool will BLOCK until the orchestrator sends your next instruction.
Use this to submit plan drafts (type="plan_draft") or phase-complete reports
(type="phase_complete"). Format per the skill referenced in the most recent
orchestrator message (skill_submit_plan_draft.md or skill_phase_complete_report.md).`,
      {
        type: z.enum(["plan_draft", "phase_complete"]).describe(
          "Type of submission: plan_draft (planning phase) or phase_complete (execution phase)"
        ),
        content: z.string().describe(
          "Submission content formatted per the relevant skill (plan draft or phase-complete report)"
        ),
        progress: z.string().optional().describe(
          "Optional progress indicator, e.g. 'Phase 2/5: database migration'"
        ),
      },
      async ({ type, content, progress }) => {
        if (!client) throw new Error("Daemon client not initialised");
        return forwardBlocking(client, {
          type: MSG.EXPERT_SUBMIT,
          submitType: type,
          content,
          progress: progress ?? null,
        });
      }
    );

    server.tool(
      "expert_vote",
      `Vote on whether the current plan/proposal is ready to proceed.
Use this when you believe the planning confrontation has reached consensus.
This is a quick-return tool (non-blocking).`,
      {
        vote: z.enum(["pass", "reject"]).describe("Your vote"),
        reason: z.string().describe("Reason for your vote"),
      },
      async ({ vote, reason }) => {
        if (!client) throw new Error("Daemon client not initialised");
        return forwardBlocking(client, {
          type: MSG.EXPERT_VOTE,
          vote,
          reason,
        });
      }
    );

    server.tool(
      "get_task_context",
      `Retrieve the original user request and task type.
Use this tool when you need to recall the original task description.`,
      {},
      async () => {
        if (!client) throw new Error("Daemon client not initialised");
        return forwardBlocking(client, { type: MSG.GET_TASK_CONTEXT });
      }
    );
  },
  async onClientConnect(server) {
    const bootstrap = await connectRoleToDaemon(server, ROLES.EXPERT);
    client = bootstrap.client;
    console.error("[MLRA-EXPERT] Connected to daemon as Expert");
  },
});

process.on("SIGTERM", () => client?.close());
process.on("SIGINT", () => client?.close());
process.stdin.on("end", () => client?.close());
process.stdin.on("close", () => client?.close());
