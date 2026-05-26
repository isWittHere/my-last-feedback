---
title: Git面板实现与diff弹出面板
description: Git commit历史面板、changes badge、diff popover
workplace: E:\Dev\my-last-feedback
project: MLFB
type: coding
solved_lists:
  - GitPanel组件创建与Dock集成
  - 分支胶囊与countdown圆饼
  - changes badge与diff popover
  - Rust git_log/git_changes_count/git_diff命令
---

# Git面板实现与diff弹出面板

## 1. Previous Conversation

本对话始于在 MLFB 桌面应用中创建一个 Git 面板的需求。整个开发过程分为多个迭代：

1. **基础面板创建**：在 Dock 系统中注册 `"git"` tab，创建 `GitPanel.tsx` 组件和 Rust 后端 `git_log` 命令
2. **UI 样式调优**：hash 字体设为 monospace、顶栏对齐 TerminalPanel、hover tooltip 位置根据 `data-position` 自动适配、分支徽章恢复胶囊样式
3. **MLC 工作区同步**：Git 面板读取 `mlcActiveWorkspacePath` 与 MLC 面板共享工作区
4. **Countdown 圆饼**：添加 timed git reminder 进度圆饼，颜色使用工作区主题色（`resolveWorkspaceIdentity`），位于胶囊内替换 git-branch 图标
5. **删除 chevron 箭头**：先改为 hover 显示，后应要求完全移除
6. **Changes 计数**：添加 `git_changes_count` Rust 命令，在胶囊右侧显示 warning 色徽章
7. **Diff 弹出面板**：在 changes badge 上添加 hover 触发的 diff popover，使用 `AgentDiffPatchList` 渲染 diff

## 2. Current Work

当前正在解决 diff popover 被面板容器裁剪的问题。已实现：

- **Rust 后端**：`git_diff` 命令解析 `git diff --no-color` 输出为结构化 `GitDiffFile[]`（path/status/patch/additions/deletions）
- **前端 popover**：hover changes badge 时触发 `fetchDiff`，使用 `AgentDiffPatchList` 渲染文件 diff 列表
- **定位方式**：最初使用 CSS `position: absolute` + `:hover` 显示，但因面板容器 `overflow` 导致 popover 被裁剪

**当前正在解决的问题**：将 popover 改为 `position: fixed`，通过 JS 计算 badge 在 viewport 中的坐标来定位，类似于 commit tooltip 的实现方式。

**当前的构建错误**：TypeScript 编译错误 `TS2448` — `showDiffPopover` 引用了 `fetchDiff`，但 `fetchDiff` 在其后才声明。

## 3. Key Technical Concepts

- **DockTabId 类型**：`SidePanelTab = "mlc" | "resources" | "mlcPreview" | "previewBrowser" | "previewInfo" | "agentConsole" | "agentSessions" | "terminal" | "git"`
- **Rust Tauri 命令模式**：`async fn` + `Result<_, String>` + `map_err(|e| e.to_string())`
- **git diff 解析**：根据 `diff --git` 行分割文件，根据 `+`/`-` 前缀计数增减行，处理 `new file mode`/`deleted file mode`
- **AgentDiffPatchList**：可复用的 diff 渲染组件，接受 `AgentUiDiffFile[]`（path/patch/additions/deletions/status）
- **resolveWorkspaceIdentity**：根据工作区路径 + caller 颜色候选解析出确定性 HSL 颜色
- **固定定位 popover**：使用 `position: fixed` + `z-index: 9999` 避免被父容器裁剪，通过 `getBoundingClientRect()` 计算坐标
- **hover 延迟隐藏**：使用 `diffHideTimerRef` 做 200ms 延迟关闭，允许鼠标移入 popover

## 4. Relevant Files and Code

### `app/src-tauri/src/git.rs`
完整的 git 后端命令：
- `git_log` — 获取当前分支和最近50条提交
- `git_changes_count` — `git status --porcelain` 按行计数
- `git_diff` — 解析 `git diff --no-color` 输出为 `Vec<GitDiffFile>`

关键结构：
```rust
pub struct GitDiffFile {
    pub path: String,
    pub status: String,
    pub patch: String,
    pub additions: usize,
    pub deletions: usize,
}
```

### `app/src/components/GitPanel.tsx`
主要 Git 面板组件。当前构建错误的上下文：
```typescript
// 需要将 positionDiffPopover/showDiffPopover/hideDiffPopover 
// 移到 fetchDiff 之后，因为 showDiffPopover 调用了 fetchDiff
```

### `app/src/index.css`
涉及 CSS 区块（行号约 15365-15550）：
- `.git-branch-capsule` — 分支胶囊
- `.git-countdown-pie` — 12px conic-gradient 圆饼
- `.git-changes-badge` — warning 色计数徽章
- `.git-diff-indicator-wrap` / `.git-diff-popover` — popover 容器（已改为 fixed 定位）
- `.git-commit-*` — 提交列表样式

### `app/src/components/agent/AgentDiffViewer.tsx`
`AgentDiffPatchList` 和 `AgentUiDiffFile` 类型定义，被 Git 面板直接导入使用。

### `app/src-tauri/src/lib.rs`
注册 git 命令：
```rust
git::git_log,
git::git_changes_count,
git::git_diff,
```

## 5. Problem Solving

| 问题 | 解决方案 |
|------|----------|
| PVS hash 字体需等宽 | 添加 `font-family` monospace 栈 |
| Tooltip 被面板裁剪/定位不对 | 使用 `position: fixed` + `getBoundingClientRect` 计算坐标 |
| 分支徽章样式 | 恢复 capsule（`border-radius: 999px`） |
| Countdown 颜色 | 使用 `resolveWorkspaceIdentity({ workspacePath, candidates })` |
| Diff popover 被面板容器裁剪 | **当前正在解决**：从 `position: absolute` + CSS `:hover` 改为 `position: fixed` + JS 状态管理 |
| `showDiffPopover` 引用 `fetchDiff` 声明前 | **当前构建错误**：需要将 popover 相关函数移到 `fetchDiff` 之后 |

## 6. Pending Tasks and Next Steps

1. **修复构建错误 TS2448**：将 `positionDiffPopover`/`showDiffPopover`/`hideDiffPopover` 三个函数移到 `fetchDiff` 和 `fetchChangesCount` 之后，确保 `showDiffPopover` 在 `fetchDiff` 声明后才引用它。

2. **验证 fixed popover 效果**：构建通过后测试 popover 是否还被面板容器裁剪，需确认 `z-index: 9999` 和 `position: fixed` 有效。

3. **后续可能的改进**：
   - 自动刷新 changes 计数（目前仅初始加载和手动刷新）
   - 支持 staged changes（`git diff --cached`）
   - 在 popover 中点击文件直接打开 diff
