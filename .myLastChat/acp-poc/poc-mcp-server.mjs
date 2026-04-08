/**
 * Minimal MCP Server for ACP PoC Testing
 * 
 * Provides a "submit" tool that simply echoes back what it received.
 * This is used to verify MCP injection via ACP newSession({ mcpServers }).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "MLRA PoC MCP",
  version: "0.1.0",
});

server.tool(
  "submit",
  "Submit work results to the orchestrator. This tool is used by MLRA agents to report their work.",
  {
    type: z.enum(["phase_complete", "review_result", "plan_draft", "final_complete"])
      .describe("Type of submission"),
    content: z.string()
      .describe("The content of the submission in Markdown format"),
  },
  async ({ type, content }) => {
    console.error(`[POC-MCP] submit called: type=${type}, content=${content.slice(0, 100)}`);
    console.error(`[POC-MCP] MLRA_ROLE=${process.env.MLRA_ROLE || "not set"}`);
    console.error(`[POC-MCP] MLRA_POC_TEST=${process.env.MLRA_POC_TEST || "not set"}`);

    // In real MLRA, this would block waiting for orchestrator response.
    // For PoC, we just echo back.
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "received",
            echo: { type, content },
            role: process.env.MLRA_ROLE || "unknown",
            message: "PoC MCP submit tool called successfully!",
          }, null, 2),
        },
      ],
    };
  }
);

async function main() {
  console.error("[POC-MCP] Starting MLRA PoC MCP Server...");
  console.error(`[POC-MCP] Environment: MLRA_ROLE=${process.env.MLRA_ROLE}, MLRA_POC_TEST=${process.env.MLRA_POC_TEST}`);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("[POC-MCP] MCP Server running on stdio");
}

main().catch((err) => {
  console.error("[POC-MCP] Fatal:", err.message);
  process.exit(1);
});
