// mcp/common/port-discovery.mjs
// Unified TCP port discovery for MCP server ↔ host daemon (Tauri app or MLRA daemon).
//
// Strategy:
//   1. Read a lock file at tmpdir()/<lockFileName> (host daemon writes its port there)
//   2. If lock file missing or port invalid, scan [portStart, portEnd] range
//   3. Return the first successfully connected Socket, or null
//
// Callers are expected to handle auto-launch of the host process when connect returns null.

import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";

/**
 * @typedef {Object} PortDiscoveryConfig
 * @property {string} lockFileName  Filename under tmpdir() — e.g. "my-last-feedback.port"
 * @property {number} portStart     Inclusive lower bound of scan range
 * @property {number} portEnd       Inclusive upper bound of scan range
 * @property {number} [connectTimeoutMs=2000]  Per-attempt connect timeout
 */

/**
 * @param {PortDiscoveryConfig} cfg
 * @returns {string} Absolute lock file path.
 */
export function lockFilePath(cfg) {
  return join(tmpdir(), cfg.lockFileName);
}

/**
 * @param {PortDiscoveryConfig} cfg
 * @returns {number|null}
 */
export function readPortFromLockFile(cfg) {
  try {
    const content = readFileSync(lockFilePath(cfg), "utf-8").trim();
    const port = parseInt(content, 10);
    if (port >= cfg.portStart && port <= cfg.portEnd) return port;
  } catch {}
  return null;
}

/**
 * Try to connect to a single TCP port on 127.0.0.1.
 * @param {number} port
 * @param {number} [timeoutMs=2000]
 * @returns {Promise<import("node:net").Socket|null>}
 */
export function tryConnect(port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port }, () => {
      socket.setTimeout(0);
      resolve(socket);
    });
    socket.on("error", () => resolve(null));
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(null);
    });
  });
}

/**
 * Attempt to discover a running host: lock file first, then port scan.
 * @param {PortDiscoveryConfig} cfg
 * @returns {Promise<import("node:net").Socket|null>}
 */
export async function discoverAndConnect(cfg) {
  const timeout = cfg.connectTimeoutMs ?? 2000;

  const lockPort = readPortFromLockFile(cfg);
  if (lockPort !== null) {
    const sock = await tryConnect(lockPort, timeout);
    if (sock) return sock;
  }

  for (let p = cfg.portStart; p <= cfg.portEnd; p++) {
    const sock = await tryConnect(p, timeout);
    if (sock) return sock;
  }
  return null;
}
