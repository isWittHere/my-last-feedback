---
title: MLFB OpenCode 服务端 Slash 命令 HTTP 集成规划书
description: 规划 MLFB 通过 OpenCode HTTP API 支持服务端 slash command
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - OpenCode
  - Slash Command
  - HTTP
  - Agent Console
solved_lists:
  - 明确只支持 OpenCode 服务端命令模板，不实现 UI-only slash 命令
  - 明确 GET /command 与 POST /session/:sessionID/command 的通信方式
  - 制定 MLFB 端类型、client、store、composer、SSE 集成计划
---

# MLFB OpenCode 服务端 Slash 命令 HTTP 集成规划书

更新日期：2026-05-07

## 1. 背景

MLFB 当前正在将 OpenCode 接入从 ACP 路径迁移到本地 OpenCode server 的 HTTP/SSE 路径。普通 prompt、session 管理、tool event、permission、abort 等能力已经被证明可以通过 HTTP/SSE 覆盖。

下一步需要补齐 OpenCode 的 slash command 能力。这里的 slash command 特指 OpenCode 服务端命令模板能力，而不是 OpenCode App/TUI 自己的本地 UI 命令。

OpenCode 中存在两类容易混淆的 slash command：

- 服务端命令模板：由 OpenCode core/server 解析、列出、执行，可以通过 HTTP 通信完成。
- UI-only slash 命令：由 OpenCode App/TUI 自己注册，用于切换模型、打开终端、新建会话、撤销、分享等 UI 行为。

本规划只覆盖第一类。

## 2. 目标

本规划目标是在 MLFB Agent Console 中支持 OpenCode 服务端 slash command，使用户可以在 MLFB 自有 UI 中输入类似下面的内容：

```text
/test Button
```

然后 MLFB 通过 OpenCode HTTP API 调用真实的 OpenCode command 执行路径，而不是把 `/test Button` 当作普通文本 prompt 发给模型。

最终应达到：

- MLFB 能读取当前工作区可用 OpenCode command 列表。
- MLFB composer 能识别并提交服务端 slash command。
- command 执行走 OpenCode 原生 `SessionPrompt.command()`。
- command 执行后的 message、part、tool、todo、permission、status 仍由现有 SSE/event 通道驱动 UI。
- MLFB 不实现也不模拟 OpenCode App/TUI 的 UI-only slash 命令。

## 3. 非目标

本规划不包含以下内容：

- 不实现 `/new`、`/undo`、`/redo`、`/share`、`/unshare`、`/compact`、`/model`、`/agent`、`/terminal`、`/open` 等 OpenCode App/TUI 本地命令。
- 不复刻 OpenCode 官方 App 的 command palette。
- 不在 MLFB 前端展开 command template。
- 不把 command markdown 文件复制或解析到 MLFB。
- 不通过 `prompt_async` 模拟服务端 command。
- 不改变 OpenCode server 行为。
- 不引入 ACP 作为 slash command 实现路径。

## 4. OpenCode 服务端命令来源

OpenCode 的服务端 command 由 `Command.Service` 聚合，主要来源包括：

| 来源 | 描述 | MLFB 是否支持 |
| --- | --- | --- |
| 内建 command | OpenCode core 内置，如 `init`、`review` | 支持 |
| 配置 command | `opencode.jsonc` / config 中的 `command` 配置 | 支持 |
| command markdown | `.opencode/command/*.md` 或 `.opencode/commands/*.md` | 支持 |
| MCP prompt | MCP server 暴露的 prompts 映射为 command | 支持 |
| skill | OpenCode skills 暴露为 command | 支持 |
| App/TUI UI command | OpenCode 官方 UI 内部动作 | 不支持 |

关键原则：MLFB 只消费 OpenCode server 已经解析好的 command 列表，不自行扫描文件系统。

## 5. OpenCode HTTP API

### 5.1 命令列表接口

```http
GET /command
```

该接口返回当前 OpenCode instance 下可用的服务端命令列表。

返回值是 `Command.Info[]`，前端需要关心的字段为：

```ts
interface OpenCodeCommandInfo {
  name: string;
  description?: string;
  agent?: string;
  model?: string;
  source?: "command" | "mcp" | "skill";
  subtask?: boolean;
  hints: string[];
}
```

OpenCode 源码中的 `template` 字段也属于 `Command.Info`，但 MLFB 不应依赖它：

- MCP prompt 的 template 可能是 lazy/promise 语义。
- template 展开涉及 arguments、shell interpolation、agent/model/subtask 等服务端逻辑。
- 前端展示 template 可能泄露过多实现细节。
- 前端展开 template 会绕开 OpenCode plugin hook 和 command executed event。

因此 MLFB 只把 `GET /command` 用于发现、补全、展示和命中判断。

### 5.2 命令执行接口

```http
POST /session/:sessionID/command
```

请求体来自 `SessionPrompt.CommandInput` 去掉 `sessionID` 后的结构。

建议在 MLFB 中定义为：

```ts
interface OpenCodeCommandRequest {
  command: string;
  arguments: string;
  agent?: string;
  model?: string;
  variant?: string;
  messageID?: string;
  parts?: OpenCodeCommandFilePart[];
}

interface OpenCodeCommandFilePart {
  id?: string;
  type: "file";
  mime: string;
  url: string;
  filename?: string;
  source?: unknown;
}
```

注意：command endpoint 的 `model` 是字符串格式，例如：

```ts
"anthropic/claude-sonnet-4"
```

这和普通 `prompt_async` 的 model 对象不同：

```ts
{
  providerID: "anthropic",
  modelID: "claude-sonnet-4"
}
```

MLFB 需要提供一个转换函数，避免在提交路径中散落字符串拼接。

### 5.3 Directory scope

OpenCode server 的 command 列表与当前工作区 directory 相关。

MLFB 现有 OpenCode HTTP client 已经围绕 `directory` query 做 workspace scoped 请求。slash command 集成必须沿用这个模式：

```text
GET /command?directory=<cwd>
POST /session/:sessionID/command?directory=<cwd>
```

如果 OpenCodeHttpClient 内部已经统一注入 directory query，则新增 command 方法必须复用同一底层 request 方法。

## 6. OpenCode 服务端执行流程

`POST /session/:sessionID/command` 最终进入 `SessionPrompt.command()`。

服务端执行流程如下：

```text
MLFB composer
  -> OpenCodeHttpClient.command()
  -> POST /session/:sessionID/command
  -> SessionHttpApi.command handler
  -> SessionPrompt.command()
  -> Command.Service.get(name)
  -> 解析 arguments 与 template
  -> 解析 shell interpolation
  -> 决定 agent / model / subtask
  -> resolvePromptParts() 或构造 subtask part
  -> SessionPrompt.prompt()
  -> message/part/tool/todo/status events
  -> HTTP response completed
```

重要语义：

- command 不是普通 prompt 文本。
- command 会先展开模板，再进入普通 prompt 执行链路。
- command 支持 `$1`、`$2`、`$ARGUMENTS`。
- command 支持模板中的 shell 输出注入。
- command 支持配置默认 agent/model。
- command 支持 subtask part。
- command 执行完成后会发布 `command.executed` 事件。
- command 的消息和 part 生命周期仍进入普通 session event 流。

## 7. MLFB 目标架构

### 7.1 当前 OpenCode HTTP 路径

```text
Agent UI
  -> agentStore
  -> OpenCode runtime
  -> OpenCodeHttpClient
  -> Local OpenCode Server
  -> SSE event normalizer
  -> Agent UI state
```

### 7.2 增加服务端 command 后

```text
Agent Composer
  -> slash command parser
  -> availableCommands match
  -> OpenCodeHttpClient.command()
  -> Local OpenCode Server
  -> SessionPrompt.command()
  -> existing SSE event pipeline
  -> Agent message/process/todo UI
```

新增能力应尽量只作为现有 OpenCode HTTP adapter 的扩展，不引入新的 provider 或 runtime 分支。

## 8. 模块改造计划

### 8.1 `app/src/agent/opencode/httpTypes.ts`

新增 command 相关类型。

建议类型：

```ts
export type OpenCodeCommandSource = "command" | "mcp" | "skill";

export interface OpenCodeCommandInfo {
  name: string;
  description?: string;
  agent?: string;
  model?: string;
  source?: OpenCodeCommandSource;
  subtask?: boolean;
  hints?: string[];
}

export interface OpenCodeCommandFilePart {
  id?: string;
  type: "file";
  mime: string;
  url: string;
  filename?: string;
  source?: unknown;
}

export interface OpenCodeCommandRequest {
  command: string;
  arguments: string;
  agent?: string;
  model?: string;
  variant?: string;
  messageID?: string;
  parts?: OpenCodeCommandFilePart[];
}
```

如果现有 codebase 已有 file part 类型，应优先复用现有类型，避免重复定义。

### 8.2 `app/src/agent/opencode/httpClient.ts`

新增方法：

```ts
commands(): Promise<OpenCodeCommandInfo[]>;

command(
  sessionId: string,
  body: OpenCodeCommandRequest,
  options?: { signal?: AbortSignal }
): Promise<OpenCodeMessageWithParts>;
```

请求路径：

```ts
GET /command
POST /session/${encodeURIComponent(sessionId)}/command
```

注意事项：

- 复用已有 auth、directory、JSON error handling。
- 复用已有 base URL 组合逻辑。
- `sessionId` 必须 encode。
- `command()` 的返回类型如果当前没有明确 message-with-parts 类型，可先复用现有 prompt response 类型。
- 不要新增 `commandAsync()`，因为 OpenCode 1.14.33 没有对应 endpoint。

### 8.3 Agent store runtime state

在 OpenCode runtime/session state 中增加可用命令缓存。

建议结构：

```ts
openCodeCommandsByCwd: Record<string, OpenCodeCommandInfo[]>;
openCodeCommandsLoadingByCwd: Record<string, boolean>;
openCodeCommandsErrorByCwd: Record<string, string | null>;
```

也可以挂在 provider runtime 内部，避免污染通用 AgentSession 类型。

关键规则：

- command list 按 cwd 缓存。
- runtime ready 后加载一次。
- session cwd 变化后重新加载。
- command 执行前如果没有命令列表，应先 lazy load。
- 加载失败不影响普通 prompt。

### 8.4 Composer 输入识别

新增一个纯函数解析 slash command：

```ts
function parseServerSlashCommand(input: string):
  | { name: string; arguments: string }
  | null
```

建议规则：

- 输入 trimStart 后必须以 `/` 开头。
- 命令名取第一个空白前的 token。
- 命令名不能为空。
- arguments 保留原始剩余文本。
- 多行输入时，第一行解析 command name，剩余行并入 arguments。

示例：

```text
/review
```

解析为：

```ts
{ name: "review", arguments: "" }
```

示例：

```text
/test Button
add loading state
```

解析为：

```ts
{
  name: "test",
  arguments: "Button\nadd loading state"
}
```

### 8.5 Submit 分流

提交时分三步：

```text
1. parseServerSlashCommand(text)
2. 如果解析结果命中 availableCommands，调用 session.command
3. 否则走普通 prompt_async 或显示未知命令提示
```

推荐策略：如果用户输入以 `/` 开头但没有命中服务端 command，显示未知命令提示，不要静默当普通 prompt。

理由：

- 用户显式输入 slash，通常期望命令语义。
- 静默发送给模型会造成困惑。
- 未来命令名加载失败时可以明确反馈。

### 8.6 附件映射

OpenCode command endpoint 的 `parts` 只接受 file part。

MLFB composer 附件应映射为：

```ts
parts: attachments.map(toOpenCodeCommandFilePart)
```

正文文本不放进 `parts`，全部放进 `arguments`。

对于图片附件：

- 使用 data URL 或现有文件 URL。
- 保留 mime。
- 保留 filename。

对于普通文件附件：

- 优先复用现有 prompt attachment 到 OpenCode file part 的转换逻辑。
- 如果已有 `buildOpenCodePromptParts` 一类 helper，应拆出可复用 file part mapper。

### 8.7 本地 optimistic message 策略

执行 command 时，MLFB 不应先插入普通 user message。

原因：

- OpenCode server 会在 `SessionPrompt.prompt()` 中创建真实 user message。
- command 展开后的 prompt 可能不同于用户输入的 `/name args`。
- subtask command 会创建特殊 part。
- 本地先插入 `/name args` 容易和 SSE replay 产生重复。

推荐策略：

- 清空 composer。
- 将 session 标记为 running/submitting。
- 发起 `client.command()`。
- 等 SSE/message event 更新 UI。
- 如果命令请求失败且没有任何服务端事件，恢复输入或追加错误 toast。

### 8.8 状态与错误处理

因为 OpenCode 没有 `command_async`，`client.command()` 的 HTTP response 会等到执行完成。

MLFB 不应让 UI 阻塞等待 response。

推荐实现：

```ts
void client.command(sessionId, request, { signal })
  .catch((error) => handleCommandSubmitError(error));
```

同时：

- session running 状态由 SSE `session.status` 或现有状态事件驱动。
- abort 仍走现有 `POST /session/:sessionID/abort`。
- HTTP error 需要展示为 toast 或 system diagnostic。
- 如果 user abort，前端可 abort fetch signal，但真正停止模型执行仍应调用 OpenCode abort endpoint。

## 9. UI 行为规划

### 9.1 slash command 候选

当 composer 输入以 `/` 开头时，显示服务端 command 候选。

候选展示字段：

- command name：`/review`
- description：简短说明
- source：command / mcp / skill
- agent：可选 badge
- model：可选 badge

不展示 template。

### 9.2 命中规则

- `/review` 命中 command name `review`。
- `/review something` 命中 `review`，arguments 为 `something`。
- `/unknown` 若 command list 已加载且无命中，展示未知命令。
- command list 未加载完成时，可展示 loading 状态并延迟提交，或先尝试刷新。

### 9.3 空列表状态

如果当前工作区没有额外 command，但 OpenCode 仍应至少可能返回内建命令。

如果列表为空或加载失败：

- 不影响普通 prompt。
- slash 输入时显示“当前工作区没有可用 OpenCode 命令”或“命令加载失败”。

### 9.4 不支持 UI-only 命令的呈现

由于本规划明确不做 UI-only slash 命令，MLFB 不应把 `/model`、`/agent` 等硬编码到服务端 command 候选中。

如果用户输入 `/model` 且 OpenCode server command list 中没有 `model`：

- 提示“未找到 OpenCode 服务端命令：model”。
- 不打开 MLFB 模型选择器。
- 不把 `/model` 当普通 prompt 发送。

## 10. 事件流与历史恢复

command 执行最终调用普通 `prompt()`，所以事件流应复用现有 OpenCode SSE pipeline。

需要重点确认的事件类型：

- session status busy/idle
- message created/updated
- part created/updated
- tool call lifecycle
- permission asked/answered
- todo updated
- error event

历史恢复仍通过已有接口：

```http
GET /session/:sessionID/message
GET /session/:sessionID/todo
```

command 本身不需要额外 replay endpoint。

## 11. 验证计划

### 11.1 单元级验证

建议为纯函数添加轻量测试或至少手工用例：

- `parseServerSlashCommand("/review")`
- `parseServerSlashCommand("/review staged files")`
- `parseServerSlashCommand("  /review staged files")`
- `parseServerSlashCommand("/test Button\nmore context")`
- `parseServerSlashCommand("normal prompt")`
- `parseServerSlashCommand("/")`

### 11.2 HTTP client 验证

使用本地 OpenCode server 验证：

- `GET /command` 成功返回数组。
- `POST /session/:id/command` 能执行内建 `review` 或测试 command。
- Basic Auth 与 directory query 正常。
- 错误 command name 返回可读错误。

### 11.3 端到端验证

准备一个临时工作区 command：

```md
---
description: Generate button implementation plan
---

Please create an implementation plan for $ARGUMENTS.
```

在 MLFB 中输入：

```text
/test Button loading state
```

验收点：

- composer 识别 `/test`。
- 候选列表展示 test。
- 提交后调用 `session.command`。
- UI 不出现重复 user message。
- SSE 正常显示 assistant streaming/tool/todo。
- 历史恢复后消息完整。
- abort 可中止运行。

### 11.4 回归验证

需要确保普通 prompt 不受影响：

- 输入普通文本仍走 `prompt_async`。
- 输入包含斜杠但不是开头的文本不触发 command。
- command list 加载失败时普通 prompt 可继续发送。
- 切换 session/cwd 后 command list 不串工作区。

## 12. 阶段计划

### Phase 1：HTTP client 与类型

目标：打通最小 command HTTP 能力。

任务：

- 新增 command 类型。
- 新增 `OpenCodeHttpClient.commands()`。
- 新增 `OpenCodeHttpClient.command()`。
- 复用 auth/directory/error handling。
- 用临时调用或最小 probe 验证 endpoint。

验收：

- 能列出当前 workspace commands。
- 能通过代码调用执行一个 command。

### Phase 2：store 缓存与 runtime 集成

目标：让 MLFB runtime 感知当前 cwd 的服务端命令。

任务：

- runtime ready 后加载 commands。
- 按 cwd 缓存 command list。
- 暴露 refresh command action。
- 处理 loading/error 状态。

验收：

- 不同 cwd 的 command list 不串。
- OpenCode server 重启后可刷新。
- command list 加载失败不影响普通 prompt。

### Phase 3：composer 识别与提交分流

目标：用户输入 slash command 后走正确 endpoint。

任务：

- 新增 slash command parser。
- submit 前命中 availableCommands。
- 命中后调用 `session.command`。
- command 提交不插入本地 optimistic user message。
- 错误时 toast/diagnostic。

验收：

- `/test args` 走 `session.command`。
- 普通 prompt 仍走 `prompt_async`。
- 未知 slash command 不静默发送给模型。

### Phase 4：候选 UI 与体验完善

目标：提供可发现、可选择的服务端命令。

任务：

- composer `/` 触发候选列表。
- 展示 name/description/source/agent/model。
- 支持键盘选择。
- 支持刷新 command list。
- 加入 i18n 文案。

验收：

- 用户无需记忆命令名即可发现 command。
- command list loading/error/empty 状态清晰。
- UI 不出现 OpenCode App/TUI 的 UI-only 命令。

### Phase 5：事件恢复与边界修复

目标：确保 command 与现有 Agent Console 时间线完整兼容。

任务：

- 检查 command 展开后的 user message 展示。
- 检查 subtask part 展示。
- 检查 file/image attachments。
- 检查 abort、permission、tool、todo。
- 检查 session reload 历史恢复。

验收：

- command 执行过程和普通 prompt 一样可观察。
- 没有重复消息。
- reload 后历史一致。

## 13. 验收标准

整体完成后应满足：

- MLFB 能通过 `GET /command` 获取 OpenCode 服务端命令。
- MLFB 能通过 `POST /session/:sessionID/command` 执行命令。
- 自定义 markdown command 可用。
- MCP prompt command 可用。
- skill command 可用。
- 内建服务端 command 可用。
- command 支持 arguments。
- command 支持附件 file parts。
- command 执行不绕过 OpenCode 服务端模板展开。
- command 执行不产生重复 user message。
- command 执行过程由现有 SSE pipeline 更新 UI。
- UI-only slash 命令不会混入 command 候选。

## 14. 主要风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| command endpoint 没有 async 版本 | HTTP 请求可能长时间 pending | UI 不 await 阻塞，状态靠 SSE 驱动 |
| model 字段格式不同 | 请求失败或模型选择不生效 | 提供专门 model formatter |
| command list 与 cwd 强相关 | 多工作区命令串线 | 按 cwd 缓存并随 session cwd 刷新 |
| 前端误展开 template | 语义偏离 OpenCode | template 只由服务端处理 |
| 本地 optimistic message 重复 | 时间线混乱 | command 提交不插入本地 user message |
| MCP prompt lazy template | 前端无法可靠展示/展开 | 只展示 metadata，不读 template |
| 未知 slash 命令被当普通 prompt | 用户困惑 | 以 `/` 开头且未命中时提示未知命令 |

## 15. 关键源码参考

OpenCode 1.14.33 参考文件：

- `ref-repos/opencode-1.14.33/packages/opencode/src/command/index.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/config/command.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/session/prompt.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/index.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/session.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/groups/instance.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/groups/session.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/handlers/instance.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts`
- `ref-repos/opencode-1.14.33/packages/app/src/components/prompt-input/submit.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`

MLFB 预计改造文件：

- `app/src/agent/opencode/httpTypes.ts`
- `app/src/agent/opencode/httpClient.ts`
- `app/src/store/agentStore.ts`
- `app/src/components/agent/*Composer*` 或当前 Agent composer 相关组件
- `app/src/i18n/locales/zh.json`
- `app/src/i18n/locales/en.json`

## 16. 最终建议

先实现服务端 command 最小闭环：

```text
GET /command
  -> 保存 commands
  -> composer 识别 /name
  -> POST /session/:id/command
  -> SSE 更新 UI
```

不要在第一阶段处理 UI-only slash 命令，也不要在前端展开 command template。

这个范围足够小，但能覆盖 OpenCode 真正有价值的命令模板能力：自定义命令、MCP prompt、skill、内建 command。
