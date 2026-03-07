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
import { randomBytes, randomUUID } from "node:crypto";
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

async function requestFeedbackViaIpc(socket, projectDirectory, summary, requestName, callerInfo) {
  const sessionId = randomUUID();

  const request = JSON.stringify({
    type: "feedback_request",
    session_id: sessionId,
    caller: {
      name: callerInfo.name,
      version: callerInfo.version,
      client_name: callerInfo.clientName,
    },
    payload: {
      summary,
      request_name: requestName,
      project_directory: projectDirectory,
    },
  });

  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: socket });
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(new Error("IPC response timeout (10 minutes)"));
      }
    }, 10 * 60 * 1000);

    rl.on("line", (line) => {
      if (settled) return;
      try {
        const msg = JSON.parse(line);
        console.error("[MCP] Received IPC message:", msg.type, msg.session_id);
        if (msg.type === "feedback_response" && msg.session_id === sessionId) {
          settled = true;
          clearTimeout(timeout);
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
        clearTimeout(timeout);
        console.error("[MCP] IPC connection closed before response");
        reject(new Error("IPC connection closed before response"));
      }
    });

    socket.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
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
2. summary MUST be written in standard Markdown format using headings, lists, bold, or code blocks.`,
  {
    project_directory: z.string().describe("Full path to the project directory"),
    summary: z.string().describe(
      "Summary of the changes in standard Markdown format. " +
      "MUST use proper Markdown syntax: headings (## Heading), " +
      "bullet lists (- item), bold (**text**), and/or code blocks."
    ),
    request_name: z.string().describe(
      "A concise title (5-10 words) for the current task, displayed in the window title bar. " +
      "This parameter is REQUIRED and MUST NOT be left empty."
    ),
  },
  async ({ project_directory, summary, request_name }) => {
    const projectDir = project_directory.split("\n")[0].trim();
    const callerInfo = await getCallerInfo(server, projectDir);
    console.error("[MCP] callerInfo:", JSON.stringify(callerInfo));

    let result;
    try {
      // Try IPC mode first (persistent app)
      const socket = await ensureAppRunning();
      console.error("[MCP] IPC socket connected, sending request...");
      result = await requestFeedbackViaIpc(socket, projectDir, summary, request_name, callerInfo);
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

    return { content };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
