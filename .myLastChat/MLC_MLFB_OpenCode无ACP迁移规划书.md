---
title: MLFB OpenCode 无 ACP 迁移规划书
description: 规划 MLFB 使用 OpenCode CLI/server 本地 HTTP 能力并逐步删除 ACP
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - OpenCode
  - Agent Console
  - ACP
  - HTTP Adapter
solved_lists:
  - 明确 MLFB 保留自有 UI，OpenCode 仅作为本地能力层
  - 明确以 OpenCode CLI/server HTTP API 替代 ACP
  - 制定逐步迁移和最终删除 ACP 的阶段计划
---

# MLFB OpenCode 无 ACP 迁移规划书

更新日期：2026-05-06

## 1. 背景

MLFB 当前 Agent Console 的 OpenCode 接入路径主要围绕 ACP 实现。ACP 路径已经完成了基本的 initialize、session/new、session/list、session/load、session/prompt、session/set_model、session/set_mode 等能力适配，但在真实产品体验上暴露了明显短板。

主要问题包括：

- ACP 暴露的协议面过窄，缺少删除、重命名、归档、完整模型配置、标题更新事件等基础能力。
- `session/list`、`session/new`、`session/load` 之间的语义容易造成空 session 污染历史记录。
- OpenCode 的真实桌面 UI 并不依赖 ACP，而是使用本地 OpenCode server 的 HTTP API 与 SDK。
- 继续围绕 ACP 打补丁会让 MLFB 的 Agent Console 被一个不完整协议牵制，无法自然获得 OpenCode 原生 session 管理与事件能力。

因此，本规划将 OpenCode 接入路线调整为：MLFB 使用自己的 UI，OpenCode CLI/server 作为本地能力层，通过 HTTP API 或 SDK 通信，逐步完全移除 ACP。

## 2. 产品目标

最终目标是让 MLFB 成为 OpenCode 本地运行时的自有 UI 客户端。

MLFB 负责：

- Agent Console 的视觉和交互体验。
- session 列表、头像、历史记录、Dock、侧栏、composer、tool/todo/process 展示。
- 多语言、主题、布局、反馈流、Caller 体系等 MLFB 产品能力。
- 把用户操作映射为 OpenCode 后端调用。

OpenCode CLI/server 负责：

- 读取 OpenCode 配置。
- 管理 provider、model、认证和运行时能力。
- 创建、读取、更新、删除 session。
- 保存 message/history。
- 执行 prompt。
- 生成标题。
- 执行 tool。
- 推送 streaming events。

## 3. 非目标

本规划不追求以下目标：

- 不嵌入 OpenCode 官方 UI。
- 不把 MLFB 变成 OpenCode app 的外壳。
- 不在第一阶段把 OpenCode 源码 vendoring 到 MLFB 编译链。
- 不继续扩展 ACP 作为长期主路径。
- 不为了快速删除 ACP 而破坏现有 Agent Console 可用性。

## 4. 核心结论

采用 OpenCode HTTP/server 路线后，可以完全移除 ACP 依赖。

最准确的架构描述是：

> MLFB 使用自己的 UI，OpenCode CLI/server 提供本地智能体运行时能力。两者通过本地 HTTP API 或 SDK 连接。

这意味着：

- MLFB 不再调用 ACP method。
- MLFB 不需要使用 OpenCode 官方 UI。
- MLFB 初期不需要引入 OpenCode 源码。
- 用户电脑安装 OpenCode CLI 后，MLFB 可以启动或连接其本地 server。
- 如果后续希望开箱即用，可以再将 OpenCode sidecar binary 随 MLFB 打包。

## 5. 目标架构

### 5.1 当前架构

```text
MLFB Agent UI
  -> agentStore
  -> AcpClient
  -> OpenCode ACP Provider
  -> OpenCode SDK/Core
```

当前问题在于 ACP Provider 只是 OpenCode 能力的窄子集，天然缺少产品级 session 管理能力。

### 5.2 目标架构

```text
MLFB Agent UI
  -> agentStore
  -> OpenCodeAgentAdapter
  -> OpenCodeHttpClient
  -> Local OpenCode Server
  -> OpenCode Core
```

### 5.3 运行时来源

OpenCode server 可以有三个来源。阶段一优先使用第一种。

| 方式 | 描述 | 优点 | 缺点 | 推荐阶段 |
| --- | --- | --- | --- | --- |
| 用户安装 CLI/server | 检测本机 `opencode` 并启动本地 server | 不引入源码，包体小，验证快 | 版本不可控，依赖用户安装 | 第一阶段 |
| MLFB bundle sidecar binary | 随 MLFB 打包 OpenCode CLI/server 产物 | 版本可控，用户无需安装 | 包体变大，多平台打包复杂 | 稳定后 |
| 引入 OpenCode server dist/source | 类似官方 Electron desktop 使用 server dist | 控制力最高 | 构建链复杂，上游同步成本高 | 暂不推荐 |

## 6. 新模块设计

### 6.1 `openCodeServerRuntime`

职责：管理本地 OpenCode server 生命周期。

建议能力：

- 检测 `opencode` CLI 是否存在。
- 解析 CLI 版本。
- 启动 OpenCode local server。
- 指定 host、port、auth、workspace directory。
- 健康检查。
- 记录 server url、username、password、pid、startedAt。
- 复用已有 server 或重连。
- 停止由 MLFB 启动的 server。
- 区分用户外部 server 与 MLFB 托管 server。

建议状态：

- `notConfigured`
- `cliMissing`
- `starting`
- `ready`
- `failed`
- `stopped`

### 6.2 `openCodeHttpClient`

职责：封装 OpenCode HTTP API 或 SDK。

建议能力：

- 根据 baseUrl/auth 创建 client。
- 统一 request wrapper。
- 统一错误格式。
- 版本检测。
- capability 检测。
- event stream 连接与重连。
- request abort/cancel。

实现选择：

- 优先评估 `@opencode-ai/sdk/v2` 是否能稳定连接用户本机 server。
- 如果 SDK 与 CLI 版本耦合过强，可先实现一层轻量 HTTP client。
- 无论使用 SDK 还是 fetch，都必须被封装在 `openCodeHttpClient` 后面，UI 与 store 不直接依赖 SDK response shape。

### 6.3 `openCodeAgentAdapter`

职责：把 OpenCode 原生能力映射为 MLFB Agent Console 所需接口。

建议接口：

```ts
interface OpenCodeAgentAdapter {
  initialize(): Promise<OpenCodeAdapterReadyState>
  listSessions(input: ListSessionsInput): Promise<AgentProviderSession[]>
  loadSession(sessionId: string): Promise<AgentSessionSnapshot>
  createSession(input: CreateSessionInput): Promise<AgentProviderSession>
  sendPrompt(input: SendPromptInput): AsyncIterable<AgentRunEvent>
  renameSession(sessionId: string, title: string): Promise<void>
  archiveSession(sessionId: string): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  listModels(): Promise<AgentModelOption[]>
  setModel(input: SetModelInput): Promise<void>
  cancel(runId: string): Promise<void>
  subscribeEvents(input: SubscribeEventsInput): AsyncIterable<AgentProviderEvent>
}
```

### 6.4 通用 provider adapter 边界

为了让迁移更稳，建议引入通用 provider adapter 边界。

短期 provider：

- `opencode-acp`：旧路径，仅迁移期间保留。
- `opencode-http`：新路径，最终唯一保留。

长期目标：

- `agentStore` 不直接知道 ACP 或 HTTP。
- UI 不知道 OpenCode raw API。
- 所有外部运行时能力都通过 adapter 暴露。

## 7. 数据映射设计

### 7.1 Session 映射

OpenCode session 映射到 MLFB session 时需要保留以下字段：

- providerSessionId
- title
- cwd/directory
- createdAt
- updatedAt
- archivedAt
- modelId
- providerId
- message count
- last activity
- title 是否仍为默认标题

MLFB 不再用 `New session - ...` 判断 session 是否为空。默认标题只表示 OpenCode 尚未生成或更新标题，不表示 session 无效。

### 7.2 Message 映射

需要把 OpenCode message 转为 MLFB `AgentMessage`。

映射重点：

- user message
- assistant text
- assistant text delta
- reasoning/thinking 内容
- tool call start
- tool call delta
- tool call result
- error message
- cancellation

### 7.3 Tool/Todo/Step 映射

OpenCode 的 tool/todo/event 需要映射到 MLFB 的过程展示。

目标：

- 默认显示工具过程。
- 默认显示 todolist。
- 默认显示 step/process。
- 历史 session replay 后仍能恢复足够的信息。

### 7.4 Model 映射

模型列表不再依赖 ACP `session/new` 返回。

目标：

- 启动 OpenCode 后即可获得真实模型列表。
- 未创建 session 也能选择模型。
- 首次 prompt 创建 session 时应用当前选择。
- 已恢复历史 session 时显示该 session 当前模型。

## 8. 迁移阶段

## 阶段 0：CLI/server 能力验证

目标：确认用户安装版 OpenCode CLI 是否能稳定作为 MLFB 本地能力层。

任务：

- 查清 OpenCode CLI 启动 local server 的命令和参数。
- 验证 Windows 下命令发现方式。
- 验证是否能指定 host/port/auth。
- 验证 health endpoint。
- 验证 session.list 不创建 session。
- 验证 SDK v2 或 HTTP client 可连接。

产出：

- CLI/server discovery 记录。
- 最小 POC。
- 推荐 OpenCode 版本范围。

验收标准：

- 能启动或连接 OpenCode server。
- 能 health check。
- 能 list sessions。
- 不产生空 session。
- 失败时能明确区分 CLI 缺失、启动失败、端口冲突、版本不兼容。

## 阶段 1：Server Runtime 接入 MLFB

目标：MLFB 能管理 OpenCode server，但不立即替换 prompt 主路径。

任务：

- 新增 `openCodeServerRuntime`。
- 新增 runtime 状态到 Agent Console。
- 增加启动、停止、重连、错误展示。
- 支持手动配置 server URL 作为兜底。
- 不再把“启动 OpenCode”和“新建 session”绑定。

验收标准：

- 启动 OpenCode 不创建 session。
- 可以显示 server ready/version/capabilities。
- 关闭 MLFB 时能清理 MLFB 托管进程。
- 外部 server 模式不误杀用户进程。

## 阶段 2：Session 管理迁移到 HTTP

目标：先替换 ACP 最薄弱的 session 管理。

任务：

- `refreshProviderSessions` 改用 HTTP `session.list`。
- `restoreProviderSession` 改用 HTTP load/message replay。
- 新增 rename session。
- 新增 delete session。
- 新增 archive/hide session。
- 接入 session.updated/session.deleted 事件或定期刷新。
- 清理基于标题判断空 session 的逻辑。

验收标准：

- session 列表来自 OpenCode 原生 API。
- 列表不会创建 session。
- 可重命名 session。
- 可删除 session。
- 可隐藏或归档 session。
- OpenCode 异步生成标题后 MLFB 能更新。
- 删除远端 session 后本地绑定同步清理。

## 阶段 3：Prompt Streaming 迁移到 HTTP

目标：核心 agent run 不再走 ACP。

任务：

- 调研 OpenCode prompt/message HTTP API 和 event stream。
- 实现 `sendPrompt` HTTP path。
- 映射 text delta。
- 映射 tool call。
- 映射 todo/step。
- 映射 permission request。
- 映射 error/cancel。
- 支持历史 message replay。
- 支持 run cancellation。

验收标准：

- 首次提交 prompt 时才创建 session。
- assistant 文本流式输出正常。
- tool 过程显示正常。
- todo/step 显示正常。
- permission/human gate 能进入 MLFB 确认 UI。
- cancel 能停止当前 run。
- 重新打开历史 session 能恢复消息。

## 阶段 4：模型与配置迁移到 HTTP

目标：模型与 provider 配置来自 OpenCode 原生能力，不再依赖 ACP 初始化副作用。

任务：

- 实现 `listModels`。
- 实现当前模型读取。
- 实现模型切换。
- 定义 MLFB preferred model 与 OpenCode config 的关系。
- 新 session 创建时应用选中模型。
- 删除 ACP model cache 依赖。

验收标准：

- 未创建 session 也能显示模型列表。
- 切换模型不要求 session 已存在。
- 首次 prompt 使用当前选中模型。
- 恢复历史 session 时显示真实模型。

## 阶段 5：Feature Flag 切换与稳定性验证

目标：在删除 ACP 前完成真实使用验证。

任务：

- 增加 `opencodeTransport: acp | http` 临时开关。
- 默认新开发环境使用 HTTP。
- 保留 ACP fallback 一段时间。
- 加 adapter contract tests。
- 加关键 UI smoke test。
- 记录不兼容 OpenCode 版本。

验收标准：

- HTTP path 覆盖日常功能。
- ACP fallback 不再被默认使用。
- 已知错误有可读提示。
- 无空 session 污染。
- session 管理能力完整。

## 阶段 6：彻底删除 ACP

目标：从 OpenCode 集成中移除 ACP。

删除范围：

- ACP client。
- ACP stdio transport。
- OpenCode ACP start options。
- ACP initialize/new/list/load/prompt/set_model/set_mode 调用。
- ACP-specific runtime state。
- ACP session manager 文案。
- ACP-only i18n。
- ACP-only CSS 命名。
- ACP-only tests。
- ACP-only docs。

保留范围：

- MLFB Agent Console UI。
- OpenCode HTTP adapter。
- OpenCode server runtime。
- provider session identity/avatar。
- session navigation。
- model selector UI。
- tool/todo/process UI。

验收标准：

- 全局搜索无 OpenCode ACP 主路径。
- UI 文案不再出现 ACP Sessions。
- OpenCode 集成不启动 ACP provider。
- package dependencies 无 ACP-only 依赖。
- OpenCode CLI/server HTTP path 完整通过手动验证。

## 9. 当前代码影响面

预计涉及：

- `app/src/store/agentStore.ts`
- `app/src/agent/types.ts`
- `app/src/agent/sessionIdentity.ts`
- `app/src/components/agent/AgentComposer.tsx`
- `app/src/components/agent/AgentSessionManagerPanel.tsx`
- `app/src/openCodeSettings.ts`
- `app/src/i18n/locales/zh.json`
- `app/src/i18n/locales/en.json`
- `app/src/index.css`
- `app/src-tauri/src/*`
- `app/src-tauri/capabilities/*`
- `app/package.json`

可能新增：

- `app/src/opencode/openCodeServerRuntime.ts`
- `app/src/opencode/openCodeHttpClient.ts`
- `app/src/opencode/openCodeAgentAdapter.ts`
- `app/src/opencode/openCodeEvents.ts`
- `app/src/opencode/openCodeTypes.ts`
- `app/src/store/openCodeRuntimeStore.ts`
- `app/src-tauri/src/opencode_server.rs`

## 10. 测试与验证策略

### 10.1 Adapter contract tests

覆盖：

- health/version。
- list sessions。
- load session。
- rename session。
- delete session。
- model list。
- prompt event mapping。

### 10.2 UI smoke tests

覆盖：

- 启动 OpenCode。
- 列出 session。
- 打开历史 session。
- 新 prompt 创建 session。
- 流式输出。
- tool/todo/process 展示。
- 重命名。
- 删除。

### 10.3 手动验证矩阵

至少覆盖：

- Windows 用户安装 OpenCode CLI。
- CLI 缺失。
- 端口冲突。
- OpenCode server 启动失败。
- 版本过旧。
- session 标题仍为默认标题。
- OpenCode 异步标题生成。
- 删除远端 session 后本地 UI 同步。

## 11. 风险与缓解

### 风险 1：CLI server 命令不稳定

缓解：

- 阶段 0 先验证。
- 支持手动 server URL。
- 后续 bundle sidecar binary。

### 风险 2：SDK 与 CLI 版本不匹配

缓解：

- 版本检测。
- capability detection。
- 推荐版本提示。
- adapter 内做兼容层。

### 风险 3：prompt event 映射复杂

缓解：

- 先迁移 session 管理。
- prompt streaming 单独阶段处理。
- 为 event mapping 建 fixture。

### 风险 4：过早删除 ACP

缓解：

- 迁移期保留 feature flag。
- 等 HTTP path 全覆盖后再删除。
- 每阶段设置验收标准。

### 风险 5：用户不想安装 CLI

缓解：

- 第一阶段接受这个限制。
- 稳定后支持 MLFB bundled sidecar。
- 设置页清晰提示安装方式和版本要求。

## 12. 开发顺序建议

推荐实际执行顺序：

1. 提交当前已完成的 ACP 修复，作为迁移前稳定点。
2. 阶段 0：验证 OpenCode CLI/server 启动方式。
3. 阶段 1：新增 server runtime，不替换 prompt。
4. 阶段 2：session list/load/rename/delete 迁移到 HTTP。
5. 阶段 3：prompt streaming 迁移到 HTTP。
6. 阶段 4：模型和 provider 配置迁移到 HTTP。
7. 阶段 5：feature flag 稳定验证。
8. 阶段 6：删除 ACP 代码。

## 13. 里程碑

### Milestone A：HTTP server 可连接

完成后，MLFB 能启动或连接 OpenCode server，并显示 ready 状态。

### Milestone B：HTTP session manager

完成后，MLFB 的 session 列表、恢复、重命名、删除全部来自 OpenCode HTTP API。

### Milestone C：HTTP prompt runner

完成后，用户提交 prompt、流式输出、tool/todo/process 全部不经过 ACP。

### Milestone D：HTTP model manager

完成后，模型列表和选择不依赖 `session/new`。

### Milestone E：ACP 删除

完成后，OpenCode 集成中不再存在 ACP 主路径。

## 14. 最终验收定义

当以下条件全部满足时，可以认为无 ACP 迁移完成：

- MLFB 使用自己的 UI 与 OpenCode server 通信。
- OpenCode 启动不会创建 session。
- 用户首次提交 prompt 才创建 session。
- session list/rename/delete/archive 可用。
- session title 能跟随 OpenCode 更新。
- 历史 session 能恢复 messages。
- prompt streaming 可用。
- tool/todo/process 可用。
- 模型列表来自 OpenCode 原生配置。
- OpenCode ACP 代码已删除。
- 文档和 UI 文案不再把 OpenCode 集成称为 ACP Sessions。

## 15. 下一步行动

建议下一步先执行阶段 0。

具体任务：

1. 在 OpenCode 源码和 CLI 中确认 server 启动命令。
2. 验证 Windows 下用户安装 CLI 的发现方式。
3. 写最小 POC：启动 server、health check、session.list。
4. 决定优先使用 SDK 还是轻量 HTTP client。
5. 根据 POC 结果开始实现 `openCodeServerRuntime`。

这个顺序可以避免我们先写大量 UI/store 代码后，才发现 CLI server 启动方式或版本兼容不可控。