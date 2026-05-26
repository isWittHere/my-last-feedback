// mcp/common/child-launcher.mjs
// Detached child-process launcher for host daemons (Tauri app binary, MLRA daemon.mjs).
//
// Usage:
//   await launchAndWaitReady({
//     command: "node",
//     args: [daemonPath],
//     env: { ...process.env, MLRA_DEV: "1" },
//     readyCheck: () => discoverAndConnect(cfg),
//     maxAttempts: 20,
//     intervalMs: 500,
//   })
//
// Launches the child in detached+unref mode so it survives MCP server exit,
// then polls `readyCheck` until it returns a truthy value (typically a Socket).

import { execFile } from "node:child_process";

/**
 * Fire-and-forget detached spawn. Returns the ChildProcess (already unref'd).
 * @param {Object} opts
 * @param {string} opts.command
 * @param {string[]} [opts.args]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {boolean} [opts.windowsHide=false]
 * @returns {import("node:child_process").ChildProcess}
 */
export function launchDetached({ command, args = [], env, windowsHide = false }) {
  const child = execFile(command, args, {
    stdio: "ignore",
    detached: true,
    env: env ?? process.env,
    windowsHide,
  });
  child.unref();
  return child;
}

/**
 * Polling helper: run `check` until it returns truthy or attempts exhausted.
 * @template T
 * @param {() => Promise<T|null|undefined>} check
 * @param {{ maxAttempts?: number, intervalMs?: number }} [opts]
 * @returns {Promise<T|null>}
 */
export async function waitUntilReady(check, { maxAttempts = 20, intervalMs = 500 } = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await check();
    if (result) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

/**
 * Launch a detached host and wait for it to become ready.
 * @template T
 * @param {Object} opts
 * @param {string} opts.command
 * @param {string[]} [opts.args]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {boolean} [opts.windowsHide]
 * @param {() => Promise<T|null|undefined>} opts.readyCheck
 * @param {number} [opts.maxAttempts=30]
 * @param {number} [opts.intervalMs=500]
 * @returns {Promise<T|null>}
 */
export async function launchAndWaitReady(opts) {
  launchDetached(opts);
  return waitUntilReady(opts.readyCheck, {
    maxAttempts: opts.maxAttempts ?? 30,
    intervalMs: opts.intervalMs ?? 500,
  });
}
