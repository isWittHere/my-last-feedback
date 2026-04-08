---
title: "MLRA UI 交互规格文档"
description: "My Long-Running Agent 前端交互设计完整规格"
workplace: ${workspaceFolder}
project: my-last-feedback
type: spec
tags:
    - MLRA
    - UI
    - interaction-spec
    - multi-agent
---

# MLRA UI 交互规格文档

> 版本: v0.1-draft | 日期: 2026-04-07

---

## 1. 设计原则

### 1.1 与 MLFB 的关系

- MLRA 与 MLFB **完全解耦**，两者是独立的功能视图
- 共享同一个 Tauri 窗口、IPC 基础设施和视觉风格系统
- 通过顶栏的 MLFB/MLRA 水平 pill toggle 切换
- 各自拥有独立的 Store（`feedbackStore.ts` / `mlraStore.ts`）
- MLFB 的成熟 UI 组件（CallerPanel、CallerTabs、多列布局引擎）可作为 MLRA 的基础

### 1.2 视觉风格复用

- MLRA 的基础 UI 风格与 MLFB 保持一致
- 3 个主 Agent 列的面板样式与 MLFB 的单个 CallerPanel 完全一致
- 列排序、列数控制等操作逻辑沿用 MLFB 的 CallerTabs 体系
- 子 Agent 池列为 MLRA 独有的特殊列

---

## 2. 全局布局

### 2.1 布局总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 标题栏 (34px)                                                           │
│ [☰] [MLFB|MLRA] [阶段1] ──CallerTabs(4列角色)── [排序][列数][⚙][📌][─□×] │
│                  [阶段2]                                                 │
└─────────────────────────────────────────────────────────────────────────┘
│                            主工作区                                      │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────────────┐        │
│  │  专家列    │ │  监察列    │ │  CEO列    │ │  子Agent池列      │        │
│  │           │ │           │ │           │ │                  │        │
│  │ Sidebar + │ │ Sidebar + │ │ Sidebar + │ │ Worker卡片列表    │        │
│  │ Content   │ │ Content   │ │ Content   │ │ (inline展开)     │        │
│  │           │ │           │ │           │ │                  │        │
│  └───────────┘ └───────────┘ └───────────┘ └──────────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 区域职责

| 区域 | 职责 |
|------|------|
| 标题栏 | 全局导航、视图/阶段切换、列控制、窗口操作 |
| 主工作区 | 4 列并行面板，展示当前 Launcher 下各角色的实时状态 |
| Launcher 侧栏 | 覆盖式弹出，管理和切换 Launcher |

---

## 3. 标题栏

### 3.1 标题栏布局

从左到右排列：

```
[☰ Launcher] [MLFB|MLRA] [阶段1]  ── CallerTabs(4列) ──  [排序][列数][⚙][📌][─□×]
                          [阶段2]
```

### 3.2 各元素说明

#### ☰ Launcher 按钮
- 位置：标题栏最左侧（macOS 在交通灯按钮右侧）
- 图标：汉堡菜单图标 `☰`
- 行为：点击 → 展开 Launcher Overlay 侧栏（见第 5 节）
- 仅在 MLRA 视图下显示

#### MLFB / MLRA 切换
- 样式：水平 pill toggle（已有实现）
- 位置：Launcher 按钮右侧
- 行为：切换顶级视图

#### 阶段切换
- 样式：与 MLFB / MLRA 切换一致的 pill toggle，但**上下垂直排列**
- 位置：MLFB / MLRA 切换右侧

```
┌──────────┐
│ 阶段1:规划│  ← 上方
├──────────┤
│ 阶段2:实施│  ← 下方
└──────────┘
```

- 当前阶段高亮显示（`app-view-toggle-active` 样式）
- 点击非激活阶段 → 切换主工作区的阶段视图
- **切换视图不影响 Launcher 实际运行状态**
- 仅在 MLRA 视图下显示，且当前有活跃 Launcher 时才可交互

#### CallerTabs（4 列角色 Tab）
- 位置：标题栏中央
- 沿用 MLFB 的 `CallerTabs` 组件逻辑
- 固定 4 个 Tab：`专家` / `监察` / `CEO` / `子Agent池`
- 支持拖拽排序调整列顺序
- 每个 Tab 附加角色状态徽标：
  - 🟢 活跃（当前正在运行）
  - 🔵 工作中（正在处理submit）
  - ⚪ 待命（当前阶段不参与）
  - 🟡 等待响应（有 pending session）
- Tab 标签包含角色图标 + 角色名（不使用 identicon，改用角色固定图标）

#### 右侧控制按钮
- 排序按钮：对列排序（沿用 MLFB `sortCallersByName` 行为）
- 列数模式：`auto / 1 / 2 / 3 / 4`（MLRA 增加 `4` 模式）
- 设置按钮：打开设置弹窗
- 置顶按钮：窗口置顶
- 窗口控制：最小化、最大化、关闭（非 macOS）

---

## 4. 主工作区 — 四列布局

### 4.1 三个主 Agent 列（专家 / 监察 / CEO）

每个主 Agent 列的内部结构与 MLFB 的 `CallerPanel` **完全一致**：

```
┌─ [角色名] ([模型名]) ─────────────┐
│ ┌─ Sidebar ──┐ ┌─ Content ─────┐ │
│ │            │ │               │ │
│ │ Session    │ │ SummaryPanel  │ │
│ │ 列表       │ │ (Agent输出)   │ │
│ │            │ │               │ │
│ │ session-1  │ ├───────────────┤ │
│ │ session-2  │ │ resize handle │ │
│ │ session-3  │ ├───────────────┤ │
│ │ ...        │ │ FeedbackInput │ │
│ │            │ │ (输入区)      │ │
│ └────────────┘ └───────────────┘ │
└───────────────────────────────────┘
```

#### 与 MLFB CallerPanel 的差异

| 属性 | MLFB CallerPanel | MLRA Agent 列 |
|------|-----------------|---------------|
| 列头标题 | Caller 名称 + Identicon | 角色名 + 模型标签 |
| 列头色彩 | Caller 自动分配色 | 角色固定色（见下表） |
| Session 来源 | 按 callerId 过滤 | 按 LauncherId + AgentSlotId 过滤 |
| FeedbackInput | 人类手动输入 | 人类可输入 / MLRA 编排器自动注入 |
| 列边框色 | `caller.color + "44"` | 角色固定色 + "44" |

#### 角色固定色

| 角色 | 色调 | 参考色值 |
|------|------|---------|
| 专家 (Expert) | 蓝色 | `#3B82F6` |
| 监察 (Inspector) | 橙色 | `#F59E0B` |
| CEO | 紫色 | `#8B5CF6` |
| 子 Agent 池 | 青色 | `#06B6D4` |

### 4.2 子 Agent 池列（特殊列）

子 Agent 池列不是标准 CallerPanel，而是一个**列表容器**：

```
┌─ 子Agent池 (2/3 活跃) ───────────┐
│ [+ 新建子Agent]                   │
│───────────────────────────────────│
│                                   │
│ ┌─ worker-1 (前端外包) ─────────┐ │
│ │ 🔵 working                    │ │
│ │ 当前: "修改登录页面样式"       │ │
│ │ [▼ 展开详情]                  │ │
│ └───────────────────────────────┘ │
│                                   │
│ ┌─ worker-2 (前端外包) ─────────┐ │
│ │ 🟢 ready                      │ │
│ │ 上次: "实现用户头像组件"       │ │
│ │ [▼ 展开详情]                  │ │
│ └───────────────────────────────┘ │
│                                   │
│ ┌─ worker-3 (后端外包) ─────────┐ │
│ │ 🔴 broken                     │ │
│ │ "重构API认证" ⚠ 异常          │ │
│ │ [重试] [销毁重建]             │ │
│ │ [▼ 展开详情]                  │ │
│ └───────────────────────────────┘ │
│                                   │
└───────────────────────────────────┘
```

#### 子 Agent 卡片结构

**折叠态（默认）**：

```
┌───────────────────────────────────┐
│ [状态图标] worker-1 (前端外包)     │  ← 行1: 标识
│ 🔵 working • "修改登录页面样式"    │  ← 行2: 状态 + 当前任务
│                        [▼ 展开]   │  ← 行3: 操作按钮
└───────────────────────────────────┘
```

**展开态（inline 展开）**：

点击展开按钮后，在卡片下方直接内联展开 mini CallerPanel：

```
┌───────────────────────────────────┐
│ [状态图标] worker-1 (前端外包)     │
│ 🔵 working • "修改登录页面样式"    │
│                        [▲ 收起]   │
│───────────────────────────────────│
│ ┌─ Mini SummaryPanel ──────────┐  │
│ │ (子Agent的输出内容)           │  │
│ │ 支持滚动                     │  │
│ │ ...                          │  │
│ └──────────────────────────────┘  │
│ ┌─ Mini FeedbackInput ─────────┐  │
│ │ (可手动注入指令给该子Agent)    │  │
│ │ [发送]                       │  │
│ └──────────────────────────────┘  │
└───────────────────────────────────┘
```

#### 子 Agent 卡片状态

| 状态 | 图标 | 颜色 | 可用操作 |
|------|------|------|---------|
| `ready` | 🟢 | 绿色 | 展开详情、查看历史 |
| `working` | 🔵 | 蓝色 | 展开详情（实时查看进度） |
| `broken` | 🔴 | 红色 | 展开详情、重试、销毁重建 |

#### 子 Agent 列表排序

- 默认排序：`working` > `broken` > `ready`
- 同状态内按最近活动时间降序

---

## 5. Launcher Overlay 侧栏

### 5.1 触发方式

- 点击标题栏左侧的 `☰` Launcher 按钮
- 从左侧滑入覆盖 overlay
- 半透明遮罩覆盖主工作区，点击遮罩关闭侧栏

### 5.2 侧栏布局

```
┌────────────────────────┐
│  Launcher 管理    [×]   │  ← 标题 + 关闭按钮
│─────────────────────────│
│  🔍 搜索/过滤           │  ← 搜索框
│─────────────────────────│
│                         │
│  ● Launcher 1           │  ← 当前选中项（高亮）
│    "重构用户登录系统"     │     Launcher 名称
│    🟢 运行中 │ 阶段2:实施 │     状态 + 当前阶段
│    2026-04-07 14:30     │     创建时间
│    专家:活跃 监察:活跃    │     Agent摘要
│─────────────────────────│
│                         │
│  ○ Launcher 2           │
│    "优化系统性能"         │
│    ✅ 已完成              │
│    2026-04-05 09:00     │
│─────────────────────────│
│                         │
│  ○ Launcher 3           │
│    "新增用户管理模块"     │
│    ⏸ 已暂停              │
│    2026-04-06 16:45     │
│─────────────────────────│
│                         │
│  [+ 新建 Launcher]      │  ← 底部固定
│                         │
└─────────────────────────┘
```

### 5.3 Launcher 项信息

每个 Launcher 列表项显示：

| 字段 | 说明 |
|------|------|
| 名称 | Launcher 的任务描述标题 |
| 状态 | 🟢 运行中 / ✅ 已完成 / ⏸ 已暂停 / ❌ 已取消 |
| 当前阶段 | 规划对峙 / 实施循环 |
| 创建时间 | 时间戳 |
| Agent 摘要（可选） | 各角色当前状态一览 |

### 5.4 Launcher 操作

| 操作 | 触发方式 | 说明 |
|------|---------|------|
| 选择/切换 | 单击 | 主工作区切换到该 Launcher → 侧栏自动关闭 |
| 重命名 | 右键菜单 / 双击标题 | 修改 Launcher 名称 |
| 暂停 | 右键菜单 | 暂停所有 Agent 活动（保留 session） |
| 恢复 | 右键菜单 | 恢复暂停的 Launcher |
| 删除 | 右键菜单（二次确认） | 删除 Launcher 及关联数据 |
| 新建 | 底部按钮 | 创建新 Launcher → 弹出初始配置 |

### 5.5 关键行为

- **切换 Launcher 不影响其他 Launcher 的运行状态** — 所有 Launcher 并行存在
- 侧栏使用 `position: fixed` + `z-index` 覆盖在主工作区之上
- 宽度固定（约 320px），不随窗口缩放
- 支持列表内滚动（Launcher 数量多时）

---

## 6. 待命态设计

### 6.1 阶段与角色活跃状态矩阵

| 角色 | 阶段1: 规划对峙 | 阶段2: 实施循环 |
|------|---------------|---------------|
| 专家 | **活跃**（规划专家） | **活跃**（实施专家） |
| 监察 | **活跃**（规划监察） | **活跃**（实施监察） |
| CEO | **待命** → 门控时激活 | **待命** → 终审时激活 |
| 子 Agent 池 | **待命**（不参与规划） | **活跃**（可被委派） |

### 6.2 待命列视觉处理

当某列处于"待命"状态时：

```
┌─ CEO (待命) ─────────────────────┐
│          ╭───────────────────╮    │
│          │                   │    │
│          │   💤 待命中        │    │
│          │                   │    │
│          │  CEO 将在投票通过  │    │
│          │  后介入门控审批    │    │
│          │                   │    │
│          ╰───────────────────╯    │
│                                   │
│  ── 历史记录 ──                   │
│  ▸ 上次 Launcher 的 CEO 审批记录  │
│                                   │
└───────────────────────────────────┘
```

**视觉效果**：
- 整列应用 `opacity: 0.5` + `filter: grayscale(0.3)` 灰度效果
- 居中显示待命图标（💤 或空状态图标）和待命原因文案
- 下方保留折叠的历史 session 入口，可展开查看
- 待命列仍可点击/交互，但输入区不可用

**待命文案映射**：

| 角色 | 待命阶段 | 文案 |
|------|---------|------|
| CEO | 规划阶段（未投票） | "CEO 将在双方投票通过后介入门控审批" |
| CEO | 实施阶段（执行中） | "CEO 将在所有 Phase 完成后进行终审" |
| 子 Agent 池 | 规划阶段 | "子 Agent 在实施阶段由专家按需委派" |

### 6.3 待命 → 激活过渡

当角色从待命变为活跃时：
- 移除灰度/透明效果（建议使用 CSS transition 平滑过渡）
- 待命占位内容替换为标准 CallerPanel
- CallerTab 上对应 tab 的状态徽标变为活跃色

---

## 7. 窄屏响应式降级

### 7.1 列数模式

沿用 MLFB 的列数模式机制，增加 `4` 模式：

| 模式 | 显示列数 | 备注 |
|------|---------|------|
| `auto` | 根据 `PANEL_MIN_WIDTH` 自动计算 | 默认模式 |
| `1` | 1 列 | 仅显示 CallerTabs 当前选中的列 |
| `2` | 2 列 | 显示排序靠前的 2 列 |
| `3` | 3 列 | 显示排序靠前的 3 列 |
| `4` | 4 列 | 全部显示（MLRA 独有） |

### 7.2 降级移除优先级

当屏幕无法容纳所有列时，按以下优先级折叠（首先移除排在后面的）：

1. **最先移除**：待命状态的列
2. 子 Agent 池列
3. CEO 列
4. 监察列
5. **最后移除**：专家列

被折叠的列仍然可以通过 CallerTabs 点击 tab 来切换显示。

### 7.3 PANEL_MIN_WIDTH

建议 MLRA 沿用 MLFB 的 `PANEL_MIN_WIDTH = 520px`，或根据 MLRA 面板内容复杂度微调（子 Agent 池列可能需要更宽）。

---

## 8. 数据模型

### 8.1 Store 分离

MLRA 使用独立的 Zustand store（`mlraStore.ts`），与 MLFB 的 `feedbackStore.ts` 完全分离。

### 8.2 核心数据结构

```typescript
// mlraStore.ts

interface MLRAStore {
  // ── Launcher 管理 ──
  launchers: Launcher[];
  activeLauncherId: string | null;
  launcherSidebarOpen: boolean;
  
  // ── 视图状态 ──
  phaseView: "planning" | "implementation";   // 当前查看的阶段
  columnOrder: string[];                       // 4列排序（角色ID列表）
  layoutMode: "auto" | 1 | 2 | 3 | 4;
  
  // ── Actions ──
  createLauncher: (name: string, config: LauncherConfig) => void;
  switchLauncher: (id: string) => void;
  pauseLauncher: (id: string) => void;
  resumeLauncher: (id: string) => void;
  deleteLauncher: (id: string) => void;
  setPhaseView: (phase: "planning" | "implementation") => void;
  setColumnOrder: (order: string[]) => void;
  setLayoutMode: (mode: "auto" | 1 | 2 | 3 | 4) => void;
  toggleLauncherSidebar: () => void;
}

interface Launcher {
  id: string;
  name: string;                                // 任务描述标题
  status: "running" | "paused" | "completed" | "cancelled";
  currentPhase: "planning" | "implementation";
  createdAt: string;
  updatedAt: string;
  
  // Agent 插槽
  agents: {
    expert: AgentSlot;
    inspector: AgentSlot;
    ceo: AgentSlot;
    workers: WorkerSlot[];
  };
  
  // 阶段历史（切换阶段时保留历史）
  planningSessionIds: string[];
  implementationSessionIds: string[];
}

interface AgentSlot {
  id: string;
  role: "expert" | "inspector" | "ceo";
  displayName: string;                         // 显示名称
  model: string;                               // 模型名称（如 "OPUS HT"）
  status: "active" | "standby" | "idle";
  color: string;                               // 角色固定色
  activeSessionId: string | null;
  sessionIds: string[];
}

interface WorkerSlot {
  id: string;
  role: string;                                // 如 "前端外包" / "后端外包"
  displayName: string;
  model: string;
  status: "ready" | "working" | "broken";
  currentTask: string | null;
  taskHistory: string[];
  activeSessionId: string | null;
  sessionIds: string[];
}

interface LauncherConfig {
  // 创建 Launcher 时的初始配置
  expertModel: string;
  inspectorModel: string;
  ceoModel: string;
  initialWorkers?: WorkerConfig[];
}

interface WorkerConfig {
  role: string;
  model: string;
}
```

### 8.3 Session 复用

MLRA 的 Session 数据结构可复用 MLFB 现有的 `Session` 接口，因为本质都是：

- 一次 agent 交互（summary + feedback + images + 状态）
- 通过 IPC 挂起/恢复

区别在于 Session 的归属关系：
- MLFB: `Session.callerId` → Caller
- MLRA: `Session.agentSlotId` → AgentSlot/WorkerSlot → Launcher

---

## 9. 组件架构

### 9.1 新增组件

| 组件 | 职责 | 对标 MLFB |
|------|------|----------|
| `MLRAView` | MLRA 视图根组件 | 类似 FeedbackApp 的 persistent 模式 |
| `AgentColumn` | 主 Agent 列面板 | CallerPanel 的角色化变体 |
| `WorkerPoolColumn` | 子 Agent 池列 | 全新组件 |
| `WorkerCard` | 子 Agent 折叠/展开卡片 | 无对标 |
| `MiniCallerPanel` | 子 Agent 展开时的内嵌面板 | CallerPanel 精简版 |
| `LauncherSidebar` | Launcher overlay 侧栏 | 类似 CallerManager 但作为侧栏 |
| `LauncherItem` | 侧栏中的 Launcher 列表项 | 无对标 |
| `PhaseToggle` | 阶段切换控件（上下排列pill） | 类 AppViewToggle 但垂直 |
| `StandbyPlaceholder` | 待命列占位组件 | 无对标 |

### 9.2 复用组件

| 组件 | 复用方式 |
|------|---------|
| `CallerTabs` | 直接复用，数据源从 callers 切换为 MLRA 的 4 个角色 slot |
| `SummaryPanel` | 直接复用 |
| `FeedbackInput` | 直接复用 |
| `ImageAttachmentWidget` | 直接复用 |
| `Sidebar` (session 列表) | 直接复用，过滤条件变为 agentSlotId |
| `PromptButtons` | 直接复用 |
| `QuickActions` | 直接复用 |
| `SettingsDialog` | 扩展（增加 MLRA 特有设置项） |
| `LayoutModeButton` | 扩展（增加 4 列模式） |

### 9.3 组件树

```
FeedbackApp
├── (appView === "MLFB") → 现有 MLFB 视图
└── (appView === "MLRA") → MLRAView
    ├── LauncherSidebar (overlay, 条件渲染)
    │   └── LauncherItem[] (可滚动列表)
    │       └── LauncherItem (单个 Launcher 信息卡)
    ├── 标题栏区域
    │   ├── LauncherButton (☰)
    │   ├── AppViewToggle (MLFB/MLRA)
    │   ├── PhaseToggle (阶段1/阶段2, 上下排列)
    │   ├── CallerTabs (4个角色tab)
    │   └── 右侧控制按钮
    └── 主工作区 (flex row)
        ├── AgentColumn (专家)
        │   └── CallerPanel 变体
        │       ├── Sidebar (session列表)
        │       └── CallerContent
        │           ├── SummaryPanel
        │           └── FeedbackInput
        ├── AgentColumn (监察)
        │   └── ... 同上
        ├── AgentColumn (CEO)
        │   ├── (active) → CallerPanel 变体
        │   └── (standby) → StandbyPlaceholder
        └── WorkerPoolColumn (子Agent池)
            ├── (active) → WorkerCard[] 列表
            │   └── WorkerCard
            │       ├── 折叠态: 状态 + 任务摘要
            │       └── 展开态: MiniCallerPanel
            │           ├── Mini SummaryPanel
            │           └── Mini FeedbackInput
            └── (standby) → StandbyPlaceholder
```

---

## 10. 交互细节

### 10.1 Launcher 切换流程

1. 用户点击 `☰` → Launcher 侧栏滑入（从左侧）
2. 半透明遮罩覆盖主工作区
3. 用户点击目标 Launcher
4. `activeLauncherId` 更新
5. 主工作区刷新为目标 Launcher 的 Agent 状态
6. 侧栏自动关闭（动画滑出）

### 10.2 阶段视图切换流程

1. 用户点击非活跃阶段的 pill
2. `phaseView` 更新
3. 3 个主 Agent 列的 session 内容切换到对应阶段的 session
4. 待命态列更新（如规划阶段子 Agent 池显示待命）
5. CallerTabs 上各 tab 的状态徽标更新

### 10.3 子 Agent 卡片展开/收起

1. 用户点击 `▼ 展开` 按钮
2. 卡片高度 animate 展开（CSS transition）
3. 内嵌的 Mini SummaryPanel 和 Mini FeedbackInput 渲染
4. 列表自动滚动使展开的卡片完全可见
5. 点击 `▲ 收起` → 高度 animate 收起

### 10.4 MLRA 编排器自动填入

MLRA 编排器在路由消息时，会通过 IPC 自动向对应 Agent 的 FeedbackInput 区域填入内容并自动提交。在 UI 层面：

- FeedbackInput 区域瞬间显示填入内容（可能闪现）
- 显示明确的"[编排器自动发送]"标记
- 用户可在 Summary 中查看完整的编排器注入历史

### 10.5 列拖拽排序

沿用 MLFB CallerTabs 的拖拽排序机制：

- 在 CallerTabs 中拖拽 tab 调整列顺序
- `columnOrder` 更新
- 主工作区列自动重排

---

## 11. 设置页面扩展

SettingsDialog 在 MLRA 模式下增加以下设置项：

### 11.1 Launcher 管理

类似 MLFB 的 CallerManager，但管理对象是 Launcher：

| 设置项 | 类型 | 说明 |
|--------|------|------|
| Launcher 列表 | 列表 + 操作 | 查看所有 Launcher，支持重命名/删除 |
| 自动暂停非活跃Launcher | 开关 + 时间 | 超过N小时无活动自动暂停 |
| 最大并行Launcher数 | 数字输入 | 运行中的 Launcher 上限 |

### 11.2 Agent 默认配置

| 设置项 | 类型 | 说明 |
|--------|------|------|
| 专家默认模型 | 下拉选择 | 新建 Launcher 时专家的默认模型 |
| 监察默认模型 | 下拉选择 | 新建 Launcher 时监察的默认模型 |
| CEO默认模型 | 下拉选择 | 新建 Launcher 时 CEO 的默认模型 |
| 子Agent默认角色预设 | 列表 | 预定义的子 Agent 角色模板 |

### 11.3 编排器行为配置

| 设置项 | 类型 | 说明 |
|--------|------|------|
| 防御性拒绝最少轮数 | 数字输入 | CEO 门控前的最少拒绝轮次 |
| 自动健康检查间隔 | 数字输入 | 子 Agent 健康检查周期（秒） |
| 停滞检测阈值 | 数字输入 | N分钟无进展视为停滞 |

---

## 12. 样式规范

### 12.1 新增 CSS 类

```css
/* Launcher按钮 */
.launcher-btn { }

/* 阶段切换（垂直pill） */
.phase-toggle { flex-direction: column; }
.phase-toggle-btn { }
.phase-toggle-active { }

/* Agent列 */
.agent-column { }
.agent-column-standby { opacity: 0.5; filter: grayscale(0.3); }
.agent-column-header { }
.agent-column-model-tag { }

/* 子Agent池 */
.worker-pool-column { }
.worker-card { }
.worker-card-expanded { }
.worker-card-status { }
.worker-card-status--ready { color: var(--color-success); }
.worker-card-status--working { color: var(--color-primary); }
.worker-card-status--broken { color: var(--color-error); }

/* Mini CallerPanel */
.mini-caller-panel { }
.mini-summary { }
.mini-input { }

/* Launcher侧栏 */
.launcher-sidebar-overlay { }
.launcher-sidebar { }
.launcher-sidebar-item { }
.launcher-sidebar-item-active { }
.launcher-sidebar-item-status { }

/* 待命占位 */
.standby-placeholder { }
.standby-icon { }
.standby-message { }
```

### 12.2 过渡动画

| 场景 | 动画 | 时长 |
|------|------|------|
| Launcher 侧栏展开/收起 | `transform: translateX` | 200ms ease |
| 待命 → 活跃 | `opacity` + `filter` transition | 300ms ease |
| 子 Agent 卡片展开/收起 | `max-height` transition | 200ms ease |
| 阶段切换高亮 | `background` transition | 150ms ease |

---

## 附录 A: MLRA 标题栏 vs MLFB 标题栏差异

| 元素 | MLFB | MLRA |
|------|------|------|
| 左侧 | [MLFB\|MLRA] 切换 | [☰ Launcher] + [MLFB\|MLRA] + [阶段切换] |
| 中央 | CallerTabs (动态caller数) | CallerTabs (固定4角色) |
| 右侧 | [排序] [列数] [⚙] [📌] [窗口] | [排序] [列数] [⚙] [📌] [窗口] |
| 高度 | 34px | 34px（阶段切换可能需要微调高度） |

## 附录 B: 阶段切换与 Session 映射

```
Launcher "重构登录系统"
├── 阶段1: 规划对峙
│   ├── 专家列 → planningSessionIds 中 role=expert 的 sessions
│   ├── 监察列 → planningSessionIds 中 role=inspector 的 sessions
│   ├── CEO列 → planningSessionIds 中 role=ceo 的 sessions (可能为空)
│   └── 子Agent池 → (待命，无关联 session)
│
└── 阶段2: 实施循环
    ├── 专家列 → implementationSessionIds 中 role=expert 的 sessions
    ├── 监察列 → implementationSessionIds 中 role=inspector 的 sessions
    ├── CEO列 → implementationSessionIds 中 role=ceo 的 sessions
    └── 子Agent池 → workers[].sessionIds 关联的 sessions
```
