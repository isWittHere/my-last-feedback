---
title: Hook Session Stop 分流注入规划
description: 基于 session_id 的 VS Code Copilot Hook 分流方案，按 session 类型在 Stop 事件注入不同的"结束前必须调用"提醒，同时统一 agent_name 生成逻辑使工具调用无需传入 agent_name 参数
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - hook
  - session
  - MLFB
  - MLRA
  - stop-hook
  - agent-name-unification
solved_lists: []
---

# Hook Session Stop 分流注入规划

## 背景

当前 `inject-agent-name.mjs` 的 Stop 事件采用单一阻断策略，统一要求 agent 调用 `interactive_feedback`。
随着系统中同时存在 MLFB（my-last-feedback）和 MLRA（my-long-running-agent）两种 session 类型，不同角色在结束前应调用的工具不同，需要按 session 类型进行分流注入。

此外，通过统一 `agent_name` 生成逻辑（均基于 VS Code session ID 计算），可以使 `interactive_feedback` 工具调用不再需要 agent 手动传入 `agent_name` 参数，同时简化 hook 注入内容。

---

## 目标

1. **按 session_id 识别类型**，在 Stop 事件注入对应的"结束前必须调用的工具"提醒
2. **未注册 session 默认为 MLFB 类型**，保持现有行为不变
3. **状态文件由 App 程序写入**，hook 脚本只读，职责清晰分离
4. **实时生效**，写入即生效，无需重启 VS Code
5. **统一 agent_name 来源**，server 从 `VSCODE_TARGET_SESSION_LOG` 自动计算 alias，agent 无需传入 `agent_name`
6. **简化 hook 注入**，各事件不再需要注入具体 agent_name 值，仅保留 Stop 阻断逻辑

---

## Session 类型与 Stop 提醒

| Session 类型 | 注册方式 | Stop 前必须调用工具 | 提醒消息 |
|---|---|---|---|
| **MLFB**（默认/未注册） | `interactive_feedback` 首次调用时由 App 写入 | `interactive_feedback` | "Before finishing, you MUST call interactive_feedback. You do NOT need to pass agent_name — the server identifies you automatically. Do not stop without calling interactive_feedback first." |
| **MLRA-Expert** | `register_LRA` 后 Daemon 返回角色 expert | `submit` 或 `router_vote` | "As an expert, before finishing, you MUST call submit (to report your progress/result) or router_vote (to vote on the current proposal). Do not stop without reporting to the orchestrator." |
| **MLRA-Inspector** | `register_LRA` 后 Daemon 返回角色 inspector | `submit` 或 `router_vote` | "As an inspector, before finishing, you MUST call submit (with passed=true/false to indicate review result) or router_vote. Do not stop without reporting to the orchestrator." |
| **MLRA-CEO** | `register_LRA` 后 Daemon 返回角色 ceo | `ceo_verdict` | "Before finishing, you MUST call ceo_verdict to submit your final decision to the orchestration system. Do not stop without calling ceo_verdict first." |

### MLRA 工具说明（当前版本）

- `submit`：专家和监察共用的常规提交工具，用于提交计划草案、阶段报告、审查结果等
  - `type` 字段：`plan_draft`（专家计划） / `review_result`（监察审查）/ `phase_complete`（专家阶段报告）
  - `passed` 字段：监察专用，表示审查是否通过
- `router_vote`：专家和监察共用，发起对当前方案的投票（`pass` / `reject`）
- `ceo_verdict`：CEO 专用，提交最终决策（`approved` / `rejected` / `arbitration`）
- Worker 相关工具（`order`、`check_orders`、`await_order_finish`、`submit_feedback`）：当前已通过 `WORKER_ENABLED=false` 禁用，暂不考虑

---

## 状态文件设计

### 文件路径

```
~/.copilot/hooks/session-config.json
```

### 数据结构

```json
{
  "<session_id>": {
    "type": "MLFB" | "MLRA",
    "role": "expert" | "inspector" | "ceo",
    "agent_name": "<4位大写字母数字>"
  }
}
```

- `type` 必填：`"MLFB"` 或 `"MLRA"`
- `role`：仅 MLRA 类型需要，MLFB 可省略
- `agent_name`：4 位大写字母数字，由 MD5(session_id).slice(0,4).toUpperCase() 生成（与现有逻辑一致）

### 写入时机（由 App 程序负责）

| 触发事件 | 写入 key | 写入内容 |
|---------|---------|---------|
| MLFB `interactive_feedback` 被首次调用 | `session_id` | `{ type: "MLFB", agent_name: "..." }` |
| MLRA `register_LRA` 成功，Daemon 返回角色分配 | `session_id` | `{ type: "MLRA", role: "expert/inspector/ceo", agent_name: "..." }` |

**注意**：hook 脚本不写入该文件，只读取。如果文件不存在或 session_id 不在文件中，默认按 MLFB 处理。

---

## Hook 脚本改动（`inject-agent-name.mjs`）

### 新增逻辑

在文件顶部引入 `readFileSync`（已有），新增读取 session-config.json 的辅助函数：

```js
function readSessionConfig() {
  try {
    const configPath = join(
      process.env.HOME || process.env.USERPROFILE || "",
      ".copilot", "hooks", "session-config.json"
    );
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}
```

### Stop 分支逻辑（替换现有 Stop 分支）

```js
} else if (hookEvent === "Stop") {
  const sessionConfig = readSessionConfig();
  const config = sessionConfig[sessionId] || {};
  const sessionType = config.type ?? "MLFB";
  const sessionRole = config.role ?? null;
  // Prefer stored agent_name; fallback to computed hash
  const effectiveAgentName = config.agent_name ?? agentName;

  let reason;

  if (sessionType === "MLRA" && sessionRole === "ceo") {
    reason =
      `Before finishing, you MUST call ceo_verdict to submit your final decision ` +
      `to the orchestration system. Do not stop without calling ceo_verdict first.`;

  } else if (sessionType === "MLRA" && sessionRole === "inspector") {
    reason =
      `As an inspector, before finishing, you MUST call submit ` +
      `(with passed=true/false to indicate your review result) ` +
      `or router_vote (to vote on the current proposal). ` +
      `Do not stop without reporting to the orchestrator.`;

  } else if (sessionType === "MLRA" && sessionRole === "expert") {
    reason =
      `As an expert, before finishing, you MUST call submit ` +
      `(to report your progress or phase completion) ` +
      `or router_vote (to vote on the current proposal). ` +
      `Do not stop without reporting to the orchestrator.`;

  } else {
    // MLFB (default) — require interactive_feedback
    reason =
      `Before finishing, you MUST call interactive_feedback ` +
      `with agent_name="${effectiveAgentName}" to present results to the user and collect confirmation. ` +
      `Do not stop without calling interactive_feedback first.`;
  }

  output = {
    hookSpecificOutput: {
      hookEventName: "Stop",
      decision: "block",
      reason,
    },
  };
}
```

---

## App 程序改动（`server.mjs` / MLRA server）

### ❌ 已验证否定：VSCODE_TARGET_SESSION_LOG 方案

**结论（2026-04-21 实验验证）**：`VSCODE_TARGET_SESSION_LOG` 是 VS Code prompt/instructions 文件的**文本替换变量**，不是注入到 MCP server 子进程的环境变量。

Demo 工具 `check_session_id` 验证结果：
- `process.env.VSCODE_TARGET_SESSION_LOG` = 未设置（空）
- 无法从 server 端独立计算 alias

**影响**：server 无法自动识别 caller，`agent_name` 参数仍然必要。

---

### ✅ 新方案：PreToolUse hook → session_announce → server 精确配对

**实验验证（2026-04-21）**：`PostToolUse` hook stdin 包含以下字段：

```json
{
  "timestamp": "2026-04-20T18:55:26.742Z",
  "hook_event_name": "PostToolUse",
  "session_id": "1b06aa7b-2abf-451d-807b-05670d789d1a",
  "transcript_path": "...1b06aa7b-...jsonl",
  "tool_name": "read_file",
  "tool_input": { ... },
  "tool_response": "...",
  "tool_use_id": "toolu_bdrk_019h4cVTb9iXYXBzAQHrqYKW__vscode-1776706165685",
  "cwd": "e:\\Dev\\my-last-feedback"
}
```

**关键发现**：`tool_use_id` 字段是每次工具调用的唯一标识符，与 MCP JSON-RPC 协议的 `id` 字段对应。

**PreToolUse 是有效的 VS Code hook 事件**（8 个事件之一），但**经验证不对 MCP 工具触发**。PreToolUse 仅对 VS Code 内置工具（`editFiles`、`runInTerminal`、`create_file` 等）发火；通过 MCP 协议注册的外部工具调用不触发 PreToolUse。

> **验证（2026-04-21）**：调用 `demo_echo_agent(MCP)` 后，`%TEMP%\demo_pretooluse_inject_log.json` 未创建，证明 hook 脚本从未执行。

#### tool_use_id 方案分析（已全部验证）

`tool_use_id` 同时出现在 PreToolUse 和 PostToolUse 的 stdin 中，是每次工具调用的唯一标识。基于此提出三个子方案，均已评估：

---

**方案 A：PreToolUse `updatedInput` 注入**

官方文档的 `updatedInput` 允许修改工具调用参数，但 **PreToolUse 对 MCP 工具不触发**，方案 A **不可行**。

- ❌ `PreToolUse` 不对 MCP 工具发火（2026-04-21 实验验证）

---

**方案 B：PreToolUse → 文件缓存 → server 读取（tool_use_id 配对）**

同样依赖 PreToolUse，**因 MCP 工具不触发而不可行**。额外问题：
- `tool_use_id` 格式（`toolu_bdrk_019h4c...vscode-...`）与 JSON-RPC `extra.requestId`（通常为整数）很可能不同

- ❌ PreToolUse 不触发，方案 B **不可行**

---

**方案 C：PostToolUse `additionalContext`（当前方案，已验证有效）**

```
PostToolUse fires after each tool call (including MCP tools ✅)
  → hook injects additionalContext: "Your agent_name is 296D"
Agent reads context and uses agent_name in interactive_feedback
```

**优点**：已验证有效，agent 确实读取并使用，PostToolUse 对 MCP 工具正常触发。
**缺点**：间接（agent 中转），agent 理论上可以忽略。

---

| 方案 | 状态 | 原因 |
|------|------|------|
| A: `updatedInput` | ❌ 不可行 | PreToolUse 不对 MCP 工具触发 |
| B: `tool_use_id` 文件配对 | ❌ 不可行 | 同上 + requestId 格式不匹配 |
| C: `additionalContext` 当前 | ✅ 唯一可行 | PostToolUse 对 MCP 工具正常触发，已验证 |

**结论**：PostToolUse additionalContext 注入是目前唯一可行的自动化 agent_name 注入路径。现有方案即为最优解，无需替换。

---

### MLFB server.mjs

在 `interactive_feedback` 工具的处理函数中，写入 session-config.json：

```js
// session_id 从 agent 传入的 agent_name 推断，或直接存储 agent_name
writeSessionConfig(sessionId, {
  type: "MLFB",
  agent_name: effectiveAlias,
});
```

**注意**：server 端的 `sessionId` 目前无法从 MCP 协议直接获取，需要用其他标识（如 agent_name 本身）作为 key。

### MLRA server.mjs

在 `register_LRA` 工具的处理函数中，Daemon 返回角色分配后写入：

```js
writeSessionConfig(callerId, {
  type: "MLRA",
  role: response.role,  // "expert" | "inspector" | "ceo"
  agent_name: callerAlias,
});
```

### 共用 writeSessionConfig 工具函数

```js
function writeSessionConfig(sessionId, data) {
  try {
    const configPath = join(
      process.env.HOME || process.env.USERPROFILE || "",
      ".copilot", "hooks", "session-config.json"
    );
    let existing = {};
    try {
      existing = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {}
    existing[sessionId] = data;
    writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");
  } catch (e) {
    console.error("[session-config] Failed to write:", e.message);
  }
}
```

---

## agent_name 参数统一与废弃

### 现状

- hook 通过 MD5(session_id) 计算 agent_name，并通过 `systemMessage`/`additionalContext` 注入给 agent
- agent 在调用 `interactive_feedback` 时需要传入 `agent_name` 参数
- server 通过传入的 `agent_name` 来识别 caller

### 目标状态

| 层 | 现状 | 目标 |
|---|---|---|
| hook 注入 | 6 个事件，各事件都注入 agent_name | 保持 Stop + PostToolUse（必要）；agent_name 注入仍然必须 |
| agent 行为 | 每次调用 `interactive_feedback` 时传入 `agent_name` | 继续传入（server 无法自动识别，MCP 协议无 session 上下文）|
| server 识别 | 依赖 `args.agent_name` 参数 | 继续依赖（VSCODE_TARGET_SESSION_LOG 方案已验证不可行）|

> **验证结论（2026-04-21）**：`VSCODE_TARGET_SESSION_LOG` 在 MCP server 进程中不存在。server 无法自动感知 session_id。hook 注入 agent_name 的现有方案是目前唯一可靠路径。

### hook stdin 已验证字段（PostToolUse）

```json
{
  "timestamp", "hook_event_name", "session_id", "transcript_path",
  "tool_name", "tool_input", "tool_response",
  "tool_use_id",   ← 每次工具调用的唯一 ID（跨 session 唯一）
  "cwd"
}
```

`tool_use_id` 是每次工具调用的全局唯一标识（如 `toolu_bdrk_019h4c...`），如果 MCP SDK 暴露对应的 JSON-RPC id，可实现精确的 hook → server 配对，完全消除并发歧义。这是未来进一步自动化的技术基础，但当前方案（agent 传入 agent_name）已足够可靠。

### 所有 8 个有效 hook 事件（官方文档确认）

`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`PreCompact`、`SubagentStart`、`SubagentStop`、`Stop`

> **注**："正在启动服务器 PreToolUse"的错误源于 mcp.json 中误加了 PreToolUse 条目，与 hook 配置文件无关。PreToolUse 作为 hook 事件是完全有效的。

### PreToolUse 输出 schema（官方）

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow | deny | ask",
    "permissionDecisionReason": "...",
    "updatedInput": { ... },
    "additionalContext": "..."
  }
}
```

`updatedInput` 注意：格式须匹配工具期望的 schema，否则被忽略。可在 agent debug log 中查看工具 schema。

---

## 文件变更清单

| 文件 | 变更类型 | 内容 |
|------|---------|------|
| `~/.copilot/hooks/scripts/inject-agent-name.mjs` | 修改 | Stop 分支改为读取 session-config.json 并按类型/角色分流 |
| `e:/Dev/my-last-feedback/server.mjs` | 修改 | `interactive_feedback` 首次调用时写入 session-config.json（以 agent_name 为 key）|
| `e:/Dev/my-last-feedback/mlra-server/server.mjs` | 修改 | `register_LRA` 角色确认后写入 session-config.json |
| `~/.copilot/hooks/session-config.json` | 新建（运行时） | Session 配置状态文件，由 App 写入，hook 只读 |

---

## 已确认的设计决策

1. **以 session_id 为 key**（不用 agent_name），因为 session_id 天然唯一且由 VS Code 注入
2. **未注册 session 默认 MLFB**，保持现有 Stop 阻断行为，无意外副作用
3. **hook 脚本只读状态文件**，写入由 App 负责，解耦清晰
4. **Expert 和 Inspector 提醒分开**，以角色名区分，避免 agent 混淆自身角色
5. **实时生效**，hook 每次事件触发重新执行脚本，状态文件写入即生效
6. **不使用 stop_hook_active 防死锁**，永续循环是设计目标
7. **VSCODE_TARGET_SESSION_LOG 与 hook session_id 一致**，两侧独立计算的 alias 必然相同
8. **agent_name 参数逐步废弃**：先变可选（向后兼容），server 优先使用自动计算值，最终版本删除参数

---

## 实现顺序建议

1. **Step 1**：修改 `inject-agent-name.mjs` 的 Stop 分支，读取 session-config.json 按类型/角色分流（可独立验证，不影响其他逻辑）
2. **Step 2**：修改 MLFB `server.mjs`，在 `interactive_feedback` 首次调用时写入 session-config.json（以 `agent_name` 为 key）
3. **Step 3**：修改 MLRA `server.mjs`，在 `register_LRA` 角色确认后写入 session-config.json
4. **Step 4**：手动创建测试 session-config.json，验证 hook 分流效果
5. **Step 5**（方案已关闭）：PreToolUse `updatedInput` 方案验证失败 — PreToolUse 不对 MCP 工具触发。当前方案（C: PostToolUse additionalContext）是唯一可行路径，无需替换。

---

## 验证记录（2026-04-21）

| 验证项 | 结果 | 结论 |
|--------|------|------|
| `VSCODE_TARGET_SESSION_LOG` 是否注入到 MCP server 进程 | ❌ 未注入 | server 无法自动计算 alias |
| `PostToolUse` hook stdin 是否包含 `tool_use_id` | ✅ 包含 | 每次工具调用有唯一 ID，可用于未来配对 |
| `PreToolUse` 是否为有效 hook 事件 | ✅ 有效（官方文档 8 个事件之一）| "正在启动 PreToolUse"是 mcp.json 误配置导致，与 hook 无关 |
| `PreToolUse` 是否对 MCP 工具触发 | ❌ 不触发 | 调用 `demo_echo_agent` 后 hook 日志文件未创建，脚本从未执行 |
| `PreToolUse updatedInput` 是否对 MCP 工具生效 | ❌ 不可行 | PreToolUse 本身不触发 MCP 工具，`updatedInput` 方案失败 |
| `tool_use_id` 是否等于 MCP JSON-RPC `requestId` | ❓ 未验证（方案已淘汰）| 依赖 PreToolUse，而 PreToolUse 不触发 MCP 工具 |
| 有效 hook 事件集合 | ✅ 已确认 | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, SubagentStart, SubagentStop, Stop |
| PostToolUse 是否对 MCP 工具触发 | ✅ 触发 | 已通过 PostToolUse stdin dump 验证 |
