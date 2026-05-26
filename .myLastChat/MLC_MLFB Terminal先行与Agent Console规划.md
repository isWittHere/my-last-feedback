---
title: MLFB Terminal先行与Agent Console规划
description: 规划右侧页面栏、终端Tab与未来CLI Agent运行层
workplace: e:\Dev\my-last-feedback
project: my-last-feedback
type: planning
tags:
  - MLFB
  - Terminal
  - Agent Console
  - Claude Code
  - OpenCode
  - MLRA
---

# MLFB Terminal先行与Agent Console规划

## 1. 背景

当前 MLFB 已经具备较完整的反馈工作台能力：多 caller 会话、MLC 资料栏、资源管理面板、Markdown 预览、预览浏览器、Preview Info、可拖拽 dock tab，以及 MLRA 的长运行多 agent 编排 UI。

用户接下来希望补齐两项能力：

1. 新增右侧页面栏，使主内容左右两边都拥有“侧栏 + 页面栏”的对称 dock 布局，成为完整体。
2. 新增一个 tab，内置终端页面。

随后用户进一步说明：内置终端的深层目标，是未来能在 MLFB 里直接使用 Claude Code、OpenCode 等 CLI 式 agent。因此本规划不应只把它看作一个 shell 面板，而应把它设计成未来 Agent Console 的基础设施。

## 2. 总体结论

推荐采用“Terminal 先行，Agent Console 可升级”的路线。

短期命名和用户心智保持简单：新增 `Terminal` dock tab，用户可以像普通内置终端一样使用。

中长期架构不要写死为 terminal-only，而是在实现时预留 `AgentRuntimeSession`、`AgentProviderProfile`、MCP 注入、workspace/worktree、transcript、diff 管理等扩展点。这样未来可以把同一个 tab 平滑升级为 Agent Console，用来启动、观察和管理 Claude Code、OpenCode、Copilot ACP 或自定义 CLI agent。

核心原则：

- Terminal 是最低兼容显示层，任何 CLI 都能跑。
- Agent Runtime 是未来控制层，负责 provider、会话、权限、MCP 注入、worktree 和 MLRA 对接。
- 第一阶段不要阻塞在完整 agent orchestration 上，先把对称 dock 和真实交互式终端做好。
- 但第一阶段的数据结构和命名要避免把未来路线堵死。

## 3. 当前代码状态与约束

### 3.1 Dock 布局现状

当前 dock column 只有三列：

```text
leftSidebar | leftPage | callerWorkspace | rightSidebar
```

相关核心文件：

- `app/src/store/feedbackStore.ts`
  - `DockColumnId = "leftSidebar" | "leftPage" | "rightSidebar"`
  - `DockTabId = "mlc" | "resources" | "mlcPreview" | "previewBrowser" | "previewInfo"`
  - 负责布局持久化、tab 移动、折叠、宽度、active tab、旧布局迁移。
- `app/src/components/FeedbackApp.tsx`
  - body 中依次渲染 `leftSidebar`、`leftPage`、主 caller workspace、`rightSidebar`。
  - titlebar 左边已有 `leftSidebar`/`leftPage` toggle，右边只有 `rightSidebar` toggle。
- `app/src/components/DockColumn.tsx`
  - 负责 tab bar、拖拽、右键菜单、折叠按钮、resize、内容渲染。
- `app/src/components/CallerPanelParts.tsx`
  - 内部也有本地 `DOCK_COLUMN_IDS`，用于检测资源/预览 tab 当前在哪一列。
- `app/src/index.css`
  - dock column/drop zone/resize/tab 样式。

### 3.2 终端能力现状

当前没有真实终端基础设施：

- 前端 `app/package.json` 已有 `@tauri-apps/plugin-shell`，但这只适合普通 shell command，不足以实现完整交互式终端。
- Rust `app/src-tauri/Cargo.toml` 未注册 `tauri-plugin-shell`。
- `app/src-tauri/capabilities/default.json` 没有 shell 权限。
- 代码中没有 PTY、ConPTY、xterm、terminal session manager。

因此如果要做真正终端，需要新增：

- 前端 xterm 渲染层。
- Rust PTY manager。
- Tauri commands/events。
- 终端会话生命周期管理。

### 3.3 MLRA 相关现状

当前 MLRA 已有独立 daemon、MCP role server、App UI 状态同步：

- `mcp/mlra/daemon/index.mjs`
- `mcp/mlra/daemon-client.mjs`
- `mcp/mlra/protocol/*`
- `app/src/store/mlraStore.ts`

这些能力说明项目已经有“App UI 控制外部 agent/daemon”的基础经验。未来 CLI agent runtime 可以复用类似模式，但第一阶段不建议直接和 MLRA 强耦合。

## 4. 目标架构

### 4.1 视觉布局目标

新增 `rightPage` 后，最终布局为：

```text
leftSidebar | leftPage | callerWorkspace | rightPage | rightSidebar
```

语义：

- `leftSidebar`：左侧窄/侧栏型 dock。
- `leftPage`：左侧页面型 dock，适合预览、文档、浏览器等较大内容。
- `callerWorkspace`：主反馈工作区。
- `rightPage`：右侧页面型 dock，适合 Terminal/Agent Console 等较大内容。
- `rightSidebar`：右侧窄/侧栏型 dock，适合 MLC、资源、info 等上下文辅助内容。

### 4.2 能力分层目标

```text
Dock Tab: Terminal
        |
        v
TerminalPanel / future AgentConsolePanel
        |
        v
Frontend runtime store
        |
        v
Tauri commands + events
        |
        v
Rust Runtime Manager
        |
        +-- PTY Session Manager
        +-- Agent Provider Adapter (future)
        +-- Workspace / Worktree Manager (future)
        +-- Transcript / Log Normalizer (future)
        +-- MCP Injection Coordinator (future)
```

第一阶段只实现 Dock + Terminal + PTY，未来逐步补 Agent Runtime。

## 5. 右侧页面栏详细方案

### 5.1 类型与常量

将 `DockColumnId` 扩展为：

```ts
export type DockColumnId = "leftSidebar" | "leftPage" | "rightPage" | "rightSidebar";
```

视觉顺序建议：

```ts
const DOCK_COLUMN_IDS: DockColumnId[] = ["leftSidebar", "leftPage", "rightPage", "rightSidebar"];
```

注意：这个顺序用于 normalize、fallback、遍历、drag/drop，不等于 JSX 渲染位置。JSX 中仍需把 `rightPage` 放在 caller workspace 右侧。

### 5.2 持久化与迁移

当前 key：

```ts
const DOCK_LAYOUT_STORAGE_KEY = "mlfb-dock-layout-v1";
```

建议第一阶段不强制换 key，直接在 `loadDockLayout()` 中补齐缺失列：

- 旧布局没有 `rightPage` 时，使用 `createDockColumn()` 创建空列。
- 已存在 tab 分布不重排，尊重用户本地布局。
- 新增 `terminal` tab 后，如果旧布局中缺少 `terminal`，默认放到 `rightPage`。

好处：迁移小、用户已有布局不会被清空。

风险：如果未来布局 schema 变化更大，再考虑 `v2` key。

### 5.3 默认 tab 落位

新增 `terminal` 后，建议默认落位：

```text
rightPage: terminal
rightSidebar: 原有 mlc/resources/previewInfo 等保持用户布局
leftPage: 继续适合 previewBrowser
```

对新用户，可以考虑更明确的默认布局：

```text
leftSidebar: 空或 MLC
leftPage: previewBrowser
rightPage: terminal
rightSidebar: resources / mlc / previewInfo
```

但为了不突然改变老用户体验，第一版应以“新增 terminal 到 rightPage，不重排已有 tab”为原则。

### 5.4 UI 修改点

`FeedbackApp.tsx`：

- 增加 `rightPageColumn = dockColumns.rightPage`。
- titlebar 右侧增加一个 `rightPage` toggle，和 `rightSidebar` 并列。
- body JSX 改为：

```tsx
<DockColumn columnId="leftSidebar" />
<DockColumn columnId="leftPage" />
<div ref={callerWorkspaceRef} className="caller-workspace">...</div>
<DockColumn columnId="rightPage" />
<DockColumn columnId="rightSidebar" />
```

`DockColumn.tsx`：

- `DOCK_COLUMN_LABELS` 增加 `rightPage`。
- `isDockColumnId()` 增加 `rightPage`。
- `visualPosition` 改为：

```ts
const visualPosition = columnId === "rightPage" || columnId === "rightSidebar" ? "right" : "left";
```

- 右键菜单增加 `Move to right page`。
- drop target icon：`rightPage` 使用镜像的 `page-sidebar` 图标。

`CallerPanelParts.tsx`：

- 本地 `DOCK_COLUMN_IDS` 必须同步加入 `rightPage`。
- 资源/预览按钮寻找 tab 所在列时才能覆盖新列。

`index.css`：

- `.dock-column-drop-zone[data-column-id="rightSidebar"]` 扩展覆盖 `rightPage`。
- 注意 `rightPage` 与 `rightSidebar` 相邻时不要出现视觉双边框。

`en.json` / `zh.json`：

- 新增 `moveToRightPage`。
- 新增 `closeRightPage`。
- 新增 `openRightPage`。

## 6. Terminal Tab 详细方案

### 6.1 新增 tab id

扩展：

```ts
export type SidePanelTab = "mlc" | "resources" | "mlcPreview" | "previewBrowser" | "previewInfo" | "terminal";
export type DockTabId = SidePanelTab;
```

同步更新：

- `KNOWN_DOCK_TABS`
- `DEFAULT_DOCK_TABS`
- `isDockTabId()`
- `dockTabLabel()`
- `dockTabIcon()`
- `DockTabContent()`
- `DockDragPreview` 的 icon/label 映射

文案：

```json
"terminal": {
  "title": "Terminal",
  "button": "Terminal",
  "start": "Start terminal",
  "restart": "Restart",
  "kill": "Kill",
  "clear": "Clear",
  "copy": "Copy output"
}
```

中文：

```json
"terminal": {
  "title": "终端",
  "button": "终端",
  "start": "启动终端",
  "restart": "重启",
  "kill": "终止",
  "clear": "清空",
  "copy": "复制输出"
}
```

### 6.2 前端依赖

建议引入：

```text
@xterm/xterm
@xterm/addon-fit
```

可选后续：

```text
@xterm/addon-web-links
@xterm/addon-search
@xterm/addon-serialize
```

第一阶段只需要 xterm + fit。

### 6.3 TerminalPanel UI

新增组件：

```text
app/src/components/TerminalPanel.tsx
```

结构：

```text
TerminalPanel
├─ toolbar
│  ├─ shell badge
│  ├─ cwd label
│  ├─ restart button
│  ├─ clear button
│  ├─ copy button
│  └─ kill button
└─ xterm host
```

交互：

- panel mount 时创建 terminal session。
- xterm `onData` 调用 `terminal_write`。
- fit addon 在 panel resize、dock width change、window resize 时计算 cols/rows，再调用 `terminal_resize`。
- 收到 `terminal-output` event 后写入 xterm。
- 收到 `terminal-exit` event 后显示退出状态，但不自动销毁输出。
- 用户点击 restart 时 kill + create。

### 6.4 CWD 选择

默认 cwd 优先级：

1. 当前 focused composer 的 `projectDirectory`。
2. `mlcActiveWorkspacePath`。
3. 当前 active session 的 `projectDirectory`。
4. 后端 fallback 到 home 或进程当前目录。

后续 Agent Console 阶段可让用户手动选择 cwd 或使用 worktree。

## 7. Rust PTY 后端方案

### 7.1 依赖

建议 Rust 增加：

```toml
portable-pty = "0.8"
```

`portable-pty` 适合跨平台 PTY：

- Windows 使用 ConPTY。
- macOS/Linux 使用 Unix PTY。

### 7.2 后端模块

新增：

```text
app/src-tauri/src/terminal.rs
```

核心结构：

```rust
struct TerminalManager {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

struct TerminalSession {
    id: String,
    cwd: PathBuf,
    shell: String,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}
```

实际类型要按 `portable-pty` trait 约束调整。

### 7.3 Tauri commands

建议命令：

```text
terminal_create(cwd?: string, shell?: string, cols: u16, rows: u16)
terminal_write(terminalId: string, data: string)
terminal_resize(terminalId: string, cols: u16, rows: u16)
terminal_kill(terminalId: string)
terminal_list()
```

返回示例：

```json
{
  "terminalId": "term_...",
  "cwd": "e:\\Dev\\my-last-feedback",
  "shell": "powershell.exe"
}
```

### 7.4 Tauri events

```text
terminal-output
terminal-exit
terminal-error
```

payload：

```ts
interface TerminalOutputEvent {
  terminalId: string;
  data: string;
}

interface TerminalExitEvent {
  terminalId: string;
  exitCode?: number | null;
}

interface TerminalErrorEvent {
  terminalId: string;
  message: string;
}
```

### 7.5 Shell 选择

Windows：

```text
pwsh.exe -> powershell.exe -> cmd.exe
```

macOS/Linux：

```text
$SHELL -> /bin/bash -> /bin/sh
```

后续可在设置页增加默认 shell 配置。

### 7.6 生命周期

- App 退出时 kill 所有 PTY child。
- TerminalPanel unmount 不一定 kill，避免 tab 切换丢会话。
- 用户点击 kill/restart 时显式结束进程。
- 后端读线程检测 EOF 后 emit `terminal-exit` 并清理 session。

## 8. Agent Runtime 可升级设计

### 8.1 为什么需要 Agent Runtime

Claude Code、OpenCode 等 CLI agent 与普通 shell 不同：

- 它们可能有模型、会话、审批、MCP、上下文、工具调用、编辑文件、运行测试等高级状态。
- 如果 App 只通过 PTY 屏幕流观察它们，无法可靠地知道何时等待用户、何时完成、何时正在改文件。
- 不同 agent 的配置和启动参数不同，需要 provider profile 管理。

因此 terminal session 之上需要抽象 agent runtime session。

### 8.2 Provider Profile

建议未来新增：

```ts
export type AgentProviderKind = "raw-terminal" | "claude-code" | "opencode" | "copilot-acp" | "custom";

export interface AgentProviderProfile {
  id: string;
  kind: AgentProviderKind;
  label: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  defaultCwdMode: "active-workspace" | "last-used" | "manual";
  supportsMcp: boolean;
  supportsStructuredProtocol: boolean;
  supportsApprovalMode: boolean;
}
```

内置 profile：

- `raw-powershell`
- `raw-bash`
- `claude-code`
- `opencode`
- `copilot-acp`

第一阶段可以不实现 UI，但数据结构命名应预留。

### 8.3 Runtime Session

建议未来新增：

```ts
export interface AgentRuntimeSession {
  id: string;
  providerId: string;
  terminalId: string;
  title: string;
  cwd: string;
  status: "starting" | "running" | "waiting" | "exited" | "failed";
  linkedCallerId?: string;
  linkedMlfbSessionId?: string;
  worktreePath?: string;
  createdAt: string;
  updatedAt: string;
}
```

Terminal tab 内部未来可以展示多个 runtime session，而不是每个 agent 占一个 dock tab。

## 9. MCP 注入与 MLFB 绑定

### 9.1 目标

未来 App 启动 Claude Code/OpenCode 时，应尽量自动把 my-last-feedback MCP server 注入 agent，使 agent 可以直接调用 `interactive_feedback`。

理想效果：

1. 用户在 App 中点击“启动 Claude Code”。
2. App 生成临时 MCP 配置或 provider 参数。
3. App 启动 CLI agent。
4. agent 调用 `interactive_feedback`。
5. MLFB 自动知道该反馈请求属于哪个 runtime session。
6. UI 可在 Terminal/Agent Console、Caller、MLC、diff 之间建立关联。

### 9.2 绑定模型

需要一个映射：

```ts
interface AgentRuntimeBinding {
  runtimeSessionId: string;
  callerId: string;
  agentName: string;
  providerId: string;
  cwd: string;
}
```

当内部 agent 通过 MLFB MCP server 注册或发起 feedback request 时，后端可以根据 env/session id/provider metadata 绑定 caller。

### 9.3 Provider Adapter

不同 CLI agent 的 MCP 配置方式可能不同，因此不要在核心 terminal manager 里写死 Claude/OpenCode 逻辑。

建议未来做 adapter：

```text
AgentProviderAdapter
├─ buildCommand(profile, sessionConfig)
├─ buildEnv(profile, sessionConfig)
├─ prepareMcpConfig(profile, sessionConfig)
└─ parseStructuredEvents?()
```

raw terminal provider 不做 MCP 注入。

Claude Code/OpenCode provider 根据其实际配置方式实现。

ACP provider 可复用 `.myLastChat/acp-poc` 的探索成果。

## 10. Git Worktree 与多 Agent 隔离

### 10.1 为什么需要 Worktree

如果未来在一个 app 中同时启动多个 CLI agent，它们直接在同一个 workspace 中改文件会互相影响。

建议引入 per-session worktree：

```text
repo/
repo/.mlfb-worktrees/session-a/
repo/.mlfb-worktrees/session-b/
```

每个 agent runtime session 在独立 worktree 中运行。

好处：

- 多 agent 并行不互相踩文件。
- 每个 session 有独立 diff。
- 可以在 MLFB 中 review、merge、discard。
- 可以和现有 Git Action 语义结合。
- 未来 MLRA worker 可以一人一个 worktree。

### 10.2 分阶段策略

第一阶段：不用 worktree，直接 cwd 当前 workspace。

第二阶段：启动 agent 时提供选项：

- 当前 workspace。
- 新建 branch。
- 新建 worktree。

第三阶段：Agent Console 内置 diff/review/merge/discard。

## 11. 安全与权限边界

CLI agent 能运行命令、修改文件、读取环境变量。内置终端本身不会让它更安全。

必须明确边界：

- Terminal/Agent Runtime 只在桌面 Tauri 环境可用。
- 不暴露给 Android/PWA remote API。
- 不允许 feedback payload 自动触发命令执行。
- raw terminal provider 无法拦截 CLI 内部行为，只能显示和终止。
- 对支持 approval/sandbox 的 provider，优先使用 provider 自带机制。
- 对高风险 provider，可要求用户确认 cwd、shell、env、worktree。
- 默认不注入敏感环境变量白名单之外的内容。

建议 UI 显示：

- 当前 cwd。
- 当前 provider。
- 是否使用 worktree。
- 是否启用 MCP 注入。
- 是否处于 raw terminal 模式。

## 12. UI/UX 规划

### 12.1 第一阶段 UI

Dock tab 名称：`Terminal` / `终端`。

位置：默认 `rightPage`。

顶部工具条：

- Shell 名称。
- CWD 简写。
- Restart。
- Clear。
- Copy。
- Kill。

主体：

- xterm 填满剩余区域。
- 无 marketing/说明页。
- 创建失败时显示紧凑错误和重试按钮。

### 12.2 未来升级 UI

Terminal tab 可以逐步升级为 Agent Console，但不必立刻改名。

内部可增加：

- Runtime session list。
- Provider selector。
- Prompt launcher。
- Worktree selector。
- Transcript / Diff / Files 三个内部 tab。
- MCP status badge。
- Approval/waiting 状态提示。

## 13. 与 Preview Browser 的关系

当前 preview browser 使用 native webview，`DockColumn.tsx` 会根据 column active/collapsed 状态 hide tab。

新增 `rightPage` 后必须验证：

- previewBrowser 拖到 rightPage 后仍能正确显示 webview。
- previewBrowser 不活跃时仍能 hide native webview。
- nativeWebViewBlocker 不受 terminal tab menu 影响。

Terminal 本身是 DOM/xterm，不需要 native webview blocker。

## 14. 实施阶段

### Phase 1：Dock 完全体

目标：新增 `rightPage` 并保持现有功能不回归。

任务：

- 扩展 `DockColumnId`。
- 所有 columns 初始化、normalize、persist、move/open tab 支持 `rightPage`。
- `FeedbackApp` 渲染 `rightPage`。
- titlebar 右侧新增 rightPage toggle。
- `DockColumn` 右键菜单新增 rightPage。
- `CallerPanelParts` 本地列列表同步。
- CSS drop zone/right border 支持右侧两列。
- i18n 补齐。

验收：

- 可以打开/关闭 rightPage。
- tab 可以拖到 rightPage。
- 右键菜单可以移动到 rightPage。
- left/right page/sidebar 四个栏位都可用。
- 旧布局不会被清空。

### Phase 2：Terminal Tab 空壳

目标：新增 terminal tab，默认落到 rightPage。

任务：

- 扩展 `DockTabId`。
- `KNOWN_DOCK_TABS` / `DEFAULT_DOCK_TABS` 加入 terminal。
- `DockColumn` label/icon/content 支持 terminal。
- 新建 `TerminalPanel.tsx`，先显示紧凑 shell panel 空壳。
- i18n 增加 terminal 文案。

验收：

- Terminal tab 默认出现在 rightPage。
- 可以拖拽到任意 dock column。
- tab hover、右键、折叠按钮一致。

### Phase 3：真实 PTY 终端

目标：xterm + Rust PTY 打通。

任务：

- npm 增加 `@xterm/xterm`、`@xterm/addon-fit`。
- Cargo 增加 `portable-pty`。
- 新增 `terminal.rs`。
- 注册 Tauri commands/events。
- `TerminalPanel` 接入 create/write/resize/kill/output。
- 处理 shell fallback、cwd fallback、exit cleanup。

验收：

- Windows 可启动 PowerShell。
- 可执行 `pwd`/`dir`/`echo` 等命令。
- 可输入交互式命令。
- resize 正常。
- kill/restart 正常。
- app 退出不残留进程。

### Phase 4：Agent Runtime 基础

目标：为 Claude Code/OpenCode 等 provider 预留运行层。

任务：

- 新增 `agentRuntimeStore.ts` 或 terminal store。
- 定义 `AgentProviderProfile`。
- 定义 `AgentRuntimeSession`。
- Terminal session 与 runtime session 绑定。
- UI 中保留 provider/session 概念，但默认仍是 raw terminal。

验收：

- 一个 terminal session 可被 runtime session 表示。
- 后续 provider 不需要重写 TerminalPanel 核心。

### Phase 5：Provider Launcher 与 MCP 注入

目标：App 一键启动 CLI agent。

任务：

- 增加 provider profile 配置。
- 内置 Claude Code/OpenCode/custom 占位 profile。
- 实现 provider adapter：command/args/env/mcp config。
- 启动 agent 时生成 runtime session。
- 绑定 caller/session/agent_name。

验收：

- 可以从 App 启动一个 provider。
- provider 在 Terminal 中可见可交互。
- 支持把 MLFB MCP 配置注入支持 MCP 的 provider。

### Phase 6：Worktree/Diff/MLRA 集成

目标：把 Agent Console 变成真正的 agent 工作台。

任务：

- per-session worktree。
- diff/review/merge/discard。
- transcript 保存与搜索。
- MLRA worker/expert 绑定 runtime session。
- 多 agent 并行管理。

验收：

- 多 CLI agent 可并行。
- 每个 agent 有独立 cwd/worktree/diff。
- MLRA 可把 role 分配给 runtime-backed agent。

## 15. 测试计划

### 静态验证

- TypeScript build。
- Rust cargo check。
- i18n key parity。
- CSS 基础检查。

### Dock 验证

- 新用户默认布局。
- 旧 localStorage 布局迁移。
- 四列折叠/展开。
- tab 拖拽到每一列。
- 右键移动到每一列。
- tabBar top/bottom 同步。

### Terminal 验证

- Windows PowerShell 启动。
- 命令输入输出。
- ANSI 颜色。
- Ctrl+C。
- resize。
- restart。
- kill。
- app 退出清理。

### 回归验证

- MLC panel。
- Project resources。
- MLC Preview。
- Preview Browser native webview。
- Preview Info。
- Caller attachment action buttons。
- 标题栏按钮不拥挤。

## 16. 主要风险与应对

### 风险 1：DockColumnId 改动面大

应对：集中修改所有 `DOCK_COLUMN_IDS`、`Record<DockColumnId, ...>`、hardcode menu，不做顺手重构。

### 风险 2：PTY 在 Windows 下行为复杂

应对：第一版只保证 PowerShell/cmd 基础可用；高级 shell integration 后置。

### 风险 3：xterm resize 与 dock resize 不同步

应对：使用 `ResizeObserver` + `FitAddon`，并在每次 fit 后调用后端 `terminal_resize`。

### 风险 4：CLI agent 状态不可结构化

应对：raw terminal 只作为最低兼容层；支持结构化协议的 provider 后续用 adapter 接入。

### 风险 5：权限边界不清晰

应对：UI 明示 cwd/provider/worktree/raw mode；不允许远程 API 启动本地终端；不允许 feedback payload 触发命令。

## 17. 推荐第一批提交拆分

### Commit 1：Add right page dock column

内容：

- `rightPage` 布局、迁移、toggle、右键菜单、CSS、i18n。

### Commit 2：Add terminal dock tab shell

内容：

- `terminal` tab 类型、label/icon/content、TerminalPanel 空壳、默认落位 rightPage。

### Commit 3：Add interactive terminal backend

内容：

- xterm、portable-pty、Tauri commands/events、终端 UI 接线。

### Commit 4：Prepare agent runtime model

内容：

- provider/session 类型与 store 初版，不一定暴露完整 UI。

## 18. 开放问题

1. Terminal tab 是否保持命名为“终端”，直到 Agent Console 功能成熟后再改名？当前用户选择是“Terminal 先行后升级”，因此建议保持“终端”。
2. `terminal` 默认是否自动展开 rightPage？建议自动展开，让用户看到新增能力。
3. 第一版是否允许多个 terminal session？建议第一版单 session，第二版再加内部 session list。
4. 是否立刻做 worktree？建议后置，先打通 PTY。
5. Claude Code/OpenCode 的 MCP 注入方式是否现在就适配？建议先预留 provider adapter，具体接入等终端稳定后做。

## 19. 最终建议

先按以下顺序执行：

1. `rightPage` 对称 dock。
2. `terminal` tab 落到 rightPage。
3. xterm + Rust PTY 打通真实终端。
4. 抽象 Agent Runtime Session。
5. 再逐步接入 Claude Code/OpenCode provider、MCP 注入、worktree、MLRA。

这样路线最稳：短期能得到一个真实可用的内置终端，中期能启动 CLI agent，长期能升级为 MLFB 自己的 Agent Console 与 MLRA 执行后端。