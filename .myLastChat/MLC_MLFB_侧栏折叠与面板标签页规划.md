---
title: MLFB 侧栏折叠按钮与面板标签页规划
description: 规划顶栏左右侧栏按钮与侧栏面板标签页架构
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - MLC
  - sidebar
  - UI
solved_lists:
  - 分析顶栏左右侧栏折叠/打开按钮需求
  - 规划侧栏面板顶行标签页化改造
  - 设计当前单面板到未来多面板的扩展路径
---

# MLFB 侧栏折叠按钮与面板标签页规划

## 1. 背景与目标

当前桌面端已经有一个固定侧栏面板：MLC 资料侧栏。它可以显示在主工作区左侧或右侧，并支持折叠、展开、切换侧边位置、关闭。

用户提出的新目标是把侧栏控制提升到更接近 IDE 的布局模型：

- 顶栏靠左增加一个代表左侧栏折叠/打开的按钮。
- 顶栏靠右增加一个代表右侧栏折叠/打开的按钮。
- 当前只有一个侧栏面板，因此按钮的激活、显示、控制行为要取决于这个面板当前在左侧还是右侧。
- 面板顶行改成按钮标签页行，用来切换当前侧边栏面板显示哪一个功能面板。

这意味着侧栏不再只是 “MLC 面板自身带几个按钮”，而是升级为 “应用级侧栏槽位 + 面板标签页 + 顶栏槽位按钮” 三层结构。

## 2. 当前状态

当前相关状态集中在 `feedbackStore`：

- `mlcPanelVisible`: MLC 侧栏是否显示。
- `mlcPanelCollapsed`: MLC 侧栏是否折叠。
- `mlcPanelPosition`: MLC 侧栏位置，`left` 或 `right`。
- `mlcPanelWidth`: MLC 侧栏宽度。
- `mlcActiveWorkspacePath`: MLC 当前工作区筛选路径。

当前布局由 `FeedbackApp` 决定：

- 当 `mlcPanelVisible && mlcPanelPosition === "left"` 时，在主内容左侧渲染 `MlcSidePanel`。
- 当 `mlcPanelVisible && mlcPanelPosition === "right"` 时，在主内容右侧渲染 `MlcSidePanel`。
- 顶栏目前已有 MLC 开关按钮，但它是单一入口，不区分左侧栏槽位和右侧栏槽位。

当前 `MlcSidePanel` 自己的 header 包含：

- 折叠按钮。
- 标题。
- 切换左右位置按钮。
- 关闭按钮。

这个模型适合单个 MLC 面板，但不适合未来多个侧栏面板并存或切换。

## 3. 需求拆解

### 3.1 顶栏左侧按钮

顶栏靠左按钮语义：左侧栏槽位的折叠/打开控制。

期望表现：

- 当当前侧栏面板位于左侧且可见时，左按钮显示为激活状态。
- 点击左按钮：
  - 如果左侧栏打开，则折叠或关闭左侧栏。
  - 如果左侧栏折叠，则展开左侧栏。
  - 如果当前面板在右侧，可选择将当前面板移动到左侧并打开，或仅作为左槽位入口。

### 3.2 顶栏右侧按钮

顶栏靠右按钮语义：右侧栏槽位的折叠/打开控制。

期望表现：

- 当当前侧栏面板位于右侧且可见时，右按钮显示为激活状态。
- 点击右按钮：
  - 如果右侧栏打开，则折叠或关闭右侧栏。
  - 如果右侧栏折叠，则展开右侧栏。
  - 如果当前面板在左侧，可选择将当前面板移动到右侧并打开，或仅作为右槽位入口。

### 3.3 当前只有一个侧栏面板时的解释

用户特别强调：现在只有一个侧栏面板，所以按钮显示在左还是右完全要看当前面板在哪。

这句话建议这样落地：

- 顶栏左右都预留侧栏槽位按钮位置。
- 但当前只有一个真实面板实例，不能同时左侧和右侧各打开一个。
- 因此只有当前 `mlcPanelPosition` 对应的一侧按钮显示为 active。
- 另一侧按钮仍可存在，但语义是 “将当前侧栏切换到这一侧并打开”。
- 如果希望更简洁，也可以只显示当前侧的按钮，另一侧隐藏。该方案更贴近用户这句话，但扩展性较弱。

建议采用：左右按钮都存在，当前侧按钮 active，另一侧按钮 inactive；点击 inactive 的另一侧按钮会把当前面板移动到对应侧并打开。

这样用户可以直觉地把侧栏从左切到右，也符合未来双侧栏槽位扩展。

## 4. 推荐交互模型

### 4.1 顶栏左侧栏按钮状态

| 状态 | 条件 | 左按钮显示 | 点击行为 |
|---|---|---|---|
| 左侧打开 | `position=left && visible && !collapsed` | active/open | 折叠左侧栏 |
| 左侧折叠 | `position=left && visible && collapsed` | active/collapsed | 展开左侧栏 |
| 面板在右侧 | `position=right && visible` | inactive | 移动面板到左侧并展开 |
| 面板关闭 | `!visible` | inactive | 打开到左侧 |

### 4.2 顶栏右侧栏按钮状态

| 状态 | 条件 | 右按钮显示 | 点击行为 |
|---|---|---|---|
| 右侧打开 | `position=right && visible && !collapsed` | active/open | 折叠右侧栏 |
| 右侧折叠 | `position=right && visible && collapsed` | active/collapsed | 展开右侧栏 |
| 面板在左侧 | `position=left && visible` | inactive | 移动面板到右侧并展开 |
| 面板关闭 | `!visible` | inactive | 打开到右侧 |

### 4.3 图标建议

左侧栏按钮：

- 使用 `sidebar` 或更明确的 `panel-left` 图标。
- 当前已有 `sidebar`，如需要左右区分，可新增：
  - `panel-left`
  - `panel-right`

右侧栏按钮：

- 使用镜像的 `panel-right`。
- 若暂不新增图标，可复用 `sidebar`，通过位置和 active 状态表达方向。

折叠状态：

- 可通过 active 样式、轻微透明度、或按钮 tooltip 表达。
- 不建议在顶栏按钮里放文字，避免顶栏拥挤。

## 5. 面板顶行改造为标签页行

### 5.1 当前问题

当前 `MlcSidePanel` header 是 MLC 专属工具条：

- 左侧折叠。
- 中间标题。
- 右侧切换位置、关闭。

当未来侧栏中有多个面板，例如：

- MLC References
- Code Sidebar
- Search/Context
- Logs
- Settings/Inspector

当前 header 结构会变得不通用。

### 5.2 新结构

建议把面板顶行改成 “侧栏面板标签页行”。

布局：

```text
[ MLC ] [ Code ] [ ... ]                         [collapse/close?]
```

或更紧凑：

```text
[book MLC] [code Code] [future tab]              [more]
```

当前只有 MLC 时：

```text
[book MLC]
```

保留折叠/关闭控制的位置有两种方案。

方案 A：顶栏负责折叠/打开，面板顶行只负责 tab。

- 优点：职责清晰。
- 缺点：用户在面板内不能直接折叠/关闭。

方案 B：面板顶行左侧是 tabs，右侧保留小图标按钮。

- 优点：面板内仍可操作。
- 缺点：顶行信息密度更高。

建议采用方案 B，但弱化面板内按钮，让顶栏按钮成为主入口。

### 5.3 标签页行为

每个 tab 代表一个侧栏面板类型。

推荐数据结构：

```ts
type SidePanelId = "mlc" | "code";

interface SidePanelTab {
  id: SidePanelId;
  label: string;
  icon: string;
  disabled?: boolean;
}
```

当前只注册：

```ts
{ id: "mlc", label: "MLC", icon: "book" }
```

未来可新增：

```ts
{ id: "code", label: "Code", icon: "code" }
```

点击 tab：

- 更新 `activeSidePanelId`。
- 保持当前侧栏位置不变。
- 保持当前侧栏展开。
- 渲染对应面板内容。

## 6. 状态设计

### 6.1 短期最小改造

为了避免大范围重构，第一阶段可复用现有 MLC 状态，只增加一个通用 active panel 状态。

新增：

```ts
export type SidePanelId = "mlc";

sidePanelActiveId: SidePanelId;
setSidePanelActiveId: (id: SidePanelId) => void;
```

保留现有：

```ts
mlcPanelVisible
mlcPanelCollapsed
mlcPanelPosition
mlcPanelWidth
```

这种做法改动最小，但命名上仍带 `mlc`。

### 6.2 中期通用化

建议后续把 MLC 专属侧栏状态提升为通用 side panel 状态。

```ts
export type SidePanelPosition = "left" | "right";
export type SidePanelId = "mlc" | "code";

interface SidePanelState {
  visible: boolean;
  collapsed: boolean;
  position: SidePanelPosition;
  width: number;
  activePanelId: SidePanelId;
}
```

Store 字段：

```ts
sidePanel: SidePanelState;
setSidePanelVisible(visible: boolean): void;
setSidePanelCollapsed(collapsed: boolean): void;
setSidePanelPosition(position: SidePanelPosition): void;
setSidePanelWidth(width: number): void;
setActiveSidePanel(id: SidePanelId): void;
toggleSidePanelAt(position: SidePanelPosition): void;
```

兼容策略：

- 保留旧 localStorage key 一段时间。
- 初始化时从旧 key 迁移：
  - `mlfb-mlc-panel-visible`
  - `mlfb-mlc-panel-collapsed`
  - `mlfb-mlc-panel-position`
  - `mlfb-mlc-panel-width`

## 7. 组件改造方案

### 7.1 FeedbackApp 顶栏

新增两个按钮：

- 左侧栏按钮：放在顶栏靠左区域。
- 右侧栏按钮：放在顶栏靠右区域。

建议新增函数：

```ts
const handleToggleSidePanelAt = (position: "left" | "right") => {
  if (!sidePanelVisible) {
    setSidePanelPosition(position);
    setSidePanelCollapsed(false);
    setSidePanelVisible(true);
    return;
  }

  if (sidePanelPosition !== position) {
    setSidePanelPosition(position);
    setSidePanelCollapsed(false);
    setSidePanelVisible(true);
    return;
  }

  setSidePanelCollapsed(!sidePanelCollapsed);
};
```

顶栏按钮 active 计算：

```ts
const leftActive = sidePanelVisible && sidePanelPosition === "left";
const rightActive = sidePanelVisible && sidePanelPosition === "right";
```

tooltip：

- 左按钮：`打开/折叠左侧栏`
- 右按钮：`打开/折叠右侧栏`

### 7.2 MlcSidePanel 改为通用 SidePanelShell

建议拆出一层壳：

```tsx
<SidePanelShell>
  <SidePanelTabs />
  <ActiveSidePanelContent />
</SidePanelShell>
```

第一阶段可以不拆文件，只在 `MlcSidePanel` 内部把 header 改成 tab 行。

长期建议：

- `SidePanelShell.tsx`
- `MlcSidePanelContent.tsx`
- `SidePanelTabs.tsx`

这样 MLC 内容与侧栏壳解耦。

### 7.3 面板顶行标签页

第一阶段可在 `MlcSidePanel` header 替换为：

```tsx
<div className="side-panel-tabs-row">
  <button className="side-panel-tab active">
    <Icon name="book" />
    <span>MLC</span>
  </button>
  <div className="side-panel-tabs-spacer" />
  <button className="side-panel-icon-btn">...</button>
</div>
```

未来多面板：

```tsx
{SIDE_PANEL_TABS.map(tab => (
  <button
    className={activeSidePanelId === tab.id ? "active" : ""}
    onClick={() => setActiveSidePanelId(tab.id)}
  />
))}
```

## 8. CSS 设计建议

### 8.1 顶栏侧栏按钮

建议类名：

```css
.titlebar-side-toggle
.titlebar-side-toggle-left
.titlebar-side-toggle-right
.titlebar-side-toggle-active
```

视觉原则：

- 24px 或 26px 方形按钮。
- 图标按钮，不放文字。
- active 状态与现有 titlebar active button 一致。
- left/right 两侧按钮位置固定，不随主内容列数变化。

### 8.2 面板标签页行

建议类名：

```css
.side-panel-tabs-row
.side-panel-tab
.side-panel-tab.active
.side-panel-tabs-spacer
.side-panel-tab-actions
```

视觉原则：

- 高度保持 32px 至 34px。
- 与 MLC 现有控件风格一致：小字号、低边框、轻背景。
- active tab 使用当前浅色模式 tag 体系或通用 active tab 体系。
- 不使用厚重横线，避免用户刚要求移除的分割线回归。

## 9. 迁移步骤

### Phase 1：顶栏左右按钮

目标：在不重构 MLC 内容的情况下，先建立左右侧栏槽位控制。

任务：

1. 在 `FeedbackApp` 读取现有 `mlcPanelVisible`、`mlcPanelCollapsed`、`mlcPanelPosition`。
2. 新增 `handleToggleMlcPanelAt(position)`。
3. 顶栏左侧加入左侧栏按钮。
4. 顶栏右侧加入右侧栏按钮。
5. active 状态按当前面板位置计算。
6. 点击 inactive 侧按钮时，将 MLC 面板移动到对应侧并展开。
7. 保留原有 MLC titlebar 按钮一段时间，或替换为新左右按钮。

### Phase 2：面板顶行标签页化

目标：把 MLC 面板 header 从专属工具条改为 tab row。

任务：

1. 新增 `SIDE_PANEL_TABS` 常量。
2. 新增 `sidePanelActiveId` 或临时常量 `"mlc"`。
3. 将 `MlcSidePanel` header 改成 tab row。
4. 当前只渲染 MLC tab。
5. 右侧保留折叠/关闭小按钮，或转移到顶栏。
6. 调整 CSS，避免横分割线回归。

### Phase 3：通用 SidePanelShell

目标：为未来 Code 右侧栏或其它面板做结构准备。

任务：

1. 新建 `SidePanelShell.tsx`。
2. 提取 resize、collapsed shell、position、width 逻辑。
3. 将 MLC 内容拆为 `MlcSidePanelContent.tsx`。
4. `SidePanelShell` 根据 `activePanelId` 渲染内容。
5. 保持现有 MLC 功能不变。

### Phase 4：状态命名通用化

目标：移除 MLC 专属侧栏状态命名。

任务：

1. 新增通用 `sidePanel` state。
2. 初始化时迁移旧 localStorage key。
3. 保留旧 action wrapper，避免一次性改太多调用点。
4. 分批把调用点迁移到通用 action。
5. 最后清理旧 MLC panel 状态名。

## 10. 风险与注意事项

### 10.1 当前只有一个面板

如果左右按钮都能打开侧栏，用户可能误以为左右可以同时存在。需要通过行为明确：

- 当前只有一个面板实例。
- 点击另一侧按钮会移动面板，而不是创建第二个面板。

### 10.2 与 MLC 附件目标绑定

MLC 面板当前依赖 `focusedComposer` 和 `mlcActiveWorkspacePath`。侧栏壳通用化时不能破坏：

- 点击附件按钮打开 MLC 面板时，应仍然设置目标 workspace。
- 切换面板位置不应改变目标 session/draft。
- 关闭/折叠不应清空 focused composer。

### 10.3 面板 header 职责变化

把 header 改成 tab row 后，原本的 “切换左右位置” 按钮可能会变得冗余。

建议：

- 左右位置切换主要交给顶栏左右按钮。
- 面板内保留 collapse/close，但弱化视觉。
- 面板内不再提供 switch side，避免重复入口过多。

### 10.4 CSS 截断问题

近期 MLC 列表出现过 sticky/header/末尾项截断问题。新增 tab row 时要避免：

- 使用外扩 box-shadow 遮罩。
- 在 sticky 元素父级设置过紧 overflow。
- 让 header/tab row 的高度依赖内容自然撑开。

建议给 tab row 明确高度和 flex-shrink。

## 11. 推荐最终效果

顶栏：

```text
[左侧栏按钮]  ... 主标题/Caller 控件 ...  [右侧栏按钮]
```

左按钮 active 时：

- 代表当前侧栏在左。
- 点击折叠/展开左侧栏。

右按钮 active 时：

- 代表当前侧栏在右。
- 点击折叠/展开右侧栏。

点击非 active 的另一侧按钮：

- 当前面板移动到那一侧。
- 面板展开。

侧栏顶行：

```text
[book MLC] [future panel]                         [collapse] [close]
```

当前只有 MLC：

```text
[book MLC]                                      [collapse] [close]
```

## 12. 建议实施顺序

最稳妥顺序：

1. 先实现顶栏左右按钮，但仍控制现有 MLC panel 状态。
2. 再把 MLC panel 顶行改成 tab row。
3. 最后再考虑拆 `SidePanelShell`。

不建议第一步就把 store 完全通用化。当前 MLC 刚经历多轮 UI 修复，先做低风险增量更稳。

## 13. 验收标准

功能验收：

- 左侧栏按钮能打开/折叠左侧 MLC 面板。
- 右侧栏按钮能打开/折叠右侧 MLC 面板。
- 当前面板在左时，左按钮 active。
- 当前面板在右时，右按钮 active。
- 点击另一侧按钮会移动面板并展开。
- 面板顶行显示 MLC tab。
- 点击 MLC tab 不破坏当前 MLC 列表、筛选、附件目标。

视觉验收：

- 顶栏按钮不挤压现有标题栏控件。
- 侧栏 tab row 没有恢复明显横分割线。
- 折叠态不截断内容。
- 浅色/深色主题都可读。
- 与当前 MLC 小尺寸 UI 风格一致。

回归验收：

- MLC 搜索、排序、类型筛选、工作区筛选可用。
- MLC attach 到 pending session 和 queued draft 可用。
- MLC tooltip 和路径清理仍正常。
- Vite 不再出现 `MlcSidePanel` import 解析错误。
