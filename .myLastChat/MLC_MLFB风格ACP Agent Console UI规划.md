---
title: MLFB风格ACP Agent Console UI规划
description: 规划复用MLFB反馈区域构建结构化Agent Console
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - Agent Console
  - ACP
  - UI
  - React
  - opencode
solved_lists:
  - 明确Agent Console应沿用MLFB反馈区域结构
  - 区分可直接复用组件与需抽象组件
  - 规划聊天时间线、底部输入框、权限与工具调用展示
---

# MLFB风格ACP Agent Console UI规划

## 1. 背景

MLFB 已经具备成熟的反馈工作区界面：上方展示请求/摘要/已提交内容，下方提供用户反馈输入框、附件栏、快捷操作与提交按钮。随着项目从 raw terminal 逐步转向 ACP Agent Console，新的问题不再只是“如何启动 agent”，而是“如何让 agent 会话成为 MLFB 原生体验”。

用户提出的核心 UI 判断是：

1. Agent 反馈区域应与当前 MLFB 反馈区域采用相似结构。
2. Agent 反馈区域就是聊天记录区域。
3. 底部输入框就是用户输入框。
4. MLFB 现有 UI 代码应尽量复用。

本规划围绕这一判断展开，目标是设计一个既符合 ACP 结构化事件，又延续 MLFB 反馈界面语言的 Agent Console。

## 2. 总体结论

Agent Console 应作为“MLFB 反馈区域的 agent 会话版本”实现，而不是复制 opencode desktop 的产品壳，也不是继续把 agent TUI 嵌进终端。

推荐设计原则：

```text
用 MLFB 的反馈界面语言承载 ACP 的结构化 agent 事件。
```

对应关系如下：

```text
当前 MLFB 反馈区域
  上方：请求摘要 / 上下文 / 已提交内容
  下方：反馈输入框 / 附件 / 快捷动作 / 提交按钮

未来 Agent Console
  上方：聊天记录 / assistant 输出 / 工具调用 / 权限 / 状态时间线
  下方：prompt 输入框 / 附件与上下文 / 模型模式 / 发送与取消按钮
```

这一方案同时满足：

- 产品一致性：用户不会感觉切到另一个外部工具。
- 代码复用：可以复用现有 composer、Markdown、附件、按钮、panel 样式。
- 协议稳定性：agent 主流程走 ACP，不依赖 PTY/xterm 控制序列。
- 长期扩展：opencode 作为首个 provider，后续可接入更多 ACP agent。

## 3. 当前 UI 基础分析

### 3.1 CallerPanel 的可借鉴结构

当前 `CallerPanel` 的核心结构是：

```text
CallerPanel
  SummaryPanel
  resize handle
  panel-feedback
    readonly branch
      ReadonlyTagBar
      ReadonlyComposerContent
      ReadonlyStatusBadge
    editable branch
      ImageAttachmentWidget
        AttachmentTagBar
        FeedbackInput
  bottom action area
    PromptButtons
    QuickActions
    TransferSubmitSplit
```

这个结构已经接近 Agent Console 所需的骨架：

- 上方大区域可替换为 agent timeline。
- 下方 panel-feedback 可继续作为 composer 区。
- 附件栏、输入框、快捷按钮、提交按钮都能复用或改造。
- readonly/editable 的状态切换经验可转为 idle/running/cancelling/disconnected 等 agent 状态。

### 3.2 FeedbackInput 的价值与限制

`FeedbackInput` 内部使用 `ComposerEditor`，具备以下能力：

- contenteditable 输入。
- slash command menu。
- prompt command option。
- resource token。
- placeholder。
- 图片粘贴。
- 历史上下键。
- focus tracking。
- 自动 focus。
- queued draft 支持。

但 `FeedbackInput` 本体强绑定反馈业务：

- `useFeedbackStore`
- `useActiveCallerSession`
- `feedbackText`
- `callerId`
- `queuedDraft`
- `addSessionImage`
- `updateSessionField`
- `setFocusedComposer`

因此它不适合被 Agent Console 直接使用。更好的做法是复用 `ComposerEditor`，并将 `FeedbackInput` 的部分交互逻辑提取到新的通用 composer 层。

### 3.3 SubmittedFeedbackMarkdownView 的价值与限制

`SubmittedFeedbackMarkdownView` 适合展示一次提交后的分段 Markdown，它通过 `##` heading 切分内容，并提供折叠区块。

Agent Console 的 timeline 不应直接复用该组件作为整体，因为 agent 输出是多轮、流式、消息化、事件化的：

- user message
- assistant text delta
- thought/reasoning block
- tool call
- tool call update
- permission request
- plan update
- error/system notice

但它的设计经验可以复用：

- MarkdownContent 渲染。
- 折叠区块。
- section header。
- composer token 支持。
- readonly 内容样式。

## 4. 产品形态规划

### 4.1 顶层布局

建议新增 `AgentConsolePanel`，视觉上贴近当前 CallerPanel：

```text
AgentConsolePanel
  AgentSessionHeader
  AgentConversationSurface
    AgentMessageTimeline
    AgentPermissionDock
  AgentComposerArea
    AgentAttachmentBar
    AgentComposer
    AgentActionBar
```

界面示意：

```text
┌──────────────────────────────────────────────┐
│ AgentSessionHeader                           │
│ provider / model / mode / cwd / status       │
├──────────────────────────────────────────────┤
│ AgentMessageTimeline                         │
│                                              │
│  User prompt                                 │
│  Assistant response                          │
│  Tool call rows                              │
│  Permission cards                            │
│  Plan updates                                │
│  Errors or notices                           │
│                                              │
├──────────────────────────────────────────────┤
│ AgentAttachmentBar                           │
│ AgentComposer                                │
│ Stop / Send / model / mode / attach context  │
└──────────────────────────────────────────────┘
```

### 4.2 上方区域：AgentMessageTimeline

上方区域不再是 `SummaryPanel`，而是完整 agent 会话时间线。

时间线应支持以下事件类型：

- 用户消息：用户每次发送的 prompt。
- Assistant 消息：流式文本、最终文本、Markdown。
- Thought 或 reasoning：默认折叠，避免干扰主阅读流。
- Tool call：显示工具名称、参数摘要、状态、耗时、结果摘要。
- Tool call update：对长时间工具调用展示 running/progress/completed/failed。
- Permission request：展示允许、拒绝、编辑、始终允许等操作。
- Plan update：展示 todo/plan/checklist。
- File change：展示写入、编辑、删除、diff 链接。
- Resource link：展示文件、URL、MLC 文档、web attachment。
- Error/system notice：展示 provider 错误、ACP 断连、权限失败、取消结果。

视觉上建议使用“记录流 + 紧凑分组”，而不是传统聊天气泡式界面。coding agent 的关键不是聊天感，而是工作过程可审计。

### 4.3 下方区域：AgentComposerArea

下方区域应复用当前 `panel-feedback` 的视觉语言：

- 附件标签栏在输入框上方。
- 输入框占据主要空间。
- 底部操作条放发送、取消、模型、模式、上下文等按钮。

发送逻辑：

- 用户输入 draft。
- 点击 Send 或快捷键发送。
- UI 立即追加 user message。
- 通过 ACP `session/prompt` 发送。
- running 状态下 Send 变为 Stop 或 Cancel。
- 子进程或 session 错误时显示结构化 error notice。

### 4.4 Permission Dock

权限请求不能只埋在 timeline 深处。建议同时提供两种呈现：

1. 在相关 tool call 附近显示 inline permission card，保留上下文。
2. 在 composer 上方显示 sticky pending permission strip，确保用户不会错过阻塞中的请求。

这样可以避免 agent 运行中等待权限但用户不知道为什么卡住。

## 5. 组件复用策略

### 5.1 可以直接复用

以下组件或能力可以直接复用：

- `ComposerEditor`
- `MarkdownContent`
- `Icon`
- `PromptIcon`
- composer token 解析与渲染能力
- resource link token 视觉
- prompt command option 概念
- 当前 panel、input、markdown 的 CSS token 和主题变量

其中 `ComposerEditor` 是最重要的直接复用点。它已经足够通用，只需要由新的 `AgentComposer` 传入 agent store 的 value、onChange、onPaste、commands、projectDirectory。

### 5.2 可以抽象后复用

以下组件建议抽象后复用：

| 当前组件或逻辑 | 抽象方向 | Agent Console 用途 |
| --- | --- | --- |
| `FeedbackInput` | `AgentComposer` 或 `GenericComposerBox` | agent prompt draft 输入 |
| `ImageAttachmentWidget` | 通用附件容器 | 图片、文件、上下文拖拽粘贴 |
| `AttachmentTagBar` | `AttachmentTagList` / `AgentAttachmentBar` | ACP content blocks 展示与移除 |
| `PromptButtons` | 通用 command button strip | ACP available commands 与 MLFB prompt commands |
| `QuickActions` | `AgentActionBar` | Send、Stop、Regenerate、Attach、New Session |
| CallerPanel 分区布局 | `ResizableConversationLayout` | timeline 与 composer 上下布局 |
| readonly 折叠 Markdown | `TimelineCollapsibleBlock` | thought、tool details、large output |

### 5.3 不建议直接复用

以下组件或逻辑不建议直接用于 Agent Console：

- `CallerPanel` 整体。
- `FeedbackInput` 整体。
- `SummaryPanel` 作为 agent timeline。
- `SubmittedFeedbackMarkdownView` 作为完整对话记录。
- `ReadonlyComposerContent` 作为 agent 历史记录。
- `buildSubmittedFeedback`。
- `submit_session_feedback` 相关流程。
- feedbackStore 的 `Session` 类型。

原因是这些组件绑定“外部 caller 请求用户反馈”的业务语义，而 Agent Console 是“用户主动驱动 agent session”的业务语义。

## 6. 新增组件规划

### 6.1 AgentConsolePanel

职责：

- 承载 Agent Console 的整体布局。
- 管理当前 active agent session。
- 协调 header、timeline、composer、permission dock。
- 处理空状态、未连接、provider 缺失、session loading 等顶层状态。

### 6.2 AgentSessionHeader

职责：

- 显示 provider，例如 OpenCode。
- 显示 model、mode、cwd、session title。
- 显示连接状态、running 状态、token/cost 摘要。
- 提供 New Session、Load Session、Restart Provider、Settings 等入口。

### 6.3 AgentMessageTimeline

职责：

- 消费 agentStore 的 timeline items。
- 按事件顺序渲染 user、assistant、tool、permission、plan、error。
- 支持 streaming delta 合并。
- 支持自动滚动到底部，但用户手动上滚时不强制抢滚动。
- 支持按 session 持久化 scroll position。

### 6.4 AgentMessageItem

职责：

- 渲染 user/assistant/system 文本消息。
- 使用 `MarkdownContent` 渲染正文。
- 显示 role、时间、模型、状态。
- 支持 partial/running 状态。

### 6.5 AgentToolCallView

职责：

- 展示工具调用名称、kind、状态、参数摘要。
- 展示结果摘要、文件链接、错误。
- 支持折叠详情。
- 对文件编辑工具可提供 diff/preview/accept/reject 入口。

### 6.6 AgentPermissionRequestView

职责：

- 展示 ACP permission request。
- 支持 Allow、Deny、Always Allow、Edit 等操作。
- 显示请求来源、工具名称、目标文件、命令、风险摘要。
- 与 ACP runtime 的 permission response 关联。

### 6.7 AgentComposer

职责：

- 包装 `ComposerEditor`。
- 绑定 agentStore 的 draft。
- 支持 send shortcut。
- 支持 history navigation。
- 支持 paste image/resource。
- 注入 ACP available commands。
- 支持 disabled/running/cancelling 状态。

### 6.8 AgentAttachmentBar

职责：

- 展示当前 prompt 附带的图片、文件、MLC 文档、web 资源、context。
- 提供移除、清空、预览、打开资源等操作。
- 将 UI 附件映射到 ACP prompt content blocks。

### 6.9 AgentActionBar

职责：

- idle 状态显示 Send。
- running 状态显示 Stop/Cancel。
- 支持 Regenerate、Continue、Attach Context、Model、Mode、MCP、New Session。
- 可复用当前 bottom fused area 的布局和按钮密度。

## 7. 数据模型规划

### 7.1 AgentSession

建议新增 agent store，不复用 feedback session：

```ts
interface AgentSession {
  id: string;
  providerId: string;
  acpSessionId?: string;
  title: string;
  cwd: string;
  modelId?: string;
  modeId?: string;
  status: "idle" | "running" | "cancelling" | "disconnected" | "error";
  draft: string;
  attachments: AgentAttachment[];
  timeline: AgentTimelineItem[];
  pendingPermissionIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

### 7.2 AgentTimelineItem

```ts
type AgentTimelineItem =
  | AgentMessageItem
  | AgentToolCallItem
  | AgentPermissionItem
  | AgentPlanItem
  | AgentFileChangeItem
  | AgentErrorItem
  | AgentSystemNoticeItem;
```

### 7.3 AgentMessageItem

```ts
interface AgentMessageItem {
  id: string;
  type: "message";
  role: "user" | "assistant" | "system";
  content: AgentContentBlock[];
  status: "streaming" | "complete" | "error";
  modelId?: string;
  createdAt: string;
  updatedAt?: string;
}
```

### 7.4 AgentAttachment

```ts
interface AgentAttachment {
  id: string;
  kind: "image" | "file" | "resource" | "mlc" | "web" | "text";
  name: string;
  path?: string;
  uri?: string;
  mimeType?: string;
  dataUrl?: string;
  text?: string;
  metadata?: Record<string, unknown>;
}
```

## 8. ACP事件到UI的映射

### 8.1 Prompt发送

```text
AgentComposer draft
  -> build ACP prompt content
  -> append local user message
  -> send session/prompt
  -> set session.status = running
```

### 8.2 Assistant文本

```text
ACP sessionUpdate: assistant text delta
  -> find or create assistant message
  -> append delta
  -> render with MarkdownContent
```

### 8.3 Thought或Reasoning

```text
ACP sessionUpdate: thought/reasoning
  -> create collapsible timeline block
  -> default collapsed
```

### 8.4 Tool Call

```text
ACP sessionUpdate: tool call started
  -> create AgentToolCallItem(status=running)

ACP sessionUpdate: tool call update
  -> patch params/result/progress/status

ACP sessionUpdate: tool call completed
  -> status=complete
```

### 8.5 Permission Request

```text
ACP permission request
  -> create AgentPermissionItem
  -> add pendingPermissionIds
  -> show inline card
  -> show sticky strip above composer
  -> user chooses allow/deny/edit
  -> send permission response
```

### 8.6 Cancel

```text
user clicks Stop
  -> ACP cancel
  -> session.status = cancelling
  -> disable send
  -> when confirmed, session.status = idle
```

## 9. 交互细节规划

### 9.1 输入快捷键

建议沿用当前 MLFB 反馈输入习惯：

- `Ctrl+Enter`：发送 prompt。
- `ArrowUp` / `ArrowDown`：在输入框首行/末行切换历史 prompt。
- `Escape`：退出历史浏览或关闭 command menu。
- `Ctrl+V`：粘贴图片或文本。

### 9.2 Slash Command

AgentComposer 的 command 来源应合并两类：

1. ACP `available_commands_update`。
2. MLFB 本地 prompt commands。

显示层可以继续使用当前 prompt command option 结构，但命令执行应区分：

- 本地 prompt expansion：插入文本或 context。
- ACP command：发送 command 或构造 prompt content。

### 9.3 附件和上下文

Agent Console 的附件不只是图片，还应支持：

- 当前文件或目录。
- MLC 文档。
- web attachment。
- selected terminal output。
- selected diff。
- test log。
- resource link。

第一版可以先支持图片、文件路径、MLC 文档引用，后续再扩展。

### 9.4 Running状态

agent running 时：

- 输入框仍可编辑下一条 draft，但 Send 禁用或变为 Queue。
- 主按钮显示 Stop。
- timeline 显示 streaming cursor 或 running 状态。
- permission 请求出现时 composer 上方显示 pending strip。

是否支持 queued prompt 可作为第二阶段能力。

### 9.5 空状态

空状态不要做 landing page。应直接是可用工作台：

- 上方简洁显示当前 provider/model/cwd 未开始会话。
- 下方 composer 可直接输入。
- 提供 New Session / Select Model / Attach Context 的紧凑入口。

## 10. 实施阶段

### Phase 0：确认UI骨架

目标：确定 Agent Console 的基础视觉和组件边界。

任务：

- 新增文档和组件设计。
- 明确复用 `ComposerEditor`。
- 明确不复用 `CallerPanel` 整体。
- 设计 `agentStore` 最小类型。

验收：

- 文档完成。
- 组件边界清晰。
- 不影响现有反馈流程。

### Phase 1：静态AgentConsolePanel

目标：先做无 ACP 的静态 UI 骨架。

任务：

- 新增 `AgentConsolePanel`。
- 新增 `AgentSessionHeader`。
- 新增 `AgentMessageTimeline`。
- 新增 `AgentComposer`，直接复用 `ComposerEditor`。
- 使用 mock timeline 数据验证布局。

验收：

- Agent Console 能作为 dock tab 打开。
- 上方 timeline 和下方 composer 结构稳定。
- 基础响应式布局不溢出。

### Phase 2：agentStore与本地会话

目标：建立无 ACP 的本地 agent session 状态。

任务：

- 新增 `agentStore`。
- 支持新建 session、切换 session、更新 draft、发送 mock prompt。
- 支持 timeline append/update。
- 支持 prompt history。

验收：

- 用户输入后能追加 user message。
- mock assistant message 能流式追加。
- history navigation 正常。

### Phase 3：ACP最小闭环

目标：接入 opencode ACP 的最小 session/prompt 流程。

任务：

- 接入 `agent_process` 子进程管理。
- 启动 `opencode acp`。
- initialize/newSession/prompt。
- 将 assistant delta 映射到 timeline。
- 支持 cancel。

验收：

- 用户可在 MLFB Agent Console 中向 opencode 发送 prompt。
- assistant 响应以结构化 timeline 展示。
- 不使用 PTY，不经过 xterm。

### Phase 4：工具调用与权限UI

目标：补齐 coding agent 最关键的结构化状态。

任务：

- 显示 tool call started/running/completed/failed。
- 显示 permission request inline card。
- 显示 sticky pending permission strip。
- 支持 allow/deny/edit 等响应。
- 对文件写入展示 resource link 或 diff 入口。

验收：

- agent 请求权限时用户能明确看到并处理。
- tool call 不再混在文本里。
- 阻塞状态清楚可见。

### Phase 5：附件与上下文

目标：复用 MLFB 的附件能力，让 Agent Console 可以携带上下文。

任务：

- 新增 `AgentAttachmentBar`。
- 支持图片粘贴。
- 支持文件/resource link。
- 支持 MLC 文档引用。
- 将附件映射到 ACP content blocks。

验收：

- 用户能把图片、文件、MLC 文档作为 prompt context 发送。
- 附件可预览、移除、清空。

### Phase 6：抽象共享组件

目标：在 AgentConsole 稳定后回收重复代码。

任务：

- 提取 `ResizableConversationLayout`。
- 提取 `GenericComposerBox` 或保留 `ComposerEditor` + hooks。
- 提取 `AttachmentTagList`。
- 提取 timeline collapsible block。
- 逐步减少 CallerPanel 与 AgentConsole 的重复样式。

验收：

- 不破坏现有反馈流程。
- Agent Console 与 CallerPanel 共享低层 UI primitives。
- 业务 store 仍保持隔离。

## 11. 风险与对策

### 11.1 过早抽象导致反馈主流程不稳定

风险：为了复用 AgentConsole，一开始大改 CallerPanel/FeedbackInput，可能引入反馈提交流程回归。

对策：第一版先新增 AgentConsole，复制结构思路，直接复用 `ComposerEditor`；等功能稳定后再抽象共享组件。

### 11.2 timeline 过度聊天化

风险：如果照搬通用聊天 UI，tool call、permission、file change、plan 会变得难以扫描。

对策：采用“记录流 + 紧凑分组”，将工具调用和权限作为一等 timeline item。

### 11.3 权限请求不醒目

风险：agent 等待权限时，用户误以为卡死。

对策：权限请求同时出现在 inline card 和 composer 上方 sticky strip。

### 11.4 过度绑定opencode细节

风险：UI 直接消费 opencode-specific 字段，未来多 provider 接入困难。

对策：UI 只消费 MLFB Agent Event Model；opencode-specific 信息放入 provider adapter metadata。

### 11.5 附件模型与ACP content不一致

风险：MLFB 当前附件类型与 ACP content blocks 不完全对应。

对策：新增 `AgentAttachment` 中间层，由 mapper 负责转换到 ACP prompt content。

## 12. 文件与模块建议

建议新增：

```text
app/src/agent/
  types.ts
  agentStore.ts
  agentEvents.ts
  attachmentMapper.ts
  acp/
    types.ts
    mapper.ts
    client.ts

app/src/components/agent/
  AgentConsolePanel.tsx
  AgentSessionHeader.tsx
  AgentMessageTimeline.tsx
  AgentMessageItem.tsx
  AgentToolCallView.tsx
  AgentPermissionRequestView.tsx
  AgentComposer.tsx
  AgentAttachmentBar.tsx
  AgentActionBar.tsx
```

后续可抽象：

```text
app/src/components/conversation/
  ResizableConversationLayout.tsx
  ConversationComposerFrame.tsx
  AttachmentTagList.tsx
  CollapsibleTimelineBlock.tsx
```

## 13. 验收标准

第一版 UI PoC 的验收标准：

- Agent Console 与当前 MLFB 反馈区域视觉一致。
- 上方是可滚动 timeline。
- 下方是复用 `ComposerEditor` 的输入框。
- 输入、发送、清空、历史导航基本可用。
- mock assistant streaming 可展示。
- tool call 和 permission request 有独立视觉形态。
- 不影响当前 CallerPanel、FeedbackInput、反馈提交和 readonly 展示。

ACP 接入版验收标准：

- 可启动 `opencode acp`。
- 可 initialize/newSession/prompt。
- 可展示 assistant streaming response。
- 可展示 tool call。
- 可处理 permission request。
- 可 cancel。
- 子进程 stdout/stderr 与 UI 状态分离。
- 不使用 PTY/xterm 承载 agent 主交互。

## 14. 最终建议

建议将 Agent Console 的 UI 路线正式确定为：

```text
MLFB反馈区同构UI + ACP结构化事件 + 独立agentStore + 复用ComposerEditor
```

具体落地策略：

1. 先新建 AgentConsolePanel，不触碰现有反馈主流程。
2. 直接复用 ComposerEditor。
3. 新建 AgentTimeline，不直接复用 SummaryPanel 或 SubmittedFeedbackMarkdownView。
4. 新建 AgentComposer 绑定 agentStore。
5. 新建 AgentAttachmentBar，将附件映射到 ACP content blocks。
6. 接入 opencode ACP 后，再逐步抽象共享 layout/composer/attachment primitives。

这条路线能最大化利用现有 MLFB UI 资产，同时避免把 feedback 业务和 agent 业务硬缠在一起。