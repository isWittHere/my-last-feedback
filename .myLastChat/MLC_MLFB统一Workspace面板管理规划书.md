---
title: MLFB统一Workspace面板管理规划书
description: 统一主区与Dock面板的架构规划
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - UI架构
  - Dock
  - Workspace
  - Panel管理
solved_lists:
  - 分析现有五区域与Dock系统边界
  - 设计统一Panel Registry与Main Slot方案
  - 拆分渐进式实施阶段和验收标准
---

# MLFB 统一 Workspace 面板管理规划书

更新时间：2026年5月10日

## 1. 背景

当前 MLFB 桌面端已经从单一反馈窗口演进为多功能工作台，核心能力包括：

- MLFB 反馈会话工作区
- MLRA 多角色编排工作区
- My Last Chat 文档面板
- MLC Preview 预览面板
- Project Resources 面板
- Preview Browser 内嵌浏览器
- Preview Info 信息面板
- Agent Console
- Agent Sessions
- Terminal

从用户视角看，应用已经具有明显的 IDE / 工作台属性。但当前布局模型仍然存在一个不对称点：外围面板已经可以 dock、拖动、折叠、持久化，而中央页面区域始终是 MLFB 或 MLRA 的顶层切换结果，不能作为普通面板参与统一管理。

因此，本规划的目标是：把当前“五区域布局”升级为统一的 Workspace Panel Manager，使主区、页边栏、侧栏都由同一套面板注册、分配、渲染和持久化机制管理。

## 2. 当前代码现状

### 2.1 主入口

当前 `app/src/components/FeedbackApp.tsx` 负责整体 UI：

- 顶部 titlebar 中维护 `appView: "MLFB" | "MLRA"`
- `appView === "MLFB"` 时渲染 dock columns + `caller-workspace`
- `appView === "MLRA"` 时直接渲染 `MLRAView`
- titlebar 内部按钮、tabs、二级控制条都根据 `appView` 条件渲染

当前主体结构大致为：

```tsx
{appView === "MLRA" ? (
  <MLRAView />
) : (
  <>
    <DockColumn columnId="leftSidebar" />
    <DockColumn columnId="leftPage" />
    <div className="caller-workspace">...</div>
    <DockColumn columnId="rightPage" />
    <DockColumn columnId="rightSidebar" />
  </>
)}
```

这说明中央区并不是一个 dock slot，而是 `FeedbackApp` 内部的固定分支。

### 2.2 当前 Dock 系统

当前 dock 状态定义在 `app/src/store/feedbackStore.ts`：

```ts
export type DockColumnId = "leftSidebar" | "leftPage" | "rightPage" | "rightSidebar";
export type SidePanelTab = "mlc" | "resources" | "mlcPreview" | "previewBrowser" | "previewInfo" | "agentConsole" | "agentSessions" | "terminal";
export type DockTabId = SidePanelTab;
```

对应能力：

- `DockColumnState.tabIds`
- `DockColumnState.activeTabId`
- `DockColumnState.width`
- `DockColumnState.tabBarPosition`
- `DockColumnState.collapsed`
- `moveDockTabToColumn`
- `openDockTab`
- `setDockActiveTab`
- `setDockColumnWidth`
- `setDockColumnCollapsed`
- localStorage 持久化：`mlfb-dock-layout-v1`

当前已经具备很好的渐进式基础，不需要推倒重来。

### 2.3 当前 Dock 内容映射

`app/src/components/DockColumn.tsx` 内部通过 `DockTabContent` 硬编码面板渲染：

```tsx
if (tabId === "mlc") return <MlcSidePanel />;
if (tabId === "resources") return <ProjectResourcePanel />;
if (tabId === "mlcPreview") return <MlcPreviewPanel />;
if (tabId === "previewBrowser") return <PreviewBrowserViewPanel />;
if (tabId === "previewInfo") return <PreviewBrowserInfoPanel />;
if (tabId === "agentConsole") return <AgentConsolePanel />;
if (tabId === "agentSessions") return <AgentSessionManagerPanel />;
if (tabId === "terminal") return <TerminalPanel />;
```

这说明“面板”概念已经存在，但还没有抽象成独立 registry。

### 2.4 设置页

当前 `app/src/components/SettingsDialog.tsx` 的布局管理只覆盖四个 dock columns：

- Left sidebar
- Left page
- Right page
- Right sidebar

设置页文案是“Drag panel tabs into the dock columns where they should appear.”，没有主工作区槽位。

### 2.5 MLFB 内部布局

`CallerPanel` 本身也有局部布局：

- 左/上 session navigation
- summary panel
- input/composer panel
- queued draft 区域
- 内部上下 resize
- 多 caller column 模式

这部分是 MLFB workspace 的内部布局，不应在第一阶段拆入全局 panel manager。

### 2.6 MLRA 内部布局

`MLRAView` 也有自己的内部结构：

- launcher home
- runtime shell
- human gate panel
- agent role columns

这部分应先作为一个完整 panel 注册为 `mlraWorkspace`，不要过早拆成全局 agent panels。

## 3. 问题定义

### 3.1 中央区不是一等公民

当前外围面板可被移动、折叠、持久化；中央区不可被分配、不可被替换、不可被拖入其他区域。

这导致：

- Agent Console 不能成为主工作区
- Terminal 不能作为中央焦点工作区
- MLRA 只能是全局 app view，而不是 workspace tab
- MLFB 固定占据中央，缺少灵活度

### 3.2 顶层视图和面板视图概念分裂

当前存在两套概念：

- `appView`: MLFB / MLRA
- `DockTabId`: MLC / Resources / Preview / Agent / Terminal

前者控制整个页面，后者只控制外围 dock。随着产品复杂度提升，这种分裂会让后续功能越来越难放置。

### 3.3 面板元数据散落

标题、图标、渲染、默认位置在多个文件重复出现：

- `DockColumn.tsx`
- `FeedbackApp.tsx`
- `SettingsDialog.tsx`
- i18n 文件

新增一个面板需要改多处，容易遗漏。

### 3.4 布局状态表达能力不足

当前 layout 是固定四列：

```ts
columns: Record<DockColumnId, DockColumnState>
```

它不能表达：

- 主区 tabs
- 主区 split
- panel 可否进入 main
- panel 可否关闭
- panel 的默认 slot
- panel 的最小/最大尺寸
- workspace preset

### 3.5 用户心智不统一

用户现在看到的是“有些东西是面板，有些东西是页面”。更现代的工作台心智应该是：所有东西都是 workspace panel，只是默认位置和能力不同。

## 4. 目标

### 4.1 产品目标

让 MLFB 从“固定反馈窗口”升级为“可组合 AI 工作台”。

目标体验：

- MLFB 仍然默认在中央，但不再是不可替换的中央页面
- MLRA 可以成为中央主 tab
- Agent Console 可以拖到中央成为主要工作区
- Terminal 可以临时放到中央聚焦执行
- MLC、Preview、Resources 可在侧栏、页边栏、主区之间自由分配
- 设置页能管理五个区域，而不是只管理四个外围列
- 布局可恢复、可重置、可迁移

### 4.2 工程目标

- 不推翻现有 dock 系统
- 尽量复用 `DockColumn` 的 tab、拖动、折叠、宽度、持久化能力
- 引入 `PanelRegistry`，减少面板元数据重复
- 用版本化 migration 从 `mlfb-dock-layout-v1` 平滑迁移
- 保持 MLFB 与 MLRA 内部布局稳定
- 分阶段上线，每阶段都能独立验收

### 4.3 非目标

第一阶段不做以下事项：

- 不引入 GoldenLayout、React Mosaic 等重型布局库
- 不实现复杂无限嵌套 split tree
- 不拆分 `CallerPanel` 内部 summary/input 为全局 panel
- 不拆分 `MLRAView` 的 AgentColumn 为全局 panel
- 不改变后端 IPC 协议
- 不改变 MCP tool 请求/响应结构

## 5. 统一模型设计

### 5.1 PanelId

新增统一面板 ID：

```ts
export type WorkspacePanelId =
  | "mlfbWorkspace"
  | "mlraWorkspace"
  | "mlc"
  | "mlcPreview"
  | "resources"
  | "previewBrowser"
  | "previewInfo"
  | "agentConsole"
  | "agentSessions"
  | "terminal";
```

短期内可以让 `DockTabId` alias 到 `WorkspacePanelId` 的子集，避免一次性改动过大。

### 5.2 PanelDescriptor

新增面板注册描述：

```ts
export interface WorkspacePanelDescriptor {
  id: WorkspacePanelId;
  titleKey: string;
  defaultTitle: string;
  iconName?: string;
  logo?: "mlc";
  defaultSlot: WorkspaceSlotId;
  allowedSlots: WorkspaceSlotId[];
  minWidth?: number;
  maxWidth?: number;
  singleton: boolean;
  closeable: boolean;
  canCollapse: boolean;
  category: "workspace" | "knowledge" | "preview" | "agent" | "terminal" | "resource";
}
```

### 5.3 WorkspaceSlotId

把当前四个 dock columns 扩展为五个 slot：

```ts
export type WorkspaceSlotId =
  | "leftSidebar"
  | "leftPage"
  | "main"
  | "rightPage"
  | "rightSidebar";
```

含义：

- `leftSidebar`: 窄侧栏/辅助信息
- `leftPage`: 左页级面板，适合 MLC preview、资源、上下文
- `main`: 主工作区，适合 MLFB、MLRA、Agent Console、Terminal、Preview Browser
- `rightPage`: 右页级面板，适合 Agent Console、Terminal、Preview
- `rightSidebar`: 辅助侧栏，适合 MLC、Info、Resources

### 5.4 WorkspaceSlotState

第一阶段使用与现有 `DockColumnState` 接近的数据结构：

```ts
export interface WorkspaceSlotState {
  panelIds: WorkspacePanelId[];
  activePanelId: WorkspacePanelId | null;
  width?: number;
  tabBarPosition: "top" | "bottom";
  collapsed: boolean;
}
```

其中 `main` 的宽度不需要手动保存，它由剩余空间决定。`collapsed` 对 `main` 可以固定为 `false`。

### 5.5 WorkspaceLayoutState

```ts
export interface WorkspaceLayoutState {
  version: 2;
  slots: Record<WorkspaceSlotId, WorkspaceSlotState>;
}
```

localStorage key 建议升级为：

```txt
mlfb-workspace-layout-v2
```

### 5.6 默认布局

建议默认：

```ts
leftSidebar: []
leftPage: []
main: ["mlfbWorkspace", "mlraWorkspace"]
rightPage: ["agentConsole", "agentSessions", "terminal"]
rightSidebar: ["mlc", "mlcPreview", "resources", "previewBrowser", "previewInfo"]
```

可根据当前产品实际习惯微调：

- 如果 MLC 是用户高频入口，保留在 rightSidebar
- 如果 Agent Console 是下一阶段核心，继续默认 rightPage
- MLRA 默认进入 main tab，但无需默认激活

## 6. Panel Registry 设计

### 6.1 新增文件建议

新增：

```txt
app/src/workspace/panels.tsx
app/src/workspace/types.ts
app/src/components/workspace/WorkspaceShell.tsx
app/src/components/workspace/WorkspaceSlot.tsx
app/src/components/workspace/WorkspacePanelRenderer.tsx
```

如果希望先小步，可以先放在 `app/src/components/workspacePanelRegistry.tsx`，稳定后再拆目录。

### 6.2 Registry 示例

```tsx
export const WORKSPACE_PANEL_DESCRIPTORS: Record<WorkspacePanelId, WorkspacePanelDescriptor> = {
  mlfbWorkspace: {
    id: "mlfbWorkspace",
    titleKey: "workspace.mlfb.title",
    defaultTitle: "MLFB",
    iconName: "message",
    defaultSlot: "main",
    allowedSlots: ["main"],
    singleton: true,
    closeable: false,
    canCollapse: false,
    category: "workspace",
  },
  mlraWorkspace: {
    id: "mlraWorkspace",
    titleKey: "workspace.mlra.title",
    defaultTitle: "MLRA",
    iconName: "clock",
    defaultSlot: "main",
    allowedSlots: ["main"],
    singleton: true,
    closeable: false,
    canCollapse: false,
    category: "workspace",
  },
  agentConsole: {
    id: "agentConsole",
    titleKey: "agentConsole.title",
    defaultTitle: "Agent Console",
    iconName: "robot",
    defaultSlot: "main",
    allowedSlots: ["main", "leftPage", "rightPage", "leftSidebar", "rightSidebar"],
    singleton: true,
    closeable: false,
    canCollapse: true,
    category: "agent",
  },
};
```

### 6.3 Renderer 示例

```tsx
export function WorkspacePanelRenderer({ panelId }: { panelId: WorkspacePanelId | null }) {
  if (panelId === "mlfbWorkspace") return <MlfbWorkspacePanel />;
  if (panelId === "mlraWorkspace") return <MLRAView />;
  if (panelId === "mlc") return <MlcSidePanel />;
  if (panelId === "resources") return <ProjectResourcePanel />;
  if (panelId === "mlcPreview") return <MlcPreviewPanel />;
  if (panelId === "previewBrowser") return <PreviewBrowserViewPanel />;
  if (panelId === "previewInfo") return <PreviewBrowserInfoPanel />;
  if (panelId === "agentConsole") return <AgentConsolePanel />;
  if (panelId === "agentSessions") return <AgentSessionManagerPanel />;
  if (panelId === "terminal") return <TerminalPanel />;
  return null;
}
```

`MlfbWorkspacePanel` 可先从 `FeedbackApp.tsx` 抽出当前 `caller-workspace` 内容。

## 7. 组件架构调整

### 7.1 FeedbackApp 拆分

当前 `FeedbackApp` 过于集中，建议拆成：

- `FeedbackApp`: app root，管理 settings overlay、theme、window buttons、bridges
- `WorkspaceShell`: 主布局容器，渲染五个 slots
- `AppTitlebar`: titlebar 第一行
- `MainPanelToolbar`: 根据 active main panel 渲染上下文工具条
- `MlfbWorkspacePanel`: 当前 MLFB 中央 caller workspace
- `WorkspaceSlot`: 原 `DockColumn` 泛化版本

### 7.2 WorkspaceShell

目标结构：

```tsx
<WorkspaceShell>
  <WorkspaceSlot slotId="leftSidebar" />
  <WorkspaceSlot slotId="leftPage" />
  <WorkspaceSlot slotId="main" />
  <WorkspaceSlot slotId="rightPage" />
  <WorkspaceSlot slotId="rightSidebar" />
</WorkspaceShell>
```

`main` slot 与其他 slot 差异：

- flex: 1
- 不可 collapsed
- 默认至少保留一个 panel
- tab bar 可更接近 VS Code editor tabs
- 初期不支持宽度 resize

### 7.3 WorkspaceSlot 与 DockColumn 的关系

推荐路线：先复制/泛化，不立即大重构。

阶段一可以让 `WorkspaceSlot` 复用大量 `DockColumn` 逻辑，但支持 `main`。

后续稳定后删除旧 `DockColumn` 或让 `DockColumn` 成为 `WorkspaceSlot` 的 thin wrapper。

### 7.4 Titlebar 改造

当前 titlebar 中 `appView` 控制 MLFB/MLRA 切换。统一后应变成：

- 左侧 app 标识保留
- 中央根据 active main panel 显示对应 tabs / role tabs / caller tabs
- 右侧保留设置、主题、pin、窗口按钮
- `MLFB` / `MLRA` toggle 改成 main slot 的 panel tab，或保留为快捷切换按钮但底层调用 `setActivePanel("main", "mlfbWorkspace")`

短期兼容策略：

- 保留现有视觉 toggle
- 点击 MLFB/MLRA 时只切换 main slot active panel
- 内部不再维护 `appView` 本地 state

### 7.5 MLRARow2 改造

当前 `MLRARow2` 只在 `appView === "MLRA"` 时显示。

统一后应改为：

```ts
activeMainPanelId === "mlraWorkspace"
```

同理，Caller tabs toolbar 应改为：

```ts
activeMainPanelId === "mlfbWorkspace"
```

## 8. Store 改造

### 8.1 新增状态字段

可以先在 `feedbackStore.ts` 内新增：

```ts
workspaceLayout: WorkspaceLayoutState;
draggingWorkspacePanel: DraggingWorkspacePanelState | null;
```

也可以另起 `workspaceLayoutStore.ts`，但短期放在 `feedbackStore` 更少改动。

### 8.2 新增 actions

```ts
setWorkspaceSlotSize(slotId, size)
setWorkspaceSlotCollapsed(slotId, collapsed)
setWorkspaceSlotTabBarPosition(slotId, position)
setActiveWorkspacePanel(slotId, panelId)
moveWorkspacePanel(panelId, targetSlotId, targetIndex?)
openWorkspacePanel(panelId, preferredSlotId?)
resetWorkspaceLayout()
startDraggingWorkspacePanel(...)
updateDraggingWorkspacePanel(...)
finishDraggingWorkspacePanel()
```

### 8.3 兼容旧 action

为减少一次性修改，旧 action 可桥接到新 action：

```ts
moveDockTabToColumn(tabId, targetColumnId, targetIndex) {
  get().moveWorkspacePanel(tabId, targetColumnId, targetIndex);
}
```

这样 `MlcSidePanel`、`AgentSessionManagerPanel` 等调用 `openDockTab` 的地方可以晚一点迁移。

### 8.4 迁移函数

新增：

```ts
function migrateDockLayoutV1ToWorkspaceLayoutV2(dockLayout: DockLayoutState): WorkspaceLayoutState
```

迁移规则：

- 原四列原样映射到新四个外围 slot
- 新增 `main`
- `main.panelIds = ["mlfbWorkspace", "mlraWorkspace"]`
- `main.activePanelId = "mlfbWorkspace"`
- 如果旧 layout 中缺失 panel，按 registry 默认补齐
- 确保 singleton panel 不重复

### 8.5 持久化策略

读取顺序：

1. 优先读取 `mlfb-workspace-layout-v2`
2. 若不存在，读取 `mlfb-dock-layout-v1` 并迁移
3. 若也不存在，使用默认布局

写入：

- 所有新变更只写 `mlfb-workspace-layout-v2`
- 暂不删除旧 key，避免回退版本无布局

## 9. UI 行为设计

### 9.1 主区 tab 行为

第一阶段主区 tab 行为建议简单：

- main slot 总是显示 tab bar，如果有多个 panel
- MLFB 和 MLRA 默认不可关闭
- 其他 panel 进入 main 后可以通过拖动移出，但不提供关闭删除
- active main panel 决定 titlebar 中央工具条

### 9.2 拖动规则

panel 拖动时应检查 `allowedSlots`：

- 如果目标 slot 不允许，则不显示 drop target 或显示 disabled 样式
- `mlfbWorkspace` 第一阶段只允许 main
- `mlraWorkspace` 第一阶段只允许 main
- `previewBrowser` 可允许 main/rightPage/leftPage，谨慎允许 sidebar
- `terminal` 可允许 main/rightPage/leftPage/sidebar
- `mlc` 可允许 left/right sidebar/page，但是否允许 main 可由产品决策决定

### 9.3 Drop zone

当前 collapsed column 会显示 34px drop zone。新方案下：

- 外围 collapsed slot 保留当前 drop zone
- main 不 collapse，但可支持 tab bar drop
- 拖动过程中 main body 应显示 drop highlight

### 9.4 设置页

布局设置页从 4 列升级为 5 列：

- Left sidebar
- Left page
- Main
- Right page
- Right sidebar

设置页文案建议：

中文：

> 将面板拖入不同工作区位置。主区用于当前焦点工作，页边栏和侧栏用于辅助上下文。

英文：

> Drag panels into workspace slots. The main slot is for focused work; page and sidebar slots hold supporting context.

### 9.5 Reset Layout

新增按钮：

- Reset workspace layout
- 恢复默认布局
- 不清除会话、历史、文档选择

### 9.6 快捷键

保留当前快捷键：

- `Ctrl+B`: toggle left side
- `Ctrl+Alt+B`: toggle right side

新增建议后续做：

- `Ctrl+1`: activate MLFB main panel
- `Ctrl+2`: activate MLRA main panel
- `Ctrl+Shift+P` 或已有 command palette 后续接入 panel quick switcher

## 10. Preview Browser 特殊处理

`PreviewBrowserViewPanel` 可能涉及原生 WebView mount、隐藏、overlay blocker。当前 `DockColumn` 中有逻辑：

```ts
const ownsPreviewBrowser = column.tabIds.includes("previewBrowser");
const previewBrowserVisible = ownsPreviewBrowser && !column.collapsed && column.activeTabId === "previewBrowser";
if (!previewBrowserVisible) hideTab(...)
```

统一后该逻辑必须迁移到 slot 级别：

- 如果 `previewBrowser` 所在 slot active panel 不是它，则隐藏 webview
- 如果所在 slot collapsed，则隐藏 webview
- 如果 panel 被移动到 main，也要正确计算可见性
- 如果 settings dialog、tab menu、drag preview 打开，应继续使用 native webview blocker

建议把可见性判断抽成 helper：

```ts
function isWorkspacePanelVisible(layout, panelId): boolean
```

## 11. 风险与应对

### 11.1 风险：改动面过大

应对：第一阶段不做 split tree，只做 main slot tabs。保留旧 action bridge。

### 11.2 风险：titlebar 条件渲染复杂

应对：先引入 `activeMainPanelId` selector，替代 `appView` 判断，但不立即大拆 titlebar。

### 11.3 风险：Preview Browser WebView 遮挡

应对：迁移前后重点手测 previewBrowser 在 rightPage/main/sidebar 中的显示、隐藏、设置弹窗遮挡。

### 11.4 风险：布局迁移破坏用户已有设置

应对：保留 v1 key，只新增 v2 key；迁移中尽量原样继承四个旧 columns。

### 11.5 风险：MLFB/MLRA 生命周期变化

应对：第一阶段主区 tab 切换使用条件渲染即可，不强制 keep-alive。若后续发现切换导致状态丢失，再为特定 panel 添加 `keepMounted`。

### 11.6 风险：概念命名混乱

应对：代码中统一使用 `WorkspacePanel` / `WorkspaceSlot`；UI 文案可继续说 panel。

## 12. 分阶段实施计划

### Phase 0：准备与抽取

目标：不改变行为，降低后续改动风险。

任务：

1. 新增 workspace 类型文件。
2. 建立 `WorkspacePanelDescriptor` registry。
3. 抽出 `dockTabLabel`、`dockTabIcon`、`DockTabContent` 到统一 registry/renderer。
4. 保持 `DockColumn` 仍正常使用。
5. 确保 SettingsDialog 使用 registry 获取 label/icon。

验收：

- UI 行为无变化
- 所有现有 dock panel 标题和图标正常
- 设置页 panel management 正常拖动

建议验证：

- `cd app && npm run build`

### Phase 1：引入 main slot

目标：中央区进入统一 layout 模型。

任务：

1. 新增 `WorkspaceSlotId = DockColumnId | "main"`。
2. 新增 `workspaceLayout` v2。
3. 实现 v1 -> v2 migration。
4. 抽出 `MlfbWorkspacePanel`。
5. 把 `MLRAView` 注册为 `mlraWorkspace` panel。
6. 用 `WorkspaceShell` 渲染五个 slot。
7. 将 `appView` 替换为 main slot active panel。
8. 让 MLFB/MLRA toggle 调用 `setActiveWorkspacePanel("main", ...)`。

验收：

- 默认打开仍显示 MLFB
- 点击 MLRA 后 main slot 显示 MLRA
- 点击 MLFB 后回到 MLFB
- 原四个 dock columns 行为保持
- 用户旧 layout 能迁移

### Phase 2：统一拖动与设置页

目标：主区也参与面板分配。

任务：

1. 设置页新增 Main 列。
2. `moveWorkspacePanel` 支持 main。
3. `WorkspaceSlot` 支持 main tab bar。
4. panel drag/drop 检查 `allowedSlots`。
5. 允许 `agentConsole`、`terminal`、`previewBrowser` 进入 main。
6. 保留 MLFB/MLRA 仅 main。

验收：

- Agent Console 可拖入 main 并激活
- Terminal 可拖入 main 并激活
- Preview Browser 可拖入 main 并正常隐藏/显示
- 不允许 MLFB/MLRA 被拖到 sidebar
- 设置页五列布局保存后重启仍恢复

### Phase 3：上下文工具条统一

目标：titlebar 与 active panel 绑定，而不是与旧 appView 绑定。

任务：

1. 新增 `useActiveMainPanelId` selector。
2. `CallerTabs` 只在 active main panel 为 `mlfbWorkspace` 时显示。
3. `MLRACallerTabs` 与 `MLRARow2` 只在 active main panel 为 `mlraWorkspace` 时显示。
4. Agent Console 作为 main panel 时，可显示轻量标题或不显示中心工具条。
5. titlebar dock toggle 根据 slot 状态渲染。

验收：

- MLFB main 时 caller tabs 正常
- MLRA main 时 role tabs 和二级控制条正常
- Agent Console main 时不会残留 MLFB/MLRA 工具条

### Phase 4：布局增强

目标：补齐现代工作台体验。

任务：

1. 增加 Reset workspace layout。
2. 增加布局 preset：Feedback Focus / Agent Focus / Browser Debug / Knowledge Review。
3. 增加 panel quick switcher。
4. 可选：main slot split panes。
5. 可选：per-panel keepMounted。

验收：

- 用户能一键恢复默认布局
- 用户能按任务快速切换布局 preset
- 高级布局能力不影响默认轻量体验

## 13. 推荐文件改动清单

### 新增文件

```txt
app/src/workspace/types.ts
app/src/workspace/panelRegistry.tsx
app/src/workspace/layoutMigration.ts
app/src/components/workspace/WorkspaceShell.tsx
app/src/components/workspace/WorkspaceSlot.tsx
app/src/components/workspace/WorkspacePanelRenderer.tsx
app/src/components/workspace/MlfbWorkspacePanel.tsx
```

### 修改文件

```txt
app/src/store/feedbackStore.ts
app/src/components/FeedbackApp.tsx
app/src/components/DockColumn.tsx
app/src/components/SettingsDialog.tsx
app/src/components/MlcSidePanel.tsx
app/src/components/agent/AgentSessionManagerPanel.tsx
app/src/index.css
app/src/i18n/locales/zh.json
app/src/i18n/locales/en.json
```

### 可能后续修改

```txt
app/src/components/PreviewBrowserViewPanel.tsx
app/src/store/previewBrowserStore.ts
app/src/components/PreviewBrowserEventBridge.tsx
```

仅当 main slot 迁移后发现 webview 显隐或坐标问题时再改。

## 14. i18n 文案建议

新增 key：

```json
{
  "workspace": {
    "mlfbTitle": "MLFB",
    "mlraTitle": "MLRA",
    "mainSlot": "Main",
    "leftSidebar": "Left sidebar",
    "leftPage": "Left page",
    "rightPage": "Right page",
    "rightSidebar": "Right sidebar",
    "resetLayout": "Reset workspace layout",
    "layoutManagement": "Workspace layout",
    "layoutManagementDesc": "Drag panels into workspace slots. The main slot is for focused work; page and sidebar slots hold supporting context."
  }
}
```

中文：

```json
{
  "workspace": {
    "mlfbTitle": "MLFB",
    "mlraTitle": "MLRA",
    "mainSlot": "主工作区",
    "leftSidebar": "左侧栏",
    "leftPage": "左页面板",
    "rightPage": "右页面板",
    "rightSidebar": "右侧栏",
    "resetLayout": "重置工作区布局",
    "layoutManagement": "工作区布局",
    "layoutManagementDesc": "将面板拖入不同工作区位置。主区用于当前焦点工作，页边栏和侧栏用于辅助上下文。"
  }
}
```

## 15. 数据迁移细则

### 15.1 去重

所有 singleton panel 只能出现一次。如果迁移中重复，保留第一个出现位置，其余删除。

### 15.2 缺失补齐

如果用户旧 layout 中缺少某些 panel，按默认 slot 补齐。

### 15.3 Active panel 修复

如果某个 slot 的 active panel 不在 panelIds 内：

- 使用第一个 panel
- 如果为空，使用 null

main slot 特殊规则：

- main 不允许为空
- 如果 main 为空，补 `mlfbWorkspace`
- 如果 main active 为空，设为 `mlfbWorkspace`

### 15.4 宽度 clamp

沿用当前 clamp 规则：

- sidebar/page 最小 240
- sidebar 最大 520
- page 最大 720
- main 不参与 width clamp

### 15.5 回退策略

迁移后不删除 `mlfb-dock-layout-v1`。如果新版本出现问题，旧版本仍有机会读取原布局。

## 16. 验收清单

### 基础验收

- 应用启动后默认仍进入 MLFB
- 旧用户 layout 可以迁移
- MLFB/MLRA 可在 main tab 中切换
- 原 MLC/Preview/Resources/Agent/Terminal 面板仍能打开
- 外围 dock 折叠、拖动、宽度调整保持可用

### 主区验收

- main slot 显示 tab bar
- Agent Console 可进入 main
- Terminal 可进入 main
- Preview Browser 可进入 main
- active main panel 切换不会错误显示 MLFB/MLRA 工具条

### 设置页验收

- 设置页显示五个 slot
- 拖动 panel 到 main 后立即生效
- 重启后 layout 恢复
- Reset layout 恢复默认

### 回归验收

- 新 feedback request 到达时 MLFB 会话仍更新
- autoFocusNewRequest 行为仍符合设置
- MLC attachment 添加仍工作
- Preview Browser element capture/console capture 仍工作
- Terminal panel 仍能显示事件
- Agent Console 仍能显示流程和权限状态

## 17. 建议验证命令

前端改动完成后：

```bash
cd app && npm run build
```

涉及 Tauri / WebView 行为时：

```bash
cd app && npx tauri dev
```

如果只做 Phase 0 registry 抽取，通常 `npm run build` 足够。

如果做 Phase 1/2，建议实际跑 Tauri dev 检查 Preview Browser、settings overlay、dock drag 交互。

## 18. 推荐实施顺序

优先顺序如下：

1. Phase 0：抽 registry，消除重复面板元数据。
2. Phase 1：引入 main slot，但只放 MLFB/MLRA。
3. Phase 2：允许 Agent Console/Terminal/Preview Browser 进入 main。
4. Phase 3：titlebar 上下文工具条跟随 active main panel。
5. Phase 4：reset layout、presets、quick switcher、split panes。

最关键的设计判断：不要第一步就追求“完美 IDE 布局引擎”。当前代码已有可用 dock 基础，应该先把中央区纳入同一模型，让产品心智统一，再逐步提高布局能力。

## 19. 建议第一阶段最小 PR 范围

如果希望尽快落地，第一阶段 PR 可以只包含：

- 新增 `WorkspacePanelId` / `WorkspaceSlotId`
- 新增 registry
- 新增 `main` slot
- 抽出 `MlfbWorkspacePanel`
- 将 `MLRAView` 注册为 main panel
- 用 active main panel 替代 `appView`
- 旧 dock 四列继续工作
- 不开放其他 panel 进入 main

这样风险最小，但架构方向已经对齐。完成后，再追加第二个 PR 做“设置页五列 + panel 可进 main”。

## 20. 最终建议

我建议采用“统一抽象，渐进扩容”的路线：

- 统一抽象：所有可见区域都是 `WorkspaceSlot`，所有内容都是 `WorkspacePanel`
- 渐进扩容：先主区 tab 化，再开放更多 panel 进入 main，最后做 split/preset
- 保留稳定边界：MLFB/MLRA 内部复杂布局暂时作为完整 panel，不拆散

这条路线既能解决“中央页面始终是 MLFB”的结构问题，也不会破坏当前已经成型的 Dock、Agent Console、Preview Browser 和多 Caller 体验。