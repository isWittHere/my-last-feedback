---
title: CallerManager隐藏按钮和合并System注入
description: 实现CallerManager隐藏caller功能、合并[System]注入、Mac拖拽修复和macOS UI适配
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
solved_lists:
  - CallerManager隐藏caller按钮（眼睛图标，localStorage持久化）
  - CallerTabs/FeedbackApp过滤隐藏caller
  - 新请求到达时自动取消隐藏caller
  - 合并时前端+后端双层[System]注入到pending sessions
  - FeedbackPayload扩展caller_alias字段
  - 响应时MCP server使用合并后的新alias
  - i18n中英文翻译（hide/show）
  - CSS .cm-caller-hidden半透明样式
  - Rust cargo build验证通过
  - 剪贴板权限修复(clipboard-manager:allow-write-text)
  - Mac CallerTabs拖拽修复(setData + pointer-events + drag-region)
  - macOS UI适配(Overlay标题栏 + 原生交通灯 + 条件渲染)
---

# CallerManager隐藏按钮和合并[System]注入

## 1. Previous Conversation

用户提出三项CallerManager改进需求：
1. **副标题显示工作区名**（用户后续确认跳过）
2. **隐藏caller按钮**使其在顶栏tab中不可见
3. **合并后[System]注入**：合并caller后，pending sessions应通知agent使用新的agent_name

经过详细分析后，用户确认实现需求2和3，跳过需求1。

## 2. Current Work

### 需求2：隐藏Caller按钮

**Store层** (`feedbackStore.ts`)：
- 新增 `hiddenCallerIds: string[]` 字段，localStorage key `mlf-hidden-callers`
- `toggleCallerHidden(callerId)`: 切换隐藏状态 + 持久化
- `unhideCaller(callerId)`: 取消隐藏 + 持久化
- `addSession`: 新pending session到达时自动调用 `unhideCaller`
- `mergeCallers`: 合并时清理已删除source的hiddenCallerIds
- `clearAllHistory`: 清除hiddenCallerIds + localStorage

**CallerManager** 新增眼睛图标按钮（open/closed eye SVG），isHidden判断 + `cm-caller-hidden` class半透明

**CallerTabs** 过滤 `hiddenCallerIds`：先排序再过滤，`orderedCallers.length === 0` 时return null

**FeedbackApp** 新增 `visibleCallers = callers.filter(not hidden)` memo，columnCallerIds使用visibleOrder，tab区域和sort按钮使用 `visibleCallers.length > 1` 条件

### 需求3：合并后[System]注入（双层策略）

**层1：Summary前置注入**
- 前端 `mergeCallers` action: 对source的pending sessions的summary前置 `[System] Agent merged: your identifier has been updated to agent_name="XXXX"...`
- 后端 `session.rs::merge_callers()`: 同样注入，确保前后端一致

**层2：响应时动态alias替换**
- `session.rs::FeedbackPayload` 新增 `caller_alias: Option<String>`（`skip_deserializing`避免外部构造）
- `session.rs::submit_feedback()`: 查找session当前caller的alias，设置到payload
- `lib.rs`: FeedbackPayload初始化补充 `caller_alias: None`
- `server.mjs`: `const effectiveAlias = result.caller_alias || alias;` 使用动态alias生成[System]消息

## 3. Key Technical Concepts

- **localStorage持久化UI偏好**：hiddenCallerIds不需要后端持久化，纯前端偏好
- **Zustand selector + useShallow**：CallerManager/CallerTabs按需订阅hiddenCallerIds
- **Rust serde `skip_deserializing`**：`caller_alias`字段仅在序列化（发送给MCP server）时包含，反序列化时跳过
- **oneshot channel payload扩展**：通过FeedbackPayload传递额外上下文，无需改IPC协议
- **双层注入兜底策略**：summary注入 + 响应alias替换，确保agent无论如何都能获取正确的新alias

## 4. Relevant Files and Code

### app/src/store/feedbackStore.ts
- 新增 `hiddenCallerIds` 字段、`toggleCallerHidden`/`unhideCaller` actions
- `addSession` 中调用 `unhideCaller`
- `mergeCallers` 中注入 `[System]` 到 pending sessions + 清理 hiddenCallerIds

### app/src/components/CallerManager.tsx
- 新增 `hiddenCallerIds` + `toggleCallerHidden` 到 store 订阅
- 每个 caller 卡片新增眼睛图标按钮（hide/show toggle）
- `cm-caller-hidden` class 添加半透明效果

### app/src/components/CallerTabs.tsx
- 新增 `hiddenCallerIds` 到 store 订阅
- `allOrderedCallers` → filter → `orderedCallers`
- `orderedCallers.length === 0` 时 return null

### app/src/components/FeedbackApp.tsx
- 新增 `hiddenCallerIds` 订阅 + `visibleCallers` memo
- `columnCallerIds` 使用 `visibleOrder` 过滤
- tab区域和sort按钮条件改为 `visibleCallers.length > 1`

### app/src-tauri/src/session.rs
- `FeedbackPayload` 新增 `caller_alias: Option<String>`
- `submit_feedback` 查找 caller alias 并设置到 payload
- `merge_callers` 对 pending sessions 注入 `[System]` 到 summary

### app/src-tauri/src/lib.rs
- `FeedbackPayload` 构造补充 `caller_alias: None`

### server.mjs
- `effectiveAlias = result.caller_alias || alias` 动态选择 alias

### app/src/index.css
- `.cm-caller-hidden { opacity: 0.45; }`

### app/src/i18n/locales/zh.json & en.json
- `callerManager.hide` / `callerManager.show`

## 5. Problem Solving

- **Rust编译错误**：添加 `caller_alias` 字段后 `lib.rs` 中 FeedbackPayload 初始化缺少该字段 → 补充 `caller_alias: None`
- **CallerTabs空列表**：隐藏所有caller后，orderedCallers为空需 return null 避免渲染

## 6. Pending Tasks and Next Steps

所有需求已完整实现。无待处理任务。

如需后续可考虑：
- 发行包构建（Rust后端已改动，需要重新 `npx tauri build`）
- 测试IPC场景下合并+隐藏的端到端行为
- macOS端实际构建测试交通灯位置和圆角效果

---

## 7. 追加：剪贴板权限修复 (2025-07-08)

**问题**: 主页和设置页内复制JSON配置的复制按钮无效
**原因**: `capabilities/default.json` 缺少 `clipboard-manager:allow-write-text` 权限
**修复**: 在 `default.json` 的 permissions 数组中添加 `clipboard-manager:allow-write-text`

## 8. 追加：Mac CallerTabs 拖拽修复 (2025-07-08)

**问题**: macOS构建版本中顶栏CallerTabs拖拽功能无法使用

**根因分析**:
1. **WebKit 要求 setData()**: macOS WKWebView 要求 `dragstart` 事件中必须调用 `e.dataTransfer.setData()` 才能启动拖拽。Windows WebView2 (Chromium) 不要求。
2. **Tauri drag region 冲突**: 标题栏 `data-tauri-drag-region` 属性会拦截 mousedown。Tauri 对 `<button>` 等交互元素跳过拦截，但点击 button 内部子元素（SVG/span）时，target 不是 button，导致 Tauri 启动窗口拖拽。

**修复**:
- `CallerTabs.tsx`: `handleDragStart` 添加 `e.dataTransfer.setData("text/plain", callerId)`
- `index.css`: `.caller-tab > * { pointer-events: none; }` 确保 button 始终为事件目标
- `FeedbackApp.tsx`: 移除 CallerTabs wrapper div 上多余的 `data-tauri-drag-region`

## 9. 追加：macOS UI 适配 — Overlay 方案 (2025-07-08)

**问题**: App 完全没有对 macOS 做界面适配（Windows 风格按钮、无圆角、无交通灯）

**方案**: `titleBarStyle: "Overlay"` + 运行时条件

**实现**:

### tauri.conf.json
```json
"decorations": true,
"titleBarStyle": "Overlay",
"hiddenTitle": true,
"acceptFirstMouse": true
```
- macOS: 原生交通灯 + Overlay 内容延伸到标题栏 + 圆角
- Windows: 运行时 `set_decorations(false)` 恢复无装饰

### lib.rs
```rust
#[cfg(not(target_os = "macos"))]
{
    let _ = window.set_decorations(false);
}
```
在 `window.show()` 之前调用，确保 Windows 不闪烁

### FeedbackApp.tsx
```tsx
const IS_MACOS = navigator.userAgent.includes('Macintosh');
```
- 标题栏: `paddingLeft: 78` (macOS only) 为交通灯留空间
- CallerTabs wrapper: `style={IS_MACOS ? { left: 70 } : undefined}` 居中偏移避开交通灯
- 窗口控制按钮: `{!IS_MACOS && (...)}` 仅 Windows 显示 minimize/maximize/close
