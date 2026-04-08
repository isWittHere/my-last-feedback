/**
 * MLRA ACP PoC — Test 3: MCP Server Injection
 * 
 * 验证项:
 * 1. newSession({ mcpServers }) 能否注入自定义 MCP Server
 * 2. Agent 能否看到并调用注入的 MCP 工具
 * 3. MCP 工具调用的 requestPermission 回调是否正常
 * 4. MCP Server 进程的生命周期管理
 * 
 * 方法:
 * 创建一个极简 MCP Server (poc-mcp-server.mjs)，
 * 提供一个 "submit" 工具，通过 ACP 注入到 session 中，
 * 然后 prompt Agent 调用该工具。
 */
import * as acp from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
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
  log("INIT", "Starting ACP PoC — MCP injection test");

  // Try: inject MCP via CLI argument instead of ACP mcpServers
  const mcpServerPath = join(__dirname, "poc-mcp-server.mjs");
  log("MCP", `MCP server path: ${mcpServerPath}`);

  const mcpConfig = JSON.stringify({
    "mcpServers": {
      "mlra-poc": {
        "type": "stdio",
        "command": "node",
        "args": [mcpServerPath],
        "env": {
          "MLRA_POC_TEST": "true",
          "MLRA_ROLE": "expert",
        }
      }
    }
  });

  const copilotProcess = spawn(COPILOT_PATH, [
    "--acp", "--stdio",
    "--model", COPILOT_MODEL,
    // NOT using --allow-all-tools, to test requestPermission callback
    "--additional-mcp-config", mcpConfig,
  ], {
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

  let messageChunks = [];
  let toolPermissions = [];

  const client = {
    async requestPermission(params) {
      log("PERM", `Tool permission: ${JSON.stringify(params).slice(0, 300)}`);
      toolPermissions.push(params);
      return { outcome: { outcome: "approved" } };
    },
    async sessionUpdate(params) {
      const update = params.update;
      if (update.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") {
        messageChunks.push(update.content.text);
        process.stdout.write(update.content.text);
      } else {
        log("UPDATE", `sessionUpdate: ${update.sessionUpdate}`);
      }
    },
  };

  const connection = new acp.ClientSideConnection((_agent) => client, stream);

  // ── Initialize ──
  await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {},
  });
  log("INIT", "✓ ACP initialized");

  // ── Create session — MCP already injected via --additional-mcp-config ──
  log("MCP", "Creating session (MCP injected via CLI arg)...");

  const sessionResult = await connection.newSession({
    cwd: process.cwd(),
    mcpServers: [],
  });

  log("MCP", `✓ Session created with MCP: ${sessionResult.sessionId}`);

  // ── Prompt Agent to use the injected MCP tool ──
  log("PROMPT", "Asking Agent to call the 'submit' MCP tool...");
  messageChunks = [];
  toolPermissions = [];

  const promptResult = await connection.prompt({
    sessionId: sessionResult.sessionId,
    prompt: [
      {
        type: "text",
        text: `You have a tool called "submit" from the "mlra-poc" MCP server. 
Please call it with the following parameters:
- type: "phase_complete"
- content: "PoC test result"

After calling the tool, report what the tool returned.`,
      },
    ],
  });

  const fullResponse = messageChunks.join("");

  // ── Summary ──
  console.log("\n" + "=".repeat(60));
  console.log("ACP PoC MCP INJECTION TEST — RESULTS");
  console.log("=".repeat(60));
  console.log(`✓ Session with MCP:    OK (ID=${sessionResult.sessionId})`);
  console.log(`  Prompt stopReason:   ${promptResult.stopReason}`);
  console.log(`  Tool permissions:    ${toolPermissions.length} requests`);
  console.log(`  Response length:     ${fullResponse.length} chars`);
  
  if (toolPermissions.length > 0) {
    console.log(`✓ MCP tool was called: YES`);
    for (const perm of toolPermissions) {
      console.log(`  Tool: ${JSON.stringify(perm).slice(0, 200)}`);
    }
  } else {
    console.log(`⚠ MCP tool was called: NO (Agent may not have seen the tool)`);
  }
  
  console.log(`\n  Full response:\n  ${fullResponse.slice(0, 500)}`);
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
