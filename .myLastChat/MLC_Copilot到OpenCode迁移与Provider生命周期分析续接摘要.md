---
title: Copilot到OpenCode迁移与Provider生命周期分析续接摘要
description: 汇总本轮 Copilot 配置迁移、skills 接入与 provider 生命周期分析进展
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
solved_lists:
  - 完成 Copilot 用户级 MCP 向真实 OpenCode 配置迁移
  - 完成 instructions、commands、agents 的真实 OpenCode 迁移
  - 修复 MLFB OpenCode commands 与 agent modes 刷新链路问题
  - 完成 mode/model 面板样式与定位收口
  - 完成用户 skill 路径接入与 create-skill 镜像迁移
  - 完成 OpenCode 目录级 instance 与配置刷新语义源码分析
  - 新建 OpenCode实例配置刷新与Session生命周期知识文档
  - 完成一次排除 ref-repos 的 git 备份提交
---

# Copilot到OpenCode迁移与Provider生命周期分析续接摘要

## 1. Previous Conversation

本轮对话最初围绕一个较大的迁移问题展开：分析 OpenCode CLI 各类配置文件格式与 Copilot VS Code 插件的 prompts、MCP、agent、skill 等配置面，评估是否可以实现较快的双向或单向迁移。用户随后快速收敛目标，不再要求一个复杂的通用迁移器，而是要求优先把真实本机环境中的 Copilot 配置迁到 OpenCode，并沉淀可复用的 skill 或知识材料。

迁移过程从真实用户级路径开始，而不是停留在草案层。用户明确给出了 Copilot prompts 路径与 mcp.json 路径，并先要求分析，再逐步要求真实接入。之后先后完成了 MCP、instructions、commands、agents 的迁移；再往后发现还有 skills 未迁，于是转入 OpenCode skill 发现机制与 VS Code/Copilot skill 资产的分析。

在 skill 迁移阶段，用户选择的策略是：

- 用户 skill 采用路径接入，直接通过 OpenCode 的 skills.paths 指向用户目录。
- 内置 skill 采用镜像迁移，但只先迁 create-skill，并改造成适合 OpenCode/MLFB 的版本。

随后用户在实际测试中发现：即使 skill 文件与配置已经迁入，新 session 里仍然看不到新增 skill。问题进一步从“某个 skill 是否迁成功”上升为“provider runtime 生命周期与配置刷新边界是什么”。

对话后半段的核心从迁移本身转向运行时语义分析，重点讨论了：

- 为什么新 session 仍然会吃到旧配置。
- 是否应该每次发送 prompt 时针对 session 刷新 provider。
- 为什么“旧 session 永远看不到新 skill”这种结果在产品语义上不可接受。
- OpenCode desktop 上游本体到底是按 session 还是按目录维护 instance 与配置快照。

在完成这轮分析后，用户明确表示当前暂时不继续推进完善修复方案，而是要求先生成一份知识文档完整记录此次讨论，并在此基础上生成 compact 续接摘要。

## 2. Current Work

在收到本次 compact 请求之前，最近完成的工作有两件：

第一，已经根据本轮对话的新结论新建了一份单主题知识文档，文件为 [.myLastChat/MLC_K_OpenCode实例配置刷新与Session生命周期.md](.myLastChat/MLC_K_OpenCode实例配置刷新与Session生命周期.md)。这份文档专门记录 OpenCode 的目录级 instance、配置快照、skills/agents/commands 生命周期，以及 MLFB 当前为什么会在新 session 中继续复用旧 runtime。

第二，按系统提醒执行了一次完整工作区 git 备份，排除了 ref-repos，提交哈希为 0b96590，提交信息为 Backup OpenCode lifecycle analysis and knowledge notes。本次提交除了新知识文档外，还纳入了工作区中已有的四个测试 markdown 删除状态。

在知识分析层面，当前最近的停留点是：

- 已确认 MLFB 当前的两个直接根因都在 [app/src/store/agentStore.ts](app/src/store/agentStore.ts#L429) 与 [app/src/store/agentStore.ts](app/src/store/agentStore.ts#L1941)。
- 已确认 OpenCode 上游本体本来就是目录级 instance，而不是每个 session 一个独立实例。
- 已确认 OpenCode 本体没有表现出针对外部直接改配置文件的通用自动热感知机制。
- 用户已决定“暂时先不管这个问题”，先做知识沉淀。

## 3. Key Technical Concepts

- Copilot 用户级 prompts、mcp.json 与 OpenCode 用户级配置的真实迁移。
- OpenCode 支持的配置承载面：mcp、instructions、commands、agents、skills。
- OpenCode skills.paths 用于用户 skill 路径接入。
- OpenCode 的 skill 发现机制同时兼容 .claude、.agents 与配置目录 skills。
- MLFB 中 OpenCode HTTP runtime 的 session 级状态管理。
- 同 cwd runtime 复用导致的新 session 继续吃旧配置问题。
- 新 session 继承旧 availableModes、availableModels、availableCommands 的缓存问题。
- “执行态连续性”与“配置态可见性”的区分。
- OpenCode 上游的目录级 instance 语义。
- Config.Service、Skill.Service、Agent.Service、Command.Service 的 instance 级缓存性质。
- 通过 API 更新配置后处置 instance，与“外部直接改文件不会自动热感知”的差别。
- MLFB 外层若要改善体验，需要补充配置变更感知与安全刷新策略，而不是简单每次 prompt 都重启 provider。

## 4. Relevant Files and Code

### [app/src/store/agentStore.ts](app/src/store/agentStore.ts)

- 这是 MLFB 中 OpenCode session、provider runtime、commands、modes 刷新逻辑的核心文件。
- 已确认两个关键控制点：
  - [app/src/store/agentStore.ts](app/src/store/agentStore.ts#L429) 的 openCodeHttpRuntimeForSession 会在 session 没有自己 runtime 时，按 provider 与 cwd 复用别的 session 的旧 runtime。
  - [app/src/store/agentStore.ts](app/src/store/agentStore.ts#L1941) 的 createNewSession 会继承 active session 的 mode、model 与部分 command 缓存。
- 这两个行为叠加，导致“新 session 继续吃旧配置”。

示意片段：

```ts
新 session 先继承 availableModes / availableCommands
随后真正需要 runtime 时，又被挂回同 cwd 的旧 runtime
```

### [app/src/components/agent/AgentComposer.tsx](app/src/components/agent/AgentComposer.tsx)

- 这是前面多轮 UI 收口的核心组件。
- 本轮对话前半段已在这里完成 mode/model 面板 portal 化、hover detail、宽度自适应、位置冻结等优化。
- 最近用户已确认模式面板位移问题消失，当前不再是焦点。

### [app/src/index.css](app/src/index.css)

- 收口了 agent select 按钮尺寸、权重、面板样式等表现。
- 当前与本轮生命周期分析没有新的直接编辑，但它是此前 UI 收尾的重要背景文件。

### [ref-repos/opencode-1.14.33/packages/opencode/src/project/instance-store.ts](ref-repos/opencode-1.14.33/packages/opencode/src/project/instance-store.ts)

- 本轮后半段最关键的上游源码证据。
- 已确认 OpenCode 的 instance cache key 是 directory，而不是 session id。
- 说明同一目录下多个 session 默认运行在同一个目录级 instance 内。

### [ref-repos/opencode-1.14.33/packages/opencode/src/config/config.ts](ref-repos/opencode-1.14.33/packages/opencode/src/config/config.ts)

- 已确认 Config.Service 的 get 取的是 instance state 中缓存的配置快照，关键位置见 [ref-repos/opencode-1.14.33/packages/opencode/src/config/config.ts](ref-repos/opencode-1.14.33/packages/opencode/src/config/config.ts#L715)。
- 已确认 update 与 updateGlobal 会通过 dispose 当前 instance 或 dispose 全部 instances 来刷新配置，关键位置见 [ref-repos/opencode-1.14.33/packages/opencode/src/config/config.ts](ref-repos/opencode-1.14.33/packages/opencode/src/config/config.ts#L733)。

### [ref-repos/opencode-1.14.33/packages/opencode/src/skill/index.ts](ref-repos/opencode-1.14.33/packages/opencode/src/skill/index.ts)

- 已确认 skill discovery 与 loadSkills 建立在 InstanceState.make 上。
- 说明 skill 视图是 instance 级缓存，不会因为每次 prompt 自动重扫磁盘。

### [ref-repos/opencode-1.14.33/packages/opencode/src/agent/agent.ts](ref-repos/opencode-1.14.33/packages/opencode/src/agent/agent.ts)

- 已确认 agents 也是 instance state。
- 说明 agent 可见性与默认 agent 选择同样受 instance 生命周期影响。

### [ref-repos/opencode-1.14.33/packages/opencode/src/command/index.ts](ref-repos/opencode-1.14.33/packages/opencode/src/command/index.ts)

- commands 初始化会读取 config、mcp、skill 等依赖。
- 因此 commands 同样不是“纯每次现算”，也会受 instance 生命周期影响。

### [ref-repos/opencode-1.14.33/packages/opencode/src/session/system.ts](ref-repos/opencode-1.14.33/packages/opencode/src/session/system.ts)

- system prompt 每轮都会调用 skill.available(agent)，但这个 available 来源仍然是 Skill.Service 的 instance 缓存。
- 这解释了为什么看似“每轮会重新拿技能列表”，但新 skill 在旧 instance 中仍不可见。

### [ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts](ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts)

- 已确认 HTTP API 会先路由到 directory 或 workspace，再决定本地 instance 或远端目标。

### [ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/middleware/instance-context.ts](ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/middleware/instance-context.ts)

- 已确认 instance context 注入是用 route.directory 去调用 InstanceStore.provide。

### [ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/handlers/config.ts](ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/handlers/config.ts)

- 已确认通过 API 更新 instance 级 config 后，会 mark 当前 instance for disposal。

### [ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/lifecycle.ts](ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/httpapi/lifecycle.ts)

- 已确认 instance dispose 发生在响应之后，而不是在当前请求处理中途直接拆掉。
- 这体现了 OpenCode 对“安全刷新时机”的保守处理。

### [.myLastChat/MLC_K_OpenCode实例配置刷新与Session生命周期.md](.myLastChat/MLC_K_OpenCode实例配置刷新与Session生命周期.md)

- 这是本轮新建的知识文档。
- 用于沉淀本轮关于 OpenCode instance、配置刷新与 session 生命周期的核心分析结果。

## 5. Problem Solving

前半段已解决的问题：

- 迁移不再停留在规格书层，而是已经落到真实 OpenCode 用户配置目录。
- MCP、instructions、commands、agents 已完成真实迁移。
- MLFB 中 slash commands 刷新空缓存、modes 刷新、agent 列表前置 build/plan、面板 hover detail、定位抖动等问题已被逐步修复并收口。
- 用户级 skills 已通过 OpenCode 的 skills.paths 接入，create-skill 也已镜像迁移并改造。

后半段完成的分析型问题解决：

- 已确认“新 session 仍然是旧配置”不是单个 skill 文件损坏，而是 runtime 复用语义所致。
- 已确认当前 MLFB 中的症结是：
  - 新 session 先继承旧缓存。
  - 真正请求 runtime 时又复用同 cwd 的旧 runtime。
- 已确认如果只做“新 session 首次绑定新 provider”而不考虑旧 session 最终如何看到新 skill，那么产品语义仍不完整。
- 已通过阅读 OpenCode desktop 源码确认，上游本体本来就是目录级 instance，skills/agents/commands/config 多数都是 instance 级快照，而不是天然实时热更新。
- 已进一步确认 OpenCode 上游通过 API 更新配置时会显式 dispose instance，但没有明显体现出对“外部直接改文件”的自动热感知。

因此，本轮最终没有给出一个强行实现的修复，而是得出一个更严谨的中间结论：

- 这个问题不是简单的 session UI 刷新问题。
- 它本质上是“目录级 instance 的配置失效与安全重建策略”问题。
- 当前先暂停修复实现，优先沉淀知识与上下文。

## 6. Pending Tasks and Next Steps

- 当前没有被用户要求立即继续实现的代码修复任务。
- 最近用户已经明确暂停该修复方向，原话是：
  - “好吧，我明白了，我们暂时先不管这个问题了，感觉目前很难给一个完善的修复方案。不过，请你帮忙生成一个文档来完整记录我们的分析和关于此事的讨论结果 /knowledge-gen”
- 在该要求之后，已完成的动作是：
  - 新建知识文档 [.myLastChat/MLC_K_OpenCode实例配置刷新与Session生命周期.md](.myLastChat/MLC_K_OpenCode实例配置刷新与Session生命周期.md)
  - 完成 git 备份提交 0b96590

- 如果未来继续推进，本轮上下文最自然的下一步会是：
  - 继续设计 MLFB 的配置变更感知规则。
  - 区分运行中 session 与空闲 session 的刷新时机。
  - 评估是否要把“能力视图刷新”与“执行态 provider”解耦。

- 若要恢复这个主题，最值得直接接续的问题是：
  - 如何定义目录级配置变更。
  - 新 session 如何立即看到新配置。
  - 旧运行中 session 如何不被打断。
  - 旧空闲 session 如何在下次使用时升级到新配置视图。

- 本次 compact 请求本身来自用户的最新指令，原话是：
  - “/compact”