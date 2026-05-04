---
title: MLFB 用户主导多标签终端与持久化规划
description: 重新设计内置终端的默认目录、多标签页、首页路径选择和持久化运行能力
workplace: e:\Dev\my-last-feedback
project: my-last-feedback
type: planning
tags:
  - MLFB
  - Terminal
  - Persistent Terminal
  - Multi Tab
  - OpenCode
  - Agent Console
---

# MLFB 用户主导多标签终端与持久化规划

## 1. 背景

MLFB 已完成第一阶段内置终端基础能力：

- 新增 `Terminal` dock tab。
- 前端使用 xterm 渲染交互式终端。
- 后端使用 Rust `portable-pty` 启动真实 PTY/ConPTY。
- 已支持创建、写入、resize、kill、输出事件、退出事件。
- 已完成基础深浅色显示修正和 tab 图标冲突修正。
- 当前实现已备份提交：`fce1681 Add embedded terminal foundation`。

但第一阶段实现仍然是“面板驱动”的终端：

- `TerminalPanel` mount 时创建终端。
- `TerminalPanel` unmount 时 kill 终端。
- 只有单个终端实例。
- 默认 cwd 由上下文自动推断，用户不可明确控制。
- dock 折叠、切换、移动可能导致终端生命周期被 UI 间接影响。

用户提出新的产品目标：终端应该变成“用户主导”的多标签工作区，而不是一个由当前焦点推断 cwd 的临时 shell 面板。

## 2. 用户需求

用户明确提出五项需求：

1. 终端内部需要 tab 页功能，类似浏览器，可以多标签页。
2. 终端需要一个首页，展示路径列表，让用户从最近 caller 的路径中新建终端标签页。
3. 如果用户直接点击创建新终端，则根据最近使用的路径新建。
4. 新建标签页的加号应升级为 split button：主按钮直接新建，旁边展开路径列表，点击路径即可新建。
5. 已进入的终端必须持久化，不能因为关闭侧边栏、切换 dock、切换工具 tab 而被打断。

## 3. 核心结论

这不是简单的 UI 增强，而是终端架构升级。

当前终端是：

```text
Dock tab -> TerminalPanel -> PTY session
```

目标终端应变成：

```text
Terminal Runtime Store -> terminal sessions
Terminal Event Bridge -> output/error/exit events
TerminalPanel -> render active tab only
Dock tab -> host TerminalPanel, not own session lifetime
```

核心原则：

- 用户选择优先于自动推断。
- UI 可关闭，终端进程不应被关闭。
- dock 只决定终端面板在哪里显示，不决定终端是否存在。
- 多终端 tab 属于终端工作区，不属于 dock 布局。
- 默认路径由“最近用户确认过的路径”决定，而不是由最后焦点暗中覆盖。

## 4. 产品模型

### 4.1 Dock Tab 与 Terminal Tab 的边界

需要区分两种 tab：

- Dock tab：`Terminal` 是 MLFB 工具面板之一，和 MLC、Resources、Preview Browser 同级。
- Terminal tab：`Terminal` 面板内部的多个 shell 会话，类似浏览器标签页。

因此不应为每个 shell session 创建一个 dock tab。dock tab 只承载一个终端工作区，内部再管理多个 terminal tabs。

### 4.2 终端首页

终端首页是“启动器”，用于帮助用户选择 cwd。

首页展示内容：

- 最近使用的终端路径。
- 最近 caller/session 的项目路径。
- 当前 active session 的项目路径。
- 当前 MLC/resource workspace 路径。
- 后续可加入收藏路径、常用 workspace、worktree 路径。

首页每一项应显示：

- 目录 basename。
- 完整路径。
- 来源，例如 `Recent terminal`、`Caller`、`Active session`、`MLC workspace`。
- 最近使用时间或最近出现时间。

点击路径行：以该 cwd 创建一个新的 terminal tab。

### 4.3 新建终端 Split Button

终端 tab strip 左侧或右侧提供 split button：

```text
[ + ] [ v ]
```

行为：

- `+` 主按钮：使用最近用户确认过的 cwd 创建新 terminal tab。
- `v` 下拉按钮：展开路径候选列表。
- 下拉项：点击任一路径，以该 cwd 新建 terminal tab。

如果没有任何最近路径，主按钮可以：

- 使用 active session project directory。
- 或打开首页而不直接创建。

推荐第一阶段使用“打开首页”作为空历史兜底，避免再次引入不透明推断。

### 4.4 默认目录策略

当前默认目录策略：

```ts
focusedComposer.projectDirectory
  || mlcActiveWorkspacePath
  || activeSession.projectDirectory
```

该策略的问题：

- 太依赖隐式焦点。
- 用户看不到为什么选择了这个 cwd。
- `focusedComposer` 可能保留上一次焦点，导致新终端开到用户意料之外的项目。

新策略：

1. 如果用户最近手动选择过 cwd，则使用它。
2. 否则如果最近存在 terminal tab，则使用最近 active terminal tab 的 cwd。
3. 否则展示首页，让用户选择路径。
4. 后端仍保留系统级兜底，防止路径无效。

active session、focused composer、MLC workspace 不再直接决定默认 cwd，它们只进入候选列表。

## 5. 持久化定义

“持久化”需要分层定义，避免承诺过度。

### 5.1 UI 级持久化，必须实现

含义：

- 关闭 terminal dock column 不 kill PTY。
- 切换 dock tab 不 kill PTY。
- 移动 terminal dock tab 不 kill PTY。
- 折叠/展开侧栏不 kill PTY。
- TerminalPanel 组件临时 unmount 后，再 mount 可以重新 attach 到已有 session。

这是当前阶段必须实现的持久化。

### 5.2 WebView 重载级持久化，建议实现

含义：

- 前端刷新或 WebView 重载后，Rust 后端仍持有 PTY session。
- 前端启动时调用 `terminal_list` 恢复 session 列表。
- 调用 `terminal_read_buffer` 恢复最近输出。

这要求后端保存 session metadata 和 output ring buffer。

### 5.3 应用重启级持久化，暂不承诺

含义：

- 应用完全退出后，终端进程仍然存在。
- 再次启动应用可重新 attach。

这通常需要 tmux/zellij、独立 daemon、Windows pseudo console 管理器，或外部 terminal multiplexer。第一阶段不建议实现。可以作为远期方向研究。

## 6. 目标架构

### 6.1 前端 terminal store

新增 Zustand store，建议文件：

```text
app/src/store/terminalStore.ts
```

核心状态：

```ts
export type TerminalTabStatus = "starting" | "running" | "exited" | "failed";

export interface TerminalPathCandidate {
  path: string;
  label: string;
  source: "recent" | "caller" | "activeSession" | "workspace" | "fallback";
  callerName?: string;
  lastUsedAt?: string;
}

export interface TerminalTabState {
  id: string;
  terminalId: string | null;
  title: string;
  cwd: string;
  shell: string | null;
  status: TerminalTabStatus;
  output: string;
  error: string | null;
  createdAt: string;
  lastActiveAt: string;
}

export interface TerminalWorkspaceState {
  tabs: TerminalTabState[];
  activeTabId: string | null;
  recentPaths: TerminalPathCandidate[];
  lastUsedCwd: string | null;
}
```

核心 actions：

```ts
createTerminalTab(cwd?: string): Promise<void>;
closeTerminalTab(tabId: string): Promise<void>;
setActiveTerminalTab(tabId: string): void;
appendTerminalOutput(terminalId: string, data: string): void;
markTerminalExited(terminalId: string, exitCode: number | null): void;
markTerminalFailed(terminalId: string, message: string): void;
recordRecentPath(path: string, source: TerminalPathCandidate["source"]): void;
hydrateFromBackend(): Promise<void>;
```

### 6.2 TerminalEventBridge

新增顶层事件桥，建议文件：

```text
app/src/components/TerminalEventBridge.tsx
```

职责：

- 在 app 根部常驻。
- 监听 `terminal-output`。
- 监听 `terminal-exit`。
- 监听 `terminal-error`。
- 把事件写入 terminal store。

这样即使 `TerminalPanel` 不在 DOM 中，输出仍然被记录。

### 6.3 TerminalPanel

`TerminalPanel` 只负责 UI，不再直接拥有终端生命周期。

职责：

- 渲染 tab strip。
- 渲染首页。
- 渲染 active terminal tab 的 xterm。
- 用户关闭 terminal tab 时调用 store action。
- 用户新建 terminal tab 时调用 store action。

关键变化：

- 组件 unmount 不再 kill terminal。
- 切换 terminal tab 时 detach 当前 xterm view，attach 新 tab output。
- 对于 inactive tab，只保留 buffer，不保留 DOM renderer。

### 6.4 Rust TerminalManager

当前后端已有：

- `terminal_create`
- `terminal_write`
- `terminal_resize`
- `terminal_kill`

建议扩展：

- `terminal_list`
- `terminal_read_buffer`
- `terminal_clear_buffer`

后端 session 增加 metadata：

```rust
struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send>,
    cwd: String,
    shell: String,
    created_at: String,
    last_output_at: String,
    output_buffer: VecDeque<String>,
}
```

需要注意：

- output buffer 应限制大小，例如 1MB 或 5000 行，避免长期运行吃内存。
- `terminal_kill` 只由用户关闭 terminal tab 触发。
- app 退出时是否 kill_all 需要产品决策。第一阶段可以保持退出 app 时 kill_all。

## 7. 路径候选生成

候选路径应由前端统一生成并去重。

来源优先级不是默认 cwd 优先级，而是展示排序优先级：

1. 最近使用终端路径。
2. 当前 active terminal tab cwd。
3. 当前 active session project directory。
4. 最近 caller/session project directories。
5. MLC/resource active workspace。

去重规则：

- Windows 下路径比较应大小写不敏感。
- 统一 `\` 与 `/`。
- 移除末尾斜杠后比较。

展示规则：

- basename 为空时显示完整盘符或路径。
- 路径不可访问时标记 disabled 或放到列表底部。
- 第一阶段可以先不做异步验证，只依赖后端 create 失败返回错误。

## 8. UI 设计

### 8.1 Tab Strip

结构：

```text
[Home] [pwsh: my-last-feedback] [opencode: project-a]     [ + ][v]
```

建议：

- Home 不是一个真实 PTY，只是启动页入口。
- terminal tab 显示 shell + cwd basename。
- running/exited/failed 状态用细小状态点或 muted text 表达。
- close button 只出现在 hover 或 active tab 上。

### 8.2 首页

首页布局应是工具型而非展示型：

```text
New Terminal
[ + New terminal ] [ v ]

Recent paths
my-last-feedback       E:\Dev\my-last-feedback       Recent terminal
some-project           E:\Dev\some-project           Caller: Claude
another-project        E:\Dev\another-project        Active session
```

不需要大 hero、说明文案或装饰卡片。

### 8.3 Split Button 菜单

菜单内容：

- 最近使用路径。
- 当前 active session 路径。
- 最近 caller 路径。
- 后续可加 `Browse...`。

第一阶段可不做系统目录选择器，先从内部路径候选中选择。

## 9. 生命周期规则

### 9.1 创建

用户通过以下入口创建 terminal tab：

- 首页路径行。
- split button 主按钮。
- split button 菜单项。

创建流程：

```text
resolve cwd candidate -> terminal_create -> create tab -> set active -> record recent path
```

### 9.2 切换

切换 terminal tab：

- 不影响任何 PTY。
- active xterm view 切到目标 tab。
- 可从 store output buffer 重放当前 tab 最近输出。

### 9.3 关闭

关闭 terminal tab：

- 如果 running，调用 `terminal_kill`。
- 从 store 移除 tab。
- 选择相邻 tab 或回到 Home。

### 9.4 Dock 操作

以下行为不得 kill PTY：

- 折叠 terminal dock column。
- 切换到其他 dock tab。
- 移动 terminal dock tab 到其他 column。
- 切换 app view，只要应用进程仍在。

### 9.5 App 退出

第一阶段继续在 app 退出时 kill_all，避免孤儿进程。

远期如果要支持应用重启级持久化，需要单独设计 daemon 或 terminal multiplexer。

## 10. 与 OpenCode / Claude Code 的关系

用户已经安装并验证 OpenCode CLI：

- package: `opencode-ai@1.14.33`
- command: `opencode`

多标签终端为未来 Agent Console 打基础：

- 普通 terminal tab：运行 shell。
- Agent terminal tab：运行 `opencode`、`claude`、`copilot` 等 CLI。
- 后续可以加入 profile：
  - shell profile: `pwsh`, `cmd`, `bash`
  - agent profile: `opencode`, `claude code`
  - cwd profile: project/worktree path
  - MCP profile: 注入 MCP 配置

第一阶段不要把 terminal tab 强绑定 agent，但数据结构中应保留 `kind` 或后续可扩展字段。

## 11. 实施计划

### Phase 1：前端多 tab 与生命周期解耦

目标：dock 切换不再打断终端。

任务：

- 新增 `terminalStore.ts`。
- 新增 terminal tabs 数据结构。
- `TerminalPanel` 改为渲染 store 中的 tabs。
- 移除 `TerminalPanel` unmount 时自动 kill。
- close terminal tab 时才 kill。
- 增加基础 tab strip。

验收：

- 创建多个 terminal tabs。
- 切换 terminal tabs 不 kill 进程。
- 折叠 terminal dock column 后再打开，终端仍在。

### Phase 2：首页与路径候选

目标：用户主导 cwd。

任务：

- 新增 terminal home view。
- 生成 recent/caller/session/workspace path candidates。
- 点击路径创建 terminal tab。
- 记录 `lastUsedCwd` 和 recent paths。

验收：

- 没有 terminal tab 时显示首页。
- 点击 caller 路径可新建终端。
- 主 `+` 使用最近用户选择路径。

### Phase 3：Split Button

目标：高频创建终端更顺手。

任务：

- 新建 terminal split button。
- 主按钮：最近 cwd。
- 下拉：路径候选列表。
- 菜单项 click-to-create。

验收：

- `+` 可以直接创建。
- 下拉列表路径可用。
- 最近 cwd 逻辑可预测。

### Phase 4：后端 session list 与 output buffer

目标：WebView 重载后可恢复。

任务：

- 后端 session 增加 metadata。
- 后端保存 output ring buffer。
- 新增 `terminal_list`。
- 新增 `terminal_read_buffer`。
- 前端 `hydrateFromBackend`。

验收：

- 前端重载后可以看到后端仍运行的 terminal sessions。
- 最近输出可恢复。

### Phase 5：Agent Console 准备

目标：让 terminal workspace 可平滑升级为 agent console。

任务：

- 加 tab kind：`shell` / `agent`。
- 加 agent profile 结构。
- OpenCode quick launch。
- 预留 MCP/profile/worktree 字段。

验收：

- 可从路径候选直接启动普通 shell。
- 可从 agent profile 直接启动 `opencode`。

## 12. 风险与决策点

### 12.1 xterm 视图复用

每个 terminal tab 是否保留一个 xterm 实例？

选项：

- 每 tab 一个 xterm 实例：切换快，但内存更高。
- 只有 active tab 一个 xterm 实例：内存低，但需要重放 buffer。

第一阶段建议：每个 running tab 保留前端 buffer，active tab 使用一个 xterm renderer。实现更可控。

### 12.2 output buffer 大小

长期运行 agent 输出可能很多。

建议：

- 前端 buffer 限制为最近 5000 行或 1MB。
- 后端 ring buffer 同样限制。
- 后续需要完整 transcript 时另做日志落盘。

### 12.3 关闭 tab 的语义

关闭 tab 应该等于 kill terminal。

如果用户只是想隐藏，应使用 dock 折叠或切换 tab。这样语义清晰。

### 12.4 默认路径为空

当没有任何候选路径时，主 `+` 不应盲目开到进程 cwd。

建议：显示首页空状态，并提供后端 fallback 说明或后续 `Browse...`。

## 13. 推荐下一步

下一步应先实现 Phase 1 和 Phase 2 的最小闭环：

1. 建立 terminal store。
2. 终端生命周期从 `TerminalPanel` 中解耦。
3. 支持多 terminal tabs。
4. 支持首页路径列表。
5. 支持最近 cwd 直接新建。

这样可以最快解决“用户主导”和“UI 切换不断开”的核心问题，同时为 split button 和后端 session 恢复打好结构基础。
