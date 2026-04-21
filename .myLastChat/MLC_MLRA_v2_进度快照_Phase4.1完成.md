---
title: MLRA v2 重构进度 (Phase 0-4.1 完成)
description: 追踪 MLRA v2 + mcp/ 目录重构的 commit checkpoint 与下次续作方案
workplace: ${workspaceFolder}
project: my-last-feedback
type: session-progress
tags:
    - MLRA
    - v2
    - progress
    - session-state
---

# MLRA v2 重构进度快照

## 完成的 commits（从旧到新）

| Commit | Phase | 内容 |
|--------|-------|------|
| `e73aa3e` | Lock | 架构文档锁定 + .myLastChat/ 解除 ignore |
| `2e85f3e` | Phase 0 | mcp/ 目录骨架 + v1 skill 归档 |
| `65db843` | Phase 1 | mcp/common/{port-discovery,child-launcher,mcp-bootstrap,caller-info}.mjs |
| `7d0aa80` | Phase 2 | MLFB 迁移到 mcp/mlfb/，删除根 server.mjs (硬切) |
| `e1a3e24` | Phase 3 | 3 个 MCP server skeleton + mcp/mlra/protocol/* + daemon-client.mjs |
| `64d92d7` | Phase 4.1 | mlra-server/ 整体移到 mcp/mlra/daemon/ (protocol.mjs → legacy-protocol.mjs)，删除 v1 server.mjs + package.json |

## 当前 runtime 状态

- **MLFB**：新路径 `mcp/mlfb/index.mjs` 可运行（已 smoke-test），需用户更新 mcp.json + 重启验证
- **MLRA**：**完全离线**
  - v1 MCP entrypoint (`mlra-server/server.mjs`) 已删除
  - v1 daemon 移到 `mcp/mlra/daemon/index.mjs`（仍讲 v1 AGENT_REGISTER 协议）
  - v2 MCP servers (`mcp/mlra/servers/mcp-{ceo,expert,inspector}.mjs`) 存在但讲 ROLE_HELLO（无人应答）
  - `mcp.json.template` 中 MLRA 条目**已移除**
- **App (Tauri)**：未动，仍假设 v1 的 MLRA 模型（5 角色、launcher 体系）

## 剩余工作（Phase 4.2+）

### Phase 4.2：MLRA daemon 核心逻辑 v2 化（最大且最危险）

- `legacy-protocol.mjs` (312 行) → 替换为 `mcp/mlra/protocol/*.mjs`（已存在基础）
- `orchestrator.mjs` (1029 行)：
  - 去除 launcherId / callerId / alias 概念
  - 5 角色 → 3 角色：planning-expert + execution-expert → expert；同理 inspector；CEO 不变
  - `agents` Map key 改为 role 而非 callerId（v2 保证每个 role 最多 1 个连接）
  - SUBMIT_TYPES 简化：`plan_draft` (expert planning), `phase_complete` (expert execution), `review_result` (inspector)
- `router.mjs` (165 行)：路由表按 3 角色重写
- `session-manager.mjs` (380 行)：去除 launcher / callerId，改用 role 作为 key
- `transcript-monitor.mjs` (272 行)：同上
- `daemon/index.mjs` (858 行)：
  - switch-case 重写：ROLE_HELLO / EXPERT_SUBMIT / INSPECTOR_SUBMIT / EXPERT_VOTE / INSPECTOR_VOTE / CEO_VERDICT / GET_TASK_CONTEXT
  - 新增 MLRA_START IPC handler（接 App UI 启动工作流）
  - 移除 AGENT_ORDER / WORKER_SUBMIT（worker 体系）

**预估工作量**：~1500 行净修改（2500 行原始代码中的关键路径），在新会话中建议分成 2-3 个 sub-commits：
- 4.2a：legacy-protocol.mjs 拆解 + 新 protocol/*.mjs 补全路由模板和 initial prompts
- 4.2b：orchestrator.mjs 5→3 角色合并 + key 从 callerId 改 role
- 4.2c：daemon/index.mjs switch-case 重写 + MLRA_START + mcp.json.template 添加 3 个 v2 条目

### Phase 5：Skill 合并

- `skills/skill_planning_expert.md` + `skills/skill_execution_expert.md` → `skills/skill_expert.md`（按 `## Phase: Planning` / `## Phase: Execution` 分段）
- 同理生成 `skills/skill_inspector.md`
- daemon 按 phase 加载对应段落注入 systemMessage

### Phase 6：App UI 工作流编排

- `app/src/components/` 下新建工作流配置页
- Tauri IPC 新增 `MLRA_START` / `MLRA_CANCEL` / `MLRA_STATUS` 消息
- 状态可视化：3 角色连接状态 / 阶段 / CEO gate 轮次

### Phase 7：清理 + E2E 测试

- 删除 `mcp/mlra/daemon/legacy-protocol.mjs`
- 更新 `README.md` / `BUILD.md` / `RELEASE.md`
- 更新 `scripts/inject-agents.mjs`（若涉及 skill 路径）
- 更新或删除 `scr_tests/test-mlra-session.cjs`
- 按锁定文档 §十 执行 10 项端到端测试

## 关键设计决策参考

见 [.myLastChat/MLC_MLRA_v2_三Server重构架构.md](.myLastChat/MLC_MLRA_v2_三Server重构架构.md) — 锁定的 9 项决策。

## 下次续作提示

从新会话启动时，读取本文件作为进度起点，然后：

1. 确认当前 HEAD 仍为 `64d92d7` 或更新
2. 读取 `mcp/mlra/daemon/orchestrator.mjs` 理解 5 角色状态机
3. 按上述 Phase 4.2a/b/c 分小 commit 推进
4. 每个 sub-commit 后做 `node --check` 验证语法
5. Phase 4.2c 完成后可更新 mcp.json.template 添加 `mlra-ceo` / `mlra-expert` / `mlra-inspector` 3 个新条目
