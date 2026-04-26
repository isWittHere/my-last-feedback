---
title: MLFB MLC固定侧栏规划会话摘要
description: 汇总MLFB规划、浏览器方案与MLC固定侧栏附件设计
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
solved_lists:
  - 完成MLFB注意力、队列、历史重提、主题按钮规划
  - 完成内置开发预览浏览器规划
  - 分析ref-repos/my-last-chat核心能力
  - 明确MLC固定侧栏与MLC附件产品方案
  - 创建MLC固定侧栏与附件规划书
---

# MLFB MLC固定侧栏规划会话摘要

## 1. Previous Conversation

本轮会话围绕 MLFB 功能持续规划，重点从常驻反馈窗口的交互细节扩展到内置资料库能力。

最初用户要求聚焦 MLFB 功能，分析五项能力：

- 新消息注意力设置。
- 消息排队。
- 消息重提。
- 内置开发预览浏览器。
- 顶栏明暗主题快捷按钮。

随后用户明确了新消息注意力的边界：新消息到达时不做任何自动 caller 聚焦动作，不改变 caller 排序，不触发聚焦行为，保持完全不打扰、不打断用户动作。

用户又明确了消息排队规则：除了会直接触发发送的按钮，例如快捷 prompt 按钮、发送按钮、快捷操作按钮外，附件信息都应该参与队列，操作逻辑等同于现有输入框。

用户要求消息重提支持上下方向键填充历史发送消息，并且历史按 caller 隔离。

针对除浏览器外的四项功能，已创建规划文档：

`.myLastChat/MLC_MLFB_注意力队列历史主题规划书.md`

该文档将功能拆为注意力模式、composer draft、message history、theme tool 等模块。

之后用户要求分析内置开发预览浏览器。经过分析，结论是：iframe 无法满足任意网站预览和 DOM 选择，因为受 CSP、X-Frame-Options、同源策略和 Tauri 权限隔离限制。最终确认主线为 Tauri 受控 WebView，远期配外部浏览器扩展作为高兼容兜底。

已创建浏览器规划文档：

`.myLastChat/MLC_MLFB_内置开发预览浏览器规划书.md`

该文档规划了 Tauri 受控 WebView、外部浏览器扩展兜底、元素选择、结果回传、InsertTargetRegistry 和安全边界。

最新阶段，用户提出希望将 `ref-repos/my-last-chat` 的功能引入当前 app。用户说明该项目是 my-last-* 家族中的 VS Code 插件，可以检测工作区内专有文件夹信息库，并快速将资料插入聊天作为文件引用。

我阅读了 `ref-repos/my-last-chat` 的 README、package、types、storage、tools、webview、extension，以及它自身 `.myLastChat` 中关于多工作区和嵌套子文件夹的演进记录。最初分析认为可将其作为 MLFB 内置知识库抽屉或 context library，但用户逐步收敛了产品方向：

1. 起初希望使用和插件完全相同的 UI 布局，作为一个独立特殊 caller 列，可参与 caller 排序。
2. 随后明确它本质只负责扫描兼容 my-last-chat 格式的 md 资料文件，以及允许插入附件到 MLFB 输入框。
3. 明确 MLFB 新增一种附件形式：MLC 附件。它与图片、日志、Git 操作一样在附件 UI 中展示；本质是原始 md 文件完整路径、title、description；允许先后附件多个；实际反馈信息中也以类似其他附件的信息形式注入。
4. 之后用户明确附件注入目标：MLC caller 内显示当前可视 caller 中包含的多个工作区，自动显示用户聚焦到的 caller 输入框所属工作区的 MLC 列表；注入时直接注入到聚焦输入框。
5. 提交格式应为 User Feedback、User Requirement、Git Action、Test Logs、Images、MLC References，最后再追加 System Reminder。
6. 用户进一步修正：特殊 caller 不是真的 caller，只是 UI 的一部分，和后端 caller 管理没有关系。
7. 最终用户将方案收敛为固定左面板或右面板列：该新面板列不干预 caller 区域，问题更简单。
8. 用户补充：可折叠侧栏允许用户调节宽度；caller 自动分栏模式的宽度根据全宽度减去侧栏宽度后的真实宽度评判。

基于最终方案，已创建规划文档：

`.myLastChat/MLC_MLFB_MLC固定侧栏与附件规划书.md`

## 2. Current Work

当前正在处理的是用户要求创建新的会话摘要。

在创建摘要前，按用户要求先使用 My Last Chat 查询工具检查已有摘要：

- 调用了 `myLastChat_getLastChatsList`，返回 51 个聊天摘要。
- 调用了 `myLastChat_searchByTitle`，关键词为 `MLFB`、`MLC`、`固定侧栏`、`附件`、`my-last-chat`，返回 8 个结果。
- 调用了 `myLastChat_searchByMeta`，同样关键词返回 12 个结果。

查询发现高度相关的是刚创建的规划文档 `MLC_MLFB_MLC固定侧栏与附件规划书.md`，但它是正式规划书，不是会话摘要。另有文件 `MLC_将My Last Chat知识库功能引入桌面App的分析与规划.md` 看似相关，但读取后发现其 frontmatter 标题和正文实际是 MLRA 蓝图任务库规划与停止功能实现会话摘要，内容不属于本轮 MLC 规划。因此没有更新旧摘要，而是创建新的会话摘要文件。

本次创建的文件为：

`.myLastChat/MLC_MLFB_MLC固定侧栏规划会话摘要.md`

## 3. Key Technical Concepts

- Tauri 2 桌面应用：当前 app 使用 Tauri 2，Rust backend 负责 IPC、session、window/tray/autostart 等能力。
- React 19 + Zustand：前端位于 `app/src`，主状态在 `app/src/store/feedbackStore.ts`。
- Persistent mode：当前多 caller、多 session 的常驻反馈模式。
- Caller 模型：真实 caller 来自 MCP client / agent，不应被 MLC 面板污染。
- Caller 列自动分栏：当前多列基于宽度决定，后续需改为基于 caller workspace 容器真实宽度。
- MLC 固定侧栏：最终确定为固定左/右面板，不作为 caller，不进入 callerOrder、CallerTabs、后端 caller 管理。
- 可折叠可调宽侧栏：MLC panel 可隐藏、折叠、展开、拖拽调整宽度，并持久化宽度与位置。
- focusedComposer：新增概念，用来记录用户最近聚焦的输入框所属 caller、session、projectDirectory。MLC attach 根据它确定目标 session。
- MLC attachment：新增附件类型，字段核心为 `filePath`、`title`、`description`，与图片、日志、Git 操作并列显示。
- `.myLastChat` 资料库：兼容 my-last-chat 插件的 Markdown + YAML frontmatter 格式。
- my-last-chat 扫描模型：读取主工作区 `.myLastChat`、一级含 `.git` 子工作区 `.myLastChat`、根 md 和二级子文件夹 md。
- Frontmatter 宽容解析：title 缺失 fallback 文件名，description 缺失 fallback 空字符串，时间 fallback 文件 stats，type 允许未知字符串。
- 提交格式：MLC References 作为独立 Markdown section 注入，System Reminder 放在最后。
- Insert target 方向：早期浏览器规划提出 InsertTargetRegistry；MLC 最终更收敛为 focusedComposer 目标。

## 4. Relevant Files and Code

### `.myLastChat/MLC_MLFB_注意力队列历史主题规划书.md`

- 已创建的正式规划文档。
- 内容包括新消息 passive 模式、composer draft 队列、按 caller 隔离的历史重提、顶栏主题快捷按钮。
- 关键概念包括：

```ts
newRequestAttentionMode = "interrupt" | "passive";
queuedDraftsByCallerId;
messageHistoryByCallerId;
```

### `.myLastChat/MLC_MLFB_内置开发预览浏览器规划书.md`

- 已创建的正式规划文档。
- 明确浏览器主线为 Tauri 受控 WebView，远期外部浏览器扩展兜底。
- 关键概念包括：

```ts
PreviewTab;
PickedElement;
LocatorCandidate;
InsertTargetRegistry;
```

### `.myLastChat/MLC_MLFB_MLC固定侧栏与附件规划书.md`

- 本轮最新创建的正式规划文档。
- 记录最终定稿的 MLC 方案：固定左/右侧栏、可折叠、可调宽、按剩余真实宽度分栏、focusedComposer、MLC attachment、扫描与提交格式。
- 核心状态建议：

```ts
export interface FocusedComposer {
  callerId: string;
  sessionId: string;
  projectDirectory: string;
  kind: "feedback" | "testLog" | "question";
  focusedAt: string;
}
```

```ts
export interface MlcAttachment {
  filePath: string;
  title: string;
  description: string;
}
```

建议侧栏宽度常量：

```ts
const MLC_PANEL_DEFAULT_WIDTH = 320;
const MLC_PANEL_MIN_WIDTH = 240;
const MLC_PANEL_MAX_WIDTH = 520;
const MLC_PANEL_COLLAPSED_WIDTH = 34;
```

建议 caller 自动分栏改为容器宽度计算：

```ts
const callerWorkspaceWidth = useElementWidth(callerWorkspaceRef);
const autoMaxColumns = Math.max(1, Math.floor(callerWorkspaceWidth / PANEL_MIN_WIDTH));
```

### `.myLastChat/MLC_MLFB_MLC固定侧栏规划会话摘要.md`

- 本次新创建的会话摘要文件。
- 用于保存当前 conversation 的延续上下文。

### `ref-repos/my-last-chat/README.zh-CN.md`

- 已阅读前 240 行。
- 确认 reference 插件核心功能：`.myLastChat` Markdown 存储、`/compact`、`/knowledge-gen`、多工作区扫描、搜索筛选、收藏、快速插入到 Copilot chat、三个 LM tools。

### `ref-repos/my-last-chat/package.json`

- 已阅读前 260 行。
- 确认 VS Code extension contributions：activity bar view、commands、configuration、languageModelTools。
- 工具包括：

```text
myLastChat_getLastChatsList
myLastChat_searchByTitle
myLastChat_searchByMeta
```

### `ref-repos/my-last-chat/src/types.ts`

- 已阅读。
- 重要类型：

```ts
ChatMetadata;
SubWorkspaceInfo;
FeedbackLevel;
StorageScope;
ChatSummary;
FolderGroup;
SearchResult;
```

### `ref-repos/my-last-chat/src/storage.ts`

- 已阅读完整文件。
- 核心能力：

```ts
getWorkspaceStoragePath();
getGlobalStoragePath();
getChatSummariesFromPath();
getAllChatSummaries();
discoverSubWorkspaces();
getAvailableWorkspaces();
parseChatFile();
searchByTitle();
searchByMeta();
getLastChatsList();
```

- 该文件证明 reference 插件只扫描 `.myLastChat` 根 md 和二级子文件夹 md，并扫描主工作区下含 `.git` 的一级子工作区。

### `ref-repos/my-last-chat/src/tools.ts`

- 已阅读。
- 实现三个 VS Code LM tools，并按 `FeedbackLevel` 返回 title、description、metadata 或完整 content。
- 本轮最终决定：第一期不移植 VS Code LM tools，只关注固定侧栏和附件注入。

### `ref-repos/my-last-chat/src/chatListView.ts`

- 已阅读。
- 证明 reference 插件的 WebView 支持 refresh、openFile、search、toggleFavorite、deleteFile、copyLink、attachToChat、createInFolder 等消息。
- `attachToChat` 在 VS Code 中调用 `workbench.action.chat.attachFile`；MLFB 中不能直接复用，必须改为 MLC attachment 注入。

### `ref-repos/my-last-chat/src/webviewTemplate.ts`

- 已阅读前 360 行。
- 参考其布局：搜索框、控制行、工作区 Tab、类型 Tab、列表、自定义 tooltip、compact/detail view。
- 最终方案要求在 MLC 固定侧栏中使用相同信息布局，但用 React 组件实现。

### `app/src/store/feedbackStore.ts`

- 已阅读关键部分。
- 当前 `Session` 包含：

```ts
feedbackText;
testLogText;
images;
commandLogs;
questions;
gitAction;
```

- 未来需要增加：

```ts
mlcAttachments: MlcAttachment[];
focusedComposer: FocusedComposer | null;
```

- 需要新增 MLC attachment actions。

### `app/src/components/CallerPanel.tsx`

- 已阅读关键提交逻辑。
- 当前 `handleSubmit` 拼接 sections，并调用：

```ts
invoke("submit_session_feedback", {
  sessionId: activeSession.id,
  feedbackText: finalFeedback,
  commandLogs: activeSession.commandLogs,
  images: imageList,
  transferToAlias: transferAlias,
});
```

- 当前 System Reminder 在 Test Logs 和 Images 前插入；最终 MLC 规划要求把 System Reminder 移到最后。
- 未来需在这里加入 MLC References section。

### `app/src/components/CallerPanelParts.tsx`

- 已阅读。
- 当前 `AttachmentTagBar` 统一渲染 images、test log、git action tags。
- 未来应加入 MLC 按钮和 MLC tags。
- 当前 `ReadonlyTagBar` 渲染 responded/cancelled session 的只读附件；未来也应展示 MLC tags。

### `app/src/components/FeedbackInput.tsx`

- 已阅读。
- 当前只有 mount 时自动 focus，没有记录 focus 归属。
- 未来需要在 `textarea` 上加入 `onFocus`，写入 focusedComposer。
- 不应在 `onBlur` 清空 focusedComposer。

### `app/src/components/FeedbackApp.tsx`

- 已阅读 caller 多列布局关键部分。
- 当前 `autoMaxColumns` 基于 `windowWidth / PANEL_MIN_WIDTH`。
- 未来 MLC 固定侧栏显示时，需要改为基于 caller workspace 容器真实宽度计算。
- 当前 persistent body 直接渲染 caller columns；未来需要在 caller region 左/右加入 MLC side panel sibling。

### `app/src-tauri/src/lib.rs`

- 已阅读 `submit_session_feedback`。
- 当前 command 接收 `session_id`、`feedback_text`、`command_logs`、`images`、`transfer_to_alias`。
- 未来如需历史恢复 MLC tags，应增加 `mlc_attachments` 参数并保存。

### `app/src-tauri/src/session.rs`

- 已阅读 `SessionDetail`、`FeedbackPayload`、`submit_feedback` 保存逻辑。
- 当前 `SessionDetail` 保存 images、questions 等，但没有 MLC attachments。
- 未来建议新增 `mlc_attachments` 字段，并在 session history 中持久化。

## 5. Problem Solving

### 5.1 新消息注意力边界

用户明确新消息不应自动聚焦、不应调整 caller 排序、不应打断当前操作。因此规划中将注意力分为 interrupt/passive，并把前端 active selection、caller reorder、panel auto-select、Rust window focus 都纳入边界。

### 5.2 消息队列边界

一开始容易把队列误理解为对 responded session 继续编辑。分析后明确队列应作为独立 composer draft，不破坏 MCP pending/responded 生命周期。附件也应随 draft 一起排队。

### 5.3 内置浏览器技术限制

分析确认 iframe 无法满足任意网站与 DOM 选择需求，因为有 CSP、X-Frame-Options、同源策略和 Tauri API 权限边界。最终主线为 Tauri 受控 WebView，外部浏览器扩展作为长期兜底。

### 5.4 my-last-chat 迁移边界

最初分析方向偏向内置知识库抽屉或特殊 caller。用户逐步澄清后，最终锁定为固定左/右 MLC 侧栏。这样避免 MLC 污染 caller 管理，同时保留 my-last-chat 的列表布局和资料扫描能力。

### 5.5 MLC 不是 caller

曾分析过特殊 caller 和 UI-only panel token 方案。用户明确 MLC 不是 caller，只是 UI 的一部分。最终方案改为固定侧栏，不参与 caller 排序、不进入 caller tabs、不进入后端 caller 管理。

### 5.6 附件目标选择

曾考虑显式 target session。用户明确 MLC attach 应注入当前聚焦输入框。最终提出 focusedComposer 机制：记录最近聚焦的输入框所属 session，点击 MLC 文档时写入该 session 的 MLC attachments。

### 5.7 自动分栏宽度

用户明确可折叠侧栏可调宽，caller 自动分栏模式应根据全宽度减去侧栏宽度后的真实宽度评判。规划中将计算方式从 window width 改为 caller workspace 容器真实宽度。

## 6. Pending Tasks and Next Steps

当前用户最新明确任务是：

> “好，请你编写一个新的会话摘要”

该任务已完成，文件为：

`.myLastChat/MLC_MLFB_MLC固定侧栏规划会话摘要.md`

后续如果用户要求继续实现 MLC 固定侧栏，建议按以下顺序推进：

1. Phase 1：实现 MLC 附件链路。
   - 增加 `MlcAttachment` 类型。
   - `Session` 增加 `mlcAttachments`。
   - Zustand store 增加 add/remove/clear MLC attachment actions。
   - `FeedbackInput` 增加 `onFocus` 写入 focusedComposer。
   - `AttachmentTagBar` 和 `ReadonlyTagBar` 展示 MLC tags。
   - `CallerPanel.handleSubmit` 增加 `Attachment: MLC References`，并把 System Reminder 移到最后。

2. Phase 2：实现固定可折叠侧栏骨架。
   - 新增 `MlcSidePanel`。
   - 标题栏增加 MLC 开关按钮。
   - 附件栏 MLC 按钮打开侧栏并设置 focusedComposer。
   - 增加 left/right position、collapse/expand、resize handle、宽度持久化。
   - 将 caller 自动分栏宽度计算改为 caller workspace 容器真实宽度。

3. Phase 3：实现 `.myLastChat` 扫描与插件布局复刻。
   - Rust 新增 `mlc.rs` 只读扫描模块。
   - 扫描主工作区 `.myLastChat` 与一级 git 子工作区 `.myLastChat`。
   - 支持根 md 和二级子文件夹 md。
   - React 侧实现搜索、workspace tabs、type tabs、sort、document list。
   - 文档 item 支持 attach/copy/open。

4. Phase 4：实现历史恢复与 polish。
   - Rust `SessionDetail` 增加 `mlc_attachments`。
   - `submit_session_feedback` 接收并保存 MLC attachments。
   - `load_history` 恢复 MLC tags。
   - 完善 i18n、空态、错误态、路径安全和扫描缓存。

如需继续实现，应优先打开并遵循：

`.myLastChat/MLC_MLFB_MLC固定侧栏与附件规划书.md`

其中最重要的架构约束是：

```text
MLC 固定侧栏 = 项目资料库 UI
Caller 区域 = 反馈会话 UI
MLC 不作为 caller，不干预 caller 后端管理
当前聚焦哪个反馈输入框，MLC 附件就加入哪个 session
```