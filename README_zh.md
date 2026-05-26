# My Last Feedback

一个轻量级的 MCP 反馈 GUI 工具，让 AI Agent 在完成任务前向你请求确认和反馈。

支持 [Cursor](https://www.cursor.com)、[VS Code Copilot](https://code.visualstudio.com/)、[Cline](https://cline.bot)、[Windsurf](https://windsurf.com) 等支持 MCP 协议的 AI 开发工具。

**Tauri 2.0 + React 19** 构建，二进制仅 ~11 MB。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **反馈窗口** | Agent 请求反馈时弹出原生桌面窗口 |
| **Markdown 渲染** | Agent 的工作摘要以富文本 Markdown 显示 |
| **多 Caller 支持** | 多个 AI 客户端同时使用，标签页切换 + 多列布局 |
| **图片附件** | 文件选择器、Ctrl+V 粘贴、拖拽，最多 5 张 |
| **快捷操作** | 一键预设回复（开始、继续、分析、修复等） |
| **自定义 Prompt** | `mcp_prompts/` 目录放置 `.prompt.md` 文件，变成可点击按钮 |
| **MCP 配置助手** | 内置配置生成器，自动检测安装路径，一键复制 |
| **设置面板** | 通用设置、显示（主题/语言）、Prompt 管理、关于 |
| **双主题** | 暗色 / 亮色主题切换 |
| **中英双语** | 完整的中文和英文界面 |
| **置顶模式** | 窗口置顶，随时查看 Agent 进度 |
| **开机自启** | 可选开机自动启动 |
| **单实例** | 自动复用已运行的实例 |

---

## 工作原理

```
AI Agent ──stdio──▶ server.mjs (MCP Server) ──TCP IPC──▶ Tauri App (GUI)
                                                              ↓
                                                         用户反馈
                                                              ↓
AI Agent ◀──────── 文本 + 图片返回 ◀──────────────────── 提交反馈
```

1. AI 客户端通过 MCP 协议调用 `interactive_feedback` 工具
2. `server.mjs` 通过 TCP IPC 连接 Tauri 桌面应用
3. 用户在 GUI 中查看 Agent 的工作摘要，输入反馈
4. 反馈（文本 + 图片）通过 MCP 返回给 Agent

首次调用时自动启动桌面应用，后续调用复用已运行的实例。

---

## 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) **18+**

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 AI 工具

#### Cursor

添加到 `~/.cursor/mcp.json`（全局）或 `<项目>/.cursor/mcp.json`（项目级别）：

```json
{
  "mcpServers": {
    "my-last-feedback": {
      "command": "node",
      "args": ["/path/to/my-last-feedback/server.mjs"],
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
      "args": ["/path/to/my-last-feedback/server.mjs"],
      "timeout": 600
    }
  }
}
```

#### Cline / Windsurf

在对应工具的 MCP 设置中使用相同的 `command` / `args` 格式。

> 将 `/path/to/my-last-feedback` 替换为实际安装路径。启动应用后，内置的 **MCP 配置助手** 可自动生成正确的配置。

### 3. 添加 Agent 指令

将以下规则添加到 AI 工具的自定义指令中：

| 工具 | 位置 |
|------|------|
| Cursor | `<项目>/.cursor/rules/interactive_feedback.instructions.md` |
| VS Code | `.github/copilot-instructions.md` 或 `.vscode/*.instructions.md` |
| Cline | 自定义指令设置 |

```markdown
## MUST FOLLOW:
Whenever you're about to complete a user request, call the interactive_feedback tool.

## 使用规则:
- 需要用户确认时（测试、终端命令、报告、提问），调用 interactive_feedback
- 完成任何用户请求之前，调用 interactive_feedback
- 持续调用 interactive_feedback 直到用户反馈为空

## Agent 身份 (agent_name)
- 首次调用时，留空 agent_name 或省略该参数。
- 响应中会分配一个 agent 标识符（如 "B780"）。
- 之后所有调用中必须传回该标识符。

## 结构化问题 (questions)
- 需要用户补充信息或选择方案时，使用 questions 参数。
- questions 是 { label, options? } 数组。有 options 渲染为单选按钮，无则渲染为文本输入。
- questions 仅放简短标签，完整内容写在 summary 中。
```

### 4. 完成

Agent 现在会在需要确认时弹出反馈窗口。

---

## 工具参考

### `interactive_feedback`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_directory` | `string` | ✅ | 项目目录完整路径 |
| `summary` | `string` | ✅ | Markdown 格式的工作摘要 |
| `request_name` | `string` | ✅ | 任务标题（5-10 个词），显示在标题栏 |
| `agent_name` | `string` | ❌ | Agent 标识符。首次调用留空，之后传回分配的 ID |
| `questions` | `array` | ❌ | 结构化问题：`[{ label: string, options?: string[] }]` |

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
| 格式 | PNG, JPG, GIF, WEBP, BMP |

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

`icon` 字段支持 45 个预设图标：

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

---

## 从源码构建

### 环境要求

- Node.js 18+
- Rust 1.70+ (含 cargo)
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
```

输出：`app/src-tauri/target/release/app.exe`（Windows）或 `app/src-tauri/target/release/app`（macOS/Linux）

详细构建指南见 [BUILD.md](BUILD.md)，仓库维护指南见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 项目结构

```
my-last-feedback/
├── server.mjs              # MCP Server（Node.js, stdio + TCP IPC）
├── package.json            # MCP Server 依赖
├── mcp_prompts/            # 自定义 Prompt 按钮模板
├── app/                    # Tauri 2.0 桌面应用
│   ├── src/                # React 19 前端
│   │   ├── components/     # UI 组件
│   │   ├── store/          # Zustand 状态管理
│   │   └── i18n/           # 国际化 (中/英)
│   └── src-tauri/          # Rust 后端
│       └── src/            # Tauri 命令 + IPC 通信
├── scripts/                # 打包脚本 (Win/Mac)
├── BUILD.md                # 构建指南
└── CONTRIBUTING.md         # 仓库维护指南
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Tauri 2.0 |
| 前端 | React 19 + TypeScript + Vite 7 |
| 状态管理 | Zustand 5 |
| 国际化 | i18next |
| MCP 协议 | @modelcontextprotocol/sdk 1.12 |
| 后端 | Rust 2021 |

---

## 许可证

参见 [LICENSE](LICENSE)。
