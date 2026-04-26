---
title: 三栏可停靠面板系统规划书
description: 规划左侧栏、左页面栏、右侧栏三栏 dock 布局
type: planning
workplace: ${workspaceFolder}
project: my-last-feedback
tags:
  - UI
  - dock-layout
  - drag-and-drop
  - side-panel
  - planning
solved_lists:
  - 梳理三栏可停靠面板系统需求
  - 设计 dock layout 状态模型
  - 规划 tab 拖拽与空栏行为
---

# 三栏可停靠面板系统规划书

## 1. 背景

当前 MLFB 的侧栏系统已经从早期的单一 MLC 面板演进为公共侧栏容器：MLC 面板和项目资源管理器都是公共侧栏内的 tab 内容页。

当前模型适合表达“一个侧栏容器内切换多个 tab”，但无法表达更复杂的面板停靠能力。例如：

- MLC 停靠在右侧栏，资源管理器停靠在左页面栏。
- 左侧栏为空，右侧栏也为空，只有左页面栏显示一个 tab。
- 多个 tab 位于同一栏内，另一个栏为空。
- 用户通过拖拽把 tab 从一个栏移动到另一个栏。

新的需求是建立一个更通用的可停靠面板系统，允许所有 tab 面板在多个 dock 栏之间自由移动。

## 2. 目标

新增一个位于左侧栏右侧、主页面左侧的“左页面栏”，并将现有侧栏体系升级为三栏 dock 布局。

新的三栏为：

| 栏 ID | 名称 | 位置 | 说明 |
| --- | --- | --- | --- |
| `leftSidebar` | 左侧栏 | 应用 body 最左侧 | 当前左侧公共侧栏位置 |
| `leftPage` | 左页面栏 | 左侧栏右侧、主页面左侧 | 新增面板空间 |
| `rightSidebar` | 右侧栏 | 应用 body 最右侧 | 当前右侧公共侧栏位置 |

目标能力：

- tab 面板可以停靠在三个栏任意一个中。
- 每个栏可以为空。
- 每个栏可以容纳多个 tab。
- 每个栏有自己的 active tab。
- 每个栏有自己的宽度。
- 每个栏有自己的 tabbar 位置配置。
- tab 可以通过拖拽在栏之间移动。
- tab 可以通过右键菜单移动到指定栏，作为拖拽之外的稳定补充交互。

## 3. 非目标

第一阶段不建议同时处理以下能力：

- 面板内容多实例化。第一版中同一个 tab 只能存在于一个栏内。
- 同一个 tab 拆分为多个副本，例如两个资源管理器分别浏览不同工作区。
- 完整 IDE 级布局编辑器，例如任意水平/垂直分屏、嵌套 split tree。
- 跨窗口拖拽。
- 栏内复杂排序动画。
- 独立每个 tab 的 workspace context。

这些能力可以作为后续扩展，但不应阻塞第一版三栏 dock 系统。

## 4. 当前架构分析

### 4.1 当前主要状态

当前 store 中与侧栏相关的状态包括：

```ts
mlcPanelVisible: boolean;
mlcPanelPosition: "left" | "right";
mlcPanelWidth: number;
mlcActiveWorkspacePath: string | null;
sidePanelActiveTab: "mlc" | "resources";
```

这些字段的含义是：

- `mlcPanelVisible`：唯一公共侧栏是否显示。
- `mlcPanelPosition`：唯一公共侧栏在左侧还是右侧。
- `mlcPanelWidth`：唯一公共侧栏宽度。
- `sidePanelActiveTab`：唯一公共侧栏当前激活哪个 tab。
- `mlcActiveWorkspacePath`：公共侧栏上下文使用的当前工作区。

### 4.2 当前组件结构

当前 body 布局近似为：

```tsx
{mlcPanelVisible && mlcPanelPosition === "left" && <ContextSidePanel />}
<CallerWorkspace />
{mlcPanelVisible && mlcPanelPosition === "right" && <ContextSidePanel />}
```

`ContextSidePanel` 内部负责：

- 侧栏 aside 容器。
- resize handle。
- tabbar。
- active tab 切换。
- MLC / Resources 内容渲染。

### 4.3 当前模型的瓶颈

当前模型只有“一个容器”和“一个 active tab”，因此不能表达：

- 同时显示多个面板栏。
- 同时显示 MLC 和 Resources。
- 某个栏为空而其它栏非空。
- 每个栏独立 active tab。
- 每个栏独立宽度。
- tab 从一栏移动到另一栏。

因此新需求不应继续扩展 `mlcPanelPosition`，而应建立一个新的 dock layout 模型。

## 5. 核心概念

### 5.1 Dock Column

Dock Column 表示一个可停靠面板栏。

每个 Dock Column 具有：

- 栏 ID。
- tab 列表。
- active tab。
- 宽度。
- tabbar 位置。
- 折叠状态。
- 拖拽投放状态。

### 5.2 Dock Tab

Dock Tab 表示一个可移动的面板页。

第一版 tab 列表：

| Tab ID | 名称 | 内容组件 |
| --- | --- | --- |
| `mlc` | My Last Chat | `MlcSidePanel` |
| `resources` | Project Resources | `ProjectResourcePanel` |

未来可以新增：

- Knowledge。
- Search。
- MLRA inspector。
- Session details。
- Git context。

### 5.3 Tab Placement

Tab Placement 表示 tab 当前位于哪个栏，以及在栏内的顺序。

第一版推荐把 placement 表达为每个栏内的 `tabIds` 数组，而不是给每个 tab 单独存一个 `columnId`。

这样可以自然表达栏内排序：

```ts
leftSidebar.tabIds = ["mlc"];
leftPage.tabIds = ["resources"];
rightSidebar.tabIds = [];
```

## 6. 状态模型设计

### 6.1 类型定义

```ts
type DockColumnId = "leftSidebar" | "leftPage" | "rightSidebar";
type DockTabId = "mlc" | "resources";
type DockTabBarPosition = "top" | "bottom";

interface DockColumnState {
  tabIds: DockTabId[];
  activeTabId: DockTabId | null;
  width: number;
  tabBarPosition: DockTabBarPosition;
  collapsed: boolean;
}

interface DockLayoutState {
  columns: Record<DockColumnId, DockColumnState>;
}
```

### 6.2 Store 字段

建议新增：

```ts
dockLayout: DockLayoutState;
activeDockColumnId: DockColumnId | null;
draggingDockTab: {
  tabId: DockTabId;
  sourceColumnId: DockColumnId;
} | null;
```

建议新增 actions：

```ts
setDockColumnWidth(columnId: DockColumnId, width: number): void;
setDockColumnCollapsed(columnId: DockColumnId, collapsed: boolean): void;
setDockColumnTabBarPosition(columnId: DockColumnId, position: DockTabBarPosition): void;
setDockActiveTab(columnId: DockColumnId, tabId: DockTabId | null): void;
moveDockTab(tabId: DockTabId, targetColumnId: DockColumnId, targetIndex?: number): void;
moveDockTabToColumn(tabId: DockTabId, targetColumnId: DockColumnId): void;
startDraggingDockTab(tabId: DockTabId, sourceColumnId: DockColumnId): void;
finishDraggingDockTab(): void;
```

### 6.3 旧字段迁移

旧字段建议逐步废弃：

| 旧字段 | 新模型替代 |
| --- | --- |
| `mlcPanelVisible` | 栏是否为空 + `collapsed` |
| `mlcPanelPosition` | tab 所在 `DockColumnId` |
| `mlcPanelWidth` | `dockLayout.columns[columnId].width` |
| `sidePanelActiveTab` | `dockLayout.columns[columnId].activeTabId` |

`mlcActiveWorkspacePath` 可以暂时保留，因为它描述的是公共侧栏工作区上下文，而不是栏布局。

后续如需每个栏独立工作区上下文，可升级为：

```ts
dockWorkspacePathByColumn: Partial<Record<DockColumnId, string | null>>;
```

但第一版不建议增加这个复杂度。

## 7. 默认布局与迁移策略

### 7.1 默认布局

如果用户没有旧侧栏设置，推荐默认布局：

```ts
{
  leftSidebar: {
    tabIds: [],
    activeTabId: null,
    width: 300,
    tabBarPosition: "top",
    collapsed: false,
  },
  leftPage: {
    tabIds: [],
    activeTabId: null,
    width: 300,
    tabBarPosition: "top",
    collapsed: false,
  },
  rightSidebar: {
    tabIds: ["mlc", "resources"],
    activeTabId: "mlc",
    width: 300,
    tabBarPosition: "top",
    collapsed: false,
  },
}
```

### 7.2 从旧布局迁移

如果存在旧 localStorage：

- `mlfb-mlc-panel-position = left`：把 `mlc` 与 `resources` 放入 `leftSidebar`。
- `mlfb-mlc-panel-position = right`：把 `mlc` 与 `resources` 放入 `rightSidebar`。
- `mlfb-side-panel-active-tab`：作为对应栏的 `activeTabId`。
- `mlfb-mlc-panel-width`：作为对应栏的 `width`。
- `mlfb-mlc-tab-bar-position`：作为对应栏的 `tabBarPosition`。

如果旧 `mlcPanelVisible = false`：

- 可以迁移为目标栏 `collapsed = true`。
- 也可以迁移为 tab 仍在栏内但栏折叠。

不建议把 tabIds 清空，因为用户只是关闭侧栏，不等于删除 tab placement。

## 8. 布局结构

新的 MLFB body 建议为：

```tsx
<div className="mlfb-body">
  <DockColumn columnId="leftSidebar" />
  <DockColumn columnId="leftPage" />
  <CallerWorkspace />
  <DockColumn columnId="rightSidebar" />
</div>
```

布局顺序必须满足：

1. 左侧栏位于最左。
2. 左页面栏紧贴左侧栏右侧。
3. 主页面位于左页面栏右侧。
4. 右侧栏位于最右。

### 8.1 空栏占位策略

空栏可以是合法状态。

推荐第一版策略：

- 非拖拽时，空栏宽度为 0，不挤压主页面。
- 拖拽 tab 时，空栏显示一个窄 drop zone。
- 如果用户把 tab 放入空栏，该栏恢复到上一次宽度或默认宽度。

这样可以避免空栏长期占据主页面宽度。

### 8.2 Resize 策略

每个非空、非折叠栏都拥有 resize handle。

- `leftSidebar`：右侧 resize handle。
- `leftPage`：右侧 resize handle。
- `rightSidebar`：左侧 resize handle。

拖拽宽度时写入对应 column 的 `width`。

宽度限制建议：

```ts
const DOCK_COLUMN_MIN_WIDTH = 240;
const DOCK_COLUMN_MAX_WIDTH = 520;
const DOCK_COLUMN_DEFAULT_WIDTH = 300;
```

## 9. DockColumn 组件设计

### 9.1 组件职责

`DockColumn` 负责栏级行为：

- 是否渲染。
- 宽度。
- resize。
- tabbar。
- active tab。
- tab 移动菜单。
- tab 拖拽。
- 空栏 drop target。

伪代码：

```tsx
function DockColumn({ columnId }: { columnId: DockColumnId }) {
  const column = useDockColumn(columnId);

  if (column.tabIds.length === 0 && !isDraggingDockTab) {
    return null;
  }

  if (column.tabIds.length === 0 && isDraggingDockTab) {
    return <DockDropZone columnId={columnId} />;
  }

  return (
    <aside className="dock-column" data-column-id={columnId} style={{ width: column.width }}>
      <DockResizeHandle columnId={columnId} />
      {column.tabBarPosition === "top" && <DockTabBar columnId={columnId} />}
      <DockTabContent tabId={column.activeTabId} />
      {column.tabBarPosition === "bottom" && <DockTabBar columnId={columnId} />}
    </aside>
  );
}
```

### 9.2 内容渲染

```tsx
function DockTabContent({ tabId }: { tabId: DockTabId | null }) {
  if (tabId === "mlc") return <MlcSidePanel />;
  if (tabId === "resources") return <ProjectResourcePanel />;
  return null;
}
```

内容页继续保持纯内容组件，不拥有栏宽度、位置、tabbar。

## 10. Tabbar 设计

### 10.1 栏级 tabbar

每个栏都有自己的 tabbar。

tabbar 只显示该栏内的 tab。

```tsx
<DockTabBar columnId="leftPage" />
```

### 10.2 Tab 点击

点击 tab：

- 设置该栏 `activeTabId`。
- 不影响其它栏 active tab。
- 如果需要同步 workspace，则按当前 focused composer 更新 `mlcActiveWorkspacePath`。

### 10.3 Tab 右键菜单

tab 右键菜单建议包含：

- Move to left sidebar
- Move to left page
- Move to right sidebar
- Move tab bar to top/bottom

如果当前 tab 已经在目标栏，该项 disabled 或隐藏。

## 11. 拖拽交互设计

### 11.1 拖拽基础流程

1. 用户在 tab 上按下并拖动。
2. 系统记录 `draggingDockTab`。
3. 三个栏都进入 drop-aware 状态。
4. 鼠标进入目标栏或空栏 drop zone，显示投放高亮。
5. 用户释放鼠标。
6. 调用 `moveDockTab(tabId, targetColumnId, targetIndex)`。
7. 清空 `draggingDockTab`。

### 11.2 拖拽数据

```ts
interface DraggingDockTabState {
  tabId: DockTabId;
  sourceColumnId: DockColumnId;
  pointerId?: number;
}
```

### 11.3 移动规则

移动 tab 时必须满足：

- 从所有栏中移除该 tab。
- 插入目标栏。
- 目标栏 active tab 设为该 tab。
- 如果源栏 active tab 被移走，则自动选相邻 tab。
- 如果源栏没有剩余 tab，则 `activeTabId = null`。
- 如果目标栏原本为空，则恢复宽度并展开。

### 11.4 栏内排序

第一版可以只支持“拖到某栏并放到末尾”。

第二版再支持栏内排序：

- 根据鼠标 X 坐标计算 targetIndex。
- tabbar 上显示插入线。
- 同栏拖拽不改变 active 状态，除非用户释放在不同位置。

## 12. 空栏行为

空栏是新模型的关键能力。

建议规则：

- 空栏非拖拽时不渲染，不占宽。
- 拖拽时空栏显示窄 drop zone。
- drop zone 文案可极简，例如只显示图标，不显示说明文字。
- 放入 tab 后恢复为正常栏。
- 用户可通过右键菜单把 tab 移到空栏。

空栏 drop zone 示例：

```tsx
function DockDropZone({ columnId }: { columnId: DockColumnId }) {
  return <div className="dock-column-drop-zone" data-column-id={columnId} />;
}
```

## 13. 顶栏按钮策略

当前顶栏左右侧栏按钮不应简单删除。

新模型下建议含义调整为：

- 左侧栏按钮：折叠/展开 `leftSidebar`。
- 右侧栏按钮：折叠/展开 `rightSidebar`。
- 左页面栏暂不放顶栏按钮，由拖拽或右键菜单产生。

当栏为空时按钮行为需要明确。

推荐第一版：

- 栏为空时，按钮不自动创建 tab。
- 栏为空但用户点击按钮时，可以打开一个空 drop zone 短暂提示。
- 如果希望更主动，可以把默认 tab 移入该栏，但这可能造成用户困惑。

建议更保守：顶栏按钮只控制已有栏内容的显示状态，不做 tab 搬运。

## 14. 工作区上下文策略

当前 MLC 和资源管理器共享 `mlcActiveWorkspacePath`。

新 dock 系统第一版建议继续共享。

理由：

- 当前公共侧栏被视为同一个上下文空间。
- MLC 与资源管理器都围绕当前聊天项目工作区工作。
- 若每个栏有独立 workspace，会显著增加同步复杂度。

未来如果用户需要：

- 左页面栏资源管理器固定工作区 A。
- 右侧栏 MLC 固定工作区 B。

再升级为栏级 workspace：

```ts
dockWorkspaceByColumn: Record<DockColumnId, string | null>;
```

## 15. 持久化设计

建议新 localStorage key：

```ts
mlfb-dock-layout-v1
```

保存内容：

```json
{
  "columns": {
    "leftSidebar": {
      "tabIds": [],
      "activeTabId": null,
      "width": 300,
      "tabBarPosition": "top",
      "collapsed": false
    },
    "leftPage": {
      "tabIds": ["resources"],
      "activeTabId": "resources",
      "width": 300,
      "tabBarPosition": "top",
      "collapsed": false
    },
    "rightSidebar": {
      "tabIds": ["mlc"],
      "activeTabId": "mlc",
      "width": 300,
      "tabBarPosition": "top",
      "collapsed": false
    }
  }
}
```

旧 key 可保留读取兼容：

- `mlfb-mlc-panel-visible`
- `mlfb-mlc-panel-position`
- `mlfb-mlc-panel-width`
- `mlfb-side-panel-active-tab`
- `mlfb-mlc-tab-bar-position`

迁移后只写新 key。

## 16. CSS 结构建议

新 CSS 类命名建议从 `mlc-panel` 迁移到 `dock-column`。

保留兼容期：

- `mlc-panel` 可作为过渡 class。
- 新代码优先使用 `dock-column`。

建议类名：

```css
.dock-column {}
.dock-column[data-column-id="leftSidebar"] {}
.dock-column[data-column-id="leftPage"] {}
.dock-column[data-column-id="rightSidebar"] {}
.dock-resize-handle {}
.dock-tabbar {}
.dock-tab {}
.dock-tab.active {}
.dock-tab-menu {}
.dock-column-drop-zone {}
```

这能避免后续所有容器样式仍带 `mlc` 命名。

## 17. 实施阶段

### 阶段 1：状态模型落地

目标：引入 dock layout store，但 UI 可暂时保持当前效果。

任务：

- 新增 `DockColumnId`、`DockTabId`、`DockLayoutState` 类型。
- 新增 `dockLayout` store 字段。
- 新增栏级 actions。
- 实现旧 localStorage 到新 dock layout 的迁移。
- 保留旧字段只读或临时兼容。

验收：

- 应用启动后能得到合法 dock layout。
- MLC 和 Resources 只存在于一个栏内。
- 不丢失旧 active tab 和宽度偏好。

### 阶段 2：替换容器组件

目标：用 `DockColumn` 替换 `ContextSidePanel`。

任务：

- 创建 `DockColumn.tsx`。
- 创建 `DockTabBar.tsx` 或在 `DockColumn` 内实现。
- 创建 `DockTabContent.tsx`。
- 修改 `FeedbackApp` body 为三栏布局。
- 接入栏级 width、active tab、tabbar position。

验收：

- 左侧栏、左页面栏、右侧栏都能渲染。
- 空栏不破坏布局。
- 非空栏可 resize。
- 每栏 active tab 独立。

### 阶段 3：右键移动 tab

目标：先实现稳定的 tab 移动能力。

任务：

- tab 右键菜单新增移动到三栏。
- 实现 `moveDockTabToColumn`。
- 移动后更新源栏和目标栏 active tab。
- 目标栏为空时恢复宽度。

验收：

- MLC 可从右侧栏移动到左页面栏。
- Resources 可从左页面栏移动到左侧栏。
- 源栏移空后不显示或显示为空 drop zone。
- 目标栏获得 active tab。

### 阶段 4：拖拽移动 tab

目标：支持用户直接拖动 tab 到三个栏。

任务：

- tab 支持 drag start。
- 栏支持 drag over/drop。
- 空栏支持 drop zone。
- 拖拽时显示投放高亮。
- drop 后调用同一套 move action。

验收：

- tab 可拖到左侧栏。
- tab 可拖到左页面栏。
- tab 可拖到右侧栏。
- tab 可拖到空栏。
- 拖拽取消不改变布局。

### 阶段 5：清理旧命名和冗余状态

目标：移除旧单侧栏模型残留。

任务：

- 移除 `mlcPanelVisible` 或改为兼容 derived。
- 移除 `mlcPanelPosition`。
- 移除 `mlcPanelWidth`。
- 移除 `sidePanelActiveTab`。
- 清理 `ContextSidePanel`。
- CSS 中逐步替换 `mlc-panel` 容器命名。

验收：

- 搜索无旧单侧栏状态残留。
- 所有栏行为由 dock layout 驱动。
- diagnostics 无错误。

## 18. 测试与验证计划

### 18.1 状态测试

需要覆盖：

- 默认布局生成。
- 旧 localStorage 迁移。
- tab 移动到空栏。
- tab 移动到非空栏。
- 源栏 active tab 被移走。
- 源栏最后一个 tab 被移走。
- 目标栏 active tab 更新。
- 栏宽度持久化。

### 18.2 UI 手动验收

需要验证：

- 三个栏同时显示。
- 任意栏为空时主页面布局正常。
- 左页面栏紧贴左侧栏右侧。
- 右侧栏保持在最右。
- MLC 内容正常。
- 资源管理器内容正常。
- resize 不串栏。
- tabbar top/bottom 设置只影响当前栏。

### 18.3 拖拽验收

需要验证：

- 拖拽到左侧栏。
- 拖拽到左页面栏。
- 拖拽到右侧栏。
- 拖拽到空栏。
- 拖拽取消。
- 快速拖拽不会产生重复 tab。
- 同一个 tab 不会同时出现在两个栏。

## 19. 风险与应对

### 19.1 状态迁移风险

风险：旧用户布局偏好丢失。

应对：

- 读取旧 key 迁移到新 layout。
- 迁移失败时 fallback 到默认布局。
- 不删除旧 key，至少保留一个版本周期。

### 19.2 拖拽复杂度风险

风险：一次实现拖拽、排序、空栏可能引入边界 bug。

应对：

- 移动逻辑集中在 store action。
- 右键移动和拖拽 drop 共用同一个 action。
- 第一版拖拽到栏末尾，不做复杂排序。

### 19.3 布局挤压风险

风险：三栏同时显示时主页面空间过窄。

应对：

- 设置栏宽上限。
- 空栏不占宽。
- 小窗口下可以自动折叠某些栏，或限制最多同时显示两个非空栏。

### 19.4 命名历史包袱

风险：继续使用 `mlcPanel*` 命名会导致后续维护误解。

应对：

- 新模型使用 `dock*` 命名。
- 旧字段只作为迁移兼容，不继续扩展。

## 20. 推荐最终方案

建议采用“三栏 dock layout + 单实例 tab placement + 右键菜单与拖拽双入口”的方案。

实施顺序建议：

1. 先建 dock layout store。
2. 再替换 `ContextSidePanel` 为 `DockColumn`。
3. 先实现右键移动，确保状态移动稳定。
4. 再实现拖拽移动。
5. 最后清理旧字段和旧 CSS 命名。

这样可以避免把拖拽交互、布局迁移、状态重构全部压在同一个不可控变更里。

## 21. 验收标准

最终功能完成时，应满足：

- 左侧栏、左页面栏、右侧栏三个 dock 区域存在。
- 左页面栏位于左侧栏右侧、主页面左侧。
- MLC tab 可移动到任意栏。
- Resources tab 可移动到任意栏。
- 栏可为空。
- 空栏不破坏布局。
- 每个栏有独立 active tab。
- 每个栏有独立宽度。
- 每个栏有独立 tabbar top/bottom 设置。
- 拖拽 tab 不产生重复实例。
- 右键菜单移动 tab 与拖拽移动结果一致。
- 旧用户侧栏设置可以迁移。
- VS Code diagnostics 无错误。
- 完整构建通过。

## 22. 后续扩展

未来可考虑：

- 栏内 tab 排序。
- 面板内容多实例。
- 每栏独立 workspace context。
- 面板布局 preset。
- 一键重置布局。
- 拖拽预览 ghost。
- 空栏常驻窄工具条。
- 键盘快捷键移动 tab。
