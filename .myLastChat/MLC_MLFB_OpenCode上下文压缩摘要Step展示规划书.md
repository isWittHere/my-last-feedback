---
title: MLFB OpenCode上下文压缩摘要Step展示规划书
description: 规划OpenCode压缩摘要在Agent Step UI中的正确展示
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - OpenCode
  - Agent Console
  - context compaction
  - step UI
solved_lists:
  - 分析OpenCode summarize与compaction源码机制
  - 明确压缩step位置与摘要流式输出起点
  - 规划实时流与历史恢复的统一展示方案
---

# MLFB OpenCode 上下文压缩摘要 Step 展示规划书

更新时间：2026-05-08

## 1. 背景

MLFB Agent Console 当前已经通过 OpenCode HTTP/SSE 通道集成了上下文压缩能力。用户可以在 Agent Console 的上下文指示器中触发压缩，OpenCode 也可能在上下文溢出时自动触发压缩。

当前 UI 已经具备 `compaction` step 的基础展示能力：

- `AgentCompactionBlock` 支持 `content?: string`。
- `buildAgentProcessSteps()` 会将 compaction block 转换成 `kind: "compaction"` 的 step。
- `AgentProcessGroup` 的 `StepDetail` 会把 compaction step 的 `detail` 作为 Markdown 展示。

但目前摘要文本没有正确进入 compaction step detail，而是以普通 assistant 输出形式展示在对话末端；同时手动压缩时，压缩 step 可能被插入到已有 assistant process group 的旧 step 中间，造成时间线错觉。

本规划文档用于定义正确的 UI 行为、数据归一化规则、实时流处理策略、历史恢复策略和实施步骤。

## 2. 当前观察到的问题

### 2.1 压缩 step 位置不稳定

手动触发压缩时，当前实现会在本地插入一个 running compaction block。

当前链路大致为：

```text
compactAgentSession()
  -> startCompactionInSession()
  -> upsertAssistantBlock()
  -> findAssistantMessageIndex()
  -> insertProcessBlock()
```

`upsertAssistantBlock()` 默认寻找最近的 assistant message。若最近的 assistant message 已经有工具 step、思考 step 和 result 输出，`insertProcessBlock()` 会把新的 process block 插到第一个 result block 之前。

这会导致手动压缩 step 看起来像是被插入到旧 assistant 回答的内部过程里，而不是作为“当前发生的压缩动作”出现在对话末尾。

### 2.2 摘要以普通输出形式流式出现在末端

OpenCode 生成的压缩摘要本质上是一个 `summary: true` 的 assistant message，但它的 text part 仍然通过普通 `message.part.delta` 流出来。

当前 MLFB normalizer 对 text delta 的处理是：

```ts
phase: field === "text" && partType !== "reasoning" ? "result" : "process"
```

也就是说，只要是 `field: "text"`，就被视为普通 result 输出。当前逻辑没有判断该 message 是否是 OpenCode 的 compaction summary message。

因此实时流中，压缩摘要会显示为普通 assistant 输出。

### 2.3 历史恢复后仍然显示为普通输出

历史恢复时，`agentMessagesFromOpenCodeMessages()` 会把 OpenCode messages 映射为 MLFB `AgentMessage[]`。

当前逻辑会：

- 将 compaction-only user message 转成 assistant message，生成 compaction block。
- 将 `summary: true` assistant message 的 text part 转成普通 `AgentTextBlock`。
- 通过 `mergeContiguousAssistantMessages()` 合并相邻 assistant messages。

结果是恢复历史时，压缩 step 和摘要普通输出仍会被合并到一个普通 assistant 输出组里。

## 3. OpenCode 侧机制分析

### 3.1 HTTP summarize 不返回摘要文本

OpenCode 的 summarize 路由：

```text
POST /session/:sessionID/summarize
```

执行逻辑：

```text
revert.cleanup(session)
session.messages({ sessionID })
compact.create({ sessionID, agent, model, auto })
prompt.loop({ sessionID })
return true
```

结论：

- HTTP response 只是 boolean。
- 摘要文本不会从 summarize response 返回。
- 摘要只能通过 SSE events 或后续 `GET /session/:sessionID/message` 获取。

### 3.2 compaction 被建模成一个 user task

OpenCode `SessionCompaction.create()` 会创建一个新的 user message，并写入一个 compaction part：

```text
user message
  part: type = "compaction"
```

这个 user message 是一个内部任务，不是用户自然输入。

### 3.3 prompt.loop 处理 compaction task

`prompt.loop()` 会从最新消息中寻找 task：

```text
task.type === "compaction"
  -> compaction.process({ parentID: lastUser.id, messages, sessionID, auto, overflow })
```

### 3.4 摘要是一个 summary assistant message

`compaction.process()` 会创建 assistant message：

```text
role: "assistant"
parentID: input.parentID
mode: "compaction"
agent: "compaction"
summary: true
```

摘要文本通过该 assistant message 的 text part 生成。

所以 OpenCode 的真实数据结构是：

```text
user message: compaction part
assistant message: summary text, summary: true, parentID -> compaction user message
```

### 3.5 session.compacted 只是完成信号

压缩成功后 OpenCode 发布：

```text
session.compacted
```

该事件 payload 只包含 sessionID，不携带摘要文本。

因此 MLFB 不能依赖 `session.compacted` 获取摘要，只能用它作为完成信号，并通过 summary assistant message 或 messages refresh 获取文本。

### 3.6 tail_start_id 的语义

OpenCode `SessionCompaction.select()` 会决定哪些历史消息进入摘要，哪些 recent tail 保留原文。

相关配置包括：

- `tail_turns`
- `preserve_recent_tokens`
- `preserved` token budget

如果存在 recent tail，OpenCode 会将 `tail_start_id` 写回 compaction part。

后续 `filterCompacted()` 会使用该边界：

```text
已完成摘要覆盖旧 head
从 tail_start_id 开始保留 recent tail 原文
```

重要结论：

- `tail_start_id` 描述压缩摘要覆盖范围。
- `tail_start_id` 不描述压缩动作发生时间。
- UI 不应该根据 `tail_start_id` 把压缩 step 插回旧消息位置。

## 4. 目标 UI 行为

### 4.1 总原则

压缩 step 的位置跟随“压缩动作发生的时间”。

摘要内容的流式输出起点是“压缩 step detail”。

`tail_start_id` 只作为 step detail 的辅助信息，不参与决定 UI 时间线位置。

补充规则：压缩动作本身是一轮 OpenCode compaction 对话，该对话可能先生成 reasoning/thinking，再生成最终 summary text。因此“压缩回合的位置”和“compaction step 的位置”不是完全同一个概念。

正确顺序是：

```text
压缩回合 process group
  thinking / reasoning step
  compaction step
    summary text
```

也就是说，compaction step 表示“压缩摘要正文开始输出”，不表示“压缩回合开始”。若 summary assistant message 产生 reasoning part，该 thinking step 必须排在 compaction step 前面。

### 4.2 手动压缩

手动压缩发生在用户主动点击上下文压缩按钮时，通常 session 应处于 idle 状态。

目标 UI：

```text
用户：之前的问题
Agent：之前的回答
用户点击压缩
Agent process group：上下文压缩中 / 上下文已压缩
  可选：思考 step
  detail：摘要 Markdown 流式展示
```

规则：

- 点击压缩后，立即在对话末尾创建一个独立 compaction process group。
- 不把 compaction step 插入上一个 assistant message。
- 如果 OpenCode summary assistant 先输出 reasoning/thinking，该 thinking step 插入到 compaction step 前。
- 摘要 text delta 进入该 step 的 `content`。
- 不生成普通 result 输出。
- 完成后 step 状态变为 completed。
- 若失败，step 状态变为 failed，并展示错误内容。

### 4.3 自动压缩

自动压缩发生在 OpenCode 正在处理某次用户请求时，例如上下文溢出。

目标 UI：

```text
用户：复杂任务
Agent process：读取文件
Agent process：运行工具
Agent process：压缩回合中的思考
Agent process：上下文压缩中
  detail：摘要 Markdown 流式展示
Agent process：继续执行后续步骤
Agent result：最终回答
```

规则：

- 自动压缩属于当前 assistant turn 的 process 流。
- compaction step 应放在当前 turn 中“压缩开始”的位置。
- 若 compaction summary assistant 产生 reasoning/thinking，该 thinking step 应排在 compaction step 前。
- 摘要 text delta 进入该 step detail。
- 压缩完成后的正常工具调用、思考、最终回答继续正常显示。
- 摘要本身不作为普通 result 输出。

### 4.4 历史恢复

历史恢复应重建与实时流一致的 UI：

```text
compaction-only user message + summary assistant message
  -> 一个 UI compaction process group
  -> summary text 合入 step detail
```

规则：

- compaction step 放在 OpenCode compaction-only user message 的原始时间位置。
- 若后续 summary assistant message 的 `parentID` 指向该 compaction user message，将摘要文本合入 compaction block。
- summary assistant message 不再生成普通 `AgentTextBlock`。
- `tail_start_id` 可以展示为 detail 元信息，但不改变位置。

## 5. 目标数据模型

当前 `AgentCompactionBlock` 已有基础字段：

```ts
export interface AgentCompactionBlock extends AgentBlockBase {
  type: "compaction";
  status: "running" | "completed" | "failed";
  auto?: boolean;
  overflow?: boolean;
  content?: string;
}
```

建议扩展字段：

```ts
export interface AgentCompactionBlock extends AgentBlockBase {
  type: "compaction";
  status: "running" | "completed" | "failed";
  auto?: boolean;
  overflow?: boolean;
  content?: string;
  providerCompactionMessageId?: string;
  providerSummaryMessageId?: string;
  tailStartId?: string;
  summaryComplete?: boolean;
}
```

字段说明：

- `providerCompactionMessageId`：OpenCode compaction-only user message id。
- `providerSummaryMessageId`：OpenCode summary assistant message id。
- `tailStartId`：OpenCode recent tail 起点，仅用于说明语义范围。
- `summaryComplete`：摘要文本是否已完整接收。

如果希望减少类型变更，也可以先不扩展接口，而是只利用 `content` 和 `origin.groupId`。但为了后续恢复、聚焦、token 统计、debug 更清晰，建议显式建模。

## 6. 实时流处理方案

### 6.1 增加 compaction runtime registry

在 agent store 内维护一个轻量 runtime map：

```ts
type CompactionRuntimeState = {
  sessionId: string;
  providerSessionId: string;
  compactionBlockId: string;
  providerCompactionMessageId?: string;
  providerSummaryMessageId?: string;
  pendingSummaryText?: string;
};
```

用途：

- 将 summary message id 绑定到 UI compaction block。
- 在 delta 早于 message.updated 到达时暂存文本。
- 在 `session.compacted` 后做 reconciliation。

### 6.2 手动压缩启动

当前：

```text
startCompactionInSession()
  -> upsertAssistantBlock()
```

建议改为：

```text
startManualCompactionInSession()
  -> appendStandaloneCompactionMessage()
```

手动压缩应创建新的 assistant message：

```ts
{
  role: "assistant",
  status: "streaming",
  blocks: [compactionBlock],
}
```

这样 compaction step 会在对话末尾形成独立 process group。

### 6.3 自动压缩启动

自动压缩由 OpenCode events 驱动，可能不会经过用户按钮。

识别条件：

- 收到 compaction part 的 `message.part.updated`。
- part type 为 `compaction`。
- part.auto 或 part.overflow 可能为 true。

处理策略：

- 若 session 当前 running，插入当前 assistant turn 的 process 流末尾。
- 若没有合适 running assistant，则创建独立 compaction process group。
- 绑定 `providerCompactionMessageId`。

### 6.4 识别 summary assistant message

在 `message.updated` 中识别：

```ts
const isCompactionSummary =
  normalized.info?.summary === true ||
  normalized.info?.mode === "compaction" ||
  normalized.info?.agent === "compaction";
```

若为 true：

- 将 `messageId` 记录为 `providerSummaryMessageId`。
- 通过 `parentID` 寻找对应 compaction block。
- 若有 pending delta，回放到该 compaction block 的 `content`。
- 后续该 messageID 的 text delta 不进入普通 result。

### 6.5 路由 summary text delta

当前 text delta 全部进入 result。

建议改为：

```text
if messageID is known compaction summary:
  append text to compaction block content
else:
  normal appendAssistantTextChunk(result)
```

需要处理事件顺序：

- 如果 delta 先于 message.updated 到达，先按 messageID 缓存在 pending map。
- message.updated 识别为 summary 后，转移 pending text 到 compaction block。
- 如果最终发现不是 summary，再把 pending text 作为普通 result 刷出。

为简化第一版，可以在 `session.compacted` 后强制拉取 messages 做最终校正，降低事件乱序风险。

### 6.6 session.compacted 的作用

`session.compacted` 只做完成信号：

- 标记 compaction block completed。
- 停止 compacting 状态。
- 触发一次 `client.messages(providerSessionId)` reconciliation。
- 如果找到 summary 文本，写入 compaction block content。
- 如果找不到，保留兜底文案“上下文已压缩”。

## 7. 历史恢复方案

### 7.1 当前恢复问题

当前恢复逻辑按 message 顺序逐条映射，然后合并相邻 assistant messages。

这会导致：

```text
compaction-only user -> assistant compaction block
summary assistant -> assistant text result
merge -> compaction step + normal result
```

### 7.2 新恢复算法

建议将 OpenCode messages 先做一次 compaction pair 归并，再映射为 Agent messages。

伪代码：

```ts
function agentMessagesFromOpenCodeMessages(messages) {
  const summaryByParentId = new Map();

  for (const message of messages) {
    if (message.info.role === "assistant" && isCompactionSummary(message.info)) {
      summaryByParentId.set(message.info.parentID, message);
    }
  }

  const result = [];

  for (const message of messages) {
    if (isCompactionOnlyUserMessage(message)) {
      const summaryMessage = summaryByParentId.get(message.info.id);
      result.push(buildCompactionAgentMessage(message, summaryMessage));
      markConsumed(summaryMessage);
      continue;
    }

    if (isConsumedSummaryMessage(message)) continue;

    result.push(normalMessageMapping(message));
  }

  return mergeAssistantMessagesWithCompactionBoundaries(result);
}
```

### 7.3 compaction pair 映射结果

一个 OpenCode pair：

```text
user: compaction part, id = U1
assistant: summary true, parentID = U1, text = S
```

映射为：

```ts
AgentMessage {
  role: "assistant",
  status: "complete",
  blocks: [
    {
      type: "compaction",
      status: "completed",
      providerCompactionMessageId: "U1",
      providerSummaryMessageId: "A1",
      content: "S",
      tailStartId: part.tail_start_id,
    }
  ]
}
```

### 7.4 合并边界

`mergeContiguousAssistantMessages()` 应避免把 compaction-only UI message 和普通 assistant message 合并。

建议规则：

- 普通 assistant messages 可以继续合并。
- compaction process group 默认作为边界。
- compaction pair 内部可以合并成一个 UI message。
- compaction message 不与前后普通 assistant message 合并。

这样历史恢复与实时流保持一致。

## 8. UI 展示细节

### 8.1 Step label

沿用当前标签：

- running：`正在压缩上下文`
- completed：`上下文已压缩`
- failed：`上下文压缩失败`

### 8.2 Step detail

有摘要内容时：

- 用 MarkdownContent 渲染 `content`。
- running 时允许流式增长。
- completed 后保持可展开。

无摘要内容时：

- running：显示 `正在压缩上下文`。
- completed：显示 `上下文已压缩`。
- failed：显示错误信息。

### 8.3 tail_start_id 展示

第一版可以不展示。

若展示，建议作为低权重说明：

```text
较早上下文已摘要化，最近上下文仍保留原文。
```

不建议直接显示 raw id，除非 debug 模式。

### 8.4 自动展开策略

建议：

- compaction running 时自动展开当前 step detail。
- completed 后保持当前展开状态，不强制折叠。
- 历史恢复默认折叠，只显示“上下文已压缩”。

## 9. 需要修改的文件

预计主要修改：

- `app/src/agent/types.ts`
- `app/src/agent/opencode/httpTypes.ts`
- `app/src/agent/opencode/eventNormalizer.ts`
- `app/src/store/agentStore.ts`
- `app/src/agent/steps.ts`
- `app/src/components/agent/AgentProcessGroup.tsx`
- `app/src/i18n/locales/zh.json`
- `app/src/i18n/locales/en.json`

可能不需要改 OpenCode reference source。

## 10. 实施阶段

### Phase 1：修正实时手动压缩位置

目标：手动压缩 step 不再插入旧 assistant process group。

任务：

- 新增 `appendStandaloneCompactionMessage()`。
- 手动 `compactAgentSession()` 改用独立 process group。
- 保持现有 `session.compacted` 完成状态处理。

验收：

- idle 状态点击压缩后，step 出现在对话末尾。
- 不再插入上一条 assistant 回答内部。

### Phase 2：识别 summary assistant 并拦截普通 result 输出

目标：压缩摘要不再作为普通输出显示。

任务：

- 在 `OpenCodeMessageInfo` 中显式声明 `summary?: boolean`。
- 在 store 里识别 `summary === true` / `mode === "compaction"` / `agent === "compaction"`。
- 建立 summary message id 到 compaction block 的绑定。
- 将 summary text delta 写入 compaction block content。
- 阻止该 text delta 进入普通 result block。

验收：

- 实时摘要在 compaction step detail 内流式增长。
- 对话末端不再出现重复的普通摘要输出。

### Phase 3：历史恢复归并 compaction pair

目标：恢复历史时展示与实时一致。

任务：

- 在 `agentMessagesFromOpenCodeMessages()` 中识别 compaction-only user message。
- 找到 `summary === true && parentID === compactionUserId` 的 assistant message。
- 归并为单个 compaction step。
- 消费 summary assistant message，避免普通输出。
- 调整 assistant merge 边界。

验收：

- 历史恢复后，压缩摘要在 step detail 内。
- 无普通 summary 输出。
- compaction step 作为独立过程组位于压缩发生位置。

### Phase 4：自动压缩与 reconciliation

目标：处理自动压缩、事件乱序和漏流。

任务：

- 支持自动 compaction part 到当前 running process group。
- 处理 delta 早于 message.updated 的 pending buffer。
- 在 `session.compacted` 后拉取 messages 校正 summary content。
- 避免重复写入 content。

验收：

- 自动压缩时 step 位于当前 turn 的过程流。
- 后续正常输出接在压缩 step 后。
- 快速完成或事件乱序时仍能恢复摘要。

### Phase 5：UI polish 与 i18n

目标：展示更清晰、更稳定。

任务：

- running 时自动展开 compaction step。
- completed 后保留用户展开状态。
- 添加“最近上下文保留原文”的可选说明。
- 补齐中英文文案。

验收：

- 手动压缩、自动压缩、历史恢复体验一致。
- 没有重复摘要输出。
- step label 和 detail 在中英文环境下均合理。

## 11. 关键边界情况

### 11.1 delta 先于 message.updated

风险：尚不知道 messageID 是 summary，就把文本当普通 result 输出。

方案：

- 对未知 messageID 的早期 text delta 可短暂缓存。
- 或在发现 summary message 后从普通 result 中迁移文本。
- 第一版可用 `session.compacted` 后 messages refresh 兜底。

### 11.2 summary message 没有文本

风险：压缩完成但没有摘要可展示。

方案：

- completed step 显示兜底文案。
- 保留诊断信息。

### 11.3 手动压缩时 session 仍在 running

风险：手动压缩和正常 assistant 输出交错。

建议：

- 第一版禁用 running 状态下的手动压缩按钮。
- 或将其明确视为当前 turn 的 process step，但这会增加复杂度。

### 11.4 多次连续压缩

风险：summary message 绑定到错误 compaction block。

方案：

- 优先通过 `parentID -> providerCompactionMessageId` 绑定。
- 其次才 fallback 到最新 running compaction block。

### 11.5 自动压缩后自动继续

风险：后续 continuation 输出被误判成 summary。

方案：

- 只拦截 `summary === true` 或 `mode/agent === "compaction"` 的 assistant message。
- synthetic continue user message 后的普通 assistant 输出照常进入 result/process。

## 12. 验证清单

### 手动压缩实时验证

- 在 idle session 点击压缩。
- 观察 compaction step 是否出现在对话末尾。
- 观察摘要是否在 step detail 内流式增长。
- 确认末尾没有普通 summary 输出。
- 压缩完成后 step label 变为“上下文已压缩”。

### 历史恢复验证

- 重启应用或重新加载 OpenCode session。
- 打开已压缩 session。
- 确认 compaction step 仍在原压缩发生位置。
- 确认 summary text 在 step detail 内。
- 确认没有重复普通输出。

### 自动压缩验证

- 构造超长上下文触发 OpenCode auto compaction。
- 确认 compaction step 出现在当前 running turn 中。
- 确认压缩摘要进入 step detail。
- 确认压缩后的 continuation 正常显示。

### 回归验证

- 普通 assistant text delta 仍正常流式输出。
- reasoning 仍进入 thinking step。
- tool call 和 result 仍正常归类。
- token 统计不因 summary 重复计数明显膨胀。

## 13. 风险与回滚

### 风险

- 事件顺序不稳定导致第一版实时摘要偶发短暂出现在普通 result。
- 历史恢复归并逻辑可能影响普通相邻 assistant message 合并。
- 自动压缩场景较难稳定复现，需要构造测试。

### 回滚策略

- 保持新逻辑集中在 compaction summary 判断分支。
- 不改变普通 text/reasoning/tool 的默认路径。
- 若出现异常，可关闭 summary 拦截，仅保留手动压缩位置修复。

## 14. 建议优先级

推荐顺序：

1. Phase 1：先修手动压缩 step 位置。
2. Phase 2：修实时 summary 流式归属。
3. Phase 3：修历史恢复重复输出。
4. Phase 4：补自动压缩和 reconciliation。
5. Phase 5：做 UI polish。

这样可以先解决用户最容易观察到的错位和重复输出，再逐步覆盖自动压缩与事件乱序。

## 15. 最终目标

最终体验应为：

```text
压缩发生时，在正确的时间线位置出现一个上下文压缩 step。
摘要从这个 step 的 detail 中流式输出。
摘要不再作为普通 assistant 回答出现。
历史恢复后仍保持同样结构。
tail_start_id 只用于说明摘要覆盖范围，不改变 UI 位置。
```

这能让用户清楚地区分：

- agent 正在回答用户问题。
- agent 正在维护上下文。
- 压缩摘要覆盖的是旧上下文，但压缩动作发生在当前时间点。