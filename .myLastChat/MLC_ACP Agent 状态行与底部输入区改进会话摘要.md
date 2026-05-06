---
title: ACP Agent 状态行与底部输入区改进会话摘要
description: 记录ACP状态行、审批行、待办行与规划上下文
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - ACP
  - Agent Console
  - session-status
  - conversation-summary
solved_lists:
  - 将会话级待办列表移出输入框内部
  - 将审批行加入输入框上方状态栈
  - 统一审批行和待办行的状态盒视觉
  - 分析CBZWW流式状态指示器并规划通用Agent当前状态行
---

# ACP Agent 状态行与底部输入区改进会话摘要

## 1. Previous Conversation

本轮对话主要围绕 MLFB 的 ACP / Agent Console 底部输入区域和输入框上方的 session-level 状态区展开。

最初用户指出：会话级待办列表不应该是底部输入框内部的“内行”，而应该是输入对话框之上的独立区域。进一步明确后，目标变成：

- 待办列表位于输入框上方。
- 待办列表展开时向上占用聊天时间线区域。
- 待办列表不能挤压下方输入框。
- resize handle 必须直接位于输入框顶部线。
- 输入框顶部不要因为任务列表、状态行、边框叠加而出现多条线。

随后在这个状态区域中加入了 ACP 请求批准行。用户持续通过视觉反馈推动以下调整：

- 请求批准行应位于待办行上方。
- 请求批准行不应像 warning banner，需要更贴近 MLFB 原有克制风格。
- 权限图标从 lock 改成 shield。
- 允许按钮应是一个真正的 split button，而不是两个普通相邻按钮。
- split button 中主按钮直接 allow once，右侧 caret 打开 allow session / always allow。
- 拒绝和允许按钮应使用弱 tint、无边框的 MLFB 风格。
- 审批行和待办行应合并进一个顶部圆角、带边框的状态盒。
- 状态盒左右留 8px margin，只显示顶部与左右边框，底部由 resize handle / composer 区域负责。
- “请求批准”文字需要有细腻银光 shimmer 效果。
- shimmer 机制需要可复用，同时保留用户调好的颜色公式。
- `AgentProcessGroup` 中“正在工作...”也应复用这个 shimmer。

最新用户请求是分析 `ref-repos/CBZWW-chat-ui/` 中位于聊天流式信息底部的矩阵动画运行状态表达。用户明确表示不使用它的动画，而是希望将现有请求批准行演进为通用的 Agent 当前状态容器行，用于展示：

- 请求工具批准状态。
- 请求运行编辑生效状态，它本质也是工具批准，但需要显示编辑文件名和 diff 情况。
- 思考中状态，显示 thinking token 数量变化。
- 输出中状态，显示 output token 数量变化。

完成分析后，用户通过反馈工具明确要求：

> 好的，你先针对此编写一个完整详细的规划文档。

并要求：

> 然后再结合当前代码仓库中ACP实现的现状，编写一个新的对话摘要文件。

## 2. Current Work

当前工作是在不继续直接改代码的前提下，整理两个文档产物：

1. 完整详细的规划文档。
2. 新的对话摘要文件。

已按 MyLastChat 要求先查询已有摘要：

- 使用 `myLastChat_getLastChatsList` 查询所有摘要。
- 使用 `myLastChat_searchByMeta` 以 `ACP`、`Agent`、`状态行`、`审批`、`待办` 为关键词查询相关记录。
- 查询到已有相关规划，如：
  - `MLC_CBZWW Chat UI参考迁移规划.md`
  - `MLC_MLFB ACP Agent Console统一施工规划书.md`
  - `MLC_MLFB风格ACP Agent Console UI规划.md`
  - `MLC_MLFB终端稳定性与ACP Agent Console规划会话摘要.md`

判断结果：已有文档覆盖 ACP 总体规划和 CBZWW 迁移规划，但没有专门记录“Agent 当前状态行”的新方案。用户也明确要求“新的对话摘要文件”，因此本次新建文档，而不是覆盖旧文档。

当前新增文档：

- `.myLastChat/MLC_ACP Agent 当前状态行规划文档.md`
- `.myLastChat/MLC_ACP Agent 状态行与底部输入区改进会话摘要.md`

## 3. Key Technical Concepts

- Tauri 2 + React + TypeScript + Vite。
- Zustand store 管理 Agent session 状态。
- ACP / opencode Agent Console UI。
- `AgentSession` / `AgentMessage` / `AgentContentBlock` 数据模型。
- `AgentPermissionBlock` 用于权限批准。
- `AgentTaskListBlock` 用于会话级 task list。
- `AgentFileChangeBlock` 和 diff artifact 用于文件改动展示。
- `AgentThinkingBlock` 和 result text block 用于 thinking/output phase 检测。
- `collectAgentStepTokenStats(session)` 用于估算 token。
- `getAgentTokenStatsSummary(session)` 用于 session token 汇总。
- `formatCompactTokenCount(count)` 用于 compact token 数字格式。
- `getAgentDiffStatsSummary(session)` 用于 changed files / additions / deletions 统计。
- `agent-session-status-stack` 是输入框上方状态盒。
- `AgentApprovalRow` 是当前待重构成通用状态行的审批组件。
- `AgentTaskPanel` 是状态盒第二行，职责是显示 session-level task list。
- CBZWW 的 `StreamingIndicator` 使用 phase detection：`thinking`、`tool_call`、`output`。
- 本项目不迁移 CBZWW 的 dotmatrix 动画，只吸收 phase-aware bottom status indicator 的结构。

## 4. Relevant Files and Code

### `app/src/components/agent/AgentConsolePanel.tsx`

当前 Agent Console 主布局文件。

关键结构：

```tsx
<div className="agent-console-timeline-region panel-card" style={{ flex: `0 0 calc(${panelSizes[0] * 100}% - 1px)`, minHeight: 48 }}>
  <AgentMessageTimeline session={activeSession} />
  <div className="agent-session-status-stack">
    <AgentApprovalRow session={activeSession} />
    <AgentTaskPanel session={activeSession} />
  </div>
</div>
<div className="resize-handle" onMouseDown={(event) => handleMouseDown(0, event)} />
<div ref={inputPanelRef} className="agent-console-input-region panel-card panel-feedback panel-feedback-editable" ...>
  <div className="agent-composer-area">
    <AgentComposer session={activeSession} />
  </div>
</div>
```

该结构已经满足用户对底部输入区的关键要求：状态区域在输入框上方，并且 resize handle 仍直接贴住输入框顶部。

未来改造点：

```tsx
<AgentApprovalRow session={activeSession} />
```

应替换为：

```tsx
<AgentCurrentStatusRow session={activeSession} />
```

### `app/src/components/agent/AgentApprovalRow.tsx`

当前审批行组件。

当前职责：

- 收集 permission blocks。
- 根据 `session.pendingPermissionIds` 找到 pending permission。
- 显示 shield icon、请求批准 label、title、extra count。
- 提供 reject 按钮。
- 提供 allow split button。
- allow split menu 支持 allow session 和 always allow。
- outside click / focus / Escape 关闭菜单。
- 调用 `resolveMockPermission(session.id, requestId, optionId)`。

关键 helper：

```ts
function collectPermissionBlocks(session: AgentSession): AgentPermissionBlock[] { ... }
function getPendingPermissionBlocks(session: AgentSession): AgentPermissionBlock[] { ... }
```

未来改造点：

- 这两个 helper 应迁移到 `app/src/agent/currentStatus.ts` 或 permission-specific helper。
- `AgentApprovalRow` 应升级/重命名为 `AgentCurrentStatusRow`。
- approval UI 应成为 current status 的一个 renderer variant。

### `app/src/components/agent/AgentTaskPanel.tsx`

当前 session-level task list 组件。

关键逻辑：

```ts
function latestTasks(session: AgentSession): AgentTaskItem[] {
  for (let messageIndex = session.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = session.messages[messageIndex];
    for (let blockIndex = message.blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const block = message.blocks[blockIndex];
      if (block.type === "task_list" && block.tasks.length > 0) return block.tasks;
    }
  }
  return [];
}
```

未来应继续作为 `agent-session-status-stack` 的第二行，不要并入 current status row。

### `app/src/agent/types.ts`

当前 Agent 类型定义。

关键类型：

```ts
export interface AgentPermissionOption {
  id: string;
  label: string;
  kind: "allow_once" | "allow_session" | "allow_always" | "reject_once";
}

export interface AgentPermissionBlock extends AgentBlockBase {
  type: "permission";
  requestId: string;
  title: string;
  toolCallId?: string;
  status: "pending" | "resolved";
  options: AgentPermissionOption[];
  selectedOptionId?: string;
}
```

未来可选扩展：

```ts
intent?: "tool" | "apply_edit";
affectedFiles?: string[];
```

但规划建议短期不直接修改协议类型，先用 selector/helper 做启发式识别。

### `app/src/agent/steps.ts`

用于从 agent blocks 构建 process steps，并估算 token。

关键函数：

```ts
export function collectAgentStepTokenStats(session: AgentSession): AgentStepTokenStat[] { ... }
```

其中：

- thinking step 的 token 来自 thinking content。
- result token 来自 result blocks。
- running 状态可根据 message status 和 step status 推导。

未来 current status row 中的 thinking/output token 数可以复用此能力。

### `app/src/agent/tokenStats.ts`

当前 token 汇总能力。

关键函数：

```ts
export function getAgentTokenStatsSummary(session: AgentSession): AgentTokenStatsSummary { ... }
export function formatCompactTokenCount(count: number): string { ... }
```

未来可用于显示：

```txt
正在思考 · 842 tokens
正在输出 · 1.4k tokens
```

### `app/src/agent/diffStats.ts`

当前 diff/file change 汇总能力。

关键函数：

```ts
export function getAgentDiffStatsSummary(session: AgentSession): AgentDiffStatsSummary { ... }
```

可用于 apply edit approval variant：

- changed files。
- additions。
- deletions。
- primary file path。
- create/edit/delete 分类。

### `app/src/index.css`

当前状态栈与审批行样式集中在此。

关键样式：

```css
.agent-session-status-stack {
  flex: 0 0 auto;
  min-width: 0;
  margin: 0 8px;
  border: 1px solid var(--color-border-subtle);
  border-bottom: 0;
  border-top-left-radius: var(--radius-md);
  border-top-right-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-bg-surface) 92%, var(--color-bg-base));
}
```

当前 shimmer 机制：

```css
.agent-silver-shimmer-text {
  display: inline-block;
  background: var(--agent-silver-shimmer-background, linear-gradient(...));
  background-size: 300% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: agent-approval-label-shimmer 2.6s linear infinite;
}
```

注意：用户曾明确反馈过 shimmer 颜色公式很敏感，后续不要随意“规范化”或替换为 `currentColor`。

### `ref-repos/CBZWW-chat-ui/src/components/zeven/composition/chat/StreamingIndicator.tsx`

参考实现。

关键点：

```ts
type StreamPhase = "thinking" | "output" | "tool_call";

function detectPhase(messages: Message[]): StreamPhase { ... }
```

借鉴的是：phase detection + 当前状态指示器。

不借鉴的是：dotmatrix 动画视觉本身。

### `ref-repos/CBZWW-chat-ui/src/pages/Chat.tsx`

参考 placement。

`StreamingIndicator` 位于消息流底部，用于表达当前 assistant 仍在活动。

MLFB 对应位置是 `agent-session-status-stack` 的第一行，而不是 assistant message 内部。

## 5. Problem Solving

已经解决的问题：

1. 待办列表从输入框内部移到输入框上方。
2. 待办列表展开时不再挤压输入框。
3. resize handle 仍然直接位于输入框顶部线。
4. 清理了输入框顶部多重边线问题。
5. 增加 ACP 请求批准行。
6. 将请求批准行放到待办行上方。
7. 请求批准行从 warning-like 调整为 MLFB 原生弱强调视觉。
8. allow 按钮改为真正 split button。
9. 增加 allow session 选项。
10. split menu 复用 `app-select-panel` / `app-select-option` 风格。
11. split menu 支持 outside click、focus out、Escape 关闭。
12. 权限图标从 lock 改成 shield。
13. `AgentProcessGroup` 中 permission step 也改用 shield。
14. 审批行和待办行统一放入 `agent-session-status-stack` 状态盒。
15. 提取 `agent-silver-shimmer-text` 并复用于“请求批准”和“正在工作...”。
16. 保留了用户调好的 shimmer 颜色公式。
17. 分析 CBZWW 的 `StreamingIndicator`，明确迁移结构而非动画。

仍需注意的问题：

- `get_errors` 对 `app/src/index.css` 可能报告 `@theme` unknown at-rule，这是现有 CSS dialect/tooling 问题，不一定表示构建失败。
- 大量 UI 改动之后尚未进行完整 Vite build 验证。
- apply edit approval 当前尚无结构化 intent 字段，只能先用启发式识别。
- token 数当前是估算值，不是真实 provider token 计费数据。

## 6. Pending Tasks and Next Steps

最新用户明确请求：

> 好的，你先针对此编写一个完整详细的规划文档。

以及：

> 然后再结合当前代码仓库中ACP实现的现状，编写一个新的对话摘要文件。

当前已经完成：

- 查询已有 MyLastChat 摘要。
- 判断应新建专门文档。
- 编写规划文档。
- 编写新的对话摘要文件。

建议下一步代码实施顺序：

1. 新建 `app/src/agent/currentStatus.ts`。
2. 将 permission block 收集逻辑从 `AgentApprovalRow.tsx` 迁移到 current status selector。
3. 新建 `app/src/components/agent/AgentCurrentStatusRow.tsx`。
4. 将当前 approval UI 作为 `kind: "approval"` variant 渲染。
5. 在 `AgentConsolePanel.tsx` 中用 `AgentCurrentStatusRow` 替换 `AgentApprovalRow`。
6. 接入 thinking/output 状态。
7. 复用 `formatCompactTokenCount` 显示 compact token 数。
8. 后续再接入 apply edit approval variant，显示文件名和 diff 摘要。

建议状态优先级：

```txt
1. approval:apply_edit
2. approval:tool
3. tool_running
4. thinking
5. output
6. null
```

建议新增核心类型：

```ts
export type AgentCurrentStatus =
  | {
      kind: "approval";
      variant: "tool" | "apply_edit";
      requestId: string;
      title: string;
      options: AgentPermissionOption[];
      extraCount: number;
      fileSummary?: AgentEditFileSummary;
    }
  | {
      kind: "thinking";
      label: string;
      tokenCount: number;
      estimated: boolean;
    }
  | {
      kind: "output";
      label: string;
      tokenCount: number;
      estimated: boolean;
    }
  | null;
```

建议首个代码改造范围控制在：

- `app/src/agent/currentStatus.ts`
- `app/src/components/agent/AgentCurrentStatusRow.tsx`
- `app/src/components/agent/AgentConsolePanel.tsx`
- `app/src/i18n/locales/zh.json`
- `app/src/i18n/locales/en.json`
- `app/src/index.css`

如果继续执行实现，优先做 Phase 1 和 Phase 2，不要一开始就把 apply edit diff UI 和 token delta 都做完。这样可以保护当前已经调好的状态盒、split button 和 shimmer 视觉。
