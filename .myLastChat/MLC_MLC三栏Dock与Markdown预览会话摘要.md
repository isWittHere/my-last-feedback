---
title: MLC三栏Dock与Markdown预览会话摘要
description: 汇总三栏Dock、MLC预览、列表交互与主题化实现
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
solved_lists:
  - 完成MLC logo本地化并用于面板图标
  - 完成三栏dock架构规划与实现
  - 完成MLC Markdown预览面板规划与实现
  - 抽取共享Markdown渲染与Heading导航
  - 完成MLC文档类型图标与主题色配置
  - 移除MLC列表和预览中的Open操作按钮
  - 统一MLC列表项与分组标题的hover行为
  - 单tab面板显示完整tab名称
---

# MLC三栏Dock与Markdown预览会话摘要

## 1. Previous Conversation

本轮会话围绕 `my-last-feedback` 桌面端 UI 与 MLC 知识库集成持续展开。

最初用户要求继续优化 UI，并明确提出需要学习 `ref-repos/my-last-chat` 中 MLC 的 logo，在合适位置使用；同时要求参考仓库未来不会放在源码中，因此需要将 logo 资源拷贝到本项目中使用。用户还特别强调：“顶栏的左右侧栏图标不要改！”

随后讨论从普通侧栏优化升级为通用面板系统。用户先要求将侧边面板顶栏改为图标 tab 栏，移除气泡与分割线，并允许通过右击 active tab 行展开菜单，将 tab 位置移动到底部。之后又加入项目资源管理器面板，用于浏览当前项目文件夹，并允许用户将文件或文件夹作为附件附加到聊天。

架构继续升级为三栏 dock 系统。用户提出：“我们规划了一个新的面板空间，它位于左侧栏紧挨着的右侧，相当于我们现在有了3个新面板列：左侧栏、右侧栏、左页面栏，而各tab面板都能被自由拖动到这3个栏内，栏也可是空栏。请你分析。”随后要求先写完整规划文档，并在后续开始执行计划。

三栏 dock 实现后，用户连续提出多轮交互细节修正：拖拽 ghost、目标高亮、左侧栏/左页面栏归一化、左页面按钮、顶栏按钮仅在对应栏有内容时显示、目标区域图标、顶栏按钮紧凑与状态背景、tab 点击切换、拖拽 cursor 状态等。这些都已经在 dock 系统中逐步处理。

之后用户提出新增 MLC Markdown 预览面板：“现在，我们讨论新增一个面板，它能在点选MLC中的列表项后渲染预览出其markdown内容。请你分析”。用户明确接受布局、页面功能与渲染方案，并要求“可直接使用agent消息的markdown渲染逻辑，主题色使用本app的青色主题色即可”。在此基础上先编写了规划文档，再进行实现。

最近的工作集中在 MLC 预览面板视觉与列表交互微调：文档类型图标和主题色跟随 MLC 文档类型；移除各处 Open 按钮；去掉 MLC 列表文本 hover 的划线与单独变色；将列表项与时间分组标题行 hover 调成资源管理器面板列表项风格；将 MLC 列表项未 hover 主文本色改为和预览正文文本色一致；最后用户要求：“当同一个面板内仅有一个tab时，显示该tab全名”。

## 2. Current Work

当前刚完成的工作是 dock tab 可读性与 MLC 列表视觉细节调整。

最近一条明确实现需求是：

> 当同一个面板内仅有一个tab时，显示该tab全名

已在 `DockColumn.tsx` 中根据 `column.tabIds.length === 1` 判断是否展示完整 tab 标签。单 tab 时 button 增加 `.full-label` 类，并渲染 `.mlc-panel-tab-label`；多 tab 时保持原来的紧凑图标样式与 hover tooltip。

最近几轮 UI 微调已完成：

- MLC 列表项标题默认色从偏亮混合色改为 `var(--color-text-secondary)`，与 Markdown 预览正文 `.prose` 的文本色一致。
- MLC 列表项 hover 使用资源管理器行风格：弱背景高亮、整体文本提升、不再使用边框强调。
- MLC 文档标题不再在文本自身 hover 时变主题色或加下划线。
- 时间分组标题行也使用同样的资源管理器式 hover，并且 `.mlc-group-count` 计数字段也在 hover/focus 时同步变为主文本色。
- MLC 列表项和预览面板顶部的 Open 操作按钮已移除。
- MLC 预览面板顶部文档类型图标、颜色、页面 accent 色已跟随 MLC 文档类型。

目前 diagnostics 已检查并通过的文件包括：

- `app/src/components/DockColumn.tsx`
- `app/src/components/MlcPreviewPanel.tsx`
- `app/src/components/MlcSidePanel.tsx`
- `app/src/components/mlcTypeConfig.ts`
- `app/src/index.css`

尚未运行完整构建。由于用户指令要求终端和测试前使用 interactive feedback 确认，本轮没有直接运行 `npm run build` 或其他终端命令。

## 3. Key Technical Concepts

- React + TypeScript + Vite frontend，主要代码位于 `app/src`。
- Tauri backend，Rust 命令位于 `app/src-tauri/src`。
- Zustand store 管理 caller/session/composer/dock layout/MLC selected document 状态。
- 三栏 dock 模型：`leftSidebar`、`leftPage`、`rightSidebar`。
- dock tab 模型：`mlc`、`resources`、`mlcPreview`。
- `DockColumn` 是通用 dock column 渲染器，负责 tab bar、拖拽、右键菜单、resize、drop target 与 tab 内容切换。
- MLC 文档列表在 `MlcSidePanel` 中渲染，支持搜索、类型筛选、收藏、排序、分组、选择与附件插入。
- MLC Markdown 预览在 `MlcPreviewPanel` 中渲染，读取选中文档并复用共享 Markdown 渲染逻辑。
- Markdown 渲染抽取到 `MarkdownContent`，复用 `react-markdown`、`remark-gfm`、`remark-breaks`、Prism 代码高亮、复制按钮与链接处理。
- Heading 小地图抽取到 `MarkdownHeadingNav`，同时供 `SummaryPanel` 和 `MlcPreviewPanel` 使用。
- 文档类型配置抽取到 `mlcTypeConfig.ts`，列表和预览共享图标、label 与 light/dark 颜色。
- CSS 主题变量：`--caller-color`、`--mlc-preview-accent`、`--color-text-secondary`、`--color-bg-elevated`、`--color-text-primary`。
- MLC 预览主题现在通过 inline CSS variables 将文档类型色注入页面。
- 工作流约束：不要直接运行终端/测试/报告类操作，需使用 interactive feedback；完成前必须再次调用 interactive feedback；不自动 commit。

## 4. Relevant Files and Code

### app/src/store/feedbackStore.ts

该文件是 dock layout、MLC 选择状态与附件状态的中心。

关键结构包括：

```ts
export type SidePanelTab = "mlc" | "resources" | "mlcPreview";

export interface SelectedMlcDocument {
  filePath: string;
  fileName: string;
  title: string;
  description: string;
  project: string;
  type: string;
  updatedAt: string;
  workspaceName: string;
  workspacePath: string;
  folderName?: string | null;
  folderPath?: string | null;
}
```

三栏 dock 相关约定：

```ts
DOCK_COLUMN_IDS = ["leftSidebar", "leftPage", "rightSidebar"]
KNOWN_DOCK_TABS = ["mlc", "resources", "mlcPreview"]
DEFAULT_DOCK_TABS = ["mlc", "mlcPreview", "resources"]
```

重要行为：

- `normalizeLeftDockColumns` 保证左页面栏不会成为左侧唯一占用列。
- `loadDockLayout` 对旧布局做去重、补默认 tab、同步 tabbar position。
- `openDockTab(tabId, preferredColumnId)` 用于打开或激活指定 tab。
- `setDockColumnTabBarPosition` 会同步所有 dock column 的 tabbar 顶部/底部位置。

### app/src/components/DockColumn.tsx

通用 dock column 组件。最近新增单 tab 全名显示逻辑。

关键逻辑：

```tsx
const showFullLabel = column.tabIds.length === 1;
```

单 tab 时：

```tsx
<button
  type="button"
  draggable={false}
  className={`mlc-panel-icon-tab${showFullLabel ? " full-label" : ""}${isActive ? " active" : ""}`}
>
  {dockTabIcon(tabId)}
  {showFullLabel ? <span className="mlc-panel-tab-label">{label}</span> : null}
  {!showFullLabel ? <span className="mlc-panel-tab-hover-tip" role="tooltip">{label}</span> : null}
</button>
```

该组件还负责：

- `mlc`、`resources`、`mlcPreview` 三类 tab 内容渲染。
- pointer drag 逻辑与 drag ghost 状态更新。
- drop target 检测：`getDockColumnIdAtPoint`。
- 右键菜单：移动 tab 到三栏、切换 tabbar top/bottom。
- resize handle。

### app/src/components/FeedbackApp.tsx

主应用 shell，已接入三栏 dock：

- 左侧栏 `leftSidebar`
- 左页面栏 `leftPage`
- 主 caller workspace
- 右侧栏 `rightSidebar`

顶栏 dock 按钮只在对应栏有内容时显示。左侧两列按钮使用紧凑分组。用户曾明确要求顶栏左右侧栏图标不要改，因此原 sidebar 图标保持，只为左页面栏新增 `page-sidebar` 图标。

### app/src/components/Icons.tsx

本地 SVG icon 集合。新增了 `page-sidebar`，同时保留原 `sidebar` 图标不变，遵守用户“顶栏的左右侧栏图标不要改”的要求。

### app/src/components/MlcSidePanel.tsx

MLC 文档列表面板。当前行为：

- 文档列表点击即设置 `selectedMlcDocument`。
- 点击文档时调用 `openDockTab("mlcPreview", "leftPage")` 打开/激活预览面板。
- 使用 `mlcTypeConfig.ts` 的共享类型配置渲染类型图标、label 与颜色。
- Open 按钮已移除。
- 仍保留删除、复制路径、收藏、附加到聊天操作。

关键选择逻辑：

```tsx
const handleSelectDocument = useCallback((document: MlcDocument) => {
  setSelectedMlcDocument(toSelectedDocument(document));
  openDockTab("mlcPreview", "leftPage");
}, [openDockTab, setSelectedMlcDocument]);
```

Open 按钮相关 `openPath` import、`handleOpen` 与 `.mlc-doc-action-open` button 已删除。

### app/src/components/MlcPreviewPanel.tsx

MLC Markdown 预览面板。当前行为：

- 从 store 读取 `selectedMlcDocument`。
- 通过 Tauri command `mlc_read_document` 读取 Markdown 正文。
- 空态展示 MLC logo 和提示。
- loading/error/content 三态渲染。
- 使用 `MarkdownContent` 渲染正文。
- 使用 `MarkdownHeadingNav` 显示 heading 导航。
- 顶部文档类型图标与颜色跟随文档类型。
- 预览页面 accent 色跟随文档类型。
- Open 按钮已移除，保留复制路径、附加到聊天、刷新。

类型主题关键逻辑：

```tsx
const typeConfig = getMlcTypeConfig(selectedDocument.type);
const typeColor = getMlcTypeColor(selectedDocument.type, isLightTheme) || "var(--color-primary)";
const typeLabel = getMlcTypeLabel(selectedDocument.type);

return (
  <div
    className="mlc-preview-panel"
    style={{ "--caller-color": typeColor, "--mlc-preview-accent": typeColor } as CSSProperties}
  >
    <div className="mlc-preview-kicker">
      <Icon name={typeConfig?.icon || "file-text"} size={13} color={typeColor} />
      <span>{typeLabel || t("mlcPreview.document", "Document")}</span>
    </div>
  </div>
);
```

### app/src/components/mlcTypeConfig.ts

新建的共享 MLC 类型配置。

用途：

- 避免 `MlcSidePanel` 与 `MlcPreviewPanel` 分别维护类型图标与颜色。
- light/dark 主题颜色按类型区分。

当前类型大致包括：

- `coding`：代码图标，蓝色
- `debug`：bug 图标，红色
- `planning`：checklist 图标，绿色
- `spec`：file-text 图标，紫色
- `knowledge`：book 图标，橙色

### app/src/components/MarkdownContent.tsx

从 `SummaryPanel` 中抽取出的共享 Markdown 渲染器。

负责：

- `react-markdown` 渲染。
- GFM 与换行支持。
- Prism 语法高亮。
- 代码块复制按钮。
- Markdown 链接处理：网页链接外部打开，本地路径通过 `openPath` 打开或按项目目录解析。

### app/src/components/MarkdownHeadingNav.tsx

从 `SummaryPanel` 中抽取出的 heading 导航组件。

负责：

- `parseMarkdownHeadings(markdown)` 解析 Markdown 标题。
- 忽略 fenced code block 中的伪标题。
- 支持 heading nav line 点击滚动。
- 被 `SummaryPanel` 和 `MlcPreviewPanel` 共用。

### app/src/components/SummaryPanel.tsx

已从内联 Markdown 实现迁移为：

```tsx
<MarkdownContent markdown={summary} projectDirectory={projectDirectory} />
<MarkdownHeadingNav headings={headings} scrollContainerRef={scrollRef} activeIndex={activeHeadingIdx} />
```

这使 agent 消息 Markdown 渲染逻辑可以被 MLC 预览复用。

### app/src-tauri/src/mlc.rs

后端 MLC 文档命令实现。

已新增 `mlc_read_document(file_path)`，用于预览面板读取 Markdown 内容。

安全边界：

- 文件必须位于 `.myLastChat` 存储中。
- 文件必须是 Markdown。
- 最大读取 2MB。
- `markdown_body(content)` 会去除 YAML frontmatter，只返回正文供预览渲染。

关键常量：

```rust
const MLC_PREVIEW_MAX_BYTES: u64 = 2 * 1024 * 1024;
```

### app/src-tauri/src/lib.rs

已注册 `mlc_read_document` Tauri command。

### app/src/index.css

本轮高频调整集中在 CSS。

MLC 预览主题：

```css
.mlc-preview-panel {
  --caller-color: var(--color-primary);
  --mlc-preview-accent: var(--color-primary);
}

.mlc-preview-header {
  box-shadow: inset 2px 0 0 var(--mlc-preview-accent);
  background: color-mix(in srgb, var(--mlc-preview-accent) 6%, transparent);
}

.mlc-preview-kicker {
  color: var(--mlc-preview-accent);
}
```

MLC 列表项 hover 与默认文本色：

```css
.mlc-doc-item:hover,
.mlc-doc-item:focus-within {
  background: color-mix(in srgb, var(--color-bg-elevated) 70%, transparent);
  color: var(--color-text-primary);
  border-color: transparent;
}

.mlc-doc-title {
  color: var(--color-text-secondary);
}

.mlc-doc-item:hover .mlc-doc-title,
.mlc-doc-item:focus-within .mlc-doc-title {
  color: var(--color-text-primary);
}
```

时间分组标题 hover：

```css
.mlc-group-header:hover,
.mlc-group-header:focus-visible {
  background: color-mix(in srgb, var(--color-bg-elevated) 70%, transparent);
  color: var(--color-text-primary);
}

.mlc-group-header:hover .mlc-group-count,
.mlc-group-header:focus-visible .mlc-group-count {
  color: var(--color-text-primary);
}
```

单 tab 全名：

```css
.mlc-panel-icon-tab.full-label {
  width: auto;
  max-width: 100%;
  gap: 6px;
  justify-content: flex-start;
  padding: 0 8px;
}

.mlc-panel-tab-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1;
}
```

## 5. Problem Solving

本轮解决了多个连续出现的 UI 与架构问题。

### 三栏 dock 架构问题

最初只有左右侧栏概念，后来用户提出左页面栏，使面板空间变为左侧栏、左页面栏、右侧栏三列。解决方案是将原侧栏状态升级为 dock layout，每列都能独立持有 tab、折叠、宽度、active tab 与 tabbar position。

### 拖拽交互不稳定

原生 HTML5 drag 在 button 上表现不够稳定，因此改成 pointer drag。实现拖拽 ghost、目标列检测、目标高亮与 drop 后移动 tab。

### 左侧栏与左页面栏语义问题

当左页面栏成为唯一左侧占用列时，视觉和语义都会混乱。通过 `normalizeLeftDockColumns` 将 leftPage 内容归并到 leftSidebar，避免 leftPage 成为唯一左列。

### 顶栏按钮与可见性问题

顶栏按钮最初在空栏时可能表现为无效操作。后来根据用户要求改为只有对应栏有内容时才显示按钮。左侧栏与左页面栏按钮使用紧凑分组，并增加 active/closed 视觉状态。

### tab 点击与拖拽冲突

pointer capture 后点击切 tab 曾经失效。通过 pointer up 中判断是否真正拖拽，非拖拽路径直接调用 `switchTab`，解决点击切换问题。

### MLC 预览需要复用 agent Markdown 渲染逻辑

原 agent 消息 Markdown 渲染逻辑在 `SummaryPanel` 中。为避免复制逻辑，抽取 `MarkdownContent` 和 `MarkdownHeadingNav`。这样 MLC 预览可复用同一套 Markdown、代码块、链接与 heading 导航实现。

### MLC 预览读取安全

预览需要读取本地 Markdown，但不能任意读文件。后端 `mlc_read_document` 限制为 `.myLastChat` 内 Markdown 且最大 2MB，并剥离 frontmatter。

### MLC 预览主题色需求

用户最初接受青色主题，之后要求顶部文档类型图标使用对应图标和颜色，页面主题色跟随类型色。解决方案是抽取 `mlcTypeConfig.ts`，在 `MlcPreviewPanel` 里根据 selected document type 设置 `--caller-color` 和 `--mlc-preview-accent`。

### Open 按钮与列表 hover 体验

用户认为各处 Open 按钮可移除。已删除 MLC 列表项和 MLC 预览头部的 Open 操作。用户还要求移除 MLC 列表文本 hover 上的划线和变色，并将列表项整体 hover 改为资源管理器面板列表项 hover 效果。随后补充时间分组标题行也要一致，并包括文本颜色变化。对应 CSS 已完成。

### 单 tab 可读性

用户最新要求单个面板内仅有一个 tab 时显示该 tab 全名。已在 `DockColumn` 中实现，单 tab 时显示完整文字，多 tab 时保持紧凑图标 tab。

## 6. Pending Tasks and Next Steps

目前没有用户明确要求但尚未执行的代码修改任务。最近一条用户原话是：

> 好的，现在请编写一个新会话摘要文档

本文件就是对该请求的执行结果。

仍需注意的后续事项：

- 完整构建尚未运行。若用户要求验证，需要先通过 interactive feedback 确认后再运行，例如 `npm run build`。
- 当前大量 dock、MLC 预览与 CSS 变更仍未提交。不要自动 commit，除非用户明确要求。
- 后续如继续 UI 微调，优先检查以下文件：
  - `app/src/components/DockColumn.tsx`
  - `app/src/components/MlcSidePanel.tsx`
  - `app/src/components/MlcPreviewPanel.tsx`
  - `app/src/components/mlcTypeConfig.ts`
  - `app/src/index.css`
- 后续如调整 MLC Markdown 渲染，优先修改共享组件而不是回到 `SummaryPanel` 或 `MlcPreviewPanel` 内复制逻辑：
  - `app/src/components/MarkdownContent.tsx`
  - `app/src/components/MarkdownHeadingNav.tsx`
- 后续如继续调整 MLC 文档类型颜色或图标，应只改 `mlcTypeConfig.ts`，以保持列表与预览一致。
- 后续如调整 dock 默认布局或持久化兼容，应优先检查 `feedbackStore.ts` 中的 layout normalization、default tabs 与 migration 逻辑。

建议下一步在用户确认后做一次完整前端构建或应用内视觉走查，重点查看：

- 单 tab 全名在窄栏是否 ellipsis 合理。
- 多 tab 模式是否仍保持紧凑 icon tab。
- MLC 列表项 hover、分组标题 hover 与资源管理器行 hover 是否一致。
- MLC 预览面板不同类型文档的 header、heading、heading nav、action hover 是否正确跟随类型色。
