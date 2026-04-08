/**
 * MLRA ACP PoC — Test 2: Multi-Session
 * 
 * 验证项:
 * 1. 单个 ACP 进程能否创建多个 session
 * 2. 不同 session 是否真正独立（上下文隔离）
 * 3. 能否交替向不同 session 发消息
 */
import * as acp from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";

const COPILOT_PATH = process.env.COPILOT_CLI_PATH ?? "copilot";
const COPILOT_MODEL = process.env.COPILOT_MODEL ?? "gpt-4o";
const TIMEOUT_MS = 180_000;

function log(tag, ...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}][${tag}]`, ...args);
}

function logErr(tag, ...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[${ts}][${tag}]`, ...args);
}

async function main() {
  log("INIT", "Starting ACP PoC — multi-session test");

  const copilotProcess = spawn(COPILOT_PATH, ["--acp", "--stdio", "--model", COPILOT_MODEL], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: process.cwd(),
  });
  log("INIT", `Model: ${COPILOT_MODEL}`);

  if (!copilotProcess.stdin || !copilotProcess.stdout) {
    throw new Error("Failed to start Copilot ACP process.");
  }

  copilotProcess.stderr?.on("data", (chunk) => {
    logErr("STDERR", chunk.toString().trim());
  });

  copilotProcess.on("exit", (code, signal) => {
    log("PROC", `Exit: code=${code}, signal=${signal}`);
  });

  const output = Writable.toWeb(copilotProcess.stdin);
  const input = Readable.toWeb(copilotProcess.stdout);
  const stream = acp.ndJsonStream(output, input);

  // Track messages per session
  const sessionMessages = {};

  const client = {
    async requestPermission(params) {
      return { outcome: { outcome: "approved" } };
    },
    async sessionUpdate(params) {
      const update = params.update;
      if (update.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") {
        const sid = params.sessionId || "unknown";
        if (!sessionMessages[sid]) sessionMessages[sid] = [];
        sessionMessages[sid].push(update.content.text);
      }
    },
  };

  const connection = new acp.ClientSideConnection((_agent) => client, stream);

  // ── Initialize ──
  log("INIT", "Initializing ACP connection...");
  await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {},
  });
  log("INIT", "✓ ACP initialized");

  // ── Create Session 1 ──
  log("SESSION1", "Creating session 1...");
  const session1 = await connection.newSession({
    cwd: process.cwd(),
    mcpServers: [],
  });
  log("SESSION1", `✓ Session 1 ID: ${session1.sessionId}`);

  // ── Create Session 2 ──
  log("SESSION2", "Creating session 2...");
  const session2 = await connection.newSession({
    cwd: process.cwd(),
    mcpServers: [],
  });
  log("SESSION2", `✓ Session 2 ID: ${session2.sessionId}`);

  const sameSession = session1.sessionId === session2.sessionId;
  log("CHECK", `Sessions are ${sameSession ? "SAME (bad!)" : "DIFFERENT (good!)"}`);

  // ── Send prompt to Session 1 ──
  log("PROMPT1", "Sending to Session 1: 'My secret code is ALPHA. Remember it. Reply: ACKNOWLEDGED'");
  const r1 = await connection.prompt({
    sessionId: session1.sessionId,
    prompt: [{ type: "text", text: "My secret code is ALPHA. Remember it. Reply with exactly: ACKNOWLEDGED_ALPHA" }],
  });
  log("PROMPT1", `✓ Session 1 response (stopReason=${r1.stopReason})`);

  // ── Send prompt to Session 2 ──
  log("PROMPT2", "Sending to Session 2: 'My secret code is BETA. Remember it. Reply: ACKNOWLEDGED'");
  const r2 = await connection.prompt({
    sessionId: session2.sessionId,
    prompt: [{ type: "text", text: "My secret code is BETA. Remember it. Reply with exactly: ACKNOWLEDGED_BETA" }],
  });
  log("PROMPT2", `✓ Session 2 response (stopReason=${r2.stopReason})`);

  // ── Verify isolation: ask Session 1 for its code ──
  log("VERIFY1", "Asking Session 1: 'What is my secret code?'");
  sessionMessages[session1.sessionId] = [];
  const v1 = await connection.prompt({
    sessionId: session1.sessionId,
    prompt: [{ type: "text", text: "What is my secret code? Reply with just the code word." }],
  });
  const s1Response = (sessionMessages[session1.sessionId] || []).join("");
  log("VERIFY1", `Session 1 says: ${s1Response}`);

  // ── Verify isolation: ask Session 2 for its code ──
  log("VERIFY2", "Asking Session 2: 'What is my secret code?'");
  sessionMessages[session2.sessionId] = [];
  const v2 = await connection.prompt({
    sessionId: session2.sessionId,
    prompt: [{ type: "text", text: "What is my secret code? Reply with just the code word." }],
  });
  const s2Response = (sessionMessages[session2.sessionId] || []).join("");
  log("VERIFY2", `Session 2 says: ${s2Response}`);

  // ── Summary ──
  const s1HasAlpha = s1Response.toUpperCase().includes("ALPHA");
  const s2HasBeta = s2Response.toUpperCase().includes("BETA");
  const s1HasBeta = s1Response.toUpperCase().includes("BETA");
  const s2HasAlpha = s2Response.toUpperCase().includes("ALPHA");

  console.log("\n" + "=".repeat(60));
  console.log("ACP PoC MULTI-SESSION TEST — RESULTS");
  console.log("=".repeat(60));
  console.log(`${!sameSession ? "✓" : "✗"} Distinct session IDs:  ${!sameSession}`);
  console.log(`  Session 1 ID: ${session1.sessionId}`);
  console.log(`  Session 2 ID: ${session2.sessionId}`);
  console.log(`${s1HasAlpha ? "✓" : "✗"} Session 1 remembers ALPHA: ${s1HasAlpha}`);
  console.log(`${s2HasBeta ? "✓" : "✗"} Session 2 remembers BETA:  ${s2HasBeta}`);
  console.log(`${!s1HasBeta ? "✓" : "⚠"} Session 1 doesn't know BETA: ${!s1HasBeta}`);
  console.log(`${!s2HasAlpha ? "✓" : "⚠"} Session 2 doesn't know ALPHA: ${!s2HasAlpha}`);
  console.log(`  Context isolation: ${(s1HasAlpha && s2HasBeta && !s1HasBeta && !s2HasAlpha) ? "PERFECT" : "PARTIAL or FAILED"}`);
  console.log("=".repeat(60));

  // ── Cleanup ──
  copilotProcess.stdin.end();
  copilotProcess.kill("SIGTERM");
  await new Promise((resolve) => {
    copilotProcess.once("exit", () => resolve());
    setTimeout(() => { copilotProcess.kill("SIGKILL"); resolve(); }, 3000);
  });
}

const timeout = setTimeout(() => {
  logErr("TIMEOUT", `Test timed out after ${TIMEOUT_MS}ms`);
  process.exit(1);
}, TIMEOUT_MS);

main()
  .then(() => { clearTimeout(timeout); process.exit(0); })
  .catch((err) => { clearTimeout(timeout); logErr("FATAL", err.message); logErr("FATAL", err.stack); process.exit(1); });
