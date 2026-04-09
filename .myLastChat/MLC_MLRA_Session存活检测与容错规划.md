---
title: "MLRA Session 存活检测与容错机制规划"
description: "基于 Transcript 监控的 Agent 脱轨检测、备用 Session 容错、预算控制完整规划"
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - MLRA
    - alive-detection
    - transcript-monitor
    - fault-tolerance
    - budget-control
    - session-management
---

# MLRA Session 存活检测与容错机制规划

> 版本: v1.0-draft | 日期: 2026-04-10

---

## 1. 背景与核心问题

### 1.1 问题定义

在 MLRA 系统中，每个角色（Expert / Inspector / CEO / Worker）由一个 VS Code Copilot Chat Session 扮演。Session 通过 MCP 阻塞工具（`register_LRA` / `submit` / `submit_feedback`）与 MLRA 编排器保持连接。

**核心问题**: 如何精确检测 Session 是否正常在线，以及在异常发生时如何自动恢复？

### 1.2 正常 Session 生命周期

在 MLRA 的设计中，Agent 的正常生命周期是一个**无限阻塞循环**：

```
register_LRA() → [阻塞] → 返回初始指令 → Agent 工作
  → submit() → [阻塞] → 返回下一轮指令 → Agent 工作
  → submit() → [阻塞] → 返回下一轮指令 → ...
```

在这个循环中，**Agent 永远不应该自行结束 turn**。因为：

- 每次 Agent 的输出最终都应调用某个 MLRA 阻塞工具
- 阻塞工具不返回 → Agent 的 turn 不会结束 → 不会产生 `turn_end` 事件
- 工具返回后 → Agent 在同一个 turn 内继续执行 → 再次调用阻塞工具

**因此 `turn_end` 的出现和 TCP 断开都是脱轨的信号。**

---

## 2. 信息源：VS Code Copilot Transcript

### 2.1 Transcript 文件位置

每个 VS Code Chat Session 会生成一个 JSONL 格式的 transcript 文件：

```
{workspaceStorage}/{workspaceId}/GitHub.copilot-chat/transcripts/{sessionId}.jsonl
```

- `workspaceId`: VS Code 内部为每个 workspace 生成的 hash
- `sessionId`: Chat Session 的 UUID（与 Hook 脚本中的 `session_id` 一致）

### 2.2 Transcript 事件类型

| 事件类型 | 数据字段 | 说明 |
|---------|---------|------|
| `session.start` | sessionId, copilotVersion, vscodeVersion, startTime | Session 创建 |
| `user.message` | content, attachments, timestamp | 用户消息（含编排器注入的消息） |
| `assistant.turn_start` | turnId, timestamp | Agent 开始一个新的 turn |
| `assistant.message` | messageId, content, toolRequests, reasoningText | Agent 输出（含推理和工具调用请求） |
| `tool.execution_start` | toolCallId, toolName, arguments | 工具开始执行 |
| `tool.execution_complete` | toolCallId, success | 工具执行完成 |
| `assistant.turn_end` | turnId, timestamp | **Agent 结束了 turn** |

### 2.3 Transcript 最后一行 = 精确状态信号

| 最后事件类型 | Session 状态 | 说明 |
|-------------|-------------|------|
| `session.start` | 刚启动 | 等待 Agent 首次交互 |
| `tool.execution_start(register_LRA)` | **正常** — 注册阻塞中 | 等待编排器 release |
| `tool.execution_start(submit)` | **正常** — submit 阻塞中 | 等待编排器路由 |
| `tool.execution_start(submit_feedback)` | **正常** — worker 等待任务 | 等待编排器分配 |
| `tool.execution_start(其他工具)` | **正常** — Agent 执行中 | 如 read_file, grep_search 等 |
| `tool.execution_complete` | **正常** — 工具刚返回 | Agent 即将继续下一步 |
| `assistant.message` | **正常** — Agent 正在推理 | 即将产生工具调用 |
| `assistant.turn_start` | **正常** — 新 turn 开始 | Agent 开始处理 |
| `user.message` | **正常** — 刚注入消息 | Agent 即将响应 |
| **`assistant.turn_end`** | **异常 — 脱轨** | **需要立即干预** |

---

## 3. Session 状态模型

### 3.1 三态模型

Session 只有三个状态：

```
  connected    ← 正常：session 通过 MLRA 阻塞工具维持连接
  derailed     ← 脱轨：session 脱离 MLRA 控制，正在重试恢复
  broken       ← 不可恢复：重试耗尽，需要候补或人工干预
```

```
                 ┌──────── 重注入成功 ──────────┐
                 │                              │
                 ▼                              │
  [connected] ──── turn_end 或 TCP 断开 ────→ [derailed]
       ▲                                        │
       │                                        │
       │    候补 Session 接管成功                 │
       └────────────────────────────────────────│
                                                │
                                        重试次数超限
                                                │
                                                ▼
                                           [broken]
                                                │
                                      有备用? → 激活候补 → [connected]
                                      无备用? → 通知用户重建
```

### 3.2 脱轨触发条件

| 触发源 | 信号 | 原因 |
|--------|------|------|
| **Transcript `turn_end`** | JSONL 新增 `assistant.turn_end` 行 | Agent 没遵守指令，未调用 MLRA 阻塞工具就结束了 turn |
| **TCP Socket 断开** | `daemon.mjs` 的 `socket.on("close")` | 网络波动、速率限制中断、VS Code 重启、用户关闭 session |

**两者进入同一个恢复流程**，区别仅在于恢复成功率：
- `turn_end` 脱轨 → session 本身还活着，重注入成功率高
- TCP 断开 → session 可能已不存在，重注入可能失败

---

## 4. 脱轨检测实现

### 4.1 TranscriptMonitor 组件

```javascript
/**
 * TranscriptMonitor — 监控单个 Session 的 Transcript JSONL 文件
 * 
 * 职责：
 * - fs.watch 监控文件变更
 * - 增量读取新追加的行
 * - 检测 turn_end 事件 → 发出 derailed 信号
 * - 检测 MLRA 工具调用 → 确认 connected
 */
class TranscriptMonitor extends EventEmitter {
  constructor(sessionId, transcriptPath, callerId) {
    super();
    this.sessionId = sessionId;
    this.transcriptPath = transcriptPath;
    this.callerId = callerId;
    this.lastOffset = 0;       // 文件读取偏移量
    this.watcher = null;
    this.status = "unknown";   // unknown → connected → derailed
  }

  start() {
    // 读取已有内容确定初始状态
    this._processFile();
    
    // 监控文件变更
    this.watcher = fs.watch(this.transcriptPath, { persistent: false }, () => {
      this._processNewLines();
    });
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  _processNewLines() {
    const stat = fs.statSync(this.transcriptPath);
    if (stat.size <= this.lastOffset) return;

    const fd = fs.openSync(this.transcriptPath, "r");
    const buf = Buffer.alloc(stat.size - this.lastOffset);
    fs.readSync(fd, buf, 0, buf.length, this.lastOffset);
    fs.closeSync(fd);
    this.lastOffset = stat.size;

    const lines = buf.toString("utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        this._handleEvent(event);
      } catch {}
    }
  }

  _handleEvent(event) {
    switch (event.type) {
      case "tool.execution_start": {
        const toolName = event.data?.toolName;
        if (MLRA_TOOLS.has(toolName)) {
          // Agent 正在调用 MLRA 工具 → 确认连接
          if (this.status !== "connected") {
            this.status = "connected";
            this.emit("connected", this.callerId, this.sessionId);
          }
        }
        break;
      }

      case "assistant.turn_end": {
        // Agent 结束了 turn → 脱轨!
        this.status = "derailed";
        this.emit("derailed", this.callerId, this.sessionId, "turn_end");
        break;
      }
    }
  }
}

const MLRA_TOOLS = new Set([
  "register_LRA",
  "submit",
  "router_vote",
  "order",
  "check_orders",
  "await_order_finish",
  "submit_feedback",
]);
```

### 4.2 TCP 断开检测

已有实现（`daemon.mjs`），需扩展为发出 derailed 信号：

```javascript
// daemon.mjs — _handleMcpConnection 中
socket.on("close", () => {
  console.error("[MLRA-Daemon] MCP server disconnected:", callerId);
  if (callerId) {
    this.connections.delete(callerId);
    this.router.reject(callerId, "Agent disconnected");
    
    // 新增：通知 SessionManager 发出 derailed 信号
    this.sessionManager.handleTcpDisconnect(callerId);
  }
});
```

### 4.3 Hook 脚本扩展

`inject-agent-name.mjs` 需要在 `SessionStart` 时将以下信息发送给 MLRA Daemon：

```javascript
// SessionStart 时额外发送的信息
{
  type: "session_registered",
  session_id: sessionId,           // Session UUID
  agent_name: agentName,           // 4字符别名
  transcript_dir: process.env.VSCODE_TARGET_SESSION_LOG 
    ? path.dirname(path.dirname(process.env.VSCODE_TARGET_SESSION_LOG))
    : null,                        // 反推 transcripts 目录路径
  workspace: data.workspace_folder || ""
}
```

通过 `VSCODE_TARGET_SESSION_LOG` 环境变量可反推 transcript 文件路径：
```
VSCODE_TARGET_SESSION_LOG:
  workspaceStorage/{id}/GitHub.copilot-chat/debug-logs/{sessionId}
  
反推:
  workspaceStorage/{id}/GitHub.copilot-chat/transcripts/{sessionId}.jsonl
```

---

## 5. 备用 Session 机制

### 5.1 概念

用户在配置阶段可以为关键角色创建多个 Session：1 个主 Session + N 个备用 Session。

```
角色: planning-expert
├─ 主 Session (active)     → register_LRA 阻塞中，编排器 release 给它初始指令
├─ 备用 Session 1 (standby) → register_LRA 阻塞中，等待激活
└─ 备用 Session 2 (standby) → register_LRA 阻塞中，等待激活
```

**关键特性**: 备用 Session 调用 `register_LRA` 后保持阻塞 → **不消耗额外 premium request**（MCP 阻塞不计为新请求）。

### 5.2 数据模型

```typescript
interface SessionPool {
  role: AgentRole;
  primary: SessionEntry | null;       // 当前活跃的主 Session
  standbys: SessionEntry[];           // 备用 Session 队列（按注册顺序）
  retryCount: number;                 // 当前 primary 的重试次数
  maxRetries: number;                 // 重试上限（默认 3）
  failoverCount: number;              // 历史候补切换次数
}

interface SessionEntry {
  callerId: string;                   // MCP caller ID
  sessionId: string;                  // VS Code Chat Session UUID
  alias: string;                      // 4 字符别名
  transcriptPath: string | null;      // Transcript 文件路径
  status: "connected" | "derailed" | "broken";
  registeredAt: string;
}
```

### 5.3 故障切换流程

```
主 Session 脱轨 (turn_end 或 TCP 断开)
  │
  ├─ 1. 标记 primary.status = "derailed"
  ├─ 2. retryCount++
  ├─ 3. 推送 UI 通知: "[角色] 脱轨，正在重试 ({retryCount}/{maxRetries})..."
  │
  ├─ 4. 尝试重注入引导消息（如果 session 还存活，即 turn_end 类型脱轨）
  │      → 注入内容: "你没有调用 submit 工具。请立即调用 submit 提交工作结果。"
  │      → 等待 TranscriptMonitor 检测到新的 MLRA 工具调用 (timeout: 30s)
  │
  ├─ 重注入成功?
  │    → 恢复: primary.status = "connected", retryCount = 0
  │    → 额度消耗: +1 × multiplier (新的用户消息 = 新请求)
  │
  └─ 重注入失败 或 retryCount > maxRetries?
       │
       ├─ 标记 primary.status = "broken"
       │
       ├─ 有备用 Session (standbys.length > 0)?
       │    │
       │    ├─ 5. 从 standbys 取出第一个 → 提升为 primary
       │    ├─ 6. 构建断点恢复上下文（见 §5.4）
       │    ├─ 7. 通过 router.release 解除其 register_LRA 阻塞，注入恢复指令
       │    │      → 额度消耗: +1 × multiplier
       │    ├─ 8. failoverCount++
       │    ├─ 9. retryCount = 0
       │    └─ 10. 推送 UI 通知: "候补 Session {alias} 已接管 {角色}"
       │
       └─ 无备用 Session?
            │
            ├─ 标记角色为 broken
            ├─ 推送 UI: "[角色] 无法恢复，请手动创建新 Session"
            └─ UI 显示 [重建 Session] 按钮
```

### 5.4 断点恢复上下文

候补 Session 接管时，它是一个全新的 session（没有之前的对话历史）。编排器需要构建充分的上下文注入：

```
[断点恢复指令]

你是 {角色名}。你正在接替一个因异常中断的 session 继续工作。

## 当前任务
{userTask — 用户最初提交的任务描述}

## 当前阶段
{phase} — {phaseId}

## 上一轮工作概要
{最后一次该角色 submit 的 content（来自编排器 round 历史）}

## 来自对方的最新反馈
{最后一次路由给该角色的 content}

## 行为要求
请基于以上上下文继续工作。使用 submit 工具提交你的工作结果。

{tailInjection}
```

编排器的 `rounds[]` 数组和 `handleSubmit` 中保存的内容足以构建此恢复上下文。

### 5.5 UI 表现

在 MLRA Agent 列的标题栏中显示 Session 池状态：

```
┌─ 规划专家 (Claude Opus) ── [● 1+2 备用] ──┐
│                                            │
│  (正常工作面板)                              │
│                                            │
└────────────────────────────────────────────┘
```

```
┌─ 规划专家 (Claude Opus) ── [⚠ 脱轨重试中 1/3] ──┐
│                                                   │
│  (面板顶部显示恢复进度条)                           │
│                                                   │
└───────────────────────────────────────────────────┘
```

```
┌─ 规划专家 (Claude Opus) ── [🔄 候补接管: B2F1] ──┐
│                                                   │
│  (候补 Session 已激活，正常工作)                    │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 6. 预算控制

### 6.1 额度信息来源

VS Code Copilot 的 `debug-logs/{sessionId}/models.json` 包含完整的计费信息：

```json
{
  "billing": {
    "is_premium": true,
    "multiplier": 30
  },
  "id": "claude-opus-4.6-fast",
  "name": "Claude Opus 4.6 (fast mode)"
}
```

| 模型 | multiplier | 每次请求消耗 |
|------|-----------|-------------|
| Claude Opus 4.6 fast | 30× | 30 premium requests |
| Claude Opus 4.6 | 3× | 3 premium requests |
| Claude Sonnet 4 | 1× | 1 premium request |
| GPT 5.4 | 待确认 | 待确认 |
| GPT 4.1 | 1× | 1 premium request |

### 6.2 消耗计算规则

| 事件 | 消耗 | 说明 |
|------|------|------|
| Agent 首次注册（register_LRA 返回） | 1 × multiplier | Session 的首次交互 |
| 正常 submit → 阻塞 → release 循环 | **0** | MCP 阻塞不消耗额外请求 |
| 脱轨重注入恢复 | 1 × multiplier | 注入新的用户消息 = 新请求 |
| 候补 Session 接管 | 1 × multiplier | 新 Session 的首次交互 |
| 备用 Session 待命（register_LRA 阻塞中） | **0** | 阻塞不消耗 |

### 6.3 预算追踪数据模型

```typescript
interface BudgetConfig {
  limit: number;                      // 用户设定的 premium request 上限
  warningThreshold: number;           // 预警阈值（如 80%）
}

interface BudgetTracker {
  config: BudgetConfig;
  consumed: number;                   // 已消耗总量
  records: ConsumptionRecord[];       // 消耗明细

  // 方法
  recordConsumption(record: ConsumptionRecord): void;
  canProceed(): boolean;              // consumed < config.limit
  remainingBudget(): number;          // config.limit - consumed
  isWarning(): boolean;               // consumed >= config.limit * warningThreshold
}

interface ConsumptionRecord {
  timestamp: string;
  role: AgentRole;
  sessionAlias: string;               // 4字符别名
  model: string;
  multiplier: number;
  reason: "initial" | "retry" | "failover";
  details: string;                    // 人类可读说明
}
```

### 6.4 预算触发暂停

```
每次额度消耗事件发生后:
  budget.consumed += multiplier
  
  if (budget.isWarning()):
    → 推送 UI 通知: "⚠ 预算已使用 {consumed}/{limit} ({percent}%)"
  
  if (!budget.canProceed()):
    → 暂停 Launcher (status → "paused")
    → 不释放任何 pending 的 router 阻塞（所有 Agent 保持冻结）
    → 推送 UI 通知: "🛑 预算已耗尽 ({consumed}/{limit})，Launcher 已自动暂停"
    → UI 显示:
        [增加预算] → 用户输入新上限 → 恢复运行
        [终止 Launcher] → 取消所有 Agent
```

### 6.5 模型额度表获取

模型 multiplier 的获取有两种方式：

1. **从 models.json 读取**（精确但滞后）:
   - 只有在 session 创建后才有文件
   - 路径: `debug-logs/{sessionId}/models.json`

2. **用户手动配置**（即时但需维护）:
   - 在 Launcher 配置界面中为每个角色选择模型时同时设定 multiplier
   - 可内置默认值表

建议采用方案 2 为主、方案 1 为校验/自动修正。

---

## 7. SessionManager 统一管理

### 7.1 职责

SessionManager 是 Daemon 中的新增组件，统一管理所有 Session 的存活检测、故障恢复和预算控制。

```
┌─ SessionManager ───────────────────────────────────────────┐
│                                                             │
│  ┌─ TranscriptMonitor Pool ──┐  ┌─ SessionPool ──────────┐ │
│  │                           │  │                         │ │
│  │ session_1.jsonl → Monitor │  │ role → primary + stbys  │ │
│  │ session_2.jsonl → Monitor │  │ retryCount, maxRetries  │ │
│  │ session_3.jsonl → Monitor │  │ failoverCount           │ │
│  │ ...                       │  │                         │ │
│  └───────────┬───────────────┘  └───────────┬─────────────┘ │
│              │                              │               │
│              ▼                              ▼               │
│  ┌─ 事件处理 ──────────────────────────────────────────┐    │
│  │                                                     │    │
│  │  on "derailed" (from TranscriptMonitor or TCP):     │    │
│  │    → retryReinjection() → 成功? → connected         │    │
│  │    → 失败? → activateStandby() → 成功? → connected  │    │
│  │    → 全失败? → markBroken()                         │    │
│  │                                                     │    │
│  │  每次消耗事件:                                       │    │
│  │    → budgetTracker.record()                         │    │
│  │    → !canProceed()? → pauseLauncher()               │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ BudgetTracker ─────────────────────────────────────┐    │
│  │                                                     │    │
│  │  limit: 100, consumed: 37, records: [...]           │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 API

```typescript
interface SessionManager {
  // Session 注册
  registerSession(callerId: string, sessionId: string, alias: string, 
                  transcriptDir: string): void;
  
  // 角色分配（区分主/备用）
  assignAsPrimary(callerId: string, role: AgentRole): void;
  assignAsStandby(callerId: string, role: AgentRole): void;
  
  // 故障处理
  handleTcpDisconnect(callerId: string): void;
  handleTranscriptDerailed(callerId: string, sessionId: string): void;
  
  // 预算
  setBudgetLimit(limit: number): void;
  getBudgetStatus(): { consumed: number; limit: number; records: ConsumptionRecord[] };
  
  // 状态查询
  getSessionPool(role: AgentRole): SessionPool;
  getAllPools(): Map<AgentRole, SessionPool>;
}
```

---

## 8. 重注入机制

### 8.1 问题

脱轨检测后，需要向指定的 VS Code Chat Session 注入新消息让 Agent 重新调用 MLRA 工具。

### 8.2 可选方案

| 方案 | 实现方式 | 优势 | 劣势 |
|------|---------|------|------|
| **A. VS Code Extension API** | `vscode.commands.executeCommand("chat.open", { query, mode })` | 精确控制 | 需要 VS Code 扩展 |
| **B. Copilot Hooks** | 通过 Hook 注入 `systemMessage` 或 `additionalContext` | 零扩展依赖 | 只在 Hook 触发时注入，不主动 |
| **C. 手动操作** | UI 通知用户，用户在对应 session 手动输入 | 最简单 | 需要人工干预 |

**推荐策略**: A 为主，C 为兜底。

### 8.3 重注入消息模板

**脱轨恢复（turn_end 类型）**:
```
你刚才没有调用 submit 工具就结束了交互。这违反了 MLRA 编排协议。
请立即调用 submit 工具提交你的工作结果。
如果你没有待提交的结果，请调用 submit 并说明当前状态。
```

**TCP 断开后重建（新 session 或候补接管）**:
```
[断点恢复]
你是 {角色名}，接替一个因异常中断的 session 继续工作。
{恢复上下文... 见 §5.4}
```

---

## 9. 实现路线图

### Phase 0: 前置准备

- [ ] 扩展 `inject-agent-name.mjs` Hook：SessionStart 时 TCP 发送 session_id + transcript 目录路径
- [ ] 确认 `VSCODE_TARGET_SESSION_LOG` 环境变量在 Hook 中可用
- [ ] 验证 transcript JSONL 文件在 MCP 阻塞时确实不更新（确认假设）

### Phase 1: TranscriptMonitor

- [ ] 实现 `TranscriptMonitor` 类（fs.watch + 增量读取 + 事件检测）
- [ ] 在 Daemon 中集成，注册时自动为每个 session 启动监控
- [ ] 单元测试：模拟 turn_end 事件检测

### Phase 2: SessionManager 核心

- [ ] 实现 `SessionManager` 类
- [ ] Session 注册和角色分配（主/备用）
- [ ] TCP 断开和 Transcript 脱轨的统一处理入口
- [ ] 重试逻辑（retryCount + maxRetries）

### Phase 3: 备用 Session 容错

- [ ] 候补队列管理
- [ ] 断点恢复上下文构建
- [ ] 候补激活流程（release register_LRA 阻塞 + 注入恢复指令）
- [ ] UI：Session 池状态显示

### Phase 4: 预算控制

- [ ] 实现 `BudgetTracker` 类
- [ ] 模型 multiplier 表（内置默认 + models.json 校验）
- [ ] 消耗记录 + 预警 + 自动暂停
- [ ] UI：预算面板（已用/总量/明细）

### Phase 5: 重注入机制

- [ ] 评估 VS Code Extension API 可行性
- [ ] 实现 `chat.open` 方式的消息注入
- [ ] 兜底方案：UI 通知用户手动操作

---

## 10. 与现有系统的集成点

| 集成点 | 现有组件 | 修改内容 |
|--------|---------|---------|
| Hook 脚本 | `inject-agent-name.mjs` | 新增 TCP 发送 session_id + transcript 路径 |
| Daemon | `daemon.mjs` | 新增 SessionManager，扩展 socket close 处理 |
| Router | `router.mjs` | 无修改（现有 isBlocked/release 机制够用） |
| Orchestrator | `orchestrator.mjs` | 新增 agent status: "derailed"/"broken" |
| Protocol | `protocol.mjs` | 新增消息类型: MLRA_SESSION_DERAILED, MLRA_SESSION_FAILOVER |
| Store (前端) | `mlraStore.ts` | 新增 SessionPool 和 BudgetTracker 类型 |
| IPC Bridge | `ipc-bridge.mjs` | 新增推送: 脱轨通知、恢复通知、预算通知 |
