---
title: Copilot到OpenCode迁移规格书
description: 用户级 prompts 与 MCP 到 OpenCode 的迁移规格、低风险对象与兼容策略
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - copilot
    - opencode
    - migration
    - mcp
    - agent
solved_lists:
    - 完成 Copilot 用户级 prompts 资产盘点
    - 完成 Copilot 用户级 mcp.json 结构分析
    - 明确 OpenCode 的 agents、commands、instructions、mcp 承载面
    - 制定迁移阶段与优先级
---

# Copilot到OpenCode迁移规格书

## 1. 目标定义

本规格书针对当前用户级 Copilot 自定义资产，规划迁移到 OpenCode 的可执行路径。

这次迁移的目标不是简单改后缀，而是同时满足三件事：

- 结构上落到 OpenCode 的原生承载面
- 行为上尽量保持与现有 Copilot 配置一致
- 明确不能无损迁移的语义差异，并在目标侧建立替代方案

本轮优先处理三条主线：

- 迁移规格固化
- 低风险对象优先迁移
- MCP 兼容策略设计

## 2. 源资产清单

### 2.1 用户级 prompts

当前已识别的 prompts 目录资产分为三类：

#### 全局 instructions

- interactive_feedback.instructions.md
- microsoft_doc.instructions.md
- mylastchat-guide.instructions.md

这些文件的共同特征是全局生效，且 applyTo 均为全局匹配。

#### prompt 模板

- cmd_interactive_feedback.prompt.md
- compact.prompt.md
- knowledge_maker.prompt.md

这些文件本质上是用户触发型任务模板，而不是独立 agent。

#### custom agents

- mlra-ceo.agent.md
- mlra-expert.agent.md
- mlra-inspector.agent.md
- test-echo.agent.md

其中 test-echo 属于简单 agent，MLRA 三角色属于复杂工作流 agent。

### 2.2 用户级 MCP

当前 mcp.json 中已识别 8 个 server：

- my-last-feedback
- my-long-running-agent-expert
- my-long-running-agent-inspector
- my-long-running-agent-ceo
- firecrawl/firecrawl-mcp-server
- microsoftdocs/mcp
- pencil
- tavily

同时存在一套 VS Code 专有输入定义：

- inputs.api_key 通过 promptString 注入 Firecrawl 环境变量

## 3. OpenCode 目标承载面

基于 OpenCode 现有实现，迁移目标统一收敛到四个承载面：

- agents
- commands
- instructions
- mcp

OpenCode 侧依据：

- agent markdown 文件由 config/agent.ts 加载，正文即 prompt
- command markdown 文件由 config/command.ts 加载，正文即 template
- instruction 通过 AGENTS.md 与 config.instructions 组合注入
- MCP 由 local 与 remote 两种 schema 承载

## 4. 迁移映射规则

### 4.1 Copilot instructions -> OpenCode instructions

当前这批 instructions 不依赖复杂 applyTo 语义，因此采用以下映射：

- 全局规范类内容优先合并进入 OpenCode 的 AGENTS.md
- 需要单独维护的长文档，作为独立 instruction 文件，并通过 config.instructions 引入

本批 instructions 的处理建议：

- interactive feedback 规则：保留为独立 instruction，避免和项目工程规范混在一起
- microsoft doc 规则：保留为独立 instruction，便于以后按需开关
- mylastchat 规则：保留为独立 instruction，避免污染通用编码规则

### 4.2 Copilot prompt -> OpenCode command

prompt 文件统一映射到 OpenCode commands。

字段映射规则：

- name -> command 名称
- description -> description
- agent -> agent
- model -> model
- 正文 -> template

对于当前三份 prompt：

- cmd_interactive_feedback.prompt.md -> command
- compact.prompt.md -> command
- knowledge_maker.prompt.md -> command

这三类对象属于低风险对象。

### 4.3 Copilot agent -> OpenCode agent

Copilot agent 文件统一映射到 OpenCode agents。

字段映射原则：

- name -> agent 标识
- description -> description
- 正文 -> prompt
- 工具控制 -> 重写为 OpenCode permission 或兼容层

风险分层：

- test-echo.agent.md：低风险，可直接映射为简单 agent
- MLRA 三角色：高风险，必须做语义重建

### 4.4 Copilot mcp.json -> OpenCode mcp

顶层结构映射：

- servers.<name> -> mcp.<name>
- stdio -> local
- http -> remote

字段映射：

- command + args -> local.command 数组
- env -> local.environment
- timeout -> timeout
- url -> remote.url

不会直接保留的字段：

- gallery
- version
- inputs

这些字段不是 OpenCode 当前 MCP schema 的同构字段。

## 5. 低风险对象优先级

### 5.1 第一批直接处理对象

优先顺序如下：

1. 三个 prompt 模板
2. test-echo agent
3. MCP 的基础 transport 结构
4. Firecrawl MCP 的占位凭证版草案
5. 三个全局 instructions

这批对象的共性是：

- 承载面清晰
- 依赖链短
- 可以先完成结构型迁移
- 后续只需要小范围校正

### 5.2 第一批不做的对象

以下对象不进入第一批直接迁移：

- mlra-ceo.agent.md
- mlra-expert.agent.md
- mlra-inspector.agent.md
- pencil 的 VS Code 语义参数

这些都属于“结构可迁，但行为不可直接复用”的对象。

## 6. MCP 兼容策略

### 6.1 总体原则

MCP 迁移按三层兼容处理：

- transport 兼容
- credentials 兼容
- naming/runtime 兼容

### 6.2 transport 兼容

这层处理最简单，只做声明层转换：

- Node stdio server -> local.command
- 本地 exe server -> local.command
- 远程 HTTP server -> remote.url

这一层不解决语义问题，只保证 OpenCode 能声明并尝试连接。

### 6.3 credentials 兼容

这是当前 MCP 迁移中最大的非同构点。

现状：

- Copilot 使用 VS Code inputs.promptString
- Firecrawl 依赖 ${input:api_key} 注入 env

问题：

- OpenCode 当前 MCP schema 不提供 VS Code 风格 inputs 机制

因此本项目的兼容策略固定为：

- 不迁移 VS Code inputs 语法
- 统一改写为 OpenCode 可承载的静态配置方式
- 凭证来源改为 environment、headers 或 OAuth

优先建议：

- 本地 server 用 environment
- 远程 server 优先 headers
- 已支持 OAuth 的 remote server 优先 OAuth

### 6.4 naming/runtime 兼容

MCP 真正影响 prompt 和 agent 的，不是 transport，而是命名和运行时假设。

需要单独固定三条策略：

- 尽量保留现有 server 名称，减少 prompt 文本重写量
- 对 VS Code 专有语义参数做显式替换，不做隐式继承
- 对 prompt 中写死的工具命名做统一兼容表

### 6.5 当前 server 风险评估

#### 低风险

- my-last-feedback
- my-long-running-agent-expert
- my-long-running-agent-inspector
- my-long-running-agent-ceo
- microsoftdocs/mcp
- tavily

原因是 transport 结构清晰，可直接映射为 local 或 remote。

#### 中风险

- firecrawl/firecrawl-mcp-server

原因是虽然已经可迁为占位凭证版草案，但最终凭证注入策略仍需落地确认。

#### 高风险

- pencil

原因是其参数显式绑定 visual_studio_code，迁移后是否仍成立需要单独验证。

## 7. 复杂 agent 语义重建规则

MLRA 三角色不进入低风险批次，必须单独做语义重建。

重建时必须逐项确认：

- 角色身份 prompt 是否可原样保留
- tools 数组如何改写为 OpenCode permission
- search、execute、web 等工具类别如何映射到 OpenCode 实际工具
- MCP 命名是否与迁移后的 server 名称一致
- 角色是否应定义为 primary 还是 subagent

当前默认原则：

- 先保留角色 prompt 主体
- 再重写工具与权限层
- 最后才调优 agent mode 与默认模型

## 8. 执行顺序

### 阶段一：规格冻结

交付物：

- 本规格书
- 字段映射规则
- 风险分层

### 阶段二：低风险对象迁移

交付物：

- OpenCode commands 初稿
- 简单 agent 初稿
- MCP 基础配置初稿
- instructions 组织方案

### 阶段三：MCP 兼容细化

交付物：

- credentials 策略
- naming/runtime 兼容表
- 高风险 server 处理原则

### 阶段四：复杂 agent 重建

交付物：

- MLRA 三角色的 OpenCode 版定义
- 工具映射表
- 权限重写结果

### 阶段五：行为验证

交付物：

- prompt 级场景验证
- agent 级场景验证
- MCP 连接与调用验证

### 阶段六：沉淀 skill

交付物：

- 迁移流程 skill
- 可复用映射规则
- 后续增量迁移说明

## 9. 验收标准

迁移完成不能只看文件是否生成，必须满足以下标准：

- 所有低风险对象已经在 OpenCode 找到对应承载面
- 所有 MCP server 已完成 transport 级迁移
- 所有非同构字段已有明确替代策略
- MLRA 三角色已完成工具语义与权限语义重建
- 至少每类对象有一个行为验证场景通过

## 10. 当前结论

这次迁移不是“能不能迁”的问题，而是“哪些可以先机械迁，哪些必须后置做语义重建”的问题。

当前最优策略已经固定：

- 先完成低风险对象和 MCP 基础兼容
- 再进入复杂 agent 重建
- 最后做行为等价验证与 skill 沉淀

后续所有实际文件转换，都应以本规格书为准，避免边迁边改目标结构。