---
title: MLRA 蓝图任务库规划与停止功能实现会话摘要
description: 完成蓝图任务库与单执行器解耦规划、实现 MLRA 停止功能、优化 light/dark 主题 UI
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
tags:
  - MLRA
  - 蓝图任务库
  - 停止功能
  - UI 优化
solved_lists:
  - 创建 MLRA 蓝图任务库与单执行器解耦规划书
  - 实现 MLRA 停止功能（前端发起、daemon 实现、状态清空）
  - 优化停止确认 UI（固定模态对话、背景模糊、overlay）
  - 调整 light/dark 主题 tag 和 policy control 对比度
  - 允许从 cancelled/completed 状态重新启动 MLRA 任务
---

# MLRA 蓝图任务库规划与停止功能实现会话摘要

最后更新：2026-04-26

## 1. 背景与需求确认

用户提出明确的产品架构需求，替代了旧的 Launcher 心智：

> "我们要创造一个新机制，用户随时创建新蓝图任务并保存，不必立即开始。蓝图任务列表和蓝图编排器执行过程是完全两个独立的。如果有正在运行的任务，用户创建性蓝图任务时仅能点击保存按钮，无法开始。"

## 2. 创建规划文档

**文件：** [.myLastChat/MLC_MLRA蓝图任务库与单执行器解耦规划书.md](.myLastChat/MLC_MLRA蓝图任务库与单执行器解耦规划书.md)

**核心内容：**

### 2.1 新产品模型：蓝图任务库 + 单运行编排器

- 当前 daemon 内部只有一个 Orchestrator，同一时间仅允许一个编排任务运行
- 用户可随时创建、编辑、保存蓝图任务，不触发 daemon 消息
- 启动任务时使用 runtime snapshot，避免后续编辑影响当前运行
- 运行中仅能保存新任务，禁用"开始"按钮

### 2.2 UI 与交互

- 保存按钮：始终可用（保存到本地 blueprintTasks state）
- 开始按钮：新增条件 "无已经在运行的任务"
- 停止按钮：运行中显示，确认后取消编排并回到蓝图编辑页
- 状态流：configuring → ready → running → cancelled/completed → 回到 configuring

### 2.3 三阶段实施路线

**第一阶段（最小闭环）：**
- 新增 BlueprintTask 数据模型和 blueprintTasks state
- 当前蓝图编辑页改为编辑 selected BlueprintTask
- 新增保存按钮（不发送 daemon）
- 开始按钮新增 "无已经在运行的任务" 条件
- start 时复制 task 到 runtime，发送 daemon

**第二阶段（任务列表 UI）：**
- 增加蓝图任务列表 UI
- 支持新建、切换、重命名、删除、复制
- 显示更新时间和未保存状态

**第三阶段（内部清理）：**
- 拆分 Launcher 混合模型
- 将 runtime 独立为 ExecutionState
- 命名统一到 BlueprintTask

## 3. 实现 MLRA 停止功能

### 3.1 前端层（FeedbackApp.tsx）

添加完整的停止交互流程：

```typescript
// 新增 TimerStatsPopover 组件
// - 显示运行统计（轮数、阶段）
// - 底部"停止"按钮
function TimerStatsPopover({ rounds, stages, onRequestStop }) {
  return (
    <button className="timer-stop-entry" onClick={handleStop}>
      停止
    </button>
  )
}

// 新增 RunningTimer 组件
// - 管理停止确认对话状态
// - 乐观关闭对话（可按 Esc 取消）
function RunningTimer() {
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false)
  // 显示固定模态对话，背景模糊
  return (
    <div className="timer-stop-overlay">
      <div className="timer-stop-dialog">
        <div className="stop-header">确认停止当前 MLRA</div>
        <div className="stop-body">
          当前编排会被取消，阻塞中的角色调用会被释放。
        </div>
        <div className="stop-actions">
          <button onClick={() => setStopConfirmOpen(false)}>取消</button>
          <button onClick={handleConfirmStop} className="danger">
            确认停止
          </button>
        </div>
      </div>
    </div>
  )
}
```

### 3.2 Store 层（mlraStore.ts）

```typescript
daemonCancelOrchestration: () => {
  // 立即发送 daemon 消息
  sendToDaemon({ type: "mlra_cancel" })
  
  // 乐观更新本地状态（不等 daemon 回复）
  set(state => ({
    status: 'cancelled',
    humanGate: { pending: false },
    stageExitPending: false,
    ceoGate: { ...state.ceoGate, inactive: true },
    // 关闭未完成的轮次
    roundHistory: state.roundHistory.map(r => ({
      ...r,
      completed: state.currentRound?.id === r.id ? true : r.completed
    })),
    currentRound: null,
    // 重置 main agents
    mainAgents: state.mainAgents.map(a => ({
      ...a,
      status: 'idle'
    }))
  }))
}

// startOrchestration 现接受 cancelled 和 completed
if (!['idle', 'configuring', 'cancelled', 'completed'].includes(state.status)) {
  return
}

// 启动前重置所有运行时字段
set(state => ({
  status: 'running',
  roundHistory: [],
  currentRound: null,
  humanGate: { pending: false },
  stageExitPending: false,
  ceoGate: { ...initialGate, inactive: false },
  mainAgents: []
}))
```

### 3.3 Daemon 层（orchestrator.mjs）

```typescript
cancelOrchestration(reason = "Orchestration cancelled by user") {
  // 结束当前轮次
  this._endCurrentRound()
  
  // 设置状态
  this.status = 'cancelled'
  
  // 清空门控
  this.humanGate = { pending: false }
  this.stageExitPending = false
  this.ceoGate = { ...this.ceoGate, inactive: true }
  
  // 重置投票状态
  this.votes = {}
  this.stagnationCount = 0
  
  // 重置 roles
  for (const role of ['expert', 'inspector', 'ceo']) {
    if (this.roleStates[role]) {
      this.roleStates[role].status = 'idle'
    }
  }
  
  // 通知所有连接
  this.emit('orchestration_status', { status: 'cancelled', reason })
  this.emit('human_gate_update', this.humanGate)
  this.emit('ceo_gate_update', this.ceoGate)
}
```

**关键改进：**
- 前端乐观更新：无需等待 daemon 回复，立即显示 cancelled 状态
- Daemon 异步清空：真实持久化取消状态，释放阻塞的 role 调用
- Router 清空：`cancelAll()` 方法中止所有待处理的消息队列

### 3.4 IPC 处理（daemon/index.mjs）

```typescript
case MSG.MLRA_CANCEL:
  console.log('[MLRA] Received cancel request')
  
  // Orchestrator 状态机转移
  this.orchestrator.cancelOrchestration("Orchestration cancelled by user")
  
  // Router 清空所有待处理消息和阻塞
  this.router.cancelAll(
    reason = "User cancelled orchestration"
  )
  
  // 推送最终状态给所有连接
  this._pushStatus()
  break
```

## 4. Light/Dark 主题 UI 优化

### 4.1 Tag/Policy Control 样式调整

**Light Mode Overrides（index.css）：**

```css
/* 未选中 tag */
.mlra-node-workbench .mlra-task-type-chip {
  background: transparent;
  border: 1px solid rgba(0,0,0,0.2);
  color: rgba(0,0,0,0.7);
}

/* 选中 tag */
.mlra-node-workbench .mlra-task-type-chip.active {
  background: #e6f5f2;
  border: 1px solid #c7e3de;
  color: #006c63;
}

/* 未选中 policy option */
.mlra-node-workbench .mlra-policy-option {
  background: rgba(0,0,0,0.02);
  border: 1px solid rgba(0,0,0,0.08);
}

/* 选中 policy option */
.mlra-node-workbench .mlra-policy-option.active {
  background: rgba(198, 235, 231, 0.3);
  border: 1px solid #c7e3de;
}
```

**Dark Mode Refinements：**
- 调整 hover 和 active 状态的色值
- 保持充足的对比度（WCAG AA 标准）

### 4.2 停止确认对话样式

```css
/* 半透明暗化背景 */
.timer-stop-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

/* 模态对话框 */
.timer-stop-dialog {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-editorGroup-border);
  border-radius: 8px;
  padding: 20px;
  max-width: 400px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}

/* 停止按钮（纯红） */
.timer-stop-entry {
  background: #ff2d2d;
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.timer-stop-entry:hover {
  background: #ff4545;
}
```

## 5. 关键技术决策

### 5.1 前端乐观更新

停止后立即在前端设置 `status: 'cancelled'`，不等 daemon 回复。好处：
- UI 响应迅速
- 避免用户重复点击
- daemon 异常时也能降级到前端状态

### 5.2 Daemon 异步清空

`orchestrator.cancelOrchestration()` 真实改变状态机，确保：
- 已阻塞的 role 调用被释放
- 状态持久化（如需重启）
- 事件推送通知所有连接

### 5.3 Status 流转允许 Restart

修改 `startOrchestration` 接受 `cancelled` 和 `completed` 状态，支持：
- 用户从 cancelled 重新启动同一任务
- 任务完成后立即启动新任务
- 完整的往返工作流

## 6. 验收状态

**编译：** ✅ 全工作区 0 errors

**已变更文件：**
- app/src/components/FeedbackApp.tsx（新增停止 UI）
- app/src/store/mlraStore.ts（新增取消 action）
- app/src/index.css（新增停止和主题样式）
- mcp/mlra/daemon/orchestrator.mjs（新增 cancelOrchestration 方法）
- mcp/mlra/daemon/index.mjs（新增 MLRA_CANCEL 处理）
- .myLastChat/MLC_MLRA蓝图任务库与单执行器解耦规划书.md（规划文档）

**未提交：** 待用户验收确认

## 7. 下一步行动

1. **验收与提交**：确认代码质量和功能完整性，提交或继续迭代
2. **第一阶段实施**：根据规划书，实现 BlueprintTask 数据模型和保存功能
3. **测试验证**：运行 UI 测试，验证停止、重启、主题切换等场景
