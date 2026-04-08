---
title: UI改进与新工具开发
description: Bug修复 + 新工具 + 侧边栏重构 + 通知系统 + UI缩放
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
solved_lists:
  - 只读textarea文本可选中复制
  - Heading导航栏不再误匹配代码块内标题
  - 新增register_agent MCP工具
  - System消息增加转义字符警告
  - 左栏头像点击复制agent_name
  - 顶栏分栏数量手动切换按钮（点击循环+悬停选择器）
  - 侧边栏时间分组（今天/昨天/上周/更早）可折叠sticky header
  - 侧边栏session item两行布局（图标+标题 / 时间+删除按钮）
  - 时间显示优化（刚刚/X分钟前/X小时前/X天前/X月X日）
  - 取消的会话不再优先排序（与responded同等）
  - 持久未读状态（blinkingCallerIds→unreadCallerIds + 无限呼吸动画）
  - 任务栏闪烁（requestUserAttention + capability权限）
  - 系统通知（Web Notification API）
  - 设置页通知Tab（3个开关）
  - Caller气泡面板残留修复（dragStart清除hover状态）
  - Pending会话手动取消按钮
  - 设置面板固定尺寸（420×420px）
  - 展开日志时输入面板自动扩大
  - UI模块化缩放（全局/摘要/输入 3个滑块）
---

# UI改进与新工具开发

## 1. Previous Conversation

用户提出了对 My Last Feedback (Tauri 2.0 MCP 反馈桌面应用) 的多项改进需求，分两轮进行:

**第一轮 (4个问题):**
1. 只读 textarea 中的文本无法选中复制
2. 右上角 Heading 导航栏显示错误内容（误匹配代码块中的 `#`）
3. 希望新增一个 MCP 工具让 agent 申请 ID
4. 在 system 回复中提示 agent 不要用转义字符

**第二轮 (2个新需求):**
5. 左栏 agent 头像点击复制 `agent_name="XXXX"`
6. 顶栏新增分栏数量切换按钮（自动/1/2/3），点击循环切换 + 悬停弹出下拉选择器

**第三轮 (侧边栏改进):**
7. 图标与标题同行（改为两行布局）
8. 时间显示改为中文友好格式 + 可折叠时间分组（今天/昨天/上周/更早）
9. 删除按钮从标题行移到时间行

## 2. Current Work

所有 9 项需求全部实施完成，TypeScript 编译无错误。

最后完成的是侧边栏布局重构，包括:
- 将 `SessionGroup` 组件作为可折叠分组容器
- 改写 `timeAgo()` 函数支持 i18n
- 新增 `getTimeGroup()` 时间分组函数
- 重构 session item 的 DOM 结构为两行布局
- 更新 CSS 样式（session-item-row1/row2, session-group-header）

## 3. Key Technical Concepts

- **Tauri 2.0** + React 19 + TypeScript + Vite 7 桌面应用架构
- **MCP (Model Context Protocol)** — `@modelcontextprotocol/sdk` 实现 stdio 通信
- **Zustand** 状态管理 (feedbackStore)
- **i18next** 国际化 (中英双语)
- **TailwindCSS 4** + 自定义 CSS 主题系统 (dark/light)
- `user-select` CSS 属性与 readOnly textarea 交互
- Markdown heading parsing 需排除 fenced code blocks
- MCP tool 的 description 和返回值中可嵌入 agent 行为指导

## 4. Relevant Files and Code

### `app/src/components/FeedbackInput.tsx`
- 添加 `userSelect: "text"` 和 `cursor: "text"` 到 readonly textarea

### `app/src/components/SummaryPanel.tsx`
- 重写 `parseHeadings()` — 逐行解析，追踪 fenced code block 状态，跳过代码块内的 `#` 行

### `server.mjs`
- 新增 `register_agent` tool（接收 project_directory，返回服务端分配的 alias）
- `interactive_feedback` 返回的 `[System]` 消息中追加转义字符禁止提示

### `app/src/components/Sidebar.tsx`
- 新增 `SessionGroup` 可折叠分组组件
- 重写 `timeAgo()` 支持 i18n（刚刚/X分钟前/X小时前/X天前/X月X日）
- 新增 `getTimeGroup()` 时间分组（today/yesterday/lastWeek/earlier）
- 头像点击复制 `agent_name="..."` 到剪贴板
- Session item 改为两行布局（Row1: icon+title, Row2: time+delete）

### `app/src/components/FeedbackApp.tsx`
- 新增 `layoutMode` 状态 (`"auto" | 1 | 2 | 3`)
- 新增 `LayoutModeButton` 组件（点击循环 + 悬停下拉选择器）
- 修改 `maxColumns` 逻辑：layoutMode !== "auto" 时使用固定列数

### `app/src/index.css`
- 新增 `.layout-dropdown` / `.layout-dropdown-item` 样式
- 新增 `.session-group` / `.session-group-header` / `.session-group-count` 样式
- 重构 `.session-item` 为 flex-direction: column 两行布局
- 新增 `.session-item-row1` / `.session-item-row2` 样式

### `app/src/i18n/locales/en.json` & `zh.json`
- 新增 titlebar: layoutMode, layoutAuto
- 新增 sidebar: timeJustNow, timeMinutes, timeHours, timeDays, timeDate
- 新增 sidebar: groupToday, groupYesterday, groupLastWeek, groupEarlier

## 5. Problem Solving

1. **只读 textarea 无法选中**: 根因是父容器 `select-none` (Tailwind) 级联导致，通过在 readonly textarea 上显式设置 `userSelect: "text"` 解决
2. **Heading 导航栏错误**: `parseHeadings()` 原来用全局正则匹配，无法区分代码块内的 `#`。改为逐行解析并追踪 fenced code block 状态
3. **分栏切换**: 在原有自动列数计算基础上增加手动覆盖模式，`maxColumns = layoutMode === "auto" ? autoMaxColumns : layoutMode`

## 6. Pending Tasks and Next Steps

当前所有用户请求的任务已全部完成，无待处理项目。

---

## 更新记录 (Session 2)

### 新增功能 (2025年本次会话)

**第四轮 — 通知系统全面改造:**
1. **取消会话排序修复**: `Sidebar.tsx` 中 `statusOrder` 从 `{cancelled: 1}` 改为 `{cancelled: 2}`，与 responded 同等对待
2. **持久未读状态**: `feedbackStore.ts` 中 `blinkingCallerIds` 重命名为 `unreadCallerIds`，移除 2 秒 setTimeout 自动清除，改为用户点击 caller 时通过 `markCallerRead` 手动清除。CSS 动画从 `0.6s ease 3` 改为 `1s ease-in-out infinite`
3. **任务栏闪烁**: `App.tsx` 中新增 `notifyNewSession()` 函数，当窗口未聚焦且有新消息时调用 `getCurrentWindow().requestUserAttention(2)`。`default.json` 添加 `core:window:allow-request-user-attention` 权限
4. **系统通知**: 使用 Web Notification API（无需 Rust 插件），窗口未聚焦时弹出系统通知
5. **设置页通知 Tab**: `SettingsDialog.tsx` 新增 "notification" tab，包含任务栏闪烁/系统通知/持久未读 3 个开关，存储于 `localStorage("mlf-notification-settings")`

**第五轮 — 杂项修复:**
6. **气泡面板残留修复**: `CallerTabs.tsx` 的 `handleDragStart` 中立即清除 `hoveredCallerId`
7. **Pending 会话手动取消按钮**: `Sidebar.tsx` 的 `SessionGroup` 新增 `onCancel` prop 和圆圈叉号按钮，调用 `markSessionCancelled`
8. **设置面板固定尺寸**: `index.css` 中 `.settings-dialog` 添加 `height: 420px`

**第六轮 — 输入面板和缩放:**
9. **展开日志时自动扩大**: `CallerPanel.tsx` 增加 `useEffect`，`showTestLog` 变 true 时自动增加输入面板比例约 140px
10. **UI 模块化缩放**: 设置 > 显示中 3 个 range slider（全局 70-140%、摘要 70-160%、输入 70-140%），通过 CSS `zoom` 属性实现，CSS 自定义变量 `--zoom-global`/`--zoom-summary`/`--zoom-input`

### 本次修改的所有文件

| 文件 | 改动 |
|------|------|
| `feedbackStore.ts` | unreadCallerIds, markCallerRead, persistentUnread fallback |
| `App.tsx` | notifyNewSession (taskbar flash + system notification) |
| `Sidebar.tsx` | sort fix, cancel button, unreadCallerIds |
| `CallerTabs.tsx` | unreadCallerIds, dragStart hover fix |
| `CallerPanel.tsx` | showTestLog auto-expand |
| `SettingsDialog.tsx` | notification tab, zoom settings (exported helpers) |
| `index.css` | infinite blink, actions CSS, dialog height, range slider, zoom vars |
| `default.json` | request-user-attention capability |
| `en.json` / `zh.json` | notification + zoom + markCancelled i18n keys |

### IME 候选框多屏问题分析

已排除应用代码层面原因。这是 WebView2 在多显示器不同 DPI 缩放下的已知问题（TSF 报告错误屏幕坐标），无简单应用层修复方案。
