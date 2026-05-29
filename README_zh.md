# My Last Feedback

面向 AI 辅助开发流程的开发者伴侣 GUI。集成交互式反馈、开发工具面板和知识管理于一体，通过一个桌面应用连接你的 AI 编程 Agent。

支持 [Cursor](https://www.cursor.com)、[VS Code Copilot](https://code.visualstudio.com/)、[Cline](https://cline.bot)、[Windsurf](https://windsurf.com)、[Codex](https://github.com/openai/codex) 等所有支持 [MCP 协议](https://modelcontextprotocol.io/) 的 AI 开发工具。

**Tauri 2.0 + React 19** 构建，二进制仅 ~11 MB。

[English](README.md)

---

## 功能

### 核心 — 交互式反馈

| 功能 | 说明 |
|------|------|
| **反馈窗口** | Agent 请求反馈时弹出原生桌面窗口 |
| **Markdown 渲染** | Agent 工作摘要以富文本 Markdown 显示，支持 KaTeX 数学公式和 Mermaid 图表 |
| **多 Caller 支持** | 多个 AI 客户端同时连接，标签切换、Caller 合并、别名、排序 |
| **图片附件** | 文件选择器、Ctrl+V 粘贴、拖拽上传，最多 5 张 |
| **结构化问题** | Agent 可在反馈表单中展示单选选项或自由文本输入 |
| **快捷操作** | 一键预设回复（开始、继续、分析、修复等） |
| **自定义 Prompt** | 将 `.prompt.md` 文件放入 `mcp_prompts/` 目录，变成可点击的快捷提交按钮 |
| **MCP 配置助手** | 内置配置生成器，自动检测安装路径，一键复制 |
| **转移与拆分** | 将反馈转发给其他 Caller；将请求拆分为独立子会话 |
| **会话导航** | 四种视图模式 — 活跃、最近、搜索、按 Caller 历史 |

### 内置面板

| 面板 | 说明 |
|------|------|
| **终端** | 完整 PTY 终端，支持多标签页、缓冲区持久化、PS1 感知输出 |
| **Git** | 日志历史、暂存/未暂存差异分解、一键快速备份 |
| **预览浏览器** | 内嵌浏览器面板，用于查看开发中的本地服务器或文件 |
| **My Last Chat (MLC)** | 知识库侧栏面板 — 浏览、搜索、收藏、预览 Markdown 文档 |
| **项目资源** | 当前工作区的目录树浏览器 |
| **订阅** | 一站式监控仪表板订阅、API 用量和模型余额 |

### 通用

| 功能 | 说明 |
|------|------|
| **双主题** | 暗色 / 亮色主题切换 |
| **中英双语** | 完整的中文和英文界面 |
| **托盘 + 自启** | 系统托盘图标（显示/退出）；可选开机自动启动 |
| **单实例** | 自动复用已运行的实例 |
| **持久化历史** | 所有会话、Caller 和草稿反馈在重启后保留 |
| **可停靠面板** | 可调整大小的三栏停靠布局 — 面板可在列之间拖拽 |

---

## 工作原理

```
AI Agent ──stdio──▶ MCP Server (Node.js) ──TCP IPC──▶ Tauri 桌面应用 (GUI)
                          ▲                                  ↓
                          │                              用户反馈
                          │                                  ↓
AI Agent ◀── 文本 + 图片 ◀────────────────────────────── 提交反馈
```

1. AI 客户端通过 MCP 协议调用 `interactive_feedback` 工具
2. `mcp/mlfb/index.mjs` 通过 TCP IPC 连接 Tauri 桌面应用
3. 用户在 GUI 中查看 Agent 的工作摘要、输入反馈、附加图片
4. 反馈（文本 + 图片）通过 MCP 返回给 Agent

首次调用时自动启动桌面应用，后续调用复用已运行的实例。客户端断开连接时，所有待处理会话自动取消。

---

## 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) **18+**

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 AI 工具

MCP 入口点为 `mcp/mlfb/index.mjs`。请将下面的路径替换为实际安装路径。

#### Cursor

添加到 `~/.cursor/mcp.json`（全局）或 `<项目>/.cursor/mcp.json`（项目级别）：

```json
{
  "mcpServers": {
    "my-last-feedback": {
      "command": "node",
      "args": ["/path/to/my-last-feedback/mcp/mlfb/index.mjs"],
      "timeout": 600,
      "autoApprove": ["interactive_feedback"]
    }
  }
}
```

#### VS Code (Copilot)

添加到项目的 `.vscode/mcp.json`：

```json
{
  "servers": {
    "my-last-feedback": {
      "command": "node",
      "args": ["/path/to/my-last-feedback/mcp/mlfb/index.mjs"],
      "timeout": 600
    }
  }
}
```

#### Codex

编辑 `~/.codex/config.toml`：

```toml
[mcp_servers."my-last-feedback"]
type = "stdio"
command = "node"
args = ["/path/to/my-last-feedback/mcp/mlfb/index.mjs"]
tool_timeout_sec = 64800
enabled = true

[mcp_servers."my-last-feedback".tools.interactive_feedback]
approval_mode = "approve"
```

Codex hook 注入 agent_name 请参考 `dist/codex-hooks/` 和 `dist/SETUP.md`。

#### Cline / Windsurf / 其他

在对应工具的 MCP 设置中使用相同的 `command` / `args` 格式。模板文件见 `mcp.json.template`。

> 启动应用后，内置的 **MCP 配置助手**（齿轮图标 → 通用标签页）可自动生成包含实际安装路径的正确配置。

### 3. 添加 Agent 指令

将以下规则添加到 AI 工具的自定义指令中：

| 工具 | 位置 |
|------|------|
| Cursor | `<项目>/.cursor/rules/interactive_feedback.instructions.md` |
| VS Code | `.github/copilot-instructions.md` 或 `.vscode/*.instructions.md` |
| Codex | 将 `dist/prompt.instructions.md` 的内容复制到 Codex 指令中 |
| Cline | 自定义指令设置 |

```markdown
## MUST FOLLOW:
完成任何用户请求之前，必须调用 interactive_feedback 工具。

## 使用规则:
- 需要用户确认时（测试、终端命令、报告、提问），调用 interactive_feedback
- 完成任何用户请求之前，调用 interactive_feedback
- 持续调用 interactive_feedback 直到用户反馈为空，然后结束请求
- 每次调用 interactive_feedback 都必须传入 request_type。

## Agent 身份 (agent_name)
- agent_name 为必填。使用反馈响应或 hook 上下文分配的 4 位大写十六进制标识符。
- 不要自行编造或替换 agent_name；如果未知，应先取得已分配的标识符再调用。
- 之后所有调用中必须传回该标识符。

## 请求类型 (request_type)
- request_type 每次调用都必填。
- 允许值：analysis、completion、planning、document。
- 分析或报告使用 analysis；完成工作使用 completion；规划方案使用 planning；文档相关任务使用 document。
- request_type 只是分类与视觉展示元数据，不会改变工具行为、权限、路由或可用能力。

## 结构化问题 (questions)
- 需要用户补充信息或选择方案时，使用 questions 参数。
- questions 是 { label, options? } 数组。有 options 渲染为单选按钮，无则渲染为文本输入。
- questions 仅放简短选项标签，完整上下文写在 summary 中。

## 转移功能 (transfer_to_alias)
- 当用户反馈包含转移指令（如"转给 Alice"），在下次 interactive_feedback 调用中设置 transfer_to_alias 为目标别名。
- 转移触发后，继续正常调用 interactive_feedback — 新 Caller 将处理后续工作流。
```

### 4. 完成

Agent 现在会在需要确认时弹出反馈窗口。

---

## 工具参考

### `interactive_feedback`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_directory` | `string` | ✅ | 项目目录完整路径 |
| `summary` | `string` | ✅ | Markdown 格式的工作摘要（不要使用 `\n` 转义字符） |
| `request_name` | `string` | ✅ | 任务标题（5-10 个词），显示在标题栏 |
| `request_type` | `string` | ✅ | `analysis`、`completion`、`planning`、`document` 之一 |
| `agent_name` | `string` | ✅ | 4 位大写十六进制标识符，之后调用传回同一个 ID |
| `questions` | `array` | ❌ | 结构化问题：`[{ label: string, options?: string[] }]` |
| `transfer_to_alias` | `string` | ❌ | 按别名将当前会话转移给另一个 Caller |

#### 返回值

返回 MCP 内容块列表（`TextContent` 和/或 `ImageContent`）：

```json
[
  { "type": "text", "text": "用户的反馈文本" },
  { "type": "image", "data": "<base64>", "mimeType": "image/png" }
]
```

---

## 图片附件

| 方式 | 操作 |
|------|------|
| 文件选择器 | 点击 📎 按钮 |
| 剪贴板 | 在输入区域按 Ctrl+V |
| 拖拽 | 将文件拖到窗口 |

| 限制 | 值 |
|------|-----|
| 最大数量 | 5 张 |
| 单张上限 | 5 MB |
| 总计上限 | 20 MB |
| 格式 | PNG、JPG、GIF、WEBP、BMP |

---

## 自定义 Prompt 按钮

在 `mcp_prompts/` 目录放置 `.prompt.md` 文件：

```markdown
---
name: "运行测试"
description: "请求 Agent 运行测试套件"
icon: "play"
---
请运行完整的测试套件并报告结果。
```

点击按钮将 prompt 内容附加到反馈并立即提交。

### 可用图标

`book` `file` `file-text` `edit` `code` `terminal` `search` `message` `chat` `brain` `lightbulb` `star` `folder` `settings` `database` `link` `list` `check` `play` `zap` `compass` `layers` `globe` `target` `shield` `clock` `tag` `tool` `box` `hash` `wand` `sparkles` `clipboard` `rocket` `bug` `summary` `knowledge` `magic` `refresh` `send` `download` `upload` `alert` `info`

---

## 设置

通过标题栏齿轮按钮打开设置面板：

| 标签 | 内容 |
|------|------|
| **通用** | 开机自启、MCP 配置助手 |
| **显示** | 主题切换（暗色/亮色）、语言（中文/EN） |
| **Prompts** | 启用/禁用自定义 Prompt 按钮 |
| **关于** | 版本信息 |

---

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `MLF_APP_PATH` | 覆盖 Tauri 二进制路径 | 自动检测 |
| `MLF_DEV` | 以开发模式运行（使用独立数据目录） | 不设置 |
| `MLF_CALLER_NAME` | 覆盖 Caller 显示名称 | `codex` |

| 变量（Rust 后端） | 说明 | 默认 |
|--------------------|------|------|
| `MLFB_REMOTE_ENABLED` | 启用远程 HTTP+WS 服务（实验性） | 不设置 |

---

## 开发中实验功能

以下功能代码已存在于仓库中，但**当前发行版不包含**。它们可能由 feature flag 控制、需手动启用，或实现尚未完成。

### MLRA — 多 Agent 长期运行编排工作流

面向多 Agent、多阶段自主工作流的编排平台，保留人工参与控制。

| 组件 | 状态 |
|------|------|
| Daemon（编排器、路由器、IPC 桥接） | 代码完成，不打包 |
| CEO / Expert / Inspector MCP Server | 代码完成，不打包 |
| 前端 UI（MLRA 视图、角色图标、阶段管线） | 代码完成，UI 隐藏（`VITE_DISABLE_MLRA_UI=true`） |
| Worker 子 Agent 池 | 已禁用（`WORKER_ENABLED=false`），代码保留 |

架构详情见 `.myLastChat/MLC_MLRA_v2_三Server重构架构.md` 和 `mcp/mlra/`。

### Android 伴侣应用（`android-mlfb/`）

基于 Kotlin 的 Android 应用，用于从移动设备接收和响应反馈请求。通过 Gradle 独立构建，不包含在 Tauri 桌面应用构建中。

构建说明见 `android-mlfb/README.md`。

### 远程服务器

HTTP + WebSocket 服务器（`remote.rs`），支持移动客户端通过 Tailscale 连接。当前为 Phase 0 骨架 — 仅实现了 `/api/health` 端点。通过 `MLFB_REMOTE_ENABLED=1` 手动启用。

### Agent Console（Agent 控制台）

完整的子进程管理后端（`agent_process.rs`）— 启动、stdin 写入、stdout/stderr 读取、终止。React 前端已完成但被 `VITE_DISABLE_AGENT_UI=true` 隐藏。

---

## 从源码构建

### 环境要求

- Node.js 18+
- Rust 1.70+（含 cargo）
- Visual Studio Build Tools（Windows）

### 构建步骤

```bash
# 安装依赖
npm install
cd app && npm install

# 开发模式
npx tauri dev

# 生产构建
npx tauri build --no-bundle

# 打包分发
bash scripts/package-win.sh
```

输出：`app/src-tauri/target/release/app.exe`（Windows）或 `app/src-tauri/target/release/app`（macOS/Linux）

详细构建指南见 [BUILD.md](BUILD.md)，仓库维护指南见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 项目结构

```
my-last-feedback/
├── mcp/                        # MCP 服务（Node.js）
│   ├── common/                 # 共享工具（端口发现、子进程启动、引导）
│   ├── mlfb/                   # My Last Feedback MCP 服务
│   │   ├── index.mjs           # 入口（stdio MCP server）
│   │   ├── app-ipc.mjs         # 与 Tauri 应用的 TCP IPC 桥接
│   │   ├── http-server.mjs     # 可选 HTTP MCP server
│   │   └── tools/              # 工具定义
│   └── mlra/                   # MLRA 多 Agent 编排（开发中，当前版本不包含）
├── app/                        # Tauri 2.0 桌面应用
│   ├── src/                    # React 19 前端
│   │   ├── components/         # UI 组件
│   │   ├── store/              # Zustand 状态管理
│   │   ├── i18n/               # 国际化（中/英）
│   │   └── transport/          # IPC 传输层
│   └── src-tauri/              # Rust 后端
│       └── src/                # Tauri 命令、IPC、终端、预览浏览器、Git 等
├── mcp_prompts/                # 自定义 Prompt 按钮模板
├── dist/                       # 分发包 & Codex hooks
│   ├── codex-hooks/            # Codex hook 脚本
│   └── win-x64/                # Windows x64 发行包
├── android-mlfb/               # Android 伴侣应用（开发中）
├── scripts/                    # 构建和打包脚本（Win/Mac）
├── BUILD.md                    # 构建指南
└── CONTRIBUTING.md             # 仓库维护指南
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Tauri 2.0 |
| 前端 | React 19 + TypeScript + Vite 7 |
| CSS | Tailwind CSS 4 |
| 状态管理 | Zustand 5 |
| 终端 | xterm.js 6 |
| Markdown | react-markdown + remark-gfm + KaTeX + Mermaid |
| 国际化 | i18next |
| MCP 协议 | @modelcontextprotocol/sdk 1.12 |
| 后端 | Rust 2021（tokio、axum、portable-pty） |

---

## 许可证

MIT 许可证 — 详见 [LICENSE](LICENSE)。
