// mcp/mlra/daemon-client.mjs
// Thin TCP client shared by the 3 MLRA MCP servers. Handles:
//   - Discovery of the daemon (lock file + port scan)
//   - Auto-launch of the daemon when absent
//   - ROLE_HELLO handshake
//   - Request/response correlation on a single persistent socket
//
// v2 simplification: no alias, no callerId — the role is declared at spawn time.

import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverAndConnect } from "../common/port-discovery.mjs";
import { launchAndWaitReady } from "../common/child-launcher.mjs";
import { MSG } from "./protocol/messages.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const IS_DEV = process.env.MLRA_DEV === "1";

export const DAEMON_PORT_CONFIG = Object.freeze({
  lockFileName: IS_DEV ? "my-long-running-agent-dev.port" : "my-long-running-agent.port",
  portStart: IS_DEV ? 19881 : 19871,
  portEnd: IS_DEV ? 19890 : 19880,
});

/** Path to the v2 daemon entrypoint (Phase 4 will populate it). */
const DAEMON_PATH = join(__dirname, "daemon", "index.mjs");

/**
 * Connect to a running daemon; if none is reachable, launch one and wait.
 * @returns {Promise<import("node:net").Socket>}
 */
export async function connectOrLaunchDaemon() {
  let socket = await discoverAndConnect(DAEMON_PORT_CONFIG);
  if (socket) return socket;

  console.error("[MLRA-MCP] Launching daemon...");
  socket = await launchAndWaitReady({
    command: "node",
    args: [DAEMON_PATH],
    env: { ...process.env, MLRA_DEV: IS_DEV ? "1" : "0" },
    readyCheck: () => discoverAndConnect(DAEMON_PORT_CONFIG),
    maxAttempts: 20,
    intervalMs: 500,
  });
  if (!socket) throw new Error("Could not start or connect to the MLRA daemon");
  return socket;
}

/**
 * Correlation-id generator (local to each MCP server process).
 * The daemon echoes `reqId` on the matching RESOLVE/ERROR response.
 */
let _reqIdSeq = 0;
export function nextReqId(prefix = "req") {
  _reqIdSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_reqIdSeq}`;
}

/**
 * DaemonClient — single-connection wrapper. Instance lifetime = MCP server lifetime.
 *
 * Usage:
 *   const client = new DaemonClient({ role: "expert" });
 *   await client.connect({ workspace, model, clientName });
 *   const resp = await client.request({ type: MSG.EXPERT_SUBMIT, ... });
 */
export class DaemonClient {
  /** @param {{ role: "ceo"|"expert"|"inspector" }} opts */
  constructor(opts) {
    this.role = opts.role;
    /** @type {import("node:net").Socket|null} */
    this.socket = null;
    /** @type {Map<string, { resolve: Function, reject: Function }>} */
    this.pending = new Map();
    /** @type {Set<(msg: object) => void>} */
    this.listeners = new Set();
    this._rl = null;
    this._closed = false;
  }

  /**
   * Establish TCP connection and send ROLE_HELLO.
   * @param {{ workspace?: string, model?: string, clientName?: string }} ctx
   * @returns {Promise<object>} The daemon's ROLE_HELLO acknowledgement.
   */
  async connect(ctx) {
    this.socket = await connectOrLaunchDaemon();
    this._rl = createInterface({ input: this.socket });
    this._rl.on("line", (line) => this._onLine(line));
    this._rl.on("close", () => this._onClose());
    this.socket.on("error", (err) => this._onClose(err));

    return this.request({
      type: MSG.ROLE_HELLO,
      role: this.role,
      workspace: ctx.workspace ?? null,
      model: ctx.model ?? null,
      clientName: ctx.clientName ?? null,
    });
  }

  /**
   * Send a request and await the correlated daemon response.
   * Automatically attaches `reqId` if the caller didn't supply one.
   * @param {object} msg
   * @returns {Promise<object>}
   */
  request(msg) {
    if (!this.socket || this._closed) {
      return Promise.reject(new Error("Daemon connection is not active"));
    }
    const reqId = msg.reqId ?? nextReqId(this.role);
    const payload = { ...msg, reqId };
    return new Promise((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject });
      this.socket.write(JSON.stringify(payload) + "\n");
    });
  }

  /** Register a listener for unsolicited daemon push events. */
  onEvent(handler) {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  /** Gracefully disconnect. */
  close() {
    if (this._closed) return;
    try { this.socket?.write(JSON.stringify({ type: MSG.ROLE_BYE, role: this.role }) + "\n"); } catch {}
    try { this.socket?.end(); } catch {}
    this._onClose();
  }

  _onLine(line) {
    let msg;
    try { msg = JSON.parse(line.trim()); } catch { return; }

    if (msg.reqId && this.pending.has(msg.reqId)) {
      const { resolve, reject } = this.pending.get(msg.reqId);
      this.pending.delete(msg.reqId);
      if (msg.type === MSG.ERROR) {
        reject(new Error(msg.message || "Daemon error"));
      } else {
        resolve(msg);
      }
      return;
    }

    // Unsolicited push event — fan out to listeners.
    for (const handler of this.listeners) {
      try { handler(msg); } catch (e) { console.error("[MLRA-MCP] listener error:", e); }
    }
  }

  _onClose(err) {
    if (this._closed) return;
    this._closed = true;
    for (const { reject } of this.pending.values()) {
      reject(new Error(err ? `Daemon connection closed: ${err.message}` : "Daemon connection closed"));
    }
    this.pending.clear();
  }
}
