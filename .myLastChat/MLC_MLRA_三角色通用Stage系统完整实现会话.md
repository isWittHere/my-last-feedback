---
title: MLRA 三角色通用Stage系统完整实现会话
description: 从phase二元模型迁移至stage通用流程系统，三角色固定拓扑，一刀切零兼容，完整协议+daemon+store+UI实现
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
solved_lists:
  - 完成模型设计确认（三角色、Stage通用引擎、Closing阶段、ExitGateEnabled）
  - 创建3个Stage模板JSON（deliberation/delivery/closing）
  - 协议层完全重写（roles/messages/prompts）
  - MCP servers更新（expert/inspector/ceo工具schema改造）
  - Orchestrator整文件重写（统一Stage流程、CEO防御锁、Closing分支）
  - Daemon/index.mjs事件系统重写（MLRA_STAGE_CHANGE、双票机制）
  - Store完整重写（3槽agents、Stage数据结构、Blueprint模型、Closing自动追加）
  - UI全面更新（删除PhaseToggle、更新6个组件、蓝图编辑器改造）
  - 全工作区编译通过（0 errors）
  - Stage gate toggle交互实现（Icon组件、CSS样式）
---

# MLRA 三角色通用Stage系统完整实现会话

## 1. Previous Conversation

从3月底开始，用户进行了 MLRA（Multi-agent Long-Running Agentic workflow）系统的一次重大语义重构。这个过程分为两个阶段：

**阶段一（前期分析与设计）**
- 用户要求我理解和分析旧模型（phase-based、4槽位、stageStrategy枚举）的问题
- 通过多轮对话和手工模型建立，逐步确认了新系统的语义
- 最终锁定了六个关键决策（MLRA_STAGE_CHANGE命名、防御锁注释、旧launcher数据丢弃、删除inspector.passed、删除expert.type、exitGateEnabled可编排）

**阶段二（完整实现与验证）** ← **当前会话主要内容**
- 编写了完整的规划文档（`.myLastChat/MLC_MLRA_3角色阶段流程_重构规划.md`）
- 按照规划执行一刀切迁移，涉及后端、协议、前端三个方向的全栈改造
- 完成了编译验证和UI交互细节实现

---

## 2. Current Work

### 2.1 核心改造成果

**协议层** (`mcp/mlra/protocol/`)
- 删除 PHASES / START_MODES / REQUIRED_ROLES_BY_START_MODE
- MLRA_PHASE_CHANGE 改名为 MLRA_STAGE_CHANGE
- 删除按 deliberation/execution 拆 key 的路由模板，改为通用 stage 模板
- roles.mjs：删除所有四槽位（planning-expert/planning-inspector/execution-expert/execution-inspector），保留三角色（expert/inspector/ceo/worker）

**MCP Servers** (`mcp/mlra/servers/`)
- mcp-expert.mjs：删除 expert_submit.type 枚举（不再区分 plan_draft/phase_complete）
- mcp-inspector.mjs：删除 inspector_submit.passed 字段，改为纯反馈内容
- 添加工具签名 zod schema 的缩窄和文档更新

**Daemon 核心状态机** (`mcp/mlra/daemon/orchestrator.mjs`)
- 删除 this.phase / this.startMode / COLLABORATION_MODES 映射
- 新增 this.currentStageId + this.submitCount（内循环计数）
- 统一的 expert_submit → Inspector 路由，inspector_submit → Expert 路由（无判断分支）
- 双票通过后按 stage.exitGateEnabled 决定：是否走 CEO 防御锁，还是直接进下一 stage
- 添加 closing stage 判定分支：进入最后 stage 时，若 isClosing=true，仅给 CEO 发 initial prompt
- 防御锁注释改为 "Defensive gate step 1/2/3"
- toJSON 删除 phase/startMode 字段

**IPC 桥接层** (`mcp/mlra/daemon/index.mjs`)
- MLRA_START：接收 blueprint，不再有 startMode 参数
- 转发 MLRA_STAGE_CHANGE 消息，替代旧的 phase_transition
- 删除 daemonAssignRole / mlra_assign_role 机制

**前端数据层** (`app/src/store/mlraStore.ts`)
- 删除 PhaseView / StartMode / StageStrategy / LaunchStrategy 类型
- 删除所有桥接 helper（stageStrategyToPhaseView / phaseViewToStageStrategy / launchStrategyToStartMode 等）
- 新增 StageBlueprint 字段：templateId（仅溯源）/ promptOverride / skillRefs / exitGateEnabled / isClosing
- 删除 WorkflowBlueprint.launchStrategy
- 删除 Launcher 里的 currentPhase / startMode / planningSessionIds / implementationSessionIds
- 新增 Launcher.blueprint 末尾必然包含 isClosing=true 的 stage（自动追加）
- appendClosingStage 辅助函数保证所有蓝图末尾都有 closing stage

**UI 组件**
- 删除 `app/src/components/PhaseToggle.tsx`（整文件）
- `app/src/components/AgentColumn.tsx`：删除 phaseView 读取和槽位 resolver
- `app/src/components/MLRACallerTabs.tsx`：删除 phaseView 和 4 槽位直接访问
- `app/src/components/LauncherSidebar.tsx`：删除 PHASE_LABELS，改读 blueprintRuntime.currentStageId → stage.name
- `app/src/components/FeedbackApp.tsx`：删除 PhaseToggle 渲染
- `app/src/components/LauncherHomeNodeWorkbench.tsx`（蓝图编辑器）：
  - "新建 stage" 改为下拉菜单（读 mcp_prompts/stage_templates/*.json 生成选项）
  - 支持新字段编辑：templateId / promptOverride / skillRefs / exitGateEnabled
  - closing stage 渲染为灰底 🏁，不可删不可移
  - 连接线加 stage gate toggle 按钮（✅ 已实现）

**样式** (`app/src/index.css`)
- 删除 .phase-toggle-* 死代码
- 添加 .mlra-stage-gate-toggle 样式（小图标按钮，🔒/➡️ 切换）
- 添加 stage gate toggle 在连接线上的布局

**模板文件** (`mcp_prompts/stage_templates/`)
- deliberation.json：论证评审模板（专家和监察反复打磨方案）
- delivery.json：交付验证模板（逐 cycle 推进交付）
- closing.json：结束阶段模板（CEO 汇总全流程摘要）

### 2.2 实现过程中的关键里程碑

1. **模型确认**（2026-04-25 之前）
   - 通过 6 组问题（A-F）逐步验证，确认了设计是否与用户心智模型对齐
   - 最终版本：stage 通用（无硬编码 deliberation/delivery 分支）、三角色固定身份、closing 特殊结束阶段、exitGateEnabled 可编排

2. **规划文档锁定**
   - 生成 MLC_MLRA_3角色阶段流程_重构规划.md（§2-§11 覆盖全部设计、数据结构、改造清单、验收表）
   - Git 备份（commit 5d34bab）

3. **协议层改造**（Step 1-3）
   - 创建 3 个 JSON 模板
   - 重写 protocol 文件
   - 更新 MCP server schema

4. **Daemon 改造**（Step 4-5）
   - Orchestrator 完全重写：2000+ 行改为 1000+ 行，逻辑从"phase 分支"改为"stage 通用流水"
   - Daemon index.mjs 更新消息路由和状态同步

5. **前端改造**（Step 6-8）
   - Store 整文件重写，3000+ 行新数据层
   - 6 个 UI 组件逐一更新或删除
   - 蓝图编辑器支持新字段和 closing stage 锁定显示

6. **验收与迭代**
   - 全工作区 `npm run build` 通过（0 errors）
   - Grep 扫描验证旧字段彻底删除
   - Stage gate toggle UI 交互实现（Icon + CSS）

### 2.3 当前状态

- ✅ 后端编译通过（`node --check mcp/mlra/daemon/*.mjs` 全绿）
- ✅ 前端编译通过（`npm run build` 成功，0 errors）
- ✅ 旧关键字零残留（phase/startMode/stageStrategy/launchStrategy/4槽位等）
- ✅ Stage gate toggle UI 功能实现（Icon 组件、CSS 样式、双向切换）
- ⏳ 尚未做运行时测试（因为没有启动 Tauri dev/daemon）

---

## 3. Key Technical Concepts

### 3.1 三角色系统（三个固定身份）

| 角色 | 身份 | 职责 | 活跃周期 |
|---|---|---|---|
| **Expert** | 产出方 / 操刀者 | 提交方案、代码、成果 | 所有 stage 都在线 |
| **Inspector** | 审查方 / 把关者 | 反馈意见、通过/打回 | 所有 stage 都在线（除 closing） |
| **CEO** | 裁决方 / 防御守门人 | 关卡裁决、防御锁激活 | 常驻 standby，仅在 gate 触发时激活 |
| **Worker** | 临时子角色 | Expert 需要时召唤 | 按需 |

**关键理解**：不存在"规划专家"和"执行专家"。同一位 Expert 从头到尾跟同一批上下文，只是在不同 stage 下以不同**节奏**工作。

### 3.2 Stage 通用引擎

**Stage 是通用定义单位，没有硬编码分类**。所有 stage 走同一套流程引擎：

```
进入 stage
  ↓
Expert 提交 expert_submit({content, progress?})
  ↓
→ 路由给 Inspector
  ↓
Inspector 反馈 inspector_submit({content})
  ↓
→ 路由给 Expert
  ↓
（无限循环，只计数 submitCount）
  ↓
双方都调用 expert_vote(pass) / inspector_vote(pass)
  ↓
检查 stage.exitGateEnabled
├── true  → CEO 防御锁（强制复审+连续确认）→ 通过 → _advanceStage
└── false → 直接 _advanceStage
```

**Stage 内循环无类型区分**。行为差异由 stage 的 prompt 内容（via templateId 或 promptOverride）决定，不是代码分支。

### 3.3 CEO 防御锁（Gate 机制）

**每个 stage 的出口都是一个 gate**，gate 的流程恒定：

1. Defensive gate step 1：Expert/Inspector vote=pass 触发 → CEO 收到 ceo_verdict 请求
2. 第一次 approved 被拦截 → 强制降级为"需复审"
3. Defensive gate step 2/3：连续两次 approved，两次都需强制二次确认
4. 最终 approved 生效 → _advanceStage

**最后一个用户 stage 的 gate 通过后**，自动进入 closing stage（不需用户干预）。

### 3.4 Closing Stage（特殊结束阶段）

**Closing stage 是系统自动追加的固定末尾 stage**，特点：

- 不可删除、不可移动、不可编辑名称
- 由 CEO 单独主导（Expert/Inspector 休眠）
- CEO 收到 initial prompt（引用 closing.json 的 skill），自己产出汇总摘要
- 完成后调用阻塞工具（interactive_feedback），launcher 进入 awaiting-user 状态
- **只有这个 stage 打破了"Expert+Inspector 循环"模式**

### 3.5 LaunchStrategy 概念删除

新模型永远从 stages[0] 开始，按 order 依序推进。用户想"跳过论证直接交付"？自己编排一份只有 delivery 模板 stage 的蓝图即可。

---

## 4. Relevant Files and Code

### 4.1 协议层

| 文件 | 变更 | 关键内容 |
|---|---|---|
| `mcp/mlra/protocol/roles.mjs` | 重写 | 删除 PHASES/START_MODES；保留 AGENT_ROLES={EXPERT,INSPECTOR,CEO,WORKER} |
| `mcp/mlra/protocol/messages.mjs` | 重写 | MLRA_PHASE_CHANGE→MLRA_STAGE_CHANGE；删除 phase 相关字段 |
| `mcp/mlra/protocol/prompts.mjs` | 重写 | 删除按 deliberation/execution 拆 key；改为统一 stage 路由模板 |

### 4.2 MCP Servers

| 文件 | 变更 | 关键内容 |
|---|---|---|
| `mcp/mlra/servers/mcp-expert.mjs` | 更新 | expert_submit schema：删除 type 枚举；progress 改为可选自由文本 |
| `mcp/mlra/servers/mcp-inspector.mjs` | 更新 | inspector_submit schema：删除 passed 字段；只有 content |
| `mcp/mlra/servers/mcp-ceo.mjs` | 保留 | ceo_verdict 工具不变 |

### 4.3 Daemon 核心

| 文件 | 变更 | 规模 | 关键改动 |
|---|---|---|---|
| `mcp/mlra/daemon/orchestrator.mjs` | 重写 | ~1000→600 行 | 删除 phase/startMode；新增 currentStageId/submitCount；统一 stage 流程；closing 分支 |
| `mcp/mlra/daemon/index.mjs` | 重写 | ~500→300 行 | MLRA_START/STAGE_CHANGE/投票分发；删除 daemonAssignRole |

### 4.4 前端数据层

| 文件 | 变更 | 规模 | 关键改动 |
|---|---|---|---|
| `app/src/store/mlraStore.ts` | 重写 | ~3000→3500 行 | 新 StageBlueprint/WorkflowBlueprint/LauncherRuntime；3 槽 agents；appendClosingStage；工具 schema |

### 4.5 前端 UI 组件

| 文件 | 变更 | 关键改动 |
|---|---|---|
| `app/src/components/PhaseToggle.tsx` | **删除** | 整文件删除 |
| `app/src/components/AgentColumn.tsx` | 更新 | 删除 phaseView/槽位 resolver；直接读 3 角色 |
| `app/src/components/MLRACallerTabs.tsx` | 更新 | 删除 phaseView；改用 store 角色映射 |
| `app/src/components/LauncherSidebar.tsx` | 更新 | 删除 PHASE_LABELS；改读 currentStageId→stage.name |
| `app/src/components/FeedbackApp.tsx` | 更新 | 删除 PhaseToggle 渲染；删除 currentPhase 相关代码 |
| `app/src/components/LauncherHomeNodeWorkbench.tsx` | 重构 | 蓝图编辑器：新字段编辑（templateId/promptOverride/skillRefs/exitGateEnabled）；closing stage 锁定；模板下拉菜单 |

### 4.6 样式和模板

| 文件 | 变更 | 关键内容 |
|---|---|---|
| `app/src/index.css` | 更新 | 删除 .phase-toggle-* 死代码；新增 .mlra-stage-gate-toggle 样式 |
| `mcp_prompts/stage_templates/deliberation.json` | **新建** | 论证评审模板（promptExpert/promptInspector/skillRefs） |
| `mcp_prompts/stage_templates/delivery.json` | **新建** | 交付验证模板 |
| `mcp_prompts/stage_templates/closing.json` | **新建** | 结束阶段模板（CEO 独角戏） |

---

## 5. Problem Solving

### 5.1 模型对齐问题

**问题**：旧的思维中，"deliberation" 和 "delivery" 被硬编码为类型分支，导致 stage 系统无法通用。

**解决**：
- 确认 stage 本身是通用定义单位，不区分类型
- 预置模板（deliberation/delivery/closing）只是脚手架，用户可任意组合或自定义
- 所有 stage 走统一流程引擎，行为差异由 prompt 决定，不由代码分支决定

### 5.2 协议向后兼容问题

**问题**：一刀切迁移意味着完全废弃旧协议，旧 launcher 数据无法复用。

**解决**：
- 明确决策：旧 launcher 数据直接丢弃，新系统不提供兼容层
- 用户需要用新的蓝图编辑器重新编排工作流
- Git 备份确保可以回退

### 5.3 Stage gate toggle UI 交互实现

**问题**：连接线上的 gate 小图标需要正确显示和切换，但直接渲染会导致连线被遮挡。

**解决**：
- 使用 Icon 组件（🔒/➡️）
- CSS 使用 clip-path 分割连线上下两段
- 小图标按钮背景透明，与连线重叠时使用高 z-index

### 5.4 closing stage 自动追加机制

**问题**：如何确保所有蓝图末尾都有 closing stage，且用户无法删除。

**解决**：
- Store 中 appendClosingStage 函数保证蓝图创建/加载时末尾有一个 isClosing=true 的 stage
- UI 编辑器检查 isClosing 标志，灰显删除按钮和移动按钮
- 连接到 closing stage 的线不显示 gate 开关（因为 closing 出口直接到 awaiting-user）

---

## 6. Pending Tasks and Next Steps

### 6.1 已完成工作

✅ **协议、Daemon、Store 全栈编码完成**
- 所有关键文件编译通过，0 TypeScript errors
- Grep 验证旧字段彻底删除

✅ **UI 蓝图编辑器核心改造完成**
- 支持新字段编辑（templateId / promptOverride / skillRefs / exitGateEnabled）
- closing stage 不可删不可移
- 模板下拉菜单集成

✅ **Stage gate toggle 交互实现**
- Icon 组件渲染（🔒/➡️）
- CSS 样式定位和 z-index 管理
- 点击切换 exitGateEnabled 状态

### 6.2 尚未完成（下一阶段）

⏳ **运行时行为验证**
- 启动 Tauri dev 和 daemon，测试工作流端到端运行
- 验证三角色循环、CEO 防御锁、stage 切换、closing 阶段是否正常
- 测试 stage gate toggle UI 交互

⏳ **UI 视觉细节**
- closing stage 卡片渲染（🏁 图标、灰底、不可删不可移）
- stage 卡片徽标刷新（当前阶段名 + 提交计数）
- 蓝图下拉菜单 UI 美化（图标、描述文本）

⏳ **错误处理和边界情况**
- stage 无法推进时的告警机制
- closing 阶段 CEO 超时回退
- 蓝图编辑时的校验（至少 1 个 enabled stage 等）

⏳ **文档和测试**
- 更新架构设计文档（MLC_MLRA架构设计文档.md）反映新的 stage 系统
- 编写技能文档（skill_expert.md / skill_inspector.md / skill_ceo.md）引导三角色行为
- E2E 测试用例（蓝图编排、工作流执行、防御锁、closing 阶段）

### 6.3 具体下一步（优先级顺序）

1. **启动 Tauri dev 并链接 daemon**
   - `cd e:/Dev/my-last-feedback/app && npm run tauri dev`
   - 启动后端 daemon：`node mcp/mlra/daemon/index.mjs`
   - 观察控制台错误和日志

2. **测试单个工作流端到端**
   - UI 编排一份简单蓝图（2-3 个 stage + closing）
   - 启动工作流
   - 验证三角色消息流、CEO gate、stage 切换、closing 汇总

3. **验证 stage gate toggle 交互**
   - 在蓝图编辑器中点击连接线上的 🔒/➡️ 图标
   - 确认切换生效，exitGateEnabled 状态保存正确

4. **UI 视觉收口**
   - closing stage 卡片特殊渲染
   - 阶段徽标（当前 stage.name + submitCount）
   - 连接线重绘（gate 图标正确位置）

5. **写文档和测试**
   - 更新 MLRA 架构文档，加入新的 stage 系统描述
   - 编写 skill 文档指导三角色工具使用
   - 添加单元测试（orchestrator 逻辑）和 E2E 测试

---

## 附录：关键决策回顾

| 决策 | 选项 | 确认 | 理由 |
|---|---|---|---|
| **Q1: gate 事件命名** | MLRA_STAGE_CHANGE | ✅ | 与 MLRA_PHASE_CHANGE 同构风格，表意准确 |
| **Q2: 防御锁注释** | Defensive gate step 1/2/3 | ✅ | 明确区分防御锁三步和 stage phase 概念 |
| **Q3: 旧 launcher 兼容** | 直接丢弃 | ✅ | 一刀切零兼容，用户用新编辑器重编 |
| **Q4: inspector.passed 删除** | 完全删除，纯反馈内容 | ✅ | 解耦 inspector 反馈和 stage 推进逻辑 |
| **Q5: expert.type 删除** | 完全删除 | ✅ | 行为差异由 prompt 决定，不由 type 枚举决定 |
| **Q6: exitGateEnabled** | 可编排布尔，UI 连线上切换 | ✅ | 灵活决定每个 stage 是否需要 CEO 防御锁 |
| **Q7: 预置模板** | JSON 文件，mcp_prompts/stage_templates/ | ✅ | 易于扩展，UI 读取生成下拉菜单 |
| **Q8: closing stage** | 系统自动追加，不可删，CEO 独角戏 | ✅ | 保证工作流有终止点和汇总阶段 |
