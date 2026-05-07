---
title: MLFB OpenCode Step连续性规则规划书
description: 规划以普通回复文本作为 step 过程唯一边界
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - OpenCode
  - Agent UI
  - step-continuity
solved_lists:
  - 明确 step 连续性的目标规则
  - 分析当前实现与目标规则的差距
  - 规划后续修改与验证路径
---

# MLFB OpenCode Step连续性规则规划书

## 1. 背景

在 MLFB OpenCode Agent UI 的 no-ACP/HTTP-SSE 集成中，用户观察到当前 step 过程显示存在不连续问题：当 OpenCode 调用 `glob` 工具时，UI 会把原本应该连续的过程拆成多个过程块。表现为：

- 第一段过程持续显示为“正在工作”。
- `glob` 之后出现第二段过程块，例如“已使用 1 个工具、1 次思考”。
- 最终普通回复文本已经输出，但上一个过程块仍像未结束。

这与用户对 Agent 工作过程的认知不一致。用户明确提出：正确的 step 连续性判断条件应当只有一个，即 **agent 是否输出了普通回复消息**。

## 2. 目标规则

后续实现应以如下规则作为 UI step 连续性的唯一核心判断：

> 只要还没有出现普通回复文本，思考、推理、工具、权限、文件编辑等都应该被视为同一个连续过程。

这个规则意味着：

- `glob` 工具调用不能切断 step 过程。
- `edit`、`read`、`grep`、权限请求、任务列表更新等过程事件不能切断 step 过程。
- OpenCode 内部多个 assistant 子回合不能直接映射为多个 UI step 过程。
- 第一个普通回复文本 block 出现前的所有 process-like block 都属于同一个过程组。
- 第一个普通回复文本 block 出现后，过程区进入收束状态，普通回复进入结果区。

## 3. 用户心智模型

用户看到的是“一次请求的 Agent 工作过程”，而不是 OpenCode 内部的事件分层。

从用户角度看，一次请求通常是：

1. 用户发送消息。
2. Agent 进行思考或推理。
3. Agent 调用工具，例如 `glob`、`read`、`edit`。
4. Agent 可能继续思考、继续调用工具。
5. Agent 输出普通回复文本，告诉用户结果。

其中第 2 到第 4 步都属于“正在工作”的同一个连续过程。只有第 5 步开始，才说明 Agent 已经进入普通结果表达阶段。

因此 UI 不应该把 OpenCode 内部的这些边界作为主要分段依据：

- assistant `messageID` 变化。
- `glob` 工具开始或结束。
- 单个 tool call 完成。
- OpenCode 内部的一轮 assistant 子消息完成。
- `message.updated complete` 但 session 仍处于 busy。

## 4. 当前实现状态

当前代码涉及的主要位置：

- `app/src/store/agentStore.ts`
  - 负责接收 OpenCode SSE event。
  - 负责将 `message.part.delta`、`message.part.updated`、`message.updated`、`session.status` 应用到本地 AgentSession。
  - 已经有初步修改：同一用户消息之后的多个 OpenCode assistant 子回合可以合并进同一个 UI assistant 消息。

- `app/src/agent/steps.ts`
  - `splitAgentMessageBlocks(message)` 负责把 assistant message blocks 拆成 `processBlocks` 和 `resultBlocks`。
  - 当前核心规则仍然主要依赖 `block.origin.phase`：
    - `process` 进入过程区。
    - `result` 进入结果区。

- `app/src/components/agent/AgentProcessGroup.tsx`
  - 负责渲染过程组。
  - 根据 `buildAgentProcessSteps(processBlocks, messageId, messageStatus)` 将 block 转成 UI step。

## 5. 当前差距

当前实现已经向目标靠近，但还没有严格等价于“普通回复文本是唯一边界”。

主要差距如下：

### 5.1 过程/结果拆分仍然按 phase，而不是按首次普通回复文本

当前 `splitAgentMessageBlocks` 的逻辑是：

- 任何 `origin.phase === "process"` 的 block 都进入 process。
- 任何 `origin.phase === "result"` 的 block 都进入 result。

这无法表达“第一个普通回复文本之前的一切都是一个过程”。

理想规则应当按消息内 block 顺序处理：

- 在遇到第一段普通回复文本前，所有 block 都属于过程。
- 从第一段普通回复文本开始，文本进入结果区。

### 5.2 OpenCode 内部 assistant 子回合不应直接切 UI 过程

OpenCode 在一次用户请求中可能产生多个 assistant message：

- 第一轮 assistant 思考后决定调用 `glob`。
- 工具执行后进入第二轮 assistant。
- 第二轮 assistant 继续调用 `edit`。
- 最后输出普通回复文本。

UI 不应把这些子回合拆成多个 assistant UI message 或多个过程块。它们都属于同一个用户请求的过程。

### 5.3 中间 complete 信号不能提前结束 UI 过程

OpenCode 的 `message.updated complete` 可能只是内部 assistant 子回合完成，不代表整个用户请求完成。

真正适合作为 UI message 完成的信号应优先是：

- `session.status` 进入 `idle`。

在 `session.status` 仍是 busy/running 的情况下，中间 assistant complete 只能更新元数据，不能让 UI 过程断开。

## 6. 修改计划

### 6.1 修改 `splitAgentMessageBlocks`

目标：让它按“首次普通回复文本”切分，而不是只按 phase 切分。

建议规则：

1. 如果不是 assistant message，保持现状。
2. 对 assistant message 的 blocks 按原始顺序遍历。
3. 定义普通回复文本 block：
   - `block.type === "text"`
   - `block.origin.phase === "result"`
   - `block.content.trim()` 非空
4. 在第一次遇到普通回复文本之前：
   - 所有 block 进入 `processBlocks`。
5. 从第一次普通回复文本开始：
   - 普通文本进入 `resultBlocks`。
   - 后续 result/artifact 类 block 进入 `resultBlocks`。
   - 后续 process-like block 默认仍保留到 `processBlocks`，但不新建第二个过程组。

这样可以确保 `glob` 不会切断过程。

### 6.2 保持一个用户回合对应一个 assistant UI message

目标：一次用户消息之后，在普通回复文本出现前，OpenCode 多个 assistant 子回合合并成同一个 UI assistant message。

已有初步实现方向：

- `AgentMessage` 增加 `providerMessageIds?: string[]`。
- 一个 UI assistant message 可以绑定多个 OpenCode assistant `messageID`。
- 新的 assistant 子回合如果发生在最近一个用户消息之后，应复用当前 UI assistant message。

后续需要复查并稳固：

- `message.part.delta` 应能找到当前用户回合的 assistant UI message。
- `message.part.updated` 应能 upsert 到同一个 UI assistant message。
- `message.updated complete` 不应在 session still running 时提前拆段。

### 6.3 完成状态处理

目标：避免旧过程块永久显示“正在工作”。

建议规则：

- `session.status idle` 时：
  - flush pending streaming buffer。
  - complete 当前 streaming assistant message。
  - 将 running thinking/compaction 标记为 completed。
- 工具 block 状态应由 OpenCode part state 判定：
  - `state.status === "completed"` 或有 `time.end` 或有 `output` -> completed。
  - `state.status === "error"` 或有 `error` -> failed。
  - `state.status === "running"` -> running。
  - `state.status === "pending"` -> pending。

### 6.4 UI 行为

预期 UI 行为：

- 一次用户请求只显示一个主过程组。
- 过程组标题在运行中显示“正在工作”。
- 过程中可以连续显示：思考 -> glob -> 思考 -> edit -> 权限 -> 最终回复。
- 最终普通回复文本出现后显示在结果区。
- session idle 后过程组不再显示为运行中。
- 如果用户设置了自动折叠，完成后按现有交互折叠。

## 7. 验证计划

### 7.1 基础流式回复

输入一个普通问题，预期：

- 思考过程和最终回复在同一条 assistant message 内。
- 回复完成后不残留“正在工作”。

### 7.2 工具调用流

输入需要文件搜索或创建文件的请求，预期：

- `glob` 不创建第二个过程块。
- `edit` 不创建第二个过程块。
- 最终回复文本出现前的所有过程节点在同一个 step 过程内。

### 7.3 多轮对话

连续发送两次消息，预期：

- 第二次发送能得到回复。
- 第二次请求有自己的连续过程组。
- 第一轮过程不会被第二轮事件污染。

### 7.4 权限请求

触发文件编辑审批，预期：

- 权限请求属于当前连续过程。
- 批准后后续工具和最终回复仍在同一个过程内。

### 7.5 完成态

完成后检查：

- 过程组不再显示“正在工作”。
- thinking/compaction 不再 running。
- tool_call 状态正确显示 completed/failed。

## 8. 风险与注意事项

### 8.1 普通文本后又出现工具

理论上某些模型或 provider 可能先输出普通文本，然后继续工具调用。这种交错输出不符合主流 Agent 交互心智。

建议处理：

- 不隐藏后续工具。
- 不将其作为新的主过程块强行切开。
- 先保守地仍放在同一个 assistant message 中，后续如有真实案例再细化。

### 8.2 block 顺序依赖事件到达顺序

当前 UI 很大程度依赖 store 中 blocks 的插入顺序。如果 OpenCode 事件晚到，顺序可能不完全等于真实发生顺序。

短期建议：

- 先不引入复杂排序。
- 保持最小修改，观察实际 UI。

中期可以考虑：

- 使用 `createdAt` / `updatedAt` / OpenCode part id 做稳定排序。
- 对同一 message 的 part 维护 provider 原始顺序。

### 8.3 不要恢复危险回滚功能

本规划不涉及 OpenCode revert/unrevert，也不应重新引入会改变工作区历史状态的恢复能力。

## 9. 推荐实施顺序

1. 修改 `splitAgentMessageBlocks`，实现“首次普通回复文本”边界。
2. 复查 live SSE 合并逻辑，确保多个 provider assistant 子回合进入同一个 UI assistant message。
3. 调整完成状态，避免中间 complete 切断 UI 过程。
4. 运行 VS Code diagnostics。
5. 运行 `cd app && npm run build`。
6. 手动复测 `glob -> edit -> final text` 场景。
7. 根据 UI 观察决定是否进一步引入 block 顺序稳定化。

## 10. 当前结论

可以进一步改为用户提出的规则，而且这应当成为 MLFB OpenCode Agent UI 的主规则：

> 普通回复文本出现之前的一切，都属于同一个连续 step 过程。

这条规则比按工具调用、OpenCode assistant 子回合或 `messageID` 分段更符合用户感知，也更能避免 `glob` 打断过程、旧过程残留“正在工作”等问题。
