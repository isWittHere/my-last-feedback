---
title: "MLRA VS Code Copilot 自动化方案规划"
description: "基于 VS Code 扩展 + Copilot Chat API 的多 Agent 编排自动化方案"
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - MLRA
    - VSCode
    - Copilot
    - chat-automation
    - agent-orchestration
    - extension-api
---

# MLRA VS Code Copilot 自动化方案规划

> 版本: v0.2-draft | 日期: 2026-04-08 (PoC 验证通过 + 用户手动 Session + register_LRA 方案确立)

---

## 1. 概述

### 1.1 背景

此方案是对原 [CLI 自动化方案](MLC_MLRA_CLI自动化方案规划.md) 的替代路线。用户反馈 CLI 方案（ACP + 进程管理 + Rust 开发）过于复杂，提出直接利用 VS Code Copilot 插件已有的完善生态来实现多 Agent 编排。

### 1.2 核心思路

**不重新造轮子，利用 VS Code Copilot 已有能力**：

- VS Code Copilot 已有完善的 **自定义 Agent (`.agent.md`)** 机制 — 无需自建 Agent 框架
- VS Code Copilot 已有完善的 **工具列表限制** 机制 — 无需自建权限控制
- VS Code Copilot 已有完善的 **MCP 工具集成** — 直接复用 MLFB 现有 MCP Server
- VS Code Copilot 已有完善的 **Chat UI** — 无需自建前端

**我们只需要一个薄编排层**，实现：

1. ✅ **编程化创建 Chat Session** 并指定 Agent — `chat.open({mode})` 已验证
2. ✅ **编程化选择模型** — `modelSelector` 已验证
3. ✅ **编程化提交 Query 并等待响应** — `blockOnResponse` 已验证
4. ✅ **编程化控制工具白名单/黑名单** — `toolsInclude`/`toolsExclude` API 已确认
5. ⬜ **多 Session 并行** — 用户手动创建 + `register_LRA` 注册
6. ⬜ **Session 间通信** — 通过 MCP 工具实现（复用 MLFB 阻塞机制）

### 1.3 架构演进：从编排扩展到 MCP 纯编排

经过分析，确定采用 **用户手动 Session + `register_LRA` 阻塞注册** 方案，而非原计划的 VS Code 编排扩展方案。

| 维度 | 编排扩展方案 (v0.1) | register_LRA 方案 (v0.2, 采用) |
|------|-------------------|------------------------------|
| Session 创建 | 自动 (`chat.open`) | **用户手动** |
| Agent 注册 | 编排器追踪 session | **Agent 自注册** (`register_LRA` 阻塞) |
| 角色分配 | 代码硬编码 | **用户 UI 配置** (MLFB 桌面端) |
| 编排逻辑 | VS Code Extension | **MCP Server** (纯 Node.js) |
| Session 寻址 | 需要解决 widget 聚焦问题 | **不需要** — MCP 阻塞自然锁定 |
| VS Code 扩展 | **必须** | **不需要** |
| MLFB 复用度 | 中 (MCP + UI) | **极高** (caller 管理 + Tab UI + 阻塞机制) |

> **`chat.open` API 能力保留为可选的自动化快捷工具**，不作为核心架构依赖。

### 1.3 方案对比

| 维度 | CLI 方案 | VS Code 方案 |
|------|---------|-------------|
| 进程管理 | 需自建 (多进程 + 监控) | **零** — VS Code 内部管理 |
| 协议开发 | ACP SDK + 消息路由 | **零** — 已有 Chat 命令 |
| Rust 开发 | 必须 (Tauri + IPC) | **可选** — 初期纯 TS/JS |
| Agent 框架 | 需自建 system prompt 注入 | **零** — `.agent.md` 原生支持 |
| 工具控制 | 需自建审批机制 | **零** — `toolsInclude`/`toolsExclude` |
| 模型选择 | 需自建 per-session 设置 | **零** — `modelSelector` 参数 |
| UI | 需自建 (Tauri 前端) | **零** — Chat UI 原生可用 |
| 调试 | 困难 (多进程) | **简单** — VS Code 开发者工具 |
| 成本 | 与 CLI 相同 | **与 CLI 相同** (MCP 阻塞 = 0 额外请求) |
| 复杂度 | ★★★★★ | ★★☆☆☆ |

---

## 2. 已验证能力 (PoC 结果)

### 2.1 核心 API: `workbench.action.chat.open`

**来源**: VS Code `chatActions.ts` 源码反编译 + PoC 扩展实测

```typescript
interface IChatViewOpenOptions {
  // Agent/Mode 选择
  mode?: ChatModeKind | string;   // 'agent'|'ask'|'edit' 或自定义 agent 名称
  
  // 模型选择
  modelSelector?: {
    vendor?: string;  // 'copilot'
    id?: string;      // 'claude-sonnet-4', 'gpt-4.1', etc.
    family?: string;
  };
  
  // Query 控制
  query?: string;           // 要提交的消息
  isPartialQuery?: boolean; // true = 仅预填不提交
  
  // 工具控制
  toolsInclude?: string[];  // 工具白名单 (tool ID 或 reference name)
  toolsExclude?: string[];  // 工具黑名单
  
  // 响应等待
  blockOnResponse?: boolean; // true = 等待响应完成后返回
  
  // 上下文附件
  attachFiles?: (URI | { uri: URI; range: IRange })[];
  attachScreenshot?: boolean;
  toolIds?: string[];        // 附加工具引用
  previousRequests?: { request: string; response: string }[];
}
```

### 2.2 PoC 测试结果

| 测试 | 命令/参数 | 结果 | 说明 |
|------|----------|------|------|
| **Agent 选择** | `mode: 'test-echo'` | ✅ **成功** | Agent 选择器正确切换到自定义 agent |
| **自动提交** | `query + !isPartialQuery` | ✅ **成功** | Query 自动提交给指定 agent |
| **模型选择** | `modelSelector: {vendor:'copilot', id:'claude-sonnet-4'}` | ✅ **成功** | 确认使用 `claude-sonnet-4-20250514` |
| **等待响应** | `blockOnResponse: true` | ✅ **成功** | 返回完整结果对象 |
| **工具过滤** | `toolsInclude: ['read_file']` | ❌ **失败** | 工具 ID 需使用注册名（见 §2.3） |
| **预填不提交** | `isPartialQuery: true` | ✅ **成功** | 仅预填输入框 |
| **模型切换** | `changeModel` command | ✅ **成功** | legacy 方式也可用 |
| **新建 Session** | `openNewSessionEditor` | ✅ **成功** | 可开编辑器 Tab 形式 |
| **列出命令** | `getCommands` | ✅ **成功** | 找到 41 个 session 相关命令 |

### 2.3 blockOnResponse 返回值结构

```typescript
// blockOnResponse: true 时的返回值 (实测)
{
  timings: {
    firstProgress: 5667,   // ms, 首次进度
    totalElapsed: 5670     // ms, 总耗时
  },
  metadata: {
    promptTokens: 4841,
    outputTokens: 126,
    resolvedModel: "claude-sonnet-4-20250514",
    sessionId: "9d7a9c50-...",
    agentId: "github.copilot.editsAgent",
    toolCallRounds: [{
      response: "[test-echo] MLRA_AGENT_MODEL_TEST",
      toolCalls: [],
      thinking: { text: "..." }
    }]
  },
  details: "Claude Sonnet 4 • 1x"
}
```

**关键洞察**: `blockOnResponse` 返回的结果包含 **响应文本、token 用量、模型信息、thinking 内容** — 编排器可以直接解析这些数据。

### 2.4 工具 ID 映射 (待补充)

| 用户可见名称 | 实际注册 ID | Tool Reference Name |
|-------------|------------|-------------------|
| `read_file` | `copilot_readFile` | `read_file` |
| `list_dir` | `copilot_listDirectory` | `list_dir` |
| `grep_search` | `copilot_findTextInFiles` | `grep_search` |
| `file_search` | `copilot_findFiles` | `file_search` |
| `run_in_terminal` | `copilot_createAndRunTask` | `run_in_terminal` |
| `replace_string_in_file` | *TBD* | `replace_string_in_file` |
| `semantic_search` | `copilot_searchCodebase` | `semantic_search` |

> ⚠️ `toolsInclude` 和 `toolsExclude` 接受 tool ID 或 toolReferenceName。
> 需通过 Test 5 (`vscode.lm.tools`) 获取完整映射。

### 2.5 其他已发现的命令

| 命令 | 用途 | 参数 |
|------|------|------|
| `workbench.action.chat.changeModel` | 切换模型 | `{vendor, id, family}` |
| `workbench.action.chat.submit` | 提交当前输入 | 无 |
| `workbench.action.chat.newChat` | 新建 Chat Session | 无 |
| `workbench.action.openChat` | 新建编辑器 Chat Tab | 无 |
| `workbench.action.openChatToSide` | 新建侧边 Chat Tab | 无 |
| `workbench.action.newChatWindow` | 新建独立窗口 Chat | 无 |
| `workbench.action.chat.openSessionWithPrompt.copilotcli` | 以 prompt 打开 session | `{resource, prompt, attachedContext}` |

---

## 3. 架构设计

### 3.1 总体架构 (v0.2 — register_LRA 方案)

```
┌───────────────────────────────────────────────────────────────────────┐
│                         VS Code 进程                                  │
│                                                                       │
│  ┌─ Chat Tab 1 ──────┐  ┌─ Chat Tab 2 ──────┐  ┌─ Chat Tab 3 ─────┐ │
│  │  Agent: mlra-ceo   │  │  Agent: expert-code│  │  Agent: inspector │ │
│  │  Model: sonnet-4   │  │  Model: gpt-4.1    │  │  Model: sonnet-4  │ │
│  │                    │  │                    │  │                   │ │
│  │  MCP Tools:        │  │  MCP Tools:        │  │  MCP Tools:       │ │
│  │  ├ register_LRA    │  │  ├ register_LRA    │  │  ├ register_LRA   │ │
│  │  ├ submit_task     │  │  ├ report_result   │  │  ├ submit_review  │ │
│  │  └ check_results   │  │  └ (编码工具)       │  │  └ (只读工具)     │ │
│  └────────┬───────────┘  └────────┬───────────┘  └────────┬──────────┘ │
│           │                       │                       │            │
│           │ MCP stdio             │ MCP stdio             │ MCP stdio  │
│           └───────────┬───────────┘───────────┬───────────┘            │
│                       │                       │                        │
└───────────────────────┼───────────────────────┼────────────────────────┘
                        │                       │
              ┌─────────┴───────────────────────┴──────────┐
              │           MLRA MCP Server                    │
              │    (扩展自 MLFB MCP Server)                  │
              │                                              │
              │  ┌─────────────┐   ┌────────────────────┐   │
              │  │ Caller      │   │ Orchestrator       │   │
              │  │ Registry    │   │ (编排状态机)        │   │
              │  │ (复用 MLFB) │   │                     │   │
              │  └──────┬──────┘   └─────────┬──────────┘   │
              │         │                     │              │
              │  ┌──────┴─────────────────────┴──────────┐  │
              │  │  TCP 通信层 (→ MLFB 桌面端)            │  │
              │  └───────────────────────────────────────┘  │
              └─────────────────────────────────────────────┘
                        │
              ┌─────────┴────────────────────┐
              │   MLFB 桌面端 (Tauri)         │
              │                               │
              │  ┌──────────────────────────┐ │
              │  │  MLRA 首页               │ │
              │  │  - 已注册 Agent 列表     │ │
              │  │  - 角色分配 UI           │ │
              │  │  - "开始编排" 按钮       │ │
              │  │  - 编排状态监控          │ │
              │  │  - 人类干预通道          │ │
              │  └──────────────────────────┘ │
              └──────────────────────────────┘
```

### 3.2 工作流程

#### Phase A: 用户设置阶段 (手动)

```
Step 1: 用户在 VS Code 中创建 Chat Session
        → Ctrl+Shift+I → 选择 agent: "mlra-ceo" → 选择 model: Claude Sonnet 4
        
Step 2: 用户发送首条消息 (任意内容)
        → Agent 被 .agent.md 引导，优先调用 register_LRA() MCP 工具
        
Step 3: register_LRA() 阻塞
        → MLRA MCP Server 注册 caller，获取完整 session_id
        → MLFB 桌面端收到新 caller 通知 (TCP)
        
Step 4: 重复 Step 1-3，创建 Expert / Inspector session

Step 5: 用户在 MLFB 桌面端 MLRA 首页
        → 看到所有已注册 agent
        → 分配角色 (CEO / Expert / Inspector)
        → 点击 "开始编排"
```

#### Phase B: 编排运行阶段 (自动)

```
Step 6: MLRA MCP Server 向各 register_LRA 返回初始指令
        → CEO: "你的角色是 CEO，以下是你的任务..."
        → Expert: "你的角色是 Expert，等待 CEO 分配子任务..."
        → Inspector: "你的角色是 Inspector，等待审查请求..."

Step 7: CEO Agent 收到指令 → 分析任务 → 调用 submit_task()
        → MCP 阻塞 → MLRA 编排器收到子任务
        → 编排器通过 Expert 的阻塞通道分配任务
        
Step 8: Expert Agent 收到任务 → 执行编码 → 调用 report_result()
        → MCP 阻塞 → MLRA 编排器收到结果
        → 编排器通过 CEO 的阻塞通道返回结果
        
Step 9: CEO Agent 收到结果 → 调用 request_review() 给 Inspector
        → Inspector 审查 → 返回审查意见
        → CEO 做最终决策
```

### 3.3 组件职责

| 组件 | 职责 | 实现方式 |
|------|------|---------|
| **MLRA MCP Server** | 编排逻辑核心：caller 注册、角色绑定、任务路由、状态管理 | 扩展现有 MLFB MCP Server |
| **MLFB 桌面端** | UI：agent 列表、角色配置、监控面板、人类干预 | 扩展现有 Tauri App |
| **Hook 脚本** | Session 启动时通过 TCP 发送完整 session_id 到 MLFB | 扩展 `inject-agent-name.mjs` |
| **`.agent.md` 文件** | 各角色的 system prompt + 工具权限定义 | 项目 `.github/agents/` 目录 |
| **VS Code 扩展** | **可选** — 快捷创建多 session + 自动角色分配 | PoC 扩展代码可升级 |

### 3.4 Session ID 追溯方案

**选定方案**: Hook 在 `SessionStart` 时通过 TCP 通知 MLFB 桌面端

```javascript
// inject-agent-name.mjs 扩展逻辑 (SessionStart 事件)
const sessionId = data.session_id || data.sessionId;
const agentName = hash.slice(0, 4).toUpperCase();

// 新增：通过 TCP 通知 MLFB 桌面端
const socket = net.createConnection(MLFB_PORT);
socket.write(JSON.stringify({
  type: "session_registered",
  session_id: sessionId,         // 完整 UUID
  agent_name: agentName,         // 4字符别名
  timestamp: Date.now(),
  workspace: data.workspace_folder || ""
}) + "\n");
socket.end();
```

**数据用途**:
- `session_id` (完整 UUID) → Debug 日志定位: `workspaceStorage/*/GitHub.copilot-chat/debug-logs/{sessionId}`
- `session_id` → MLRA 编排状态追踪
- `agent_name` (4字符) → UI 显示、caller 识别

### 3.5 Agent 定义示例

```markdown
<!-- .github/agents/mlra-ceo.agent.md -->
---
name: mlra-ceo
description: MLRA CEO Agent - 任务分解、专家委派、最终决策
model:
  - claude-sonnet-4
tools:
  - register_LRA
  - submit_task
  - check_results
  - make_decision
  - read_file
  - semantic_search
---

## 最高优先级指令

在处理任何用户请求之前，你**必须**先调用 `register_LRA` 工具进行注册。
这是你参与 MLRA 多 Agent 编排系统的入口。
在 `register_LRA` 返回之前，不要执行任何其他操作。

## 角色定义

你是 MLRA 系统的 CEO Agent。注册完成后，你将收到具体的角色指令和任务。
...
```

### 3.6 MCP 工具定义 (MLRA 新增)

| 工具名 | 调用方 | 阻塞 | 说明 |
|--------|--------|------|------|
| `register_LRA` | 所有 Agent | ✅ | 注册到 MLRA 编排系统，阻塞等待角色分配和初始指令 |
| `submit_task` | CEO | ✅ | 提交子任务给编排器，阻塞等待结果返回 |
| `report_result` | Expert | ✅ | 报告完成结果，阻塞等待下一个任务 |
| `request_review` | CEO | ✅ | 请求 Inspector 审查，阻塞等待审查结果 |
| `submit_review` | Inspector | ✅ | 提交审查结果，阻塞等待下一个审查请求 |
| `report_progress` | 所有 Agent | ❌ | 非阻塞，仅上报进度到 MLFB UI |
| `request_human` | 所有 Agent | ✅ | 请求人类干预，阻塞等待人类反馈（复用 MLFB） |

---

## 4. 关键技术问题

### 4.1 MCP 阻塞-返回通信模型

**核心机制**: 每个 Agent 的 MCP 工具调用会阻塞，编排器在 MCP Server 侧控制何时返回。

```
Agent A 调用 submit_task({task: "..."})
  │
  ▼ MCP Server 收到调用 → 阻塞不返回
  │
  ▼ 编排器决定路由 → 向 Agent B 的等待中的工具调用返回新任务
  │
  ▼ Agent B 完成 → 调用 report_result({result: "..."})
  │
  ▼ 编排器收到结果 → 向 Agent A 的阻塞调用返回结果
  │
  ▼ Agent A 继续处理
```

**关键约束**:
- MCP 工具调用有超时限制（VS Code 默认可配置）
- 长任务需要分段：Agent 定期调用 `report_progress` 保持连接
- 编排器需要维护每个 caller 的阻塞状态队列

### 4.2 ~~Session 寻址~~ (已解决)

~~**问题**: 多个 Chat session 时如何确保操作正确的 session？~~

**结论**: 不需要 Session 寻址。每个 session 通过 MCP 阻塞自然"锁定"：
- Agent 调用 MCP 工具 → 编排器知道是哪个 caller
- 编排器返回结果 → 自动回到正确的 session
- 完整 session_id 通过 Hook TCP 通知获取

### 4.3 首条消息引导可靠性

**问题**: 如何确保 Agent 一定会先调用 `register_LRA`？

**方案**:
1. `.agent.md` 中的 system prompt 明确写"最高优先级：在任何操作前先调用 `register_LRA`"
2. Agent 的 tools 列表中 `register_LRA` 排在第一位
3. 如果 Agent 没有调用 `register_LRA` 就执行其他操作 → 其他 MLRA 工具返回错误"请先注册"
4. 实测：现有 MLFB 的 `register_agent` + `interactive_feedback` 引导模式已经很稳定

### 4.4 工具权限控制

**能力**: `.agent.md` 的 `tools` 字段定义允许使用的工具列表

**应用**:
- CEO Agent: 通信工具 + 只读文件工具（不需要写代码）
- Expert Code Agent: 完整编码工具 + 通信工具  
- Inspector Agent: 只读工具 + 审查通信工具（不能修改代码）

**补充**: `chat.open` 的 `toolsInclude`/`toolsExclude` 参数可作为运行时额外约束（如果使用自动化创建 session）。

### 4.5 编排状态机

**MCP Server 需要维护的状态**:

```typescript
interface MLRAState {
  // 已注册的 Agent
  agents: Map<string, {
    callerId: string;       // MLFB caller ID
    sessionId: string;      // 完整 VS Code session UUID
    agentName: string;      // 4字符别名
    role: string;           // 'ceo' | 'expert' | 'inspector' | ...
    status: string;         // 'registered' | 'idle' | 'working' | 'blocked'
    pendingResolve: Function | null;  // 当前阻塞的 MCP 调用的 resolve 函数
  }>;
  
  // 任务队列
  tasks: Map<string, {
    id: string;
    from: string;           // 提交者 callerId
    to: string;             // 分配给谁
    content: string;
    status: string;         // 'pending' | 'assigned' | 'completed'
    result: string | null;
  }>;
  
  // 编排配置
  config: {
    started: boolean;
    userTask: string;       // 用户的原始任务
  };
}
```

### 4.6 错误处理

| 场景 | 处理方式 |
|------|---------|
| Agent Session 意外关闭 | MCP Server 检测 stdin 断开 → 通知 MLFB UI → 引导用户重建 |
| MCP 调用超时 | Agent 定期调用 `report_progress` 保活 → 超时后编排器标记 agent 失联 |
| Agent 不遵守角色 | Inspector 审查 → 发现问题 → CEO 决定是否重新分配 |
| 多 Agent 死锁 | 编排器检测循环等待 → 超时断开 → 通知用户 |
| Token 超限 | 任务分段 + context 压缩 |

---

## 5. 实现路线图

### Phase 0: PoC 补充验证 ✅ (已完成)

- [x] 验证 `mode` 参数选择自定义 Agent
- [x] 验证 `modelSelector` 选择模型
- [x] 验证 `blockOnResponse` 等待响应并返回完整结果
- [x] 创建 test-echo 自定义 Agent
- [ ] 验证 `toolsInclude` / `toolsExclude` (需正确工具 ID)
- [ ] 获取完整工具 ID 映射表 (`vscode.lm.tools`)

### Phase 1: MLRA MCP Server 核心

- [ ] 在 MLFB MCP Server 基础上新增 `register_LRA` 工具
- [ ] 实现 MLRA caller 注册和阻塞机制
- [ ] 实现角色绑定接口 (MLFB 桌面端调用 → MCP Server)
- [ ] 实现 "开始编排" → register_LRA 返回初始指令
- [ ] 实现 `submit_task` / `report_result` 基础工具
- [ ] Hook 脚本扩展：SessionStart 时 TCP 发送完整 session_id

### Phase 2: MLFB 桌面端 MLRA UI

- [ ] MLRA 首页组件 (显示已注册 agent 列表)
- [ ] 角色分配 UI (下拉选择: CEO / Expert / Inspector)
- [ ] "开始编排" 按钮 → 通知 MCP Server 启动
- [ ] 编排状态面板 (显示各 agent 工作状态)

### Phase 3: Agent 定义和编排逻辑

- [ ] 编写 CEO Agent `.agent.md`
- [ ] 编写 Expert Code Agent `.agent.md`
- [ ] 编写 Inspector Agent `.agent.md`
- [ ] 实现编排状态机 (任务分配、结果路由)
- [ ] 实现 CEO → Expert → Inspector → CEO 标准流程
- [ ] 实现 `request_human` → MLFB 人类反馈通道

### Phase 4: 高级功能

- [ ] 动态角色增减 (运行中新增 Expert)
- [ ] 并发 Expert 执行 (多个 Expert 同时工作)
- [ ] 编排会话持久化和恢复
- [ ] 成本追踪 (token 用量统计)
- [ ] 可选：VS Code 扩展一键创建多 session

---

## 6. 与 CLI 方案的技术关联

### 6.1 可复用资产

| CLI 方案资产 | VS Code 方案中的角色 |
|-------------|-------------------|
| MCP Server (MLFB) | **直接复用** — 作为 Agent 间通信通道 |
| MCP 工具定义 (submit/order) | **直接复用** — Agent 通过 MCP 工具通信 |
| Agent Prompt 设计 | **直接复用** → `.agent.md` 文件 |
| Tauri IPC | **可选复用** — 人类反馈 UI |
| ACP SDK 知识 | **不需要** — 被 `chat.open` 替代 |
| 进程管理代码 | **不需要** — VS Code 内部管理 |
| 流式输出处理 | **不需要** — `blockOnResponse` 直接返回完整结果 |

### 6.2 CLI 方案何时仍有价值

- 需要 **无头 (headless)** 运行时 (CI/CD, 服务器端)
- 需要 **更细粒度控制** (流式 token 处理, 自定义 tool 审批)
- 需要 **完全独立于 VS Code** 运行
- VS Code 方案遇到 **API 不稳定性** 问题

---

## 7. 风险评估

| 风险 | 严重度 | 概率 | 缓解措施 |
|------|--------|------|---------|
| MCP 工具调用超时 | 高 | 中 | `report_progress` 保活机制 + 可配置超时 |
| Agent 不遵守 register_LRA 优先级 | 中 | 低 | `.agent.md` 强调 + 其他工具前置检查 |
| 多 Agent 死锁 | 高 | 低 | 编排器检测循环等待 + 超时中断 |
| VS Code Chat API 变更 | 中 | 中 | 核心不依赖 chat.open (仅可选快捷) |
| Copilot 限流/配额 | 低 | 中 | 模型降级策略 + 任务合并 |
| 用户手动操作干扰 | 低 | 高 | UI 提示"编排进行中" + 专用 Chat Tab |
| MLFB TCP 通信不稳定 | 中 | 低 | 重连机制 (已有) + 操作幂等 |

---

## 8. 关键决策记录

| # | 决策 | 日期 | 理由 |
|---|------|------|------|
| D1 | 放弃 CLI 方案，转向 VS Code 方案 | 2026-04-08 | CLI 方案复杂度过高，VS Code 已有完善生态 |
| D2 | `mode` 参数是自定义 Agent 选择的正确方式 | 2026-04-08 | VS Code 源码确认 + PoC 验证通过 |
| D3 | `blockOnResponse` 返回完整结果数据 | 2026-04-08 | 包含 response text, tokens, model, thinking |
| D4 | **采用 register_LRA 方案替代编排扩展方案** | 2026-04-08 | 无需 VS Code 扩展，完全复用 MLFB 架构 |
| D5 | Session 寻址不是问题 | 2026-04-08 | MCP 阻塞自然锁定 session，无需外部寻址 |
| D6 | Hook TCP 通知方式获取完整 session_id | 2026-04-08 | 用户确认选择此方案 |
| D7 | 编排逻辑放在 MCP Server 侧 | 2026-04-08 | 纯 Node.js，不依赖 VS Code 扩展 |
| D8 | `chat.open` API 保留为可选快捷工具 | 2026-04-08 | 核心不依赖，但可用于自动化 session 创建 |

---

## 附录 A: PoC 扩展源码位置

| 文件 | 说明 |
|------|------|
| `.myLastChat/acp-poc/vscode-ext/extension.js` | PoC 测试扩展 (v2) |
| `.myLastChat/acp-poc/vscode-ext/package.json` | 扩展清单 |
| `.github/agents/test-echo.agent.md` | 测试用自定义 Agent |
| `~/.vscode/extensions/mlra-poc-chat-automation/` | 扩展安装位置 (复制) |

## 附录 B: VS Code Chat API 发现日志

| 发现 | 来源 | 关键代码 |
|------|------|---------|
| `chat.open` 完整参数 | `chatActions.ts` 源码 | `IChatViewOpenOptions` |
| `mode` 支持自定义 agent 名 | `chatActions.ts` L:run() | `chatModeService.findModeByName(opts.mode)` |
| `setChatMode(mode.id)` | `chatActions.ts` L:handleSwitchToMode() | `chatWidget.input.setChatMode(switchToMode.id)` |
| `blockOnResponse` 返回结构 | PoC Test 4c | 包含 timings/metadata/response 完整数据 |
| `selectCustomAgent(name)` | Copilot 扩展 bundle | CopilotCLI session creation flow |
| `copilot_switchAgent` 内部工具 | Copilot 扩展 bundle | `Ae` 工具枚举，仅支持 "Plan" |
| `chat.switchAgent.enabled` 特性标志 | Copilot 扩展 bundle | 默认 false |
| `registerCustomAgentProvider` | Copilot 扩展 bundle | `.agent.md` 文件通过此 API 注册 |

## 附录 C: 完整 `chat.open` 参数参考

来源: VS Code `chatActions.ts` (2026-04 版本)

```typescript
interface IChatViewOpenOptions {
  query: string;
  isPartialQuery?: boolean;
  toolIds?: string[];
  previousRequests?: IChatViewOpenRequestEntry[];
  attachScreenshot?: boolean;
  attachFiles?: (URI | { uri: URI; range: IRange })[];
  attachHistoryItemChanges?: { uri: URI; historyItemId: string }[];
  attachHistoryItemChangeRanges?: { start: {...}; end: {...} }[];
  mode?: ChatModeKind | string;
  modelSelector?: ILanguageModelChatSelector;
  blockOnResponse?: boolean;
  toolsInclude?: string[];
  toolsExclude?: string[];
}
```
