---
title: MLRA四项中风险修复会话摘要
description: 消息队列+停滞CEO仲裁+Progress参数+Worker超时的实现记录
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
tags:
    - MLRA
    - risk-mitigation
    - message-queue
    - stagnation
    - progress
    - worker-timeout
solved_lists:
    - Fix 1 消息队列 (router.mjs messageQueue Map)
    - Fix 2 停滞CEO仲裁 (triggerStagnationArbitration + daemon handler)
    - Fix 3 Progress参数 (submit工具 + store + skill指引)
    - Fix 4 Worker超时 (blockAwaitOrder 30分钟timeout)
    - 死代码清理 (final_complete残留 + 过时TODO注释)
    - 二次验证 (bug修复 _handleCeoRejection targets参数)
    - Git提交 34e0dfb
---

# MLRA 四项中风险修复会话摘要

## 1. Previous Conversation

本次会话基于前序工作继续：MLRA 编排系统已经完成了提示词工程重构（6个 Skill 文件 + 14+ 路由模板）、CEO 驳斥锁、get_task_context 工具、Worker 委派改进、任务输入 UI 等功能。前序工作 git 备份为 `ea981f9`。

前序对话中，用户完成了以下步骤：
1. 要求分析 MLRA 编排流程分析文档中列出的 7 个风险项
2. Agent 详细分析了所有 7 项风险，用户从中选择了 4 项中风险修复
3. 4 项修复的详细实施方案通过 interactive_feedback 确认
4. 用户确认"确认，开始实施"

本次会话从这里接续，直接开始编码实现 4 项修复。

## 2. Current Work

### 实现的 4 项修复

**Fix 1: 消息队列** — 解决 `release()` 在目标 Agent 未阻塞时消息丢失问题
- 在 `router.mjs` 新增 `messageQueue: Map<string, string[]>`
- `release()` 目标未阻塞时，消息入队而非返回 false
- `block()` 阻塞前先检查队列，有消息则 `Promise.resolve` 立即返回
- `cancelAll()` 同时清理 messageQueue

**Fix 2: 停滞 CEO 仲裁** — 解决停滞检测仅告警不干预的问题
- `_checkStagnation()` 增强：发出 `stalledRoles`、`phase`、`totalRounds` 数据
- 新增 `triggerStagnationArbitration(event)` 方法（三路径：无CEO → noop、gate已激活 → noop、正常 → wake_ceo）
- `stagnation_arbitration` 类型 CEO gate（无驳斥锁：`minDefensiveRounds: 0`、`requiredConsecutive: 1`）
- CEO verdict 处理覆盖 approved（arbitration_resolved）和 rejected（重置停滞计数器 + 路由到停滞角色）
- daemon `_handleStagnation()` 事件处理：无CEO时推送 UI 警告
- 新增路由模板 `orchestrator→ceo:stagnation_arbitration`

**Fix 3: Progress 参数** — 解决缺少轻量级进度可视化的问题
- submit 工具新增 `progress: z.string().optional()` 参数
- orchestrator `handleSubmit()` 存储 `this.lastProgress`
- `toJSON()` 输出包含 `lastProgress`
- `Launcher` 接口新增 `lastProgress: string | null`
- Store 状态同步包含 lastProgress
- Skill 文件添加 progress 填写指引

**Fix 4: Worker 超时** — 解决 `blockAwaitOrder` 无限等待的问题
- `blockAwaitOrder()` 新增 `timeoutMs` 参数（默认 30 分钟）
- 超时自动 reject + 清理回调
- `releaseAwaitOrder()` 成功时 clearTimeout
- `cancelAll()` 清理所有 timer

### 二次验证修复

在全面验证过程中发现并修复：
1. **Bug**: `_handleCeoRejection(reason)` 中 `stagnation_arbitration` 分支引用了未定义的 `targets` 变量 → 方法签名更新为 `_handleCeoRejection(reason, targets = [])`，调用处传入 targets
2. **死代码清理**: `_needsHumanReview` 中 `submitType === "final_complete"` 条件删除
3. **过时注释清理**: `_routeToAgent` 的 TODO 注释移除
4. **类型注释更新**: `ceoGate.type` JSDoc 补充 `stagnation_arbitration`

## 3. Key Technical Concepts

- **MessageRouter 阻塞/释放模式**: Agent 调用 MCP 工具（register_LRA、submit 等）时阻塞等待，daemon 通过 `release()` 推送下一条指令。消息队列确保在 Agent 尚未阻塞时发来的消息不会丢失。
- **CEO Gate 状态机**: `ceoGate` 对象管理 CEO 审批流程，支持 `planning_gate`、`final_review`、`arbitration`、`stagnation_arbitration` 四种类型。驳斥锁（`minDefensiveRounds` + `requiredConsecutive`）适用于前两种。
- **停滞检测**: `_checkStagnation()` 使用 MD5 哈希比较连续 submit 内容，≥5 次相同触发 `stagnation_detected` 事件。
- **Orchestrator 事件驱动**: orchestrator `_emit()` 发出事件 → daemon `_handleOrchestrationEvent()` 处理 → 执行 CEO 决策或推送 UI 状态。
- **Start Modes**: `FULL`（5主角色 + ≥1 worker）和 `DIRECT_EXECUTION`（exec-expert + exec-inspector + ceo + ≥1 worker）。
- **Routing Prompt 系统**: `buildRoutingPrompt(sourceRole, targetRole, phase, context)` 返回 `{ prefix, suffix }`。查找优先级：special key → standard key → fallback。

## 4. Relevant Files and Code

### mlra-server/router.mjs
- **核心变更文件 (Fix 1 + Fix 4)**
- 新增 `messageQueue` Map 和 `block()`/`release()` 队列逻辑
- `blockAwaitOrder()` 新增 30 分钟超时
- 完整文件约 170 行

关键代码 — `block()` 队列检查：
```javascript
block(callerId, type) {
  const queue = this.messageQueue.get(callerId);
  if (queue && queue.length > 0) {
    const content = queue.shift();
    if (queue.length === 0) this.messageQueue.delete(callerId);
    return Promise.resolve(content);
  }
  return new Promise((resolve, reject) => { ... });
}
```

关键代码 — `blockAwaitOrder()` 超时：
```javascript
blockAwaitOrder(callerId, workerId, timeoutMs = 30 * 60 * 1000) {
  const key = `${callerId}:${workerId}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      this.awaitCallbacks.delete(key);
      reject(new Error(`Worker ${workerId} timed out after ${timeoutMs / 60000} minutes`));
    }, timeoutMs);
    this.awaitCallbacks.set(key, { resolve, reject, timer });
  });
}
```

### mlra-server/orchestrator.mjs
- **核心变更文件 (Fix 2 + Fix 3 + 清理)**
- 新增 `triggerStagnationArbitration()` 方法（~40 行）
- 新增 `_getStalledRoles()` 辅助方法
- `_checkStagnation()` 增强发出 stalledRoles/phase/totalRounds
- `lastProgress` 字段添加（构造函数 + handleSubmit + toJSON）
- `_handleCeoRejection` 签名扩展支持 targets
- `_handleCeoApproval` 新增 `stagnation_arbitration` 分支
- 清除 `final_complete` 死代码引用

关键代码 — `triggerStagnationArbitration()`：
```javascript
triggerStagnationArbitration(stagnationData) {
  const ceoId = this._findAgentByRole("ceo");
  if (!ceoId) return { action: "noop", reason: "no_ceo_for_arbitration", stagnationData };
  if (this.ceoGate.active) return { action: "noop", reason: "ceo_gate_already_active" };
  this.ceoGate = {
    active: true, type: "stagnation_arbitration",
    round: 0, minDefensiveRounds: 0, requiredConsecutive: 1,
    consecutiveApprovals: 0, materials: JSON.stringify(stagnationData), history: [],
  };
  // ... build routing prompt and return wake_ceo action
}
```

### mlra-server/daemon.mjs
- **Fix 2**: 新增 `_handleStagnation(event)` 方法
- `stagnation_detected` 事件处理从 `console.error + TODO` 升级为实际仲裁调用
- `_routeToAgent()` 日志从 Warning 更新为 "Message queued"

### mlra-server/protocol.mjs
- **Fix 2**: 新增 `orchestrator→ceo:stagnation_arbitration` 路由模板

### mlra-server/server.mjs
- **Fix 3**: submit 工具新增 `progress` 参数，metadata 传递

### app/src/store/mlraStore.ts
- **Fix 3**: `Launcher` 接口新增 `lastProgress: string | null`
- 默认值初始化 `lastProgress: null`
- `mlra_orchestration_status` 处理新增 lastProgress 同步

### mcp_prompts/skill_execution_expert.md
- **Fix 3**: 提交阶段添加 progress 参数填写指引

### .myLastChat/MLC_MLRA编排流程完整分析.md
- 变更日志新增 v3 条目（详细记录 4 项修复 + 额外清理）
- 更新关键差距描述（标注已修复项）

## 5. Problem Solving

### 问题 1: `_handleCeoRejection` 中 `targets` 未定义（二次验证发现）
- **表现**: `stagnation_arbitration` 分支引用 `targets.length` 但方法签名只有 `reason` 参数
- **根因**: 新增 `stagnation_arbitration` 分支时忘记 `targets` 不在作用域内
- **修复**: 方法签名改为 `_handleCeoRejection(reason, targets = [])`，调用处 `handleCeoVerdict` 传入 targets

### 问题 2: `final_complete` 死代码
- **表现**: `_needsHumanReview` 中 `submitType === "final_complete"` 条件永远不会为 true（final_complete 早已从 SUBMIT_TYPES 移除）
- **修复**: 删除该条件分支

### 问题 3: Terminal cwd 问题
- **表现**: 第一次 syntax check 命令因 cwd 错误失败 (`cd /d` 在 bash 中无效)
- **修复**: 使用引号括起路径 `cd "e:\Dev\my-last-feedback"`

### 问题 4: Git 暂存区包含无关 ref-repos 文件
- **表现**: `git add -A` 暂存了 1852 个文件（包含 ref-repos 子目录）
- **修复**: 使用 `git reset HEAD` + 选择性 `git add` 只提交 8 个目标文件

## 6. Pending Tasks and Next Steps

本次会话所有任务已完成，Git 已提交为 `34e0dfb`。

### 已完成任务回顾
所有 4 项中风险修复 + 二次验证 + 死代码清理 + 文档更新 + Git 提交均已完成。

### 潜在后续工作（非本次会话承诺）
以下是从风险分析文档中识别的剩余改进方向：

1. **Phase 管理增强**: 当前 `currentPhaseId` 仅是字符串标识，无真正的 Phase 列表/总数。`lastProgress` 提供了轻量级替代，但如需精确 Phase 追踪（如 Phase 3/7），需要在 orchestrator 中维护 Phase 列表。
2. **Worker 超时后处理**: 当前超时仅 reject Promise，daemon 端可选增强 — 标记 Worker 为 derailed、通知 SessionManager、尝试分配 standby Worker。
3. **前端 lastProgress 展示**: store 已同步 `lastProgress` 字段，但前端 UI 尚未有展示位置（可在 AgentColumn 或状态栏中显示）。
4. **消息队列上限**: 当前 messageQueue 无大小限制，极端情况下可能内存泄漏。可考虑添加 `maxQueueSize` 参数。
