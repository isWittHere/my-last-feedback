---
title: MLFB opencode ACP接入规划方案
description: 以ACP作为MLFB结构化Agent UI主协议的分阶段规划
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - ACP
  - opencode
  - Agent Console
  - Terminal
  - Tauri
solved_lists:
  - 明确ACP优先于模仿opencode desktop内部HTTP集成
  - 将cmd.exe作为普通终端稳定默认值
  - 规划MLFB结构化Agent UI分阶段落地路线
---

# MLFB opencode ACP接入规划方案

## 1. 背景与决策变化

此前 MLFB 的路线是 Terminal 先行，ACP Agent Console 作为后续保留方向。这个判断在“终端足够稳定、CLI/TUI 能完整承载 agent 交互”的前提下成立。

但当前测试暴露了新的事实：

- 内置终端在复杂交互下会出现用户未主动输入的 ANSI/CSI 控制序列残片。
- PowerShell/PSReadLine/xterm.js/PTY 的组合更容易触发控制序列、焦点报告、鼠标追踪、历史 replay 等复杂行为。
- 用户测试显示 `cmd.exe` 更稳定，因此普通终端默认值应改为 `cmd.exe`。
- 即使 `cmd.exe` 更稳定，raw terminal 仍然不是承载 agent 工作流的理想协议层。
- opencode 1.14.33 已提供真实的 `opencode acp` 入口，且已有 Zed、JetBrains、Avante.nvim、CodeCompanion.nvim 等配置案例。

因此本规划将 ACP 从“未来保留方向”提升为“结构化 Agent UI 的主线方向”。

## 2. 总体结论

如果 MLFB 的目标是未来 opencode 更新后可以快速接入，并逐步承载更多 agent，那么最优路线是：

```text
普通终端：继续保留，默认 cmd.exe，作为通用 shell/CLI 兜底。
Agent Console：新增 ACP runtime，以 opencode acp 为首个 provider。
UI：做 MLFB 自己的结构化 agent UI，不复刻 opencode desktop。
```

不推荐直接模仿 opencode desktop 的内部 HTTP sidecar + app SDK 方案作为主接入方式。

原因：opencode desktop 是 opencode 自己的产品架构，它可以同时演进 server、SDK 和 UI。MLFB 作为外部集成方，如果直接依赖 opencode 内部 HTTP routes、SSE event schema 和生成 SDK，将承担较高的版本追踪成本。

ACP 的定位正好相反：它是编辑器/IDE 与 coding agent 的标准化外部通信协议。MLFB 应该跟随公开协议，而不是跟随 opencode desktop 的内部实现。

## 3. 设计目标

### 3.1 产品目标

- 在 MLFB 中提供一等 Agent Console，而不是只把 agent TUI 嵌入终端。
- 支持 opencode 的对话、权限、工具调用、文件变更、取消、会话恢复等核心工作流。
- 用户可以在结构化 UI 中查看 agent 行为，而不是从终端文本里猜状态。
- 普通终端继续可用，用于手动命令、日志查看、fallback 和非 ACP CLI。

### 3.2 技术目标

- ACP 作为主协议层。
- opencode 作为第一个 ACP provider。
- UI 依赖 MLFB 内部统一 Agent Event 模型，不直接依赖 opencode 内部 schema。
- provider adapter 可插拔，后续可以接入其他 ACP agent。
- 保留 opencode-specific 扩展点，但不能污染主协议模型。

### 3.3 稳定性目标

- agent 主交互不再依赖 ANSI/CSI/xterm replay/PTY 输出裁剪。
- agent 会话崩溃时可在 MLFB 层展示结构化错误。
- ACP 子进程退出后可重启，UI 状态可恢复或明确失效。
- 权限请求必须显式展示，不允许被终端 UI 状态吞掉。

## 4. 为什么不直接模仿 opencode desktop

opencode desktop 的真实流程是：

```text
Tauri Rust 后端
  -> 启动本地 opencode sidecar HTTP server
  -> 生成 loopback URL 与 Basic Auth 凭据
  -> 前端 await_initialization 获取 server 信息
  -> SolidJS app 使用 @opencode-ai/sdk 调 HTTP API
  -> SSE event stream 同步全局状态和 session 状态
```

这个方案对 opencode 自身很合适，因为 desktop、server、SDK、web app 都在同一个仓库中共同演进。

但对 MLFB 来说，直接复刻会带来以下问题：

1. **内部 API 追踪成本高**

   opencode HTTP route、SDK 类型、SSE event、认证策略、sidecar 参数都可能随版本变化。MLFB 若直接依赖，需要持续同步。

2. **UI 容易变成 opencode desktop fork**

   一旦使用它的内部 SDK 和状态模型，MLFB 的 Agent Console 很容易被 opencode 的产品结构牵引，失去自身反馈工作台的设计主线。

3. **难以扩展到其他 agent**

   HTTP sidecar 方案只服务 opencode。ACP runtime 则可以成为多 agent 宿主。

4. **维护边界不清晰**

   opencode desktop 可以接受内部 breaking changes，因为它自己同步修改。MLFB 不能假设这些内部接口长期稳定。

因此：opencode desktop 值得参考工程经验，但不应成为 MLFB 的主接入协议。

## 5. ACP 接入路线

### 5.1 目标架构

```text
MLFB Agent Console UI
  |
  v
Agent Store / Agent Event Model
  |
  v
ACP Client Runtime
  |
  v
Provider Adapter: OpenCodeAcpProvider
  |
  v
Child Process: opencode acp
  |
  v
stdio nd-JSON JSON-RPC
  |
  v
opencode ACP adapter
  |
  v
opencode internal HTTP server + core
```

MLFB 只直接理解 ACP 与自己的 Agent Event Model。opencode 内部 HTTP server 对 MLFB 不可见。

### 5.2 核心原则

- UI 不直接操作 stdio，不直接解析 terminal 文本。
- stdio 只由 ACP runtime 处理，按 nd-JSON JSON-RPC 解析。
- ACP provider 不直接改 UI store，而是发出统一 agent events。
- 权限请求、工具调用、取消、错误都必须结构化建模。
- opencode-specific 内容只能存在于 provider adapter 或 metadata 中。

## 6. 模块设计

### 6.1 前端模块

建议新增以下模块：

```text
app/src/agent/
  types.ts
  agentEvent.ts
  agentStore.ts
  providers.ts
  acp/
    types.ts
    client.ts
    protocol.ts
    mapper.ts
  opencode/
    provider.ts
    defaults.ts
```

职责：

- `types.ts`：MLFB 内部 Agent Session、Message、ToolCall、Permission、Provider 类型。
- `agentEvent.ts`：统一事件类型，例如 session.created、message.delta、tool.started、permission.requested。
- `agentStore.ts`：Zustand store，管理 sessions、active session、provider state、pending permissions。
- `providers.ts`：provider registry。
- `acp/client.ts`：ACP client 生命周期、请求/响应关联、notification dispatch。
- `acp/protocol.ts`：ACP JSON-RPC 消息类型封装。
- `acp/mapper.ts`：ACP block/update 到 MLFB Agent Event 的映射。
- `opencode/provider.ts`：启动 `opencode acp` 的 provider 定义和默认配置。

### 6.2 Tauri/Rust 模块

建议新增独立进程管理模块，不复用当前 PTY manager：

```text
app/src-tauri/src/agent_process.rs
```

职责：

- 启动 ACP 子进程。
- 管理 stdin/stdout/stderr。
- 将 stdout 按字节流转发给前端 ACP runtime，或在 Rust 侧完成 line framing 后转发。
- 接收前端写入的 JSON-RPC line。
- 处理进程退出、kill、restart。
- 保留 stderr 日志，供 UI 展示诊断信息。

新增 Tauri commands 可以是：

```text
agent_process_start(provider, cwd, command, args, env)
agent_process_write(process_id, line)
agent_process_kill(process_id)
agent_process_list()
agent_process_read_log(process_id)
```

新增 events 可以是：

```text
agent-process-output
agent-process-stderr
agent-process-exit
agent-process-error
```

注意：ACP 子进程不是交互式终端，不需要 PTY。应使用普通 child process pipe，避免 terminal 协议层干扰。

### 6.3 UI 模块

建议新增 Agent Console panel，初期可以放在当前右侧 page dock：

```text
app/src/components/AgentConsolePanel.tsx
app/src/components/agent/
  AgentSessionList.tsx
  AgentMessageTimeline.tsx
  AgentComposer.tsx
  AgentToolCallList.tsx
  AgentPermissionRequest.tsx
  AgentProcessStatus.tsx
```

第一版 UI 不追求复杂，但要有完整工作流：

- provider 选择。
- cwd 选择。
- 新建 session。
- 输入 prompt。
- 显示 assistant response。
- 显示工具调用状态。
- 显示权限请求并允许用户选择。
- 取消当前 prompt。
- 查看进程 stderr/错误。

## 7. 分阶段实施计划

### Phase 0：终端稳定基线

目标：继续保留普通终端，但不再让它承担主要 agent UI。

任务：

- 确认 `cmd.exe` 为 Windows 默认 Shell。
- 保留 PowerShell、Git Bash、WSL Bash 等可选项。
- 完成当前终端层构建验证。
- 文档中明确：Terminal 是通用 shell，不是长期 Agent Console 主协议。

验收标准：

- 新建终端默认进入 `cmd.exe`。
- 用户可在设置中选择其他 shell。
- 普通终端崩溃不影响 ACP Agent Console 的进程管理。

### Phase 1：ACP 进程管理 PoC

目标：不用 UI 先打通 `opencode acp` 子进程与 JSON-RPC 通道。

任务：

- 新增 Tauri agent process manager。
- 启动 `opencode acp`，cwd 指向用户选择的项目路径。
- 读取 stdout/stderr。
- 写入 JSON-RPC request。
- 实现 request id 关联与 timeout。
- 完成 `initialize` 调用。

验收标准：

- MLFB 能启动 `opencode acp`。
- 能收到 initialize response。
- 能显示 agent info、protocolVersion、capabilities。
- 子进程退出能被 UI 感知。

### Phase 2：最小 Agent Session 闭环

目标：完成从 UI 输入 prompt 到 opencode 返回结果的最小闭环。

任务：

- 实现 `session/new`。
- 实现 `session/prompt`。
- 实现 prompt cancellation。
- 建立 MLFB Agent Session store。
- 建立最小 Message Timeline。
- 将 ACP response 映射为内部 message。

验收标准：

- 用户可以创建 opencode ACP session。
- 用户可以发送一句 prompt。
- UI 能显示 assistant 最终响应。
- 用户可以取消正在运行的 prompt。
- 失败时 UI 展示结构化错误，不依赖终端文本。

### Phase 3：权限请求与工具调用 UI

目标：让 agent 执行文件修改、命令等敏感动作时，MLFB 能结构化展示并收集用户决策。

任务：

- 支持 ACP permission request。
- 展示 tool kind、title、raw input、locations。
- 支持 allow once、always allow、reject。
- 支持 tool call pending/running/completed/error 状态。
- 对 edit 类权限展示 diff 或文件路径。
- 权限选择写回 ACP。

验收标准：

- opencode 请求权限时，MLFB 弹出明确权限卡片。
- 用户选择后，opencode 能继续或拒绝操作。
- 工具调用状态能显示在 message timeline 或侧栏中。
- 权限请求不会被隐藏在终端输出中。

### Phase 4：会话恢复、历史与资源块

目标：让 ACP Agent Console 从一次性对话变成可持续工作区。

任务：

- 支持 `session/load`。
- 支持 session list/resume/fork 能力的 UI 占位与逐步实现。
- 支持 image、resource、resource_link。
- 将会话与 MLFB caller/session 关联。
- 增加 transcript 持久化或引用 opencode session id。

验收标准：

- 重启 MLFB 后可以看见历史 ACP session 入口。
- 能恢复 opencode session。
- 图片和文件资源能在 UI 中显示为附件/引用。
- session 与当前 workspace/cwd 关系清楚。

### Phase 5：多 provider 与配置中心

目标：从 opencode 专用集成升级为通用 ACP agent 宿主。

任务：

- 新增 provider registry UI。
- 支持配置 command、args、env、cwd strategy。
- 支持检测 provider 是否可用。
- 支持 provider capability cache。
- 支持不同 provider 的默认模型/认证提示。

验收标准：

- opencode 只是默认 provider 之一。
- 用户可以新增自定义 ACP provider。
- UI 根据 capabilities 自动隐藏不支持的功能。

### Phase 6：MLRA/MLC 深度联动

目标：把 Agent Console 与 MLFB 的反馈、知识、长运行编排能力融合。

任务：

- 将 agent session 与 feedback caller/session 绑定。
- 将重要 agent 结果写入 MLC 摘要候选。
- 将 permission/tool call 纳入审计记录。
- 支持 MLRA 阶段调用 ACP provider。
- 支持从 MLC 文档或附件生成 prompt context。

验收标准：

- Agent Console 不再是孤立面板，而是 MLFB 工作台的一等能力。
- 用户可以从反馈、文档、附件、任务阶段自然进入 agent session。

## 8. 内部 Agent Event 模型建议

为了避免 UI 绑定 opencode 或 ACP 细节，建议定义 MLFB 内部事件模型。

示例：

```ts
type AgentEvent =
  | { type: "provider.started"; providerId: string; processId: string }
  | { type: "provider.exited"; providerId: string; code?: number; signal?: string }
  | { type: "session.created"; sessionId: string; cwd: string }
  | { type: "message.user"; sessionId: string; messageId: string; text: string }
  | { type: "message.assistant.delta"; sessionId: string; messageId: string; text: string }
  | { type: "message.assistant.completed"; sessionId: string; messageId: string }
  | { type: "tool.started"; sessionId: string; toolCallId: string; title: string }
  | { type: "tool.completed"; sessionId: string; toolCallId: string; output?: string }
  | { type: "permission.requested"; sessionId: string; requestId: string; title: string; options: PermissionOption[] }
  | { type: "permission.resolved"; sessionId: string; requestId: string; optionId: string }
  | { type: "error"; scope: "provider" | "session" | "prompt"; message: string };
```

这个模型不需要一次定死，但第一版就要建立“UI 面向内部事件”的边界。

## 9. 配置建议

### 9.1 opencode provider 默认配置

```json
{
  "id": "opencode",
  "name": "OpenCode",
  "protocol": "acp",
  "command": "opencode",
  "args": ["acp"],
  "cwdStrategy": "workspace",
  "env": {}
}
```

Windows 可支持用户指定绝对路径，例如：

```json
{
  "command": "C:\\Users\\<user>\\AppData\\Local\\Programs\\opencode\\opencode.exe"
}
```

### 9.2 认证策略

opencode ACP initialize 会返回 auth methods。若客户端支持 terminal-auth，可提示运行：

```text
opencode auth login
```

MLFB 初期不需要内置复杂认证 UI，可以先提供：

- 检测 auth required。
- 显示登录指引。
- 提供“在终端中打开登录命令”的按钮。
- 后续再实现 terminal-auth 集成。

## 10. 错误处理与恢复

### 10.1 子进程错误

- command not found：提示安装 opencode 或配置路径。
- 启动后立即退出：展示 stderr。
- stdout 非法 JSON：展示协议错误，并保留 raw line 供诊断。
- request timeout：允许重试或重启 provider。

### 10.2 协议错误

- initialize 失败：provider 不可用。
- protocolVersion 不兼容：提示升级 MLFB 或 provider。
- capability 缺失：UI 降级，不展示对应功能。
- permission request 未响应：允许用户拒绝、重试或取消 prompt。

### 10.3 UI 恢复

- provider 进程退出不应导致整个 App 错误。
- session 标记为 disconnected。
- 用户可以重新连接 provider。
- 如支持 session/load，可重新加载历史 session。

## 11. 与当前 Terminal 的关系

Terminal 与 Agent Console 应并存，不互相替代。

```text
Terminal
  - 用于普通 shell
  - 默认 cmd.exe
  - 支持 pwsh/powershell/git-bash/wsl
  - 适合用户手动命令和非 ACP CLI

Agent Console
  - 用于结构化 agent 工作流
  - 首个 provider 为 opencode acp
  - 不走 PTY，不解释 ANSI/CSI
  - 适合权限、工具、diff、会话、取消、恢复
```

这能让 MLFB 同时拥有通用性和稳定的 agent 体验。

## 12. 风险与应对

### 风险 1：ACP 覆盖能力不如 opencode desktop 内部 API

应对：先以 ACP 实现 80% 稳定主流程；必要时增加 opencode-specific optional metadata，不反向污染主 UI。

### 风险 2：opencode ACP 仍在演进

应对：通过 initialize capabilities 和 protocolVersion 做能力协商；将 provider adapter 隔离在单独模块。

### 风险 3：权限 UI 设计复杂

应对：先做最小权限卡片，再逐步增加 diff、路径、命令参数、风险等级。

### 风险 4：子进程 stdio 与 JSON framing 出错

应对：严格按 nd-JSON 逐行解析；stderr 与 stdout 分流；非法行进入诊断日志，不直接进入 UI message。

### 风险 5：多 provider 抽象过早复杂化

应对：Phase 1-4 只实现 opencode provider，但代码边界按 provider interface 组织，避免后续重写。

## 13. 推荐里程碑

### Milestone A：ACP PoC

范围：Phase 1 + Phase 2 最小闭环。

目标：证明 MLFB 能可靠启动 `opencode acp` 并完成一次 prompt。

### Milestone B：可用 Agent Console

范围：Phase 3 + 基础 UI polish。

目标：用户可以真实使用 opencode 完成有权限请求的 coding 任务。

### Milestone C：工作台融合

范围：Phase 4 + 与 MLFB session/caller 关联。

目标：Agent Console 成为 MLFB 工作台的常用能力。

### Milestone D：通用 ACP 宿主

范围：Phase 5。

目标：MLFB 能配置多个 ACP provider。

## 14. 最小可行实现清单

第一轮实现建议只做以下内容：

- `agent_process_start`
- `agent_process_write`
- `agent_process_kill`
- `agent-process-output`
- `agent-process-stderr`
- ACP JSON-RPC client
- initialize
- session/new
- session/prompt
- cancel
- AgentConsolePanel 最小 UI
- opencode provider 默认配置

暂不做：

- 多 provider UI
- session 历史恢复
- diff 复杂渲染
- MLRA 联动
- MLC 自动摘要
- opencode HTTP API 增强

## 15. 最终建议

MLFB 应采用“ACP 主线、Terminal 兜底、opencode 首发”的路线。

短期内，`cmd.exe` 作为默认终端能提升普通 shell 稳定性；中长期，agent 工作流应迁移到 ACP Agent Console。这样 MLFB 不再受 raw terminal 控制序列、xterm replay、PTY 缓冲裁剪影响，也不会绑定 opencode desktop 的内部 HTTP 实现。

这条路线最符合“未来 opencode 更新后可快速接入”的目标：MLFB 跟随公开 ACP 协议演进，而不是追逐 opencode 内部 UI/server 的实现细节。