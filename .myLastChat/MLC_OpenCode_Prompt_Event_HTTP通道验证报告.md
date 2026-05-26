---
title: OpenCode Prompt Event HTTP 通道验证报告
description: 通过独立 demo 验证 OpenCode HTTP prompt_async 与 SSE 事件流可替代 ACP prompt/update 通道
workplace: ${workspaceFolder}
project: my-last-feedback
type: report
tags:
  - OpenCode
  - Prompt
  - SSE
  - HTTP API
  - ACP Migration
solved_lists:
  - 创建独立 Prompt/Event probe demo
  - 验证 prompt_async 可通过 HTTP 提交
  - 验证 message.part.delta 可提供流式文本
  - 验证 message.updated 可作为完成事件
  - 验证 session.error 可映射模型错误
  - 验证临时 session 可在 prompt 后删除
---

# OpenCode Prompt Event HTTP 通道验证报告

验证日期：2026-05-06

## 1. 验证目标

上一轮验证已经确认 OpenCode CLI/server 的基础 HTTP 能力可用，包括 health、Basic Auth、session list、rename、delete、provider/model discovery 和 SSE 连接。

本轮重点验证 prompt 运行时通道：

- 能否通过 HTTP API 提交 prompt。
- 能否不经过 ACP 捕获实时事件。
- 能否从 SSE 中获得 assistant 文本增量。
- 能否识别 run 完成状态。
- 能否识别模型/API 错误。
- 能否通过 messages API replay 最终消息。
- 能否清理临时 session。

## 2. Demo 程序

新增 demo：`.myLastChat/opencode_prompt_event_probe_demo.cjs`

特性：

- 完全独立，不依赖主项目模块。
- 默认 dry-run，不消耗 token。
- 只有显式传入 `--prompt` 才提交真实 prompt。
- 支持 `--model provider/model` 指定模型。
- 支持 `--auto-model` 自动选模型。
- 支持 `--prefer-provider` 调整自动选择优先级。
- 同时监听 `/event?directory=...` 和 `/global/event`。
- 捕获并统计事件类型。
- 默认删除临时 session。
- Windows 下使用 `taskkill /T /F` 清理 `opencode serve` 子进程树。

## 3. 相关源码依据

### 3.1 Prompt HTTP API

源码位置：`ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/session.ts`

关键路由：

- `POST /session/:sessionID/message`
- `POST /session/:sessionID/prompt_async`

本轮选择 `prompt_async`，原因是它立即返回 204，真实流式状态由 SSE event 通道承载，更适合 MLFB UI 自己消费事件。

### 3.2 Prompt 输入结构

源码位置：`ref-repos/opencode-1.14.33/packages/opencode/src/session/prompt.ts`

核心结构：

```ts
PromptInput = {
  sessionID,
  messageID?,
  model?,
  agent?,
  noReply?,
  tools?,
  format?,
  system?,
  variant?,
  parts: [...]
}
```

本轮使用：

```json
{
  "parts": [{ "type": "text", "text": "Reply with exactly: MLFB probe ok" }],
  "model": { "providerID": "opencode", "modelID": "minimax-m2.5-free" }
}
```

### 3.3 事件类型

源码位置：`ref-repos/opencode-1.14.33/packages/opencode/src/session/message-v2.ts`

关键事件：

- `message.updated`
- `message.part.updated`
- `message.part.delta`
- `message.part.removed`

源码位置：`ref-repos/opencode-1.14.33/packages/opencode/src/session/session.ts`

关键事件：

- `session.created`
- `session.updated`
- `session.deleted`
- `session.diff`
- `session.error`

源码位置：`ref-repos/opencode-1.14.33/packages/opencode/src/session/todo.ts`

关键事件：

- `todo.updated`

## 4. 实测环境

- OS：Windows 10.0.22621
- Workspace：`E:\Dev\my-last-feedback`
- OpenCode CLI/server version：`1.14.39`
- Server command：`opencode serve --hostname 127.0.0.1 --port <random>`
- Auth：Basic Auth enabled
- Connected providers：`opencode-go`、`opencode`

## 5. 第一轮：错误链路验证

命令：

```bash
node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace "$PWD" --prompt "Reply with exactly: MLFB probe ok" --auto-model
```

结果文件：`.myLastChat/opencode_prompt_event_probe_result_2026-05-06T16-03-00-902Z.json`

自动选中模型：

- `opencode-go/minimax-m2.7`

结果：

- `prompt_async` 被接受。
- `/event` 与 `/global/event` 均收到事件。
- completion event 为 `session.error`。
- 错误为 `APIError`。
- 错误原因：`Insufficient balance`。
- 最终 messages 数量：2。
- 临时 session 删除成功。

事件统计：

```json
{
  "message.updated": 3,
  "message.part.updated": 1,
  "session.updated": 2,
  "session.status": 3,
  "session.diff": 1,
  "session.error": 1,
  "session.idle": 1
}
```

结论：

- 错误链路可捕获。
- MLFB 可以把 `session.error` 映射为 Agent Console 错误状态。
- 即使模型失败，HTTP/SSE 通道仍能完整回传状态。

## 6. 第二轮：成功文本流验证

命令：

```bash
node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace "$PWD" --prompt "Reply with exactly: MLFB probe ok" --model opencode/minimax-m2.5-free
```

结果文件：`.myLastChat/opencode_prompt_event_probe_result_2026-05-06T16-08-48-476Z.json`

指定模型：

- `opencode/minimax-m2.5-free`

结果：PASS

核心验证项：

| 验证项 | 结果 | 说明 |
| --- | --- | --- |
| server.spawn | PASS | 成功启动 `opencode serve` |
| global.health | PASS | version `1.14.39` |
| provider.list | PASS | 返回 117 个 providers、2 个 connected |
| prompt.model | PASS | 使用 `opencode/minimax-m2.5-free` |
| session.create | PASS | 创建临时 session 成功 |
| session.prompt_async | PASS | HTTP prompt_async accepted |
| prompt.completion.event | PASS | completion event 为 `message.updated` |
| session.messages.after_prompt | PASS | 最终 messages 为 2 |
| session.todo.after_prompt | PASS | todos 为 0 |
| prompt.model_response | PASS | 捕获 text delta，总长度 165 |
| events.instance.summary | PASS | instance SSE 捕获完整事件 |
| events.global.summary | PASS | global SSE 捕获完整事件 |
| session.delete | PASS | 临时 session 删除成功 |

## 7. 成功链路事件统计

`/event?directory=...` 与 `/global/event` 捕获到一致的 session-scoped 事件统计：

```json
{
  "message.updated": 4,
  "message.part.updated": 7,
  "session.updated": 2,
  "session.status": 2,
  "session.diff": 1,
  "message.part.delta": 4
}
```

捕获到的 part 类型：

- `text`
- `step-start`
- `reasoning`
- `text`
- `step-finish`

文本 delta 汇总长度：165

文本 delta 内容包含：

```text
MLFB probe ok
```

## 8. 最终 message replay 结构

成功后调用：

```http
GET /session/:sessionID/message?directory=<workspace>
```

返回 2 条 messages：

1. user message
2. assistant message

assistant message 包含 parts：

- `step-start`
- `reasoning`
- `text`
- `step-finish`

assistant info 包含：

- `role: assistant`
- `agent: build`
- `mode: build`
- `modelID: minimax-m2.5-free`
- `providerID: opencode`
- `finish: stop`
- token usage
- cost

这说明 MLFB 不只可以消费实时事件，还可以通过 messages API 恢复历史 session 的完整消息结构。

## 9. 对 MLFB Adapter 的直接启示

### 9.1 Prompt 提交

MLFB 可以使用：

```http
POST /session/:sessionID/prompt_async?directory=<workspace>
```

优点：

- 提交立即返回。
- UI 状态完全由 SSE 驱动。
- 更接近 OpenCode 官方 app 的事件模式。

### 9.2 流式文本

MLFB 应监听：

- `message.part.delta`

映射规则：

- `part.type === text` 且 `field === text`：追加到 assistant message。
- `part.type === reasoning` 且 `field === text`：追加到 thought/reasoning 区域。

注意：当前 demo 的 `textDelta` 汇总包含 reasoning 和 text。正式 adapter 需要按 part 类型拆分。

### 9.3 Tool/Step 展示

MLFB 应监听：

- `message.part.updated`

映射规则：

- `step-start`：创建 run step。
- `reasoning`：更新 thought part。
- `text`：更新 assistant text part。
- `tool`：更新工具调用状态。
- `step-finish`：标记 step 完成，写入 token/cost。

### 9.4 Run 完成判断

可用完成信号：

- `message.updated` 中 assistant info 出现 `finish`。
- `message.updated` 中 assistant info 出现 `time.completed`。
- `session.idle` 表示 session run 回到 idle。

本轮成功链路中 completion event 是 `message.updated`，finish 为 `stop`。

### 9.5 错误判断

错误信号：

- `session.error`
- assistant message info 中的 `error`
- `session.status` 回落后的状态
- `session.idle`

第一轮余额不足验证证明 `session.error` 可以完整承载 OpenCode/provider 错误。

### 9.6 最终状态回放

run 完成后建议拉取：

- `GET /session/:sessionID/message`
- `GET /session/:sessionID/todo`

原因：

- 确保 UI 与 OpenCode 存储一致。
- 补齐事件过程中可能错过的 part。
- 支持历史 session 恢复。

## 10. 尚未覆盖内容

本轮 prompt 很简单，没有触发：

- tool call。
- permission request。
- todo updates。
- abort/cancel。
- 文件 diff 之外的复杂状态。

下一轮可以设计一个受控 tool probe，例如要求模型读取一个安全文件或执行只读命令，但这会引入 permission/tool 策略，需要单独验证。

## 11. 实施建议

HTTP Adapter 的 prompt runner 建议按以下流程实现：

1. 确保 OpenCode server ready。
2. 如果当前 MLFB session 没有 providerSessionId，则 `POST /session` 创建。
3. 建立或复用 `/event?directory=...` SSE 订阅。
4. 调用 `POST /session/:id/prompt_async`。
5. 按事件更新 MLFB UI：
   - `message.updated`
   - `message.part.updated`
   - `message.part.delta`
   - `session.updated`
   - `session.status`
   - `session.error`
   - `session.idle`
   - `todo.updated`
6. run 完成后拉取 messages/todos 做最终 reconcile。
7. 错误时保留 session 和 user/assistant error message。
8. 用户删除 session 时调用 `DELETE /session/:id`。

## 12. 最终结论

OpenCode HTTP prompt/event 通道已经通过独立 demo 验证。

现在可以确认：

- OpenCode prompt 不需要 ACP。
- `prompt_async` 可以作为 MLFB 的 prompt 提交通道。
- SSE 事件可以替代 ACP session/update。
- `message.part.delta` 能提供流式文本。
- `message.part.updated` 能提供 part/step/reasoning/tool 状态。
- `message.updated` 能提供完成状态和 token/cost。
- `session.error` 能提供错误状态。
- messages API 能 replay 历史消息。
- 临时 session 可以在测试后删除。

这足以支撑下一阶段开始实现 `openCodeServerRuntime`、`openCodeHttpClient` 与 `openCodeAgentAdapter`，并逐步移除 OpenCode ACP 路径。