---
title: MLRA阶段出口认证与投票工具收敛规划书
description: 将投票工具改造为严格阶段出口认证的完整实施规划
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLRA
  - prompt-engineering
  - orchestration
  - stage-exit-certification
solved_lists:
  - 分析投票工具被误用为完毕按钮的风险
  - 设计阶段出口认证的语义、提示、工具和运行时约束
  - 制定分阶段实施与验收方案
---

# MLRA 阶段出口认证与投票工具收敛规划书

更新时间：2026-04-25

## 1. 背景

当前 MLRA 阶段系统已经支持按蓝图阶段运行，并提供 `expert_vote` / `inspector_vote` 用于触发阶段出口。前一轮提示词净化已经移除了 `progress` 参数、轮次暗示、多 agent 协作叙事和一批显式循环提示。

但当前仍存在一个关键行为风险：模型可能把投票工具理解为“我这次回复或临时任务已经完成”的完毕按钮，而不是“整个当前阶段已经无已知阻塞问题，可以请求阶段出口审查”的严格认证动作。

这会导致以下问题：

- 模型完成一个草案、review、patch、报告后过早调用投票工具。
- 模型把局部 ready 误认为阶段 ready。
- 两个端都过早 `pass` 时，阶段会进入出口门控，增加无意义门控和错误推进风险。
- 如果提示中持续出现 “ready -> vote”，模型会把 vote 当成常规下一步。
- 外部 `vote_discipline.md` 仍含旧版多方协作、轮次和 gate 叙事，会污染模型心智。

因此需要将现有“投票”机制整体收敛为“阶段出口认证”机制，并从提示词、工具描述、工具 schema、daemon 运行时、UI 文案、外部技能文件六个层面同步治理。

## 2. 核心目标

目标语义：

```text
临时任务完成 -> 使用 submit
发现问题或风险 -> 使用 submit 提交 review / risk report
仍有不确定性 -> 不认证
整个阶段无已知阻塞 -> 才进行阶段出口认证
```

模型必须形成以下认知：

- `expert_submit` / `inspector_submit` 是常规工作工具。
- `expert_vote` / `inspector_vote` 不是“完毕按钮”。
- `pass` 不是“我做完了”。
- `pass` 是“我认证整个当前阶段可进入出口审查”。
- 不确定时默认不 `pass`。
- 有任何未验证假设、未解决反馈、缺失证据、开放问题或阻塞风险时，不得 `pass`。

## 3. 非目标

本规划不要求立刻删除内部 `expert` / `inspector` / `ceo` 路由枚举，因为它们仍是 runtime 内部结构。

本规划不以“增加轮次要求”作为解决方案。内部可以维护版本和布尔状态，但不能把“第几轮”“至少几次”等概念暴露给模型。

本规划不要求一次性重命名所有协议消息。模型可见工具名可以分阶段迁移，内部消息名可保留兼容。

## 4. 当前风险点

### 4.1 阶段模板反复提醒 vote

当前阶段模板中存在类似表达：

```text
When the work is genuinely ready for final stage-exit review, use expert_vote(...)
```

该表达本身比旧版安全，但重复出现在模板、store 镜像、fallback prompt 和 routing suffix 中，会让模型把 vote 当作普通流程动作。

### 4.2 工具说明仍然偏软

当前 `expert_vote` / `inspector_vote` 的描述强调 “ready for stage-exit review”，但没有足够明确地区分：

- latest response ready
- local subtask ready
- current material ready
- entire stage ready

模型容易把前两者误解为可以调用 vote。

### 4.3 `vote_discipline.md` 是高风险旧语义

当前外部技能文件 `c:\Users\Aftersix\.copilot\skills\mlra\vote_discipline.md` 包含：

- rounds
- iteration
- both sides
- counterparty
- CEO gate
- phase loop

这些内容与当前“面向用户、隐藏内部协作结构、避免轮次暗示”的目标冲突。

### 4.4 daemon 不拦截过早 pass

当前 orchestrator 中 `handleExpertVote` / `handleInspectorVote` 只检查：

- role 是否连接
- 是否不是 closing stage

然后直接记录 vote。

缺少以下运行时约束：

- 是否已有阶段产出
- 当前产出是否已经被审查
- 是否存在新提交导致旧认证失效
- `reason` 是否有实质内容
- 是否提供直接验证证据
- 是否明确没有未解决风险

### 4.5 返回文案暴露协作结构

当前单方 vote 后返回：

```text
投票已记录，等待对方投票
```

问题：

- 暴露“对方”。
- 强化 vote 是双方流程按钮。
- 与“模型始终认为自己在面向用户工作”的目标冲突。

## 5. 设计原则

### 5.1 术语统一

模型可见文案中尽量使用：

- stage-exit certification
- stage exit certification
- certify stage exit
- stage is ready to exit

尽量避免：

- vote
- polling
- both sides
- counterparty
- other agent
- waiting for the other side
- rounds
- iterations
- phase loop

代码内部可暂时保留 `vote` 相关消息名，但模型可见文案要转为“阶段出口认证”。

### 5.2 pass 是例外动作，不是常规动作

`pass` 必须被塑造成一个低频、严肃、需要自证的认证行为。

普通工作继续使用 submit：

- 草案 -> `expert_submit`
- 交付报告 -> `expert_submit`
- 审查报告 -> `inspector_submit`
- 风险说明 -> `inspector_submit`
- 修正说明 -> `expert_submit`

### 5.3 不确定时不得 pass

模型不能用“我觉得差不多”作为 `pass` 理由。

任何以下情况都应阻止 `pass`：

- 原始任务未完全覆盖
- 当前阶段指令未完全满足
- 反馈未解决
- 验证证据不足
- 引用文件未实际打开
- 测试或检查未执行且没有合理说明
- 存在开放问题
- 存在未验证假设
- 存在已知风险

### 5.4 运行时硬约束优先于纯提示

提示词可以降低误用概率，但不能保证模型不误调用工具。

因此 daemon 必须能够拒绝不合格的 `pass`。

## 6. 目标架构

### 6.1 模型可见工作流

普通阶段中，模型应看到以下行为规则：

```text
Use submit tools for normal work.
Use stage-exit certification only when the entire current stage is ready to exit.
Never use certification as a completion marker for your latest response.
```

### 6.2 认证条件

`pass` 必须满足：

- Original request satisfied for this stage.
- Current stage directive fully satisfied.
- All known feedback resolved.
- Direct verification evidence checked.
- No known unresolved concerns.
- No missing checks that would affect correctness or user value.

### 6.3 运行时 readiness 状态

建议新增内部状态：

```js
stageExitReadiness: {
  deliverableVersion: 0,
  reviewedDeliverableVersion: 0,
  hasDeliverable: false,
  hasReview: false,
  certifications: {
    expert: null,
    inspector: null,
  },
}
```

该状态只用于内部判断，不暴露给模型。

### 6.4 认证失效规则

出现以下事件时，旧认证失效：

- 新的 `expert_submit`
- 新的 `inspector_submit`
- gate rejected
- stage advance
- manual rejection / human review rejection
- stage reset / orchestration restart

核心原则：任何新材料或新反馈都可能改变阶段状态，因此旧认证不能继续有效。

## 7. 工具 schema 设计

### 7.1 兼容方案

短期保留：

```js
expert_vote
inspector_vote
```

但扩展 schema：

```ts
{
  vote: "pass" | "reject",
  reason: string,
  certification: {
    originalRequestSatisfied: boolean,
    stageDirectiveSatisfied: boolean,
    feedbackResolved: boolean,
    directVerificationEvidence: string,
    unresolvedConcerns: string,
    exitRationale: string
  }
}
```

### 7.2 pass 校验规则

当 `vote === "pass"` 时：

- `certification` 必填。
- 三个 boolean 必须为 `true`。
- `directVerificationEvidence` 必须有实质内容。
- `unresolvedConcerns` 必须明确无阻塞。
- `exitRationale` 必须解释为什么阶段可以退出。
- `reason` 不得是空泛短语。

### 7.3 reject 语义

`reject` 表示：

```text
The current stage must not exit because blocking work remains.
```

普通 review 不应使用 `reject`，而应使用 `inspector_submit`。

普通修正不应使用 `reject`，而应使用 `expert_submit`。

### 7.4 长期工具名迁移

长期可新增模型可见工具：

```text
certify_stage_exit
block_stage_exit
```

迁移路径：

1. 先保留旧工具名并强化描述。
2. 新增新工具名作为首选。
3. 阶段模板切换到新工具名。
4. 旧工具名标记 deprecated。
5. 稳定后移除旧工具名或只保留兼容层。

## 8. 提示词改造方案

### 8.1 阶段模板

将现有 “When ready, vote” 改为严格认证规则。

建议专家侧文案：

```md
Use `expert_submit({ content })` for normal deliverables, revisions, reports, and risk notes.

Do not use the stage-exit certification tool as a completion marker for your latest response.
Only certify stage exit after completing the Stage Exit Self-Audit:
- the whole stage objective is satisfied
- all known feedback has been resolved
- direct verification evidence exists
- no blocking risks, missing checks, open questions, or unverified claims remain
```

建议审查侧文案：

```md
Use `inspector_submit({ content })` for normal reviews, verification notes, and risk reports.

Do not certify stage exit merely because a review was written.
Only certify stage exit when the reviewed material is complete, directly verified, and has no known blocking issue.
```

### 8.2 routing suffix

普通路由后缀不再反复提示 vote。

从：

```md
When the material is ready, use inspector_vote(...)
```

改为：

```md
Submit your review via `inspector_submit({ content })`.
Do not request stage-exit certification if any blocking issue, missing verification, unresolved uncertainty, or open user concern remains.
```

执行侧收到反馈时：

```md
Address each item and resubmit via `expert_submit({ content })`.
Do not request stage-exit certification unless the entire stage satisfies the certification rule.
```

### 8.3 fallback prompt

`buildInitialPrompt` 中 fallback action 也要改成相同语义，避免自定义阶段缺少角色提示词时回到旧行为。

### 8.4 buildRoutingHint

即使当前没有调用，也应同步改写，避免未来启用时重新引入旧提示。

## 9. 外部技能文件改造

### 9.1 当前问题

`vote_discipline.md` 当前包含旧版协作模型和轮次叙事，是高风险污染源。

### 9.2 新版建议

```md
# Stage Exit Certification Discipline

The certification tool is not a completion marker.

Use normal submit tools for:
- drafts
- reviews
- reports
- revisions
- risk notes
- verification summaries

Use stage-exit certification only when the entire current stage is ready to exit.

## Pass Criteria

Call `pass` only if all are true:
- The original user request is satisfied for this stage.
- The stage directive is fully satisfied.
- All known feedback has been resolved.
- Direct verification evidence has been checked.
- No blocking risks, missing checks, open questions, or unverified claims remain.
- Further stage work would not change correctness, completeness, or user value.

## Not Ready Criteria

Do not call `pass` if:
- You just finished a local subtask.
- You only produced a first draft.
- You have not checked cited files or outputs.
- You are relying on assumptions.
- There is any known unresolved feedback.
- Your reason would be vague, such as "looks good" or "done".

## Reason Requirements

A valid pass reason must include:
- what stage objective is satisfied
- what evidence was checked
- what feedback was resolved
- why no known blocker remains

If you cannot write that reason truthfully, do not certify stage exit.
```

### 9.3 版本化建议

外部技能文件位于用户目录，不在 repo 内。为避免不同机器行为不一致，建议后续考虑：

- 在 repo 中维护 canonical skill source。
- 启动或构建时同步到 `~/.copilot/skills/mlra/`。
- 或从 `skillRefs` 移除 `vote_discipline`，直到该技能被安全改写。

## 10. daemon 运行时方案

### 10.1 新增状态初始化

在 orchestrator constructor 中新增：

```js
this.stageExitReadiness = this._emptyStageExitReadiness();
```

新增 helper：

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

### 10.2 submit 时更新状态

`handleExpertSubmit` 成功进入 `_trackSubmit` 后：

```js
this.stageExitReadiness.hasDeliverable = true;
this.stageExitReadiness.deliverableVersion += 1;
this.stageExitReadiness.certifications = { expert: null, inspector: null };
```

`handleInspectorSubmit` 成功进入 `_trackSubmit` 后：

```js
this.stageExitReadiness.hasReview = true;
this.stageExitReadiness.reviewedDeliverableVersion = this.stageExitReadiness.deliverableVersion;
this.stageExitReadiness.certifications = { expert: null, inspector: null };
```

### 10.3 pass 前置校验

新增：

```js
_validateStageExitCertification(role, vote, reason, certification) {
  if (vote !== "pass") return { ok: true };

  if (!this.stageExitReadiness.hasDeliverable) {
    return { ok: false, reason: "No stage deliverable has been submitted yet." };
  }

  if (!this.stageExitReadiness.hasReview) {
    return { ok: false, reason: "The current stage material has not completed review yet." };
  }

  if (this.stageExitReadiness.reviewedDeliverableVersion !== this.stageExitReadiness.deliverableVersion) {
    return { ok: false, reason: "The latest stage material has changed since the last review." };
  }

  if (!certification) {
    return { ok: false, reason: "A structured certification checklist is required." };
  }

  // Validate booleans and text fields.
}
```

### 10.4 认证记录

通过校验后：

```js
this.stageExitReadiness.certifications[role] = {
  reason,
  certification,
  deliverableVersion: this.stageExitReadiness.deliverableVersion,
};
```

然后再调用 `_resolveVotes()` 或替代的新 `_resolveStageExitCertifications()`。

### 10.5 返回文案

替换：

```text
投票已记录，等待对方投票
```

为：

```text
Stage-exit certification recorded. The stage remains active until all exit conditions are independently satisfied.
```

替换：

```text
投票通过，进入阶段出口审批
```

为：

```text
Stage-exit certifications accepted. Preparing stage-exit review.
```

拒绝认证时：

```text
Stage-exit certification was not accepted: <reason>
Continue the stage work and submit the missing material first.
```

## 11. UI 改造方案

### 11.1 命名替换

建议 UI 统一替换：

| 旧文案 | 新文案 |
| --- | --- |
| 投票 | 出口认证 |
| 投票通过 | 出口认证通过 |
| 投票未通过 | 出口认证未通过 |
| 等待投票 | 等待出口条件满足 |
| pass | 认证可退出 |
| reject | 阶段未就绪 |
| vote reason | 认证依据 |

### 11.2 状态呈现

如果 UI 展示阶段状态，建议显示：

- 有阶段产出
- 已完成审查
- 最新材料已审查
- 出口认证已记录
- 出口认证未就绪原因

避免显示内部版本号或计数。

## 12. 实施阶段

### Phase 0：基线扫描

目标：确认全部 vote 相关提示点。

检查范围：

- `mcp_prompts/stage_templates/*.json`
- `app/src/store/mlraStore.ts`
- `mcp/mlra/protocol/prompts.mjs`
- `mcp/mlra/servers/mcp-expert.mjs`
- `mcp/mlra/servers/mcp-inspector.mjs`
- `mcp/mlra/daemon/orchestrator.mjs`
- `mcp/mlra/daemon/index.mjs`
- `c:\Users\Aftersix\.copilot\skills\mlra\vote_discipline.md`

搜索关键词：

- `vote pass`
- `vote="pass"`
- `ready for final`
- `stage-exit review`
- `投票`
- `等待对方`
- `both sides`
- `counterparty`
- `rounds`
- `iteration`

### Phase 1：提示词和技能净化

目标：先降低模型误用概率。

改动：

- 重写 `vote_discipline.md`。
- 改阶段 JSON 模板。
- 改 store 镜像模板。
- 改 fallback prompt。
- 改 routing suffix。
- 改 buildRoutingHint。

验收：

- 模型可见文本不再把 vote 描述为普通下一步。
- 不出现 both sides / counterparty / rounds / iteration。
- 普通路由强调 submit，而不是 vote。

### Phase 2：工具说明和 schema 加固

目标：让工具调用本身具备自证要求。

改动：

- `expert_vote` schema 增加 `certification`。
- `inspector_vote` schema 增加 `certification`。
- 修改工具说明。
- 修改 protocol 注释。
- 修改 daemon index 参数转发。

验收：

- `pass` 没有 certification 时被拒绝。
- 空泛 reason 被拒绝。
- certification 里存在 false 或未解决风险时被拒绝。

### Phase 3：daemon readiness gate

目标：运行时阻止过早 pass。

改动：

- 增加 `stageExitReadiness`。
- submit 时更新 readiness。
- 新 submit 使旧认证失效。
- pass 前检查 deliverable/review/material freshness。
- 替换 `_resolveVotes` 返回文案。

验收：

- 阶段一开始直接 pass 被拒绝。
- 只有产出没有审查时 pass 被拒绝。
- 审查后材料被修改，旧认证失效。
- 两个合格认证都存在时才进入 gate。

### Phase 4：UI 文案同步

目标：让用户界面和模型语义一致。

改动：

- UI 中“投票”改为“出口认证”。
- 状态提示避免“等待对方”。
- 日志或状态面板显示认证依据。

验收：

- 用户在界面上看到的是“出口认证”概念。
- UI 不再强化“投票按钮”等旧心智。

### Phase 5：可选工具名迁移

目标：彻底移除模型可见 vote 命名。

新增工具：

- `certify_stage_exit`
- `block_stage_exit`

迁移：

- 模板优先使用新工具。
- 旧工具保留兼容，描述为 deprecated。
- 稳定后移除旧工具引用。

## 13. 验收测试清单

### 13.1 静态扫描

必须无高风险残留：

- `both sides`
- `counterparty`
- `waiting for the other side`
- `等待对方投票`
- `rounds`
- `iteration`
- `vote pass` 作为普通下一步
- `When ready, vote` 类表达

允许残留：

- 内部协议名 `EXPERT_VOTE`
- 兼容期工具名 `expert_vote`
- 兼容期工具名 `inspector_vote`

### 13.2 行为测试

测试场景：

1. 阶段开始后直接 `pass`。
   - 预期：拒绝。

2. 只有执行产出，没有审查时 `pass`。
   - 预期：拒绝。

3. 产出审查后，执行端又提交新材料，然后立刻 `pass`。
   - 预期：拒绝，因为最新材料未审查。

4. certification 缺失 direct verification evidence。
   - 预期：拒绝。

5. certification 有 unresolved concerns。
   - 预期：拒绝。

6. reason 为 `done` / `looks good`。
   - 预期：拒绝。

7. 产出、审查、认证 checklist 都完整。
   - 预期：记录认证。

8. 两个合格认证都记录后。
   - 预期：进入阶段出口门控或阶段推进。

### 13.3 诊断测试

检查：

- TypeScript 无错误。
- JSON 模板无错误。
- MCP server schema 无语法错误。
- daemon message handling 无参数遗漏。
- 老 blueprint 缺少 certification 字段时不会崩溃，而是给出可理解拒绝。

## 14. 风险与缓解

### 14.1 工具 schema 变更可能影响已有 prompt

风险：旧 prompt 仍调用 `expert_vote({ vote, reason })`。

缓解：

- 第一阶段可以让 certification 缺失时返回明确错误，而不是崩溃。
- 错误消息指导模型继续 submit 并在最终认证时提供 checklist。

### 14.2 运行时过严导致阶段无法退出

风险：模型难以满足 certification 字段。

缓解：

- 提供清晰字段说明。
- 在 tool rejection message 中列出缺失项。
- 不要求轮次，只要求材料和审查状态。

### 14.3 外部 skill 不在 repo 中

风险：不同机器技能文件不一致。

缓解：

- 短期直接更新本机技能文件。
- 中期在 repo 内维护 canonical skill source。
- 长期实现同步或移除外部依赖。

### 14.4 工具名仍含 vote

风险：模型仍受 `vote` 命名暗示。

缓解：

- 短期用描述和 schema 约束。
- 长期迁移到 `certify_stage_exit` / `block_stage_exit`。

## 15. 推荐最终落地路径

建议本次先完成 Phase 1 到 Phase 4：

1. 重写外部 `vote_discipline.md`。
2. 改阶段模板、store 镜像、fallback prompt、routing suffix。
3. 强化 `expert_vote` / `inspector_vote` 工具说明和 schema。
4. 增加 daemon readiness gate。
5. 改 daemon 返回文案。
6. UI 文案从“投票”切换为“出口认证”。
7. 做静态扫描和行为测试。

Phase 5 工具名迁移可以作为后续兼容性项目推进。

## 16. 完成定义

本规划完成后，应满足：

- 模型不会被提示诱导把 vote 当成普通完毕动作。
- 模型可见文本明确说明 vote 不是 latest response completion marker。
- `pass` 必须提供结构化自证。
- daemon 可以拒绝过早或空泛 `pass`。
- 新材料会自动使旧认证失效。
- 单方认证返回不再暴露“对方”。
- UI 与 prompt 统一使用“出口认证”心智。
- 静态扫描无旧协作叙事和轮次暗示。
- 行为测试覆盖过早认证、证据不足、材料变更、完整认证等关键场景。
