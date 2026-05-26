---
title: MLFB 旧版 Legacy 界面残留检测记录
description: 记录旧版三段式反馈界面的触发链路与后续移除建议
workplace: ${workspaceFolder}
project: my-last-feedback
type: report
tags:
  - MLFB
  - legacy
  - UI
  - cleanup
solved_lists:
  - 检测到旧版 legacy fallback UI 的完整触发链路
  - 移除 MCP legacy fallback 与旧版三段式前端界面
  - 清理 Tauri legacy mode、output-file 参数链路和前端 legacy store 状态
---

# MLFB 旧版 Legacy 界面残留检测记录

> 创建日期：2026-04-26

## 问题现象

用户截图中出现了一套旧版三段式反馈界面：上方摘要区、中间反馈输入区、下方测试日志区，底部有附图、快捷 Prompt、QuickActions 和发送按钮。

该界面不是当前 persistent 多 caller UI 的普通空态，而是旧版 legacy fallback UI。

## 触发链路

当前触发路径如下：

1. `mcp/mlfb/tools/interactive-feedback.mjs` 调用 persistent IPC。
2. 如果 `ensureAppRunning()` 或 `requestFeedbackViaIpc()` 失败，会 fallback 到 `launchFeedbackUILegacy(...)`。
3. `mcp/mlfb/legacy-mode.mjs` 使用 `--output-file` 启动 Tauri app。
4. `app/src-tauri/src/lib.rs` 根据 `--output-file` 将 `AppMode` 设置为 `Legacy`。
5. `app/src/App.tsx` 读取 `get_app_mode`，legacy 模式下再读取 `get_app_args`。
6. `app/src/components/FeedbackApp.tsx` 在 `!isPersistent` 分支渲染旧三段式 UI。

## 相关文件

- `mcp/mlfb/tools/interactive-feedback.mjs`
- `mcp/mlfb/legacy-mode.mjs`
- `app/src-tauri/src/lib.rs`
- `app/src/App.tsx`
- `app/src/components/FeedbackApp.tsx`
- `app/src/store/feedbackStore.ts`
- `app/src/components/FeedbackInput.tsx`
- `app/src/components/ImageAttachmentWidget.tsx`
- `app/src/components/SummaryPanel.tsx`

## 后续移除建议

建议分两阶段处理：

### Phase 1：行为级移除

- 移除 MCP 侧 legacy fallback 调用。
- IPC 失败时返回明确错误或提示启动常驻 app。
- Tauri app 不再因 `--output-file` 进入 legacy mode。
- 前端不再渲染 `!isPersistent` 旧 UI 分支。

### Phase 2：代码瘦身

- 删除 legacy-only store 字段和 actions。
- 删除 `LegacyTestLogInput`、legacy submit handler、legacy resize state。
- 清理 `FeedbackInput`、`ImageAttachmentWidget`、`SummaryPanel` 中的 legacy 兼容判断。
- 删除 `submit_feedback` legacy Tauri command，如无其他调用方。

## 注意事项

`mcp/mlfb/legacy-mode.mjs` 当前承担 IPC 失败后的兜底能力。移除它后，需要确保 persistent IPC 的启动、端口发现、错误提示足够可靠，否则 MCP 工具失败时将不再弹出旧版同步窗口。

## 修复记录

> 更新日期：2026-04-26

已一步到位清理旧版 legacy 界面链路：

- MCP 侧移除 `launchFeedbackUILegacy` fallback，IPC 失败时直接返回明确错误。
- 删除 `mcp/mlfb/legacy-mode.mjs`。
- Tauri 侧移除 `AppMode`、`get_app_mode`、`get_app_args`、legacy `submit_feedback` command 和 `--output-file` 模式判断。
- Tauri app 启动后固定走 persistent IPC、托盘、隐藏关闭窗口行为。
- 前端启动不再读取 app mode，直接加载 persistent history。
- `FeedbackApp` 删除旧三段式渲染分支、legacy 提交 handler、legacy test log 输入框和旧 resize 状态。
- `feedbackStore` 删除 legacy-only 输入、附件、output file、提交状态字段和 actions。
- `FeedbackInput`、`ImageAttachmentWidget`、`SummaryPanel` 删除 legacy fallback 分支，仅服务 persistent session / queued draft。

验证：

- VS Code 诊断对 `app/src`、`app/src-tauri/src`、`mcp/mlfb/tools/interactive-feedback.mjs` 均未报告错误。
- 关键残留搜索未再发现 `legacy-mode`、`launchFeedbackUILegacy`、`AppMode`、`get_app_args`、`get_app_mode`、`--output-file`、`LegacyTestLogInput`、`handleSubmitLegacy`、`mode === "legacy"` 等旧入口。
- Rust 中仍存在 `session.rs` 的 `submit_feedback`，这是 persistent session manager 的正式提交方法，不属于旧版 output-file command。