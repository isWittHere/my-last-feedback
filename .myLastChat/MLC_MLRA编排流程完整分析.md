---
title: MLRA 编排运行流程完整分析
description: 状态机、触发条件、信息格式规范、边缘情况分析、自治能力评估（含提示词工程重构、驳斥锁、任务上下文）
workplace: ${workspaceFolder}
project: my-last-feedback
type: knowledge
tags:
    - MLRA
    - orchestration
    - state-machine
    - architecture
    - prompt-engineering
    - rejection-lock
solved_lists:
    - 提示词工程重构 (Skill文件 + 路由模板)
    - CEO驳斥锁机制
    - 移除final_complete，扩展投票至实施阶段
    - get_task_context MCP工具
    - Worker委派结构化改进
    - 任务输入UI（类型选择器 + 描述框）
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

    configuring --> running: startOrchestration(userTask, startMode, taskType)
    running --> paused: 预算耗尽 / 手动暂停
    paused --> running: increaseBudget / 手动恢复
    running --> completed: CEO 终审通过 (驳斥锁4轮后)
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
    ceo_planning_gate --> planning: CEO rejected (驳斥锁) → 退回修改
    ceo_planning_gate --> implementation: CEO approved (需连续2次) → transitionToImplementation

    implementation --> phase_review: submit(phase_complete)
    phase_review --> implementation: inspector 通过 → advancePhase
    phase_review --> implementation: inspector 拒绝 → 返回修改

    implementation --> ceo_final_review: 双方 router_vote 通过 (implementation_votes_passed)
    ceo_final_review --> implementation: CEO rejected (驳斥锁) → 退回修改
    ceo_final_review --> completed: CEO approved (需连续2次)
```

> **重要变更 (v2)**: `final_complete` 已移除。实施阶段通过 `router_vote` 投票触发 CEO 终审，与规划阶段一致。

### 2.3 CEO 门控状态机 (ceoGate) — 含驳斥锁

```mermaid
stateDiagram-v2
    [*] --> inactive: 初始状态

    inactive --> planning_gate: triggerPlanningGate(materials)
    inactive --> final_review: _triggerCeoFinalReview(content)

    state planning_gate {
        [*] --> defensive_round: round ≤ minDefensiveRounds(2)
        defensive_round --> defensive_round: approved → 强制降级为 further_review
        defensive_round --> consecutive_check: round > minDefensiveRounds
        consecutive_check --> consecutive_check: approved → consecutiveApprovals++
        consecutive_check --> pass: consecutiveApprovals ≥ requiredConsecutive(2)
    }
    planning_gate --> inactive: pass → transition_to_implementation
    planning_gate --> inactive: rejected (任意时刻) → route_multiple + reset consecutiveApprovals
    planning_gate --> arbitration: CEO arbitration

    state final_review {
        [*] --> fr_defensive: 同上驳斥锁逻辑
        fr_defensive --> fr_pass: 4轮最低通过
    }
    final_review --> inactive: fr_pass → complete
    final_review --> inactive: rejected → route_multiple (退回 exec-expert + inspector)

    arbitration --> inactive: CEO approved → arbitration_resolved
```

#### 驳斥锁机制 (Rejection Lock)

| 参数 | 值 | 说明 |
|------|---|------|
| `minDefensiveRounds` | 2 | 前2轮 CEO 审批自动降级为「进一步审查」 |
| `requiredConsecutive` | 2 | 需连续2次 approved 才能真正通过 |
| `consecutiveApprovals` | 0→N | 连续审批计数器，任何 rejected 重置为 0 |
| **最少通过轮数** | **4** | 2轮防御 + 2轮连续确认 |

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

    Note over Daemon: implementation_votes_passed 触发终审
    Daemon->>Router: release(ceoId, finalReviewContent)
    Note over CEO: ▶ 终审 (含原始任务+实施报告)
    Note over CEO: 驳斥锁: 最少4轮审批才能通过
    CEO->>Daemon: CEO_VERDICT { verdict: "approved" }
    Note over CEO: ✅ action="complete" → 直接 RESOLVE, 不再阻塞
```

## 三、触发条件矩阵

| 触发事件 | 来源 | 条件 | 结果动作 |
|----------|------|------|----------|
| `startOrchestration` | Tauri UI | `checkStartReady(mode).ready === true` | 释放活跃阶段 agents (非 CEO) |
| `votes_passed` | Orchestrator 事件 | `votes.expert.vote === "pass" && votes.inspector.vote === "pass"` | `triggerPlanningGate()` → 唤醒 CEO 或自动转换 |
| `planning_gate` CEO approved | CEO ceo_verdict | `ceoGate.type === "planning_gate"` + 驳斥锁通过 | `transitionToImplementation()` → 释放实施 agents |
| `planning_gate` CEO rejected | CEO ceo_verdict | `ceoGate.type === "planning_gate"` | 重置 votes → route_multiple → 退回 expert + inspector |
| `phase_complete` | exec-expert submit | `submitType === "phase_complete"` | 路由到 exec-inspector 审查 |
| `review_result (passed)` | exec-inspector submit | `metadata.passed !== false` | `_advancePhase()` → 路由回 exec-expert |
| `review_result (failed)` | exec-inspector submit | `metadata.passed === false` | 路由回 exec-expert 修改 |
| `implementation_votes_passed` | exec-expert + exec-inspector 投票 | 双方 `router_vote pass` | `_triggerCeoFinalReview()` → 唤醒 CEO |
| `final_review` CEO approved | CEO ceo_verdict | `ceoGate.type === "final_review"` + 驳斥锁通过 | `status = "completed"` → 终止 |
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
  "submitType": "plan_draft | review_result | phase_complete",
  "content": "Markdown 格式的提交内容 (按 Skill 规范)",
  "metadata": {
    "passed": true
  }
}
```

> **变更**: `final_complete` 已移除，`metadata.phase` 和 `metadata.issues` 已移除。实施完成通过 `router_vote` 投票触发。

#### `get_task_context`
```json
{
  "type": "get_task_context",
  "callerId": "..."
}
```

返回:
```markdown
## 原始用户请求
{userTask}

## 任务类型
{taskType}

## 当前阶段
planning | implementation

## 启动模式
full | direct-execution
```

> Worker 调用此工具会收到错误 — Worker 的信息来源是专家的结构化委派。

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

### 4.2 提示词工程架构 (v2 — Skill + Routing Templates)

> **架构变革**: 编排器从「智能路由器」变为「纯传话 + 尾部组装」。所有智能行为通过 Skill 文件 + 路由模板实现。

#### Skill 文件 (Agent 自行读取)

| 角色 | Skill 文件 | 核心内容 |
|------|-----------|----------|
| 规划专家 | `mcp_prompts/skill_planning_expert.md` | 规划书模板 + 自检 + 投票指引 |
| 规划监察 | `mcp_prompts/skill_planning_inspector.md` | 6审查维度 + 决策级别 + 报告模板 |
| 实施专家 | `mcp_prompts/skill_execution_expert.md` | re_verify自检 + Phase报告 + Worker委派模板 |
| 实施监察 | `mcp_prompts/skill_execution_inspector.md` | 代码审查6维度 + 安全检查 + 报告模板 |
| CEO | `mcp_prompts/skill_ceo.md` | 勘察 + 裁决标准 + 驳斥锁说明 + 仲裁 |
| Worker | `mcp_prompts/skill_worker.md` | 接单执行 + 结构化交付报告 |

#### 路由模板 (`buildRoutingPrompt`)

```js
buildRoutingPrompt(sourceRole, targetRole, phase, { routingReason }) → { prefix, suffix }
```

14+ 模板，key 格式: `sourceRole→targetRole:routingReason`

编排器路由时仅做: `prefix + 原始内容 + suffix`，不解析内容。

#### 初始提示 (`buildInitialPrompt`)

```js
buildInitialPrompt(role, userTask, phase, { isDirectExecution }) → string
```

每角色专属初始指令，包含 Skill 文件引用和 AGENTS.md 引用。

#### `buildTailInjection` (已废弃)

保留兼容，新流程使用 `buildRoutingPrompt`。

### 4.3 路由消息格式

Agent 之间的消息通过 Orchestrator 路由时，格式为：

```
{路由模板 prefix}

{Agent 提交的原始内容}

{路由模板 suffix}
```

CEO 审批消息格式：
```
{prefix: "规划投票已通过...请参考阅读规划书。"}

## 原始任务
{userTask}

## 投票理由 / 实施报告
{materials}

{suffix: "审查后请使用 ceo_verdict 工具提交裁决"}
```

### 4.4 MCP 工具表

| 工具 | 类型 | 可用角色 | 说明 |
|------|------|---------|------|
| `register_LRA` | 阻塞 | 所有 | 注册并等待初始指令 |
| `get_task_context` | 即时 | 主Agent (非Worker) | 获取原始请求 + 任务类型 + 阶段 |
| `submit` | 阻塞 | 主Agent | 提交工作结果 (`plan_draft`/`review_result`/`phase_complete`) |
| `router_vote` | 即时 | 专家/监察 | 方案/实施投票 |
| `order` | 即时 | 专家 | 结构化委派给 Worker |
| `check_orders` | 即时 | 专家 | 查看 Worker 状态 |
| `await_order_finish` | 阻塞 | 专家 | 等待 Worker 完成 |
| `submit_feedback` | 阻塞 | Worker | 提交结构化交付报告 |
| `ceo_verdict` | 阻塞 | CEO | 提交裁决后进入休眠 |

### 4.5 Frontend ↔ Daemon 消息格式

#### Daemon → Frontend (Push)
```json
{ "type": "mlra_orchestration_status", "state": { "status", "phase", "startMode", "taskType", "ceoGate", ... } }
{ "type": "mlra_ceo_gate_status", "ceoGate": { "active", "type", "round", "minDefensiveRounds", "consecutiveApprovals", "requiredConsecutive", "history" } }
{ "type": "mlra_phase_change", "from": "planning", "to": "implementation" }
{ "type": "mlra_agent_registered", "callerId", "alias", "model", "workspace" }
{ "type": "mlra_round_event", "event": "start|end", "round": { ... } }
{ "type": "mlra_human_review", "callerId", "content", "submitType" }
```

#### Frontend → Daemon (User Actions)
```json
{ "type": "mlra_start_orchestration", "launcherId", "userTask", "startMode": "full|direct-execution", "taskType": "brainstorm|shortlist|architecture|execution|full-chain|null" }
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

    EXEC_WORK --> IMPL_VOTE_E[router_vote pass]
    EXEC_INS_REVIEW --> IMPL_VOTE_I[router_vote pass]
    IMPL_VOTE_E --> IMPL_BOTH{双方都投 pass?}
    IMPL_VOTE_I --> IMPL_BOTH
    IMPL_BOTH -->|否| EXEC_WORK
    IMPL_BOTH -->|是| IMPL_VOTES[implementation_votes_passed]
    IMPL_VOTES --> FINAL_GATE[_triggerCeoFinalReview]
    FINAL_GATE --> WAKE_CEO_FINAL[释放 CEO 阻塞<br/>发送原始任务+终审材料]
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

    EXEC_WORK --> IMPL_VOTE[双方 router_vote pass]
    IMPL_VOTE --> CEO_FINAL[触发 CEO 终审]
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
| **质量门控** | ✅ 已实现 | CEO 驳斥锁 (4轮最低) + 规划/实施双阶段投票 |
| **人工介入** | ✅ 已实现 | controlMode + human_review + inject_message |
| **故障恢复** | ✅ 已实现 | SessionManager 脱轨检测 → 重试 → failover |
| **预算控制** | ✅ 已实现 | BudgetTracker 限额 → 暂停 → 增加后恢复 |
| **提示词工程** | ✅ 已实现 | 6 Skill 文件 + 14+ 路由模板，编排器纯传话 |
| **任务上下文** | ✅ 已实现 | get_task_context 工具 + CEO 审批时注入原始请求 |

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

1. **规划阶段**：Expert 生成方案 → Inspector 审查 → 循环修改 → 投票通过 → CEO 门控审批（含驳斥锁：最少4轮）
2. **执行阶段**：Expert 按 Phase 编码 + 委派 Worker → Inspector 审查每个 Phase → 投票通过 → CEO 终审（含驳斥锁）
3. **质量保证**：三角对峙（Expert ↔ Inspector ↔ CEO）确保方案和代码质量，驳斥锁消除 CEO 橡皮章风险
4. **持久运行**：阻塞/释放机制 + SessionManager 存活检测 + 预算管理
5. **提示词工程**：6个 Skill 文件 + 14+ 路由模板，编排器纯传话不解析内容

**关键差距**：Phase 管理过于简单（无真正的 Phase 列表和进度追踪）、停滞检测仅告警不干预、消息可能在竞态中丢失。这些是从"能运行"到"可靠生产使用"的关键距离。

## 十、变更日志

### v2 (latest) — 提示词工程重构 + 驳斥锁 + 任务上下文

#### 核心架构变革
- **编排器 → 纯传话**: `_routeSubmit()` 不再解析 submit 内容，只做 `prefix + content + suffix` 包装
- **Skill 自读取**: 6 个 Skill 文件，Agent 通过 `buildInitialPrompt` 中的文件路径引用自行读取
- **路由模板系统**: `buildRoutingPrompt()` + `ROUTING_TEMPLATES` 替代旧的 `buildTailInjection`

#### 功能变更
| 变更 | 说明 |
|------|------|
| 移除 `final_complete` | submit 类型缩减为 `plan_draft / review_result / phase_complete` |
| 实施阶段投票 | exec-expert + exec-inspector 可投票 → `implementation_votes_passed` → CEO 终审 |
| CEO 驳斥锁 | `minDefensiveRounds: 2` + `requiredConsecutive: 2`，最少4轮通过 |
| `get_task_context` 工具 | 主Agent 可获取原始请求、任务类型、阶段、模式。Worker 被拒绝 |
| CEO 审批注入原始请求 | `triggerPlanningGate` 和 `_triggerCeoFinalReview` 内容包含 `## 原始任务` |
| CEO 规划书提醒 | 路由模板 prefix 包含"请参考阅读规划书" |
| Worker 结构化委派 | `order` 工具描述要求行动背景/目标定位/操作指引/预期交付 |
| Worker 结构化交付 | `submit_feedback` 引导按 Skill 模板提交含自检确认的报告 |
| 任务输入 UI | LauncherHome 新增任务类型选择器（5种）+ 任务描述文本框 |
| `taskType` 字段 | 流经 `Launcher → daemon → orchestrator → toJSON`，可选 |

#### 文件变更清单
| 文件 | 变更 |
|------|------|
| `protocol.mjs` | 新增 `SKILL_PATHS`, `ROUTING_TEMPLATES`, `buildRoutingPrompt()`, `buildInitialPrompt()`, `MSG.GET_TASK_CONTEXT` |
| `orchestrator.mjs` | 重写 `_routeSubmit`, `_advancePhase`, `transitionToImplementation` 等为纯路由；新增驳斥锁逻辑；新增 `taskType` 字段 |
| `server.mjs` | 简化 `submit` 参数；新增 `get_task_context` 工具；强化 `order` 和 `submit_feedback` 描述 |
| `daemon.mjs` | 新增 `GET_TASK_CONTEXT` 处理；新增 `implementation_votes_passed` 事件处理；传递 `taskType` |
| `mlraStore.ts` | `Launcher` 新增 `taskType`, `userTask`；`CeoGateStatus` 新增驳斥锁字段；新增 `setTaskType`, `setUserTask` |
| `LauncherHome.tsx` | 新增任务配置区（类型选择器 + 描述文本框） |
| `index.css` | 新增 `.mlra-task-*` 样式 |
| `mcp_prompts/skill_*.md` | 6 个新 Skill 文件 |
