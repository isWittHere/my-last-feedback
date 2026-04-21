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
      `Return your review to the user.
This tool will BLOCK until the user sends their next message.

During planning: \`passed\` is informational — iteration continues via this tool
until both sides vote to request the plan gate.
During execution: \`passed: true\` means the Phase under review is acceptable
and work moves to the next Phase; \`passed: false\` sends it back for rework.

Format the content per the skill named in the most recent user message
(review_plan.md or review_phase.md).`,
      {
        passed: z.boolean().describe(
          "true = material is acceptable; false = needs rework. In execution phase, true advances to the next Phase."
        ),
        content: z.string().describe(
          "Review content, formatted per the relevant review skill"
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
      `Declare that the current work is mature enough to request CEO review.
Applies in both phases: during planning this requests the plan gate; during
execution (after the final Phase) this requests the final verdict. Only when
BOTH sides (this role and the expert) vote \`pass\` does the CEO wake up.
Voting \`reject\` signals you are not yet ready — the cycle continues.
Non-blocking — returns immediately.`,
      {
        vote: z.enum(["pass", "reject"]).describe("pass = request CEO review; reject = keep iterating"),
        reason: z.string().describe("Why you are (or are not) ready"),
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
      `Recall the user's original request and task type. Use this whenever you
need to re-anchor on the original goal.`,
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
