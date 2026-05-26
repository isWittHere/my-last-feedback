// mcp/mlfb/index.mjs
// Entry point for the My Last Feedback MCP server.
//
// This replaces the legacy root-level server.mjs. The mcp.json.template has
// been updated to point here directly:
//     "args": ["mcp/mlfb/index.mjs"]

import {
  bootstrapMcpServer,
  installGlobalErrorHandlers,
} from "../common/mcp-bootstrap.mjs";
import { registerInteractiveFeedback } from "./tools/interactive-feedback.mjs";
import { cancelAllActiveSessions, activeSessions } from "./app-ipc.mjs";

installGlobalErrorHandlers("MLFB");

await bootstrapMcpServer({
  name: "My Last Feedback MCP",
  version: "1.0.0",
  register(server) {
    registerInteractiveFeedback(server);
  },
});

// ── Client-disconnect handling ──
// When the MCP client (e.g. VS Code) closes, the stdin pipe breaks.
// Detection differs across platforms; we use several strategies:
//   1. stdin 'end'/'close' events
//   2. Process signals (SIGTERM / SIGINT / SIGHUP)
//   3. Periodic stdin-destroyed check (most reliable fallback on Windows)

let disconnectHandled = false;

async function handleClientDisconnect(reason) {
  if (disconnectHandled) return;
  disconnectHandled = true;
  console.error(`[MLFB] Client disconnected (${reason}), cancelling active sessions...`);
  await cancelAllActiveSessions();
  process.exit(0);
}

process.stdin.on("end", () => handleClientDisconnect("stdin end"));
process.stdin.on("close", () => handleClientDisconnect("stdin close"));
process.stdin.on("error", () => handleClientDisconnect("stdin error"));

for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(sig, () => handleClientDisconnect(`signal ${sig}`));
}

const stdinCheckInterval = setInterval(() => {
  if (activeSessions.size > 0 && process.stdin.destroyed) {
    clearInterval(stdinCheckInterval);
    handleClientDisconnect("stdin destroyed (periodic check)");
  }
}, 2000);
