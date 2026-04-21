/**
 * demo_dump_pretooluse.mjs
 *
 * 诊断用 hook 脚本 — 将 PreToolUse stdin 原始数据写入临时文件
 *
 * 用途：
 *   验证 PreToolUse hook stdin 是否包含 tool_call_id 字段，
 *   以便确认 PreToolUse → session_announce 方案的并发安全性。
 *
 * 使用方法：
 *   1. 在 ~/.copilot/hooks/inject-agent-name.json 中临时添加：
 *
 *      "PreToolUse": [{
 *        "type": "command",
 *        "command": "node ~/.copilot/hooks/scripts/inject-agent-name.mjs",
 *        "windows": "cmd /c node \"%USERPROFILE%\\.myLastChat\\demo_dump_pretooluse.mjs\"",
 *        ... 实际路径参照安装位置
 *      }]
 *
 *      或直接替换为当前脚本的绝对路径测试。
 *
 *   2. 调用任意 MCP 工具（如 check_session_id）
 *
 *   3. 查看输出文件：C:/Users/<User>/AppData/Local/Temp/pretooluse_dump.json
 *
 *   4. 验证完成后恢复原 hook 配置
 */

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input);

    // Dump all top-level keys and values to a file
    const dumpPath = join(tmpdir(), "pretooluse_dump.json");
    writeFileSync(dumpPath, JSON.stringify(data, null, 2), "utf-8");

    process.stderr.write(`[dump] Written to ${dumpPath}\n`);
    process.stderr.write(`[dump] Keys: ${Object.keys(data).join(", ")}\n`);
  } catch (e) {
    process.stderr.write(`[dump] Parse error: ${e.message}\n`);
  }

  // Always exit cleanly — don't block the tool call
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
});
