---
title: MLRA v2 + MCP 统一目录重构架构（决策锁定版）
description: 将 MLRA 从 5 角色动态分配简化为 3 个专属 MCP server；同时重构整体 MCP 代码结构到统一 mcp/ 父目录（common/ mlfb/ mlra/）；废弃 launcher / register_LRA / agent_name；工作流由 App UI 编排启动
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - MLRA
    - v2
    - refactor
    - architecture
    - mcp-server
    - directory-restructure
solved_lists:
    - 7 项 v2 设计决策已锁定
    - 目录结构统一为 mcp/common + mcp/mlfb + mcp/mlra
    - 硬切路径不保留兼容 shim
---

# MLRA v2 + MCP 统一目录重构架构（决策锁定版）

## 一、本文覆盖两件事

1. **MLRA 架构 v2**：5 角色 → 3 专属 MCP server + UI 驱动启动
2. **MCP 代码目录统一**：根目录 `server.mjs` + `mlra-server/` 不对称 → `mcp/{common,mlfb,mlra}/` 三位一体

两件事在一次重构中完成，避免路径反复变动。

---

## 二、锁定的设计决策

| # | 决策项 | 选择 |
|---|-------|------|
| Q1 | 启动工作流的工具 | 复用 `ceo_verdict`（启动由 UI 触发） |
| Q2 | Skill 段落标题 | 英文 `## Phase: Planning` / `## Phase: Execution` |
| Q3 | 阶段提示注入位置 | systemMessage |
| Q4 | Start Mode 配置 | App UI 编排，IPC 发送 `MLRA_START` |
| Q5 | v1 保留策略 | 立即删除 |
| Q6 | TCP 端口 | 复用 v1 端口 |
| Q7 | Stop hook 分流 | 通用提醒（工具前缀 `ceo_*/expert_*/inspector_*` 隐式识别角色） |
| Q8 | 顶层目录名 | `mcp/` |
| Q9 | 路径迁移策略 | **硬切**，不保留兼容 shim；发版说明要求用户更新 mcp.json |

---

## 三、目标目录结构

```
my-last-feedback/
├── mcp/                              ← 新增：所有 MCP 服务统一入口
│   ├── common/                       ← 共享模块（抽自原两个 server 的重复逻辑）
│   │   ├── port-discovery.mjs        lock file + 端口扫描 + tryConnect
│   │   ├── child-launcher.mjs        detached 启动 + 等待重连
│   │   ├── mcp-bootstrap.mjs         McpServer + StdioTransport + 断开清理
│   │   └── caller-info.mjs           getCallerInfo（合并 MLFB + MLRA 两版）
│   │
│   ├── mlfb/                         ← my-last-feedback
│   │   ├── index.mjs                 入口（替代 根/server.mjs）
│   │   ├── tools/
│   │   │   ├── interactive-feedback.mjs
│   │   │   └── whoami.mjs
│   │   └── ipc-client.mjs            与 Tauri App 的 TCP-IPC 通信
│   │
│   └── mlra/                         ← my-long-running-agent v2
│       ├── servers/                  3 个专属 MCP server 入口
│       │   ├── mcp-ceo.mjs
│       │   ├── mcp-expert.mjs
│       │   └── mcp-inspector.mjs
│       ├── daemon/                   后台编排进程
│       │   ├── index.mjs             (原 daemon.mjs)
│       │   ├── orchestrator.mjs
│       │   ├── router.mjs
│       │   ├── session-manager.mjs
│       │   ├── transcript-monitor.mjs
│       │   ├── budget-tracker.mjs
│       │   └── ipc-bridge.mjs
│       ├── protocol/
│       │   ├── messages.mjs          (MSG 常量)
│       │   ├── roles.mjs             (3 角色 + 阶段常量)
│       │   └── prompts.mjs           (routing / initial prompt 模板)
│       ├── daemon-client.mjs         3 server 共享的 TCP 客户端
│       └── feature-flags.mjs
│
├── app/                              Tauri 桌面 App（不动）
├── skills/
│   ├── skill_ceo.md
│   ├── skill_expert.md               (v2 新建，合并 planning + execution)
│   ├── skill_inspector.md            (v2 新建，合并 planning + execution)
│   └── _archive/
│       └── v1/                       (旧 skill 归档)
│           ├── skill_planning_expert.md
│           ├── skill_planning_inspector.md
│           ├── skill_execution_expert.md
│           ├── skill_execution_inspector.md
│           └── skill_worker.md
├── scripts/                          (部分脚本路径需更新)
├── mcp.json.template                 (全面更新)
├── package.json                      (scripts 字段更新)
├── README.md                         (文档更新)
└── RELEASE.md                        (CHANGELOG 添加迁移说明)
```

---

## 四、MLRA v2 架构（核心内容）

### 4.1 进程拓扑

```
┌────────────────────────────────────────────────────────────┐
│         VS Code（一个或多个窗口）                            │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────┐        │
│  │ CEO win  │  │ Expert win   │  │ Inspector win  │        │
│  └────┬─────┘  └──────┬───────┘  └────────┬───────┘        │
│       │ stdio         │ stdio             │ stdio          │
│  ┌────▼─────┐  ┌──────▼───────┐  ┌────────▼───────┐        │
│  │mcp-ceo   │  │ mcp-expert   │  │ mcp-inspector  │        │
│  └────┬─────┘  └──────┬───────┘  └────────┬───────┘        │
└───────┼───────────────┼────────────────────┼──────────────┘
        │         TCP   │                    │
        └─────────┬─────┴────────────┬──────┘
                  │                  │
             ┌────▼──────────────────▼────┐
             │      mlra/daemon/           │
             │  orchestrator + router +    │
             │  session-manager            │
             └──────────────▲──────────────┘
                            │ IPC (MLRA_START, MLRA_STATUS)
                     ┌──────┴──────┐
                     │  App UI     │
                     │  工作流编排  │
                     └─────────────┘
```

### 4.2 角色与工具

| Server | 工具 |
|--------|------|
| `mcp-ceo` | `ceo_verdict`（approved / rejected / arbitration）、`get_task_context` |
| `mcp-expert` | `expert_submit`（type: plan_draft / phase_complete）、`expert_vote`、`get_task_context` |
| `mcp-inspector` | `inspector_submit`（type: review_result, passed: bool）、`inspector_vote`、`get_task_context` |

工具前缀 `ceo_*` / `expert_*` / `inspector_*` 使 hook 可从 tool_name 隐式识别角色。

### 4.3 连接模型

- daemon 监听 TCP（复用 v1 端口）
- MCP server 首条消息 `{type: "ROLE_HELLO", role: "ceo" | "expert" | "inspector"}`
- 同角色二次连接 → 拒绝（单工作流约束）
- 任一连接断开 → 工作流 `paused`，等待重连

### 4.4 工作流启动（UI 驱动）

```
1. 用户在 App UI：
   - 选择启动模式（full / direct-execution）
   - 输入初始任务描述
   - 配置各阶段启用情况
2. App → daemon: IPC {type:"MLRA_START", config:{...}}
3. daemon 进入 "waiting_for_roles"
4. 用户在 3 个 VS Code 窗口分别发起聊天 → MCP server 启动 → ROLE_HELLO
5. 必需角色齐备 → daemon 启动 orchestrator → 推送初始指令
```

### 4.5 阶段切换

daemon 每次回复 expert/inspector 在 systemMessage 附加：

```
[MLRA Routing]
Phase: planning
Expected action: draft a plan via expert_submit(type="plan_draft", ...)
Skill reference: Read `## Phase: Planning` section of skill_expert.md
```

### 4.6 保留的编排能力

- CEO gate 状态机（minDefensiveRounds、requiredConsecutive）
- 投票机制（`votes.expert / votes.inspector`）
- 防御性否决
- 停滞检测
- 回合追踪

### 4.7 废弃

- launcherId、多 launcher 并发
- callerId 动态注册、alias 生成
- register_LRA 握手
- PHASE_AGENTS 动态上/下线
- Worker 体系（已 WORKER_ENABLED=false）

---

## 五、共享模块设计

### 5.1 `mcp/common/port-discovery.mjs`

```js
export function createPortDiscovery({ lockFileName, portStart, portEnd }) {
  return {
    readPortFromLockFile() { ... },
    tryConnect(port) { ... },
    async connect() {
      // lock file first, then scan range
    },
  };
}
```

替代 MLFB 与 MLRA 两份几乎一样的逻辑。

### 5.2 `mcp/common/child-launcher.mjs`

```js
export async function ensureChildRunning({ discovery, launchCmd, maxRetries = 30 }) {
  let socket = await discovery.connect();
  if (socket) return socket;
  // detached spawn + wait
}
```

### 5.3 `mcp/common/mcp-bootstrap.mjs`

```js
export function createMcpServer({ name, version, tools }) {
  const server = new McpServer({ name, version });
  for (const tool of tools) server.tool(...tool);
  return server;
}
export async function startStdio(server, { onDisconnect }) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdin monitoring for disconnect
}
```

### 5.4 `mcp/common/caller-info.mjs`

合并现有两份 getCallerInfo 实现，可配置是否启用 roots/list。

---

## 六、Hook 改动

### 6.1 Stop hook 通用提醒

```js
// inject-agent-name.mjs Stop 分支
reason =
  `Before finishing, if you are participating in an MLRA workflow, ` +
  `you MUST report through the tool exposed by your MCP server ` +
  `(ceo_verdict for CEO / expert_submit or expert_vote for Expert / ` +
  `inspector_submit or inspector_vote for Inspector). ` +
  `If you are not in MLRA, call interactive_feedback to collect user confirmation. ` +
  `Do not stop without reporting.`;
```

### 6.2 agent_name 注入白名单

```js
const MLFB_TOOLS = new Set(["interactive_feedback", "whoami"]);
if (hookEvent === "PostToolUse" && data.tool_name && !MLFB_TOOLS.has(data.tool_name)) {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}
```

---

## 七、迁移路径（7 Phase）

### Phase 0：目录搭建与归档
- 建 `mcp/common/` `mcp/mlfb/` `mcp/mlra/` 空骨架
- 建 `skills/_archive/v1/`，移动旧 skill（worker + planning_* + execution_*）
- 不动代码，仅目录

### Phase 1：抽 common 共享模块
- 实现 4 个 common 模块
- 暂不改 MLFB / MLRA 使用方

### Phase 2：MLFB 迁移到新结构
- 根 `server.mjs` 内容拆分到 `mcp/mlfb/index.mjs` + `tools/*.mjs` + `ipc-client.mjs`
- MLFB 切换到 common 模块
- **硬切**：删除根 `server.mjs`，更新 `mcp.json.template`
- 更新 `scripts/` 中引用路径
- 验证：MCP 功能不变

### Phase 3：MLRA v2 骨架 + 3 server
- `mcp/mlra/servers/mcp-ceo.mjs` 等 3 个入口（复用 common）
- `mcp/mlra/daemon-client.mjs`（ROLE_HELLO 握手）
- `mcp/mlra/protocol/{messages,roles,prompts}.mjs` 拆分（从 v1 protocol.mjs）

### Phase 4：MLRA daemon 与 orchestrator 迁移
- 搬运并简化 daemon.mjs / orchestrator.mjs / router.mjs / session-manager.mjs 到 `mcp/mlra/daemon/`
- 删除 launcher / callerId / alias 相关
- 新增 orchestrator 的 `MLRA_START` IPC 处理

### Phase 5：Skill 重组
- 合并生成 `skills/skill_expert.md`（含 Phase: Planning / Phase: Execution）
- 合并生成 `skills/skill_inspector.md`
- daemon 按阶段加载 skill 段落注入 systemMessage

### Phase 6：App UI 工作流编排
- Tauri UI 新增工作流配置页
- IPC 消息 `MLRA_START` / `MLRA_CANCEL` / `MLRA_STATUS`
- 状态可视化（3 角色连接、阶段、gate 轮次）

### Phase 7：v1 一次性删除 + 全面测试
- 删除 `mlra-server/` 整个目录
- 删除 Worker 相关残留
- 更新所有文档（README / BUILD / RELEASE）
- 端到端测试（见 §10）

---

## 八、mcp.json.template（新）

```json
{
  "mcpServers": {
    "my-last-feedback": {
      "command": "node",
      "args": ["${PROJECT_ROOT}/mcp/mlfb/index.mjs"]
    },
    "mlra-ceo": {
      "command": "node",
      "args": ["${PROJECT_ROOT}/mcp/mlra/servers/mcp-ceo.mjs"]
    },
    "mlra-expert": {
      "command": "node",
      "args": ["${PROJECT_ROOT}/mcp/mlra/servers/mcp-expert.mjs"]
    },
    "mlra-inspector": {
      "command": "node",
      "args": ["${PROJECT_ROOT}/mcp/mlra/servers/mcp-inspector.mjs"]
    }
  }
}
```

---

## 九、全面路径更新清单

| 文件 / 位置 | 原引用 | 新引用 |
|------------|--------|--------|
| `mcp.json.template` | `./server.mjs` + `./mlra-server/server.mjs` | `./mcp/mlfb/index.mjs` + `./mcp/mlra/servers/*.mjs` |
| `package.json` scripts | 若有指向 `server.mjs` | 更新 |
| `scripts/inject-agents.mjs` | 可能引用 skills 路径 | 保持（skills 根路径不变） |
| `scripts/send-test-feedback.mjs` | 引用 server.mjs？ | 验证并更新 |
| `scr_tests/test-mlra-session.cjs` | 引用 mlra-server/ | 更新或删除 |
| `scr_tests/test-ipc.cjs` | 引用 server.mjs | 更新 |
| `.github/` workflows | 构建命令 | 更新 |
| `README.md` / `README_zh.md` | 命令示例 | 更新 |
| `BUILD.md` | 构建说明 | 更新 |
| `RELEASE.md` | 添加迁移章节 | 新增 |
| `mcp_prompts/*` | 可能无需动 | 验证 |
| `.mlra/` 配置 | 若有路径 | 验证 |

---

## 十、端到端测试清单（Phase 7）

- [ ] MLFB `interactive_feedback` 全流程（含图片附件、多轮对话）
- [ ] MLFB `whoami` 工具返回正确提示
- [ ] MLRA Full planning workflow：CEO 2 次防御性否决 → approved → 进入 execution
- [ ] MLRA Direct execution：跳过 planning 直接进入 execution
- [ ] MLRA 仲裁流程：expert / inspector 分歧 → CEO arbitration
- [ ] MLRA 停滞检测：同一反馈 5 次 → 触发 CEO 仲裁
- [ ] MLRA 角色断连重连：expert 关闭 → daemon paused → 重新打开 → 恢复
- [ ] MLRA 角色重复连接拒绝：两个 CEO 窗口 → 第二个明确拒绝
- [ ] UI 配置变更：启动前取消 / 编辑初始任务
- [ ] Hook Stop 提醒在 MLFB 与 MLRA 下都正确显示
- [ ] Hook PostToolUse 对 MLRA 工具不注入 agent_name

---

## 十一、风险与缓解

| 风险 | 缓解 |
|------|------|
| 路径硬切导致用户现有 mcp.json 失效 | RELEASE.md 显著标注 `BREAKING CHANGE`，提供 sed 脚本或 App UI 一键更新按钮 |
| 一次性 commit 过大，review 困难 | 按 Phase 分 PR（7 个小 PR） |
| Phase 2 MLFB 迁移后出现兼容性 bug | Phase 2 完成后暂停进入 Phase 3，完整回归测试 |
| common 模块抽取引入 bug | common 模块单独单元测试，先让 v1 代码切换验证再开 v2 |
| Skill 合并语义漂移 | Phase 5 逐段 diff 对照，archive 备查 |
| Tauri App 打包资源路径 | 检查 `src-tauri/tauri.conf.json` 的 `resources`/`bundle` 配置 |
| Git rename 识别 | 使用 `git mv` 而非 `rm + add`，保留 history |

---

## 十二、v1 删除清单（Phase 7 一次性）

| 文件 / 目录 | 动作 |
|------------|------|
| 根 `server.mjs` | Phase 2 已移走，确认删除 |
| `mlra-server/` 整个目录 | Phase 7 一次性删除 |
| Worker 相关代码（若有残留） | 删除 |
| `skills/skill_worker.md` | 归档至 _archive/v1/ |
| `skills/skill_planning_*` / `skill_execution_*` | 归档至 _archive/v1/ |
| 旧 mcp.json 引用 | 全部更新为 mcp/ 路径 |
| `scr_tests/test-mlra-session.cjs` | 按 v2 重写或删除 |

---

## 十三、后续并发工作流（不在本期）

- 方案 A：按 workspace 多 daemon，每 workspace 独立 socket
- 方案 B：daemon 内 workflow slot，workspace 区分
- 方案 C：UI 作为调度中心，daemon 单例 + orchestrator 多实例

待 v2 稳定后设计。

---

**最后更新**: 2026-04-21
