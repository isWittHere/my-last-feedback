---
title: OpenCode Global Event SSE 同步机制
description: 记录 MLFB 对齐 OpenCode Desktop 的 SSE 通信排障与方案
workplace: ${workspaceFolder}
project: my-last-feedback
type: knowledge
tags:
    - knowledge
    - OpenCode
    - SSE
    - global-event
    - prompt_async
    - Agent Console
---

# OpenCode Global Event SSE 同步机制

## 1. 主题概述 (Topic Overview)

- **主题**: MLFB Agent Console 与 OpenCode server 之间的 HTTP/SSE 通信方式，重点是 `prompt_async`、`/event`、`/global/event` 与 OpenCode Desktop 同步模型的关系。
- **目标**: 解释并记录一次 GUI 响应延迟、流式输出异常、Network event 请求异常刷新的排障过程，以及最终向 OpenCode Desktop `/global/event` 模式对齐的方案。
- **讨论背景**: 用户在切换 DeepSeek 系列模型后发现 MLFB GUI 中 OpenCode Agent Console 不能稳定接收回复；OpenCode CLI 中同样配置正常，REST `/message` 又能显示 server 很快完成，说明问题集中在 GUI 的 HTTP/SSE 事件同步链路，而不是 provider 或模型本身。

## 2. 背景与上下文 (Background & Context)

- **项目上下文**: 本项目 `my-last-feedback` 是 Tauri 桌面应用，包含 React/Vite 前端、Rust/Tauri 后端、MCP 工具层，以及基于 OpenCode HTTP server 的 Agent Console。
- **相关组件/系统**:
  - `app/src/agent/opencode/serverRuntime.ts`: 启动 `opencode serve` 并创建 HTTP client。
  - `app/src/agent/opencode/httpClient.ts`: 自写 OpenCode HTTP client 与 SSE connection。
  - `app/src/agent/opencode/httpTypes.ts`: OpenCode HTTP/SSE 相关类型。
  - `app/src/agent/opencode/eventNormalizer.ts`: 将 OpenCode bus event 归一化为 MLFB Agent UI 事件。
  - `app/src/store/agentStore.ts`: Agent Console Zustand store，负责 session、prompt、SSE event routing、REST restore/backfill。
  - `ref-repos/opencode-1.14.33/packages/app/src/context/global-sdk.tsx`: OpenCode Desktop 的 global event SDK 使用方式。
  - `ref-repos/opencode-1.14.33/packages/app/src/context/global-sync/event-reducer.ts`: OpenCode Desktop 应用 message/part/session/todo 事件的 reducer。
- **需求或问题**:
  - GUI 发送 prompt 后长时间无响应，但 CLI 很快响应。
  - `POST /session/:id/prompt_async` 返回 `204 No Content`，这被确认是正常行为。
  - REST `GET /session/:id/message` 日志显示 assistant 约 2.8 秒内完成，证明 server/model 不是慢点。
  - Network 一度出现大量 `event 200 fetch 378 B 2 ms` 的短请求，说明那不是正常 SSE 长连接，而是 event stream 重连循环。

## 3. 技术方案 (Technical Solution)

- **方案概述**: 将 MLFB 的 OpenCode Agent Console 通信模型向 OpenCode Desktop 靠齐：继续使用 `prompt_async` 提交 prompt，但将事件监听从 instance `/event` 切换到 global `/global/event`，保留 global event 的 `directory/project/workspace` 元数据，并按 directory 过滤后再交给现有 Agent store reducer。
- **技术选型**:
  - 保留现有自写 `OpenCodeHttpClient`，避免短期引入 SDK 构建/打包复杂度。
  - 采用 OpenCode Desktop 同款的 `/global/event` 思路。
  - 在 prompt 发送前生成 OpenCode 风格 `messageID` 与 `partID`，对齐 Desktop optimistic message 绑定方式。
  - 保留 heartbeat timeout、reconnect、coalescing、stale delta skip。
- **架构设计**:
  - `prompt_async` 负责提交任务，不等待模型输出。
  - `/global/event` 是长期 SSE 连接，负责接收 `message.updated`、`message.part.updated`、`message.part.delta`、`session.status` 等事件。
  - MLFB 通过 event `directory` 过滤出当前 runtime/session 相关事件，再按 `providerSessionId` 路由到本地 session。
  - REST `/message`、`/todo`、`/session/status` 只作为启动、恢复、重连后的低频 backfill，不作为主流式通道。

## 4. 关键决策与理由 (Key Decisions & Rationale)

- **决策点: `prompt_async` 不是错误通道**
  - OpenCode server docs 明确说明 `POST /session/:id/prompt_async` 是“异步发送消息，不等待响应”，返回 `204 No Content`。
  - OpenCode Desktop 普通聊天提交使用 `client.session.promptAsync(...)`。
  - server route 中 `prompt_async` 与 `POST /session/:id/message` 最终都调用 `SessionPrompt.Service.prompt(...)`，区别只是前者 `void runRequest(...)` 后立即返回。

- **决策点: 不再依赖 instance `/event`，改为 `/global/event`**
  - Desktop 使用 global event stream，并按 directory 分发。
  - MLFB 之前使用 instance `/event`，在某些场景可能与 prompt 所在 instance/directory 不完全一致，导致只看到 heartbeat 或事件不完整。
  - 切换到 `/global/event` 后，GUI 恢复收到信息，说明之前的核心问题在事件监听通道，而非 provider 或 prompt body。

- **决策点: 撤掉 prompt 后短轮询兜底**
  - 短轮询能让最终结果更快显示，但会制造大量 `/message`、`/todo`、`/status` 请求，掩盖真正 SSE 问题。
  - 当前目标是复用 Desktop 的事件同步模式，因此 REST backfill 应保持低频兜底，而不是替代流式通道。

- **决策点: Network 里 event 是否正常要看“长连接还是短请求循环”**
  - 正常: 一个 `/global/event` 请求长期 pending，同一连接里持续收到 heartbeat 和 message events。
  - 异常: 大量 `event` 请求快速 `200` 完成，每个只有几毫秒，说明连接打开后马上结束并重连。

## 5. 实现要点 (Implementation Details)

- **实现步骤**:
  1. `OpenCodeBusEvent` 增加 `directory/project/workspace` 字段，保留 `/global/event` 外层元数据。
  2. `unwrapEvent(raw)` 解析 global wrapper，将 `raw.payload` 作为真正 bus event。
  3. `OpenCodeSseConnection.enqueueEvent(...)` 跳过 `payload.type === "sync"`，与 Desktop 一样消费转换后的 bus event。
  4. `sseEventKey(...)` 与 `sseDeltaKey(...)` 加入 directory，避免多个目录下相同 session/part id 互相 coalesce。
  5. `startOpenCodeProvider(...)` 中从 `runtime.client.openEvents(...)` 切换为 `runtime.client.openGlobalEvents(...)`。
  6. 增加 `openCodeGlobalEventMatchesRuntime(...)`，按 runtime cwd/session cwd 匹配 global event directory。
  7. 发送 prompt 前生成 OpenCode 兼容 `msg_...` 与 `prt_...`，并把 `messageID` 传给 `prompt_async`。

- **关键代码示例**:

```ts
function unwrapEvent(raw: unknown): OpenCodeBusEvent {
  const rawObject = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const payload = typeof rawObject.payload === "object" && rawObject.payload !== null ? (rawObject.payload as Record<string, unknown>) : rawObject;
  const properties = typeof payload.properties === "object" && payload.properties !== null ? (payload.properties as Record<string, unknown>) : {};
  return {
    raw,
    directory: typeof rawObject.directory === "string" ? rawObject.directory : undefined,
    project: typeof rawObject.project === "string" ? rawObject.project : undefined,
    workspace: typeof rawObject.workspace === "string" ? rawObject.workspace : undefined,
    type: typeof payload.type === "string" ? payload.type : "unknown",
    properties,
  };
}
```

```ts
const events = runtime.client.openGlobalEvents({
  onEvent: (event) => {
    if (!openCodeGlobalEventMatchesRuntime(event, runtime, session)) return;
    handleOpenCodeBusEvent(sessionId, event);
  },
});
```

```ts
await httpRuntime.runtime.client.promptAsync(providerSessionId, {
  messageID: promptMessageId,
  parts: promptParts,
  model: openCodeModelFromSession(configuredSession),
  ...(configuredSession.modeId ? { agent: configuredSession.modeId } : {}),
});
```

- **配置要点**:
  - `opencode serve` 通过 `OPENCODE_SERVER_USERNAME` / `OPENCODE_SERVER_PASSWORD` 提供 Basic Auth。
  - `OPENCODE_CLIENT` 当前设置为 `mlfb-opencode-http`，用于标识 MLFB 客户端。
  - SSE heartbeat timeout 当前在 MLFB 自写 client 中设置为 `45_000` ms，用于避免 WebView/DevTools 下频繁误重连。

- **关键代码位置**:
  - `app/src/agent/opencode/httpClient.ts`
  - `app/src/agent/opencode/httpTypes.ts`
  - `app/src/store/agentStore.ts`
  - `ref-repos/opencode-1.14.33/packages/app/src/context/global-sdk.tsx`
  - `ref-repos/opencode-1.14.33/packages/app/src/components/prompt-input/submit.ts`
  - `ref-repos/opencode-1.14.33/packages/app/src/context/global-sync/event-reducer.ts`
  - `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/session.ts`
  - `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/global.ts`

## 6. 最佳实践与注意事项 (Best Practices & Considerations)

- **使用建议**:
  - 判断 SSE 是否正常时，不要只看 Network 里有没有 `event`，要看它是一个长期 pending 的请求，还是大量短生命周期请求。
  - 发送 prompt 后，应在同一个 `/global/event` 连接中看到 `message.part.updated`、`message.part.delta`、`message.updated`、`session.status`。
  - `prompt_async` 返回 `204` 是成功提交，不是错误，也不表示缺少响应体。
  - REST `/message` 显示完成快，只能证明 server/model 正常；如果 UI 慢，重点检查 SSE event consumption。

- **常见陷阱**:
  - 把 `204 No Content` 误认为没有模型输出。
  - 把 heartbeat 误认为异常流量。Heartbeat 正常存在，OpenCode server 每 10 秒发送一次用于保活。
  - 把大量短 `event` 请求误认为正常 SSE。正常 SSE 是一个长连接，不是一排几毫秒完成的 fetch。
  - 用 prompt 后短轮询掩盖 SSE 问题。短轮询会让 UI 看起来恢复，但 Network 噪声更大，也不是真正流式。
  - 忽略 directory。Global event 包含多目录事件，消费前必须按 directory 或 providerSessionId 路由。

- **性能考虑**:
  - 高频 `message.part.delta` 应做批量 flush/coalescing，避免每个 token 都触发昂贵 UI 更新。
  - `message.part.updated` 与 delta 同帧出现时，需要 stale delta skip，避免重复拼接。
  - 多 runtime 场景要避免重复开多个 global event stream。

- **安全注意**:
  - OpenCode 本地 server 使用 Basic Auth，所有 HTTP/SSE 请求必须带 Authorization。
  - Network/日志中不要打印密码或完整 Authorization header。
  - `ref-repos/` 是参考源码目录，不应提交到 git。

## 7. 相关资源 (Related Resources)

- **代码位置**:
  - `app/src/agent/opencode/httpClient.ts`: 自写 HTTP client、`openGlobalEvents`、SSE parser、heartbeat/reconnect/coalescing。
  - `app/src/agent/opencode/httpTypes.ts`: `OpenCodeBusEvent`、prompt request、message/part 类型。
  - `app/src/store/agentStore.ts`: prompt 发送、OpenCode runtime、global event 路由、provider message/part 更新。
  - `app/src/agent/opencode/eventNormalizer.ts`: OpenCode raw event 到 MLFB block/delta/status 的归一化。
  - `ref-repos/opencode-1.14.33/packages/app/src/context/global-sdk.tsx`: Desktop global event stream 参考。
  - `ref-repos/opencode-1.14.33/packages/app/src/context/global-sync/event-reducer.ts`: Desktop event reducer 参考。
  - `ref-repos/opencode-1.14.33/packages/app/src/components/prompt-input/submit.ts`: Desktop promptAsync 与 optimistic message 参考。
  - `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/session.ts`: `POST /message` 与 `POST /prompt_async` server route。
  - `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/event.ts`: instance `/event` SSE route。
  - `ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/global.ts`: global `/global/event` SSE route。

- **依赖项**:
  - Tauri WebView2 fetch streaming 行为。
  - OpenCode server HTTP API。
  - OpenCode BusEvent / SyncEvent 事件模型。
  - Zustand store state update。

- **参考文档**:
  - `.myLastChat/MLC_K_OpenCode_HTTP_SSE无ACP验证.md`
  - `.myLastChat/MLC_OpenCode_Prompt_Event_HTTP通道验证报告.md`
  - `.myLastChat/MLC_MLFB OpenCode实时思考与v0.5.7发行续接摘要.md`
  - `ref-repos/opencode-1.14.33/packages/web/src/content/docs/zh-cn/server.mdx`

## 8. 待办与改进 (TODOs & Improvements)

- **待完成**:
  - 观察当前 `/global/event` 是否稳定保持单一长连接，不再出现大量几毫秒完成的短请求。
  - 在 DeepSeek、Minimax 等模型上重复测试，确认 `message.part.delta` 能实时驱动 UI。
  - 必要时增加临时 raw SSE timestamp 诊断，区分“事件没到”“事件被缓冲”“事件到了但 reducer 丢弃”。

- **已知问题**:
  - MLFB 仍使用自写 SSE parser，未完全复用 OpenCode SDK 的 generated SSE stream。
  - MLFB 的 OpenCode state 仍是 ad hoc 写入 `AgentSession.messages`，不是 Desktop 的完整 global sync store。
  - 多 runtime 或旧连接未清理时仍可能出现重复 event stream。
  - directory filter 已做 normalize，但 worktree、restore session、跨目录场景仍需额外验证。

- **优化方向**:
  - 将 SSE parser 替换为 OpenCode SDK 同款 parser 或等价实现，减少 framing 边缘差异。
  - 引入 app/server 级别的单例 global event stream，而不是 runtime/session 级连接。
  - 更接近 Desktop 建立 message map、part map、todo map、status map，再由 UI 派生显示。
  - 补齐 visibilitychange 自愈逻辑：窗口重新可见时，如果超过 heartbeat timeout 未收到事件，主动 abort attempt 触发重连。
  - 优化高频 delta 下的主线程让步与批处理，进一步贴近 Desktop 的 `STREAM_YIELD_MS` 行为。

## 9. 2026-05-10 对话续记

### 1. Previous Conversation

- 本轮对话从用户报告的一个回归开始：切换到 DeepSeek 系列模型后，interactive-feedback 弹窗在 UI 提交后，OpenCode Agent Console 侧似乎“收不到信息”，但历史恢复里又能看到响应。
- 之后问题范围扩大。用户进一步补充 Minimax 也出现相似问题，这使排查方向从“DeepSeek 专属 provider 特性”收敛到“共享的消息续跑链路、推理参数、SSE 事件同步或 GUI 集成差异”。
- 整段排查分成两个阶段：
  - 第一阶段是对照参考仓库 ref-repos/opencode-1.14.33，分析模型 provider、reasoning 参数、tool result 续跑和 OpenCode Desktop 通信模型的差异。
  - 第二阶段是直接在 MLFB 代码中修复 OpenCode GUI 与 server 的同步链路，并在此基础上完成知识文档沉淀与版本升级打包。
- 对话后半段已经明确一个关键事实：OpenCode CLI 在同样模型配置下工作正常，OpenCode server 的 REST message 结果也显示 assistant 很快完成，因此根因不在模型本身，而在 MLFB GUI 对 OpenCode HTTP/SSE 事件的消费链路。

### 2. Current Work

- 在本次 summary 请求之前，实际工作已经推进到“代码已改、知识文档已建、版本已升到 0.6.2 并完成 Windows 包构建”的状态。
- 已完成的近期主线包括：
  - 分析 interactive-feedback 工具结果为何能进入历史却无法稳定驱动 GUI 后续响应。
  - 对照 OpenCode Desktop，确认 prompt_async 返回 204 是正常语义，真正的模型输出依赖 SSE 事件流，而不是 POST 响应体。
  - 将 MLFB 的事件监听重心从 instance /event 切换到与 Desktop 更一致的 /global/event。
  - 在 prompt 发送前生成 OpenCode 风格的 messageID/partID，以减少本地 optimistic user message 与 server event 绑定时的竞态窗口。
  - 调整 SSE 自愈逻辑，包括 heartbeat timeout 放宽、重连、回填节流，并撤掉会掩盖真实问题的高频 prompt 后短轮询兜底。
  - 新建一份专题知识文档，记录本次 OpenCode Global Event SSE 排障过程。
  - 将版本从 0.6.1 升级到 0.6.2，并通过现有 Windows 打包脚本生成新的发行包。
- 本次 summary 请求发生时，最后停留点是：构建完成后，准备再快速确认当前工作区哪些文件属于本轮版本、文档和产物变化。

### 3. Key Technical Concepts

- OpenCode HTTP API
- OpenCode prompt_async 语义
- SSE 长连接与 heartbeat
- global event stream 与 instance event stream 的差异
- OpenCode Desktop 的 global sync 模型
- MLFB 自写 OpenCode HTTP client
- event normalizer / reducer / store 路由
- providerSessionId 与 directory 过滤
- optimistic message 绑定
- message.part.updated 与 message.part.delta 的配合
- stale delta skip 与 event coalescing
- REST backfill 只做低频兜底
- DeepSeek / Minimax 共享异常不一定是 provider 本身，而可能是 GUI 集成差异
- Tauri WebView2 下 fetch streaming 的稳定性
- 版本同步规则：根 package.json、app/package.json、app/src-tauri/Cargo.toml 需保持一致
- 打包产物规则：Windows 构建通过 scripts/package-win.sh 生成 zip 包
- 备份规则：允许做 git 备份提交，但必须排除 ref-repos

### 4. Relevant Files and Code

#### app/src/agent/opencode/httpClient.ts

- 这是本轮最核心的修改点之一。
- 这里处理 OpenCode 的 HTTP 请求与 SSE 连接，近期围绕以下方向调整：
  - 为 SSE 连接增加 heartbeat timeout、自愈重连和 attempt 管理。
  - 后续又放宽 heartbeat timeout，避免过于激进的误判导致 event 请求循环重建。
  - 连接逻辑从依赖 instance event 转向支持 global event。
  - 对 global event payload 做解析，并跳过 sync 类型事件，只消费真正的 bus event。

#### app/src/agent/opencode/httpTypes.ts

- 用于承载 OpenCode HTTP/SSE 类型。
- 本轮需要承接 global event 外层携带的 directory、project、workspace 元数据，以便在前端按目录过滤事件。
- promptAsync 的请求体也需要支持 messageID，以与 Desktop 的 optimistic message 绑定方式对齐。

#### app/src/store/agentStore.ts

- OpenCode GUI 运行时逻辑的另一核心文件。
- 这里承接了以下几类改动：
  - prompt 发送前生成 OpenCode 风格的 msg_ 和 prt_ ID。
  - 启动 provider 时从 openEvents 逐步切换到 openGlobalEvents。
  - 通过 directory 过滤和 providerSessionId 路由把 global event 分发回当前 session。
  - 保留 message/status/todo 的低频 backfill 作为断流后的补齐，而不是主流式通道。

#### app/src/agent/opencode/eventNormalizer.ts

- 本文件本轮没有作为主改动落点，但它在整个问题链路中是关键观察点。
- 用户与助手多次以 /event 和 event 流量为中心讨论“为什么 GUI 没有即时收到消息”，本文件代表了 raw event 进入 UI block 的重要中间层。

#### .myLastChat/MLC_K_OpenCode_Global_Event_SSE同步.md

- 这是本轮已经创建的专题知识文档。
- 文档记录了 prompt_async、instance event、global event、Desktop 对齐思路、Network 异常判定方式和后续 TODO。
- 当前 summary 请求决定在这份文档上继续追加续记，而不是新建重复摘要。

#### package.json

- 根版本文件，已从 0.6.1 升级为 0.6.2。

#### app/package.json

- 前端应用版本文件，已同步从 0.6.1 升级为 0.6.2。

#### app/src-tauri/Cargo.toml

- Tauri/Rust 侧版本文件，已同步从 0.6.1 升级为 0.6.2。

#### dist/win-x64/my-last-feedback-v0.6.2-win-x64.zip

- 本轮构建产物。
- Windows 打包脚本已成功生成该压缩包。

### 5. Problem Solving

- 已解决或基本解决的问题：
  - 确认“interactive-feedback 在历史可恢复但 UI 实时没有继续”的现象，不是简单的表单提交失败，而是提交后续跑与实时同步链路存在问题。
  - 确认 prompt_async 返回 204 不是异常，排除了“因为没有响应体所以没收到模型输出”的误判。
  - 确认 OpenCode server/CLI 与 provider 大体正常，问题重点转到 GUI 事件同步，而不是 DeepSeek 或 Minimax 模型本身不可用。
  - 识别并修正/缓解了 SSE 连接过于脆弱的问题，包括断流后的自愈思路、错误的短轮询兜底和 event 通道选择。
  - 将通信模型向 OpenCode Desktop 的 global event 方式收敛。
  - 完成文档沉淀与版本升级打包。
- 排障过程中形成的关键判断：
  - “历史恢复有结果，但 live UI 没继续”意味着数据很可能已经进入 OpenCode session history，只是 GUI 没有正确消费实时事件。
  - “CLI 正常、REST /message 很快完成、GUI 很慢”意味着模型执行层大概率没问题。
  - “Network 中大量短生命周期 event 请求”代表异常重连循环，而不是健康的 SSE。
  - “Minimax 也受影响”削弱了 DeepSeek 专属特性的解释力，更支持 GUI 事件模型存在共性问题的判断。
- 备份与过程记录：
  - 过程中做过多次 git 备份提交，并始终显式排除 ref-repos。
  - 对话中明确提到的提交包括：17a50a7、ed3d511、1a7af85。

### 6. Pending Tasks and Next Steps

- 待继续确认的事项：
  - 检查 0.6.2 构建完成后的工作区变更，确认哪些文件是本轮 SSE 修复、文档更新和构建产物。
  - 在实际 GUI 中继续验证 /global/event 是否已经稳定保持为单一长连接，而不是重新出现短请求循环。
  - 继续验证 DeepSeek、Minimax 等模型下 message.part.delta 是否实时驱动 UI。
  - 如果仍有延迟，再增加更精确的临时诊断点，用于区分“事件没有到达”“事件到达但被缓冲”“事件到达后被 reducer/store 丢弃”。
- 与当前停留点直接相关的原话如下：

> 版本号已同步改为 `0.6.2`，并确认主要版本文件里没有残留 `0.6.1`。接下来按现有 Windows 打包脚本构建发行包，这一步会跑 Tauri release build，可能需要几分钟。

> 打包脚本成功完成：Tauri release build 通过，并生成了 [`dist/win-x64/my-last-feedback-v0.6.2-win-x64.zip`](dist/win-x64/my-last-feedback-v0.6.2-win-x64.zip )。我再快速看一下当前工作区变更，确认哪些文件是本次版本和文档/产物变化。

- 如果继续当前主线，下一步应直接做两件事：
  - 先核对工作区变更与构建产物状态，形成一个干净的“本轮实际修改清单”。
  - 再做一次面向 GUI 的实际验证，确认 0.6.2 对 OpenCode SSE 同步的修复是否覆盖了用户最初报告的现象。
