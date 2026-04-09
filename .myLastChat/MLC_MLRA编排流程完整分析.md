---
title: MLRA 编排运行流程完整分析
description: 状态机、触发条件、信息格式规范、边缘情况分析、自治能力评估
workplace: ${workspaceFolder}
project: my-last-feedback
type: knowledge
tags:
    - MLRA
    - orchestration
    - state-machine
    - architecture
---

# MLRA 编排运行流程完整分析

## 一、全局架构概览

```mermaid
graph TB
    subgraph "VS Code Chat Sessions"
        A1[Agent 1<br/>MCP Server]
        A2[Agent 2<br/>MCP Server]
        A3[Agent N<br/>MCP Server]
    end

    subgraph "MLRA Daemon (单进程)"
        Router[Message Router<br/>阻塞/释放管理]
        Orch[Orchestrator<br/>状态机/纯逻辑]
        SM[SessionManager<br/>存活检测/预算]
        IPC[IPC Bridge<br/>Tauri 通信]
    end

    subgraph "Tauri Desktop App"
        Store[mlraStore<br/>Zustand 状态]
        UI[LauncherHome / AgentColumn<br/>用户界面]
    end

    A1 -->|TCP JSON-line| Router
    A2 -->|TCP JSON-line| Router
    A3 -->|TCP JSON-line| Router
    Router <--> Orch
    Orch --> SM
    Router --> IPC
    IPC <-->|Tauri emit/invoke| Store
    Store --> UI
    UI -->|用户操作| Store
```

## 二、主状态机

### 2.1 Orchestrator 生命周期状态

```mermaid
stateDiagram-v2
    [*] --> configuring: 创建 Launcher

    configuring --> running: startOrchestration(userTask, startMode)
    running --> paused: 预算耗尽 / 手动暂停
    paused --> running: increaseBudget / 手动恢复
    running --> completed: CEO 终审通过 / 无 CEO 直接完成
    running --> cancelled: 用户终止
    paused --> cancelled: 用户终止

    completed --> [*]
    cancelled --> [*]
```

### 2.2 Phase 状态机

```mermaid
stateDiagram-v2
    [*] --> planning: startMode = "full"
    [*] --> implementation: startMode = "direct-execution"

    planning --> ceo_planning_gate: 双方 router_vote 通过
    ceo_planning_gate --> planning: CEO rejected → 退回修改
    ceo_planning_gate --> implementation: CEO approved → transitionToImplementation

    implementation --> phase_review: submit(phase_complete)
    phase_review --> implementation: inspector 通过 → advancePhase
    phase_review --> implementation: inspector 拒绝 → 返回修改

    implementation --> ceo_final_review: submit(final_complete)
    ceo_final_review --> implementation: CEO rejected → 退回修改
    ceo_final_review --> completed: CEO approved
```

### 2.3 CEO 门控状态机 (ceoGate)

```mermaid
stateDiagram-v2
    [*] --> inactive: 初始状态

    inactive --> planning_gate: triggerPlanningGate(materials)
    inactive --> final_review: _triggerCeoFinalReview(content)

    planning_gate --> inactive: CEO approved → transition_to_implementation
    planning_gate --> inactive: CEO rejected → route_multiple (退回 expert + inspector)
    planning_gate --> arbitration: CEO arbitration

    final_review --> inactive: CEO approved → complete
    final_review --> inactive: CEO rejected → route_multiple (退回 exec-expert + inspector)

    arbitration --> inactive: CEO approved → arbitration_resolved
```

### 2.4 Agent 阻塞/释放循环

```mermaid
sequenceDiagram
    participant Agent as MCP Server (Agent)
    participant Router as Message Router
    participant Daemon as Daemon
    participant Orch as Orchestrator

    Note over Agent: register_LRA 调用
    Agent->>Daemon: AGENT_REGISTER
    Daemon->>Orch: registerAgent()
    Daemon->>Router: block(callerId, "register")
    Note over Agent: ⏸ 阻塞等待...

    Note over Daemon: UI 触发 startOrchestration
    Daemon->>Orch: startOrchestration(task, mode)
    Orch-->>Daemon: instructions[]
    Daemon->>Router: release(callerId, instruction)
    Router-->>Agent: instruction content
    Note over Agent: ▶ 开始执行任务

    Note over Agent: 完成 → submit 调用
    Agent->>Daemon: AGENT_SUBMIT
    Daemon->>Orch: handleSubmit()
    Orch-->>Daemon: { action: "route", target, content }
    Daemon->>Router: release(target, content)
    Daemon->>Router: block(callerId, "submit")
    Note over Agent: ⏸ 阻塞等待下一轮...
```

### 2.5 CEO 零间隙阻塞流程

```mermaid
sequenceDiagram
    participant CEO as CEO Agent
    participant Router as Message Router
    participant Daemon as Daemon
    participant Orch as Orchestrator

    Note over CEO: register_LRA 调用
    CEO->>Daemon: AGENT_REGISTER
    Daemon->>Router: block(ceoId, "register")
    Note over CEO: ⏸ 阻塞 (永不被 startOrchestration 释放)

    Note over Daemon: votes_passed 事件触发
    Daemon->>Orch: triggerPlanningGate(materials)
    Orch-->>Daemon: { action: "wake_ceo", content }
    Daemon->>Router: release(ceoId, content)
    Note over CEO: ▶ 收到审查材料

    CEO->>Daemon: CEO_VERDICT { verdict: "rejected" }
    Daemon->>Orch: handleCeoVerdict()
    Orch-->>Daemon: { action: "route_multiple", targets }
    Daemon->>Daemon: _executeCeoDecision()
    Daemon->>Router: block(ceoId, "ceo_verdict")
    Note over CEO: ⏸ 再次阻塞，等待下次触发

    Note over Daemon: 再次 votes_passed
    Daemon->>Router: release(ceoId, newMaterials)
    Note over CEO: ▶ 再次审查...

    CEO->>Daemon: CEO_VERDICT { verdict: "approved" }
    Daemon->>Orch: handleCeoVerdict()
    Orch-->>Daemon: { action: "transition_to_implementation" }
    Daemon->>Daemon: transitionToImplementation()
    Daemon->>Router: block(ceoId, "ceo_verdict")
    Note over CEO: ⏸ 阻塞，等待终审触发

    Note over Daemon: submit(final_complete) 触发终审
    Daemon->>Router: release(ceoId, finalReviewContent)
    Note over CEO: ▶ 终审
    CEO->>Daemon: CEO_VERDICT { verdict: "approved" }
    Note over CEO: ✅ action="complete" → 直接 RESOLVE, 不再阻塞
```

## 三、触发条件矩阵

| 触发事件 | 来源 | 条件 | 结果动作 |
|----------|------|------|----------|
| `startOrchestration` | Tauri UI | `checkStartReady(mode).ready === true` | 释放活跃阶段 agents (非 CEO) |
| `votes_passed` | Orchestrator 事件 | `votes.expert.vote === "pass" && votes.inspector.vote === "pass"` | `triggerPlanningGate()` → 唤醒 CEO 或自动转换 |
| `planning_gate` CEO approved | CEO ceo_verdict | `ceoGate.type === "planning_gate"` | `transitionToImplementation()` → 释放实施 agents |
| `planning_gate` CEO rejected | CEO ceo_verdict | `ceoGate.type === "planning_gate"` | 重置 votes → route_multiple → 退回 expert + inspector |
| `phase_complete` | exec-expert submit | `submitType === "phase_complete"` | 路由到 exec-inspector 审查 |
| `review_result (passed)` | exec-inspector submit | `metadata.passed !== false` | `_advancePhase()` → 路由回 exec-expert |
| `review_result (failed)` | exec-inspector submit | `metadata.passed === false` | 路由回 exec-expert 修改 |
| `final_complete` | exec-expert submit | `submitType === "final_complete"` | `_triggerCeoFinalReview()` → 唤醒 CEO |
| `final_review` CEO approved | CEO ceo_verdict | `ceoGate.type === "final_review"` | `status = "completed"` → 终止 |
| `human_review` | 任何 submit | `controlMode === "full-override"` 或特定条件 | 推送到 Tauri UI → 阻塞等待人工 |
| `inject_message` | Tauri UI | 任意时机 | `_routeToAgent(callerId, content)` → release 目标 agent |
| `stagnation_detected` | Orchestrator | 连续 5 次相同 hash 的 submit | 日志警告 (TODO: CEO 介入) |
| `budget_exceeded` | SessionManager | `budget.consumed >= budget.limit` | 暂停编排 → `status = "paused"` |

## 四、信息格式规范

### 4.1 Agent → Daemon (MCP Tool 调用)

#### `register_LRA`
```json
{
  "type": "agent_register",
  "callerId": "uuid-from-vscode-session-log",
  "alias": "A1B2",
  "workspace": "/path/to/project",
  "model": "copilot-chat"
}
```

#### `submit`
```json
{
  "type": "agent_submit",
  "callerId": "...",
  "submitType": "plan_draft | review_result | phase_complete | final_complete",
  "content": "Markdown 格式的提交内容",
  "metadata": {
    "phase": "Phase 1",
    "passed": true,
    "issues": ["issue1", "issue2"]
  }
}
```

#### `router_vote`
```json
{
  "type": "agent_vote",
  "callerId": "...",
  "vote": "pass | reject",
  "reason": "投票理由"
}
```

#### `ceo_verdict`
```json
{
  "type": "ceo_verdict",
  "callerId": "...",
  "verdict": "approved | rejected | arbitration",
  "reason": "裁决理由",
  "targets": ["execution-expert"]
}
```

#### `order` (Expert → Worker)
```json
{
  "type": "agent_order",
  "callerId": "...",
  "workerId": "optional-target",
  "taskDescription": "任务描述",
  "priority": "normal | high"
}
```

### 4.2 Tail 注入规范

每条给 Agent 的指令末尾都附加 `buildTailInjection(role, phase, phaseId)`:

```
[SYSTEM REMINDER]
你是 {角色名}。你正在与工程团队负责人交流。
当前阶段: {规划对峙 | 实施循环}
当前Phase: {Phase ID}
你必须使用 submit 工具提交你的工作结果。
不要在没有提交结果的情况下结束对话。
{角色特定的 AGENTS.md 提示}
```

**角色特定提示**：
- 专家/监察：阅读 AGENTS.md，发现需要更新时主动更新
- CEO：**必须先勘察项目现状**（读 AGENTS.md + 核心代码），不得仅凭文本裁决
- Worker：阅读 AGENTS.md

### 4.3 路由消息格式

Agent 之间的消息通过 Orchestrator 路由时，格式为：

```
[来自工程团队负责人]

{审查反馈 / 任务指令 / CEO 裁决}

{Tail 注入}
```

CEO 门控消息格式：
```
[CEO 门控审批 — 规划对峙投票已通过]

专家和监察已就方案达成一致。请审查以下材料并做出裁决。
审查后请使用 ceo_verdict 工具提交你的裁决（approved/rejected）。

## 原始任务
{userTask}

## 投票理由
{materials}

{Tail 注入}
```

### 4.4 Frontend ↔ Daemon 消息格式

#### Daemon → Frontend (Push)
```json
{ "type": "mlra_orchestration_status", "state": { "status", "phase", "startMode", "ceoGate", ... } }
{ "type": "mlra_ceo_gate_status", "ceoGate": { "active", "type", "round", "history" } }
{ "type": "mlra_phase_change", "from": "planning", "to": "implementation" }
{ "type": "mlra_agent_registered", "callerId", "alias", "model", "workspace" }
{ "type": "mlra_round_event", "event": "start|end", "round": { ... } }
{ "type": "mlra_human_review", "callerId", "content", "submitType" }
```

#### Frontend → Daemon (User Actions)
```json
{ "type": "mlra_start_orchestration", "launcherId", "userTask", "startMode": "full|direct-execution" }
{ "type": "mlra_inject_message", "callerId", "content" }
{ "type": "mlra_review_approved", "content" }
{ "type": "mlra_review_rejected", "reason" }
{ "type": "mlra_set_control_mode", "controlMode" }
```

## 五、完整编排流程 (全开局模式)

```mermaid
flowchart TD
    START[用户创建 Launcher] --> REG[Agents 陆续注册<br/>register_LRA → 阻塞]
    REG --> ASSIGN[用户分配角色]
    ASSIGN --> CHECK{全开局就绪检查<br/>5 主 + ≥1 Worker?}
    CHECK -->|否| ASSIGN
    CHECK -->|是| FULL_START[startOrchestration full]

    FULL_START --> PLAN_EXPERT[释放 planning-expert<br/>收到任务描述]
    FULL_START --> PLAN_INSPECT[释放 planning-inspector<br/>等待审查]
    FULL_START --> WORKERS[释放 Workers<br/>待命]
    FULL_START -.->|不释放| CEO_WAIT[CEO 保持阻塞]
    FULL_START -.->|不释放| EXEC_WAIT[exec-expert/inspector 待命]

    PLAN_EXPERT --> SUBMIT_PLAN[submit plan_draft]
    SUBMIT_PLAN --> ROUTE_INSPECT[路由到 inspector 审查]
    ROUTE_INSPECT --> INSPECT_REVIEW[inspector 审查方案]
    INSPECT_REVIEW --> SUBMIT_REVIEW[submit review_result]
    SUBMIT_REVIEW --> ROUTE_EXPERT[路由回 expert 修改]
    ROUTE_EXPERT --> SUBMIT_PLAN

    SUBMIT_PLAN --> VOTE_E[router_vote pass]
    INSPECT_REVIEW --> VOTE_I[router_vote pass]
    VOTE_E --> BOTH_PASS{双方都投 pass?}
    VOTE_I --> BOTH_PASS
    BOTH_PASS -->|否| CONTINUE[继续对峙]
    CONTINUE --> SUBMIT_PLAN

    BOTH_PASS -->|是| VOTES_PASSED[votes_passed 事件]
    VOTES_PASSED --> TRIGGER_GATE[triggerPlanningGate]
    TRIGGER_GATE --> WAKE_CEO[释放 CEO 阻塞<br/>发送审查材料]

    WAKE_CEO --> CEO_REVIEW[CEO 审查方案]
    CEO_REVIEW --> CEO_VERDICT{ceo_verdict}
    CEO_VERDICT -->|rejected| REJECT[退回 expert + inspector<br/>重置 votes]
    REJECT --> SUBMIT_PLAN
    CEO_VERDICT -->|approved| APPROVE[transitionToImplementation]

    APPROVE --> EXEC_EXPERT[释放 exec-expert<br/>收到规划书]
    APPROVE --> EXEC_INSPECT[释放 exec-inspector<br/>收到规划书]
    APPROVE --> CEO_BLOCK[CEO 再次阻塞<br/>等待终审触发]

    EXEC_EXPERT --> EXEC_WORK[执行编码<br/>order → Worker]
    EXEC_WORK --> SUBMIT_PHASE[submit phase_complete]
    SUBMIT_PHASE --> ROUTE_EXEC_INS[路由到 exec-inspector]
    ROUTE_EXEC_INS --> EXEC_INS_REVIEW[inspector 审查]
    EXEC_INS_REVIEW --> SUBMIT_EXEC_REV[submit review_result]
    SUBMIT_EXEC_REV -->|passed| ADVANCE[advancePhase<br/>路由回 expert]
    ADVANCE --> EXEC_WORK
    SUBMIT_EXEC_REV -->|failed| ROUTE_BACK[退回 expert 修改]
    ROUTE_BACK --> EXEC_WORK

    EXEC_WORK --> SUBMIT_FINAL[submit final_complete]
    SUBMIT_FINAL --> FINAL_GATE[_triggerCeoFinalReview]
    FINAL_GATE --> WAKE_CEO_FINAL[释放 CEO 阻塞<br/>发送终审材料]
    WAKE_CEO_FINAL --> CEO_FINAL[CEO 终审]
    CEO_FINAL --> CEO_FINAL_V{ceo_verdict}
    CEO_FINAL_V -->|approved| COMPLETE[status = completed ✅]
    CEO_FINAL_V -->|rejected| REJECT_FINAL[退回 exec-expert + inspector]
    REJECT_FINAL --> EXEC_WORK
```

## 六、直接执行模式流程

```mermaid
flowchart TD
    START[用户创建 Launcher] --> REG[Agents 注册]
    REG --> ASSIGN[分配角色]
    ASSIGN --> CHECK{直接执行就绪<br/>exec-expert + exec-inspector + ceo + ≥1 Worker?}
    CHECK -->|否| ASSIGN
    CHECK -->|是| DIRECT_START[startOrchestration direct-execution]

    DIRECT_START --> EXEC_EXPERT[释放 exec-expert<br/>直接执行指令]
    DIRECT_START --> EXEC_INSPECT[释放 exec-inspector<br/>直接审查指令]
    DIRECT_START --> WORKERS[释放 Workers]
    DIRECT_START -.->|不释放| CEO_WAIT[CEO 保持阻塞]

    EXEC_EXPERT --> EXEC_WORK[执行编码 + order Workers]
    EXEC_WORK --> SUBMIT_PHASE[submit phase_complete]
    SUBMIT_PHASE --> ROUTE_INS[路由到 inspector]
    ROUTE_INS --> INS_REVIEW[inspector 审查]
    INS_REVIEW --> SUBMIT_REV[submit review_result]
    SUBMIT_REV -->|passed| ADVANCE[advancePhase]
    ADVANCE --> EXEC_WORK
    SUBMIT_REV -->|failed| ROUTE_BACK[退回修改]
    ROUTE_BACK --> EXEC_WORK

    EXEC_WORK --> SUBMIT_FINAL[submit final_complete]
    SUBMIT_FINAL --> CEO_FINAL[触发 CEO 终审]
    CEO_FINAL --> CEO_V{ceo_verdict}
    CEO_V -->|approved| COMPLETE[✅ 完成]
    CEO_V -->|rejected| REJECT[退回修改]
    REJECT --> EXEC_WORK
```

## 七、边缘情况及应对措施

### 7.1 已实现的防护

| 边缘情况 | 现有应对 | 文件位置 |
|----------|---------|---------|
| **Agent 断线 (脱轨)** | SessionManager 检测 transcript 停滞 → 标记 derailed → 重试 → 超过 maxRetries → failover 到 standby | `daemon.mjs` SessionManager 事件 |
| **Agent 彻底断线 (broken)** | 无 standby 时标记 broken，推送到 UI 通知用户 | `daemon.mjs` _wireSessionManagerEvents |
| **重复注册** | `registerAgent` 返回 error: "Agent already registered" | `orchestrator.mjs:94` |
| **启动条件不满足** | `checkStartReady()` 返回 missing 列表，UI 按钮 disabled | `orchestrator.mjs:129`, `LauncherHome.tsx` |
| **CEO verdict 异常时机** | 检查 `ceoGate.active`，非活跃时返回 error | `orchestrator.mjs:598` |
| **非 CEO 调用 ceo_verdict** | 检查 `agent.role !== "ceo"` → error | `orchestrator.mjs:596` |
| **停滞检测** | MD5 hash 连续相同 ≥5 次 → 发出 stagnation_detected 事件 | `orchestrator.mjs:856` |
| **预算耗尽** | BudgetTracker 超限 → pause → 推送 UI 要求增加预算 | `daemon.mjs` budget_pause |
| **消息目标不在线** | `_routeToAgent` release 失败时 log warning (TODO: 消息队列) | `daemon.mjs:380` |
| **阻塞被取代** | `router.block()` 对已阻塞的 callerId 先 reject 旧的再设新的 | `router.mjs:37` |
| **Human review 模式** | `controlMode === "full-override"` 时所有 submit 暂停等人工 | `orchestrator.mjs:271` |
| **CEO 审批后任务完成** | `action === "complete"` 时 CEO 直接 RESOLVE 不再阻塞 | `daemon.mjs:350` |
| **投票未全部到齐** | 只有 expert + inspector 都投票后才检查结果 | `orchestrator.mjs:411` |
| **CEO rejected 后重新投票** | 清零 votes → expert + inspector 需重新 submit + vote | `orchestrator.mjs:656` |

### 7.2 已知风险 / 未完善项

| 风险 | 严重度 | 说明 |
|------|--------|------|
| **消息队列缺失** | ⚠️ 中 | `_routeToAgent` 目标不在阻塞态时消息丢失。需实现持久化队列。 |
| **停滞未实际干预** | ⚠️ 中 | `stagnation_detected` 仅 log，未触发 CEO 介入或自动措施 |
| **Phase 追踪未完善** | ⚠️ 中 | `_advancePhase` 没有真正的 Phase ID 递增逻辑 |
| **Worker 超时未处理** | ⚠️ 中 | `await_order_finish` 无实际超时机制 |
| **多 Expert submit 竞态** | ⚠️ 低 | 理论上不会发生（agent 阻塞态），但注入消息可打破阻塞 |
| **direct-execution 无规划** | ⚠️ 低 | 跳过规划可能导致 exec-expert 无方向，依赖 agent 自组织 |
| **CEO arbitration 后续** | ⚠️ 低 | `arbitration_resolved` 不触发后续动作，可能需手动干预 |

## 八、阻塞类型完整表

```mermaid
graph LR
    subgraph "阻塞类型"
        B1[register — register_LRA 调用]
        B2[submit — submit 工具调用]
        B3[ceo_verdict — CEO 裁决后]
        B4[worker_feedback — Worker 提交后]
        B5[await_order — 等待 Worker 完成]
    end

    B1 -->|释放: startOrchestration 或 triggerPlanningGate| ACTIVE[Agent 活跃]
    B2 -->|释放: 路由目标回复 或 人工审批| ACTIVE
    B3 -->|释放: 下次门控触发| ACTIVE
    B4 -->|释放: 新任务 order| ACTIVE
    B5 -->|释放: Worker submit_feedback| ACTIVE
```

## 九、自治能力评估

### 9.1 核心能力矩阵

| 能力 | 实现状态 | 实现方式 |
|------|---------|---------|
| **自我计划** | ✅ 已实现 | planning-expert 收到任务后自主制定方案 (plan_draft) |
| **反思/审查** | ✅ 已实现 | planning-inspector 审查方案 → 反馈 → expert 修改 → 循环 |
| **共识达成** | ✅ 已实现 | router_vote 双方 pass → CEO 门控审批 |
| **构建执行** | ✅ 已实现 | exec-expert 按 Phase 执行 → order Workers → submit |
| **详细检查** | ✅ 已实现 | exec-inspector 独立审查 → reject 退回修改 |
| **委派分工** | ✅ 已实现 | order 工具 → Worker 执行子任务 → submit_feedback |
| **多轮修改** | ✅ 已实现 | submit 路由循环，无限轮次直到通过 |
| **长期运行** | ✅ 基本实现 | 阻塞/释放机制保持 session 存活，SessionManager 监控 |
| **质量门控** | ✅ 已实现 | CEO 门控 + 防御性拒绝 (planning_gate minRounds=2) |
| **人工介入** | ✅ 已实现 | controlMode + human_review + inject_message |
| **故障恢复** | ✅ 已实现 | SessionManager 脱轨检测 → 重试 → failover |
| **预算控制** | ✅ 已实现 | BudgetTracker 限额 → 暂停 → 增加后恢复 |

### 9.2 当前瓶颈与改进方向

```mermaid
graph TD
    GOAL[Agent 自主长运行<br/>直到任务完成]

    GOAL --> GOOD[已解决]
    GOAL --> GAP[待改进]

    GOOD --> G1[规划-审查循环]
    GOOD --> G2[CEO 门控质量保证]
    GOOD --> G3[实施 Phase 循环]
    GOOD --> G4[Worker 委派]
    GOOD --> G5[断线恢复]
    GOOD --> G6[预算管理]

    GAP --> P1[Phase 编号管理<br/>缺少自动递增]
    GAP --> P2[停滞自动干预<br/>CEO 介入机制]
    GAP --> P3[消息队列<br/>防止丢失]
    GAP --> P4[Worker 超时<br/>自动回收]
    GAP --> P5[AGENTS.md 更新<br/>反馈循环]
    GAP --> P6[Transcript 实时<br/>UI 展示]
```

### 9.3 结论

当前编排系统**已具备基本的自治能力链**：

1. **规划阶段**：Expert 生成方案 → Inspector 审查 → 循环修改 → 投票通过 → CEO 门控审批（含防御性拒绝）
2. **执行阶段**：Expert 按 Phase 编码 + 委派 Worker → Inspector 审查每个 Phase → CEO 终审
3. **质量保证**：三角对峙（Expert ↔ Inspector ↔ CEO）确保方案和代码质量
4. **持久运行**：阻塞/释放机制 + SessionManager 存活检测 + 预算管理

**关键差距**：Phase 管理过于简单（无真正的 Phase 列表和进度追踪）、停滞检测仅告警不干预、消息可能在竞态中丢失。这些是从"能运行"到"可靠生产使用"的关键距离。
