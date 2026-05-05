---
title: opencode ACP协议细则
description: opencode ACP通信细则与MLFB接入知识记录
workplace: ${workspaceFolder}
project: my-last-feedback
type: knowledge
tags:
  - knowledge
  - opencode
  - ACP
  - Agent Console
  - Zed
  - JSON-RPC
---

# opencode ACP协议细则

## 1. 主题概述 (Topic Overview)

- **主题**: opencode 1.14.33 的 ACP（Agent Client Protocol）接入方式、协议行为、常见消息类型与 MLFB 实现要点。
- **目标**: 为 MLFB 未来实现结构化 Agent Console 提供知识基准，避免继续依赖 raw terminal/TUI 承载 agent 交互。
- **讨论背景**: MLFB 内置终端在 PowerShell/xterm.js/PTY 组合下出现 ANSI/CSI 控制序列残片和卡死问题。用户测试发现 `cmd.exe` 更稳定，但这只能降低普通终端风险，不能根治 agent 工作流的不稳定。因此转向分析 opencode ACP 与 Zed 扩展源码，确认更稳的结构化接入方案。

## 2. 背景与上下文 (Background & Context)

- **项目上下文**: MLFB 当前已有 Tauri + React 前端、Rust 终端 PTY 层、右侧 Dock/Terminal Panel，并计划引入更稳定的 agent UI。
- **相关组件/系统**:
  - MLFB Terminal：普通 shell/CLI 运行层，已调整为 Windows 默认 `cmd.exe`。
  - MLFB Agent Console：拟新增的结构化 agent 工作区。
  - opencode ACP：`opencode acp` 子进程，通过 stdio nd-JSON JSON-RPC 与编辑器/IDE 通信。
  - Zed extension：opencode 官方用于 Zed 的声明式 agent server 配置。
- **需求或问题**:
  - raw terminal 会受到 ANSI/CSI、xterm replay、PTY 缓冲裁剪、PowerShell/PSReadLine 等因素影响。
  - agent UI 需要结构化展示消息、工具调用、权限请求、计划、资源块和取消状态。
  - 希望未来 opencode 更新后，MLFB 能快速接入，不需要追踪 opencode desktop 内部 HTTP API。

## 3. 技术方案 (Technical Solution)

- **方案概述**: MLFB 应像 Zed 一样作为 ACP client 启动 `opencode acp`，通过普通 child process pipe 管理 stdin/stdout，不使用 PTY，不嵌入 opencode TUI。UI 层消费 MLFB 内部 Agent Event 模型，而不是直接消费 opencode 内部 HTTP/SSE schema。
- **技术选型**:
  - 子进程通信：stdin/stdout pipe。
  - 协议 framing：nd-JSON，每行一个 JSON-RPC 消息。
  - 协议语义：ACP v1，由 `@agentclientprotocol/sdk` 在 opencode 侧实现。
  - 首个 provider：opencode。
  - UI 模型：MLFB 自己的 Agent Session、Message、ToolCall、Permission、Resource 模型。
- **架构设计**:

```text
MLFB Agent Console UI
  -> MLFB Agent Store / Agent Event Model
  -> ACP Client Runtime
  -> OpenCodeAcpProvider
  -> child process: opencode acp
  -> stdio nd-JSON JSON-RPC
  -> opencode ACP adapter
  -> opencode SDK
  -> opencode internal HTTP server
  -> opencode core
```

## 4. 关键决策与理由 (Key Decisions & Rationale)

- **决策点 1：使用 ACP，而不是模仿 opencode desktop**
  - opencode desktop 使用本地 sidecar HTTP server + `@opencode-ai/sdk` + SSE，这是 opencode 自己的内部产品架构。
  - MLFB 若直接依赖该 HTTP API，会承担 server route、SDK 类型、SSE event schema、auth 方式变化的维护成本。
  - ACP 是官方对外编辑器/IDE 集成协议，更适合长期接入。

- **决策点 2：参考 Zed extension 的启动模式**
  - Zed 扩展源码几乎只有 `extension.toml`，核心是按平台下载 opencode 二进制并运行 `opencode acp`。
  - 这证明 opencode 推荐的外部编辑器集成方式是“编辑器作为 ACP client，opencode 作为 ACP server 子进程”。

- **决策点 3：ACP 子进程不走 PTY**
  - ACP stdout 是协议消息，不是终端输出。
  - 使用 PTY/xterm 会重新引入 ANSI/CSI、焦点报告、鼠标追踪等问题。
  - 应使用普通 child process pipe，并将 stderr 作为诊断日志。

- **决策点 4：UI 依赖内部统一事件模型**
  - 避免 UI 直接绑定 opencode 或 ACP SDK 细节。
  - 未来可扩展其他 ACP provider。
  - opencode-specific 信息放在 metadata 或 provider adapter 中。

## 5. 实现要点 (Implementation Details)

### 5.1 Zed extension 启动配置

opencode Zed extension 的关键配置：

```toml
[agent_servers.opencode]
name = "OpenCode"
icon = "./icons/opencode.svg"

[agent_servers.opencode.targets.windows-x86_64]
archive = "https://github.com/anomalyco/opencode/releases/download/v1.14.33/opencode-windows-x64.zip"
cmd = "./opencode.exe"
args = ["acp"]
```

含义：Zed 不嵌入 opencode UI，也不调 opencode HTTP API；它只是把 opencode 作为 ACP agent server 启动。

### 5.2 opencode ACP 命令启动链路

源码位置：`ref-repos/opencode-1.14.33/packages/opencode/src/cli/cmd/acp.ts`

核心逻辑：

```ts
process.env.OPENCODE_CLIENT = "acp"
const server = await Server.listen(opts)
const sdk = createOpencodeClient({
  baseUrl: `http://${server.hostname}:${server.port}`,
})
const stream = ndJsonStream(input, output)
const agent = await ACP.init({ sdk })
new AgentSideConnection((conn) => {
  return agent.create(conn, { sdk })
}, stream)
```

细节：

- `opencode acp` 内部仍会启动 opencode HTTP server。
- 但这个 HTTP server 是 ACP adapter 的内部实现，MLFB 不需要直接访问。
- ACP transport 使用 `ndJsonStream` 包装 stdin/stdout。
- `AgentSideConnection` 负责把 JSON-RPC 映射到 opencode 的 Agent 方法。

### 5.3 initialize

源码位置：`ref-repos/opencode-1.14.33/packages/opencode/src/acp/agent.ts`

opencode 返回：

```ts
{
  protocolVersion: 1,
  agentCapabilities: {
    loadSession: true,
    mcpCapabilities: {
      http: true,
      sse: true,
    },
    promptCapabilities: {
      embeddedContext: true,
      image: true,
    },
    sessionCapabilities: {
      fork: {},
      list: {},
      resume: {},
    },
  },
  authMethods: [authMethod],
  agentInfo: {
    name: "OpenCode",
    version: InstallationVersion,
  },
}
```

如果 client 声明 `clientCapabilities._meta["terminal-auth"] === true`，opencode 会返回：

```ts
{
  "terminal-auth": {
    command: "opencode",
    args: ["auth", "login"],
    label: "OpenCode Login",
  }
}
```

MLFB 可据此提供“打开登录命令”的 UI。

### 5.4 authentication

opencode 当前 `authenticate()` 未实现：

```ts
throw new Error("Authentication not implemented")
```

但当模型/API key 不可用时，opencode 会把 `LoadAPIKeyError` 转成 `RequestError.authRequired()`。

MLFB 的策略：

- initialize 后保存 authMethods。
- 收到 authRequired 时展示登录指引。
- terminal-auth 可触发 `opencode auth login`。
- 登录完成后重试 session/prompt。

### 5.5 session/new

`newSession(params)` 使用：

- `params.cwd`
- `params.mcpServers`

它会创建 opencode 内部 session，并返回：

```ts
{
  sessionId,
  configOptions,
  models,
  modes,
  _meta,
}
```

MLFB 应保存：

- sessionId
- cwd
- providerId
- model/mode/configOptions
- `_meta.opencode`，例如 variant 信息

### 5.6 session/load、list、resume、fork

opencode 支持：

- `loadSession(params)`：加载已有 session，并 replay 历史消息。
- `listSessions(params)`：按更新时间倒序列出 session，支持 cursor。
- `unstable_resumeSession(params)`：恢复 session 状态。
- `unstable_forkSession(params)`：fork session，并 replay fork 后的消息。

注意：`loadSession` 会通过 `sessionUpdate` 主动推送历史消息、工具调用、资源块和 usage update。MLFB 不能只等待 method response，还要同步接收 notification。

### 5.7 prompt 输入内容块

`prompt(params)` 支持以下 content block：

- `text`
  - 普通文本进入 opencode prompt。
  - `annotations.audience = ["assistant"]` 会映射为 synthetic。
  - `annotations.audience = ["user"]` 会映射为 ignored。
- `image`
  - 支持 base64 data。
  - 支持 `http:` URI。
- `resource_link`
  - 支持 `file://...`。
  - 支持 `zed://...?path=...`，用于 Zed 文件引用兼容。
- `resource`
  - text resource 转文本。
  - blob + mimeType 转 data URL 文件。

### 5.8 slash command

opencode 会把以 `/` 开头的纯文本 prompt 当作 slash command：

- 如果 command list 中存在，调用 `sdk.session.command()`。
- `/compact` 特殊处理为 `session.summarize()`。
- 文档中提到 `/undo`、`/redo` 等部分内置命令在 ACP 下暂不支持。

MLFB 初期可以先让用户输入 slash command，但 UI 不应承诺所有 TUI 命令完全可用。

### 5.9 prompt response 与 sessionUpdate

`prompt()` 最终返回：

```ts
{
  stopReason: "end_turn",
  usage,
  _meta: {},
}
```

但真实内容通过 `sessionUpdate()` 持续发送。

MLFB 应采用：

- request/response 负责生命周期边界。
- notification 负责实时 UI 内容。
- prompt response 表示本轮结束，不代表所有内容都只在 response 中。

### 5.10 sessionUpdate 类型

常见 update：

- `user_message_chunk`
- `agent_message_chunk`
- `agent_thought_chunk`
- `tool_call`
- `tool_call_update`
- `plan`
- `available_commands_update`
- `usage_update`

工具调用状态：

- `pending`
- `in_progress`
- `completed`
- `failed`

工具调用字段通常包括：

- `toolCallId`
- `status`
- `kind`
- `title`
- `locations`
- `rawInput`
- `content`
- `rawOutput`

### 5.11 tool kind 映射

opencode 映射规则：

```text
bash -> execute
webfetch -> fetch
edit / patch / write -> edit
grep / glob / context7_* -> search
read -> read
default -> other
```

locations 映射：

- `read/edit/write` 从 `filePath` 获取。
- `grep/glob` 从 `path` 获取。
- `bash` 默认没有 location。

### 5.12 permission request

opencode 监听内部 `permission.asked`，然后调用 ACP client 的 `requestPermission()`。

选项：

```ts
[
  { optionId: "once", kind: "allow_once", name: "Allow once" },
  { optionId: "always", kind: "allow_always", name: "Always allow" },
  { optionId: "reject", kind: "reject_once", name: "Reject" },
]
```

requestPermission 包含：

- `sessionId`
- `toolCall.toolCallId`
- `toolCall.status = "pending"`
- `title`
- `rawInput`
- `kind`
- `locations`

edit permission 特别行为：

1. opencode 从 metadata 读取 filepath 和 unified diff。
2. 应用 diff 得到 newContent。
3. 调用 ACP client 的 `writeTextFile()`。
4. 再回复内部 permission。

这意味着 MLFB 必须认真设计文件写入中介层，不应简单自动写入。

### 5.13 MCP

`newSession`、`loadSession`、`resumeSession`、`forkSession` 都接收 `mcpServers`。

remote MCP 映射：

```ts
{
  type: "remote",
  url,
  headers,
}
```

local MCP 映射：

```ts
{
  type: "local",
  command: [server.command, ...server.args],
  environment,
}
```

然后 opencode 调用内部 `sdk.mcp.add()` 加入当前 directory。

### 5.14 model、variant、mode、configOptions

session 加载时返回：

- `models.currentModelId`
- `models.availableModels`
- `modes.availableModes`
- `modes.currentModeId`
- `configOptions`
- `_meta.opencode.modelId`
- `_meta.opencode.variant`
- `_meta.opencode.availableVariants`

opencode 支持：

- `unstable_setSessionModel`
- `setSessionMode`
- `setSessionConfigOption`

MLFB UI 应根据 `configOptions` 动态渲染 model/mode，而不是写死模型列表。

### 5.15 cancel

opencode cancel 会调用：

```ts
sdk.session.abort({ sessionID, directory })
```

MLFB 应将取消按钮映射到 ACP cancel，并维护 running/cancelling 状态。

## 6. 最佳实践与注意事项 (Best Practices & Considerations)

- **不要用 PTY 跑 ACP**: `opencode acp` 是协议 server，不是 TUI。必须用 child process pipe。
- **stdout 与 stderr 分离**: stdout 进入 JSON-RPC parser；stderr 进入诊断日志。
- **按能力驱动 UI**: initialize 后根据 capabilities 决定是否展示 load/resume/fork/image/MCP/model/mode 等功能。
- **sessionUpdate 可早于/晚于 response**: UI 状态机必须同时处理 request response 和 notification。
- **权限必须显式可见**: requestPermission 应进入 MLFB 权限卡片，不应隐藏在消息流中。
- **文件写入必须中介化**: `writeTextFile` 不应无条件直接写文件，应结合权限状态、diff 预览和用户选择。
- **保留 provider metadata**: opencode variant 等信息放在 `_meta`，不要污染通用 Agent 模型。
- **slash command 不等于 TUI 命令全兼容**: `/compact` 可用，`/undo`、`/redo` 等需要按能力或文档限制处理。
- **MCP 配置要谨慎**: local MCP command/env 会启动外部进程，需要权限和审计。
- **认证不要假设 authenticate 可用**: opencode 当前主要依赖 authRequired + 外部登录命令。

## 7. 相关资源 (Related Resources)

- **Zed extension manifest**: `ref-repos/opencode-1.14.33/packages/extensions/zed/extension.toml`
- **ACP CLI command**: `ref-repos/opencode-1.14.33/packages/opencode/src/cli/cmd/acp.ts`
- **ACP Agent implementation**: `ref-repos/opencode-1.14.33/packages/opencode/src/acp/agent.ts`
- **ACP session state manager**: `ref-repos/opencode-1.14.33/packages/opencode/src/acp/session.ts`
- **ACP internal types**: `ref-repos/opencode-1.14.33/packages/opencode/src/acp/types.ts`
- **opencode ACP docs**: `ref-repos/opencode-1.14.33/packages/web/src/content/docs/zh-cn/acp.mdx`
- **opencode CLI docs**: `ref-repos/opencode-1.14.33/packages/web/src/content/docs/zh-cn/cli.mdx`
- **依赖项**:
  - `@agentclientprotocol/sdk@0.16.1`
  - `@opencode-ai/sdk`
  - `@modelcontextprotocol/sdk`

## 8. 待办与改进 (TODOs & Improvements)

- **待完成**:
  - 为 MLFB 设计 `AcpClientRuntime` 类型与 JSON-RPC request/response/notification 状态机。
  - 设计 `AgentEvent` 内部事件模型。
  - 设计 `AgentConsolePanel` 的消息、工具、权限、配置 UI。
  - 设计 `writeTextFile` 的安全中介流程。
  - 设计 opencode provider 配置和二进制发现策略。

- **已知问题**:
  - opencode `authenticate()` 当前未实现，需依赖 terminal-auth 或外部登录命令。
  - Zed extension 只有 manifest，没有可复用的 client 代码。
  - opencode ACP 中部分方法带 `unstable_` 前缀，MLFB UI 应做能力检测与降级。
  - ACP README 中提到的部分文件名可能与 1.14.33 实际源码不一致，应以源码为准。

- **优化方向**:
  - 将 ACP provider 设计成通用能力，opencode 只是第一个 provider。
  - 将权限、工具调用、文件 diff 与 MLFB 的 MLC/MLRA/反馈 session 打通。
  - 将 stderr、协议错误、authRequired、provider exit 统一进入诊断面板。
  - 后续可补充 opencode-specific 可选增强，但不得影响 ACP 主路径。