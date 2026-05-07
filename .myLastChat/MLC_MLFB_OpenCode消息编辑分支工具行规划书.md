---
title: MLFB OpenCode 消息编辑分支工具行规划书
description: 规划 OpenCode 风格消息编辑、回滚重提、分支与复制工具行
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - OpenCode
  - Agent Console
  - message actions
  - revert
  - fork
solved_lists:
  - 分析 OpenCode Desktop 用户消息编辑重提交流程
  - 分析 OpenCode session fork 与消息工具行机制
---

# MLFB OpenCode 消息编辑分支工具行规划书

## 1. 背景

用户希望 MLFB Agent Console 参考 OpenCode Desktop，支持以下消息级能力：

1. 点击或操作已发出的用户消息气泡，修改后重新提交。
2. 从某个历史消息位置创建分支。
3. 对用户消息、助手回复、工具输出等进行复制等工具行操作。

本规划基于 `ref-repos/opencode-1.14.33/` 的实际实现分析，目标是在 MLFB 现有 React + Zustand + OpenCode HTTP/SSE 架构中，尽量复用 OpenCode 原生语义，避免伪造一套和 OpenCode session 状态不一致的本地逻辑。

## 2. OpenCode 参考结论

### 2.1 已发用户消息的编辑与重新提交

OpenCode Desktop 中“编辑已发用户消息”并不是直接 PATCH 那条历史消息文本。

真实机制是：

1. 用户 hover/focus 某条 user message 后看到工具行。
2. 点击 reset/revert 按钮。
3. 前端调用 `session.revert({ sessionID, messageID })`。
4. 前端用 `extractPromptFromParts(...)` 把该 user message 的原始 prompt parts 还原进 composer。
5. session 进入 `revert` 状态，所选消息及之后的消息进入 rolled/reverted 区域。
6. 用户在 composer 中修改草稿并重新提交。
7. 服务端 `SessionPrompt.prompt` 在写入新消息前执行 `revert.cleanup(session)`，删除/清理回滚范围内的消息和 parts，然后写入新 user message 并继续 assistant 流程。

关键参考：

- `packages/ui/src/components/message-part.tsx`：`UserMessageDisplay`、copy/revert 工具行。
- `packages/app/src/pages/session.tsx`：`revertMutation`、`restoreMutation`、rolled dock。
- `packages/app/src/utils/prompt.ts`：`extractPromptFromParts`。
- `packages/opencode/src/session/revert.ts`：服务端 revert、unrevert、cleanup。
- `packages/opencode/src/session/prompt.ts`：新 prompt 提交前 cleanup。

结论：MLFB 如果要行为贴近 OpenCode，应实现“回滚到该消息并把原 prompt 载入 composer”，而不是直接改历史消息文本。

### 2.2 从消息处分支

OpenCode Desktop 的分支主要通过 `session.fork` 命令和 `DialogFork` 完成：

1. Dialog 列出历史 user message。
2. 用户选择一条消息。
3. 前端还原该消息的 prompt parts。
4. 调用 `session.fork({ sessionID, messageID })`。
5. 服务端创建新 session，并克隆原 session 中 `id < messageID` 的消息。
6. 前端导航到新 session，并将被选择消息的 prompt 放入 composer。
7. 用户可以修改后提交，形成新的分支。

注意：OpenCode fork 并不会把所选 user message 本身复制进新 session。它复制的是所选消息之前的历史，再把所选消息作为新 session 的 composer 草稿。

关键参考：

- `packages/app/src/components/dialog-fork.tsx`
- `packages/opencode/src/session/session.ts` 中 `Session.fork`
- `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts` 中 `POST /session/:sessionID/fork`

### 2.3 消息工具行复制操作

OpenCode 的工具行很克制：默认透明，hover/focus 时显示。

用户消息：

- copy：复制主 text part，不复制 synthetic text。
- revert：触发编辑重提交流程。
- `UserActions` 类型中有 `fork` 预留，但当前 UI 没看到 per-message fork 按钮实际渲染。

助手消息：

- copy：通常只在最后一个非空 text part 上显示。
- working 状态下隐藏 copy。
- 工具输出、bash 等部分也有各自 copy 操作。

关键参考：

- `packages/ui/src/components/message-part.tsx`
- `packages/ui/src/components/message-part.css`

## 3. MLFB 当前状态

### 3.1 已具备基础

当前 MLFB 已具备：

1. OpenCode HTTP client。
2. `promptAsync` 调用。
3. session restore 后从 OpenCode messages 映射为 Agent messages。
4. AgentMessageItem 基础渲染。
5. 已接入 diff、permission、compact 等 OpenCode HTTP/SSE 功能。

相关位置：

- `app/src/agent/opencode/httpClient.ts`
- `app/src/store/agentStore.ts`
- `app/src/components/agent/AgentMessageItem.tsx`

### 3.2 主要缺口

1. HTTP client 缺少 message action 相关 endpoint：
   - `fork`
   - `revert`
   - `unrevert`
   - `deleteMessage`
   - `deletePart`
   - `updatePart`

2. AgentMessage 当前缺少 OpenCode 原始元数据：
   - provider message id 虽可用作 `message.id`。
   - 但没有稳定保存原始 OpenCode parts。
   - file、agent、image inline prompt 还原能力不足。

3. Composer 缺少“加载历史消息草稿”的状态入口：
   - 当前 `sendAgentPrompt` 只从 `session.draft` 生成新的 prompt。
   - 没有 revert/edit mode。
   - 没有 queued followup/edit followup 的本地结构。

4. UI 缺少消息工具行：
   - 用户消息 copy。
   - 用户消息 edit/retry/revert。
   - 助手消息 copy。
   - 可选 fork/delete 等高级动作。

5. Store 缺少 revert 状态管理：
   - session.revert.messageID。
   - rolled messages 列表。
   - restore/unrevert 流程。
   - revert 后的 session diff 刷新。

## 4. 目标 UX

### 4.1 用户消息工具行

用户 hover/focus 自己发出的消息时，在气泡下方或右下方显示小型工具行：

- 复制：复制消息文本。
- 编辑并重试：回滚到该消息，把原内容填入 composer。
- 分支：从该消息位置创建新 session，并把该消息填入新 session composer。
- 更多：可放删除等危险操作，默认不直接展示。

要求：

- 工具行应像 OpenCode 一样轻量，默认隐藏，hover/focus 显示。
- 使用 icon button + tooltip。
- 不要做成大卡片。
- 删除属于危险操作，需要二次确认。

### 4.2 助手消息工具行

助手消息或最后一个文本结果附近显示：

- 复制回复。
- 可选复制完整 assistant message。

要求：

- running/streaming 状态不显示复制按钮，避免复制半截内容。
- 如果有多个 text result，默认复制最后一个非空 text block。

### 4.3 编辑并重新提交

用户点击“编辑并重试”后：

1. 如果 session 正在运行，先 abort 当前 OpenCode session。
2. 调用 OpenCode `revert`。
3. 将目标 user message 的 prompt 还原进 composer。
4. UI 显示已回滚提示 dock，列出被回滚的 user messages。
5. 用户可修改 composer 内容后提交。
6. 提交时 OpenCode 服务端 cleanup 回滚范围，并写入新消息。
7. MLFB 重新同步 OpenCode messages 和 session diff。

### 4.4 恢复回滚消息

当 session 有 revert 状态时，在 composer 上方显示一个克制 dock：

- 摘要：`已回滚 N 条消息`。
- 展开后列出每条 rolled user message 的单行预览。
- 每条提供“恢复到这里”。
- 如果恢复到最后之后，则调用 `unrevert`。

这应参考 OpenCode 的 `SessionRevertDock`。

### 4.5 从消息处分支

初版建议提供两种入口：

1. 用户消息工具行中的“分支”。
2. 顶部/命令入口中的“从消息分支”列表。

流程：

1. 选择 user message。
2. 调用 `POST /session/:sessionID/fork`。
3. 创建/注册一个新的 MLFB Agent session，并关联返回的 OpenCode providerSessionId。
4. 将被选消息的 prompt 放入新 session composer。
5. 切换到新 session。

注意：OpenCode fork 克隆的是目标消息之前的历史，因此目标消息本身应作为 draft，而不是立即提交。

## 5. 数据模型规划

### 5.1 AgentMessage 增补 provider metadata

建议新增：

```ts
interface AgentMessage {
  providerMessageId?: string;
  providerParentMessageId?: string;
  providerRole?: string;
  providerParts?: OpenCodeMessagePartSummary[];
}
```

其中 `providerParts` 不一定保存完整大对象，可保存足够恢复 prompt 的字段：

```ts
interface OpenCodeMessagePartSummary {
  id: string;
  type: string;
  text?: string;
  synthetic?: boolean;
  ignored?: boolean;
  url?: string;
  filename?: string;
  mime?: string;
  source?: unknown;
  name?: string;
}
```

目的：

- 精确复制 text part。
- 精确恢复 prompt。
- 调用 update/delete part 时有 partID。

### 5.2 AgentSession 增补 revert 状态

建议新增：

```ts
interface AgentSession {
  revert?: {
    messageId: string;
    partId?: string;
    diff?: OpenCodeFileDiff[];
  };
  revertLoading?: boolean;
  revertError?: string;
}
```

### 5.3 Composer 草稿来源

建议新增一个轻量标记：

```ts
interface AgentDraftSource {
  kind: "message-edit" | "fork" | "followup";
  sourceSessionId: string;
  sourceMessageId: string;
}
```

用于 UI 提示、提交后清理、避免用户不知道当前 composer 草稿来自哪里。

## 6. HTTP Client 规划

在 `OpenCodeHttpClient` 中新增：

```ts
forkSession(sessionId: string, body: { messageID?: string }): Promise<OpenCodeSessionInfo>;
revertSession(sessionId: string, body: { messageID: string; partID?: string }): Promise<OpenCodeSessionInfo>;
unrevertSession(sessionId: string): Promise<OpenCodeSessionInfo>;
deleteMessage(sessionId: string, messageId: string): Promise<boolean>;
deletePart(sessionId: string, messageId: string, partId: string): Promise<boolean>;
updatePart(sessionId: string, messageId: string, partId: string, body: OpenCodeMessagePart): Promise<OpenCodeMessagePart>;
```

初版必须实现：

- forkSession
- revertSession
- unrevertSession

复制操作不需要 HTTP。

删除/updatePart 可先只补 client，不急于暴露 UI。

## 7. Store 流程规划

### 7.1 从 OpenCode messages 恢复 metadata

在 `agentMessagesFromOpenCodeMessages` 中：

1. 继续 normalized blocks 用于渲染。
2. 同时保存 provider message/part summary。
3. 保留 user message 的原始 text/file/agent/image parts。

### 7.2 提取历史 prompt

新增工具函数：

```ts
extractOpenCodePromptFromAgentMessage(message, cwd): AgentComposerDraft
```

能力：

- 忽略 synthetic/ignored text。
- 还原主 text。
- 还原 image/file attachments。
- 还原 agent mention。
- 对 file source 中的绝对路径做 cwd 相对化。

初版可先只还原 text，后续支持 file/image/agent。

### 7.3 编辑并重试 action

新增 store action：

```ts
editAgentMessage(sessionId: string, messageId: string): Promise<void>
```

流程：

1. 找到 session 和 message。
2. 确认 providerSessionId 存在。
3. 如果当前 running，先 abort。
4. 提取 message prompt。
5. 乐观设置 `draft` 和 `draftSource`。
6. 调用 `revertSession(providerSessionId, { messageID })`。
7. 合并返回的 OpenCode session info 中的 `revert` 状态。
8. 刷新 session diff。
9. 如失败，恢复之前 draft/revert 状态并提示 diagnostic。

### 7.4 恢复回滚 action

新增：

```ts
restoreAgentRevertedMessage(sessionId: string, messageId: string): Promise<void>
```

流程参考 OpenCode：

- 找到目标 message 后的下一条 user message。
- 如果没有下一条，则调用 `unrevertSession`。
- 如果有下一条，则调用 `revertSession` 到下一条。
- 同步 draft：有下一条则填入下一条 prompt；没有则清空。

### 7.5 分支 action

新增：

```ts
forkAgentSessionFromMessage(sessionId: string, messageId: string): Promise<string>
```

流程：

1. 找到源 session 和 message。
2. 提取该 message prompt。
3. 调用 `forkSession(providerSessionId, { messageID })`。
4. 创建新的 MLFB AgentSession。
5. 设置新 session 的 providerSessionId、providerSessionState、messages、draft。
6. restore/sync 新 OpenCode session messages。
7. 切换 activeSessionId。

## 8. UI 组件规划

### 8.1 AgentMessageActions

新增组件：

```tsx
<AgentMessageActions
  session={session}
  message={message}
  onCopy={...}
  onEdit={...}
  onFork={...}
/>
```

展示规则：

- user message：copy、edit/retry、fork、more。
- assistant message：copy result。
- system message：默认不显示。
- streaming assistant：不显示 copy。

### 8.2 AgentRevertDock

新增 composer 上方 dock：

```tsx
<AgentRevertDock
  items={rolledMessages}
  restoring={session.revertLoading}
  onRestore={...}
/>
```

视觉：

- 类似 OpenCode dock，小高度、可折叠。
- 不要卡片套卡片。
- 列表单行预览。

### 8.3 AgentForkDialog

新增或复用弹层：

- 列出 user messages。
- 支持搜索。
- 点击后执行 fork action。
- 初版也可以只做每条 user message 工具行中的 fork，Dialog 作为第二阶段。

## 9. i18n 文案规划

新增中文/英文 keys：

- `agentConsole.copyMessage`
- `agentConsole.copyResponse`
- `agentConsole.messageCopied`
- `agentConsole.editAndRetry`
- `agentConsole.forkFromMessage`
- `agentConsole.revertedMessages`
- `agentConsole.restoreMessage`
- `agentConsole.revertFailed`
- `agentConsole.forkFailed`

## 10. 实施阶段

### 阶段一：复制工具行

范围：

- 新增 AgentMessageActions。
- 用户消息复制。
- 助手最后非空文本复制。
- CSS hover/focus 显示。

验收：

- hover 用户消息出现复制按钮。
- hover assistant message 出现复制回复按钮。
- streaming assistant 不显示复制。

### 阶段二：编辑并重试

范围：

- HTTP client 增加 revert/unrevert。
- Store 增加 edit message action。
- AgentSession 增加 revert/draftSource。
- Composer 上方显示 revert dock。
- 提交后依赖 OpenCode cleanup。

验收：

- 点击历史 user message 的编辑按钮后，composer 填入原消息。
- 后续消息进入回滚 dock。
- 修改后提交，后续历史被替换为新分支结果。
- 文件改动能按 OpenCode revert 机制恢复。

### 阶段三：从消息分支

范围：

- HTTP client 增加 fork。
- Store 增加 fork action。
- 新建 MLFB AgentSession 并关联 forked provider session。
- 将目标消息填入新 session composer。

验收：

- 从历史消息 fork 后进入新 session。
- 新 session 含目标消息之前的历史。
- 目标消息作为草稿显示，用户提交后继续。

### 阶段四：高级操作

范围：

- delete message。
- delete/update part。
- 更多菜单。

验收：

- 删除操作有确认弹窗。
- 明确提示删除不会回滚文件变更。

## 11. 风险与控制

### 11.1 直接修改历史消息的风险

风险：如果用 `updatePart` 直接修改历史 text，assistant 后续结果、文件 patch、session diff 都不会自动重算，会造成历史不一致。

控制：编辑重提交流程默认使用 revert，不使用 updatePart。

### 11.2 文件变更回滚风险

风险：用户编辑旧消息时，之前 assistant 修改过的文件需要恢复，否则重新提交会叠在旧文件状态上。

控制：依赖 OpenCode `SessionRevert.revert` 的 snapshot revert 机制。

### 11.3 prompt parts fidelity 风险

风险：MLFB 当前 normalized blocks 不足以恢复 OpenCode 的 file/image/agent parts。

控制：第一阶段只承诺 text；第二阶段保存 provider parts summary；第三阶段补齐附件和 agent mention。

### 11.4 UI 复杂度风险

风险：消息工具行和 revert dock 过重，会打乱 Agent Console 现有密度。

控制：参考 OpenCode hover/focus 工具行，小 icon + tooltip；dock 使用单行摘要和折叠列表。

## 12. 验证计划

1. TypeScript diagnostics 无错误。
2. 手动创建一轮 OpenCode session。
3. 点击第一条 user message 编辑。
4. 确认 composer 恢复原 text。
5. 确认后续 user messages 出现在 revert dock。
6. 修改后提交。
7. 确认 OpenCode messages 已被 cleanup，UI 不显示旧 assistant 结果。
8. 验证 session diff 与文件状态符合 OpenCode revert。
9. 从某条 user message fork。
10. 确认新 session 只包含目标消息之前历史，目标消息成为草稿。
11. 验证 copy 按钮在用户/助手消息上的行为。

## 13. 推荐优先级

建议按以下顺序推进：

1. 复制工具行。
2. 编辑并重试，即 revert + composer restore。
3. Revert dock + restore/unrevert。
4. Fork from message。
5. Delete/updatePart 等高级操作。

这样可以先交付低风险可见价值，再接入 OpenCode 状态一致性要求最高的编辑和分支能力。
