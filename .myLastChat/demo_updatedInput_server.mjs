/**
 * demo_updatedInput_server.mjs
 *
 * 最小 MCP demo 服务器 — 验证 PreToolUse updatedInput 方案
 *
 * 用途：
 *   验证 VS Code PreToolUse hook 的 updatedInput 是否对 MCP 工具生效。
 *   即：hook 注入 agent_name 后，server 是否能在 args 中收到它。
 *
 * 工具：demo_echo_agent
 *   - message: string (必填)
 *   - agent_name: string (选填) ← 由 hook 注入，agent 不传
 *
 * 测试结果写入：
 *   %TEMP%\demo_updatedInput_result.json
 *
 * 使用方法：
 *   1. 在 VS Code settings.json 中添加 MCP server：
 *      {
 *        "demo-updatedInput": {
 *          "type": "stdio",
 *          "command": "node",
 *          "args": ["e:/Dev/my-last-feedback/.myLastChat/demo_updatedInput_server.mjs"]
 *        }
 *      }
 *   2. 确认 hook 配置有 PreToolUse → demo_pretooluse_inject.mjs（见该文件说明）
 *   3. 重启 VS Code MCP 连接
 *   4. 让 agent 调用：「请调用 demo_echo_agent 工具，message="测试注入"，不要传 agent_name」
 *   5. 查看工具返回结果 + %TEMP%\demo_updatedInput_result.json
 *      → 如果结果中 agent_name 不是 null，说明 updatedInput 方案有效 ✅
 *      → 如果结果中 agent_name 是 null，说明 VS Code 未对 MCP 工具应用 updatedInput ❌
 *
 * 验证完成后，从 settings.json 中移除 demo-updatedInput 条目。
 */

import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const rl = createInterface({ input: process.stdin, terminal: false });

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

rl.on("line", (line) => {
  let req;
  try { req = JSON.parse(line.trim()); } catch { return; }

  if (req.method === "initialize") {
    send({
      jsonrpc: "2.0", id: req.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "demo-updatedInput", version: "0.0.1" },
      },
    });
    return;
  }

  if (req.method === "notifications/initialized") return;

  if (req.method === "tools/list") {
    send({
      jsonrpc: "2.0", id: req.id,
      result: {
        tools: [{
          name: "demo_echo_agent",
          description:
            "Demo tool: echoes back received args. " +
            "agent_name is optional — should be injected by PreToolUse hook without agent passing it.",
          inputSchema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "Any message to echo",
              },
              agent_name: {
                type: "string",
                description:
                  "(Optional) 4-char hex agent identifier. Do NOT pass this — let the hook inject it.",
              },
            },
            required: ["message"],
          },
        }],
      },
    });
    return;
  }

  if (req.method === "tools/call" && req.params?.name === "demo_echo_agent") {
    const args = req.params.arguments ?? {};
    const message = args.message ?? "(no message)";
    const agentName = args.agent_name ?? null;

    // Write result to temp file for external verification
    const resultPath = join(tmpdir(), "demo_updatedInput_result.json");
    const resultData = {
      timestamp: new Date().toISOString(),
      received_args: args,
      agent_name_injected: agentName !== null,
      agent_name_value: agentName,
      verdict: agentName !== null
        ? "✅ updatedInput 有效 — hook 成功注入 agent_name"
        : "❌ updatedInput 无效 — agent_name 为 null，hook 注入未生效",
    };
    try { writeFileSync(resultPath, JSON.stringify(resultData, null, 2), "utf-8"); } catch {}

    const replyText = [
      `## demo_echo_agent 结果`,
      ``,
      `- message: \`${message}\``,
      `- agent_name: \`${agentName ?? "null（未注入）"}\``,
      ``,
      `**判断**：${resultData.verdict}`,
      ``,
      `结果已写入：\`${resultPath}\``,
    ].join("\n");

    send({
      jsonrpc: "2.0", id: req.id,
      result: {
        content: [{ type: "text", text: replyText }],
      },
    });
    return;
  }

  // Unknown method
  if (req.id != null) {
    send({
      jsonrpc: "2.0", id: req.id,
      error: { code: -32601, message: "Method not found" },
    });
  }
});
