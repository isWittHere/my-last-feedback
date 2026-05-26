---
title: MLFB近期迭代与工作区追踪修复摘要
description: 汇总本轮MLRA隐藏、Git/资源面板修复与工作区追踪解耦。
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
solved_lists:
  - 在禁用模式下隐藏MLRA入口并阻断MLRA监听
  - 修复Git面板按钮占位与提示、多语言与弹层越界问题
  - 为资源面板增加diff状态着色、状态圆点、ignored半透明展示
  - 解耦focusedComposer与workspace强制追踪并稳定workspace选择
---

# MLFB近期迭代与工作区追踪修复摘要

## 1. Previous Conversation
本轮对话从“像 disable-agent 一样在构建时隐藏 MLRA、并让 MLRA 不参与构建”开始，逐步扩展到一系列 UI 与交互细节修复。用户先后提出：
- `VITE_DISABLE_MLRA_UI=true` 时隐藏左上角 `MLFB/MLRA` 入口并显示 `My Last Feedback` 标题。
- 设置页顶栏增加主题切换按钮。
- Git 面板中 commit 附件按钮（paperclip）隐藏时占位问题、与文本重叠问题。
- Git commit hash 与 dot 颜色改为工作区色。
- diff popover 越界问题。
- Quick Backup 按钮 hover tip 不显示与多语言适配。
- 资源面板 diff 状态可视化（文本色 + 图标左下圆点，父目录继承）。
- gitignore 文件不应隐藏，应低透明显示，且子项继承低透明。
- 最后聚焦到“MLC/资源面板在聚焦反馈框时被强制追踪工作区”的旧问题分析与修复。

中间按用户要求完成了多次 git 备份提交，并在每阶段通过 interactive_feedback 反馈结果。

## 2. Current Work
当前已完成“工作区强制追踪”问题的两步修复：

1) **核心解耦（已提交）**
- 在 `feedbackStore.setFocusedComposer` 中移除对 `mlcActiveWorkspacePath` 的强制覆盖。
- 结果：聚焦输入框不再自动改写当前 workspace 选择。

2) **面板行为收口（已完成，待你确认后可继续提交）**
- `ProjectResourcePanel`：仅在 `workspaceFilterMode === "target"` 时才允许自动补齐 workspace；用户在 `workspace` 模式下不被抢回。
- `MlcSidePanel` 与 `ProjectResourcePanel`：新增 filter mode 本地持久化（记住 `target/workspace` 选择），减少重挂载默认回 target 的回跳感。

另外，本轮还完成了多个 UI/交互修复（见第4节文件清单）。

## 3. Key Technical Concepts
- Tauri + React + Zustand 状态架构。
- `focusedComposer` 与 `mlcActiveWorkspacePath` 的职责边界。
- Feature flag 方案：`VITE_DISABLE_AGENT_UI`、`VITE_DISABLE_MLRA_UI`。
- Dock 多面板共享 workspace 选择状态的副作用治理。
- Git diff 状态映射与目录状态上卷（file -> parent folders）。
- Tooltip 机制差异：`title` / `data-tooltip` / `data-native-title`。
- 资源树递归渲染中的“ignored 状态继承”模式。
- 视觉一致性：复用 Git 面板色卡（warning/success）到资源面板。

## 4. Relevant Files and Code
### `app/src/store/feedbackStore.ts`
- 关键修复：
```ts
setFocusedComposer: (focus) => {
  const normalizedFocus = normalizeFocusedComposer(focus);
  const current = get().focusedComposer;
  const sameTarget = current
    && current.callerId === normalizedFocus.callerId
    && current.sessionId === normalizedFocus.sessionId
    && sameWorkspacePath(current.projectDirectory, normalizedFocus.projectDirectory)
    && current.kind === normalizedFocus.kind;
  if (sameTarget) return;
  // Keep workspace selection independent from composer focus.
  set({ focusedComposer: normalizedFocus });
},
```
- 已提交 commit：`3557120`。

### `app/src/components/MlcSidePanel.tsx`
- 新增 workspace filter mode 持久化：
  - `const WORKSPACE_FILTER_MODE_STORAGE_KEY = "mlc-workspace-filter-mode"`
  - `useState` 从 localStorage 初始化 `target/workspace`
  - `useEffect` 持久化当前模式

### `app/src/components/ProjectResourcePanel.tsx`
- 多项改动：
  - workspace filter mode 持久化（`resource-workspace-filter-mode`）。
  - 仅 target 模式下自动补齐 active workspace。
  - 资源 diff 状态加载：调用 `git_diff`，状态映射 `added/modified`，并向父目录上卷。
  - 渲染 diff 文本 class 与图标状态圆点。
  - ignored 继承：父 ignored 目录下子项自动低透明。

### `app/src-tauri/src/project_resources.rs`
- `ProjectResourceEntry` 新增 `ignored: bool`。
- 由“命中 gitignore/fixed ignore 直接 continue”改为“保留条目并标记 ignored”。

### `app/src/index.css`
- 资源树样式：
  - `resource-tree-row-diff-added/modified` 文本色。
  - `resource-tree-icon-shell` + `resource-tree-diff-dot-*`。
  - `resource-tree-row-ignored` 低透明与 hover/focus 提升。
- Git commit 附件按钮显隐交互（展开宽度方案，避免常驻占位/文本重叠）。

### `app/src/components/GitPanel.tsx`
- Quick Backup hover tip 修复（`title` + `data-tooltip`）。
- 倒计时饼图 tooltip 多语言化（使用 `gitAction` i18n keys）。
- diff popover 定位防越界（初始估算 + 渲染后二次 clamp）。
- commit 列表注入工作区色变量并应用到 hash/dot（联动 CSS）。

### `app/src/components/SettingsDialog.tsx`
- 设置页顶栏右侧新增主题切换按钮（复用 `titlebar-btn` 风格与文案键）。

### `app/src/App.tsx` / `app/src/mlra/mlraUiFlags.ts` / `app/.env` / `scripts/package-win.sh`
- MLRA disabled build 相关：
  - `VITE_DISABLE_MLRA_UI=true`。
  - MLRA UI/监听按开关短路。
  - Windows 打包可移除 `mcp/mlra`。

## 5. Problem Solving
- **MLRA构建减负**：通过前端入口隐藏 + 监听禁用 + 打包剔除，实现“看不见且不参与”。
- **Git附件按钮占位链路**：先从绝对定位方案修到“收缩占位宽度方案”，避免占位与重叠两类问题。
- **Tooltip不显示**：定位到全局 tooltip provider 监听条件，改成 `title + data-tooltip` 兼容触发。
- **资源diff不生效**：定位到状态值不匹配（误按 `A/M`，实际是 `added/modified`），修正映射后生效。
- **ignored显示策略**：后端输出 ignored 标记 + 前端低透明并支持子项继承。
- **workspace强制追踪**：识别根因是 store 层强耦合，先解耦，再在面板层限制自动追踪条件并持久化用户模式。

## 6. Pending Tasks and Next Steps
- 已完成用户最新明确指令：`“继续修复”`（针对强制追踪问题已做两步）。
- 当前可执行下一步：
  1. 运行你本地手测路径（MLC/Resources 切到 workspace -> 聚焦反馈框）验证是否完全不回跳。
  2. 若行为符合预期，提交当前未提交改动（`MlcSidePanel.tsx`、`ProjectResourcePanel.tsx`）。
  3. 若仍有边界回跳，再检查 `DockColumn.tsx` 与 `CallerPanelParts.tsx` 中显式调用 `setMlcActiveWorkspacePath(...)` 的按钮交互链路。 

最近工作中断点（原话）：
> “继续修复”

对应我当时状态：
- 已完成并回报第二步修复；
- 当前工作区还有未提交变更：
  - `app/src/components/MlcSidePanel.tsx`
  - `app/src/components/ProjectResourcePanel.tsx`
