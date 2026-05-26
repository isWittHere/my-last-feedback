# OpenCode Tool Event HTTP/SSE 通道验证报告

## 结论

验证通过。OpenCode CLI/server 的 HTTP + SSE 通道可以稳定承载工具调用事件，不需要 ACP 适配层即可让 MLFB 捕获工具调用生命周期、输入、输出和元数据。

本轮验证覆盖了两个只读工具：

- `glob`: 文件匹配工具
- `grep`: 内容搜索工具

两者都通过 `/session/:id/prompt_async` 触发，并通过 `/event?directory=<workspace>` 与 `/global/event` 捕获到完整 `message.part.updated` 事件链。

## 运行环境

- Workspace: `E:\Dev\my-last-feedback`
- OpenCode server: `opencode serve --hostname 127.0.0.1 --port <auto>`
- OpenCode version: `1.14.39`
- Model: `opencode/minimax-m2.5-free`
- Auth: Basic Auth，demo 内设置 `OPENCODE_SERVER_PASSWORD`
- OS: Windows
- Probe script: `.myLastChat/opencode_prompt_event_probe_demo.cjs`

## Demo 增强

本轮对 `.myLastChat/opencode_prompt_event_probe_demo.cjs` 做了以下增强：

- 新增 `--allow-readonly-tools`
  - 在临时 session 上通过 `PATCH /session/:id` 设置 permission rules。
  - 允许 `glob` / `grep` / `read` / `list`。
  - 禁止 `edit` / `bash` / `external_directory`。
- 新增 `--expect-tool <tool>`
  - 验证指定工具是否出现在 `message.part.updated` 中。
  - 验证指定工具是否到达 `completed` 状态。
- SSE summary 新增：
  - `toolEvents`
  - `toolStatusCounts`
  - tool `input` / `output` / `metadata` / `error` 提取

## Glob 验证

命令：

```bash
node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace "$PWD" --prompt "Use the Glob tool exactly once to find files matching .myLastChat/opencode_*probe_demo.cjs, then answer with only the number of files found." --model opencode/minimax-m2.5-free --allow-readonly-tools --expect-tool glob
```

结果：PASS

报告文件：

```text
.myLastChat/opencode_prompt_event_probe_result_2026-05-06T16-16-23-456Z.json
```

关键结果：

```json
{
  "toolStatusCounts": {
    "glob:pending": 1,
    "glob:running": 1,
    "glob:completed": 1
  }
}
```

完成态 tool part：

```json
{
  "tool": "glob",
  "callID": "call_501245e5b9e64d2b82466b78",
  "status": "completed",
  "input": {
    "pattern": ".myLastChat/opencode_*probe_demo.cjs"
  },
  "output": "E:\\Dev\\my-last-feedback\\.myLastChat\\opencode_prompt_event_probe_demo.cjs\nE:\\Dev\\my-last-feedback\\.myLastChat\\opencode_http_probe_demo.cjs",
  "metadata": {
    "count": 2,
    "truncated": false
  }
}
```

观察：

- `pending` 阶段有 `callID` 和 `tool`，但 `input` 可能仍为空。
- `running` 阶段出现结构化 `input`。
- `completed` 阶段出现 `output` 和工具特定 `metadata`。
- `glob` 的 `metadata.count` 可直接用于 UI 摘要。

## Grep 验证

命令：

```bash
node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace "$PWD" --prompt "Use the Grep tool exactly once to search for the regex pattern my-last-feedback in files matching package.json, then answer with only the number of matching lines." --model opencode/minimax-m2.5-free --allow-readonly-tools --expect-tool grep
```

结果：PASS

报告文件：

```text
.myLastChat/opencode_prompt_event_probe_result_2026-05-06T16-17-58-547Z.json
```

关键结果：

```json
{
  "toolStatusCounts": {
    "grep:pending": 1,
    "grep:running": 1,
    "grep:completed": 1
  }
}
```

完成态 tool part：

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
  "output": "Found 1 matches\nE:\\Dev\\my-last-feedback\\package.json:\n  Line 2:   \"name\": \"my-last-feedback-mcp\",\r\n",
  "metadata": {
    "matches": 1,
    "truncated": false
  }
}
```

观察：

- `grep` 与 `glob` 的生命周期一致。
- `grep` completed 状态额外带有 `title`，适合用作工具调用标题。
- `metadata.matches` 可直接用于工具结果摘要。

## 源码结构确认

OpenCode `ToolPart` 结构来自 `ref-repos/opencode-1.14.33/packages/opencode/src/session/message-v2.ts`：

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

`ToolState` 是以下状态的 union：

- `pending`
- `running`
- `completed`
- `error`

本轮验证实际捕获到：

- `pending`
- `running`
- `completed`

`error` 状态虽然本轮没有用破坏性或失败工具刻意触发，但 schema 已确认存在，后续可以用不存在目录或非法 regex 做只读失败验证。

## 对 MLFB UI 映射的意义

HTTP/SSE Tool 事件可以映射到 MLFB Agent Console 的过程 UI：

- `message.part.updated` + `part.type === "tool"`
  - 创建或更新一个工具过程条目。
- `part.callID`
  - 作为稳定 key。
- `part.tool`
  - 工具类型，例如 `glob` / `grep`。
- `part.state.status`
  - 映射为 UI 状态：排队、运行中、完成、失败。
- `part.state.input`
  - 展示调用参数。
- `part.state.output`
  - 展示结果内容，可折叠。
- `part.state.metadata`
  - 展示摘要，例如 `count` / `matches` / `truncated`。
- `part.state.error`
  - 映射失败说明。

建议 adapter 层维护一个 `Map<callID, AgentToolEvent>`，每次收到新的 tool part 以 `callID` 合并更新，而不是追加重复条目。

## 权限策略验证

本轮通过 `PATCH /session/:id` 设置临时只读 ruleset：

```json
[
  { "permission": "glob", "pattern": "*", "action": "allow" },
  { "permission": "grep", "pattern": "*", "action": "allow" },
  { "permission": "read", "pattern": "*", "action": "allow" },
  { "permission": "list", "pattern": "*", "action": "allow" },
  { "permission": "external_directory", "pattern": "*", "action": "deny" },
  { "permission": "edit", "pattern": "*", "action": "deny" },
  { "permission": "bash", "pattern": "*", "action": "deny" }
]
```

结论：HTTP session permission 可以避免 headless server 在工具调用时进入 `permission.asked` 等待状态。后续 MLFB 可以按模式提供默认权限：

- 只读模式：允许 `read/list/glob/grep`，禁止 `edit/bash/external_directory`。
- 变更模式：由 MLFB UI 接管确认后再临时放行 `edit/apply_patch/write` 等。

## Tool Error 验证

命令：

```bash
node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace "$PWD" --prompt "Use the Glob tool exactly once with pattern * and path package.json, then stop. Do not use any other tool." --model opencode/minimax-m2.5-free --allow-readonly-tools --expect-tool glob --expect-tool-status error --timeout-ms 60000
```

结果：PASS

报告文件：

```text
.myLastChat/opencode_prompt_event_probe_result_2026-05-06T16-21-46-994Z.json
```

关键结果：

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

观察：

- `ToolStateError` 可通过 `message.part.updated` 捕获。
- `state.error` 是适合直接展示给用户的失败说明。
- 同一个 `callID` 仍然贯穿 `pending/running/error`，UI 可以用同样的合并策略更新。

补充观察：尝试用 `grep` 的非法 regex `[` 触发错误时，OpenCode 实际返回了 completed + `No files found`，说明不能假设所有工具参数异常都会进入 error。adapter 只应尊重事件实际状态。

## Permission Asked 验证

命令：

```bash
node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace "$PWD" --prompt "Use the Glob tool exactly once to find package.json, then stop." --model opencode/minimax-m2.5-free --ask-readonly-tools --expect-permission-asked --timeout-ms 60000
```

结果：PASS

报告文件：

```text
.myLastChat/opencode_prompt_event_probe_result_2026-05-06T16-24-15-033Z.json
```

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

事件计数：

```json
{
  "permission.asked": 1,
  "session.error": 1,
  "session.idle": 2,
  "toolStatusCounts": {
    "glob:pending": 1,
    "glob:running": 1,
    "glob:error": 1
  }
}
```

观察：

- 默认环境下 `glob` 没有触发 `permission.asked`，说明本机 OpenCode 配置可能已允许只读工具。
- 通过 `PATCH /session/:id` 显式设置 `ask` ruleset 可以强制触发 `permission.asked`。
- `permission.asked` 包含 `permission`、`patterns`、`metadata`，并通过 `tool.callID` 关联到对应工具 part。
- headless 验证中收到 `permission.asked` 后调用 `POST /session/:id/abort` 可释放会话，避免卡住。

## Abort 验证

命令：

```bash
node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace "$PWD" --prompt "Write a very long numbered list from 1 to 1000, one item per line. Do not summarize." --model opencode/minimax-m2.5-free --abort-after-ms 1000 --timeout-ms 60000
```

结果：PASS

报告文件：

```text
.myLastChat/opencode_prompt_event_probe_result_2026-05-06T16-25-15-192Z.json
```

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

观察：

- `POST /session/:id/abort` 返回 `true`。
- SSE 会出现 `session.error`，错误名为 `MessageAbortedError`。
- 随后可以观察到 `session.status` 的 `idle` 状态和 `session.idle` 事件。
- 消息 replay 中 assistant message 带 `info.error.name = "MessageAbortedError"`，adapter 可据此把当前运行态标记为已中断。
- abort 场景不应要求正常 assistant 文本完成。

## 验证结论

本轮关键验证完成：

- HTTP prompt 可以触发 OpenCode 工具调用。
- SSE 可以捕获工具调用生命周期。
- `ToolPart` 数据足以驱动 MLFB 的工具过程 UI。
- session 级 permission ruleset 可用于 headless 场景，避免工具权限交互卡住。
- `ToolStateError`、`permission.asked`、`session.abort` 均已验证，可覆盖失败、权限确认和中断路径。
- 临时 session 已在 probe 结束后删除。

这进一步支持无 ACP 方向：OpenCode HTTP/SSE 通道不仅能做 session/prompt/message，也能覆盖工具过程、工具失败、权限请求和主动中断。下一步可以开始设计 HTTP adapter 的事件归一化层。
