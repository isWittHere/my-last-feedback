---
title: MLRA 三角色 + 通用阶段流程系统重构规划（零兼容一刀切版）
description: 彻底移除 phase/startMode/4 槽，重建为三角色（expert/inspector/ceo）固定身份 + 通用 stage 流水线 + closing 特殊结束阶段。无兼容层，无 shim，单批次推平。
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - MLRA
    - refactor
    - no-compat
    - stage-flow
    - three-roles
solved_lists: []
---

# MLRA 三角色 + 通用阶段流程系统重构规划

> **基准约束**：零兼容、零 shim、零 fallback。单批次推平，过程中 TypeScript 会全红，最后一步才绿。不保留旧 launcher 持久化数据。

---

## 1. 背景

当前 MLRA v2 运行时与旧 v1 四槽模型存在长期语义错配：

- 旧模型将协作过程强行二分为 `planning` / `execution`（phase），并以此衍生出 4 个角色槽（planning-expert/inspector、execution-expert/inspector）。
- 过去几轮重构只加了别名层（collaborationMode / entryStrategy / stageStrategy / launchStrategy），真正的主状态仍是 phase + startMode，UI / protocol / orchestrator / store 四层持续发生语义漂移。
- 用户最终明确方向：**角色固定为 3 个（expert / inspector / ceo），协作节奏由用户编排的任意多个 stage 决定，不再二分阶段**。

本规划为此收敛一次性的**一刀切**改造方案。

---

## 2. 目标（用户原话收敛）

1. 彻底改为 **3 角色体系**：`expert` / `inspector` / `ceo`（`worker` 为 expert 动态召唤的子角色，不属主三角色）。
2. `phase` / `startMode` / `PhaseView` / `StartMode` / `PHASES` / `START_MODES` / `planning-*` / `execution-*` / `stageStrategy` / `launchStrategy` 全部**源码级删除**，不保留别名、不保留读兼容、不保留 fallback。
3. 唯一事实来源 = **Stage 流水线**：
    - 蓝图 = 有序 `stages[]`（末尾固定一个特殊 `closing` stage）
    - 每个 stage 就是一个**通用协作单元**，走同一套引擎
    - 预置 3 个 stage 模板（`deliberation` / `delivery` / `closing`）以 JSON 提供，用户编排时可选用也可空白新建
4. Gate（CEO 防御锁）= **通用出口机制**，每个 stage 出口是否走 gate 由该 stage 的 `exitGateEnabled` 决定，用户在蓝图编排的连线 UI 上点击小图标即可切换。
5. 结束阶段 `closing` **固定位于蓝图末尾**，不可删、不可移、不可重排：CEO 独角戏完成全流程汇总，然后调用阻塞工具等待用户响应。
6. 零兼容：旧 launcher 持久化数据一律**直接丢弃**。

---

## 3. 角色与工具（最终协议）

### 3.1 三角色固定身份

| 角色 | 身份语义 | 非 closing stage | closing stage |
|---|---|---|---|
| `expert` | 产出方 / 操刀者 | 全 stage 在线，主导提交 | 休眠，不接收消息 |
| `inspector` | 审查方 / 把关者 | 全 stage 在线，反馈提交 | 休眠，不接收消息 |
| `ceo` | 裁决方 / 防御锁守门人 | 常驻 standby，仅 gate 唤醒 | 独角戏汇总并阻塞等待用户 |
| `worker` | expert 动态召唤的子角色 | 按需 | 不涉及 |

**关键**：`expert` 和 `inspector` 在全生命周期是**同一个人**，不因 stage 类型变化而换槽。

### 3.2 工具最终集

**Expert**
```
expert_submit({ content: string, progress?: string })
expert_vote({ vote: "pass" | "reject", reason: string })
```
- 删除 `type` 字段（原 `"plan_draft" | "phase_complete"` 整个废除）
- `progress` 保留为**可选自由文本**，Expert 想写就写（例如 `"草稿 v3"` / `"Cycle 2/4"`）

**Inspector**
```
inspector_submit({ content: string })
inspector_vote({ vote: "pass" | "reject", reason: string })
```
- 删除 `passed` 字段（原 boolean 整个废除）
- `inspector_submit` 统一路由回 Expert，orchestrator 不判断语义

**CEO**
```
ceo_verdict({ verdict, reason, targets? })
```
- **不新增工具**。CEO 在 closing stage 的汇总通过 skill 引导产出文档，不需要额外上报系统。

---

## 4. Stage 流水线（最终形态）

### 4.1 Stage 通用引擎（适用所有非 closing stage）

```
进入 stage
  │
  ▼
Expert 产出 ── expert_submit(content) ──▶ orchestrator 路由给 Inspector
                                              │
                                              ▼
Inspector 反馈 ── inspector_submit(content) ──▶ orchestrator 路由给 Expert
                                              │
                                              ▼
（反复无限次，只做 submitCount 计数，不做防御拦截）
  │
  │ 任何一方觉得可以收尾：expert_vote(pass) / inspector_vote(pass)
  ▼
双方都 vote=pass → 触发 stage 出口
  │
  ├─ stage.exitGateEnabled=true  → CEO 防御锁（强制复审 + 连续确认） → _advanceStage
  └─ stage.exitGateEnabled=false → 直接 _advanceStage
```

关键规则：
- 内循环次数**无上限**，仅 `submitCount++` 用于 UI 展示和停滞告警（现有停滞检测逻辑保留但统一按 `submitCount` 计）
- `inspector_submit` 不带 `passed`，orchestrator 不分支，统一路由回 Expert
- 任一方在循环中的任何时刻都可 `*_vote(pass)`；只有双方都投 pass 才开门
- 任一方 `*_vote(reject)` 重置投票，循环继续

### 4.2 closing stage（CEO 独角戏）

```
_advanceStage 前检查：下一 stage.isClosing === true ?
  │
  ▼
orchestrator 仅给 CEO 发 initial prompt（引用 closing.json 的 skillRefs）
Expert / Inspector 本 stage 完全不收消息
  │
  ▼
CEO 按 skill 指导产出：
  - 全流程摘要
  - 代码仓库现状
  - 交付物清单
  │
  ▼
CEO 调用阻塞工具（interactive_feedback）
  │
  ▼
launcher 状态 → "awaiting-user"（永久阻塞等用户响应）
```

关键规则：
- closing stage 的 `exitGateEnabled` 固定为 `false`（UI 连线上不显示 gate 图标，概念上它之前的 stage 的 gate 就是"进入 closing"的关口）
- closing stage 不接受 `expert_submit` / `inspector_submit` / `expert_vote` / `inspector_vote`，orchestrator 收到即丢弃并告警
- closing stage 无出口（是蓝图终点）

### 4.3 Gate（通用出口机制）

每个 stage 出口 gate 完全同构：

```
CEO 收到 gate 触发事件 → ceo_verdict(...)
  │
  ├─ 首次 approved → 触发防御锁（defensive gate step 1），强制打回 expert+inspector 再审
  ├─ 第二次 approved → defensive gate step 2，仍需连续两次确认
  └─ 防御锁机制满足（连续两次双 pass + approved）→ step 3，gate 真正通过
  │
  ▼
_advanceStage → 下一个 stage
```

- 所有 gate 走同一套防御锁，无特殊分支
- 防御锁的 "Phase 1/2/3" 源码注释重命名为 "Defensive gate step 1/2/3"（彻底避开 phase 术语）

### 4.4 启动

- Launcher 启动时 `_selectStartStage(blueprint)` 永远返回 `stages[0]`（第一个 `enabled=true` 且 `isClosing=false` 的 stage）
- **不存在**跳过前置 stage 的启动策略。用户如需"直接进入交付"，只需编排一份前置 stage 全为 `delivery` 模板或空白 stage 的蓝图

---

## 5. 数据结构（目标态）

### 5.1 TypeScript 类型

```ts
export type RuntimeMainRole = "expert" | "inspector" | "ceo";
export type AssignableRole  = RuntimeMainRole | "worker";

export interface StageBlueprint {
  id: string;
  name: string;                       // 用户可编辑
  description?: string;
  icon?: string;
  order: number;
  enabled: boolean;
  templateId?: "deliberation" | "delivery" | "closing" | string;  // 仅溯源
  promptOverride?: string;            // 用户自定义 prompt，空则用模板默认
  skillRefs?: string[];               // 该 stage 引用的 skill 文件
  exitGateEnabled: boolean;           // 出口是否走 CEO 防御锁，默认 true
  isClosing?: boolean;                // closing stage 固定 true，其它 stage 不设
}

export interface WorkflowBlueprint {
  name: string;
  description?: string;
  initialTask: string;
  stages: StageBlueprint[];           // 末尾必含 isClosing=true 的 stage
  // 无 launchStrategy 字段
}

export interface Launcher {
  id: string;
  name: string;
  status: "configuring" | "running" | "paused" | "completed" | "awaiting-user";
  controlMode: ...;
  taskType: string | null;
  userTask: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  pausedAt: string | null;
  pausedElapsed: number;
  registeredAgents: RegisteredAgent[];
  agents: {
    expert: AgentSlot | null;
    inspector: AgentSlot | null;
    ceo: AgentSlot | null;
    workers: WorkerSlot[];
  };
  sessionPools: {
    expert?: SessionPool;
    inspector?: SessionPool;
    ceo?: SessionPool;
  };
  roundHistory: Round[];
  budget: BudgetState | null;
  ceoGate: CeoGateState | null;
  blueprint: WorkflowBlueprint;
  blueprintRuntime: {
    currentStageId: string | null;
    submitCount: number;              // 当前 stage 内累计提交次数，进新 stage 归零
    stages: Array<{
      id: string;
      name: string;
      status: "pending" | "active" | "completed";
    }>;
  } | null;
  blueprintDirty: boolean;
  selectedStageId: string | null;
  lastProgress?: string;
  // 删除 currentPhase / startMode / planningSessionIds / implementationSessionIds
}
```

### 5.2 已删除的类型（断绝历史）

- `PhaseView` / `StartMode`
- `StageStrategy` / `LaunchStrategy`
- `AgentRole` 中 `planning-expert` / `planning-inspector` / `execution-expert` / `execution-inspector`
- `RuntimeStageBlueprint.phaseType`
- `RuntimeWorkflowBlueprint.startMode`

### 5.3 IPC 协议（最终）

```jsonc
// 启动
{ "type": "mlra_start",
  "config": {
    "launcherId": "...",
    "userTask": "...",
    "taskType": null,
    "blueprint": { /* WorkflowBlueprint 含 stages (末尾含 closing) */ }
  }
}

// Stage 切换（原 mlra_phase_change 重命名为 mlra_stage_change）
{ "type": "mlra_stage_change",
  "launcherId": "...",
  "stageFrom": { "id": "...", "name": "...", "isClosing": false },
  "stageTo":   { "id": "...", "name": "...", "isClosing": false }
}

// 任务完成（CEO 进入 awaiting-user）
{ "type": "mlra_orchestration_status",
  "launcherId": "...",
  "state": { "status": "awaiting-user", ... }
}
```

---

## 6. 预置 Stage 模板（JSON）

目录：`mcp_prompts/stage_templates/`

### 6.1 `deliberation.json`

```json
{
  "id": "deliberation",
  "name": "论证评审",
  "description": "方案反复打磨，Expert 产出草案、Inspector 审查反馈，循环推敲直到双方满意。",
  "icon": "git-branch",
  "defaultExitGateEnabled": true,
  "promptExpert": "...（从现有 prompts.mjs 的 deliberation Expert 文案搬来）...",
  "promptInspector": "...（同上）...",
  "skillRefs": [
    "submit_plan_draft",
    "re_verify",
    "decision_levels",
    "hallucination_check"
  ]
}
```

### 6.2 `delivery.json`

```json
{
  "id": "delivery",
  "name": "交付验证",
  "description": "真刀真枪落地实施，Expert 按循环交付、Inspector 审查每次交付成果。",
  "icon": "wrench",
  "defaultExitGateEnabled": true,
  "promptExpert": "...（从现有 prompts.mjs 的 delivery Expert 文案搬来）...",
  "promptInspector": "...（同上）...",
  "skillRefs": [
    "submit_phase_report",
    "re_verify",
    "decision_levels",
    "hallucination_check"
  ]
}
```

### 6.3 `closing.json`

```json
{
  "id": "closing",
  "name": "结束汇总",
  "description": "CEO 独角戏：全流程摘要、代码仓库现状、交付物清单，完成后阻塞等用户响应。",
  "icon": "flag",
  "defaultExitGateEnabled": false,
  "isClosing": true,
  "promptCeo": "...（引导 CEO 调用汇总 skill 产出文档，结束后调用阻塞工具）...",
  "skillRefs": [
    "summary_report",
    "repo_snapshot"
  ]
}
```

> `skillRefs` 指向 `mcp_prompts/` 下现有或新增的 skill md 文件。`summary_report.md` / `repo_snapshot.md` 若尚无需新建。

### 6.4 模板字段规约

- 所有模板 JSON 都有 `id` / `name` / `description` / `icon` / `defaultExitGateEnabled` / `skillRefs` 字段
- 非 closing 模板带 `promptExpert` + `promptInspector`
- closing 模板带 `promptCeo` + `isClosing: true`
- 用户新建 stage 时若"从模板创建"，这些字段被拷入 StageBlueprint；若"空白新建"，所有字段默认值

---

## 7. 改造文件清单

### 7.1 新建（3 个 JSON + 可能的 2 个 skill md）

- `mcp_prompts/stage_templates/deliberation.json`
- `mcp_prompts/stage_templates/delivery.json`
- `mcp_prompts/stage_templates/closing.json`
- `mcp_prompts/summary_report.md`（若无则新建）
- `mcp_prompts/repo_snapshot.md`（若无则新建）

### 7.2 协议层重写

| 文件 | 关键动作 |
|---|---|
| `mcp/mlra/protocol/roles.mjs` | 删 `PHASES` / `START_MODES` / `REQUIRED_ROLES_BY_START_MODE`；新增 `REQUIRED_ROLES = [CEO, EXPERT, INSPECTOR]` |
| `mcp/mlra/protocol/messages.mjs` | 重命名 `MLRA_PHASE_CHANGE` → `MLRA_STAGE_CHANGE`（值 `"mlra_phase_change"` → `"mlra_stage_change"`）；`EXPERT_SUBMIT` 载荷 JSDoc 去掉 type 枚举；`INSPECTOR_SUBMIT` 载荷去 passed |
| `mcp/mlra/protocol/prompts.mjs` | 删 `import { PHASES }` / `describeCollaborationMode`；`buildInitialPrompt(role, userTask, stage, options)` 新签名直接吃 stage 对象；`buildRoutingHint(role, stage)` / `buildRoutingPrompt(src, tgt, stage, ctx)` 同；ROUTING_TEMPLATES 不再按 `:deliberation/:delivery` 拆 key，改为通用 + stage-prompt 注入；术语 Phase/phase → Stage/stage |

### 7.3 MCP 服务端

| 文件 | 关键动作 |
|---|---|
| `mcp/mlra/servers/mcp-expert.mjs` | `expert_submit` zod schema 删 `type` 字段、保留 `content` + 可选 `progress`；docstring Phase→Stage |
| `mcp/mlra/servers/mcp-inspector.mjs` | `inspector_submit` zod schema 删 `passed` 字段、只留 `content`；docstring Phase→Stage |
| `mcp/mlra/servers/mcp-ceo.mjs` | 工具不变（`ceo_verdict`）；docstring Phase→Stage |

### 7.4 Orchestrator

`mcp/mlra/daemon/orchestrator.mjs`

- **删除**
    - `this.phase` / `this.startMode` 字段与 getter/setter
    - `COLLABORATION_MODES` / `ENTRY_STRATEGIES` 映射常量（改为独立字面量）
    - `_isDeliveryMode` / `_isDeliveryFirstEntry` / `_isDeliveryStage`
    - `_setCollaborationMode` / `describeCollaborationMode` / `describeEntryStrategy`
    - `EXPERT_SUBMIT_TYPES` 常量
    - Inspector 处理分支中 "delivery 时 passed=true 推进 cycle" 的整段代码
    - `_advancePhase` → 重命名 `_advanceStage`
    - `transitionToExecution` → 重命名 `transitionToNextStage`
    - `toJSON` 删 `phase` / `startMode` 两行

- **新增**
    - `this.currentStageId`（现有，保留）
    - `this.submitCount`（每次 `expert_submit` / `inspector_submit` ++；进新 stage 归零）
    - `_loadStagePrompt(stage)`：读 `stage.templateId` → json → 覆盖 `stage.promptOverride` → 合成最终 prompt
    - `_isClosingStage(stage)`：判断 `stage.isClosing === true`
    - closing stage 专用分支：进入 closing stage 时只给 CEO 发 initial prompt，不路由给 expert/inspector

- **改写**
    - `startOrchestration(userTask, blueprint, taskType)` —— 不再接 `startMode`，从 `blueprint` 决定一切
    - `checkStartReady()` 无参，固定校验 `[CEO, EXPERT, INSPECTOR]` 三角色齐备
    - `_selectStartStage(blueprint)` 永远返回第一个 `enabled=true && !isClosing` 的 stage
    - 提交处理统一：`expert_submit` → 路由 inspector；`inspector_submit` → 路由 expert；closing stage 下丢弃并告警
    - 双 vote=pass → 检查 `stage.exitGateEnabled`：开 → CEO gate；关 → 直接 `_advanceStage`
    - `_advanceStage` 前检查下一 stage 是否 closing：是则切 closing 分支
    - 防御锁注释 Phase 1/2/3 → Defensive gate step 1/2/3

### 7.5 Daemon IPC 桥

`mcp/mlra/daemon/index.mjs`

- `MLRA_START` 处理：`const { userTask, taskType, blueprint, launcherId } = msg.config`；调 `startOrchestration(userTask, blueprint, taskType)`
- 删 `import { START_MODES }`
- `phase_transition` case → `stage_transition` case，转发 `MLRA_STAGE_CHANGE`，载荷 `{ launcherId, stageFrom, stageTo }`
- 清 "Phase 4.2c / 4.2d" 里程碑注释

### 7.6 Store 重写

`app/src/store/mlraStore.ts`

- **类型层删除**
    - `PhaseView` / `StartMode` / `StageStrategy` / `LaunchStrategy`
    - `AgentRole` 中 4 个旧值
    - `RuntimeStageBlueprint.phaseType` / `RuntimeWorkflowBlueprint.startMode`
    - `RuntimeStageBlueprint` / `RuntimeWorkflowBlueprint` 翻译过渡类型整个删除

- **状态层删除**
    - `Launcher.currentPhase` / `Launcher.startMode`
    - `Launcher.agents` 4 槽形态 → 3 槽 + workers
    - `Launcher.sessionPools` 按旧槽 key 形态 → 按新 3 角色 key
    - `Launcher.planningSessionIds` / `implementationSessionIds`
    - 全局 `phaseView` 顶层 state
    - `columnOrder` 默认 4 槽 id → `["expert", "inspector", "ceo", "workers"]`

- **Action 删除**
    - `setPhaseView`
    - `daemonAssignRole`（v1 shim）+ 所有 `mlra_assign_role` 发送点
    - `stageStrategyToPhaseView` / `phaseViewToStageStrategy` / `launchStrategyToStartMode`
    - `resolveRuntimeRoleSlotKey` / `updateAgentsForRuntimeRole` / `RUNTIME_ROLE_SLOT_KEYS`
    - `EMPTY_AGENTS`（4 槽形态）→ `{ expert: null, inspector: null, ceo: null, workers: [] }`
    - `createEmptyAgentSlot` 旧映射（"规划专家 / 规划监察 / 执行专家 / 执行监察"）
    - `ROLE_COLORS` 旧 4 槽 key
    - `STANDBY_MESSAGES` 按 planning/execution 索引部分

- **Action 改写**
    - `assignRole` 的 `AssignableRole` 收窄为 `"expert" | "inspector" | "ceo" | "worker"`
    - `startOrchestration(launcherId, launchStrategy)` → `startOrchestration(launcherId)`（只传 id，blueprint 直接从 launcher 读）
    - `daemonStartOrchestration(launcherId, userTask, taskType?, blueprint?)`：去掉 `startMode` 参数
    - `handleDaemonMessage`：
        - `mlra_orchestration_status` case 只读新字段，删 `state.phase` / `state.startMode` / `l.currentPhase` / `l.startMode` 所有 fallback
        - `mlra_phase_change` case → 重命名为 `mlra_stage_change`，载荷用 `stageFrom`/`stageTo`
    - 预置蓝图模板（4 个）全改：删 `launchStrategy` + `stageStrategy`；新增 `templateId` + `exitGateEnabled`；末尾自动追加 `closing` stage

- **Helper 新增**
    - `appendClosingStage(blueprint)`：创建蓝图时自动追加一个 `isClosing: true` 的 stage
    - `isClosingStage(stage)`：纯函数判断
    - `loadStageTemplates()`：读 `mcp_prompts/stage_templates/*.json`（或启动时从 daemon 获取）

### 7.7 UI 组件

| 文件 | 关键动作 |
|---|---|
| `app/src/components/PhaseToggle.tsx` | **整文件删除** |
| `app/src/components/FeedbackApp.tsx` | 删 PhaseToggle 导入与渲染；Row 2 改只读徽标 "当前阶段：{stage.name} · 提交 {submitCount} 次"；`ROLE_LABEL_MAP` 删 4 个旧 key |
| `app/src/components/AgentColumn.tsx` | 删 `phaseView` 读取与 `resolveRuntimeRoleSlotKey` 调用；slot/pool 直接读 `launcher.agents[role]` / `launcher.sessionPools[role]`；`STANDBY_MESSAGES` 索引由 phaseView 改为通用 |
| `app/src/components/MLRACallerTabs.tsx` | 删 `phaseView`；tab 颜色 `ROLE_COLORS[role]`（3 固定 key）；slot 直接 `launcher.agents[role]` |
| `app/src/components/LauncherSidebar.tsx` | 删 `PHASE_LABELS`；`launcher.currentPhase` → `launcher.blueprintRuntime?.currentStage?.name`；Expert/Inspector 存在性直接 `launcher.agents.expert` / `.inspector` |
| `app/src/components/LauncherHomeNodeWorkbench.tsx` | "新建 stage" 改下拉菜单：`从论证评审 / 从交付验证 / 空白`（读模板 json）；创建蓝图时自动调 `appendClosingStage`；closing stage 卡片渲染为灰底、🏁 图标、禁用拖动和删除按钮；两张 stage 卡片之间的连接线中点加 🔒/➡️ 小图标（`exitGateEnabled` 切换），点击改写 blueprint；closing stage 前的连接线不显示开关（固定显示为"结束关"） |

### 7.8 CSS / 样式

`app/src/index.css`

- 删注释 "MLRA Phase 3 — PhaseToggle…" 和 "Light theme overrides — PhaseToggle & Title bar"
- 删 `.phase-toggle` 相关样式
- 新增连线小图标（`.stage-connector`、`.stage-gate-toggle`）样式
- 新增 closing stage 卡片（`.stage-card--closing`）样式

### 7.9 文档

- 新建 `.myLastChat/MLC_K_MLRA_3角色阶段流程.md` —— 知识文档，描述新模型
- 旧文档（`MLC_MLRA_UI交互规格文档.md` 等）**不动**，作为历史保留
- `README.md` / `README_zh.md` 本次**不更新**，留到稳定后再改

---

## 8. 执行顺序（一刀切单 PR）

> 过程中 TS 会全红。不拆步提交。

1. **新建 3 个 stage_templates JSON**（独立无依赖）
2. **协议层**：`roles.mjs` / `messages.mjs` / `prompts.mjs`
3. **MCP servers**：`mcp-expert.mjs` / `mcp-inspector.mjs` / `mcp-ceo.mjs`（schema 与 docstring）
4. **Orchestrator**：`orchestrator.mjs` 统一引擎 + closing 分支
5. **Daemon IPC**：`daemon/index.mjs`
6. **Store 重写**：`app/src/store/mlraStore.ts`
7. **UI 组件**：5 个组件批量改 + 删 PhaseToggle + 加连线 gate 按钮 + 加 closing 卡片 + 改模板下拉
8. **CSS 清理与新增**
9. **新建知识文档**
10. **验收**：
    - 全仓 grep 零命中（见 §9）
    - `get_errors` 全绿
    - `app/`: `npm run build`
    - `mcp/`: 关键 mjs 文件 `node --check`
    - 启动 dev，手动冒烟：创建 launcher → 注册 3 角色 → 启动 → 走通 1 个非 closing stage → 进入 closing → CEO 阻塞

---

## 9. 验收标准（grep 零命中表）

排除路径：`.myLastChat/` / `dist/` / `e2e-test.log` / `ref-repos/` / `app/dist/`

| 关键字 | 说明 |
|---|---|
| `PhaseView` / `phaseView` / `setPhaseView` | 类型 + 顶层 state + action |
| `StartMode` / `startMode` | 旧启动模式 |
| `StageStrategy` / `stageStrategy` | 旧闭集分类 |
| `LaunchStrategy` / `launchStrategy` | 启动策略 |
| `PHASES.` / `START_MODES.` / `REQUIRED_ROLES_BY_START_MODE` | 协议常量 |
| `currentPhase` | Launcher 字段 |
| `phase_transition` / `mlra_phase_change` / `MLRA_PHASE_CHANGE` | 旧事件 |
| `planning-expert` / `planning-inspector` / `execution-expert` / `execution-inspector` | 4 槽 id |
| `planningSessionIds` / `implementationSessionIds` | 旧池 |
| `daemonAssignRole` / `mlra_assign_role` | v1 shim |
| `stageStrategyToPhaseView` / `phaseViewToStageStrategy` / `launchStrategyToStartMode` | 翻译器 |
| `resolveRuntimeRoleSlotKey` / `updateAgentsForRuntimeRole` / `RUNTIME_ROLE_SLOT_KEYS` | 桥接 helper |
| `PhaseToggle` | 组件 |
| `EXPERT_SUBMIT_TYPES` | Expert type 枚举 |
| `"plan_draft"` / `"phase_complete"` / `"stage_complete"`（作为 expert_submit type） | 旧提交类型 |
| `inspector_submit.passed` / `.passed:` 语境为 inspector | 旧审查结果字段 |
| `describeCollaborationMode` / `describeEntryStrategy` | 旧描述函数 |
| `_advancePhase` / `transitionToExecution` | 旧方法名 |

---

## 10. 已确认决策清单

| # | 决策 | 确认 |
|---|---|---|
| 1 | `MLRA_PHASE_CHANGE` 新名：`MLRA_STAGE_CHANGE` | ✅ |
| 2 | 防御锁注释 `Phase 1/2/3` 改为 `Defensive gate step 1/2/3` | ✅ |
| 3 | 旧 launcher 持久化数据直接丢弃 | ✅ |
| 4 | `inspector_submit.passed` 完全删除 | ✅ |
| 5 | `expert_submit.type` 完全删除 | ✅ |
| 6 | `expert_submit.progress` 保留为可选自由文本 | ✅ |
| 7 | 预置模板放 `mcp_prompts/stage_templates/*.json`，UI 下拉选择 | ✅ |
| 8 | stage 出口 gate 可在蓝图编排时开关，UI 连线 🔒/➡️ 小图标 | ✅ |
| 9 | 用户编排的最后一个普通 stage 出口 gate 强制开 | ✅ |
| 10 | closing stage 固定蓝图末尾，不可删/不可移 | ✅ |
| 11 | closing stage 协作方式 = CEO 独角戏 | ✅ |
| 12 | CEO 汇总**不新增工具**，通过 skill 引导产文档 + 调用阻塞工具等用户 | ✅ |
| 13 | closing 完成后 launcher 进入 `awaiting-user`，用户响应发生在 CEO 聊天框 | ✅ |
| 14 | 零兼容、零 shim、单 PR 推平 | ✅ |

---

## 11. 风险与回退

### 风险

- **单 PR 大变更期间，TS 编译全红**：无法中途启动应用验证，必须改完全部 7.2–7.8 才能跑
- **skill md 文件命名混用**：原 `submit_phase_report.md` / `review_phase.md` 仍被引用，重命名为 `submit_stage_report.md` / `review_stage.md` 会造成引用断点 → 由模板 JSON 的 `skillRefs` 字段统一指定，md 文件是否重命名由后续决定，本次先保持原文件名但**在模板 JSON 中以新命名引用并复制一份**
- **UI 连线 gate 按钮的交互细节**：连线中点检测、hover 高亮、点击反馈需要 CSS+JS 配合，若现有编排 UI 没有连线组件要新写
- **closing stage 的 CEO 阻塞语义**：需确认 CEO 当前是否已经有权调用 `interactive_feedback`，若无需新增工具访问

### 回退预案

- 所有改动在 Git 单 PR 中可整单 revert
- 旧 launcher 数据既然丢弃，迁移失败只影响开发环境

---

## 12. 本规划之外的事

以下不在本次改造范围内（后续另议）：

- skill md 文件本身的重写（`submit_plan_draft.md` / `review_phase.md` 等内容）
- `worker` 角色的详细生命周期
- Budget / CEO Gate 状态面板的 UI 美化
- 多 launcher 并行的调度策略
- 用户自定义 stage 模板的保存与分享

---

**规划版本**：v1.0（基于 2026-02 对话共识）  
**状态**：待用户审阅确认后开工
