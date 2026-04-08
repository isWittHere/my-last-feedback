---
title: "MLRA CLI 自动化方案规划"
description: "基于 ACP+MCP 混合架构的 Copilot CLI 自动化操作完整方案"
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - MLRA
    - ACP
    - MCP
    - CLI-automation
    - process-management
    - Rust
    - ARCHIVED
---

# ⚠️ ARCHIVED — 此方案已被 VS Code Copilot 方案替代

> **归档说明**: 此文档记录的 CLI + ACP 自动化方案已不再作为 MLRA 的实施路径。  
> 当前活跃方案请参见 [`MLC_MLRA_VSCode自动化方案规划.md`](MLC_MLRA_VSCode自动化方案规划.md)。  
> 本文档保留作为历史参考（PoC 验证结果、ACP API 分析等仍有参考价值）。  
> 归档日期: 2026-04-10

---

# MLRA CLI 自动化方案规划

> 版本: v0.3-draft | 日期: 2026-04-09 (Custom Agents 分析 + ACP PoC 1-6 验证结论 + 多进程架构确定)

---

## 1. 概述

### 1.1 目标

实现 MLRA 编排器对 Copilot CLI 的完全编程化控制，使编排器能够：

- **创建和管理**多个 Agent session（专家/监察/CEO/子 Agent）
- **路由消息**到任意 Agent（伪装为"人类反馈"）
- **接收流式输出**（Agent 的实时生成内容）
- **控制工具审批**（自动批准/拒绝特定工具调用）
- **注入 MCP 工具**（submit/order/check_orders 等通信协议）
- **管理进程生命周期**（启动/停止/健康检查/故障恢复）

### 1.2 方案选择

经过对 Copilot CLI 官方文档、oh-my-openagent 参考实现的全面调研，确定采用 **ACP + MCP 双层混合架构**。

| 层 | 职责 | 技术 |
|---|------|------|
| **ACP 层** | 进程控制、session 管理、消息路由、流式输出 | `copilot --acp --stdio` + `@agentclientprotocol/sdk` |
| **MCP 层** | Agent 结构化通信（submit/order/vote） | `--additional-mcp-config` 或 `newSession({ mcpServers })` |
| **Tauri IPC 层** | 前端 UI 更新、人类干预通道 | 现有 MLFB IPC 基础设施 |

### 1.3 方案评估摘要

| 方案 | 可行性 | 主要优势 | 主要劣势 |
|------|--------|---------|---------|
| A: 子进程 + MCP 注入 | ★★★★☆ | CLI 原生参数、简单直接 | 无法主动向 Agent 注入消息 |
| **B: ACP 协议（核心）** | ★★★★★ | 完全编程控制、官方 SDK | Preview 阶段，接口可能变动 |
| C: Tmux 多 Pane | ★★☆☆☆ | 已被 oh-my-openagent 验证 | Windows 不支持 tmux |
| D: 纯 HTTP API | ★☆☆☆☆ | 最灵活 | Copilot CLI 不暴露 HTTP API |
| **A+B 混合（采用）** | ★★★★★ | ACP 管主通道 + MCP 管结构化通信 | 复杂度稍高 |

---

## 2. Copilot CLI 能力清单

### 2.1 CLI 参数（来源：`copilot --help` + 官方文档）

#### 运行模式

| 参数 | 说明 | MLRA 用途 |
|------|------|----------|
| `-p / --prompt <text>` | 非交互模式，执行单次 prompt 后退出 | 子进程 fallback 方案 |
| `-i / --interactive <prompt>` | 交互模式 + 初始 prompt | 不使用 |
| `--acp` | 启动 ACP 服务器 | **核心：编排器主通道** |
| `--acp --stdio` | ACP stdio 传输 | 推荐集成模式 |
| `--acp --port N` | ACP TCP 传输 | 备选：远程/多进程场景 |
| `--autopilot` | 非交互模式自动续航 | 子进程 fallback |
| `--max-autopilot-continues N` | 续航次数上限 | 子进程 fallback |

#### 模型控制

| 参数 | 说明 | MLRA 用途 |
|------|------|----------|
| `--model <name>` | 指定模型 | 每 Agent 不同模型 |
| `--effort / --reasoning-effort <level>` | 推理等级（low/medium/high/xhigh） | 角色差异化配置 |
| `COPILOT_PROVIDER_BASE_URL` | 自定义模型提供商 | BYOK 场景 |
| `COPILOT_PROVIDER_TYPE` | 提供商类型（openai/azure/anthropic） | BYOK 场景 |
| `COPILOT_MODEL` | 环境变量指定模型 | 进程级模型配置 |

#### 工具控制

| 参数 | 说明 | MLRA 用途 |
|------|------|----------|
| `--allow-all-tools` / `--allow-all` / `--yolo` | 全自动批准 | Agent 非交互运行 |
| `--allow-tool=<spec>` | 允许特定工具 | 精细控制 |
| `--deny-tool=<spec>` | 禁止特定工具 | 安全限制（如禁 git push） |
| `--available-tools=<list>` | 仅限特定工具可用 | 限制 Agent 能力范围 |

#### MCP 配置

| 参数 | 说明 | MLRA 用途 |
|------|------|----------|
| `--additional-mcp-config <json/path>` | 注入额外 MCP server | 注入 MLRA 通信工具 |
| `~/.copilot/mcp-config.json` | 全局 MCP 配置 | 不修改，避免影响正常使用 |

#### Session 管理

| 参数 | 说明 | MLRA 用途 |
|------|------|----------|
| `--resume=<sessionId>` | 恢复指定 session | 断点续传 |
| `--continue` | 恢复最近 session | 不使用 |
| `--agent <name>` | 使用自定义 agent（作为 subagent 委托） | 见 §2.3 Custom Agents 分析 |

#### 自定义指令

| 方式 | 说明 | MLRA 用途 |
|------|------|----------|
| `.github/copilot-instructions.md` | 仓库级指令 | 所有 Agent 共享的基础规则 |
| `AGENTS.md` | Agent 指令 | 角色系统提示词 |
| `.github/instructions/*.instructions.md` | 路径特定指令 | 文件类型特定规则 |
| `$HOME/.copilot/copilot-instructions.md` | 用户级指令 | MLRA 全局注入 |

#### 进程级配置（v0.3 新增）

| 参数 | 说明 | MLRA 用途 |
|------|------|----------|
| `--config-dir <dir>` | 指定配置目录（含 copilot-instructions.md） | **多进程架构核心：每角色独立 system prompt** |
| `--no-custom-instructions` | 禁用 AGENTS.md / copilot-instructions.md 加载 | 干净启动，仅使用 --config-dir 的指令 |
| `--no-ask-user` | 禁用向用户确认 | 完全自主运行 |
| `--output-format json` | JSON 输出格式 | 结构化输出解析 |

### 2.2 ACP 协议能力（来源：官方文档 + SDK）

#### 核心 API

```typescript
// 初始化连接
await connection.initialize({
  protocolVersion: acp.PROTOCOL_VERSION,
  clientCapabilities: {}
});

// 创建新 session
const session = await connection.newSession({
  cwd: string,           // 工作目录
  mcpServers: [],        // MCP server 配置
});

// 向 session 发送 prompt
const result = await connection.prompt({
  sessionId: string,
  prompt: [{ type: "text", text: string }],
});

// 接收流式更新（通过 client callback）
client.sessionUpdate(params) {
  // params.update.sessionUpdate === "agent_message_chunk"
  // params.update.content.type === "text"
  // params.update.content.text — 增量文本
}

// 工具权限控制（通过 client callback）
client.requestPermission(params) {
  // 返回 { outcome: { outcome: "approved" } } 或 "cancelled"
}
```

#### 待验证的 API 能力 → PoC 验证结论（v0.3 更新）

| 能力 | 结论 | 验证详情 |
|------|------|---------|
| 单进程多 session | ✅ 支持 | PoC Test 2: 同一进程创建多个独立 session，消息隔离完美 |
| Per-session 模型 | ✅ 支持（UNSTABLE API） | `connection.unstable_setSessionModel({sessionId, modelId})` 验证通过。Expert=gpt-5.4-mini, Inspector=gpt-5.4 同时运行 |
| Per-session 模式 | ✅ 支持 | `connection.setSessionMode({sessionId, modeId})` — agent/plan/autopilot 三种模式 |
| Per-session 推理等级 | ✅ 支持 | `connection.setSessionConfigOption({sessionId, configId:"reasoning_effort", value})` — low/medium/high/xhigh |
| Session 恢复 | ⏳ 待验证 | `loadSession` API 存在于 SDK 但未测试 |
| Session 中止/取消 | ⏳ 待验证 | 待查 SDK |
| 自定义 Agent 指定 | ⚠️ 子代理模式 | `--agent` 使 copilot 将自定义 Agent 作为 SUBAGENT 委托执行，详见 §2.3 |
| MCP server per-session | ✅ 已确认 | `newSession({ mcpServers })` 参数注入，PoC Test 3 验证 MCP 工具注入成功 |
| 流式输出完整性 | ✅ 已确认 | sessionUpdate 回调涵盖 agent_message_chunk, tool_call, agent_thought_chunk 等所有事件类型 |

#### Per-Session 配置 API 详情（v0.3 新增）

```typescript
// 1. Per-session 模型切换（UNSTABLE — API 可能变更）
await connection.unstable_setSessionModel({
  sessionId: string,
  modelId: string,  // 必须是 listModels() 返回的有效模型
});

// 2. Per-session 模式切换
await connection.setSessionMode({
  sessionId: string,
  modeId: string,   // "https://agentclientprotocol.com/protocol/session-modes#agent"
                     // "https://agentclientprotocol.com/protocol/session-modes#plan"
                     // "https://agentclientprotocol.com/protocol/session-modes#autopilot"
});

// 3. Per-session 配置选项
await connection.setSessionConfigOption({
  sessionId: string,
  configId: string,  // "mode" | "model" | "reasoning_effort"
  value: string,
});

// 4. 查询可用模型
const models = await connection.listModels({ sessionId });
// 返回 { models: [{ id, name, costMultiplier, isExperimental, ... }] }

// 5. 查询可用模式
const modes = await connection.listSessionModes({ sessionId });
// 返回 { sessionModes: [{ id, name, description }] }

// 6. 查询可用配置选项
const options = await connection.listSessionConfigOptions({ sessionId });
// 返回 { configOptions: [{ id, name, type, options[] }] }
```

#### 可用模型清单（PoC 实测，可能因时间/订阅变化）

| 模型 ID | 名称 | costMultiplier | 说明 |
|---------|------|---------------|------|
| gpt-5.4 | GPT-5.4 | 1x | 默认模型 |
| gpt-5.3-codex | GPT-5.3 Codex | 1x | 代码特化 |
| gpt-5.2-codex | GPT-5.2 Codex | 1x | 代码特化 |
| gpt-5.2 | GPT-5.2 | 1x | |
| gpt-5.1 | GPT-5.1 | 1x | |
| gpt-5.4-mini | GPT-5.4 mini | 0.33x | 低成本选择 |
| gpt-5-mini | GPT-5 mini | 0x | 免费模型 |
| gpt-4.1 | GPT-4.1 | 0x | 免费模型 |

> **注意**：本次测试中 Claude 系列模型（claude-opus-4, claude-sonnet-4.5）未出现在列表中，但早期 PoC 中曾出现。模型可用性可能因 Copilot 实例状态和订阅类型而变化。`gpt-4o` 和 `claude-opus-4` 设置时返回 "Invalid model"。

#### 可用会话模式

| 模式 ID | 名称 | 说明 |
|---------|------|------|
| `...session-modes#agent` | Agent | 默认模式，常规 Agent 交互 |
| `...session-modes#plan` | Plan | 多步骤规划模式，Agent 先生成计划再执行 |
| `...session-modes#autopilot` | Autopilot | 自主模式（实验性），减少确认 |

---

### 2.3 Custom Agents 分析（v0.3 新增）

#### 概述

Copilot CLI 支持通过 `.agent.md` 文件定义自定义 Agent，存储在：
- **项目级**: `.github/agents/<name>.agent.md`
- **用户级**: `~/.copilot/agents/<name>.agent.md`

使用方式：`copilot --agent <name>`

#### .agent.md 格式

```yaml
---
name: my-agent
description: Agent 用途描述
tools:
  - read
  - search
  - shell
model: gpt-4o
mcp-servers:
  - my-server
disable-model-invocation: false
user-invocable: true
infer: false
---

# System Prompt 内容（最多 30K 字符）

这里是 Agent 的身份、规则、行为指引...
```

#### 关键发现：子代理委托模式（Subagent Delegation）

**PoC Test 4 的核心发现**：`--agent` 标志不会让 copilot "变成" 自定义 Agent，而是让 copilot 将自定义 Agent 作为 **SUBAGENT** 委托执行：

```
用户 prompt → 主 Copilot (GPT-5.4) → tool_call 委托 → 自定义 Agent (gpt-4o) → 返回结果
                      ↑                                        ↑
            保持默认模型和上下文              独立上下文窗口，使用 .agent.md 中指定的模型
```

观察到的行为：
1. 主 Copilot 仍以 GPT-5.4 运行（不受 .agent.md 的 `model` 字段影响）
2. 自定义 Agent 在独立上下文窗口中执行，有自己的 tools 和 model
3. 主 Copilot 通过 `tool_call` (kind: "other") 将请求转发给 subagent
4. 主 Copilot 可能重新措辞 prompt 后再转发
5. subagent 的系统提示词确实生效（secret code 被正确返回）

#### 对 MLRA 的适用性评估

| 维度 | 评估 | 原因 |
|------|------|------|
| 独立身份 | ❌ 不适合 | subagent 是临时委托，不是长期运行的独立角色 |
| 长期阻塞 | ❌ 不适合 | subagent 设计为短期任务，不支持 MCP 阻塞交叉 |
| 工具隔离 | ✅ 部分适合 | .agent.md 的 `tools` 字段确实限制了工具集 |
| 模型指定 | ⚠️ 间接 | 通过 `model` 字段指定，但主 copilot 仍用默认模型 |
| 系统提示 | ⚠️ 子上下文 | prompt 在 subagent 上下文中生效，但不影响主 copilot |

**结论**：Custom Agents 的 subagent 委托模式**不适合** MLRA 的长期运行、MCP 阻塞交叉通信架构。MLRA 每个角色需要独立的进程级控制（system prompt、model、tools），应使用 **多进程 + `--config-dir`** 方案代替。

---

## 3. 混合架构设计

### 3.1 架构总览

> v0.3 更新：架构已从"单进程多 session"调整为"多进程 + config-dir"。
> 下图展示最终确定的多进程架构。单进程方案保留为降级 fallback。

```
┌──────────────────────────────────────────────────────────────┐
│                    MLRA 编排器 (Rust / Tauri 后端)             │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │                 ACP 多进程管理器                        │   │
│  │                                                       │   │
│  │  进程 1: copilot --acp --stdio                        │   │
│  │          --config-dir .mlra/config/expert/             │   │
│  │          --model gpt-5.4-mini --no-custom-instructions │   │
│  │  └── Expert session                                   │   │
│  │      copilot-instructions.md = Expert system prompt    │   │
│  │                                                       │   │
│  │  进程 2: copilot --acp --stdio                        │   │
│  │          --config-dir .mlra/config/inspector/          │   │
│  │          --model gpt-5.4 --no-custom-instructions      │   │
│  │  └── Inspector session                                │   │
│  │      copilot-instructions.md = Inspector system prompt │   │
│  │                                                       │   │
│  │  进程 3: copilot --acp --stdio                        │   │
│  │          --config-dir .mlra/config/ceo/                │   │
│  │          --model gpt-5.4 --no-custom-instructions      │   │
│  │  └── CEO session（按需唤醒）                           │   │
│  │                                                       │   │
│  │  进程 4-N: Workers（子进程或 ACP，按任务动态创建）      │   │
│  │                                                       │   │
│  │  功能:                                                │   │
│  │  - 每角色独立进程（TRUE system prompt）                 │   │
│  │  - 每角色独立模型（--model 进程级指定）                  │   │
│  │  - 每角色独立工具集（--available-tools 或 MCP 配置）     │   │
│  │  - 进程启动/停止/重启                                  │   │
│  │  - 进程存活监控 (exit 事件)                             │   │
│  │  - ACP 连接管理                                       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │                  消息路由器                              │   │
│  │                                                       │   │
│  │  Agent submit (MCP tool call)                         │   │
│  │    → 接收结构化数据                                    │   │
│  │    → 路由决策（下一个目标 Agent）                       │   │
│  │    → connection.prompt() 发给目标 session              │   │
│  │    → 同时通过 Tauri IPC 更新前端                       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │                  MCP Server (内嵌)                      │   │
│  │                                                       │   │
│  │  为每个 Agent session 提供通信工具:                     │   │
│  │  - submit: Agent 提交工作结果                          │   │
│  │  - router_vote: 投票机制                              │   │
│  │  - order: 委派子 Agent                                │   │
│  │  - check_orders: 查看子 Agent 状态                    │   │
│  │  - await_order_finish: 等待子 Agent 完成              │   │
│  │  - submit_feedback: 子 Agent 报告完成                 │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │                 Tauri IPC 桥接                          │   │
│  │                                                       │   │
│  │  编排器状态 → 前端 MLRA UI                             │   │
│  │  前端操作 → 编排器控制                                 │   │
│  │  (复用 MLFB 的 IPC 基础设施)                           │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 通信流程详解 — 入参-出参交叉模型（Rendezvous）

MLRA 的核心通信机制是**入参-出参交叉**：Agent A 调用 submit 的入参，经编排器路由后成为 Agent B 的 submit 出参（返回值）。从 B 的角度看，它收到了"人类的反馈"，实际上这是 A 的提交内容。

#### 成本模型

```
ACP prompt() = 初始化用途，每次消耗 1 premium request
MCP 工具调用 = Agent turn 内的工具调用，不消耗额外 premium request
submit 阻塞  = MCP 工具返回值未 resolve，Agent 保持在同一个 turn

→ 每个 Agent 整个生命周期 ≈ 1 premium request
→ N 轮通信循环 = 0 额外成本
```

这正是 MLFB 的核心精妙之处的多 Agent 扩展：**把 Agent 间通信伪装成工具调用的返回值，绕过了额度计费。**

#### 双主 Agent 对峙的完整通信流

```
时间线   Expert                    编排器                Inspector
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
t0  ACP prompt("设计方案")                    ACP prompt("你是监察, 先submit就绪")
    ↓ (1 req)                                  ↓ (1 req)
t1  设计中...                                  submit("就绪") → [BLOCK]
t2  submit("方案v1") → [BLOCK]
t3                          Expert入参"方案v1" 
                            → 成为Inspector出参    → Inspector解除BLOCK
t4                                                 审查中...
t5                                                 submit("3个问题") → [BLOCK]
t6                          Inspector入参"3个问题"
                            → 成为Expert出参
    → Expert解除BLOCK
t7  修改中...
t8  submit("方案v2") → [BLOCK]
t9                          Expert入参"方案v2"
                            → 成为Inspector出参    → Inspector解除BLOCK
...                      (循环N轮，总成本始终 = 2 premium requests)
```

#### 人类介入节点（无需额外工具）

编排器可在任意 submit 节点拦截出参，由人类接管：

```
Agent submit("我的结果") → [BLOCK，等待出参]
                ↓
编排器判定此处需要人类介入（如 CEO 审批节点）
                ↓
编排器将 Agent 入参推送到 MLFB UI
                ↓
人类在 MLFB UI 中审查、编辑回复内容
                ↓
人类的回复 → 成为 Agent 的 submit 出参
                ↓
Agent 解除阻塞，收到"用户的反馈"
```

三种 CEO 模式的实现：
- **auto 模式**：AI CEO 的 submit 入参直接编排为对方的出参，不在此处阻塞
- **manual 模式**：编排器拦截 submit，推送到 MLFB UI，等待人类修改后才返回出参
- **hybrid 模式**：编排器先让 AI CEO 生成初步意见，连同材料一起推送到 MLFB UI，人类可以采纳/修改/覆盖

**不需要任何 request_human 工具 — submit 的阻塞本身就是最完美的人类介入点。**

#### 子 Agent (Worker) 通信流

```
Expert                     编排器               Worker-1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
order("修改登录页面")                        (ACP prompt后 submit_feedback("就绪")→[BLOCK])
→ 立即返回 worker-1
                           order内容 → Worker-1出参   → Worker解除BLOCK
继续其他工作...                                  执行任务中...
check_orders() → 状态表
await_order_finish("w1")                    submit_feedback("完成") → [BLOCK]
→ [BLOCK]                 Worker入参 → Expert出参
→ 解除BLOCK，收到结果                        等待下一个任务...
```

### 3.3 成本对比 & ACP vs 子进程 Fallback 策略

#### 成本模型对比

| 方案 | 每轮通信成本 | N 轮对峙总成本 | 说明 |
|------|------------|--------------|------|
| **ACP prompt() 路由**（错误方案） | 1 premium request | N premium requests | 每次路由都消耗额度，成本灾难 |
| **MCP 阻塞交叉**（正确方案） | 0 | 2 premium requests（Expert+Inspector 各 1） | MLFB 模式的多 Agent 扩展 |

#### 每个 Agent 的理想成本

```
创建 session + 初始 ACP prompt  → 1 premium request
Agent 执行 N 个子任务/审查循环  → 0 premium request（全部通过 MCP 工具循环）
紧急重定向（极罕见）            → 0-1 premium request
故障恢复重启（极罕见）          → 0-1 premium request
关闭                           → 0
─────────────────────────────
总计: 1-2 premium request / Agent 生命周期
```

#### ACP prompt() — 仅限 3 个场景

| 场景 | 何时使用 | 成本 | 预计频率 |
|------|---------|------|---------|
| **初始任务下发** | Agent session 创建后的第一条指令 | 1 request/Agent | 必需，不可避免 |
| **紧急中断** | Agent 进入死循环、严重走偏 | 1 request | 极少（0-2 次/任务） |
| **故障恢复** | Agent 进程崩溃后重启重连 | 1 request | 极少（理想情况 0 次） |

**永远不用 ACP prompt() 做的事**：
- 路由 Agent 间日常通信（用 MCP submit 入参-出参交叉）
- 人类介入（用编排器拦截 submit 出参即可）

#### 子进程 Fallback

如果 ACP 在某些场景不满足需求，可 fallback 到子进程方案：

| 场景 | ACP 方案 | Fallback 子进程方案 |
|------|---------|-------------------|
| per-session 模型不支持 | 每模型一个 ACP 进程 | `copilot -p "..." --model X --additional-mcp-config @mlra.json` |
| ACP 连接不稳定 | 退避重连 | 切换到子进程模式 |
| 某些 Agent 需要长期独立运行 | ACP session | 独立 copilot 进程 + MCP |
| ACP Preview 版本变更 | 适配 | 全面回退到子进程模式 |

---

## 4. 进程管理（Rust 层）

### 4.1 为什么用 Rust 管理进程

- Tauri 后端已是 Rust，直接在 `ipc.rs` 层扩展
- Rust 的进程管理（`std::process::Command`、`tokio::process`）可靠且高效
- ACP 的 stdio 管道管理在 Rust 中比 Node.js 更稳定
- 与 Tauri 的事件系统天然集成

### 4.2 核心数据结构

```rust
// src-tauri/src/mlra/mod.rs

use std::collections::HashMap;
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, RwLock};

/// ACP 进程实例
pub struct AcpProcess {
    pub id: String,
    pub child: Child,
    pub stdin: tokio::process::ChildStdin,
    pub stdout_reader: tokio::io::BufReader<tokio::process::ChildStdout>,
    pub sessions: HashMap<String, AgentSession>,
    pub status: ProcessStatus,
    pub model_hint: Option<String>,  // 进程级模型（如果 per-session 不支持）
}

/// Agent Session
pub struct AgentSession {
    pub session_id: String,
    pub role: AgentRole,
    pub launcher_id: String,
    pub status: SessionStatus,
    pub model: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_activity: chrono::DateTime<chrono::Utc>,
}

#[derive(Clone, Copy)]
pub enum AgentRole {
    Expert,
    Inspector,
    Ceo,
    Worker(u32),  // Worker 编号
}

#[derive(Clone, Copy)]
pub enum ProcessStatus {
    Starting,
    Ready,
    Busy,
    Crashed,
    Stopping,
}

#[derive(Clone, Copy)]
pub enum SessionStatus {
    Active,
    Standby,
    WaitingForSubmit,  // Agent 已调用 submit，等待路由
    Broken,
}

/// MLRA 编排器状态
pub struct Orchestrator {
    pub processes: RwLock<HashMap<String, AcpProcess>>,
    pub launchers: RwLock<HashMap<String, Launcher>>,
    pub active_launcher_id: RwLock<Option<String>>,
    pub message_router: MessageRouter,
    pub mcp_server: MlraMcpServer,
}
```

### 4.3 进程生命周期管理

```rust
impl Orchestrator {
    /// 启动一个 ACP 进程
    pub async fn spawn_acp_process(&self, model_hint: Option<&str>) -> Result<String> {
        let mut cmd = Command::new("copilot");
        cmd.args(["--acp", "--stdio"]);
        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::inherit());
        
        // 如果需要特定模型，通过环境变量设置
        if let Some(model) = model_hint {
            cmd.env("COPILOT_MODEL", model);
        }
        
        let child = cmd.spawn()?;
        // ... ACP 初始化握手
        // ... 注册进程监控
    }
    
    /// 在 ACP 进程中创建 Agent session
    pub async fn create_agent_session(
        &self,
        process_id: &str,
        role: AgentRole,
        launcher_id: &str,
        mcp_config: MlraMcpConfig,
    ) -> Result<String> {
        // ACP: connection.newSession({ cwd, mcpServers })
        // 返回 session_id
    }
    
    /// 向 Agent session 发送消息
    pub async fn send_prompt(
        &self,
        session_id: &str,
        message: &str,
    ) -> Result<()> {
        // ACP: connection.prompt({ sessionId, prompt })
    }
    
    /// 进程健康检查（定时任务）
    pub async fn health_check(&self) {
        // 检查所有 ACP 进程是否存活
        // 检查 session 活跃度
        // 自动恢复 crashed 进程
    }
}
```

### 4.4 进程恢复策略

```
ACP 进程崩溃
  │
  ▼
检测到 child.exited 事件
  │
  ▼
标记该进程下所有 session 为 Broken
  │
  ▼
通过 Tauri 事件通知前端
  │
  ▼
尝试重启 ACP 进程
  │
  ├─ 成功
  │   ▼
  │   对每个 Broken session:
  │     ├─ 尝试 resume（如 ACP 支持）
  │     └─ 或 创建新 session + 注入上下文恢复提示
  │
  └─ 失败（连续 N 次）
      ▼
      标记 Launcher 为异常状态
      通知人类用户干预
```

### 4.5 多进程策略

根据 ACP PoC 验证结果（v0.3 更新），确定以下策略分层：

#### 策略 4：多进程 + config-dir（v0.3 确定方案 ★★★★★）

**核心思路**：每个 MLRA 角色 = 独立 copilot 进程，通过 `--config-dir` 获得 TRUE system prompt。

```
.mlra/config/expert/
├── copilot-instructions.md    ← Expert 的完整 system prompt（作为 copilot-instructions 加载）
└── mcp-config.json            ← Expert 专用的 MCP 工具集

.mlra/config/inspector/
├── copilot-instructions.md    ← Inspector 的完整 system prompt
└── mcp-config.json

copilot --acp --stdio --config-dir .mlra/config/expert/ --model gpt-5.4-mini --no-custom-instructions
  └── Expert session（唯一）

copilot --acp --stdio --config-dir .mlra/config/inspector/ --model gpt-5.4 --no-custom-instructions
  └── Inspector session（唯一）

copilot --acp --stdio --config-dir .mlra/config/ceo/ --model gpt-5.4 --no-custom-instructions
  └── CEO session（唯一）
```

**决定性优势** — 解决了三个非妥协需求：
1. **TRUE system prompt**：`copilot-instructions.md` 在进程初始化时加载，不受上下文压缩影响
2. **Per-role 模型**：`--model` 在进程级指定，不依赖 UNSTABLE API
3. **Per-role 工具**：`--available-tools` 或 MCP 配置在进程级限制

**注意**：`--config-dir` + 真实 system prompt 行为仍需 PoC 验证（§8 Phase 0 项目）

#### 策略 1：单进程多 Session（ACP 原生方案 — 降级为备选）

如果 ACP 支持单进程内多 session + per-session 模型：

```
copilot --acp --stdio (进程 1)
├── Expert session (model=claude-opus-4)
├── Inspector session (model=gpt-5.4)
├── CEO session (model=claude-opus-4)
└── Worker sessions (model=claude-sonnet-4.5)
```

**优势**：资源占用最小，session 间切换无开销
**降级原因**：
- ACP 无 system prompt API — 角色身份只能通过首条 prompt 注入，可能被上下文压缩丢失
- `unstable_setSessionModel` 为 UNSTABLE API，不可靠
- 无 per-session 工具限制机制

#### 策略 2：每模型一进程（ACP 降级方案）

如果不支持 per-session 模型：

```
copilot --acp --stdio (进程 1, model=claude-opus-4)
├── Expert session
└── CEO session

copilot --acp --stdio (进程 2, model=gpt-5.4)
└── Inspector session

copilot --acp --stdio (进程 3, model=claude-sonnet-4.5)
└── Worker sessions
```

**优势**：模型隔离清晰，单进程崩溃不影响其他模型

#### 策略 3：ACP + 子进程混合方案（Workers 降级方案）

```
copilot --acp --stdio (ACP 主进程)
├── Expert session
├── Inspector session
└── CEO session

copilot -p "..." --additional-mcp-config @mlra.json --autopilot (子进程)
└── Worker 1 (需要长期独立运行的任务)

copilot -p "..." --additional-mcp-config @mlra.json --autopilot (子进程)
└── Worker 2
```

**理由**：主 Agent 用 ACP 获得完整控制，子 Agent 用子进程方案更加独立、容错性更好

> **v0.3 策略优先级**：策略 4（多进程+config-dir）> 策略 2（每模型一进程）> 策略 3（混合）> 策略 1（单进程）
> 待 `--config-dir` PoC 验证后最终确定。如果 `--config-dir` 无法有效注入 system prompt，则回退到策略 1+2 组合。

---

## 5. MCP 通信层设计

### 5.1 MLRA MCP Server

MLRA 编排器内嵌一个 MCP Server，通过 ACP 的 `newSession({ mcpServers })` 注入到每个 Agent session。

#### MCP Server 配置

```json
{
  "mlra": {
    "type": "local",
    "command": "node",
    "args": ["mlra-agent-mcp.mjs"],
    "env": {
      "MLRA_ROLE": "expert",
      "MLRA_LAUNCHER_ID": "launcher-001",
      "MLRA_SESSION_ID": "session-xxx",
      "MLRA_ORCHESTRATOR_PORT": "19880"
    },
    "tools": ["*"]
  }
}
```

**替代方案**：如果 ACP 的 requestPermission 足够灵活，可以将 MCP 工具嵌入 ACP 层，减少独立 MCP 进程的开销。

### 5.2 MCP 工具定义 — 入参-出参交叉模型

核心设计原则：
- **submit 是唯一的核心交换点** — Agent A 的 submit 入参经编排器路由后成为 Agent B 的 submit 出参
- **阻塞 = Agent 的 turn 未结束** — 不消耗额外 premium request
- **人类介入 = 编排器拦截 submit 出参** — 不需要独立的 request_human 工具
- **check_orders 是纯信息查询** — 非阻塞，主 Agent 查看子 Agent 状态表

| 工具 | 使用者 | 阻塞性 | 语义 |
|------|--------|--------|------|
| **submit** | Expert, Inspector, CEO | **阻塞** | 提交入参 + 等待出参。核心交换机制。 |
| **router_vote** | Expert, Inspector | 快速返回 | 投票共识 |
| **order** | Expert | 非阻塞 | 委派任务给子 Agent |
| **check_orders** | Expert | 非阻塞 | 查看子 Agent 状态表 |
| **await_order_finish** | Expert | **阻塞** | 等待某个子 Agent 完成 |
| **submit_feedback** | Worker | **阻塞** | 提交完成 + 等待下一个任务 |

#### submit（核心交换工具 — 阻塞）

所有主 Agent 的唯一提交通道。Agent 视角等同于 MLFB 的 interactive_feedback。

```typescript
server.tool("submit", {
  type: z.enum(["phase_complete", "review_result", "plan_draft", "vote", "final_complete"]),
  content: z.string().describe("结果内容（Markdown格式）"),
  metadata: z.object({
    phase: z.string().optional(),
    passed: z.boolean().optional(),
    issues: z.array(z.string()).optional(),
  }).optional(),
});
```

**阻塞行为**：
1. MCP Server 接收 tool call → 发送入参到编排器（TCP）
2. **MCP Server HOLD 住 tool response** — Promise 不 resolve
3. 编排器做路由决策：
   - 将入参编排为目标 Agent 的 submit 出参
   - 或拦截推送到 MLFB UI 等待人类（CEO 节点）
4. 编排器返回消息 → MCP Server resolve → Agent 继续

**Agent 看到的**：
```
我调用了 submit("方案v1 完成")
...等待中...
submit 返回了: "审查意见：发现3个问题..."
→ 我继续修改方案
```
（Agent 认为是人类回复了，实际是 Inspector 的 submit 入参被路由过来的）

#### router_vote（投票 — 快速返回）

```typescript
server.tool("router_vote", {
  vote: z.enum(["pass", "reject"]),
  reason: z.string(),
});
```

**行为**：快速返回 `{ recorded: true, instruction: "投票已记录" }`。编排器记录票数。当双方都投通过后，编排器触发 CEO 门控（通过下一次 submit 的出参通知 Agent）。

#### order（委派子 Agent — 非阻塞）

```typescript
server.tool("order", {
  worker_role: z.string().describe("目标子Agent角色，如'前端外包'"),
  task_description: z.string().describe("清晰明了的执行方案"),
  priority: z.enum(["normal", "high"]).optional(),
});
```

**行为**：编排器分配空闲 Worker（或创建新 Worker），将 order 内容作为 Worker 的 submit_feedback 出参发送。立即返回 `{ worker_id: "worker-3", status: "dispatched" }`。

#### check_orders（查看子 Agent 状态 — 非阻塞）

```typescript
server.tool("check_orders", {});
```

**行为**：立即返回子 Agent 状态信息表。纯信息查询，与阻塞无关。

```
→ 立即返回:
{
  workers: [
    { id: "worker-1", role: "前端外包", status: "working", task: "修改登录页面" },
    { id: "worker-2", role: "后端外包", status: "ready", task: null }
  ]
}
```

#### await_order_finish（等待子 Agent — 阻塞）

```typescript
server.tool("await_order_finish", {
  worker_id: z.string(),
  timeout_hint: z.string().optional(),
});
```

**阻塞行为**：HOLD 住 tool response，直到目标 Worker 调用 submit_feedback。Worker 的 submit_feedback 入参成为 Expert 的 await_order_finish 出参。

#### submit_feedback（Worker 专用 — 阻塞）

```typescript
server.tool("submit_feedback", {
  result: z.string(),
  files_modified: z.array(z.string()).optional(),
});
```

**阻塞行为**：Worker 提交完成报告后 HOLD，等待下一个任务。编排器将 Worker 的入参路由给 Expert（通过解除 await_order_finish 或更新状态表），同时在有新 order 时将任务作为 submit_feedback 的出参返回给 Worker。

### 5.3 MCP Server 阻塞实现

MCP Server 进程与 Rust 编排器之间的通信方式：

| 方式 | 优劣 |
|------|------|
| **TCP socket** | 稳定，已有 MLFB 的 IPC 模式可复用 |
| Unix socket / Named pipe | 更安全但跨平台复杂 |
| 环境变量 + 临时文件 | 最简单但效率低 |

**推荐**：复用 MLFB 的 TCP IPC 模式。每个 Agent 的 MCP Server 作为 IPC client 连接到编排器。

```
Agent (Copilot CLI)
  ↓ MCP stdio
mlra-agent-mcp.mjs (每个Agent一个进程实例)
  ↓ TCP (port 19880)
Rust 编排器
  ↓ 内部路由决策
  ↓ TCP
另一个 Agent 的 mlra-agent-mcp.mjs
  ↓ MCP stdio
另一个 Agent (Copilot CLI)
```

#### 阻塞实现（与 MLFB `requestFeedbackViaIpc` 完全同构）

```javascript
// mlra-agent-mcp.mjs — submit 工具的阻塞实现
async function handleSubmit(params) {
  const socket = await connectToOrchestrator(
    parseInt(process.env.MLRA_ORCHESTRATOR_PORT)
  );
  
  // 发送入参到编排器
  socket.write(JSON.stringify({
    type: "agent_submit",
    session_id: process.env.MLRA_SESSION_ID,
    role: process.env.MLRA_ROLE,
    payload: params
  }) + "\n");
  
  // BLOCK: 等待编排器返回出参
  // 可能等待几分钟到几小时（与 MLFB 等待人类响应完全一样）
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: socket });
    rl.on("line", (line) => {
      const msg = JSON.parse(line);
      if (msg.type === "submit_response") {
        rl.close();
        socket.destroy();
        resolve(msg.payload);  // 出参：对方Agent的入参或人类的回复
      }
    });
    rl.on("close", () => {
      reject(new Error("Orchestrator connection closed"));
    });
  });
}
```

**关键对比**：

| MLFB (`server.mjs`) | MLRA (`mlra-agent-mcp.mjs`) |
|---------------------|---------------------------|
| Agent 调用 `interactive_feedback` | Agent 调用 `submit` |
| MCP Server 发送 `feedback_request` 到 Tauri | MCP Server 发送 `agent_submit` 到编排器 |
| 等待人类在 UI 中响应 | 等待编排器路由（对方 Agent 或人类） |
| 收到 `feedback_response` resolve | 收到 `submit_response` resolve |
| Agent 继续工作 | Agent 继续工作 |

**因此 `mlra-agent-mcp.mjs` 的实现可直接基于 `server.mjs` 改造。**

---

## 6. 编排器核心逻辑

### 6.1 消息路由引擎（入参-出参交叉路由）

路由引擎的核心职责：将 Agent A 的 submit 入参，编排为 Agent B 的 submit 出参。

```rust
pub struct MessageRouter {
    routing_rules: Vec<RoutingRule>,
    /// 阻塞中的 submit 请求（等待出参）
    pending_submits: HashMap<String, PendingSubmit>,
}

pub struct PendingSubmit {
    pub session_id: String,
    pub role: AgentRole,
    pub payload: SubmitPayload,
    pub response_tx: oneshot::Sender<SubmitResponse>,
    pub submitted_at: chrono::DateTime<chrono::Utc>,
}

pub enum RoutingRule {
    /// 规划阶段：专家 submit → 出参路由给监察
    PlanningExpertToInspector,
    /// 规划阶段：监察 submit → 出参路由给专家
    PlanningInspectorToExpert,
    /// 投票通过后 → CEO 门控（拦截出参，推送到 MLFB UI）
    VotePassedToCeo,
    /// CEO 通过 → 阶段切换
    CeoApprovedToPhaseTransition,
    /// 实施阶段：专家 submit → 出参路由给监察
    ExecutionExpertToInspector,
    /// 实施阶段：监察通过 → 下一 Phase（出参通知专家）
    ExecutionInspectorPassToNextPhase,
    /// Worker submit_feedback → 解除对应的 await_order_finish
    WorkerFeedbackToAwaitingExpert,
    /// 自定义规则
    Custom(Box<dyn Fn(&SubmitPayload) -> RoutingDecision>),
}

pub enum RoutingDecision {
    /// 将入参编排为目标 Agent 的出参
    CrossDeliver {
        target_session_id: String,
        /// 可选：编排器在转发时追加的尾部注入内容
        tail_injection: Option<String>,
    },
    /// 拦截出参，推送到 MLFB UI 等待人类（CEO manual/hybrid 模式）
    HumanIntercept {
        mlfb_summary: String,
        mlfb_questions: Option<Vec<Question>>,
    },
    /// 广播给多个 session（出参同时发给多个等待者）
    BroadcastTo(Vec<String>),
    /// 触发阶段切换（构造阶段切换指令作为出参）
    PhaseTransition,
    /// 任务完成（构造完成通知作为出参）
    TaskComplete,
    /// 检测到停滞（触发 CEO 仲裁）
    Stagnation,
}

impl MessageRouter {
    /// 当收到 Agent A 的 submit 入参时调用
    pub async fn route_submit(&self, submit: PendingSubmit) -> Result<()> {
        let decision = self.evaluate_rules(&submit);
        match decision {
            RoutingDecision::CrossDeliver { target_session_id, tail_injection } => {
                // 找到目标 Agent 的 pending submit
                // 将 A 的入参（可能加上尾部注入）作为 B 的出参发送
                if let Some(target_pending) = self.pending_submits.remove(&target_session_id) {
                    let response = compose_response(&submit.payload, tail_injection);
                    target_pending.response_tx.send(response)?;
                } else {
                    // 目标 Agent 尚未调用 submit，暂存等待
                    self.queue_for_delivery(target_session_id, submit.payload);
                }
            }
            RoutingDecision::HumanIntercept { mlfb_summary, .. } => {
                // 推送到 MLFB UI，人类回复后再 resolve submit 的出参
                let human_response = self.push_to_mlfb_and_wait(mlfb_summary).await?;
                submit.response_tx.send(human_response)?;
            }
            // ...
        }
    }
}
```

### 6.2 防御性拒绝调度器

```rust
pub struct DefensiveRejectionScheduler {
    templates: Vec<RejectionTemplate>,
    current_round: usize,
    min_rounds: usize,  // 配置：最少拒绝轮数
}

impl DefensiveRejectionScheduler {
    /// 决定是否继续拒绝
    pub fn should_reject(&self) -> bool {
        self.current_round < self.min_rounds
    }
    
    /// 获取下一轮的拒绝话术
    pub fn next_rejection(&mut self) -> String {
        let template = &self.templates[self.current_round % self.templates.len()];
        self.current_round += 1;
        template.render()
    }
}
```

### 6.3 停滞检测器

```rust
pub struct StagnationDetector {
    feedback_history: Vec<String>,
    max_same_feedback: usize,
}

impl StagnationDetector {
    /// 检测最近 N 轮反馈是否重复
    pub fn check(&self) -> Option<StagnationType> {
        // 比较最近 N 轮反馈的相似度
        // 如果高度重复 → 触发 CEO 仲裁
    }
}
```

---

## 7. Tauri 集成

### 7.1 新增 Tauri Commands

```rust
// src-tauri/src/mlra/commands.rs

#[tauri::command]
pub async fn mlra_create_launcher(
    name: String,
    config: LauncherConfig,
    state: tauri::State<'_, Orchestrator>,
) -> Result<Launcher, String> { }

#[tauri::command]
pub async fn mlra_switch_launcher(
    launcher_id: String,
    state: tauri::State<'_, Orchestrator>,
) -> Result<(), String> { }

#[tauri::command]
pub async fn mlra_send_human_input(
    session_id: String,
    message: String,
    state: tauri::State<'_, Orchestrator>,
) -> Result<(), String> { }

#[tauri::command]
pub async fn mlra_pause_launcher(launcher_id: String, ...) -> Result<(), String> { }

#[tauri::command]
pub async fn mlra_resume_launcher(launcher_id: String, ...) -> Result<(), String> { }

#[tauri::command]
pub async fn mlra_get_launcher_status(launcher_id: String, ...) -> Result<LauncherStatus, String> { }

#[tauri::command]
pub async fn mlra_set_ceo_mode(mode: CeoMode, ...) -> Result<(), String> { }
```

### 7.2 新增 Tauri Events

```rust
// 编排器 → 前端
pub enum MlraEvent {
    AgentOutput { session_id: String, chunk: String },       // 流式输出
    AgentStatusChanged { session_id: String, status: String }, // 状态变更
    LauncherStatusChanged { launcher_id: String, status: String },
    PhaseTransition { launcher_id: String, new_phase: String },
    CeoApprovalRequired { launcher_id: String, materials: String },
    WorkerStatusUpdate { launcher_id: String, workers: Vec<WorkerStatus> },
}
```

---

## 7.5 ACP PoC 验证结果汇总（v0.3 新增）

### PoC Test 1: ACP 基础连接（test-acp-basic.mjs）
- **目标**：验证 ACP 连接、session 创建、prompt 发送
- **结果**：✅ PASS
- **发现**：ACP 连接稳定，session 创建即时，prompt 响应正常

### PoC Test 2: 多 Session 隔离（test-acp-multi-session.mjs）
- **目标**：验证单进程多 session，消息隔离
- **结果**：✅ PASS
- **发现**：同一进程的多个 session 完全隔离，各自维护独立上下文

### PoC Test 3: MCP 注入（test-acp-mcp-inject.mjs）
- **目标**：验证通过 `newSession({ mcpServers })` 注入自定义 MCP 工具
- **结果**：✅ PASS
- **发现**：Agent 能发现并调用注入的 MCP 工具，requestPermission 自动批准正常

### PoC Test 4: Custom Agent + ACP（test-acp-agent.mjs）
- **目标**：验证 `--acp --stdio --agent test-echo` 兼容性
- **结果**：✅ PASS（但发现子代理委托模式）
- **关键发现**：
  - `--agent` 使 copilot 将自定义 Agent 作为 SUBAGENT 委托（tool_call kind:"other"）
  - 主 copilot 仍以默认模型（GPT-5.4）运行
  - subagent 在独立上下文窗口中运行，使用 .agent.md 指定的模型
  - subagent 的系统提示词确实生效（secret code ECHO-SECRET-7742 被正确返回）
  - **结论**：subagent 模式不适合 MLRA 的长期运行、MCP 阻塞交叉架构

### PoC Test 5: Session 配置发现（test-acp-session-config.mjs）
- **目标**：发现 ACP 的 per-session 配置能力（模型、模式、configOptions）
- **结果**：✅ PASS
- **关键发现**：
  - 3 种 session 模式：agent（默认）/ plan（多步骤规划）/ autopilot（自主，实验性）
  - 8 个可用模型：gpt-5.4, gpt-5.3-codex, gpt-5.2-codex, gpt-5.2, gpt-5.1, gpt-5.4-mini, gpt-5-mini, gpt-4.1
  - 3 个 configOptions：mode (select), model (select), reasoning_effort (select: low/medium/high/xhigh)
  - `setSessionModel("gpt-4o")` → "Invalid model"（必须使用列表内模型）
  - `setSessionMode("plan")` → ✅ 成功

### PoC Test 6: 终极 Per-Session 验证（test-acp-per-session.mjs）
- **目标**：同一进程中两个 session 使用不同模型+模式+身份，验证完全隔离
- **结果**：✅ ALL PASS
- **测试设计**：
  - Session A (Expert): gpt-5.4-mini + plan 模式 + secret code EXPERT-DELTA-9903
  - Session B (Inspector): gpt-5.4 + autopilot 模式 + secret code INSPECT-GAMMA-4471
- **验证项**：
  - ✅ Expert 自报 "GPT-5.4 mini" — 确认模型切换生效
  - ✅ Expert 返回正确 secret code
  - ✅ Inspector 返回正确 secret code
  - ✅ Expert 不知道 Inspector 的 secret code — 身份隔离完美
  - ✅ 两个 session 模式独立（plan vs autopilot）

### TUI / 可观测性分析

**问题**：ACP 模式下没有传统 TUI（Terminal UI），因为 stdio 被 NDJSON 协议占用。

**替代方案**：ACP 的 `sessionUpdate` 事件提供了比 TUI 更丰富的结构化数据：

| sessionUpdate 事件类型 | 内容 |
|----------------------|------|
| `agent_message_chunk` | Agent 的文本输出（流式） |
| `tool_call` | 工具调用详情（名称、参数、结果） |
| `agent_thought_chunk` | Agent 的思考过程（如果模型支持） |
| `confirmation_request` | 确认请求 |

**推荐方案**：将 sessionUpdate 事件流接入 MLFB UI，提供实时监控面板：
- 每个 Agent session 一个独立输出区域
- 工具调用可折叠展示
- Agent 思考过程可选显示
- 进程状态 + session 状态实时更新

---

## 8. 实现路线图

### Phase 0: ACP PoC 验证（v0.3 更新：大部分已完成）

**目标**：验证 ACP 的核心假设

- [x] 安装 `@agentclientprotocol/sdk`
- [x] 编写 PoC 脚本：启动 `copilot --acp --stdio`
- [x] 验证单进程多 session（Test 2 ✅）
- [x] 验证 per-session 模型配置（Test 5/6 ✅ unstable API）
- [x] 验证 mcpServers 注入（Test 3 ✅）
- [x] 验证 requestPermission 自动批准（Test 1 ✅）
- [x] 验证 Windows 上 stdio 管道稳定性（全部 Test 在 Windows 上运行 ✅）
- [ ] 验证 session 恢复能力（loadSession API — 待测试）
- [x] 验证 Custom Agent + ACP 兼容性（Test 4 ✅ — subagent 委托模式）
- [x] 验证 per-session 模式切换（Test 5/6 ✅ — agent/plan/autopilot）
- [x] 发现可用模型列表和成本乘数（Test 5 ✅）
- [ ] 验证 `--config-dir` 真实 system prompt 注入（待测试 — 关键！）
- [ ] 验证 MCP 阻塞交叉（submit 阻塞原型 — 待测试）
- [ ] 验证 `--no-custom-instructions` + `--config-dir` 组合行为（待测试）

**PoC 脚本骨架**：

```typescript
// scr_tests/test-acp-poc.mjs
import * as acp from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";

async function main() {
  const proc = spawn("copilot", ["--acp", "--stdio"], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  const output = Writable.toWeb(proc.stdin);
  const input = Readable.toWeb(proc.stdout);
  const stream = acp.ndJsonStream(output, input);

  const client = {
    async requestPermission(params) {
      console.log("[Permission]", JSON.stringify(params));
      return { outcome: { outcome: "approved" } };
    },
    async sessionUpdate(params) {
      const update = params.update;
      if (update.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") {
        process.stdout.write(update.content.text);
      }
    },
  };

  const connection = new acp.ClientSideConnection((_agent) => client, stream);
  
  await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {},
  });

  // Test 1: 创建 session
  const session1 = await connection.newSession({
    cwd: process.cwd(),
    mcpServers: [],
  });
  console.log("Session 1:", session1.sessionId);

  // Test 2: 创建第二个 session（验证多 session）
  const session2 = await connection.newSession({
    cwd: process.cwd(),
    mcpServers: [],
  });
  console.log("Session 2:", session2.sessionId);

  // Test 3: 向 session 1 发 prompt
  const result1 = await connection.prompt({
    sessionId: session1.sessionId,
    prompt: [{ type: "text", text: "Reply with exactly: HELLO_FROM_SESSION_1" }],
  });
  console.log("Result 1 stopReason:", result1.stopReason);

  // Test 4: 向 session 2 发 prompt
  const result2 = await connection.prompt({
    sessionId: session2.sessionId,
    prompt: [{ type: "text", text: "Reply with exactly: HELLO_FROM_SESSION_2" }],
  });
  console.log("Result 2 stopReason:", result2.stopReason);

  proc.stdin.end();
  proc.kill("SIGTERM");
}

main().catch(console.error);
```

### Phase 1: Rust ACP 管理器（3-5天）

- [ ] 在 `src-tauri/src/mlra/` 创建模块结构
- [ ] 实现 ACP 进程启动和 stdio 管道管理
- [ ] 实现 NDJSON 协议解析（ACP over stdio）
- [ ] 实现 session 创建和管理
- [ ] 实现 prompt 发送和流式输出接收
- [ ] 实现进程健康检查和自动恢复

### Phase 2: MCP 通信层（2-3天）

- [ ] 实现 `mlra-agent-mcp.mjs`（基于现有 `server.mjs` 改造）
- [ ] 实现 submit / router_vote / order / check_orders 等工具
- [ ] 实现 MCP Server ↔ Rust 编排器的 TCP 通信
- [ ] 验证 ACP mcpServers 注入工作正常

### Phase 3: 消息路由和编排（3-5天）

- [ ] 实现 MessageRouter
- [ ] 实现规划阶段双 Agent 对峙循环
- [ ] 实现投票机制
- [ ] 实现防御性拒绝调度
- [ ] 实现停滞检测

### Phase 4: 子 Agent 管理（2-3天）

- [ ] 实现 Worker 子进程管理（子进程方案 Fallback）
- [ ] 实现 order/check_orders/submit_feedback 完整链路
- [ ] 实现子 Agent 状态信息表注入
- [ ] 实现健康检查和故障恢复

### Phase 5: CEO 模式（2-3天）

- [ ] 实现 auto/manual/hybrid 三种模式
- [ ] 实现 CEO session 按需唤醒
- [ ] 实现 Tauri 前端审批界面桥接

### Phase 6: 前端集成（与 UI 规格同步）

- [ ] MLRAView 组件
- [ ] 实时流式输出显示
- [ ] Launcher 管理界面
- [ ] 阶段切换
- [ ] 子 Agent 池状态面板

---

## 9. 配置文件更新

### 9.1 扩展 `.mlra/config.yaml`

```yaml
mlra:
  # ── Agent 运行时配置 ──
  runtime:
    type: "acp"                        # acp | subprocess
    acp:
      transport: "stdio"               # stdio | tcp
      tcp_port: 3000                   # TCP 模式端口
      process_strategy: "per-model"    # single | per-model | mixed
    subprocess:
      autopilot: true
      max_autopilot_continues: 100

  # ── 模型配置 ──
  models:
    expert: "claude-opus-4"
    inspector: "gpt-5.4"
    ceo: "claude-opus-4"
    worker_default: "claude-sonnet-4.5"

  # ── 推理等级 ──
  reasoning_effort:
    expert: "high"
    inspector: "high" 
    ceo: "xhigh"
    worker: "medium"

  # ── 工具权限 ──
  tool_permissions:
    default: "allow-all"
    deny:
      - "shell(rm -rf)"
      - "shell(git push --force)"

  # ── CEO 模式 ──
  ceo_mode: "hybrid"                   # auto | manual | hybrid

  # ── 编排配置 ──
  planning:
    min_defensive_rejections: 2
    stagnation_threshold: 5            # 连续相同反馈次数

  execution:
    ceo_spot_check: true
    ceo_spot_check_frequency: 3

  # ── 子 Agent 配置 ──
  workers:
    max_count: 4
    health_check_interval_sec: 30
    broken_retry_max: 3
    runtime: "subprocess"              # 子 Agent 默认用子进程方案

  # ── MCP 通信 ──  
  mcp:
    orchestrator_port: 19880           # 编排器监听端口
    
  # ── 自定义指令 ──
  custom_instructions:
    global: ".github/copilot-instructions.md"
    agents_md: "AGENTS.md"
    per_role_dir: ".mlra/prompts/"
```

---

## 10. 关键技术决策记录

| 决策 | 理由 |
|------|------|
| **MCP 阻塞交叉为主通信方式** | MLFB 的核心精妙设计：submit 入参-出参交叉，Agent 间通信伪装为工具调用返回值，不消耗额外额度 |
| ACP 仅用于初始化 + 紧急中断 | 每次 ACP prompt() 消耗 1 premium request，必须最小化使用 |
| 不设独立的 request_human 工具 | submit 阻塞本身就是人类介入点，编排器拦截出参即可 |
| check_orders 为非阻塞查询 | 仅供主 Agent 查看子 Agent 状态表，纯信息获取 |
| MCP 作为唯一日常通信通道 | Agent turn 内的工具调用不消耗额度，与 MLFB 成本模型一致 |
| Rust 管理 ACP 进程 | Tauri 后端天然是 Rust，进程管控更可靠 |
| 子 Agent 用子进程方案 | 独立性更强，容错性更好，崩溃不影响主 Agent |
| 先验证再实现 | ACP 在 Preview，必须 PoC 确认关键假设 |
| 复用 MLFB IPC 基础设施 | MCP Server 阻塞实现与 MLFB 的 requestFeedbackViaIpc 完全同构 |
| **多进程 + config-dir 为首选架构（v0.3）** | 解决三个非妥协需求：TRUE system prompt、per-role 模型、per-role 工具。Custom Agents 的 subagent 模式不适合 |
| **不使用 Custom Agents 定义 MLRA 角色（v0.3）** | `--agent` 使 copilot 以 subagent 委托执行，不是独立长期 session。不支持 MCP 阻塞交叉通信 |
| **per-session 模型依赖 UNSTABLE API（v0.3）** | `unstable_setSessionModel` 可用但标记为 UNSTABLE。多进程的 `--model` 更可靠 |
| **ACP sessionUpdate 替代 TUI 观测（v0.3）** | ACP 模式 stdio 被协议占用无 TUI，但 sessionUpdate 事件提供更丰富的结构化数据 |

---

## 附录 A: ACP 官方文档要点摘录

**来源**: https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server

- ACP 是开放标准（agentclientprotocol.com）
- 官方明确支持**多 Agent 系统编排**使用场景
- TypeScript SDK：`@agentclientprotocol/sdk`
- 支持 stdio 和 TCP 两种传输
- `newSession({ cwd, mcpServers })` — 创建 session 时可注入 MCP
- `prompt({ sessionId, prompt })` — 向指定 session 发消息
- `sessionUpdate` — 流式接收 Agent 输出
- `requestPermission` — 编程化控制工具审批

## 附录 B: Copilot CLI 关键参数速查

```bash
# ACP 模式
copilot --acp --stdio
copilot --acp --port 3000

# 非交互模式
copilot -p "prompt" --allow-all --autopilot --max-autopilot-continues 50

# 模型控制
copilot --model claude-opus-4 --effort high

# MCP 注入
copilot --additional-mcp-config '{"mlra":{"type":"local","command":"node","args":["mcp.mjs"]}}'
copilot --additional-mcp-config @path/to/mcp-config.json

# 工具控制
copilot --allow-all-tools
copilot --allow-tool='shell(git:*)' --deny-tool='shell(git push --force)'
copilot --available-tools='submit,order,check_orders'

# Session 恢复
copilot --resume=<session-id>

# 自定义 Agent（subagent 委托模式）
copilot --agent my-agent

# 进程级配置（v0.3 新增 — 多进程架构核心）
copilot --config-dir .mlra/config/expert/      # 指定配置目录（含 copilot-instructions.md）
copilot --no-custom-instructions               # 禁用默认 AGENTS.md/instructions 加载
copilot --no-ask-user                          # 禁用用户确认
copilot --output-format json                   # JSON 输出格式

# MLRA 多进程架构推荐启动方式（v0.3）
copilot --acp --stdio --config-dir .mlra/config/expert/ --model gpt-5.4-mini --no-custom-instructions --allow-all-tools
copilot --acp --stdio --config-dir .mlra/config/inspector/ --model gpt-5.4 --no-custom-instructions --allow-all-tools
```

## 附录 C: oh-my-openagent 参考对照

| oh-my-openagent 机制 | MLRA 对应 | 技术选择差异 |
|---------------------|----------|------------|
| tmux 多 pane 管理 | ACP 多 session | ACP 跨平台，tmux 不支持 Windows |
| opencode attach 连接 session | ACP connection.prompt() | ACP 是标准协议 |
| opencode HTTP API 操控 | ACP ClientSideConnection | ACP 更原生 |
| BackgroundManager 子 Agent | 子进程 + MCP 注入 | 更简单直接 |
| TmuxSessionManager 状态轮询 | ACP sessionUpdate 事件 | 事件驱动 vs 轮询 |
| 进程健康检查 (polling) | child.on('exit') + heartbeat | 事件 + 心跳 |

---

*文档结束。下一步：验证 `--config-dir` TRUE system prompt 注入 + MCP 阻塞交叉原型。*
