---
title: MLFB OpenCode弹窗修复与Caller顶栏v0.5.5发行摘要
description: OpenCode弹窗、Caller顶栏、Git按钮与0.5.5发行摘要
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
solved_lists:
  - 分析并修复Windows发行版新建OpenCode agent弹出命令窗口
  - 解释发行版与测试版会话列表不同的原因
  - 改进Git定时ready状态下的Git操作按钮active主题
  - 将Caller顶栏布局列数与排序按钮迁移到caller头像行两侧
  - 统一并精简布局列数浮层和MLFB导航右键浮层样式
  - 将项目版本升级到0.5.5并构建Windows x64发行包
---

# MLFB OpenCode弹窗修复与Caller顶栏v0.5.5发行摘要

## 1. Previous Conversation

本轮会话从用户要求分析发行版本中的两个异常开始：一是新建 OpenCode agent 时会弹出一个命令窗口，二是发行版本的会话列表和测试版本的列表不同。经过代码定位后确认，OpenCode agent 的后台进程由 Tauri Rust 后端通过 `std::process::Command` 启动，主程序虽然在 release 使用了 `windows_subsystem = "windows"` 隐藏自身控制台，但这不会自动隐藏子进程控制台窗口。因此 Windows GUI 程序在启动 `opencode serve` 等控制台子进程时仍可能弹出黑色命令窗口。

会话列表差异被解释为两套机制共同造成：MLFB 主会话历史在 debug 和 release 模式下使用不同 app data 目录；OpenCode agent 会话列表则来自 OpenCode 自己的 HTTP `/session` 数据源，并按 workspace directory 过滤。因此发行版和测试版列表不同并不一定是同一个 bug，而是存储目录与外部 OpenCode 会话源不同导致的预期差异。

随后用户要求先详细解释弹窗修复方案，再确认“直接实现修复”。已在 Rust 后端启动子进程时为 Windows 添加 `CREATE_NO_WINDOW` creation flag，以保留 stdout/stderr 管道捕获，同时避免 release GUI 程序启动控制台子进程时出现窗口。

之后会话进入 UI 细节迭代。用户先要求分析并实现 Git 操作按钮：当 Git 定时 reminder 已 ready 且 Git 操作按钮处于 active/open 状态时，按钮主题应变成和计时边框相同的黄色。实现后用户指出“正常 active 状态不显示计时边框”，于是规则被修正为：非 active 时显示计时边框；active 时不显示计时边框，只通过按钮填充色表达状态。未 ready 的 active 使用 callerColor，ready 的 active 使用 `var(--color-git-countdown)`。

随后用户要求改进顶栏 caller 布局列数面板，使其改为和设置面板一样的图案样式，并且不受 MLFB 导航栏、Agent 面板导航栏、会话列表面板顶栏遮挡。同时，原本 MLFB 导航栏右键弹出面板也要改为最新设置页面相同的样式。经过实现后，用户继续多轮微调：移除浮层宽 padding、移除 layout 按钮原生 hover tooltip、把排序按钮放到 caller 头像行左侧、把布局列数按钮放到 caller 头像行右侧；再移除浮层多余外层容器；使按钮尺寸和 caller 头像一致；降低图案透明度；只有 hover 顶栏时显示这两个按钮；将列数面板水平居中于按钮下；排序图标先试过方块、箭头，最后换回原本 `sort` icon；列控制图标也最终换回原本 SVG 图标，并且按钮与面板都改。

最后用户提出发布流程要求：“好的，现在请你帮忙升级到0.5.5，然后打包新发行包，之后编写新的会话摘要（ /compact  ）。然后git提交”。本摘要即为该 `/compact` 输出的一部分。

## 2. Current Work

当前工作是完成 v0.5.5 发布前的收尾。版本号已经从 `0.5.1` 同步升级到 `0.5.5`，并运行 Windows 打包脚本成功生成新发行包。

已同步版本字段的文件包括：

- `package.json`
- `package-lock.json`
- `app/package.json`
- `app/package-lock.json`
- `app/src-tauri/Cargo.toml`
- `app/src-tauri/Cargo.lock`
- `app/src-tauri/tauri.conf.json`

打包命令为：

```bash
bash scripts/package-win.sh
```

构建结果显示：

```text
Version : v0.5.5
Output  : /e/Dev/my-last-feedback/dist/win-x64/my-last-feedback
Archive : /e/Dev/my-last-feedback/dist/win-x64/my-last-feedback-v0.5.5-win-x64.zip
```

构建过程中 `npm run build` 与 Tauri release build 均成功。Vite 输出了既有的大 chunk 警告和动态/静态 import 混用警告，但未阻断构建。Rust release 编译成功，生成 `app/src-tauri/target/release/app.exe`。发行目录总大小约 38M，zip 约 12M。

## 3. Key Technical Concepts

- Tauri 2 release 子进程管理：`windows_subsystem = "windows"` 只影响主进程，不自动隐藏 Windows 控制台子进程。
- Windows Rust 子进程隐藏控制台：通过 `std::os::windows::process::CommandExt` 和 `CREATE_NO_WINDOW` 设置 creation flags。
- OpenCode HTTP runtime：前端通过 Tauri invoke 调用后端 `agent_process_start`，后端启动 `opencode serve`，前端再通过 HTTP client 查询 `/session`。
- Debug/release 会话目录差异：`app/src-tauri/src/lib.rs` 中 debug 使用 `my-last-feedback-dev`，release 使用 `my-last-feedback`。
- Zustand store 与 React UI：Caller、session、dock、Git reminder 等状态来自 `useFeedbackStore` 和本地 settings 模块。
- Git timed reminder UI：`getTimedGitReminderProgress()` 提供 `enabled`、`ready`、`progress`、`minutesUntil`，UI 使用 `--git-countdown-*` CSS 变量表现计时边框。
- React Portal 浮层：顶栏 layout 面板从 titlebar 内部绝对定位改为 `createPortal(..., document.body)` 和 fixed 定位，避免被局部层叠上下文遮挡。
- 设置页 segmented 样式：`SettingsSegmentedControl` 与 `.settings-segmented-control` 系列样式被用于布局列数面板和会话导航右键面板。
- 发行版本同步规则：版本升级必须保持 `package.json`、`app/package.json`、Tauri/Rust 配置与锁文件一致。
- Git 操作黑名单：提交和备份时必须排除 `ref-repos/`，该目录存放参考仓库，不应进入版本控制。

## 4. Relevant Files and Code

### app/src-tauri/src/agent_process.rs

该文件负责管理后台 agent 子进程。为修复 Windows release 新建 OpenCode agent 弹出命令窗口的问题，新增了 Windows-only import 和 flag：

```rust
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
```

并在 `agent_process_start()` 中 `spawn()` 前设置：

```rust
#[cfg(target_os = "windows")]
command.creation_flags(CREATE_NO_WINDOW);
```

该改动保留子进程 stdout/stderr/stdin 管道，不改变 OpenCode server runtime 的通信方式，只隐藏 Windows 控制台窗口。

### app/src-tauri/src/lib.rs

该文件未改，但用于解释 release/test 会话列表差异。关键逻辑是 debug/release 使用不同 app data 目录：

```rust
#[cfg(debug_assertions)]
let app_dir_name = "my-last-feedback-dev";
#[cfg(not(debug_assertions))]
let app_dir_name = "my-last-feedback";
```

### app/src/agent/opencode/serverRuntime.ts

该文件未改，但它是 OpenCode server runtime 启动链路的前端入口。`startOpenCodeServerRuntime()` 通过 Tauri invoke 调用后端 `agent_process_start`，启动 `opencode serve --hostname ... --port ...`。

### app/src/agent/opencode/httpClient.ts

该文件未改，但用于解释 OpenCode agent sessions 来源。`listSessions()` 请求 `/session`：

```ts
listSessions(): Promise<OpenCodeSessionInfo[]> {
  return this.request("/session");
}
```

因此 OpenCode agent 会话列表由 OpenCode 自身数据源决定，而不是 MLFB 的主 history 文件。

### app/src/components/CallerPanelParts.tsx

该文件用于主 feedback composer 的附件按钮行和 Git 操作按钮。已调整 Git 操作按钮的 ready + active 行为。

最终规则：

- `showGitCountdownBorder = gitReminderProgress?.enabled === true && !showGitPanel`
- 非 active 且定时启用时显示计时边框
- 非 active 且 ready 时显示满圈黄色计时边框
- active 时不显示计时边框
- active 且 ready 时按钮主体使用 `var(--color-git-countdown)` 黄色主题
- active 未 ready 时按钮主体仍使用 callerColor

关键变量包括：

```ts
const isGitReminderReady = gitReminderProgress?.ready === true;
const useGitReadyActiveTheme = showGitPanel && isGitReminderReady;
const showGitCountdownBorder = gitReminderProgress?.enabled === true && !showGitPanel;
const gitActiveBackground = useGitReadyActiveTheme ? "var(--color-git-countdown)" : callerColor;
```

### app/src/components/FeedbackApp.tsx

该文件是本轮 Caller 顶栏改造的主要文件。修改点包括：

- 引入 `createPortal` 和 `SettingsSegmentedControl`。
- 在 caller 头像行中新增 `caller-tabs-toolbar`，结构为：排序按钮 + `CallerTabs` + `LayoutModeButton`。
- 从右侧 titlebar controls 区域移除排序按钮和 layout 按钮。
- `LayoutModeButton` 的 hover 面板通过 Portal 渲染到 `document.body`，使用 fixed 坐标，避免被顶栏或侧栏遮挡。
- layout 面板定位改为相对按钮水平居中：

```ts
left: Math.min(
  Math.max(8, rect.left + rect.width / 2 - dropdownWidth / 2),
  Math.max(8, window.innerWidth - dropdownWidth - 8)
)
```

- `LayoutModeButton` 主按钮移除 `title`，保留 `aria-label`，避免原生 hover tooltip。
- 排序按钮最终恢复原本 `Icon name="sort"` 图标，并保持 `rotate(-90deg)`。
- 列控制按钮和面板选项最终恢复原本 SVG 图标：auto 为方框内 `A`，1/2/3 为方框内列分隔线。

当前排序图标组件：

```tsx
function CallerSortModeIcon() {
  return (
    <span className="caller-sort-icon" aria-hidden="true">
      <Icon name="sort" size={13} style={{ transform: "rotate(-90deg)" }} />
    </span>
  );
}
```

### app/src/components/Sidebar.tsx

该文件中 MLFB 会话导航右键模式面板已从旧的 `cm-column-mode-group` 改为 `SettingsSegmentedControl`，继续使用 `SessionNavigationModeIcon` 表现不同 session navigation mode。

关键结构：

```tsx
<SettingsSegmentedControl
  ariaLabel={t("settings.sessionNavigationMode", "Navigation display mode")}
  value={mode}
  onChange={(value) => selectMode(value as SessionListMode)}
  className="settings-segmented-icon-only settings-segmented-visual-options settings-session-nav-options"
  options={SESSION_LIST_MODE_OPTIONS.map((option) => ({
    id: option.mode,
    label: t(option.labelKey, option.defaultLabel),
    icon: <SessionNavigationModeIcon mode={option.mode} />,
    ariaLabel: `${t("settings.sessionNavigationMode", "Navigation display mode")}: ${t(option.labelKey, option.defaultLabel)}`,
  }))}
/>
```

### app/src/index.css

该文件承载大量 UI 样式，本轮主要改动：

- `.layout-dropdown` 和 `.session-mode-menu` 外层只负责定位：无 padding、无 border、无 background，避免双层容器。
- 阴影和 blur 放到内部 `.settings-segmented-control` 上，只保留一层可见边框。
- 新增 `.caller-tabs-toolbar` 和 `.caller-tabs-side-btn`，使排序与列数按钮夹在 caller 头像行两侧。
- `.caller-tabs-side-btn` 默认 `opacity: 0` 和 `pointer-events: none`；当 `.titlebar:hover` 或 `.titlebar:focus-within` 时显示。
- `.caller-sort-icon` 和 `.caller-layout-icon` 在 idle 状态降低透明度，hover/focus 时恢复清晰。

关键样式：

```css
.caller-tabs-side-btn {
  width: 24px;
  height: 24px;
  border-radius: 5px;
  flex: 0 0 auto;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease, background 0.12s, color 0.12s;
}
.titlebar:hover .caller-tabs-side-btn,
.titlebar:focus-within .caller-tabs-side-btn {
  opacity: 1;
  pointer-events: auto;
}
```

VS Code CSS diagnostics 当前仍会报告文件开头已有 `@theme` at-rule unknown，该诊断位于第 3 行，属于工具对 Tailwind/CSS at-rule 的识别问题，和本轮新增样式无关。发行构建已通过。

### package.json / app/package.json / app/src-tauri/Cargo.toml / app/src-tauri/tauri.conf.json

这些文件已同步到 `0.5.5`。锁文件 `package-lock.json`、`app/package-lock.json`、`app/src-tauri/Cargo.lock` 中本项目 package version 也同步到 `0.5.5`。

### scripts/package-win.sh

该脚本用于 Windows x64 发行包构建。本轮未修改脚本，但已用它完成 v0.5.5 打包。脚本读取根 `package.json` version，生成：

```text
dist/win-x64/my-last-feedback-v0.5.5-win-x64.zip
```

## 5. Problem Solving

### OpenCode release 弹窗问题

问题根因是 Windows GUI release 主程序隐藏控制台并不等于子进程也隐藏控制台。`opencode serve` 作为控制台子进程被启动时会创建自己的命令窗口。修复是在后端统一的 agent process 启动层设置 `CREATE_NO_WINDOW`。这样未来由该路径启动的控制台子进程也会受益。

### Release 与测试会话列表不同

该问题被拆成两个数据源解释：MLFB 主会话历史按 debug/release app data 目录分离；OpenCode agent sessions 来自 OpenCode 自身 session API，并按 workspace directory 过滤。两者不同步是正常的架构结果，而不是单纯 UI bug。

### Git ready + active 按钮主题

初始实现让 ready + active 时按钮主体变黄，但仍保留了计时边框。用户指出 active 状态不应显示计时边框，于是逻辑被修正为 active 时不应用 `git-action-countdown-btn` class，避免 conic background；只通过 active fill 表达状态。

### Caller 顶栏工具按钮视觉权重

多轮尝试后形成当前设计：平时不显示两侧按钮，只有 hover 顶栏时出现；按钮尺寸与 caller 头像一致；排序和列控制图标都回归原本 titlebar icon 语言，降低视觉干扰；layout 弹层居中于按钮下方。

### 浮层遮挡与双层容器

layout dropdown 改为 Portal + fixed + 高 z-index，避免被 MLFB 导航栏、Agent 面板导航栏、会话列表顶栏等遮挡。随后外层视觉容器被移除，只留下内部 segmented 控件的一层边框，避免宽 padding 和双层边框观感。

### v0.5.5 打包

版本升级后运行 `bash scripts/package-win.sh` 成功。构建输出包含 Vite 大 chunk warning，但 release build 成功，发行 zip 已生成。

## 6. Pending Tasks and Next Steps

当前用户最近的明确要求是：

> 好的，现在请你帮忙升级到0.5.5，然后打包新发行包，之后编写新的会话摘要（ /compact  ）。然后git提交

已完成：

- 升级到 `0.5.5`
- 打包 Windows x64 新发行包
- 创建本会话摘要文件

下一步仍需完成：

- 按 Git Action 要求执行 `git status --short`
- 不提交 `ref-repos/`
- 避免提交 `app/src-tauri/target/` 等构建输出
- 根据实际 git status 显式 `git add -- <files>`
- 执行一次 git commit，提交本轮 v0.5.5 发布改动与会话摘要

建议提交信息：

```text
chore: release v0.5.5
```
