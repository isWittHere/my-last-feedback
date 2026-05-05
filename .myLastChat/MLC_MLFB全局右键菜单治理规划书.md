---
title: MLFB 全局右键菜单治理规划书
description: 记录原生浏览器右键问题的分析、范围、风险与分阶段治理方案
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - UI
  - context-menu
  - planning
solved_lists:
  - 分析当前右键菜单根因
  - 拆分 React 主 UI 与 native webview 处理边界
  - 制定分阶段治理路线
---

# MLFB 全局右键菜单治理规划书

最后更新：2026-05-05

## 1. 背景

当前 MLFB 桌面端大多数区域右键时仍然呼出 Chromium/Tauri WebView 的原生浏览器右键菜单。用户感知上，这会破坏应用的桌面原生感，也会让不同区域的交互语义不一致。

本规划文档只记录问题、边界、风险和后续可实施方案。当前不直接修复。

## 2. 当前现状

### 2.1 已有自定义右键的区域

当前代码中已经有局部自定义右键菜单，主要在：

- `app/src/components/DockColumn.tsx`

该区域对 dock tab 做了 `onContextMenu` 处理：

- 阻止原生菜单。
- 弹出 dock tab 菜单。
- 支持把 tab 移动到不同 dock column。
- 支持切换 tab bar 位置。

因此问题不是“完全没有自定义右键”，而是目前只有 dock tab 这一小块被覆盖。

### 2.2 仍会呼出原生菜单的主要区域

以下区域目前缺少统一右键处理：

- Caller 主面板正文。
- Composer 输入编辑器。
- 测试日志 textarea。
- 已提交反馈只读 Markdown 区。
- Sidebar / session 列表。
- Caller tabs。
- MLC 文档列表。
- MLC Preview。
- 项目资源管理器。
- 终端内容区。
- 设置页面。
- Preview Browser 的 React chrome 区域。
- Preview Browser native webview 内部网页内容。

## 3. 根因分析

### 3.1 缺少全局 contextmenu 管理层

当前 App 根部没有统一捕获 `contextmenu` 事件，也没有一个集中式 context menu provider。

因此大部分 DOM 区域的右键行为都会沿用浏览器默认行为。

### 3.2 局部菜单实现分散

Dock tab 已经有自己的局部菜单状态和关闭逻辑：

- `tabBarMenu`
- `tabBarMenuRef`
- outside click 关闭
- Escape 关闭
- 菜单定位 clamp

如果未来每个组件都单独实现一套，会出现以下问题：

- 样式不统一。
- 定位逻辑重复。
- Escape / outside click / scroll close 逻辑重复。
- z-index 和 native webview overlay 处理容易冲突。
- 后续扩展成本高。

### 3.3 不能简单全局 preventDefault

直接在 document 上执行：

```ts
document.addEventListener("contextmenu", (event) => event.preventDefault(), true);
```

可以阻止原生菜单，但会造成严重体验退化：

- 输入框无法右键粘贴。
- contenteditable 无法右键复制、剪切、粘贴、全选。
- 已提交反馈无法右键复制选中文本。
- 终端无法右键复制选区或粘贴命令。
- native webview 内部网页不一定能被 React 捕获。

正确方向应是“拦截原生菜单后，补上应用级菜单能力”。

## 4. 设计目标

### 4.1 一致性

所有 MLFB 自身 UI 区域右键应呼出统一视觉和行为的应用菜单，而不是浏览器默认菜单。

### 4.2 不破坏基础编辑能力

对于输入区和可选文本区，必须保留或替代原生菜单提供的基础能力：

- Cut
- Copy
- Paste
- Select All
- Clear

### 4.3 区域语义化

不同区域应显示不同菜单项，而不是所有地方都显示同一套泛菜单。

### 4.4 可渐进实施

先覆盖 React 主 UI，再处理 native webview 内部网页内容。不要把 native webview 内部问题混入第一阶段。

### 4.5 与现有菜单兼容

Dock tab 已有菜单。第一阶段可以暂时保留，后续再迁移到统一菜单系统。

## 5. 非目标

当前规划不要求立即完成以下事项：

- 不要求一次性替换 Preview Browser native webview 内部网页的右键菜单。
- 不要求所有区域一次性拥有完整业务菜单。
- 不要求移除 dock tab 现有菜单作为第一步。
- 不要求实现系统级原生菜单。优先使用 React overlay 菜单。

## 6. 推荐架构

### 6.1 AppContextMenuProvider

新增一个全局 provider，例如：

```tsx
<AppContextMenuProvider>
  <AppTooltipProvider>
    <TerminalEventBridge />
    <FeedbackApp />
  </AppTooltipProvider>
</AppContextMenuProvider>
```

职责：

- 捕获 `contextmenu` 事件。
- 判断目标区域。
- 关闭其他 popover / menu，或与其协调。
- 阻止原生浏览器菜单。
- 生成菜单项。
- 渲染统一菜单 overlay。
- 处理窗口边界定位。
- 处理 Escape 关闭。
- 处理 outside click 关闭。
- 处理 scroll / resize 关闭。
- 与 native webview blocker 协作，避免菜单被 native webview 覆盖。

### 6.2 区域标记

建议为关键区域添加行为语义标记，而不是依赖样式 class：

```tsx
<div data-context-area="composer" />
<div data-context-area="readonly-feedback" />
<div data-context-area="sidebar-session" />
<div data-context-area="caller-tab" />
<div data-context-area="dock-tab" />
<div data-context-area="terminal" />
<div data-context-area="mlc-document" />
<div data-context-area="resource-item" />
```

同时可用 `data-context-id`、`data-context-path`、`data-context-session-id` 传递轻量上下文。

复杂上下文不建议全部塞进 DOM attribute。更好的方式是组件在打开菜单时通过 registry 或 callback 提供数据。

### 6.3 菜单项模型

建议定义统一结构：

```ts
interface AppContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  action: () => void | Promise<void>;
}
```

菜单状态：

```ts
interface AppContextMenuState {
  x: number;
  y: number;
  area: string;
  items: AppContextMenuItem[];
}
```

### 6.4 菜单生成策略

可以使用中心函数：

```ts
function buildContextMenu(event: MouseEvent): AppContextMenuItem[]
```

或使用 registry：

```ts
contextMenuRegistry.register("terminal", buildTerminalMenu)
contextMenuRegistry.register("composer", buildComposerMenu)
```

第一阶段建议从中心函数开始，等区域增多后再抽 registry。

## 7. 区域菜单设计

### 7.1 Composer 输入区

Composer 是 contenteditable，并且已有自定义输入处理逻辑。因此右键菜单不能只靠普通 textarea API。

建议菜单：

- Cut
- Copy
- Paste
- Select All
- Clear

注意点：

- readonly 时禁用 Cut / Paste / Clear。
- Copy 需要读取当前 selection。
- Paste 需要走 ComposerEditor 自己的插入逻辑，否则可能破坏 token、slash command、resource link 渲染。
- Select All 需要调用 ComposerEditor 暴露的方法或对 contenteditable root 设置 selection。

### 7.2 普通 input / textarea

覆盖对象：

- 测试日志 textarea。
- branch name input。
- Caller rename input。
- 设置页 numeric input。

建议菜单：

- Cut
- Copy
- Paste
- Select All
- Clear

实现相对简单，可直接基于 `HTMLInputElement` / `HTMLTextAreaElement` selectionStart、selectionEnd、value 处理。

### 7.3 已提交反馈只读区

建议菜单：

- Copy selection
- Copy all submitted feedback
- Copy markdown
- Select all

后续可扩展：

- Collapse section
- Expand section
- Copy section

### 7.4 Sidebar / Session 列表

建议菜单：

- Open session
- Copy request name
- Copy project path
- Copy caller alias
- Remove session
- Hide caller

危险操作如 Remove session 应使用 danger 样式，并保留确认机制。

### 7.5 Caller tabs

建议菜单：

- Activate caller
- Hide from top bar
- Sort callers by workspace
- Copy alias
- Copy workspace path

### 7.6 Dock tabs

当前已有菜单。建议分两步：

第一阶段：保留 `DockColumn.tsx` 现有菜单，并让全局菜单跳过 dock tab。

第二阶段：迁移到 AppContextMenuProvider。

迁移后菜单项：

- Move to left sidebar
- Move to left page
- Move to right page
- Move to right sidebar
- Toggle tab bar position
- Close / hide panel，后续可选

### 7.7 MLC 文档列表

建议菜单：

- Open document
- Open in preview
- Copy path
- Copy MLC link/reference
- Reveal in resources，后续可选

### 7.8 项目资源管理器

建议菜单：

- Open
- Copy path
- Copy relative path
- Reveal in explorer
- Refresh directory
- Attach to feedback，后续可选

### 7.9 终端区域

终端是独立重点。当前 `TerminalPanel.tsx` 已有部分能力可复用：

- `copySelection()`
- `restartActiveTab()`
- `clearActiveTab()`

建议菜单：

- Copy selection
- Paste
- Select all
- Clear terminal
- Restart terminal
- Kill tab
- New terminal

注意点：

- xterm selection 需要通过 xterm API 获取。
- Paste 需要写入 PTY，而不是写入 DOM。
- Copy selection 在无选区时应 disabled。
- Clear terminal 只清当前 tab output。

### 7.10 设置页

设置页右键通常不需要业务菜单。

建议：

- 对 input / textarea 使用编辑菜单。
- 对其他区域使用空菜单或简单 Copy selection。
- 不显示浏览器默认菜单。

### 7.11 Preview Browser

需要拆分两类：

React chrome 区域：

- 地址栏
- toolbar
- tab UI
- preview info panel

这些可以由 AppContextMenuProvider 覆盖。

Native webview 内部网页：

- React 根监听不一定能捕获。
- 可能需要 Tauri webview 层配置。
- 也可能需要向网页注入 JS 捕获 `contextmenu`。
- 若网页本身有右键菜单，还需要决定是否尊重页面菜单。

建议把 native webview 内部网页右键作为单独专题处理。

## 8. 实施路线

### Phase 1：React 主 UI 最小右键治理

范围：不含 native preview webview 内部网页。

任务：

- 新建 `AppContextMenuProvider`。
- 新建 `AppContextMenu` overlay 组件。
- 新建菜单 item 类型和定位工具。
- 根部捕获 `contextmenu`。
- 对普通文本和输入区提供基础编辑菜单。
- 对终端提供最小菜单：Copy selection、Paste、Clear。
- 对只读区提供 Copy selection。
- 对 fallback 区域阻止原生菜单，可显示简短空菜单或不显示菜单。
- 保留 dock tab 现有菜单，避免第一阶段冲突。

验收：

- 在主 UI 空白区域右键不再出现原生浏览器菜单。
- 输入区仍可右键粘贴。
- 已提交反馈仍可右键复制。
- 终端可右键复制选区。
- dock tab 原有菜单不回归。

### Phase 2：迁移 dock tab 菜单

任务：

- 将 `DockColumn.tsx` 的 `tabBarMenu` 迁移到统一 provider。
- 复用现有菜单项和行为。
- 删除局部重复状态和关闭逻辑。

验收：

- dock tab 右键行为不变。
- 菜单样式和其他区域统一。
- 关闭逻辑统一。

### Phase 3：业务区域菜单增强

任务：

- Sidebar session 菜单。
- Caller tab 菜单。
- MLC document 菜单。
- Resource item 菜单。
- Readonly section 菜单。

验收：

- 常见对象均有业务相关菜单。
- 危险操作有确认。
- 菜单项 disabled 状态正确。

### Phase 4：Preview Browser native webview 专项

任务：

- 调研 Tauri WebView 是否支持禁用默认 context menu。
- 若支持，接入 WebView 配置。
- 若不支持，评估注入 JS 捕获 `contextmenu`。
- 区分用户页面自身菜单和 MLFB 框架菜单。

验收：

- 明确 native webview 内部是否可完全接管。
- 不破坏页面自身基本交互。

## 9. 风险与应对

### 9.1 输入体验回退

风险：阻止原生菜单后 Copy / Paste 不完整。

应对：Phase 1 必须先补基础编辑菜单，再全局屏蔽原生菜单。

### 9.2 contenteditable 插入破坏 token

风险：ComposerEditor 内部有 token、slash command、resource link 等逻辑，直接改 DOM 会破坏状态。

应对：给 ComposerEditor 暴露命令式 handle，例如 `copySelection`、`pasteText`、`selectAll`、`clear`。

### 9.3 xterm 右键处理不一致

风险：xterm 的 selection、paste、focus 与普通 DOM 不同。

应对：终端菜单使用 TerminalPanel 内部 API 或通过 terminal store 专门暴露 action。

### 9.4 Native webview 不可拦截

风险：Preview Browser 内部网页不是 React DOM，根事件捕获不到。

应对：将其拆到 Phase 4，单独调研 Tauri WebView 能力。

### 9.5 与现有 popover/menu 冲突

风险：已有 slash menu、terminal path menu、dock tab menu、settings dialog 等 overlay。

应对：统一 z-index 和 close policy。打开 context menu 时关闭其他轻量 popover，或至少不与其重叠。

## 10. 后续决策点

正式实施前需要确认：

1. 主 UI 空白区域右键是显示空菜单，还是完全无反应。
2. 输入区菜单是否必须包含 Undo / Redo。
3. 是否允许保留 native webview 内部网页的原生菜单。
4. Dock tab 菜单是否在 Phase 1 保留局部实现。
5. 终端右键是否默认 Paste，还是显示菜单。
6. 是否需要一个设置项控制“使用应用右键菜单 / 使用系统默认菜单”。

## 11. 推荐下一步

推荐以后从 Phase 1 开始：

- 不动 native webview 内部网页。
- 不立即迁移 dock tab 菜单。
- 先建立全局菜单框架。
- 先覆盖 Composer、普通输入、只读区、终端和 fallback 区域。

这样能最大程度解决当前“各区域都是原生浏览器右键”的观感问题，同时把风险控制在 React 主 UI 内。