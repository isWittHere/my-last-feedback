import { randomUUID } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import {
  installGlobalErrorHandlers,
} from "../common/mcp-bootstrap.mjs";
import { registerInteractiveFeedback } from "./tools/interactive-feedback.mjs";
import { cancelAllActiveSessions } from "./app-ipc.mjs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

installGlobalErrorHandlers("MLFB-HTTP");

function createServer() {
  const server = new McpServer({
    name: "My Last Feedback MCP",
    version: "1.0.0",
  });

  registerInteractiveFeedback(server);
  return server;
}

const app = createMcpExpressApp();
const transports = {};

app.all("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    let transport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
        }
      };

      const server = createServer();
      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID provided" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[MLFB-HTTP] Error handling request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

const PORT = Number(process.env.MLFB_MCP_PORT || 3838);
const HOST = process.env.MLFB_MCP_HOST || "127.0.0.1";

app.listen(PORT, HOST, (error) => {
  if (error) {
    console.error("[MLFB-HTTP] Failed to start server:", error);
    process.exit(1);
  }
  console.error(`[MLFB-HTTP] Streamable HTTP MCP server listening at http://${HOST}:${PORT}/mcp`);
});

for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(sig, async () => {
    console.error(`[MLFB-HTTP] Received ${sig}, cancelling active sessions...`);
    await cancelAllActiveSessions();
    process.exit(0);
  });
}
