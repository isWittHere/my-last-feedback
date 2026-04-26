---
title: MLFB注意力队列与Legacy清理会话摘要
description: MLFB注意力、队列草稿、图片持久化与legacy清理总结
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
solved_lists:
  - 完成顶栏主题快捷切换
  - 完成新请求自动切换与passive注意力模式
  - 完成按caller隔离的历史反馈重提
  - 完成responded/cancelled后的队列草稿composer
  - 完成草稿图片draft-images文件持久化
  - 完成旧版legacy三段式界面与fallback链路清理
  - 修复ImageData误删导致的Rust构建错误
---

# MLFB注意力队列与Legacy清理会话摘要

## 1. Previous Conversation

本轮会话从用户要求“现在我们继续任务。请你阅读附件规划书，先完成该规划书中规划的任务”开始。核心规划书是 `.myLastChat/MLC_MLFB_注意力队列历史主题规划书.md`，目标是把 MLFB 的注意力控制、消息队列草稿、历史反馈重提和主题快捷按钮落到实现中。

实现过程中，用户多次强调不要停在折中方案，而是“现在请你不要妥协，将规划落实到最终预期”。因此实现从最初的前端交互扩展到前后端持久化和行为边界整理，包括：

- 顶栏明暗主题快捷按钮。
- 新请求自动切换开关，以及关闭后的 passive 不打扰行为。
- 同 caller 历史反馈用 ArrowUp / ArrowDown 重提。
- responded / cancelled session 保持只读，在只读内容下方提供下一次回复草稿 composer。
- 草稿支持 feedback text、图片、测试日志、Git action，并在同 caller 新 pending session 到达时迁移，但不自动发送。

随后用户针对队列草稿 UX 提出细节调整：

- “请你将‘反馈已提交信息’行还原成原本的样式。”
- “草稿信息区域不要有‘下一次回复草稿’文本行，而是将 向XXX发送反馈 改为‘准备为XXX发送反馈（草稿）...’并且特地加粗本行。”
- “由于草稿信息输入没有提交这种操作所以快捷键只需提示粘贴图片即可。”
- “让两个区域分界线可用调整高度。”
- “将‘反馈已提交（只读）’转移到已反馈内容右上角作为一个悬浮圆角矩形。”

之后用户察觉到旧版 UI：“我隐约察觉到似乎存在某个远古时代的旧版界面，我想要移除它。请你检测”。经检测，旧界面来自 MCP persistent IPC 失败后的 legacy fallback 链路，已记录到 `.myLastChat/MLC_MLFB_旧版Legacy界面残留检测记录.md`。

二次验收时发现两个未完成点：legacy 清理暂缓、草稿图片仍以 JSON 内嵌 dataUrl 保存。用户随后明确要求先修复图片持久化，再准备修复 legacy 残留，并最终问“可用一步到位吗？”。之后已完成一步到位清理。

## 2. Current Work

最近完成的工作集中在两个方面：草稿图片持久化最终化，以及旧版 legacy 界面链路彻底清理。

草稿图片持久化方面，用户要求修复：“草稿图片持久化仍是 JSON 内嵌 dataUrl，不是规划中最稳的 draft-images/ 文件引用方案。”实现已改为：

- 保存 queued drafts 时，Rust 后端扫描每个 draft 的 `images`。
- 如果图片带 `dataUrl`，则拆出 MIME 与 base64 数据，保存到 app data 下的 `draft-images/` 目录。
- `queued-drafts.json` 中删除 `dataUrl`，改为保存 `draft_file` 与 `draft_mime` 引用字段。
- 加载 queued drafts 时，根据 `draft_file` 和 `draft_mime` 重新生成前端预览需要的 `dataUrl`。
- 保存时清理不再被任何草稿引用的 draft image 文件。

legacy 清理方面，用户先要求了解 `.myLastChat/MLC_MLFB_旧版Legacy界面残留检测记录.md` 并准备修复，随后问是否能一步到位。最终执行了一步到位清理：

- MCP 工具不再 fallback 到 legacy UI。
- 删除 `mcp/mlfb/legacy-mode.mjs`。
- Tauri 不再支持 `AppMode::Legacy`、`get_app_args`、`get_app_mode`、`--output-file` 触发旧模式。
- 前端不再读取 app mode，也不再渲染旧三段式 UI。
- `FeedbackApp` 删除 legacy submit handler、legacy success screen、legacy test log textarea、legacy resize 状态。
- `feedbackStore` 删除 legacy-only 输入、图片、output file、提交状态字段和 actions。
- `FeedbackInput`、`ImageAttachmentWidget`、`SummaryPanel` 删除 legacy fallback 分支，仅服务 persistent session 或 queued draft。

清理后用户提供 dev build 日志，指出 Rust 编译错误：`ImageData` 找不到。根因是清理 legacy output-file command 时误删了 persistent `submit_session_feedback` 仍使用的共享图片入参类型。已恢复 `ImageData` 类型，但没有恢复 legacy command。

## 3. Key Technical Concepts

- React + TypeScript 前端，入口在 `app/src`。
- Zustand store：`app/src/store/feedbackStore.ts` 管理 callers、sessions、queued drafts、message history、prompt visibility 等状态。
- Tauri 2 Rust 后端，入口在 `app/src-tauri/src/lib.rs`。
- persistent IPC 模式：MCP 工具通过 `mcp/mlfb/app-ipc.mjs` 启动/连接桌面 app，并发送 `feedback_request`。
- MLFB persistent session manager：`app/src-tauri/src/session.rs` 负责 callers、sessions、history、persistent feedback submission。
- queued draft：以 caller 为维度保存下一次回复草稿，不绑定已经 responded/cancelled 的 session。
- passive attention mode：新请求到来时可以不切换 active caller/session、不 unhide、不重排、不聚焦窗口。
- draft image persistence：前端仍使用 `ImageAttachment.dataUrl` 预览，后端持久化时转换为 `draft-images/` 文件引用。
- legacy UI：旧版三段式摘要/反馈/测试日志界面，原本由 MCP fallback + Tauri `--output-file` legacy mode + 前端 `!isPersistent` 分支触发，现已清理。

## 4. Relevant Files and Code

### app/src/theme.ts

- 新增主题工具，集中 `dark | light` 主题读取、应用和切换逻辑。
- 被 `FeedbackApp.tsx` 顶栏按钮和 `SettingsDialog.tsx` 显示设置复用。

### app/src/notificationSettings.ts

- 新增通知设置工具。
- `NotificationSettings` 包含 `autoFocusNewRequest`。
- `syncAutoFocusNewRequest(enabled)` 调用 Rust command `set_auto_focus_new_request`。

### app/src/store/feedbackStore.ts

- 已删除 legacy-only app mode 和旧输入状态。
- 保留并扩展 persistent store：callers、sessions、queued drafts、message history。
- 关键结构：

```ts
export interface FeedbackDraft {
  feedbackText: string;
  testLogText: string;
  images: ImageAttachment[];
  gitAction: GitAction | null;
  updatedAt: string;
}
```

- 关键行为：
  - `addSession(session, options?)` 支持 `attentionMode` 和 `applyQueuedDraft`。
  - `applyQueuedDraftToSession(callerId, sessionId)` 将 caller 级草稿迁移到新 pending session。
  - `pushMessageHistory(callerId, text)` 和 `getMessageHistory(callerId)` 按 caller 隔离历史。
  - `persistQueuedDrafts(drafts)` 调用 `save_queued_drafts`，实际图片剥离在 Rust 侧完成。

### app/src/App.tsx

- 启动时同步通知设置、加载 queued drafts、加载 persistent history。
- 已删除 `get_app_mode` 和 legacy args 分支。
- 新请求到来时根据 `autoFocusNewRequest` 选择 interrupt 或 passive。

### app/src/components/FeedbackApp.tsx

- 顶栏包含 MLFB / MLRA 切换、caller tabs、布局模式、主题切换、设置、pin、窗口控制。
- 已删除旧三段式 legacy render 分支。
- body 现在只保留：MLRA view、multi-column CallerPanel、single CallerPanel、WelcomeHome。

### app/src/components/CallerPanel.tsx

- 提交 pending session 时保存 feedback/test log/images/questions/Git action。
- responded/cancelled session 保持只读。
- 已实现悬浮 `ReadonlyStatusBadge`。
- 已实现 `QueuedDraftComposer`。
- 已实现只读内容与草稿 composer 之间的可拖动高度分界线，并持久化到 localStorage。

### app/src/components/FeedbackInput.tsx

- 支持正常 session 输入和 queued draft 输入。
- 支持 paste image。
- 支持 ArrowUp / ArrowDown / Escape 历史重提。
- 已删除 legacy fallback，非 queued 时只写 active persistent session。

### app/src/components/ImageAttachmentWidget.tsx

- 支持 session images 和 queued draft images。
- 已删除 legacy image collection fallback。

### app/src/components/SummaryPanel.tsx

- 渲染 active session summary、questions、project directory、agent identity。
- 已删除 legacy summary/project fallback。

### app/src-tauri/src/lib.rs

- 保留 persistent commands。
- 已删除 legacy mode、legacy args、legacy output-file command。
- `get_app_mode`、`get_app_args` 已删除。
- `setup` 固定启动 IPC server、remote opt-in server、tray，并固定 close requested 时 hide window。
- queued draft 图片持久化新增核心函数：

```rust
fn draft_images_dir(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("draft-images")
}
```

```rust
fn normalize_queued_drafts_for_save(data_dir: &std::path::Path, drafts: &mut serde_json::Value) -> Result<(), String> {
    // 将 dataUrl 写入 draft-images/，JSON 中保留 draft_file / draft_mime
}
```

```rust
fn hydrate_queued_drafts_from_files(data_dir: &std::path::Path, drafts: &mut serde_json::Value) {
    // 加载 JSON 后根据 draft_file / draft_mime 还原 dataUrl
}
```

- `ImageData` 已恢复为 persistent submit path 的图片入参：

```rust
#[derive(Debug, Deserialize)]
pub struct ImageData {
    pub path: String,
    pub data_url: Option<String>,
}
```

### mcp/mlfb/tools/interactive-feedback.mjs

- 已删除 `launchFeedbackUILegacy` import。
- IPC 失败时不再打开旧 UI，而是抛出明确错误：

```js
throw new Error(`MLFB persistent IPC failed: ${ipcErr.message}. Please start or restart the My Last Feedback app and try again.`);
```

### mcp/mlfb/legacy-mode.mjs

- 已删除。

### .myLastChat/MLC_MLFB_旧版Legacy界面残留检测记录.md

- 原本用于记录 legacy 触发链路。
- 已追加修复记录，标明 MCP fallback、Tauri legacy mode、前端旧 UI 分支已清理。

## 5. Problem Solving

已解决的问题包括：

- 规划书中的四项主功能已落地：主题快捷按钮、新请求注意力控制、历史反馈重提、消息队列草稿。
- passive 模式不再打断当前视图，同时 Rust IPC show/focus 行为也受设置控制。
- responded/cancelled 不再被改回可编辑，草稿作为独立 composer 存在。
- 草稿 composer UX 按用户要求完成：无“下一次回复草稿”文本行，placeholder 首行加粗，仅提示粘贴图片，已反馈内容右上角悬浮只读 badge，分界线可拖动。
- queued draft persistence 从 JSON 内嵌 dataUrl 改为 `draft-images/` 文件引用。
- legacy 旧界面链路已从 MCP、Tauri、React 和 store 四层清理。
- 清理 legacy 时误删 `ImageData` 导致 Rust 构建错误，已恢复该 persistent 共享类型。

验证状态：

- VS Code 诊断对 `app/src` 无错误。
- VS Code 诊断对 `app/src-tauri/src` 无错误。
- VS Code 诊断对 `mcp/mlfb/tools/interactive-feedback.mjs` 无错误。
- 残留搜索未再发现 `legacy-mode`、`launchFeedbackUILegacy`、`AppMode`、`get_app_args`、`get_app_mode`、`--output-file`、`LegacyTestLogInput`、`handleSubmitLegacy`、`mode === "legacy"` 等旧入口。
- 用户提供过 dev build 错误日志，`ImageData` 修复后静态诊断已通过；完整 cargo/npm build 是否已由 watch 自动恢复，需要用户或后续终端命令确认。

## 6. Pending Tasks and Next Steps

最近用户的原话是：

> “好的，现在总结一份聊天摘要，之后进行一次备份。”

以及 Git Action：

> “Please execute git add and git commit to backup the current changes.”

当前已完成本摘要文件创建。下一步是执行备份提交：

- 查看 git 状态，确认本轮修改范围。
- 执行 `git add` 加入本轮修改。
- 执行 `git commit` 创建备份提交。

建议提交信息：

```text
feat: finalize MLFB attention queue and remove legacy UI
```

注意：执行 git 命令属于终端操作，需要按当前交互规则先确认后进行。