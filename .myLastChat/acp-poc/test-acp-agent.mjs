/**
 * test-acp-agent.mjs — PoC Test: ACP + --agent compatibility
 * 
 * Verifies whether `copilot --acp --stdio --agent <name>` works.
 * Tests:
 * 1. Can ACP server start with --agent flag?
 * 2. Does the custom agent's system prompt take effect?
 * 3. Does the custom agent's model setting take effect?
 * 4. Does the custom agent's tools restriction take effect?
 * 
 * Prerequisites:
 *   - ~/.copilot/agents/test-echo.agent.md must exist
 *   - npm install (in this directory)
 */
import * as acp from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";

const TIMEOUT_MS = 120_000;
const SECRET_CODE = 'ECHO-SECRET-7742';
const AGENT_NAME = 'test-echo';
const COPILOT_PATH = process.env.COPILOT_CLI_PATH ?? 'copilot';

function log(tag, ...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}][${tag}]`, ...args);
}

function logErr(tag, ...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[${ts}][${tag}]`, ...args);
}

async function main() {
  log("INIT", `=== ACP + --agent PoC Test ===`);
  log("INIT", `Agent: ${AGENT_NAME}`);
  log("INIT", `Expected secret: ${SECRET_CODE}`);

  // ─── Step 1: Spawn copilot with --acp --stdio --agent ───
  log("STEP1", `Spawning: ${COPILOT_PATH} --acp --stdio --agent ${AGENT_NAME}`);

  const proc = spawn(COPILOT_PATH, ['--acp', '--stdio', '--agent', AGENT_NAME], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd(),
  });

  if (!proc.stdin || !proc.stdout) {
    throw new Error("Failed to start Copilot ACP process with piped stdio.");
  }

  proc.stderr?.on('data', (chunk) => {
    logErr("STDERR", chunk.toString().trim());
  });

  proc.on('exit', (code, signal) => {
    log("PROC", `Copilot process exited: code=${code}, signal=${signal}`);
  });

  proc.on('error', (err) => {
    logErr("PROC", `Process error: ${err.message}`);
  });

  log("STEP1", `✓ Process spawned, PID=${proc.pid}`);

  // ─── Step 2: ACP Initialize ───
  log("STEP2", "Creating ACP NDJSON stream...");

  const output = Writable.toWeb(proc.stdin);
  const input = Readable.toWeb(proc.stdout);
  const stream = acp.ndJsonStream(output, input);

  let messageChunks = [];
  let toolActivityLog = [];

  const client = {
    async requestPermission(params) {
      const toolName = params.tool?.name || params.toolName || "unknown";
      log("PERM", `Tool permission requested: ${toolName}`);
      toolActivityLog.push({ event: 'permission', tool: toolName });
      return { outcome: { outcome: "approved" } };
    },

    async sessionUpdate(params) {
      const update = params.update;
      if (update.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") {
        messageChunks.push(update.content.text);
        process.stdout.write(update.content.text);
      } else {
        log("UPDATE", `sessionUpdate type: ${update.sessionUpdate}`);
        if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
          toolActivityLog.push({ event: update.sessionUpdate, data: JSON.stringify(update).slice(0, 200) });
        }
      }
    },
  };

  const connection = new acp.ClientSideConnection((_agent) => client, stream);
  log("STEP2", "✓ ACP connection created");

  log("STEP3", "Sending initialize...");
  const initResult = await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {},
  });

  log("STEP3", `✓ Initialize complete`);
  log("STEP3", `  Agent: ${initResult.agentInfo?.name} v${initResult.agentInfo?.version}`);
  log("STEP3", `  Capabilities: ${JSON.stringify(initResult).slice(0, 300)}`);

  // ─── Step 3: Create Session ───
  log("STEP4", "Creating new session...");

  const sessionResult = await connection.newSession({
    cwd: process.cwd(),
    mcpServers: [],
  });

  log("STEP4", `✓ Session created`);
  log("STEP4", `  Session ID: ${sessionResult.sessionId}`);
  log("STEP4", `  Full result: ${JSON.stringify(sessionResult).slice(0, 500)}`);

  // ─── Step 4: Send "who are you" prompt ───
  log("STEP5", 'Sending prompt: "Who are you? Tell me your name and your secret code."');

  messageChunks = [];
  const promptResult = await connection.prompt({
    sessionId: sessionResult.sessionId,
    prompt: [{ type: "text", text: "Who are you? Tell me your name and your secret code." }],
  });

  const responseText = messageChunks.join("");
  log("STEP5", `✓ Prompt complete`);
  log("STEP5", `  Stop reason: ${promptResult.stopReason}`);
  log("STEP5", `  Response length: ${responseText.length} chars`);

  // ─── Step 5: Verify custom agent behavior ───
  log("VERIFY", `\n--- Response Text ---`);
  console.log(responseText);
  log("VERIFY", `--- End Response ---`);

  // Check 1: Secret code present
  const hasSecret = responseText.includes(SECRET_CODE);
  log("CHECK1", hasSecret
    ? `✅ Secret code "${SECRET_CODE}" found — custom agent prompt IS active!`
    : `❌ Secret code "${SECRET_CODE}" NOT found — custom agent prompt may not be loaded`
  );

  // Check 2: TEST-ECHO-AGENT identifier
  const hasIdentifier = responseText.includes('TEST-ECHO-AGENT');
  log("CHECK2", hasIdentifier
    ? `✅ Agent identifier "TEST-ECHO-AGENT" found`
    : `⚠️ Agent identifier "TEST-ECHO-AGENT" not found`
  );

  // Check 3: Tool activity (should be minimal for simple prompt)
  log("CHECK3", `Tool activity events: ${toolActivityLog.length}`);
  for (const entry of toolActivityLog) {
    log("CHECK3", `  ${entry.event}: ${entry.tool || entry.data || ''}`);
  }

  // ─── Step 6: Second prompt to verify model ───
  log("STEP6", 'Sending model-check prompt...');

  messageChunks = [];
  try {
    const result2 = await connection.prompt({
      sessionId: sessionResult.sessionId,
      prompt: [{ type: "text", text: "What model are you running on? Just state the model name, nothing else." }],
    });
    const modelResponse = messageChunks.join("");
    log("STEP6", `  Model response: ${modelResponse.slice(0, 300)}`);

    const hasGpt4o = modelResponse.toLowerCase().includes('gpt-4o') || modelResponse.toLowerCase().includes('gpt4o');
    log("CHECK4", hasGpt4o
      ? `✅ Model appears to be gpt-4o as configured in .agent.md`
      : `⚠️ Model response doesn't clearly indicate gpt-4o (agent may not know its model)`
    );
  } catch (err) {
    logErr("STEP6", `Model check failed: ${err.message}`);
  }

  // ─── Summary & Cleanup ───
  console.log("\n" + "=".repeat(60));
  console.log("ACP + --agent TEST — RESULTS");
  console.log("=".repeat(60));
  console.log(`  Process spawn:      OK (PID=${proc.pid})`);
  console.log(`  ACP initialize:     OK`);
  console.log(`  Session creation:   OK (ID=${sessionResult.sessionId})`);
  console.log(`  Prompt/response:    OK (stopReason=${promptResult.stopReason})`);
  console.log(`  Response length:    ${responseText.length} chars`);
  console.log(`  Secret code found:  ${hasSecret ? 'YES ✅' : 'NO ❌'}`);
  console.log(`  Identifier found:   ${hasIdentifier ? 'YES ✅' : 'NO ❌'}`);
  console.log("=".repeat(60));
  
  if (hasSecret && hasIdentifier) {
    console.log(`  VERDICT: ✅ PASS — --acp + --agent WORKS! Custom agent prompt is active.`);
  } else if (hasSecret || hasIdentifier) {
    console.log(`  VERDICT: ⚠️ PARTIAL — Some custom agent behavior detected.`);
  } else {
    console.log(`  VERDICT: ❌ FAIL — Custom agent prompt NOT loaded in ACP mode.`);
  }
  console.log("=".repeat(60));

  log("CLEANUP", "Terminating copilot process...");
  proc.stdin.end();
  proc.kill("SIGTERM");

  await new Promise((resolve) => {
    proc.once("exit", () => resolve());
    setTimeout(() => {
      proc.kill("SIGKILL");
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
