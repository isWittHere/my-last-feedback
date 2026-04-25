// mcp/mlra/servers/mcp-inspector.mjs
// MLRA Inspector MCP server.
// Exposes: inspector_submit, inspector_vote, get_task_context
//
// The agent on the other end plays the Inspector role. Stage context
// (current stage name, directive, skills) is delivered by the daemon via
// every routed message — role identity itself is fixed.

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

Format the content per the stage directive and referenced skills in the most
      {
        content: z.string().describe(
          "Review content, formatted per the stage directive"
        ),
      },
      async ({ content }) => {
        if (!client) throw new Error("Daemon client not initialised");
        return forwardBlocking(client, {
          type: MSG.INSPECTOR_SUBMIT,
          content,
        });
      }
    );

    server.tool(
      "inspector_vote",
      `Declare that the current user-facing material is ready for stage-exit review.
    Use \`pass\` only when the material is complete, verified, and ready for the
    user's final stage decision. Use \`reject\` when the material still needs changes.
Non-blocking — returns immediately.`,
      {
        vote: z.enum(["pass", "reject"]).describe("pass = request stage-exit review; reject = not ready"),
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
