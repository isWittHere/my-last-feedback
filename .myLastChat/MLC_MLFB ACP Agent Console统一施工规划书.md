---
title: MLFB ACP Agent Console统一施工规划书
description: 汇总ACP接入、MLFB风格UI与CBZWW流式体验的完整实施路线
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - ACP
  - Agent Console
  - opencode
  - Tauri
  - React
  - Streaming UI
solved_lists:
  - 梳理当前仓库中可接入ACP面板的前后端落点
  - 合并已有ACP、MLFB风格Agent Console、CBZWW Chat UI规划
  - 制定从静态面板到真实opencode ACP闭环的分阶段施工计划
---

# MLFB ACP Agent Console统一施工规划书

## 1. 文档目标

本文是一份面向实际开发的施工规划书，用于把此前几份规划统一成一条可执行路线：

- `MLC_MLFB_opencode_ACP接入规划方案.md`：确定 ACP 是结构化 agent 主协议，Terminal 只作为普通 shell 兜底。
- `MLC_K_opencode_ACP协议细则.md`：记录 opencode ACP 的启动方式、消息类型、权限、工具调用、模型、模式、取消等协议细节。
- `MLC_MLFB风格ACP Agent Console UI规划.md`：确定 Agent Console 应沿用 MLFB 反馈区的界面语言。
- `MLC_CBZWW Chat UI参考迁移规划.md`：确定 ContentBlock、process/result 分层、ProcessGroup 双模式和双区流式 Markdown 是关键体验来源。
- 当前仓库只读分析：确认实际代码入口、可复用组件、不能复用的 PTY 边界和第一阶段落点。

目标不是再写一个概念方案，而是明确：从今天的代码状态开始，应该改哪些模块、按什么顺序改、每个阶段做到什么程度、如何验收。

## 2. 总体结论

MLFB 的 Agent Console 应按以下路线落地：

```text
Phase 1：静态 Agent Console dock tab
  先建立 UI 骨架、agentStore、AgentContentBlock、mock timeline。

Phase 2：本地 mock streaming 与过程/结果分层
  验证 ProcessGroup、StreamingMarkdownContent、composer、权限卡片的交互。

Phase 3：Tauri agent_process 普通管道层
  新增 child process stdin/stdout/stderr 管理，不复用 PTY。

Phase 4：ACP JSON-RPC runtime
  实现 initialize、session/new、session/prompt、cancel 的协议闭环。

Phase 5：opencode provider 可用版
  将真实 opencode ACP session updates 映射到 MLFB Agent Event Model。

Phase 6：工具调用、权限、文件变更、附件、历史恢复
  逐步补齐 coding agent 的一等工作流能力。
```

第一步建议明确选择 **静态 Agent Console UI + mock 数据**，原因是：

- 当前仓库还没有 agent/acp 模块，需要先建立清晰边界。
- UI 组件和数据模型会影响后续协议 mapper，先定模型比先写进程层更稳。
- 不触碰 `CallerPanel` 主流程，也不复用 `TerminalPanel` PTY 层，风险最低。
- 可快速验证用户关心的“像 MLFB 反馈区一样的 Agent Console”和“CBZWW 风格过程展示”。

## 3. 当前仓库现状

### 3.1 前端入口

当前桌面前端入口是：

```text
app/src/App.tsx
app/src/components/FeedbackApp.tsx
```

`App.tsx` 负责：

- 初始化历史记录、prompt templates、queued drafts。
- 监听 feedback request、session cancelled、MLRA daemon message。
- 渲染 `TerminalEventBridge` 和 `FeedbackApp`。

未来 ACP 进程事件桥接应类似 `TerminalEventBridge`，新增：

```text
app/src/components/agent/AgentProcessEventBridge.tsx
```

并在 `App.tsx` 中与 `TerminalEventBridge` 并列挂载。

### 3.2 主界面与 Dock

`FeedbackApp.tsx` 当前有两个顶层视图：

```text
MLFB
MLRA
```

MLFB 视图结构为：

```text
DockColumn(leftSidebar)
DockColumn(leftPage)
caller-workspace
DockColumn(rightPage)
DockColumn(rightSidebar)
```

Dock tab 由 `feedbackStore.ts` 里的类型和数组驱动：

```text
SidePanelTab
KNOWN_DOCK_TABS
DEFAULT_DOCK_TABS
```

当前 tab 包括：

```text
mlc
resources
mlcPreview
previewBrowser
previewInfo
terminal
```

ACP 面板最自然的接入方式是新增：

```text
agentConsole
```

并作为一个可拖拽、可放入左右 page/sidebar 的 dock tab 管理。

### 3.3 需要同步修改的 Dock 位置

新增 `agentConsole` 时，需要同步修改：

```text
app/src/store/feedbackStore.ts
app/src/components/DockColumn.tsx
app/src/components/FeedbackApp.tsx
app/src/components/SettingsDialog.tsx
app/src/i18n/locales/zh.json
app/src/i18n/locales/en.json
```

具体内容包括：

- `SidePanelTab` 增加 `agentConsole`。
- `KNOWN_DOCK_TABS` 和 `DEFAULT_DOCK_TABS` 增加 `agentConsole`。
- `DockTabContent` 分发 `agentConsole -> <AgentConsolePanel />`。
- dock tab label 增加 `Agent Console` / `智能体控制台`。
- dock tab icon 建议先用现有 `robot` 或 `message-dot`。
- 设置页“面板管理”里的 `SETTINGS_DOCK_TAB_IDS` 增加该 tab。
- 拖拽预览的标题和图标同步补齐。

### 3.4 可复用组件

可直接复用：

```text
app/src/components/composer/ComposerEditor.tsx
app/src/components/MarkdownContent.tsx
app/src/components/Icons.tsx
app/src/components/AppSelect.tsx
app/src/components/AppTooltip.tsx
app/src/composer/promptCommands.ts
app/src/composer/composerTokens.ts
app/src/composer/resourceLinks.ts
```

最关键的是 `ComposerEditor`。它已经提供：

- contenteditable 输入。
- slash command menu。
- resource token 渲染。
- placeholder。
- paste/key/focus hooks。
- imperative handle：focus、insertText、syncValue、getSelectionRange。

因此 `AgentComposer` 应包装 `ComposerEditor`，而不是复用强绑定反馈业务的 `FeedbackInput`。

### 3.5 不建议直接复用的组件

不建议直接复用：

```text
CallerPanel
FeedbackInput
SummaryPanel
SubmittedFeedbackMarkdownView
ImageAttachmentWidget 整体
AttachmentTagBar 整体
QuickActions 整体
TransferSubmitSplit
```

原因：这些组件强绑定 feedback caller/session、submit_session_feedback、queued draft、测试日志、Git Action、transfer alias 等业务语义。

Agent Console 是用户主动驱动的 agent session，业务语义不同。第一版应只复用底层 UI primitives 和视觉风格。

### 3.6 终端边界

当前终端实现包括：

```text
app/src/components/TerminalPanel.tsx
app/src/components/TerminalEventBridge.tsx
app/src/store/terminalStore.ts
app/src-tauri/src/terminal.rs
```

这套实现是：

```text
portable-pty -> shell process -> xterm.js -> terminalStore
```

它适合普通 shell，不适合 ACP。ACP 必须走普通 child process pipe：

```text
child stdin/stdout/stderr -> nd-JSON JSON-RPC -> ACP runtime
```

禁止把 `opencode acp` 放进 PTY 或 xterm.js。否则会重新引入 ANSI/CSI、终端 replay、控制序列残片和 TUI 状态问题。

## 4. 目标架构

### 4.1 UI 到 Provider 总链路

```text
AgentConsolePanel
  -> agentStore
  -> Agent Event Model
  -> ACP Runtime
  -> OpenCode Provider Adapter
  -> Tauri agent_process commands/events
  -> child process: opencode acp
  -> stdio nd-JSON JSON-RPC
```

### 4.2 分层职责

```text
components/agent
  只负责界面、交互、布局、状态展示。

store/agentStore.ts
  管理 UI 可消费的 AgentSession、AgentMessage、AgentContentBlock、draft、attachments、pending permissions。

agent/acp
  管理 ACP JSON-RPC、request id、line buffer、initialize/session/prompt/cancel。

agent/opencode
  管理 opencode provider 默认 command、args、capability metadata、opencode-specific mapper。

src-tauri/src/agent_process.rs
  只负责启动进程、写 stdin、读 stdout/stderr、记录日志、发 Tauri event。
```

### 4.3 核心边界

UI 不直接解析 opencode 内部 HTTP/SSE。

UI 不直接消费 stdout raw text。

ACP runtime 不知道 React 组件。

Rust agent process 不理解 ACP 业务语义，只管进程和字节流。

Provider adapter 可以存 opencode-specific metadata，但不能污染通用 AgentContentBlock。

## 5. 数据模型规划

### 5.1 AgentSession

建议新增：

```text
app/src/agent/types.ts
app/src/store/agentStore.ts
```

基础类型：

```ts
export type AgentSessionStatus = "idle" | "starting" | "running" | "cancelling" | "disconnected" | "error";

export interface AgentSession {
  id: string;
  providerId: string;
  providerSessionId?: string;
  title: string;
  cwd: string;
  modelId?: string;
  modeId?: string;
  status: AgentSessionStatus;
  draft: string;
  attachments: AgentAttachment[];
  messages: AgentMessage[];
  pendingPermissionIds: string[];
  diagnostics: AgentDiagnosticEntry[];
  createdAt: string;
  updatedAt: string;
}
```

### 5.2 AgentContentBlock

ContentBlock 是 UI 和协议 mapper 的核心。建议从第一阶段就建立 process/result 分层：

```ts
export interface AgentBlockOrigin {
  phase: "process" | "result";
  placement: "inline" | "standalone";
  groupId?: string;
}

export type AgentContentBlock =
  | AgentTextBlock
  | AgentThinkingBlock
  | AgentToolCallBlock
  | AgentPermissionBlock
  | AgentTaskListBlock
  | AgentFileChangeBlock
  | AgentArtifactBlock
  | AgentCitationBlock
  | AgentErrorBlock;
```

第一阶段不必一次实现所有 block 渲染，但类型应预留。

### 5.3 AgentMessage

```ts
export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system";
  blocks: AgentContentBlock[];
  status: "streaming" | "complete" | "error";
  modelId?: string;
  createdAt: string;
  updatedAt?: string;
}
```

### 5.4 AgentProcessStep

`AgentProcessGroup` 不直接渲染 raw block，而是把 process blocks 归一成 step：

```ts
export type AgentProcessStepKind = "thinking" | "tool" | "permission" | "task_list" | "file_change" | "artifact" | "error";

export interface AgentProcessStep {
  id: string;
  kind: AgentProcessStepKind;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  summary?: string;
  blocks: AgentContentBlock[];
  startedAt?: string;
  endedAt?: string;
}
```

这与 CBZWW 的 `ProcessGroup` 思想一致，但语义更贴近 ACP/coding agent。

## 6. 前端模块规划

建议新增目录：

```text
app/src/agent/
  types.ts
  mockData.ts
  agentEvents.ts
  providers.ts
  acp/
    types.ts
    client.ts
    lineBuffer.ts
    mapper.ts
  opencode/
    provider.ts
    mapper.ts

app/src/store/
  agentStore.ts

app/src/components/agent/
  AgentConsolePanel.tsx
  AgentSessionHeader.tsx
  AgentMessageTimeline.tsx
  AgentMessageItem.tsx
  AgentProcessGroup.tsx
  AgentProcessStepView.tsx
  AgentResultBlocks.tsx
  AgentStreamingIndicator.tsx
  AgentComposer.tsx
  AgentActionBar.tsx
  AgentAttachmentBar.tsx
  AgentPermissionDock.tsx
  AgentProcessEventBridge.tsx
```

第一阶段可以少建一部分，但建议保持目录边界。

## 7. UI 设计规划

### 7.1 AgentConsolePanel 布局

第一版布局应与 MLFB 反馈区同构：

```text
AgentConsolePanel
  AgentSessionHeader
  AgentConversationSurface
    AgentMessageTimeline
  AgentComposerArea
    AgentPermissionDock
    AgentAttachmentBar
    AgentComposer
    AgentActionBar
```

视觉原则：

- 不做 landing page，打开就是可用工作台。
- 上方是可滚动记录区。
- 下方是输入区，视觉贴近 `panel-feedback`。
- 工具调用、权限、计划、文件变更是一等事件，不混在纯文本里。
- 过程默认可折叠，运行中自动展开或聚焦最新 step。

### 7.2 AgentSessionHeader

显示：

- provider：OpenCode。
- cwd。
- status：idle/running/cancelling/error。
- model/mode 占位。
- 新建 session、重启 provider、诊断入口占位。

第一阶段可以使用 mock provider 信息。

### 7.3 AgentMessageTimeline

要求：

- 支持 user message。
- 支持 assistant message。
- assistant message 内部拆分 process/result。
- 运行中自动滚动到底部，但用户手动上滚后不强制抢滚。
- 长内容区域保持文本可选中。

第一阶段 mock 数据至少包含：

- 一个 user prompt。
- 一个 assistant thinking。
- 一个 tool call。
- 一个 permission request。
- 一个 task list。
- 一个 result markdown。

### 7.4 AgentProcessGroup

借鉴 CBZWW `ProcessGroup`，保留两种模式：

```text
timeline
  线性展示思考、工具、权限、任务、文件变更。

tabs
  紧凑标签切换每个 step 的详情。
```

建议默认行为：

- message streaming 时展开。
- message complete 后折叠为摘要。
- 用户手动展开/切换模式后尊重用户选择。
- 摘要显示：正在思考、正在调用工具、等待权限、已完成 n 个步骤。

### 7.5 AgentResultBlocks

最终输出使用 `MarkdownContent`：

```text
AgentResultBlocks
  -> MarkdownContent variant="feedback" 或新增 agent variant
```

第二阶段再做 `StreamingMarkdownContent`：

```text
settled zone
  MarkdownContent

active zone
  span reveal chars
```

### 7.6 AgentComposer

`AgentComposer` 包装 `ComposerEditor`。

第一阶段支持：

- draft value。
- onChange。
- Ctrl+Enter send。
- placeholder。
- slash commands 占位。
- prompt history 占位。

暂不复用 `FeedbackInput`，但可以借鉴其 history navigation 和 paste image 逻辑。

### 7.7 AgentPermissionDock

权限请求应同时出现在两个位置：

- inline：在相关 process step 里显示。
- sticky：在 composer 上方显示 pending permission strip。

第一阶段用 mock permission request 验证 UI。

第二阶段接 ACP `requestPermission()`。

## 8. 后端 agent_process 规划

### 8.1 为什么新增后端模块

现有 `terminal.rs` 使用 portable-pty，它适合 shell/TUI，不适合 ACP。

ACP 需要普通进程管道：

```text
stdin  写 JSON-RPC line
stdout 读 JSON-RPC line
stderr 读诊断日志
```

建议新增：

```text
app/src-tauri/src/agent_process.rs
```

并在：

```text
app/src-tauri/src/lib.rs
```

中：

- `mod agent_process;`
- `.manage(AgentProcessManager::default())`
- `invoke_handler` 注册 commands。
- tray quit 时调用 `agent_process_manager.kill_all()`。

### 8.2 第一版 Rust 实现策略

Cargo 当前 tokio 没有启用 `process` feature。第一版可用标准库：

```text
std::process::Command
std::process::Stdio
std::thread::spawn
std::io::{Read, Write}
```

stdout/stderr 用 blocking reader thread 读取，写入 Tauri event。

这与 `terminal.rs` 的线程读法一致，不需要新增依赖。

### 8.3 Commands

建议命令：

```text
agent_process_start(command, args, cwd, env) -> AgentProcessInfo
agent_process_write(processId, data) -> Result
agent_process_kill(processId) -> Result
agent_process_list() -> Vec<AgentProcessInfo>
agent_process_read_log(processId) -> AgentProcessLog
```

第一版最小可只做：

```text
agent_process_start
agent_process_write
agent_process_kill
```

### 8.4 Events

建议事件：

```text
agent-process-output
agent-process-stderr
agent-process-exit
agent-process-error
```

payload 示例：

```ts
interface AgentProcessOutputEvent {
  processId: string;
  data: string;
}

interface AgentProcessExitEvent {
  processId: string;
  exitCode: number | null;
}
```

stdout 只进入 ACP runtime line buffer。

stderr 进入 diagnostics，不参与 JSON-RPC parser。

### 8.5 进程日志

建议在后端保留有限日志：

```text
stdoutTail
stderrTail
eventsTail
```

最大长度可以先设为 256 KB 或 512 KB，避免长期运行内存膨胀。

## 9. ACP Runtime 规划

### 9.1 Runtime 职责

ACP runtime 位于 TS 层，负责：

- 调用 `agent_process_start` 启动 `opencode acp`。
- 维护 stdout line buffer。
- 解析 nd-JSON。
- 维护 JSON-RPC request id -> pending promise。
- 分发 notification。
- 对 stderr/exit/error 做 provider diagnostics。

### 9.2 文件建议

```text
app/src/agent/acp/types.ts
app/src/agent/acp/lineBuffer.ts
app/src/agent/acp/client.ts
app/src/agent/acp/mapper.ts
```

### 9.3 JSON-RPC 基础模型

```ts
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}
```

### 9.4 最小协议闭环

优先实现：

```text
initialize
session/new
session/prompt
cancel
```

真实内容主要从 `sessionUpdate` notification 到达，不应只等待 `session/prompt` response。

### 9.5 ACP 到 Agent Event 的映射

runtime 不直接改 React 组件，而是转为内部事件：

```ts
type AgentEvent =
  | { type: "provider.started"; providerId: string; processId: string }
  | { type: "provider.exited"; providerId: string; processId: string; exitCode: number | null }
  | { type: "session.created"; sessionId: string; providerSessionId: string; cwd: string }
  | { type: "message.user.appended"; sessionId: string; messageId: string; text: string }
  | { type: "message.assistant.delta"; sessionId: string; messageId: string; text: string }
  | { type: "message.assistant.completed"; sessionId: string; messageId: string }
  | { type: "tool.started"; sessionId: string; toolCallId: string; title: string }
  | { type: "tool.updated"; sessionId: string; toolCallId: string; status: string; content?: unknown }
  | { type: "permission.requested"; sessionId: string; requestId: string; title: string; options: AgentPermissionOption[] }
  | { type: "permission.resolved"; sessionId: string; requestId: string; optionId: string }
  | { type: "diagnostic"; sessionId?: string; level: "info" | "warn" | "error"; message: string };
```

`agentStore` 消费这些事件并更新 UI state。

## 10. opencode Provider 规划

### 10.1 默认配置

```ts
export const OPENCODE_PROVIDER: AgentProvider = {
  id: "opencode",
  name: "OpenCode",
  protocol: "acp",
  command: "opencode",
  args: ["acp"],
  cwdStrategy: "workspace",
};
```

Windows 后续支持用户配置绝对路径：

```text
C:\Users\<user>\AppData\Local\Programs\opencode\opencode.exe
```

### 10.2 initialize 能力

initialize 后保存：

- protocolVersion。
- agentCapabilities。
- authMethods。
- agentInfo。
- sessionCapabilities。
- promptCapabilities。
- model/mode/configOptions。

UI 应按 capability 显示或隐藏功能。

### 10.3 认证处理

opencode 当前 `authenticate()` 未实现。实际策略：

- 若 initialize 返回 terminal-auth，显示登录指引。
- 若 prompt 返回 authRequired，提示运行 `opencode auth login`。
- 可以提供“在终端打开登录命令”的按钮，但这属于后续增强。

### 10.4 slash command

opencode ACP 支持部分 slash command，尤其 `/compact`。

MLFB 第一版策略：

- Composer 可输入 slash command。
- UI 不承诺 TUI 命令全兼容。
- command suggestions 后续从 ACP `available_commands_update` 合并到本地 commands。

## 11. 分阶段施工计划

### Phase 1：静态 Agent Console Dock Tab

目标：在 MLFB 中出现真实可打开的 Agent Console 面板，使用 mock session 数据。

文件改动：

```text
app/src/store/feedbackStore.ts
app/src/components/DockColumn.tsx
app/src/components/FeedbackApp.tsx
app/src/components/SettingsDialog.tsx
app/src/i18n/locales/zh.json
app/src/i18n/locales/en.json
app/src/agent/types.ts
app/src/agent/mockData.ts
app/src/store/agentStore.ts
app/src/components/agent/AgentConsolePanel.tsx
app/src/components/agent/AgentSessionHeader.tsx
app/src/components/agent/AgentMessageTimeline.tsx
app/src/components/agent/AgentMessageItem.tsx
app/src/components/agent/AgentProcessGroup.tsx
app/src/components/agent/AgentComposer.tsx
app/src/components/agent/AgentActionBar.tsx
app/src/index.css
```

验收标准：

- 设置页面板管理中能看到 Agent Console。
- dock tab 可拖拽到左右 sidebar/page。
- 打开后显示 header、timeline、composer。
- mock assistant message 有 process/result 分层。
- `AgentComposer` 使用 `ComposerEditor`。
- Ctrl+Enter 可把 draft 加入 mock timeline。
- 不影响 `CallerPanel`、终端、MLC、Preview Browser。

### Phase 2：Mock Streaming 与 ProcessGroup 双模式

目标：在无真实 ACP 的情况下验证 agent 输出体验。

任务：

- `AgentProcessGroup` 支持 timeline/tab 两种模式。
- mock send 后逐步追加 assistant delta。
- 实现 `AgentStreamingIndicator`。
- 初版 `StreamingMarkdownContent` 或轻量 streaming display。
- composer 上方显示 mock pending permission strip。

验收标准：

- 用户发送 prompt 后，UI 显示 user message。
- assistant 输出以流式方式增长。
- thinking/tool/permission/task/result 分区清晰。
- 运行中可取消 mock run。

### Phase 3：Rust agent_process PoC

目标：打通普通 child process 管道。

文件改动：

```text
app/src-tauri/src/agent_process.rs
app/src-tauri/src/lib.rs
app/src/components/agent/AgentProcessEventBridge.tsx
app/src/store/agentStore.ts
```

任务：

- 启动任意命令并读取 stdout/stderr。
- 写入 stdin。
- 进程退出能发 event。
- UI diagnostics 能看到 stderr 和 exit。

验收标准：

- 能启动一个简单 echo/stdio 测试进程。
- stdout 不进入终端，不经过 xterm。
- kill 后 UI 状态变为 disconnected 或 idle。

### Phase 4：ACP JSON-RPC Client

目标：在前端实现 ACP 协议基本状态机。

文件改动：

```text
app/src/agent/acp/types.ts
app/src/agent/acp/lineBuffer.ts
app/src/agent/acp/client.ts
app/src/agent/acp/mapper.ts
app/src/agent/opencode/provider.ts
```

任务：

- 维护 JSON-RPC request id。
- stdout chunk -> line buffer -> JSON parse。
- response resolve/reject。
- notification dispatch。
- initialize request。

验收标准：

- 能启动 `opencode acp`。
- 能收到 initialize response。
- UI 显示 OpenCode agentInfo 和 capabilities。
- 非法 JSON line 进入 diagnostics，不崩溃。

### Phase 5：opencode 最小会话闭环

目标：完成真实 prompt 流。

任务：

- session/new。
- session/prompt。
- sessionUpdate -> AgentContentBlock。
- cancel。
- authRequired 基础提示。

验收标准：

- 用户可在 Agent Console 里向 opencode 发送 prompt。
- assistant 文本流展示在 result 区。
- prompt 完成后状态回到 idle。
- cancel 可终止当前轮次。

### Phase 6：工具调用与权限 UI

目标：让 coding agent 的关键行为结构化可审计。

任务：

- tool_call -> process step。
- tool_call_update -> patch step status/result。
- requestPermission -> inline permission + sticky permission dock。
- allow once / always / reject 回写 ACP。
- edit 类权限显示文件路径和 diff 占位。

验收标准：

- 权限请求不会被埋在文本中。
- agent 等待权限时 UI 明确显示阻塞原因。
- 用户选择后 opencode 能继续或拒绝。

### Phase 7：附件、资源、历史恢复

目标：把 Agent Console 融入 MLFB 工作台。

任务：

- AgentAttachmentBar 支持图片、文件、MLC 文档、web attachment。
- 附件映射到 ACP prompt content blocks。
- session/list、session/load、resume/fork 能力按 capability 渐进实现。
- 与当前 workspace/caller session 建立引用关系。

验收标准：

- 用户能从 MLC 文档或资源面板附加上下文。
- 重启后能看到 provider session 入口。
- 加载历史不会破坏当前 feedback 历史。

## 12. 第一轮具体施工清单

如果下一步开始写代码，建议只做 Phase 1，清单如下：

1. 新增 `app/src/agent/types.ts`。
2. 新增 `app/src/agent/mockData.ts`。
3. 新增 `app/src/store/agentStore.ts`。
4. 新增 `app/src/components/agent/AgentConsolePanel.tsx`。
5. 新增 `AgentSessionHeader`、`AgentMessageTimeline`、`AgentMessageItem`、`AgentProcessGroup`、`AgentComposer`、`AgentActionBar`。
6. 修改 dock tab 类型与默认布局。
7. 修改 DockColumn 内容分发、label、icon。
8. 修改 FeedbackApp drag preview label/icon。
9. 修改 SettingsDialog 面板管理。
10. 添加中英文 i18n。
11. 添加 CSS。
12. 运行前端构建验证。

第一轮不做：

- Rust 后端。
- opencode 启动。
- JSON-RPC runtime。
- 真实 permission 回写。
- 文件 diff。
- session/load 历史恢复。

## 13. 风险与对策

### 13.1 过早复用 CallerPanel

风险：反馈提交主流程被 Agent Console 需求拖乱。

对策：第一版新增 agent 组件，不改 `CallerPanel` 业务逻辑。只复用 `ComposerEditor`、`MarkdownContent`、Icon、CSS token。

### 13.2 过早写后端协议

风险：UI 模型未定，协议 mapper 很快返工。

对策：先用 mock block 数据定 UI 和 store。

### 13.3 ACP 与 opencode 细节耦合

风险：UI 被 opencode-specific schema 绑定。

对策：UI 只消费 AgentContentBlock 和 AgentEvent。opencode-specific 信息放 metadata。

### 13.4 权限请求不醒目

风险：agent 等用户授权时看起来像卡住。

对策：inline permission card + composer 上方 sticky dock 双呈现。

### 13.5 stdout/stderr 混用

风险：stderr 日志破坏 JSON-RPC parser。

对策：Rust 层分离 stdout/stderr，TS 只把 stdout 送入 line buffer。

### 13.6 流式 Markdown 闪烁

风险：每个 delta 都完整 ReactMarkdown 重渲染导致抖动。

对策：Phase 2 引入 settled/active 双区渲染，settled zone 复用 `MarkdownContent`。

## 14. 验证策略

### 14.1 Phase 1 验证

- TypeScript build 通过。
- Dock tab 可见、可拖拽、可折叠。
- Agent Console 打开无空白、无布局溢出。
- mock send 可追加消息。
- 现有 MLFB feedback 提交不受影响。

### 14.2 Phase 3 验证

- 启动普通 stdio 测试进程。
- stdout/stderr 分流正确。
- kill 后无残留进程。
- app quit 时 kill_all。

### 14.3 Phase 4-5 验证

- `opencode acp` initialize 成功。
- request timeout 能提示。
- session/new 成功。
- session/prompt 内容通过 sessionUpdate 显示。
- cancel 后状态恢复。

## 15. 推荐当前下一步

推荐立即进入 Phase 1：

```text
静态 Agent Console Dock Tab + mock ContentBlock timeline
```

这是最小但最关键的一步。完成后，MLFB 会第一次拥有一个真实的 Agent Console 面板入口，后续 ACP runtime、opencode provider、工具调用、权限和流式体验都可以在这个稳定骨架上逐步接入。

第一轮完成后，再决定是否先深化流式 UI，还是直接开始 `agent_process.rs` 和 ACP initialize PoC。