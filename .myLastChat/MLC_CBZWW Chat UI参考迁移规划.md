---
title: CBZWW Chat UI参考迁移规划
description: 分析CBZWW Chat流式Agent UI并规划迁移到MLFB
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - CBZWW
  - Agent Console
  - ACP
  - Chat UI
  - Streaming UI
solved_lists:
  - 复制CBZWW Chat UI关键参考文件到ref-repos
  - 分析ContentBlock协议与过程结果分层
  - 规划ProcessGroup双显示模式迁移到MLFB
---

# CBZWW Chat UI参考迁移规划

## 1. 背景

用户指出 `E:\Dev\CBZWW_all\CBZWW_web\frontend-v2` 中的 Chat 页面是此前开发并非常喜欢的 agent UI，尤其喜欢：

- agent 流式输出过程 UI。
- 思考、工具调用、最终输出的分层显示方式。
- 思考/工具调用/输出过程的两种显示模式。
- 整体精致、紧凑、漂亮的视觉表现。

MLFB 正在规划 ACP Agent Console。此前已确定 Agent Console 应沿用 MLFB 当前反馈区域结构：上方为 agent 记录区，下方为用户输入框。本规划进一步吸收 CBZWW Chat UI 的事件建模与流式展示方案，为 MLFB Agent Console 提供更具体的 UI 参考。

## 2. 参考文件落位

已将 CBZWW Chat UI 的关键参考文件复制到：

```text
ref-repos/CBZWW-chat-ui/
```

主要文件包括：

```text
ref-repos/CBZWW-chat-ui/src/pages/Chat.tsx
ref-repos/CBZWW-chat-ui/src/store/chatStore.ts
ref-repos/CBZWW-chat-ui/src/lib/sseClient.ts
ref-repos/CBZWW-chat-ui/src/styles/globals.css
ref-repos/CBZWW-chat-ui/src/constants/models.ts
ref-repos/CBZWW-chat-ui/src/components/zeven/composition/ChatMessage.tsx
ref-repos/CBZWW-chat-ui/src/components/zeven/composition/chat/ProcessGroup.tsx
ref-repos/CBZWW-chat-ui/src/components/zeven/composition/chat/MarkdownBlock.tsx
ref-repos/CBZWW-chat-ui/src/components/zeven/composition/chat/StreamingIndicator.tsx
ref-repos/CBZWW-chat-ui/src/components/zeven/composition/chat/ChatInput.tsx
ref-repos/CBZWW-chat-ui/src/components/zeven/composition/chat/ChatTaskPanel.tsx
ref-repos/CBZWW-chat-ui/src/components/zeven/composition/chat/ChatOutlineList.tsx
ref-repos/CBZWW-chat-ui/src/components/zeven/composition/chat/ChatStickyBar.tsx
ref-repos/CBZWW-chat-ui/src/components/zeven/dotmatrix/*
```

其中最关键的参考是：

- `ChatMessage.tsx`：消息与 block 渲染入口。
- `ProcessGroup.tsx`：思考、工具、任务、产物的过程分组与双显示模式。
- `MarkdownBlock.tsx`：双区流式 Markdown 渲染。
- `StreamingIndicator.tsx`：根据流式阶段切换动画。
- `chatStore.ts`：SSE block 事件归一、rAF 字符释放、流式状态管理。

## 3. CBZWW Chat UI核心机制

### 3.1 ContentBlock协议

CBZWW Chat UI 不把 assistant 输出当成单一字符串，而是归一为 `ContentBlock[]`：

```ts
type ContentBlock =
  | { type: "text"; content: string; origin?: BlockOrigin }
  | { type: "thinking"; content: string; origin?: BlockOrigin }
  | { type: "tool_call"; name: string; args?: Record<string, unknown>; result?: string; origin?: BlockOrigin }
  | { type: "chart"; chartType: string; data: unknown; origin?: BlockOrigin }
  | { type: "card"; cardType: string; data: unknown; origin?: BlockOrigin }
  | { type: "citation"; sources: CitationSource[]; origin?: BlockOrigin }
  | { type: "task_list"; tasks: TaskItem[]; origin?: BlockOrigin }
```

最值得迁移的是 `origin` 元数据：

```ts
interface BlockOrigin {
  phase: "process" | "result";
  placement: "inline" | "standalone";
  group_id?: string;
}
```

这让 UI 能明确区分：

- 哪些内容属于 agent 工作过程。
- 哪些内容属于最终回答。
- 哪些图表/卡片应内嵌在文本中。
- 哪些产物应作为独立 block 展示。

### 3.2 过程与结果分层

`ChatMessage` 会检测 assistant 消息是否含有 `origin`，并以第一个 result block 为边界拆分：

```text
assistant message
  processBlocks
    thinking
    tool_call
    task_list
    chart/card artifacts
  resultBlocks
    final text
    inline chart/card references
    citation
```

这非常适合 MLFB Agent Console，因为 ACP agent 也天然有类似结构：

- process：thought、tool call、permission、file change、plan update。
- result：assistant 最终文本、总结、建议、产物引用。

### 3.3 ProcessGroup双显示模式

`ProcessGroup` 是这套 UI 最值得迁移的组件思想。它将过程 blocks 抽取成 steps，并提供两种显示模式：

```text
timeline 模式
  线性展示思考、工具、任务、产物的顺序。
  适合观察 agent 正在做什么。

tab 模式
  用紧凑标签展示每个 step。
  点击标签查看详情。
  适合过程很多时快速检查。
```

它还具备几个很好的细节：

- 流式时自动展开过程区。
- 流式结束后自动折叠过程区。
- 流式时自动切换或展开最新 step。
- 顶部摘要行显示“正在工作...”或“已使用 n 个工具、n 次思考”。
- tool result 会清理冗余字段，避免重复展示 task/charts/cards。
- task_list 和 artifacts 被视为一等过程 step。

这些都非常适合 MLFB Agent Console。

### 3.4 双区流式Markdown渲染

`MarkdownBlock` 的 `StreamingRenderer` 是另一个关键亮点。

它没有每个字符都交给 ReactMarkdown 重渲染，而是分成两个区域：

```text
settled zone
  已稳定内容
  用 ReactMarkdown 完整渲染

active zone
  最新增量字符
  直接追加 DOM span
  每个字符播放 reveal 动画
```

它还会只在安全边界沉淀内容：

- fenced code block 必须闭合。
- table 行不能半截沉淀。
- bold、inline code 等语法要平衡。

这套机制解决了三个常见问题：

- 流式 Markdown 频繁重渲染导致闪烁。
- 半截 Markdown 语法导致 UI 抖动或错排。
- 普通逐字显示没有“生长感”。

MLFB 当前已有 [MarkdownContent](app/src/components/MarkdownContent.tsx)，建议不要直接替换，而是新增 `StreamingMarkdownContent`，在 settled zone 内复用 `MarkdownContent`。

### 3.5 rAF字符释放策略

`chatStore` 对 `text_delta` 不立即全量释放，而是进入 buffer：

```text
raw buffer receives text_delta
requestAnimationFrame render loop releases N chars per frame
React state only receives displayed content
```

当前 CBZWW 设置为每帧释放 4 个字符，约 240 chars/sec。

这让流式体验更稳定，不会因为后端瞬间推送大段文本而突然整段跳出。

### 3.6 Phase-aware StreamingIndicator

`StreamingIndicator` 会根据最后一个 assistant block 判断当前阶段：

```text
last block thinking  -> thinking animation
last block tool_call -> tool_call animation
else                 -> output animation
```

视觉上用 7×7 dot matrix 动画表达状态变化。MLFB 不一定要照搬点阵风格，但应迁移“阶段感知状态指示器”这个机制。

### 3.7 滚动与长会话体验

Chat 页面还有几个重要细节：

- 流式开始时判断是否接近底部，只有接近底部才自动跟随。
- 用户流式期间手动滚离底部后，不再强制抢滚动。
- 用 `MutationObserver` 在过程块展开/折叠导致高度变化时继续保持底部。
- 顶部显示 sticky user bar，用户滚过上一条 prompt 后仍能看到当前上下文。
- 右侧 outline 可基于 user message、thinking、tool call 自动生成。
- task panel 悬浮在输入框上方，展示当前 todo 摘要。

这些细节对 MLFB Agent Console 的长任务体验很有价值。

## 4. MLFB迁移设计

### 4.1 新增AgentContentBlock

建议在 MLFB agent 模块中新增类似结构：

```ts
interface AgentBlockOrigin {
  phase: "process" | "result";
  placement: "inline" | "standalone";
  groupId?: string;
}

type AgentContentBlock =
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

ACP mapper 负责将 ACP session update 映射到该结构。

### 4.2 新增AgentProcessGroup

`AgentProcessGroup` 应借鉴 CBZWW `ProcessGroup`，但加入 MLFB/ACP 特有 step：

```text
thinking
tool
permission
task_list
file_change
artifacts
error
```

保留两种模式：

- `timeline`：适合观察 agent 当前工作过程。
- `tab`：适合过程很多时快速查看某一步详情。

建议默认策略：

- streaming 时展开过程区。
- streaming 时自动聚焦最新 step。
- idle/completed 后折叠过程区，仅保留摘要。
- 用户手动展开后尊重用户选择。

### 4.3 新增StreamingMarkdownContent

建议新增：

```text
app/src/components/agent/StreamingMarkdownContent.tsx
```

职责：

- 复用 CBZWW 的 settled/active 双区思想。
- settled zone 使用 MLFB 现有 [MarkdownContent](app/src/components/MarkdownContent.tsx)。
- active zone 用轻量 span + CSS reveal 动画。
- 保持 MLFB 的文件链接、composer token、代码复制按钮能力。

注意事项：

- 不直接复制 CBZWW `MarkdownBlock` 的 Shiki 依赖。
- MLFB 已用 `react-syntax-highlighter`，应继续使用现有实现。
- char reveal 颜色应使用 MLFB theme variables。

### 4.4 新增AgentStreamingIndicator

建议新增 phase-aware 状态指示器：

```text
thinking
tool_call
permission
output
cancelling
settle
```

第一版可以用 MLFB 现有 `Icon` 和 CSS 动画实现，不必立刻引入点阵组件。若后续希望保留 CBZWW 那种漂亮的点阵感，可从 `ref-repos/CBZWW-chat-ui/src/components/zeven/dotmatrix` 迁移成独立 `DotMatrixIndicator`。

### 4.5 新增AgentOutline

CBZWW 的 `ChatOutlineList` 可以迁移为 Agent Console 的右侧大纲：

- user prompt 作为一级节点。
- thinking/tool/permission/file change 作为二级节点。
- 当前滚动位置高亮。
- 流式期间可跳过重算，避免每帧 O(n) 遍历。

MLFB 目前已有 dock 架构，Agent Outline 可作为 Agent Console 内部右侧小栏，或后续作为独立 dock tab。

### 4.6 TaskPanel迁移

CBZWW 的 `ChatTaskPanel` 很适合映射到 agent plan/todo：

- composer 上方显示简洁 todo 摘要。
- 展开后显示完整计划。
- completed/in-progress/not-started 使用不同视觉状态。

这比把 plan update 埋在 timeline 深处更易用。

## 5. 与既有MLFB UI规划的关系

此前的 MLFB Agent Console UI 规划已经确定：

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

吸收 CBZWW Chat UI 后，建议细化为：

```text
AgentMessageTimeline
  AgentMessageItem
    AgentProcessGroup
      timeline mode
      tab mode
    AgentResultBlocks
      StreamingMarkdownContent
      AgentArtifactBlock
      AgentCitationBlock

AgentComposerArea
  AgentTaskPanel
  AgentPermissionDock
  AgentAttachmentBar
  AgentComposer
  AgentActionBar
```

## 6. 实施路线

### Phase 1：参考文件冻结与文档化

已完成：

- 复制 CBZWW Chat UI 参考文件。
- 新增本规划文档。
- 明确核心迁移对象。

### Phase 2：AgentContentBlock类型设计

任务：

- 在 MLFB agent 模块中定义 block 类型。
- 支持 `origin.phase` 与 `origin.placement`。
- 设计 ACP 到 block 的 mapper。

验收：

- mock agent session 可生成 process/result blocks。

### Phase 3：静态AgentProcessGroup

任务：

- 实现 `AgentProcessGroup`。
- 支持 timeline/tab 两种模式。
- 支持 thinking/tool/task/permission/file_change。
- 使用 mock blocks 验证 UI。

验收：

- 能在 Agent Console 中看到与 CBZWW 类似的过程摘要与双模式过程详情。

### Phase 4：StreamingMarkdownContent

任务：

- 实现 settled/active 双区流式渲染。
- active zone 实现字符 reveal。
- settled zone 复用 MLFB `MarkdownContent`。
- 支持 markdown balanced check。

验收：

- 流式文本不闪烁。
- 大段文本不会瞬间跳出。
- 半截代码块/表格不会破坏布局。

### Phase 5：ACP事件接入

任务：

- 将 opencode ACP session updates 映射到 AgentContentBlock。
- tool call 映射到 process block。
- permission 映射到 permission block 与 sticky dock。
- final assistant text 映射到 result block。

验收：

- 真实 opencode ACP 流能驱动 AgentProcessGroup 与 StreamingMarkdownContent。

## 7. 风险与注意事项

### 7.1 不要直接照搬CBZWW视觉主题

CBZWW 使用黑白、高对比、hatching、dot matrix、Phosphor icons。MLFB 应保持自身主题与 panel 语言，只迁移交互结构和动态体验。

### 7.2 不要引入过多新依赖

CBZWW 使用 `framer-motion`、`@phosphor-icons/react`、`shiki` 等。MLFB 当前没有这些依赖。

建议第一版：

- 使用 CSS transition/animation 替代 framer-motion。
- 使用 MLFB 现有 `Icon`。
- 使用 MLFB 现有 `MarkdownContent` 与 syntax highlighter。

### 7.3 ACP不一定直接给phase字段

CBZWW 后端直接提供 `origin.phase`。ACP 事件未必有完全等价字段。

对策：由 MLFB ACP mapper 推导：

- thought/reasoning -> process。
- tool call -> process。
- permission -> process。
- file change -> process 或 artifact，取决于是否最终展示。
- assistant final text -> result。

### 7.4 直接DOM追加要谨慎

双区流式渲染中的 active zone 会直接操作 DOM。实现时要注意：

- message id 变化时清空 refs。
- content 回退或 session 切换时重置 rendered index。
- 组件卸载时不保留旧 DOM。
- settled zone 与 active zone 不重复字符。

## 8. 最终建议

CBZWW Chat UI 应成为 MLFB Agent Console 的第二参考源：

```text
MLFB反馈区域结构
  决定Agent Console整体布局

CBZWW Chat UI
  决定Agent流式过程展示、block模型、双模式ProcessGroup、流式Markdown体验

ACP/opencode
  决定真实事件来源与协议边界
```

最终 MLFB Agent Console 不应只是“聊天 UI”，而应是：

```text
反馈区同构布局 + ContentBlock过程/结果分层 + ACP结构化事件 + 双区流式Markdown + 双模式过程查看
```

这是当前最符合用户偏好、现有代码资产和长期 ACP 路线的 UI 方案。