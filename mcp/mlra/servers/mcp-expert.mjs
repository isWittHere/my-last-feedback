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
      `Hand off a completed deliverable for the user's review.
This tool will BLOCK until the user sends their next message.
Use type="plan_draft" when submitting a plan; use type="phase_complete" when
a Phase of implementation is finished. Format the content per the skill named
in the most recent user message (submit_plan_draft.md or submit_phase_report.md).`,
      {
        type: z.enum(["plan_draft", "phase_complete"]).describe(
          "Kind of deliverable: plan_draft (a plan proposal) or phase_complete (a completed execution Phase)"
        ),
        content: z.string().describe(
          "Full content of the deliverable, formatted per the relevant skill"
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
      `Declare that the current work is mature enough to request CEO review.
Applies in both phases: during planning this requests the plan gate; during
execution (after the final Phase) this requests the final verdict. Only when
BOTH sides (this role and the reviewer) vote \`pass\` does the CEO wake up.
Voting \`reject\` signals you are not yet ready — the cycle continues.
Non-blocking — returns immediately.`,
      {
        vote: z.enum(["pass", "reject"]).describe("pass = request CEO review; reject = keep iterating"),
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
need to re-anchor on the original goal — for example after a long iteration.`,
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
