// mcp/mlfb/app-ipc.mjs
// IPC bridge between this MCP server and the Tauri desktop app.
// - Ensures the app is running (auto-launches if necessary).
// - Sends feedback requests and awaits responses.
// - Tracks active sessions so we can cancel-on-disconnect.

import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { discoverAndConnect } from "../common/port-discovery.mjs";
import { launchAndWaitReady } from "../common/child-launcher.mjs";
import { PORT_CONFIG, findAppBinary } from "./paths.mjs";

/** @type {Map<string, { socket: import("node:net").Socket }>} */
export const activeSessions = new Map();

const REQUEST_TYPE_VALUES = new Set([
  "analysis",
  "completion",
  "planning",
  "document",
  "default",
]);

function normalizeRequestType(requestType) {
  if (typeof requestType === "string" && REQUEST_TYPE_VALUES.has(requestType)) return requestType;
  return "default";
}

/** Attempt to connect to an already-running app. */
export function connectToApp() {
  return discoverAndConnect(PORT_CONFIG);
}

/**
 * Ensure the Tauri app is running and return a connected socket.
 * Launches the app binary detached if no existing instance is reachable.
 */
export async function ensureAppRunning() {
  const existing = await connectToApp();
  if (existing) return existing;

  const appPath = findAppBinary();
  const socket = await launchAndWaitReady({
    command: appPath,
    args: [],
    windowsHide: false,
    readyCheck: connectToApp,
    maxAttempts: 30,
    intervalMs: 500,
  });

  if (!socket) {
    throw new Error("Timed out waiting for the Tauri app to start");
  }
  return socket;
}

/**
 * Send a cancel message for a given session id. Best-effort, never throws.
 * @param {string} sessionId
 */
export async function sendCancelForSession(sessionId) {
  try {
    const socket = await connectToApp();
    if (!socket) return;
    const msg = JSON.stringify({ type: "session_cancel", session_id: sessionId });
    socket.write(msg + "\n");
    socket.end();
    console.error("[MLFB] Sent cancel for session:", sessionId);
  } catch (e) {
    console.error("[MLFB] Failed to send cancel:", e.message);
  }
}

/** Cancel every active session (invoked on client disconnect). */
export async function cancelAllActiveSessions() {
  const ids = [...activeSessions.keys()];
  activeSessions.clear();
  for (const id of ids) {
    await sendCancelForSession(id);
  }
}

/**
 * Send a feedback_request over an open socket and await the matching response.
 *
 * @param {import("node:net").Socket} socket
 * @param {string} projectDirectory
 * @param {string} summary
 * @param {string} requestName
 * @param {string} requestType
 * @param {{ name: string, version: string, clientName: string, alias: string }} callerInfo
 * @param {Array<{label: string, options?: string[]}>} [questions]
 * @returns {Promise<{interactive_feedback?: string, images?: any[], caller_alias?: string, transfer_to_alias?: string}>}
 */
export function requestFeedbackViaIpc(socket, projectDirectory, summary, requestName, requestType, callerInfo, questions) {
  const sessionId = randomUUID();
  const checkedRequestType = normalizeRequestType(requestType);

  const request = JSON.stringify({
    type: "feedback_request",
    session_id: sessionId,
    caller: {
      name: callerInfo.name,
      version: callerInfo.version,
      client_name: callerInfo.clientName,
      alias: callerInfo.alias,
    },
    payload: {
      summary,
      request_name: requestName,
      request_type: checkedRequestType,
      project_directory: projectDirectory,
      questions: questions || [],
    },
  });

  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: socket });
    let settled = false;

    activeSessions.set(sessionId, { socket });

    rl.on("line", (line) => {
      if (settled) return;
      try {
        const msg = JSON.parse(line);
        console.error("[MLFB] Received IPC message:", msg.type, msg.session_id);
        if (msg.type === "feedback_response" && msg.session_id === sessionId) {
          settled = true;
          activeSessions.delete(sessionId);
          rl.close();
          socket.destroy();
          resolve(msg.payload);
        }
      } catch {}
    });

    rl.on("close", () => {
      if (!settled) {
        settled = true;
        activeSessions.delete(sessionId);
        reject(new Error("IPC connection closed before response"));
      }
    });

    socket.on("error", (err) => {
      if (!settled) {
        settled = true;
        activeSessions.delete(sessionId);
        reject(new Error(`IPC socket error: ${err.message}`));
      }
    });

    console.error("[MLFB] Sending IPC request for session:", sessionId);
    socket.write(request + "\n");
  });
}
