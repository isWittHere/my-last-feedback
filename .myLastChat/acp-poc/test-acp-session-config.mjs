/**
 * test-acp-session-config.mjs — PoC: Per-session model + mode switching
 * 
 * Tests:
 * 1. What modes does Copilot CLI expose? (plan? agent? custom agents?)
 * 2. Can we set different models per session?
 * 3. Can we set different modes per session?
 * 4. What configOptions are available?
 */
import * as acp from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";

const TIMEOUT_MS = 120_000;
const COPILOT_PATH = process.env.COPILOT_CLI_PATH ?? "copilot";

function log(tag, ...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}][${tag}]`, ...args);
}

function logErr(tag, ...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[${ts}][${tag}]`, ...args);
}

async function main() {
  log("INIT", "=== ACP Session Config PoC ===");

  // Spawn copilot
  const proc = spawn(COPILOT_PATH, ["--acp", "--stdio", "--no-custom-instructions"], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  proc.stderr?.on("data", (chunk) => {
    logErr("STDERR", chunk.toString().trim());
  });

  proc.on("exit", (code, signal) => {
    log("PROC", `Exit: code=${code}, signal=${signal}`);
  });

  log("STEP1", `Process spawned, PID=${proc.pid}`);

  // ACP setup
  const output = Writable.toWeb(proc.stdin);
  const input = Readable.toWeb(proc.stdout);
  const stream = acp.ndJsonStream(output, input);

  let messageChunks = [];

  const client = {
    async requestPermission(params) {
      return { outcome: { outcome: "approved" } };
    },
    async sessionUpdate(params) {
      const update = params.update;
      if (update.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") {
        messageChunks.push(update.content.text);
      }
    },
  };

  const connection = new acp.ClientSideConnection((_agent) => client, stream);

  // Initialize
  const initResult = await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {},
  });
  log("INIT", `✓ Agent: ${initResult.agentInfo?.name} v${initResult.agentInfo?.version}`);

  // ─── Session 1: Create and inspect ───
  log("STEP2", "Creating Session A...");
  const sessionA = await connection.newSession({
    cwd: process.cwd(),
    mcpServers: [],
  });
  
  log("SESSION_A", `ID: ${sessionA.sessionId}`);
  
  // Inspect models
  if (sessionA.models) {
    log("MODELS", `Current model: ${sessionA.models.currentModelId}`);
    log("MODELS", `Available models (${sessionA.models.availableModels.length}):`);
    for (const m of sessionA.models.availableModels) {
      log("MODELS", `  - ${m.modelId} (${m.name}) ${JSON.stringify(m._meta || {})}`);
    }
  } else {
    log("MODELS", "No models in response");
  }

  // Inspect modes
  if (sessionA.modes) {
    log("MODES", `Current mode: ${sessionA.modes.currentModeId}`);
    log("MODES", `Available modes (${sessionA.modes.availableModes.length}):`);
    for (const mode of sessionA.modes.availableModes) {
      log("MODES", `  - id="${mode.id}" name="${mode.name}" desc="${mode.description || 'n/a'}"`);
    }
  } else {
    log("MODES", "No modes in response");
  }

  // Inspect configOptions
  if (sessionA.configOptions) {
    log("CONFIG", `Config options (${sessionA.configOptions.length}):`);
    for (const opt of sessionA.configOptions) {
      log("CONFIG", `  - ${JSON.stringify(opt)}`);
    }
  } else {
    log("CONFIG", "No configOptions in response");
  }

  // Log full response keys and structure
  log("FULL", `Session A response keys: ${Object.keys(sessionA).join(', ')}`);
  log("FULL", `Full (truncated): ${JSON.stringify(sessionA).slice(0, 2000)}`);

  // ─── Test: Set model per session ───
  log("STEP3", "Testing setSessionModel (unstable)...");
  
  try {
    const modelResult = await connection.unstable_setSessionModel({
      sessionId: sessionA.sessionId,
      modelId: "gpt-4o",
    });
    log("SET_MODEL", `✅ setSessionModel to gpt-4o succeeded!`);
    log("SET_MODEL", `Result: ${JSON.stringify(modelResult)}`);
  } catch (err) {
    logErr("SET_MODEL", `❌ setSessionModel failed: ${err.message}`);
  }

  // ─── Test: Set mode per session ───
  log("STEP4", "Testing setSessionMode...");
  
  // First, try to set a known mode if available
  if (sessionA.modes?.availableModes?.length > 0) {
    const targetMode = sessionA.modes.availableModes.find(m => m.id !== sessionA.modes.currentModeId);
    if (targetMode) {
      try {
        const modeResult = await connection.setSessionMode({
          sessionId: sessionA.sessionId,
          modeId: targetMode.id,
        });
        log("SET_MODE", `✅ setSessionMode to "${targetMode.id}" succeeded!`);
        log("SET_MODE", `Result: ${JSON.stringify(modeResult)}`);
      } catch (err) {
        logErr("SET_MODE", `❌ setSessionMode to "${targetMode.id}" failed: ${err.message}`);
      }
    } else {
      log("SET_MODE", "Only one mode available, can't test switching");
    }
  } else {
    log("SET_MODE", "No modes available");
  }

  // ─── Session 2: Create with different model ───
  log("STEP5", "Creating Session B and switching model...");
  
  const sessionB = await connection.newSession({
    cwd: process.cwd(),
    mcpServers: [],
  });
  log("SESSION_B", `ID: ${sessionB.sessionId}`);
  log("SESSION_B", `Default model: ${sessionB.models?.currentModelId}`);

  try {
    await connection.unstable_setSessionModel({
      sessionId: sessionB.sessionId,
      modelId: "claude-opus-4",
    });
    log("SESSION_B", `✅ Model switched to claude-opus-4`);
  } catch (err) {
    logErr("SESSION_B", `❌ Model switch failed: ${err.message}`);
  }

  // ─── Verify: Prompt both sessions ───
  log("STEP6", "Verifying both sessions respond correctly...");

  // Session A (gpt-4o)
  messageChunks = [];
  try {
    await connection.prompt({
      sessionId: sessionA.sessionId,
      prompt: [{ type: "text", text: "What model are you? Reply with only the model name, nothing else." }],
    });
    log("VERIFY_A", `Session A model response: ${messageChunks.join("").slice(0, 200)}`);
  } catch (err) {
    logErr("VERIFY_A", `Failed: ${err.message}`);
  }

  // Session B (claude-opus-4)
  messageChunks = [];
  try {
    await connection.prompt({
      sessionId: sessionB.sessionId,
      prompt: [{ type: "text", text: "What model are you? Reply with only the model name, nothing else." }],
    });
    log("VERIFY_B", `Session B model response: ${messageChunks.join("").slice(0, 200)}`);
  } catch (err) {
    logErr("VERIFY_B", `Failed: ${err.message}`);
  }

  // ─── Cleanup ───
  console.log("\n" + "=".repeat(60));
  console.log("ACP SESSION CONFIG TEST — RESULTS");
  console.log("=".repeat(60));

  proc.stdin.end();
  proc.kill("SIGTERM");
  await new Promise((resolve) => {
    proc.once("exit", () => resolve());
    setTimeout(() => { proc.kill("SIGKILL"); resolve(); }, 3000);
  });

  log("DONE", "✓ Complete");
}

const timeout = setTimeout(() => {
  logErr("TIMEOUT", `Timed out after ${TIMEOUT_MS}ms`);
  process.exit(1);
}, TIMEOUT_MS);

main()
  .then(() => { clearTimeout(timeout); process.exit(0); })
  .catch((err) => { clearTimeout(timeout); logErr("FATAL", err.message); logErr("FATAL", err.stack); process.exit(1); });
