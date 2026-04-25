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

const stageExitCertificationSchema = z.object({
  originalRequestSatisfied: z.boolean().describe(
    "True only if the original user request is satisfied for the current stage"
  ),
  stageDirectiveSatisfied: z.boolean().describe(
    "True only if the current stage directive is fully satisfied"
  ),
  feedbackResolved: z.boolean().describe(
    "True only if all known feedback has been resolved or proven non-blocking"
  ),
  directVerificationEvidence: z.string().describe(
    "Concrete verification evidence checked directly, not assumed"
  ),
  unresolvedConcerns: z.string().describe(
    "Known unresolved concerns; use 'none' only when there are no known blockers"
  ),
  exitRationale: z.string().describe(
    "Why the entire current stage is ready to exit"
  ),
});

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
      `Use this tool only for stage-exit certification.
This is not a completion marker for your latest response. Do not call it merely
because you finished a draft, patch, report, or local subtask.

Use \`pass\` only when the entire current stage is ready to exit: the original
request is satisfied for this stage, the stage directive is fully satisfied,
all known feedback is resolved, direct verification evidence exists, and no
known blocking concern remains. If any item is uncertain, continue with
\`expert_submit({ content })\` instead.

Use \`reject\` only to declare that the current stage must not exit because
blocking work remains.
Non-blocking — returns immediately.`,
      {
        vote: z.enum(["pass", "reject"]).describe(
          "pass = certify the entire current stage is ready for exit review; reject = the current stage must not exit"
        ),
        reason: z.string().describe(
          "Stage-level certification rationale or blocker reason; vague phrases like 'done' or 'looks good' are insufficient"
        ),
        certification: stageExitCertificationSchema.optional().describe(
          "Required for pass. Structured self-audit proving the entire current stage is ready to exit."
        ),
      },
      async ({ vote, reason, certification }) => {
        if (!client) throw new Error("Daemon client not initialised");
        return forwardBlocking(client, {
          type: MSG.EXPERT_VOTE,
          vote,
          reason,
          certification,
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
