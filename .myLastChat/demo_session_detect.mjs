/**
 * demo_session_detect.mjs
 *
 * 独立最小 MCP server — 验证 VSCODE_TARGET_SESSION_LOG 感知方案
 *
 * 用途：
 *   验证 server.mjs 进程是否能通过 VSCODE_TARGET_SESSION_LOG 拿到
 *   与 hook stdin session_id 相同的值，从而独立计算出 agent_name。
 *
 * 使用方法：
 *   1. 在 mcp.json 中添加一条临时服务器：
 *      {
 *        "session-detect-demo": {
 *          "type": "stdio",
 *          "command": "node",
 *          "args": ["e:/Dev/my-last-feedback/.myLastChat/demo_session_detect.mjs"]
 *        }
 *      }
 *   2. 重启 VS Code MCP 连接（或重新打开聊天窗口）
 *   3. 在 Copilot chat 中说：「请调用 check_session_id 工具」
 *   4. 对比工具返回的 autoAlias 与 hook 在 PostToolUse 里注入的 agent_name
 *      → 如果两者相同，说明 server 可以独立感知 session_id ✅
 *
 * 注意：验证完成后请从 mcp.json 中移除此条目
 */

import { createHash } from "node:crypto";
import { basename } from "node:path";
import { createInterface } from "node:readline";

// ── 计算函数（与规划文档中完全一致）──────────────────────────────────
function computeAliasFromEnv() {
  const logPath = process.env.VSCODE_TARGET_SESSION_LOG ?? "";
  const sessionId = basename(logPath); // 取末尾文件名部分（无需去扩展名，实测无.jsonl后缀）
  if (!sessionId) return { alias: null, sessionId: null, logPath: "" };
  const alias = createHash("md5").update(sessionId).digest("hex").slice(0, 4).toUpperCase();
  return { alias, sessionId, logPath };
}

// ── 最小 JSON-RPC 2.0 MCP stdio 服务器 ────────────────────────────────
const rl = createInterface({ input: process.stdin, terminal: false });

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

rl.on("line", (line) => {
  let req;
  try {
    req = JSON.parse(line.trim());
  } catch {
    return;
  }

  const { id, method, params } = req;

  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "session-detect-demo", version: "0.1.0" },
      },
    });
    return;
  }

  if (method === "notifications/initialized") return; // ignore

  if (method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "check_session_id",
            description:
              "Demo tool: 返回当前 MCP server 进程能感知到的 VSCODE_TARGET_SESSION_LOG、" +
              "提取的 sessionId、以及用 MD5(sessionId).slice(0,4) 计算的 autoAlias。" +
              "用于验证 server 是否能独立计算出与 hook 相同的 agent_name。",
            inputSchema: { type: "object", properties: {}, required: [] },
          },
        ],
      },
    });
    return;
  }

  if (method === "tools/call" && params?.name === "check_session_id") {
    const { alias, sessionId, logPath } = computeAliasFromEnv();

    const hookAlgorithm = "MD5(session_id).slice(0,4).toUpperCase()";
    const serverAlgorithm = "MD5(basename(VSCODE_TARGET_SESSION_LOG)).slice(0,4).toUpperCase()";

    const lines = [
      "## Session ID 感知验证结果",
      "",
      `**VSCODE_TARGET_SESSION_LOG**: \`${logPath || "(未设置)"}\``,
      `**提取的 sessionId**: \`${sessionId || "(空)"}\``,
      `**计算的 autoAlias**: \`${alias || "(无法计算)"}\``,
      "",
      "---",
      "",
      "### 对比方法",
      `- Hook 算法: ${hookAlgorithm}`,
      `- Server 算法: ${serverAlgorithm}`,
      "",
      "### 验证步骤",
      "1. 查看 PostToolUse 注入的上下文中的 agent_name（格式：[my-last-feedback] Your agent_name is 'XXXX'）",
      `2. 将该值与上方 **autoAlias** = \`${alias}\` 对比`,
      alias
        ? `3. 若两者相同 → ✅ server 可独立感知 session_id，agent_name 参数可废弃`
        : `3. ❌ VSCODE_TARGET_SESSION_LOG 未设置，当前环境不支持自动感知`,
    ];

    send({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: lines.join("\n") }],
      },
    });
    return;
  }

  // Default: method not found
  if (id !== undefined) {
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  }
});

process.stderr.write("[demo_session_detect] MCP server started\n");
