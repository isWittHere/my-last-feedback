---
title: OpenCode HTTP/SSE 无 ACP 验证
description: OpenCode CLI/server HTTP/SSE 能力验证与无 ACP 集成依据
workplace: e:\Dev\my-last-feedback
project: my-last-feedback
type: knowledge
tags:
    - knowledge
    - OpenCode
    - HTTP
    - SSE
    - ACP
    - AgentAdapter
---

# OpenCode HTTP/SSE 无 ACP 验证

## 1. 主题概述 (Topic Overview)

- **主题**: 验证 MLFB 是否可以绕开 ACP，直接使用 OpenCode CLI/server 的 HTTP API 与 SSE 事件流作为 Agent 能力层。
- **目标**: 为后续删除 OpenCode ACP 适配层提供可执行证据，确认 session、prompt、streaming、tool、permission、abort 等核心能力都能由 HTTP/SSE 覆盖。
- **讨论背景**: 早期 MLFB OpenCode 集成依赖 ACP JSON-RPC over stdio，但 ACP 在删除、重命名、session 元数据、模型发现、完整事件、工具生命周期等产品能力上不足。用户确认新方向为：MLFB 保留自己的 UI，OpenCode CLI/server 只作为本地能力层。

## 2. 背景与上下文 (Background & Context)

- **项目上下文**: MLFB 是 Tauri + React + TypeScript 应用，已有 Agent Console、Dock、session manager、composer、message/process/todo UI 等能力。
- **旧路径**: `app/src/store/agentStore.ts` 中的 OpenCode provider runtime 仍是 ACP 中心路径，使用 `initialize`、`session/new`、`session/list`、`session/load`、`session/prompt`、`session/set_model`、`session/set_mode` 等方法。
- **新路径**: 目标架构为 `MLFB Agent UI -> OpenCodeAgentAdapter -> OpenCodeHttpClient -> Local OpenCode Server -> OpenCode Core`。
- **关键动机**: OpenCode desktop/native 路线本身使用 local HTTP server + SDK，而不是 ACP。这说明 HTTP/server 是更完整、更官方的能力边界。

## 3. 技术方案 (Technical Solution)

- **方案概述**: 先不改主应用，使用 `.myLastChat/` 下的独立 probe demo 验证 OpenCode HTTP/SSE 能力。每个 demo 都能启动 `opencode serve`，设置 Basic Auth，连接 HTTP API/SSE，执行验证动作，写 JSON 报告，并清理临时 session/server。
- **核心组件**:
  - `.myLastChat/opencode_http_probe_demo.cjs`: 验证 server、auth、session list/create/rename/delete、provider/config。
  - `.myLastChat/opencode_prompt_event_probe_demo.cjs`: 验证 prompt_async、SSE streaming、tool lifecycle、permission.asked、abort。
  - `.myLastChat/MLC_MLFB_OpenCode无ACP迁移规划书.md`: 无 ACP 迁移规划。
  - `.myLastChat/MLC_OpenCode_CLI_Server_HTTP通道验证报告.md`: HTTP/session 验证报告。
  - `.myLastChat/MLC_OpenCode_Prompt_Event_HTTP通道验证报告.md`: prompt/event 验证报告。
  - `.myLastChat/MLC_OpenCode_Tool_Event_HTTP通道验证报告.md`: tool/error/permission/abort 验证报告。
- **技术选型**:
  - OpenCode CLI/server: `opencode serve --hostname 127.0.0.1 --port <port>`。
  - Auth: `OPENCODE_SERVER_PASSWORD` + Basic Auth。
  - Directory scope: query `directory=<workspace>`。
  - Event transport: `GET /event?directory=<workspace>` 和 `GET /global/event` SSE。
  - Mutation API: `POST /session`、`PATCH /session/:id`、`DELETE /session/:id`、`POST /session/:id/prompt_async`、`POST /session/:id/abort`。

## 4. 关键决策与理由 (Key Decisions & Rationale)

- **决定彻底脱离 ACP**: ACP 缺少产品级 session 管理能力和完整事件，不适合作为长期 OpenCode 集成边界。
- **采用 prototype-first**: 在主应用实现前先用独立 demo 验证真实 OpenCode server 行为，避免把不确定性带入 UI/store 重构。
- **使用 HTTP/SSE 作为 adapter 基础**: HTTP route 覆盖 session create/list/rename/delete/provider/config/prompt/abort，SSE 覆盖 message/tool/status/error/permission 事件。
- **保留 MLFB 自有 UI**: OpenCode 提供本地 Agent 能力，MLFB 负责 session 体验、tool UI、权限确认、历史和模型选择。
- **只读权限先行**: Tool 事件验证先只允许 `glob/grep/read/list`，禁止 `edit/bash/external_directory`，避免 probe 对用户工程产生破坏性变更。

## 5. 实现要点 (Implementation Details)

### 5.1 OpenCode Server 启动与认证

server 启动方式：

```bash
opencode serve --hostname 127.0.0.1 --port <port>
```

probe 运行时设置：

```js
env: {
  ...process.env,
  OPENCODE_SERVER_USERNAME: username,
  OPENCODE_SERVER_PASSWORD: password,
  OPENCODE_CLIENT: "mlfb-prompt-event-probe",
}
```

Windows 上 `opencode serve` 需要清理进程树：

```js
spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" })
```

### 5.2 已验证 HTTP API

- `GET /global/health`: server health/version。
- `GET /path`: path 信息。
- `GET /global/event`: 全局 SSE。
- `GET /event?directory=<workspace>`: workspace scoped SSE。
- `GET /session`: session list，不会创建 session。
- `POST /session`: 创建 session。
- `PATCH /session/:sessionID`: rename/title/permission 更新。
- `DELETE /session/:sessionID`: 删除 session。
- `GET /session/:sessionID/message`: replay 消息。
- `GET /session/:sessionID/todo`: replay todo。
- `POST /session/:sessionID/prompt_async`: 异步发送 prompt。
- `POST /session/:sessionID/abort`: 中断运行。
- `GET /provider`: provider/model discovery。
- `GET /config`: 配置读取。

### 5.3 Session HTTP 验证结果

报告：`.myLastChat/MLC_OpenCode_CLI_Server_HTTP通道验证报告.md`

验证结果：

- `opencode serve` 可启动本地 server。
- Basic Auth 工作，缺失认证返回 401。
- `session.list` 不会污染历史。
- HTTP 能创建、重命名、删除 session。
- Provider/model discovery 可用，观察到 117 providers，2 connected。
- 临时 session 可在验证后删除。

### 5.4 Prompt/Event 验证结果

报告：`.myLastChat/MLC_OpenCode_Prompt_Event_HTTP通道验证报告.md`

成功模型：`opencode/minimax-m2.5-free`

验证结果：

- `POST /session/:id/prompt_async` 可提交 prompt。
- `message.part.delta` 可提供流式文本/推理增量。
- `message.updated` 可作为完成事件。
- `session.error` 可映射模型错误，例如余额不足。
- `GET /session/:id/message` 可 replay 最终权威消息。
- 最终消息包含 user + assistant，assistant parts 包括 `step-start`、`reasoning`、`text`、`step-finish`。

### 5.5 Tool Lifecycle 验证结果

报告：`.myLastChat/MLC_OpenCode_Tool_Event_HTTP通道验证报告.md`

`glob` 验证命令：

```bash
node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace "$PWD" --prompt "Use the Glob tool exactly once to find files matching .myLastChat/opencode_*probe_demo.cjs, then answer with only the number of files found." --model opencode/minimax-m2.5-free --allow-readonly-tools --expect-tool glob
```

结果：PASS

```json
{
  "toolStatusCounts": {
    "glob:pending": 1,
    "glob:running": 1,
    "glob:completed": 1
  }
}
```

`grep` 验证命令：

```bash
node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace "$PWD" --prompt "Use the Grep tool exactly once to search for the regex pattern my-last-feedback in files matching package.json, then answer with only the number of matching lines." --model opencode/minimax-m2.5-free --allow-readonly-tools --expect-tool grep
```

结果：PASS

```json
{
  "toolStatusCounts": {
    "grep:pending": 1,
    "grep:running": 1,
    "grep:completed": 1
  }
}
```

completed tool part 结构要点：

```json
{
  "tool": "grep",
  "callID": "call_b77d3fdfed7e462e8e7a006d",
  "status": "completed",
  "title": "my-last-feedback",
  "input": {
    "pattern": "my-last-feedback",
    "include": "package.json"
  },
  "output": "Found 1 matches...",
  "metadata": {
    "matches": 1,
    "truncated": false
  }
}
```

### 5.6 Tool Error 验证结果

命令：

```bash
node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace "$PWD" --prompt "Use the Glob tool exactly once with pattern * and path package.json, then stop. Do not use any other tool." --model opencode/minimax-m2.5-free --allow-readonly-tools --expect-tool glob --expect-tool-status error --timeout-ms 60000
```

结果：PASS

```json
{
  "toolStatusCounts": {
    "glob:pending": 1,
    "glob:running": 1,
    "glob:error": 1
  }
}
```

错误态 tool part：

```json
{
  "tool": "glob",
  "callID": "call_function_lxsqdavp9zgn_1",
  "status": "error",
  "input": {
    "pattern": "*",
    "path": "package.json"
  },
  "error": "glob path must be a directory: E:\\Dev\\my-last-feedback\\package.json"
}
```

注意：尝试用 `grep` 的非法 regex `[` 触发错误时，OpenCode 返回 completed + `No files found`，没有进入 error。这说明 adapter 必须尊重实际事件状态，不能根据参数预判错误。

### 5.7 Permission Asked 验证结果

命令：

```bash
node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace "$PWD" --prompt "Use the Glob tool exactly once to find package.json, then stop." --model opencode/minimax-m2.5-free --ask-readonly-tools --expect-permission-asked --timeout-ms 60000
```

结果：PASS

关键事件：

```json
{
  "type": "permission.asked",
  "properties": {
    "permission": "glob",
    "patterns": ["package.json"],
    "metadata": {
      "pattern": "package.json"
    },
    "tool": {
      "messageID": "msg_dfe1aba680011YnVNK87espBKB",
      "callID": "call_e6c1bf1d63804210b04044b0"
    }
  }
}
```

abort 清理后的 tool part：

```json
{
  "tool": "glob",
  "callID": "call_e6c1bf1d63804210b04044b0",
  "status": "error",
  "input": {
    "pattern": "package.json"
  },
  "error": "Tool execution aborted",
  "metadata": {
    "interrupted": true
  }
}
```

结论：

- 默认环境下 `glob` 没触发 `permission.asked`，说明本机配置可能已允许只读工具。
- 显式 session ruleset 设置为 `ask` 可强制触发 `permission.asked`。
- `permission.asked` 可通过 `tool.callID` 关联到对应 tool part。
- headless 场景收到 `permission.asked` 后必须由 MLFB UI 处理，或者主动 abort，避免会话悬挂。

### 5.8 Abort 验证结果

命令：

```bash
node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace "$PWD" --prompt "Write a very long numbered list from 1 to 1000, one item per line. Do not summarize." --model opencode/minimax-m2.5-free --abort-after-ms 1000 --timeout-ms 60000
```

结果：PASS

关键结果：

```json
{
  "session.abort.request": true,
  "prompt.completion.event": "session.error",
  "assistantError": {
    "name": "MessageAbortedError",
    "data": {
      "message": "Aborted"
    }
  },
  "counts": {
    "session.error": 1,
    "session.idle": 2
  }
}
```

结论：

- `POST /session/:id/abort` 返回 `true`。
- SSE 会出现 `session.error`，错误名为 `MessageAbortedError`。
- 随后出现 `session.status idle` 和 `session.idle`。
- message replay 中 assistant message 带 `info.error.name = "MessageAbortedError"`。
- abort 场景不应要求正常 assistant 文本完成。

### 5.9 OpenCode ToolPart 源码结构

来源：`ref-repos/opencode-1.14.33/packages/opencode/src/session/message-v2.ts`

```ts
export const ToolPart = Schema.Struct({
  ...partBase,
  type: Schema.Literal("tool"),
  callID: Schema.String,
  tool: Schema.String,
  state: _ToolState,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Any)),
})
```

`ToolState` 状态：

- `pending`: 有 `input` 和 `raw`。
- `running`: 有 `input`、可选 `title/metadata`、`time.start`。
- `completed`: 有 `input/output/title/metadata/time`。
- `error`: 有 `input/error/metadata/time`。

## 6. 最佳实践与注意事项 (Best Practices & Considerations)

- **事件归一化**: adapter 应按 `message.part.updated` + `part.type === "tool"` 处理工具状态。
- **稳定 key**: 使用 `part.callID` 作为 tool UI 的稳定 key，后续状态按 `callID` 合并，不要追加重复工具条目。
- **状态映射**:
  - `pending`: 等待调用参数或权限。
  - `running`: 工具执行中，可展示 input。
  - `completed`: 展示 output 和 metadata 摘要。
  - `error`: 展示 error 和 metadata。
- **权限策略**:
  - 只读模式可允许 `read/list/glob/grep`。
  - 默认禁止 `edit/bash/external_directory`。
  - 需要变更文件时，由 MLFB UI 接管确认后临时放行。
- **permission.asked 处理**: UI 需要展示权限请求，使用 `permission`、`patterns`、`metadata` 和 `tool.callID` 关联到工具过程。headless probe 中如果不处理，应 abort。
- **abort 处理**: adapter 收到 `MessageAbortedError` 或 `session.idle` 后，应清理当前运行态，把消息标记为中断而不是失败的模型响应。
- **Windows 清理**: `opencode serve` 子进程树需要 `taskkill /PID <pid> /T /F`，否则 probe 容易残留 server。
- **不要依赖标题生成**: OpenCode session title 可能异步生成，不能把 `New session - ...` 当作空 session 的可靠判据。
- **不要预判工具错误**: 例如 `grep` pattern `[` 在本环境返回 completed + `No files found`，adapter 必须以 OpenCode 事件为准。

## 7. 相关资源 (Related Resources)

- **规划文档**: `.myLastChat/MLC_MLFB_OpenCode无ACP迁移规划书.md`
- **HTTP/session 验证报告**: `.myLastChat/MLC_OpenCode_CLI_Server_HTTP通道验证报告.md`
- **Prompt/Event 验证报告**: `.myLastChat/MLC_OpenCode_Prompt_Event_HTTP通道验证报告.md`
- **Tool/Event 验证报告**: `.myLastChat/MLC_OpenCode_Tool_Event_HTTP通道验证报告.md`
- **HTTP probe demo**: `.myLastChat/opencode_http_probe_demo.cjs`
- **Prompt/Event/Tool probe demo**: `.myLastChat/opencode_prompt_event_probe_demo.cjs`
- **OpenCode server route**: `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/session.ts`
- **OpenCode global route**: `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/global.ts`
- **OpenCode event route**: `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/event.ts`
- **OpenCode ToolPart schema**: `ref-repos/opencode-1.14.33/packages/opencode/src/session/message-v2.ts`
- **OpenCode permission schema**: `ref-repos/opencode-1.14.33/packages/opencode/src/permission/index.ts`
- **OpenCode glob tool**: `ref-repos/opencode-1.14.33/packages/opencode/src/tool/glob.ts`
- **OpenCode grep tool**: `ref-repos/opencode-1.14.33/packages/opencode/src/tool/grep.ts`

## 8. 待办与改进 (TODOs & Improvements)

- **待完成**:
  - 实现 `openCodeHttpClient`，封装 auth、directory、request、SSE reconnect。
  - 实现 OpenCode SSE event normalizer，把 OpenCode 原始事件转成 MLFB Agent events。
  - 实现 session lifecycle adapter：list/create/rename/delete/restore。
  - 实现 prompt adapter：prompt_async、streaming、message replay、error handling。
  - 实现 permission UI：展示 `permission.asked`，支持 once/always/reject 或等价策略。
  - 实现 abort UI：中断按钮调用 `POST /session/:id/abort` 并消费 `MessageAbortedError`。
  - 在 HTTP path 覆盖 UI 后删除 ACP OpenCode 集成代码。
- **已知问题**:
  - 当前主应用仍保留 ACP-era store/runtime 逻辑。
  - Probe 报告中包含多个临时 JSON 产物，后续可只保留关键 PASS 报告或归档。
  - 本机默认 OpenCode 配置可能允许只读工具，因此测试 `permission.asked` 需要显式 `ask` ruleset。
- **优化方向**:
  - 为 probe 增加 `--json-summary`，输出更短的 CI 友好摘要。
  - 为 adapter 增加事件 replay + live SSE 合并策略，避免页面刷新后丢失工具状态。
  - 对 `todo.updated`、多 tool 并发、MCP tool、文件编辑 permission 做后续验证。
  - 在 Windows/macOS/Linux 三个平台分别验证 server cleanup 和 path handling。
