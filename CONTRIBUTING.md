# My Last Feedback — 仓库维护指南

本文档说明仓库的开发流程、分支策略、代码规范和发布流程。

---

## 目录

- [快速开始](#快速开始)
- [项目架构](#项目架构)
- [开发流程](#开发流程)
- [分支策略](#分支策略)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [发布流程](#发布流程)
- [目录说明](#目录说明)
- [依赖管理](#依赖管理)
- [常用命令速查](#常用命令速查)

---

## 快速开始

### 环境准备

```bash
# 1. 克隆仓库
git clone https://github.com/<your-username>/my-last-feedback.git
cd my-last-feedback

# 2. 安装 MCP Server 依赖
npm install

# 3. 安装前端依赖
cd app
npm install

# 4. 启动开发模式
npx tauri dev
```

### 环境要求

| 工具 | 版本 | 安装 |
|------|------|------|
| Node.js | 18+ | https://nodejs.org |
| Rust | 1.70+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| VS Build Tools | 2019+ | Windows 上构建 Rust 必需 |

---

## 项目架构

```
my-last-feedback/
│
├── server.mjs              # MCP Server — Node.js stdio 传输
├── package.json             # MCP Server 依赖
│
├── app/                     # Tauri 2.0 桌面应用
│   ├── src/                 # React 19 前端
│   │   ├── components/      # UI 组件（按功能拆分）
│   │   ├── store/           # Zustand 状态管理
│   │   └── i18n/            # 国际化 (中/英)
│   └── src-tauri/           # Rust 后端
│       ├── src/lib.rs       # Tauri 命令 + 插件
│       ├── src/session.rs   # IPC 会话管理
│       └── src/ipc.rs       # TCP IPC 协议
│
├── mcp_prompts/             # 自定义 Prompt 模板
├── scripts/                 # 构建/打包脚本
├── dist/                    # 发行包模板文件
└── tray-icons/              # 图标资源
```

### 数据流

```
AI Agent → server.mjs (stdio/MCP) → TCP IPC → Tauri (lib.rs)
                                                    ↓
                                              React UI (components/)
                                                    ↓
                                            用户反馈 → 返回给 Agent
```

---

## 开发流程

### 日常开发

1. **前端改动** (组件/样式/i18n)：
   - `npx tauri dev` 自动热更新，无需手动重启
   - 修改 `.tsx` / `.css` / `.json` 后实时生效

2. **后端改动** (Rust)：
   - 修改 `lib.rs` / `session.rs` / `ipc.rs` 后，Tauri dev 自动重编译
   - 首次编译较慢 (3-5 min)，后续增量编译约 20-30s

3. **MCP Server 改动** (`server.mjs`)：
   - 修改后需重启 AI 客户端（Cursor/VS Code）来重新加载 MCP

### 仅验证前端编译

```bash
cd app
npm run build    # tsc + vite build (不编译 Rust)
```

### 仅验证 Rust 编译

```bash
cd app/src-tauri
cargo check      # 快速类型检查，不生成二进制
```

---

## 分支策略

| 分支 | 用途 | 说明 |
|------|------|------|
| `main` | 稳定发布 | 所有发行包从此分支构建 |
| `dev` | 开发主线 | 日常开发在此分支进行 |
| `feature/*` | 新功能 | 从 `dev` 分出，完成后合并回 `dev` |
| `fix/*` | Bug 修复 | 从 `dev` 或 `main` 分出 |

### 分支工作流

```bash
# 开发新功能
git checkout dev
git checkout -b feature/mcp-config-helper
# ... 开发 ...
git add -A && git commit -m "feat: MCP config helper"
git checkout dev && git merge feature/mcp-config-helper

# 发布
git checkout main && git merge dev
git tag v1.0.0
git push origin main --tags
```

---

## 代码规范

### TypeScript / React

- **组件**：函数组件 + hooks，一个文件一个组件
- **状态管理**：Zustand store，localStorage 持久化
- **样式**：纯 CSS（`index.css`），使用 CSS 变量支持主题
- **i18n**：所有用户可见文本通过 `useTranslation()` + `t()` 调用
- **命名**：组件 PascalCase，函数/变量 camelCase，CSS 类 kebab-case

### Rust

- **Tauri 命令**：`#[tauri::command]` 宏，返回 `Result<T, String>` 或直接类型
- **错误处理**：`.map_err(|e| e.to_string())`
- **序列化**：全部使用 `serde::Serialize` / `Deserialize`
- **字符串**：优先 `String`，跨 FFI 边界使用 `to_string_lossy()`

### 文件组织

| 类型 | 位置 | 说明 |
|------|------|------|
| UI 组件 | `app/src/components/` | 每个功能一个 `.tsx` |
| 全局状态 | `app/src/store/feedbackStore.ts` | Zustand store |
| 样式 | `app/src/index.css` | 全局样式 + CSS 变量 |
| 翻译 | `app/src/i18n/locales/{zh,en}.json` | i18n 键值对 |
| 后端命令 | `app/src-tauri/src/lib.rs` | Tauri commands |
| IPC 通信 | `app/src-tauri/src/session.rs` + `ipc.rs` | TCP + JSON |

---

## 提交规范

采用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <description>

[optional body]
```

### Type

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `style` | 样式/UI 变更（不影响逻辑） |
| `refactor` | 代码重构 |
| `docs` | 文档 |
| `chore` | 构建/工具/依赖调整 |
| `i18n` | 国际化 |

### Scope（可选）

`ui` / `backend` / `mcp` / `ipc` / `build` / `i18n`

### 示例

```
feat(ui): add MCP config helper with path auto-detection
fix(backend): fix get_server_path fallback in dev mode
style(ui): welcome home two-column card layout
docs: add BUILD.md with comprehensive build guide
chore(build): update package-win.sh with zip creation
i18n: add mcpConfig translation keys
```

---

## 发布流程

### 1. 版本号更新

需要同步更新的位置：

| 文件 | 字段 |
|------|------|
| `package.json` (根) | `version` |
| `app/package.json` | `version` |
| `app/src-tauri/Cargo.toml` | `version` |
| `app/src-tauri/tauri.conf.json` | `version` (如有) |

### 2. 构建发行包

```bash
# Windows
bash scripts/package-win.sh
cd dist/win-x64
tar -acf my-last-feedback-win-x64.zip my-last-feedback/

# macOS (需在 Mac 上)
bash scripts/package-mac.sh
cd dist/mac-arm64
tar -czf my-last-feedback-mac-arm64.tar.gz my-last-feedback/
```

详细步骤见 [BUILD.md](BUILD.md)。

### 3. 创建 GitHub Release

```bash
git tag v1.0.0
git push origin v1.0.0
```

在 GitHub Releases 页面：
- 选择 tag
- 标题：`v1.0.0`
- 描述：变更日志
- 附件：上传 `my-last-feedback-win-x64.zip` 和 `my-last-feedback-mac-arm64.tar.gz`

### 4. 发行包内容检查清单

- [ ] `app.exe` / `app` — 可执行文件
- [ ] `server.mjs` — MCP Server
- [ ] `package.json` + `node_modules/` — Node 依赖
- [ ] `mcp.json.template` — 配置模板
- [ ] `SETUP.md` — 安装指南
- [ ] `prompt.instructions.md` — Agent 指令
- [ ] `mcp_prompts/` — 示例 Prompt

---

## 目录说明

### 应该提交到 Git 的

| 路径 | 说明 |
|------|------|
| `server.mjs` | MCP Server 核心 |
| `package.json` / `package-lock.json` | Node 依赖声明 |
| `mcp.json.template` | MCP 配置模板 |
| `README.md` / `BUILD.md` / `CONTRIBUTING.md` | 文档 |
| `app/src/` | 前端源码 |
| `app/src-tauri/src/` | Rust 源码 |
| `app/src-tauri/Cargo.toml` / `Cargo.lock` | Rust 依赖 |
| `app/src-tauri/tauri.conf.json` | 应用配置 |
| `app/src-tauri/capabilities/` | 权限声明 |
| `app/src-tauri/icons/` | 应用图标 |
| `mcp_prompts/` | 自定义 Prompt |
| `scripts/` | 打包脚本 |
| `dist/SETUP.md` / `dist/prompt.instructions.md` | 发行包模板 |
| `tray-icons/` | 托盘/任务栏图标 |
| `*.svg` (根目录) | 项目 Logo |

### 不应提交的（已在 .gitignore）

| 路径 | 原因 |
|------|------|
| `node_modules/` | `npm install` 生成 |
| `app/dist/` | Vite 构建产物 |
| `app/src-tauri/target/` | Rust 编译产物 (数 GB) |
| `app/src-tauri/gen/schemas/` | Tauri 生成文件 |
| `dist/win-x64/` / `dist/mac-arm64/` | 发行包构建产物 |
| `ref-repos/` | 参考仓库 |
| `.myLastChat/` | 个人笔记 |
| `test-ipc*` | 测试文件 |

---

## 依赖管理

### Node.js 依赖

```bash
# 根目录 — MCP Server
npm install                # 安装
npm update                 # 更新
npm ls                     # 查看依赖树

# app/ — 前端
cd app
npm install
npm update
```

### Rust 依赖

```bash
cd app/src-tauri
cargo update              # 更新依赖
cargo audit               # 安全审计（需安装 cargo-audit）
```

### 主要依赖一览

| 层 | 包 | 版本 | 用途 |
|----|-----|------|------|
| MCP | `@modelcontextprotocol/sdk` | ^1.12 | MCP 协议实现 |
| UI | `react` + `react-dom` | ^19 | 界面框架 |
| 状态 | `zustand` | ^5 | 全局状态管理 |
| i18n | `i18next` + `react-i18next` | ^25 / ^16 | 国际化 |
| Markdown | `react-markdown` | ^10 | 渲染 Markdown |
| 构建 | `vite` | ^7 | 前端打包 |
| 桌面 | `tauri` | ^2 | 桌面应用框架 |
| 插件 | `tauri-plugin-*` | ^2 | autostart, clipboard, single-instance, opener |

---

## 常用命令速查

```bash
# 开发
cd app && npx tauri dev                    # 启动开发模式
cd app && npm run build                    # 仅前端构建
cd app/src-tauri && cargo check            # 仅 Rust 类型检查

# 构建
cd app && npx tauri build --no-bundle      # 生产构建（不打包）

# 打包
bash scripts/package-win.sh                # Windows 发行包
bash scripts/package-mac.sh                # macOS 发行包（需 Mac）

# Git
git add -A && git status                   # 检查变更
git commit -m "feat(ui): description"      # 提交
git tag v1.0.0 && git push --tags         # 打标签

# 调试
taskkill /f /im app.exe                    # 强制关闭 (Windows)
cd app/src-tauri && cargo build 2>&1       # 查看完整编译错误
```
