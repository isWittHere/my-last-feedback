#!/usr/bin/env node
// Hook script: Generate deterministic agent_name from session_id
// Used by my-last-feedback MCP tool — no need for register_agent call.
import { createHash } from "node:crypto";

let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input);

    // Extract session_id (handle both snake_case and camelCase)
    const sessionId = data.session_id || data.sessionId || "";
    if (!sessionId) {
      // No session ID available — exit silently, don't block
      process.stdout.write(JSON.stringify({}));
      process.exit(0);
    }

    // Generate deterministic 4-char alphanumeric agent_name from session ID
    const hash = createHash("md5").update(sessionId).digest("hex");
    const agentName = hash.slice(0, 4).toUpperCase();

    const hookEvent = data.hook_event_name || data.hookEventName || "";
    const message =
      `[my-last-feedback] Your agent_name is "${agentName}". ` +
      `Use agent_name="${agentName}" in ALL interactive_feedback calls. ` +
      `Do NOT call register_agent — your identity is already assigned.`;

    let output;
    if (hookEvent === "SessionStart") {
      output = {
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: message,
        },
      };
    } else {
      // UserPromptSubmit or other events
      output = { systemMessage: message };
    }

    process.stdout.write(JSON.stringify(output));
  } catch {
    // Parse error — exit cleanly, don't block agent
    process.stdout.write(JSON.stringify({}));
  }
});
