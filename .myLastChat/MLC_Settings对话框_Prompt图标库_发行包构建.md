---
title: Settings对话框 + Prompt图标库 + 发行包构建
description: 设置面板、主题切换、Prompt预设图标库、热重载、发行包打包、MCP配置助手、WelcomeHome
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
tags:
  - settings
  - theme
  - icons
  - distribution
  - prompt
  - mcp-config
  - welcome-home
  - autostart
solved_lists:
  - 任务栏窗口图标修复 (256x256 PNG via set_icon)
  - Settings 设置对话框 (Display + Prompts + About 三标签)
  - 亮色/暗色主题切换 (CSS变量 + localStorage持久化)
  - Prompt管理标签页 (启用/禁用开关)
  - Prompt热重载 (窗口focus时自动刷新)
  - 修复常驻模式Prompt按钮点击无响应
  - Prompt预设图标库 (45个Lucide风格SVG图标)
  - Prompt按钮高度缩减
  - 完整发行包构建 (Win x64 已打包, Mac脚本已准备)
  - 开机自启设置 (Settings General tab + tauri-plugin-autostart)
  - 删除Caller最后会话UI空白Bug修复
  - Settings对话框背景模糊 (backdrop-filter blur)
  - WelcomeHome欢迎页面 (双栏卡片布局)
  - MCP配置助手 (路径自动检测 + 一键复制)
  - 窗口默认比例3:2 (840×560)
  - 置顶按钮图钉图标
  - BUILD.md构建发行指南
---

# Settings对话框 + Prompt图标库 + 发行包构建

## 1. Previous Conversation

本次会话围绕 My Last Feedback (Tauri 2.0 + React 19 MCP Feedback GUI) 进行了多轮功能迭代：

1. **任务栏图标修复**：用户反馈任务栏（非托盘）图标模糊。通过在 `lib.rs` setup 中调用 `window.set_icon()` 使用 256x256 PNG 解决。
2. **Settings 设置对话框**：用户要求在标题栏添加齿轮按钮，打开设置对话框。实现了三标签页（Display/Prompts/About），包含主题切换和语言设置。
3. **亮色主题支持**：通过 `[data-theme="light"]` CSS 变量覆盖实现完整的亮/暗主题切换，主题持久化到 localStorage。
4. **Prompt 管理系统**：实现了 Prompt 热重载（窗口 focus 时刷新）、启用/禁用开关（设置面板中）、修复了常驻模式下 Prompt 按钮点击无响应的 bug。
5. **Prompt 预设图标库**：用户明确要求"真正的图标"（非 emoji）。实现了 45 个 Lucide 风格 SVG 预设图标，用户在 `.prompt.md` YAML 中通过 `icon: "book"` 引用。
6. **发行包构建**：用户要求导出完整的发行 app，包含核心程序、MCP 服务、配置说明、示例 prompt。创建了 Win/Mac 打包脚本并成功构建 Win x64 发行包。

## 2. Current Work

### 发行包构建（刚完成）

创建了完整的发行包基础设施：

**Windows x64** — 已构建并打包：
- `dist/win-x64/my-last-feedback/` — 解压即用目录
- `dist/win-x64/my-last-feedback-win-x64.zip` — 28MB 压缩包
- app.exe 11MB + node_modules + server.mjs + 文档 + 示例 prompt

**macOS arm64** — 脚本已准备：
- `scripts/package-mac.sh` — 需在 Mac 上运行（Tauri 不支持跨平台编译）

**发行包结构：**
```
my-last-feedback/
├── app.exe / app              # Tauri GUI
├── server.mjs                 # MCP 服务
├── package.json               # Node 依赖
├── node_modules/              # 已安装的依赖
├── mcp.json.template          # MCP 配置模板
├── prompt.instructions.md     # Agent 指令规则
├── SETUP.md                   # 安装配置说明
└── mcp_prompts/               # 示例自定义 prompt
    ├── compact.prompt.md
    └── knowledge_maker.prompt.md
```

### Prompt 图标库（刚完成）

后端解析 YAML `icon:` 字段 → 前端 `PromptIcons.tsx` 通过 name 查找预设 SVG → 在 PromptButtons 和 SettingsDialog 中渲染。按钮 padding 从 `3px 10px` 缩减到 `1px 8px`。

## 3. Key Technical Concepts

- **Tauri 2.0 + React 19**：桌面应用框架，前端 Vite 7 构建
- **MCP SDK v1.12.1**：`McpServer` API，`listRoots()` 自动检测工作区，`getClientVersion()` 获取客户端信息
- **IPC 通信**：TCP socket (端口 19850-19860) + JSON line protocol
- **主题系统**：`[data-theme="light"]` CSS 变量覆盖，`localStorage("mlf-theme")` 持久化
- **Prompt 系统**：`.prompt.md` YAML front matter (name/description/icon/content)，窗口 focus 热重载
- **图标库**：45 个 Lucide 风格 SVG 图标，通过 `dangerouslySetInnerHTML` 渲染 stroke-based paths
- **发行包**：`--no-bundle` 构建 + shell 脚本组装 + `npm install --omit=dev` 生产依赖
- **单实例模式**：`tauri-plugin-single-instance` v2.4.0
- **Zustand 状态管理**：`disabledPrompts`、`prompts`、`togglePromptDisabled` 等

## 4. Relevant Files and Code

### `app/src-tauri/src/lib.rs`
  - Tauri 后端入口，命令注册，setup
  - `window.set_icon(icon)` 使用 256x256 PNG 设置窗口图标
  - `PromptItem` struct 新增 `pub icon: String` 字段
  - `parse_prompt_file` 从 YAML front matter 提取 `icon:` 值
  - `load_prompts` command 返回含 icon 的 PromptItem 列表

### `app/src/components/SettingsDialog.tsx`
  - 模态设置对话框，三标签页 (Display/Prompts/About)
  - Display: 主题切换 (Dark/Light button group) + 语言下拉
  - Prompts: 每个 prompt 显示 `<PromptIcon>` + 名称 + 描述 + 启用/禁用 toggle
  - About: 应用图标 + 名称 + 版本 + 描述
  - `import { PromptIcon } from "./PromptIcons"` 用于显示预设图标

### `app/src/components/PromptIcons.tsx`
  - **新建** — 预设 SVG 图标库
  - 45 个 Lucide 风格图标映射 (name → SVG viewBox + paths)
  - 导出 `PromptIcon({ name, size })` 组件和 `hasPromptIcon(name)` 辅助函数
  - SVG 通过 `dangerouslySetInnerHTML={{ __html: icon.paths }}` 渲染

### `app/src/components/PromptButtons.tsx`
  - 渲染可点击的 prompt 按钮
  - 过滤 `disabledPrompts`
  - 每个按钮前渲染 `{p.icon && <PromptIcon name={p.icon} />}`
  - `import { PromptIcon } from "./PromptIcons"`

### `app/src/components/FeedbackApp.tsx`
  - 主应用布局 + 自定义标题栏
  - 语言按钮替换为齿轮 ⚙ SVG 图标
  - `settingsOpen` 状态控制 `SettingsDialog`
  - SVG fill 从 `#ffffff` 改为 `currentColor` 适配主题

### `app/src/store/feedbackStore.ts`
  - `PromptItem` interface: `{ name, description, content, icon }`
  - `disabledPrompts: string[]` — 从 localStorage 初始化
  - `togglePromptDisabled(name)` — 切换并持久化

### `app/src/App.tsx`
  - Prompt 热重载: `window.addEventListener("focus", reloadPrompts)`
  - `invoke<Array<{ name: string; description: string; content: string; icon: string }>>("load_prompts")`

### `app/src/index.css`
  - `[data-theme="light"]` CSS 变量块（亮色背景/文字/边框）
  - 亮色主题覆盖（scrollbar, titlebar, buttons, session items 等）
  - Settings 对话框完整样式
  - Prompt 管理列表 + toggle switch 样式
  - `.btn-prompt`: `padding: 1px 8px; display: inline-flex; align-items: center; gap: 3px`

### `app/src/i18n/locales/zh.json` & `en.json`
  - settings 下的所有 i18n key: title, display, about, theme, themeDark, themeLight, aboutDesc, prompts, promptsEmpty, promptEnable, promptDisable

### `app/src-tauri/tauri.conf.json`
  - 移除了 `"theme": "Dark"` (主题由 CSS 处理)

### `dist/SETUP.md`
  - **新建** — 发行包安装配置说明文档
  - 包含 Quick Start、Cursor/VSCode/Cline 配置方法、自定义 Prompt 说明、Troubleshooting

### `dist/prompt.instructions.md`
  - **新建** — Agent 指令规则文件，告诉 AI 在完成请求前调用 interactive_feedback

### `scripts/package-win.sh`
  - **新建** — Windows x64 构建打包脚本
  - 自动构建 Tauri → 复制文件 → npm install --omit=dev → 报告

### `scripts/package-mac.sh`
  - **新建** — macOS arm64 构建打包脚本
  - 检测 macOS 环境 → 同上流程 → tar.gz 打包

### `mcp_prompts/compact.prompt.md`
  - 新增 `icon: "clipboard"` YAML 字段

### `mcp_prompts/knowledge_maker.prompt.md`
  - 新增 `icon: "book"` YAML 字段

## 5. Problem Solving

### 任务栏图标模糊
- **症状**：用户多次反馈任务栏图标模糊，误以为是托盘图标问题
- **根因**：ICO 文件小尺寸下 SVG 细线模糊
- **解决**：在 `lib.rs` setup 中使用 `window.set_icon(icon)` 加载 256x256 PNG (`128x128@2x.png`)
- **注意**：`set_icon` 接受 `Image<'_>` 而非 `Option<Image<'_>>`

### 常驻模式 Prompt 按钮无响应
- **症状**：点击 prompt 按钮没反应
- **根因**：`CallerPanel.tsx` 中 `<PromptButtons />` 未传 `onAction` prop
- **解决**：改为 `<PromptButtons onAction={handleSubmit} />`

### 亮色主题硬编码深色
- **症状**：切换亮色主题后部分元素仍显示深色
- **根因**：CSS 中大量硬编码 `rgba(255,255,255,...)` 和暗色背景
- **解决**：在 `[data-theme="light"]` 下逐个覆盖所有受影响选择器

### 构建 exe 被锁定
- **症状**：`error: failed to remove file app.exe — 拒绝访问 (os error 5)`
- **根因**：前一个 app.exe 进程仍在运行
- **解决**：`taskkill /f /im app.exe` 后重新构建

## 6. Pending Tasks and Next Steps

### 已完成的所有任务
- ✅ 任务栏图标修复
- ✅ Settings 对话框 (Display/Prompts/About → General/Display/Prompts/About)
- ✅ 亮/暗主题切换
- ✅ Prompt 管理 (热重载 + 启用/禁用)
- ✅ Prompt 预设图标库 (45 个 SVG)
- ✅ 按钮高度缩减
- ✅ Win x64 发行包构建 (28MB zip)
- ✅ Mac 打包脚本准备
- ✅ 开机自启设置 (Settings → General tab)
- ✅ 删除 Caller 最后会话 UI 空白 Bug 修复
- ✅ Settings 对话框背景模糊
- ✅ WelcomeHome 欢迎页面 (双栏卡片布局)
- ✅ MCP 配置助手 (路径自动检测 + 一键复制)
- ✅ 窗口默认比例 3:2 (840×560)
- ✅ 置顶按钮图钉图标
- ✅ BUILD.md 构建发行指南

### 潜在后续任务
1. **Mac 版实际构建** — 需要在 macOS 设备上运行 `bash scripts/package-mac.sh`
2. **发行包测试** — 在干净环境验证发行包能否正常工作
3. **版本号管理** — 当前 `0.1.0`，可能需要更新
4. **自动化 CI/CD** — GitHub Actions 双平台构建
5. **Tauri bundler** — 可选择使用 NSIS/MSI 安装包替代 zip 分发

---

## 7. Session Update — 2025-03-08 (续)

### 新增功能

#### 开机自启设置
- `Cargo.toml` 新增 `tauri-plugin-autostart = "2"`
- `lib.rs` 新增 `get_autostart` / `set_autostart` 命令，使用 `app.autolaunch()` (需导入 `ManagerExt`)
- `capabilities/default.json` 新增 `autostart:allow-enable/disable/is-enabled`
- Settings 对话框新增 "General" 标签页（默认选中）

#### 删除 Caller 最后会话 Bug 修复
- **根因**：`removeSession` 删除最后会话时设 `activeCallerId = null` 导致 UI 空白
- **修复**：自动切换到 `newCallerOrder[0]` 及对应最新 session

#### WelcomeHome 欢迎页面
- **组件**：`WelcomeHome.tsx` — 无 caller 时的空状态页面
- **内容**：LOGO (48px SVG) + 标题 + 副标题 + 快捷设置（自启/主题/语言/Prompt）+ MCP 配置助手
- **布局**：双栏卡片 (`.welcome-cards` flex-row)，左设置右配置，`max-width: 680px`
- 替换了 `FeedbackApp.tsx` 中原来的简单等待文本

#### MCP 配置助手
- **组件**：`McpConfigHelper.tsx` — 客户端选择 (Cursor/VS Code/Cline) + 格式切换 (JSON/单条命令)
- **后端**：`get_server_path` 命令 — 向上遍历 6 级目录查找 `server.mjs`（开发模式兼容）
- **功能**：自动检测安装路径、一键复制 (clipboard 插件)、显示配置文件路径提示
- **集成**：Settings → General tab + WelcomeHome compact 模式
- **Cmd+Args 格式**：输出单条命令 `node /path/to/server.mjs`

#### 其他改进
- 窗口默认尺寸 840×560 (3:2 比例)
- 置顶按钮换为图钉 (pushpin) 图标
- Settings 对话框 `.settings-overlay` 添加 `backdrop-filter: blur(6px)`
- `BUILD.md` 完整构建与发行指南

### 修改的文件
- `app/src-tauri/src/lib.rs` — get_autostart, set_autostart, get_server_path
- `app/src-tauri/Cargo.toml` — tauri-plugin-autostart
- `app/src-tauri/capabilities/default.json` — autostart 权限
- `app/src-tauri/tauri.conf.json` — 窗口尺寸 840×560
- `app/src/components/SettingsDialog.tsx` — General tab (autostart + McpConfigHelper)
- `app/src/components/FeedbackApp.tsx` — WelcomeHome 导入 + 图钉图标
- `app/src/components/WelcomeHome.tsx` — 新建，双栏布局
- `app/src/components/McpConfigHelper.tsx` — 新建，MCP 配置生成
- `app/src/store/feedbackStore.ts` — removeSession 修复
- `app/src/index.css` — blur, welcome-cards, mcp-config 样式
- `app/src/i18n/locales/zh.json` + `en.json` — 新增 i18n key
- `BUILD.md` — 新建，构建发行指南
