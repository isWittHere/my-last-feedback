---
title: MLFB VSCode式内嵌预览浏览器 Phase1-2规划书
description: 规划主窗口内嵌WebView浏览器tab、元素附件与console抓取闭环
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - MLFB
    - browser
    - webview
    - tauri
    - dock
    - planning
    - console
    - attachment
solved_lists:
    - 明确目标为VS Code式主窗口内嵌浏览器tab
    - 限定实施范围为Phase 1内嵌单页闭环与Phase 2浏览器多标签
    - 明确页面元素附件与console抓取作为WebAttachment接入反馈
    - 明确Tauri child WebView与React dock bounds同步为核心技术路线
---

# MLFB VSCode式内嵌预览浏览器 Phase1-2规划书

> 创建日期：2026-04-26

## 1. 背景与目标

MLFB 当前已经具备多 caller、多 session、三栏 dock、MLC 知识库、项目资源管理器、Markdown 预览和附件提交能力。下一步希望在主窗口内部增加一个类似 VS Code Simple Browser / Webview tab 的开发预览浏览器，用于在反馈窗口中直接查看本地或远程开发页面，选择页面元素，并抓取 console 信息作为反馈上下文。

本规划以用户确认的范围为准：只覆盖 Phase 1 和 Phase 2。

Phase 1：主窗口内嵌单页浏览器闭环。

Phase 2：浏览器内部多标签页。

明确不采用第一版独立预览窗口方案。本功能目标是：网页内容直接嵌在 MLFB 主窗口的一个 tab 页面内，体验接近 VS Code 中的内嵌浏览器 tab。

## 2. 目标体验

用户在 MLFB 中打开一个新的 `Preview Browser` tab 后，应看到类似如下结构：

```text
[Preview Browser]

[🌐 127.0.0.1:8000  x] [+]                              [...]
←  →  ⟳  [ http://127.0.0.1:8000/                    ]  ◎  console  ...
────────────────────────────────────────────────────────────────────
Embedded WebView viewport

可选底部区域：
Selected element / Console entries / Attachments
```

核心体验：

- 浏览器作为主窗口内部 tab 出现，而不是外部窗口。
- 地址栏支持输入 `http://127.0.0.1:8000/`、`https://example.com` 等 URL。
- 可后退、前进、刷新、停止加载。
- 页面加载失败时在内嵌区域显示错误页，而不是弹窗。
- 可进入元素选择模式，点击页面元素后生成结构化元素附件。
- 可抓取 console 信息，并生成 console snapshot 附件。
- 附件挂到当前反馈目标，提交时自动格式化为 Markdown 上下文。

## 3. 非目标

第一版不做以下内容：

- 不做独立 preview window 作为主方案。
- 不做外部浏览器扩展。
- 不做完整 Chrome DevTools 替代。
- 不做完整 Network 面板。
- 不承诺读取跨域 iframe 内部 DOM。
- 不承诺捕获注入脚本之前已经输出的 console 历史。
- 不默认允许 `file:`、`javascript:`、`data:` 等危险或复杂 URL scheme。
- 不让任意远程网页拥有 MLFB 的文件、shell、clipboard、session 修改等本地权限。

## 4. 当前项目基础

### 4.1 已有三栏 dock

当前 dock 列：

- `leftSidebar`
- `leftPage`
- `rightSidebar`

当前 dock tab：

- `mlc`
- `mlcPreview`
- `resources`

浏览器应新增为：

```ts
export type SidePanelTab = "mlc" | "resources" | "mlcPreview" | "previewBrowser";
```

默认建议将 `previewBrowser` 放入 `leftPage` 或 `rightSidebar`。从浏览器可用性看，`leftPage` 更像页面级扩展区，适合承载预览浏览器。

### 4.2 已有附件通道

当前已有：

- 图片附件：`images`
- 测试日志：`testLogText`
- MLC 引用：`mlcAttachments`
- 项目资源 Markdown 链接插入：`mlfb-insert-feedback-text`

Web 元素和 console 信息不应简单塞进 MLC 引用或测试日志里。建议新增一等附件类型 `WebAttachment`，以便 UI 展示、删除、提交格式化和未来扩展。

### 4.3 已有 focus 目标

当前 store 中已有 `focusedComposer`，能记录最近聚焦的反馈输入目标：

- `feedback`
- `testLog`
- `question`
- `queuedDraft`

第一版可基于 `focusedComposer` 把 WebAttachment 附加到当前 session 或 queued draft。后续如果需要精确插入到光标位置，再升级为完整 `InsertTargetRegistry`。

## 5. 总体架构

推荐架构：

```text
React Main Window
  FeedbackApp
    DockColumn
      PreviewBrowserPanel
        BrowserTabStrip
        BrowserToolbar
        BrowserViewportHost
        BrowserInspectorDrawer

Tauri Runtime
  preview_browser.rs
    PreviewBrowserState
    PreviewTabRuntime
    child WebView lifecycle
    bounds sync
    navigation
    picker injection
    console capture injection
    bridge event validation

Remote Page WebView
  arbitrary http/https page
  injected picker script
  injected console capture script
  narrow bridge event only
```

核心原则：

- React 画 UI chrome。
- Tauri WebView 画网页内容。
- React 容器负责计算 viewport rect。
- Rust 根据 rect 调整 child WebView bounds。
- 远程页面只回传 JSON 数据，不直接修改 MLFB 状态。
- 用户显式点击 Attach 后，捕获结果才进入反馈附件。

## 6. Phase 1：内嵌单页闭环

### 6.1 Phase 1目标

Phase 1 只需要一个浏览器页面，但必须跑通完整闭环：

- 打开内嵌浏览器 tab。
- 输入 URL 并加载页面。
- 同步 WebView bounds。
- 切换 dock tab 或折叠列时隐藏 WebView。
- 选择页面元素并回传到 MLFB。
- 捕获 console 信息并回传到 MLFB。
- 将选中元素和 console snapshot 附加到当前反馈。
- 提交时格式化为 Markdown。

### 6.2 Phase 1用户流程

#### 打开浏览器

```text
用户点击反馈区工具按钮或 dock tab
  openDockTab("previewBrowser", "leftPage")
  PreviewBrowserPanel 挂载
  如果没有 runtime tab，创建一个默认 blank tab
```

#### 导航页面

```text
用户输入 URL 并按 Enter
  normalize URL
  invoke preview_navigate(tabId, url)
  Rust 创建或复用 child WebView
  WebView 加载页面
  main window 接收 loading/title/url/error 事件
```

#### 选择元素

```text
用户点击 Pick element
  invoke preview_start_picker(tabId)
  Rust eval picker script
  页面内 hover 高亮元素
  用户点击元素
  picker 提取 PickedElement
  bridge 回传 preview-element-picked
  PreviewBrowserPanel 显示选中元素卡片
  用户点击 Attach
  addSessionWebAttachment 或 addQueuedDraftWebAttachment
```

#### 捕获 console

```text
页面加载时注入 console capture
  包装 console 方法和错误事件
  console entry 回传 main window
  PreviewBrowserPanel 显示 console 列表
  用户点击 Attach console
  生成 console WebAttachment
```

### 6.3 Phase 1前端文件

建议新增：

```text
app/src/store/previewBrowserStore.ts
app/src/components/PreviewBrowserPanel.tsx
app/src/components/PreviewBrowserToolbar.tsx
app/src/components/PreviewBrowserViewport.tsx
app/src/components/PreviewBrowserInspector.tsx
app/src/browser/webAttachmentFormat.ts
app/src/browser/urlUtils.ts
app/src/browser/pickedElement.ts
```

也可以第一版先合并为较少文件，稳定后再拆分。但为了避免 `PreviewBrowserPanel.tsx` 过大，建议至少拆出 formatter 和类型文件。

### 6.4 Phase 1后端文件

建议新增：

```text
app/src-tauri/src/preview_browser.rs
```

修改：

```text
app/src-tauri/src/lib.rs
app/src-tauri/capabilities/default.json
app/src-tauri/tauri.conf.json
```

是否需要修改 `tauri.conf.json` 取决于 child WebView 权限、CSP 和 dev 配置需求。

### 6.5 Phase 1前端状态模型

```ts
export type PreviewLoadStatus = "idle" | "loading" | "loaded" | "error";
export type PreviewPickerMode = "off" | "arming" | "active";

export interface PreviewBrowserState {
  tabs: PreviewBrowserTab[];
  activeTabId: string | null;
  pickerMode: PreviewPickerMode;
  consoleFilter: "all" | "warnings-errors" | "errors";
  inspectorMode: "selected" | "console" | "attachments";
  createTab: (url?: string) => Promise<string>;
  closeTab: (tabId: string) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  navigate: (tabId: string, url: string) => Promise<void>;
  reload: (tabId: string) => Promise<void>;
  goBack: (tabId: string) => Promise<void>;
  goForward: (tabId: string) => Promise<void>;
  startPicker: (tabId: string) => Promise<void>;
  stopPicker: (tabId: string) => Promise<void>;
  attachSelectedElement: (tabId: string) => void;
  attachConsoleSnapshot: (tabId: string) => void;
}
```

单页 Phase 1 中也使用 tabs 数组，是为了 Phase 2 平滑升级。

### 6.6 PreviewBrowserTab

```ts
export interface PreviewBrowserTab {
  id: string;
  webviewLabel: string;
  url: string;
  pendingUrl: string;
  title: string;
  faviconUrl?: string;
  status: PreviewLoadStatus;
  errorMessage?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  selectedElement: PickedElement | null;
  consoleEntries: WebConsoleEntry[];
  createdAt: string;
  updatedAt: string;
}
```

### 6.7 PickedElement

```ts
export interface PickedElement {
  sourceUrl: string;
  frameUrl?: string;
  tagName: string;
  text: string;
  role?: string;
  ariaLabel?: string;
  title?: string;
  href?: string;
  src?: string;
  id?: string;
  className?: string;
  name?: string;
  placeholder?: string;
  inputType?: string;
  selector: string;
  selectorType: "id" | "testid" | "role" | "aria" | "css" | "nth";
  locatorCandidates: LocatorCandidate[];
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  htmlSnippet?: string;
  capturedAt: string;
}
```

### 6.8 LocatorCandidate

```ts
export interface LocatorCandidate {
  kind: "css" | "playwright-role" | "playwright-text" | "testid" | "xpath";
  value: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}
```

### 6.9 WebConsoleEntry

```ts
export interface WebConsoleEntry {
  id: string;
  level: "log" | "info" | "warn" | "error" | "debug";
  message: string;
  args: string[];
  sourceUrl: string;
  line?: number;
  column?: number;
  stack?: string;
  timestamp: string;
}
```

### 6.10 WebAttachment

建议加入 `feedbackStore.ts`：

```ts
export interface WebAttachment {
  id: string;
  kind: "element" | "console";
  sourceUrl: string;
  pageTitle: string;
  capturedAt: string;
  element?: PickedElement;
  consoleEntries?: WebConsoleEntry[];
}
```

同时扩展：

```ts
export interface FeedbackDraft {
  webAttachments: WebAttachment[];
}

export interface Session {
  webAttachments: WebAttachment[];
}
```

新增 actions：

```ts
addSessionWebAttachment(sessionId: string, attachment: WebAttachment): void;
removeSessionWebAttachment(sessionId: string, attachmentId: string): void;
clearSessionWebAttachments(sessionId: string): void;
addQueuedDraftWebAttachment(callerId: string, attachment: WebAttachment): void;
removeQueuedDraftWebAttachment(callerId: string, attachmentId: string): void;
clearQueuedDraftWebAttachments(callerId: string): void;
```

### 6.11 URL规范化

只允许：

- `http:`
- `https:`

输入规则：

- `localhost:3000` 自动补 `http://`。
- `127.0.0.1:8000` 自动补 `http://`。
- `example.com` 默认补 `https://`。
- 明确 `http://` 或 `https://` 时保留。

禁止：

- `javascript:`
- `file:`
- `data:`
- `blob:`
- 空 hostname

错误提示在地址栏下方或 viewport 错误态展示。

## 7. WebView嵌入与bounds同步

### 7.1 核心问题

内嵌 WebView 不等于 React DOM 节点。它通常由系统 WebView 层渲染，必须显式设置：

- x
- y
- width
- height
- visible
- focus

如果不处理好，会出现：

- WebView 浮在其他面板上。
- 切换 dock tab 后网页仍可见。
- 右键菜单、tooltip、拖拽 ghost 被网页遮挡。
- 窗口 resize 后网页区域错位。

### 7.2 前端同步策略

`PreviewBrowserViewport` 使用：

- `ResizeObserver`
- `requestAnimationFrame`
- `getBoundingClientRect()`
- window resize listener
- dock active/collapsed/tab visibility 状态

同步调用：

```ts
invoke("preview_set_bounds", {
  tabId,
  bounds: {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    scaleFactor: window.devicePixelRatio,
  },
  visible,
});
```

是否需要乘以 device pixel ratio 取决于 Tauri API 接收 logical position 还是 physical position。实现时必须验证。

### 7.3 可见性规则

WebView 仅在以下条件全部满足时可见：

- `PreviewBrowserPanel` 已挂载。
- 外层 dock column 未 collapsed。
- 外层 dock active tab 是 `previewBrowser`。
- browser active tab 存在。
- viewport rect 宽高大于最小值。
- 没有全局拖拽或遮罩需要临时隐藏 WebView。

不可见时必须调用：

```text
preview_hide_tab(tabId)
```

或 `preview_set_bounds(..., visible: false)`。

### 7.4 焦点规则

点击网页区域后焦点进入 WebView。点击 MLFB 地址栏、按钮、反馈输入框后焦点回到 React UI。

元素选择结束后：

- WebView 内清理 picker overlay。
- 主窗口显示 selected element。
- 不强制把焦点打回反馈框，避免打断用户继续浏览。

点击 Attach 后：

- 附件写入当前 target。
- 可短暂提示 attached。

## 8. Rust/Tauri设计

### 8.1 PreviewBrowserState

```rust
pub struct PreviewBrowserState {
    tabs: Mutex<HashMap<String, PreviewTabRuntime>>,
}

pub struct PreviewTabRuntime {
    pub tab_id: String,
    pub webview_label: String,
    pub url: String,
    pub title: String,
    pub bridge_token: String,
    pub visible: bool,
}
```

### 8.2 Commands

Phase 1 需要：

```rust
#[tauri::command]
async fn preview_create_tab(url: Option<String>) -> Result<PreviewTabPayload, String>;

#[tauri::command]
async fn preview_navigate(tab_id: String, url: String) -> Result<(), String>;

#[tauri::command]
async fn preview_reload(tab_id: String) -> Result<(), String>;

#[tauri::command]
async fn preview_go_back(tab_id: String) -> Result<(), String>;

#[tauri::command]
async fn preview_go_forward(tab_id: String) -> Result<(), String>;

#[tauri::command]
async fn preview_set_bounds(tab_id: String, bounds: PreviewBounds, visible: bool) -> Result<(), String>;

#[tauri::command]
async fn preview_show_tab(tab_id: String) -> Result<(), String>;

#[tauri::command]
async fn preview_hide_tab(tab_id: String) -> Result<(), String>;

#[tauri::command]
async fn preview_close_tab(tab_id: String) -> Result<(), String>;

#[tauri::command]
async fn preview_start_picker(tab_id: String) -> Result<(), String>;

#[tauri::command]
async fn preview_stop_picker(tab_id: String) -> Result<(), String>;

#[tauri::command]
async fn preview_bridge_event(tab_id: String, token: String, event: PreviewBridgeEvent) -> Result<(), String>;
```

Phase 2 增加：

```rust
#[tauri::command]
async fn preview_set_active_tab(tab_id: String) -> Result<(), String>;
```

如果 WebView history API 不可直接调用，可先只实现 navigate/reload，后退前进按钮置 disabled，后续补齐。

### 8.3 Events

Rust 发给主窗口：

```text
preview-tab-created
preview-tab-updated
preview-tab-closed
preview-load-started
preview-load-finished
preview-load-error
preview-title-changed
preview-url-changed
preview-element-picked
preview-console-entry
preview-picker-cancelled
```

前端监听后更新 `previewBrowserStore`。

### 8.4 Bridge安全

远程网页不能拥有通用本地权限。若需要让注入脚本回传数据，只能暴露极窄 bridge。

建议 bridge payload 规则：

- 必须带 tabId。
- 必须带随机 token。
- token 与 tab runtime 绑定。
- event kind 仅允许：`console-entry`、`element-picked`、`picker-cancelled`。
- 单次 payload 最大 64KB。
- 单条 console message 最大 4KB。
- console entry rate limit。
- 不执行 payload 内任何脚本。
- 不允许 payload 请求本地文件、shell、clipboard 或 session 修改。

## 9. Picker脚本设计

### 9.1 行为

注入后：

- 创建 overlay 元素。
- mousemove 时高亮当前元素。
- click 时阻止默认行为和冒泡。
- Escape 取消。
- 选择或取消后清理事件监听和 overlay。

### 9.2 信息提取

字段包括：

- sourceUrl
- frameUrl
- tagName
- text
- role
- ariaLabel
- title
- href
- src
- id
- className
- name
- placeholder
- inputType
- selector
- selectorType
- locatorCandidates
- rect
- htmlSnippet

### 9.3 文本截断

- text 最大 500 字符。
- htmlSnippet 最大 1000 字符。
- className 最大 300 字符。
- 每个 attribute value 最大 300 字符。

### 9.4 Selector优先级

1. 唯一 id。
2. `data-testid`、`data-test`、`data-cy`。
3. role + accessible name。
4. aria-label。
5. name / placeholder。
6. 稳定 class 组合。
7. nth-of-type DOM path。

### 9.5 Playwright locator候选

生成示例：

```text
page.getByRole('button', { name: 'Save settings' })
page.getByTestId('save-settings')
page.locator('button[data-testid="save-settings"]')
page.getByPlaceholder('Search')
page.getByText('Welcome')
```

## 10. Console捕获设计

### 10.1 捕获范围

第一版捕获：

- console.log
- console.info
- console.warn
- console.error
- console.debug
- window error
- unhandledrejection

可选捕获：

- fetch failed
- XHR failed

第一版不承诺：

- 注入前历史日志。
- 浏览器内部安全日志。
- 完整 network request/response。
- 跨域 iframe console。

### 10.2 注入时机

理想：创建 WebView 时注册初始化脚本，在 document start 注入 console capture。

兜底：load 后 eval 注入，但要提示可能漏掉早期日志。

### 10.3 序列化规则

Console 参数需要安全序列化：

- string 原样。
- number/boolean/null 转字符串。
- Error 提取 name/message/stack。
- DOM Element 提取 tag/id/class/text 简要信息。
- object 使用安全 JSON stringify，处理循环引用。
- 超长内容截断。

### 10.4 UI显示

Console 面板提供：

- level 过滤：All / Warnings+Errors / Errors。
- clear。
- copy。
- attach snapshot。
- 每条显示 time、level、message。
- error 可展开 stack。

## 11. WebAttachment提交格式

### 11.1 元素附件

提交时格式：

```md
## Attachment: Web Preview

### Selected Element

- URL: http://127.0.0.1:8000/
- Page: Local dev app
- Captured: 2026-04-26 15:20:00
- Selector: button[data-testid="submit"]
- Locator: page.getByRole('button', { name: 'Submit' })
- Text: Submit
- Role: button
- Tag: BUTTON

```html
<button data-testid="submit">Submit</button>
```
```

### 11.2 Console附件

```md
### Console Snapshot

- URL: http://127.0.0.1:8000/
- Page: Local dev app
- Captured: 2026-04-26 15:21:00
- Entries: 3

```text
[error] TypeError: Cannot read properties of undefined
[warn] Failed to fetch /api/user: 404
[log] App mounted
```
```

### 11.3 多附件合并

同一 session 中多个 WebAttachment 提交时可合并为一个 `Attachment: Web Preview` section，内部按捕获时间排序。

```md
## Attachment: Web Preview

### 1. Selected Element
...

### 2. Console Snapshot
...
```

## 12. UI设计细节

### 12.1 Dock tab图标与标题

建议：

- 图标：`globe` 或 `browser`。
- 标题：`Preview Browser` / `开发预览`。
- 单 tab 时显示完整名称，复用当前 dock 单 tab 全名逻辑。

### 12.2 Toolbar按钮

按钮顺序：

```text
Back / Forward / Reload / Stop / AddressBar / Pick Element / Console / Attach / More
```

图标建议：

- back：chevron-left
- forward：chevron-right
- reload：refresh
- stop：close
- pick：aim 或 crosshair
- console：terminal
- attach：paperclip 或 arrow-bend-down-right
- more：menu

当前 Icons 中已有部分图标，可能需要新增：

- globe
- refresh
- browser
- paperclip

### 12.3 Viewport错误态

当页面无法加载时，viewport 区域显示类似 VS Code 的错误页：

```text
未能加载页面
ERR_CONNECTION_REFUSED (-102)
URL: http://127.0.0.1:8000/
```

错误页由 React 或 WebView error page 显示均可。若系统 WebView 自带错误页不可控，可在主面板上方同步展示错误 badge。

### 12.4 Inspector区域

建议第一版放在底部抽屉：

- Selected
- Console
- Attachments

高度默认 180px，可折叠。

窄栏时：

- 默认折叠 inspector。
- 点击 selected/console 按钮展开。

### 12.5 附件tag

在反馈附件区显示 Web 附件 tag：

```text
[Web: Submit button] [Web console: 3 errors]
```

hover 预览摘要。

按钮：

- copy
- remove
- expand preview

## 13. Phase 2：浏览器内部多标签

### 13.1 Phase 2目标

浏览器面板内部支持多个网页 tab。

能力：

- 新建 tab。
- 关闭 tab。
- 切换 tab。
- 每个 tab 独立 URL、title、status。
- 每个 tab 独立 WebView runtime。
- 每个 tab 独立 selectedElement 和 consoleEntries。
- inactive tab WebView 隐藏。
- active tab WebView 显示并同步 bounds。

### 13.2 多标签架构

```text
PreviewBrowserPanel
  BrowserTabStrip
    tab A
    tab B
    plus
  BrowserToolbar
  BrowserViewportHost
    active tab bounds target
  BrowserInspector
    active tab selected/console
```

后端：

```text
PreviewBrowserState.tabs
  tab A -> webview A
  tab B -> webview B
```

切换时：

```text
hide old webview
show new webview
set new webview bounds to current viewport rect
update toolbar URL/title/status
```

### 13.3 关闭规则

- 关闭 inactive tab：销毁对应 WebView。
- 关闭 active tab：切换到右侧 tab；没有右侧则左侧；没有剩余则创建 blank tab 或显示空态。
- 关闭最后一个 tab：可以保留空态，不一定自动创建。

### 13.4 状态持久化

Phase 2 可选择只持久化轻量元数据：

- URL
- title
- active tab id

不持久化：

- console entries
- selected element
- page session/cookies

第一版也可以完全不持久化浏览器 tabs，降低复杂度。建议先不持久化，后续根据使用体验决定。

## 14. Capability与安全策略

### 14.1 主窗口权限

主窗口需要调用 preview management commands。

### 14.2 远程WebView权限

远程 WebView 不应拥有以下能力：

- 文件系统
- shell
- clipboard
- session 修改
- 历史清理
- caller 管理
- MLC 文件读取
- 项目资源读取

如果需要 bridge command，应只开放一个极窄命令：

```text
preview_bridge_event
```

并且严格校验 token、tabId、event kind 和 payload size。

### 14.3 附件前用户确认

捕获到元素或 console 不应自动进入最终反馈。用户需要点击 Attach。

这能避免远程页面伪造内容直接污染反馈。

## 15. 与现有代码的具体修改点

### 15.1 `feedbackStore.ts`

修改：

- 扩展 `SidePanelTab`。
- 扩展 `KNOWN_DOCK_TABS`。
- 决定 `DEFAULT_DOCK_TABS` 是否包含 `previewBrowser`。
- 增加 `WebAttachment` 类型。
- 扩展 `Session`、`FeedbackDraft`。
- 增加 WebAttachment actions。
- 更新 queued draft 持久化 normalize。
- 更新 apply queued draft。

建议：默认 `DEFAULT_DOCK_TABS` 可包含 `previewBrowser`，但初始折叠或放入 `leftPage`。如果担心扰动现有布局，也可以不默认显示，只在用户点击入口时 `openDockTab`。

### 15.2 `DockColumn.tsx`

修改：

- `dockTabLabel` 增加 `previewBrowser`。
- `dockTabIcon` 增加 browser/globe 图标。
- `DockTabContent` 返回 `PreviewBrowserPanel`。
- 拖拽逻辑无需特殊处理。

### 15.3 `FeedbackApp.tsx`

可能修改：

- 顶层挂载 preview browser 事件监听。
- 若 WebView 需要全局 drag 期间隐藏，需暴露 dragging 状态给 browser store。

### 15.4 `CallerPanelParts.tsx`

修改：

- 附件按钮行新增打开 Preview Browser 按钮。
- AttachmentTagBar 显示 WebAttachment 数量。
- tag 列表展示 WebAttachment。
- 删除、复制、预览 WebAttachment。

### 15.5 `CallerPanel.tsx`

修改：

- `hasContent` 包含 webAttachments。
- submit 时格式化 WebAttachment。
- image/test log/MLC references 旁边加入 Web Preview section。
- readonly 历史视图显示 WebAttachment。

### 15.6 `App.tsx`

修改：

- load history 时 hydrate `webAttachments`，兼容旧 session 没有字段。
- 新 session 初始化 `webAttachments: []`。

### 15.7 `Icons.tsx`

新增图标：

- globe
- refresh
- browser 或 panel-top
- paperclip

### 15.8 i18n

新增命名空间：

```json
"previewBrowser": {
  "title": "开发预览",
  "addressPlaceholder": "输入 URL...",
  "pickElement": "选择元素",
  "console": "控制台",
  "attachElement": "附加元素",
  "attachConsole": "附加控制台",
  "loading": "加载中...",
  "loadFailed": "未能加载页面"
}
```

英文同步补齐。

## 16. 测试计划

### 16.1 单页浏览

- 打开 `http://127.0.0.1:8000/`。
- 打开 `https://example.com`。
- 输入 `localhost:3000` 自动补 `http://`。
- 输入 `example.com` 自动补 `https://`。
- 禁止 `javascript:alert(1)`。
- 禁止 `file:///C:/Windows/win.ini`。
- 页面无法连接时显示错误状态。

### 16.2 Bounds同步

- 拖动 dock column resize。
- 切换到 MLC tab，再切回 Preview Browser。
- 折叠所在 column，再展开。
- 把 Preview Browser tab 拖到另一列。
- 改变主窗口大小。
- 打开右键菜单或 dock 拖拽 ghost 时确认 WebView 不遮挡。

### 16.3 元素选择

- 选择按钮。
- 选择链接。
- 选择输入框。
- 选择带 `data-testid` 的元素。
- 选择只有文本的元素。
- Escape 取消。
- 选择后 overlay 清理。
- Attach 后反馈区出现 Web tag。

### 16.4 Console捕获

- console.log。
- console.warn。
- console.error。
- thrown Error。
- unhandled Promise rejection。
- 超长对象截断。
- clear console。
- attach console snapshot。

### 16.5 提交反馈

- Web element attachment 出现在最终 Markdown。
- Console attachment 出现在最终 Markdown。
- 多个 WebAttachment 顺序正确。
- queued draft 应用到 session 后附件仍保留。
- readonly 历史视图能显示附件摘要。

### 16.6 Phase 2多标签

- 新建多个 browser tab。
- 每个 tab 加载不同 URL。
- 切换 tab 后 WebView 内容正确。
- inactive tab 不遮挡。
- 关闭 active tab 后切换合理。
- 每个 tab console 独立。
- 每个 tab selected element 独立。

## 17. 风险与缓解

### 17.1 Tauri child WebView API不满足需求

风险：当前 Tauri 2 环境可能需要特定 API 或插件才能创建主窗口内 child WebView 并动态 set bounds。

缓解：实现前先做最小 spike：在主窗口中创建一个 child WebView，加载 `https://example.com`，随 React 容器 resize 同步。

如果失败：

- 退回独立 WebviewWindow。
- 或仅对 localhost 使用 iframe 预览作为降级。

### 17.2 WebView遮挡React UI

风险：系统 WebView 层可能盖住 React dropdown、tooltip、context menu。

缓解：

- 打开菜单、拖拽、modal 时临时 hide WebView。
- inspector 尽量放在 WebView 下方，不叠在 WebView 上方。
- 重要弹窗使用主窗口外部 modal 或先隐藏 WebView。

### 17.3 Console抓取不完整

风险：脚本注入不够早，漏掉早期日志。

缓解：

- 优先使用 document-start 注入。
- UI 提示“captured after preview script attached”。
- 后续研究平台级 console event。

### 17.4 远程页面伪造bridge事件

风险：远程页面可能调用暴露的窄 bridge 伪造 payload。

缓解：

- token 校验。
- payload 限长。
- event schema 校验。
- 结果只显示在 UI，不自动提交。
- 用户点击 Attach 后才进入反馈。

### 17.5 浏览器兼容性

风险：系统 WebView 与真实 Chrome/Edge 有差异。

缓解：

- 明确这是开发预览辅助，不替代真实浏览器。
- 后续可增加“在外部浏览器打开”。
- 后续再做浏览器扩展兜底，不在 Phase 1+2 范围内。

## 18. 实施顺序建议

### Step 1：技术Spike

最小验证：

- 新增临时 command 创建 child WebView。
- 加载 `https://example.com`。
- 从 React 容器同步 bounds。
- 切换隐藏/显示。

如果这一步不成立，不应继续大规模实现 UI。

### Step 2：Dock接入

- 增加 `previewBrowser` dock tab。
- 增加 label/icon/content。
- 默认打开到 `leftPage`。

### Step 3：PreviewBrowserPanel UI

- toolbar。
- address bar。
- viewport host。
- inspector drawer。
- loading/error/empty 状态。

### Step 4：导航闭环

- create tab。
- navigate。
- reload。
- load status。
- title/url update。

### Step 5：Picker闭环

- 注入 picker。
- hover overlay。
- element picked event。
- selected element card。
- attach element。

### Step 6：Console闭环

- 注入 console capture。
- console entries list。
- filters。
- attach snapshot。

### Step 7：WebAttachment接入反馈

- store actions。
- attachment tags。
- submit formatter。
- readonly display。

### Step 8：Phase 2多标签

- browser tab strip。
- create/close/switch。
- inactive WebView hide。
- per-tab console/element。

### Step 9：验证与修复

- URL 校验。
- bounds 同步。
- dock 拖拽遮挡。
- console 截断。
- 提交 Markdown。

## 19. 里程碑验收

### Phase 1完成标准

- 主窗口内部显示 Preview Browser dock tab。
- 能加载 `https://example.com` 和本地 localhost 页面。
- WebView 随 dock 容器 resize 和切换正确显示/隐藏。
- 能选择页面元素并显示 selector/locator/text。
- 能把元素作为附件加入当前反馈。
- 能捕获 console warn/error/log。
- 能把 console snapshot 作为附件加入当前反馈。
- 提交时 agent 收到 Web Preview Markdown 附件。

### Phase 2完成标准

- 支持浏览器内部多个网页标签。
- 每个网页标签独立 WebView。
- 切换标签时 WebView 正确 show/hide。
- 每个标签独立 selected element 和 console entries。
- 关闭标签释放 WebView。
- 多标签下附件归属 URL 和 page title 正确。

## 20. 最终结论

用户真正需要的是 VS Code 风格的内嵌浏览器 tab，而不是独立窗口。推荐方案是：

```text
Preview Browser 作为 MLFB dock tab
  React 负责浏览器 chrome、toolbar、inspector 和附件 UI
  Tauri child WebView 负责渲染网页
  ResizeObserver + bounds command 负责将 WebView 对齐 React viewport
  picker script 负责页面元素选择
  console capture script 负责控制台信息抓取
  WebAttachment 负责把捕获结果纳入反馈提交链路
```

Phase 1 应先完成内嵌单页闭环，Phase 2 再扩展浏览器内部多标签。实现前最关键的技术验证是：当前 Tauri 2 项目能否稳定创建主窗口内 child WebView 并动态同步 bounds。只要这个点成立，就可以按本规划继续实现。