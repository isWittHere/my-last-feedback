---
title: MLRA 蓝图任务库与单执行器解耦规划书
description: 规划蓝图任务可随时保存，编排器保持单任务执行
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLRA
  - BlueprintTask
  - orchestration
  - task-library
  - planning
solved_lists:
  - 明确蓝图任务列表与编排执行过程完全独立
  - 明确运行中只能保存新蓝图任务不能启动
  - 明确开始按钮新增无已经在运行的任务条件
---

# MLRA 蓝图任务库与单执行器解耦规划书

最后更新：2026-04-26

## 1. 背景

当前 MLRA 已经从早期的多 Launcher 心智，逐步收敛为单 Orchestrator 编排模型。daemon 内部只有一个 Orchestrator，Expert、Inspector、CEO 角色连接也是按 role 单例绑定。因此同一时间只允许一个编排任务处于运行态。

但是，用户仍然需要在任意时间进行规划：即使当前已有任务正在运行，也希望可以创建新的蓝图任务、编辑任务描述、配置阶段、调整接管策略，并保存下来，等当前运行结束后再启动。

因此，需要引入一个新的产品机制：蓝图任务库。

蓝图任务库负责用户的规划资产管理；单执行器负责当前运行过程。两者必须完全独立。

## 2. 核心结论

新的产品模型应为：

```text
Blueprint Task Library + Single Active Orchestrator
```

中文心智为：

```text
蓝图任务库 + 单运行编排器
```

这意味着：

- 用户可以随时创建、编辑、保存多个蓝图任务。
- 保存蓝图任务不会触发 daemon。
- 编排器同一时间只能运行一个任务。
- 当前有运行任务时，任何蓝图任务都只能保存，不能开始。
- 开始按钮需要新增启动条件：`无已经在运行的任务`。
- 开始执行时，从蓝图任务生成运行快照，之后运行态不再受任务库编辑影响。

## 3. 当前问题

### 3.1 Launcher 概念混合了两种东西

当前 `Launcher` 数据结构同时包含：

- 配置数据：任务描述、blueprint、orchestrationPolicy。
- 运行数据：status、startedAt、roundHistory、humanGate、ceoGate、stageExitPending、blueprintRuntime。

这种混合在早期可用，但随着产品心智变清晰，它会带来维护问题：

- 保存蓝图和启动执行边界不清。
- 运行中编辑蓝图可能被误解为修改当前 runtime。
- 旧 Launcher 管理心智容易误导用户以为可以并行运行多个编排。

### 3.2 当前蓝图页面天然适合作为任务编辑器

当前蓝图设计页面已经具备：

- 蓝图模板选择。
- 任务描述编辑。
- 接管策略配置。
- 阶段编排。
- 阶段 prompt / rule / skill 编辑。
- 启动条件检查。

因此不需要再做一个独立的“下一任务草稿区”。更好的方向是：让当前蓝图设计页面直接承担蓝图任务编辑器职责。

### 3.3 启动行为必须受单执行器限制

由于 daemon 只有一个 Orchestrator，当前运行任务未结束时，新建任务不应能启动。

这不是 UI 限制，而是架构事实。

因此启动条件必须显式展示：

```text
无已经在运行的任务
```

## 4. 目标

### 4.1 产品目标

- 用户可以随时创建蓝图任务。
- 用户可以随时保存蓝图任务。
- 蓝图任务列表和运行编排过程完全独立。
- 运行中也可以规划下一项任务。
- 运行中不能启动新的任务。
- 启动按钮清楚解释不能启动的原因。

### 4.2 技术目标

- 新增独立的 BlueprintTask 数据模型。
- 将任务库状态与执行器状态分离。
- 启动时从 BlueprintTask 复制运行快照。
- 保存任务不触发 daemon 消息。
- 开始任务才触发 `mlra_start`。

### 4.3 非目标

- 不恢复旧 Launcher 管理面板。
- 不支持多 Orchestrator 并行运行。
- 不让 daemon 热更新当前运行蓝图。
- 第一阶段不强制完成全量 Launcher 类型重命名。

## 5. 概念定义

### 5.1 BlueprintTask

BlueprintTask 是用户保存的规划资产。

它是可编辑、可保存、可复用的任务蓝图，不代表正在运行的编排实例。

建议字段：

```ts
interface BlueprintTask {
  id: string;
  name: string;
  description: string;
  userTask: string;
  taskType: string | null;
  blueprint: WorkflowBlueprint;
  orchestrationPolicy: OrchestrationPolicy;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}
```

### 5.2 ExecutionState

ExecutionState 是当前单执行器的运行状态。

它只描述 daemon 当前或最近一次执行的 runtime。

建议长期字段：

```ts
interface MLRAExecutionState {
  activeTaskId: string | null;
  status: LauncherStatus;
  startedAt: string | null;
  pausedAt: string | null;
  pausedElapsed: number;
  runtimeBlueprintSnapshot: WorkflowBlueprint | null;
  runtimePolicySnapshot: OrchestrationPolicy | null;
  agents: {
    expert: AgentSlot | null;
    inspector: AgentSlot | null;
    ceo: AgentSlot | null;
    workers: WorkerSlot[];
  };
  roundHistory: RoundRecord[];
  sessionPools: Record<string, SessionPool>;
  budget: BudgetStatus | null;
  ceoGate: CeoGateStatus | null;
  humanGate: HumanGateState | null;
  stageExitPending: StageExitPendingSummary | null;
  stageExitReadiness: StageExitReadinessSummary | null;
  blueprintRuntime: BlueprintRuntimeSummary | null;
}
```

### 5.3 运行快照

启动任务时，必须从 BlueprintTask 复制出 runtime snapshot。

运行快照是执行器使用的蓝图，不再跟随任务库编辑变化。

这条边界非常重要。

## 6. 用户流程

### 6.1 无任务运行时

1. 用户进入蓝图任务页面。
2. 创建或选择一个蓝图任务。
3. 编辑任务描述、阶段、策略。
4. 点击保存。
5. 如果所有启动条件满足，开始按钮可用。
6. 用户点击开始。
7. 系统复制当前 BlueprintTask 为 runtime snapshot。
8. daemon 开始执行。

### 6.2 有任务运行时

1. 用户进入蓝图任务页面。
2. 当前运行任务不受影响。
3. 用户创建新蓝图任务或编辑已有蓝图任务。
4. 用户可以点击保存。
5. 开始按钮禁用。
6. 启动条件中显示：`无已经在运行的任务` 未满足。
7. 当前任务结束或取消后，用户可以启动任意已保存蓝图任务。

### 6.3 取消或完成后

1. ExecutionState 进入 `cancelled` 或 `completed`。
2. `无已经在运行的任务` 条件恢复通过。
3. 用户可以选择某个蓝图任务并启动。

## 7. UI 设计

### 7.1 页面命名

推荐名称：

- `蓝图任务`
- `任务蓝图`
- `蓝图库`

不推荐继续使用：

- `Launcher`
- `运行实例`
- `会话管理`

### 7.2 蓝图任务列表

蓝图任务列表负责选择和管理规划资产。

第一阶段可以做轻量列表：

- 新建任务
- 任务名称
- 更新时间
- 是否有未保存修改
- 删除或归档

第二阶段再补充：

- 搜索
- 复制任务
- 分组
- 归档

### 7.3 蓝图编辑器

当前蓝图设计页面继续承担编辑职责。

需要新增或强化：

- 保存按钮。
- 未保存状态提示。
- 当前选中任务名称。
- 运行中提示条：`当前已有任务正在运行，此蓝图任务可保存但不能开始`。

### 7.4 启动条件面板

现有启动条件中新增一项：

```text
无已经在运行的任务
```

当有 active execution 时：

- 开始按钮禁用。
- 条件计数减少。
- hover / popover 中显示该项未通过。

### 7.5 保存按钮与开始按钮

保存按钮：

- 只保存 BlueprintTask。
- 运行中仍可用。
- 不触发 daemon。

开始按钮：

- 只有所有启动条件满足时可用。
- 会触发 daemon。
- 会创建 runtime snapshot。

## 8. Store 设计

### 8.1 第一阶段最小 Store 结构

可以在现有 `mlraStore.ts` 中新增：

```ts
blueprintTasks: BlueprintTask[];
activeBlueprintTaskId: string | null;
dirtyBlueprintTaskIds: string[];
```

新增 actions：

```ts
createBlueprintTask(name?: string): string;
selectBlueprintTask(id: string): void;
updateBlueprintTask(id: string, patch: Partial<BlueprintTask>): void;
saveBlueprintTask(id: string): void;
deleteBlueprintTask(id: string): void;
duplicateBlueprintTask(id: string): string;
startBlueprintTask(id: string): void;
hasActiveExecution(): boolean;
```

### 8.2 过渡期兼容策略

当前代码大量依赖 `Launcher` 作为 active runtime 容器。

第一阶段不建议立即删除 Launcher 类型。

建议过渡策略：

- `BlueprintTask` 承担新任务库。
- 现有 active launcher 暂时作为 execution runtime 容器。
- `startBlueprintTask(id)` 将 BlueprintTask 内容复制到 active runtime 容器，再调用 daemon start。
- 后续第三阶段再拆除 Launcher 命名。

### 8.3 长期清理方向

长期目标是替换：

```ts
launchers: Launcher[]
activeLauncherId: string | null
```

为：

```ts
blueprintTasks: BlueprintTask[]
activeBlueprintTaskId: string | null
execution: MLRAExecutionState
```

## 9. 启动逻辑

### 9.1 hasActiveExecution

判断逻辑：

```ts
function hasActiveExecution(status: LauncherStatus): boolean {
  return status === "running" || status === "paused" || status === "awaiting-user";
}
```

### 9.2 getStartConditions 增加运行条件

当前 `getStartConditions(blueprint, taskText)` 应扩展为：

```ts
function getStartConditions(
  blueprint: WorkflowBlueprint,
  taskText: string,
  hasActiveExecution: boolean,
): StartCondition[]
```

新增条件：

```ts
{
  id: "no-active-execution",
  label: "无已经在运行的任务",
  passed: !hasActiveExecution,
}
```

### 9.3 startBlueprintTask

伪代码：

```ts
startBlueprintTask: (taskId) => {
  if (get().hasActiveExecution()) return;
  const task = get().blueprintTasks.find((item) => item.id === taskId);
  if (!task) return;
  const errors = validateBlueprintTask(task);
  if (errors.length > 0) return;

  const blueprintSnapshot = structuredClone(task.blueprint);
  const policySnapshot = structuredClone(task.orchestrationPolicy);

  get().daemonStartOrchestration(
    task.id,
    task.userTask || task.blueprint.initialTask || task.name,
    task.taskType,
    blueprintSnapshot,
    policySnapshot,
  );

  setExecutionFromTaskSnapshot(task, blueprintSnapshot, policySnapshot);
}
```

## 10. 保存逻辑

### 10.1 saveBlueprintTask

保存只更新任务库：

```ts
saveBlueprintTask: (taskId) => {
  set((state) => ({
    blueprintTasks: state.blueprintTasks.map((task) =>
      task.id === taskId
        ? { ...task, updatedAt: new Date().toISOString() }
        : task
    ),
    dirtyBlueprintTaskIds: state.dirtyBlueprintTaskIds.filter((id) => id !== taskId),
  }));
}
```

保存不应调用：

- `daemonStartOrchestration`
- `daemonSetOrchestrationPolicy`
- `sendToDaemon`

### 10.2 自动保存还是手动保存

第一阶段建议手动保存。

原因：

- 用户明确提出“仅能点击保存按钮，但是无法开始”。
- 手动保存更容易表达任务库和执行器解耦。
- 自动保存可能让用户误以为修改影响当前运行。

## 11. 与当前停止功能的关系

当前停止功能已经使运行态进入 `cancelled`，并允许回到蓝图面板重新开始。

新模型下：

- 停止只影响 ExecutionState。
- 不影响 BlueprintTask。
- 停止后 `无已经在运行的任务` 条件恢复通过。
- 用户可以启动原任务，也可以启动另一个已保存任务。

## 12. 风险分析

### 12.1 保存误污染当前运行

风险：运行中编辑并保存任务 B，却影响当前运行任务 A。

缓解：启动时使用 runtime snapshot，运行中不引用 BlueprintTask 对象。

### 12.2 用户误以为保存等于开始

风险：运行中保存新任务后，以为系统已经切到新任务。

缓解：明确按钮文案和状态提示。

### 12.3 过渡期 Launcher 命名混乱

风险：内部仍叫 Launcher，UI 已叫 BlueprintTask。

缓解：第一阶段保持代码兼容，第二或第三阶段做命名清理。

### 12.4 启动条件只在 UI 禁用，store 未防守

风险：其他调用路径绕过 UI 直接 start。

缓解：`startBlueprintTask` 和 store action 内必须也检查 `hasActiveExecution()`。

## 13. 测试计划

### 13.1 无运行任务

- 新建蓝图任务。
- 编辑任务描述。
- 保存。
- 启动条件全部通过。
- 点击开始后 daemon 启动。

### 13.2 有运行任务

- 当前任务运行中。
- 新建另一个蓝图任务。
- 保存按钮可用。
- 开始按钮禁用。
- 启动条件显示 `无已经在运行的任务` 未通过。
- 保存不发送 daemon 消息。

### 13.3 运行中编辑已保存任务

- 当前任务 A 运行中。
- 打开任务 B。
- 修改并保存 B。
- 当前 runtime 仍是 A。
- A 的 roundHistory、currentStage、humanGate 不受影响。

### 13.4 取消后启动新任务

- 当前任务 A 运行中。
- 保存任务 B。
- 停止 A。
- 启动条件恢复通过。
- 启动 B。
- daemon 使用 B 的 blueprint snapshot。

### 13.5 完成后启动新任务

- 当前任务完成。
- 选择另一个蓝图任务。
- 点击开始。
- roundHistory 清空，runtime 使用新快照。

## 14. 实施阶段

### 第一阶段：最小闭环

- 新增 BlueprintTask 数据模型。
- 新增 blueprintTasks / activeBlueprintTaskId state。
- 当前蓝图页改为编辑 selected BlueprintTask。
- 新增保存按钮。
- 开始按钮新增 `无已经在运行的任务` 条件。
- start 时复制 task 到 runtime。

### 第二阶段：任务列表体验

- 增加蓝图任务列表 UI。
- 支持新建、切换、重命名、删除或归档。
- 支持复制任务。
- 显示更新时间和未保存状态。

### 第三阶段：内部模型清理

- 拆分 Launcher 混合模型。
- 将 runtime 独立为 ExecutionState。
- 将 UI 和 store 命名统一到 BlueprintTask。

## 15. 最终建议

建议立即按第一阶段推进。

第一阶段可以在不重构 daemon 的前提下实现关键产品能力：

- 用户随时创建并保存蓝图任务。
- 运行中不能开始新任务。
- 保存和开始彻底解耦。
- 单 Orchestrator 架构不被破坏。

旧 Launcher 面板不应恢复。蓝图任务库才是后续正确方向。
