#!/usr/bin/env node
// Send a test feedback_request to the running MLFB app via TCP IPC.
// Usage:
//   node scripts/send-test-feedback.mjs [port]
// If no port is given, tries dev (19861) then prod (19850), else scans 19850-19870.

import { createConnection } from "node:net";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";

const argPort = parseInt(process.argv[2] || "", 10);
const PORTS = Number.isFinite(argPort)
  ? [argPort]
  : [19861, 19850, ...Array.from({ length: 21 }, (_, i) => 19850 + i)];

async function tryConnect(port) {
  return new Promise((resolve) => {
    const sock = createConnection({ host: "127.0.0.1", port }, () => {
      sock.setTimeout(0);
      resolve(sock);
    });
    sock.on("error", () => resolve(null));
    sock.setTimeout(1500, () => {
      sock.destroy();
      resolve(null);
    });
  });
}

async function main() {
  let socket = null;
  let chosenPort = null;
  for (const p of PORTS) {
    socket = await tryConnect(p);
    if (socket) {
      chosenPort = p;
      break;
    }
  }
  if (!socket) {
    console.error("Could not connect to any MLFB IPC port.");
    process.exit(1);
  }
  console.log(`Connected on port ${chosenPort}`);

  const sessionId = randomUUID();
  const req = {
    type: "feedback_request",
    session_id: sessionId,
    caller: {
      name: "test-sender",
      version: "0.0.1",
      client_name: "manual-tcp-test",
      alias: "TEST",
    },
    payload: {
      summary:
        "# 转移提交测试\n\n这是一个通过 TCP 直接注入的测试请求，用于验证 **Transfer Submit** 分段按钮。\n\n## 步骤\n\n1. 点击提交按钮左侧的 `▼`\n2. 输入 `A1B2` 并确定\n3. 按钮应变为 `[✕] [→ A1B2] [📤 转移]`\n4. 点击转移按钮提交\n\n提交内容会回显到发送这条 TCP 请求的终端。",
      request_name: "TCP Test: Transfer Submit",
      project_directory: process.cwd(),
      questions: [
        { label: "按钮形态", options: ["A-正常", "B-异常"] },
        { label: "浮层交互", options: ["A-正常", "B-异常"] },
        { label: "额外备注" },
      ],
    },
  };

  socket.write(JSON.stringify(req) + "\n");
  console.log(`Sent feedback_request session_id=${sessionId}`);
  console.log("Waiting for response (submit in the app to continue)...");

  const rl = createInterface({ input: socket });
  rl.on("error", (err) => {
    console.error("Readline error:", err.message);
    socket.destroy();
    process.exit(1);
  });
  rl.on("line", (line) => {
    try {
      const msg = JSON.parse(line);
      if (msg.type === "feedback_response" && msg.session_id === sessionId) {
        console.log("\n=== feedback_response ===");
        console.log(JSON.stringify(msg.payload, null, 2));
        console.log("=========================");
        console.log("transfer_to_alias =", msg.payload?.transfer_to_alias ?? "(not set)");
        console.log("caller_alias      =", msg.payload?.caller_alias ?? "(not set)");
        socket.destroy();
        process.exit(0);
      } else {
        console.log("[ipc msg]", msg.type);
      }
    } catch (e) {
      console.log("[non-json line]", line);
    }
  });

  socket.on("close", () => {
    console.log("Socket closed.");
    process.exit(0);
  });
  socket.on("error", (err) => {
    console.error("Socket error:", err.message);
    process.exit(1);
  });
}

main();
