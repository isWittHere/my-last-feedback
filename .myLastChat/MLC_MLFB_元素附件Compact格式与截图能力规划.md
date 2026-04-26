---
title: MLFB 元素附件 Compact 格式与截图能力规划
description: 规划内嵌预览浏览器的元素附件精简格式与截图能力
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - preview-browser
  - web-attachment
  - element-picker
  - screenshot
solved_lists:
  - 分析 VS Code 元素附件格式的优点与冗余
  - 规划 Compact Element Snapshot 默认格式
  - 规划元素截图与完整诊断分层策略
---

# MLFB 元素附件 Compact 格式与截图能力规划

## 1. 背景

当前 Preview Browser 已经具备基础元素选取与 WebAttachment 提交流程：

- WebView 内注入 picker 脚本。
- 选中元素后回传 selector、locator candidates、DOM 信息与 HTML snippet。
- 反馈提交时通过 `formatWebAttachments` 输出 Markdown。
- Console snapshot 可以按过滤器附加到反馈内容。

用户提供的 VS Code 元素附件示例有明显参考价值：它包含元素身份、URL、HTML Path、属性、尺寸、Outer HTML、Computed Styles，并能在选取时自动截取元素截图。但它也存在一个核心问题：输出过于冗长，尤其全量 computed styles 会产生大量低价值上下文。

本规划目标是在学习其优点的同时，建立更适合 MLFB 的精简、分层、可扩展附件体系。

## 2. 目标

### 2.1 产品目标

- 让用户选取元素后，能快速确认“选中了什么”。
- 让 AI 在反馈上下文中拿到足够复现和判断的信息。
- 默认附件保持短小，避免 computed styles 和 DOM 细节污染反馈正文。
- 支持元素截图，提升视觉确认能力。
- 保留完整诊断能力，但通过折叠 UI 或可选附件暴露。

### 2.2 工程目标

- 在现有 `WebAttachment` 数据模型上增量扩展，避免破坏已有反馈流程。
- 默认 Markdown 输出控制在约 30 到 40 行。
- 截图不以内联 base64 写入 Markdown，而是作为结构化资源引用。
- 对截图能力设置清晰 fallback：无法截图时不阻断元素附件提交。
- 将完整 diagnostics 与 compact snapshot 分离，方便后续持久化和导出。

## 3. 非目标

- 不在本阶段实现完整浏览器 DevTools。
- 不默认输出全部 computed styles。
- 不把截图二进制直接塞进反馈 Markdown。
- 不实现跨 iframe 深层元素选取的完整闭环。
- 不保证第一阶段截图在所有平台、所有 WebView 后端都可用；先建立能力边界和 fallback。

## 4. 从 VS Code 格式中学习什么

## 4.1 值得保留的内容

### 元素身份

示例中的 `Element: a.mnav.c-font-normal.c-color-t` 很有用。MLFB 应默认保留类似摘要：

- tagName
- visible text
- role / accessible name
- compact CSS selector
- page URL
- page title

### 可复现定位信息

VS Code 的 HTML Path 有助于定位，但它偏结构化 DOM 路径，页面稍变就容易失效。MLFB 应以稳定 locator 为主：

- Playwright `getByRole`
- Playwright `getByLabel`
- Playwright `getByText`
- `getByTestId`
- unique CSS selector
- XPath / DOM path fallback

每个候选项保留 confidence 和 reason，便于 AI 判断优先级。

### 关键属性

属性有价值，但默认只保留调试相关字段：

- `id`
- `class`
- `href` / `src`
- `name`
- `type`
- `role`
- `aria-*`
- `data-testid` / `data-test` / `data-cy`
- `target`
- `disabled` / `checked` / `selected`

### 几何信息

Dimensions 对点击、遮挡、布局问题很关键。建议默认保留：

- element rect
- viewport size
- 是否在视口内
- 是否尺寸过小

### Outer HTML

Outer HTML 对 AI 理解元素上下文有价值，但必须限长。建议默认截断到 800 到 1200 字符。

### 元素截图

截图是 VS Code 格式中最值得学习的能力之一。它能解决纯文本描述无法确认视觉目标的问题。

MLFB 应提供：

- element crop screenshot
- 可选 context crop screenshot
- screenshot metadata
- 在 Markdown 中只写附件引用和 bounding box

## 5. 需要避免的冗余

### 5.1 不默认输出全量 computed styles

全量 computed styles 是示例中最大的信息噪音来源。绝大多数默认值对反馈没有帮助。

默认只输出 curated styles：

- layout: `display`, `position`, `z-index`, `overflow`, `visibility`, `opacity`, `pointer-events`
- box: `box-sizing`, `width`, `height`, `margin`, `padding`, `border`, `border-radius`
- typography: `font-family`, `font-size`, `font-weight`, `line-height`, `color`, `text-align`
- background: `background-color`, `background-image`
- interaction: `cursor`, `user-select`
- transform: `transform`

同时过滤低价值默认值：

- `normal`
- `none`
- `auto`
- `0px`
- 空值
- 与常见浏览器默认值一致的值

### 5.2 不把所有内容放进反馈正文

推荐分三层：

1. Compact Element Snapshot：默认进入反馈正文。
2. Expanded Element Details：UI 展开查看，不默认提交。
3. Full Element Diagnostics：用户主动选择时作为 JSON 或长文本附件保存。

## 6. 数据模型设计

### 6.1 扩展 `PickedElement`

建议新增字段：

```ts
interface PickedElement {
  viewport?: {
    width: number;
    height: number;
  };
  attributes?: Record<string, string>;
  domPath?: string;
  xpath?: string;
  computedStyles?: Record<string, string>;
  styleSummary?: Record<string, string>;
  screenshot?: ElementScreenshotRef;
}
```

### 6.2 新增截图引用

```ts
interface ElementScreenshotRef {
  id: string;
  kind: "element" | "context";
  fileName?: string;
  filePath?: string;
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
  devicePixelRatio: number;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  capturedAt: string;
  status: "ready" | "failed";
  error?: string;
}
```

### 6.3 附件模式

```ts
type WebElementAttachmentMode = "compact" | "compact-with-screenshot" | "full-diagnostics";
```

默认使用 `compact-with-screenshot`，如果截图失败则自动降级到 `compact`。

## 7. Picker 注入脚本规划

### 7.1 采集内容

选取元素时采集：

- sourceUrl
- frameUrl
- tagName
- text
- role
- accessible name
- selected attributes
- selector
- selectorType
- locatorCandidates
- rect
- viewport
- outerHTML snippet
- curated computed styles
- capturedAt

### 7.2 样式采集策略

在 WebView 页面内通过 `getComputedStyle(el)` 读取样式，但只保留白名单字段，并过滤默认值。

输出示例：

```json
{
  "display": "inline-block",
  "position": "static",
  "font-size": "13px",
  "color": "rgb(34, 34, 34)",
  "cursor": "pointer"
}
```

### 7.3 Locator 策略

候选优先级：

1. role + accessible name
2. test id
3. label
4. text
5. unique CSS
6. XPath / DOM path fallback

UI 中展示全部候选，但默认 Markdown 只放 best locator 和 selector。

## 8. 截图能力规划

## 8.1 截图路线 A：主窗口截图后裁切

流程：

1. picker 回传 element rect。
2. 前端同步当前 WebView viewport bounds。
3. 调用 Tauri 命令截图主窗口。
4. 根据 `webviewBounds + elementRect` 计算裁切区域。
5. 将裁切后的 PNG 保存到临时附件目录。
6. 将截图引用写入 `PickedElement.screenshot`。

优点：

- 与当前 Tauri 架构兼容度较高。
- 不需要页面内 canvas 截图，避免跨域限制。

风险：

- 某些平台主窗口截图可能不包含 native child WebView 内容。
- DPI / scaling 需要校准。
- child WebView bounds 和截图像素坐标可能存在偏差。

## 8.2 截图路线 B：平台 WebView capture API

如果路线 A 无法捕获 child WebView 内容，则考虑后续平台实现：

- Windows WebView2 CapturePreview。
- macOS WKWebView snapshot。
- Linux WebKitGTK snapshot。

本阶段不优先实现跨平台深度封装，但保留接口。

## 8.3 截图 fallback

截图失败时：

- 元素附件仍然可提交。
- UI 显示截图失败状态。
- Markdown 写入 `Screenshot: unavailable`，并附短错误原因。

## 9. Markdown 输出规划

### 9.1 默认 Compact 输出

```markdown
### Selected Element
- URL: https://www.baidu.com/
- Page: 百度一下，你就知道
- Text: 地图
- Role: link
- Selector: a.mnav.c-font-normal.c-color-t
- Best locator: page.getByRole('link', { name: '地图' })
- Box: x=162 y=0 w=57 h=42, viewport=1536x864
- Href: //map.baidu.com/
- Screenshot: attached element crop

```html
<a href="//map.baidu.com/" target="_blank" class="mnav c-font-normal c-color-t">地图</a>
```

Styles:
- display: inline-block
- font-size: 13px
- color: rgb(34, 34, 34)
- cursor: pointer
```

### 9.2 Full diagnostics 输出

只有用户主动选择时才输出：

- 全部 locator candidates
- 全部 selected attributes
- curated styles
- 可选完整 computed styles JSON
- DOM path / XPath
- screenshot metadata

## 10. UI 规划

### 10.1 Selected 面板结构

- Summary：元素文本、tag、selector、best locator。
- Screenshot：缩略图和状态。
- Locators：可折叠候选列表，每项可复制。
- Attributes：可折叠。
- Styles：默认显示 curated styles。
- HTML：可折叠 snippet。

### 10.2 附加按钮

将单一 `Attach element` 升级为小菜单或分段按钮：

- Attach compact
- Attach with screenshot
- Attach full diagnostics

第一阶段可先保留一个按钮，默认执行 `compact-with-screenshot`，失败时降级 compact。

## 11. 实施步骤

### Step 1：Compact 数据补齐

- 扩展 picker payload：viewport、attributes、domPath、xpath、styleSummary。
- 扩展 `PickedElement` 类型。
- UI 显示 styles/attributes 摘要。

### Step 2：Compact Markdown 改造

- 修改 `formatWebAttachments`。
- 默认输出 compact element snapshot。
- 控制默认正文长度。
- 将完整候选列表和完整样式从默认正文移出。

### Step 3：截图接口与存储

- 增加 Tauri 命令：`preview_capture_element`。
- 输入：tab id、element rect、viewport bounds。
- 输出：`ElementScreenshotRef`。
- 截图保存到 app-local 临时附件目录。

### Step 4：UI 截图展示

- 选中元素后尝试截图。
- 显示截图缩略图。
- 失败时显示轻量错误。
- 附件 tag 显示是否带截图。

### Step 5：验证

- 选取百度首页链接。
- 验证 compact 文本长度。
- 验证 selector / locator 可复制。
- 验证截图坐标和裁切结果。
- 验证截图失败时提交不受阻。

## 12. 风险与对策

### WebView 截图不可见

对策：截图命令返回 `failed`，UI 和 Markdown 明确降级。后续再实现平台 capture API。

### DPI 坐标偏移

对策：保存 devicePixelRatio，并在裁切时使用截图实际尺寸与窗口 logical size 计算 scale。

### 附件过大

对策：限制截图尺寸和压缩质量，默认 PNG crop，不保存整页截图。

### 样式仍然冗余

对策：白名单 + 默认值过滤 + 最大条数限制，例如最多 16 条。

### 隐私风险

对策：截图只在用户点击 attach 后进入反馈附件；完整 diagnostics 需要用户主动选择。

## 13. 建议优先级

1. 先实现 Compact 文本和 styleSummary。
2. 再实现截图接口和 fallback。
3. 最后实现 full diagnostics 可选模式。

这样即使截图在某些平台上受限，也能先获得稳定的附件质量提升。
