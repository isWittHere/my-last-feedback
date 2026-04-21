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
      `CEO exclusive verdict tool. Submit your decision and automatically enter standby
until the next critical review point arrives.
This tool will BLOCK until the next trigger point wakes you up.
Only the CEO agent should use this tool.`,
      {
        verdict: z.enum(["approved", "rejected", "arbitration"]).describe(
          "Your verdict: approved (pass), rejected (reject with reason), arbitration (resolve dispute)"
        ),
        reason: z.string().optional().describe(
          "Verdict reason or specific instructions (required for rejected/arbitration)"
        ),
        targets: z.array(z.string()).optional().describe(
          "Target roles for arbitration result routing"
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
    const bootstrap = await connectRoleToDaemon(server, ROLES.CEO);
    client = bootstrap.client;
    console.error("[MLRA-CEO] Connected to daemon as CEO");
  },
});

process.on("SIGTERM", () => client?.close());
process.on("SIGINT", () => client?.close());
process.stdin.on("end", () => client?.close());
process.stdin.on("close", () => client?.close());
