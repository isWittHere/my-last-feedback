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
This tool will BLOCK until the user sends their next message.

Verdict semantics:
- \`approved\`: the material passes. NOTE: a defensive-lock applies — your first
  two approvals for any given gate will be downgraded and sent back for another
  pass, and two consecutive approvals are required before final passage.
- \`rejected\`: send the material back for rework with a reason. All iteration
  state and vote counters reset.
- \`arbitration\`: issue directives to break a deadlock or correct a stalled
  cycle. Optionally scope directives to specific parties via \`targets\`.`,
      {
        verdict: z.enum(["approved", "rejected", "arbitration"]).describe(
          "approved / rejected / arbitration (see tool description for semantics)"
        ),
        reason: z.string().optional().describe(
          "Rationale or directives (required for rejected / arbitration)"
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
