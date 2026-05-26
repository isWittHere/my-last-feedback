---
title: MLFB终端回放与只读附件图标会话摘要
description: 记录终端伪输入修复、Composer/历史修复与只读附件图标统一
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
solved_lists:
  - 完成终端历史回放伪输入根因分析与修复
  - 提交终端修复 commit 03d3921
  - 完成只读 Git Action 附件标签图标统一改动
  - 完成 quick action 不进入消息历史的修复分析与实现
  - 完成 Caller 列数、转移提交 UI、Composer placeholder 相关修复记录
---

# MLFB终端回放与只读附件图标会话摘要

## 1. Previous Conversation

本轮对话围绕 MLFB 桌面端的 dock 完整化、设置页重构、内置终端、Composer 输入体验、反馈历史、终端稳定性和只读状态 UI 一路推进。

早期目标是让应用成为“完全体”：新增右侧 page dock，使左右两侧可用栏位对称；新增一个 tab 作为内置终端页面。随后用户说明内置终端的长期目标是未来能在本 app 中直接使用 Claude Code、OpenCode 这类 CLI 式 agent，因此分析重点从单纯嵌入 shell 扩展到“终端作为 agent console / CLI agent 载体”的数据流、会话持久化和安全边界。

之后工作转向设置页结构调整。用户要求将“已提交反馈视图”独立到一个 MLFB 页面，左侧改为可折叠组，并新增“布局”组用于配置 4 个 dock 各自包含哪些面板标签页。用户进一步明确设置页分组为：通用、显示、MLFB、布局、通知、关于，其中 MLFB 包含 caller 管理、提交反馈、命令，布局包含面板管理、终端、资源管理器。相关实现已经完成并验证。

用户随后要求进行 git 备份和新版本发行包构建。过程中修复过 Windows 打包脚本相关问题，包括 Git Bash 路径传给 Windows Node 导致 `MODULE_NOT_FOUND`、缺少 `zip` 等。构建与发行包打包完成后，用户又要求编写新的会话摘要文档。

之后焦点进入性能和输入体验。用户发现每次输入文本仍会触发 dock 面板内容刷新，要求直接实施根本性修复。修复方向是避免输入草稿变化牵动 dock 内容树，使用 session draft / scoped selectors 等方式降低刷新范围。随后新增了持久化设置：Caller 列数支持自动、1、2、3；以及是否显示“转移提交”系列 UI。

Composer 相关问题经历多轮调试。用户指出 Caller 列数设置项右侧选项被截断，建议使用图标替代文本；输入为空时 placeholder 不显示；中文输入法下未决定拼音会跟在 placeholder 文本之后。之后编写了完整规划书并开始修复。基础方案将 Composer placeholder 从 `::before` 改为 overlay，避免 IME preedit 与 placeholder 混在 contenteditable 内。后续曾尝试 slash command 描述提示、统一 hint 层，以及“删除拼音后提示回来”的修复，但用户最终决定放弃该具体问题，并要求移除对应失败试错代码。

用户又发现上下键切换历史输入时，会连带快捷发送提示词，例如 `Please analyze the user requirements or perform a deeper analysis`。根因定位为提交反馈时把 quick action 文案一起写入 message history。修复方向是让 `buildSubmittedFeedback` 保持提交 markdown 中包含 quick action，但返回给历史记录的 `historyText` 只包含用户实际反馈文本。该修复已实现并在后续状态中未作为未提交变更保留。

最近一轮重点是终端稳定性。用户报告当前终端中总是出现一些用户从未主动输入过的文本，并且此时会导致终端卡死。截图中的 `48;2;33;69;78m` 被识别为 ANSI SGR truecolor 背景色控制序列的一段，说明终端协议数据被错误地显示或写回了 PTY 输入端。

在终端修复完成并提交后，用户提出新的 UI 修复：修复只读状态区域的附件标签图标，使其与正常输入信息框的附件标签使用的图标统一。随后 interactive feedback 要求先执行 git add 和 commit，再处理新需求。因此先提交了终端修复，再开始只读附件图标统一。

## 2. Current Work

当前刚完成两件最近任务。

第一件是终端伪输入与卡死问题。经过分析，根因高概率是 xterm 在历史 output replay、tab 切换或 snapshot 恢复时重新处理旧输出中的终端查询控制序列，并通过 `terminal.onData` 生成协议响应。当前代码原本会把 `onData` 中的所有数据无条件写给后端 `terminal_write`，因此 replay 阶段产生的“终端响应”会被误当成真实用户输入写回 PTY，最后由 shell 显示在 prompt 后面，形成用户从未输入过的 `48;2;33;69;78m` 等文本，并可能打乱 readline 或前台 CLI 的状态。

终端修复已经完成、验证并提交：

```text
commit 03d3921 Fix terminal replay input feedback
```

该提交改动了：

```text
app/src/components/TerminalPanel.tsx
app/src/store/terminalStore.ts
app/src-tauri/src/terminal.rs
```

验证结果：

```text
npm run build: passed
cargo check: passed
git diff --check: passed
```

构建中仍有既有 Vite warning：Tauri API dynamic/static import 混用，以及 chunk size 超过 500 kB。它们不是本次终端修复引入的阻断问题。

第二件是只读附件图标统一。用户要求：

```text
修复只读状态区域的附件标签的各图标，使其与正常输入信息框的附件标签使用的各图标相同统一
```

在处理该任务前，interactive feedback 附带 Git Action：

```text
Please execute git add and git commit now before performing any other requested operation.
```

因此先提交了终端修复，然后检查 `CallerPanelParts.tsx`。发现正常输入区的 Git Action 附件标签使用 `GitActionOptionIcon` 组合图标，而只读状态区域的 Git Action 标签固定使用单个 `git-branch`，导致 commit-before、commit、commit-push、create-branch 都无法与可编辑区保持一致。已将只读 Git Action 标签改为复用 `GitActionOptionIcon`。

当前只读图标修复状态：

```text
Modified: app/src/components/CallerPanelParts.tsx
```

已运行：

```text
get_errors app/src/components/CallerPanelParts.tsx: no errors
```

用户在构建确认弹窗中选择了：

```text
skip_build
```

所以该小改动尚未运行 `npm run build`，也尚未提交。

随后用户发出最新请求：

```text
/compact 请你编写一份新的对话摘要文档。
```

本文件即为该新摘要文档。

## 3. Key Technical Concepts

- React + TypeScript + Vite 前端，主代码位于 `app/src`。
- Tauri 2 + Rust 后端，终端命令位于 `app/src-tauri/src/terminal.rs`，由 `lib.rs` 注册。
- xterm.js 作为内置终端前端，使用 `@xterm/xterm` 与 `@xterm/addon-fit`。
- 前端终端数据流：`terminal-output` event → Zustand `terminalStore.appendTerminalOutput` → `TerminalPanel` 中 `terminal.write(...)`。
- 输入写回数据流：`terminal.onData` → Tauri `invoke("terminal_write")` → Rust PTY writer。
- xterm 的 `onData` 不只代表键盘输入，也可能包含终端协议响应，例如 DA、DSR、DCS、CSI、OSC 查询响应、mouse tracking、bracketed paste 等。
- 历史 output replay 与实时 PTY output 需要区分：实时输出允许 xterm 响应写回 PTY；历史回放和 snapshot replay 不能把 xterm 响应写回真实 PTY。
- Zustand store 包括 `feedbackStore.ts` 与 `terminalStore.ts`。终端输出前端缓冲限制 `OUTPUT_LIMIT = 240_000`。
- Rust 后端终端缓冲限制 `MAX_OUTPUT_BUFFER_BYTES = 1024 * 1024`。
- Composer 使用 contenteditable，历史中应只保存用户实际 typed feedback，不应保存 quick action / system requirement。
- 只读反馈视图由 `ReadonlyTagBar` 与 `ReadonlyComposerContent` 组成；可编辑输入附件标签由 `AttachmentTagBar` 中的 Image/TestLog/Git/MLC/Web tag 组件组成。
- Git Action 图标统一组件是 `GitActionOptionIcon`，用于 commit-before、commit、commit-push、create-branch 的组合图标。
- MyLastChat 摘要文档存放于 `.myLastChat/`，需要 YAML frontmatter，`workplace` 推荐使用 `${workspaceFolder}`。

## 4. Relevant Files and Code

### app/src/components/TerminalPanel.tsx

此文件是内置终端的前端主面板，负责 xterm 实例创建、输出写入、输入写回、tab 切换 replay、fit/resize 和工具栏操作。

终端修复新增了 replay 抑制计数：

```ts
const suppressedTerminalDataWritesRef = useRef(0);
```

新增统一输出写入 helper。实时输出默认不屏蔽，历史 replay 可选择屏蔽 `onData`：

```ts
const writeTerminalOutput = useCallback((terminal: Terminal, output: string, suppressTerminalData = false) => {
  if (!output) return;
  if (!suppressTerminalData) {
    terminal.write(output);
    return;
  }
  suppressedTerminalDataWritesRef.current += 1;
  try {
    terminal.write(output, finishSuppressedTerminalDataWrite);
  } catch {
    finishSuppressedTerminalDataWrite();
  }
}, [finishSuppressedTerminalDataWrite]);
```

full replay 前会 reset xterm 状态，避免 mouse tracking、alternate screen、application cursor 等模式串台：

```ts
const resetAndReplayTerminalOutput = useCallback((terminal: Terminal, output: string) => {
  suppressedTerminalDataWritesRef.current += 1;
  try {
    terminal.reset();
    terminal.clear();
    if (output) terminal.write(output, finishSuppressedTerminalDataWrite);
    else finishSuppressedTerminalDataWrite();
  } catch {
    finishSuppressedTerminalDataWrite();
  }
}, [finishSuppressedTerminalDataWrite]);
```

`onData` 写回 PTY 前会检查是否处于 replay 屏蔽期：

```ts
const dataDisposable = terminal.onData((data) => {
  if (suppressedTerminalDataWritesRef.current > 0) return;
  const terminalId = activeTerminalIdRef.current;
  if (terminalId) void invoke("terminal_write", { terminalId, data }).catch(() => undefined);
});
```

切换 tab 或 output 缩短时改为 reset + suppressed replay；实时增量仍正常写入：

```ts
if (rendered.tabId !== activeTab.id || output.length < rendered.length) {
  resetAndReplayTerminalOutput(terminal, output);
  renderedOutputRef.current = { tabId: activeTab.id, length: output.length };
  return;
}
if (output.length > rendered.length) {
  writeTerminalOutput(terminal, output.slice(rendered.length));
  renderedOutputRef.current = { tabId: activeTab.id, length: output.length };
}
```

### app/src/store/terminalStore.ts

此文件维护终端 tab、输出缓冲、最近路径和后端终端恢复。

原先 `trimOutput` 按字符串长度硬切：

```ts
return value.slice(value.length - OUTPUT_LIMIT);
```

这可能让 replay buffer 从 ANSI 控制序列中间开始。现已改为优先从附近行边界裁剪，并避免从 UTF-16 low surrogate 开头：

```ts
const OUTPUT_TRIM_LINE_SCAN_LIMIT = 4096;

function trimOutput(value: string): string {
  if (value.length <= OUTPUT_LIMIT) return value;
  let trimStart = value.length - OUTPUT_LIMIT;
  const scanEnd = Math.min(value.length, trimStart + OUTPUT_TRIM_LINE_SCAN_LIMIT);
  const newlineIndex = value.indexOf("\n", trimStart);
  if (newlineIndex >= 0 && newlineIndex < scanEnd) trimStart = newlineIndex + 1;
  while (trimStart < value.length) {
    const code = value.charCodeAt(trimStart);
    if (code < 0xdc00 || code > 0xdfff) break;
    trimStart += 1;
  }
  return value.slice(trimStart);
}
```

### app/src-tauri/src/terminal.rs

此文件实现 Rust PTY 终端，包括创建 shell、读写 PTY、resize、kill、list、read_buffer。

后端保存的 terminal output 也曾按 byte length 裁剪。现新增：

```rust
const OUTPUT_TRIM_LINE_SCAN_BYTES: usize = 4096;
```

并在 `trim_output_buffer` 中优先向后寻找换行后再 drain，降低恢复 snapshot 时从控制序列中间 replay 的风险：

```rust
let scan_end = trim_to.saturating_add(OUTPUT_TRIM_LINE_SCAN_BYTES).min(buffer.len());
if trim_to < scan_end {
    if let Some(newline_offset) = buffer[trim_to..scan_end].find('\n') {
        trim_to += newline_offset + 1;
    }
}
```

### app/src/components/CallerPanelParts.tsx

此文件包含可编辑和只读附件标签栏的主要组件：

- `AttachmentTagBar`
- `ImageTag`
- `TestLogTag`
- `GitActionTag`
- `MlcAttachmentTag`
- `WebAttachmentTag`
- `ReadonlyTagBar`
- `ReadonlyLogTag`
- `ReadonlyCommandLogsTag`
- `ResourceAttachmentTag`

正常输入区的 Git Action 标签使用：

```tsx
<GitActionOptionIcon type={gitAction.type} size={11} />
```

只读状态区域原先固定使用：

```tsx
<Icon name="git-branch" size={10} />
```

当前已修改为：

```tsx
<GitActionOptionIcon type={session.gitAction!.type} size={11} />
```

这样只读区与可编辑输入区在 commit-before、commit、commit-push、create-branch 四种 Git Action 上使用相同图标体系。

### app/src/composer/submittedFeedback.ts

此文件构建提交给 caller 的 markdown，并返回用于历史输入的 `historyText`。

最近的关键修复是历史不再包含 quick action 文案：

```ts
return {
  markdown: sections.join("\n\n"),
  historyText: trimmedFeedback,
  imageList: session.images.map((image) => ({ path: image.path, name: image.name, data_url: image.dataUrl })),
};
```

这个修复保证上下键历史只还原用户实际输入，而不是把快捷发送按钮附加的 prompt 当成用户反馈。

### app/src/components/CallerPanel.tsx

此文件调用 `buildSubmittedFeedback`，并把返回的 `historyText` 写入历史：

```ts
const submittedFeedback = buildSubmittedFeedback(activeSession, {
  prompts: visiblePrompts,
  quickAction,
  callerAlias: caller?.alias || null,
  transferAlias: showTransferSubmitUi ? transferAlias : null,
  language: i18n.language,
});
const historyText = submittedFeedback.historyText;
```

提交成功后调用：

```ts
pushMessageHistory(activeSession.callerId, historyText);
```

### app/src/components/FeedbackInput.tsx

此文件负责 Composer 输入封装与上下键历史回放。它通过：

```ts
useFeedbackStore.getState().getMessageHistory(callerId)
```

读取历史，并在 ArrowUp / ArrowDown 中设置当前输入值。历史污染问题的根因不在此处，而在提交时写入了错误的 `historyText`。

### app/src/components/composer/ComposerEditor.tsx

此文件是自定义 contenteditable 编辑器，涉及 token chip、slash command、resource link、color token、selection restore、composition / IME 处理和 placeholder overlay。

本轮已清理用户放弃的“删除拼音后提示回来”试错方向。当前经验是：不要把提示文本放进 contenteditable DOM 内部；提示应尽量走 overlay，避免干扰 IME preedit 与 selection。

### app/src/index.css

此文件包含 Caller 列数图标化、Composer placeholder overlay、attachment tags、terminal panel、dock tabs 等全局样式。

本轮没有在最新附件图标统一中修改 CSS，因为问题是图标组件不一致，不是样式问题。

## 5. Problem Solving

### 终端出现伪输入并卡死

现象：用户截图中终端出现 `48;2;33;69;78m`，用户没有主动输入，之后终端卡死。

分析：该文本高度疑似 ANSI SGR truecolor 背景色序列的一段。完整形式可能是：

```text
ESC [ 48 ; 2 ; 33 ; 69 ; 78 m
```

更深一层，xterm 可能在处理某些查询序列时返回当前 SGR 状态响应。如果这发生在历史 replay 阶段，响应本不应该写回真实 PTY。但旧代码中 `terminal.onData` 对所有 data 都无条件调用 `terminal_write`，因此 xterm 的 replay 响应会变成 shell stdin，显示成用户未输入过的文本。

解决：

- 对历史/快照 replay 增加 suppress 计数。
- `terminal.onData` 在 suppress 期间直接 return。
- 初始 output replay 也使用 xterm `write` callback 控制 suppress 生命周期，防止异步写入晚于 listener 注册。
- full replay 前执行 `terminal.reset()` 与 `terminal.clear()`，清理 xterm 模式状态。
- 实时 PTY output delta 不屏蔽，保留正常终端协议能力。
- 前端和后端 output buffer 裁剪优先从行边界开始，降低从 ANSI 控制序列中间 replay 的风险。

验证：

```text
npm run build: passed
cargo check: passed
git diff --check: passed
```

结果：终端修复已提交为 `03d3921 Fix terminal replay input feedback`。

### 只读附件标签图标不一致

现象：用户要求只读状态区域的附件标签图标与正常输入信息框附件标签统一。

分析：多数组件已经复用同一 tag 组件：

- `ImageTag` 同时用于可编辑和只读。
- `MlcAttachmentTag` 同时用于可编辑和只读。
- `WebAttachmentTag` 同时用于可编辑和只读。
- `TestLogTag` 与 `ReadonlyLogTag` 均使用 `Icon name="file"`。

明确差异是 Git Action：可编辑输入区使用 `GitActionOptionIcon`，只读区固定使用 `git-branch`。

解决：只读区 Git Action 标签改为：

```tsx
<GitActionOptionIcon type={session.gitAction!.type} size={11} />
```

验证：

```text
get_errors app/src/components/CallerPanelParts.tsx: no errors
```

用户选择跳过构建：

```text
skip_build
```

因此尚未运行 `npm run build`，尚未提交。

### quick action 污染上下键历史

现象：上下键切换历史输入时，会连带快捷发送提示词，例如：

```text
Please analyze the user requirements or perform a deeper analysis
```

分析：提交 markdown 正确包含 quick action，但历史记录不应保存 quick action。历史记录代表用户 typed feedback，而不是最终提交 payload。

解决：`buildSubmittedFeedback` 返回 `historyText: trimmedFeedback`，保留 markdown 不变。

验证：此前已通过 build 和 diff check。

### Composer placeholder / IME 经验

现象包括：

- 空输入时 placeholder 不显示。
- 中文输入法下未决定拼音跟在 placeholder 后。
- slash command hint 与 contenteditable 内节点冲突。
- “删除拼音后提示回来”多轮修复无效。

最终经验：

- placeholder 不应依赖 contenteditable 的 `::before`。
- 提示文本不应插入 contenteditable DOM。
- 对 IME preedit 的修复不能无限加事件补丁。
- 用户已明确放弃“删除拼音后提示回来”这条修复尝试，并要求清理失败试错。

## 6. Pending Tasks and Next Steps

当前最重要的未完成任务来自用户最近的明确请求：

```text
修复只读状态区域的附件标签的各图标，使其与正常输入信息框的附件标签使用的各图标相同统一
```

当前状态：

- 已修改 `app/src/components/CallerPanelParts.tsx`。
- 已将只读 Git Action 标签从固定 `git-branch` 改为 `GitActionOptionIcon`。
- 已运行 `get_errors`，无错误。
- 用户在构建确认中选择 `skip_build`，所以未跑 `npm run build`。
- 该改动尚未提交。

建议下一步：

1. 如果继续完善，只需复核是否还有用户眼中的“只读状态区域附件标签”不属于 `ReadonlyTagBar`，例如 markdown section 内的 resource chip 或 command logs 标签。
2. 如果用户要求验证，可运行：

```bash
cd /e/Dev/my-last-feedback/app && npm run build
```

3. 如果用户要求提交，可执行：

```bash
git add app/src/components/CallerPanelParts.tsx
git commit -m "Unify readonly attachment tag icons"
```

4. 若用户反馈图标仍不统一，需要截图或指出具体标签类型。最可能的进一步统一点包括：

- 只读 command logs 标签是否应与某个正常输入区按钮或 tag 保持同图标。
- 只读 resource link tag 是否应与 Composer resource token / resource tree 图标策略完全一致。
- MLC 个体附件是否应从 `book` 改为 `MlcLogoIcon`，但目前可编辑与只读个体 MLC tag 复用同一 `MlcAttachmentTag`，所以这不是只读独有差异。

最新的 `/compact` 请求原文：

```text
/compact 请你编写一份新的对话摘要文档。
```

本文件已按 `.myLastChat/` YAML frontmatter 规范创建。