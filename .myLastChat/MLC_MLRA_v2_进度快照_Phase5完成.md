---
title: MLRA v2 重构进度快照 — Phase 5 完成
description: MLRA 从 5 角色 → 3 角色固定拓扑重构；协议层、守护进程、MCP server、技能文档全部完成
workplace: ${workspaceFolder}
project: my-last-feedback
type: report
tags:
    - mlra
    - v2-refactor
    - checkpoint
solved_lists:
    - Phase 0-3 协议层 + roles/messages/prompts
    - Phase 4.1 feature-flags.mjs
    - Phase 4.2a' 用户视角路由模板重写
    - Phase 4.2b orchestrator 3 角色重写 (1029→683 行)
    - Phase 4.2c daemon + router v2 重写 (858→541 行)
    - Phase 4.2d SessionManager/TranscriptMonitor/BudgetTracker 归档
    - Phase 4.2e mcp.json.template 加入 3+3 v2 server 入口
    - Phase 4.5 删除全部 v1 legacy daemon 文件 (净减 3009 行)
    - Phase 5 skill_expert.md + skill_inspector.md 合并
---

# MLRA v2 重构进度快照

分支：`DEV/0408/witt/MLRA`  
HEAD：`8ea795c`  
会话累计提交：**16 次**

## 完成阶段速览

| Phase | 内容 | Commit |
|-------|------|--------|
| 0-3 | 协议层 (roles/messages/prompts) | 前置会话 |
| 4.1 | feature-flags.mjs | 前置会话 |
| 4.2a | 路由模板 | `00ad0d9` |
| 4.2a' | 用户视角重写 | `920bbd3` |
| 4.2b | orchestrator 3 角色重写 | `646d87e` |
| 4.2c | daemon + router 重写 | `2aa8b3f` |
| 4.2d + 4.2e | legacy 归档 + mcp.json | `e3f5e4f` |
| 4.5 | 删除 legacy (-3009 行) | `bd57cd2` |
| 5 | 技能文档合并 | `8ea795c` |

## v2 核心文件清单

**daemon/ (5 个文件，自包含)**：
- `index.mjs` (541 行) — v2 消息分发 + IPC bridge + role-keyed connections
- `orchestrator.mjs` (683 行) — 纯逻辑状态机 + CEO Gate
- `router.mjs` (120 行) — block/release 队列
- `ipc-bridge.mjs` — Tauri IPC
- `feature-flags.mjs` — 功能开关

**protocol/**：
- `roles.mjs` — ROLES / START_MODES / PHASES 常量
- `messages.mjs` — v2 MSG 字典
- `prompts.mjs` — 14 路由模板 + 3 初始提示（用户视角）

**servers/**：
- `mcp-ceo.mjs` / `mcp-expert.mjs` / `mcp-inspector.mjs` — MCP server 入口
- `_shared.mjs` — bootstrapMcpServer / connectRoleToDaemon

**skills/**：
- `skill_ceo.md` (122 行)
- `skill_expert.md` (188 行，合并自规划+实施)
- `skill_inspector.md` (185 行，合并自规划+实施)
- `_archive/v1/` — 5 个 v1 技能原件保留

## 关键设计原则

1. **用户视角错觉**：每个 agent 只知自己的角色 + 「用户」；路由消息绝不提及其他 agent 角色名
2. **3 角色固定槽位**：`roles` Map 按 role 为键（取代 v1 callerId-keyed `agents` Map）
3. **CEO 驳斥锁**：2 防御轮 + 2 连续确认 保留
4. **启动模式**：仅保留 autopilot（全流程）+ ceo-override（人工审查）；删除 full-override

## 已验证场景

- orchestrator.mjs 独立：20 步完整工作流（register×3 → start → submit → vote → planning gate → 2 防御 + 2 连续 CEO → transition_to_execution）
- daemon+router 集成：19 步 smoke（router 接口、MSG 常量、消息队列）

## 剩余工作（待新会话处理）

### Phase 6 — App UI 编排面板
- Tauri/React 工作量大，需新建 workflow 控制面板
- IPC 接线：MLRA_START / MLRA_PHASE_CHANGE / MLRA_ROLE_CONNECTED / ...
- 涉及 `app/src/` 大量代码，建议独立会话进行

### Phase 7 — E2E 真机测试
- 启动真实 daemon (端口 19881 dev)
- spawn 3 个 MCP server 连接（mlra-ceo/expert/inspector）
- 从 App UI 触发 MLRA_START，走完一个完整规划+执行+审批流程
- 可能暴露：daemon 边界 case、transcript 监控缺失影响、错误传播路径

### 可选后续
- SessionManager 替代品：基于 role 键的轻量 session 跟踪（若 transcript 监控有需求）
- 预算 UI：BudgetTracker 也在 Phase 4.2d 归档
- 清理 `mcp_prompts/` 中 v1 残留 prompt 文件

## 未解决的风险点

1. **inspector_submit 元数据字段兼容**：已在 Phase 5 修补 daemon 同时接受 `msg.passed` 和 `msg.metadata.passed`，但 orchestrator 端未必统一
2. **transcript 监控暂时禁用**：若 CEO 需检查 agent 是否脱离 MLRA 流程，目前缺失监测能力
3. **UI 尚未对齐 v2**：App 仍使用 v1 的 MLRA_ASSIGN_ROLE / MLRA_START_ORCHESTRATION IPC，首次连接 v2 daemon 会静默失败

## 回滚路径

所有 legacy 文件已用 `git rm` 删除，但可通过 `git show bd57cd2~1:<path>` 恢复任一文件内容。v1 代码完整保留在 `bd57cd2^` 的历史中。
