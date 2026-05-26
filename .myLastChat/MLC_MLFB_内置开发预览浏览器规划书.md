---
title: MLFB 内置开发预览浏览器规划书
description: 规划 Tauri 受控 WebView 主线与外部浏览器扩展兜底方案
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - MLFB
    - browser
    - webview
    - tauri
    - planning
    - security
solved_lists:
    - 明确长期主线采用 Tauri 受控 WebView
    - 明确远期通过外部浏览器扩展提供高兼容兜底
    - 明确任意网站访问与本地权限隔离原则
    - 明确元素选择、结果回传与输入框插入闭环
---

# MLFB 内置开发预览浏览器规划书

> 创建日期：2026-04-26

## 1. 背景与目标

MLFB 目前主要承担 AI Agent 与用户之间的反馈确认窗口角色。随着多 caller、多 session、附件、prompt、结构化问题等能力成熟，一个自然增强方向是：用户在反馈窗口内直接查看开发预览页面，选定页面元素，并把元素信息快速插入到当前反馈输入框中。

本规划聚焦“内置开发预览浏览器”功能。经分析，长期主线确定为：

```text
Tauri 受控 WebView 内置浏览器
+ 远期外部浏览器扩展作为高兼容兜底
```

该路线的核心目标：

- 能访问任意 http/https 网站。
- 默认不把任意远程网站变成拥有本地 Tauri 权限的页面。
- 支持多标签页、地址栏、基础导航、开发工具入口。
- 支持元素选择模式，从网页中提取 selector/text/role/link 等信息。
- 支持将选定元素信息插入 MLFB 当前或最后聚焦的输入目标。
- 长期保留外部浏览器扩展兜底，以覆盖内置 WebView 在登录态、复杂站点、跨域 frame、浏览器兼容性上的短板。

## 2. 非目标与边界

### 2.1 非目标

- 不做通用完整浏览器替代品。
- 不尝试绕过网站登录、权限、CSP、跨域、反自动化或安全策略。
- 不承诺读取跨域 iframe 内部 DOM。
- 不默认保存任意网站敏感数据。
- 不让远程网页直接调用 MLFB 的 Tauri commands。
- 不在第一阶段实现浏览器扩展。

### 2.2 能力承诺分层

可以作为长期目标承诺：

- 任意 http/https 网站可作为顶层页面加载。
- 对主文档普通 DOM 进行元素选择。
- 从选中元素提取多种开发有用信息。
- 插入到 MLFB 输入框。

需要谨慎说明：

- 跨域 iframe 内容受浏览器同源策略限制。
- 部分网站可能限制脚本注入、弹窗、下载、权限请求或 WebView 环境。
- Windows、macOS、Linux 的系统 WebView 能力存在差异。

## 3. 当前项目现状

### 3.1 前端现状

- 主应用入口：`app/src/App.tsx`
- 主 UI：`app/src/components/FeedbackApp.tsx`
- 输入组件：`app/src/components/FeedbackInput.tsx`
- 测试日志与附件组件：`app/src/components/CallerPanelParts.tsx`
- Markdown 链接当前通过 `@tauri-apps/plugin-opener` 打开系统浏览器。
- 当前没有内置浏览器组件、browser store、webview 管理器或插入目标注册器。

### 3.2 Tauri/Rust 现状

- Tauri 配置位于 `app/src-tauri/tauri.conf.json`。
- 当前只有一个主窗口 `main`。
- Capability 位于 `app/src-tauri/capabilities/default.json`，主要授权主窗口本地页面使用窗口、事件、opener、clipboard、autostart 等能力。
- IPC 服务位于 `app/src-tauri/src/ipc.rs`，当前用于 MCP feedback request/response。
- 当前没有 preview webview/window 管理命令。

### 3.3 安全现状

- 主窗口运行的是本地 app UI，因此可持有 Tauri 权限。
- 任意远程网页若作为 WebView 加载，必须单独管理权限边界。
- Tauri capability 支持按 window/webview/remote URL 细分权限，因此可构建“主窗口有权限、远程预览页无权限”的隔离模型。

## 4. 长期总体架构

### 4.1 架构分层

```text
MLFB App Shell
  - React UI
  - Caller/session/composer store
  - Browser tab strip/address bar/toolbar
  - InsertTargetRegistry
  - 拥有本地 Tauri 权限

Browser Host Layer
  - Tauri/Rust 管理 WebView 或 WebviewWindow
  - 创建、导航、显示、隐藏、关闭 webview
  - 注入一次性 picker 脚本
  - 接收或拉取纯 selection result
  - 校验 URL 与 payload

Web Page Sandbox
  - 任意 http/https 网站
  - 无 MLFB store 权限
  - 无 Tauri command 权限
  - 只能作为被浏览、被注入选择脚本的页面

External Browser Extension Fallback
  - Chrome/Edge/Firefox 扩展
  - 在真实浏览器中运行 content script
  - 通过受控桥把选择结果传给 MLFB
```

### 4.2 核心原则

#### 远程网页零本地权限

不要给 `https://*` 或任意公网 URL 配置可访问 MLFB 本地命令的 remote capability。远程页面永远不应直接调用：

- session 修改命令
- 文件系统命令
- clipboard 命令
- shell 命令
- 窗口管理命令
- 任意 feedback submit 命令

#### 宿主控制注入

元素选择脚本由 MLFB 宿主主动注入。网页不会常驻拥有 MLFB bridge。

#### 选择结果纯数据化

从网页回到 MLFB 的内容必须是普通 JSON 数据，而不是可执行脚本。

#### 插入目标由 MLFB 管理

用户点击网页后，原输入框会失焦。因此“插到哪里”不能依赖当前 `document.activeElement`，必须由 MLFB 主窗口维护最后聚焦的输入目标。

## 5. 推荐实现路线

### 5.1 Phase 0 使用 WebviewWindow spike

第一步用独立预览窗口验证技术闭环，不直接嵌入主窗口。

原因：

- 创建独立 window 比主窗口内多 WebView 布局同步简单。
- 能快速验证任意网站加载、脚本注入、元素选择、结果回传。
- 风险集中在核心技术，不被复杂 UI 布局干扰。

### 5.2 Phase 1 进入主窗口内嵌 WebView

技术闭环稳定后，改造成 MLFB 内置面板。

主窗口 React 负责：

- tab strip
- address bar
- toolbar
- insert format selector
- panel resize/collapse

Tauri WebView 负责：

- 页面渲染
- 导航
- picker 注入目标

### 5.3 Phase 2 多标签页

每个 tab 对应一个 webview label。React store 维护 tab metadata，Tauri 维护实际 webview lifecycle。

### 5.4 Phase 3 外部浏览器扩展兜底

当内置 WebView 遇到以下情况时，用户可切换到扩展方案：

- 网站在系统 WebView 表现异常。
- 需要使用真实 Chrome/Edge/Firefox 登录态。
- 需要在浏览器 DevTools 场景中选择元素。
- 需要更好处理复杂 frame 或页面权限。

## 6. 数据模型设计

### 6.1 Browser Store

新增 store 文件建议：

```text
app/src/store/previewBrowserStore.ts
```

核心类型：

```ts
export interface PreviewTab {
  id: string;
  webviewLabel: string;
  url: string;
  title: string;
  status: "idle" | "loading" | "error";
  errorMessage?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  selectedElement: PickedElement | null;
  createdAt: string;
  updatedAt: string;
}

export interface PickedElement {
  url: string;
  frameUrl?: string;
  selector: string;
  selectorType: "id" | "testid" | "role" | "aria" | "css" | "nth";
  tagName: string;
  text: string;
  role?: string;
  ariaLabel?: string;
  title?: string;
  href?: string;
  src?: string;
  inputName?: string;
  inputType?: string;
  placeholder?: string;
  htmlSnippet?: string;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  locatorCandidates: LocatorCandidate[];
  pickedAt: string;
}

export interface LocatorCandidate {
  kind: "css" | "playwright-role" | "playwright-text" | "testid" | "xpath";
  value: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}
```

Store 字段：

```ts
interface PreviewBrowserState {
  enabled: boolean;
  panelOpen: boolean;
  tabs: PreviewTab[];
  activeTabId: string | null;
  pickerMode: "off" | "arming" | "active";
  defaultInsertFormat: InsertFormat;
  allowedUrlMode: "any-http" | "localhost-only" | "allowlist";
  allowlist: string[];
}
```

### 6.2 Insert Target Registry

新增文件建议：

```text
app/src/browser/insertTargetRegistry.ts
```

目标类型：

```ts
export type InsertTargetKind =
  | "feedback"
  | "queued-feedback"
  | "test-log"
  | "queued-test-log"
  | "question-answer"
  | "git-branch";

export interface InsertTarget {
  id: string;
  kind: InsertTargetKind;
  callerId: string | null;
  sessionId?: string;
  questionIndex?: number;
  selectionStart?: number;
  selectionEnd?: number;
  focusedAt: number;
}
```

每个可插入输入框在 focus/selection change 时更新 registry。

插入时优先级：

1. 最后聚焦且仍存在 DOM ref 的输入框。
2. 最后聚焦但 DOM ref 不存在时，通过 store action 更新对应字段。
3. 当前 active caller/session 的主 feedback composer。
4. 若无 caller，则提示用户先聚焦一个输入框。

## 7. Tauri/Rust 设计

### 7.1 Preview Manager

新增 Rust 模块建议：

```text
app/src-tauri/src/preview_browser.rs
```

职责：

- 管理 preview webview/window label。
- 创建 preview tab。
- 导航 URL。
- 注入 picker 脚本。
- 关闭 tab。
- 清理浏览数据。
- 可选：DevTools toggle。

状态示例：

```rust
pub struct PreviewBrowserState {
    tabs: Mutex<HashMap<String, PreviewTabRuntime>>,
}

pub struct PreviewTabRuntime {
    pub tab_id: String,
    pub webview_label: String,
    pub current_url: String,
}
```

### 7.2 Tauri commands

建议命令：

```rust
#[tauri::command]
async fn preview_create_tab(url: String) -> Result<PreviewTabPayload, String>;

#[tauri::command]
async fn preview_navigate(tab_id: String, url: String) -> Result<(), String>;

#[tauri::command]
async fn preview_close_tab(tab_id: String) -> Result<(), String>;

#[tauri::command]
async fn preview_start_picker(tab_id: String) -> Result<(), String>;

#[tauri::command]
async fn preview_stop_picker(tab_id: String) -> Result<(), String>;

#[tauri::command]
async fn preview_clear_browsing_data() -> Result<(), String>;

#[tauri::command]
async fn preview_open_devtools(tab_id: String) -> Result<(), String>;
```

对于 Phase 0，命令可以更少：

- `preview_create_window`
- `preview_start_picker`
- `preview_close_window`

### 7.3 事件

从 Rust/preview manager 发给主窗口：

```text
preview-tab-created
preview-tab-navigated
preview-tab-loading
preview-tab-error
preview-element-picked
preview-picker-cancelled
```

`preview-element-picked` payload 必须是 `PickedElement` 的 JSON 形式。

### 7.4 URL 校验

必须统一 URL normalize：

- 无 scheme 时默认补 `https://` 或按设置补 `http://`。
- 允许 `http:` 和 `https:`。
- 禁止 `javascript:`。
- 禁止默认 `file:`。
- 禁止空 hostname。
- 可选：对 `localhost`、`127.0.0.1`、`[::1]` 提供快捷识别。

### 7.5 Capability 策略

主窗口 capability：

- 保留当前 MLFB 本地权限。
- 新增必要 webview 管理权限。

Preview webview/window capability：

- 默认不给 Tauri commands。
- 如果必须给远程页面回传能力，必须只给极窄的命令，并限制来源和 payload。
- 更推荐由宿主层注入脚本后通过宿主 eval/事件机制取回结果，而不是暴露通用 invoke。

建议原则：

```text
main app webview: privileged
preview page webview: unprivileged
picker bridge: host-controlled, one-shot, data-only
```

## 8. 元素选择器设计

### 8.1 Picker 脚本职责

Picker 脚本注入网页后只做这些事情：

- 创建 hover overlay。
- 监听 mousemove，高亮当前元素。
- 监听 click，阻止默认行为，提取元素信息。
- 监听 Escape，取消选择。
- 选择或取消后清理所有 listener 和 overlay。

不做这些事情：

- 不读 cookie。
- 不读 localStorage/sessionStorage。
- 不发网络请求。
- 不调用任意本地命令。
- 不长期驻留。

### 8.2 元素信息提取

提取字段：

- 当前 URL。
- frame URL。
- tagName。
- textContent 裁剪结果。
- id/class。
- data-testid/data-test/data-cy。
- role。
- aria-label。
- title。
- href/src。
- input name/type/placeholder。
- rect。
- html snippet。

文本裁剪建议：

- `text` 最大 500 字符。
- `htmlSnippet` 最大 1000 字符。
- 清理连续空白。

### 8.3 Selector 优先级

生成 selector 和 locator candidates 时按优先级：

1. 唯一 `id`。
2. `data-testid` / `data-test` / `data-cy`。
3. 可访问角色与名称。
4. `aria-label`。
5. `name` / `placeholder`。
6. 稳定 class 组合。
7. DOM path + `nth-of-type` fallback。

### 8.4 Playwright 友好输出

因为该功能面向开发反馈，Playwright locator 通常比纯 CSS selector 更有价值。

示例候选：

```text
page.getByRole('button', { name: 'Save' })
page.getByTestId('save-settings')
page.locator('button[data-testid="save-settings"]')
page.getByPlaceholder('Search')
```

## 9. 插入格式设计

### 9.1 插入格式

```ts
export type InsertFormat =
  | "text"
  | "css-selector"
  | "playwright-locator"
  | "markdown-link"
  | "diagnostic-block"
  | "html-snippet";
```

### 9.2 格式示例

#### Text

```text
Save settings
```

#### CSS Selector

```text
button[data-testid="save-settings"]
```

#### Playwright Locator

```text
page.getByRole('button', { name: 'Save settings' })
```

#### Markdown Link

```md
[Pricing](https://example.com/pricing)
```

#### Diagnostic Block

```md
## Selected Element

- URL: https://example.com/settings
- Selector: button[data-testid="save-settings"]
- Locator: page.getByRole('button', { name: 'Save settings' })
- Text: Save settings
- Role: button
```

### 9.3 插入行为

- 默认插入 diagnostic block，适合反馈给 AI Agent。
- 工具栏可提供一键插入 selector/text/locator。
- 插入时尊重最后记录的 selection range。
- 插入后可选择是否把焦点带回 MLFB 输入框。

## 10. UI/UX 设计

### 10.1 入口

标题栏右侧增加浏览器按钮：

- 图标：browser/window/search 类图标。
- tooltip：`开发预览浏览器` / `Preview browser`。
- 点击打开或关闭 preview panel。

### 10.2 Phase 1 面板布局

宽屏：右侧 split panel。

窄屏：底部 drawer 或独立 window fallback。

面板组成：

```text
PreviewBrowser
  Toolbar
    Back / Forward / Reload
    AddressBar
    Open external
    DevTools
    Pick element
    Insert format menu
  TabStrip
  WebViewViewport
  SelectionStatusBar
```

### 10.3 多列 MLFB 兼容

当前 MLFB 支持多 caller 多列。浏览器面板不应默认挤压到不可用。

建议：

- 面板默认关闭。
- 开启后占右侧 35% 宽度，最小 360px。
- 多列 caller 较多时，浏览器面板可自动变成底部 drawer。
- 用户可拖拽调整大小。

### 10.4 选择模式视觉

选择模式时：

- toolbar 按钮进入 active 状态。
- 页面内 hover 元素显示半透明高亮框。
- 状态栏显示当前元素简短描述。
- Escape 取消。
- 点击元素后退出 picker mode，并显示已选元素摘要。

### 10.5 当前插入目标提示

在浏览器状态栏显示：

```text
Insert target: Feedback · Caller 0EA6
```

如果没有插入目标：

```text
Focus an input field in MLFB before inserting
```

## 11. 外部浏览器扩展兜底方案

### 11.1 目的

外部扩展不是 Phase 1 必需项，而是长期兜底：当内置 WebView 无法很好处理某些任意网站时，用户仍可在真实浏览器中选择元素并回传 MLFB。

### 11.2 扩展架构

```text
Browser Extension
  - content script: hover/click picker
  - background service worker: 管理连接
  - popup/command: 启动选择模式

Bridge
  - Native Messaging 或 localhost bridge
  - 与 MLFB Tauri app 通信

MLFB
  - 接收 PickedElement
  - 插入到 InsertTargetRegistry 指向的输入框
```

### 11.3 连接方式比较

| 方式 | 优点 | 缺点 |
|------|------|------|
| Native Messaging | 浏览器官方机制，安全边界清晰 | 安装配置复杂，跨浏览器维护较多 |
| localhost bridge | 实现直观，可与现有 IPC 思路接近 | 需要端口、安全 token、CORS 管理 |
| WebSocket bridge | 实时体验好 | 同样需要认证和端口管理 |

推荐初期使用 localhost/WebSocket bridge，正式版再评估 Native Messaging。

### 11.4 安全要求

- 扩展连接 MLFB 必须有一次性 token 或本地配对码。
- 只接收 selection result，不接收可执行代码。
- MLFB 应显示结果来源：内置浏览器或外部扩展。
- 用户可关闭扩展桥。

## 12. 分阶段实施计划

### Phase 0：技术 Spike

目标：验证核心闭环，不追求正式 UI。

范围：

- 创建一个独立 preview WebviewWindow。
- 加载任意 http/https URL。
- 注入 picker 脚本。
- 在页面中选择元素。
- 取得 PickedElement 数据。
- 插入最后聚焦的主 feedback 输入框。

建议限制：

- 先支持主文档 DOM。
- 先不做多标签。
- 先不做复杂面板布局。
- URL 默认允许任意 http/https，但安全地不给远程页面 Tauri 权限。

验收标准：

- 能打开 `https://example.com`。
- 能打开本地 Vite/React dev server。
- 能选择一个按钮/链接/输入框。
- 能插入 selector/text/diagnostic block 到 MLFB。
- 选择结束后 picker overlay 清理干净。

### Phase 1：内嵌单标签面板

目标：形成可用的 MLFB 内置体验。

范围：

- PreviewBrowser React 面板。
- 单 active webview。
- 地址栏、刷新、外部打开。
- Pick element 按钮。
- 插入格式菜单。
- InsertTargetRegistry 支持 feedback、test-log、question-answer。

验收标准：

- 面板可打开/关闭。
- 面板 resize 后 WebView bounds 正确。
- 当前输入目标提示准确。
- 选择结果可插入不同输入框。

### Phase 2：多标签页

目标：实现简易多标签浏览器。

范围：

- TabStrip。
- 新建、关闭、切换 tab。
- 每个 tab 独立 URL、title、selectedElement。
- inactive webview hide。
- 可选恢复上次 tabs。

验收标准：

- 多 tab 间切换稳定。
- 每个 tab 的选择结果不串线。
- 关闭 tab 时对应 webview 释放。

### Phase 3：开发者增强

范围：

- DevTools 按钮。
- viewport 尺寸预设。
- localhost 端口收藏。
- 清理浏览数据。
- selector/locator 质量优化。
- Shadow DOM 支持增强。

### Phase 4：外部浏览器扩展兜底

范围：

- Chrome/Edge 扩展 prototype。
- content script picker。
- localhost/WebSocket bridge。
- MLFB 接收外部 PickedElement。
- 与内置浏览器共享插入格式和 InsertTargetRegistry。

## 13. 测试计划

### 13.1 基础浏览

- 打开 http 网站。
- 打开 https 网站。
- 输入无 scheme URL 自动 normalize。
- 禁止 javascript URL。
- 禁止默认 file URL。
- 重定向后状态正确。

### 13.2 元素选择

- 普通按钮。
- 链接。
- 输入框。
- 图片。
- data-testid 元素。
- aria-label 元素。
- 无稳定属性的 nth fallback 元素。
- Escape 取消。

### 13.3 插入目标

- 主反馈输入框。
- 队列反馈输入框。
- 测试日志输入框。
- question answer 输入框。
- 原输入框失焦后仍插入正确。
- selection range 插入位置正确。

### 13.4 多标签

- 新建多个 tab。
- 快速切换 tab。
- 关闭 active tab。
- 关闭 inactive tab。
- tab 关闭后 webview 释放。

### 13.5 安全

- 远程网页无法调用 MLFB Tauri commands。
- picker payload 超长时被截断。
- 插入内容作为文本处理，不执行脚本。
- 外部扩展桥未配对时无法发送数据。

## 14. 风险与取舍

### 14.1 任意网站与安全的张力

任意网站可以加载，但不能拥有任意权限。必须牺牲“网页直接调用本地能力”的便利，换取安全边界。

### 14.2 系统 WebView 差异

Tauri 受控 WebView 的轻量性来自系统 WebView，但代价是跨平台表现不完全一致。若某些网站在系统 WebView 表现不佳，外部浏览器扩展是兜底。

### 14.3 WebView 布局复杂度

内嵌 WebView 不一定像普通 div 一样跟随 React 布局。需要专门处理 bounds 同步。

### 14.4 跨域 frame 限制

任意网站里大量内容可能在跨域 iframe 内。内置 WebView 主线不应承诺突破同源限制。扩展和 DevTools 协议可能改善，但仍需遵守浏览器安全模型。

### 14.5 包体积取舍

不推荐一开始集成 CEF/Chromium。虽然它能力最强，但会显著增加包体积和维护成本，不符合 MLFB 轻量桌面工具定位。

## 15. 建议文件清单

### 前端

```text
app/src/components/PreviewBrowser.tsx
app/src/components/PreviewBrowserToolbar.tsx
app/src/components/PreviewBrowserTabs.tsx
app/src/components/PreviewBrowserStatusBar.tsx
app/src/store/previewBrowserStore.ts
app/src/browser/insertTargetRegistry.ts
app/src/browser/insertFormats.ts
app/src/browser/pickedElement.ts
```

### Rust

```text
app/src-tauri/src/preview_browser.rs
```

### 配置

```text
app/src-tauri/capabilities/default.json
app/src-tauri/tauri.conf.json
```

### 未来扩展

```text
browser-extension/
browser-extension/manifest.json
browser-extension/src/content-script.ts
browser-extension/src/background.ts
browser-extension/src/picker.ts
```

## 16. 最终结论

MLFB 内置开发预览浏览器的长期最优主线是 Tauri 受控 WebView：

- 它能保持 MLFB 的轻量桌面应用定位。
- 它能访问任意 http/https 顶层网站。
- 它能通过宿主控制注入实现元素选择。
- 它能把网页沙箱和 MLFB 本地权限隔离开。

同时，任意网站的高兼容需求天然接近浏览器扩展领域。因此远期应配套外部浏览器扩展作为兜底：

- 内置 WebView 提供一体化体验。
- 外部扩展提供真实浏览器兼容性。
- 两者共享 PickedElement 数据结构、插入格式和 InsertTargetRegistry。

推荐下一步先做 Phase 0 技术 spike。只要“打开任意 URL、注入 picker、选择元素、回传纯数据、插入 MLFB 输入框”闭环成立，再进入正式内嵌面板与多标签实现。