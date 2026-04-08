/**
 * MLRA ACP PoC — Test 1: Basic ACP Connection
 * 
 * 验证项:
 * 1. 能否通过 spawn 启动 copilot --acp --stdio
 * 2. 能否完成 ACP 握手 (initialize)
 * 3. 能否创建 session (newSession)
 * 4. 能否发送 prompt 并收到流式回复
 * 5. requestPermission 回调是否正常
 * 6. Windows stdio 管道是否稳定
 */
import * as acp from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";

const COPILOT_PATH = process.env.COPILOT_CLI_PATH ?? "copilot";
const COPILOT_MODEL = process.env.COPILOT_MODEL ?? "gpt-4o";
const TIMEOUT_MS = 120_000; // 120s timeout for the entire test

function log(tag, ...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}][${tag}]`, ...args);
}

function logErr(tag, ...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[${ts}][${tag}]`, ...args);
}

async function main() {
  log("INIT", `Starting ACP PoC — basic test`);
  log("INIT", `Copilot path: ${COPILOT_PATH}`);
  log("INIT", `CWD: ${process.cwd()}`);

  // ── Step 1: Spawn copilot process ──
  log("STEP1", "Spawning copilot --acp --stdio ...");
  
  const copilotProcess = spawn(COPILOT_PATH, ["--acp", "--stdio", "--model", COPILOT_MODEL], {
    stdio: ["pipe", "pipe", "pipe"], // capture stderr too
    cwd: process.cwd(),
  });
  log("STEP1", `Model: ${COPILOT_MODEL}`);

  if (!copilotProcess.stdin || !copilotProcess.stdout) {
    throw new Error("Failed to start Copilot ACP process with piped stdio.");
  }

  // Log stderr
  copilotProcess.stderr?.on("data", (chunk) => {
    logErr("STDERR", chunk.toString().trim());
  });

  copilotProcess.on("exit", (code, signal) => {
    log("PROC", `Copilot process exited: code=${code}, signal=${signal}`);
  });

  copilotProcess.on("error", (err) => {
    logErr("PROC", `Copilot process error: ${err.message}`);
  });

  log("STEP1", `✓ Process spawned, PID=${copilotProcess.pid}`);

  // ── Step 2: Create ACP connection ──
  log("STEP2", "Creating ACP NDJSON stream...");

  const output = Writable.toWeb(copilotProcess.stdin);
  const input = Readable.toWeb(copilotProcess.stdout);
  const stream = acp.ndJsonStream(output, input);

  let messageChunks = [];
  let permissionRequests = [];

  const client = {
    async requestPermission(params) {
      const toolName = params.tool?.name || params.toolName || "unknown";
      log("PERM", `Tool permission requested: ${toolName}`);
      log("PERM", `Params: ${JSON.stringify(params).slice(0, 200)}`);
      permissionRequests.push(params);
      // Auto-approve everything for PoC
      return { outcome: { outcome: "approved" } };
    },

    async sessionUpdate(params) {
      const update = params.update;
      if (update.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") {
        messageChunks.push(update.content.text);
        process.stdout.write(update.content.text);
      } else {
        log("UPDATE", `sessionUpdate type: ${update.sessionUpdate}`);
      }
    },
  };

  const connection = new acp.ClientSideConnection((_agent) => client, stream);
  log("STEP2", "✓ ACP connection created");

  // ── Step 3: Initialize ──
  log("STEP3", "Sending initialize...");
  
  const initResult = await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {},
  });

  log("STEP3", `✓ Initialize complete`);
  log("STEP3", `  Protocol version: ${acp.PROTOCOL_VERSION}`);
  log("STEP3", `  Server capabilities: ${JSON.stringify(initResult).slice(0, 500)}`);

  // ── Step 4: Create session ──
  log("STEP4", "Creating new session...");

  const sessionResult = await connection.newSession({
    cwd: process.cwd(),
    mcpServers: [],
  });

  log("STEP4", `✓ Session created`);
  log("STEP4", `  Session ID: ${sessionResult.sessionId}`);
  log("STEP4", `  Full result: ${JSON.stringify(sessionResult).slice(0, 500)}`);

  // ── Step 5: Send prompt ──
  log("STEP5", "Sending prompt: 'Reply with exactly: HELLO_ACP_POC_SUCCESS'");

  messageChunks = [];
  const promptResult = await connection.prompt({
    sessionId: sessionResult.sessionId,
    prompt: [{ type: "text", text: "Reply with exactly these words and nothing else: HELLO_ACP_POC_SUCCESS" }],
  });

  log("STEP5", `✓ Prompt complete`);
  log("STEP5", `  Stop reason: ${promptResult.stopReason}`);
  log("STEP5", `  Full response: ${messageChunks.join("")}`);
  log("STEP5", `  Permission requests: ${permissionRequests.length}`);

  // ── Summary ──
  console.log("\n" + "=".repeat(60));
  console.log("ACP PoC BASIC TEST — RESULTS");
  console.log("=".repeat(60));
  console.log(`✓ Process spawn:     OK (PID=${copilotProcess.pid})`);
  console.log(`✓ ACP initialize:    OK`);
  console.log(`✓ Session creation:  OK (ID=${sessionResult.sessionId})`);
  console.log(`✓ Prompt/response:   OK (stopReason=${promptResult.stopReason})`);
  console.log(`  Response length:   ${messageChunks.join("").length} chars`);
  console.log(`  Permission reqs:   ${permissionRequests.length}`);
  console.log(`  Windows stdio:     OK (if you see this)`);
  console.log("=".repeat(60));

  // ── Cleanup ──
  log("CLEANUP", "Terminating copilot process...");
  copilotProcess.stdin.end();
  copilotProcess.kill("SIGTERM");
  
  await new Promise((resolve) => {
    copilotProcess.once("exit", () => resolve());
    setTimeout(() => {
      copilotProcess.kill("SIGKILL");
      resolve();
    }, 3000);
  });

  log("CLEANUP", "✓ Done");
}

// Timeout guard
const timeout = setTimeout(() => {
  logErr("TIMEOUT", `Test timed out after ${TIMEOUT_MS}ms`);
  process.exit(1);
}, TIMEOUT_MS);

main()
  .then(() => {
    clearTimeout(timeout);
    process.exit(0);
  })
  .catch((err) => {
    clearTimeout(timeout);
    logErr("FATAL", err.message);
    logErr("FATAL", err.stack);
    process.exit(1);
  });
