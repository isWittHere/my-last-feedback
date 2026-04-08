---
title: "Tauri 2.0 Interactive Feedback MCP 完整开发计划"
description: "基于 Tauri 2.0 重构 interactive-feedback-mcp，替代 PySide6 方案"
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - tauri
    - mcp
    - interactive-feedback
    - rust
    - react
    - typescript
solved_lists:
    - 参考项目分析完成
    - 技术栈对比完成
    - 开发计划制定完成
---

# Tauri 2.0 Interactive Feedback MCP — 完整开发计划

> 创建日期：2026-03-04

---

## 一、项目背景

### 参考项目分析

参考项目 `interactive-feedback-mcp-main` 的技术栈为 **Python + PySide6 (Qt) + FastMCP**。

| 组件 | 说明 |
|------|------|
| `server.py` | MCP Server，基于 FastMCP，通过 stdio 传输协议通信 |
| `feedback_ui.py` / `feedback_ui_en.py` | PySide6 GUI 客户端（中/英双语，**两个完整拷贝**~895 行/文件） |
| `mcp_prompts/` | 自定义 `.prompt.md` 按钮模板 |

### 核心工作流

1. AI Agent 调用 `interactive_feedback` MCP tool（参数：`project_directory`, `summary`, `request_name`）
2. Server 通过 `subprocess.run()` 启动 PySide6 GUI 进程
3. GUI 弹出桌面窗口（置顶），用户输入反馈 / 附加图片
4. 结果通过临时 JSON 文件传回 server，再作为 `TextContent` / `ImageContent` 返回给 Agent

### 现有方案的局限性

| 问题 | 详情 |
|------|------|
| **PySide6 包体积巨大** | ~150MB+，安装慢，依赖 Qt 运行时 |
| **启动速度慢** | 每次弹窗都要 `subprocess.run()` 启动新 Python + Qt 进程 |
| **i18n 方案原始** | 两个完整的 UI 文件拷贝（zh/en），维护困难 |
| **数据传输低效** | 通过临时文件传递 JSON，存在文件清理和竞态问题 |
| **无热更新能力** | UI 修改需重启整个 MCP server |
| **平台兼容性隐患** | Windows dark title bar 用 ctypes 硬编码 dwmapi，Mac 无暗色标题栏支持 |

---

## 二、技术栈方案对比

### 候选方案

| 方案 | 技术栈 | 包体积 | 优势 | 劣势 |
|------|--------|--------|------|------|
| **A: Tauri 2.0** ✅ | Rust + React/TS | ~5-10MB | 极小体积、极快启动、原生体验 | Rust 学习曲线 |
| B: Electron | Node.js + React/TS | ~80-100MB | 全栈 TS、生态成熟 | 体积大、内存高 |
| C: Wails | Go + React/TS | ~10-15MB | 体积小、Go 并发优 | MCP Go SDK 不成熟 |

### 最终选择：**方案 A — Tauri 2.0**

---

## 三、项目整体架构

```
my-last-feedback/
├── src-tauri/              # Tauri/Rust 后端
│   ├── src/
│   │   ├── main.rs         # Tauri 入口
│   │   ├── mcp_server.rs   # MCP Server (Rust) 或 Python 子进程桥接
│   │   ├── ipc.rs          # Tauri IPC commands
│   │   └── lib.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                    # 前端 (React + TypeScript)
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── FeedbackWindow.tsx      # 主反馈窗口
│   │   ├── MarkdownPreview.tsx     # Markdown 渲染区
│   │   ├── FeedbackInput.tsx       # 反馈输入框
│   │   ├── TestLogInput.tsx        # 测试日志输入区
│   │   ├── ImageAttachment.tsx     # 图片附件管理
│   │   ├── QuickActions.tsx        # 快捷操作按钮
│   │   ├── PromptButtons.tsx       # 自定义 prompt 按钮
│   │   └── TitleBar.tsx            # 自定义标题栏(可选)
│   ├── hooks/
│   │   ├── useFeedback.ts          # 反馈状态管理
│   │   ├── useImages.ts            # 图片管理 hook
│   │   └── useSettings.ts          # 持久化设置 hook
│   ├── i18n/
│   │   ├── index.ts               # i18next 配置
│   │   ├── en.json                # 英文
│   │   └── zh.json                # 中文
│   ├── styles/
│   │   └── globals.css            # TailwindCSS + 暗色主题
│   └── types/
│       └── index.ts               # TypeScript 类型定义
├── mcp_prompts/            # 自定义 prompt 模板（保持兼容）
├── server.py               # Python MCP Server（渐进方案：保留）
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
└── pyproject.toml          # Python 依赖（仅 MCP server 部分）
```

---

## 四、分阶段开发计划

### Phase 1：基础框架搭建（预计 2-3 天）

| 任务 | 说明 |
|------|------|
| 初始化 Tauri 2.0 + React + Vite 项目 | `npm create tauri-app` |
| TailwindCSS 4 + 暗色主题配置 | 原生暗色模式支持 |
| i18next 国际化框架搭建 | 中英文 JSON 资源文件 |
| Tauri 窗口配置 | 置顶、尺寸记忆、暗色标题栏 |

### Phase 2：核心 UI 组件（预计 3-4 天）

| 任务 | 说明 |
|------|------|
| MarkdownPreview 组件 | 使用 `react-markdown` + `remark-gfm` 渲染 Agent 摘要 |
| FeedbackInput 组件 | 纯文本输入，支持 Ctrl+Enter 提交 |
| TestLogInput 组件 | 测试日志区域 |
| QuickActions 组件 | 快捷按钮（开始/继续/分析/修复/解释） |
| PromptButtons 组件 | 从 `mcp_prompts/` 加载 `.prompt.md` 文件动态生成按钮 |
| 窗口尺寸记忆 | 使用 Tauri store plugin 持久化窗口位置和大小 |

### Phase 3：图片附件系统（预计 2-3 天）

| 任务 | 说明 |
|------|------|
| 文件选择器 | Tauri `dialog.open()` API |
| 剪贴板粘贴 | 前端监听 `Ctrl+V`，通过 Tauri clipboard API 获取图片 |
| 拖拽上传 | HTML5 Drag & Drop API |
| 缩略图预览 | 使用 `URL.createObjectURL` / base64 预览 |
| 图片大小和数量限制 | 5 张 / 5MB 单张 / 20MB 总量 |

### Phase 4：MCP Server 通信（预计 2-3 天）

**策略：渐进式迁移 — 先保留 Python MCP Server，用 HTTP/WebSocket 桥接 Tauri App**

| 任务 | 说明 |
|------|------|
| **方式 1 (初期推荐)** | 改造 Python Server，通过 HTTP/WebSocket 调用 Tauri App |
| **方式 2 (终极目标)** | 用 `rmcp` crate 在 Rust 端实现完整 MCP Server |
| IPC 通信层 | Tauri Commands 作为前后端桥梁 |
| 结果回传 | Tauri App → MCP Server（HTTP callback / stdin-stdout pipe） |

#### 初期通信架构

```
AI Agent (Cursor/VSCode)
    ↓ stdio (MCP protocol)
Python MCP Server (server.py)
    ↓ HTTP POST (localhost:随机端口)
Tauri App (常驻后台 / 按需启动)
    ↓ 用户交互
    ↓ HTTP Response / WebSocket
Python MCP Server
    ↓ MCP Result
AI Agent
```

#### 终极通信架构

```
AI Agent
    ↓ stdio (MCP protocol)
Tauri App (内置 Rust MCP Server)
    ↓ 用户交互 → 直接返回
AI Agent
```

### Phase 5：增强特性（预计 2-3 天）

| 任务 | 说明 |
|------|------|
| 设置持久化 | Tauri store plugin (per-project config) |
| 增强提醒复选框 | 控制是否提醒 Agent 再次调用 `interactive_feedback` |
| 键盘快捷键 | Ctrl+Enter 提交，ESC 关闭 |
| 自动聚焦 | 窗口弹出时自动聚焦到输入框 |
| 系统通知 | Tauri notification plugin |

### Phase 6：打包与分发（预计 1-2 天）

| 任务 | 说明 |
|------|------|
| Windows `.msi` / `.exe` 打包 | Tauri bundler |
| macOS `.dmg` / `.app` 打包 | Tauri bundler |
| GitHub Actions CI/CD | 自动构建 Windows/Mac 二进制并发布 Release |
| MCP 配置模板 | `mcp.json.template` 适配新方案 |

---

## 五、关键技术选型

| 类别 | 选型 | 版本 |
|------|------|------|
| **桌面框架** | Tauri | 2.x |
| **前端框架** | React | 19.x |
| **构建工具** | Vite | 6.x |
| **样式** | TailwindCSS | 4.x |
| **Markdown 渲染** | react-markdown + remark-gfm | latest |
| **国际化** | i18next + react-i18next | latest |
| **状态管理** | Zustand (轻量) 或 React Context | latest |
| **MCP Server** | Python FastMCP（初期） → Rust rmcp（终期） | - |

---

## 六、对比原方案的改进

| 维度 | 原方案 (PySide6) | 新方案 (Tauri 2.0) |
|------|------------------|-------------------|
| 包体积 | ~150MB+ | ~5-10MB |
| 启动速度 | 慢（Python + Qt 进程） | 快（原生进程 + WebView） |
| 内存占用 | 高 | 低 |
| i18n | 双文件拷贝 | i18next JSON 资源 |
| 数据传输 | 临时文件 | IPC / HTTP |
| 暗色模式 | Windows only (ctypes hack) | 原生全平台 |
| 开发体验 | Python / Qt | React + HMR 热更新 |
| 可扩展性 | 一般 | 插件系统 + Web 生态 |

---

## 七、预计总工期

| 阶段 | 时间 |
|------|------|
| Phase 1: 基础框架 | 2-3 天 |
| Phase 2: 核心 UI | 3-4 天 |
| Phase 3: 图片系统 | 2-3 天 |
| Phase 4: MCP 通信 | 2-3 天 |
| Phase 5: 增强特性 | 2-3 天 |
| Phase 6: 打包分发 | 1-2 天 |
| **合计** | **12-18 天** |

---

## 八、风险与应对

| 风险 | 应对策略 |
|------|---------|
| Rust 学习曲线 | 初期 Rust 端仅做 IPC 桥接，逻辑尽量在前端实现 |
| Tauri 2.0 API 变动 | 使用稳定版 + 关注 release notes |
| MCP Rust SDK 不成熟 | 初期保留 Python MCP Server，渐进迁移 |
| WebView 兼容性 | Windows 用 Edge WebView2（已内置），Mac 用 WKWebView |
