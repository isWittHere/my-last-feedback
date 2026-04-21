// ── MLRA MCP Server ──
// Per-agent MCP Server process. Each VS Code Chat session runs one instance.
// Acts as a stateless gateway: receives MCP tool calls, forwards to Daemon via TCP.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createConnection } from "node:net";
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { basename } from "node:path";
import { MSG } from "./protocol.mjs";
import { WORKER_ENABLED } from "./feature-flags.mjs";

// ── Daemon Connection ──

const IS_DEV = process.env.MLRA_DEV === "1";
const DAEMON_PORT_START = IS_DEV ? 19881 : 19871;
const DAEMON_PORT_END = IS_DEV ? 19890 : 19880;

function daemonLockFilePath() {
  return join(
    tmpdir(),
    IS_DEV ? "my-long-running-agent-dev.port" : "my-long-running-agent.port"
  );
}

function readDaemonPort() {
  try {
    const content = readFileSync(daemonLockFilePath(), "utf-8").trim();
    const port = parseInt(content, 10);
    if (port >= DAEMON_PORT_START && port <= DAEMON_PORT_END) return port;
  } catch {}
  return null;
}

function tryConnectDaemon(port) {
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

async function connectToDaemon() {
  // Try lock file port
  const port = readDaemonPort();
  if (port) {
    const socket = await tryConnectDaemon(port);
    if (socket) return socket;
  }
  // Scan port range
  for (let p = DAEMON_PORT_START; p <= DAEMON_PORT_END; p++) {
    const socket = await tryConnectDaemon(p);
    if (socket) return socket;
  }
  return null;
}

// Auto-launch daemon if not running
async function ensureDaemon() {
  let socket = await connectToDaemon();
  if (socket) return socket;

  // Launch daemon
  const { execFile } = await import("node:child_process");
  const { dirname, join: pathJoin } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const daemonPath = pathJoin(__dirname, "daemon.mjs");

  console.error("[MLRA-MCP] Starting daemon...");
  const child = execFile("node", [daemonPath], {
    stdio: "ignore",
    detached: true,
    env: { ...process.env, MLRA_DEV: IS_DEV ? "1" : "0" },
  });
  child.unref();

  // Wait for daemon to start
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    socket = await connectToDaemon();
    if (socket) return socket;
  }

  throw new Error("Could not start or connect to MLRA Daemon");
}

// ── Daemon Communication ──

/**
 * Send a message to the daemon and wait for a response matching callerId.
 * @param {import("net").Socket} socket
 * @param {object} msg
 * @param {string} callerId
 * @returns {Promise<object>}
 */
function sendAndWait(socket, msg, callerId) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: socket });
    let settled = false;

    rl.on("line", (line) => {
      if (settled) return;
      try {
        const resp = JSON.parse(line.trim());
        // Match response by callerId
        if (resp.callerId === callerId || resp.type === MSG.ERROR) {
          settled = true;
          rl.close();
          if (resp.type === MSG.ERROR) {
            reject(new Error(resp.message || "Daemon error"));
          } else {
            resolve(resp);
          }
        }
      } catch {}
    });

    rl.on("close", () => {
      if (!settled) {
        settled = true;
        reject(new Error("Daemon connection closed"));
      }
    });

    socket.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Daemon socket error: ${err.message}`));
      }
    });

    socket.write(JSON.stringify(msg) + "\n");
  });
}

// ── Caller Identity ──

async function getCallerInfo(mcpServer, workspace) {
  let clientName;
  try {
    const clientInfo = mcpServer.server?.getClientVersion?.();
    if (clientInfo?.name) clientName = clientInfo.name;
  } catch {}
  clientName = clientName || process.env.MLRA_CALLER_NAME || "Unknown";

  let folderName;
  try {
    const result = await mcpServer.server?.listRoots?.();
    if (result?.roots?.length) {
      const first = result.roots[0];
      const uri = first.uri || "";
      const rootPath = decodeURIComponent(uri.replace(/^file:\/\/\//, "")).replace(/\\/g, "/").replace(/\/$/, "");
      folderName = first.name || rootPath.split("/").pop() || "";
    }
  } catch {}

  if (!folderName && workspace) {
    folderName = workspace.replace(/\\/g, "/").replace(/\/$/, "").split("/").pop();
  }

  const baseName = folderName || clientName;
  return { baseName, clientName };
}

// Deterministic alias generator.
// When a VS Code session_id is available we align with the hook script
// (`~/.copilot/hooks/scripts/inject-agent-name.mjs`) which computes
// `md5(session_id).slice(0,4).toUpperCase()`. This keeps the alias displayed
// in hook-injected context identical to what this server uses internally.
// Falls back to a deterministic workspace+client hash when no session_id.
function generateAlias(sessionId, baseName, clientName) {
  const key = sessionId || `${baseName}:${clientName}`;
  const hash = createHash("md5").update(key).digest("hex");
  return hash.slice(0, 4).toUpperCase();
}

// ── MCP Server Setup ──

const mcpServer = new McpServer({
  name: "My Long Running Agent",
  version: "0.1.0",
});

let daemonSocket = null;
let callerId = null;
let callerAlias = null;

// ── Tool: register_LRA ──

mcpServer.tool(
  "register_LRA",
  `Register this agent with the MLRA orchestration system.
You MUST call this tool FIRST before doing anything else.
The tool will block until the orchestrator assigns your role and sends initial instructions.
Do NOT call any other tool before register_LRA returns.`,
  {
    workspace: z.string().describe("Full path to the workspace/project directory"),
  },
  async ({ workspace }) => {
    // Connect to daemon
    daemonSocket = await ensureDaemon();
    console.error("[MLRA-MCP] Connected to daemon");

    // Generate caller identity
    const info = await getCallerInfo(mcpServer, workspace);

    // Resolve session ID first (so alias can be derived from it, matching the hook).
    const logPath = process.env.VSCODE_TARGET_SESSION_LOG;
    let sessionId = null;
    if (logPath) {
      sessionId = basename(logPath);
      callerId = sessionId;
      console.error(`[MLRA-MCP] Using real session ID: ${callerId}`);
    } else {
      // No session_id available — generate a deterministic-per-boot fallback.
      // Alias below will fall back to md5(workspace:client) so it stays stable
      // across restarts within the same workspace.
      callerId = `mlra_${info.baseName}_${Date.now().toString(36)}`;
      console.error(`[MLRA-MCP] No VSCODE_TARGET_SESSION_LOG, generated ID: ${callerId}`);
    }

    callerAlias = generateAlias(sessionId, info.baseName, info.clientName);

    // Detect model from client info
    const clientInfo = mcpServer.server?.getClientVersion?.();
    const model = clientInfo?.name || process.env.MLRA_MODEL || "unknown";

    console.error(`[MLRA-MCP] Registering as ${callerId} (${callerAlias}), model=${model}`);

    // Send registration and BLOCK until orchestration starts
    const response = await sendAndWait(
      daemonSocket,
      {
        type: MSG.AGENT_REGISTER,
        callerId,
        alias: callerAlias,
        workspace: workspace.replace(/\\/g, "/"),
        model,
      },
      callerId
    );

    return {
      content: [
        {
          type: "text",
          text: response.content,
        },
      ],
    };
  }
);

// ── Tool: get_task_context ──

mcpServer.tool(
  "get_task_context",
  `Retrieve the original user request and task type.
Use this tool when you need to recall the original task description.`,
  {},
  async () => {
    if (!daemonSocket || !callerId) {
      return {
        content: [{ type: "text", text: "Error: You must call register_LRA first." }],
        isError: true,
      };
    }

    const response = await sendAndWait(
      daemonSocket,
      { type: MSG.GET_TASK_CONTEXT, callerId },
      callerId
    );

    return {
      content: [{ type: "text", text: response.content }],
    };
  }
);

// ── Tool: submit ──

mcpServer.tool(
  "submit",
  `Submit your work result to the orchestrator.
This tool will BLOCK until the orchestrator sends your next instruction.
Use this to submit plans, review results, phase completions, etc.
Format your content according to your role's Skill specification.`,
  {
    type: z.enum(["plan_draft", "review_result", "phase_complete"])
      .describe("Type of submission: plan_draft (expert plan), review_result (inspector review), phase_complete (expert phase report)"),
    content: z.string().describe("Your submission content formatted per your Skill specification"),
    passed: z.boolean().optional().describe("For inspectors: whether the review passed (true) or found blocking issues (false)"),
    progress: z.string().optional().describe("Optional progress indicator, e.g. 'Phase 2/5: 数据库迁移'. Displayed in UI for status tracking."),
  },
  async ({ type, content, passed, progress }) => {
    if (!daemonSocket || !callerId) {
      return {
        content: [{ type: "text", text: "Error: You must call register_LRA first." }],
        isError: true,
      };
    }

    const response = await sendAndWait(
      daemonSocket,
      {
        type: MSG.AGENT_SUBMIT,
        callerId,
        submitType: type,
        content,
        metadata: { passed, progress },
      },
      callerId
    );

    return {
      content: [{ type: "text", text: response.content }],
    };
  }
);

// ── Tool: router_vote ──

mcpServer.tool(
  "router_vote",
  `Vote on whether the current plan/proposal is ready to proceed.
Use this when you believe the planning confrontation has reached consensus.
This is a quick-return tool (non-blocking).`,
  {
    vote: z.enum(["pass", "reject"]).describe("Your vote"),
    reason: z.string().describe("Reason for your vote"),
  },
  async ({ vote, reason }) => {
    if (!daemonSocket || !callerId) {
      return {
        content: [{ type: "text", text: "Error: You must call register_LRA first." }],
        isError: true,
      };
    }

    const response = await sendAndWait(
      daemonSocket,
      { type: MSG.AGENT_VOTE, callerId, vote, reason },
      callerId
    );

    return {
      content: [{ type: "text", text: response.content }],
    };
  }
);

// ── Worker-related tools (dormant when WORKER_ENABLED=false) ──
// The following 4 tools (order, check_orders, await_order_finish, submit_feedback)
// are only registered when the worker subsystem is enabled. While dormant, main
// agents see no worker tools in their MCP tool list and cannot hallucinate delegation.
if (WORKER_ENABLED) {

// ── Tool: order ──

mcpServer.tool(
  "order",
  `Delegate a task to a worker sub-agent.
Only experts can issue orders. This is a quick-return tool.

Your task_description MUST be structured for clarity:
- **行动背景**: Why this task is needed (which Phase, what purpose)
- **目标定位**: Exact files and code locations to modify
- **操作指引**: Step-by-step what to do (create/modify/delete)
- **预期交付**: What the result should look like (interfaces, behavior)

Worker does NOT have access to the original user request or planning docs.
You must provide all necessary context in the task description.`,
  {
    worker_id: z.string().optional().describe("Target worker ID (optional, auto-assigned if omitted)"),
    task_description: z.string().describe("Clear task description for the worker"),
    priority: z.enum(["normal", "high"]).optional().describe("Task priority"),
  },
  async ({ worker_id, task_description, priority }) => {
    if (!daemonSocket || !callerId) {
      return {
        content: [{ type: "text", text: "Error: You must call register_LRA first." }],
        isError: true,
      };
    }

    const response = await sendAndWait(
      daemonSocket,
      {
        type: MSG.AGENT_ORDER,
        callerId,
        workerId: worker_id || "",
        taskDescription: task_description,
        priority: priority || "normal",
      },
      callerId
    );

    return {
      content: [{ type: "text", text: response.content }],
    };
  }
);

// ── Tool: check_orders ──

mcpServer.tool(
  "check_orders",
  `Check the status of all worker sub-agents.
Returns a table showing each worker's current status and task.
This is a quick-return tool (non-blocking).`,
  {},
  async () => {
    if (!daemonSocket || !callerId) {
      return {
        content: [{ type: "text", text: "Error: You must call register_LRA first." }],
        isError: true,
      };
    }

    const response = await sendAndWait(
      daemonSocket,
      { type: MSG.AGENT_CHECK_ORDERS, callerId },
      callerId
    );

    // Format as markdown table
    const orders = response.orders || [];
    let table = "## 子Agent状态信息表\n\n| Worker ID | 角色 | 状态 | 当前任务 |\n|-----------|------|------|----------|\n";
    for (const o of orders) {
      table += `| ${o.worker_id} | ${o.role} | ${o.status} | ${o.current_task || "-"} |\n`;
    }

    return {
      content: [{ type: "text", text: table }],
    };
  }
);

// ── Tool: await_order_finish ──

mcpServer.tool(
  "await_order_finish",
  `Wait for a specific worker sub-agent to complete its task.
This tool will BLOCK until the worker submits its result.`,
  {
    worker_id: z.string().describe("The worker ID to wait for"),
    timeout_hint: z.string().optional().describe("Optional timeout hint"),
  },
  async ({ worker_id, timeout_hint }) => {
    if (!daemonSocket || !callerId) {
      return {
        content: [{ type: "text", text: "Error: You must call register_LRA first." }],
        isError: true,
      };
    }

    const response = await sendAndWait(
      daemonSocket,
      {
        type: MSG.AGENT_AWAIT_ORDER,
        callerId,
        workerId: worker_id,
        timeoutHint: timeout_hint,
      },
      callerId
    );

    return {
      content: [{ type: "text", text: response.content }],
    };
  }
);

// ── Tool: submit_feedback (Worker only) ──

mcpServer.tool(
  "submit_feedback",
  `Submit your completed work as a worker sub-agent.
This tool will BLOCK until the orchestrator assigns your next task.
Only worker agents should use this tool.

Format your result as a structured delivery report:
- 任务描述: Restate the task you received
- 执行结果: Checklist of completed items with file:line references
- 修改文件: List of files modified with change summary
- 备注: Any issues or concerns

Refer to your Skill file (mcp_prompts/skill_worker.md) for the full template.`,
  {
    result: z.string().describe("Your work result"),
    files_modified: z.array(z.string()).optional().describe("List of files you modified"),
  },
  async ({ result, files_modified }) => {
    if (!daemonSocket || !callerId) {
      return {
        content: [{ type: "text", text: "Error: You must call register_LRA first." }],
        isError: true,
      };
    }

    const response = await sendAndWait(
      daemonSocket,
      {
        type: MSG.WORKER_SUBMIT_FEEDBACK,
        callerId,
        result,
        filesModified: files_modified || [],
      },
      callerId
    );

    return {
      content: [{ type: "text", text: response.content }],
    };
  }
);

} // end if (WORKER_ENABLED)

// ── Tool: ceo_verdict (CEO only) ──

mcpServer.tool(
  "ceo_verdict",
  `CEO exclusive verdict tool. Submit your decision and automatically enter standby
until the next critical review point arrives.
This tool will BLOCK until the next trigger point wakes you up.
Only the CEO agent should use this tool.`,
  {
    verdict: z.enum(["approved", "rejected", "arbitration"])
      .describe("Your verdict: approved (pass), rejected (reject with reason), arbitration (resolve dispute)"),
    reason: z.string().optional()
      .describe("Verdict reason or specific instructions (required for rejected/arbitration)"),
    targets: z.array(z.string()).optional()
      .describe("Target roles for arbitration result routing"),
  },
  async ({ verdict, reason, targets }) => {
    if (!daemonSocket || !callerId) {
      return {
        content: [{ type: "text", text: "Error: You must call register_LRA first." }],
        isError: true,
      };
    }

    // Send verdict and BLOCK until next trigger point
    const response = await sendAndWait(
      daemonSocket,
      {
        type: MSG.CEO_VERDICT,
        callerId,
        verdict,
        reason: reason || "",
        targets: targets || [],
      },
      callerId
    );

    return {
      content: [{ type: "text", text: response.content }],
    };
  }
);

// ── Start MCP Server ──

const transport = new StdioServerTransport();
await mcpServer.connect(transport);

// Detect client disconnect
let disconnected = false;
function handleDisconnect(reason) {
  if (disconnected) return;
  disconnected = true;
  console.error(`[MLRA-MCP] Client disconnected (${reason})`);
  if (daemonSocket) {
    daemonSocket.destroy();
  }
  process.exit(0);
}

process.stdin.on("end", () => handleDisconnect("stdin end"));
process.stdin.on("close", () => handleDisconnect("stdin close"));
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(sig, () => handleDisconnect(`signal ${sig}`));
}
