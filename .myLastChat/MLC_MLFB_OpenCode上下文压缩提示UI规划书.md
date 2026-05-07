---
title: MLFB OpenCode 上下文压缩提示 UI 规划书
description: 规划 OpenCode compaction 事件在 Agent UI 中的简洁显示与状态接入
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - OpenCode
  - Agent Console
  - compaction
solved_lists:
  - 分析 OpenCode 原生压缩上下文行为
  - 明确 MLFB 压缩提示 UI 目标
---

# MLFB OpenCode 上下文压缩提示 UI 规划书

## 背景

MLFB 已经将“压缩上下文”按钮接入 OpenCode HTTP `POST /session/:sessionID/summarize`，按钮位置位于已有的上下文空间面板中。当前剩余问题是压缩动作触发后，聊天流中如何用清晰但克制的方式提示用户。

用户明确要求：不要把压缩 UI 做得花哨，不要新增夸张卡片；应接近当前单次思考块的样式。

## OpenCode 1.14.33 行为参考

### HTTP 入口

OpenCode 的 session summarize endpoint 位于：

- `packages/opencode/src/server/routes/instance/session.ts`
- `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts`

处理流程为：

1. 接收 `providerID`、`modelID`、`auto`。
2. 清理 revert 状态。
3. 调用 `SessionCompaction.create(...)` 创建 compaction 任务。
4. 调用 `SessionPrompt.loop(...)` 驱动压缩流程。
5. 返回 boolean。

### 数据结构

OpenCode compaction 不是普通用户文本，也不是普通 assistant 回复，而是一个特殊 message part：

```ts
{
  type: "compaction",
  auto: boolean,
  overflow?: boolean,
  tail_start_id?: string
}
```

它被写入一个 synthetic user message 中。

### 原生 UI 表现

OpenCode TUI 在 `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` 中检测 user message 是否包含 `type === "compaction"` 的 part，然后渲染一条标题为 `Compaction` 的分隔线。

OpenCode Web/Desktop app 的 `packages/app/src/**` 只发现 compact 命令触发逻辑，没有发现 compaction part 的专门聊天渲染逻辑。因此 MLFB 应参考 TUI 的“轻提示/过程分隔”语义，而不是将摘要正文强行显示成普通 assistant 消息。

## 当前 MLFB 缺口

当前 MLFB 的 `eventNormalizer` 已能识别 `part.type === "compaction"`，但它被临时映射为 `thinking` block，存在几个问题：

1. 语义不准确：compaction 不等于普通 thinking。
2. 历史恢复不稳：OpenCode compaction part 属于 user message，而 MLFB user message 渲染不会展示 process block。
3. 完成状态不明确：尚未处理 `session.compacted` 事件，无法持久显示“已压缩”。
4. 输出内容缺少专门约束：如果后续从 summary assistant message 中暴露内容，需要有限高度滚动，不应撑开整个聊天流。

## 目标

实现一个轻量、克制、可恢复的上下文压缩提示。

### UI 目标

1. 正在压缩上下文：
   - 出现在 Agent 过程区域中。
   - 使用和“正在工作”一致的光亮扫过效果。
   - 文案简洁，例如“正在压缩上下文”。

2. 压缩完成且无输出内容：
   - 显示为轻量过程提示。
   - 文案简洁，例如“上下文已压缩”。
   - 不使用大卡片，不抢占聊天流。

3. 压缩完成且有可展示输出：
   - 复用当前单个思考块的视觉语言。
   - 内容区域设置有限最大高度。
   - 超出后允许滚动阅读。

4. 历史恢复：
   - 恢复 OpenCode session 时，历史中的 compaction part 仍能显示为压缩提示。

## 方案设计

### 1. Agent 类型扩展

新增 `AgentCompactionBlock`：

```ts
interface AgentCompactionBlock extends AgentBlockBase {
  type: "compaction";
  status: "running" | "completed" | "failed";
  auto?: boolean;
  overflow?: boolean;
  content?: string;
}
```

将其加入 `AgentContentBlock` union。

### 2. OpenCode event normalization

调整 `normalizeCompactionPart`：

- 不再返回 `AgentThinkingBlock`。
- 返回 `AgentCompactionBlock`。
- 从 part 中读取 `auto`、`overflow`、`text`、`content`、`summary` 等潜在文本字段。
- 默认 `status` 为 `running`，如果存在结束时间则为 `completed`。

新增 `session.compacted` normalized event：

```ts
{
  type: "session.compacted",
  sessionId: string
}
```

### 3. Store 状态处理

`applyOpenCodeBusEvent` 增加：

- `block.updated` 中遇到 compaction block 时照常 upsert。
- `session.compacted` 时：
  - `session.compacting = false`
  - `status` 回到 `idle`
  - 将最新 compaction block 标记为 completed

如果用户点击按钮后 SSE part 到达较慢，store 已有 `compacting = true` 可驱动上下文按钮状态；聊天流提示依赖 OpenCode 事件，不额外伪造普通消息。

### 4. Process step 映射

`steps.ts` 中新增 step kind：

```ts
type AgentStepKind = "thinking" | "compaction" | ...
```

`buildAgentProcessSteps`：

- `block.type === "compaction"` 映射为 step kind `compaction`。
- running label 为“正在压缩上下文”。
- completed label 为“上下文已压缩”。
- detail 来自 `block.content`。

### 5. ProcessGroup UI

`AgentProcessGroup` 增强：

- `stepIconName("compaction")` 复用 `message-dot` 或 `list-tree`，保持克制。
- `StepDetail` 对 compaction 复用 MarkdownContent。
- 单个 compaction step 可走类似单个 thinking 的展示路径。
- 有 detail 时使用已有 `.agent-process-single-thinking` 限高滚动机制，避免撑高。
- running 状态依赖现有 `hasBusyStep` 和 `agent-silver-shimmer-text`，沿用扫光效果。

### 6. CSS

少量 CSS：

- 可选增加 `.agent-process-single-compaction`，与 `.agent-process-single-thinking` 共享尺寸约束。
- 为 `data-kind="compaction"` 做极轻微颜色/透明度调整即可，不做卡片化装饰。

## 验收标准

- 点击上下文面板“压缩上下文”后，按钮进入“正在压缩上下文”状态。
- 收到 OpenCode compaction part 后，聊天过程区出现简洁压缩提示。
- 收到 `session.compacted` 后，提示变为完成态，按钮恢复可用。
- 如果 compaction block 有内容，内容区域可滚动且不会撑开聊天流。
- 恢复历史 session 时，compaction part 不会消失。
- 不再使用新增顶栏压缩按钮。
- VS Code diagnostics 无 TypeScript 错误。

## 实施步骤

1. 更新 Agent 类型：新增 compaction block。
2. 更新 OpenCode event normalizer：compaction part 和 `session.compacted`。
3. 更新 store：处理 completed 状态。
4. 更新 steps 和 process UI：简洁展示 compaction step。
5. 更新 i18n 文案。
6. 跑 VS Code diagnostics。

## 风险与控制

- 风险：OpenCode compaction summary assistant message 可能不应该完整展示。
  - 控制：仅展示 compaction block 自身携带的 content，不主动展开 summary assistant 内容。

- 风险：历史恢复中 user message 的 process block 当前不显示。
  - 控制：`splitAgentMessageBlocks` 对 user message 中的 compaction block 做特殊透出，或在恢复映射时将 compaction block 转为 system/assistant 过程消息。

- 风险：UI 过重。
  - 控制：复用现有 process group 和单 thinking 样式，不新增大型视觉组件。
