# MLFB ACP 与 CLI 路线分析

## 背景

本次讨论围绕未来是否要以 opencode 为主，创建一个能融入 MLFB UI 的 ACP Agent Console。

当前已经完成了内置终端基础能力：

- 右侧 dock 完整栏位。
- 终端 dock tab。
- 多终端标签页。
- 用户主导的 cwd 选择。
- 终端输出 buffer。
- dock 卸载不终止 PTY。
- WebView 刷新后恢复 Tauri 进程内仍活跃的终端。
- 中键关闭终端标签页，并可在设置中开关。

opencode 当前已在本机确认支持 ACP：

```text
opencode acp
start ACP (Agent Client Protocol) server
```

因此 ACP 集成具有现实可行性，但不代表当前阶段必须开发。

## 结论

当前阶段暂不开发 ACP Agent Console。

推荐路线是：

1. 保持当前 CLI 终端作为主要 agent 使用方式。
2. 继续完善终端体验和持久化能力。
3. 将 ACP 作为未来的结构化 agent UI 方向保留。
4. 等到 CLI 无法满足产品体验时，再启动 opencode ACP spike。

这不是否定 ACP，而是延后 ACP。

## 为什么当前 CLI 已经足够

### 1. CLI agent 已经具备强交互能力

许多 agent CLI 会提供专门的 TUI 或半 TUI 体验，例如：

- 会话流。
- 工具调用展示。
- 权限确认。
- 快捷键操作。
- 多行输入。
- 状态提示。

如果 MLFB 当前只是承载这些 CLI，内置终端可以完整保留 agent 原生交互，不需要重新实现一套 UI。

### 2. CLI 是最通用的集成方式

终端可以运行：

- opencode。
- Claude Code。
- Codex CLI。
- Gemini CLI。
- Qwen Code。
- 任何其他 shell 工具。

不需要每个 agent 都支持 ACP，也不需要处理协议差异。

### 3. CLI 失败模式更可见

如果 agent 启动失败、认证失败、网络失败、依赖缺失，终端通常会直接显示错误。

ACP 集成失败时，错误可能出现在：

- agent server 启动层。
- 协议连接层。
- session 状态机。
- UI 渲染层。

调试链路更长。

### 4. 当前产品收益更集中在终端底座

现阶段更值得继续强化：

- 终端多标签。
- cwd 选择。
- 持久化。
- 快捷操作。
- 设置项。
- 输出恢复。
- 与 dock 布局的协同。

这些能力对所有 CLI 都有收益，而 ACP 初期只会服务少数 agent。

## ACP 的长期价值

ACP 仍然是值得关注的长期方向。

它的核心价值是把 agent 输出从“终端文本流”提升为“结构化协议事件”。

未来如果 MLFB 要做真正的一等 Agent Console，ACP 会带来明显收益：

- 结构化消息。
- 结构化 plan。
- 结构化 tool call。
- 结构化 permission request。
- session/new、session/load、session/prompt、session/cancel 等明确生命周期。
- 多 agent 适配层。
- 更好的审计、摘要和权限 UI。

这些是纯 CLI 文本流很难稳定做到的。

## ACP 的当前成本

ACP Agent Console 不是小功能。它至少需要：

- ACP server 进程管理。
- 协议 client。
- session 状态机。
- 消息流 renderer。
- tool call renderer。
- permission request UI。
- terminal/create、terminal/kill、terminal/wait_for_exit 转接。
- 错误恢复和日志系统。
- 与 MLFB session、MLRA、MLC 的关系建模。

如果当前 CLI/TUI 已经能满足实际使用，这些成本暂时不值得立即投入。

## 未来触发条件

当出现以下情况时，可以重新启动 ACP 方向：

1. 需要在 MLFB 中显示结构化 agent plan 和 tool call，而不是终端文本。
2. 需要统一管理多个 agent 的权限请求。
3. 需要把 agent session 与 MLFB feedback session 深度绑定。
4. 需要跨 agent 统一审计、摘要和任务恢复。
5. 终端/TUI 已经无法满足交互体验。
6. opencode ACP 在实际使用中稳定，并能覆盖主要工作流。

## 推荐的未来实现方式

如果未来启动 ACP，建议不要替换 Terminal，而是新增 Agent Console：

- Terminal：原生 CLI/TUI 工作区。
- Agent Console：ACP 结构化 agent 工作区。

两者并存。

Terminal 作为底座和兜底，Agent Console 作为高级结构化体验。

首个 spike 可以只支持 opencode：

```text
opencode acp --hostname 127.0.0.1 --port 0 --cwd <workspace>
```

最小闭环：

1. 启动 opencode ACP server。
2. 创建 ACP session。
3. 发送 prompt。
4. 接收 session/update。
5. 显示 agent 消息。
6. 处理 permission request。
7. 将 terminal command 转接到现有 PTY manager。

## 当前决策

当前不进入 ACP 开发。

短期重点保持在 CLI 终端体验上，因为：

- agent CLI/TUI 本身已经有较强 UI 操作便捷性。
- 当前内置终端可以最大化复用 agent 原生能力。
- CLI 覆盖面更广。
- ACP 集成成本较高，适合作为后续阶段。

这份文档保留 ACP 的架构判断和触发条件，未来需要时可以直接从这里恢复讨论。