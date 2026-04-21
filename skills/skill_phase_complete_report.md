---
name: "提交阶段完成报告"
description: "使用 expert_submit(type=phase_complete) 提交执行阶段成果的结构与自检流程"
---

# 如何提交阶段完成报告

## 工具

```text
expert_submit(type="phase_complete", content=<报告>, progress="Phase N/M: 简述")
```

- 每个 Phase 完成后调用一次
- `progress` 建议填写（用于 UI 显示）
- 调用后阻塞，直到下一条指令到达

## 工作流程

1. 阅读 `AGENTS.md` 与当前规划方案中的本 Phase 条目
2. 按既有规范与架构模式完成代码改动，全部亲自完成
3. 仅做规划要求的修改，不做额外重构
4. 完成后运行本地可用的验证（类型检查、lint、smoke test 等）
5. 按 `skill_re_verify` 做二次验证
6. 填写下方报告模板
7. 检查 `skill_hallucination_check` 的要点
8. 提交

## 阶段完成报告模板

```markdown
# Phase {N} 完成报告: {阶段名称}

## 行动概述
{本 Phase 做了什么，核心变更概述}

## 完成任务列表
- [x] {任务描述} → done at `{file}:{line}`
- [x] {任务描述} → done at `{file}:{line}`
- [ ] {任务描述} → missing ❌ — {原因}（如有）

## 修改文件清单
| 文件 | 变更类型 | 变更概述 |
|------|---------|---------|
| `path/to/file.ts` | 修改 | {简要描述} |
| `path/to/new.ts` | 新增 | {简要描述} |

## 自检结果
- 验收标准覆盖率: {M}/{N} 项通过
- 自检中发现并修复的问题: {列表，如有}

## 潜在风险
- {如果有已知的风险或不确定性}

## 请求检查重点
请重点关注以下区域：
- {重点文件/功能 1}
- {重点文件/功能 2}
```

## 提交前自检

- [ ] 本 Phase 所有验收标准已覆盖
- [ ] 实际打开修改过的文件确认代码正确（不凭记忆）
- [ ] 对每个需求标注 `done at file:line` 或清晰的未完成说明
- [ ] 未出现委派表述
- [ ] 已完成 `skill_re_verify` 流程
