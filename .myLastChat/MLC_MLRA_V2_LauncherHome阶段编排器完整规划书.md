---
title: MLRA v2 LauncherHome 阶段编排器完整规划书
description: 将 LauncherHome 从启动页升级为可配置工作流蓝图编辑器，驱动 v2 prompts、daemon 和 UI 的完整实施方案
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - MLRA
    - v2
    - launcherhome
    - workflow-blueprint
    - prompt-engineering
    - UI
---

# MLRA v2 LauncherHome 阶段编排器完整规划书

## 一、文档目标

本文档定义 MLRA v2 下一阶段的核心改造目标：

- 将 LauncherHome 从“启动前表单 + 旧角色分配页”升级为“阶段编排器”
- 让用户可以在开局前配置完整工作流蓝图，而不是只选择 taskType
- 让这些配置真正驱动 v2 daemon 的阶段启动、消息路由、推荐 skill、CEO 审批标准
- 统一前端 UI、store、启动协议、orchestrator、prompt builder 的职责边界

本文档不是纯 UI 规格，也不是单独后端方案，而是一份覆盖前后端和提示词链路的完整实施规划。

---

## 二、背景与问题定义

### 2.1 当前 v2 的真实状态

MLRA v2 已完成 3 角色固定拓扑重构：

- 固定角色为 `ceo` / `expert` / `inspector`
- phase 由 daemon 内部维护，不再由角色身份承载
- App UI 已能监听 v2 事件并启动 `mlra_start`

但当前系统仍存在一个结构性缺口：

- 前端启动配置仍然过薄，只能表达 `userTask`、`startMode`、`taskType`
- `mcp/mlra/protocol/prompts.mjs` 仍然使用固定模板函数生成初始消息与路由文案
- orchestrator 只能执行预设的 planning / execution 节奏，无法承载用户定义的阶段蓝图
- LauncherHome 还残留大量 v1 语义，不是 v2 的真正编排入口

### 2.2 当前方案为什么不够用

当前 `taskType` 只能表达“这是什么任务”，不能表达“这个任务要如何被编排”。

它无法回答以下关键问题：

- 第一阶段到底是先让 Expert 起草，还是先让 Inspector 从审查框架反推
- 当前阶段应该提示哪些 skill
- 当前阶段的开场提示词是什么
- 当前阶段的完成标准是什么
- CEO 在该阶段 gate 时按什么标准审批通过
- 是否允许阶段跳转、直接执行、仅审计、仅规划等不同工作流模板

因此，当前 LauncherHome 不再适合作为 v2 的最终启动面板。它需要升级为一个工作流蓝图编辑器。

---

## 三、核心结论

### 3.1 新抽象不是“阶段切换器”，而是“工作流蓝图”

需要明确一点：

用户现在要配置的不是当前展示哪个 phase，而是整个工作流的编排方式。

它包括：

- 有哪些阶段
- 阶段顺序是什么
- 每个阶段谁先收到开场消息
- 每个阶段对 Expert / Inspector / CEO 的提示词分别是什么
- 推荐 skill 列表是什么
- 每个阶段的准入门槛是什么
- 阶段间如何推进

因此，新的 LauncherHome 核心对象应该叫：

- `workflowBlueprint`
- 或 `orchestrationConfig`

而不是继续堆叠在 `taskType` 上。

### 3.2 这不是纯前端需求

如果只改 LauncherHome，不改 daemon / prompts 层，这个功能会是假配置。

原因：

- 前端没有地方把阶段配置传给 daemon
- daemon 没有保存阶段编排配置的状态
- prompt builder 不读取用户配置
- MCP servers 看到的“最近用户消息”仍然是固定模板，而不是用户编排生成的提示词

所以，这次需求必须按“UI + Store + Start Payload + Orchestrator + Prompt Builder”整体实施。

---

## 四、目标能力清单

新阶段编排器最终需要支持以下能力。

### 4.1 工作流级能力

- 选择一个预置模板作为起点
- 在模板基础上修改阶段列表
- 保存工作流蓝图到 Launcher 内部状态
- 开局前可反复编辑，不立即影响已运行流程
- 启动时把工作流蓝图一次性发送给 daemon

### 4.2 阶段级能力

每个阶段至少支持：

- 阶段名称
- 阶段类型：`planning` 或 `execution`
- 是否启用
- 阶段描述
- 开场目标说明
- 开场提示词
- 起始接收方：`expert` 或 `inspector`
- 推荐 skill 列表
- 审阅提示词
- CEO gate 审核提示词
- 完成标准说明
- 是否允许作为起始阶段

### 4.3 模板级能力

至少提供以下预置模板：

- 标准全链路模板
- 直接执行模板
- 架构设计模板
- 修复缺陷模板
- 审计复核模板

### 4.4 运行时能力

- orchestrator 按当前阶段配置决定先释放给 Expert 还是 Inspector
- 当前阶段 prompt 自动注入推荐 skill 列表
- CEO gate 时自动附带本阶段审批规则
- `get_task_context` 能返回当前阶段蓝图摘要
- 状态同步中可看到当前阶段配置标识与阶段进度

---

## 五、非目标

本阶段不做以下内容：

- 多并行阶段执行
- 阶段图形拖拽连线编辑器
- 模板云同步
- 运行中热修改工作流蓝图
- 用户自定义 tool schema
- 动态新增角色类型
- Worker 子代理体系回归

这些会显著扩大改造面，不适合作为本轮第一实现目标。

---

## 六、总体设计原则

### 6.1 默认可用，配置可覆写

系统仍应内建一套高质量默认模板。用户不做复杂编辑时，也能直接开始。

### 6.2 配置驱动，而不是分支堆叠

不应继续在 `taskType`、`startMode`、`phase` 之上叠加更多 if/else。应该由统一配置对象驱动行为。

### 6.3 Prompt 模板库与运行时配置分离

固定提示词库负责提供默认文本和默认 skill 组合。
运行时配置负责决定本次工作流具体使用哪些模板、哪些覆写、哪些顺序。

### 6.4 LauncherHome 负责编辑，Orchestrator 负责执行

- LauncherHome 只负责配置与展示
- Store 负责持久化 UI 草稿态
- Daemon / Orchestrator 负责运行时状态推进

### 6.5 保持 v2 的 3 角色拓扑不回退

这次编排增强不能把系统拉回 v1 的 5 主角色或 worker 模型。所有新能力都必须建立在 `ceo/expert/inspector` 上。

---

## 七、目标数据模型

### 7.1 顶层对象

建议在前后端统一引入：

```ts
interface WorkflowBlueprint {
  version: 1;
  templateId: string | null;
  name: string;
  description: string;
  startMode: "full" | "direct-execution";
  initialTask: string;
  globalPolicy: GlobalPolicy;
  stages: StageBlueprint[];
}
```

### 7.2 全局策略对象

```ts
interface GlobalPolicy {
  defaultSkillMode: "template" | "manual" | "merged";
  ceoStrictness: "strict" | "balanced" | "custom";
  requireProjectSurvey: boolean;
  allowDirectExecutionWithoutPlanning: boolean;
}
```

说明：

- `defaultSkillMode` 决定模板 skill 与用户自选 skill 的合并策略
- `ceoStrictness` 决定若用户未填自定义 CEO 审批词时应采用的默认强度
- `requireProjectSurvey` 控制开场提示中是否显式要求先读 `AGENTS.md` 和核心代码

### 7.3 阶段对象

```ts
interface StageBlueprint {
  id: string;
  order: number;
  enabled: boolean;
  name: string;
  phaseType: "planning" | "execution";
  objective: string;
  description: string;
  openerTarget: "expert" | "inspector";
  openerPrompt: string;
  reviewerPrompt: string;
  ceoGatePrompt: string;
  recommendedSkills: string[];
  completionRule: string;
  templateSource: string | null;
}
```

说明：

- `openerTarget` 决定启动当前阶段时，第一条工作消息先发给谁
- `openerPrompt` 是阶段开场提示词
- `reviewerPrompt` 是审阅方在该阶段应使用的额外上下文
- `ceoGatePrompt` 是 CEO 审批标准注入
- `recommendedSkills` 是本阶段显式附带的 skill key
- `completionRule` 用于说明本阶段何时算完成，便于 Expert / Inspector / CEO 对齐认知

### 7.4 运行时状态对象

建议 daemon 在 `toJSON()` 状态输出中增加：

```ts
interface RuntimeBlueprintState {
  blueprintName: string;
  templateId: string | null;
  currentStageId: string | null;
  currentStageIndex: number;
  totalStages: number;
  currentStageSummary: {
    name: string;
    phaseType: "planning" | "execution";
    openerTarget: "expert" | "inspector";
  } | null;
}
```

这样前端运行态可直接显示当前处于哪个阶段，而不是只显示 planning / execution。

---

## 八、预置模板设计

### 8.1 标准全链路模板

适用于从任务理解到规划、实施、终审的完整流程。

建议阶段：

1. 需求理解与边界澄清
2. 规划草案
3. 规划门控审批
4. 分阶段实施
5. 最终复核与 CEO 终审

### 8.2 直接执行模板

适用于用户明确要求快速落地，不做完整规划对峙。

建议阶段：

1. 执行前快速分析
2. 第一阶段实施
3. 后续阶段实施
4. 最终复核与 CEO 终审

### 8.3 架构设计模板

适用于偏设计输出而非落代码的任务。

建议阶段：

1. 现状调研
2. 架构候选方案
3. 风险对照审查
4. CEO 决策门控

### 8.4 修复缺陷模板

适用于缺陷定位、修复、验证闭环。

建议阶段：

1. 缺陷复现与定位
2. 修复策略与影响面分析
3. 实施与回归验证
4. 终审

### 8.5 审计复核模板

适用于以审查为主、不一定落代码的任务。

建议阶段：

1. 审计标准建立
2. Expert 证据收集
3. Inspector 对照审查
4. CEO 判定

---

## 九、前端 UI 规划

### 9.1 LauncherHome 新定位

LauncherHome 不再是：

- 任务名称输入框
- taskType chips
- 旧 Agent 注册列表
- 旧角色分配按钮

而应变成：

- 蓝图模板选择区
- 工作流基础信息区
- 阶段列表编辑区
- 阶段详情编辑区
- 启动检查区

### 9.2 页面结构建议

建议布局：

```text
┌─────────────────────────────────────────────┐
│ Blueprint Header                            │
│ 名称 / 描述 / 模板 / 启动模式                │
├───────────────────────┬─────────────────────┤
│ 阶段列表               │ 阶段详情             │
│ Stage 1               │ 名称                 │
│ Stage 2               │ 开场目标             │
│ Stage 3               │ openerTarget         │
│ + 新增阶段             │ openerPrompt         │
│                       │ reviewerPrompt       │
│                       │ ceoGatePrompt        │
│                       │ recommendedSkills    │
│                       │ completionRule       │
├───────────────────────┴─────────────────────┤
│ 启动摘要 / 校验提示 / 启动按钮               │
└─────────────────────────────────────────────┘
```

### 9.3 基础信息区字段

- Blueprint 名称
- 启动模式
- 模板来源
- 用户原始任务描述
- 全局策略开关

### 9.4 阶段列表区行为

- 按顺序展示阶段卡片
- 支持启用/禁用
- 支持上移/下移
- 支持复制阶段
- 支持从模板重置阶段
- 支持新增空白阶段

### 9.5 阶段详情区字段

- 阶段名称
- 阶段类型
- 开场对象
- 阶段目标
- 阶段描述
- 开场提示词
- 审阅提示词
- CEO 审批提示词
- 推荐 skill 多选
- 完成标准

### 9.6 启动校验区

至少检查：

- 是否至少有一个启用阶段
- 第一启用阶段是否与 `startMode` 兼容
- 每个启用阶段是否填写名称与开场提示词
- 每个启用阶段是否存在合法 `openerTarget`
- 若存在 CEO 审批阶段，是否填写审批规则

---

## 十、Store 改造规划

### 10.1 现状问题

当前 `mlraStore.ts` 仍保留大量 v1 残留：

- `registeredAgents`
- 角色分配逻辑
- `workerRole`
- 多槽位角色视图模型

这些并不适合承载新的蓝图编辑体验。

### 10.2 建议新增字段

在 Launcher 上新增：

```ts
interface Launcher {
  blueprint: WorkflowBlueprint;
  blueprintDirty: boolean;
  selectedStageId: string | null;
}
```

### 10.3 建议新增 action

- `setBlueprintMeta(launcherId, patch)`
- `selectStage(launcherId, stageId)`
- `addStage(launcherId, partialStage?)`
- `updateStage(launcherId, stageId, patch)`
- `removeStage(launcherId, stageId)`
- `moveStageUp(launcherId, stageId)`
- `moveStageDown(launcherId, stageId)`
- `duplicateStage(launcherId, stageId)`
- `applyBlueprintTemplate(launcherId, templateId)`
- `validateBlueprint(launcherId)`

### 10.4 兼容策略

建议不要在第一步同时清理所有旧字段。

更稳妥的做法：

1. 先新增 `blueprint`
2. 让 LauncherHome 改读新字段
3. 启动链路改从 `blueprint` 生成 payload
4. 确认运行稳定后，再删除 `registeredAgents` 和旧角色分配 UI

---

## 十一、启动协议改造规划

### 11.1 现状

当前 `mlra_start` 仅携带：

- `userTask`
- `startMode`
- `taskType`
- `launcherId`

这不足以表达阶段编排配置。

### 11.2 目标 payload

建议扩展为：

```ts
{
  type: "mlra_start",
  config: {
    launcherId: string,
    userTask: string,
    startMode: "full" | "direct-execution",
    taskType: string | null,
    blueprint: WorkflowBlueprint,
  }
}
```

### 11.3 设计判断

应保留 `taskType` 作为粗粒度分类标签，但它应从“主控制参数”降级为“模板与统计辅助字段”。

真正控制运行逻辑的对象应是 `blueprint`。

---

## 十二、Orchestrator 改造规划

### 12.1 新职责

Orchestrator 在保持 3 角色固定拓扑不变的前提下，需要新增对阶段蓝图的运行支持。

它需要：

- 保存 blueprint
- 识别当前阶段
- 启动时按阶段配置决定第一跳发送对象
- CEO gate 时读取当前阶段审批提示词
- 阶段完成时推进到下一个启用阶段

### 12.2 建议新增状态

```js
this.blueprint = null;
this.currentStageIndex = -1;
this.currentStageId = null;
```

### 12.3 启动时逻辑

建议流程：

1. 接收 `blueprint`
2. 校验所有启用阶段
3. 选定第一个启用阶段
4. 设置 `currentStageId` / `currentStageIndex`
5. 依据该阶段的 `openerTarget` 释放给对应角色
6. 另一角色收到阶段上下文的 stand-by 说明

### 12.4 阶段推进逻辑

执行过程不再只是：

- planning -> execution

而应变为：

- stage 1 -> stage 2 -> stage 3 -> ...

`phaseType` 仍存在，但它只是阶段属性，而不是唯一推进坐标。

### 12.5 与 CEO gate 的关系

每当某阶段进入 CEO gate：

- 读取当前阶段 `ceoGatePrompt`
- 将其与当前阶段产物、原始任务、阶段目标一起组装为 CEO gate 输入

这样 CEO 的判定标准就可由用户编排，而不是固定文案。

---

## 十三、Prompt Builder 改造规划

### 13.1 当前问题

`prompts.mjs` 当前是固定模板体系：

- 固定初始 prompt
- 固定 routing prompt
- 固定 skill 引导
- 固定 CEO gate 文案

这与“可编排阶段”目标冲突。

### 13.2 新职责拆分

建议把 prompt 层拆成两类：

#### A. 默认模板库

用于提供：

- 默认 openerPrompt
- 默认 reviewerPrompt
- 默认 ceoGatePrompt
- 默认 recommendedSkills

#### B. 运行时渲染器

用于把以下信息合成为最终 prompt：

- 当前角色
- 当前阶段配置
- 原始用户任务
- 当前阶段目标
- 当前阶段推荐 skill
- 当前阶段审批条件

### 13.3 目标函数建议

```js
buildStageOpeningPrompt(role, stage, task, policy)
buildStageReviewPrompt(sourceRole, targetRole, stage, content, policy)
buildStageGatePrompt(stage, task, materials, policy)
buildStageTransitionPrompt(nextStage, previousOutput)
```

### 13.4 关键设计原则

- 保留现有 skill 路径体系
- 允许阶段配置覆写默认文案
- 没填的字段自动回退默认模板
- 所有 prompt 仍保持“用户视角错觉”原则

---

## 十四、MCP Server 侧影响

MCP server 本身不需要大改 tool schema。

原因：

- Expert 仍然用 `expert_submit` / `expert_vote`
- Inspector 仍然用 `inspector_submit` / `inspector_vote`
- CEO 仍然用 `ceo_verdict`

真正改变的是这些 server 收到的用户消息内容。

因此，这一层主要只需要：

- `get_task_context` 返回更多阶段蓝图信息
- tool description 文案可以补充“请按当前阶段提示词和 skill 执行”

这意味着该需求对 server 的冲击很小，主战场仍是 UI、store、orchestrator、prompt builder。

---

## 十五、模板与默认值策略

### 15.1 默认推荐 skill 策略

每个阶段模板自带一组默认 skill key。

例如：

- 规划草案阶段：`intent_classification`、`codebase_assessment`、`submit_plan_draft`
- 规划审查阶段：`review_plan`、`decision_levels`
- 实施阶段：`submit_phase_report`、`re_verify`
- CEO gate：`ceo_verdict`、`hallucination_check`

### 15.2 文案覆盖优先级

建议优先级：

1. 用户在阶段中填写的自定义 prompt
2. 模板预置 prompt
3. 系统内置默认 prompt

### 15.3 严格性策略

对于 CEO gate，若用户未写自定义 prompt，可按全局 `ceoStrictness` 自动生成不同强度的默认文案。

---

## 十六、实施阶段拆分

### Phase A：数据模型落地

目标：先打通概念，不动运行逻辑。

内容：

- 定义 `WorkflowBlueprint` / `StageBlueprint`
- 在 `mlraStore.ts` 中挂载 blueprint
- 提供模板生成器
- Launcher 创建时默认生成一个基础 blueprint

产出：

- 前端可持有完整阶段配置
- 不改 daemon 也能先渲染新 UI

### Phase B：LauncherHome 重构

目标：把 LauncherHome 改成阶段编排器编辑界面。

内容：

- 删除旧角色分配交互
- 接入模板选择器
- 接入阶段列表与阶段详情编辑
- 接入启动前校验展示

产出：

- 用户可在 UI 中编辑工作流蓝图

### Phase C：启动协议扩展

目标：让前端能把 blueprint 发给 daemon。

内容：

- 扩展 `mlra_start` payload
- Tauri 通道不变，仅透传 JSON
- daemon 解析并校验 blueprint

产出：

- daemon 可拿到真实编排配置

### Phase D：Orchestrator 运行时改造

目标：按 blueprint 启动与推进阶段。

内容：

- 增加 blueprint 状态
- 当前阶段推进改为 stage index 驱动
- openerTarget 决定第一跳
- CEO gate 绑定当前阶段审批 prompt

产出：

- 工作流真正受用户配置控制

### Phase E：Prompt Builder 配置化

目标：把固定模板迁移为“默认模板 + 运行时覆写”。

内容：

- 保留现有 skill 库
- 增加 stage-aware prompt builders
- 将阶段 prompt 注入各类路由消息

产出：

- 用户自定义 prompt 与模板 prompt 开始真正生效

### Phase F：运行态 UI 对齐

目标：让运行页显示当前阶段信息，而不是只有 planning / execution。

内容：

- 标题栏展示当前 stage 名称
- 侧边栏展示蓝图摘要
- Agent 列可显示当前阶段目标与 skill 提示

产出：

- 运行态对工作流蓝图可感知

---

## 十七、验收标准

### 17.1 配置层验收

- 用户可以从 LauncherHome 选择模板
- 用户可以编辑至少 3 个阶段字段：开场提示、起始对象、CEO 审批提示
- 启动前校验能阻止明显非法配置

### 17.2 协议层验收

- `mlra_start` 能携带完整 blueprint
- daemon 能接受并存储 blueprint
- `mlra_orchestration_status` 能返回当前阶段摘要

### 17.3 运行层验收

- 第一个启用阶段能按 `openerTarget` 正确唤醒目标角色
- 推荐 skill 会出现在实际收到的 prompt 中
- CEO gate 会附带当前阶段审批规则
- 阶段完成后能进入下一个启用阶段

### 17.4 UI 验收

- LauncherHome 不再出现 v1 的 5 角色手工分配核心流程
- 运行态能看到当前阶段名称和阶段摘要
- 用户能区分“模板默认值”和“自定义覆盖值”

---

## 十八、主要风险与应对

### 风险 1：改造过大，UI 与后端脱节

应对：

- 必须按 Phase A -> F 分步推进
- 先落 schema，再改 UI，再接启动链路

### 风险 2：Prompt 自由度过高导致质量不稳定

应对：

- 保留强默认模板
- 使用模板默认值作为兜底
- 首版不支持完全空白自由编排

### 风险 3：阶段模型与现有 phase 机制冲突

应对：

- 保留 `phaseType` 作为阶段属性
- 运行推进以 stage index 为主，phase 仅作分类

### 风险 4：前端状态过渡期存在旧字段污染

应对：

- blueprint 先并存
- 等运行稳定后再删除旧字段

### 风险 5：CEO gate 自定义 prompt 过长，削弱核心规则

应对：

- 把系统硬性规则与用户自定义审批词分开拼接
- 防御锁、连续确认等核心机制继续由 orchestrator 固定实现

---

## 十九、推荐的第一轮最小实现

如果要尽快进入可开发状态，建议第一轮只做以下最小闭环：

1. 新增 blueprint schema
2. LauncherHome 改成模板选择 + 阶段列表 + 阶段详情编辑
3. `mlra_start` 支持发送 blueprint
4. orchestrator 支持读取第一阶段并按 `openerTarget` 启动
5. CEO gate 支持注入 `ceoGatePrompt`

先不要做：

- 运行时蓝图热编辑
- 模板持久化库
- 复杂阶段复制导入导出
- 图形化流程图编辑

这样可以最快验证需求核心价值。

---

## 二十、结论

LauncherHome 的下一步不是简单“适配 v2 UI”，而是承担 MLRA v2 的真正编排入口职责。

它应从一个启动页升级为一个可编辑、可模板化、可驱动 daemon prompt 行为的工作流蓝图编辑器。

只有这样，以下目标才能同时成立：

- v2 固定 3 角色拓扑保持简洁
- 用户可以在开局前定义阶段工作方式
- prompt 工程从硬编码迈向配置驱动
- CEO 审批标准真正受阶段语义约束
- LauncherHome 成为 MLRA 的核心控制面，而不是临时过渡页

这也是当前需求最合理、最稳、最可持续的落地路径。