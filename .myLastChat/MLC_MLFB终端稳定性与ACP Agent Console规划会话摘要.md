---
title: MLFB终端稳定性与ACP Agent Console规划会话摘要
description: 总结终端修复、ACP规划、Agent UI参考与构建修复
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
solved_lists:
  - 分析并修复终端奇怪字符与卡死相关问题
  - 增加多 shell 选择并将 cmd.exe 设为默认
  - 分析 opencode desktop 与 ACP 接入路线
  - 编写 ACP 接入规划与协议知识文档
  - 分析 MLFB 反馈区域复用为 Agent Console UI 的方案
  - 复制 CBZWW Chat UI 关键参考文件并编写迁移规划
  - 修复 restartTerminalTab 类型遗漏 shell 导致的前端构建失败
  - 完成两次 Git 提交并验证前端构建通过
---

# MLFB终端稳定性与ACP Agent Console规划会话摘要

## 1. Previous Conversation

本轮对话最初从 MLFB 内置终端异常开始。用户报告当前终端页面中会出现一些“用户从未主动输入”的奇怪文本，并且某些交互元素触发后会导致终端卡死，之后终端无法再启动。经过分析，定位到这些文本并不是用户真实输入，而是 ANSI/CSI 控制序列残片，例如 `48;2;33;69;78m`、`33;12H`、`;6H`。这些残片来自终端协议输出或 xterm/PTY/PowerShell 组合中的控制序列、焦点报告、鼠标追踪、历史 replay 或裁剪边界问题。

随后围绕 MLFB 终端层完成了多轮修复和解释：

- Rust 后端终端缓冲裁剪改为 UTF-8 安全，避免在非字符边界截断。
- Rust 后端终端 session mutex 增加 poisoned recovery，避免一次 panic 导致终端状态不可用。
- 前后端增加 CSI fragment 处理，跳过裁剪后残留的控制序列片段。
- 前端 terminal store 引入 `outputBaseLength` 和 `outputGeneration`，避免 active TUI 历史被半截 replay。
- `TerminalPanel` 改为按逻辑输出坐标做增量写入，只有 tab/generation 变化或无法恢复增量 gap 时才 replay。
- terminal replay suppression 延后一拍，减少 `onData` 回声/控制响应被误当成用户输入的风险。

用户随后询问当前使用 `pwsh.exe`，是否换一个终端程序就可以解决。解释结论是：换 shell 能降低风险，但不能根治 agent 工作流。`pwsh.exe` + PSReadLine + xterm.js + PTY 的组合更复杂，更容易触发 VT 控制序列；用户测试发现 `cmd.exe` 更稳定，因此 MLFB 将普通终端默认 shell 改为 `cmd.exe`，同时增加了多个可选 shell：auto、PowerShell 7、Windows PowerShell、cmd、Git Bash、WSL Bash。

由于终端不稳定暴露出 raw terminal 不适合长期承载 agent 工作流，话题转向 opencode 与 ACP。用户要求分析 `ref-repos\opencode-1.14.33` 官方源码，重点关注 desktop 版本如何通过 UI 使用 opencode，以及是否有 ACP 相关案例。分析结论是：opencode desktop 自身使用 Tauri desktop + 本地 sidecar HTTP server + `@opencode-ai/sdk` + SSE；但外部编辑器/IDE 集成推荐使用 `opencode acp`，也就是通过 stdio nd-JSON JSON-RPC 的 ACP 协议对接。

在进一步分析 opencode Zed extension 后，确认 Zed 扩展只是声明式下载 opencode 二进制并以 `args = ["acp"]` 启动，证明 MLFB 作为外部宿主应优先实现 ACP client，而不是模仿 opencode desktop 内部 HTTP sidecar 架构。由此形成架构判断：普通 Terminal 继续保留并默认 `cmd.exe`，作为 shell/CLI fallback；结构化 agent 工作流应走 ACP Agent Console。

之后用户开始讨论 Agent Console UI。用户提出希望它与当前 MLFB 反馈区域采用相似结构：上方 agent 反馈区就是聊天记录区域，底部输入框就是用户输入框；并认为 MLFB UI 几乎可以直接复用许多代码。经分析，确认这个方向是正确的：Agent Console 应成为“MLFB 反馈区域的 agent 会话版本”，而不是像 opencode desktop，也不是像终端。

后续用户又要求调查 `E:\Dev\CBZWW_all\CBZWW_web\frontend-v2` 中的 Chat 页面。该页面是用户之前开发并喜欢的 agent UI，尤其喜欢它的 agent 流式输出过程 UI、思考/工具调用/输出的两种显示模式和整体漂亮 UI。分析后确认 CBZWW Chat UI 的核心价值不是单纯视觉主题，而是 `ContentBlock` 事件模型、process/result 分层、`ProcessGroup` 的 timeline/tab 双显示模式、双区流式 Markdown 渲染、phase-aware streaming indicator、sticky user bar、outline 和 task panel 等机制。

用户随后要求复制 CBZWW Chat UI 关键文件到 `E:\Dev\my-last-feedback\ref-repos\CBZWW-chat-ui` 以便后续参考，并要求新建规划文档。已完成复制与文档编写。

最后，用户要求阅读 `.myLastChat/MLC_构建失败原因_TerminalShell类型不一致.md`。文档说明前端构建失败是因为 `restartTerminalTab` 的 TypeScript options 类型遗漏 `shell`。用户要求先详细解释，随后通过 interactive feedback 选择“立即修复”和“提取类型”。已按该方式修复，运行前端构建通过，并提交修复。

## 2. Current Work

最近完成的工作集中在三个部分：

### 2.1 CBZWW Chat UI参考文件与规划文档

用户要求：

> 请你复制来自E:\Dev\CBZWW_all\CBZWW_web\frontend-v2的关键agent UI相关的关键文件到E:\Dev\my-last-feedback\ref-repos\CBZWW-chat-ui文件夹内以便后续参考。

已复制 CBZWW Chat UI 的关键文件到：

```text
ref-repos/CBZWW-chat-ui/
```

复制范围包括：

```text
src/pages/Chat.tsx
src/store/chatStore.ts
src/lib/sseClient.ts
src/lib/cn.ts
src/lib/theme.tsx
src/lib/useClickOutside.ts
src/constants/models.ts
src/styles/globals.css
src/components/zeven/**
```

还新增了参考目录说明：

```text
ref-repos/CBZWW-chat-ui/README.md
```

新增规划文档：

```text
.myLastChat/MLC_CBZWW Chat UI参考迁移规划.md
```

文档记录了 CBZWW Chat UI 的 `ContentBlock` 协议、`process/result` 分层、`ProcessGroup` 的 timeline/tab 双模式、双区流式 Markdown 渲染、rAF 字符释放策略、phase-aware streaming indicator 以及迁移到 MLFB Agent Console 的组件规划。

相关内容已经提交：

```text
2f6ea2d docs: add agent console UI references
```

### 2.2 TerminalShell类型构建失败修复

用户要求：

> 请你阅读E:\Dev\my-last-feedback\.myLastChat\MLC_构建失败原因_TerminalShell类型不一致.md，了解情况

随后要求：

> 请你重新以markdown形式回复

解释后，用户通过 interactive feedback 选择：

- 立即修复。
- 采用“提取类型”。

已修改：

```text
app/src/store/terminalStore.ts
```

新增类型：

```ts
type RestartTerminalTabOptions = Pick<CreateTerminalTabOptions, "cols" | "rows" | "shell">;
```

并将接口声明从：

```ts
restartTerminalTab: (tabId: string, options?: Pick<CreateTerminalTabOptions, "cols" | "rows">) => Promise<void>;
```

改为：

```ts
restartTerminalTab: (tabId: string, options?: RestartTerminalTabOptions) => Promise<void>;
```

验证：

```text
npm --prefix /e/Dev/my-last-feedback/app run build
```

结果：

```text
✓ 1232 modules transformed.
✓ built in 5.94s
```

构建只剩 Vite 打包优化警告，没有 TypeScript 错误。

修复已提交：

```text
2cac7b2 fix: include shell in terminal restart options
```

最后 `git status --short` 无输出，工作区干净。

### 2.3 当前用户请求

最新用户请求是：

> /compact 编写新的聊天摘要文档

该请求要求先通过 My Last Chat 查询已有摘要，再决定更新或新建。已执行：

- `myLastChat_getLastChatsList(feedbackLevel="META", scope="all")`
- `myLastChat_searchByMeta(keywords=["MLFB", "终端", "ACP", "Agent Console", "CBZWW", "TerminalShell"], feedbackLevel="META", scope="all")`

查询结果中有多个局部相关文档，例如 `MLC_CBZWW Chat UI参考迁移规划.md`、`MLC_MLFB_opencode_ACP接入规划方案.md`、`MLC_MLFB风格ACP Agent Console UI规划.md`、`MLC_MLFB终端回放与只读附件图标会话摘要.md` 等，但没有一份覆盖本轮完整脉络的总摘要。因此创建了当前新文档。

## 3. Key Technical Concepts

- **ANSI/CSI 控制序列**：终端中出现的 `48;2;33;69;78m`、`33;12H`、`;6H` 等文本其实是 ANSI/CSI 控制序列残片，不是用户输入。
- **xterm.js `onData` 非纯键盘输入**：`onData` 可能包含焦点报告、鼠标追踪、查询响应、粘贴协议或程序回声，不应简单等同于用户主动输入。
- **PTY/ConPTY 与 shell 差异**：`pwsh.exe`/PSReadLine 比 `cmd.exe` 更容易触发复杂 VT 行为。`cmd.exe` 更稳定，但不能根治 agent 工作流问题。
- **Terminal output replay**：终端历史 replay 若从控制序列中间开始，可能显示控制序列残片。通过逻辑输出坐标和 generation 可以避免半截 replay。
- **UTF-8 安全裁剪**：Rust 后端输出缓冲裁剪必须避免在 UTF-8 非字符边界截断。
- **Mutex poison recovery**：Rust terminal session manager 的 mutex 若因 panic poisoned，应尽量恢复而不是让终端状态永久不可用。
- **ACP（Agent Client Protocol）**：编辑器/IDE 与 coding agent 之间的外部集成协议，opencode 通过 `opencode acp` 提供 stdio nd-JSON JSON-RPC server。
- **opencode desktop 架构**：Tauri desktop 启动本地 sidecar HTTP server，前端用 `@opencode-ai/sdk` 和 SSE；适合 opencode 自身产品，不适合作为 MLFB 外部集成主线。
- **Zed opencode extension**：声明式配置下载 opencode 二进制并执行 `opencode acp`，证明官方外部编辑器集成路径是 ACP。
- **MLFB Agent Console 路线**：普通终端保留并默认 `cmd.exe`，结构化 agent UI 走 ACP Agent Console。
- **MLFB反馈区同构UI**：Agent Console 应沿用当前 MLFB 反馈区域结构：上方记录区，下方输入框。
- **CBZWW ContentBlock 协议**：assistant 输出拆分为 `text`、`thinking`、`tool_call`、`chart`、`card`、`citation`、`task_list` 等 block。
- **BlockOrigin process/result 分层**：`origin.phase = process/result`，`origin.placement = inline/standalone`，用于区分过程与最终答案。
- **ProcessGroup 双显示模式**：timeline 模式按顺序显示思考、工具、任务、产物；tab 模式紧凑切换每个 step。
- **双区流式 Markdown**：settled zone 使用 Markdown 渲染稳定内容，active zone 用 DOM span 渲染最新字符并播放 reveal 动画。
- **rAF 字符释放**：把后端 text_delta 放入 raw buffer，再每帧释放固定字符数，避免大段文本瞬间跳出。
- **phase-aware streaming indicator**：根据最后一个 block 判断 thinking、tool_call、output 等阶段并切换动画。
- **TypeScript Pick 类型同步**：`restartTerminalTab` 使用 `Pick<CreateTerminalTabOptions, ...>` 时需要包含 `shell`，否则实现和调用会与接口声明不一致。

## 4. Relevant Files and Code

### app/src-tauri/src/terminal.rs

- 终端 Rust 后端 PTY manager。
- 已加入 UTF-8 安全裁剪、CSI 残片跳过、mutex poison recovery、多 shell candidate。
- Windows 默认/auto shell 顺序已调整为 `cmd.exe` 优先，然后 `pwsh.exe`、`powershell.exe`。
- 当前工作区最后状态干净，说明这些修改已处于提交后的版本中。

### app/src/store/terminalStore.ts

- Zustand terminal workspace state。
- 关键状态包含：

```ts
outputBaseLength: number;
outputGeneration: number;
shell: string | null;
```

- `CreateTerminalTabOptions` 支持：

```ts
interface CreateTerminalTabOptions {
  cols?: number;
  rows?: number;
  source?: TerminalPathSource;
  shell?: string | null;
}
```

- 最新修复新增：

```ts
type RestartTerminalTabOptions = Pick<CreateTerminalTabOptions, "cols" | "rows" | "shell">;
```

- 并修改：

```ts
restartTerminalTab: (tabId: string, options?: RestartTerminalTabOptions) => Promise<void>;
```

- 该修复解决了 TypeScript 构建错误。

### app/src/components/TerminalPanel.tsx

- xterm.js 前端 panel。
- 使用 `renderedOutputRef` 维护 `{ tabId, baseLength, endLength, generation }`。
- 正常增量输出时从逻辑坐标追加，不再频繁 replay 全部历史。
- 重启终端时会传入：

```ts
shell: terminalShellToCommand(terminalSettings.defaultShell)
```

### app/src/terminalSettings.ts

- 终端设置持久化。
- `TerminalShellId` 包括：

```ts
"auto" | "pwsh" | "powershell" | "cmd" | "git-bash" | "wsl"
```

- 默认值已改为：

```ts
DEFAULT_TERMINAL_SETTINGS.defaultShell = "cmd"
```

- `normalizeShell(value)` fallback 为 `cmd`。

### app/src/components/SettingsDialog.tsx

- 设置页新增默认 Shell 下拉。
- 选项包括自动、PowerShell 7、Windows PowerShell、命令提示符、Git Bash、WSL Bash。

### app/src/i18n/locales/zh.json 和 app/src/i18n/locales/en.json

- 新增终端默认 shell 相关 i18n 文案。
- `cmd` 描述为默认：`默认：cmd.exe` / `Default: cmd.exe`。

### app/src/components/CallerPanel.tsx

- 当前 MLFB 反馈区域核心结构：上方 `SummaryPanel`，下方 `panel-feedback`，包含 `ImageAttachmentWidget`、`AttachmentTagBar`、`FeedbackInput`、`PromptButtons`、`QuickActions`、`TransferSubmitSplit`。
- 被分析为未来 Agent Console 的结构参考，但不建议直接复用整体业务组件。

### app/src/components/FeedbackInput.tsx

- 包装 `ComposerEditor`。
- 支持 prompt command、图片粘贴、历史上下键、focus tracking。
- 强绑定 `useFeedbackStore` 和 `useActiveCallerSession`，不适合直接用于 Agent Console。
- 建议抽象或新建 `AgentComposer`，直接复用底层 `ComposerEditor`。

### app/src/components/composer/ComposerEditor.tsx

- 当前最适合直接复用到 Agent Console 的输入组件。
- 提供 contenteditable 输入、slash command、resource token、placeholder、selection、paste 等基础能力。

### app/src/components/MarkdownContent.tsx

- MLFB 当前 Markdown 渲染组件。
- 使用 `react-markdown`、`remark-gfm`、`remark-breaks`、`react-syntax-highlighter`。
- 支持文件/URL 链接打开、composer tokens、代码复制。
- 未来 `StreamingMarkdownContent` 应在 settled zone 内复用它，而不是直接替换。

### .myLastChat/MLC_MLFB_opencode_ACP接入规划方案.md

- 已新增规划文档。
- 核心结论：MLFB 应以 ACP 作为结构化 Agent UI 主协议，opencode 作为首个 provider；普通终端保留为 fallback。

### .myLastChat/MLC_K_opencode_ACP协议细则.md

- 已新增知识文档。
- 记录 opencode ACP 启动链路、Zed extension 配置、initialize/auth/session/prompt/permission/MCP/model/mode/cancel 等细节。

### .myLastChat/MLC_MLFB风格ACP Agent Console UI规划.md

- 已新增 UI 规划文档。
- 核心原则：用 MLFB 的反馈界面语言承载 ACP 的结构化 agent 事件。
- 规划组件：`AgentConsolePanel`、`AgentMessageTimeline`、`AgentComposer`、`AgentAttachmentBar`、`AgentPermissionRequestView` 等。

### ref-repos/CBZWW-chat-ui/

- 已强制添加到 Git，作为参考资料目录。
- 由于根 `.gitignore` 忽略 `ref-repos/`，复制时使用了 `git add -f ref-repos/CBZWW-chat-ui`。

### ref-repos/CBZWW-chat-ui/src/pages/Chat.tsx

- CBZWW Chat 页面整体布局。
- 关键机制包括自动滚底、用户滚离底部时停止自动跟随、sticky user prompt、左右 sidebar、outline、task panel、input bar。

### ref-repos/CBZWW-chat-ui/src/store/chatStore.ts

- CBZWW Chat 状态管理。
- 将 SSE `ContentBlockStart` / `ContentBlockDelta` / `ContentBlockEnd` 归一为 `ContentBlock[]`。
- 对 text delta 使用 rAF 字符释放策略。

### ref-repos/CBZWW-chat-ui/src/components/zeven/composition/ChatMessage.tsx

- 消息渲染入口。
- 通过 `origin.phase` 拆分 `processBlocks` 和 `resultBlocks`。

### ref-repos/CBZWW-chat-ui/src/components/zeven/composition/chat/ProcessGroup.tsx

- CBZWW agent 过程 UI 的核心组件。
- 支持 timeline/tab 双模式。
- 流式期间自动展开并聚焦最新 step，流式结束后折叠。

### ref-repos/CBZWW-chat-ui/src/components/zeven/composition/chat/MarkdownBlock.tsx

- 双区流式 Markdown 渲染参考。
- `StreamingRenderer` 将稳定内容沉淀到 ReactMarkdown，将最新字符放到 active zone 做 reveal 动画。

### ref-repos/CBZWW-chat-ui/src/components/zeven/composition/chat/StreamingIndicator.tsx

- 根据最后一个 assistant block 判断当前阶段，选择 thinking/output/tool_call 的 dot matrix 动画。

### ref-repos/CBZWW-chat-ui/README.md

- 已新增参考目录说明，记录来源和重点研究文件。

### .myLastChat/MLC_CBZWW Chat UI参考迁移规划.md

- 已新增规划文档。
- 记录 CBZWW Chat UI 机制与迁移到 MLFB Agent Console 的路线。

### .myLastChat/MLC_构建失败原因_TerminalShell类型不一致.md

- 用户提供/要求阅读的构建失败分析文档。
- 说明 `restartTerminalTab` 类型遗漏 `shell` 导致 `npm run build` 在 TypeScript 阶段失败。

## 5. Problem Solving

### 5.1 终端奇怪字符与卡死

已明确“奇怪字符”不是用户输入，而是终端控制序列残片。通过后端 UTF-8 安全裁剪、CSI 残片跳过、mutex poison recovery、前端逻辑输出坐标、output generation 和 replay suppression 改善了问题。

### 5.2 shell 默认值与多 shell

用户测试 `cmd.exe` 更稳定。已将 MLFB 终端默认 shell 改为 `cmd`，并增加 `auto/pwsh/powershell/cmd/git-bash/wsl` 支持。解释过换 shell 可以降低终端稳定性风险，但不是 agent 工作流的根治方案。

### 5.3 raw terminal 不适合 agent 主流程

通过 opencode desktop 与 ACP 分析，确定 MLFB 不应把 agent TUI 嵌入终端作为主线。应使用 ACP 子进程 stdio pipe，不走 PTY/xterm。

### 5.4 opencode 接入路线

分析 opencode desktop 后得出：desktop 的 HTTP sidecar + SDK + SSE 是 opencode 内部产品架构，不适合作为 MLFB 外部接入主线。Zed extension 证明外部集成应启动 `opencode acp`。

### 5.5 Agent Console UI方向

用户提出复用 MLFB 反馈区结构。已确认方向正确：Agent Console 应像 MLFB 反馈区的 agent 会话版本。建议复用 `ComposerEditor`、`MarkdownContent`、panel 样式、附件交互等底层能力，但不直接复用 `CallerPanel`、`FeedbackInput` 整体，因为它们强绑定 feedback store 和 caller session。

### 5.6 CBZWW Chat UI参考

分析了 CBZWW Chat 页面，确认其最值得迁移的不是黑白/点阵视觉主题本身，而是：

- ContentBlock 模型。
- process/result 分层。
- ProcessGroup timeline/tab 双显示模式。
- 双区流式 Markdown。
- rAF 字符释放。
- phase-aware streaming indicator。
- sticky user bar、outline、task panel 等长会话体验。

### 5.7 TerminalShell类型构建失败

阅读构建失败文档并确认当前代码中 `restartTerminalTab` 的类型声明仍缺 `shell`。按用户选择提取 `RestartTerminalTabOptions` 类型并修复，运行 `npm --prefix /e/Dev/my-last-feedback/app run build` 通过。该修复已提交。

### 5.8 Git提交与工作区状态

已完成两次提交：

```text
2f6ea2d docs: add agent console UI references
2cac7b2 fix: include shell in terminal restart options
```

最后检查：

```text
git status --short
```

无输出，说明工作区干净。

## 6. Pending Tasks and Next Steps

当前没有尚未完成的用户明确编码请求。最近的已完成请求包括：

> 请你重新以markdown形式回复

已完成 Markdown 解释。

> 请你阅读E:\Dev\my-last-feedback\.myLastChat\MLC_构建失败原因_TerminalShell类型不一致.md，了解情况

已阅读、解释、修复并提交。

> 请你复制来自E:\Dev\CBZWW_all\CBZWW_web\frontend-v2的关键agent UI相关的关键文件到E:\Dev\my-last-feedback\ref-repos\CBZWW-chat-ui文件夹内以便后续参考。

已复制并提交。

> 新建一个规划文档

已新建 `MLC_CBZWW Chat UI参考迁移规划.md`。

> /compact 编写新的聊天摘要文档

当前文档即为该请求的产物。

后续如果用户继续推进，最自然的下一步有三条：

1. **继续组件设计**
   - 将 `MLC_MLFB风格ACP Agent Console UI规划.md` 和 `MLC_CBZWW Chat UI参考迁移规划.md` 落成文件级组件设计。
   - 重点设计 `AgentContentBlock`、`AgentProcessGroup`、`StreamingMarkdownContent`、`AgentComposer`、`AgentPermissionDock`。

2. **开始 UI PoC**
   - 新增静态 `AgentConsolePanel`，先使用 mock data。
   - 复用 `ComposerEditor`。
   - 借鉴 CBZWW `ProcessGroup` 实现 timeline/tab 双模式，但使用 MLFB 现有 CSS/theme/icon。

3. **开始 ACP runtime PoC**
   - 新增 Tauri/Rust 普通 child process pipe，不复用 PTY。
   - 启动 `opencode acp`。
   - 实现 initialize/newSession/prompt/cancel 最小闭环。
   - 将 ACP session update 映射到 MLFB `AgentContentBlock`。

需要注意：如果后续要运行测试、构建或提交，仍需按照当前交互规则通过 interactive feedback 确认。