---
title: MLRA蓝图工作台与出口认证改造会话摘要
description: 汇总MLRA UI、阶段模板、出口认证与二次验收工作
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
solved_lists:
  - 完成MLRA Blueprint Workbench多轮UI精修
  - 完成阶段模板与runtime prompt净化
  - 移除progress参数及配套状态
  - 完成投票工具向阶段出口认证语义收敛
  - 增加daemon出口认证运行时门槛
  - 完成二次验收与UI冗余清理
---

# MLRA蓝图工作台与出口认证改造会话摘要

## 1. Previous Conversation

本轮长会话围绕 `my-last-feedback` 仓库中的 MLRA Blueprint Workbench、阶段模板系统、MCP runtime prompt 以及阶段出口机制持续迭代。

早期主要是 MLRA Blueprint Workbench 的 UI 精修。用户连续提出了多项界面要求，包括：

- 阶段图标选择框只显示一个紧凑的正方形入口。
- 顶部第二行四个标签页改为类似浏览器的标签页样式。
- 技能列表改为更紧凑的两行/网格式展示。
- 将阶段门控从对勾改为开关，并让门控规则提示词可编辑。
- 彻底删除阶段停用/禁用设计。
- 右侧阶段身份区改为一行显示：序号、图标、命名、门控按钮。
- 移除左侧栏顶部“蓝图配置”文本行。
- 移除“蓝图描述”，保留“任务描述”。
- 修复顶栏 MLFB / MLRA 切换器按钮圆角。
- 调整左右侧栏背景，浅色为白底，深色保持中性，不额外加彩色 tint。
- 删除“阶段说明”大标题，仅保留“阶段描述”字段。

随后用户把关注点从 UI 精修转向 MLRA prompt/runtime 语义清理。核心要求是：

> “让 ai 始终认为自己在向用户提交内容或在向用户交流，避免透漏任何关于 agent 名称相关的信息，避免让 ai 认为自己在与其他 ai 协作。移除所有关于循环次数相关的提示或者暗示，避免 ai 被蛊惑提前偷懒完成任务。并且请你移除 `progress` 参数以及相关的提示信息配套，ai 无需使用该参数。”

围绕该要求，已清理阶段模板 JSON、前端 store 镜像、runtime prompt builder、MCP server tool descriptions、daemon/orchestrator 状态和 submit 链路，移除了 `progress` 参数、`lastProgress` 状态，以及“循环/轮次/双方协作”类模型可见提示。

之后用户询问“阶段的角色提示词会被如何使用”，已解释：阶段角色提示词存在 `StageBlueprint` 中，运行时由 `buildInitialPrompt` 和 `buildRoutingPrompt` 作为 `Stage Directive` 注入。用户继续追问“agent 如果收到来自其他 agent 的信息，会看到什么样的完整信息”，已解释 daemon 会把内容包装成用户视角材料，形式为 `prefix + payload + suffix`，不会直接暴露 caller id、agent id 或“来自某 agent”的字样，但 payload 本身不会被语义清洗。

随后用户担心 `expert_vote` / `inspector_vote` 被模型误用为“完毕按钮”。基于分析，先创建了规划文档：

- `.myLastChat/MLC_MLRA阶段出口认证与投票工具收敛规划书.md`

规划提出将投票工具收敛为“阶段出口认证”，并从提示词、工具 schema、daemon 运行时、UI 文案、外部 skill 文件五层治理。

用户随后要求“git 后实施”。已先执行备份提交：

```text
commit e692648 chore: backup mlra blueprint and prompt refinements
```

随后实施了出口认证改造，并完成二次验收和 UI 冗余清理。

## 2. Current Work

当前最近工作是二次验收与冗余代码清理，用户原话为：

> “很好！现在请你彻底检查一下，尤其是 UI 界面是否存在冗余代码，请你做一次大清理：请你进行完整的检查，确保新功能完整，没有严重 bug 和严重风险，老旧冗余代码清理干净。Perform secondary verification after feature development. Confirm all requirements are fully and correctly implemented.”

按要求执行了：

- 从会话中抽取原始需求。
- 检查 UI、store、stage templates、MCP servers、protocol prompts、daemon runtime、外部 `vote_discipline.md`。
- 扫描旧概念残留，包括 `PhaseToggle`、`stage.enabled`、`enabledStages`、`蓝图描述`、`progress?`、`lastProgress`、`等待对方`、`投票通过`、`both sides`、`counterparty`、`iteration`、`Vote when` 等。
- 运行 `app` 前端正式构建。
- 运行 Node `.mjs` 语法检查。
- 用 `Orchestrator` 直接进行出口认证行为模拟。

二次验收时发现两个 UI 冗余代码：

```text
src/components/LauncherHomeNodeWorkbench.tsx:579:9 - error TS6133: 'setStageIcon' is declared but its value is never read.
src/components/LauncherHomeNodeWorkbench.tsx:646:9 - error TS6133: 'selectedStageIssues' is declared but its value is never read.
```

已删除 `setStageIcon` 和 `selectedStageIssues`。再次运行 `npm run build` 后构建通过，仅剩 Vite 既有 chunk-size / Tauri dynamic import warning，不属于当前功能错误。

当前工作树状态：

- 备份提交 `e692648` 已完成。
- 出口认证实施与二次验收后的改动尚未再次提交。
- 当前 repo 内有 10 个修改文件。
- 外部文件 `c:\Users\Aftersix\.copilot\skills\mlra\vote_discipline.md` 已被修改，但不属于 git repo。

## 3. Key Technical Concepts

- React 19 + TypeScript + Vite 7 前端。
- Tauri 2 桌面应用壳。
- Zustand store，核心文件为 `app/src/store/mlraStore.ts`。
- MLRA Blueprint Workbench，核心 UI 为 `LauncherHomeNodeWorkbench.tsx`。
- `WorkflowBlueprint` / `StageBlueprint` 蓝图阶段模型。
- 内置阶段模板：`deliberation`、`delivery`、`closing`。
- 阶段模板源文件位于 `mcp_prompts/stage_templates/*.json`。
- 前端模板镜像位于 `STAGE_TEMPLATE_PRESETS`。
- MCP servers：`mcp-expert.mjs`、`mcp-inspector.mjs`、`mcp-ceo.mjs`。
- Runtime prompt builder：`mcp/mlra/protocol/prompts.mjs`。
- Daemon orchestration state machine：`mcp/mlra/daemon/orchestrator.mjs`。
- `buildInitialPrompt(role, userTask, stage, options)`：阶段开始时构建初始 prompt。
- `buildRoutingPrompt(sourceRole, targetRole, stage, context)`：跨端路由时包装消息。
- `Stage Directive`：阶段角色提示词注入位置。
- `Exit Gate Rule Prompt`：阶段出口门控规则提示词注入位置，仅 `routingReason === "stage_gate"` 时追加。
- `expert_submit({ content })` / `inspector_submit({ content })`：常规提交工具。
- `expert_vote` / `inspector_vote`：目前仍保留工具名，但模型可见语义已收敛为 stage-exit certification。
- `certification` structured checklist：`pass` 时必需的结构化自证字段。
- `stageExitReadiness`：daemon 内部 readiness 状态，用于拒绝过早 pass。
- 外部 skill：`c:\Users\Aftersix\.copilot\skills\mlra\vote_discipline.md`。

重要编码约束和操作习惯：

- 修改文件使用 `apply_patch`。
- 运行终端前会向用户说明目的；本轮用户已多次明确要求执行验证和 git 操作。
- 完成请求前必须调用 `mcp_my-last-feedb_interactive_feedback`，`agent_name` 固定为 `02FB`。
- `.myLastChat/` 文档需带 YAML frontmatter。

## 4. Relevant Files and Code

### app/src/components/LauncherHomeNodeWorkbench.tsx

用途：MLRA Blueprint Workbench 主界面。

关键状态：

- 左侧仅保留“蓝图模板”和“任务描述”。
- 中间是阶段流程图和阶段卡片。
- 右侧 identity row 为一行：序号、图标、阶段名称、门控按钮。
- 右侧 tabs 包括基础、角色提示词、出口门控、技能。
- 门控规则提示词可编辑。
- 技能包可编辑。

近期清理：

- 删除未使用 `setStageIcon`。
- 删除未使用 `selectedStageIssues`。
- UI 文案从“关闭后阶段投票通过即直进下一阶段”改为“关闭后出口认证满足即直进下一阶段”。

相关片段：

```tsx
<label className="mlra-task-label">任务描述</label>
```

```tsx
<DetailSection title="出口门控">
  <label className="mlra-task-label">门控规则提示词</label>
```

### app/src/store/mlraStore.ts

用途：MLRA 前端状态和模板镜像。

关键改动：

- `STAGE_TEMPLATE_PRESETS` 中的 `promptExpert` / `promptInspector` 已加入 `Stage Exit Certification Rule`。
- `progress` / `lastProgress` 运行时状态已移除。
- `BLUEPRINT_TEMPLATES` 中旧“交付循环”表述已改为“交付验证”。

重要模板语义：

```text
Do not use `expert_vote` as a completion marker for your latest response.
Use `expert_vote(vote="pass", ...)` only after a full self-audit confirms...
```

### mcp_prompts/stage_templates/deliberation.json

用途：论证评审阶段模板源文件。

关键改动：

- prompt 面向用户。
- 常规工作使用 `expert_submit` / `inspector_submit`。
- 阶段出口认证被定义为严格 self-audit 后才可使用。

### mcp_prompts/stage_templates/delivery.json

用途：交付验证阶段模板源文件。

关键改动：

- 强调实际改动和本地验证。
- 不再把 vote 当作普通下一步。
- 交付端和审查端都加入 certification rule。

### mcp_prompts/stage_templates/closing.json

用途：结束汇总阶段模板。

当前状态：

- 面向用户输出最终 wrap-up。
- 调用 `interactive_feedback` 等待用户响应。
- 不含 progress、循环次数、投票语义。

### mcp/mlra/protocol/prompts.mjs

用途：构造 MLRA 初始 prompt 和路由 prompt。

关键改动：

- `buildRoutingHint` 不再写 “Vote when...” 语义。
- fallback prompt 不再诱导 “ready -> vote”。
- 普通路由 suffix 主要提醒 submit，并阻止不确定时出口认证。

核心模式：

```js
const stageDirective = (() => {
  const text = (targetRole === ROLES.EXPERT ? stage.promptExpert : null)
    || (targetRole === ROLES.INSPECTOR ? stage.promptInspector : null)
    || (targetRole === ROLES.CEO ? stage.promptCeo : null)
    || stage.promptOverride;
  return renderStageDirective("Stage Directive", text);
})();
```

### mcp/mlra/servers/mcp-expert.mjs

用途：Expert MCP server。

关键改动：

- `expert_submit` 只接收 `content`。
- `expert_vote` 工具描述改为 stage-exit certification。
- 新增 `stageExitCertificationSchema`。

核心 schema：

```js
const stageExitCertificationSchema = z.object({
  originalRequestSatisfied: z.boolean(),
  stageDirectiveSatisfied: z.boolean(),
  feedbackResolved: z.boolean(),
  directVerificationEvidence: z.string(),
  unresolvedConcerns: z.string(),
  exitRationale: z.string(),
});
```

### mcp/mlra/servers/mcp-inspector.mjs

用途：Inspector MCP server。

关键改动：

- 修复 `inspector_submit` 描述断行语法风险。
- `inspector_vote` 工具描述改为 stage-exit certification。
- 新增同样的 `stageExitCertificationSchema`。

### mcp/mlra/daemon/index.mjs

用途：daemon 消息分发。

关键改动：

- `EXPERT_VOTE` 和 `INSPECTOR_VOTE` 现在会解构并转发 `certification`。

```js
const { vote, reason, certification } = msg;
const result = this.orchestrator.handleExpertVote(vote, reason, certification);
```

### mcp/mlra/protocol/messages.mjs

用途：协议消息类型定义。

关键改动：

- vote 注释更新为 `{ vote, reason, certification? }`。

### mcp/mlra/daemon/orchestrator.mjs

用途：MLRA runtime 状态机。

关键改动：

- 新增 `stageExitReadiness`。
- 新 submit 会清空旧认证。
- pass 前必须校验阶段产出、审查状态、材料 freshness、结构化 certification 和 reason。
- `reject` 会保持阶段 active，并要求继续 submit 缺失材料。
- 移除“等待对方投票”返回文案。

核心状态：

```js
_emptyStageExitReadiness() {
  return {
    deliverableVersion: 0,
    reviewedDeliverableVersion: 0,
    hasDeliverable: false,
    hasReview: false,
    certifications: { expert: null, inspector: null },
  };
}
```

核心校验：

```js
if (!readiness.hasDeliverable) failures.push("no stage deliverable has been submitted yet");
if (!readiness.hasReview) failures.push("the current stage material has not completed review yet");
if (readiness.reviewedDeliverableVersion !== readiness.deliverableVersion) {
  failures.push("the latest stage material has changed since the last review");
}
```

### app/src/index.css

用途：全局 UI 样式和 MLRA workbench 样式。

相关已验证点：

- `.app-view-toggle` 圆角为 6px，按钮圆角为 4px。
- `.mlra-gate-switch` 开关样式存在。
- 旧 `phase-toggle` / `stage-disabled` / `workbench-config-title` 等无残留。

### c:\Users\Aftersix\.copilot\skills\mlra\vote_discipline.md

用途：外部 MLRA skill 文件。

关键改动：

- 改为 `Stage Exit Certification Discipline`。
- 移除 rounds、iteration、both sides、counterparty、CEO gate 等旧语义。
- 明确 certification tool 不是 completion marker。

## 5. Problem Solving

### UI 冗余清理

问题：`npm run build` 报 TypeScript 未使用变量。

解决：删除 `LauncherHomeNodeWorkbench.tsx` 中未使用的 `setStageIcon` 和 `selectedStageIssues`。

验证：再次运行 `npm run build` 成功。

### 投票工具误用风险

问题：模型可能把 `expert_vote` / `inspector_vote` 理解为“我做完了”。

解决：

- 模型可见提示改为 stage-exit certification。
- 普通路由不再反复提示 vote。
- 工具 schema 增加结构化 certification。
- daemon 拒绝过早 pass。

行为模拟结果：

```json
[
  ["early pass", "rejected"],
  ["pass before review", "rejected"],
  ["pass without certification", "rejected"],
  ["inspector certified", "recorded"],
  ["expert certified", "passed"]
]
```

### progress 参数移除

问题：旧 submit 工具、runtime state 和历史 prompt 曾包含 `progress` / `lastProgress`。

解决：

- MCP submit schema 移除 `progress`。
- daemon submit handler 不再解构或记录 `progress`。
- orchestrator `lastProgress` 移除。
- store launcher runtime 状态移除 `lastProgress`。
- 残留扫描确认 runtime/app/templates 中无 `progress?` 和 `lastProgress`。

### 多 agent 叙事隐藏

问题：阶段模板、tool description、路由 prompt、skill 文件中曾出现 both sides、counterparty、CEO wakes、loop、iteration 等概念。

解决：

- prompt builder 改为 user-facing material / review feedback。
- tool descriptions 不再说 both sides / reviewer / CEO wakes。
- gate 防御提示不再出现第几轮/第几次。
- 外部 `vote_discipline.md` 重写。

### 验证状态

已运行：

- `npm run build` in `app`：通过。
- `get_errors` 全项目：No errors found。
- `node --check` for modified `.mjs` files：通过。
- runtime/app/templates 风险词扫描：无残留。

构建警告：

- Vite 报 chunk 大小和 Tauri API dynamic import warning。这是既有构建警告，不是当前改造引入的错误。

## 6. Pending Tasks and Next Steps

最近用户的原始请求：

> “请创建一个新摘要文档”

当前任务就是创建本文档，已按要求先查询 MyLastChat，再新建摘要文件。

当前显式待办：

- 保存本文档到 `.myLastChat/MLC_MLRA蓝图工作台与出口认证改造会话摘要.md`。
- 调用 `interactive_feedback` 告知用户 CREATED 路径。

后续可能任务：

- 如果用户要求，可将出口认证实施后的 10 个 repo 文件再次 git add / commit。
- 如果用户要求，可进入 Phase 5，新增模型可见工具名 `certify_stage_exit` / `block_stage_exit`，并逐步弃用 `expert_vote` / `inspector_vote`。
- 如果用户要求，可清理旧 `.myLastChat` 历史文档中的旧投票/阶段/循环术语；这些旧文档目前不进入 runtime prompt，不构成运行风险。

当前未提交改动范围：

```text
app/src/components/LauncherHomeNodeWorkbench.tsx
app/src/store/mlraStore.ts
mcp/mlra/daemon/index.mjs
mcp/mlra/daemon/orchestrator.mjs
mcp/mlra/protocol/messages.mjs
mcp/mlra/protocol/prompts.mjs
mcp/mlra/servers/mcp-expert.mjs
mcp/mlra/servers/mcp-inspector.mjs
mcp_prompts/stage_templates/deliberation.json
mcp_prompts/stage_templates/delivery.json
```

外部已修改但不属于 git repo 的文件：

```text
c:\Users\Aftersix\.copilot\skills\mlra\vote_discipline.md
```
