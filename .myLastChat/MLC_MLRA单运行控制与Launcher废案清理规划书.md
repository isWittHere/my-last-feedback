---
title: MLRA 单运行控制与 Launcher 废案清理规划书
description: 规划移除旧 Launcher 管理面板，补齐中途停止与下一任务草稿设计
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLRA
  - Launcher
  - UI
  - orchestration
  - planning
solved_lists:
  - 明确当前 MLRA 是单运行编排模型
  - 识别旧 Launcher 管理面板的历史包袱
  - 规划中途停止按钮与下一任务草稿区
---

# MLRA 单运行控制与 Launcher 废案清理规划书

最后更新：2026-04-26

## 1. 背景

MLRA 早期的 Launcher 设计隐含了一个产品假设：用户可能同时创建、运行、切换和管理多个 Launcher。因此 UI 中保留了一个 `Launcher 管理` 面板，用于搜索、切换、新建、重命名和删除 Launcher。

随着 MLRA 底层架构演进，这个假设已经失效。当前系统已经变成单运行编排模型：同一时间只有一个 active orchestration，由 daemon 内部唯一的 Orchestrator 管理。Expert、Inspector、CEO 等角色连接也按 role 单例绑定，而不是按 launcher 绑定。

因此，旧 Launcher 管理面板已经不再是运行管理器，而是一个历史遗留面板。继续保留它会造成产品心智混乱，让用户误以为可以并行运行多个 Launcher 或在多个运行实例间自由切换。

本规划书用于确定后续 UI 与状态模型的调整方向：移除废案 Launcher 面板，补齐当前运行态的中途停止能力，并为未来的下一任务草稿区预留清晰设计边界。

## 2. 当前架构事实

### 2.1 Daemon 是单 Orchestrator 模型

在 `mcp/mlra/daemon/index.mjs` 中，`OrchestratorDaemon` 构造函数只创建一个 Orchestrator：

```js
this.orchestrator = new Orchestrator();
```

`MLRA_START` 直接调用这个单例 orchestrator 的 `startOrchestration(...)`。系统没有 `launcherId -> orchestrator` 的 map，也没有多 runtime 调度层。

这意味着 daemon 层天然不支持多个 Launcher 并行运行。

### 2.2 MCP 角色连接也是单例

daemon 的连接表是 `this.connections = new Map()`，key 是 role，例如 `expert`、`inspector`、`ceo`。

代码注释也说明：每个 role 同一时间最多一个连接。

因此角色通道也不是 per-launcher 的会话池，而是当前全局编排实例的角色通道。

### 2.3 前端 Store 虽有 launchers 列表，但运行事件写入 active launcher

`app/src/store/mlraStore.ts` 中仍保留：

```ts
launchers: Launcher[]
activeLauncherId: string | null
```

但大量 daemon event handler 都通过 `get().getActiveLauncher()` 找到当前 active launcher，然后把 daemon 状态写入它。

这在单运行模型下可以接受，但在多运行模型下会造成状态错写。

### 2.4 结论

当前系统不是多 Launcher runtime，而是单 active orchestration。`launchers[]` 更像前端侧的配置记录和历史容器，而不是多个可同时运行的实例。

## 3. 当前 Launcher 管理面板的问题

### 3.1 产品语义错误

旧面板名为 `Launcher 管理`，并提供切换、新建、删除等操作，会暗示用户正在管理多个运行实例。

但真实架构只允许一个 active orchestration。这个 UI 语义与系统能力不一致。

### 3.2 信息架构落后

当前 Launcher 已经包含复杂状态：

- 蓝图与阶段
- 当前阶段 runtime
- 自动化策略
- 人工门控
- 阶段出口认证
- roundHistory 和阶段耗时
- role session pool
- budget / CEO gate / readiness

旧面板仍只展示名称、状态、时间和少量角色信息。它已经无法表达当前 MLRA 的关键状态。

### 3.3 操作模型不安全

旧面板提供切换和删除，但 daemon runtime 不是 per-launcher。运行中切换 active launcher 可能造成 UI 记录与真实 daemon 状态概念混淆。

### 3.4 新建入口过于原始

旧面板通过一个输入框创建 Launcher，但当前创建任务应该围绕 Blueprint Workbench、模板、阶段、策略展开。单独输入名称已经不能覆盖真实配置需求。

## 4. 新产品模型

### 4.1 不再使用 Launcher 管理概念

UI 层不再向用户暴露 `Launcher 管理`。

Launcher 作为内部数据结构可以暂时保留，但不应成为用户可见概念。

### 4.2 当前运行态只关注一个 MLRA

运行态顶部应围绕当前 active orchestration 展示：

- 当前阶段
- 阶段流程 hover 面板
- 计时器与统计面板
- 自动化策略
- 人工阻塞状态
- 中途停止按钮

### 4.3 下一任务草稿是独立概念

如果需要运行中准备下一轮任务，应设计成 `下一任务草稿`，而不是新的 Launcher。

草稿应与当前运行隔离，不写入 daemon，不污染 active launcher。

## 5. 改造目标

### 5.1 必做目标

- 移除旧 Launcher 管理面板入口。
- 移除旧 Launcher 管理面板 UI。
- 清理无引用的 LauncherSidebar 组件和样式。
- 在运行态补充中途停止按钮。
- 使用现有 daemon `MLRA_CANCEL` 能力停止当前编排。

### 5.2 后续目标

- 设计 `下一任务草稿区`。
- 草稿区允许运行中准备下一次任务。
- 当前运行结束或停止后，可使用草稿进入配置页。

### 5.3 非目标

- 本轮不重命名整个 store 的 `Launcher` 类型。
- 本轮不实现完整历史记录系统。
- 本轮不支持多 Orchestrator 并行运行。
- 本轮不改变 daemon 的单 Orchestrator 架构。

## 6. 阶段一：移除废案 Launcher 管理面板

### 6.1 UI 改动

在 `app/src/components/FeedbackApp.tsx` 的 `MLRARow2` 中移除：

- Launcher 管理按钮
- `toggleLauncherSidebar()` 调用
- 与旧侧栏入口相关的 tooltip / title

在 `app/src/components/MLRAView.tsx` 中移除：

- `LauncherSidebar` import
- `launcherSidebarOpen`
- `toggleLauncherSidebar`
- `LauncherSidebar` overlay 渲染

删除：

- `app/src/components/LauncherSidebar.tsx`

清理：

- `app/src/index.css` 中 `.launcher-sidebar-*` 样式块

### 6.2 Store 保留策略

暂时保留 `mlraStore.ts` 中的 Launcher 数据模型和 CRUD 方法。

原因：当前创建、配置、启动流程仍依赖 `Launcher` 作为配置容器。立即重命名或删除会扩大风险。

建议后续再单独做一次数据模型语义清理，把 UI 语义和内部类型逐步收敛。

### 6.3 验收标准

- UI 中不再出现 `Launcher 管理`。
- 运行态顶部不再有旧面板入口。
- 旧侧栏无法打开。
- 代码无未使用 import。
- CSS 无孤立无用样式块。

## 7. 阶段二：新增中途停止按钮

### 7.1 需求定义

用户在 MLRA 运行中必须能够主动停止当前编排。

停止操作应覆盖以下状态：

- `running`
- `paused`
- `awaiting-user`

### 7.2 UI 位置

推荐放在 `MLRARow2` 右侧，靠近阶段指示器和计时器。

推荐顺序：

```text
阶段指示器 -> 计时器 -> 停止按钮
```

原因：停止是运行控制动作，放在最右侧符合工具栏操作习惯，同时不干扰阶段和时间信息阅读。

### 7.3 UI 样式

按钮应低调但明确：

- 默认：透明背景，灰色 icon
- hover：弱红背景或红色文字
- confirm 态：红色边框或红色文本
- icon：可使用 `close`，后续可新增 `square-stop`

不建议使用大块红色按钮，避免运行态顶部过于刺眼。

### 7.4 确认交互

停止操作必须二次确认。

推荐方案：两步按钮确认。

流程：

1. 用户点击停止按钮。
2. 按钮进入确认态，文本或 tooltip 变为 `确认停止`。
3. 3 秒内再次点击才真正取消。
4. 超时、失焦或鼠标移开后恢复默认态。

优点：

- 不需要 modal。
- 不打断当前运行态视线。
- 防误触。

备选方案：确认弹窗。

适用于需要更强风险提示的场景，但本项目当前 UI 更适合轻量确认。

### 7.5 Store 改动

在 `MLRAState` 增加：

```ts
daemonCancelOrchestration: () => void;
```

实现：

```ts
daemonCancelOrchestration: () => {
  get().sendToDaemon({ type: "mlra_cancel" });
}
```

是否乐观更新前端状态需要谨慎。

建议第一版不做复杂乐观更新，等待 daemon `_pushStatus()` 回传。必要时只在按钮上显示短暂 pending 状态。

### 7.6 Daemon 行为

daemon 现有 `MLRA_CANCEL` 已做：

- `orchestrator.status = "cancelled"`
- `orchestrator.humanGate = null`
- `orchestrator.stageExitPending = empty`
- `router.cancelAll("Orchestration cancelled by user")`
- 推送 status

因此前端主要补 UI 与 store action。

### 7.7 验收标准

- 运行态可见停止按钮。
- 非运行态不显示停止按钮。
- 第一次点击不会立即停止。
- 第二次确认点击发送 `mlra_cancel`。
- daemon 回传后 UI 退出运行态。
- human gate / stage exit pending 不再残留显示。

## 8. 阶段三：下一任务草稿区

### 8.1 需求定位

下一任务草稿区用于解决：用户在当前 MLRA 运行时，可能已经想好下一轮任务，希望提前整理任务描述、模板、阶段和策略。

这个能力不能干扰当前运行。

### 8.2 命名

推荐名称：`下一任务`

备选：

- `任务草稿`
- `准备下一轮`
- `草稿区`

不推荐：

- `Launcher`
- `新 Launcher`
- `Launcher 管理`

### 8.3 UI 入口

可放在运行态顶部工具区，也可以暂时不做。

如果做，推荐放在停止按钮左侧或阶段/计时器区域左侧：

```text
自动化策略 -> 状态提示 -> spacer -> 下一任务 -> 阶段指示器 -> 计时器 -> 停止
```

但第一版建议不要同时引入，避免扩大改动范围。

### 8.4 草稿数据模型

新增独立 state，不复用 active launcher：

```ts
interface NextTaskDraft {
  initialTask: string;
  templateId: BlueprintTemplateId;
  orchestrationPolicy: OrchestrationPolicy;
  blueprint: WorkflowBlueprint | null;
  updatedAt: string | null;
}
```

Store 字段：

```ts
nextTaskDraft: NextTaskDraft | null;
nextTaskDrawerOpen: boolean;
```

Actions：

```ts
setNextTaskDraft(patch: Partial<NextTaskDraft>): void;
clearNextTaskDraft(): void;
promoteNextTaskDraft(): string;
toggleNextTaskDrawer(): void;
```

### 8.5 隔离原则

草稿编辑不得修改：

- 当前 active launcher 的 blueprint
- 当前 active launcher 的 orchestrationPolicy
- daemon runtime
- currentStage
- roundHistory
- humanGate

### 8.6 草稿提升流程

当前运行结束或停止后：

1. UI 检测到存在 `nextTaskDraft`。
2. LauncherHome 或配置页显示 `使用下一任务草稿`。
3. 用户确认。
4. 系统创建新的配置 launcher 或重置当前配置容器。
5. 进入 Blueprint Workbench。

### 8.7 初版 UI

初版可以是轻量抽屉：

- 任务描述 textarea
- 蓝图模板 segmented/tag selector
- 自动化策略 selector
- 阶段预览
- 保存草稿
- 清空草稿

不建议初版嵌入完整 Blueprint Workbench，否则范围过大。

## 9. 建议实施路径

### 9.1 第一批：收口当前运行控制

范围：

- 移除 Launcher 管理面板 UI。
- 添加中途停止按钮。
- 添加 `daemonCancelOrchestration` store action。
- 清理相关 CSS 与 imports。

预期收益：

- 消除错误产品概念。
- 用户可安全停止当前 MLRA。
- 改动范围可控。

### 9.2 第二批：下一任务草稿区

范围：

- 新增 `NextTaskDraft` 数据结构。
- 新增草稿抽屉。
- 支持草稿提升到配置页。

预期收益：

- 支持运行中规划下一轮任务。
- 不污染当前运行。

### 9.3 第三批：内部数据模型语义清理

范围：

- 评估是否将 `Launcher` 类型重命名为更准确的 `MLRARunRecord` 或 `MLRASession`。
- 区分 active run、configuration draft、history record。

预期收益：

- 降低长期维护混乱。
- 减少旧概念泄漏。

## 10. 技术风险

### 10.1 误删仍被引用的 LauncherSidebar 代码

删除组件和 CSS 前必须检查 import 与引用。

重点文件：

- `FeedbackApp.tsx`
- `MLRAView.tsx`
- `index.css`

### 10.2 停止后 UI 状态不同步

如果前端发送 `mlra_cancel` 后 daemon 回推不及时，按钮可能看起来没反应。

缓解：按钮进入 pending 态，等待 status 回推。

### 10.3 停止行为对 blocked roles 的影响

daemon 已有 `router.cancelAll(...)`，但需要验证被阻塞的 Expert / Inspector / CEO 是否能收到明确取消消息。

### 10.4 草稿污染 active run

后续做下一任务草稿时，最大风险是误用 active launcher 的 blueprint state。

必须用独立 draft state。

## 11. 测试计划

### 11.1 静态检查

- TypeScript diagnostics
- CSS diagnostics
- 无未使用 import

### 11.2 运行态手测

- 启动 MLRA。
- 确认旧 Launcher 管理按钮不存在。
- 确认运行态显示停止按钮。
- 第一次点击进入确认态。
- 第二次点击发送取消。
- UI 退出运行态。
- 角色阻塞被释放。

### 11.3 状态场景

- running 时停止
- awaiting-user 时停止
- stageExitPending 时停止
- humanGate active 时停止
- completed 后不显示停止按钮
- configuring 时不显示停止按钮

### 11.4 回归检查

- 阶段指示器仍显示。
- 计时器仍显示。
- 时间统计 hover 面板仍可用。
- Blueprint Workbench 未受影响。

## 12. 最终建议

立即执行第一批：

1. 移除旧 Launcher 管理面板 UI。
2. 新增中途停止按钮。
3. 保留 store 的 Launcher 数据结构，暂不大改底层模型。

下一任务草稿区是正确方向，但应作为独立第二批设计，不应混进这次废案面板清理。
