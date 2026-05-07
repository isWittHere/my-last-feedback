---
title: MLFB OpenCode Diff审批与上下文压缩HTTP集成规划书
description: 规划 MLFB 通过 OpenCode HTTP/SSE 实现 diff 审批、session diff 与 compact 按钮
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - OpenCode
  - HTTP
  - SSE
  - Diff
  - Permission
  - Compact
  - Agent Console
solved_lists:
  - 明确审批前单次工具调用 diff 来自 permission.asked metadata
  - 明确顶栏 session 产物 diff 来自 GET /session/:sessionID/diff 与 session.diff 事件
  - 明确上下文压缩按钮通过 POST /session/:sessionID/summarize 实现
  - 制定 MLFB 端类型、client、store、UI 与验证计划
---

# MLFB OpenCode Diff审批与上下文压缩HTTP集成规划书

更新日期：2026-05-07

## 1. 背景

MLFB Agent Console 正在走 OpenCode 本地 server 的 HTTP/SSE 集成路线，目标是不依赖 ACP 也能覆盖 OpenCode 的核心会话、消息、工具调用、权限审批、状态同步与用户交互能力。

在服务端 slash command 集成之后，下一组需要补齐的 OpenCode UI 能力是：

1. 文件编辑、写入、apply_patch 等工具在需要用户审批时，展示即将发生的单文件或多文件 diff。
2. Agent 顶栏 diff 信息面板中，展示当前 session 的产物 diff，也就是本 session 到目前为止造成的所有文件变更。
3. 提供压缩上下文按钮，触发 OpenCode 的 session compaction/summarize 能力。

这三项能力都不是模型侧普通文本 prompt，也不应该用 UI-only slash command 模拟。它们在 OpenCode 1.14.33 中都有独立的 HTTP/SSE 数据链路。

## 2. 总体结论

本规划确认：上述能力可以通过 OpenCode HTTP/SSE 完成通信。

| 能力 | OpenCode 数据源 | 通信方式 | MLFB 可实现性 |
| --- | --- | --- | --- |
| 审批前单次工具 diff | `permission.asked.metadata` | SSE 实时事件 + `GET /permission` 兜底 | 可实现 |
| 审批回复 | permission service | `POST /permission/:requestID/reply` | 可实现 |
| 顶栏 session 产物 diff | `SessionSummary.diff` | `GET /session/:sessionID/diff` + `session.diff` SSE | 可实现 |
| 工作区 VCS diff | `Vcs.diff` | `GET /vcs/diff?mode=git|branch` | 可选增强 |
| 压缩上下文按钮 | `SessionCompaction.create` + `promptSvc.loop` | `POST /session/:sessionID/summarize` | 可实现 |

关键原则：

- 审批前 diff 和 session 产物 diff 是不同数据源，不混用。
- 审批前 diff 应跟随当前 pending permission 生命周期展示。
- session 产物 diff 应作为会话级聚合信息展示，适合放在顶栏面板。
- compact 按钮直接调用 `session.summarize`，不通过 `/compact` 文本 prompt。

## 3. 目标

### 3.1 审批 Diff 目标

当 OpenCode 工具将修改文件且需要用户授权时，MLFB 应展示待审批 diff：

- 单文件 `edit`：展示目标文件路径和 unified diff。
- 单文件 `write`：展示新增或覆盖写入造成的 unified diff。
- 多文件 `apply_patch`：展示每个文件的路径、操作类型、增删行统计和 patch。
- 允许用户基于 diff 做出 `once`、`always`、`reject` 决策。
- 支持 SSE 实时到达，也支持重连后通过 HTTP 拉取 pending permission。

### 3.2 顶栏 Diff 面板目标

在 Agent 会话顶栏提供 diff 入口，展示当前 session 产物 diff：

- 显示有变更的文件数量。
- 显示总 additions / deletions。
- 展开后按文件列出变更。
- 每个文件可查看完整 patch。
- session diff 更新时自动刷新。
- 没有 diff 时显示空态，不误用工作区 git diff。

### 3.3 Compact 按钮目标

在 Agent 会话 UI 中提供压缩上下文按钮：

- 触发 OpenCode 原生 `POST /session/:sessionID/summarize`。
- 使用当前 session 已选择的 provider/model。
- 发起后展示 compacting/running 状态。
- 通过现有 SSE/message replay 接收 compaction part 和后续 summary。
- 与 slash command 保持边界，不把 `/compact` 作为普通 prompt 发送。

## 4. 非目标

本规划不包含：

- 不实现 OpenCode App/TUI 的完整 command palette。
- 不把 `/compact` 注册成 MLFB UI-only slash command。
- 不通过普通 prompt 模拟 compact。
- 不修改 OpenCode server 源码。
- 不自行扫描 git 或读取文件内容计算 session diff。
- 不在 MLFB 侧复刻 OpenCode snapshot diff 算法。
- 不在第一阶段实现复杂 diff 编辑器，只要求可读、可审、可滚动查看。
- 不解决 `GET /session/:id/diff?messageID=...` 在 OpenCode 1.14.33 中未实际按 messageID 过滤的问题。

## 5. OpenCode 源码依据

### 5.1 Permission Request 结构

OpenCode 的 permission request schema 位于：

`ref-repos/opencode-1.14.33/packages/opencode/src/permission/index.ts`

核心结构：

```ts
export class Request extends Schema.Class<Request>("PermissionRequest")({
  id: PermissionID,
  sessionID: SessionID,
  permission: Schema.String,
  patterns: Schema.Array(Schema.String),
  metadata: Schema.Record(Schema.String, Schema.Unknown),
  always: Schema.Array(Schema.String),
  tool: Schema.optional(
    Schema.Struct({
      messageID: MessageID,
      callID: Schema.String,
    }),
  ),
})
```

事件名：

```ts
permission.asked
```

这意味着 MLFB 可以从 SSE permission event 中获得完整 metadata，也可以通过 HTTP list 补齐。

### 5.2 Permission HTTP API

OpenCode 提供 pending permission 列表：

```http
GET /permission
```

返回：

```ts
Permission.Request[]
```

OpenCode 提供审批回复：

```http
POST /permission/:requestID/reply
Content-Type: application/json

{
  "reply": "once" | "always" | "reject",
  "message"?: string
}
```

对应文件：

- `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/groups/permission.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/handlers/permission.ts`

### 5.3 edit 工具审批 diff

OpenCode `edit` 工具在真正写入之前生成 diff：

```ts
diff = trimDiff(createTwoFilesPatch(filePath, filePath, contentOld, contentNew))
```

然后发起 permission：

```ts
yield* ctx.ask({
  permission: "edit",
  patterns: [path.relative(instance.worktree, filePath)],
  always: ["*"],
  metadata: {
    filepath: filePath,
    diff,
  },
})
```

对应文件：

`ref-repos/opencode-1.14.33/packages/opencode/src/tool/edit.ts`

执行完成后，`edit` 还会写入结构化 tool metadata：

```ts
const filediff: Snapshot.FileDiff = {
  file: filePath,
  patch: diff,
  additions,
  deletions,
}
```

并返回：

```ts
metadata: {
  diagnostics,
  diff,
  filediff,
}
```

因此 edit 的审批前和完成后都可以拿到 diff。

### 5.4 write 工具审批 diff

OpenCode `write` 工具在写入之前生成 diff：

```ts
const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, contentNew))
```

permission metadata：

```ts
metadata: {
  filepath,
  diff,
}
```

对应文件：

`ref-repos/opencode-1.14.33/packages/opencode/src/tool/write.ts`

注意：`write` 完成后的 tool result metadata 当前不包含 diff，只包含：

```ts
metadata: {
  diagnostics,
  filepath,
  exists,
}
```

所以 write 的单次工具 diff 最可靠来源是审批阶段的 permission metadata。

### 5.5 apply_patch 多文件 diff

OpenCode `apply_patch` 会构造每个文件的结构化变更：

```ts
const files = fileChanges.map((change) => ({
  filePath: change.filePath,
  relativePath: path.relative(instance.worktree, change.movePath ?? change.filePath).replaceAll("\\", "/"),
  type: change.type,
  patch: change.diff,
  additions: change.additions,
  deletions: change.deletions,
  movePath: change.movePath,
}))
```

permission metadata：

```ts
metadata: {
  filepath: relativePaths.join(", "),
  diff: totalDiff,
  files,
}
```

完成后 tool result metadata 也包含：

```ts
metadata: {
  diff: totalDiff,
  files,
  diagnostics,
}
```

对应文件：

`ref-repos/opencode-1.14.33/packages/opencode/src/tool/apply_patch.ts`

这条链路最适合支持“多文件审批 diff”。

### 5.6 Session 产物 diff

OpenCode session diff endpoint：

```http
GET /session/:sessionID/diff
```

返回：

```ts
Snapshot.FileDiff[]
```

`Snapshot.FileDiff`：

```ts
{
  file: string;
  patch: string;
  additions: number;
  deletions: number;
  status?: "added" | "deleted" | "modified";
}
```

对应文件：

- `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/session.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/groups/session.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/snapshot/index.ts`

OpenCode 在消息处理完成后更新 session diff：

```ts
yield* summary.summarize({
  sessionID: ctx.sessionID,
  messageID: ctx.assistantMessage.parentID,
})
```

`SessionSummary.summarize` 会：

```ts
yield* storage.write(["session_diff", input.sessionID], diffs).pipe(Effect.ignore)
yield* bus.publish(Session.Event.Diff, { sessionID: input.sessionID, diff: diffs })
```

对应文件：

- `ref-repos/opencode-1.14.33/packages/opencode/src/session/processor.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/session/summary.ts`

### 5.7 VCS diff

OpenCode 还提供工作区或分支 diff：

```http
GET /vcs/diff?mode=git
GET /vcs/diff?mode=branch
```

返回：

```ts
Vcs.FileDiff[]
```

其中 `mode` 支持：

```ts
"git" | "branch"
```

对应文件：

- `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/groups/instance.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/handlers/instance.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/project/vcs.ts`

这可作为后续增强，用于“当前工作区变更”或“分支相对默认分支变更”。第一阶段顶栏 session diff 不依赖它。

### 5.8 Compact / Summarize

OpenCode compact endpoint：

```http
POST /session/:sessionID/summarize
Content-Type: application/json

{
  "providerID": "...",
  "modelID": "...",
  "auto": false
}
```

返回：

```ts
true
```

handler 会：

1. 清理 revert 状态。
2. 读取 session messages。
3. 使用最后一个 user message 的 agent，找不到则使用 default agent。
4. 调用 `SessionCompaction.create()` 创建一个带 `type: "compaction"` part 的 user message。
5. 调用 `promptSvc.loop({ sessionID })` 驱动实际压缩。
6. 返回 `true`。

对应文件：

- `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/groups/session.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts`
- `ref-repos/opencode-1.14.33/packages/opencode/src/session/compaction.ts`

OpenCode App/TUI 都调用：

```ts
sdk.client.session.summarize({
  sessionID,
  modelID,
  providerID,
})
```

对应文件：

- `ref-repos/opencode-1.14.33/packages/app/src/pages/session/use-session-commands.tsx`
- `ref-repos/opencode-1.14.33/packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`

## 6. MLFB 数据模型设计

### 6.1 通用 file diff 类型

新增或复用：

```ts
export type OpenCodeFileDiffStatus = "added" | "deleted" | "modified";

export interface OpenCodeFileDiff {
  file: string;
  patch: string;
  additions: number;
  deletions: number;
  status?: OpenCodeFileDiffStatus;
}
```

该类型同时兼容：

- `Snapshot.FileDiff`
- `Vcs.FileDiff`
- `edit` 的 `metadata.filediff`

### 6.2 Permission edit metadata 类型

```ts
export interface OpenCodePermissionPatchFile {
  filePath: string;
  relativePath?: string;
  type?: "add" | "update" | "delete" | "move";
  patch: string;
  additions?: number;
  deletions?: number;
  movePath?: string;
}

export interface OpenCodePermissionEditMetadata {
  filepath?: string;
  diff?: string;
  files?: OpenCodePermissionPatchFile[];
  diagnostics?: unknown;
}
```

### 6.3 Permission request 类型

如果当前 MLFB 已有 permission 类型，应扩展 metadata 类型；如果没有，应补齐：

```ts
export interface OpenCodePermissionRequest {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
  tool?: {
    messageID: string;
    callID: string;
  };
}
```

### 6.4 Compact request 类型

```ts
export interface OpenCodeSummarizeRequest {
  providerID: string;
  modelID: string;
  auto?: boolean;
}
```

### 6.5 Agent store 状态扩展

建议在 Agent session 或 OpenCode runtime slice 中加入：

```ts
sessionDiffs?: OpenCodeFileDiff[];
sessionDiffLoading?: boolean;
sessionDiffError?: string;

pendingPermissions?: OpenCodePermissionRequest[];
compactRunning?: boolean;
compactError?: string;
```

如果当前已有 permission/request/status 状态，应优先合并，不重复建平行状态源。

## 7. HTTP Client 规划

在 `OpenCodeHttpClient` 中补齐：

```ts
permissions(): Promise<OpenCodePermissionRequest[]>;
replyPermission(
  requestId: string,
  body: { reply: "once" | "always" | "reject"; message?: string },
): Promise<boolean>;

sessionDiff(sessionId: string): Promise<OpenCodeFileDiff[]>;

vcs(): Promise<{ branch?: string; default_branch?: string }>;
vcsDiff(mode: "git" | "branch"): Promise<OpenCodeFileDiff[]>;

summarizeSession(sessionId: string, body: OpenCodeSummarizeRequest): Promise<boolean>;
```

实现约束：

- 继续沿用当前 Basic Auth 和 `directory` query 注入逻辑。
- `sessionDiff` 和 `summarizeSession` 必须 encode `sessionId`。
- `replyPermission` endpoint 使用 permission id，不使用 session id。
- `vcsDiff` query 需要以 `mode` 参数传递。
- compact request 可能耗时较长，调用层不应假设瞬时完成。

## 8. SSE / Event 集成规划

### 8.1 permission.asked

当 SSE 收到：

```ts
{
  type: "permission.asked",
  properties: OpenCodePermissionRequest
}
```

处理：

- 将 request 按 `sessionID` 存入 pending permission 队列。
- 如果 request 属于当前 active Agent session，显示审批 UI。
- 如果 `permission === "edit"` 且 metadata 有 diff，则显示 diff 审批视图。
- 否则显示普通 permission 审批视图。

### 8.2 permission.replied

当 SSE 收到：

```ts
{
  type: "permission.replied",
  properties: {
    sessionID: string;
    requestID: string;
    reply: "once" | "always" | "reject";
  }
}
```

处理：

- 从 pending permission 队列移除 request。
- 清理 responding 状态。
- 如果拒绝，可在对应 tool/message 上显示被拒绝状态，由后续 tool error/message event 补齐。

### 8.3 session.diff

当 SSE 收到：

```ts
{
  type: "session.diff",
  properties: {
    sessionID: string;
    diff: OpenCodeFileDiff[];
  }
}
```

处理：

- 覆盖当前 session 的 `sessionDiffs`。
- 更新顶栏计数。
- 如果 diff 面板打开，实时刷新。

### 8.4 compaction 相关事件

compact endpoint 会创建 `type: "compaction"` part，并通过已有 message/part 流转进入 MLFB。

处理建议：

- 复用现有 message/part normalizer。
- 若当前 normalizer 尚未识别 `compaction` part，应补齐显示为“正在压缩上下文”或“上下文已压缩”。
- 若 SSE session/status 中暴露 `time.compacting` 或 status busy，则用于按钮 loading。
- compact request 返回后不代表 UI 可立即静默完成，应以 message/status 事件为准。

## 9. UI 规划

### 9.1 审批 Diff UI

建议在现有 permission UI 中增强，而不是创建孤立面板。

布局建议：

- 顶部：权限标题、工具名、文件数量。
- 中部：diff 区域。
- 底部：`拒绝`、`始终允许`、`允许一次`。

单文件 metadata 渲染：

- 文件名：`metadata.filepath` 或 `patterns[0]`。
- diff：`metadata.diff`。
- 若能解析 additions/deletions，可显示统计；否则只显示 patch。

多文件 metadata 渲染：

- 左侧或顶部文件列表。
- 每个 item 显示：类型、路径、`+additions/-deletions`。
- 点击文件切换右侧 patch。
- 默认选中第一个文件。

空 diff 退化：

- 如果 metadata 中没有 diff，显示普通 permission 文案和 patterns。
- 不阻断审批。

### 9.2 Diff 渲染组件

建议抽象一个轻量组件：

```ts
<AgentDiffViewer
  files={files}
  mode="permission" | "session"
/>
```

内部支持两种输入：

- `patch` string。
- `OpenCodeFileDiff[]`。

第一阶段可以用纯文本 diff 渲染：

- `+` 行绿色。
- `-` 行红色。
- `@@` hunk 行弱强调。
- 文件 header 固定或醒目。
- 支持横向滚动与长文件纵向滚动。

后续可以升级为更完整的 split/unified diff viewer。

### 9.3 顶栏 Session Diff 面板

入口位置：Agent 顶栏靠近状态/模型/工作区信息的位置。

按钮状态：

- 无 diff：禁用或显示 `0`。
- 有 diff：显示文件数，例如 `3 files`，并显示总 `+/-`。
- loading：显示加载状态。
- error：显示警告，展开后提供重试。

面板内容：

- 汇总：文件数、additions、deletions。
- 文件列表：路径、状态、增删统计。
- diff viewer：显示选中文件 patch。
- 刷新按钮：重新调用 `GET /session/:sessionID/diff`。

交互建议：

- 顶栏按钮点击打开浮层或侧边面板。
- 文件列表和 patch 查看不应影响 composer 输入。
- 面板关闭不清空 diff cache。
- session 切换时根据 session id 切换 cache。

### 9.4 Compact 按钮 UI

入口位置：Agent 顶栏或 composer 附近工具按钮区。

状态：

- 没有 provider session：禁用。
- 没有当前 model：禁用或点击后提示选择模型。
- 正在运行普通 prompt：可禁用，避免与 prompt 并发。
- 正在 compact：loading。

点击行为：

1. 解析当前 session 的模型：`providerID/modelID`。
2. 调用 `client.summarizeSession(providerSessionId, { providerID, modelID })`。
3. 设置 compact running 状态。
4. 等待 HTTP 返回或 SSE/status 更新。
5. 出错时显示错误消息。

不做：

- 不向 composer 插入 `/compact`。
- 不调用服务端 slash command `/compact`。
- 不把 compact 作为普通 user prompt。

## 10. Store 与流程设计

### 10.1 启动与同步

OpenCode runtime 启动后：

1. 建立 SSE。
2. 拉取 providers/models/agents/commands。
3. 拉取 pending permissions：`GET /permission`。
4. 对当前 session 拉取 session diff：`GET /session/:id/diff`。

如果 session 还不存在 provider session id，则跳过 session diff。

### 10.2 Permission 生命周期

```text
SSE permission.asked
  -> store.pendingPermissions upsert
  -> 当前 session UI 显示 permission dock/dialog
  -> 解析 metadata.diff/files
  -> 用户点击 once/always/reject
  -> POST /permission/:id/reply
  -> optimistic responding 状态
  -> SSE permission.replied 或 HTTP 成功后移除/清理
  -> tool result/error event 补齐消息状态
```

### 10.3 Session Diff 生命周期

```text
进入 Agent session
  -> 如果已有 providerSessionId
  -> GET /session/:id/diff
  -> store.sessionDiffs[id] = result

工具执行完成
  -> OpenCode summary.summarize 更新 session_diff
  -> SSE session.diff 到达
  -> store.sessionDiffs[id] = event.diff
  -> 顶栏统计刷新
```

### 10.4 Compact 生命周期

```text
点击 compact 按钮
  -> 校验 providerSessionId/model
  -> POST /session/:id/summarize
  -> compactRunning = true
  -> OpenCode 创建 compaction part
  -> SSE message/part/status 更新
  -> HTTP 返回 true 或失败
  -> compactRunning 根据 status/message 完成态清理
```

## 11. 实施阶段

### Phase 1：类型与 HTTP client

修改范围：

- `app/src/agent/opencode/httpTypes.ts`
- `app/src/agent/opencode/httpClient.ts`

任务：

- 增加 `OpenCodeFileDiff`。
- 增加 `OpenCodePermissionRequest`。
- 增加 `OpenCodePermissionEditMetadata`。
- 增加 `OpenCodeSummarizeRequest`。
- 实现 `permissions()`。
- 实现 `replyPermission()`。
- 实现 `sessionDiff()`。
- 实现 `vcs()` / `vcsDiff()`，可作为可选但建议一并补齐。
- 实现 `summarizeSession()`。

验收：

- TypeScript 类型无误。
- client endpoint 路径与 OpenCode 1.14.33 对齐。
- 保持 directory query 注入。

### Phase 2：SSE normalizer 与 store

修改范围：

- `app/src/store/agentStore.ts`
- OpenCode SSE/event normalizer 所在文件。
- Agent types/session factory。

任务：

- 识别 `permission.asked`。
- 识别 `permission.replied`。
- 识别 `session.diff`。
- 存储 pending permissions。
- 存储 session diffs。
- 增加 reply permission action。
- 增加 refresh session diff action。
- 增加 compact action。

验收：

- SSE permission 到达后 UI 状态可见。
- SSE session.diff 到达后顶栏 diff 统计更新。
- 切换 session 时 diff/permission 不串 session。

### Phase 3：审批 Diff UI

修改范围：

- Agent permission dock/dialog 相关组件。
- 新增 `AgentDiffViewer` 或相近组件。

任务：

- 从 permission metadata 解析 diff。
- 支持单文件 diff。
- 支持 `apply_patch` 多文件 `metadata.files[]`。
- 保留无 diff permission 的旧展示。
- 接入 `once/always/reject` 按钮。

验收：

- edit 审批可看到 diff。
- write 审批可看到新增/覆盖 diff。
- apply_patch 审批可看到多文件 diff。
- 无 diff permission 不崩溃。

### Phase 4：顶栏 Session Diff 面板

修改范围：

- Agent 顶栏组件。
- Agent session manager/header 相关组件。
- Diff viewer 复用组件。

任务：

- 添加 diff 按钮。
- 添加 diff summary 统计。
- 添加面板/浮层。
- 接入 `sessionDiff()` 初次加载与手动刷新。
- 接入 SSE `session.diff` 自动刷新。

验收：

- 有 session diff 时按钮显示文件数和增删统计。
- 面板能查看每个文件 patch。
- session 切换不串数据。
- 空 diff 有合理空态。

### Phase 5：Compact 按钮

修改范围：

- Agent 顶栏或 composer 工具栏。
- Store action。

任务：

- 添加 compact 按钮。
- 解析当前 `providerID/modelID`。
- 调用 `summarizeSession()`。
- 显示 loading/error。
- 识别 compaction part 或 session status。

验收：

- 点击按钮会触发 OpenCode compaction。
- OpenCode session 中出现 compaction part。
- 完成后消息流正常更新。
- 未选择模型时有清晰提示。

### Phase 6：验证与回归

任务：

- 用 OpenCode 真实 server 验证 edit/write/apply_patch permission metadata。
- 验证 permission reply endpoint。
- 验证 session diff endpoint。
- 验证 compact endpoint。
- 验证现有 slash command 不受影响。
- 验证普通 prompt 流程不受影响。

验收：

- VS Code diagnostics 无新增错误。
- 可以完成一次真实 edit 审批并显示 diff。
- 可以完成一次真实 apply_patch 多文件审批并显示每文件 diff。
- 顶栏面板显示 session 产物 diff。
- compact 按钮成功触发并完成。

## 12. 风险与处理

### 12.1 `write` 完成后没有 diff metadata

风险：用户审批时能看到 write diff，但 tool completed 后不能从 write result metadata 再取 diff。

处理：

- 审批 UI 直接使用 permission request metadata。
- 如需历史展示，依赖 session diff 或 VCS diff。

### 12.2 `session.diff?messageID` 未按 messageID 过滤

风险：OpenCode route/schema 接收 `messageID`，但 1.14.33 的 `SessionSummary.diff()` 当前忽略该字段。

处理：

- 顶栏只做 session 总 diff。
- message-level diff 暂不依赖该 query。
- 如果后续要做 message-level diff，优先读取 message `summary.diffs`。

### 12.3 Compact endpoint 可能耗时

风险：`POST /session/:id/summarize` 会执行 `promptSvc.loop()`，不是 no-content async endpoint。

处理：

- UI 发起后进入 loading。
- 不阻塞其它轻量 UI 操作。
- 以 SSE/status/message 更新为最终状态来源。
- HTTP 超时或失败时显示错误。

### 12.4 Pending permission 重连恢复

风险：仅靠 SSE 会漏掉断线期间产生的 permission。

处理：

- OpenCode runtime 启动、SSE 重连或 session 切换时调用 `GET /permission`。
- 按 request id upsert，避免重复。

### 12.5 多文件 diff 面板可读性

风险：大型 patch 过长，浮层难以阅读。

处理：

- 使用固定最大高度和内部滚动。
- 文件列表与 patch 区分栏展示。
- 长行允许横向滚动或等宽 wrapping。
- 第一阶段优先稳定可读，后续再升级 split diff。

## 13. 测试计划

### 13.1 类型与静态检查

- 检查 `httpTypes.ts`。
- 检查 `httpClient.ts`。
- 检查 store 和 UI 组件 diagnostics。

### 13.2 手工验证场景

#### edit 审批

1. 让 OpenCode 修改已有文件。
2. 触发 `permission.asked`。
3. MLFB 显示单文件 diff。
4. 点击 `once`。
5. 工具完成，消息继续流转。

#### write 新增文件审批

1. 让 OpenCode 新建文件。
2. MLFB 显示从空内容到新内容的 diff。
3. 审批后文件创建成功。

#### apply_patch 多文件审批

1. 让 OpenCode 生成多文件 patch。
2. MLFB 显示文件列表。
3. 每个文件能查看独立 patch。
4. 审批后工具完成。

#### 顶栏 session diff

1. 完成一次文件修改工具调用。
2. 等待 `session.diff` 或手动刷新。
3. 顶栏显示文件数量和增删统计。
4. 展开面板能查看每个文件 patch。

#### compact 按钮

1. 创建至少一轮有历史的 session。
2. 点击 compact。
3. 观察 compaction part 出现。
4. 完成后 session 可继续对话。

### 13.3 回归验证

- 普通 prompt 仍可发送。
- 服务端 slash command 仍可执行。
- permission reply 失败时 UI 不会卡死。
- session 切换后 pending permission 和 diff 不串联。
- SSE 断开重连后 pending permission 可恢复。

## 14. 建议实现顺序

推荐顺序：

1. 先实现 HTTP client 与类型。
2. 再实现 permission list/reply 与 SSE pending permission 管理。
3. 然后做审批 diff UI，因为这是用户阻塞路径。
4. 接着做 session diff 顶栏面板。
5. 最后做 compact 按钮。

原因：

- 审批 diff 是强交互阻塞点，收益最大。
- session diff 依赖较少，可以在审批 diff viewer 稳定后复用组件。
- compact 按钮逻辑独立，但需要确认状态展示和 message part normalizer 足够完整。

## 15. 初版验收清单

- [ ] `GET /permission` 可获取 pending permission。
- [ ] `permission.asked` SSE 可更新 store。
- [ ] `permission.replied` SSE 可移除 pending permission。
- [ ] `POST /permission/:id/reply` 可审批。
- [ ] edit 审批显示 `metadata.diff`。
- [ ] write 审批显示 `metadata.diff`。
- [ ] apply_patch 审批显示 `metadata.files[]` 中每个文件 patch。
- [ ] `GET /session/:id/diff` 可显示 session 产物 diff。
- [ ] `session.diff` SSE 可自动刷新顶栏 diff。
- [ ] 顶栏 diff 面板可展开查看每文件 patch。
- [ ] `POST /session/:id/summarize` 可触发 compact。
- [ ] compact 过程中 UI 有 loading/status。
- [ ] compact 完成后消息流与 session 状态正常。
- [ ] 普通 prompt 和服务端 slash command 无回归。

## 16. 结论

MLFB 可以在不引入 ACP、不模拟 UI-only slash command、不修改 OpenCode server 的前提下，通过 OpenCode HTTP/SSE 实现这组三项功能。

最重要的架构边界是：

- **审批 diff**：跟随 permission request，来自 `metadata.diff` 或 `metadata.files[]`。
- **session 产物 diff**：跟随 session summary/snapshot，来自 `/session/:sessionID/diff` 和 `session.diff`。
- **compact 按钮**：直接调用 `/session/:sessionID/summarize`，通过 SSE/message/status 观察执行过程。

按这个边界实现，MLFB 的 Agent UI 可以获得接近甚至超过 OpenCode App 当前版本的审批 diff 能力，同时保持通信路径纯 HTTP/SSE。