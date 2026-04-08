---
title: My Last Feedback — 常驻 GUI 架构重构规划
description: 将 MCP Feedback 应用从单次启动模式重构为常驻 GUI，支持多调用者分组管理
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - architecture
  - tauri
  - mcp
  - refactor
---

# My Last Feedback — 常驻 GUI 架构重构规划

## 一、项目现状

### 1.1 当前架构

```
AI Agent ──stdio──> MCP Server (node server.mjs)
                        │
                        ├── execFileSync(app.exe, [--summary, --request-name, ...])
                        │       │
                        │       ├── Tauri App 启动（新进程）
                        │       ├── 用户在 GUI 填写反馈
                        │       ├── 提交 → 写入临时 JSON 文件
                        │       └── 进程退出
                        │
                        └── 读取临时文件 → 返回给 AI Agent
```

**核心特征：**
- **单次调用模式**：每次 MCP tool call 启动一个新的 Tauri 进程，提交后进程退出
- **无状态**：每次调用之间没有任何关联，无法追溯历史
- **单调用者**：无法区分不同 AI 客户端（VS Code Copilot、Claude Desktop、Cursor 等）
- **同步阻塞**：MCP Server 使用 `execFileSync`，阻塞直到 GUI 进程退出

### 1.2 技术栈

| 组件 | 技术 | 文件位置 |
|------|------|----------|
| MCP Server | Node.js + @modelcontextprotocol/sdk | `server.mjs` |
| GUI Frontend | React 19 + TypeScript + Tailwind v4 + Zustand | `app/src/` |
| GUI Backend | Rust + Tauri v2 | `app/src-tauri/src/` |
| 构建工具 | Vite 7 + Tauri CLI | `app/vite.config.ts` |

### 1.3 数据流

```
MCP Server  ──CLI args──>  Tauri Rust (解析 args → AppState)
                                │
                           Tauri Command (get_app_args)
                                │
                           React Frontend (显示 summary，接收用户输入)
                                │
                           Tauri Command (submit_feedback)
                                │
                           Rust 写入 JSON 文件 → 关闭窗口 → 进程退出
```

---

## 二、目标架构

### 2.1 架构总览

```
                         ┌──────────────────────────────────────────────┐
                         │         Tauri App（常驻后台）                  │
                         │                                              │
AI Agent A ──MCP-A──┐    │  标题栏：[🟢 Copilot] [🔴 Claude] [Cursor]  │
                    │    │  ┌──────────┬───────────────────────────────┐│
AI Agent B ──MCP-B──┼IPC─┤  │ 历史侧栏  │  主面板（当前选中请求）       ││
                    │    │  │          │                               ││
AI Agent C ──MCP-C──┘    │  │  #1 请求  │  📋 Summary (Markdown)      ││
                         │  │  #2 请求  │                               ││
                         │  │  #3 请求  │  ✏️ Feedback Input            ││
                         │  │  ...     │  📎 Attachments               ││
                         │  │          │  🔘 Submit                    ││
                         │  └──────────┴───────────────────────────────┘│
                         └──────────────────────────────────────────────┘
```

### 2.2 UI 布局设计

#### 标题栏（Title Bar）

```
┌────────────────────────────────────────────────────────────┐
│  拖拽区域  │  [🟢 Copilot•] [🔵 Claude] [🟣 Cursor]  │ 控件 │
└────────────────────────────────────────────────────────────┘
```

- 标题栏中央放置 **圆角正方形彩色 Tab 按钮**
- 每个 Tab = 一个 AI 调用者（MCP 客户端）
- Tab 上带 **圆点指示器（●）**：有待审批（pending）请求时显示
- 颜色来自 **预定义颜色池**，用户可自定义编辑
- 点击 Tab 切换到该调用者，左侧栏显示其历史列表

#### 左侧历史栏（Sidebar）

```
┌──────────┐
│ 历史记录  │
│          │
│ 🟡 #1   │ ← pending（待审批）
│ ✅ #2   │ ← responded（已完成，只读）
│ ✅ #3   │
│ ...     │
└──────────┘
```

- 展示 **当前选中 Tab（调用者）** 的所有历史请求
- 条目信息：request_name + 时间 + 状态图标
- **Pending 条目**：可编辑反馈并提交
- **Responded 条目**：只读，查看历史摘要和已提交反馈
- 数据 **持久化到本地**（App 关闭后重启可恢复）

#### 主面板

- 显示选中请求的 Summary（Markdown 渲染）
- Pending 状态：输入区域可编辑 + 提交按钮
- Responded 状态：只读模式，查看历史

### 2.3 核心变更对比

| 维度 | 当前 | 目标 |
|------|------|------|
| App 生命周期 | 每次调用启动/退出 | 常驻后台，系统托盘图标 |
| MCP → App 通信 | CLI args + 临时文件 | 本地 TCP/WebSocket IPC |
| 反馈返回方式 | App 退出后读临时文件 | IPC 回调直接推送 |
| Session 管理 | 无（单次） | 标题栏 Tab 切换调用者 + 侧栏历史列表 |
| 调用者识别 | 无 | MCP clientInfo.name + 彩色 Tab |
| 历史记录 | 无 | 持久化到本地（SQLite/JSON） |
| 已完成请求 | 丢弃 | 只读保留在历史中 |
| 并发处理 | 不可能（同步阻塞） | 支持多个 pending 请求 |

### 2.4 IPC 协议设计

使用 **本地 TCP**（端口范围 19850-19860 自动选择）或 **Named Pipe**（Windows: `\\.\pipe\my-last-feedback`）。

#### 消息格式（JSON over 换行分隔）

**请求（MCP Server → App）：**
```json
{
  "type": "feedback_request",
  "session_id": "uuid-v4",
  "caller": {
    "name": "GitHub Copilot",
    "version": "1.0.0",
    "process_id": 12345
  },
  "payload": {
    "summary": "## Changes\\n...",
    "request_name": "修复登录Bug",
    "project_directory": "/path/to/project"
  }
}
```

**响应（App → MCP Server）：**
```json
{
  "type": "feedback_response",
  "session_id": "uuid-v4",
  "payload": {
    "interactive_feedback": "用户反馈文本",
    "command_logs": "",
    "images": [{ "type": "image/png", "data": "base64..." }]
  }
}
```

**App 状态通知（App → MCP Server）：**
```json
{
  "type": "app_status",
  "status": "ready" | "busy" | "shutdown"
}
```

---

## 三、分阶段实施计划

### Phase 0: 前置准备（预计 0.5 天）

> 目标：确保开发环境就绪，创建新分支

| 任务 | 详情 |
|------|------|
| 0.1 | 创建 `feature/persistent-gui` 分支 |
| 0.2 | 在 README 中记录当前架构（备忘） |
| 0.3 | 确保现有功能的手动测试用例覆盖 |

---

### Phase 1: Tauri App 改造 — IPC 监听（预计 1-2 天）

> 目标：App 常驻后台，通过 IPC 接收 feedback 请求

#### 1.1 Rust 后端 — IPC Server

**修改文件：** `app/src-tauri/src/lib.rs` + 新建 `app/src-tauri/src/ipc.rs`

```
新增模块: ipc.rs
├── start_ipc_server()           → 启动 TCP 监听 (tokio)
├── handle_connection()          → 处理每个 MCP Server 连接
├── FeedbackRequest              → 反序列化请求结构
├── FeedbackResponse             → 序列化响应结构
└── IpcState                     → 管理活跃 session 列表
```

**关键实现：**
- 添加 `tokio` 依赖到 `Cargo.toml`
- App 启动时在后台线程启动 TCP server
- 每个连接对应一个 MCP Server 实例
- 请求到达后通过 `tauri::AppHandle.emit()` 通知前端
- 前端提交反馈后通过 Tauri Command 将响应写回 IPC

**新增 Cargo 依赖：**
```toml
tokio = { version = "1", features = ["net", "io-util", "sync", "rt-multi-thread"] }
uuid = { version = "1", features = ["v4"] }
```

#### 1.2 Rust 后端 — 多 Session 状态管理

**新增结构：**
```rust
/// AI 调用者信息
pub struct CallerInfo {
    pub id: String,                          // 由 name 的 hash 生成
    pub name: String,                        // e.g. "GitHub Copilot"
    pub version: String,
    pub color: String,                       // 预定义颜色池分配，用户可修改
}

/// 单个请求 session
pub struct SessionInfo {
    pub id: String,                          // UUID
    pub caller_id: String,                   // 所属调用者 ID
    pub request_name: String,
    pub summary: String,
    pub project_directory: String,
    pub status: SessionStatus,               // Pending | Responded
    pub created_at: chrono::DateTime<Utc>,
    pub feedback_text: Option<String>,       // 用户提交的反馈（Responded 后只读）
    pub response_tx: Option<oneshot::Sender<FeedbackResponse>>,
}

pub enum SessionStatus {
    Pending,      // 等待用户响应（可编辑）
    Responded,    // 用户已提交（只读）
}

/// 持久化存储管理
pub struct SessionManager {
    pub callers: HashMap<String, CallerInfo>,
    pub sessions: Vec<SessionInfo>,          // 所有历史 session
    pub active_caller_id: Option<String>,
    pub active_session_id: Option<String>,
    pub db: SqliteConnection,                // 持久化
}
```

**预定义颜色池：**
```rust
const COLOR_POOL: &[&str] = &[
    "#3b82f6", // blue
    "#22c55e", // green
    "#a855f7", // purple
    "#f59e0b", // amber
    "#ef4444", // red
    "#06b6d4", // cyan
    "#f97316", // orange
    "#ec4899", // pink
];
```

**新增 Tauri Commands：**
```rust
#[tauri::command]
fn get_sessions() -> Vec<SessionSummary>;

#[tauri::command]
fn get_session_detail(session_id: String) -> Option<SessionInfo>;

#[tauri::command]
fn submit_session_feedback(session_id: String, feedback: FeedbackPayload) -> Result<(), String>;
```

#### 1.3 保持向后兼容

- **保留 CLI args 模式**：检测到 `--output-file` 参数时走旧路径（单次模式）
- **IPC 模式为默认**：无 CLI args 时启动常驻模式

---

### Phase 2: MCP Server 改造 — IPC 客户端（预计 1 天）

> 目标：MCP Server 通过 IPC 与常驻 App 通信

**修改文件：** `server.mjs`

#### 2.1 提取 clientInfo

```javascript
// MCP SDK transport 完成 initialize 握手后，clientInfo 可用
server.server.oninitialized = () => {
  const clientInfo = server.server.getClientCapabilities();
  // 或者从 transport 层面获取
};
```

> 注意：需调研 `@modelcontextprotocol/sdk` 是否暴露 `clientInfo`。
> 参考：MCP 规范中 `initialize` 请求包含 `clientInfo: { name, version }`。

#### 2.2 IPC 通信流程

```javascript
async function requestFeedback(projectDirectory, summary, requestName, callerInfo) {
  // 1. 尝试连接到常驻 App 的 IPC 端口
  const socket = await connectToApp();

  // 2. 如果 App 未运行，自动启动它（不传 --output-file → 进入常驻模式）
  if (!socket) {
    spawnApp();  // execFile (non-blocking)
    await waitForAppReady();
    socket = await connectToApp();
  }

  // 3. 发送 feedback_request
  const sessionId = crypto.randomUUID();
  socket.write(JSON.stringify({
    type: "feedback_request",
    session_id: sessionId,
    caller: callerInfo,
    payload: { summary, request_name: requestName, project_directory: projectDirectory }
  }) + "\n");

  // 4. 等待响应（Promise，超时可配置）
  const response = await waitForResponse(socket, sessionId);
  return response.payload;
}
```

#### 2.3 健壮性处理

- **App 崩溃/关闭重连**：IPC 断开时自动重启 App
- **超时处理**：可配置超时（默认 10 分钟）
- **优雅降级**：IPC 失败时回退到旧的 CLI 模式

---

### Phase 3: 前端 UI 改造 — 标题栏 Tab + 历史侧栏（预计 1.5-2 天）

> 目标：标题栏按调用者切换、侧栏展示历史、主面板适配

#### 3.1 状态管理重构

**修改文件：** `app/src/store/feedbackStore.ts`

```typescript
// 调用者
interface Caller {
  id: string;
  name: string;          // "GitHub Copilot" / "Claude Desktop"
  version: string;
  color: string;         // 来自颜色池或用户自定义
  pendingCount: number;  // 标题栏圆点指示器依据
}

// 历史条目
interface Session {
  id: string;
  callerId: string;
  requestName: string;
  summary: string;
  projectDirectory: string;
  status: "pending" | "responded";
  createdAt: string;
  // 用户输入
  feedbackText: string;
  testLogText: string;
  images: ImageAttachment[];
}

interface FeedbackState {
  callers: Caller[];
  sessions: Session[];
  activeCallerId: string | null;
  activeSessionId: string | null;

  // 衍生数据
  activeCaller: Caller | null;
  activeCallerSessions: Session[];  // 当前 Tab 对应的历史列表
  activeSession: Session | null;

  // Actions
  addCaller(caller: Caller): void;
  updateCallerColor(id: string, color: string): void;
  setActiveCaller(id: string): void;
  addSession(session: Session): void;
  setActiveSession(id: string): void;
  updateSessionFeedback(id: string, field: string, value: any): void;
  submitSession(id: string): Promise<void>;  // 提交后 status → responded（不可修改）
}
```

#### 3.2 标题栏 Tab 组件

**新建文件：** `app/src/components/CallerTabs.tsx`

```
CallerTabs
├── TabButton (圆角正方形)
│   ├── 调用者名称首字母或图标
│   ├── 背景色 = caller.color
│   ├── 选中态 = 边框高亮
│   └── PendingDot (红色小圆点，pendingCount > 0 时显示)
└── 右键菜单 → 编辑颜色
```

**Tab 按钮尺寸：** ~28x28px 圆角正方形（border-radius: 6px）

#### 3.3 历史侧栏组件

**新建文件：** `app/src/components/Sidebar.tsx`

```
Sidebar (展示 activeCallerId 对应的 sessions)
├── SidebarHeader ("历史记录" 标题)
└── SessionList
    └── SessionItem
        ├── 状态图标 (🟡 pending / ✅ responded)
        ├── request_name (截断)
        ├── 时间戳 (相对时间: "2分钟前")
        └── 点击 → setActiveSession(id)
```

**侧栏宽度：** 180-200px，未来可考虑折叠为图标模式

#### 3.4 主面板适配

- **Pending session**：Summary + 可编辑的 FeedbackInput + 提交按钮
- **Responded session**：Summary + 已提交反馈（只读灰色背景）
- 提交时调用 `submit_session_feedback` Tauri Command（携带 session_id）

#### 3.5 前端 IPC 事件监听

通过 Tauri 的事件系统监听后端推送：

```typescript
import { listen } from "@tauri-apps/api/event";

// 监听新请求到达
listen<Session>("new-feedback-request", (event) => {
  feedbackStore.addSession(event.payload);
  feedbackStore.setActiveSession(event.payload.id);
  // 可选：弹窗/通知提醒
});
```

---

### Phase 4: 系统托盘 + 常驻后台（预计 0.5-1 天）

> 目标：App 最小化到系统托盘，新请求到达时弹出

#### 4.1 Tauri 配置

**添加依赖：** `tauri-plugin-notification` + 系统托盘 API

```rust
// app/src-tauri/src/lib.rs
use tauri::{
    tray::{TrayIconBuilder, MouseButton, MouseButtonState},
    Manager,
};

TrayIconBuilder::new()
    .icon(app.default_window_icon().unwrap().clone())
    .tooltip("My Last Feedback")
    .on_tray_icon_event(|tray, event| {
        if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
            let window = tray.app_handle().get_webview_window("main").unwrap();
            window.show().unwrap();
            window.set_focus().unwrap();
        }
    })
    .build(app)?;
```

#### 4.2 窗口行为变更

| 操作 | 当前行为 | 新行为 |
|------|----------|--------|
| 关闭按钮 | 退出进程 | 隐藏到托盘 |
| 提交反馈 | 退出进程 | 标记 session 完成，保持 App 运行 |
| 新请求到达 | N/A | 显示窗口 + 弹出通知 |
| 托盘右键 | N/A | 菜单：显示/退出 |

---

### Phase 5: 端到端集成测试 + 优化（预计 1 天）

| 任务 | 详情 |
|------|------|
| 5.1 | 模拟多 AI 客户端同时连接，验证分组显示 |
| 5.2 | 测试 App 重启后 MCP Server 自动重连 |
| 5.3 | 测试向后兼容（CLI 单次模式） |
| 5.4 | 性能测试：大量 session 下的 UI 响应 |
| 5.5 | 发布说明 + README 更新 |

---

## 四、技术风险与应对

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| MCP SDK 不暴露 clientInfo | 无法识别调用者名称 | 改用 env 变量或 MCP 参数传递 caller 信息 |
| TCP 端口冲突 | IPC 连接失败 | 自动端口扫描（19850-19860）+ Named Pipe 备选 |
| Tauri 单窗口限制 | 无法同时操作多 session | 单窗口 + 侧边栏切换（已规划） |
| execFileSync → async 迁移 | MCP Server 需要异步等待 | MCP tool handler 本身支持 async |
| Windows Named Pipe 权限 | 进程间通信失败 | 优先使用 TCP localhost |

---

## 五、文件修改清单（预估）

### 新建文件
| 文件 | 用途 |
|------|------|
| `app/src-tauri/src/ipc.rs` | IPC Server 模块（TCP 监听、消息解析） |
| `app/src-tauri/src/session.rs` | Session 管理器（状态、生命周期、持久化） |
| `app/src/components/Sidebar.tsx` | 左侧历史栏组件 |
| `app/src/components/SessionItem.tsx` | 单个 session 历史条目组件 |
| `app/src/components/CallerTabs.tsx` | 标题栏调用者 Tab 按钮组件 |

### 重大修改文件
| 文件 | 变更内容 |
|------|----------|
| `server.mjs` | 从 `execFileSync` 改为 IPC 客户端 |
| `app/src-tauri/src/lib.rs` | 启动 IPC server、新增 Tauri Commands |
| `app/src-tauri/Cargo.toml` | 添加 tokio、uuid 等依赖 |
| `app/src/store/feedbackStore.ts` | 多 session 状态管理 |
| `app/src/components/FeedbackApp.tsx` | 集成侧边栏、session 切换 |
| `app/src/components/SummaryPanel.tsx` | 读取 activeSession 数据 |
| `app/src/components/FeedbackInput.tsx` | 读取 activeSession 数据 |
| `app/src/index.css` | 侧边栏样式 |

### 轻微修改文件
| 文件 | 变更内容 |
|------|----------|
| `app/src-tauri/tauri.conf.json` | 系统托盘配置 |
| `app/src-tauri/capabilities/default.json` | IPC 相关权限 |
| `app/src/App.tsx` | 初始化监听 IPC 事件 |
| `package.json` | 无变化（MCP Server 端依赖不变） |

---

## 六、里程碑与验收标准

| 里程碑 | 验收条件 | 预计周期 |
|--------|----------|----------|
| M1: IPC 通信 | MCP Server 可通过 TCP 发请求到 App 并收到响应 | Phase 1+2 (2-3 天) |
| M2: 多 Session UI | 侧边栏展示多个 session，可切换、可提交 | Phase 3 (1.5-2 天) |
| M3: 常驻后台 | 系统托盘、新请求自动弹窗、关闭=隐藏 | Phase 4 (0.5-1 天) |
| M4: 完整集成 | 端到端流畅运行，向后兼容 CLI 模式 | Phase 5 (1 天) |

**总计预估：5-7 天开发周期**

---

## 七、后续扩展方向（非本次范围）

- **搜索功能**：按调用者、请求名称、时间范围搜索历史
- **多窗口模式**：为不同调用者打开独立窗口
- **WebSocket 支持**：替代 TCP，支持远程调用
- **插件系统**：允许自定义提交前/后处理逻辑
- **导出功能**：导出 session 历史为 Markdown/JSON
