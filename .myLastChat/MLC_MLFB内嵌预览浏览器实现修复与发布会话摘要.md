---
title: MLFB内嵌预览浏览器实现修复与发布会话摘要
description: 总结 Preview Browser 实现、UI 修复、多语言适配与 Windows 打包发布
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
solved_lists:
  - 实现 VS Code 式内嵌 Preview Browser 与 Preview Info dock tab
  - 完成元素拾取、console 抓取、WebAttachment 与元素截图能力
  - 修复 native child WebView 覆盖 React UI 的层级问题
  - 修复 picker 偏移、多显示器截图、附件工具条紧凑态与多语言适配
  - 完成版本更新、Git 备份提交与 Windows 发布包生成
---

# MLFB内嵌预览浏览器实现修复与发布会话摘要

## 1. Previous Conversation

本轮对话围绕 My Last Feedback 桌面应用中的内嵌开发预览浏览器展开，经历了从产品方向澄清、分阶段规划、落地实现、问题修复，到多语言适配和发布打包的完整链路。

对话最初的目标是“实现一个新 tab 页用于内部预览浏览器”。用户随后澄清，希望它不是独立窗口，而是“类似于 VS Code 这种直接内嵌的 tab 页”。在方向明确后，先完成了详尽规划文档，范围限定为 Phase 1 和 Phase 2，即：

- Phase 1：主窗口内嵌单页浏览器闭环。
- Phase 2：浏览器内部多标签页。

在规划之后，用户要求 Git 备份，然后进入实际实现。实现过程中，范围从基础浏览器 tab 持续扩展到完整开发预览体验，包括：

- 内嵌 child WebView 浏览器。
- 元素拾取与结构化附件。
- console 抓取与附加。
- 元素截图与图片附件联动。
- Preview Browser 与 Preview Info 拆分为两个 dock tab。
- overlay / tooltip / modal 与原生 WebView 的层级冲突治理。

后续用户把重点转向可用性和工程稳定性，依次推动了以下工作：

- 修复 WebView 压住设置弹窗、菜单、tooltip、拖动杆的问题。
- 调整 picker 高亮机制与边框样式。
- 修复多显示器环境下截图坐标错误。
- 改造附件按钮行，使其在窄宽度下隐藏文字、保留图标和统计信息，并修复高度对齐。
- 全面检查并修复新增 UI 的多语言适配问题。
- 修复标题栏侧栏开关按钮的错误命名。
- 更新版本号至 0.3.1。
- 完成 Git 备份提交与 Windows 打包发布。

在最后阶段，用户要求“Please execute git add and git commit to backup the current changes.”，随后要求继续打包。打包过程中暴露了两类真实问题：

- `LauncherHomeNodeWorkbench.tsx` 国际化改造里 `useTranslation` 作用域放错，导致前端构建失败。
- `scripts/package-win.sh` 仍引用旧版 `server.mjs` 和 `mlra-server/` 目录，已不符合当前 `mcp/` 目录结构。

这些问题已经被逐一修复，最终 Windows x64 发布目录与 zip 包均已生成成功。

## 2. Current Work

在这次摘要请求之前，最新完成的工作是发布链路收口与产物确认。

最新阶段的工作顺序如下：

1. 用户确认侧栏开关命名修复通过，并要求继续打包。
2. 执行 `git add` 与 `git commit`，创建备份提交。
3. 运行 `bash scripts/package-win.sh`。
4. 打包第一次失败，定位到 `LauncherHomeNodeWorkbench.tsx` 的国际化作用域问题。
5. 修复后再次打包，第二次仍失败，继续定点清理误插入的 `useTranslation`。
6. 第三次打包通过前端与 Rust release 构建，但脚本在复制旧入口 `server.mjs` 时失败。
7. 修复 `scripts/package-win.sh` 与 `BUILD.md`，让脚本复制整个 `mcp/` 目录，并移除不存在的 `mlra-server/` / `skills/` 路径。
8. 重新运行打包脚本，成功生成：
   - `dist/win-x64/my-last-feedback`
   - `dist/win-x64/my-last-feedback-win-x64.zip`
9. 检查产物大小并再次提交脚本与最终修复。

发布完成时的关键结果：

- `app.exe` 大小约 14M。
- `dist/win-x64/my-last-feedback` 目录总大小约 35M。
- `dist/win-x64/my-last-feedback-win-x64.zip` 大小约 31M。
- `git status --short` 最终无输出，工作区干净。

本次会话在摘要请求前的实际停止点，是用户对发布复核给出明确确认：

> “好的”

随后用户新的显式请求是：

> “/cmd-compact 创建一个全新的会话摘要文档”

因此当前已经不再处于代码修复或打包执行阶段，而是进入“沉淀完整会话上下文，供后续继续工作”这一新任务。

## 3. Key Technical Concepts

- Tauri 2 child WebView：通过 `Window::add_child` 创建内嵌浏览器，而非使用外部窗口。
- React + TypeScript + Vite：前端主应用结构，使用 Zustand 作为状态管理。
- Dock Layout / Dock Tabs：三栏布局 `leftSidebar`、`leftPage`、`rightSidebar`，新增 `previewBrowser` 与 `previewInfo`。
- Native layer management：`nativeWebViewBlockers` 用于在弹窗、菜单、dropdown 打开时临时隐藏 child WebView。
- Event bridge：通过自定义 scheme 将远端页面内脚本事件桥接回 Tauri，再发送给 React。
- Element picker：从网页 DOM 中提取结构化元素信息，形成 `PickedElement` / `WebAttachment`。
- Console capture：拦截 `console.*`、error、fetch/XHR 等事件，形成 `WebConsoleEntry`。
- Multi-monitor screenshot fix：截图逻辑改为以屏幕局部坐标而非全局坐标调用截图 API。
- Internationalization：使用 `react-i18next`，资源文件位于 `app/src/i18n/locales/zh.json` 和 `en.json`。
- Packaging contract：根包入口现为 `mcp/mlfb/index.mjs`，Windows 打包脚本需复制 `mcp/` 目录而不是旧版 `server.mjs`。
- Git backup workflow：在重要里程碑前按用户要求执行 `git add` 与 `git commit`，保持工作区可回退。

关键代码模式包括：

```ts
nativeWebViewBlockers: Record<string, number>
pushNativeWebViewBlocker(key)
popNativeWebViewBlocker(key)
```

这个模式用于把“原生 WebView 是否应隐藏”抽象为引用计数，而不是单布尔值，避免多个 overlay 相互覆盖时状态丢失。

还有附件按钮紧凑态的关键模式：

```css
.attachment-action-row {
  container-type: inline-size;
}

@container (max-width: 620px) {
  .attachment-action-label {
    display: none;
  }
}
```

最终实现中不是通过省略号截断按钮文本，而是让按钮在窄宽度下直接隐藏 label，仅保留图标与统计信息。

## 4. Relevant Files and Code

### .myLastChat/MLC_MLFB_VSCode式内嵌预览浏览器_Phase1-2规划书.md

- 用于承载本轮工作的前置规划。
- 明确了 Phase 1 + 2 范围，限定主窗口内嵌浏览器与浏览器多标签，不做独立窗口和完整 DevTools。
- 关键价值在于提前锁定 child WebView + Dock + WebAttachment 的主技术路线。

### app/src/store/feedbackStore.ts

- 中央 Zustand store。
- 新增 `previewBrowser` / `previewInfo` tab 类型、`WebAttachment`、元素截图、console 条目、附件状态。
- 引入 `nativeWebViewBlockers` 作为原生 WebView 层级治理核心。

关键结构：

```ts
nativeWebViewBlockers: Record<string, number>
pushNativeWebViewBlocker(key: string)
popNativeWebViewBlocker(key: string)
```

### app/src/store/previewBrowserStore.ts

- Preview Browser 的专用状态管理。
- 管理浏览器 tabs、activeTab、pickerMode、inspectorMode、selectedElement、consoleEntries、zoom、boundsByTab。
- 负责 `preview_set_zoom`、`preview_capture_element`、`attachSelectedElement()` 等桥接调用。

### app/src/components/PreviewBrowserViewPanel.tsx

- 浏览器页签本体。
- 负责 toolbar、address bar、zoom control、WebView mount rect 同步，以及在 blocker 存在时隐藏 child WebView。
- 与 `previewBrowserStore` 联动。

### app/src/components/PreviewBrowserInfoPanel.tsx

- 信息页签，显示元素详情和 console。
- 已切换为复用 `AppSelect`，统一下拉控件风格。
- 使用 `previewBrowser.consoleFilter`、`attachElement`、`attachConsole` 等国际化键。

### app/src/components/CallerPanelParts.tsx

- 反馈区附件工具条和 tag 区核心文件。
- 本轮重点修改了 `AttachmentTagBar`：
  - 引入 `attachment-action-row` / `attachment-action-label` / `attachment-action-meta`。
  - 调整窄宽度行为为隐藏 label 而非省略号。
  - 增加按钮行与 tag 行间距。
  - 修复高度对齐。
- 同时补齐了复制图片、复制路径、复制日志等 i18n title。

### app/src/components/ImageAttachmentWidget.tsx

- 图片附件按钮与缩略图。
- 图片按钮改为复用 `attachment-control-group`。
- `Remove` title 改为使用 `images.remove`。

### app/src/index.css

- 本轮前端样式修正中心文件之一。
- 增加附件按钮行和紧凑态相关规则：

```css
.attachment-action-row,
.attachment-control-group {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.attachment-action-row {
  container-type: inline-size;
  min-height: 32px;
  overflow: hidden;
}

@container (max-width: 620px) {
  .attachment-action-label {
    display: none;
  }
}
```

- 还统一了附件按钮高度、行高、box model，修复纵向不齐。

### app/src/components/FeedbackApp.tsx

- 应用总壳。
- 挂载 `PreviewBrowserEventBridge`、设置 blocker、管理 dock column toggle。
- 本轮修复了标题栏侧栏开关按钮误用 `mlc.open/mlc.close` 的问题，改成 `dock.openLeftSidebar` / `dock.closeLeftSidebar` 等语义正确的文案。
- `RunningTimer`、`StageFlowPopover`、`TimerStatsPopover` 等 MLRA 区域也进行了国际化。

### app/src/components/AgentColumn.tsx

- MLRA Agent 列。
- 将状态标签、策略描述、session pool badge、placeholder 等接入 i18n。

### app/src/components/TransferSubmitSplit.tsx

- Transfer submit 组件。
- 把“转移提交”弹窗的 title、placeholder、格式提示、按钮文字接入 i18n。

### app/src/components/LauncherHomeNodeWorkbench.tsx

- MLRA 蓝图工作台。
- 是多语言适配中最容易出错的文件之一，因为组件很多、辅助函数多。
- 本轮对其做了以下修复：
  - 阶段模板、启动条件、节点标签、门控、技能包等文案国际化。
  - 打包时两次发现 `useTranslation` 作用域错误，最终修复后构建通过。

### app/src/i18n/locales/zh.json
### app/src/i18n/locales/en.json

- 本轮补齐了大量缺失命名空间和键：
  - `common`
  - `dock`
  - `resources`
  - `mlcPreview`
  - `transfer`
  - `mlra`
  - `previewBrowser.consoleFilter`

### app/src-tauri/src/preview_browser.rs

- Preview Browser 的 Rust 后端实现。
- 管理 child WebView 生命周期、navigation、bounds、picker 脚本、console capture、截图。
- picker 高亮从 fixed overlay 改为直接高亮真实 DOM 元素。
- 多显示器截图改为使用屏幕局部坐标。

### app/src-tauri/src/lib.rs

- 注册 preview browser 相关 commands 与 state。

### scripts/package-win.sh

- Windows 打包脚本。
- 本轮重要修复：从旧版 `server.mjs` / `mlra-server/` 路径改为复制整个 `mcp/` 目录。
- 同步移除不存在目录复制逻辑，并修复步骤编号。

关键差异：

```bash
cp -R "$PROJ_ROOT/mcp" "$DIST_DIR/mcp"
```

### BUILD.md

- 构建与发布文档。
- 同步更新为当前 `mcp/` 目录结构，避免未来继续按旧版 `server.mjs` 手动打包。

### package.json
### app/package.json
### app/src-tauri/Cargo.toml
### app/src-tauri/tauri.conf.json

- 版本统一更新到 `0.3.1`。

## 5. Problem Solving

本轮已经解决的问题可以按阶段归纳：

### 5.1 架构与实现问题

- 从“独立预览窗口”路线切换为“主窗口内嵌 tab”路线。
- 实现 `previewBrowser` 与 `previewInfo` 两个 dock tab，而不是把所有信息塞进单一面板。
- 建立 `WebAttachment` 一等附件类型，而不是把网页元素/console 伪装成测试日志或 MLC 附件。

### 5.2 原生 WebView 层级问题

child WebView 属于原生层，不受 React DOM `z-index` 控制，导致：

- settings dialog 被盖住。
- dock tab 菜单被盖住。
- tooltip 被盖住。
- 拖动杆命中区被覆盖。

最终采用的解决方案不是继续提升 z-index，而是：

- 在 store 中统一维护 `nativeWebViewBlockers`。
- 当 modal/menu/dropdown 打开时 push blocker。
- 在 `PreviewBrowserViewPanel` 内，根据 blocker 非空隐藏 WebView。

这从根本上解决了原生层压住 DOM 层的问题。

### 5.3 Picker 与截图问题

- picker 初版用 fixed overlay，高亮在滚动、transform、zoom 下容易偏移。
- 改为直接给真实 DOM 元素添加 `outline` 与 `box-shadow`，避免坐标跟踪误差。
- 截图在多显示器环境下报 `Area size is invalid`，根因是传给截图 API 的坐标是全局坐标。
- 改为：先夹到 WebView bounds，再换算为屏幕局部坐标 `capture_x = x - screen_left`、`capture_y = y - screen_top`。

### 5.4 附件按钮行 UI 问题

用户先要求窄宽度省略按钮文本，我最初误实现为 `text-overflow: ellipsis`。用户明确指出：“正确的是直接省去按钮文本，只剩下图标和统计信息，而不是用省略号”。

之后又继续指出：“这导致它们参差不齐”，进一步澄清真实问题是高度不对齐，而不是宽度不一致。

最终修复链路是：

- 移除按钮文本省略号策略。
- 改为窄宽度下隐藏 `.attachment-action-label`。
- 保留图标和统计信息。
- 给按钮统一 `32px` 高、`line-height: 1`、`align-items: center`，修复纵向错位。

### 5.5 多语言适配问题

用户随后要求“检查并修复各处的多语言适配问题”。

排查发现三类根因：

- 组件中直接硬编码中文或英文。
- 已用 `t(...)` 但 fallback 仍是中文，资源缺失时英文环境会串语言。
- 代码已引用新 key，但 `zh/en` 资源中没有对应项。

这一轮补齐并修复了标题栏、附件区、Preview Browser/Info、Transfer submit、MLRA 工作台、Markdown copy、dock/resources/mlcPreview 等多个区域。

### 5.6 标题栏命名问题

用户指出：有一个按钮似乎命名错误，“打开 my last chat”，但它实际是顶栏用于开关左侧面板的按钮。

根因定位为：

- `FeedbackApp.tsx` 中左右侧栏开关按钮错误复用了 `mlc.open` / `mlc.close`。

修复方案：

- 改用 `dock.openLeftSidebar` / `dock.closeLeftSidebar`。
- 右侧栏用 `dock.openRightSidebar` / `dock.closeRightSidebar`。

### 5.7 打包问题

打包阶段遇到两类问题：

1. `LauncherHomeNodeWorkbench.tsx` 在国际化改造时 `useTranslation` 作用域插错位置，导致 `t` 未定义或未使用。
2. `scripts/package-win.sh` 仍使用旧结构：
   - `server.mjs`
   - `mlra-server/`
   - `skills/`

第一类问题通过多次精确补丁修复；第二类问题通过脚本和文档更新解决，最终成功生成发布目录和 zip 包。

## 6. Pending Tasks and Next Steps

当前没有未完成的显式任务。本轮用户最近的执行链路已经闭环完成：

> “Please execute git add and git commit to backup the current changes.”

以及：

> “继续打包”

这些都已经完成，且发布复核得到用户确认：

> “好的”

在这份摘要创建时，新的唯一显式请求是：

> “/cmd-compact 创建一个全新的会话摘要文档”

这个任务也已经完成，即当前文档本身。

如果后续继续推进，自然的下一步有三类：

- 对 `dist/win-x64/my-last-feedback/app.exe` 做一次人工 smoke test，确认 Preview Browser、Settings、附件工具条和多语言切换在发布包中都正常。
- 决定是否清理当前非阻断 warning：
  - Vite 大 chunk 警告。
  - `@tauri-apps/api/core.js` 动态/静态混合导入警告。
  - Rust `preview_browser.rs` 中 `token` 字段未读取 warning。
- 如果准备继续发布流程，可把 `dist/win-x64/my-last-feedback-win-x64.zip` 用于上传或分发。

关键停靠点总结：

- 功能实现已完成。
- UI 与多语言修复已完成。
- Git 备份提交已完成。
- Windows x64 目录包与 zip 包已生成成功。
- 工作区在最终提交后为干净状态。