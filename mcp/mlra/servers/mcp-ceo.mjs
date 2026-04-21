// mcp/mlra/servers/mcp-ceo.mjs
// MLRA v2 CEO MCP server.
// Exposes: ceo_verdict, get_task_context
//
// The agent on the other end plays the CEO role. The daemon routes relevant
// events (planning gate / final review / arbitration) to this server, and the
// agent's decisions flow back via the tools below.

import { z } from "zod";
import { bootstrapMcpServer, installGlobalErrorHandlers } from "../../common/mcp-bootstrap.mjs";
import { connectRoleToDaemon, forwardBlocking, MSG } from "./_shared.mjs";
import { ROLES } from "../protocol/roles.mjs";

installGlobalErrorHandlers("MLRA-CEO");

/** @type {import("../daemon-client.mjs").DaemonClient|null} */
let client = null;

await bootstrapMcpServer({
  name: "MLRA CEO",
  version: "0.2.0",
  register(server) {
    server.tool(
      "ceo_verdict",
      `Issue your ruling on the material the user just presented, then stand by
until the user returns with the next gate.
This tool will BLOCK until the user sends their next message.`,
      {
        verdict: z.enum(["approved", "rejected", "arbitration"]).describe(
          "Your ruling: approved (pass), rejected (send back with reason), arbitration (resolve a deadlock)"
        ),
        reason: z.string().optional().describe(
          "Rationale or specific directives (required for rejected / arbitration)"
        ),
        targets: z.array(z.string()).optional().describe(
          "Optional scope for arbitration — names the parties your directives apply to"
        ),
      },
      async ({ verdict, reason, targets }) => {
        if (!client) throw new Error("Daemon client not initialised");
        return forwardBlocking(client, {
          type: MSG.CEO_VERDICT,
          verdict,
          reason: reason ?? null,
          targets: targets ?? null,
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
    const bootstrap = await connectRoleToDaemon(server, ROLES.CEO);
    client = bootstrap.client;
    console.error("[MLRA-CEO] Connected to daemon as CEO");
  },
});

process.on("SIGTERM", () => client?.close());
process.on("SIGINT", () => client?.close());
process.stdin.on("end", () => client?.close());
process.stdin.on("close", () => client?.close());
