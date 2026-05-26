#!/usr/bin/env node
// Hook script: Generate deterministic agent_name from session_id
// Used by my-last-feedback MCP tool.
// Also notifies MLRA Daemon of session info on SessionStart for alive detection.
import { createHash } from "node:crypto";
import { createConnection } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dirname } from "node:path";

// ── MLRA Daemon notification (fire-and-forget on SessionStart) ──

function notifyMlraDaemon(sessionId, agentName, workspace) {
  // Determine transcript directory from VSCODE_TARGET_SESSION_LOG env
  let transcriptDir = null;
  const logPath = process.env.VSCODE_TARGET_SESSION_LOG;
  if (logPath) {
    // logPath = .../GitHub.copilot-chat/debug-logs/{sessionId}
    // transcriptDir = .../GitHub.copilot-chat/transcripts/
    const copilotChatDir = dirname(dirname(logPath));
    transcriptDir = join(copilotChatDir, "transcripts");
  }

  // Try both dev and prod MLRA daemon ports
  const portRanges = [
    { start: 19881, end: 19890, label: "dev" },    // MLRA dev
    { start: 19871, end: 19880, label: "prod" },    // MLRA prod
  ];

  // Also try reading from lock file
  const lockFiles = [
    join(tmpdir(), "my-long-running-agent-dev.port"),
    join(tmpdir(), "my-long-running-agent.port"),
  ];

  const portsToTry = new Set();
  for (const lockFile of lockFiles) {
    try {
      const port = parseInt(readFileSync(lockFile, "utf-8").trim(), 10);
      if (port >= 19871 && port <= 19890) portsToTry.add(port);
    } catch {}
  }

  const msg = JSON.stringify({
    type: "session_hook_notify",
    session_id: sessionId,
    agent_name: agentName,
    transcript_dir: transcriptDir,
    workspace: workspace || "",
  }) + "\n";

  // Try lock file ports first, then scan ranges
  for (const port of portsToTry) {
    trySendTcp(port, msg);
  }
  for (const range of portRanges) {
    for (let p = range.start; p <= range.end; p++) {
      if (!portsToTry.has(p)) trySendTcp(p, msg);
    }
  }
}

function trySendTcp(port, msg) {
  try {
    const socket = createConnection({ host: "127.0.0.1", port }, () => {
      socket.write(msg);
      // Don't wait for response — fire and forget
      setTimeout(() => socket.destroy(), 200);
    });
    socket.on("error", () => {});
    socket.setTimeout(500, () => socket.destroy());
  } catch {}
}

// ── Main hook logic ──

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
    const workspace = data.workspace_folder || data.workspaceFolder || "";
    const message =
      `[my-last-feedback] Your agent_name is "${agentName}". ` +
      `Use agent_name="${agentName}" in ALL interactive_feedback calls.`;

    // On SessionStart, notify MLRA Daemon of session info (fire-and-forget)
    if (hookEvent === "SessionStart") {
      notifyMlraDaemon(sessionId, agentName, workspace);
    }

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
