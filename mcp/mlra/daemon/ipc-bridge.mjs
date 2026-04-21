// ── MLRA IPC Bridge ──
// Connects Orchestrator Daemon to the MLFB Tauri Desktop App.
// Uses the same TCP JSON-line protocol, with mlra_ prefixed message types.

import { createConnection } from "node:net";
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// MLFB Tauri App port range
const MLFB_PORT_START = 19850;
const MLFB_PORT_END = 19860;
const MLFB_DEV_PORT_START = 19861;
const MLFB_DEV_PORT_END = 19870;

export class IpcBridge {
  constructor({ isDev = false } = {}) {
    this.isDev = isDev;
    this.socket = null;
    this.rl = null;
    this.connected = false;
    /** @type {((msg: object) => void)|null} */
    this.onMessage = null;
    this._reconnectTimer = null;
  }

  _lockFilePath() {
    return join(
      tmpdir(),
      this.isDev ? "my-last-feedback-dev.port" : "my-last-feedback.port"
    );
  }

  _readPortFromLockFile() {
    try {
      const content = readFileSync(this._lockFilePath(), "utf-8").trim();
      const port = parseInt(content, 10);
      const start = this.isDev ? MLFB_DEV_PORT_START : MLFB_PORT_START;
      const end = this.isDev ? MLFB_DEV_PORT_END : MLFB_PORT_END;
      if (port >= start && port <= end) return port;
    } catch {}
    return null;
  }

  _tryConnect(port) {
    return new Promise((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port }, () => {
        socket.setTimeout(0);
        resolve(socket);
      });
      socket.on("error", () => resolve(null));
      socket.setTimeout(3000, () => {
        socket.destroy();
        resolve(null);
      });
    });
  }

  async connect() {
    // Try lock file port first
    const lockPort = this._readPortFromLockFile();
    if (lockPort) {
      const socket = await this._tryConnect(lockPort);
      if (socket) {
        this._setupSocket(socket);
        return true;
      }
    }

    // Scan port range
    const start = this.isDev ? MLFB_DEV_PORT_START : MLFB_PORT_START;
    const end = this.isDev ? MLFB_DEV_PORT_END : MLFB_PORT_END;
    for (let p = start; p <= end; p++) {
      const socket = await this._tryConnect(p);
      if (socket) {
        this._setupSocket(socket);
        return true;
      }
    }

    console.error("[MLRA-IPC] Could not connect to MLFB Tauri App");
    return false;
  }

  _setupSocket(socket) {
    this.socket = socket;
    this.connected = true;
    this.rl = createInterface({ input: socket });

    this.rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line.trim());
        if (this.onMessage) this.onMessage(msg);
      } catch (e) {
        console.error("[MLRA-IPC] Invalid JSON from Tauri:", e.message);
      }
    });

    socket.on("close", () => {
      console.error("[MLRA-IPC] Connection to Tauri closed");
      this.connected = false;
      this.socket = null;
    });

    socket.on("error", (err) => {
      console.error("[MLRA-IPC] Socket error:", err.message);
    });

    console.error("[MLRA-IPC] Connected to MLFB Tauri App");
  }

  /**
   * Send a message to the Tauri app.
   * @param {object} msg
   */
  send(msg) {
    if (!this.socket || !this.connected) {
      console.error("[MLRA-IPC] Not connected, cannot send:", msg.type);
      return false;
    }
    this.socket.write(JSON.stringify(msg) + "\n");
    return true;
  }

  /**
   * Disconnect from the Tauri app.
   */
  disconnect() {
    if (this.rl) this.rl.close();
    if (this.socket) this.socket.destroy();
    this.connected = false;
    this.socket = null;
  }
}
