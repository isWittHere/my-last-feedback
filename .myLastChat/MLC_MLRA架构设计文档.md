---
title: "MLRA - My Long-Running Agent 架构设计文档"
description: "基于MLFB的多Agent长期运行编排平台完整架构设计"
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - MLRA
    - multi-agent
    - long-running
    - architecture
    - orchestration
---

# MLRA — My Long-Running Agent 架构设计文档

> 版本: v0.4-draft | 日期: 2026-04-10 (VS Code + register_LRA 架构迁移，移除 ACP/CLI 依赖)

---

## 1. 概述

### 1.1 背景与动机

MLFB（My Last Feedback）当前通过 human-in-the-loop 模式完成工程构建。实践中我们发现：

1. **大量人工操作高度重复且可机械化**：虽然已通过自定义 prompt 快速发送、快捷短语等方式优化，但本质上人类仍在扮演"转发器"角色。
2. **单一 Agent 的局限性**：不同任务需要不同的模型和系统提示词组合，MLFB 无法临时切换。
3. **缺乏并行能力**：特定任务分发给多个 Agent 并行执行能大幅提升效率。

MLRA 的目标是：在保留人类最终控制权的前提下，实现多 Agent 自动化编排、长期运行和质量保证。

### 1.2 核心原则

- **Agent 始终认为自己在与人类交流** — 通过伪装人类反馈的通信协议，保持 Agent 心智模型的稳定性
- **人类随时可夺回控制权** — CEO 角色可在人类/AI 之间无缝切换
- **不设硬性限制，用机制引导退出** — 通过防御性拒绝、第三方验证、停滞检测等手段代替粗暴的轮次上限
- **质疑驱动而非催促驱动** — 不是催 Agent 快完成，而是质疑 Agent 是否真的完成了

### 1.3 参考架构

- **oh-my-openagent (oh-my-opencode)**: 11个agent、52个lifecycle hooks、Ralph Loop延续机制、TODO continuation enforcer、Boulder State任务追踪
- **MLFB现有能力**: IPC通信、多session管理、挂起等待机制、尾部注入

---

## 2. 系统架构

### 2.1 三角架构

```
                         ┌───────────────┐
                         │      CEO      │
                         │  (决策者/仲裁) │
                         │ 人类/AI可切换  │
                         └───────┬───────┘
                                 │
                    关键节点介入（门控/验证/仲裁）
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  │                  ▼
       ┌─────────────┐          │          ┌─────────────┐
       │    专家      │◄─────────┘─────────►│    监察      │
       │  (执行者)    │                     │  (审查者)    │
       │  OPUS HT    │  ← submit循环 →     │  GPT5.4 HT  │
       └──────┬──────┘                     └─────────────┘
              │
              │ order / check_orders
              ▼
       ┌─────────────┐
       │  子Agent池   │
       │ worker 1..N │
       └─────────────┘
```

### 2.2 MLRA 编排器

> **v0.4 更新 (2026-04-10)**: 从 ACP+MCP 双层架构迁移到纯 MCP 架构（register_LRA 方案）。

MLRA 编排器是整个系统的核心组件，位于所有 Agent 之间，负责消息路由、状态管理和流程控制。采用 **纯 MCP 阻塞通信架构**，复用 MLFB 的 MCP Server 模式。

```
┌──────────────────────────────────────────────────────────────┐
│                        MLRA 编排器                            │
│                  (MLRA MCP Server 扩展)                       │
│                                                              │
│  ┌───────────────────┐  ┌───────────────────────────────┐   │
│  │  Session 注册管理  │  │  消息路由器                     │   │
│  │                   │  │                               │   │
│  │ register_LRA 阻塞 │  │ submit翻译 + 路由决策          │   │
│  │ session_id 追踪   │  │ 上下文注入 + 尾部提示注入       │   │
│  │ 角色分配          │  │ 防御性拒绝调度                 │   │
│  │ Hook TCP 通知     │  │ 停滞检测 + CEO仲裁             │   │
│  └───────────────────┘  └───────────────────────────────┘   │
│                                                              │
│  ┌───────────────────┐  ┌───────────────────────────────┐   │
│  │  MCP Server       │  │  状态管理器                     │   │
│  │                   │  │                               │   │
│  │ submit/vote 工具  │  │ Agent状态 + 子Agent信息表      │   │
│  │ order/check_orders│  │ Launcher追踪 + 阶段管理        │   │
│  │ submit_feedback   │  │ CEO模式管理                    │   │
│  └───────────────────┘  └───────────────────────────────┘   │
│                                                              │
│  ┌───────────────────┐  ┌───────────────────────────────┐   │
│  │  会话健康监控      │  │  Tauri IPC 桥接                 │   │
│  │                   │  │                               │   │
│  │ MCP心跳检测       │  │ MLFB UI集成 + 实时状态展示     │   │
│  │ session超时检测   │  │ CEO审批界面 + 人类干预通道     │   │
│  │ 断线重连处理      │  │ Agent状态转发                  │   │
│  └───────────────────┘  └───────────────────────────────┘   │
│                                                              │
│  通信流（入参-出参交叉模型）:                                 │
│  Agent A submit(入参) →[BLOCK]→ 编排器路由 → Agent B 收到出参 │
│  Agent B submit(入参) →[BLOCK]→ 编排器路由 → Agent A 收到出参 │
│  人类介入 = 编排器拦截submit出参，推送MLFB UI等待人类修改后返回 │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 基座平台

> **v0.4 更新 (2026-04-10)**: 从 Copilot CLI + ACP 迁移到 VS Code Copilot Chat + register_LRA。

- **VS Code Copilot Chat** 作为 Agent 运行时
  - 每个 Agent = 一个 VS Code Chat Session（通过 `.agent.md` 自定义 Agent 定义）
  - 用户手动创建多个 Chat Session，选择对应的自定义 Agent
  - `workbench.action.chat.open` 支持 `mode`（自定义Agent名）、`modelSelector`（模型选择）、`blockOnResponse`（同步等待）等参数
- **register_LRA MCP 阻塞** 作为 Agent 注册和日常通信的核心机制
  - Agent 启动后首次调用 `register_LRA` 工具 → MCP 阻塞 → 编排器捕获 caller 信息
  - Agent 间通信通过 submit 入参-出参交叉实现 — **不消耗额外 premium request**
  - 人类介入通过编排器拦截 submit 出参实现 — 不需要独立工具
- **Copilot Hooks** 辅助 session 追踪
  - `~/.copilot/hooks/inject-agent-name.mjs` 在 SessionStart 时通过 TCP 通知 MLFB Desktop 完整 session_id
  - 与 register_LRA 配合实现 session ↔ Agent 角色的关联
- 不同 session 可通过 `.agent.md` 配置不同的系统提示词，通过 `modelSelector` 选择不同模型
- **无需 VS Code 扩展**：核心编排逻辑在 MCP Server 侧，复用 MLFB 已有架构

> 详细 VS Code 自动化方案见：[`MLC_MLRA_VSCode自动化方案规划.md`](MLC_MLRA_VSCode自动化方案规划.md)  
> 历史 CLI 方案（已归档）：[`MLC_MLRA_CLI自动化方案规划.md`](MLC_MLRA_CLI自动化方案规划.md)

---

## 3. 角色定义

### 3.1 三类主 Agent

#### 专家 (Expert)

| 属性 | 值 |
|------|-----|
| **模型** | Claude OPUS High Thinking |
| **身份锚点** | "资深全栈工程师" |
| **核心职责** | 方案设计（规划阶段）/ 编码执行（实施阶段） |
| **关键约束** | 做完必须提交；自测后才能submit；每个Phase结束做git checkpoint |
| **可委派子Agent** | 是 |
| **输出格式** | 结构化完成报告：修改文件列表、测试结果、已知问题 |

#### 监察 (Inspector)

| 属性 | 值 |
|------|-----|
| **模型** | GPT 5.4 High Thinking |
| **身份锚点** | "高级QA技术主管" |
| **核心职责** | 方案挑战（规划阶段）/ 代码审查（实施阶段） |
| **关键约束** | 不直接修改代码；只输出审查意见；必须列出具体检查项和通过/失败状态 |
| **可委派子Agent** | 否（监察只审查，不执行） |
| **输出格式** | 结构化审查报告：通过/不通过、问题列表、风险等级 |

#### CEO (Chief Executive Officer)

| 属性 | 值 |
|------|-----|
| **模型** | 最强推理模型（GPT5.4 HT 或 OPUS HT） |
| **身份锚点** | "CTO/技术VP，对质量有极端执念" |
| **核心职责** | 关键节点决策、防御性拒绝执行、全局完成验证、分歧仲裁 |
| **关键约束** | 极度苛刻；不轻信完成声明；每次从零审视（无状态） |
| **Session 特性** | 可临时唤醒，不需要长期保持 |
| **可替换为人类** | 是 — CEO 是人类/AI 可切换的唯一角色 |

### 3.2 子 Agent 角色

子 Agent 是**预实例化的持久 session**，不是用完即弃的一次性工具。

#### 前端外包工程师

| 属性 | 值 |
|------|-----|
| **模型** | Sonnet High Thinking 或 GPT 5.4 |
| **身份** | "前端专项执行工程师" |
| **职责** | 前端修改的精确执行 |
| **约束** | 严格按委派指令执行；不做超范围修改；完成后必须submit_feedback |
| **可并发实例数** | 2+ |

#### 后端外包工程师

| 属性 | 值 |
|------|-----|
| **模型** | OPUS High Thinking |
| **身份** | "后端专项执行工程师" |
| **职责** | 后端修改的精确执行 |
| **约束** | 同上 |
| **可并发实例数** | 1-2 |

> 子 Agent 角色可按需扩展，但需遵循"执行者而非创意者"的定位原则。

---

## 4. 两阶段工作流

### 4.1 阶段概览

```
[阶段1: 规划对峙]                     [阶段2: 实施循环]
 规划专家 ↔ 规划监察                    实施专家 ↔ 实施监察
 ├─ 头脑风暴                            ├─ 按Phase编码
 ├─ 方案设计                            ├─ 代码审查
 ├─ 对峙直至共识                        ├─ Bug修复
 └─ router_vote投票                     └─ 子Agent并行委派
         │                                       │
         ▼                                       ▼
   CEO 门控审批                             CEO 终审验证
   (防御性拒绝2+轮)                        (全局完成确认)
         │                                       │
         ▼                                       ▼
   输出: 最终规划书                         任务正式完成
```

### 4.2 阶段1：规划对峙

#### 目标
通过两个 Agent 的对峙碰撞，产出高质量的技术方案和任务分解。

#### 参与角色
- 规划专家 (OPUS) — 方案产出者
- 规划监察 (GPT5.4) — 方案挑战者
- CEO — 最终裁决者（仅在投票通过后介入）
- 子 Agent: **不参与**

#### 对峙循环流程

```
用户通过 MLFB 提交任务描述和初始需求
        │
        ▼
MLRA 创建规划专家 session + 规划监察 session
        │
        ▼
MLRA 向专家注入: 初始需求 + "请产出技术方案和任务分解"
        │
        ▼
┌─ 对峙循环 ──────────────────────────────────────┐
│                                                  │
│  专家产出/修改方案 → submit                       │
│        │                                         │
│        ▼                                         │
│  MLRA 路由方案给监察（伪装为人类反馈）               │
│        │                                         │
│        ▼                                         │
│  监察审查方案 → 发现问题 → submit 反馈              │
│        │                                         │
│        ▼                                         │
│  MLRA 路由反馈给专家（伪装为人类反馈）               │
│        │                                         │
│  (循环直至双方达成共识)                             │
│                                                  │
└──────────────────────────────────────────────────┘
        │
        ▼ (双方认为方案成熟)
  router_vote 投票流程 (见 4.4)
        │
        ▼ (投票通过)
  CEO 门控审批 (见 4.5)
        │
        ▼ (CEO 通过)
  输出最终规划书 → 规划 session 可关闭
```

### 4.3 阶段2：实施循环

#### 目标
按规划书分 Phase 执行编码，通过交叉审查保证质量。

#### 参与角色
- 实施专家 (OPUS) — 编码执行
- 实施监察 (GPT5.4) — 代码审查
- CEO — 关键节点验证
- 子 Agent 池 — 由实施专家按需委派

#### 实施循环流程

```
MLRA 创建实施专家 session + 实施监察 session
MLRA 向专家注入: 规划书 + "开始执行Phase 1"
        │
        ▼
┌─ Phase 循环 ────────────────────────────────────┐
│                                                  │
│  专家编码 Phase X                                │
│  ├─ (可选) order 委派子Agent并行任务              │
│  ├─ (可选) check_orders 查看子Agent状态           │
│  ├─ 自测验证                                     │
│  ├─ git checkpoint                               │
│  └─ submit "Phase X 完成" + 完成报告              │
│        │                                         │
│        ▼                                         │
│  MLRA 路由给监察                                  │
│        │                                         │
│        ▼                                         │
│  监察审查代码（直接看仓库，不信专家自述）             │
│  ├─ 通过 → submit "Phase X 审查通过"              │
│  └─ 不通过 → submit 问题列表 → 路由给专家修复      │
│        │                                         │
│  (Phase通过后进入下一个Phase)                      │
│                                                  │
└──────────────────────────────────────────────────┘
        │
        ▼ (所有Phase完成)
  监察 submit "全部Phase审查通过"
        │
        ▼
  CEO 终审验证 (见 4.6)
        │
        ▼ (CEO 通过)
  任务正式完成 → 通知人类用户
```

### 4.4 Router Vote 机制

当对峙双方都认为方案已足够完善时，通过投票机制确认：

```
专家认为方案成熟 → 调用 router_vote(vote="pass", reason="...")
        │
        ▼
MLRA 记录: 专家票 ✓
MLRA 向监察注入: "专家认为方案已成熟并投票通过。请你也进行最终评估。"
        │
        ▼
监察评估 → 调用 router_vote(vote="pass/reject", reason="...")
        │
        ├─ 拒绝 → 理由发回专家，继续对峙
        │
        └─ 通过 → MLRA 记录: 监察票 ✓ → 双票通过
                         │
                         ▼
                   进入 CEO 门控审批
```

**规则**：
- 双方必须先后投票，不可同时
- 任何一方拒绝，重置投票状态，继续对峙
- 投票理由会附在 CEO 的审查材料中

### 4.5 防御性拒绝机制

防御性拒绝是 MLRA 的核心设计手段，服务于两个目的：
1. **质量保证** — 通过强制复检确保方案/代码质量
2. **长期运行引导** — 通过不同的拒绝话术引导 Agent 行为

#### CEO 门控防御性拒绝（规划阶段 router_vote 通过后）

至少执行 **2 轮** 拒绝，然后 CEO 做最终裁决：

**第1轮：需求回溯验证**
```
CEO → 专家:
  "在正式批准前，请重新阅读以下初始需求，逐条对照你的方案，
   确认每项需求都被充分覆盖。如果发现遗漏或偏差，请修改方案后重新提交。
   [初始需求原文]"

CEO → 监察:
  "方案已收到双方确认。请你作为最后一道防线重新审视这份方案。
   特别关注：是否存在你们讨论中可能忽略的边缘情况？
   方案的技术可行性是否经过严格论证？
   [初始需求原文]"
```

**第2轮：风险深度审查**
```
CEO → 监察:
  "请假设这个方案会在生产环境中运行6个月，
   列出所有可能导致系统故障的风险点，
   以及你们方案中没有考虑到的维护成本。"
```

**最终裁决**：
```
CEO 综合审查所有回复 → 
  ├─ 通过 → 输出最终规划书 → 进入实施阶段
  └─ 不通过 → 具体问题和改进要求发回双方 → 继续对峙
```

#### 拒绝话术变体

MLRA 可配置多种拒绝反馈信息来编排和引导 Agent 行为：

| 类型 | 目的 | 示例 |
|------|------|------|
| **需求对照型** | 验证需求覆盖度 | "重新阅读需求，逐条确认" |
| **魔鬼辩护型** | 暴露方案弱点 | "站在反对者的角度攻击这个方案" |
| **边缘场景型** | 发现遗漏 | "列出5个最可能导致失败的边缘情况" |
| **简化挑战型** | 避免过度设计 | "有没有更简单的方式实现？" |
| **时间维度型** | 长期视角 | "6个月后最可能后悔什么？" |

> 这些模板可作为配置文件存储在 `.mlra/rejection-templates/` 目录中。

### 4.6 CEO 终审验证（实施阶段完成后）

```
MLRA 唤醒 CEO session
        │
CEO 收到:
  ├─ 初始需求原文
  ├─ 规划书
  ├─ 每个 Phase 的完成摘要
  ├─ git log / diff 概览
  └─ 监察的最终审查报告
        │
        ▼
CEO 执行验证:
  ├─ 需求逐项对照
  ├─ 架构一致性检查
  ├─ 遗漏场景扫描
  └─ 整体质量评估
        │
        ├─ 通过 → 任务正式完成
        └─ 不通过 → 问题列表发回监察+专家 → 继续修复循环
```

---

## 5. 通信协议

### 5.1 核心原则

所有 Agent 间的通信都经过 MLRA 编排器中转，Agent 永远不直接互通。每个 Agent 认为自己是在与"人类工程师"交流。

通信采用 **入参-出参交叉模型**（Rendezvous），核心机制来源于 MLFB 的精妙设计：
- **MCP submit 是唯一的核心交换点** — Agent A 的 submit 入参经编排器路由后成为 Agent B 的 submit 出参
- **阻塞 = Agent 的 turn 未结束** — 不消耗额外 premium request（与 MLFB 一致）
- **ACP prompt() 仅用于初始化和紧急中断** — 每次消耗 1 premium request，最小化使用
- **人类介入 = 编排器拦截 submit 出参** — 不需要独立工具

```
成本模型:
  每个 Agent 整个生命周期 ≈ 1 premium request
  N 轮 Agent 间通信循环 = 0 额外成本
  
通信流:
  Agent A: submit(入参A) → [BLOCK]
  编排器: 入参A → 编排为 Agent B 的出参
  Agent B: 收到出参A → 工作 → submit(入参B) → [BLOCK]
  编排器: 入参B → 编排为 Agent A 的出参
  Agent A: 收到出参B → 继续工作...
```

### 5.2 主 Agent 通信工具

| 工具 | 使用者 | 阻塞性 | 语义 |
|------|--------|--------|------|
| **submit** | Expert, Inspector, CEO | **阻塞** | 提交入参 + 等待出参。核心交换机制。 |
| **router_vote** | Expert, Inspector | 快速返回 | 投票共识 |
| **order** | Expert | 非阻塞 | 委派任务给子 Agent |
| **check_orders** | Expert | 非阻塞 | 查看子 Agent 状态表 |
| **await_order_finish** | Expert | **阻塞** | 等待某个子 Agent 完成 |
| **submit_feedback** | Worker | **阻塞** | 提交完成 + 等待下一个任务 |

#### submit

主 Agent 向 MLRA 提交工作结果。在 Agent 看来，这等同于一次 MLFB 的 interactive_feedback 调用。

```
submit(
  type: "phase_complete" | "review_result" | "plan_draft" | "vote" | "final_complete",
  content: string,       // 结果内容（Markdown格式）
  metadata?: {
    phase?: string,      // 当前Phase标识
    passed?: boolean,    // 审查是否通过（监察用）
    issues?: string[],   // 发现的问题列表
  }
)
```

**阻塞行为**：
1. Agent 调用 submit → MCP Server 发送入参到编排器 → **HOLD 住 tool response**
2. 编排器将入参编排为目标 Agent 的出参（或拦截推送到 MLFB UI 等待人类）
3. 对方 Agent 的 submit 入参到达 → 成为本 Agent 的 submit 出参 → Agent 继续
4. **整个过程不消耗额外的 premium request**

**人类介入**（无需独立 request_human 工具）：
- **auto 模式**：AI CEO 的 submit 入参直接编排为对方的出参
- **manual 模式**：编排器拦截 submit，推送到 MLFB UI，等待人类修改后才返回出参
- **hybrid 模式**：编排器先让 AI CEO 生成初步意见，连同材料推送到 MLFB UI，人类可采纳/修改/覆盖

#### router_vote

对峙双方在共识阶段使用的投票工具。

```
router_vote(
  vote: "pass" | "reject",
  reason: string           // 投票理由
)
```

### 5.3 子 Agent 通信工具

#### order

主 Agent 向子 Agent 委派任务。

```
order(
  worker_id: string,         // 目标子Agent ID
  task_description: string,  // 任务描述（必须是清晰明了的执行方案，不可模棱两可）
  priority?: "normal" | "high"
)
```

**行为**：编排器分配空闲 Worker（或创建新 Worker），将 order 内容作为 Worker 的 submit_feedback 出参发送。立即返回 `{ worker_id, status: "dispatched" }`。

#### check_orders

主 Agent 查看子 Agent 状态信息表。**非阻塞，纯信息查询。**

```
check_orders() → 立即返回子Agent状态信息表
```

#### await_order_finish

主 Agent 等待某个子 Agent 完成任务。**阻塞**：HOLD 住 tool response 直到目标 Worker 调用 submit_feedback。

```
await_order_finish(
  worker_id: string,
  timeout_hint?: string    // 可选的超时提示（非硬性限制）
)
```

#### submit_feedback (子Agent专用)

子 Agent 完成任务后的反馈提交。**阻塞**：Worker 提交结果后 HOLD，等待下一个任务或 standby 指令。

```
submit_feedback(
  result: string,           // 执行结果
  files_modified?: string[] // 修改的文件列表
)
```

**行为**：Worker 的 submit_feedback 入参路由给 Expert（解除 await_order_finish 阻塞或更新状态表），有新 order 时任务作为 submit_feedback 出参返回给 Worker。

### 5.4 状态信息表

子 Agent 的状态通过信息表在主 Agent 上下文中呈现：

```markdown
## 子Agent状态信息表

| Agent ID | 角色 | 状态 | 当前任务 | 最近任务历史 |
|----------|------|------|---------|-------------|
| worker-1 | 前端外包 | working | "修改登录页面样式" | ["修复导航栏bug", "添加暗色主题"] |
| worker-2 | 前端外包 | ready | - | ["实现用户头像组件"] |
| worker-3 | 后端外包 | broken | "重构API认证" | ["添加缓存层"] |
```

**注入方式**（两种并行）：
- **被动注入**：通过 hook 在每次 tool call 时自动注入到主 Agent 上下文
- **主动查询**：主 Agent 调用 `check_orders` 按需获取

### 5.5 尾部注入提示

参考 MLFB 现有机制，每次向 Agent 注入消息时在尾部附加角色提醒：

```
[SYSTEM REMINDER]
你是 {角色名}。你正在与工程团队负责人交流。
当前阶段: {阶段名}
当前Phase: {phase_id} (如适用)
你必须使用 submit 工具提交你的工作结果。
不要在没有提交结果的情况下结束对话。
```

可由各 Agent 的系统提示词自定义此模板。MLRA 也可以在路由消息时追加 Agent 间的"警示"。

---

## 6. 子 Agent 生命周期

### 6.1 状态机

```
[创建session] → ready ──→ working ──→ ready (循环复用)
                  ▲                       │
                  │                       │
                  └───────────────────────┘
                  
                         working
                           │
                           ▼ (异常)
                        broken ──→ [MLRA自动恢复] ──→ ready
                                         │
                                     (多次失败)
                                         ▼
                                  [销毁+重建session]
```

**状态说明**：
- **ready**：空闲等待，session 处于 MLFB 挂起状态
- **working**：正在执行委派任务
- **broken**：异常断连（session 崩溃、未正常 submit、网络问题、限流等）

### 6.2 健康检查

MLRA 对每个子 Agent session 执行周期性健康检查：

- **Heartbeat 检测**：检测 session 进程是否存活
- **超时检测**：working 状态超过预设时间阈值未提交结果
- **未提交检测**：任务完成但 Agent 未调用 submit_feedback（可能 Agent "忘记"了）

### 6.3 Broken 恢复流程

```
检测到 broken
     │
     ▼
标记子Agent状态为 broken
     │
     ▼
尝试通过 Copilot CLI 重新激活 session
     │
     ▼
注入恢复提示: "你刚才出了故障，请使用 submit_feedback 重新进入就绪状态"
     │
     ├─ 成功 → 状态恢复为 ready
     │
     └─ 失败 → 重试N次
              │
              └─ 仍然失败 → 销毁 session，创建新 session（上下文丢失）
                           → 将未完成任务标记为待重新分配
                           → 通知主 Agent 该 worker 已重建
```

### 6.4 上下文管理

- 子 Agent 的上下文由 Copilot CLI 的自动压缩机制管理，MLRA 不干预
- 主 Agent 应尽可能将同类任务分配给同一子 Agent，保持上下文连贯性
- 状态信息表中的"最近任务历史"帮助主 Agent 做路由决策

---

## 7. CEO 模式

### 7.1 三种运行模式

| 模式 | 描述 | 适用场景 |
|------|------|---------|
| **auto** | AI CEO 全自动决策，人类仅收通知 | 成熟的低风险任务，后台运行 |
| **manual** | 人类 CEO，关键节点完全由人类审批 | 高风险任务，首次使用 MLRA |
| **hybrid** | AI CEO 预审 + 人类最终确认 | 日常开发（推荐默认） |

### 7.2 各模式工作方式

#### auto
```
关键节点触发 → AI CEO session 唤醒 → CEO 自动审查裁决 → 继续流程
                                      │
                              同时推送通知到MLFB（不等待人类）
```

#### manual
```
关键节点触发 → MLRA 将审查材料推送到 MLFB UI
           → 人类在 MLFB 中审查所有材料
           → 人类撰写反馈/做出决策
           → MLRA 将人类反馈注入流程
```

#### hybrid
```
关键节点触发 → AI CEO 先审查，给出初步意见和建议
           → AI分析 + 审查材料 一起推送到 MLFB UI
           → 人类参考 AI 分析后做最终决策
           → 人类可以：采纳AI意见 / 修改 / 完全覆盖
           → MLRA 注入最终决策到流程
```

### 7.3 CEO 的特殊属性

- **无状态**：每次介入只看当前快照，不带历史偏见
- **临时 Session**：不需要像监察/专家保持长期 session，可唤醒即用
- **人类无缝接管**：切换到 manual 模式时，MLFB UI 直接成为 CEO 的操作台
- **成本可控**：整个任务周期内 CEO 只介入 5-7 次

---

## 8. 异常处理与安全机制

### 8.1 停滞检测

参考 oh-my-openagent 的 stagnation detection：

- **对峙停滞**：连续 N 轮监察给出相同类型的反馈 → CEO 介入仲裁
- **实施停滞**：连续 N 轮修复同一个问题 → CEO 评估是否需要调整方案
- **子 Agent 停滞**：working 状态下长时间无工具调用 → 标记为 broken

### 8.2 分歧仲裁

当监察和专家产生不可调和的分歧时：
- MLRA 检测到 N 轮循环后双方立场未变化
- 触发 CEO 介入
- CEO 的裁决作为最终决定，不可上诉（除非人类介入）

### 8.3 人类随时介入

无论任何时刻，人类都可通过 MLFB UI：
- 暂停整个 MLRA 流程
- 向任何 Agent 注入指令
- 切换 CEO 模式
- 接管任何角色
- 终止任务

这是 MLRA 相对于完全自动化 Agent 系统的核心优势。

### 8.4 Session 异常恢复

| 异常 | 检测方式 | 恢复 |
|------|---------|------|
| Agent 未 submit 就结束 | session idle 检测 | 重新注入提示要求 submit |
| Session 进程崩溃 | 进程存活检测 | CLI 重启 session |
| 网络限流 | 错误码检测 | 退避重试 |
| 上下文溢出 | Copilot 自动压缩 | 无需干预 |

---

## 9. 与 MLFB 的关系

### 9.1 进化路径

```
MLFB (现在)                        MLRA (未来)
━━━━━━━━━━━━━━━━━                 ━━━━━━━━━━━━━━━━━━━
人类 ←→ 单Agent                   人类(CEO) ←→ 多Agent编排
每次都要人类响应                    只在关键节点需要人类
人类是唯一的反馈者                  人类可以委托给AI CEO
手动的human-in-the-loop           可调节的自动化程度
```

### 9.2 MLFB 复用

MLRA 直接复用 MLFB 的以下能力：
- **阻塞式工具调用机制**：MLFB 的 `requestFeedbackViaIpc` 阻塞模式 = MLRA submit 的阻塞模式（核心同构）
- **IPC 通信机制**：Agent ↔ MLFB 的消息传递（TCP socket 模式）
- **多 Session 管理**：每个 Agent = 一个 caller session
- **挂起等待机制**：Agent submit 后自然挂起等待（=MCP 工具阻塞）
- **尾部注入机制**：角色提醒和行为引导
- **HOOK 系统**：agent_name 自动生成、tool call 监控
- **UI 基础设施**：session 切换、消息展示、用户输入
- **成本模型**：MLFB 的"工具调用不消耗额度"机制完美延伸到多 Agent 场景

### 9.3 MLFB 需新增的能力

| 新增功能 | 用途 |
|---------|------|
| CEO 模式切换 | 设置面板选择 auto/manual/hybrid |
| 关键节点通知 | manual/hybrid 模式下推送待审查项 |
| AI CEO 意见展示 | hybrid 模式下展示 AI 分析供参考 |
| 全局仪表盘 | 展示阶段进度、Agent 状态、CEO 审批记录 |
| 子 Agent 状态面板 | 展示子 Agent 池状态信息表 |
| 流程控制按钮 | 暂停/继续/终止 MLRA 流程 |

---

## 10. 配置系统

### 10.1 MLRA 配置文件

```
.mlra/
├── config.yaml                    # 全局配置
├── agents/
│   ├── expert.yaml                # 专家配置
│   ├── inspector.yaml             # 监察配置
│   └── ceo.yaml                   # CEO配置
├── workers/
│   ├── frontend-worker.yaml       # 前端外包配置
│   └── backend-worker.yaml        # 后端外包配置
├── prompts/
│   ├── expert-planning.md         # 规划阶段专家系统提示
│   ├── expert-execution.md        # 实施阶段专家系统提示
│   ├── inspector-planning.md      # 规划阶段监察系统提示
│   ├── inspector-execution.md     # 实施阶段监察系统提示
│   ├── ceo.md                     # CEO系统提示
│   └── tail-injection.md          # 尾部注入模板
└── rejection-templates/
    ├── requirements-check.md      # 需求对照型
    ├── devil-advocate.md          # 魔鬼辩护型
    ├── edge-cases.md              # 边缘场景型
    ├── simplification.md          # 简化挑战型
    └── time-perspective.md        # 时间维度型
```

### 10.2 config.yaml 示例

```yaml
mlra:
  ceo_mode: hybrid               # auto | manual | hybrid
  
  planning:
    min_defensive_rejections: 2   # 最少防御性拒绝轮次
    
  execution:
    ceo_spot_check: true          # CEO是否抽查中间Phase
    ceo_spot_check_frequency: 3   # 每N个Phase抽查一次

  workers:
    max_count: 4                  # 子Agent池最大数量
    health_check_interval: 30s    # 健康检查间隔
    broken_retry_max: 3           # broken状态最大重试次数
    
  stagnation:
    max_same_feedback: 5          # 连续相同反馈N次触发停滞
    ceo_arbitration: true         # 停滞时是否触发CEO仲裁
```

---

## 11. 实现路径

> **v0.4 更新 (2026-04-10)**: 从 ACP/Rust MVP 路径迁移到 VS Code + register_LRA 路径。

### Phase 1: register_LRA 核心 ✅ PoC 已验证
- 实现 `register_LRA` MCP 工具（复用 MLFB MCP Server 架构）
- 创建 `.agent.md` 模板（专家/监察/CEO 角色 prompt）
- Hook 扩展：SessionStart TCP 通知 MLFB Desktop session_id
- 单 Agent register → 阻塞 → 编排器控制返回
- **PoC 已完成**：`chat.open` mode 参数、modelSelector、blockOnResponse 均已验证

### Phase 2: 双主 Agent 循环
- 实现 submit 入参-出参交叉路由（专家 ↔ 监察）
- 实现 session_id → Agent 角色映射
- 规划阶段的对峙循环
- MLFB UI 中展示 MLRA Agent 状态

### Phase 3: CEO 角色 + 子 Agent
- 实现 router_vote 投票机制
- 实现防御性拒绝调度
- CEO 的三种模式（auto/manual/hybrid）
- 子 Agent 池管理（order/check_orders/submit_feedback）
- 状态信息表注入

### Phase 4: 两阶段完整流程
- 规划→实施阶段切换
- 全流程贯通测试
- UI 仪表盘集成（MLFB 扩展四列布局）

> 详细路径规划见：[`MLC_MLRA_VSCode自动化方案规划.md`](MLC_MLRA_VSCode自动化方案规划.md) §5

---

## 12. 关键设计决策记录

| 决策 | 理由 |
|------|------|
| MCP 阻塞交叉为核心通信方式 | MLFB 精妙设计的多 Agent 扩展：submit 入参-出参交叉，不消耗额外 premium request |
| ACP 仅用于初始化和紧急中断 | 每次 ACP prompt() 消耗 1 premium request，最小化使用 |
| 不设独立的 request_human 工具 | submit 阻塞本身就是人类介入点，编排器拦截出参即可 |
| Agent认为自己在和人类交流 | 保持Agent心智模型稳定性，避免Agent间直接通信带来的角色混乱 |
| CEO可人类/AI切换 | 在全自动和全人工之间提供渐进光谱，适应不同风险等级的任务 |
| 子Agent预实例化而非用完即弃 | 保持上下文连贯性，同类任务路由到同一worker提高效率 |
| 防御性拒绝作为设计手段 | 不仅是安全机制，更是引导Agent深度思考、保证输出质量的核心方法 |
| 基于VS Code Copilot Chat而非CLI/ACP | 无需学习CLI工具链，复用VS Code已有UI，register_LRA方案复用MLFB成熟架构，无需VS Code扩展 |
| 不设硬性循环上限 | 硬性限制会导致不完整的输出。通过停滞检测和CEO仲裁实现更智能的退出 |

---

## 13. oh-my-openagent 参考借鉴总结

| oh-my-openagent 机制 | MLRA 对应设计 |
|---------------------|-------------|
| Ralph Loop (completion promise检测) | 防御性拒绝 + CEO验证（更深度的质量保证） |
| TODO Continuation Enforcer | submit 机制（Agent必须主动提交才能推进循环） |
| Oracle 第三方验证 | CEO 角色（可人类切换的第三方验证者） |
| Sisyphus 主编排 | MLRA 编排器（外部编排而非Agent内编排） |
| BackgroundManager 并发控制 | 子Agent池管理 + 状态信息表 |
| Tmux SubAgent 多pane | 多 CLI session（原理类似但更轻量） |
| Boulder State 任务持久化 | 规划书 + Phase追踪（文件化的任务锚点） |
| stagnation detection | 停滞检测 + CEO仲裁 |
| Tail injection (system directive) | 尾部注入提示（角色提醒 + 行为引导） |

---

## 14. 提示词组装策略

### 14.1 四主 Agent 提示词 = 2 阶段 × 2 角色

| # | Agent | 阶段 | 角色 | 提示词文件 |
|---|-------|------|------|-----------|
| 1 | 规划专家 (Planning Expert) | 规划对峙 | Expert | `.mlra/prompts/expert-planning.md` |
| 2 | 规划监察 (Planning Inspector) | 规划对峙 | Inspector | `.mlra/prompts/inspector-planning.md` |
| 3 | 实施专家 (Execution Expert) | 实施循环 | Expert | `.mlra/prompts/expert-execution.md` |
| 4 | 实施监察 (Execution Inspector) | 实施循环 | Inspector | `.mlra/prompts/inspector-execution.md` |

### 14.2 组装结构

每个 Agent 提示词的统一结构：

```
[共用] Identity Override               ← buildAgentIdentitySection()
[共用] Hard Blocks + Anti-Patterns      ← buildHardBlocksSection() + buildAntiPatternsSection()

[角色特定] Role Definition              ← 根据阶段和角色组装
[角色特定] Phase Behavior               ← 从 Sisyphus/Momus/Metis/Oracle 复制

[MLRA特定] Tool Protocol                ← submit/order/router_vote 工具说明
[MLRA特定] Tail Injection Template      ← 尾部注入模板

[共用] Tone & Style                     ← Sisyphus Tone_and_Style
```

### 14.3 原文复用映射

| 源文件 (oh-my-openagent) | 复用到的 Agent | 复用段落 |
|--------------------------|---------------|---------|
| Sisyphus Phase 0 (Intent Gate) | **规划专家** | 意图分析、分类、上下文完备性检查 |
| Sisyphus Phase 1 (Codebase Assessment) | **规划专家** | 代码库状态评估和分类 |
| Sisyphus Phase 2A (Exploration) | **规划专家** | 并行搜索、Explore/Librarian 使用模式 |
| Sisyphus Phase 2B (Implementation) | **实施专家** | 委派模板、Session延续、代码修改规则 |
| Sisyphus Phase 2C (Failure Recovery) | **实施专家** | 3次失败→停止→回退 |
| Sisyphus Phase 3 (Completion) | **实施专家** | 完成清单、证据要求 |
| Sisyphus Tone/Style | **所有4个** | 简洁、无谄媚、无状态更新 |
| Momus (Approval Bias) | **规划监察 + 实施监察** | 审批偏向、4项检查、反模式 |
| Metis (Intent Classification) | **规划专家** | 6类意图分类和特定分析策略 |
| Metis (AI-Slop Patterns) | **规划监察** | 范围膨胀、过早抽象等检测 |
| Oracle (Decision Framework) | **规划专家** | 实用极简主义、投资信号 |
| Oracle (High-Risk Self-Check) | **实施监察** | 高风险场景额外审查 |
| Explore (Search Specialist) | **规划专家** | 并行搜索、结构化结果格式 |
| Librarian (Doc Discovery) | **规划专家** | 文档发现、请求分类 |
| Anti-Duplication | **实施专家** | 委派后不重复搜索 |

### 14.4 复制比例

- **规划专家**：~70% 原文复制（Sisyphus Phase 0-2A + Explore + Metis）
- **规划监察**：~85% 原文复制（Momus 几乎全部可用 + Metis AI-Slop）
- **实施专家**：~80% 原文复制（Sisyphus Phase 2B-3 几乎全部可用）
- **实施监察**：~60% 原文复制（Momus + Oracle 部分段落，代码审查部分需新写）

### 14.5 MLRA 新增内容（约20%）

- 各 Agent 的 submit / order / router_vote 工具使用说明
- 规划对峙循环的行为描述
- 实施循环的 Phase 推进规则
- 尾部注入模板（与 Agent 提示词配合）

---

*文档结束。后续更新将在此基础上迭代。*
