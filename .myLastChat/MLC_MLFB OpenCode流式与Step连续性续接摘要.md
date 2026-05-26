---
title: MLFB OpenCode流式与Step连续性续接摘要
description: 记录 OpenCode 流式、事件路由与 step 连续性上下文
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
solved_lists:
  - 分析 OpenCode SSE 有响应但 UI 不显示流式输出的问题
  - 修复 SSE event 按 providerSessionId 路由到正确本地 session
  - 修复本地 user prompt 被 live part.updated 重复渲染的问题
  - 分析并初步修复多轮对话第二次无回复的 provider message id 问题
  - 创建 OpenCode Step 连续性规则规划书
---

# MLFB OpenCode流式与Step连续性续接摘要

## 1. Previous Conversation

本次会话围绕 MLFB 的 OpenCode no-ACP/HTTP-SSE Agent UI 集成继续推进。整体目标是让 MLFB 保留自有 Agent UI，同时通过 OpenCode serve HTTP/SSE 作为后端能力层，完成真实的流式输出、diff 审批、session diff、上下文压缩、消息工具行和 step 过程展示。

前序工作中，用户曾明确要求：

- OpenCode 对文件编辑需要用户审批时，应显示各文件 diff。
- 顶栏 diff 信息面板需要查看 session 产物 diff，包含所有有 diff 的文件。
- 上下文压缩应集成到已有上下文面板按钮，不要新增捏造按钮。
- 压缩 UI 不要花哨，应类似单次思考样式。
- 正在压缩上下文时使用和“正在工作”一样的光亮扫过效果。
- 如果压缩动作有输出内容，复用单个思考块样式，并用有限高度空间滚动阅读。
- 参考 `ref-repos/opencode-1.14.33/` 分析 OpenCode Desktop 的消息工具行，包括复制、编辑重提、分支等。

之后用户发现 OpenCode 的 revert/restore 会强制工作区回到历史状态，明确要求删除回滚功能及相关 UI，不再使用这种功能。随后已删除危险回滚能力，保留安全的复制与 fork 能力。

最近阶段，用户重点反馈 OpenCode 流式输出和 step 过程 UI 问题：

- “当前流式输出有严重问题：我查看网络活动发现能够获得响应，但是UI中没有看到任何流式输出。请你分析”
- “现在的问题是，它似乎会线在UI上重复一遍用户发送的内容”
- “UI中只能发送一次消息，第二次发送的消息得不到回复”
- “step过程的UI显示依旧会出现断开不连续、持续显示为‘运行中’的问题”
- “我观察到每次glob工具就会打断step过程，并导致上一段step过程始终显示为‘正在工作’”
- “正确的step是否应当连续的判断条件只有一个：agent是否输出了普通回复消息？”
- “那么当前规则能否进一步改为‘只要还没有出现普通回复文本，思考、推理、工具、权限、文件编辑等都应该被视为同一个连续过程’？”
- “请你先编写一个规划文档来记录此事，我们暂时不修改 /编写规划文档”
- “请编写一个新的会话摘要文档 /compact”

会话中曾按用户反馈工具要求先提交当前已有改动，创建了修复前检查点提交：

```text
603ba95 Checkpoint before OpenCode streaming fix
```

该提交排除了 `ref-repos/`，提交前暂存了当时已有的 12 个 app 文件改动。

## 2. Current Work

当前最新工作从“网络有响应但 UI 无流式输出”开始，沿着以下链路分析：

```text
OpenCode SSE /event
-> OpenCodeSseConnection.handleChunk
-> unwrapEvent
-> normalizeOpenCodeEvent
-> applyOpenCodeBusEvent
-> AgentMessageTimeline / AgentMessageItem / AgentProcessGroup
```

### 2.1 流式 UI 不显示的分析与修复

初始假设包括：

- SSE parser 没解析实际 OpenCode event。
- normalizer 不匹配实际 OpenCode 事件形态。
- `normalized.sessionId` 与本地 `providerSessionId` 不匹配，被 `applyOpenCodeBusEvent` 过滤。
- smooth streaming buffer 在 `session.status idle` 或 `message.part.updated` 到来时被清空，导致尾部文本丢失。
- UI 渲染链路没有收到 block 更新。

对照 `ref-repos/opencode-1.14.33` 后确认，OpenCode 事件形态主要是：

```ts
message.part.delta: {
  sessionID,
  messageID,
  partID,
  field,
  delta,
}

message.part.updated: {
  sessionID,
  part,
  time,
}

session.status: {
  sessionID,
  status: { type: "busy" | "idle" | "retry" }
}
```

关键根因之一是：MLFB 之前启动 OpenCode runtime 时，将 SSE `onEvent` 固定绑定到启动 runtime 的本地 `sessionId`。当后续 UI session 复用同一个 OpenCode runtime 时，网络中确实收到事件，但事件被写入 runtime owner session，或者因 `providerSessionId` 不匹配而被过滤，当前 UI session 看不到流式输出。

已在 `app/src/store/agentStore.ts` 修改：

```ts
function openCodeEventProviderSessionId(event: OpenCodeBusEvent): string | undefined {
  const properties = event.properties as Record<string, unknown>;
  const part = typeof properties.part === "object" && properties.part !== null ? properties.part as Record<string, unknown> : undefined;
  const info = typeof properties.info === "object" && properties.info !== null ? properties.info as Record<string, unknown> : undefined;
  return typeof properties.sessionID === "string" ? properties.sessionID
    : typeof part?.sessionID === "string" ? part.sessionID
      : typeof info?.sessionID === "string" ? info.sessionID
        : undefined;
}
```

并将 `handleOpenCodeBusEvent` 改为按 OpenCode `sessionID` 路由到本地 `providerSessionId` 匹配的 AgentSession。无 session id 的连接类事件才回退到 runtime owner。

### 2.2 smooth streaming buffer 丢尾问题

在 `session.status idle` 或 `message.part.updated` 到来时，旧逻辑可能直接 `clearPacedTextBuffers` 或 `clearPacedTextBufferForPart`，导致 smooth streaming pending text 被丢掉。

已新增：

```ts
function flushPacedTextBuffersIntoSession(session: AgentSession): AgentSession
function flushPacedTextBufferForPartIntoSession(session: AgentSession, phase, messageId?, partId?): AgentSession
```

用于在正常完成或 part final snapshot 到来前，先把 pending text 刷入消息。

### 2.3 用户 prompt 被重复渲染的问题

修复 SSE 路由后，OpenCode 发出的 user message `message.part.updated` 也进入 live apply。旧逻辑把所有 `message.part.updated` 都当 assistant block 处理，导致 UI 上把用户刚发送的内容又显示一遍。

已在 `applyOpenCodeBusEvent` 中加入 user provider message 检测：

```ts
if (isProviderUserMessage(nextSession, normalized.messageId)) continue;
```

同时在 `message.updated` role 为 user 时，把 OpenCode 返回的 provider message id 绑定到最近一条本地未绑定 user message。

### 2.4 第二次发送消息得不到回复的问题

分析发现，MLFB 之前向 OpenCode `prompt_async` 传了自造随机 id：

```ts
msg_${crypto.randomUUID()}
prt_${crypto.randomUUID()}
```

OpenCode 内部 `SessionPrompt.run` 使用 message id 的字典序判断最近 user 和 assistant 的先后关系，例如逻辑包含：

```ts
lastUser.id < lastAssistant.id
```

OpenCode 自己生成的 message id 是可排序的 ascending id，但 MLFB 自造随机 UUID 破坏了这个顺序。第二次 prompt 可能因此被误判为不需要继续生成回复。

已修改：

- 不再向 OpenCode `prompt_async` 传自造 `messageID`。
- 不再给 prompt text part 传自造 `id`。
- 由 OpenCode 自己生成可排序 message/part id。
- 通过后续 `message.updated` 和 `message.part.updated` 把 provider id 绑定回本地 UI 消息。

### 2.5 glob 打断 step 过程的问题

用户观察到每次 `glob` 都会打断 step 过程，导致上一段一直显示“正在工作”。

分析认为，OpenCode 一次用户请求中可能产生多个内部 assistant 子回合：

1. assistant 思考并决定调用 `glob`。
2. 工具执行后 OpenCode 进入下一轮 assistant。
3. assistant 继续工具或最终回复。

UI 不应该按 OpenCode 内部 assistant `messageID` 或工具调用边界切分。用户进一步明确了目标规则：

```text
只要还没有出现普通回复文本，思考、推理、工具、权限、文件编辑等都应该被视为同一个连续过程。
```

为接近该规则，已初步修改：

- `AgentMessage` 增加 `providerMessageIds?: string[]`。
- 一个 UI assistant message 可绑定多个 OpenCode provider assistant `messageID`。
- `message.part.delta` / `message.part.updated` 若属于最近 user message 之后的新 OpenCode assistant 子回合，会复用当前 UI assistant message，而不是创建新的 UI assistant message。
- 中间 assistant 子回合的 `message.updated complete` 在 session 仍 running 时不会提前 complete 整条 UI assistant message。
- 最终由 `session.status idle` 统一完成当前 streaming assistant message。

但用户要求先暂停继续实现，编写规划文档记录 step 连续性规则。

## 3. Key Technical Concepts

- React 19 + Vite + Tauri app architecture。
- Zustand store：`app/src/store/agentStore.ts` 是 Agent Console 主状态机。
- OpenCode HTTP/SSE no-ACP integration。
- OpenCode `serve` 本地 server，Basic Auth，`/event` SSE，`/session/:sessionID/prompt_async`。
- OpenCode event types：
  - `message.part.delta`
  - `message.part.updated`
  - `message.updated`
  - `session.status`
  - `session.idle`
  - `session.error`
  - `permission.asked`
  - `session.diff`
  - `session.compacted`
- Provider session id vs local Agent session id：
  - OpenCode `sessionID` 对应本地 `AgentSession.providerSessionId`。
  - 本地 `AgentSession.id` 是 UI 会话 id，不等同于 OpenCode session id。
- Provider message id vs local UI message id：
  - OpenCode `messageID` 应由 OpenCode 自己生成。
  - 本地 UI message 可通过 `providerMessageId` / `providerMessageIds` 绑定一个或多个 OpenCode message。
- Step process vs result splitting：
  - 当前 `splitAgentMessageBlocks` 主要按 `origin.phase` 拆。
  - 目标规则应改为以“首次普通回复文本”为唯一主边界。
- Smooth streaming buffer：
  - `pacedTextBuffers`
  - `appendAssistantTextChunk`
  - `flushPacedTextBuffersIntoSession`
- OpenCode reference repo constraint：
  - `ref-repos/` 只作参考，禁止修改或提交。

## 4. Relevant Files and Code

### `app/src/store/agentStore.ts`

这是本次最核心文件。

已涉及或修改的关键函数：

- `createUserMessage`
- `createStreamingAssistantMessage`
- `messageProviderId`
- `messageMatchesProviderId`
- `isProviderUserMessage`
- `bindAssistantProviderMessageId`
- `findLatestAssistantAfterLastUser`
- `appendAssistantTextChunkImmediate`
- `appendAssistantTextChunk`
- `flushPacedTextBuffersIntoSession`
- `flushPacedTextBufferForPartIntoSession`
- `completeStreamingAssistant`
- `findAssistantMessageIndex`
- `upsertAssistantBlock`
- `bindProviderUserMessage`
- `applyOpenCodeBusEvent`
- `openCodeEventProviderSessionId`
- `handleOpenCodeBusEvent`
- `sendAgentPrompt`

重要修改片段：

```ts
function messageMatchesProviderId(message: AgentMessage, providerMessageId?: string): boolean {
  if (!providerMessageId) return false;
  return message.providerMessageId === providerMessageId || message.providerMessageIds?.includes(providerMessageId) || message.id === providerMessageId;
}
```

```ts
function bindAssistantProviderMessageId(message: AgentMessage, providerMessageId?: string): AgentMessage {
  if (!providerMessageId || messageMatchesProviderId(message, providerMessageId)) return message;
  return {
    ...message,
    providerMessageId: message.providerMessageId || providerMessageId,
    providerMessageIds: [...(message.providerMessageIds || (message.providerMessageId ? [message.providerMessageId] : [])), providerMessageId],
  };
}
```

```ts
function findLatestAssistantAfterLastUser(messages: AgentMessage[]): number {
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  for (let index = messages.length - 1; index > lastUserIndex; index -= 1) {
    if (messages[index].role === "assistant") return index;
  }
  return -1;
}
```

注意：`findLastIndex` 是否符合当前 TS target 需要后续构建验证。如果构建失败，应改成手写倒序查找。

### `app/src/agent/types.ts`

已给 `AgentMessage` 增加：

```ts
providerMessageIds?: string[];
```

作用是让一个 UI assistant message 可绑定多个 OpenCode assistant 子回合 message id。

### `app/src/agent/opencode/eventNormalizer.ts`

分析过但最近未继续修改。

关键点：

- `message.part.delta` -> `text.delta`
- `message.part.updated` -> `block.updated`
- `message.updated` -> `message.updated`
- `session.status` busy -> running，idle -> idle
- `normalizeToolPart` 根据 OpenCode tool part state 转成 `AgentToolCallBlock`
- `normalizeReasoningPart` 根据 time.end 或 status 判断 running/completed

### `app/src/agent/steps.ts`

后续待修改的关键文件。

当前核心函数：

```ts
export function splitAgentMessageBlocks(message: AgentMessage): { processBlocks: AgentContentBlock[]; resultBlocks: AgentContentBlock[] } {
  if (message.role !== "assistant") return { processBlocks: [], resultBlocks: message.blocks };
  return {
    processBlocks: message.blocks.filter((block) => block.origin.phase === "process"),
    resultBlocks: message.blocks.filter((block) => block.origin.phase === "result"),
  };
}
```

计划改为按消息内 block 顺序，以第一次普通回复文本作为过程边界。

### `app/src/components/agent/AgentProcessGroup.tsx`

负责渲染 process steps。

关键逻辑：

- `buildAgentProcessSteps(blocks, messageId, isStreaming ? "streaming" : "complete")`
- `hasBusyStep`
- 流式时自动展开。
- 完成后延迟折叠。

后续若完成态仍残留 running，可能需要在 `buildAgentProcessSteps` 或传入的 messageStatus 上继续处理。

### `.myLastChat/MLC_MLFB_OpenCodeStep连续性规则规划书.md`

本次新创建的规划文档。

内容包括：

- 背景
- 目标规则
- 用户心智模型
- 当前实现状态
- 当前差距
- 修改计划
- 验证计划
- 风险与注意事项
- 推荐实施顺序

核心结论：

```text
普通回复文本出现之前的一切，都属于同一个连续 step 过程。
```

### `.myLastChat/MLC_MLFB OpenCode流式与Step连续性续接摘要.md`

本文件，即当前新建的会话摘要文档。

## 5. Problem Solving

### 已解决或初步解决

1. **SSE 有响应但当前 UI 无流式输出**

根因是 SSE event 固定写入 runtime owner session。已改为按 OpenCode `sessionID` 路由到本地 `providerSessionId` 匹配的 session。

2. **smooth streaming buffer 可能丢尾**

已新增 flush helper，在 idle 或 final snapshot 前将 pending text 写入 session。

3. **用户 prompt 被重复显示**

已识别 user provider message，并跳过其 live part.updated/delta，不再渲染成 assistant 回复。

4. **第二次发送无回复**

分析为自造随机 OpenCode message id 破坏 OpenCode 内部排序逻辑。已停止传自造 `messageID` 和 part id，让 OpenCode 自行生成。

5. **glob 打断 step 过程**

已初步让一个 UI assistant message 绑定多个 OpenCode assistant 子回合 provider message id，使 `glob` 不再天然创建第二个 UI assistant message。

6. **Step 连续性规则规划**

已按用户要求创建规划文档，暂停进一步实现。

### 仍在排查或待完成

1. 当前代码是否完全实现“普通回复文本出现前的一切属于一个连续过程”尚未完成。

2. `splitAgentMessageBlocks` 仍主要按 `origin.phase` 分割，尚未按“首次普通回复文本”重写。

3. `glob` 是否还会造成过程断开需要手动 UI 复测。

4. 当前修改尚未运行完整 `npm run build`。

5. 当前修改尚未提交。注意已有修复前检查点提交 `603ba95`，之后的 store/types/planning/summary 变更仍需视用户要求再提交。

## 6. Pending Tasks and Next Steps

### 明确暂停的任务

用户最新要求：

```text
请编写一个新的会话摘要文档 /compact
```

在此之前用户要求：

```text
请你先编写一个规划文档来记录此事，我们暂时不修改 /编写规划文档
```

因此当前应先停在文档层面，不继续修改实现，除非用户明确要求开始按规划实现。

### 推荐下一步实现任务

如果用户要求继续实现，应按以下顺序：

1. 修改 `app/src/agent/steps.ts` 的 `splitAgentMessageBlocks`。

目标规则：

```ts
// 伪代码
let hasStartedResult = false;
for (const block of message.blocks) {
  const isOrdinaryReplyText = block.type === "text" && block.origin.phase === "result" && block.content.trim();
  if (!hasStartedResult && isOrdinaryReplyText) hasStartedResult = true;
  if (hasStartedResult && block.origin.phase === "result") resultBlocks.push(block);
  else processBlocks.push(block);
}
```

2. 复查 `app/src/store/agentStore.ts` 中 live SSE 合并逻辑。

重点确认：

- 同一 user message 后的多个 assistant provider message id 进入同一 UI assistant message。
- 中间 `message.updated complete` 不提前结束 UI 过程。
- `session.status idle` 统一完成当前 streaming assistant message。

3. 检查 `findLatestAssistantAfterLastUser` 的 `findLastIndex` 兼容性。

如构建失败，改为手写倒序循环：

```ts
function findLastUserMessageIndex(messages: AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") return index;
  }
  return -1;
}
```

4. 运行诊断和构建：

```text
VS Code diagnostics
cd app && npm run build
```

5. 手动 UI 复测：

- 单轮：思考 -> glob -> edit -> 普通回复。
- 多轮：连续发送两条消息。
- 权限审批：触发 edit permission 并查看 diff。
- 完成态：最终不残留“正在工作”。

### 重要约束

- 不要恢复 OpenCode revert/unrevert/edit-retry 功能。
- 不要修改或提交 `ref-repos/`。
- 若用户要求提交，先检查暂存内容，排除 `ref-repos/`。
- 继续使用 `apply_patch` 修改文本文件。
- 完成阶段仍需调用 interactive feedback，agent_name 固定为 `3C5E`。
