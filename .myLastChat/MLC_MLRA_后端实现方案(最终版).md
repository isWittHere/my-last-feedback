---
title: "MLRA 后端实现方案 (最终版)"
description: "独立 MLRA MCP Server 的完整后端实现方案，含模块设计、工具定义、状态机、消息路由"
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - MLRA
    - MCP-server
    - orchestrator
    - backend
    - implementation
---

# MLRA 后端实现方案 (最终版)

> 版本: v1.0 | 日期: 2026-04-10  
> 基于: `MLC_MLRA架构设计文档.md` (v0.4) + `MLC_MLRA_VSCode自动化方案规划.md` (v0.2)

---

## 1. 项目定位

### 1.1 与 MLFB 的关系

```
┌─ .mcp.json ──────────────────────────────────────────┐
│  "my-last-feedback":     { "command": "node server.mjs" }     ← MLFB (已有)  │
│  "my-long-running-agent": { "command": "node mlra-server/server.mjs" } ← MLRA (新建) │
└──────────────────────────────────────────────────────┘
```

- **MLFB MCP Server** (`server.mjs`): 人类反馈工具 (`interactive_feedback`, `register_agent`)
- **MLRA MCP Server** (`mlra-server/server.mjs`): 多 Agent 编排工具 (`register_LRA`, `submit`, `order` 等)
- 完全独立进程，互不干扰，**绝不混用**
- 共享同一个 Tauri 桌面端 (MLFB UI 区域 vs MLRA UI 区域)
- MLRA 完全自治：阻塞机制本身即人工介入点，无需 MLFB 的 `interactive_feedback`
- 人工介入 = 编排器暂停 submit → MLRA UI 展示内容 → 人类可修改后点击通过

### 1.2 单一服务多 Agent

每个 MLRA Agent 独立连接到同一个 MLRA MCP Server 实例（通过 stdio）。  
但由于 **MCP stdio 是 1:1 的** (一个 stdin/stdout 对应一个 Agent)，实际上每个 Agent 启动一个独立的 `server.mjs` 进程。

**关键问题**: 多个 server.mjs 进程之间如何共享编排状态？

**方案: 共享状态服务 (Orchestrator Daemon)**

```
┌─ Agent A ─┐     ┌─ Agent B ─┐     ┌─ Agent C ─┐
│ MCP stdio  │     │ MCP stdio  │     │ MCP stdio  │
└─────┬──────┘     └─────┬──────┘     └─────┬──────┘
      │                  │                  │
┌─────┴──────────────────┴──────────────────┴──────┐
│           mlra-server/server.mjs (进程 A)          │
│           mlra-server/server.mjs (进程 B)          │
│           mlra-server/server.mjs (进程 C)          │
│                     │ TCP                         │
│                     ▼                             │
│           ┌─────────────────────┐                 │
│           │ Orchestrator Daemon │ ← 单一进程       │
│           │ (mlra-server/       │                 │
│           │  orchestrator-      │                 │
│           │  daemon.mjs)        │                 │
│           └────────┬────────────┘                 │
│                    │ TCP                          │
│                    ▼                              │
│           ┌─────────────────┐                     │
│           │ MLFB Tauri App  │                     │
│           └─────────────────┘                     │
└───────────────────────────────────────────────────┘
```

每个 `server.mjs` 进程 (MCP Server) 是 **无状态网关**，所有编排状态集中在 **Orchestrator Daemon** 中。MCP Server 进程通过 TCP 与 Daemon 通信。

---

## 2. 目录结构

```
mlra-server/
├── package.json              # 独立 npm 包
├── server.mjs                # MCP Server 入口 (无状态网关)
│                               - MCP 工具定义 (register_LRA, submit, order, ...)
│                               - 每个 Agent 一个进程
│                               - 通过 TCP 连接 Orchestrator Daemon
│
├── daemon.mjs                # Orchestrator Daemon 入口
│                               - 独立长驻进程
│                               - TCP 服务端 (接收 MCP Server 进程请求)
│                               - TCP 客户端 (连接 MLFB 桌面端)
│
├── orchestrator.mjs          # 编排状态机 (独立模块)
│                               - 纯逻辑，无 I/O
│                               - Agent 注册、角色绑定
│                               - 阶段管理 (规划 / 实施)
│                               - Submit 路由决策
│                               - 投票计数
│                               - 防御性拒绝调度
│                               - 停滞检测
│
├── router.mjs                # 消息路由模块
│                               - submit 入参-出参交叉
│                               - 阻塞队列管理 (Promise resolve/reject)
│                               - CEO 门控路由
│                               - Worker 任务分派
│
├── ipc-bridge.mjs            # MLFB 桌面端通信桥接
│                               - TCP 连接 MLFB Tauri App
│                               - MLRA 事件推送 (agent 状态、阶段变更)
│                               - 用户操作接收 (开始编排、暂停、角色配置)
│
├── protocol.mjs              # 协议定义
│                               - MCP Server ↔ Daemon 消息类型
│                               - Daemon ↔ MLFB App 消息类型
│                               - 共用数据结构
│
└── config.mjs                # 配置管理
                                - 编排参数 (CEO 模式、停滞阈值等)
                                - 拒绝模板加载
```

---

## 3. 协议设计

### 3.1 MCP Server ↔ Daemon 协议 (TCP JSON-line)

**方向: MCP Server → Daemon (请求)**

```typescript
// Agent 注册
{ type: "agent_register", callerId: string, alias: string, workspace: string }

// Agent 提交 (阻塞)
{ type: "agent_submit", callerId: string, submitType: string, content: string, metadata?: object }

// Agent 投票
{ type: "agent_vote", callerId: string, vote: "pass" | "reject", reason: string }

// Expert 委派子 Agent
{ type: "agent_order", callerId: string, workerId: string, taskDescription: string, priority?: string }

// Expert 查看子 Agent 状态
{ type: "agent_check_orders", callerId: string }

// Expert 等待子 Agent
{ type: "agent_await_order", callerId: string, workerId: string, timeoutHint?: string }

// Worker 反馈
{ type: "worker_submit_feedback", callerId: string, result: string, filesModified?: string[] }
```

**方向: Daemon → MCP Server (响应)**

```typescript
// 通用响应 (解除阻塞)
{ type: "resolve", callerId: string, content: string, metadata?: object }

// 错误
{ type: "error", callerId: string, message: string }

// check_orders 响应 (非阻塞)
{ type: "orders_status", callerId: string, orders: WorkerStatusEntry[] }
```

### 3.2 Daemon ↔ MLFB 桌面端协议 (TCP JSON-line)

**方向: Daemon → MLFB App (推送)**

```typescript
// Agent 注册通知
{ type: "mlra_agent_registered", callerId: string, alias: string, workspace: string, launcherId: string }

// Agent 状态变更
{ type: "mlra_agent_status", callerId: string, status: string, detail?: string }

// 阶段变更
{ type: "mlra_phase_change", launcherId: string, phase: "planning" | "implementation", info?: string }

// CEO 审查请求 (manual/hybrid 模式需用户参与)
{ type: "mlra_ceo_review_request", launcherId: string, reviewData: object }

// 编排事件 (round 开始/结束)
{ type: "mlra_round_event", launcherId: string, event: "start" | "end", round: RoundRecord }

// Worker 状态变更
{ type: "mlra_worker_status", launcherId: string, workerId: string, status: string, task?: string }
```

**方向: MLFB App → Daemon (用户操作)**

```typescript
// 角色分配
{ type: "mlra_assign_role", callerId: string, role: AgentRole, workerRole?: string }

// 开始编排
{ type: "mlra_start_orchestration", launcherId: string, config?: object }

// 暂停/恢复编排
{ type: "mlra_pause", launcherId: string }
{ type: "mlra_resume", launcherId: string }

// 人类 CEO 反馈 (manual/hybrid 模式)
{ type: "mlra_ceo_feedback", launcherId: string, decision: string, content: string }

// 终止编排
{ type: "mlra_terminate", launcherId: string }

// 人类注入指令 (向任何 Agent)
{ type: "mlra_inject_message", callerId: string, content: string }
```

---

## 4. 编排状态机 (`orchestrator.mjs`)

### 4.1 Launcher 状态

```
[created] → configuring → ready → running → completed
                                     │  ↑
                                     ▼  │
                                   paused
                                   
                          (任何状态) → cancelled
```

- **configuring**: Agent 陆续注册中，用户配置角色
- **ready**: 所有必要角色 (expert + inspector) 已就位
- **running**: 编排进行中
- **paused**: 人类暂停
- **completed**: 全部任务完成
- **cancelled**: 人类终止

### 4.2 Agent 状态

```
[registered] → idle → working → idle (循环)
                        │
                     blocked (等待对方 submit)
```

对主 Agent (Expert/Inspector/CEO):
- **registered**: 已调用 register_LRA，等待角色分配和编排启动
- **idle**: 等待编排器分配任务 (register_LRA / submit 阻塞中)
- **working**: Agent 已收到指令正在处理 (submit 已返回)
- **blocked**: Agent 已 submit，等待对方响应 (submit 再次阻塞)

对 Worker:
- **ready**: 空闲等待 (submit_feedback 阻塞中)
- **working**: 正在执行任务 (submit_feedback 已返回)
- **broken**: 异常

### 4.3 4 主 Agent + CEO + Worker 角色体系

```typescript
// 6 种角色 (4 主 Agent 按阶段细分)
type AgentRole = 
  | "planning-expert"       // 规划专家
  | "planning-inspector"    // 规划监察
  | "execution-expert"      // 实施专家
  | "execution-inspector"   // 实施监察
  | "ceo"                   // CEO (跨阶段介入)
  | "worker";               // 子 Agent

// 阶段绑定
const PHASE_AGENTS = {
  planning: ["planning-expert", "planning-inspector"],
  implementation: ["execution-expert", "execution-inspector"],
  cross: ["ceo"],   // CEO 跨阶段
};
```

**用户需创建 4-6+ 个 Chat Session**:
1. `mlra-planning-expert` → register_LRA → 分配角色"规划专家"
2. `mlra-planning-inspector` → register_LRA → 分配角色"规划监察"  
3. `mlra-execution-expert` → register_LRA → 分配角色"实施专家"
4. `mlra-execution-inspector` → register_LRA → 分配角色"实施监察"
5. `mlra-ceo` → register_LRA → 分配角色"CEO"
6. (可选) N 个 `mlra-worker` session

**阶段切换时**:
- 规划完成 → 规划 Agent 保持待命 (register_LRA/submit 继续阻塞)
- 实施阶段启动 → resolve execution-expert + execution-inspector 的 register_LRA
- 需要回退修改规划时 → 可重新唤醒规划 Agent

### 4.4 编排状态机

```typescript
interface OrchestratorState {
  // Launcher
  launcherId: string;
  status: "configuring" | "ready" | "running" | "paused" | "completed" | "cancelled";
  
  // 阶段
  phase: "planning" | "implementation";
  currentPhaseId: string | null;     // e.g. "Phase 1", "Phase 2"
  
  // Agent 注册表 (4 主 Agent + CEO + Workers)
  agents: Map<string, {
    callerId: string;
    alias: string;
    role: AgentRole | null;
    workerRole: string;
    status: "registered" | "idle" | "blocked" | "working" | "standby";
    pendingResolve: ((content: string) => void) | null;  // 阻塞的 MCP 调用的 resolve
  }>;
  //                          注意 "standby" — 规划 Agent 在实施阶段处于此状态
  
  // 投票状态
  votes: {
    expertVote: { vote: string; reason: string } | null;
    inspectorVote: { vote: string; reason: string } | null;
  };
  
  // 防御性拒绝
  defensiveRejectionCount: number;
  minDefensiveRejections: number;    // 配置项，默认 2
  
  // 停滞检测
  sameFeedbackCount: number;
  lastFeedbackHash: string | null;
  
  // 子 Agent 任务
  workerOrders: Map<string, {
    workerId: string;
    taskDescription: string;
    status: "dispatched" | "working" | "completed";
    result: string | null;
  }>;
  
  // Round 记录
  rounds: RoundRecord[];
  currentRound: RoundRecord | null;
  
  // 配置
  controlMode: "autopilot" | "ceo-override" | "full-override";
  // autopilot:      全自动，所有 submit 自动路由，不暂停
  // ceo-override:   仅 CEO 环节暂停等待人工审查
  // full-override:  所有 submit 暂停等待人工审查后才继续
  // 模式可运行时切换，取代暂停/继续按钮
  
  // 人工介入 (利用阻塞机制)
  // "暂停" = 不 resolve 某个 Agent 的 submit
  // "修改" = 人类通过 MLRA UI 编辑 submit 内容后再 resolve
  humanReviewPending: {
    callerId: string;
    originalContent: string;
    submitType: string;
  } | null;
}
```

### 4.4 核心编排逻辑

#### 规划对峙循环

```
1. 编排启动 → 向 Expert 发送初始任务 (resolve register_LRA)
2. Expert 工作 → submit(type="plan_draft", content="方案v1")
3. 编排器收到 Expert submit → 路由给 Inspector (resolve Inspector 的 submit)
   注入: "[来自工程团队负责人] 请审查以下方案: {content}"
4. Inspector 工作 → submit(type="review_result", content="发现问题X/Y/Z")
5. 编排器收到 Inspector submit → 路由回 Expert (resolve Expert 的 submit)
   注入: "[来自工程团队负责人] 审查反馈: {content}"
6. 循环 2-5 直到双方调用 router_vote
7. 双票通过 → CEO 门控审批 → 防御性拒绝 → 最终通过 → 进入实施阶段
```

#### 实施循环

```
1. 编排器向实施 Expert 注入: 规划书 + "开始执行 Phase 1"
2. Expert 编码 → (可选) order 委派 Worker → submit(type="phase_complete", content="报告")
3. 编排器路由给实施 Inspector
4. Inspector 审查 → submit(type="review_result", passed=true/false)
5. 通过 → 下一个 Phase; 不通过 → 问题列表路由回 Expert
6. 所有 Phase 完成 → CEO 终审
```

---

## 5. MCP 工具定义

### 5.1 register_LRA

```typescript
// 入参
{
  workspace: string;       // 工作区路径 (用于 Launcher 关联)
}

// 出参 (阻塞直到编排启动)
{
  role: string;            // 分配的角色
  initial_instruction: string;  // 初始指令 (角色 prompt + 首个任务)
  tools_available: string[];    // 该角色可用的工具列表
}
```

**行为**: 调用后 MCP 工具阻塞 (不返回)。编排器收到注册 → 推送到 UI → 用户分配角色 → 用户点击"开始编排" → 编排器 resolve 所有 register_LRA → Agent 收到初始指令。

### 5.2 submit

```typescript
// 入参
{
  type: "plan_draft" | "review_result" | "phase_complete" | "final_complete";
  content: string;        // Markdown 格式的提交内容
  metadata?: {
    phase?: string;       // 当前 Phase 标识
    passed?: boolean;     // 审查是否通过 (Inspector 用)
    issues?: string[];    // 发现的问题列表
  }
}

// 出参 (阻塞直到对方 submit 或编排器注入)
{
  instruction: string;     // 编排器路由过来的指令/对方内容
  context?: object;        // 附加上下文 (如子 Agent 状态表)
}
```

**行为**:
1. Agent 调用 submit → MCP Server 发送到 Daemon → **HOLD 住 tool response**
2. 编排器将入参编排为目标 Agent 的出参 → resolve 目标 Agent 的 submit
3. 对方 Agent submit 后 → 编排器 resolve 本 Agent 的 submit → Agent 继续
4. 人类介入: 编排器将 submit 内容推送到 MLFB UI → 等人类反馈 → resolve

### 5.3 router_vote

```typescript
// 入参
{
  vote: "pass" | "reject";
  reason: string;
}

// 出参 (快速返回)
{
  status: "recorded" | "rejected";
  message: string;
}
```

### 5.4 order

```typescript
// 入参
{
  worker_id?: string;      // 指定 Worker ID (可选，不指定则自动分配)
  task_description: string;
  priority?: "normal" | "high";
}

// 出参 (快速返回，非阻塞)
{
  worker_id: string;
  status: "dispatched";
}
```

### 5.5 check_orders

```typescript
// 入参: 无

// 出参 (快速返回)
{
  orders: Array<{
    worker_id: string;
    role: string;
    status: "ready" | "working" | "broken";
    current_task: string | null;
    recent_history: string[];
  }>;
}
```

### 5.6 await_order_finish

```typescript
// 入参
{
  worker_id: string;
  timeout_hint?: string;
}

// 出参 (阻塞直到 Worker 完成)
{
  result: string;
  files_modified?: string[];
}
```

### 5.7 submit_feedback (Worker 专用)

```typescript
// 入参
{
  result: string;
  files_modified?: string[];
}

// 出参 (阻塞直到下一个任务)
{
  task_description: string;   // 下一个任务; 或 "standby" 表示待命
  priority?: string;
}
```

---

## 6. Daemon 生命周期

### 6.1 启动与发现

Daemon 是独立长驻进程，使用与 MLFB 类似的端口自动发现机制:

```
端口范围: 19871-19880 (与 MLFB 19850-19870 不重叠)
锁文件: %TEMP%/my-long-running-agent.port (或 -dev.port)
```

**启动时机**: 
- 第一个 MLRA MCP Server 进程启动时检测 Daemon 是否运行
- 若未运行 → 自动 spawn Daemon 进程
- 若已运行 → 直接连接

### 6.2 Daemon 内部结构

```javascript
// daemon.mjs 伪代码
class OrchestratorDaemon {
  // TCP 服务端 — 接受 MCP Server 进程连接
  mcpServer: TCPServer;  // port 19871-19880
  
  // TCP 客户端 — 连接 MLFB 桌面端
  mlfbBridge: TCPClient; // port 19850-19860 (MLFB 范围)
  
  // 编排状态 (独立模块)
  orchestrator: Orchestrator;
  
  // 消息路由 (独立模块)
  router: MessageRouter;
  
  // 活跃连接 (callerId → socket)
  connections: Map<string, TCPSocket>;
}
```

### 6.3 生命周期事件

```
Daemon 启动
  │
  ├─ 绑定 TCP 端口
  ├─ 写锁文件
  ├─ 连接 MLFB 桌面端 (可选，延迟连接)
  │
  ▼
接受 MCP Server 连接
  │
  ├─ agent_register → 记录 Agent + 通知 MLFB UI
  ├─ agent_submit → 路由到 Orchestrator
  ├─ ... 其他工具调用路由 ...
  │
  ▼
编排运行中
  │
  ├─ 停滞检测定时器
  ├─ 健康检查定时器
  │
  ▼
编排完成 / 终止
  │
  └─ Daemon 继续运行 (等待新的编排)
```

---

## 7. 消息路由模块 (`router.mjs`)

### 7.1 核心: 阻塞队列

每个 Agent 有一个 pending Promise，代表其当前阻塞的 MCP 工具调用:

```javascript
class MessageRouter {
  // callerId → { resolve, reject } 
  pendingCallbacks: Map<string, { resolve: Function, reject: Function }>;
  
  // 阻塞 Agent (submit/register_LRA 调用时)
  block(callerId) {
    return new Promise((resolve, reject) => {
      this.pendingCallbacks.set(callerId, { resolve, reject });
    });
  }
  
  // 解除阻塞 (向 Agent 返回结果)
  release(callerId, content) {
    const cb = this.pendingCallbacks.get(callerId);
    if (cb) {
      cb.resolve(content);
      this.pendingCallbacks.delete(callerId);
    }
  }
}
```

### 7.2 Submit 路由矩阵

| 提交者 | submit.type | 路由目标 |
|--------|-------------|---------|
| planning-expert | plan_draft | planning-inspector |
| planning-inspector | review_result | planning-expert |
| planning-expert | vote (via router_vote) | 记录票数 → 检查共识 |
| planning-inspector | vote (via router_vote) | 记录票数 → CEO 门控 |
| execution-expert | phase_complete | execution-inspector |
| execution-inspector | review_result (passed) | execution-expert (下一 Phase) |
| execution-inspector | review_result (failed) | execution-expert (修复) |
| execution-inspector | final_complete | CEO 终审 |

### 7.3 人工介入机制

**核心原理**: 阻塞本身就是人工介入点。通过 3 种运行模式控制：

| 模式 | 行为 | 适用场景 |
|------|------|---------|
| **Autopilot** (全自动) | 所有 submit 自动路由，不暂停 | 后台运行低风险任务 |
| **CEO Override** (接管 CEO) | 仅 CEO 审查环节暂停 | 日常开发（推荐） |
| **Full Override** (全接管) | 所有 submit 暂停等待人工 | 首次使用、高风险 |

**模式可运行时实时切换**，取代传统的暂停/继续按钮。

```
Agent submit → 编排器收到入参 → 
  ├─ Autopilot: 直接路由给目标 Agent (resolve)
  ├─ CEO Override: 
  │    ├─ 是 CEO 审查环节 → 暂停，推送到 MLRA UI → 人类审查/修改 → resolve
  │    └─ 非 CEO 环节 → 自动路由
  └─ Full Override: 暂停，推送到 MLRA UI → 人类审查/修改 → resolve
```

**MLRA UI 展示** (已有的 AgentColumn/WorkerPoolColumn 组件):
- Agent 提交的内容显示在对应 Column 中
- 人类可以直接在 UI 中编辑内容
- 点击"通过/拒绝"按钮 → 通过 Tauri IPC → Daemon resolve/reject

**无需 MLFB**: 整个人工介入流程在 MLRA UI 内完成，不依赖 `interactive_feedback`

**UI 控制**: 模式切换器位于顶栏第二行 (现有的暂停/继续按钮位置)，显示为三态切换

### 7.3 尾部注入

编排器在路由消息时自动附加尾部提醒:

```javascript
function buildTailInjection(role, phase, phaseId) {
  return `\n\n[SYSTEM REMINDER]
你是 ${ROLE_LABELS[role]}。你正在与工程团队负责人交流。
当前阶段: ${phase === "planning" ? "规划对峙" : "实施循环"}
${phaseId ? `当前Phase: ${phaseId}` : ""}
你必须使用 submit 工具提交你的工作结果。
不要在没有提交结果的情况下结束对话。`;
}
```

---

## 8. IPC 桥接模块 (`ipc-bridge.mjs`)

### 8.1 与 Tauri 桌面端通信

MLRA Daemon 通过 TCP 连接 Tauri App，使用 `mlra_` 前缀的消息类型:

```javascript
class IpcBridge {
  async connect() {
    // 同 MLFB MCP Server 的连接逻辑
    // 扫描 19850-19860 端口 (或读 MLFB 锁文件)
    this.socket = await findAndConnect();
  }
  
  // 推送 MLRA 事件到桌面端
  emit(event) {
    this.socket.write(JSON.stringify(event) + "\n");
  }
  
  // 接收用户操作 (角色配置、开始编排、人工审查通过/拒绝)
  onMessage(handler) {
    // readline 逐行解析
  }
}
```

### 8.2 人工介入链路

```
Agent submit → Daemon 编排器暂停 submit 路由
  → Daemon 推送: { type: "mlra_human_review", content, submitType, callerId }
  → Tauri ipc.rs 接收 → emit("mlra-human-review") 到前端
  → MLRA UI (AgentColumn) 展示 submit 内容 + 编辑区域
  → 人类阅读/修改 → 点击"通过"
  → 前端 invoke("mlra_approve_review", { callerId, modifiedContent })
  → Tauri → TCP 回传: { type: "mlra_review_approved", callerId, content }
  → Daemon 收到 → resolve 对应 Agent 的阻塞 submit
```

### 8.3 桌面端 Tauri 侧处理

MLFB Tauri App 的 `ipc.rs` 需要新增对 `mlra_` 消息类型的处理:

```rust
// ipc.rs 新增 match 分支
"mlra_agent_registered" => { /* emit("mlra-agent-registered") to frontend */ }
"mlra_agent_status" => { /* emit("mlra-agent-status") */ }
"mlra_phase_change" => { /* emit("mlra-phase-change") */ }
"mlra_human_review" => { /* emit("mlra-human-review") + 等待响应 */ }
"mlra_round_event" => { /* emit("mlra-round-event") */ }
```

前端 `mlraStore.ts` 通过 `listen()` 接收这些事件并更新状态。

### 8.4 Tauri 新增命令 (从前端到后端)

```rust
#[tauri::command]
async fn mlra_assign_role(caller_id: String, role: String, worker_role: Option<String>) { ... }

#[tauri::command]
async fn mlra_start_orchestration(launcher_id: String) { ... }

#[tauri::command]
async fn mlra_pause(launcher_id: String) { ... }

#[tauri::command]
async fn mlra_resume(launcher_id: String) { ... }

#[tauri::command]
async fn mlra_approve_review(caller_id: String, content: String) { ... }

#[tauri::command]
async fn mlra_inject_message(caller_id: String, content: String) { ... }

#[tauri::command]
async fn mlra_terminate(launcher_id: String) { ... }
```

---

## 9. 实现路线图

### Phase 1: Daemon 骨架 + register_LRA (基础通信验证)

**目标**: 一个 Agent 可以注册到 MLRA 系统

1. 创建 `mlra-server/` 目录和 `package.json`
2. 实现 `protocol.mjs` — 消息类型定义
3. 实现 `daemon.mjs` — TCP 服务端，接受连接，处理 `agent_register`
4. 实现 `server.mjs` — MCP Server 入口，`register_LRA` 工具，连接 Daemon
5. 实现 `ipc-bridge.mjs` — 连接 MLFB 桌面端，推送 `mlra_agent_registered`
6. Tauri 侧: `ipc.rs` 处理 MLRA 消息类型 → `emit` 到前端
7. 前端: `mlraStore` 监听事件，更新 `registeredAgents`

**验证**: 在 VS Code 中创建 Agent session → Agent 调用 register_LRA → MLFB 桌面端看到新 Agent

### Phase 2: 双 Agent 对峙 (核心路由)

**目标**: Expert ↔ Inspector 对峙循环

1. 实现 `orchestrator.mjs` — 状态机 (configuring → running)
2. 实现 `router.mjs` — 阻塞队列 + submit 路由
3. 实现 `submit` MCP 工具 — 入参-出参交叉
4. 前端: "开始编排" 按钮 → IPC 通知 Daemon → resolve register_LRA
5. 实现尾部注入
6. 停滞检测基础逻辑

**验证**: Expert + Inspector 各一个 session，可以来回通信直到手动停止

### Phase 3: 投票 + CEO 门控

**目标**: 完整规划阶段流程

1. 实现 `router_vote` 工具
2. 实现投票计数 + 共识检测
3. 实现 CEO Agent 注册 + 唤醒
4. 实现防御性拒绝调度 (2 轮最低)
5. CEO 三种模式 (auto/manual/hybrid)
6. manual 模式: submit 路由到 MLFB UI 等待人类

### Phase 4: Worker 系统

**目标**: 子 Agent 委派和管理

1. 实现 `order` / `check_orders` / `await_order_finish` / `submit_feedback`
2. Worker 状态机 (ready ↔ working → broken)
3. Worker 健康检查
4. Worker broken 恢复逻辑
5. 状态信息表注入

### Phase 5: 两阶段贯通

**目标**: 规划 → 实施完整流程

1. 规划阶段完成 → 自动切换到实施阶段
2. 实施阶段的 Phase 推进逻辑
3. CEO 终审验证
4. 全流程贯通测试

### Phase 6: `.agent.md` 角色定义

**目标**: 完整的角色 prompt (4 主 Agent + CEO + Worker)

1. `mlra-planning-expert.agent.md` — 规划专家 (意图分析、方案设计)
2. `mlra-planning-inspector.agent.md` — 规划监察 (方案审查、可行性)
3. `mlra-execution-expert.agent.md` — 实施专家 (编码、委派 Worker)
4. `mlra-execution-inspector.agent.md` — 实施监察 (代码审查)
5. `mlra-ceo.agent.md` — CEO (跨阶段门控、终审)
6. `mlra-worker.agent.md` — 子 Agent (执行委派任务)

---

## 10. 关键决策

| # | 决策 | 理由 |
|---|------|------|
| 1 | 独立 MLRA MCP Server，不混入 MLFB | 职责清晰，互不干扰 |
| 2 | Orchestrator Daemon 集中状态 | MCP stdio 1:1 导致多进程，需共享状态 |
| 3 | Daemon 自动发现 (端口扫描 + 锁文件) | 与 MLFB 相同模式，用户无需手动管理 |
| 4 | 编排状态机为纯逻辑模块 (无 I/O) | 可单独测试，不依赖网络 |
| 5 | 尾部注入预制模板 | 确保 Agent 始终知道自己的角色和当前状态 |
| 6 | MLRA 消息类型前缀 `mlra_` | 与 MLFB 消息共存于同一 TCP 连接而不冲突 |

---

## 附录 A: `.mcp.json` 模板

```json
{
  "mcpServers": {
    "my-last-feedback": {
      "command": "node",
      "args": ["E:/Dev/my-last-feedback/server.mjs"],
      "timeout": 600
    },
    "my-long-running-agent": {
      "command": "node",
      "args": ["E:/Dev/my-last-feedback/mlra-server/server.mjs"],
      "timeout": 600
    }
  }
}
```

## 附录 B: 与前端 Store 的映射

| Daemon 状态 | → | mlraStore 字段 |
|-------------|---|----------------|
| `agents` Map | → | `launcher.registeredAgents[]` |
| `agents[id].role` | → | `registeredAgent.assignedRole` |
| `agents[id].status` | → | `agentSlot.status` (after start) |
| `status` | → | `launcher.status` |
| `phase` | → | `launcher.currentPhase` |
| `rounds` | → | `launcher.roundHistory[]` |
| `workerOrders` | → | `launcher.agents.workers[]` |

---

*文档结束。*
