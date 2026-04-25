---
title: MLRA阻塞点编排与逐角色接管机制规划书
description: 规划MLRA提交工具阻塞、CEO门控接管与逐角色自动化策略
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLRA
  - orchestration
  - human-gate
  - handoff
  - takeover
solved_lists:
  - 梳理新版主agent提交工具阻塞模型
  - 梳理CEO门控触发阻塞与提交阻塞模型
  - 设计逐角色自动化策略替代旧controlMode
  - 设计HumanGate统一人工拦截状态
  - 制定daemon、store、UI、验证改造路线
---

# MLRA阻塞点编排与逐角色接管机制规划书

## 1. 背景与目标

当前 MLRA 已完成三固定主角色、通用 Stage Blueprint、阶段出口认证、CEO gate 和 closing stage 等核心改造。但运行控制仍保留旧的粗粒度模型：

```ts
type ControlMode = "autopilot" | "ceo-override";
```

这个模型已经无法准确表达新版编排器的真实机制。

新版机制的核心不是“全自动或接管 CEO”这种全局开关，而是：

> 工具调用本身是阻塞点。工具入参是待流转材料，工具输出是另一方处理后的返回材料。编排器的职责是决定每个阻塞点是否自动释放、是否交给用户审阅、是否由用户替代生成结果。

本规划书目标：

- 将 MLRA runtime 从旧 `controlMode` 改造为“阻塞点释放策略”。
- 对 Expert / Inspector 的 submit handoff 建立自动与手动两种模式。
- 对 CEO gate 建立三种模式：全自动、门控触发阻塞、门控提交阻塞。
- 将用户接管抽象为统一 `HumanGate` 状态，而不是零散 `humanReviewPending`。
- 保留三列 Agent 观察界面与 round 统计，不做无意义洁癖式删除。
- 在开始后的界面中增加阻塞点可见性和 MLFB 风格审阅/编辑能力。

## 2. 核心概念

### 2.1 工具阻塞点

MLRA 中，MCP 工具调用不是普通 fire-and-forget 事件。它应被理解为一个同步阻塞点：

1. Agent 调用工具并提交入参。
2. Daemon 接收入参。
3. 该工具调用保持 pending。
4. 编排器决定入参如何流转。
5. 当后续 agent 或用户完成处理后，daemon 将结果作为工具输出返回给原 agent。
6. 原 agent 继续执行。

因此，工具调用天然适合作为人工接管点。

### 2.2 主 agent 双向循环

主 agent 包括：

- Expert
- Inspector

它们通过 submit 工具形成双向循环。

Expert 使用 `expert_submit({ content })`：

- Expert 的工具调用阻塞。
- `content` 成为待交给 Inspector 的材料。
- Inspector 处理后调用 `inspector_submit({ content })`。
- Inspector 的 submit 入参作为 Expert 的工具输出返回。
- Expert 收到输出后继续运行。
- Inspector 进入阻塞，等待 Expert 下一次 submit 输出。

Inspector 到 Expert 的方向同理。

这个循环不是“消息列表转发”，而是“互相填充对方 pending tool call 的输出”。

### 2.3 主 agent 的两种 submit 模式

对 Expert / Inspector 各自独立配置。

#### 全自动 submit

```text
Agent A submit 入参 -> 编排器自动投递给 Agent B -> Agent A 阻塞等待 Agent B 的后续 submit 输出
```

用户不参与每次 handoff。

#### 手动 submit

```text
Agent A submit 入参 -> 编排器创建 HumanGate -> 前端预填审阅框 -> 用户编辑确认 -> 投递给 Agent B -> Agent A 继续阻塞等待 Agent B 的后续 submit 输出
```

用户可以决定真实交给对侧 agent 的内容。

这不是暂停 workflow，而是拦截一次 handoff。

### 2.4 CEO gate 的三种模式

CEO 不参与主 agent 常规循环。CEO 由阶段出口门控触发。

触发条件：Expert 和 Inspector 都完成阶段出口认证。

#### CEO 全自动

```text
两方认证完成 -> 编排器汇总认证、附件、阶段产出、gate prompt -> 自动提交给 CEO -> CEO verdict 自动执行
```

此时两个主 agent 都因为使用出口认证工具而阻塞。

如果 CEO 审核不通过：

- CEO verdict 的审核意见和结论作为 Inspector 的出口认证工具输出。
- Inspector 继续工作。
- Expert 保持阻塞，直到 Inspector 下一次使用 submit 或 certification 工具产生返回材料。

如果 CEO 审核通过：

- 当前阶段退出。
- 下一阶段入口材料释放给相关角色。

#### 门控触发阻塞

```text
两方认证完成 -> 编排器汇总 CEO 审核材料 -> 不交给 CEO -> 用户手动填写 verdict -> verdict 进入门控决议流程
```

这种情况下 CEO 本质上不会接收任何信息，用户完全替代 CEO。

适用场景：用户希望所有 gate 结论由自己写。

#### 门控提交阻塞

```text
两方认证完成 -> 编排器自动提交给 CEO -> CEO 调用 ceo_verdict -> verdict 被阻塞 -> 用户编辑确认 -> 最终 verdict 执行
```

这种情况下 CEO 会参与审核，但 CEO 的工具入参不会立即生效。用户可以修改 verdict、reason、targets 后再确认释放。

适用场景：用户想利用 CEO 的审查能力，但保留最终发布权。

## 3. 现有实现问题

### 3.1 `controlMode` 表达力不足

当前只有：

```ts
"autopilot" | "ceo-override"
```

它无法表达：

- Expert submit 自动，Inspector submit 手动。
- Expert submit 手动，Inspector submit 自动。
- Gate 触发时用户替代 CEO。
- Gate 触发自动交给 CEO，但 CEO verdict 由用户确认。
- Closing feedback 与普通 handoff review 的差异。

### 3.2 当前 `ceo-override` 语义基本落空

当前 `orchestrator.mjs` 中：

```js
_needsHumanReview(role) {
  switch (this.controlMode) {
    case "autopilot": return false;
    case "ceo-override": return role === ROLES.CEO;
    default: return false;
  }
}
```

但 `_needsHumanReview` 只在 `handleExpertSubmit` 和 `handleInspectorSubmit` 中被调用。

CEO verdict 路径 `handleCeoVerdict` 没有经过 `_needsHumanReview`。

结果：

- `ceo-override` 不拦截 Expert submit。
- `ceo-override` 不拦截 Inspector submit。
- `ceo-override` 也不拦截 CEO verdict。

因此旧控制模式不能继续作为底层语义。

### 3.3 出口认证工具目前不是严格阻塞工具

当前 `expert_vote` / `inspector_vote` 在 daemon 中立即返回 JSON：

```js
const result = this.orchestrator.handleExpertVote(vote, reason, certification);
return { type: MSG.RESOLVE, content: JSON.stringify(result) };
```

这与新版机制不一致。

新版要求：

- 通过认证后，该工具调用应进入阻塞。
- 两方都通过后触发 stage exit。
- gate 决议或阶段推进后，阻塞工具才获得输出。

### 3.4 `humanReviewPending` 过窄

当前只有单个 `humanReviewPending`，只覆盖部分 submit review 场景。

它不能表示：

- Expert submit handoff review。
- Inspector submit handoff review。
- Gate trigger user verdict。
- CEO verdict user review。
- Closing feedback。
- 多个角色同时因 stage exit certification 阻塞。

需要替换为统一 `HumanGateState`。

## 4. 新数据模型

### 4.1 OrchestrationPolicy

建议替换旧 `ControlMode` 为逐阻塞点策略。

```ts
export type SubmitReleasePolicy = "auto" | "user-review";

export type CeoGateTriggerPolicy =
  | "auto-to-ceo"
  | "user-replaces-ceo";

export type CeoVerdictReleasePolicy =
  | "auto-release"
  | "user-review";

export interface OrchestrationPolicy {
  expertSubmit: SubmitReleasePolicy;
  inspectorSubmit: SubmitReleasePolicy;
  ceoGateTrigger: CeoGateTriggerPolicy;
  ceoVerdict: CeoVerdictReleasePolicy;
}
```

### 4.2 Policy Presets

UI 可以继续提供简单 preset，但 preset 只负责写入 `OrchestrationPolicy`。

#### 全自动

```ts
{
  expertSubmit: "auto",
  inspectorSubmit: "auto",
  ceoGateTrigger: "auto-to-ceo",
  ceoVerdict: "auto-release",
}
```

#### 接管 CEO：用户替代 CEO

```ts
{
  expertSubmit: "auto",
  inspectorSubmit: "auto",
  ceoGateTrigger: "user-replaces-ceo",
  ceoVerdict: "auto-release",
}
```

#### 接管 CEO：CEO 审核后用户确认

```ts
{
  expertSubmit: "auto",
  inspectorSubmit: "auto",
  ceoGateTrigger: "auto-to-ceo",
  ceoVerdict: "user-review",
}
```

#### 全量接管

```ts
{
  expertSubmit: "user-review",
  inspectorSubmit: "user-review",
  ceoGateTrigger: "user-replaces-ceo",
  ceoVerdict: "auto-release",
}
```

或：

```ts
{
  expertSubmit: "user-review",
  inspectorSubmit: "user-review",
  ceoGateTrigger: "auto-to-ceo",
  ceoVerdict: "user-review",
}
```

取决于用户希望完全替代 CEO，还是保留 CEO 先审后确认。

### 4.3 HumanGateState

统一人工拦截状态。

```ts
export type HumanGateKind =
  | "submit_handoff_review"
  | "stage_exit_gate_trigger"
  | "ceo_verdict_review"
  | "closing_feedback";

export type HumanGateRole = "expert" | "inspector" | "ceo" | "orchestrator" | "user";

export type PendingToolName =
  | "expert_submit"
  | "inspector_submit"
  | "expert_vote"
  | "inspector_vote"
  | "ceo_verdict"
  | "interactive_feedback";

export interface HumanGateState {
  id: string;
  active: boolean;
  kind: HumanGateKind;
  title: string;
  sourceRole: HumanGateRole;
  targetRole?: HumanGateRole;
  pendingTool: PendingToolName;
  blockedRoles: HumanGateRole[];
  originalContent: string;
  draftContent: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
```

### 4.4 StageExitPendingState

出口认证需要记录被阻塞的工具调用和认证材料。

```ts
export interface StageExitPendingState {
  active: boolean;
  stageId: string | null;
  materials: string | null;
  expert?: {
    blocked: boolean;
    reason: string;
    certification: StageExitCertification;
  } | null;
  inspector?: {
    blocked: boolean;
    reason: string;
    certification: StageExitCertification;
  } | null;
}
```

注意：runtime 内部还需要保存 pending resolver 或 router block key。前端只需要 summary。

## 5. Runtime 改造设计

### 5.1 Expert submit 自动模式

流程：

1. Expert 调用 `expert_submit({ content })`。
2. Daemon 进入 `handleExpertSubmit`。
3. Orchestrator 调用 `_trackSubmit(ROLES.EXPERT, content)`。
4. 根据 policy 判断 `expertSubmit === "auto"`。
5. 构造给 Inspector 的 routing prompt。
6. `router.release(ROLES.INSPECTOR, routedContent)`。
7. Expert 当前工具调用进入 `router.block(ROLES.EXPERT, "expert_submit")`。
8. Inspector 后续 submit 时释放 Expert。

### 5.2 Expert submit 手动模式

流程：

1. Expert 调用 `expert_submit({ content })`。
2. Daemon 不立即 release 给 Inspector。
3. Orchestrator 创建 `HumanGateState(kind="submit_handoff_review")`。
4. App UI 显示审阅面板，预填 `content`。
5. Expert 工具调用保持 pending。
6. 用户确认后，App 发送 `mlra_human_gate_approve`。
7. Daemon 使用用户编辑后的内容构造 routed content。
8. `router.release(ROLES.INSPECTOR, routedContent)`。
9. Expert 继续保持 pending，等待 Inspector 后续 submit 输出。

用户拒绝或退回：

- 如果用户选择“退回原角色”，daemon 应释放 Expert 当前工具调用，内容为用户反馈，例如：

```text
[用户退回]
请根据以下意见修改后重新提交：...
```

这样 Expert 继续工作，而不是卡死。

### 5.3 Inspector submit 自动/手动模式

完全对称。

目标角色从 Expert 改为 Inspector 或反向。

### 5.4 Stage exit certification 阻塞模式

`expert_vote` / `inspector_vote` 当前工具名可以暂时保留，但语义是 stage-exit certification。

改造目标：通过认证时不立即普通返回。

#### 第一方认证通过

1. 进行现有严格校验。
2. 记录认证材料。
3. 标记该角色 certification tool blocked。
4. 当前 MCP 请求不返回，进入 pending。
5. UI 显示“Expert 已认证，等待 Inspector 认证”或反向。

#### 第二方认证通过

1. 进行现有严格校验。
2. 记录认证材料。
3. 标记第二方 certification tool blocked。
4. 触发 stage exit。
5. 根据当前 stage 是否开启 gate 决定后续。

#### Gate disabled

1. 直接进入下一阶段。
2. 将下一阶段入口 prompt 释放给对应角色。
3. 两个 certification 工具的输出应包含阶段推进信息。

#### Gate enabled

进入 CEO gate 流程。

### 5.5 CEO gate 全自动

1. 编排器汇总：
   - 原始用户请求
   - 当前阶段产出
   - Expert certification
   - Inspector certification
   - gate prompt
   - 附件或相关材料
2. 构造 CEO prompt。
3. `router.release(ROLES.CEO, ceoGatePrompt)`。
4. CEO 调用 `ceo_verdict`。
5. 如果 `ceoVerdict === "auto-release"`，直接执行 verdict。

### 5.6 门控触发阻塞

当 `ceoGateTrigger === "user-replaces-ceo"`：

1. 两方 certification 完成。
2. 编排器构造 CEO 审核材料。
3. 不 release 给 CEO。
4. 创建 `HumanGateState(kind="stage_exit_gate_trigger")`。
5. 前端显示 verdict 编辑面板：
   - approved
   - rejected
   - arbitration
   - reason
   - targets
6. 用户确认后，daemon 将用户 verdict 送入和 `handleCeoVerdict` 等价的决议流程。

注意：此模式下 CEO 不接收信息，不参与本次 gate。

### 5.7 门控提交阻塞

当 `ceoGateTrigger === "auto-to-ceo"` 且 `ceoVerdict === "user-review"`：

1. Gate 材料自动提交给 CEO。
2. CEO 调用 `ceo_verdict({ verdict, reason, targets })`。
3. Daemon 不立即执行 verdict。
4. CEO 的工具调用进入 pending。
5. 创建 `HumanGateState(kind="ceo_verdict_review")`。
6. 前端显示 CEO verdict 入参，用户可修改。
7. 用户确认后，最终 verdict 执行。
8. CEO 工具调用获得输出。

用户拒绝 CEO verdict 时可以有两种操作：

- 修改后提交：执行用户版本 verdict。
- 退回 CEO 重审：释放 CEO 工具调用，返回用户反馈，要求 CEO 重新 `ceo_verdict`。

第一版建议支持“修改后提交”，退回重审可作为增强项。

## 6. Daemon IPC 设计

### 6.1 Daemon -> App

新增消息：

```ts
type MLRA_HUMAN_GATE_UPDATE = {
  type: "mlra_human_gate_update";
  humanGate: HumanGateState | null;
};
```

每次创建、更新、清空 human gate 时发送。

`mlra_orchestration_status` 中也应包含：

```ts
{
  orchestrationPolicy,
  humanGate,
  stageExitPending,
  stageExitReadiness,
}
```

### 6.2 App -> Daemon

新增消息：

```ts
type MLRA_SET_ORCHESTRATION_POLICY = {
  type: "mlra_set_orchestration_policy";
  policy: OrchestrationPolicy;
};
```

```ts
type MLRA_HUMAN_GATE_APPROVE = {
  type: "mlra_human_gate_approve";
  id: string;
  content?: string;
  verdict?: "approved" | "rejected" | "arbitration";
  reason?: string;
  targets?: string[];
};
```

```ts
type MLRA_HUMAN_GATE_REJECT = {
  type: "mlra_human_gate_reject";
  id: string;
  reason: string;
};
```

```ts
type MLRA_HUMAN_GATE_CANCEL = {
  type: "mlra_human_gate_cancel";
  id: string;
};
```

第一版可以只实现 approve/reject。

## 7. Store 改造设计

### 7.1 类型新增

在 `app/src/store/mlraStore.ts` 增加：

- `SubmitReleasePolicy`
- `CeoGateTriggerPolicy`
- `CeoVerdictReleasePolicy`
- `OrchestrationPolicy`
- `HumanGateState`
- `StageExitPendingSummary`

### 7.2 Launcher 字段

`Launcher` 增加：

```ts
orchestrationPolicy: OrchestrationPolicy;
humanGate: HumanGateState | null;
stageExitPending: StageExitPendingSummary | null;
```

### 7.3 Store actions

新增：

```ts
setOrchestrationPolicy(launcherId, policy)
daemonSetOrchestrationPolicy(policy)
daemonApproveHumanGate(payload)
daemonRejectHumanGate(payload)
```

### 7.4 状态兼容

旧 `controlMode` 可暂时保留为 UI preset 推导字段，但不再作为 runtime 决策依据。

迁移策略：

- `autopilot` -> 全自动 policy。
- `ceo-override` -> 默认映射为 `ceoGateTrigger: "user-replaces-ceo"` 或按 UI 选择决定。

建议明确废弃 `ceo-override`，避免继续产生歧义。

## 8. 前端 UI 改造设计

### 8.1 开始前配置区

在 Blueprint Workbench 的启动设置附近增加“接管策略”。

展示方式：

- Preset segmented control：
  - 全自动
  - 接管 CEO
  - 全量接管
  - 自定义
- 自定义展开项：
  - Expert submit：自动 / 人工审阅
  - Inspector submit：自动 / 人工审阅
  - CEO gate：自动 / 用户替代 / CEO 审后确认

### 8.2 开始后顶栏

顶栏第二行显示：

- 当前阶段
- 当前 policy preset 或自定义摘要
- 当前 human gate 状态
- 当前 CEO gate 状态
- 当前 stage exit 状态

例：

```text
阶段: 落地实施   策略: 全量接管   阻塞: Expert -> Inspector 待审阅
```

### 8.3 Human Gate 面板

开始后主界面保留三列 Agent 面板。

新增一个可折叠面板，可以位于：

- 三列下方横向区域，或
- 右侧抽屉，或
- 顶栏下方的工作带。

推荐第一版：顶栏下方横向 Human Gate Bar，展开后为编辑区。

面板内容：

- 阻塞类型
- 来源角色
- 目标角色
- 原始内容只读区
- 可编辑内容区
- 确认释放按钮
- 退回修改按钮

CEO verdict 场景额外显示：

- verdict 选择：approved / rejected / arbitration
- reason textarea
- targets selector

### 8.4 三列 Agent 面板

保留。

增强每列状态：

- active
- blocked
- waiting-human-review
- waiting-peer
- waiting-gate
- standby
- disconnected

避免只显示 active/standby/idle，因为新版阻塞点需要更精细的用户观察。

### 8.5 Timer / round 统计

保留。

回合/轮次是用户侧事实，不需要删除。

可增强：给 round 记录增加原因：

- submit_handoff
- certification
- ceo_gate
- human_review

但这不是第一版必需项。

## 9. Orchestrator 改造细节

### 9.1 替换 controlMode

当前：

```js
this.controlMode = "ceo-override";
```

改为：

```js
this.orchestrationPolicy = defaultOrchestrationPolicy();
```

### 9.2 替换 `_needsHumanReview`

改为更明确的策略判断：

```js
_getSubmitPolicy(role) {
  if (role === ROLES.EXPERT) return this.orchestrationPolicy.expertSubmit;
  if (role === ROLES.INSPECTOR) return this.orchestrationPolicy.inspectorSubmit;
  return "auto";
}
```

```js
_shouldReviewSubmit(role) {
  return this._getSubmitPolicy(role) === "user-review";
}
```

### 9.3 HumanGate 创建/清空

新增：

```js
_createHumanGate(kind, payload)
_clearHumanGate(id)
_assertHumanGate(id)
```

每次创建/清空时 emit：

```js
this._emit({ type: "human_gate_update", humanGate: this.humanGate });
```

### 9.4 Submit handoff 决策

`handleExpertSubmit` 返回 decision：

```js
{ action: "route", targetRole, content }
```

或：

```js
{ action: "human_gate", gate }
```

Daemon 对 `human_gate` 的处理：

- 推送 app。
- block submitter。
- 等 app approve/reject 时继续 route 或 release 回原角色。

### 9.5 Certification 阻塞决策

`handleExpertVote` / `handleInspectorVote` 不再只返回 JSON。

建议返回：

```js
{ action: "certification_recorded", role }
```

或：

```js
{ action: "stage_exit_ready", materials }
```

Daemon 行为：

- 对 accepted certification，当前 MCP 请求进入 block。
- 第一方认证只 block。
- 第二方认证触发 gate 或 advance。

### 9.6 Gate verdict 决策

将 `handleCeoVerdict` 拆成两层：

```js
prepareCeoVerdict(verdictPayload)
applyCeoVerdict(verdictPayload)
```

当 `ceoVerdict === "user-review"`：

- `prepareCeoVerdict` 创建 HumanGate。
- 不执行 verdict。
- 用户确认后才调用 `applyCeoVerdict`。

当 `auto-release`：

- 直接 `applyCeoVerdict`。

## 10. Router 与阻塞工具调用

当前 `MessageRouter` 已支持 block/release，是可复用基础。

但需要明确区分 block reason：

- `hello`
- `submit`
- `certification`
- `ceo_verdict`
- `human_gate`

建议 block key 保留 role，但 round/history 中记录 reason。

潜在风险：同一个 role 同时只能有一个 pending block。

这与当前三主角色模型匹配，但必须避免：

- Expert submit pending 时又调用 vote。
- CEO verdict review pending 时又触发新 gate。

Orchestrator 应在 human gate active 时拒绝新的同类 gate，或排队。

第一版建议：human gate active 时暂停新的 gate 流转，避免复杂队列。

## 11. 验收场景

### 11.1 主 agent 全自动循环

配置：

```ts
expertSubmit = "auto"
inspectorSubmit = "auto"
```

预期：

- Expert submit 自动进入 Inspector。
- Inspector submit 自动返回 Expert。
- 用户不看到 HumanGate。
- roundHistory 正常记录。

### 11.2 Expert 手动、Inspector 自动

配置：

```ts
expertSubmit = "user-review"
inspectorSubmit = "auto"
```

预期：

- Expert submit 后出现 HumanGate。
- 用户编辑后释放给 Inspector。
- Inspector submit 自动返回 Expert。

### 11.3 双主 agent 全量手动

配置：

```ts
expertSubmit = "user-review"
inspectorSubmit = "user-review"
```

预期：

- 每次 submit 都进入用户审阅。
- 用户可修改任意一方传给另一方的内容。

### 11.4 CEO 全自动 gate

配置：

```ts
ceoGateTrigger = "auto-to-ceo"
ceoVerdict = "auto-release"
```

预期：

- 两方认证后自动提交 CEO。
- CEO verdict 自动执行。
- approved 推进阶段。
- rejected 将意见释放回 Inspector 或配置的目标路径。

### 11.5 门控触发阻塞

配置：

```ts
ceoGateTrigger = "user-replaces-ceo"
```

预期：

- 两方认证后不调用 CEO。
- 前端显示 gate 材料和 verdict 编辑区。
- 用户 verdict 执行门控决策。

### 11.6 门控提交阻塞

配置：

```ts
ceoGateTrigger = "auto-to-ceo"
ceoVerdict = "user-review"
```

预期：

- Gate 材料自动进入 CEO。
- CEO 调用 verdict 后被阻塞。
- 用户编辑确认 verdict。
- 最终 verdict 执行。

### 11.7 Certification 工具阻塞

预期：

- 第一方 certification pass 后工具不立即结束。
- 第二方 pass 后触发 gate/advance。
- Gate rejection 后按设计释放给 Inspector。
- Gate approval 后推进下一阶段并释放入口材料。

## 12. 风险与约束

### 12.1 阻塞死锁风险

必须确保每个 HumanGate 都有明确出口：

- approve
- reject
- cancel
- role disconnected
- workflow cancel

否则 MCP 工具调用会永久 pending。

### 12.2 双认证阻塞复杂度

Expert 和 Inspector 都因 certification 阻塞时，gate rejected 后不能错误释放双方。

按用户定义：

- CEO rejection 应主要作为 Inspector certification 的输出。
- Expert 继续阻塞，直到 Inspector 后续工具输出返回。

这个流转需要单独测试。

### 12.3 前端状态一致性

HumanGate 必须带 `id`，approve/reject 必须校验 id。

避免用户操作过期 gate。

### 12.4 旧 controlMode 迁移

短期可以保留 UI 文案，但 runtime 不应继续依赖旧字段。

建议实施后：

- `controlMode` 标记 deprecated。
- 新代码使用 `orchestrationPolicy`。

### 12.5 Prompt 净化边界

用户侧可以看到 agent、round、handoff。

AI prompt 侧仍需保持用户视角材料，不暴露“另一个 agent 要你配合”之类错误叙事。

因此：

- UI 可显示真实 agent 观察。
- Runtime route prompt 仍保持 user-facing material 包装。
- HumanGate 编辑内容最终进入 route prompt 时，也要经过现有 `buildRoutingPrompt` 包装。

## 13. 建议实施阶段

### Phase 1：类型与策略模型

- 新增 `OrchestrationPolicy`。
- 新增 policy presets。
- Store/daemon 支持设置 policy。
- 旧 `controlMode` 降级为兼容字段。

### Phase 2：HumanGate 基础设施

- 新增 `HumanGateState`。
- Daemon 推送 human gate update。
- App store 接收 human gate。
- 前端显示基础 HumanGate 面板。

### Phase 3：Submit handoff review

- Expert submit 支持 auto/user-review。
- Inspector submit 支持 auto/user-review。
- Approve/reject 打通。
- 验证双向循环无死锁。

### Phase 4：Certification 阻塞化

- `expert_vote` / `inspector_vote` pass 后进入 pending。
- 双方 pass 后触发 stage exit。
- 处理 gate disabled 直接推进。
- 处理 gate enabled 进入 gate。

### Phase 5：CEO gate 三模式

- `auto-to-ceo + auto-release`。
- `user-replaces-ceo`。
- `auto-to-ceo + user-review`。
- Gate rejection/approval/arbitration 全路径验证。

### Phase 6：开始后界面完善

- 顶栏显示 policy summary。
- 三列 Agent 显示更细状态。
- HumanGate 面板接入真实 approve/reject。
- Stage exit pending 状态可视化。

### Phase 7：清理与验收

- 清理旧 `_needsHumanReview`。
- 清理旧 `humanReviewPending`。
- 内部 `votes_passed` 可迁移为 `stage_exit_certified`。
- 补充模拟测试。
- 运行前端构建和 `.mjs` 语法检查。

## 14. 最小可验证测试矩阵

必须至少覆盖：

```text
1. Expert auto -> Inspector auto -> Expert
2. Expert review -> user approve -> Inspector
3. Inspector review -> user edit approve -> Expert
4. Expert review -> user reject -> Expert receives rejection output
5. First certification pass blocks
6. Second certification pass triggers gate
7. Gate disabled advances stage and releases blocked roles
8. CEO auto approved advances stage
9. CEO auto rejected releases rejection to Inspector path
10. Gate trigger blocked -> user approved advances stage
11. Gate trigger blocked -> user rejected returns to stage work
12. CEO verdict blocked -> user edits approved verdict -> advances stage
13. CEO verdict blocked -> user edits rejected verdict -> returns to stage work
14. HumanGate active then workflow cancel releases/rejects all pending blocks
```

## 15. 决策建议

本规划建议一步到位采用“阻塞点释放策略”作为 MLRA 新底层模型。

保留：

- 三列 Agent 观察界面。
- Timer round 统计。
- Stage Blueprint。
- Stage Exit Certification 严格校验。
- CEO defensive gate 思想。

替换：

- `ControlMode` 作为 runtime 决策源。
- 单一 `humanReviewPending`。
- Certification pass 后立即返回 JSON 的行为。

新增：

- `OrchestrationPolicy`。
- `HumanGateState`。
- Stage exit pending 阻塞状态。
- 前端 HumanGate 审阅/编辑面板。

最终目标：

> MLRA 的每一次关键工具调用都可以被编排器自动释放，也可以被用户拦截、编辑、替代或确认；用户看到真实 agent 与真实回合，AI 仍只看到被包装后的用户视角材料。
