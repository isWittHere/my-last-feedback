// mcp/mlra/servers/mcp-inspector.mjs
// MLRA v2 Inspector MCP server.
// Exposes: inspector_submit, inspector_vote, get_task_context
//
// The agent on the other end plays the Inspector role (planning or execution —
// the phase is tracked by the daemon).

import { z } from "zod";
import { bootstrapMcpServer, installGlobalErrorHandlers } from "../../common/mcp-bootstrap.mjs";
import { connectRoleToDaemon, forwardBlocking, MSG } from "./_shared.mjs";
import { ROLES } from "../protocol/roles.mjs";

installGlobalErrorHandlers("MLRA-INSPECTOR");

/** @type {import("../daemon-client.mjs").DaemonClient|null} */
let client = null;

await bootstrapMcpServer({
  name: "MLRA Inspector",
  version: "0.2.0",
  register(server) {
    server.tool(
      "inspector_submit",
      `Submit your review result to the orchestrator.
This tool will BLOCK until the orchestrator sends your next instruction.
Use \`passed: true\` when the work under review is acceptable, \`passed: false\`
to send it back for rework. Format per the skill referenced in the most recent
orchestrator message (review_plan.md or review_phase.md).`,
      {
        passed: z.boolean().describe(
          "Whether the review passed (true) or found blocking issues (false)"
        ),
        content: z.string().describe(
          "Review content formatted per the relevant review skill"
        ),
      },
      async ({ passed, content }) => {
        if (!client) throw new Error("Daemon client not initialised");
        return forwardBlocking(client, {
          type: MSG.INSPECTOR_SUBMIT,
          passed,
          content,
        });
      }
    );

    server.tool(
      "inspector_vote",
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
          type: MSG.INSPECTOR_VOTE,
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
    const bootstrap = await connectRoleToDaemon(server, ROLES.INSPECTOR);
    client = bootstrap.client;
    console.error("[MLRA-INSPECTOR] Connected to daemon as Inspector");
  },
});

process.on("SIGTERM", () => client?.close());
process.on("SIGINT", () => client?.close());
process.stdin.on("end", () => client?.close());
process.stdin.on("close", () => client?.close());
