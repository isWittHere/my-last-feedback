---
title: OpenCode实例配置刷新与Session生命周期
description: 记录 OpenCode 目录级 instance、配置快照与 MLFB 刷新语义分析
workplace: ${workspaceFolder}
project: my-last-feedback
type: knowledge
tags:
    - knowledge
    - OpenCode
    - instance
    - session
    - config
    - skills
    - runtime
---

# OpenCode实例配置刷新与Session生命周期

## 1. 主题概述 (Topic Overview)
- 主题: OpenCode 的目录级 instance 生命周期、配置快照机制，以及 MLFB 中 session 与 provider runtime 的刷新语义。
- 目标: 解释为什么新增 skill、agent、command 或修改配置后，新 session 与旧 session 可能继续看到旧配置，并澄清后续应如何设计安全刷新策略。
- 讨论背景: 在 Copilot 到 OpenCode 的真实迁移过程中，MCP、instructions、commands、agents、skills 已逐步迁入真实 OpenCode 用户配置，但用户实测发现新增 skill 在 MLFB 中不可见，进而暴露出 provider runtime 复用与配置刷新边界的问题。

## 2. 背景与上下文 (Background & Context)
- 项目上下文: 当前仓库是 my-last-feedback，MLFB 已接入 OpenCode HTTP runtime，并作为外层桌面应用和会话管理层使用。
- 相关组件/系统:
  - MLFB session 与 provider runtime 状态管理: [app/src/store/agentStore.ts](app/src/store/agentStore.ts#L429)
  - MLFB 新建 session 继承行为: [app/src/store/agentStore.ts](app/src/store/agentStore.ts#L1941)
  - OpenCode 目录级 instance 缓存: [ref-repos/opencode-1.14.33/packages/opencode/src/project/instance-store.ts](ref-repos/opencode-1.14.33/packages/opencode/src/project/instance-store.ts)
  - OpenCode config 快照: [ref-repos/opencode-1.14.33/packages/opencode/src/config/config.ts](ref-repos/opencode-1.14.33/packages/opencode/src/config/config.ts#L715)
  - OpenCode skill 缓存: [ref-repos/opencode-1.14.33/packages/opencode/src/skill/index.ts](ref-repos/opencode-1.14.33/packages/opencode/src/skill/index.ts#L206)
  - OpenCode system prompt 中的技能可见性: [ref-repos/opencode-1.14.33/packages/opencode/src/session/system.ts](ref-repos/opencode-1.14.33/packages/opencode/src/session/system.ts#L68)
- 需求或问题:
  - 新 session 要能看到新配置并以新 provider 启动。
  - 旧 session 不能因为新建 session 而被打断。
  - 旧 session 又不应永远困在旧 skill 视图里。

## 3. 技术方案 (Technical Solution)
- 方案概述: 当前讨论没有直接落地最终修复，而是先完成模型澄清与边界分析。结论是，问题不能只从 session 角度看，必须同时考虑目录级 instance、配置快照与安全刷新时机。
- 技术选型:
  - MLFB 侧继续以 OpenCode HTTP runtime 为基础。
  - 分析 OpenCode 上游源码，确认其原生设计是否按 session 或目录缓存能力视图。
  - 暂不贸然实现每次 prompt 强制刷新。
- 架构设计:
  - MLFB 当前实现更偏向同 cwd 复用 runtime。
  - OpenCode 上游本体采用目录级 instance，而非每个 session 一个独立实例。
  - 若未来要修复，需在 MLFB 外层增加配置变更感知与安全刷新策略，而不是简单照搬上游或简单按 prompt 重启。

## 4. 关键决策与理由 (Key Decisions & Rationale)
- 决策点: 先暂停直接修复，优先沉淀知识文档。
- 权衡考虑:
  - 直接让每次发送 prompt 都刷新 provider，虽然直觉上能看到新配置，但会破坏同一 session 的执行连续性。
  - 如果只保证新 session 首次绑定新 provider，而旧 session 永远停留在旧 runtime，又会导致旧 session 永远看不到新 skill，这在产品语义上不可接受。
  - 如果完全照搬 OpenCode 上游目录级 instance 设计，刷新体验会过弱，无法满足 MLFB 当前迁移场景中对配置即时生效的更高期待。
- 选择原因:
  - 先通过源码确认 OpenCode 的真实模型，再决定 MLFB 应该在哪一层偏离上游设计。
  - 当前最可靠的结论是，问题本质上是目录级实例失效与重建问题，而不是简单的 session UI 刷新问题。

## 5. 实现要点 (Implementation Details)
- 已确认的 MLFB 根因:
  - 新 session 在创建时会继承 active session 的 model、mode、availableModels、availableModes，且在同 cwd 下继承 availableCommands，见 [app/src/store/agentStore.ts](app/src/store/agentStore.ts#L1941)。
  - 当前 session 若没有自己的 provider runtime，会在同 provider、同 cwd 条件下复用别的 session 已初始化 runtime，见 [app/src/store/agentStore.ts](app/src/store/agentStore.ts#L429)。
  - 两者叠加后，新 session 既先继承旧缓存，又在真正请求 runtime 时挂回旧 provider 进程，于是继续吃旧配置。
- OpenCode 上游源码结论:
  - InstanceStore 以 directory 为缓存 key，不以 session id 为 key，说明多个 session 共享同一目录级 instance，见 [ref-repos/opencode-1.14.33/packages/opencode/src/project/instance-store.ts](ref-repos/opencode-1.14.33/packages/opencode/src/project/instance-store.ts)。
  - HTTP API 先路由到 directory，再由 instance context middleware 注入对应 instance，见 [ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts](ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts#L165) 与 [ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/middleware/instance-context.ts](ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/middleware/instance-context.ts#L28)。
  - Config.Service 的 get 返回的是 instance state 中缓存的配置快照，而不是每次直接回磁盘读取，见 [ref-repos/opencode-1.14.33/packages/opencode/src/config/config.ts](ref-repos/opencode-1.14.33/packages/opencode/src/config/config.ts#L715)。
  - Skill、Agent、Command 均依赖 instance state 或以 instance 生命周期初始化，因此新增 skill、agent、command 默认不会被当前 instance 自动感知，见 [ref-repos/opencode-1.14.33/packages/opencode/src/skill/index.ts](ref-repos/opencode-1.14.33/packages/opencode/src/skill/index.ts#L220)、[ref-repos/opencode-1.14.33/packages/opencode/src/agent/agent.ts](ref-repos/opencode-1.14.33/packages/opencode/src/agent/agent.ts#L74)、[ref-repos/opencode-1.14.33/packages/opencode/src/command/index.ts](ref-repos/opencode-1.14.33/packages/opencode/src/command/index.ts#L74)。
  - System prompt 每轮虽然会重新拼装 available skills，但来源仍是 Skill.Service 的 instance 缓存，因此 instance 不重建时，新 skill 仍不可见，见 [ref-repos/opencode-1.14.33/packages/opencode/src/session/system.ts](ref-repos/opencode-1.14.33/packages/opencode/src/session/system.ts#L68)。
  - OpenCode 自身提供通过 API 更新配置后处置 instance 的机制，而不是通用外部文件热感知，见 [ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/handlers/config.ts](ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/handlers/config.ts#L20) 与 [ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/lifecycle.ts](ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/lifecycle.ts#L23)。
- 当前讨论形成的中间结论:
  - 新 session 不应天然等于新 provider。
  - 旧 session 不应被新建 session 粗暴打断。
  - 旧 session 也不应永久困在旧配置视图中。
  - 真正需要设计的是配置变更感知与安全刷新时机，而不是简单地在每次 prompt 前后强制重启。

## 6. 最佳实践与注意事项 (Best Practices & Considerations)
- 使用建议:
  - 在外层宿主中，不要把“新建 session”误当成“天然重建运行时”。
  - 对 skills、agents、commands 这类能力视图，要明确它们是运行时快照还是实时数据。
  - 在需要兼顾不中断与新配置生效时，应区分执行态连续性和配置态可见性。
- 常见陷阱:
  - 只修 UI 层缓存，而不处理 runtime 绑定逻辑，问题会继续存在。
  - 只修新 session 首次绑定，却不考虑旧 session 最终如何升级到新配置视图，会导致语义不完整。
  - 设计成每次 prompt 都重启 provider，会破坏单 session 的执行稳定性。
- 性能考虑:
  - 全量禁用复用会增加 provider/runtime 数量，带来更高资源占用。
  - 目录级 runtime 若频繁销毁重建，会影响技能发现、命令发现与整体响应延迟。
- 安全注意:
  - 刷新策略若不区分运行中与空闲态，可能打断进行中的任务。
  - 若未来引入配置版本判定，必须明确哪些配置资产变化会触发刷新，避免误判导致频繁扰动。

## 7. 相关资源 (Related Resources)
- 代码位置:
  - [app/src/store/agentStore.ts](app/src/store/agentStore.ts#L429)
  - [app/src/store/agentStore.ts](app/src/store/agentStore.ts#L1941)
  - [ref-repos/opencode-1.14.33/packages/opencode/src/project/instance-store.ts](ref-repos/opencode-1.14.33/packages/opencode/src/project/instance-store.ts)
  - [ref-repos/opencode-1.14.33/packages/opencode/src/config/config.ts](ref-repos/opencode-1.14.33/packages/opencode/src/config/config.ts#L715)
  - [ref-repos/opencode-1.14.33/packages/opencode/src/config/config.ts](ref-repos/opencode-1.14.33/packages/opencode/src/config/config.ts#L733)
  - [ref-repos/opencode-1.14.33/packages/opencode/src/skill/index.ts](ref-repos/opencode-1.14.33/packages/opencode/src/skill/index.ts#L220)
  - [ref-repos/opencode-1.14.33/packages/opencode/src/agent/agent.ts](ref-repos/opencode-1.14.33/packages/opencode/src/agent/agent.ts#L74)
  - [ref-repos/opencode-1.14.33/packages/opencode/src/command/index.ts](ref-repos/opencode-1.14.33/packages/opencode/src/command/index.ts#L74)
  - [ref-repos/opencode-1.14.33/packages/opencode/src/session/system.ts](ref-repos/opencode-1.14.33/packages/opencode/src/session/system.ts#L68)
  - [ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/middleware/instance-context.ts](ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/middleware/instance-context.ts#L28)
  - [ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts](ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts#L165)
  - [ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/handlers/config.ts](ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/handlers/config.ts#L20)
  - [ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/lifecycle.ts](ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/lifecycle.ts#L23)
- 依赖项:
  - OpenCode 本体的 Effect/InstanceState/InstanceStore 模型。
  - MLFB 自身的 OpenCode HTTP runtime 管理实现。
- 参考材料:
  - 本轮关于 Copilot 到 OpenCode 配置迁移的会话分析。
  - 工作区内既有规划文档 [.myLastChat/MLC_Copilot到OpenCode迁移规格书.md](.myLastChat/MLC_Copilot到OpenCode迁移规格书.md) 的迁移背景。

## 8. 待办与改进 (TODOs & Improvements)
- 待完成:
  - 尚未确定 MLFB 的正式刷新策略。
  - 尚未决定未来是按 session、按目录，还是按配置版本戳来处理 provider/runtime 更新。
- 已知问题:
  - 当前 MLFB 中，新增配置资产后，新 session 可能继续吃旧 runtime。
  - 当前讨论已确认这不只是 skill 问题，而是 agents、commands、skills 等整套配置生命周期问题。
- 优化方向:
  - 设计目录级配置变更判定规则。
  - 区分运行中 session 与空闲 session 的刷新时机。
  - 若未来需要贴近用户直觉，可考虑在 MLFB 外层单独维护可刷新能力视图，而不直接把 provider 执行态与配置态绑定死。