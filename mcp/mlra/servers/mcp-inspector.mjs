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
  name: "MLRA Inspector",
  version: "0.2.0",
  register(server) {
    server.tool(
      "inspector_submit",
      `Return your review to the user.
This tool will BLOCK until the user sends their next message.

Format the content per the stage directive and referenced skills in the most
recent user message.`,
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
      `Use this tool only for stage-exit certification.
This is not a completion marker for your latest review. Do not call it merely
because you finished writing a review, verification note, or risk report.

Use \`pass\` only when the entire current stage is ready to exit: the original
request is satisfied for this stage, the stage directive is fully satisfied,
all known feedback is resolved, direct verification evidence exists, and no
known blocking concern remains. If any item is uncertain, continue with
\`inspector_submit({ content })\` instead.

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
          type: MSG.INSPECTOR_VOTE,
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
    const bootstrap = await connectRoleToDaemon(server, ROLES.INSPECTOR);
    client = bootstrap.client;
    console.error("[MLRA-INSPECTOR] Connected to daemon as Inspector");
  },
});

process.on("SIGTERM", () => client?.close());
process.on("SIGINT", () => client?.close());
process.stdin.on("end", () => client?.close());
process.stdin.on("close", () => client?.close());
