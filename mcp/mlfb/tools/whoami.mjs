// mcp/mlfb/tools/whoami.mjs
// Lightweight tool: agents call this to surface the PostToolUse hook-injected agent_name.
//
// The MCP server itself cannot compute md5(session_id) because
// VSCODE_TARGET_SESSION_LOG is not injected into MCP server processes.
// Instead, the my-last-feedback hook appends the line
//     [my-last-feedback] Your agent_name is "XXXX"
// into additionalContext immediately after this tool returns.

const DESCRIPTION = `Query your assigned agent_name for use in interactive_feedback calls.

The server returns a placeholder response; your real agent_name is injected by the
my-last-feedback hook system into the PostToolUse additionalContext that follows
this tool's return. Look for a line formatted as:

    [my-last-feedback] Your agent_name is "XXXX"

Use that XXXX as the agent_name parameter in ALL subsequent interactive_feedback calls.`;

const PLACEHOLDER_TEXT =
  "Your agent_name is delivered via the PostToolUse hook injection that follows this response. " +
  "Look for the line '[my-last-feedback] Your agent_name is \"XXXX\"' and use that value as agent_name " +
  "in all subsequent interactive_feedback calls. " +
  "If no such line appears, the my-last-feedback hook is not installed — the feedback tool will reject calls without a valid agent_name.";

/**
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 */
export function registerWhoami(server) {
  server.tool(
    "whoami",
    DESCRIPTION,
    {},
    async () => ({
      content: [{ type: "text", text: PLACEHOLDER_TEXT }],
    })
  );
}
