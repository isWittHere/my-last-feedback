---
title: 修复用户消息气泡Markdown标题和斜杠命令问题
description: 修复两处bug：markdown标题输入导致用户气泡消失，以及斜杠命令路径缺少用户消息导致原文泄漏到assistant思考块
workplace: E:\Dev\my-last-feedback
project: my-last-feedback
type: debug
solved_lists:
  - Markdown标题格式(`## User Prompt`等)导致用户消息气泡不显示
  - 斜杠命令路径缺少用户消息创建，原文泄漏到assistant thinking
  - 命令路径providerMessageId假ID导致bindProviderUserMessage绑定失败
---

# 修复用户消息气泡Markdown标题和斜杠命令问题

## 1. Previous Conversation

用户报告了两个相互关联的bug：
1. 输入信息包含Markdown大标题格式文本（如`## User Prompt`）时，用户消息气泡无法出现
2. 使用命令快捷提示词（斜杠命令）时，带命令提示词的用户消息原文会直接渲染在agent的首个思考消息中

经过多轮分析、git backup、代码修复和用户反馈迭代，最终定位并修复了三个层次的根因。

## 2. Current Work

**Bug 1修复**（`AgentMessageItem.tsx` + `AgentMessageTimeline.tsx`）：
- `userDisplayText`/`userPromptText` 在 `providerText` 路径直接返回带 `## User Prompt` 包裹外壳的完整 markdown，没有提取用户真实内容。
- 修复：`providerText` 路径先调用 `extractPromptSection` 提取纯用户内容，增加 `submittedMarkdown` 兜底。

**Bug 2修复**（`agentStore.ts`）分三步：
1. 在斜杠命令路径（`sendAgentPrompt` 中 `slashCommand && openCodeCommand` 分支）的 `set()` 调用中加入 `createUserMessage()`，创建用户消息气泡
2. 修正 `createUserMessage` 中 `providerMessageId` 的自动回退逻辑（去掉 `|| options.id`）
3. 在 `text.delta` 和 `block.updated` 事件处理器中新增 auto-bind 守卫，处理事件先于 `message.updated` 到达的竞态条件

## 3. Key Technical Concepts

- **OpenCode 事件协议**: `message.updated`(含role), `text.delta`, `block.updated` 事件流
- **`extractPromptSection`**: 正则 `/^##\s+(?:User Prompt|User Feedback|用户提示|用户反馈)\s*\n/i` 提取 `##` 标题下的用户内容，用 `/\n##\s+/` 找下一节边界
- **`bindProviderUserMessage`**: 将服务器返回的 messageId 绑定到本地用户消息的 `providerMessageId` 字段
- **`isProviderUserMessage`**: 检查事件 messageId 是否匹配本地用户消息
- **`upsertAssistantProviderPart`**: 将事件 part 路由到 assistant 消息，用户文本在此被错误转成 thinking block
- **`normalizeOpenCodePartForRestore`**: 对 assistant 角色，text part 在后续有 process part 时转为 thinking block
- **竞态条件**: `block.updated`/`text.delta` 可能先于 `message.updated` 到达，导致 auto-bind 失败

## 4. Relevant Files and Code

### `app/src/components/agent/AgentMessageItem.tsx`
  - 修改了 `userDisplayText` 函数（行 46-65），增加 `providerText` 路径的内容提取和 `submittedMarkdown` 兜底
  ```ts
  function userDisplayText(message: AgentMessage, resultBlocks: AgentContentBlock[]): string {
    const draft = message.composerDraft?.trim();
    if (draft) return draft;
    const providerText = providerPromptText(message.providerParts);
    if (providerText) {
      const extracted = extractPromptSection(providerText);
      if (extracted) return extracted;
      return providerText;
    }
    const rawText = blocksText(resultBlocks).trim();
    const fromRaw = extractPromptSection(rawText);
    if (fromRaw) return fromRaw;
    if (rawText) return rawText;
    const submitted = message.submittedMarkdown?.trim();
    if (submitted) {
      const fromSubmitted = extractPromptSection(submitted);
      return fromSubmitted || submitted;
    }
    return "";
  }
  ```

### `app/src/components/agent/AgentMessageTimeline.tsx`
  - 修改了 `userPromptText` 函数（行 60-76），与 `AgentMessageItem.tsx` 逻辑一致
  ```ts
  function userPromptText(message: AgentSession["messages"][number]): string {
    const draft = message.composerDraft?.trim();
    if (draft) return draft;
    const providerText = providerPromptText(message.providerParts);
    if (providerText) {
      const extracted = extractPromptSection(providerText);
      if (extracted) return extracted;
      return providerText;
    }
    const submittedPrompt = extractPromptSection(message.submittedMarkdown || "");
    if (submittedPrompt) return submittedPrompt;
    const rawText = blocksText(message.blocks);
    const fromRaw = extractPromptSection(rawText);
    if (fromRaw) return fromRaw;
    if (rawText) return rawText;
    return "";
  }
  ```

### `app/src/store/agentStore.ts`
  - **修改1** `createUserMessage`（行 197）: 移除 `|| options.id` 
  ```ts
  // 修改前：
  providerMessageId: options.providerMessageId || options.id,
  // 修改后：
  providerMessageId: options.providerMessageId,
  ```

  - **修改2** 命令路径增加 `createUserMessage`（行 2461-2468），不传 `providerMessageId`
  ```ts
  messages: [
    ...item.messages,
    createUserMessage(composerDraft.trim() || submittedPrompt.historyText.trim(), {
      id: commandMessageId,
      composerDraft,
      submittedMarkdown: submittedPrompt.markdown,
      submittedAttachmentTags,
    }),
  ],
  ```

  - **修改3** `text.delta` 处理器（行 1697-1700）新增 auto-bind:
  ```ts
  if (isProviderUserMessage(nextSession, normalized.messageId)) continue;
  if (normalized.messageId) {
    nextSession = bindProviderUserMessage(nextSession, normalized.messageId, undefined);
    if (isProviderUserMessage(nextSession, normalized.messageId)) continue;
  }
  ```

  - **修改4** `block.updated` 处理器（行 1720-1724）新增 auto-bind:
  ```ts
  if (isProviderUserMessage(nextSession, normalized.messageId)) { continue; }
  if (normalized.messageId) {
    nextSession = bindProviderUserMessage(nextSession, normalized.messageId, undefined);
    if (isProviderUserMessage(nextSession, normalized.messageId)) { continue; }
  }
  ```

### `app/src/composer/submittedFeedback.ts`
  - 已阅读 `buildSubmittedComposerPayload`（行 291-353），确认它用 `mainHeading` 包裹用户输入为 `## User Prompt\n{content}` 结构
  - 已阅读 `extractSubmittedPromptSection`（行 760-768），与前端 `extractPromptSection` 逻辑一致

## 5. Problem Solving

**Bug 1 根因**: `userDisplayText` 的 `providerText` 分支未提取纯用户内容，直接返回含 `## User Prompt` 外壳的完整 markdown。消息从 OpenCode 回放恢复时 `composerDraft` 可能缺失，降级到空状态。

**Bug 2 根因链**（逐层定位）:
1. 斜杠命令路径（行 2470 return）跳过了 `createUserMessage` 的创建 → 用户气泡缺失
2. 修复1中创建的用户消息设置了假 `providerMessageId: commandMessageId` → `isProviderUserMessage` 无法匹配服务器真实ID
3. `createUserMessage` 的 `options.providerMessageId || options.id` 回退逻辑让 `providerMessageId` 即使不传也会被设置 → `bindProviderUserMessage` 找不到未绑定消息
4. 用户消息 text part 被 `upsertAssistantProviderPart` 错误路由到 assistant → `normalizeOpenCodePartForRestore` 转为 thinking block → 用户原文在思考块中重复出现

**最终修复**: 三步走——
- 移除 `createUserMessage` 的自动回退
- 命令路径不传 `providerMessageId`
- 事件处理器增加 auto-bind 守卫（处理竞态）

## 6. Pending Tasks and Next Steps

- 无明确待办任务。bug 已全部修复，代码等待用户验证。
- Git backup 已在修复前完成（commit `7e3b754`）。
- 本次修复尚未提交git，处于未暂存状态。
