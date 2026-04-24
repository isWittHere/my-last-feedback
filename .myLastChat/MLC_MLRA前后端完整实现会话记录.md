---
title: "MLRA 前后端完整实现会话记录"
description: "从仓库现状分析到 UI 6 阶段搭建、后端 6 模块实现、前后端 IPC 集成、Agent 状态检测方案的完整实现会话"
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
solved_lists:
    - 仓库现状分析与 UI 交互规格审视
    - Phase 1-2: MLRA 主体框架（Store、MLRAView、LauncherHome、Sidebar）
    - Phase 3: 阶段切换与标题栏适配（PhaseToggle、StandbyPlaceholder、Row 2 设计）
    - Phase 4: 四列工作视图（AgentColumn、WorkerPoolColumn、MLRAView 列排序）
    - Phase 5: 响应式多列布局与 Worker 池扩展（CSS 自适应、Worker 卡片状态管理）
    - Phase 5 收尾: Emoji 清理、颜色主题恢复、UI 组件体系完善
    - Phase 6a: 角色定义扩展（4 角色→6 角色，规划 vs 执行阶段区分）
    - Phase 6b: 控制模式系统（Autopilot vs CEO Override vs Full Override）
    - Phase 6c: 运行时统计面板（计时器、分段按钮、整体时间统计、阶段时间分布、Gantt 时间线）
    - Phase 6d: Worker 池细化（角色分配、自定义 workerRole、Gantt 双轨并行展示）
    - 后端 6 模块完整实现（orchestrator、daemon、MCP Server、IPC Server、protocol、router）
    - Rust IPC 扩展（mlra_* 消息路由、shared writer、send_to_mlra_daemon 命令）
    - 前后端事件集成（Tauri 事件监听、daemon 消息处理、store 同步）
    - Mock 清理与后端接驳（removeGenerateMockRounds、removeAddMockAgent、wiring assignments）
    - Agent 活性检测与重试机制规划（Alive 状态详解、阶段 A/B 区分、超时监控策略）
    - MLRA v2 阶段编排器蓝图模型接入（WorkflowBlueprint、StageBlueprint、BlueprintRuntimeSummary）
    - LauncherHome 改造成阶段编排器（模板、拖拽排序、阶段 Prompt Stack、CEO 准入规则）
    - 后端编排器接入 blueprint（prompt 构造、阶段推进、GET_TASK_CONTEXT 扩展）
    - Worker Pool / RegisteredAgentCard 等旧 UI 冗余清理
    - LauncherHome 样式块重建与 UI 降噪收口（移除外层卡片、英文眉标、重复信息）
---

# MLRA 前后端完整实现会话记录

> 版本: v1.0 | 日期: 2026-04-10 | 累计工作量: 8+ 小时对话 + 6000+ 行代码

---

## 1. Previous Conversation

本对话承接了上轮"MLRA 文档清理与 Agent 注入"会话的成果：

- **上轮完成**: CLI 方案文档归档、架构文档更新至 v0.4、8 个 Agent 注入完毕
- **上轮遗留**: 仍需详细规划 UI 搭建实现路径

本对话的开场，用户要求："了解仓库现状，之后我们再讨论详细的执行计划"。基于这一要求，我完成了：

1. **仓库现状全景分析** — 从文件结构到核心组件、跨平台版本、后端项目结构等
2. **现有 MLFB UI 组件系统调研** — CallerPanel、CallerTabs、FeedbackApp 架构获得深入理解
3. **MLRA UI 规格文档深读** — 审视了 6 列布局、标题栏设计、Launcher 侧栏、待命态等详细规范
4. **后端架构深度学习** — 研究了 protocol、orchestrator、daemon 等设计蓝图
5. **分阶段实现规划讨论** — 与用户逐步确认了 Phase 1-6 的详细需求和技术方案

---

## 2. Current Work

### 2.1 UI 搭建进度（Phase 1-6 完成）

#### Phase 1-2: MLRA 基础框架
- 创建 `mlraStore.ts` — 定义 Launcher、AgentSlot、WorkerSlot 数据模型，CRUD 操作
- 创建 `MLRAView.tsx` — 根组件，管理四列工作区布局，根据阶段过滤显示的角色对
- 创建 `LauncherHome.tsx` — Launcher 创建/配置 UI，Agent 角色分配表格
- 创建 `LauncherSidebar.tsx` — Launcher 列表、选择、右键菜单（重命名、暂停、删除）
- **修改 `FeedbackApp.tsx`** — 整合 MLFB/MLRA 视图切换、title bar 结构

#### Phase 3: 标题栏与阶段切换
- 创建 `PhaseToggle.tsx` — 展示规划 vs 实施阶段，支持切换
- 创建 `StandbyPlaceholder.tsx` — Agent 待命时显示的提示文本
- **修改 title bar** — 两行布局，Row 1 为全局控制，Row 2 为 MLRA 特定控制（☰ button、phase toggle）

#### Phase 4: 四列工作视图
- 创建 `AgentColumn.tsx` — 单个主 Agent（expert/inspector/ceo）的列容器，继承 CallerPanel 样式系统
- 创建 `WorkerPoolColumn.tsx` — Worker 池列容器，显示 Worker 卡片列表
- **修改 `MLRAView.tsx`** — 根据 `phaseView` 动态过滤显示的角色对，保持 4 列固定布局

#### Phase 5: 响应式布局与 Worker 细化
- **添加大量 CSS** — agent-column、worker-pool-column、worker-card、launcher-sidebar 等完整样式系统
- **Light theme 支持** — 为所有 MLRA 元素添加明亮主题覆盖，确保可见性
- **Emoji 清理** — 移除所有 emoji，改用 Icon 组件或 IdenticonAvatar
- **CallerPanel 颜色一致性** — 使用 `--caller-color` CSS 变量而非硬编码颜色

#### Phase 6a: 角色系统扩展（4→6 角色）
- **定义 6 角色**:
  - `planning-expert` / `planning-inspector` — 规划阶段
  - `execution-expert` / `execution-inspector` — 实施阶段
  - `ceo` — 全阶段可用
  - `workers` — Worker 池（Worker 数量可变）
  
- **更新列表和过滤**:
  - `columnOrder` 存储中改为动态过滤（规划阶段只显示 planning-expert/inspector + ceo + workers）
  - `MLRACallerTabs` 根据 `phaseView` 动态显示对应阶段的 Agent 对
  - `MLRAView` 根据 `phaseView` 渲染对应列

#### Phase 6b: 控制模式系统
- **3 种运行模式**:
  - `autopilot` — 全自动，所有 submit 自动路由，UI 不暂停
  - `ceo-override` — CEO 环节暂停等待人工，submit → UI 展示 → 人工验证 → 通过 → 继续
  - `full-override` — 所有 submit 暂停等待人工
  
- **实现**:
  - `controlMode: "autopilot" | "ceo-override" | "full-override"` 字段
  - 替换了旧的 `status: "paused"` 逻辑
  - Title bar Row 2 添加分段按钮切换（Autopilot | CEO | Full）

#### Phase 6c: 运行时统计面板
- **RunningTimer 组件** — 显示运行经过时间、暂停累计时间
- **TimerStatsPopover** — Hover 显示详细统计：
  - 整体运行时间分布（饼图：规划 vs 实施）
  - 各角色耗时分布（水平条形图）
  - 阶段/角色统计表
  - 模拟数据包含代理执行时间、人工审核评论等
  
- **Timeline/Gantt 视图** — 显示各角色的执行时序：
  - Dual track: 上轨为主 agent 顺序执行，下轨为 worker 并行执行
  - 高度压缩 — 移除空闲间隙，显示实际工作区间
  - 颜色编码 — 每个角色用其固定色

#### Phase 6d: Worker 池细化
- **Worker 角色分配**:
  - Config UI 显示 Worker 行，可分配预定义角色
  - 支持自定义 `workerRole`（如"Frontend Specialist"）
  
- **WorkerPoolColumn**:
  - 显示 Worker 卡片列表（状态：ready/working/broken）
  - 点击展开 → 查看该 Worker 的实时输出（mini SummaryPanel）
  - 支持手动注入指令（mini FeedbackInput）

- **Gantt 并行展示**:
  - 每个 Worker 的执行时间在下轨显示，便于查看并行编排效果

### 2.2 后端实现进度（6 模块 + IPC 扩展 + 事件集成）

#### 后端 6 核心模块
1. **`protocols.mjs`** — 定义 10+ 个 MLRA 消息类型（register、submit、release 等）
2. **`router.mjs`** — 消息路由器，维护 pending 阻塞队列，负责 submit-release 流程
3. **`orchestrator.mjs`** — 编排逻辑核心，实现双主 agent 循环（Planning Expert ↔ Inspector）、CEO 裁决、Worker 池调度
4. **`daemon.mjs`** — 后台守护进程，TCP 服务器、Agent 连接管理、轮询心跳
5. **`mcp-server.mjs`** — MCP Server，每个 Agent 进程的入口，提供 `register_LRA` / `submit` / `check_orders` 等工具
6. **`ipc-bridge.mjs`** — Tauri ↔ Daemon 通信桥接，JSON 序列化、消息转发

#### Rust IPC 扩展
- **修改 `app/src-tauri/src/ipc.rs`**:
  - 增加 MLRA 连接检测（识别 `mlra_` 前缀消息）
  - 双向消息转发（daemon → frontend events，frontend → daemon commands）
  - 共享 MLRA writer，允许多个处理器并发写入

- **修改 `app/src-tauri/src/lib.rs`**:
  - 创建 `Arc<Mutex<TcpStream>>` shared writer
  - 注册 `send_to_mlra_daemon` Tauri command
  - 初始化 MLRA 事件监听器

#### 前后端事件集成
- **`app/src/store/mlraStore.ts` 扩展**:
  - `daemonAssignRole(launcherId, assignRole)` — 通知 daemon 角色分配
  - `daemonStartOrchestration(...)` — 通知 daemon 开始编排
  - `daemonSetControlMode(launcherId, mode)` — 通知 daemon 控制模式变更
  - `handleDaemonMessage(msg)` — 处理 daemon 事件，更新本地 store（agent status、round events）

- **`app/src/App.tsx` 初始化**:
  - 在 persistent mode 启动时注册 MLRA 事件监听（`appWindow.listen("mlra-message")`）
  - 路由消息到 `handleDaemonMessage`

- **前后端消息流示例**:
  ```
  用户点击"开始编排" → LauncherHome.startOrchestration() 
  → daemonStartOrchestration() invoke 
  → Rust command 发送到 daemon TCP 
  → daemon.startOrchestration() 实行
  → daemon 发送 mlra-session-start 事件
  → Tauri IPC 路由到 frontend
  → handleDaemonMessage() 更新 mlraStore
  → MLRAView re-render，显示运行状态
  ```

#### Mock 清理与后端接驳
- 移除 `generateMockRounds()` 函数及其调用
- 移除 `handleAddMockAgent` Mock button
- 接驳 `assignRole` / `startOrchestration` 到对应的 daemon 通信方法
- `roundHistory` 由 daemon 事件推送，而非本地生成

### 2.3 架构决策与设计讨论

#### 角色系统演进
- **初期**: 3 main agents（expert、inspector、ceo）
- **修订**: 6 agents，区分规划 vs 实施阶段的 expert/inspector
- **理由**: 规划和实施所需的思维模式、输入输出格式完全不同，分离 agent 提高专业性

#### 完全自治的 MLRA UI
- 不依赖 MLFB UI 组件（虽然复用了样式系统 `--caller-color` 等）
- Tauri 原生 UI，独立的 FeedbackApp 视图
- 前后端通过 IPC 通信，Daemon 完全控制编排流程

#### Agent 活性检测策略
- **Alive 的两个子阶段**:
  - **阶段 A**（阻塞等待）: Router 中有 pending Promise，agent 调用了 MCP 工具
  - **阶段 B**（处理指令）: Router release 后，agent 正在工作，daemon 无法感知
  
- **判定逻辑**:
  - 阶段 A: 100% 确定活跃（MCP 阻塞）
  - 阶段 B: 推定活跃（释放后 <10min），否则可能 stalled
  
- **Transcript 监控补充**:
  - 可在阶段 B 超时至前提前发现问题
  - 例：transcript 出现 `assistant.turn_end` 但 2-3min 无新事件 → 标记 silent

---

## 3. Key Technical Concepts

### 前端架构
- **React 组件体系**: 函数组件 + Hooks (useState、useCallback、useRef)
- **Zustand Store**: 轻量级状态管理，订阅 IPC 事件更新
- **CSS 变量系统**: VS Code 主题适配（`--caller-color`、`--color-bg-*`）
- **Tauri IPC**: 前后端双向通信入口
- **IdenticonAvatar**: DiceBear 库生成角色头像，用别名 + 颜色

### 后端架构
- **Node.js 后端**: 6 个消息驱动模块
- **TCP 连接池**: 每个 Agent 进程一个 TCP 连接，持久阻塞管理
- **MCP Protocol**: 每个 Agent 通过 MCP 工具调用（register_LRA、submit 等）
- **Rust IPC Server**: Tauri 原生 TCP 服务器，转发前后端消息
- **Message Router**: 核心路由逻辑，pending 队列维护、阶段状态管理

### 关键设计模式
- **Blocking Queue**: Agent submit → Router.pending → Orchestrator 处理 → Router.release()
- **Message Injection**: 初始指令 + Tail 提醒 → Agent chat session
- **Dual-Master Loop**: Planning Expert ↔ Inspector 在规划阶段双向对话
- **CEO Arbitration**: inspector.conclude() → CEO 阶段化调度
- **Worker Pool**: CEO 决定任务 → Worker 池并行执行 → CEO 验收

### 数据模型
- **Launcher**: 顶级编排任务单位，包含 6 个 agents、control mode、status
- **AgentSlot**: 单个主 agent 的运行时状态（id、status、lastMessage、sessionId 等）
- **WorkerSlot**: Worker 的运行时状态（id、status、workerRole、outputs）
- **RoundEvent**: 单个编排回合的事件（start | end），用于时间线展示

---

## 4. Relevant Files and Code

### 前端核心文件

#### `app/src/store/mlraStore.ts` (main store)
- **职责**: 全局 Launcher、Agent 状态管理，Daemon 通信接口
- **关键数据**:
  ```typescript
  interface Launcher {
    id: string;
    name: string;
    description: string;
    status: "configuring" | "running" | "paused" | "completed" | "failed";
    controlMode: "autopilot" | "ceo-override" | "full-override";
    agents: Partial<Record<AgentRole, AgentSlot>>;
    workers: WorkerSlot[];
    phaseView: "planning" | "implementation"; // 当前显示的阶段
    columnOrder: AgentRole[]; // 已弃用，现在由 phaseView 决定列顺序
    createdAt: number;
    startedAt: number;
    roundHistory: RoundEvent[];
  }
  ```
- **关键 Action**:
  - `daemonAssignRole(launcherId, roleId, callerId)` → invoke daemon
  - `daemonStartOrchestration(launcherId)` → invoke daemon，启动编排
  - `daemonSetControlMode(launcherId, mode)` → 改变控制模式
  - `handleDaemonMessage(msg)` → 处理来自 daemon 的事件

#### `app/src/components/FeedbackApp.tsx` (root container)
- **职责**: MLFB/MLRA 视图切换、全局 title bar、body 路由
- **MLRA 特定部分**:
  - Row 1 (MLFB/MLRA toggle、logo)
  - Row 2 (☰ Launcher button、PhaseToggle、RunningTimer、ControlModeSwitcher)
  - `MLRAErrorBoundary` 捕获 MLRAView 崩溃
  - Body 中 `<MLRAView />` 组件

#### `app/src/components/MLRAView.tsx` (workspace layout)
- **职责**: 四列工作区布局，根据 phaseView 动态过滤角色对
- **关键逻辑**:
  ```typescript
  const orderedRoles = phaseView === "planning"
    ? ["planning-expert", "planning-inspector", "ceo", "workers"]
    : ["execution-expert", "execution-inspector", "ceo", "workers"];
  
  return <div className="mlra-workspace">
    {orderedRoles.map(role => 
      role === "workers" 
        ? <WorkerPoolColumn key="workers" />
        : <AgentColumn key={role} role={role} />
    )}
  </div>
  ```

#### `app/src/components/LauncherHome.tsx` (launcher creation & config)
- **职责**: 创建新 Launcher、配置 Agent 角色分配
- **流程**:
  1. 输入任务名称、描述
  2. 表格显示 6 角色，每行可搜索/选择已注册的 Agent（通过 MCP 扫描）
  3. Worker 行可指定自定义角色（如"Frontend Specialist"）
  4. "开始编排"按钮调用 `daemonStartOrchestration()`

#### `app/src/components/MLRACallerTabs.tsx` (tab navigation)
- **职责**: Title bar 中央显示当前可见角色的分段按钮、拖拽排序
- **实现**:
  - 根据 phaseView 动态生成 ROLE_TABS 列表
  - 支持拖拽排序（修改 columnOrder，但现在此字段已弃用）
  - 每个 tab 显示角色 identicon + 名称 + 状态徽标

#### `app/src/components/AgentColumn.tsx` (main agent column)
- **职责**: 单个主 agent 的列视图，继承 CallerPanel 颜色系统
- **结构**: Header（角色名 + identicon）+ Sidebar（session 列表）+ Content（输出 panel + 输入）
- **待命显示**: 根据 phaseView，显示对应阶段的待命文本（如"规划阶段等待规划专家数据"）

#### `app/src/components/WorkerPoolColumn.tsx` (worker pool)
- **职责**: Worker 池列，显示所有 Worker 卡片，支持展开查看详情
- **卡片状态**: ready | working | broken
- **展开内容**: mini SummaryPanel（输出）+ mini FeedbackInput（手动指令）

#### `app/src/App.tsx` (lifecycle hooks)
- **MLRA 初始化**:
  ```typescript
  useEffect(() => {
    if (isPersistent) {
      const unlisten = appWindow.listen("mlra-message", (event) => {
        mlraStore.handleDaemonMessage(event.payload);
      });
      return () => unlisten.then(fn => fn());
    }
  }, [isPersistent]);
  ```

### 后端核心文件

#### `mlra-server/protocol.mjs` (message types)
- 定义 10+ MLRA 消息类型：`register_lra`、`submit`、`release`、`mlra-session-start` 等
- 两部分：核心协议（Agent ↔ Daemon）+ IPC 协议（Daemon ↔ Tauri Frontend）

#### `mlra-server/router.mjs` (message routing)
- **核心数据**: `pending: Map<callerId, {resolve, reject, timeout}>`
- **关键方法**:
  - `route.register(callerId, toolName, args)` → 记录 pending
  - `route.release(callerId, instruction)` → 发送指令并 resolve
  - `route.poll(interval)` → 定期检查超时

#### `mlra-server/orchestrator.mjs` (orchestration logic)
- **编排流程**:
  1. Planning Phase: Expert → Inspector 双向对话，最多 3 轮
  2. Inspector Conclude: Inspector 总结计划
  3. CEO Phase: CEO 审视并大需要时调整
  4. Implementation Phase: Expert 实施，Inspector 监督，Worker 池执行子任务
  5. CEO Verify: CEO 验收

#### `mlra-server/daemon.mjs` (background service)
- TCP 服务器，监听 3002 端口
- 管理 Agent 连接生命周期
- 定期心跳轮询

#### `mlra-server/mcp-server.mjs` (per-agent entry point)
- 每个 Agent 进程的 MCP Server
- 提供工具: `register_lra`、`submit`、`check_orders` 等
- 启动方式: `node mlra-server/mcp-server.mjs <callerId>`

### Rust IPC 代码

#### `app/src-tauri/src/ipc.rs` (MLRA 消息扩展)
- **新增**:
  ```rust
  // 检测 MLRA 连接
  if line.starts_with("mlra_") {
    // 切换到 MLRA 模式
    // 转发到 mlra_writer
  }
  
  // 定期刷新 stream
  // 支持双向转发
  ```

#### `app/src-tauri/src/lib.rs` (Tauri command)
- **新增命令**:
  ```rust
  #[tauri::command]
  fn send_to_mlra_daemon(msg: String, state: tauri::State<Arc<Mutex<TcpStream>>>) {
    // 序列化 msg 并写入 shared writer
  }
  ```

### CSS 文件

#### `app/src/index.css`
- **MLRA 新增部分** (~1200 行):
  - `.mlra-view`、`.mlra-workspace` — 主布局
  - `.agent-column`、`.agent-column-header` — 主 agent 列
  - `.worker-pool-column`、`.worker-card` — Worker 池
  - `.launcher-sidebar`、`.launcher-sidebar-item` — 侧栏
  - `.mlra-home`、`.mlra-config-*` — 配置 UI
  - `.phase-toggle`、`.phase-toggle-btn` — 阶段切换
  - `.running-timer`、`.timer-stats-popover` — 计时& 统计
  - `.mlra-timeline`、`.timeline-track` — Gantt 时间线
  - Light theme 覆盖 (~100 行)

---

## 5. Problem Solving

### 问题 1: React Hooks 违反规则导致应用崩溃
**症状**: 点击"开始编排"后整个 APP 黑屏，title bar 消失  
**根因**: `MLRACallerTabs` 中的 `useCallback` 被放在条件返回之后  
**解决**: 移动所有 hooks 到条件返回之前  

### 问题 2: 背景色& 主题颜色消失
**症状**: MLRA 列没有颜色外观  
**根因**: 使用了自定义 `--agent-color` CSS 变量而非 `--caller-color`  
**解决**: 改用标准的 `--caller-color` CSS 变量，继承 MLFB 的完整颜色系统  

### 问题 3: 明亮主题下 hover 效果不可见
**症状**: 侧栏/卡片 hover 使用了 `rgba(255,255,255,...)` 透明白色  
**根因**: 亮色背景上叠加透明白色看不见  
**解决**: 为 light theme 添加 `@media (prefers-color-scheme: light)` 覆盖，使用暗色 hover 颜色  

### 问题 4: 标题栏布局对齐不随窗口缩放
**症状**: Row 1 和 Row 2 的按钮大小/间距不一致  
**根因**: Row 2 使用了不同的 `titlebar-btn` 类尺寸  
**解决**: Row 2 仅用 `launcher-btn` 类，移除 `titlebar-btn`，使用统一的 gap 和 flex 布局  

### 问题 5: Worker 列显示"workerPool"而非"workers"
**症状**: MLRACallerTabs 中 columnOrder 默认值与 MLRAView 渲染逻辑不匹配  
**根因**: store 中用 `"workerPool"` 但 Tabs 用 `"workers"`  
**解决**: 统一使用 `"workers"` 作为 key  

### 问题 6: 角色定义不清楚
**症状**: 规划阶段的 expert/inspector 和实施阶段的职责界限模糊  
**根因**: 初期设计只有 3 个通用角色  
**解决**: 扩展为 6 角色，明确阶段界限，并根据 phaseView 动态过滤  

### 问题 7: 待命状态 UI 不明确  
**症状**: Agent 在非活跃阶段时应显示什么内容  
**根因**: 没有准确定义待命文本和 placeholder 样式  
**解决**: 创建 `StandbyPlaceholder` 组件，各角色定义专属待命文本  

### 问题 8: 前后端消息流不清晰
**症状**: 不确定前端事件如何触发后端操作  
**根因**: 缺乏明确的 invoke/listen 接驳方案  
**解决**: 在 store 中定义 `daemonAssignRole` / `daemonStartOrchestration` 等 invoke 方法，在 App 初始化 listen  

---

## 6. Pending Tasks and Next Steps

### 当前遗留工作

#### 6.1 后端具体实现细节
- [ ] **Orchestrator 中文指令完善** — 目前使用英文提示词，需改为中文指令以匹配用户语境
- [ ] **Error Case 完善** — orchestrator 中缺少错误恢复逻辑（如 agent 宕机重启）
- [ ] **工作队列持久化** — 当前工作状态仅在内存中，需支持进程重启后恢复

#### 6.2 Transcript 监控系统
按照前面讨论的 Agent 活性检测方案，需要：
- [ ] **实现 Alive 判定逻辑** — 阶段 A（pending）100% 确定 vs 阶段 B（<10min 推定）
- [ ] **Transcript 监控** — 轮询 VS Code Copilot 日志，检测 `assistant.turn_end` 后的沉默时间
- [ ] **Silent 标记机制** — 如果 2-3min 无新 transcript 事件 → 标记 stalled
- [ ] **重试触发** — stalled agent 可手动重试或自动重启

#### 6.3 前端界面細化
- [ ] **Worker 卡片展开/收起动画** — 当前逻辑正确但缺乏可视化动画
- [ ] **Launcher 侧栏搜索筛选** — 当前有搜索框但未实现过滤逻辑
- [ ] **Timeline 交互** — 可点击 round bar 查看该轮详细信息

#### 6.4 数据流验证
- [ ] **E2E 测试脚本** — 模拟完整编排流程：create→assign→start→submit→release→complete
- [ ] **IPC 消息日志** — 添加 debug 模式，记录所有前后端 IPC 消息便于诊断

### 后续技术债清单（不阻塞当前功能）

- **响应式 3 列/2 列/1 列模式** — 当前固定 4 列，可根据窗口宽度自动调整显示列数
- **Launcher 搜索全文索引** — 当前仅支持名称匹配，可扩展到任务描述、涉及 Agent 等
- **Undo/Redo** — 对 Launcher 配置的修改可回滚
- **导出工作记录** — 支持导出 Launcher 的完整执行记录为 markdown/pdf

### 预期停靠点（提交前的 Checkpoint）

短期内需要重点完成：

1. **后端 orchestrator 中文化** — 确保提示词对中文 agent 有效
2. **完整的 IPC 端到端测试** — 确认 frontend → daemon → agent → daemon → frontend 的完整消息流通
3. **Mock 清理验证** — 运行 Vite build 确保无 MockData 残留
4. **前后端集成测试** — 从 LauncherHome "开始编排" → daemon 确实启动 → Agent 接收初始指令 → UI 显示运行状态

---

## 附录：关键代码片段

### 前端 Daemon 通信示例

```typescript
// mlraStore.ts
export async function daemonStartOrchestration(launcherId: string) {
  try {
    const result = await invoke("send_to_mlra_daemon", {
      msg: JSON.stringify({
        type: "mlra_start_orchestration",
        launcherId,
        timestamp: Date.now()
      })
    });
    console.log("Daemon acknowledged:", result);
  } catch (e) {
    console.error("Failed to start orchestration:", e);
  }
}

// Tauri IPC 事件处理
export function handleDaemonMessage(msg: any) {
  const store = useMLRAStore.getState();
  switch (msg.type) {
    case "mlra_session_start":
      store.setAgentSlot(msg.launcherId, msg.agentId, {
        status: "working",
        sessionId: msg.sessionId
      });
      break;
    case "mlra_round_event":
      store.addRoundEvent(msg.launcherId, msg.roundEvent);
      break;
    // ...
  }
}
```

### 后端 Orchestrator 核心循环

```javascript
// orchestrator.mjs
async function planningPhase(launcher) {
  let expertMessage, inspectorResponse;
  
  for (let round = 0; round < 3; round++) {
    expertMessage = await router.release(
      launcher.agents["planning-expert"].callerId,
      `规划阶段第 ${round+1} 轮：${round === 0 ? "分析任务需求并提出规划方案" : "根据反馈优化规划"}`
    );
    
    inspectorResponse = await router.release(
      launcher.agents["planning-inspector"].callerId,
      `基于专家方案进行评审：${expertMessage}`
    );
    
    // 如果 inspector 同意，则进入 CEO 阶段
    if (inspectorResponse.includes("同意") || round === 2) break;
  }
  
  launcher.agents["planning-inspector"].conclude = inspectorResponse;
}
```

---

**文档完成日期**: 2026-04-10  
**累计代码行数**: ~6500 行（前端 ~3200 + 后端 ~2300 + CSS ~1200）  
**测试状态**: ✅ 前端编译通过，🔄 后端集成测试待完成

---

## 2026-04-23 增量更新（时间戳）

### 1. Previous Conversation

这轮对话是在旧版 MLRA 前后端实现基础上继续推进，主题已经从“做出一个 MLRA 页面”演进为“让 LauncherHome 真正成为 MLRA v2 的阶段编排器，并让前后端运行语义保持一致”。

用户在本轮中的明确需求演进如下：

1. 起点是“现在我想要让你改进MLRA的UI界面，使其适配V2版本的实际变化。请你先分析代码仓库现状”。
2. 随后需求落到 LauncherHome：“在LauncherHome改造出一个允许用户编排的阶段编排器”。
3. 用户继续补充阶段级需求：
  - 每个阶段允许定义阶段开场提示词
  - 允许定义起始消息进入的 agent（专家或监察）
  - 允许定义阶段准入审核提示词，用于告诉 CEO 什么情况下审批通过
  - 需要预设模板，也允许用户开始前自行编排
4. 用户要求先形成“新的完整详细的规划书”，之后要求“git备份后进行计划执行”。
5. 实现后，用户又要求“完整检查，确保新功能完整，没有严重 bug 和严重风险，老旧冗余代码清理干净”。
6. 再后面用户不再接受增量修补，而是明确要求：“好好重构你这稀烂的UI。彻底重新设计，无视现有实现！改进布局、改进交互逻辑，通过拖动、workflow流程化操作等直观操作改善交互体验！”。
7. 最近一轮则进入 UI 收口和视觉减法，用户连续给出以下反馈：
  - “界面依然是坏的，看起来缺失了某些样式。而且信息严重冗余，条条框框严重过度设计”
  - “移除外围三个区域最外层的圆角卡片边框”
  - “移除多余的大写英文小字”

因此，本会话后半段的重点已经从“让功能跑起来”切换成“修正 LauncherHome 的视觉层级、样式完整性和信息密度”。

### 2. Current Work

在用户要求创建本摘要之前，最近正在做的是 LauncherHome 的最终 UI 收口。

#### 2.1 最近的工作焦点

- 将 LauncherHome 从过度装饰、样式缺失的状态，收敛为一个更克制的工作台式界面。
- 核心判断是：这已经不是 JSX 语法或构建错误问题，而是两个并行问题：
  - 样式块不完整，导致当前 JSX 所依赖的类没有在正确的 CSS 区域定义。
  - JSX 信息层过厚，hero、状态卡、重复检查块和重复计数让页面显得破碎且冗余。

#### 2.2 最近完成的具体动作

1. 读取并定位了 LauncherHome 对应样式区段：
  - [app/src/index.css](app/src/index.css) 中 LauncherHome 样式块起于注释“LauncherHome: Config mode”，结束于 “LauncherSidebar” 之前。
2. 读取了 [app/src/components/LauncherHome.tsx](app/src/components/LauncherHome.tsx) 当前 JSX，确认以下冗余点：
  - hero 区包含英文眉标、状态胶囊、阶段序列条、三张统计卡
  - 启动区包含两段重复语义的 readiness 检查块
  - workflow 轨道头部存在重复计数
3. 针对 JSX 做了减法：
  - 移除了 `WorkflowStat` 统计卡的使用
  - 移除了 hero 中的阶段序列条
  - 将启动区双列检查块改为一条简洁的摘要文案
  - 去掉了 workflow 面板头部的重复计数
4. 针对 CSS 做了结构性修复：
  - 用一整套新的 LauncherHome 样式替换了 [app/src/index.css](app/src/index.css) 中原本残缺的样式块
  - 新样式覆盖了 hero、双列布局、workflow panel、stage card、editor section、launch dock、legend、responsive 行为等当前 JSX 真实使用的类
5. 按用户追加反馈继续做减法：
  - 去掉了三个主区域最外层 section 的圆角卡片边框，仅保留内部真正承担编辑与排序职责的卡片
  - 去掉了顶部英文眉标与编辑区英文 eyebrow
  - 将卡片 footer 中的英文小字改成中文

#### 2.3 当前验证状态

- [app/src/components/LauncherHome.tsx](app/src/components/LauncherHome.tsx) 最近一次静态校验通过
- [app/src/index.css](app/src/index.css) 最近一次静态校验通过
- 构建级验证原本计划继续执行，但由于交互反馈机制要求在运行终端命令前征得确认，而用户在确认窗口中继续给出了新的 UI 修改指令，因此构建验证尚未在这一轮完成

### 3. Key Technical Concepts

- MLRA v2 三主角色语义：`expert`、`inspector`、`ceo`
- 阶段式编排模型：规划阶段与执行阶段不再只是视图切换，而是 blueprint 中可配置的阶段序列
- `WorkflowBlueprint`：一次 Launcher 启动前的工作流蓝图，包含模板、描述、初始任务、全局策略和阶段列表
- `StageBlueprint`：单个阶段的配置项，包含：
  - `phaseType`
  - `openerTarget`
  - `openerPrompt`
  - `reviewerPrompt`
  - `ceoGatePrompt`
  - `completionRule`
  - `recommendedSkills`
- `BlueprintRuntimeSummary`：daemon 返回的当前运行态摘要，用于前端展示当前阶段
- 预览蓝图模式：没有真实 launcher 时，LauncherHome 也能通过 `previewBlueprint` / `workingBlueprint` 提供可操作界面
- 自动实体化策略：在无 launcher 的情况下，一旦用户对阶段做真实修改，使用 `withMaterializedStage` 落地到真实 launcher
- 阶段拖拽排序：通过 `draggingStageId`、`dragOverStageId` 和 `moveStageToIndex` 维护顺序
- Prompt Stack 结构：同一阶段中显式区分开场提示词、审阅提示词、CEO 准入提示词、完成标准
- 样式修复策略：不在残缺块上继续堆补丁，而是整体替换对应 CSS 区段，确保 JSX 与 CSS 同步

### 4. Relevant Files and Code

### [app/src/store/mlraStore.ts](app/src/store/mlraStore.ts)

- 这是当前 MLRA v2 阶段编排能力的中心数据模型文件。
- 已加入 `WorkflowBlueprint`、`StageBlueprint`、`BlueprintRuntimeSummary` 等类型。
- 已支持模板派生、阶段校验、blueprint runtime 存储与 daemon 消息接入。
- `BLUEPRINT_TEMPLATE_OPTIONS` 和 `STAGE_SKILL_OPTIONS` 提供了编排器的预设模板与推荐技能字典。

关键片段：

```ts
export interface StageBlueprint {
  id: string;
  order: number;
  enabled: boolean;
  name: string;
  phaseType: PhaseView;
  objective: string;
  description: string;
  openerTarget: StageRoleTarget;
  openerPrompt: string;
  reviewerPrompt: string;
  ceoGatePrompt: string;
  recommendedSkills: StageSkillKey[];
  completionRule: string;
  templateSource: BlueprintTemplateId | null;
}
```

### [app/src/components/LauncherHome.tsx](app/src/components/LauncherHome.tsx)

- 这是本轮修改最密集的前端文件。
- 当前职责已经不是旧版“配置 agent 分配表”，而是 Launcher 启动前的 workflow blueprint 编辑器。
- 当前重要结构：
  - 顶部简化后的 hero
  - 左侧启动与 workflow 轨道
  - 右侧阶段编辑器
  - `BlueprintStageCard`
  - `DetailSection`
- 最近的 UI 收口主要发生在这里：
  - 移除了 hero 中多余的视觉统计和英文眉标
  - 把启动面板的重复检查块压缩为一段摘要
  - 把编辑区英文 eyebrow 去掉，标题改成中文

关键片段：

```tsx
<div className="mlra-orchestrator-meta-row">
  <span className="mlra-orchestrator-meta-pill">模板: {blueprintLabel}</span>
  <span className="mlra-orchestrator-meta-pill">阶段: {stageStats.enabled}/{stageStats.total}</span>
  <span className="mlra-orchestrator-meta-pill">规划 / 执行: {stageStats.planning} / {stageStats.execution}</span>
</div>
```

```tsx
<div className="mlra-launch-dock-summary">
  {readiness.full.ready && readiness.direct.ready
   ? "蓝图已可启动。全开局会从第一个启用阶段推进，直接执行会跳到第一个执行阶段。"
   : `当前缺口: ${Array.from(new Set([...readiness.full.missing, ...readiness.direct.missing])).join("，")}`}
</div>
```

### [app/src/index.css](app/src/index.css)

- 这是最近 UI 根因修复的关键文件。
- 之前的问题并非“某几个样式没调好”，而是 LauncherHome 对应的 CSS 区段只剩部分残片，导致多个 JSX 类没有定义。
- 当前已将整个 LauncherHome 样式块完整重写，覆盖：
  - hero
  - 双列布局
  - workflow panel
  - launch dock
  - stage card
  - editor section
  - 空状态
  - legend
  - responsive 规则
- 最近进一步去掉了 `.mlra-workflow-panel` 的外卡片边框与圆角，响应用户对“外围三个区域”的减法要求。

关键片段：

```css
.mlra-workflow-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  border-radius: 0;
  border: none;
  background: transparent;
}
```

### [mcp/mlra/protocol/prompts.mjs](mcp/mlra/protocol/prompts.mjs)

- 已扩展阶段上下文注入逻辑。
- prompt 构造已能带入阶段目标、开场 agent、审阅关注点和 CEO gate 判定条件。

### [mcp/mlra/daemon/orchestrator.mjs](mcp/mlra/daemon/orchestrator.mjs)

- 已接入 blueprint 驱动的阶段推进。
- `startOrchestration` 接受 blueprint。
- CEO 判定后可以决定进入下一个已启用阶段。

### [mcp/mlra/daemon/index.mjs](mcp/mlra/daemon/index.mjs)

- `MLRA_START` 现已将 blueprint 透传给 daemon。
- `GET_TASK_CONTEXT` 已包含 blueprint 与当前阶段摘要。

### [app/src/components/MLRACallerTabs.tsx](app/src/components/MLRACallerTabs.tsx)

- 已移除 Worker Pool tab，缩减为 Expert / Inspector / CEO。
- 这是 MLRA v2 语义收敛的一部分。

### [app/src/components/LauncherSidebar.tsx](app/src/components/LauncherSidebar.tsx)

- 已从旧的 slot 视角切向当前阶段视角。
- 侧栏可展示 blueprintRuntime 中的当前阶段信息。

### 5. Problem Solving

#### 已解决的问题

1. 旧版 MLRA UI 与 v2 真实编排语义不匹配
  - 通过引入 blueprint/stage 模型与后端透传，LauncherHome 不再只是角色分配面板，而是启动前工作流编排器。

2. 前端仍残留 v1 / v1.5 时代的 Worker Pool 和注册卡片语义
  - 删除了未再需要的 `RegisteredAgentCard.tsx` 与 `WorkerPoolColumn.tsx`，并把 caller tabs 压缩到 v2 真实角色。

3. LauncherHome 在无 launcher 时表现为空壳
  - 加入 `previewBlueprint` / `workingBlueprint` 和自动实体化逻辑，使预览态也能操作。

4. LauncherHome 的 CSS 曾被错误补丁破坏，后续又处于“构建已恢复但样式残缺”的状态
  - 通过重新定位 CSS 区段并整体替换样式块，解决了“类名存在但无样式定义”的根因。

5. UI 信息层严重冗余
  - hero 中的统计卡、阶段序列条、重复启动检查块、重复计数已被删除或压缩。

6. 页面盒子层级过多
  - 按用户最新指令，三个主区域的外层圆角卡片壳已移除。

7. 装饰性英文眉标破坏整体简洁性
  - 已移除顶部眉标与编辑区英文小字，并将阶段卡片 footer 中的英文改为中文。

#### 仍在进行中的排查与收口

- 目前尚未执行本轮改动后的构建级验证，因为这一步需要在终端中运行命令，而用户在确认前继续提出了新的 UI 指令。
- 也尚未做最终的人工视觉验收，因此页面是否还需要继续压缩状态胶囊、footer 或右侧说明文字，取决于下一轮用户反馈。

### 6. Pending Tasks and Next Steps

#### 当前明确待办

- 继续做 LauncherHome 的视觉减法，直到用户认为页面不再“坏”和“不再过度设计”。
- 在获得确认后执行前端构建验证，确保本轮 JSX 与 CSS 收口没有引入打包问题。
- 如果构建通过，再视用户反馈决定是否继续压缩以下元素：
  - 顶部状态胶囊
  - 阶段卡片 footer
  - 右侧编辑器顶部说明文本
- 后续还需要继续检查 MLRA 运行态主工作区是否完全收敛到 v2 语义，而不仅仅是 LauncherHome。

#### 直接承接下一轮工作的用户原话

- “界面依然是坏的，看起来缺失了某些样式。而且信息严重冗余，条条框框严重过度设计”
- “移除外围三个区域最外层的圆角卡片边框”
- “移除多余的大写英文小字”

#### 下一步执行顺序

1. 若用户继续给出 UI 指令，优先继续局部删减，不先扩展新功能。
2. 若用户允许终端验证，则进入 app 目录执行构建，确认打包无回归。
3. 构建通过后，再决定是否需要进一步缩减文案和状态元素。

#### 当前停靠点

在创建本摘要之前，工作停留在“LauncherHome 已完成一轮结构性减法与样式完整性修复，静态校验通过，构建级验证待用户确认”这一状态。
