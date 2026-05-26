// mcp/common/mcp-bootstrap.mjs
// Boilerplate for standing up an MCP server over stdio.
// Each dedicated MCP server (MLFB, MLRA CEO/planning/execution) calls
// `bootstrapMcpServer({ name, version, register })` from its entrypoint.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

/**
 * @typedef {Object} BootstrapOptions
 * @property {string} name            Server display name (e.g. "My Last Feedback")
 * @property {string} version         Semver string
 * @property {(server: McpServer) => void | Promise<void>} register
 *          Callback where the caller registers tools/resources/prompts
 *          on the provided McpServer instance.
 * @property {(server: McpServer) => void | Promise<void>} [onClientConnect]
 *          Optional hook invoked once the stdio transport connects.
 */

/**
 * Create an McpServer, run the register callback, and connect a stdio transport.
 * Returns the McpServer instance for further interaction (e.g. graceful shutdown).
 *
 * @param {BootstrapOptions} opts
 * @returns {Promise<McpServer>}
 */
export async function bootstrapMcpServer(opts) {
  const server = new McpServer({ name: opts.name, version: opts.version });

  await opts.register(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (opts.onClientConnect) {
    await opts.onClientConnect(server);
  }

  return server;
}

/**
 * Install common process-level error hooks that log but do not crash the server.
 * Call once from the entrypoint (before bootstrapMcpServer).
 */
export function installGlobalErrorHandlers(tag = "MCP") {
  process.on("unhandledRejection", (err) => {
    console.error(`[${tag}] unhandledRejection:`, err);
  });
  process.on("uncaughtException", (err) => {
    console.error(`[${tag}] uncaughtException:`, err);
  });
}
