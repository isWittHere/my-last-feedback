// mcp/mlra/servers/_shared.mjs
// Helpers reused by the 3 MLRA MCP server entrypoints.

import { resolveCallerInfo } from "../../common/caller-info.mjs";
import { DaemonClient } from "../daemon-client.mjs";
import { MSG } from "../protocol/messages.mjs";

/**
 * Bootstrap a DaemonClient for the given role, resolving workspace/client info
 * from the MCP handshake. Returns both the client and the resolved caller info
 * so tool handlers can reference it.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} mcpServer
 * @param {"ceo"|"expert"|"inspector"} role
 * @param {{ workspace?: string }} [opts]
 * @returns {Promise<{ client: DaemonClient, callerInfo: import("../../common/caller-info.mjs").CallerInfo }>}
 */
export async function connectRoleToDaemon(mcpServer, role, opts = {}) {
  const callerInfo = await resolveCallerInfo(mcpServer, {
    workspaceHint: opts.workspace,
    fallbackClientEnvVar: "MLRA_CALLER_NAME",
  });
  const client = new DaemonClient({ role });
  const model = callerInfo.clientName || process.env.MLRA_MODEL || "unknown";

  await client.connect({
    workspace: callerInfo.workspacePath,
    model,
    clientName: callerInfo.clientName,
  });
  return { client, callerInfo };
}

/**
 * Forward a blocking request to the daemon and unwrap the `content` text.
 * @param {DaemonClient} client
 * @param {object} msg
 * @returns {Promise<{ content: Array<{ type: "text", text: string }> }>}
 */
export async function forwardBlocking(client, msg) {
  const resp = await client.request(msg);
  const text = typeof resp.content === "string" ? resp.content : JSON.stringify(resp.content ?? resp);
  return { content: [{ type: "text", text }] };
}

export { MSG };
