---
title: MLFB OpenCode实时思考与v0.5.7发行续接摘要
description: OpenCode实时part语义修复与v0.5.7发布前上下文
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
solved_lists:
  - 分析OpenCode desktop part store与timeline渲染模型
  - 将实时message.part.delta改为更新provider part快照
  - 移除直接delta拼UI block的paced text buffer试错路径
  - 将reasoning可见内容改为只取part.text
  - 使实时provider parts按历史恢复规则整体派生blocks
  - 修正SSE coalescing的stale delta判定以贴近OpenCode desktop
---

# MLFB OpenCode实时思考与v0.5.7发行续接摘要

## 1. Previous Conversation

本轮对话从用户询问“为什么打包构建的发行版本中新建 OpenCode agent 会弹出命令窗口，以及发行版会话列表和测试版不同”开始，随后逐步扩展到 Agent Console 和 OpenCode HTTP/SSE 集成的多个行为问题。

前期已经处理或讨论过：

- Windows 发行版中新建 OpenCode agent 弹出命令窗口的原因与修复。
- 发行版与测试版会话列表不同，主要来自不同 OpenCode 数据目录、运行时路径或 provider session 来源。
- WriteTodo 渲染语义：将 `todowrite` 工具调用规范化为 `task_list`，避免把工具 args 当作可见正文。
- process step 运行态：限制 running 状态只落在当前 active process block 上。
- approval 展示：审批结果应附着在对应 tool step 上，而不是作为独立 process step。
- approval 行紧凑化、失败/拒绝状态语义、历史过程 narration 的归类问题。
- Agent 顶部 token/navigation 视觉：增加 group 背景、条形/线面积图两种展示模式、settings 中的图标式分段控件与 i18n 文案。
- 多次 timed Git backup 已发生，最近一次旧备份提交为 `d62c807 backup: timed workspace snapshot`，并始终排除了 `ref-repos`。

最近用户明确指出：

> “未能修复。请你仔细参考opencode desktop的相关实现。我们极有可能把事情搞得太过于复杂化了，可能实际根本不需要这样做”

随后重点转向 OpenCode realtime thinking 重复、thinking/text 归类不一致的问题。

## 2. Current Work

最近的工作集中在 OpenCode desktop 源码参考与 MLFB 实时事件流修复。

参考的 OpenCode desktop 文件包括：

- `ref-repos/opencode-1.14.33/packages/app/src/context/global-sdk.tsx`
- `ref-repos/opencode-1.14.33/packages/app/src/context/global-sync/event-reducer.ts`
- `ref-repos/opencode-1.14.33/packages/app/src/pages/session/message-timeline.tsx`
- `ref-repos/opencode-1.14.33/packages/ui/src/components/session-turn.tsx`
- `ref-repos/opencode-1.14.33/packages/ui/src/components/message-part.tsx`

关键发现：

- OpenCode desktop 的 reducer 不把 `message.part.delta` 直接拼到 UI，而是追加到 `sync.data.part[messageID][partID][field]`。
- OpenCode timeline/SessionTurn 渲染只从 `sync.data.part[messageID]` 派生可见 UI。
- reasoning 可见内容只取 `part.text.trim()`，不取 `summary`。
- OpenCode desktop 的 SSE coalescing 只在同一 batch 中同一个 `message.part.updated` 被后续 updated 替换时，才标记该 part 的 delta 为 stale。

MLFB 之前的问题是：

- `message.part.delta` 直接进入 `appendAssistantTextChunk(...)` 拼 UI block。
- `message.part.updated` 又进入 `upsertAssistantBlock(...)` 写同一个 block。
- 因此 realtime 阶段同一 thinking part 会被 delta 和 snapshot 两条路径竞争更新，导致重复或归类错误。
- 历史恢复是干净的，因为历史只从最终 `message.parts` 派生。

最新用户反馈：

> “好，现在请你生成一个新的会话摘要 /compact 。之后，升级到0.5.7，然后发布新版发行包，之后git备份。”

因此当前已经完成 `/compact` 摘要生成，后续仍需继续：版本升级到 `0.5.7`，发布新版发行包，然后进行 Git 备份。

## 3. Key Technical Concepts

- Tauri 2 desktop app，前端 React 19 + Vite，后端 Rust。
- OpenCode HTTP/SSE integration：`/event`、`message.part.updated`、`message.part.delta`、`message.updated`、`session.status`。
- OpenCode desktop data model：`sync.data.part[messageID]` 是 UI 渲染事实源。
- MLFB Agent model：`AgentSession`、`AgentMessage`、`AgentContentBlock`、`AgentThinkingBlock`、`AgentToolCallBlock`、`AgentTaskListBlock`。
- MLFB process/result 分层：通过 block `origin.phase` 区分过程和结果。
- 历史恢复规则：`normalizeOpenCodePartForRestore(part, index, parts, role)` 会把前面跟着 process part 的 text part 归入 thinking/process。
- Realtime 修复原则：实时也应从完整 provider parts 派生 blocks，而不是单个 delta 直接写 UI。
- 版本同步规则：版本发布需同步 `package.json`、`app/package.json`、`app/src-tauri/Cargo.toml`。
- 打包规则：Windows 发行包通常通过项目脚本或 `cd app && npm run build`、Tauri bundling/packaging scripts；具体命令需先查现有脚本。
- Git 操作规则：必须排除 `ref-repos/`，不要提交参考仓库。

## 4. Relevant Files and Code

### `app/src/store/agentStore.ts`

该文件是主要状态流修复点。

重要修改：

- 移除了旧的 `appendAssistantTextChunk(...)`、`appendAssistantTextChunkImmediate(...)`、`PacedTextBuffer`、`pacedTextBuffers`、stream drain/flush/clear 试错路径。
- 新增 provider part helpers：

```ts
function assistantProviderParts(message: AgentMessage): OpenCodeMessagePart[] {
  return (message.providerParts || []) as OpenCodeMessagePart[];
}
```

- 新增 `upsertAssistantProviderPart(...)`：`message.part.updated` 到来时刷新 assistant message 的 provider part 快照。
- 新增 `applyAssistantProviderPartDelta(...)`：`message.part.delta` 到来时，如果本地已有该 part，则追加到 part 的对应字段。
- 新增 `syncAssistantProviderPartBlocks(...)`：每次 provider part 变化后，用完整 provider parts 重新派生 provider-derived blocks：

```ts
const providerBlocks = mergeAdjacentThinkingBlocks(providerParts
  .map((part, index) => normalizeOpenCodePartForRestore(part, index, providerParts, "assistant"))
  .filter((block): block is AgentContentBlock => Boolean(block))
  .filter((block) => block.type !== "text" || Boolean(block.content.trim())));
```

- `applyOpenCodeBusEvent(...)` 中普通 `text.delta` 分支不再拼 UI block，而是：

```ts
const deltaResult = applyAssistantProviderPartDelta(nextSession, {
  messageId: normalized.messageId,
  partId: normalized.partId,
  field: normalized.field,
  delta: normalized.delta,
});
nextSession = deltaResult.session;
if (deltaResult.part) nextSession = syncAssistantProviderPartBlocks(nextSession, normalized.messageId, normalized.partId);
```

- `block.updated` 分支在有 raw part 时先刷新 provider part，然后重派生 provider blocks；没有 raw part 时才回落到 `upsertAssistantBlock(...)`。
- `upsertAssistantBlock(...)` 中移除了 text block 按 phase 合并 fallback，仅保留 compaction fallback，避免多个 OpenCode text parts 被错误覆盖。

### `app/src/agent/opencode/eventNormalizer.ts`

重要修改：

- `message.part.delta` 不再跳过 reasoning `summary` delta；summary 可进入 provider part store，但可见 rendering 不取它。
- `normalizeReasoningPart(...)` 的 content 改为只取 `part.text` 或 `state.text`：

```ts
content: asString(part.text) || asString(state.text) || "",
```

这与 OpenCode UI 的 `ReasoningPartDisplay` 对齐。

### `app/src/agent/opencode/httpClient.ts`

重要修改：

- SSE coalescing 保留但简化并贴近 OpenCode desktop。
- 移除了 `partUpdateHasTextSnapshot(...)` 这类过度试错判断。
- 现在只有当同一个 `message.part.updated` 在同一 batch 内被后续 updated 替换时，才把该 part 的 delta 标记为 stale。

### OpenCode reference files

- `global-sync/event-reducer.ts`：`message.part.delta` 只追加到 part 字段。
- `message-part.tsx`：reasoning renderable 条件是 `showReasoningSummaries && !!part.text?.trim()`。
- `message-part.tsx` 中 `ReasoningPartDisplay` 只渲染 `part().text.trim()`。
- `session-turn.tsx`：AssistantParts 从 `data.store.part?.[message.id]` 获取 parts 并渲染。

## 5. Problem Solving

已解决或明显改善：

- realtime thinking 内容重复：从“delta 和 updated 两条路径写 UI”改成 provider part 单一事实源，用户反馈“已经有很大改善”。
- reasoning summary 误作为可见 thinking：可见 thinking 改为只取 `part.text`。
- 旧 paced text buffer 设计导致额外复杂性：已移除实际实现和调用点。
- stale delta 判断过度：改成更接近 OpenCode desktop 的 batch coalescing 行为。
- realtime 中部分 thinking 被当作普通文本拖到结束：新增完整 provider parts 重派生 blocks，实时复用历史恢复归类规则。

验证状态：

- 已对以下文件运行 VS Code diagnostics，均无错误：
  - `app/src/store/agentStore.ts`
  - `app/src/agent/opencode/eventNormalizer.ts`
  - `app/src/agent/opencode/httpClient.ts`
- 未运行完整 build。
- `app/src/index.css` 之前存在 Tailwind `@theme` unknown at-rule 诊断，是既有问题，不属于本次修复。

注意：

- 还没有由用户再次确认第二轮 realtime thinking 分类修复在真实 UI 中完全解决。
- 但实现已经对齐“历史恢复规则”和 OpenCode desktop part-store 模型。

## 6. Pending Tasks and Next Steps

用户最新明确要求：

> “好，现在请你生成一个新的会话摘要 /compact 。之后，升级到0.5.7，然后发布新版发行包，之后git备份。”

已经完成：

- 创建新的 `.myLastChat` 会话摘要文件：`.myLastChat/MLC_MLFB OpenCode实时思考与v0.5.7发行续接摘要.md`

下一步需要继续执行：

- 检查当前版本文件：`package.json`、`app/package.json`、`app/src-tauri/Cargo.toml`。
- 将版本同步升级到 `0.5.7`。
- 查看现有发布/打包脚本，优先使用项目已有脚本。
- 构建并生成新版 Windows 发行包。
- 进行 Git 备份，必须排除 `ref-repos/`，避免提交参考仓库内容。
- 结束前再次使用 interactive feedback 汇报完成情况。