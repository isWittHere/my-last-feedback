---
title: MLFB 注意力控制、消息队列、历史重提与主题快捷按钮规划书
description: 规划 MLFB 四项交互增强功能，不包含内置开发预览浏览器
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - MLFB
    - planning
    - UX
    - React
    - Tauri
    - Zustand
solved_lists:
    - 明确新消息 passive 模式的完整不打扰边界
    - 明确消息队列应作为完整 composer draft 而非 responded session 续写
    - 明确历史重提按 caller 隔离
    - 明确主题快捷按钮复用现有主题机制
---

# MLFB 注意力控制、消息队列、历史重提与主题快捷按钮规划书

> 创建日期：2026-04-26

## 1. 背景与目标

MLFB 当前已经具备常驻 GUI、多 Caller、多 Session、图片附件、测试日志、Git 操作、快捷 Prompt、结构化问题、明暗主题与通知设置等基础能力。本规划针对 MLFB 侧新增四项交互增强能力：

1. 新设置项：控制新消息 caller 是否立即占据用户注意力。
2. 消息排队：发送反馈后仍可为该 caller 预输入下一条完整反馈草稿。
3. 消息重提：在输入框内通过上下方向键快速填充该 caller 历史发送消息。
4. 顶栏右侧明暗主题快捷按钮：不进入设置页也能快速切换主题。

本规划明确需求边界、交互行为、数据模型、影响文件、实施阶段、验收标准与风险控制。内置开发预览浏览器已确认单独排期，不纳入本文档范围。

## 2. 当前实现概览

### 2.1 新请求进入路径

- `app/src/App.tsx` 监听 Tauri 事件 `new-feedback-request`。
- 收到请求后会新增 caller、创建 pending session，并无条件执行：
  - `setActiveCaller(data.caller_id)`
  - `setActiveSession(data.session_id)`
  - `notifyNewSession(...)`
- `app/src-tauri/src/ipc.rs` 在收到 MCP 侧 `feedback_request` 后，会无条件对主窗口执行：
  - `window.show()`
  - `window.set_focus()`

### 2.2 Caller 与 Session 状态

- 核心 store 位于 `app/src/store/feedbackStore.ts`。
- `Session.status` 当前有三种：`pending`、`responded`、`cancelled`。
- pending session 可编辑；responded/cancelled session 只读。
- `addSession` 对 pending session 有额外副作用：
  - 自动取消隐藏 caller：`unhideCaller(session.callerId)`
  - 可能将 caller 移动到可见列末位：`setCallerOrder(newOrder)`
  - 更新 pending 数和未读标记。

### 2.3 输入与附件

- 主输入框：`app/src/components/FeedbackInput.tsx`
- 图片附件：`app/src/components/ImageAttachmentWidget.tsx`
- 测试日志与 Git 操作：`app/src/components/CallerPanelParts.tsx`
- 提交编排：`app/src/components/CallerPanel.tsx`
- 当前图片、测试日志、Git 操作都直接读写 active pending `Session`。

### 2.4 主题

- 主题初始化、读取、应用逻辑目前位于 `app/src/components/SettingsDialog.tsx`。
- CSS 主题变量位于 `app/src/index.css`，使用 `:root` 和 `[data-theme="light"]`。
- `useIsLightTheme.ts` 已提供通过 MutationObserver 订阅 `data-theme` 的轻量 hook。

## 3. 总体原则

### 3.1 不打扰原则

当用户关闭“新请求自动占据注意力”后，新消息到达不得改变用户正在进行的动作，包括：

- 不切换 active caller。
- 不切换 active session。
- 不改变 caller 排序。
- 不自动显示被隐藏 caller。
- 不让可见 caller 面板自动跳到新 session。
- 不自动 show/focus 桌面窗口。

仍允许发生的动作：

- 创建 session 并进入历史列表。
- 增加 pending count。
- 更新未读/闪烁标记。
- 触发系统通知和任务栏提醒，前提是对应通知设置仍开启。后续也可将这些通知设置与 passive 模式进一步解耦。

### 3.2 Session 生命周期不变原则

responded/cancelled session 应继续保持只读。消息队列不应通过“让已提交 session 重新可编辑”实现，而应引入独立的 queued draft。

### 3.3 Composer 复用原则

消息队列应尽量复用现有输入能力。用户在队列态能使用主反馈文本、图片、测试日志、Git 操作，交互应与 pending session 的输入区一致。

### 3.4 显式发送原则

队列草稿迁移到下一条 pending session 后，不自动发送。新请求内容可能改变上下文，必须保留用户最后确认动作。

### 3.5 Caller 隔离原则

队列草稿和历史重提都按 caller 隔离，避免不同 agent_name、不同 workspace、不同 caller 的意图互相污染。

## 4. 功能一：新消息注意力控制

### 4.1 功能定义

新增设置项控制新请求到达时的行为：

```ts
type NewRequestAttentionMode = "interrupt" | "passive";
```

建议设置名：

```ts
newRequestAttentionMode: NewRequestAttentionMode
```

或如需布尔化：

```ts
autoFocusNewRequest: boolean
```

推荐使用 mode 字段，便于未来扩展，例如 `badge-only`、`notify-only`、`focus-window-only`。

### 4.2 模式行为

| 行为 | interrupt | passive |
|------|-----------|---------|
| 新增 caller/session | 是 | 是 |
| 更新 pending count | 是 | 是 |
| 更新未读标记 | 是 | 是 |
| 切换 active caller | 是 | 否 |
| 切换 active session | 是 | 否 |
| 自动 unhide caller | 是 | 否 |
| 自动调整 callerOrder | 是 | 否 |
| 可见 CallerPanel 自动选中新 pending | 是 | 否 |
| window.show | 是 | 否 |
| window.set_focus | 是 | 否 |

### 4.3 设置入口

位置：设置面板 `Notification` 页。

建议中文文案：

- 标题：`新请求自动切换`
- 描述：`新请求到达时自动切换到对应 Caller 和最新 Session。关闭后只更新未读标记，不打断当前操作。`

建议英文文案：

- Label：`Auto-focus new requests`
- Description：`Switch to the caller and latest session when a new request arrives. When disabled, only unread indicators are updated.`

### 4.4 状态存储

短期可继续使用 localStorage：

```ts
localStorage key: mlf-notification-settings
field: autoFocusNewRequest
default: true
```

但由于 Rust `ipc.rs` 也需要知道是否 show/focus 窗口，仅前端 localStorage 不够。推荐同时维护一个 Tauri backend setting state。

可选实现方案：

1. 前端设置变更时调用 `set_app_setting` 或专用 `set_auto_focus_new_request` 命令，同步给 Rust state。
2. Rust 启动时从 app data 的 settings 文件加载默认值。
3. IPC 收到请求后读取该 state，决定是否执行 `window.show()` 和 `window.set_focus()`。

如果暂不做 Rust 持久化，也可将 show/focus 从 Rust 移到前端事件处理后执行。但当窗口隐藏时，需验证隐藏 WebView 是否稳定接收事件并执行 JS。

### 4.5 前端改动点

#### `App.tsx`

当前：

```ts
s.addSession(session);
s.setActiveCaller(data.caller_id);
s.setActiveSession(data.session_id);
```

规划：

- `addSession(session, { attentionMode })`
- 仅 `interrupt` 时执行 `setActiveCaller/setActiveSession`。
- `passive` 时保留当前 active 状态。

#### `feedbackStore.addSession`

当前 pending session 会自动 unhide 和 reorder。

规划：

- `addSession` 增加参数或读取 store 设置。
- `passive` 时跳过 `unhideCaller` 与 callerOrder 自动调整。
- pending count、unreadCallerIds、trim、hideInactive 等非打断行为继续执行。

#### `CallerPanel`

当前有 auto-select 新 pending session 的 effect：

```ts
if (callerSessions.length > prevSessionCountRef.current) {
  const latest = callerSessions[callerSessions.length - 1];
  if (latest.status === "pending") {
    setSelectedSessionId(latest.id);
  }
}
```

规划：

- `interrupt` 时保留。
- `passive` 时不自动选中新 session，避免用户正在看旧 session 或编辑队列时被打断。

### 4.6 后端改动点

#### `app/src-tauri/src/ipc.rs`

当前：

```rust
if let Some(window) = app_handle.get_webview_window("main") {
    let _ = window.show();
    let _ = window.set_focus();
}
```

规划：

- 读取共享设置 `auto_focus_new_request`。
- true 时保留 show/focus。
- false 时不 show/focus。

### 4.7 验收标准

- 关闭设置后，当前正在输入的文本不丢失、不被替换。
- 关闭设置后，新 caller 到达不会成为 active caller。
- 关闭设置后，当前 caller 的新 session 到达也不会自动切换当前面板 session。
- 关闭设置后，caller tab 顺序保持不变。
- 关闭设置后，隐藏 caller 不自动出现。
- 关闭设置后，窗口不会主动弹出或抢焦点。
- pending badge 与未读标记仍正确增加。
- 重新开启设置后，行为回到当前 interrupt 模式。

## 5. 功能二：消息排队

### 5.1 功能定义

当用户已提交当前 pending session 后，该 session 会变为只读。此时用户仍可在该 caller 下预先编辑下一条反馈草稿。该草稿在同一 caller 的下一条 pending session 到达时自动填入，但不会自动提交。

### 5.2 非目标

- 不主动向 MCP 发送消息。MCP 当前协议是 agent 调用工具后等待用户响应，GUI 不能凭空向 agent 推送反馈。
- 不让 responded session 重新变成可编辑。
- 不在队列态启用发送按钮、快捷 Prompt、快捷操作按钮。
- 不预填 Agent questions。questions 属于具体请求，不能提前回答未知问题。

### 5.3 Draft 数据模型

新增类型：

```ts
export interface FeedbackDraft {
  feedbackText: string;
  testLogText: string;
  images: ImageAttachment[];
  gitAction: GitAction | null;
  updatedAt: string;
}
```

新增 store 字段：

```ts
queuedDraftsByCallerId: Record<string, FeedbackDraft>;
```

新增 actions：

```ts
getQueuedDraft(callerId: string): FeedbackDraft;
updateQueuedDraftField(callerId: string, field: "feedbackText" | "testLogText", value: string): void;
addQueuedDraftImage(callerId: string, img: ImageAttachment): void;
removeQueuedDraftImage(callerId: string, path: string): void;
clearQueuedDraftImages(callerId: string): void;
setQueuedDraftGitAction(callerId: string, action: GitAction | null): void;
updateQueuedDraftGitBranchName(callerId: string, branchName: string): void;
clearQueuedDraft(callerId: string): void;
applyQueuedDraftToSession(callerId: string, sessionId: string): void;
```

### 5.4 Composer Target 抽象

当前组件大多直接通过 `useActiveCallerSession()` 找 active session，然后调用 session actions。为了让 pending session 和 queued draft 复用同一套 UI，建议引入 composer target。

示例结构：

```ts
type ComposerMode = "session" | "queued-draft";

interface ComposerTarget {
  mode: ComposerMode;
  callerId: string;
  sessionId?: string;
  readonly: boolean;
  feedbackText: string;
  testLogText: string;
  images: ImageAttachment[];
  gitAction: GitAction | null;
  updateFeedbackText(value: string): void;
  updateTestLogText(value: string): void;
  addImage(img: ImageAttachment): void;
  removeImage(path: string): void;
  clearImages(): void;
  setGitAction(action: GitAction | null): void;
  updateGitBranchName(branchName: string): void;
}
```

使用方式：

- 当前选中 pending session：target = session。
- 当前选中 responded/cancelled session 且 caller 存在：target = queued draft。
- caller 没有 pending session：target = queued draft。

### 5.5 UI 行为

#### Pending Session 输入态

保持当前行为：

- 可编辑主反馈。
- 可附加图片。
- 可附加测试日志。
- 可选择 Git 操作。
- 可使用 PromptButtons、QuickActions、发送按钮。

#### Responded/Cancelled + Queue Composer 态

规划布局：

- 上方仍显示已提交 session 的只读内容。
- 底部显示队列 composer，视觉上应与普通输入区一致，但带一个轻量状态提示，例如 `下一次回复草稿`。
- 主反馈、图片、测试日志、Git 操作可用。
- PromptButtons、QuickActions、发送按钮隐藏或禁用。
- 可提供“清空队列草稿”按钮。

#### 新 Pending 到达时

流程：

1. `addSession` 创建 pending session。
2. 检查该 caller 是否存在非空 queued draft。
3. 如果存在，将 draft 内容迁移到新 session。
4. 清空该 caller 的 queued draft。
5. 是否切换到新 session 由注意力设置决定。
6. 不自动提交。

### 5.6 参与队列的内容

| 内容 | 是否参与队列 | 说明 |
|------|--------------|------|
| 主反馈文本 | 是 | 核心队列内容 |
| 图片附件 | 是 | 沿用现有限制：数量、单张大小、总大小 |
| 测试日志 | 是 | 操作逻辑等同现有输入区 |
| Git 操作 | 是 | 包含 commit、commit-push、create-branch 与 branchName |
| PromptButtons | 否 | 当前语义为直接触发发送 |
| QuickActions | 否 | 当前语义为直接触发发送 |
| 发送按钮 | 否 | 队列态不能发送，必须等待 pending session |
| Agent questions | 否 | questions 属于具体 session |

### 5.7 持久化策略

#### 阶段 1：内存队列

优点：

- 改动小。
- 能快速验证交互是否正确。
- 不涉及图片文件生命周期。

缺点：

- App 重启后队列草稿丢失。

#### 阶段 2：持久队列

推荐实现：

- 文本、测试日志、Git 操作写入 app data 下 `drafts.json`。
- 图片写入 app data 下 `draft-images/`。
- `ImageAttachment` 中保存 draft image file reference。
- 迁移到 pending session 时读取并转换成 submit 所需 payload。

不推荐将图片 dataUrl 放入 localStorage，原因：

- 图片 base64 体积大。
- localStorage 容量有限。
- 清理和迁移困难。

### 5.8 边界行为

#### Caller 删除

删除 caller 时同步删除该 caller 的 queued draft。

#### Caller 合并

source caller 合并到 target caller 时：

- 如果 source 有 queued draft，target 没有，则迁移到 target。
- 如果两边都有 draft，保守策略是保留 target，并将 source draft 追加到 target feedbackText 下方，图片/日志/Git 操作按冲突规则合并。
- Git action 冲突时保留 target，source 转为文本提示更安全。

#### Clear All History

清除所有历史时同步清空 queued drafts。

#### Session Trim

自动修剪旧 session 不应影响 queued draft。

#### Client Disconnect

pending session cancelled 后，如果用户仍想准备下一条回复，应显示 queue composer。

### 5.9 验收标准

- 提交反馈后，原 session 只读不变。
- 同一 caller 下可继续输入下一条草稿。
- 队列态支持主文本、图片、测试日志、Git 操作。
- 队列态不会出现可直接发送的按钮，或这些按钮不可用且有明确提示。
- 新 pending 到达后，队列草稿自动迁移到该 session。
- 迁移后队列草稿被清空。
- 迁移不会自动提交。
- passive 注意力模式下，迁移数据但不自动切换当前视图。
- interrupt 注意力模式下，迁移数据并切到新 session，用户可检查后发送。

## 6. 功能三：消息重提

### 6.1 功能定义

用户在主反馈输入框内按上下方向键，可按 caller 隔离浏览历史发送消息，并快速填充到当前 composer。

### 6.2 数据模型

```ts
messageHistoryByCallerId: Record<string, string[]>;
```

新增 actions：

```ts
pushMessageHistory(callerId: string, text: string): void;
getMessageHistory(callerId: string): string[];
clearMessageHistory(callerId?: string): void;
```

建议限制：

- 每个 caller 最多 50 条。
- 空内容不记录。
- 连续重复内容不记录。
- 可选：完全重复内容移动到最新位置。

### 6.3 历史内容来源

提交成功后记录“用户真正写下或选择的主反馈内容”。

应记录：

- `feedbackText.trim()`
- quick action 文本，如果本次发送由 QuickActions 触发
- prompt content，如果本次发送由 PromptButtons 触发
- 用户文本和 quick action/prompt 同时存在时，可记录组合后的主反馈内容

不应记录：

- `[System] Reminder...`
- `Agent Questions Response` Markdown 表格
- `Attachment: Test Logs`
- `Attachment: Images`
- Git Action 生成的指令

原因：历史重提的目标是快速复用用户自然语言反馈，而不是复用提交 payload 的机器化包装。

### 6.4 键盘交互

只在主反馈 textarea 中启用，不影响测试日志 textarea。

#### ArrowUp

- 如果没有历史，不处理。
- 如果 textarea 是单行或光标位于第一行时，进入历史浏览。
- 第一次进入历史浏览前，保存当前未提交草稿为 `historyScratchDraft`。
- 填充上一条历史。
- 阻止默认光标移动。

#### ArrowDown

- 如果当前不在历史浏览态，保留默认行为。
- 如果在历史浏览态，移动到下一条历史。
- 越过最新历史后，恢复 `historyScratchDraft`，退出历史浏览态。

#### Escape 或手动输入

- 用户手动输入新字符后退出历史浏览态。
- Escape 可恢复进入历史前的草稿，作为增强项。

### 6.5 光标边界判断

为避免破坏多行编辑：

- ArrowUp 仅在 selectionStart 所在行是第一行时触发历史。
- ArrowDown 仅在 selectionStart 所在行是最后一行，且当前处于历史浏览态时触发历史。
- 有选区时不触发历史，保留默认行为。

### 6.6 持久化

消息历史文本体积较小，可使用 localStorage：

```ts
localStorage key: mlf-message-history-by-caller
```

后续如需与 `history.json` 统一，可迁移到 Rust app data。

### 6.7 与队列的关系

消息重提作用于当前 composer target：

- 当前是 pending session：填充 pending session 的 `feedbackText`。
- 当前是 queued draft：填充 queued draft 的 `feedbackText`。

因此它应该接在 composer target 抽象之后，或至少预留适配接口。

### 6.8 验收标准

- caller A 的历史不会出现在 caller B。
- 提交成功后历史可通过上键取回。
- 多行文本中间按上下键仍正常移动光标。
- 进入历史前的草稿可通过下键恢复。
- 历史填充对 pending session 和 queued draft 都有效。
- 重启应用后文本历史仍存在。

## 7. 功能四：顶栏明暗主题快捷按钮

### 7.1 功能定义

在顶栏右侧按钮组添加主题快捷切换按钮。点击后在暗色和浅色主题之间切换，与设置页主题选项保持同步。

### 7.2 当前问题

主题逻辑当前封装在 `SettingsDialog.tsx` 内部：

- `getStoredTheme`
- `applyTheme`
- 初始化 `applyTheme(getStoredTheme())`

顶栏 `FeedbackApp.tsx` 无法直接复用这套逻辑，若直接复制会造成维护重复。

### 7.3 规划实现

新增文件：

```text
app/src/theme.ts
```

建议内容：

```ts
export type Theme = "dark" | "light";

export function getStoredTheme(): Theme;
export function applyTheme(theme: Theme): void;
export function toggleTheme(): Theme;
export function getCurrentTheme(): Theme;
```

调整：

- `SettingsDialog.tsx` 从 `theme.ts` 导入主题函数。
- `FeedbackApp.tsx` 顶栏按钮调用 `toggleTheme()`。
- `useIsLightTheme.ts` 可继续监听 `document.documentElement[data-theme]`，无需强制改成 store。

### 7.4 UI 位置

位置：顶栏右侧 controls，建议放在设置按钮左侧。

按钮行为：

- 当前暗色：显示 sun 图标，title 为“切换到浅色主题”。
- 当前浅色：显示 moon 图标，title 为“切换到深色主题”。

是否只在 MLFB 显示：

- 本需求属于 MLFB，但主题是全局外观能力。
- 推荐顶栏全局显示，MLFB/MLRA 都受益。
- 如果严格限定 MLFB，可在 `appView === "MLFB"` 时显示；但设置页已有全局主题，隐藏在 MLRA 反而可能造成不一致。

### 7.5 i18n

新增键：

```json
{
  "titlebar": {
    "toggleLightTheme": "切换到浅色主题",
    "toggleDarkTheme": "切换到深色主题"
  }
}
```

英文：

```json
{
  "titlebar": {
    "toggleLightTheme": "Switch to light theme",
    "toggleDarkTheme": "Switch to dark theme"
  }
}
```

### 7.6 验收标准

- 点击顶栏按钮可立即切换主题。
- 设置页主题选中状态与顶栏切换结果一致。
- 主题选择刷新后保留。
- 图标与 tooltip 符合当前状态。
- 不影响现有设置页主题切换。

## 8. 实施阶段建议

### Phase 1：主题快捷按钮

目标：快速交付低风险改动。

改动：

- 新增 `theme.ts`。
- 修改 `SettingsDialog.tsx` 复用主题工具。
- 修改 `FeedbackApp.tsx` 顶栏按钮。
- 补充 i18n。

风险：低。

### Phase 2：注意力控制 passive 模式

目标：解决新消息打断用户操作的问题。

改动：

- 扩展 notification settings。
- 修改 `App.tsx` 新请求处理。
- 修改 `feedbackStore.addSession` 的 pending 副作用。
- 修改 `CallerPanel` 自动选中新 session 逻辑。
- 增加 Rust backend setting state 或等效机制，控制 `window.show/set_focus`。

风险：中。

重点测试：多 caller、多列、隐藏 caller、窗口隐藏、正在输入时新请求到达。

### Phase 3：消息重提

目标：按 caller 隔离的历史消息填充。

改动：

- store 增加 `messageHistoryByCallerId`。
- 提交成功后记录历史。
- `FeedbackInput` 增加 ArrowUp/ArrowDown 处理。
- localStorage 持久化。

风险：中低。

重点测试：多行输入、草稿恢复、caller 切换、队列态兼容预留。

### Phase 4：消息排队内存版

目标：实现全功能 composer draft，但暂不做持久图片。

改动：

- store 增加 `FeedbackDraft` 与 `queuedDraftsByCallerId`。
- 抽象 composer target。
- 改造 `FeedbackInput`、`ImageAttachmentWidget`、`AttachmentTagBar/TestLogInput`、Git action panel。
- `CallerPanel` responded/cancelled 状态下显示队列 composer。
- 新 pending session 到达时迁移 draft。

风险：高。

重点测试：图片限制、测试日志粘贴、Git action、passive 模式迁移但不跳转、interrupt 模式迁移并跳转。

### Phase 5：消息排队持久化

目标：App 重启后仍保留 queued draft。

改动：

- Rust app data 增加 `drafts.json`。
- Rust app data 增加 `draft-images/`。
- 增加 Tauri commands 管理 draft 文件。
- clear/merge/remove caller 同步清理。

风险：中高。

是否必须：可根据 Phase 4 使用反馈决定。

## 9. 测试计划

### 9.1 手动场景

#### 注意力控制

1. 打开 MLFB，caller A 正在输入。
2. caller B 新请求到达，passive 模式下不切换、不排序、不抢焦点。
3. caller A 当前可见面板收到新 session，passive 模式下不自动选中新 session。
4. hidden caller 收到新请求，passive 模式下不自动出现。
5. 切回 interrupt，确认旧行为恢复。

#### 队列

1. 提交 pending session。
2. 在 responded 只读界面下继续输入队列草稿。
3. 添加图片、测试日志、Git 操作。
4. 同 caller 新 pending 到达，草稿自动迁移。
5. 点击发送后 payload 包含迁移内容。
6. 队列草稿清空。

#### 历史重提

1. caller A 发送三条不同反馈。
2. 在 caller A 输入框按上键依次取回。
3. 切 caller B，确认没有 caller A 历史。
4. 多行文本中间按上/下键不触发历史。
5. 进入历史后按下键恢复临时草稿。

#### 主题按钮

1. 顶栏点击主题按钮。
2. 设置页显示同步。
3. 重启或刷新后主题保持。

### 9.2 自动化建议

现有项目未观察到完整前端测试体系。若增加测试，可优先添加轻量 store 单元测试或 Playwright 手动脚本：

- `addSession` 在 passive 模式下不改变 active 状态和 order。
- `applyQueuedDraftToSession` 正确迁移并清空 draft。
- `pushMessageHistory` 去重、限长、按 caller 隔离。

## 10. 风险与取舍

### 10.1 注意力控制风险

风险：设置分布在前端 localStorage 与 Rust IPC，可能出现不同步。

建议：尽早建立统一 app settings state，不要让 Rust 侧硬编码 show/focus。

### 10.2 队列改造风险

风险：现有输入、图片、日志、Git 操作都直接绑定 Session，抽象 composer target 会触及多个组件。

建议：先做内存版，保持 submitted session 只读；不要同时引入持久化和大规模 UI 重排。

### 10.3 图片持久化风险

风险：图片 dataUrl 体积大，不适合 localStorage。

建议：持久化阶段交给 Rust app data 文件系统处理。

### 10.4 历史重提风险

风险：上下键可能破坏多行编辑习惯。

建议：严格限制触发条件，只在首行/末行边界拦截。

### 10.5 主题按钮风险

风险：主题工具重复定义导致设置页与顶栏不同步。

建议：先抽 `theme.ts`，再改两处调用。

## 11. 建议最终顺序

推荐按以下顺序实施：

1. 顶栏主题快捷按钮。
2. 新消息注意力 passive 模式。
3. 按 caller 隔离的消息重提。
4. 消息排队内存版。
5. 消息排队持久化。

原因：

- 前三项能较快改善日常体验。
- 注意力控制需要优先完成，否则队列迁移时仍可能被新请求打断。
- 历史重提和队列都应作用于 composer target，历史重提可先实现，队列阶段再适配 target。
- 队列是最大改动，应单独开发和验证。

## 12. 交付清单

### 配置与设置

- 新增 `autoFocusNewRequest` 或 `newRequestAttentionMode`。
- SettingsDialog 通知页新增 toggle。
- 前后端设置同步机制。

### Store

- `queuedDraftsByCallerId`
- `messageHistoryByCallerId`
- draft CRUD actions
- history CRUD actions
- `addSession` attention mode 适配

### 组件

- `FeedbackInput` 支持 composer target 与历史重提。
- `ImageAttachmentWidget` 支持 session/draft 双 target。
- `AttachmentTagBar/TestLogInput/GitAction` 支持 session/draft 双 target。
- `CallerPanel` 支持 queue composer。
- `FeedbackApp` 增加主题按钮。
- `SettingsDialog` 复用 theme 工具并新增注意力设置。

### Rust/Tauri

- IPC 收到请求时按设置控制 window show/focus。
- 可选：持久化 draft 的 commands 与文件管理。

### i18n

- 新请求自动切换设置文案。
- 队列 composer 状态文案。
- 队列态发送按钮禁用 tooltip。
- 主题快捷按钮 tooltip。

## 13. 结论

这四项能力可以分成两个层级：

- 轻量交互增强：主题按钮、注意力控制、历史重提。
- Composer 架构增强：消息排队。

建议先完成轻量增强，再单独处理队列。队列实现应以 composer target 抽象为核心，保持 session 生命周期清晰：pending session 负责本次回复，responded/cancelled session 负责历史只读，queued draft 负责下一次回复预输入。这样既满足“发送后继续预输入”的使用目标，也不会破坏当前 MCP 请求/响应模型。