# 项目架构

本文档提供了 My Last Feedback 架构的高级概述。

## 系统概述

My Last Feedback 是一个基于 Tauri 2.0 构建的桌面应用程序，用于连接 AI 编程 Agent 和开发者。系统由三个主要组件组成：

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AI Agent      │    │   MCP Server    │    │   Tauri GUI     │
│   (Cursor,      │◄──►│   (Node.js)     │◄──►│   (React +      │
│    VS Code,     │    │                 │    │    Rust)        │
│    etc.)        │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                       │                       │
        │                       │                       │
        ▼                       ▼                       ▼
   MCP Protocol           TCP IPC              Native Desktop
   (stdio)                (JSON)               Window
```

## 组件详情

### 1. MCP Server (`server.mjs`)

MCP Server 是一个实现模型上下文协议的 Node.js 应用程序。它作为 stdio 传输服务器运行，并与 AI Agent 进行通信。

**主要职责：**
- 处理来自 AI Agent 的 MCP 协议消息
- 管理会话状态和调用者信息
- 将反馈请求转发到 Tauri GUI
- 将开发者反馈返回给 AI Agent

**关键文件：**
- `server.mjs` - MCP 服务器主入口点
- `package.json` - Node.js 依赖

### 2. Tauri 应用程序 (`app/`)

Tauri 应用程序是一个桌面 GUI，使用 React 19（前端）和 Rust（后端）构建。它提供了与 AI Agent 交互的用户界面。

**前端（React）：**
- `app/src/components/` - UI 组件
- `app/src/store/` - Zustand 状态管理
- `app/src/i18n/` - 国际化（中文/英文）

**后端（Rust）：**
- `app/src-tauri/src/lib.rs` - Tauri 命令和插件注册
- `app/src-tauri/src/session.rs` - IPC 会话管理
- `app/src-tauri/src/ipc.rs` - TCP IPC 通信协议

### 3. IPC 通信

MCP Server 和 Tauri 应用程序通过 TCP IPC 使用 JSON 消息进行通信。

**消息流：**
```
AI Agent → MCP Server → TCP IPC → Tauri GUI → 开发者反馈 → 返回给 Agent
```

**消息格式：**
```json
{
  "type": "feedback_request",
  "session_id": "uuid",
  "caller": "cursor",
  "content": {
    "summary": "Agent 工作摘要",
    "options": ["继续", "修复", "分析"]
  }
}
```

## 状态管理

### 前端状态（Zustand）

应用程序使用 Zustand 进行状态管理，并使用 localStorage 进行持久化。

**主要 Store：**
- `feedbackStore` - 管理反馈会话和响应
- `sessionStore` - 管理活跃会话和调用者
- `uiStore` - 管理 UI 状态（主题、语言、面板）

### 后端状态（Rust）

Rust 后端管理：
- IPC 连接和会话
- 窗口状态和配置
- 系统托盘和自启动功能

## 数据流

### 反馈请求流程

1. **AI Agent** 发送 MCP 消息请求反馈
2. **MCP Server** 接收消息并创建会话
3. **MCP Server** 通过 TCP IPC 发送消息到 Tauri
4. **Tauri GUI** 向开发者显示反馈弹窗
5. **开发者** 提供反馈并提交
6. **Tauri GUI** 通过 TCP IPC 发送反馈回来
7. **MCP Server** 通过 MCP 将反馈返回给 AI Agent

### 会话管理

会话在多个层进行管理：

- **MCP 会话**：每个 AI Agent 连接的唯一标识符
- **IPC 会话**：MCP 服务器和 Tauri 之间的 TCP 连接
- **UI 会话**：反馈表单和历史记录的 React 状态

## 安全考虑

- **仅本地**：所有通信都在 localhost 上进行
- **无外部网络**：不会向外部服务器发送数据
- **进程隔离**：MCP 服务器作为单独进程运行
- **输入验证**：所有 IPC 消息都经过验证

## 性能

- **二进制大小**：~11 MB（Tauri + React + Rust）
- **内存使用**：典型 50-100 MB
- **启动时间**：< 1 秒
- **IPC 延迟**：典型 < 10 毫秒

## 可扩展性

### 添加新 AI Agent 支持

要支持新的 AI Agent：

1. Agent 必须支持 MCP 协议
2. 将 Agent 特定配置添加到 MCP 配置助手
3. 将 Agent 图标和名称添加到 UI

### 添加新功能

架构支持轻松扩展：

- **新 UI 组件**：添加到 `app/src/components/`
- **新 Tauri 命令**：添加到 `app/src-tauri/src/lib.rs`
- **新 MCP 工具**：添加到 `server.mjs`
- **新 IPC 消息**：添加到 `app/src-tauri/src/ipc.rs`

## 依赖

### 前端依赖

| 包 | 版本 | 用途 |
|----|------|------|
| React | ^19 | UI 框架 |
| Zustand | ^5 | 状态管理 |
| i18next | ^25 | 国际化 |
| react-markdown | ^10 | Markdown 渲染 |

### 后端依赖

| 包 | 版本 | 用途 |
|----|------|------|
| Tauri | ^2 | 桌面应用框架 |
| serde | ^1 | 序列化/反序列化 |
| tokio | ^1 | 异步运行时 |

### MCP 依赖

| 包 | 版本 | 用途 |
|----|------|------|
| @modelcontextprotocol/sdk | ^1.12 | MCP 协议实现 |

## 构建和部署

### 开发构建

```bash
cd app
npx tauri dev
```

### 生产构建

```bash
cd app
npx tauri build --no-bundle
```

### 打包

```bash
bash scripts/package-win.sh  # Windows
bash scripts/package-mac.sh  # macOS
```

## 未来考虑

- **插件系统**：支持自定义插件和扩展
- **云同步**：可选的云同步设置
- **多用户**：支持团队协作
- **API 网关**：用于外部集成的 REST API