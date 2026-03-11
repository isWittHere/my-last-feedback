// My Last Feedback MCP Server
// Bridges AI Agent ↔ Tauri Desktop App via stdio MCP protocol
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFileSync, execFile } from "node:child_process";
import { readFileSync, unlinkSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createConnection } from "node:net";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Port discovery ──

const PORT_START = 19850;
const PORT_END = 19860;

function lockFilePath() {
  return join(tmpdir(), "my-last-feedback.port");
}

function readPortFromLockFile() {
  try {
    const content = readFileSync(lockFilePath(), "utf-8").trim();
    const port = parseInt(content, 10);
    if (port >= PORT_START && port <= PORT_END) return port;
  } catch {}
  return null;
}

// ── App binary discovery ──

function findAppBinary() {
  const candidates = [
    join(__dirname, "app", "src-tauri", "target", "release", "app.exe"),
    join(__dirname, "app", "src-tauri", "target", "release", "app"),
    join(__dirname, "app", "src-tauri", "target", "debug", "app.exe"),
    join(__dirname, "app", "src-tauri", "target", "debug", "app"),
    join(__dirname, "app.exe"),
    join(__dirname, "app"),
    process.env.MLF_APP_PATH || "",
  ];

  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }

  throw new Error(
    "Could not find the Tauri app binary. " +
    "Build it with 'cd app && npx tauri build --no-bundle' or set MLF_APP_PATH env var."
  );
}

// ── IPC connection helpers ──

function tryConnect(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port }, () => {
      socket.setTimeout(0); // Disable idle timeout after successful connection
      resolve(socket);
    });
    socket.on("error", () => resolve(null));
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve(null);
    });
  });
}

async function connectToApp() {
  // First try lock file port
  const port = readPortFromLockFile();
  if (port) {
    const socket = await tryConnect(port);
    if (socket) return socket;
  }
  // Scan port range
  for (let p = PORT_START; p <= PORT_END; p++) {
    const socket = await tryConnect(p);
    if (socket) return socket;
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureAppRunning() {
  let socket = await connectToApp();
  if (socket) return socket;

  // Launch app in persistent mode (no --output-file)
  const appPath = findAppBinary();
  const child = execFile(appPath, [], {
    stdio: "ignore",
    detached: true,
    windowsHide: false,
  });
  child.unref();

  // Wait for app to start and become connectable
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(500);
    socket = await connectToApp();
    if (socket) return socket;
  }

  throw new Error("Timed out waiting for the Tauri app to start");
}

// ── IPC-based feedback request ──

// Get caller identity. Priority:
// 1. MCP roots/list protocol (fully automatic, no agent involvement)
// 2. project_directory parameter (agent-provided fallback)
// 3. MCP client name from handshake (automatic)
// 4. Environment variable / "Unknown Client"
async function getCallerInfo(server, projectDir) {
  let clientName;
  let version;

  try {
    const clientInfo = server.server?.getClientVersion?.();
    if (clientInfo?.name) {
      clientName = clientInfo.name;
      version = clientInfo.version || "unknown";
    }
  } catch {}

  if (!clientName) {
    clientName = process.env.MLF_CALLER_NAME || "Unknown Client";
    version = version || process.env.MLF_CALLER_VERSION || "0.0.0";
  }

  // 1) Try MCP roots/list — truly automatic workspace detection
  let folderName;
  try {
    const result = await server.server?.listRoots?.();
    if (result?.roots?.length) {
      const normalizedDir = (projectDir || "").replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
      // Match root to project_directory, or use first root
      for (const root of result.roots) {
        const uri = root.uri || "";
        const rootPath = decodeURIComponent(uri.replace(/^file:\/\/\//, "")).replace(/\\/g, "/").replace(/\/$/, "");
        const name = root.name || rootPath.split("/").pop() || "";
        if (name && normalizedDir && rootPath.toLowerCase() === normalizedDir) {
          folderName = name;
          break;
        }
      }
      if (!folderName) {
        // Use first root's name
        const first = result.roots[0];
        const uri = first.uri || "";
        const rootPath = decodeURIComponent(uri.replace(/^file:\/\/\//, "")).replace(/\\/g, "/").replace(/\/$/, "");
        folderName = first.name || rootPath.split("/").pop() || "";
      }
      if (folderName) {
        console.error("[MCP] Auto-detected workspace from roots/list:", folderName);
      }
    }
  } catch (e) {
    console.error("[MCP] listRoots not available:", e.message);
  }

  // 2) Fallback: extract folder name from project_directory
  if (!folderName && projectDir) {
    folderName = projectDir.replace(/\\/g, "/").replace(/\/$/, "").split("/").pop();
  }

  // 3) Fallback: client name
  const baseName = folderName || clientName;

  return { name: baseName, version: version || "0.0.0", clientName: clientName };
}

// ── Alias generation ──
// Generate a deterministic 4-char uppercase hex alias from caller identity components.
// The alias is meaningless by design — it serves as a neutral agent identifier that
// won't influence the agent's self-perception of its role.
function generateAlias(baseName, agentName, clientName) {
  const key = `${baseName}:${agentName || ""}:${clientName || ""}`;
  const hash = createHash("md5").update(key).digest("hex");
  return hash.slice(0, 4).toUpperCase();
}

// ── Active session tracking (for cancel-on-disconnect) ──

const activeSessions = new Map(); // sessionId → { socket }

async function sendCancelForSession(sessionId) {
  try {
    const socket = await connectToApp();
    if (!socket) return;
    const msg = JSON.stringify({ type: "session_cancel", session_id: sessionId });
    socket.write(msg + "\n");
    socket.end();
    console.error("[MCP] Sent cancel for session:", sessionId);
  } catch (e) {
    console.error("[MCP] Failed to send cancel:", e.message);
  }
}

async function cancelAllActiveSessions() {
  const ids = [...activeSessions.keys()];
  activeSessions.clear();
  for (const id of ids) {
    await sendCancelForSession(id);
  }
}

async function requestFeedbackViaIpc(socket, projectDirectory, summary, requestName, callerInfo, questions) {
  const sessionId = randomUUID();

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
      project_directory: projectDirectory,
      questions: questions || [],
    },
  });

  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: socket });
    let settled = false;

    // Track this session so we can cancel it if stdin closes
    activeSessions.set(sessionId, { socket });

    // No timeout — the app stays alive permanently until the user responds or the session is cancelled

    rl.on("line", (line) => {
      if (settled) return;
      try {
        const msg = JSON.parse(line);
        console.error("[MCP] Received IPC message:", msg.type, msg.session_id);
        if (msg.type === "feedback_response" && msg.session_id === sessionId) {
          settled = true;
          activeSessions.delete(sessionId);
          rl.close();
          socket.destroy();
          console.error("[MCP] Feedback received, resolving...");
          resolve(msg.payload);
        }
      } catch {}
    });

    rl.on("close", () => {
      if (!settled) {
        settled = true;
        activeSessions.delete(sessionId);
        console.error("[MCP] IPC connection closed before response");
        reject(new Error("IPC connection closed before response"));
      }
    });

    socket.on("error", (err) => {
      if (!settled) {
        settled = true;
        activeSessions.delete(sessionId);
        console.error("[MCP] IPC socket error:", err.message);
        reject(new Error(`IPC socket error: ${err.message}`));
      }
    });

    console.error("[MCP] Sending IPC request for session:", sessionId);
    socket.write(request + "\n");
  });
}

// ── Legacy mode (backward compatible, used when IPC fails) ──

function launchFeedbackUILegacy(projectDirectory, summary, requestName) {
  const outputFile = join(
    tmpdir(),
    `mlf_${randomBytes(8).toString("hex")}.json`
  );

  try {
    const appPath = findAppBinary();

    execFileSync(appPath, [
      "--summary", summary,
      "--request-name", requestName,
      "--project-directory", projectDirectory,
      "--output-file", outputFile,
    ], {
      stdio: "ignore",
      windowsHide: false,
    });

    if (!existsSync(outputFile)) {
      return { interactive_feedback: "", command_logs: "", images: [] };
    }

    const raw = readFileSync(outputFile, "utf-8");
    return JSON.parse(raw);
  } finally {
    try { if (existsSync(outputFile)) unlinkSync(outputFile); } catch {}
  }
}

const server = new McpServer({
  name: "My Last Feedback MCP",
  version: "1.0.0",
});

server.tool(
  "interactive_feedback",
  `Request interactive feedback from the user via a desktop GUI window.
The user may provide text feedback, test logs, and/or attach images.
Images will be returned as ImageContent alongside the text feedback.

IMPORTANT - rules for AI agents calling this tool:
1. request_name MUST always be provided with a meaningful task title. Never omit it or leave it blank.
2. summary MUST be written in standard Markdown format (headings, lists, bold, code blocks). Do NOT use escape characters.
3. Describe full context, suggestions, and detailed information in summary. Use questions only for concise, actionable choices or brief input fields.
4. agent_name is a 4-character random combination of uppercase letters and numbers (e.g. "A1B2", "X9Y8"). You MUST generate one on your first call and reuse the same identifier on ALL subsequent calls.`,
  {
    project_directory: z.string().describe("Full path to the project directory"),
    summary: z.string().describe(
      "Summary of changes and feedback in standard Markdown format. " +
      "MUST use proper Markdown syntax: headings (## Heading), bullet lists (- item), bold (**text**), code blocks. " +
      "Do NOT use escape characters. Provide complete context, suggestions, and detailed information here."
    ),
    request_name: z.string().describe(
      "A concise title (5-10 words) for the current task, displayed in the window title bar. " +
      "This parameter is REQUIRED and MUST NOT be left empty."
    ),
    agent_name: z.string().optional().describe(
      "A 4-character random combination of uppercase letters and numbers (e.g. 'A1B2', 'X9Y8'). " +
      "You MUST generate one on your first call and reuse the same identifier on ALL subsequent calls."
    ),
    questions: z.array(z.object({
      label: z.string().describe("Short question label, e.g. 'Database choice', 'Need caching?'"),
      options: z.array(z.string()).optional().describe("Option identifiers for quick selection, e.g. ['A', 'B', 'C']. Omit for free-text input."),
    })).optional().describe(
      "Structured questions for the user. Options are short identifiers only — describe full proposals and details in summary."
    ),
  },
  async ({ project_directory, summary, request_name, agent_name, questions }) => {
    const projectDir = project_directory.split("\n")[0].trim();
    const callerInfo = await getCallerInfo(server, projectDir);
    // Use agent_name if provided; otherwise generate alias from base identity
    const alias = agent_name || generateAlias(callerInfo.name, "", callerInfo.clientName);
    callerInfo.alias = alias;
    console.error("[MCP] callerInfo:", JSON.stringify(callerInfo));

    let result;
    try {
      // Try IPC mode first (persistent app)
      const socket = await ensureAppRunning();
      console.error("[MCP] IPC socket connected, sending request...");
      result = await requestFeedbackViaIpc(socket, projectDir, summary, request_name, callerInfo, questions);
    } catch (ipcErr) {
      // Fallback to legacy mode
      console.error("[MCP] IPC failed, falling back to legacy mode:", ipcErr.message);
      console.error("[MCP] IPC error stack:", ipcErr.stack);
      result = launchFeedbackUILegacy(projectDir, summary, request_name);
    }

    console.error("[MCP] Got result, returning to MCP client. feedback length:", result?.interactive_feedback?.length || 0);

    const content = [];

    // Text feedback
    const feedbackText = result.interactive_feedback || "";
    if (feedbackText) {
      content.push({ type: "text", text: feedbackText });
    }

    // Image attachments
    const images = result.images || [];
    for (const img of images) {
      if (img && typeof img === "object" && img.data) {
        content.push({
          type: "image",
          data: img.data,
          mimeType: img.type || "image/png",
        });
      } else if (typeof img === "string" && existsSync(img)) {
        try {
          const imgBytes = readFileSync(img);
          const ext = img.split(".").pop()?.toLowerCase() || "png";
          const mimeMap = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" };
          content.push({
            type: "image",
            data: imgBytes.toString("base64"),
            mimeType: mimeMap[ext] || "image/png",
          });
        } catch {}
      }
    }

    if (content.length === 0) {
      content.push({ type: "text", text: "(No feedback provided)" });
    }

    // Use caller_alias from response if available (may differ after merge), otherwise use original alias
    const effectiveAlias = result.caller_alias || alias;

    // Append agent alias confirmation to reinforce identity across calls
    content.push({
      type: "text",
      text: `[System] Agent identifier "${effectiveAlias}" confirmed. You MUST include agent_name="${effectiveAlias}" in ALL subsequent interactive_feedback calls.\n[System] IMPORTANT: In your summary parameter, use standard Markdown only. Do NOT use escape characters such as \\n, \\t, \\\\n, or any other backslash-escaped sequences. Write actual line breaks and formatting directly in Markdown.`,
    });

    return { content };
  }
);

// ── register_agent tool ──

server.tool(
  "register_agent",
  `Register as an agent and obtain a unique agent identifier (alias) from the MCP server.
Call this tool ONCE at the start of your session BEFORE calling interactive_feedback.
The returned agent_name MUST be reused in ALL subsequent interactive_feedback calls.

IMPORTANT: Do NOT use escape characters (\\n, \\t, etc.) in any string parameters when calling interactive_feedback. Use standard Markdown formatting only.`,
  {
    project_directory: z.string().describe("Full path to the project directory"),
  },
  async ({ project_directory }) => {
    const projectDir = project_directory.split("\n")[0].trim();
    const callerInfo = await getCallerInfo(server, projectDir);
    const alias = generateAlias(callerInfo.name, randomBytes(2).toString("hex"), callerInfo.clientName);
    callerInfo.alias = alias;
    console.error("[MCP] register_agent:", JSON.stringify(callerInfo));

    return {
      content: [
        {
          type: "text",
          text: `Agent registered successfully.\n\nYour agent identifier: **${alias}**\n\nYou MUST include \`agent_name="${alias}"\` in ALL subsequent \`interactive_feedback\` calls.\n\n**IMPORTANT RULES for interactive_feedback:**\n- summary MUST use standard Markdown format (headings, lists, bold, code blocks)\n- Do NOT use escape characters such as \\n, \\t, or \\\\n in the summary parameter\n- Write actual line breaks and formatting directly`,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

// ── Detect client disconnect ──
// When the MCP client (e.g. VS Code) closes, the stdin pipe breaks.
// We use multiple detection strategies since behavior differs across platforms:
// 1. stdin 'end' / 'close' events (may not fire reliably on Windows)
// 2. Process signal handlers (SIGTERM, SIGINT, SIGHUP)
// 3. Periodic stdin readability check (most reliable cross-platform fallback)

let disconnectHandled = false;
async function handleClientDisconnect(reason) {
  if (disconnectHandled) return;
  disconnectHandled = true;
  console.error(`[MCP] Client disconnected (${reason}), cancelling active sessions...`);
  await cancelAllActiveSessions();
  process.exit(0);
}

process.stdin.on("end", () => handleClientDisconnect("stdin end"));
process.stdin.on("close", () => handleClientDisconnect("stdin close"));
process.stdin.on("error", () => handleClientDisconnect("stdin error"));

for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(sig, () => handleClientDisconnect(`signal ${sig}`));
}

// Periodic check: if stdin is no longer readable (pipe broken), client is gone.
// This is the most reliable method on Windows where pipe closure events may not fire.
const stdinCheckInterval = setInterval(() => {
  if (activeSessions.size > 0 && process.stdin.destroyed) {
    clearInterval(stdinCheckInterval);
    handleClientDisconnect("stdin destroyed (periodic check)");
  }
}, 2000);
