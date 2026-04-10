---
title: MLRA 提示词工程重构规划书
description: 编排器纯传话化 + Skill引导 + Tail注入重构 + Phase去硬编码化
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - MLRA
    - prompt-engineering
    - refactor
    - orchestration
---

# MLRA 提示词工程重构规划书

## 一、核心理念

### 编排器职责再定义

编排器（Orchestrator + Daemon）是一个**纯粹的信息中继站**：

```
Agent A → submit(content) → 编排器 → [原样传递 content + 组装 tail 注入] → Agent B
```

编排器**做的事情**：
1. 接收消息（谁发的、发给谁）
2. 原样传递消息内容（不解析、不修改）
3. 在消息前后包装 Tail 注入（基于路由上下文动态组装）
4. 管理阻塞/释放（谁在等、什么时候放）
5. 触发流程节点（投票、CEO 门控）
6. 推送状态给前端 UI

编排器**不做的事情**：
- ❌ 不解析 submit content 内容
- ❌ 不管理 Phase 推进
- ❌ 不判断方案质量
- ❌ 不要求特定的 content 格式
- ❌ 不注入 Skill 文件内容

### Agent 智能来源

Agent 的智能完全来自**三层提示词工程**：

```
┌─────────────────────────────────────────────┐
│  第一层: Agent 初始定义 (register_LRA 返回)    │
│  - 角色身份、核心行为要点                       │
│  - 引导阅读指定 Skill 文件路径                  │
│  - 引导阅读 AGENTS.md                          │
├─────────────────────────────────────────────┤
│  第二层: Skill 文件 (Agent 自行获取)            │
│  - 详细行为规范、提交模板、审查维度              │
│  - Agent 使用文件读取工具自行获取                │
│  - 存放在 mcp_prompts/ 下                      │
├─────────────────────────────────────────────┤
│  第三层: Tail 注入 (编排器每次路由时包装)        │
│  - 用户口吻的角色强制 + 行动指引                │
│  - 基于 source→target 路由上下文动态组装         │
│  - 引导 Agent 遵循已读过的 Skill                │
└─────────────────────────────────────────────┘
```

---

## 二、变更清单

### 2.1 需要创建的 Skill 文件

| 文件 | 描述 | 关键内容 |
|------|------|----------|
| `mcp_prompts/skill_planning_expert.md` | 规划专家行为指南 | 规划书结构模板、需求分解方法、自检流程 |
| `mcp_prompts/skill_planning_inspector.md` | 规划监察行为指南 | 审查维度、结构化报告模板（Bug列表/风险/建议/决策级别） |
| `mcp_prompts/skill_execution_expert.md` | 实施专家行为指南 | 执行规范、自检流程(re_verify)、提交报告模板 |
| `mcp_prompts/skill_execution_inspector.md` | 实施监察行为指南 | 代码审查维度、结构化审查报告模板 |
| `mcp_prompts/skill_ceo.md` | CEO 审查框架 | 勘察要求、裁决标准、防御性拒绝指南、仲裁流程 |
| `mcp_prompts/skill_worker.md` | Worker 执行规范 | 接单确认、执行报告格式、完成提交规范 |

### 2.2 需要修改的代码文件

| # | 文件 | 变更 | 影响范围 |
|---|------|------|----------|
| 1 | `protocol.mjs` | 重写 `buildTailInjection()` → 改为 `buildRoutingPrompt(sourceRole, targetRole, phase, context)` | 所有路由消息的 tail |
| 2 | `orchestrator.mjs` | 重写 `_buildInitialInstruction()` → 包含角色定义 + Skill 路径引用 | Agent 初始指令 |
| 3 | `orchestrator.mjs` | 重写 `_routeSubmit()` → 纯传递 content + 调用新 `buildRoutingPrompt()` | 所有 submit 路由 |
| 4 | `orchestrator.mjs` | 删除 `_advancePhase()` 内的 Phase 管理逻辑 → 纯传递 | Phase 不再被编排器管理 |
| 5 | `orchestrator.mjs` | 删除 `currentPhaseId` 的编程推进逻辑 | 编排器不控制 Phase |
| 6 | `orchestrator.mjs` | 简化 CEO 门控消息 → 使用新 prompt 模板 | CEO 审查指令 |
| 7 | `orchestrator.mjs` | 更新 `transitionToImplementation()` → 使用新 prompt 模板 | 阶段转换指令 |
| 8 | `server.mjs` | submit 工具简化 → 去掉 `phase` 参数（或保留为可选 metadata） | submit 工具定义 |

### 2.3 不需要改的文件

| 文件 | 原因 |
|------|------|
| `daemon.mjs` | 纯中继层，已正确实现。不涉及 prompt 内容 |
| `router.mjs` | 纯阻塞/释放机制，与 prompt 无关 |
| `mlraStore.ts` | 前端状态管理，与 prompt 无关 |
| `LauncherHome.tsx` | UI 层，不涉及 |
| `AgentColumn.tsx` | UI 层，不涉及 |

---

## 三、详细设计

### 3.1 初始指令模板 (`_buildInitialInstruction`)

每个角色的初始指令结构：

```
## 角色: {角色名}

你是 MLRA 编排系统中的 {角色描述}。

## 你的核心职责
{3-5 条核心行为要点}

## 行为规范
在开始工作之前，请阅读以下文件获取详细行为指南：
- `mcp_prompts/skill_{role}.md` — 你的角色行为规范和提交模板
- `AGENTS.md` — 项目技术栈、架构和开发规范

## 当前任务
{userTask}

## 可用工具
{根据角色列出可用工具及其用途}

{Tail 注入}
```

**规划专家** 核心行为要点示例：
1. 分析需求，制定详细可执行的规划方案
2. 方案必须包含明确的执行阶段划分和验收标准
3. 收到监察反馈后进行针对性修改，不要推翻全案
4. 修改完成后进行自检（参照 re_verify 流程），确保每条反馈都有处理
5. 当你认为方案成熟时，使用 `router_vote` 工具投票

**规划监察** 核心行为要点示例：
1. 独立审查方案，不被专家自述影响
2. 输出结构化审查报告（Bug列表 + 风险列表 + 改进建议 + 决策级别）
3. 每条建议必须标注决策级别：必须修复 / 建议改进 / 自行决定
4. 当你认为方案已足够成熟时，使用 `router_vote` 工具投票
5. 请阅读 `mcp_prompts/skill_planning_inspector.md` 获取完整审查规范

### 3.2 路由 Prompt 模板 (`buildRoutingPrompt`)

取代当前的 `buildTailInjection`。根据 `sourceRole → targetRole` 路由方向生成，用**用户口吻**：

#### 模板映射表

| 源角色 | 目标角色 | Routing Prompt |
|--------|---------|----------------|
| planning-expert | planning-inspector | "专家提交了修改后的方案。作为规划监察，请你按照 inspector Skill 规范进行全面审查，输出结构化审查报告。" |
| planning-inspector | planning-expert | "监察的审查反馈已送达。作为规划专家，请逐条分析每个反馈项的决策级别，针对性修改方案，修改后进行自检再提交。" |
| execution-expert | execution-inspector | "实施专家提交了阶段完成报告。作为实施监察，请直接检查仓库代码（不信专家自述），按审查规范输出报告。" |
| execution-inspector | execution-expert | "监察的审查报告已送达。作为实施专家，请按报告中的决策级别处理每条反馈，完成修复后先自检再提交。" |
| orchestrator | ceo (planning_gate) | "规划投票已通过。作为CEO，请先勘察项目现状（阅读 AGENTS.md + 核心代码），再审查规划方案并做出裁决。" |
| orchestrator | ceo (final_review) | "全部实施已完成。作为CEO，请对最终产出进行全面验证后做出裁决。" |
| ceo (rejection) | expert + inspector | "CEO 退回了方案。请根据退回理由修改。" |
| orchestrator | execution-expert (transition) | "规划已通过 CEO 审批，现在进入实施阶段。请按规划书执行。" |

#### 函数签名

```javascript
/**
 * 为路由消息组装提示词包装。
 *
 * @param {string} sourceRole - 消息来源角色 (e.g. "planning-expert")
 * @param {string} targetRole - 消息目标角色 (e.g. "planning-inspector")
 * @param {"planning"|"implementation"} phase - 当前阶段
 * @param {object} context - 额外上下文
 * @param {string} context.userTask - 原始任务描述
 * @param {number} context.roundNumber - 当前第几轮
 * @param {string} context.routingReason - 路由原因 (e.g. "submit", "vote_rejection", "ceo_rejection")
 * @returns {{ prefix: string, suffix: string }}
 */
export function buildRoutingPrompt(sourceRole, targetRole, phase, context) {
  // ...
}
```

返回 `{ prefix, suffix }`:
- `prefix` — 放在 content 之前（路由上下文说明）
- `suffix` — 放在 content 之后（行动指引 + 角色强化）

组装方式：
```
{prefix}

{agent 原始 submit content — 原样传递}

{suffix}
```

### 3.3 `_routeSubmit` 简化

```javascript
// 改造前
_routeSubmit(callerId, role, submitType, content, metadata) {
  const tail = buildTailInjection(this._getRouteTarget(role), this.phase, this.currentPhaseId);
  if (this.phase === "planning") {
    if (role === "planning-expert") {
      return {
        action: "route",
        targetCallerId: inspectorId,
        content: `[来自工程团队负责人]\n\n请审查以下方案：\n\n${content}${tail}`,
      };
    }
    // ... 大量条件分支
  }
}

// 改造后
_routeSubmit(callerId, role, submitType, content, metadata) {
  const targetRole = this._getRouteTarget(role);
  const targetId = this._findAgentByRole(targetRole);
  if (!targetId) return { error: `${targetRole} not found` };

  const { prefix, suffix } = buildRoutingPrompt(role, targetRole, this.phase, {
    userTask: this.userTask,
    roundNumber: this.rounds.length,
    routingReason: submitType,
  });

  return {
    action: "route",
    targetCallerId: targetId,
    content: `${prefix}\n\n${content}\n\n${suffix}`,
  };
}
```

核心变化：
- 不再根据 role + phase 写大量 if/else 分支
- 所有智能放到 `buildRoutingPrompt` 的模板中
- content 原样传递，不被修改或解析
- 特殊流程（投票通过、CEO 门控、阶段转换）仍由编排器流程逻辑触发，但触发后发送的消息也用 `buildRoutingPrompt` 组装

### 3.4 Phase 去硬编码化

**删除的内容**：
- `this.currentPhaseId` 的编程赋值和推进 (`"Phase 1"`, `"Phase 2"` 等)
- `_advancePhase()` 内的 Phase 状态管理
- `transitionToImplementation()` 内的 `this.currentPhaseId = "Phase 1"` 硬编码

**保留的内容**：
- `this.phase`（`"planning"` / `"implementation"`）— 这是编排器的流程阶段，不是 Agent 的 Phase
- submit 工具的 `phase` 参数 — 改为可选 metadata，Agent 想传什么传什么，编排器不读取

**Agent 如何管理 Phase**：
- Skill 文件中定义 Phase 的概念和管理方式
- Expert Agent 在规划书中自行定义 Phase 列表
- Expert Agent 在 submit content 中自行声明当前 Phase
- Inspector Agent 在审查报告中引用 Phase 信息
- 编排器完全不介入

### 3.5 Skill 文件设计

以 `skill_planning_inspector.md` 为例：

```markdown
---
name: "MLRA 规划监察行为指南"
description: "规划阶段监察者的审查规范和报告模板"
---

# 规划监察 (Planning Inspector) 行为指南

## 审查维度

你在审查规划方案时，必须覆盖以下维度：

1. **需求完整性** — 原始需求的每个要点是否都有对应的规划条目
2. **技术可行性** — 技术方案是否合理，是否有更优选择
3. **架构一致性** — 是否与现有架构兼容
4. **风险评估** — 是否识别了关键风险及应对措施
5. **阶段划分** — Phase 划分是否合理，依赖关系是否正确
6. **验收标准** — 每个 Phase 是否有明确的验收标准

## 审查报告模板

你的 submit 内容必须遵循以下结构：

### 行动背景
{本次审查对象的上下文概述：这是第几轮审查、修改了什么}

### 疑似问题列表
- [ ] ISSUE-1: {问题描述}
  - 位置: {相关章节/模块}
  - 严重度: 高/中/低
  - 决策级别: **必须修复** / **建议改进** / **自行决定**

### 高风险项
- ⚠️ {风险描述} — 影响范围: {描述} — 建议应对: {措施}

### 改进建议
1. {建议标题}
   - 决策级别: **必须修复** / **建议改进** / **自行决定**
   - 建议修复方案: {具体方案}
   - 理由: {为什么建议这样做}

### 综合评判
- 结论: 通过 / 未通过
- 阻塞项数量: {N}
- 投票意向: pass / reject（及理由）
```

以 `skill_execution_expert.md` 为例：

```markdown
---
name: "MLRA 实施专家行为指南"
description: "实施阶段执行者的工作规范和自检流程"
---

# 实施专家 (Execution Expert) 行为指南

## 执行流程

1. 阅读规划书，理解当前 Phase 的目标
2. 分析需要修改的文件和代码范围
3. 执行编码修改
4. 使用 order 工具委派子任务给 Worker（如需要）
5. 完成后进行自检
6. 使用 submit 工具提交阶段报告

## 自检流程 (re_verify)

在每次 submit 之前，你必须进行自检：

1. 回顾本阶段的所有需求点
2. 逐条确认每个需求是否已实现
3. 检查是否有遗漏或不完整的实现
4. 检查记录格式：
   - [x] 需求: {描述} → done at {file}:{line}
   - [ ] 需求: {描述} → missing ❌ — {原因}

## 提交报告模板

### 行动背景
{本次执行的目标和计划}

### 完成任务列表
- [x] {任务描述} → done at {file}:{line}
- [ ] {任务描述} → missing ❌ — {原因}

### 自我反思
- 全部需求已覆盖: 是/否
- 潜在风险: {列表}
- 遗留问题: {如有}
- 代码质量: {自评}

### 请求检查
请监察者重点检查以下区域: {重点文件/功能}
```

### 3.6 submit 工具简化

```javascript
// 改造前
mcpServer.tool("submit", ..., {
  type: z.enum(["plan_draft", "review_result", "phase_complete", "final_complete"]),
  content: z.string(),
  phase: z.string().optional(),      // ← 编排器不应该关心
  passed: z.boolean().optional(),     // ← Inspector 自己在 content 中说明
  issues: z.array(z.string()).optional(), // ← Inspector 自己在 content 中列出
});

// 改造后
mcpServer.tool("submit", ..., {
  type: z.enum(["plan_draft", "review_result", "phase_complete", "final_complete"]),
  content: z.string().describe("你的提交内容（按照角色 Skill 规范格式化）"),
});
```

`passed` 和 `issues` 不需要编程参数 — Inspector 按 Skill 模板在 content 中用结构化 Markdown 自行表达。编排器只看 `submitType` 来决定路由方向。

**但保留 `submitType`**，因为编排器需要它来决定路由流程（`plan_draft`→传给 inspector，`final_complete`→触发 CEO 终审），这是流程逻辑不是内容解析。

---

## 四、实施顺序

```
Phase 1: 创建 Skill 文件
├── mcp_prompts/skill_planning_expert.md
├── mcp_prompts/skill_planning_inspector.md
├── mcp_prompts/skill_execution_expert.md
├── mcp_prompts/skill_execution_inspector.md
├── mcp_prompts/skill_ceo.md
└── mcp_prompts/skill_worker.md

Phase 2: 重写 buildRoutingPrompt (protocol.mjs)
├── 新函数 buildRoutingPrompt(sourceRole, targetRole, phase, context)
├── 新函数 buildInitialPrompt(role, userTask, phase)
└── 保留旧 buildTailInjection 作兼容（标记 deprecated）

Phase 3: 重写 orchestrator.mjs
├── _buildInitialInstruction() → 使用 buildInitialPrompt
├── _routeSubmit() → 纯传递 + buildRoutingPrompt 包装
├── 简化 _advancePhase() → 去除 Phase 管理逻辑
├── 简化 transitionToImplementation() → 使用 buildRoutingPrompt
├── 更新 CEO 门控消息 → 使用 buildRoutingPrompt
└── 删除 currentPhaseId 编程逻辑

Phase 4: 简化 server.mjs submit 工具
└── 去掉 passed, issues, phase 参数

Phase 5: 验证
├── 检查所有路由路径
├── 确认 Skill 文件路径引用正确
└── TypeScript 编译检查（前端无变化）
```

---

## 五、不变 / 不动的部分

以下内容在本次重构中**不修改**：

- **daemon.mjs** — 纯中继，不涉及 prompt
- **router.mjs** — 纯阻塞/释放
- **CEO 门控流程逻辑** — `ceoGate` 状态机 + `handleCeoVerdict` + `triggerPlanningGate` 的流程控制逻辑保留
- **投票机制** — `handleVote` + `votes_passed` 事件
- **Worker 委派机制** — `handleOrder` + `handleWorkerFeedback`
- **Session 存活检测** — `SessionManager` + `BudgetTracker`
- **前端 UI** — `mlraStore.ts` + `LauncherHome.tsx` + `AgentColumn.tsx`
- **Tauri IPC** — `ipc.rs` + `ipc-bridge.mjs`
- **Human Review 机制** — `controlMode` + `humanReviewPending`
- **两种开局模式** — `START_MODES` + `checkStartReady()`

---

## 六、风险评估

| 风险 | 等级 | 应对 |
|------|------|------|
| Skill 文件内容不够好，agent 不遵循 | 中 | 迭代优化 Skill 内容。首次上线先用一轮测试验证 |
| Agent 不去读 Skill 文件 | 低 | 初始指令明确要求 + Tail 注入反复引用 |
| buildRoutingPrompt 模板覆盖不全 | 低 | 枚举所有 source→target 组合，每个写模板 |
| 去掉 Phase 后 Agent 失去进度感 | 低 | Skill 中引导 Agent 自行管理 Phase 概念 |
| Inspector 不遵循决策级别格式 | 中 | Skill 中提供模板 + Tail 注入提醒格式要求 |

---

## 七、追加变更（实施过程中新增）

### 7.1 移除 `final_complete` submit 类型

**背景**：完成任务的唯一路径应该是通过 `router_vote` 投票 → CEO 裁决，而非 agent 直接通过 submit 发出完成信号。

**变更**：
- `server.mjs` submit 工具：移除 `final_complete` 类型
- `orchestrator.mjs` `_routeSubmit`：移除 `final_complete` 分支
- `orchestrator.mjs` `SUBMIT_TYPES`：移除 `final_complete`

### 7.2 投票机制扩展到实施阶段

**背景**：原来只有规划阶段的 expert/inspector 可以投票，实施阶段依赖 `final_complete` 触发终审。

**变更**：
- `orchestrator.mjs` `handleVote`：允许 `execution-expert` 和 `execution-inspector` 投票
- 规划阶段投票通过 → `votes_passed` → CEO planning_gate
- 实施阶段投票通过 → `implementation_votes_passed` → CEO final_review
- `daemon.mjs`：新增 `_handleImplementationVotesPassed` 方法

### 7.3 CEO 驳斥锁（Rejection Lock）机制

**背景**：CEO 审批需要更严格的防御性审查保障。

**机制**：
1. **防御轮次**（前 2 轮）：任何 approved 裁决都被系统强制降级为「进一步审查」
2. **连续确认**（第 3 轮起）：需要连续 2 次 approved 才能真正通过
3. **rejection 重置**：任何 rejected 裁决会将连续计数归零

**最短路径**（全部 approved）：
- 第 1 轮: approved → 降级（防御）
- 第 2 轮: approved → 降级（防御）
- 第 3 轮: approved → 连续 1/2
- 第 4 轮: approved → 连续 2/2 → **通过** ✅

**变更**：
- `orchestrator.mjs` `ceoGate`：新增 `minDefensiveRounds`、`consecutiveApprovals`、`requiredConsecutive`
- `orchestrator.mjs` `_handleCeoApproval`：完整驳斥锁逻辑
- `orchestrator.mjs` `_handleCeoRejection`：rejection 重置 consecutiveApprovals
- `protocol.mjs`：新增 `defensive_review` 和 `consecutive_confirm` routing templates
- `skill_ceo.md`：新增驳斥锁机制说明和审查策略建议
- `mlraStore.ts` `CeoGateStatus`：新增 `minDefensiveRounds`、`consecutiveApprovals`、`requiredConsecutive` 字段
