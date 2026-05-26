# My Last Feedback — 构建与发行指南

完整的构建、打包、发布流程说明。

---

## 目录

- [环境要求](#环境要求)
- [项目结构概览](#项目结构概览)
- [开发构建](#开发构建)
- [生产构建](#生产构建)
- [发行包打包](#发行包打包)
  - [Windows (x64)](#windows-x64)
  - [macOS (arm64)](#macos-arm64)
- [发行包内容](#发行包内容)
- [自定义 Prompt](#自定义-prompt)
- [常见问题](#常见问题)

---

## 环境要求

| 工具 | 版本要求 | 用途 |
|------|----------|------|
| **Node.js** | 18+ | MCP Server 运行时 + 前端构建 |
| **npm** | 随 Node.js | 依赖管理 |
| **Rust** | 1.70+ | Tauri 后端编译 |
| **Cargo** | 随 Rust | Rust 包管理 |

安装 Rust：

```bash
# Windows / macOS / Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Windows 上还需要安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（含 C++ 桌面开发工作负载）。

---

## 项目结构概览

```
my-last-feedback/
├── server.mjs              # MCP Server（Node.js，stdio 传输）
├── package.json            # MCP Server 依赖（@modelcontextprotocol/sdk）
├── mcp.json.template       # MCP 配置模板
├── mcp_prompts/            # 自定义 Prompt 按钮模板
│   ├── compact.prompt.md
│   └── knowledge_maker.prompt.md
├── BUILD.md                # 本文件
├── README.md               # 项目说明
│
├── app/                    # Tauri 2.0 桌面应用
│   ├── package.json        # 前端依赖（React 19, Zustand, i18next...）
│   ├── vite.config.ts      # Vite 构建配置
│   ├── tsconfig.json       # TypeScript 配置
│   ├── src/                # React 前端源码
│   │   ├── components/     # UI 组件
│   │   ├── store/          # Zustand 状态管理
│   │   └── i18n/           # 国际化（中文/英文）
│   └── src-tauri/          # Rust 后端
│       ├── Cargo.toml      # Rust 依赖
│       ├── tauri.conf.json # 窗口/应用配置
│       ├── capabilities/   # Tauri 权限声明
│       └── src/
│           ├── lib.rs      # Tauri 命令 + 插件注册
│           ├── session.rs  # IPC 会话管理
│           ├── ipc.rs      # IPC 通信协议
│           └── main.rs     # 入口
│
├── scripts/                # 打包脚本
│   ├── package-win.sh      # Windows 打包
│   └── package-mac.sh      # macOS 打包
│
└── dist/                   # 发行包输出目录
    ├── SETUP.md            # 用户安装指南（随发行包分发）
    ├── prompt.instructions.md  # Agent 指令文件（随发行包分发）
    └── win-x64/            # Windows 发行包
        └── my-last-feedback/
```

---

## 开发构建

### 1. 安装依赖

```bash
# 项目根目录 — MCP Server 依赖
npm install

# app 目录 — 前端依赖
cd app
npm install
```

### 2. 启动开发服务器

```bash
cd app
npx tauri dev
```

这会同时启动：
- Vite 热更新开发服务器（前端）
- Tauri 开发窗口（Rust 后端）

前端修改会实时热更新，Rust 代码修改会触发重新编译。

### 3. 仅构建前端（不启动 Tauri）

```bash
cd app
npm run build    # tsc + vite build
npm run dev      # 仅 Vite 开发服务器
```

---

## 生产构建

### 构建命令

```bash
cd app
npx tauri build --no-bundle
```

- `--no-bundle`：只编译二进制文件，不生成安装程序（.msi / .dmg）
- 前端会自动先执行 `npm run build`（tsc + vite build）
- Rust 使用 `release` profile（优化编译）

### 输出路径

| 平台 | 路径 |
|------|------|
| Windows | `app/src-tauri/target/release/app.exe` (~11 MB) |
| macOS | `app/src-tauri/target/release/app` |
| Linux | `app/src-tauri/target/release/app` |

### 构建耗时参考

| 阶段 | 首次 | 增量（代码改动后） |
|------|------|-------------------|
| 前端 (Vite) | ~3s | ~3s |
| 后端 (Rust) | 3-5 min | 20-30s |

---

## 发行包打包

### Windows (x64)

**自动打包（推荐）：**

```bash
# 在项目根目录执行
bash scripts/package-win.sh
```

脚本流程：
1. `npx tauri build --no-bundle` — 编译 release 二进制
2. 清理并创建 `dist/win-x64/my-last-feedback/` 目录
3. 复制 `app.exe`、`server.mjs`、`package.json`、`mcp.json.template`、`SETUP.md`、`prompt.instructions.md`
4. 复制 `mcp_prompts/*.prompt.md`
5. `npm install --omit=dev` — 安装生产依赖（仅 `@modelcontextprotocol/sdk`）

**创建 zip 压缩包：**

```bash
cd dist/win-x64
tar -acf my-last-feedback-win-x64.zip my-last-feedback/
```

> 使用 Windows 内置的 `tar`，Git Bash 中的 `zip` 命令可能不可用。

**手动打包步骤：**

```bash
# 1. 构建
cd app && npx tauri build --no-bundle && cd ..

# 2. 准备目录
mkdir -p dist/win-x64/my-last-feedback/mcp_prompts

# 3. 复制文件
cp app/src-tauri/target/release/app.exe  dist/win-x64/my-last-feedback/
cp server.mjs                            dist/win-x64/my-last-feedback/
cp package.json                          dist/win-x64/my-last-feedback/
cp mcp.json.template                     dist/win-x64/my-last-feedback/
cp dist/SETUP.md                         dist/win-x64/my-last-feedback/
cp dist/prompt.instructions.md           dist/win-x64/my-last-feedback/
cp mcp_prompts/*.prompt.md               dist/win-x64/my-last-feedback/mcp_prompts/

# 4. 安装生产依赖
cd dist/win-x64/my-last-feedback
npm install --omit=dev --ignore-scripts
```

### macOS (arm64)

> ⚠️ 必须在 macOS 上执行，Tauri 不支持跨平台编译。

```bash
# 在 macOS 上的项目根目录执行
bash scripts/package-mac.sh
```

输出目录：`dist/mac-arm64/my-last-feedback/`

创建压缩包：

```bash
cd dist/mac-arm64
tar -czf my-last-feedback-mac-arm64.tar.gz my-last-feedback/
```

---

## 发行包内容

最终发行包包含以下文件：

```
my-last-feedback/
├── app.exe (或 app)           # GUI 应用程序 (~11 MB)
├── server.mjs                 # MCP Server (Node.js)
├── package.json               # Node.js 项目配置
├── package-lock.json          # 依赖锁定文件
├── node_modules/              # 生产依赖 (~21 MB)
│   └── @modelcontextprotocol/
├── mcp.json.template          # MCP 配置模板
├── SETUP.md                   # 用户安装指南
├── prompt.instructions.md     # Agent 指令规则
└── mcp_prompts/               # 自定义 Prompt 按钮
    ├── compact.prompt.md
    └── knowledge_maker.prompt.md
```

| 项目 | 大小 |
|------|------|
| `app.exe` | ~11 MB |
| `node_modules/` | ~21 MB |
| 其他文件 | < 1 MB |
| **总计** | ~32 MB |
| **zip 压缩后** | ~28 MB |

---

## 自定义 Prompt

发行包中的 `mcp_prompts/` 目录可放置 `.prompt.md` 文件，作为 GUI 中的快捷按钮。

格式：

```markdown
---
name: "按钮名称"
description: "鼠标悬停提示"
icon: "book"
---
你的 prompt 内容...
```

### 可用图标

`icon` 字段支持以下预设图标名：

`book` `file` `file-text` `edit` `code` `terminal` `search` `message` `chat` `brain` `lightbulb` `star` `folder` `settings` `database` `link` `list` `check` `play` `zap` `compass` `layers` `globe` `target` `shield` `clock` `tag` `tool` `box` `hash` `wand` `sparkles` `clipboard` `rocket` `bug` `summary` `knowledge` `magic` `refresh` `send` `download` `upload` `alert` `info`

---

## 常见问题

### 构建失败：`error: failed to remove file app.exe (os error 5)`

app.exe 正在运行中。先关闭应用或执行：

```bash
taskkill /f /im app.exe
```

### `zip` 命令在 Git Bash 中不可用

使用 Windows 原生 `tar`：

```bash
tar -acf archive.zip folder/
```

`-a` 参数让 tar 根据扩展名自动选择压缩格式。

### 开发模式下 MCP 配置助手显示假路径

`get_server_path` 会从 exe 位置向上遍历 6 级目录查找 `server.mjs`。如果仍找不到，检查 `server.mjs` 是否在项目根目录。

### macOS 上 `app` 无法执行

```bash
chmod +x app
```

如遇 Gatekeeper 拦截：

```bash
xattr -d com.apple.quarantine app
```

### Rust 编译非常慢（首次）

首次编译需要下载并编译所有 Rust 依赖，通常需要 3-5 分钟。后续增量编译约 20-30 秒。

### 前端修改后如何快速验证

开发时使用 `npx tauri dev` 可以热更新前端。若只需验证 CSS/TSX 变更无需重编译 Rust：

```bash
cd app
npm run build  # 仅检查 TypeScript + Vite 构建
```

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MLF_APP_PATH` | 覆盖 Tauri 二进制路径 | 自动检测 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| GUI 框架 | Tauri 2.0 |
| 前端 | React 19 + TypeScript + Vite 7 |
| 状态管理 | Zustand 5 |
| 国际化 | i18next |
| Markdown | react-markdown + remark-gfm |
| MCP Server | @modelcontextprotocol/sdk 1.12 |
| 后端语言 | Rust (2021 edition) |
| 插件 | clipboard-manager, single-instance, autostart, opener |
