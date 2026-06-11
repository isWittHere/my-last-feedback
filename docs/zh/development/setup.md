# 开发环境设置

本指南将帮助你设置 My Last Feedback 的开发环境。

## 前置要求

| 工具 | 版本要求 | 用途 |
|------|----------|------|
| **Node.js** | 18+ | MCP Server 运行时 + 前端构建 |
| **npm** | 随 Node.js | 依赖管理 |
| **Rust** | 1.70+ | Tauri 后端编译 |
| **Cargo** | 随 Rust | Rust 包管理 |

### 安装 Rust

```bash
# Windows / macOS / Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

在 Windows 上，还需要安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（包含"C++ 桌面开发"工作负载）。

## 克隆仓库

```bash
git clone https://github.com/isWittHere/my-last-feedback.git
cd my-last-feedback
```

## 安装依赖

### MCP Server 依赖

```bash
# 在项目根目录
npm install
```

### 前端依赖

```bash
# 在 app/ 目录
cd app
npm install
```

## 启动开发服务器

```bash
cd app
npx tauri dev
```

这会同时启动：
- Vite 热更新开发服务器（前端）
- Tauri 开发窗口（Rust 后端）

前端修改会实时热更新，Rust 代码修改会触发重新编译。

## 仅前端开发

如果你只进行前端修改（组件、样式、国际化）：

```bash
cd app
npm run build    # tsc + vite build
npm run dev      # 仅 Vite 开发服务器
```

## 仅后端开发

如果你只进行 Rust 后端修改：

```bash
cd app/src-tauri
cargo check      # 快速类型检查，不生成二进制
```

## 项目结构

```
my-last-feedback/
├── mcp/                    # MCP Server（Node.js，stdio 传输）
├── package.json            # MCP Server 依赖
├── mcp.json.template       # MCP 配置模板
├── mcp_prompts/            # 自定义 Prompt 按钮模板
├── BUILD.md                # 构建与发行指南
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

## 数据流

```
AI Agent → server.mjs (stdio/MCP) → TCP IPC → Tauri (lib.rs)
                                                    ↓
                                              React UI (components/)
                                                    ↓
                                            用户反馈 → 返回给 Agent
```

## 常见开发任务

### 添加新的 UI 组件

1. 在 `app/src/components/` 中创建新的 `.tsx` 文件
2. 在适当的父组件中导入和使用它
3. 将任何新的 CSS 添加到 `app/src/index.css`
4. 将 i18n 键添加到 `app/src/i18n/locales/{zh,en}.json`

### 添加新的 Tauri 命令

1. 在 `app/src-tauri/src/lib.rs` 中添加命令函数
2. 使用 `#[tauri::command]` 宏
3. 返回 `Result<T, String>` 或直接类型
4. 在 `invoke_handler` 中注册命令

### 修改 MCP Server

1. 编辑项目根目录中的 `server.mjs`
2. 重启你的 AI 客户端（Cursor/VS Code）以重新加载 MCP 服务器

## 调试

### 前端调试

- 在 Tauri 窗口中使用浏览器开发者工具
- 控制台日志出现在你运行 `npx tauri dev` 的终端中

### 后端调试

- Rust 编译错误出现在终端中
- 使用 `cargo build 2>&1` 查看完整的编译输出

### MCP Server 调试

- MCP 服务器作为单独的 Node.js 进程运行
- 检查你的 AI 工具的 MCP 日志以了解连接问题

## 下一步

- 阅读[贡献指南](/zh/development/contributing)了解代码标准和提交指南
- 查看[构建指南](/zh/development/build)了解生产构建和打包
- 阅读[项目架构](/zh/development/architecture)深入了解代码库