---
title: MLRA阻塞点编排机制会话摘要
description: 汇总开始按钮修复、运行界面分析与阻塞点编排规划
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
solved_lists:
  - 修复MLRA开始按钮判定条件显示与hover列表
  - 修复切换阶段时右侧编辑标签页被重置的问题
  - 重新分析开始后运行界面与agent观察边界
  - 明确新版submit阻塞与CEO门控接管机制
  - 创建阻塞点编排与逐角色接管机制规划书
---

# MLRA阻塞点编排机制会话摘要

## 1. Previous Conversation

本轮会话延续之前对 `my-last-feedback` 仓库中 MLRA Blueprint Workbench、阶段模板、runtime prompt、阶段出口认证机制的改造。

此前已完成的大方向包括：

- MLRA Blueprint Workbench UI 多轮精修。
- 删除阶段停用/禁用设计。
- 左侧配置栏保留蓝图模板和任务描述，移除蓝图描述。
- 右侧阶段编辑区改为序号、图标、命名、门控按钮一行布局。
- 门控按钮和门控规则提示词可编辑。
- 删除 `progress` 参数及 `lastProgress` 状态。
- 清理阶段模板、runtime prompt、MCP tool descriptions 中的多 agent 协作叙事、循环/轮次提示、progress 相关提示。
- 将 `expert_vote` / `inspector_vote` 语义收敛为严格阶段出口认证。
- 在 daemon/orchestrator 中增加 `stageExitReadiness` 和结构化 certification 校验。
- 创建规划文档 `.myLastChat/MLC_MLRA阶段出口认证与投票工具收敛规划书.md`。
- 创建会话摘要 `.myLastChat/MLC_MLRA蓝图工作台与出口认证改造会话摘要.md`。

本次会话后半段进一步从“出口认证”推进到更底层的“工具阻塞点编排”模型。用户指出：AI prompt 中隐藏 agent 协作语境只是为了骗 AI，不代表用户界面也要隐藏 agent 信息。用户应能真实观察 agent、回合和阻塞状态。因此，三列 Agent 面板和 round 统计应保留，不应因为 prompt 净化而删除。

随后用户重新描述新版机制：

- Expert / Inspector 的 submit 工具本质是阻塞工具。
- A 的 submit 入参会作为 B 的待输入材料。
- A 的工具调用保持阻塞，直到 B 后续 submit 的入参作为 A 的工具输出返回。
- 主 agent submit 可以是全自动，也可以每次由用户审阅后再释放。
- CEO 因 gate 触发，有三种情况：全自动、门控触发阻塞、门控提交阻塞。

基于该新版机制，已创建新的详细规划文档：

- `.myLastChat/MLC_MLRA阻塞点编排与逐角色接管机制规划书.md`

## 2. Current Work

最近完成的直接工作有三类。

### 2.1 修复开始按钮

用户反馈：

> “好的，现在修复开始按钮。使其有正常的判定条件状态显示，以及正常的hover显示一个判定条件满足状态列表”

已完成：

- 将开始按钮从单纯 disabled 改为结构化 `StartCondition` 列表。
- 按钮上显示已满足条件数，例如 `4/5`。
- hover 或键盘聚焦按钮外层时，显示完整判定条件列表。
- 禁用按钮仍可通过外层 wrapper hover 查看缺失条件。
- 判定条件包括：
  - 任务描述已填写。
  - 至少包含一个普通阶段。
  - 所有阶段已有名称。
  - 最后一个普通阶段开启出口门控。
  - 蓝图末尾是结束汇总阶段。
- 同步修改 `validateBlueprint`，任务描述必须来自 `initialTask` 或 `userTask`，不再用 launcher 名称绕过。

### 2.2 修复切换阶段时右侧标签页被重置

用户反馈：

> “切换选中的阶段时，右侧编辑区域的标签页不要切换”

已完成：

- 删除 `selectStage` 中强制 `setInspectorTab("basics")` 的逻辑。
- 切换阶段时保留右侧当前标签页。
- 新增阶段时仍切到“基本信息”，方便编辑新阶段基础字段。

### 2.3 重新分析开始后的运行界面

用户要求检查开始后界面哪些已无意义、哪些有风险、哪些多余。

初次分析时我误将“AI prompt 不应暴露 agent 协作”扩展成“用户界面也不应展示 agent/round”。用户纠正：

> “agent的用户视角只是对agetn语境的伪装，但骗ai而已，总不能把用户也骗了。你这个理解有大错误。”

已重新校正边界：

- 三列 Agent 面板保留，它是用户观察 agent 信息的能力。
- Timer popover 的 round/轮次统计保留，因为回合是系统事实。
- 真正要改的是旧 `controlMode` 与工具阻塞模型不匹配。

进一步检查 daemon 后发现：

- 当前 `ceo-override` 基本没有真正实现接管 CEO。
- `_needsHumanReview(role)` 只在 Expert/Inspector submit 路径被调用。
- CEO verdict 路径没有经过 `_needsHumanReview`。
- `expert_vote` / `inspector_vote` 当前是立即返回 JSON，不是真正阻塞到 gate 决议结束。
- 现有 `humanReviewPending` 太窄，只能覆盖很少的 submit review 场景。

最终用户要求：

> “请你据此编写一个详细的修改规划书”

已创建规划书 `.myLastChat/MLC_MLRA阻塞点编排与逐角色接管机制规划书.md`。

## 3. Key Technical Concepts

- Workspace：`e:\Dev\my-last-feedback`
- 前端：React 19、TypeScript、Vite 7、Tauri 2。
- Store：Zustand，核心文件 `app/src/store/mlraStore.ts`。
- UI：`app/src/components/LauncherHomeNodeWorkbench.tsx`、`MLRAView.tsx`、`AgentColumn.tsx`、`FeedbackApp.tsx`、`LauncherSidebar.tsx`。
- 样式：`app/src/index.css`。
- Runtime：Node ESM under `mcp/mlra`。
- Main roles：`expert`、`inspector`、`ceo`。
- Blueprint：`WorkflowBlueprint`、`StageBlueprint`。
- Stage templates：`deliberation`、`delivery`、`closing`。
- Stage Exit Certification：`expert_vote` / `inspector_vote` 目前仍保留工具名，但语义已收敛为阶段出口认证。
- Certification schema：`originalRequestSatisfied`、`stageDirectiveSatisfied`、`feedbackResolved`、`directVerificationEvidence`、`unresolvedConcerns`、`exitRationale`。
- Daemon readiness：`stageExitReadiness`、`deliverableVersion`、`reviewedDeliverableVersion`、`hasDeliverable`、`hasReview`、`certifications`。
- 新规划核心：工具调用是阻塞点，工具入参是待流转材料，工具输出是另一方处理后的返回材料。
- 新规划术语：`OrchestrationPolicy`、`HumanGateState`、`SubmitReleasePolicy`、`CeoGateTriggerPolicy`、`CeoVerdictReleasePolicy`。
- 新主 agent submit 模式：`auto` / `user-review`。
- 新 CEO gate 模式：`auto-to-ceo + auto-release`、`user-replaces-ceo`、`auto-to-ceo + user-review`。
- 用户侧可见 agent/round 是产品能力；AI prompt 侧仍需保持 user-facing 包装。
- MyLastChat 文档规范：`.myLastChat/MLC_*.md`，YAML frontmatter 必含 `title`、`description`、`workplace`。

## 4. Relevant Files and Code

### app/src/components/LauncherHomeNodeWorkbench.tsx

用途：MLRA Blueprint Workbench 主 UI。

本次修改：

- 新增 `StartCondition` 类型。
- 新增 `getStartConditions(blueprint, taskText)`。
- 开始按钮显示 `passed/total` 条件数。
- 开始按钮 hover 弹出判定条件列表。
- 选中阶段时不再重置右侧 inspector tab。

关键代码：

```tsx
type StartCondition = {
  id: string;
  label: string;
  passed: boolean;
};
```

```tsx
function getStartConditions(blueprint: WorkflowBlueprint, taskText: string): StartCondition[] {
  const stages = [...blueprint.stages].sort((left, right) => left.order - right.order);
  const nonClosingStages = stages.filter((stage) => !isClosingStage(stage));
  const lastNonClosingStage = nonClosingStages[nonClosingStages.length - 1] || null;
  const lastStage = stages[stages.length - 1] || null;

  return [
    { id: "task", label: "任务描述已填写", passed: taskText.trim().length > 0 },
    { id: "stage-count", label: "至少包含一个普通阶段", passed: nonClosingStages.length > 0 },
    { id: "stage-names", label: "所有阶段已有名称", passed: stages.length > 0 && stages.every((stage) => stage.name.trim().length > 0) },
    { id: "final-gate", label: "最后一个普通阶段开启出口门控", passed: !!lastNonClosingStage?.exitGateEnabled },
    { id: "closing", label: "蓝图末尾是结束汇总阶段", passed: !!lastStage && isClosingStage(lastStage) },
  ];
}
```

```tsx
const selectStage = useCallback((stage: StageBlueprint) => {
  if (launcher) {
    selectBlueprintStage(launcher.id, stage.id);
    return;
  }
  setDraftSelectedStageOrder(stage.order);
}, [launcher, selectBlueprintStage]);
```

### app/src/store/mlraStore.ts

用途：MLRA Zustand store、类型、状态、前端模板镜像。

本次修改：

- `validateBlueprint` 的任务描述校验不再允许用 `launcher.name` 兜底。

关键代码：

```ts
if (!launcher.blueprint.initialTask.trim() && !launcher.userTask.trim()) {
  errors.push("请填写任务描述");
}
```

重要现状：

- 仍有旧 `ControlMode = "autopilot" | "ceo-override"`。
- `Launcher` 仍没有 `orchestrationPolicy` / `humanGate`。
- `roundHistory` 保留，应继续作为用户侧事实统计。
- `blueprintRuntime` 仅显示当前阶段摘要，还不能显示 HumanGate 或 StageExitPending。

### app/src/index.css

用途：全局样式与 MLRA UI 样式。

本次修改：

- 新增开始按钮 wrapper、状态数量、hover popover、条件列表样式。
- 禁用按钮外层支持 hover 显示判定列表。

相关 class：

```css
.mlra-start-control
.mlra-start-btn
.mlra-start-count
.mlra-start-readiness-popover
.mlra-start-readiness-title
.mlra-start-readiness-list
```

### app/src/components/MLRAView.tsx

用途：MLRA root view。

检查发现：

- 运行界面当前只把 `running` / `paused` 视为 active。
- 后续如果引入通用 HumanGate，`awaiting-user` 或更细状态需要重新设计。
- 但三列 Agent 面板本身不应删除。

关键现状：

```tsx
const isActive = activeLauncher?.status === "running" || activeLauncher?.status === "paused";
```

### app/src/components/AgentColumn.tsx

用途：运行后显示 Expert / Inspector / CEO 三列观察面板。

用户已明确：三列 Agent 面板应保留。

现状：

- 显示 role、model、session pool、slot status。
- body 仍是 placeholder：`Session 内容将在后端连接后显示`。
- Expert 有 `ExpertMessageInput` 可注入指令。

未来建议：增加更细状态，如 `waiting-human-review`、`waiting-peer`、`waiting-gate`。

### app/src/components/FeedbackApp.tsx

用途：整体 app shell、MLRA 顶栏第二行、timer popover。

检查结论：

- `TimerStatsPopover` 的 `roundHistory` / “轮”统计应保留。
- 顶栏第二行未来可显示 policy summary、human gate 状态、ceo gate 状态。

重要现状：

```tsx
const controlModes = [
  { mode: "autopilot", label: "全自动" },
  { mode: "ceo-override", label: "接管CEO" },
];
```

该模式应被新 `OrchestrationPolicy` 替代或降级为 preset。

### app/src/components/LauncherSidebar.tsx

用途：Launcher 管理侧栏。

检查发现：

- `STATUS_LABELS` 有 `awaiting-user: "等待响应"`。
- `STATUS_ICON_NAMES` 没有 `awaiting-user` 映射。
- 未来如果继续保留该状态，需要补图标。

### mcp/mlra/daemon/orchestrator.mjs

用途：MLRA 核心状态机。

关键现状：

- 仍有 `this.controlMode = "ceo-override"`。
- 仍有 `this.humanReviewPending = null`。
- `_needsHumanReview(role)` 只支持旧 controlMode。
- `_needsHumanReview` 只被 Expert/Inspector submit 调用。
- Stage exit certification 已有严格校验，但 pass 后不是严格阻塞工具。

关键问题代码：

```js
_needsHumanReview(role) {
  switch (this.controlMode) {
    case "autopilot": return false;
    case "ceo-override": return role === ROLES.CEO;
    default: return false;
  }
}
```

### mcp/mlra/daemon/index.mjs

用途：daemon 消息分发、router block/release、IPC bridge。

关键现状：

- Expert/Inspector submit 使用 `_followDecision` 和 `_blockForNext`，已有可复用的阻塞基础。
- `human_review` action 当前会发送 `MLRA_WORKFLOW_PAUSED`，但 UI/store 没有完整 human gate。
- `expert_vote` / `inspector_vote` 当前立即返回 JSON。

关键问题代码：

```js
case MSG.EXPERT_VOTE: {
  const { vote, reason, certification } = msg;
  const result = this.orchestrator.handleExpertVote(vote, reason, certification);
  return { type: MSG.RESOLVE, content: JSON.stringify(result) };
}
```

### mcp/mlra/daemon/router.mjs

用途：阻塞与释放角色 MCP 请求。

检查结论：

- 已有 `block(role, reason)` / `release(role, content)` 基础，可复用于 HumanGate。
- 需要更明确 block reason：`submit`、`certification`、`ceo_verdict`、`human_gate`。

### .myLastChat/MLC_MLRA阻塞点编排与逐角色接管机制规划书.md

本次创建的新规划书。

内容覆盖：

- 新版主 agent submit 阻塞模型。
- CEO 三种 gate 模式。
- 旧 `controlMode` 问题。
- `OrchestrationPolicy` 数据模型。
- `HumanGateState` 数据模型。
- Stage exit pending 状态。
- Daemon IPC 设计。
- Store 改造。
- 前端运行界面改造。
- Orchestrator 改造。
- 7 阶段实施计划。
- 14 项最小验收测试矩阵。

## 5. Problem Solving

### 已解决：开始按钮无判定状态

问题：开始按钮只 disabled，用户不知道为什么不能开始。

解决：增加结构化 `StartCondition` 和 hover popover。

验证：`get_errors` 对相关文件检查通过。

### 已解决：切换阶段重置右侧标签页

问题：选择不同阶段时右侧编辑 tab 总是回到基本信息。

解决：移除 `selectStage` 中的 `setInspectorTab("basics")`。

验证：`get_errors` 对相关文件检查通过。

### 已纠正：用户界面是否应展示 agent/round

初始误解：把 AI prompt 语境隐藏误扩展到用户界面。

用户纠正后确认：

- 用户可以看到真实 agent 信息。
- 用户可以看到 round/轮次统计。
- 这不影响 AI prompt 净化。

新结论：三列 Agent 面板和 Timer round 统计应保留。

### 已发现：旧 `ceo-override` 实际不可用

发现：`_needsHumanReview` 返回 `role === CEO`，但 CEO verdict 路径没有调用它。

影响：旧“接管 CEO”模式基本没有真实 runtime 效果。

规划：废弃旧 controlMode 作为底层 runtime 决策源，改为 `OrchestrationPolicy`。

### 已发现：出口认证工具不是阻塞工具

发现：`expert_vote` / `inspector_vote` 通过认证后立即返回 JSON。

用户新版机制要求：认证工具应阻塞到 gate/阶段推进决议产生。

规划：让 accepted certification 进入 pending，双认证完成后触发 stage exit。

### 已完成：详细规划书

创建：

```text
.myLastChat/MLC_MLRA阻塞点编排与逐角色接管机制规划书.md
```

诊断：No errors found。

## 6. Pending Tasks and Next Steps

最近用户原话：

> “很好，现在请你编写一个新的会话摘要。我们明天再来继续任务”

当前任务：创建本文档，作为明天继续任务的上下文。

明天最可能继续的任务原话背景：

> “请你据此编写一个详细的修改规划书”

该规划书已完成，下一步很可能是按规划进入实施。

建议明天继续时优先确认：

- 是否按 `.myLastChat/MLC_MLRA阻塞点编排与逐角色接管机制规划书.md` 直接实施。
- 是否先提交当前已有 UI/规划文档改动。
- 是否先运行 `npm run build` 验证本次 UI 小改。之前未运行构建，因为用户在构建确认弹窗中给了新修复指令。

当前未提交的近期代码改动至少包括：

```text
app/src/components/LauncherHomeNodeWorkbench.tsx
app/src/store/mlraStore.ts
app/src/index.css
.myLastChat/MLC_MLRA阻塞点编排与逐角色接管机制规划书.md
.myLastChat/MLC_MLRA阻塞点编排机制会话摘要.md
```

此前出口认证实施后的未提交文件也仍可能存在，需明天用 `git status --short` 确认。

建议实施顺序，来自规划书：

1. 新增 `OrchestrationPolicy`、policy presets。
2. 新增 `HumanGateState`，替换 `humanReviewPending`。
3. Daemon/App IPC 增加 human gate update、approve、reject。
4. Expert/Inspector submit 支持 auto/user-review。
5. Stage exit certification 改为真正阻塞工具。
6. CEO gate 支持全自动、用户替代、CEO 审后用户确认三模式。
7. 开始后界面新增 HumanGate 面板和策略摘要。
8. 保留三列 Agent 面板和 round 统计。
9. 清理旧 `controlMode` 决策路径。
10. 运行 `get_errors`、`npm run build`、`.mjs` syntax check 和直接 orchestrator simulation。

重要注意事项：

- 用户明确不希望过度思考式删除三列 Agent 或 round 统计。
- 用户希望一步到位，不希望继续给旧 `controlMode` 打小补丁。
- 用户对编排器本质的定义必须保留：工具入参/输出构成阻塞式信息流转。
- `agent_name` 固定为 `02FB`，完成请求前必须调用 interactive feedback。
