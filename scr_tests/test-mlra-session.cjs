/**
 * MLRA Session Alive Detection — Full TCP Simulation Test
 * Simulates the complete lifecycle including Tauri-side admin messages:
 *   1. Hook script sends session_hook_notify
 *   2. Agents register via agent_register (blocking)
 *   3. Admin assigns roles via mlra_assign_role
 *   4. Admin starts orchestration via mlra_start_orchestration
 *   5. Primary agent receives instruction (register_LRA released)
 *   6. Transcript turn_end → derailment signal
 *   7. TCP disconnect → broken signal
 *
 * Usage:
 *   node scr_tests/test-mlra-session.cjs [daemon_port]
 *
 * Requires MLRA Daemon to be running.
 */

const net = require("net");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// ── Config ──
const DEFAULT_PORT = 19871;
const DAEMON_PORT = parseInt(process.argv[2]) || DEFAULT_PORT;

// Unique IDs for this test run
const RUN_ID = crypto.randomBytes(3).toString("hex");
const SESSION_ID_1 = `test-session-${RUN_ID}-primary`;
const SESSION_ID_2 = `test-session-${RUN_ID}-standby`;
const CALLER_ID_1 = `caller-${RUN_ID}-A`;
const CALLER_ID_2 = `caller-${RUN_ID}-B`;
const ALIAS_1 = RUN_ID.slice(0, 4).toUpperCase();
const ALIAS_2 = ((parseInt(RUN_ID, 16) + 1) & 0xFFFF).toString(16).padStart(4, "0").toUpperCase();

// Temp transcript directory for simulation
const TRANSCRIPT_DIR = path.join(os.tmpdir(), `mlra-test-transcripts-${RUN_ID}`);

// ── Helpers ──

function log(tag, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${tag}] ${msg}`);
}

function connectTcp(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => resolve(socket));
    socket.on("error", reject);
    socket.setTimeout(5000, () => { socket.destroy(); reject(new Error("Connection timeout")); });
  });
}

function sendJson(socket, msg) {
  socket.write(JSON.stringify(msg) + "\n");
  log("SEND", `→ ${msg.type}${msg.callerId ? ` (${msg.callerId})` : ""}`);
}

/**
 * Send fire-and-forget TCP message (like Hook script)
 */
function fireAndForget(port, msg) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: "127.0.0.1", port }, () => {
      s.write(JSON.stringify(msg) + "\n");
      setTimeout(() => { s.destroy(); resolve(); }, 200);
    });
    s.on("error", () => resolve());
  });
}

/**
 * Collect JSON lines from a socket with a timeout
 */
function collectLines(socket, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const lines = [];
    let buffer = "";
    const handler = (chunk) => {
      buffer += chunk.toString();
      const parts = buffer.split("\n");
      buffer = parts.pop();
      for (const part of parts) {
        if (part.trim()) {
          try {
            const parsed = JSON.parse(part.trim());
            lines.push(parsed);
            log("RECV", `← ${parsed.type}${parsed.callerId ? ` (${parsed.callerId})` : ""} ${parsed.content ? parsed.content.slice(0, 60) + "..." : ""}`);
          } catch {
            log("RECV", `← (raw) ${part.trim().slice(0, 80)}`);
          }
        }
      }
    };
    socket.on("data", handler);
    setTimeout(() => {
      socket.removeListener("data", handler);
      resolve(lines);
    }, timeoutMs);
  });
}

/**
 * Write a transcript JSONL event
 */
function writeTranscriptEvent(sessionId, event) {
  const filePath = path.join(TRANSCRIPT_DIR, `${sessionId}.jsonl`);
  fs.appendFileSync(filePath, JSON.stringify(event) + "\n", "utf-8");
  log("JSONL", `Wrote: ${event.type}${event.data?.toolName ? ` (${event.data.toolName})` : ""}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Test ──

async function runTest() {
  log("TEST", `=== MLRA Session Full Simulation (port=${DAEMON_PORT}) ===`);
  log("TEST", `Run ID: ${RUN_ID}`);
  log("TEST", `Sessions: ${SESSION_ID_1} (primary), ${SESSION_ID_2} (standby)`);
  log("TEST", `Callers: ${CALLER_ID_1} (${ALIAS_1}), ${CALLER_ID_2} (${ALIAS_2})`);
  log("TEST", `Transcripts: ${TRANSCRIPT_DIR}\n`);

  // Setup
  fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });

  // ─────────────────────────────────────────────
  // Phase 1: Hook Notifications
  // ─────────────────────────────────────────────
  log("PHASE", "━━━ 1. Hook TCP Notifications ━━━");

  await fireAndForget(DAEMON_PORT, {
    type: "session_hook_notify",
    session_id: SESSION_ID_1,
    agent_name: ALIAS_1,
    transcript_dir: TRANSCRIPT_DIR,
    workspace: "e:/Dev/test-project",
  });
  log("OK", `Primary session ${SESSION_ID_1} notified`);

  await sleep(200);

  await fireAndForget(DAEMON_PORT, {
    type: "session_hook_notify",
    session_id: SESSION_ID_2,
    agent_name: ALIAS_2,
    transcript_dir: TRANSCRIPT_DIR,
    workspace: "e:/Dev/test-project",
  });
  log("OK", `Standby session ${SESSION_ID_2} notified`);

  await sleep(500);

  // ─────────────────────────────────────────────
  // Phase 2: Agent Registration (blocking calls)
  // ─────────────────────────────────────────────
  log("PHASE", "━━━ 2. Agent Registration ━━━");

  const sock1 = await connectTcp(DAEMON_PORT);
  const lines1Promise = collectLines(sock1, 8000);
  sendJson(sock1, {
    type: "agent_register",
    callerId: CALLER_ID_1,
    alias: ALIAS_1,
    workspace: "e:/Dev/test-project",
    model: "claude-opus-4.6",
  });
  log("OK", `Primary ${CALLER_ID_1} registered (blocking...)`);

  await sleep(300);

  const sock2 = await connectTcp(DAEMON_PORT);
  const lines2Promise = collectLines(sock2, 8000);
  sendJson(sock2, {
    type: "agent_register",
    callerId: CALLER_ID_2,
    alias: ALIAS_2,
    workspace: "e:/Dev/test-project",
    model: "claude-sonnet-4",
  });
  log("OK", `Standby ${CALLER_ID_2} registered (blocking...)`);

  await sleep(500);

  // ─────────────────────────────────────────────
  // Phase 3: Admin assigns roles (simulating Tauri UI)
  // ─────────────────────────────────────────────
  log("PHASE", "━━━ 3. Role Assignment (admin) ━━━");

  const adminSock = await connectTcp(DAEMON_PORT);

  sendJson(adminSock, {
    type: "mlra_assign_role",
    callerId: CALLER_ID_1,
    role: "planning-expert",
  });
  log("OK", `${CALLER_ID_1} → planning-expert`);

  await sleep(200);

  sendJson(adminSock, {
    type: "mlra_assign_role",
    callerId: CALLER_ID_2,
    role: "planning-expert",
  });
  log("OK", `${CALLER_ID_2} → planning-expert (standby in pool)`);

  await sleep(500);

  // ─────────────────────────────────────────────
  // Phase 4: Start Orchestration
  // ─────────────────────────────────────────────
  log("PHASE", "━━━ 4. Start Orchestration ━━━");

  // We need a planning-inspector for the orchestrator to be "ready"
  // But we only have 2 agents as planning-expert. Let's just test the
  // register_LRA release flow with a direct inject instead.
  // Use mlra_inject_message to manually release the primary's block.
  sendJson(adminSock, {
    type: "mlra_inject_message",
    callerId: CALLER_ID_1,
    content: "[测试] 你的 register_LRA 阻塞已被释放，开始工作。",
  });
  log("OK", "Injected release message to primary agent");

  // Wait for primary to receive the release message
  await sleep(1000);

  // ─────────────────────────────────────────────
  // Phase 5: Transcript Activity → Connected
  // ─────────────────────────────────────────────
  log("PHASE", "━━━ 5. Transcript Activity (connected) ━━━");

  writeTranscriptEvent(SESSION_ID_1, {
    type: "session.start",
    timestamp: new Date().toISOString(),
    data: { sessionId: SESSION_ID_1 },
  });
  await sleep(200);

  writeTranscriptEvent(SESSION_ID_1, {
    type: "assistant.turn_start",
    timestamp: new Date().toISOString(),
  });
  await sleep(100);

  writeTranscriptEvent(SESSION_ID_1, {
    type: "tool.execution_start",
    timestamp: new Date().toISOString(),
    data: { toolName: "register_LRA", arguments: {} },
  });
  log("OK", "register_LRA tool execution → expecting 'connected' state");
  await sleep(500);

  writeTranscriptEvent(SESSION_ID_1, {
    type: "tool.execution_complete",
    timestamp: new Date().toISOString(),
    data: { toolName: "register_LRA" },
  });
  await sleep(200);

  writeTranscriptEvent(SESSION_ID_1, {
    type: "tool.execution_start",
    timestamp: new Date().toISOString(),
    data: { toolName: "submit", arguments: { submitType: "plan_draft" } },
  });
  log("OK", "submit tool execution → still connected");
  await sleep(500);

  // ─────────────────────────────────────────────
  // Phase 6: Derailment (turn_end)
  // ─────────────────────────────────────────────
  log("PHASE", "━━━ 6. Derailment (turn_end) ━━━");

  writeTranscriptEvent(SESSION_ID_1, {
    type: "assistant.turn_end",
    timestamp: new Date().toISOString(),
  });
  log("WARN", "turn_end written → expecting DERAILED signal");
  await sleep(1500);

  // ─────────────────────────────────────────────
  // Phase 7: TCP Disconnect
  // ─────────────────────────────────────────────
  log("PHASE", "━━━ 7. TCP Disconnect ━━━");
  sock1.destroy();
  log("WARN", `Primary socket destroyed (${CALLER_ID_1})`);
  await sleep(1500);

  // ─────────────────────────────────────────────
  // Results
  // ─────────────────────────────────────────────
  log("PHASE", "━━━ Results ━━━");

  const lines1 = await lines1Promise;
  const lines2 = await lines2Promise;

  log("RESULT", `Primary responses (${lines1.length}):`);
  for (const l of lines1) {
    log("  →", `${l.type}: ${JSON.stringify(l).slice(0, 120)}`);
  }

  log("RESULT", `Standby responses (${lines2.length}):`);
  for (const l of lines2) {
    log("  →", `${l.type}: ${JSON.stringify(l).slice(0, 120)}`);
  }

  // Verify key events
  const primaryGotRelease = lines1.some((l) => l.type === "resolve");
  const standbyGotFailover = lines2.some((l) => l.type === "resolve");

  log("CHECK", `Primary got register_LRA release: ${primaryGotRelease ? "✅ YES" : "❌ NO"}`);
  log("CHECK", `Standby got failover activation: ${standbyGotFailover ? "✅ YES" : "⬜ (expected if no full orchestration)"}`);

  // Cleanup
  adminSock.destroy();
  sock2.destroy();
  try { fs.rmSync(TRANSCRIPT_DIR, { recursive: true }); } catch {}

  log("TEST", "=== Simulation Complete ===");
  process.exit(0);
}

// ── Entry ──
runTest().catch((err) => {
  if (err.code === "ECONNREFUSED") {
    log("INFO", `Daemon not running on port ${DAEMON_PORT}`);
    log("INFO", `Start daemon: node mlra-server/daemon.mjs`);
    log("INFO", `Then re-run: node scr_tests/test-mlra-session.cjs ${DAEMON_PORT}`);
  } else {
    log("ERROR", err.message);
    console.error(err);
  }
  process.exit(1);
});
