#!/usr/bin/env node
import { createHash } from "node:crypto";
import { basename } from "node:path";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.resume();
  });
}

function parseJson(text) {
  if (!text || !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function deriveAgentName(payload) {
  const payloadSessionId = typeof payload.session_id === "string" ? payload.session_id.trim() : "";
  const envLogPath = process.env.VSCODE_TARGET_SESSION_LOG || "";
  const envSessionId = envLogPath ? basename(envLogPath) : "";
  const sessionId = payloadSessionId || envSessionId;

  const cwd = payload.cwd || process.cwd();
  const clientName = payload.client_name || payload.clientName || process.env.MLF_CALLER_NAME || "codex";
  const key = sessionId || `${cwd}:${clientName}`;
  return createHash("md5").update(String(key)).digest("hex").slice(0, 4).toUpperCase();
}

(async () => {
  const payload = parseJson(await readStdin());
  const eventName = String(payload.hook_event_name || "");
  const agentName = deriveAgentName(payload);
  const msg = `[my-last-feedback] Your agent_name is "${agentName}". Use agent_name="${agentName}" in ALL interactive_feedback calls.`;
  const stopMsg = `[my-last-feedback] Before finishing, you MUST call interactive_feedback with agent_name="${agentName}" to present results to the user and collect confirmation. Do not stop without calling interactive_feedback first.`;

  const base = { continue: true };

  if (eventName === "UserPromptSubmit") {
    process.stdout.write(`${JSON.stringify({ ...base, hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: msg } })}\n`);
    return;
  }

  if (eventName === "PreCompact") {
    process.stdout.write(`${JSON.stringify({ ...base, hookSpecificOutput: { hookEventName: "PreCompact", additionalContext: msg }, systemMessage: msg })}\n`);
    return;
  }

  if (eventName === "PostCompact") {
    process.stdout.write(`${JSON.stringify({ ...base, hookSpecificOutput: { hookEventName: "PostCompact", additionalContext: msg }, systemMessage: msg })}\n`);
    return;
  }

  if (eventName === "Stop") {
    process.stdout.write(`${JSON.stringify({ decision: "block", reason: stopMsg })}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(base)}\n`);
})();
