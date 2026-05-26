---
title: ACP Agent 当前状态行规划文档
description: 规划ACP通用Agent当前状态容器行
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - ACP
  - Agent Console
  - UI
  - status-row
  - planning
solved_lists:
  - 分析CBZWW Chat UI流式状态指示器的可借鉴结构
  - 梳理当前ACP状态栈、审批行、待办行实现现状
  - 制定Agent当前状态行的数据模型、优先级和实施路线
---

# ACP Agent 当前状态行规划文档

## 1. 背景

当前 MLFB 的 ACP / Agent Console 已经形成了底部输入框上方的 session-level 状态区域：

- `AgentApprovalRow`：显示当前待审批的 permission request。
- `AgentTaskPanel`：显示会话级待办事项。
- `agent-session-status-stack`：作为输入框上方、聊天时间线底部的状态容器。
- `resize-handle`：仍然直接位于输入框顶部线，输入框不被状态区域挤压。

用户新的产品方向是：不要把“请求批准行”继续看成单一审批组件，而是升级成一个通用的 Agent 当前状态容器行。

它需要承载：

- 请求工具批准状态。
- 请求运行编辑生效状态，属于工具批准的一种，但 UI 需要显示文件名和 diff 情况。
- 思考中状态，显示 thinking token 数量变化。
- 输出中状态，显示 output token 数量变化。

这个规划的核心目标是把当前 `AgentApprovalRow` 从“权限审批行”演进为“当前 Agent 活动状态行”，并保留现有 MLFB 风格：克制、紧凑、低干扰、操作明确。

## 2. CBZWW Chat UI 的启发

参考文件：

- `ref-repos/CBZWW-chat-ui/src/components/zeven/composition/chat/StreamingIndicator.tsx`
- `ref-repos/CBZWW-chat-ui/src/components/zeven/dotmatrix/presets.ts`
- `ref-repos/CBZWW-chat-ui/src/pages/Chat.tsx`

CBZWW 的矩阵动画本身不是本次迁移目标。真正值得借鉴的是它的状态表达结构。

### 2.1 核心结构

`StreamingIndicator` 的工作方式可以概括为：

```txt
messages -> detectPhase -> choose visual preset -> render bottom-of-stream indicator
```

它通过 `detectPhase(messages)` 从最近的 assistant message 中推导当前 phase：

```ts
type StreamPhase = "thinking" | "output" | "tool_call";
```

判断逻辑大致是：

- 最近 assistant block 是 `thinking`：显示 thinking 状态。
- 最近 assistant block 是 `tool_call`：显示 tool call 状态。
- 其他情况：显示 output 状态。
- 没有 block：默认 thinking。

### 2.2 位置语义

CBZWW 在 `Chat.tsx` 中把 `StreamingIndicator` 放在消息列表底部：

```tsx
<div className="flex justify-start -mt-6 min-h-6 items-center">
  <StreamingIndicator
    messages={messages}
    mode={isStreaming ? "stream" : "settle"}
    streamRound={streamRound}
    onComplete={() => setIsSettling(false)}
  />
</div>
```

这个位置表达的是：助手仍在当前回合活动中。

对于 MLFB ACP 来说，对应位置不是消息气泡内部，而是当前已经建立起来的 `agent-session-status-stack` 第一行。

### 2.3 可借鉴点

我们应该借鉴：

- phase-aware：先推导 Agent 当前 phase，再选择展示形态。
- bottom-of-stream / bottom-of-session：状态位于当前会话流底部，靠近输入框。
- ephemeral current state：它表达当前正在发生的事，不是历史日志。
- compact indicator：视觉上应紧凑，不抢走消息流主体。
- settle concept：流结束后可以短暂显示收尾状态，之后消失。

### 2.4 不迁移点

我们不迁移：

- dotmatrix 动画实现。
- `matrixRain` / `metaballs` / `morph` 等具体 preset。
- 以随机动画作为主要差异表达的机制。
- 过强的视觉表演性。

MLFB ACP 更像操作台，不是纯聊天 UI。状态行应该以可读性、可操作性和稳定信息密度为主。

## 3. 当前代码现状

### 3.1 AgentConsolePanel

文件：`app/src/components/agent/AgentConsolePanel.tsx`

当前结构：

```tsx
<div className="agent-console-timeline-region panel-card">
  <AgentMessageTimeline session={activeSession} />
  <div className="agent-session-status-stack">
    <AgentApprovalRow session={activeSession} />
    <AgentTaskPanel session={activeSession} />
  </div>
</div>
<div className="resize-handle" />
<div className="agent-console-input-region panel-card panel-feedback panel-feedback-editable">
  <AgentComposer session={activeSession} />
</div>
```

这个结构是正确的，应该保留。

关键点：

- 状态栈属于 timeline region 的底部。
- 输入框是独立区域。
- resize handle 仍直接位于输入框顶部。
- 状态栈展开时向上占用 timeline 空间，不挤压输入框。

### 3.2 AgentApprovalRow

文件：`app/src/components/agent/AgentApprovalRow.tsx`

当前职责：

- 从 session messages 中收集 `permission` blocks。
- 根据 `session.pendingPermissionIds` 过滤 pending 请求。
- 显示第一条待批准请求。
- 显示额外 pending count。
- 提供拒绝按钮。
- 提供允许 split button。
- split menu 支持 allow once / allow session / always allow。
- 使用 `resolveMockPermission(session.id, requestId, optionId)` 处理 mock permission。

它现在的问题不是实现错误，而是命名和职责过窄。

更合理的定位应该是：

```txt
AgentApprovalRow -> AgentCurrentStatusRow
```

然后 permission approval 成为 `AgentCurrentStatusRow` 的一种 renderer variant。

### 3.3 AgentTaskPanel

文件：`app/src/components/agent/AgentTaskPanel.tsx`

当前职责：

- 从最新的 `task_list` block 中推导会话级待办。
- 展示完成数量。
- 折叠时显示当前 in-progress task。
- 展开时显示完整 task list。

它不应该合并进当前状态行。

理由：

- task list 是 session plan / progress 的稳定摘要。
- current status 是当前 Agent 活动或阻塞点。
- 两者信息生命周期不同。

推荐继续作为 `agent-session-status-stack` 的第二行。

### 3.4 统计能力

已有两个可复用统计模块：

- `app/src/agent/tokenStats.ts`
- `app/src/agent/diffStats.ts`

`tokenStats.ts` 提供：

- `getAgentTokenStatsSummary(session)`
- `formatCompactTokenCount(count)`
- `collectAgentStepTokenStats(session)`
- 对 user/process/result token 进行估算。

`diffStats.ts` 提供：

- `getAgentDiffStatsSummary(session)`
- changed files 数量。
- additions / deletions。
- create / edit / delete 文件分类。
- 从 diff artifact 和 file_change block 中统计文件变化。

这些能力足够支撑第一阶段的状态行数据展示。

## 4. 产品目标

### 4.1 一句话目标

把输入框上方第一行升级为“Agent 当前状态行”，用于稳定表达当前 Agent 正在做什么、等待什么、以及是否需要用户介入。

### 4.2 用户感知目标

用户应该能在输入框上方立刻知道：

- Agent 是否正在思考。
- Agent 是否正在输出。
- Agent 是否正在运行工具。
- Agent 是否卡在权限批准。
- Agent 是否正在请求应用代码编辑。
- 当前状态是否与文件变更、token 增长相关。

### 4.3 视觉目标

- 继续使用现有 `agent-session-status-stack` 外壳。
- 当前状态行高度控制在 28px 左右。
- 状态行不应变成大卡片或二级面板。
- approval 状态可以有按钮；thinking/output 状态不应出现不必要操作按钮。
- 文本应可截断，不能撑坏布局。
- 继续使用当前银光 shimmer 作为轻量运行态语言。
- 不引入 CBZWW dotmatrix 动画。

## 5. 信息架构

推荐最终结构：

```tsx
<AgentSessionStatusStack>
  <AgentCurrentStatusRow session={activeSession} />
  <AgentTaskPanel session={activeSession} />
</AgentSessionStatusStack>
```

`AgentSessionStatusStack` 可以先不抽组件，继续保留 div。等状态逻辑稳定后再抽。

第一阶段最重要的是把 `AgentApprovalRow` 的职责升级为 `AgentCurrentStatusRow`，并引入状态 selector。

## 6. 状态模型

建议新增：

```txt
app/src/agent/currentStatus.ts
```

核心类型：

```ts
export type AgentCurrentStatus =
  | AgentApprovalCurrentStatus
  | AgentThinkingCurrentStatus
  | AgentOutputCurrentStatus
  | AgentToolRunningCurrentStatus
  | null;

export interface AgentApprovalCurrentStatus {
  kind: "approval";
  variant: "tool" | "apply_edit";
  requestId: string;
  title: string;
  options: AgentPermissionOption[];
  extraCount: number;
  fileSummary?: AgentEditFileSummary;
}

export interface AgentEditFileSummary {
  changedFiles: number;
  additions: number;
  deletions: number;
  primaryPath?: string;
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
    changeType: "create" | "edit" | "delete" | "unknown";
  }>;
}

export interface AgentThinkingCurrentStatus {
  kind: "thinking";
  label: string;
  tokenCount: number;
  estimated: boolean;
}

export interface AgentOutputCurrentStatus {
  kind: "output";
  label: string;
  tokenCount: number;
  estimated: boolean;
}

export interface AgentToolRunningCurrentStatus {
  kind: "tool_running";
  label: string;
  toolName?: string;
  title?: string;
}
```

第一阶段可以先实现更小集合：

```ts
export type AgentCurrentStatus =
  | { kind: "approval"; variant: "tool" | "apply_edit"; ... }
  | { kind: "thinking"; tokenCount: number; estimated: boolean }
  | { kind: "output"; tokenCount: number; estimated: boolean }
  | null;
```

## 7. 状态优先级

必须有明确优先级，否则 session 同时包含 pending approval、streaming output、running thinking 时 UI 会抖动或表达冲突。

推荐优先级：

| 优先级 | 状态 | 原因 |
|---:|---|---|
| 1 | `approval:apply_edit` | 涉及代码写入或 diff 应用，风险最高，且需要用户决策 |
| 2 | `approval:tool` | 普通工具批准也是阻塞态，需要用户决策 |
| 3 | `tool_running` | 工具运行可能需要让用户知道当前在等待外部动作 |
| 4 | `thinking` | 模型仍在生成过程内容 |
| 5 | `output` | 模型正在生成最终回答 |
| 6 | `null` | 没有需要显示的当前状态 |

注意：

- 所有 approval 状态都优先于 thinking/output。
- apply_edit 是 approval 的特殊 variant，不是独立大类。
- `AgentTaskPanel` 不参与这个优先级，它始终作为第二行显示。

## 8. 状态推导策略

### 8.1 approval 推导

现有 `AgentApprovalRow` 中已有逻辑：

```ts
collectPermissionBlocks(session)
getPendingPermissionBlocks(session)
```

建议把这部分移动到 `app/src/agent/currentStatus.ts` 或 `app/src/agent/permissions.ts`。

推导结果：

- 有 pending permission block：返回 `kind: "approval"`。
- 根据 block/tool/file data 判断 variant。

### 8.2 apply_edit 识别

短期可用启发式：

- permission block 的 `toolCallId` 指向一个涉及编辑的 tool_call。
- tool_call name 属于 edit/apply/patch/write 类工具。
- session 中存在 pending/applied file_change block 或 diff artifact。
- permission title 包含“编辑”“应用”“修改”“写入”“patch”“diff”等关键词。

更稳健的长期方案：

- 在 ACP adapter 中给 permission block 增加结构化 metadata。
- 例如：

```ts
interface AgentPermissionBlock {
  type: "permission";
  requestId: string;
  title: string;
  toolCallId?: string;
  status: "pending" | "resolved";
  options: AgentPermissionOption[];
  intent?: "tool" | "apply_edit";
  affectedFiles?: string[];
}
```

短期不建议立刻改类型协议。可以先用 helper 根据已有 blocks 估算。

### 8.3 thinking 推导

可从 `collectAgentStepTokenStats(session)` 中找：

- `kind === "thinking"`
- `status === "running"`
- 最新的一条。

如果没有 running thinking，但最新 assistant message 正在 streaming 且 resultBlocks 为空，也可以返回 thinking。

显示：

```txt
正在思考 · 1.2k tokens
```

### 8.4 output 推导

可从 token stats 中找：

- `kind === "result"`
- `status === "running"`
- 最新的一条。

或从最新 assistant message 判断：

- `message.status === "streaming"`
- `splitAgentMessageBlocks(message).resultBlocks.length > 0`

显示：

```txt
正在输出 · 3.4k tokens
```

### 8.5 token 数量变化

当前 `tokenStats.ts` 是基于现有文本内容的即时估算，不存储历史 delta。

因此第一阶段可以显示当前累计值：

```txt
正在思考 · 842 tokens
正在输出 · 1.4k tokens
```

如果需要“变化”的动态效果，第二阶段可以加一个轻量 hook：

```ts
function useAgentStatusTokenDelta(status: AgentCurrentStatus) {
  // 保存上一帧 tokenCount
  // 返回 currentCount、delta、trend
}
```

或在 store 层记录每次 streaming patch 后的 token snapshot。

推荐先不要把 delta 放进 store。UI hook 层足够验证体验。

## 9. UI 规格

### 9.1 通用行结构

状态行建议统一为：

```txt
[icon] [status label] [primary detail / title / file chip] [secondary meta]        [actions]
```

例如：

```txt
盾牌 请求批准 允许 Agent 运行构建验证命令                         拒绝  允许▼
盾牌 请求应用编辑 App.tsx +24 -8                                拒绝  允许▼
闪光 正在思考 842 tokens
闪光 正在输出 1.4k tokens
```

### 9.2 approval:tool

保持当前视觉：

- `shield` icon。
- shimmer label：请求批准。
- title 使用 permission block title。
- extra count 使用 `+N more`。
- 右侧按钮：reject + allow split。

### 9.3 approval:apply_edit

建议文案：

```txt
请求应用编辑  App.tsx  +24 -8
请求应用编辑  3 files  +120 -32
```

组件结构：

- 左侧 icon 仍用 `shield`，因为本质还是权限确认。
- label 可用：`请求应用编辑`。
- primary detail：主文件名或 `N files`。
- diff meta：`+N -N`。
- 右侧按钮沿用 approval actions。

当只有 file_change，没有 diff artifact 时：

- 显示 `N files`。
- 如果 additions/deletions 不可靠，可以只显示文件数。
- `diffStats.estimated === true` 时避免显示过度精确的 `+0 -0`。

### 9.4 thinking

建议：

```txt
[spinner/thinking icon] 正在思考 842 tokens
```

视觉：

- label 使用 `agent-silver-shimmer-text`。
- 不显示按钮。
- token count 颜色使用 muted。
- 若 token count 为 0，可显示 `正在思考`，避免空洞数字。

### 9.5 output

建议：

```txt
[text icon] 正在输出 1.4k tokens
```

视觉：

- label 可使用 shimmer。
- token count 使用 muted 或 secondary。
- 不引入矩阵雨动画。

### 9.6 tool_running

未来可扩展：

```txt
[tool icon] 正在运行 pnpm build
[tool icon] 正在读取文件 App.tsx
```

短期可不做，避免范围扩张。

## 10. 组件设计

### 10.1 推荐文件结构

```txt
app/src/agent/currentStatus.ts
app/src/components/agent/AgentCurrentStatusRow.tsx
```

可选后续拆分：

```txt
app/src/components/agent/AgentApprovalActions.tsx
app/src/components/agent/AgentStatusTokenMeta.tsx
app/src/components/agent/AgentEditDiffMeta.tsx
```

第一阶段不必过度拆分。

### 10.2 AgentCurrentStatusRow

职责：

- 调用 `getAgentCurrentStatus(session)`。
- 根据 status.kind 渲染不同 variant。
- 保留 approval actions 行为。
- 不直接实现复杂 session 扫描逻辑。

伪代码：

```tsx
export function AgentCurrentStatusRow({ session }: { session: AgentSession }) {
  const status = useMemo(() => getAgentCurrentStatus(session), [session]);
  if (!status) return null;

  if (status.kind === "approval") {
    return <AgentApprovalStatusRow session={session} status={status} />;
  }

  if (status.kind === "thinking") {
    return <AgentActivityStatusRow icon="spinner" label="正在思考" tokenCount={status.tokenCount} />;
  }

  if (status.kind === "output") {
    return <AgentActivityStatusRow icon="message-square" label="正在输出" tokenCount={status.tokenCount} />;
  }

  return null;
}
```

### 10.3 Approval actions 复用

现有 `AgentApprovalRow` 中的按钮逻辑应尽量保留：

- `fallbackOptions`
- `primaryAllowOption`
- `secondaryAllowOptions`
- `rejectOption`
- allow menu outside click / focus / Escape close
- `resolveMockPermission`

但建议把它从 row 中抽成内部小组件：

```tsx
function AgentApprovalActions({ sessionId, requestId, options }: Props) { ... }
```

这样 `approval:tool` 和 `approval:apply_edit` 共用同一套操作。

## 11. CSS 规划

当前样式集中在 `app/src/index.css`。

建议命名迁移：

```txt
.agent-approval-row -> .agent-current-status-row
.agent-approval-row-main -> .agent-current-status-row-main
.agent-approval-row-label -> .agent-current-status-row-label
.agent-approval-row-title -> .agent-current-status-row-title
.agent-approval-row-actions -> .agent-current-status-row-actions
```

但为了降低第一步风险，可以先保留旧 class，或者使用双 class：

```tsx
<section className="agent-current-status-row agent-approval-row">
```

第一阶段推荐“双 class 过渡”：

- 避免一次大规模 CSS rename。
- 保留已经调好的视觉细节。
- 后续稳定后再清理旧 class。

### 11.1 新增 meta 样式

```css
.agent-current-status-row-meta {
  flex: 0 0 auto;
  color: var(--color-text-muted);
}

.agent-current-status-file-chip {
  min-width: 0;
  max-width: min(18rem, 40vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-current-status-diff-meta {
  flex: 0 0 auto;
  color: var(--color-text-muted);
}
```

### 11.2 motion 约束

继续使用：

```css
.agent-silver-shimmer-text
```

并保留 `prefers-reduced-motion: reduce` fallback。

不要新增高频复杂动画。

## 12. i18n 规划

当前 locale 中已有：

- `requestApproval`
- `approvalMoreCount`
- `allow`
- `allowSession`
- `allowAlways`
- `moreAllowOptions`
- `allowOnce`
- `reject`
- `permissionPending`

需要新增：

```json
{
  "agentConsole.currentStatusThinking": "正在思考",
  "agentConsole.currentStatusOutput": "正在输出",
  "agentConsole.currentStatusApplyEdit": "请求应用编辑",
  "agentConsole.currentStatusRunningTool": "正在运行工具",
  "agentConsole.currentStatusTokenCount": "{{count}} tokens",
  "agentConsole.currentStatusFilesChanged": "{{count}} files",
  "agentConsole.currentStatusDiffCompact": "+{{additions}} -{{deletions}}"
}
```

英文：

```json
{
  "agentConsole.currentStatusThinking": "Thinking",
  "agentConsole.currentStatusOutput": "Outputting",
  "agentConsole.currentStatusApplyEdit": "Apply edits",
  "agentConsole.currentStatusRunningTool": "Running tool",
  "agentConsole.currentStatusTokenCount": "{{count}} tokens",
  "agentConsole.currentStatusFilesChanged": "{{count}} files",
  "agentConsole.currentStatusDiffCompact": "+{{additions}} -{{deletions}}"
}
```

## 13. 实施阶段

### Phase 1：语义重构，保持行为不变

目标：把 `AgentApprovalRow` 升级为通用状态行入口，但 UI 表现和审批行为不变。

任务：

1. 新建 `app/src/agent/currentStatus.ts`。
2. 迁移 `collectPermissionBlocks` 和 `getPendingPermissionBlocks`。
3. 实现 `getAgentCurrentStatus(session)`，第一版只返回 approval 或 null。
4. 新建 `AgentCurrentStatusRow.tsx`。
5. 在 `AgentConsolePanel.tsx` 中替换：

```tsx
<AgentApprovalRow session={activeSession} />
```

为：

```tsx
<AgentCurrentStatusRow session={activeSession} />
```

6. 保留现有 approval UI 样式。

验收：

- 现有请求批准行视觉不变。
- allow split button 行为不变。
- pending permission 解决后状态行消失。
- task panel 仍位于第二行。

### Phase 2：接入 thinking/output 状态

目标：在没有 pending approval 时显示运行状态。

任务：

1. 在 `currentStatus.ts` 中接入 `collectAgentStepTokenStats`。
2. 检测 running thinking。
3. 检测 running result/output。
4. 使用 `formatCompactTokenCount` 格式化 token。
5. 在 `AgentCurrentStatusRow` 中增加 activity renderer。
6. 新增 i18n 文案。

验收：

- streaming thinking 时显示“正在思考”。
- streaming output 时显示“正在输出”。
- token count 随 session 内容更新而变化。
- 没有 approval 时才显示 thinking/output。

### Phase 3：接入 apply_edit approval variant

目标：让编辑生效审批有专属 UI。

任务：

1. 在 `currentStatus.ts` 中识别编辑类 permission。
2. 使用 `getAgentDiffStatsSummary(session)` 生成 file summary。
3. 在 approval renderer 中按 `variant === "apply_edit"` 切换 label。
4. 显示 primary path 或 file count。
5. 显示 compact diff meta。

验收：

- 编辑类 permission 显示“请求应用编辑”。
- UI 展示文件名或文件数量。
- 有 diff artifact 时显示 `+N -N`。
- 按钮行为仍与普通 approval 一致。

### Phase 4：精炼 token delta 和 settle 状态

目标：增强运行态质感，但不破坏克制风格。

任务：

1. 增加 UI hook 记录上一轮 token count。
2. 可选显示短暂 `+N` 增量。
3. 引入 settle 状态，例如“已完成输出”短暂停留。
4. 评估是否需要轻量 fade transition。

验收：

- token 增量不会导致布局跳动。
- reduced motion 下无动画。
- 状态消失不突兀。

## 14. 风险与控制

### 14.1 风险：状态推导过度依赖启发式

尤其是 apply_edit，如果只靠 title 关键词判断，会有误判。

控制：

- 短期只作为 UI enhancement。
- 长期在 ACP adapter 中加入结构化 intent。

### 14.2 风险：token 数值被理解为精确计费

当前 token 是估算。

控制：

- UI 中保持轻量表达。
- 不写“精确”。
- 可在 tooltip 或统计面板里说明 estimated。

### 14.3 风险：状态行变得拥挤

approval + diff + file path + buttons 很容易挤压。

控制：

- file path 必须 ellipsis。
- 移动端或窄宽度下优先隐藏 secondary meta。
- 不在状态行里展示完整 diff。

### 14.4 风险：和 task panel 职责混淆

当前状态和待办事项都是 session-level，但生命周期不同。

控制：

- 当前状态行只显示一个最高优先级状态。
- task panel 继续显示计划进度。
- 不在 current status row 中展示完整任务列表。

## 15. 验收清单

### 功能验收

- pending approval 时显示审批状态。
- 多个 pending approval 时显示额外数量。
- allow once / allow session / always allow 可用。
- reject 可用。
- thinking streaming 时显示 thinking 状态。
- output streaming 时显示 output 状态。
- edit approval 显示文件和 diff 摘要。
- 无当前状态时第一行不占位。

### 布局验收

- 状态行仍在输入框上方、状态栈第一行。
- resize handle 仍直接贴输入框顶部线。
- 状态栈展开不挤压输入框。
- 文字不会撑破容器。
- 窄宽度下按钮和文本不会重叠。

### 代码验收

- 状态推导逻辑集中在 `app/src/agent/currentStatus.ts`。
- UI 组件不直接重复扫描 session blocks。
- approval actions 可复用。
- i18n 中英文齐全。
- TypeScript 无错误。

## 16. 推荐下一步

建议下一轮执行 Phase 1 和 Phase 2：

1. 新建 `currentStatus.ts`。
2. 新建 `AgentCurrentStatusRow.tsx`。
3. 把现有 approval UI 包装成 `approval` variant。
4. 在没有 approval 时显示 thinking/output。
5. 暂不做 apply_edit 的完整 diff UI，避免一次改动过大。

完成后再单独做 Phase 3，把编辑生效审批设计得更精确。
