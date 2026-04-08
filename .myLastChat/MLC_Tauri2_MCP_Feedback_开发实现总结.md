---
title: "Tauri 2.0 MCP Feedback 客户端开发实现总结"
description: "Tauri 2.0 + React 19 MCP交互反馈客户端完整开发记录"
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
tags:
    - tauri
    - mcp
    - react
    - typescript
    - rust
    - interactive-feedback
solved_lists:
    - 项目骨架搭建完成 (Tauri 2.0 + React 19 + Vite 7)
    - TailwindCSS 4 深色主题
    - i18next 国际化 (中/英)
    - 垂直布局三面板 (Summary/Feedback/TestLog) 可拖拽调整
    - SummaryPanel Markdown渲染
    - FeedbackInput 输入+剪贴板粘贴图片
    - TestLogInput 测试日志面板
    - ImageAttachmentWidget 图片管理
    - QuickActions 快捷操作按钮
    - PromptButtons 动态提示模板按钮
    - Enhancement checkbox
    - 自定义标题栏 (去原生装饰，SVG按钮)
    - 标题栏功能修复 (Tauri capabilities权限)
    - 置顶按钮 (always-on-top toggle)
    - 面板样式简化 (移除卡片样式，改用分割线)
    - Node.js MCP Server (server.mjs + @modelcontextprotocol/sdk)
    - 移除Python依赖 (删除server.py + pyproject.toml)
    - 构建验证 (8.7MB二进制)
---

# Tauri 2.0 MCP Feedback 客户端开发实现总结

> 创建日期：2026-03-05

---

## 1. Previous Conversation

### 项目启动与规划
- 用户要求基于 `ref-repos/interactive-feedback-mcp-main` (PySide6方案) 开发更快、更跨平台的 MCP 反馈客户端
- 分析了3种技术方案 (Tauri vs Electron vs Wails)，选定 **Tauri 2.0**
- 制定了完整开发计划，保存至 `.myLastChat/MLC_Tauri2_MCP_Feedback_开发计划.md`

### 环境搭建
- 安装 Rust 1.93.1，创建 Tauri 2.0 + React 19 + Vite 7 项目骨架于 `app/` 目录
- 配置 TailwindCSS v4、i18next、Tauri 窗口配置
- 开发端口从 1420 → 3000 → 1422（解决端口占用）

### Phase 1 基础实现
- 搭建核心组件: SummaryPanel, FeedbackInput, ImageAttachmentWidget, LogsPanel
- Rust 后端: CLI 参数解析、反馈提交命令

### 大规模 UI 重构
用户要求："界面布局与ref-repos一致，但界面风格请使用更加符合现代化审美的风格"
- 从水平分割布局 → 垂直三面板布局 (Summary → Feedback → TestLog)
- 新增组件: QuickActions, PromptButtons, TestLogInput
- 实现自定义标题栏 (decorations: false + SVG 控制按钮)
- 深紫/蓝色暗黑主题 (`#0f0f14` 基底)

### MCP Server 开发
- 初始创建 Python FastMCP Server, 后迁移至 Node.js (`server.mjs` + `@modelcontextprotocol/sdk`)
- 删除 `server.py` 和 `pyproject.toml`，彻底移除 Python 依赖
- 复制 `mcp_prompts/` 从参考项目

### 功能完善与修复
- 标题栏按钮不工作 → 添加 Tauri capabilities 窗口权限
- 添加置顶按钮 (always-on-top toggle，默认开启)
- 面板样式简化：移除卡片/glass-panel样式，改用分割线

---

## 2. Current Work

最近一轮修改聚焦于 **UI 简化**：
- 移除了所有面板的 `glass-panel` 卡片样式（圆角边框背景）
- 移除 SummaryPanel 的 "AI摘要" 标题行
- Textarea 输入框改为透明无边框
- 面板间的 resize-handle 添加 `border-top: 1px solid` 分割线

同时添加了 **标题栏置顶按钮**：
- 位于语言切换和最小化按钮之间
- 使用 `getCurrentWindow().setAlwaysOnTop()` API
- 激活状态高亮为主题色
- 需要 `core:window:allow-set-always-on-top` capability 权限

---

## 3. Key Technical Concepts

- **Tauri 2.0 Capabilities 权限系统**: `src-tauri/capabilities/default.json` 中需要显式声明 `core:window:allow-*` 权限，否则前端调用 window API 无效
- **TailwindCSS 4**: 使用 `@theme` 指令定义 CSS 变量
- **Zustand**: 轻量状态管理，`useFeedbackStore` 管理所有反馈相关状态
- **自定义标题栏**: `decorations: false` + `data-tauri-drag-region` + SVG 按钮
- **@modelcontextprotocol/sdk (Node.js)**: MCP Server 使用 stdio transport，通过 `execFileSync` 启动 Tauri 二进制
- **Rust CLI 参数**: `--summary`, `--request-name`, `--project-directory`, `--output-file`
- **Prompt 文件加载**: Rust 端扫描 `mcp_prompts/*.prompt.md`，解析 YAML front matter

---

## 4. Relevant Files and Code

### `app/src/components/FeedbackApp.tsx`
- 主应用外壳：自定义标题栏、三面板垂直布局、resize 处理、提交逻辑
- 关键: `alwaysOnTop` 状态 + `toggleAlwaysOnTop()` + `handleSubmit()`
- 包含内联 `TestLogInput` 组件

### `app/src/store/feedbackStore.ts`
- Zustand store: `FeedbackState` 接口
- 字段: `summary`, `feedbackText`, `testLogText`, `images`, `outputFile`, `commandLogs`, `enableEnhancement`, `prompts`, `isSubmitting`, `isSubmitted`
- 常量: `IMAGE_MAX_COUNT=5`, `IMAGE_MAX_SIZE_MB=5`, `IMAGE_MAX_TOTAL_MB=20`

### `app/src/components/SummaryPanel.tsx`
- Markdown 只读渲染面板 (react-markdown + remark-gfm)
- 已移除标题行，直接显示内容

### `app/src/components/FeedbackInput.tsx`
- 简化为纯 textarea + 剪贴板粘贴图片支持

### `app/src/components/ImageAttachmentWidget.tsx`
- 图片管理: 文件选择、拖放、粘贴、缩略图预览、删除

### `app/src/components/QuickActions.tsx`
- 5个快捷按钮: Start/Continue/Analyze/Fix/Explain

### `app/src/components/PromptButtons.tsx`
- 动态渲染从 `mcp_prompts/*.prompt.md` 加载的按钮

### `app/src/index.css`
- 全局样式: TailwindCSS 4 主题变量、`.resize-handle`(含分割线)、`.btn`系列、`.titlebar-btn`系列、`.input-area`(透明无边框)、`.prose` markdown样式

### `app/src-tauri/src/lib.rs`
- Rust 后端命令: `get_app_args`, `submit_feedback`, `load_prompts`
- `load_prompts`: 扫描 `mcp_prompts/` 解析 YAML front matter

### `app/src-tauri/capabilities/default.json`
- 权限清单: `core:window:allow-minimize`, `allow-toggle-maximize`, `allow-close`, `allow-start-dragging`, `allow-set-focus`, `allow-set-always-on-top`, `allow-show`, `allow-hide`

### `app/src-tauri/tauri.conf.json`
- `decorations: false`, port `1422`, window 900x700, theme "Dark", `visible: false`

### `server.mjs`
- Node.js MCP Server (@modelcontextprotocol/sdk, stdio transport)
- `findAppBinary()` 定位 Tauri 二进制
- `interactive_feedback` tool: 启动 GUI → 读取 JSON 结果 → 返回 TextContent/ImageContent

### `package.json` / `mcp.json.template`
- Node.js 项目配置 / MCP 客户端配置模板

---

## 5. Problem Solving

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 端口冲突 | 1420/3000 被占用 | 改用 1422 |
| ImageAttachmentWidget 重复代码 | 文件替换不完整 | 删除尾部冗余代码块 |
| 标题栏按钮不工作 | Tauri 2.0 capabilities 缺少窗口权限 | 在 `capabilities/default.json` 添加 `core:window:allow-*` |
| Release 二进制白屏 | `cargo build --release` 不嵌入前端资源 | 使用 `npx tauri build --no-bundle` |
| 构建锁定 | app.exe 运行中锁定 target 目录 | `taskkill //F //IM app.exe` |

---

## 6. Pending Tasks and Next Steps

当前所有已明确要求的功能均已实现：
- ✅ 垂直三面板布局 + 可拖拽调整
- ✅ 自定义标题栏 + 窗口控制
- ✅ 置顶按钮
- ✅ 面板样式简化 (分割线替代卡片)
- ✅ Node.js MCP Server (替代 Python)
- ✅ 移除 Python 依赖
- ✅ 构建验证通过

用户最后一轮反馈确认分割线效果，等待进一步指示。

### 构建命令参考
```bash
# 构建
cd /e/Dev/my-last-feedback/app && npx tauri build --no-bundle

# 测试
/e/Dev/my-last-feedback/app/src-tauri/target/release/app.exe --summary "测试" --request-name "Test" --output-file "C:/tmp/test.json"

# 终止进程
taskkill //F //IM app.exe
```
