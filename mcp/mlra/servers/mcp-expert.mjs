// mcp/mlra/servers/mcp-expert.mjs
// MLRA Expert MCP server.
// Exposes: expert_submit, expert_vote, get_task_context
//
// The agent on the other end plays the Expert role. Stage context (current
// stage name, directive, skills) is delivered by the daemon via every
// routed message — role identity itself is fixed.

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
      `Hand off a completed deliverable for the user's review.
This tool will BLOCK until the user sends their next message.
Format the content per the stage directive and referenced skills in the most
recent user message. Write as if you are submitting directly to the user.`,
      {
        content: z.string().describe(
          "Full content of the deliverable, formatted per the stage directive"
        ),
      },
      async ({ content }) => {
        if (!client) throw new Error("Daemon client not initialised");
        return forwardBlocking(client, {
          type: MSG.EXPERT_SUBMIT,
          content,
        });
      }
    );

    server.tool(
      "expert_vote",
      `Declare that the current user-facing work is ready for stage-exit review.
    Use \`pass\` only when the content is complete, verified, and ready for the
    user's final stage decision. Use \`reject\` when the work still needs changes.
Non-blocking — returns immediately.`,
      {
        vote: z.enum(["pass", "reject"]).describe("pass = request stage-exit review; reject = not ready"),
        reason: z.string().describe("Why you are (or are not) ready"),
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
    const bootstrap = await connectRoleToDaemon(server, ROLES.EXPERT);
    client = bootstrap.client;
    console.error("[MLRA-EXPERT] Connected to daemon as Expert");
  },
});

process.on("SIGTERM", () => client?.close());
process.on("SIGINT", () => client?.close());
process.stdin.on("end", () => client?.close());
process.stdin.on("close", () => client?.close());
