---
title: "MLRA 文档清理与 Agent 注入"
description: "归档CLI方案、更新架构文档、创建Agent转换脚本注入8个自定义Agent"
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
tags:
    - MLRA
    - agent-injection
    - documentation
    - VS-Code-customization
solved_lists:
    - CLI方案文档归档（添加ARCHIVED标签和说明）
    - 架构设计文档更新至v0.4（§2.2编排器、§2.3基座平台、§11实现路径、§12决策记录）
    - 创建Agent注入脚本 scripts/inject-agents.mjs
    - 8个MLRA Agent注入为VS Code用户级自定义Agent
---

# MLRA 文档清理与 Agent 注入

## 1. Previous Conversation

本次会话承接了上一轮 MLRA 深度研究会话的未完成工作。上一轮会话完成了以下关键里程碑：

1. **VS Code Chat API 发现**: 通过逆向工程 Copilot Chat 扩展和阅读 VS Code 源码 `chatActions.ts`，发现 `workbench.action.chat.open` 的 `mode` 参数可接受自定义 Agent 名称，实现了编程化的 Agent 选择
2. **PoC 验证通过**: Tests 4a-4c 全部通过（Agent 选择 + 模型选择 + blockOnResponse 同步等待）
3. **register_LRA 架构决策**: 用户提出并确认了 register_LRA 方案 — Agent 通过 MCP 阻塞自注册，复用 MLFB 已有架构
4. **VSCode 方案文档 v0.2**: 已创建并更新完毕
5. **跨文档分析**: 分析了 4 个 MLRA 规划文档（共 3822 行），确定清理方案：归档 CLI 文档、更新架构文档、保留 UI 规格文档、VSCode 方案为当前活跃
6. **用户批准清理**: 用户回复"同意，执行"，但上一轮会话因 token 超限未能执行

本次会话的工作从执行上轮批准的清理方案开始，然后扩展到用户新提出的 Agent 注入需求。

## 2. Current Work

### 2.1 文档清理（上轮遗留任务）

**CLI 方案文档归档**:
- 文件: `.myLastChat/MLC_MLRA_CLI自动化方案规划.md`
- 在 YAML frontmatter 中添加 `ARCHIVED` tag
- 在文档开头添加醒目的归档说明块，指向 VSCode 方案文档
- 原始内容完整保留供历史参考

**架构设计文档更新至 v0.4**:
- 文件: `.myLastChat/MLC_MLRA架构设计文档.md`
- §2.2 编排器: "ACP 进程管理器" → "Session 注册管理"（register_LRA 阻塞、session_id 追踪、Hook TCP 通知）；"进程健康监控" → "会话健康监控"
- §2.3 基座平台: "Copilot CLI + ACP" → "VS Code Copilot Chat + register_LRA + Copilot Hooks"，添加 `chat.open` 参数说明
- §11 实现路径: "ACP PoC → MVP-1~5" → "Phase 1-4"（与 VSCode 方案文档 §5 对齐）
- §12 决策记录: "基于 Copilot CLI 而非自建运行时" → "基于 VS Code Copilot Chat 而非 CLI/ACP"
- 版本号: v0.3-draft → v0.4-draft

### 2.2 Agent 注入（用户新需求）

用户要求: "将 .mlra/prompts 下的各 agent 提示词转化为实际的 copilot 自定义 agent，要求是 user 全局级别。你可以编写一个脚本来实现该步骤的自动注入。"

**创建的转换脚本**: `scripts/inject-agents.mjs`
- 读取 `.mlra/prompts/` 下 8 个 Agent 提示词文件
- 自动去除原始文件头部（标题行、描述引用行）
- 添加标准 `.agent.md` YAML frontmatter（name, description, tools）
- 输出到 VS Code 用户 prompts 目录: `%APPDATA%/Code/User/prompts/`
- 支持 `--dry-run`（预览）和 `--force`（覆盖）模式
- 跨平台路径解析（Windows/macOS/Linux）

**生成的 8 个 Agent 文件**:

| 源文件 | 目标文件 | 角色 | 工具权限 |
|--------|---------|------|---------|
| expert-planning.md | mlra-expert-planning.agent.md | Planning Expert | read, search, web, todo, MCP |
| expert-execution.md | mlra-expert-execution.agent.md | Execution Expert | read, edit, search, execute, todo, agent, MCP |
| inspector-planning.md | mlra-inspector-planning.agent.md | Planning Inspector | read, search, todo, MCP |
| inspector-execution.md | mlra-inspector-execution.agent.md | Execution Inspector | read, search, todo, MCP |
| ceo.md | mlra-ceo.agent.md | CEO | read, search, todo, MCP |
| worker.md | mlra-worker.agent.md | Worker Agent | read, edit, search, execute, todo, MCP |
| worker-frontend.md | mlra-worker-frontend.agent.md | Frontend Worker | read, edit, search, execute, todo, MCP |
| worker-backend.md | mlra-worker-backend.agent.md | Backend Worker | read, edit, search, execute, todo, MCP |

`tail-injection.md` 未转换 — 它是编排器运行时模板，非独立 Agent。

## 3. Key Technical Concepts

- **VS Code Custom Agent (.agent.md)**: 通过 YAML frontmatter 定义 `name`, `description`, `tools`，放置在用户 prompts 目录实现全局可用
- **用户级 Agent 路径**: `%APPDATA%/Code/User/prompts/` (Windows), `~/Library/Application Support/Code/User/prompts/` (macOS)
- **Agent Tool Aliases**: `read`, `edit`, `search`, `execute`, `todo`, `agent`, `web` — VS Code 内置工具别名
- **MCP 工具注入**: `tools: ["my-last-feedback/*"]` 使 Agent 可调用 MCP Server 的所有工具
- **register_LRA 架构**: Agent 启动后首次调用 register_LRA MCP 工具 → 阻塞 → 编排器捕获 → 分配角色 → 编排开始
- **`workbench.action.chat.open`**: `mode` 参数接受自定义 Agent 名称，`modelSelector` 选模型，`blockOnResponse` 同步等待
- **入参-出参交叉通信**: Agent A submit(入参) → 阻塞 → 编排器路由 → Agent B 收到出参 — 核心通信模型保持不变

## 4. Relevant Files and Code

### `.myLastChat/MLC_MLRA_CLI自动化方案规划.md`
- 已添加 ARCHIVED 标签和归档说明
- 原始内容保留供历史参考（ACP API 分析、PoC 结果等）

### `.myLastChat/MLC_MLRA架构设计文档.md`
- 更新至 v0.4-draft
- §2.2, §2.3, §11, §12 已对齐 VS Code + register_LRA 架构
- 其余章节（§3-§10, §13-§14）仍有效未修改

### `scripts/inject-agents.mjs`
- 新创建的 Agent 注入脚本
- 关键代码结构:
```javascript
const AGENT_DEFS = [
  {
    source: "expert-planning.md",
    output: "mlra-expert-planning.agent.md",
    name: "Planning Expert",
    description: "MLRA planning phase: ...",
    tools: ["read", "search", "web", "todo", "my-last-feedback/*"],
  },
  // ... 8 个 Agent 定义
];

function extractBody(rawContent) {
  // 移除标题和引用行，保留从 Identity Override 开始的正文
}

function buildAgentFile(def, body) {
  // 生成 YAML frontmatter + body
}
```

### `.mlra/prompts/` (8 个源文件)
- 原始 MLRA Agent 提示词，包含完整的角色定义、行为指令、通信协议
- 每个文件 180-411 行，总计 2181 行

### `c:\Users\Aftersix\AppData\Roaming\Code\User\prompts/` (8 个生成文件)
- 已部署的 VS Code 用户级自定义 Agent
- 可在任何工作区的 Agent Picker 中选择使用

### `.myLastChat/MLC_MLRA_VSCode自动化方案规划.md`
- 当前活跃方案文档，v0.2-draft，603 行
- 本次未修改

### `.myLastChat/MLC_MLRA_UI交互规格文档.md`
- UI 交互规格，v0.1，746 行
- 本次未修改（与后端变更无关）

## 5. Problem Solving

### 上轮遗留的 token 超限问题
- 上轮会话在用户批准清理方案后因 token 超限无法执行
- 本轮通过 conversation-summary 完整恢复了上下文，直接执行了批准的操作

### Agent 文件格式选择
- 确认了 VS Code 用户级自定义 Agent 的正确路径: `%APPDATA%/Code/User/prompts/` 而非 `.github/agents/`
- 通过阅读 `agent-customization` SKILL 文档和 `agents.md` 参考文件确认格式规范

### 提示词头部剥离
- 原始 prompt 文件包含 `# Title`, `> Description` 和 `---` 分隔线
- `extractBody()` 函数自动剥离这些元数据行，保留从 `## Identity Override` 开始的正文

## 6. Pending Tasks and Next Steps

### 无新的待完成任务
本轮所有明确要求的任务均已完成:
- ✅ CLI 文档归档
- ✅ 架构文档更新至 v0.4
- ✅ Agent 注入脚本创建
- ✅ 8 个 Agent 注入完成

### 后续可能的工作方向（来自上轮会话的长期规划）

1. **Phase 1 实现**: 实现 `register_LRA` MCP 工具（复用 MLFB MCP Server 架构）
2. **Hook 扩展**: 扩展 `~/.copilot/hooks/inject-agent-name.mjs`，在 SessionStart 时通过 TCP 通知 MLFB Desktop 完整 session_id
3. **toolsInclude 正确 ID**: 获取 VS Code Copilot Chat 中注册的工具 ID（当前 Test 4d 因 ID 错误失败）
4. **MLFB UI 扩展**: 在 MLFB Desktop 中添加 MLRA Agent 状态展示
5. **双主 Agent 循环**: 实现 submit 入参-出参交叉路由（专家 ↔ 监察）
