---
title: UI迭代优化和多caller支持
description: 多caller侧边栏、浮动复制按钮、按钮简化、布局重组等UI微调迭代
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
tags:
  - UI迭代
  - multi-caller
  - React
  - Tauri
  - 浮动组件
  - 布局优化
solved_lists:
  - 多caller支持（IPC端点、CallerContext、CallerPanel）
  - 多列侧边栏布局（responsive）
  - 浮动复制按钮（SummaryPanel）
  - 文本选择支持（userSelect: text）
  - Caller颜色滚动条适配
  - Continue按钮隐藏
  - Submit按钮简化为图标（34×34正方形）
  - 快捷按钮文本改进（开始任务→开始）
  - IPC测试消息验收（Copilot×2 + Cursor×1）
---

# UI迭代优化和多caller支持

> **最后更新**: 2026-03-07

---

## 1. Previous Conversation

### 架构转向（第1-3阶段）
- 从单次启动模式→常驻GUI（persistence mode）
- 实现 IPC 服务器（JSON-over-newline TCP，端口 19850-19860）
- 建立多会话状态管理（CallerContext + Zustand）
- 自动port发现（lock file: `%TEMP%/my-last-feedback.port`）

### 前期UI调整（emoji→SVG, 主题统一）
- 所有图标从emoji→SVG inline (更清晰、可着色)
- 纯灰色主题(`#1e1e1e`基底，`#4ec9b0`主色)
- CallerTabs深灰禁用状态
- Session删除功能（hover可见X按钮）

### 多caller侧边栏布局
- 创建 CallerContext.tsx（React Context for per-column override）
- 创建 useActiveCallerSession.ts hook（context fallback to global store）
- 创建 CallerPanel.tsx（整列组件包含header+sidebar+content）
- 重写 FeedbackApp.tsx responsive布局：
  - 单caller →内联模式（legacy支持）
  - 多caller+足够宽度 →多列CallerPanel（每列≥500px）
  - 多caller但宽度不足 →CallerTabs切换

### 最新UI细节迭代
- **SummaryPanel 浮动复制按钮**：
  - 右下角半透明浮动，鼠标悬停可见
  - 点击复制raw markdown文本
  - 成功后显示绿色✓（1.8秒自动恢复）
  - 启用文本选择（`userSelect: text`）
  
- **Caller主题色滚动条**：
  - `.caller-panel` 上设置 CSS变量 `--caller-color`
  - `.caller-panel ::-webkit-scrollbar-thumb` 使用 `color-mix()` 混合caller色
  - 默认40%不透明，hover时60%不透明
  
- **快捷按钮行简化**：
  - 移除 "继续"(Continue) 按钮
  - 保留：开始、分析、修复、解释 4个按钮
  - Submit 右对齐（flex-1 spacer）
  
- **Submit 按钮简化**：
  - 从"Submit (Ctrl+Enter)"文本版→34×34 icon-only正方形
  - 使用caller颜色背景
  - 提交中显示旋转加载图标
  
- **快捷按钮文文本改进**：
  - zh.json: "开始任务" → "开始"
  - 更简洁，按钮行显示更紧凑

- **IPC测试验收**：
  - 成功发送3条消息：Copilot×2 + Cursor×1
  - 消息携带session_id, caller信息, summary, prompts字段
  - App正确接收并建立会话

---

## 2. Current Work

**当前正在处理的问题**（根据Tauri日志）：

1. **代码块换行问题**：
   - Markdown中的代码块在SummaryPanel中超宽
   - SyntaxHighlighter默认`overflow-x: auto`（水平滚动而非换行）
   - 需要添加`white-space: pre-wrap`和`word-wrap: break-word`

2. **TestLogInput + FeedbackInput 布局重组**：
   - 当前：三个可拖拽面板（Summary → Feedback → TestLog）
   - 目标：改为两个可拖拽面板（Summary → 底部融合区）
   - 底部融合区包含：TestLog + 图片附件 + FeedbackInput + 按钮行
   - TestLogInput 默认隐藏，通过"附加日志"按钮切换显示
   - 图片和日志按钮在同一行，样式一致

3. **图片清除按钮修复**：
   - 当前"全部移除"调用legacy store函数`clearImages()`
   - 在persistent mode应调用`removeSession(sessionId)`清除会话的所有图片
   - 或为ImageAttachmentWidget传递正确的clear handler

4. **i18n缺失翻译**：
   - "附加日志"按钮文本需添加到i18n locale文件

---

## 3. Key Technical Concepts

### 多Caller架构
- **CallerContext.tsx**: React Context提供 `CallerOverride` (callerId, sessionId, setSessionId)
- **useActiveCallerSession**: 从context override或global store获取有效caller/session
- **CallerPanel**: 自容纳的列组件，内部通过Provider传递override给所有子组件
- **Responsive布局**: PANEL_MIN_WIDTH=500px，windowWidth >= callers.length × 500 时切换多列

### React 19 + Zustand 5 坑
- **无selector会infinite loop**：`useFeedbackStore()` 直接返回所有状态会导致 `useSyncExternalStore` tearing
- **正确用法**：使用selector `useFeedbackStore(s => s.fieldName)` 或 `useShallow` 或 `getState()`用于imperative

### IPC协议
- **格式**: JSON-over-newline （每条消息后跟 `\n`，TCP流式）
- **端口范围**: 19850-19860（若占用则自动递增）
- **消息结构**: `{ caller_id, session_id, summary, prompts: [{name, description, content}] }`
- **保活**: lock file at `%TEMP%/my-last-feedback.port` 记录当前port

### CSS变量 + color-mix()
- `--caller-color: hex_value` 在 `.caller-panel` 上设置
- `::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--caller-color) 40%, transparent); }`
- `color-mix()` 实现颜色透明度混合（浏览器兼容性较新，Edge/Chrome支持）

### 浮动元素UI模式
- **group-hover**: Tailwind `group/summary` + `group-hover/summary:flex` 实现hover后显示
- **position:absolute**: 相对父容器绝对定位（需父容器`position:relative`）
- **z-index层级**: 浮动按钮应在内容之上（从上下文推断，未显式设置）

---

## 4. Relevant Files and Code

### SummaryPanel.tsx
**位置**: `app/src/components/SummaryPanel.tsx`
**关键改动**:
1. 添加 `useState(copied)` + `useRef(copyTimer)` 管理复制状态
2. `handleCopyMarkdown` 回调使用 `navigator.clipboard.writeText(summary)`
3. 外层 `<div className="group/summary relative ...">` 支持group-hover
4. 浮动按钮 `className="absolute bottom-2 right-2 ... hidden group-hover/summary:flex"`
5. 内容区启用 `style={{ userSelect: "text" }}` 允许文本选择
**代码片段**:
```tsx
const [copied, setCopied] = useState(false);
const handleCopyMarkdown = useCallback(() => {
  if (!summary) return;
  navigator.clipboard.writeText(summary).then(() => {
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1800);
  });
}, [summary]);

return (
  <div className="group/summary relative flex flex-col h-full min-h-0">
    <div style={{ userSelect: "text" }}>
      {/* ... content ... */}
    </div>
    {summary && (
      <button onClick={handleCopyMarkdown} className="absolute bottom-2 right-2 hidden group-hover/summary:flex">
        {copied ? <svg>✓</svg> : <svg>copy</svg>}
      </button>
    )}
  </div>
);
```

### CallerPanel.tsx
**位置**: `app/src/components/CallerPanel.tsx`
**关键改动**:
1. Line 78: `.caller-panel` 上设置 CSS变量 `'--caller-color': caller.color`
2. Line 107: `const callerColor = caller?.color || 'var(--color-primary)'`
3. Line 240-260: Submit按钮改为 34×34 icon-only，使用caller背景色
4. 清晰的Resizable panel逻辑（normalizing sizes跨3个面板）
**代码片段**:
```tsx
<div className="caller-panel" style={caller?.color ? { 
  borderColor: `${caller.color}44`, 
  '--caller-color': caller.color 
} as React.CSSProperties : undefined}>

// Submit button
<button
  onClick={() => handleSubmit()}
  disabled={sessionSubmitting}
  className="btn"
  title="Submit (Ctrl+Enter)"
  style={{
    width: 34,
    height: 34,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    background: callerColor,
    borderColor: callerColor,
    color: "#fff",
  }}
>
  {sessionSubmitting ? <svg>spin</svg> : <svg>send</svg>}
</button>
```

### QuickActions.tsx
**位置**: `app/src/components/QuickActions.tsx`
**关键改动**:
- 从5个actions数组移除了"continue"项
- 保留：start, analyze, fix, explain
**代码片段**:
```tsx
const ACTIONS = [
  { key: "start", text: "Start the task", icon: <svg>...</svg> },
  { key: "analyze", text: "Please analyze...", icon: <svg>...</svg> },
  { key: "fix", text: "Please find root cause...", icon: <svg>...</svg> },
  { key: "explain", text: "Please explain...", icon: <svg>...</svg> },
] as const;
```

### index.css
**位置**: `app/src/index.css`
**关键改动**:
- 新增 `.caller-panel ::-webkit-scrollbar-thumb` selector
  ```css
  .caller-panel ::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--caller-color, #3a3a54) 40%, transparent);
  }
  .caller-panel ::-webkit-scrollbar-thumb:hover {
    background: color-mix(in srgb, var(--caller-color, #4a4a68) 60%, transparent);
  }
  ```

### zh.json (i18n)
**位置**: `app/src/i18n/locales/zh.json`
**关键改动**:
- `quickActions.start: "开始任务"` → `"开始"`

### IPC Test Script
**位置**: `e:\Dev\my-last-feedback\test-ipc.cjs`
**用途**: 向IPC服务器发送3条测试消息
**消息内容**:
1. Copilot session-1: 按钮布局重构总结
2. Copilot session-2: 滚动条颜色修复
3. Cursor session-1: 浮动复制按钮功能
**执行**: `node test-ipc.cjs` 并行发送3个连接（避免阻塞）

---

## 5. Problem Solving

### 问题1: Zustand + React 19 无限重渲染
**症状**: 组件频繁re-render导致卡顿
**根因**: 直接使用`useFeedbackStore()`获取整个状态会订阅所有字段，触发tearing
**解决**: 
- 使用selector: `useFeedbackStore(s => s.fieldName)`
- 或使用 `useShallow`: `useFeedbackStore(useShallow(s => ({ callers: s.callers })))`
- 或用 `getState()` 在callback中获取

### 问题2: CallerTab切换导致面板闪烁
**症状**: 点击其他caller标签页时，该页面先显示"Waiting..."提示再正常显示
**根因**: `useState(null)` 默认值导致首次render为null
**解决**: 使用lazy initializer函数：
```tsx
const [selectedSessionId, setSelectedSessionId] = useState(() => 
  activeSession?.id ?? mostRecentSessionId
);
```

### 问题3: IPC消息缺少`type`字段
**症状**: Rust端日志 "Invalid JSON: missing field `type`"
**根因**: 测试脚本的消息格式不正确，缺少顶级`type`字段
**解决**: 调整消息格式为 `{ type: "feedback_request", ... }`（或Rust端改为optional type）

### 问题4: IPC test script await阻塞后续消息
**症状**: 三条消息没有全部并行发送
**根因**: test script改为串行：`await send(msg1)` → `await send(msg2)` → `await send(msg3)`，每个await等待完整响应（但TCP连接保持打开）
**解决**: 改为不await，或在独立异步任务中发送

### 问题5: 浏览器不支持color-mix()
**症状**: 某些旧版浏览器无法应用滚动条颜色
**可能性**: 建议使用fallback颜色 `color-mix(..., #4a4a68)` or `rgba(78, 201, 176, 0.4)`

---

## 6. Pending Tasks and Next Steps

### 任务1: 代码块换行修复
**当前状态**: 待实现
**详情**: Markdown中的代码块在SummaryPanel超宽导致水平滚动而非换行
**需要修改的代码**:
- SummaryPanel.tsx 的 CodeBlock 组件：添加 `customStyle={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}`
- 或在 .prose 的CSS中添加代码块宽度限制
**下一步**: 编辑CodeBlock的SyntaxHighlighter props

### 任务2: TestLog/FeedbackInput布局重组
**当前状态**: 用户已请求改进，具体方案待确认
**需要改动**:
1. CallerContent 从3个可拖拽面板改为2个（Summary + Bottom）
2. TestLogInput 默认隐藏，通过"附加日志"按钮toggle显示
3. 图片和日志按钮样式统一（同行显示）
4. FeedbackInput移到底部融合区
**相关代码块**:
```tsx
// 当前（3个可拖拽面板）
<div ref={containerRef} className="flex-1 flex flex-col">
  <div>SummaryPanel</div>
  <ResizeHandle />
  <div>FeedbackInput</div>
  <ResizeHandle />
  <div>TestLogInput</div>
</div>

// 改为（2个可拖拽面板）
<div ref={containerRef} className="flex-1 flex flex-col">
  <div>SummaryPanel</div>
  <ResizeHandle />
  <div>底部融合区
    {showTestLog && <TestLogInput />}
    <ImageAttachmentWidget />
    <FeedbackInput />
    <按钮行 />
  </div>
</div>
```

### 任务3: 图片清除按钮修复
**当前状态**: 待确认清除逻辑
**问题**: 在persistent mode下，"全部移除"应清除当前-session的所有图片，而非全局调用clearImages()
**解决方案**:
- ImageAttachmentWidget接收`onClearAll`prop
- CallerPanel传递正确的clear handler：`() => removeSession(activeSession.id)` 或 `() => updateSessionField(activeSession.id, 'images', [])`
**下一步**: 更新ImageAttachmentWidget接口和CallerPanel的调用

### 任务4: i18n翻译补充
**缺失项**:
- "附加日志" (appended-logs / toggle-test-log)
- 相关的aria-label或提示文本
**文件**: `app/src/i18n/locales/zh.json` + `en.json`

### 任务5: 其他可能优化
- 确认 group-hover 的z-index（浮动按钮是否被内容遮挡）
- 测试多caller下滚动条颜色是否正确应用
- 验证text selection (`userSelect: text`) 在所有浏览器中的行为

---

**总结**: 当前处于UI微调与布局优化的中间阶段，已完成浮动复制按钮和caller颜色滚动条，正在推进TestLog重组和代码块换行修复。预计再2-3个feedback循环可完成本轮UI迭代。
