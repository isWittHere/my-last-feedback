---
title: MLFB MLC 固定侧栏与附件规划书
description: 规划将 my-last-chat 兼容资料库作为 MLFB 固定侧栏与 MLC 附件类型引入
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - MLC
  - my-last-chat
  - attachments
  - planning
solved_lists:
  - 明确 MLC 面板是固定侧栏，不是 caller
  - 明确 MLC 只读扫描兼容 my-last-chat 格式的 md 资料文件
  - 明确 MLC 附件结构为原始 md 文件路径、title、description
  - 明确 MLC 附件注入当前聚焦输入框所属 session
  - 明确 caller 自动分栏按总宽度减去 MLC 侧栏宽度后的真实宽度计算
---

# MLFB MLC 固定侧栏与附件规划书

## 1. 背景与目标

当前仓库已经使用 `.myLastChat/` 作为规划、总结、报告和知识文档的本地资料库。参考项目 `ref-repos/my-last-chat` 是一个 VS Code 插件，它的核心能力是扫描兼容格式的 Markdown 资料文件，并在 VS Code 中快速附加到 Copilot Chat。

MLFB 需要引入这套资料库能力，但产品形态不复制 VS Code 插件外壳，而是把它纳入当前 Tauri + React 桌面应用：

- 新增一个固定左侧或右侧 MLC 资料侧栏。
- 侧栏可折叠、可调整宽度。
- 侧栏使用和 my-last-chat 插件一致的信息布局。
- 侧栏只负责扫描兼容 my-last-chat 格式的 md 资料文件。
- 用户点击资料项后，将其作为 MLC 附件加入当前聚焦输入框所属 session。
- MLC 附件与图片、日志、Git 操作一样，在输入区附件栏中以 tag 方式展示。
- 提交反馈时，把 MLC 附件以独立 Markdown section 注入最终反馈文本。

本功能不是为了把 MLC 做成一个 caller，也不是为了影响 caller 后端管理。它是一个固定资料面板，服务当前用户正在编辑的反馈输入框。

## 2. 非目标

第一期不做以下内容：

- 不把 MLC 面板注册为真实 caller。
- 不让 MLC 参与后端 caller 管理、merge、rename、remove、pending count 或 unread 状态。
- 不创建、编辑、删除 `.myLastChat` 文档。
- 不默认把 Markdown 全文注入反馈。
- 不实现 my-last-chat 的 VS Code LM tools。
- 不实现全局资料库写入和收藏写入。
- 不改变 MCP request/response 的 session 生命周期。

这些能力可以作为后续扩展，但不进入第一期主线。

## 3. 核心产品模型

### 3.1 固定 MLC 侧栏

MLC 侧栏是 caller 区域旁边的固定 UI 面板。它可以位于左侧或右侧，默认建议位于右侧。

布局模型：

```tsx
<div className="app-body">
  {mlcPanelVisible && mlcPanelPosition === "left" && <MlcSidePanel />}

  <div ref={callerWorkspaceRef} className="caller-workspace">
    {caller columns}
  </div>

  {mlcPanelVisible && mlcPanelPosition === "right" && <MlcSidePanel />}
</div>
```

MLC 侧栏不属于 caller workspace，不进入 caller tabs，不参与 caller order。

### 3.2 可折叠与可调宽

侧栏支持三种显示状态：

- 展开：显示完整 my-last-chat 风格资料列表。
- 折叠：仅保留窄条或图标按钮。
- 隐藏：完全不占用宽度。

侧栏宽度由用户拖拽调整，并保存到本地设置。

建议默认值：

```ts
const MLC_PANEL_DEFAULT_WIDTH = 320;
const MLC_PANEL_MIN_WIDTH = 240;
const MLC_PANEL_MAX_WIDTH = 520;
const MLC_PANEL_COLLAPSED_WIDTH = 34;
```

持久化 key：

```text
mlfb-mlc-panel-visible
mlfb-mlc-panel-collapsed
mlfb-mlc-panel-position
mlfb-mlc-panel-width
```

### 3.3 caller 自动分栏宽度计算

当前 caller 自动分栏基于窗口宽度计算。引入固定侧栏后，必须改为基于 caller workspace 的真实宽度计算。

推荐方案：使用 `ResizeObserver` 监听 caller workspace 容器。

```ts
const callerWorkspaceWidth = useElementWidth(callerWorkspaceRef);
const autoMaxColumns = Math.max(1, Math.floor(callerWorkspaceWidth / PANEL_MIN_WIDTH));
```

如果侧栏展开并占用 320px，caller 自动分栏只根据剩余区域判断。侧栏折叠时只扣除折叠宽度；侧栏隐藏时不扣除。

这满足需求：caller 自动分栏模式的宽度根据全宽度减去侧栏宽度后的真实宽度评判。

## 4. 与 caller 系统的边界

MLC 侧栏不会影响以下状态：

- `callers`
- `callerOrder`
- `hiddenCallerIds`
- `activeCallerId`
- `activeSessionId`
- `pendingCount`
- `unreadCallerIds`
- 后端 caller history
- 后端 caller order
- caller merge / rename / remove

MLC 只影响以下前端状态：

- `mlcPanelVisible`
- `mlcPanelCollapsed`
- `mlcPanelPosition`
- `mlcPanelWidth`
- `focusedComposer`
- 当前 session 的 `mlcAttachments`

这一边界必须在实现中保持清晰，避免工具面板污染真实 caller/session 业务模型。

## 5. focusedComposer 机制

### 5.1 目标

MLC 附件注入当前聚焦输入框所属 session。用户不需要手动选择目标 session。

流程：

```text
用户聚焦某个 caller 的反馈输入框
→ store 记录 focusedComposer
→ MLC 侧栏自动显示该 session 所在工作区的资料列表
→ 用户点击资料项 attach
→ MLC 附件加入 focusedComposer.sessionId 对应 session
```

### 5.2 状态定义

```ts
export type ComposerFocusKind = "feedback" | "testLog" | "question";

export interface FocusedComposer {
  callerId: string;
  sessionId: string;
  projectDirectory: string;
  kind: ComposerFocusKind;
  focusedAt: string;
}
```

Store 字段：

```ts
focusedComposer: FocusedComposer | null;
setFocusedComposer: (focus: FocusedComposer) => void;
clearFocusedComposer: (sessionId: string) => void;
```

### 5.3 写入时机

`FeedbackInput` 在 `onFocus` 时写入：

```tsx
onFocus={() => {
  if (isPersistent && activeSession && caller) {
    setFocusedComposer({
      callerId: caller.id,
      sessionId: activeSession.id,
      projectDirectory: activeSession.projectDirectory,
      kind: "feedback",
      focusedAt: new Date().toISOString(),
    });
  }
}}
```

注意：不要在 `onBlur` 时清空。用户点击 MLC 侧栏时，输入框必然失焦；如果 blur 清空，附件目标会丢失。

### 5.4 失效条件

当发生以下情况时，清理 focusedComposer：

- 目标 session submitted。
- 目标 session cancelled。
- 目标 session removed。
- 切换到 legacy mode。

MLC attach 时必须检查目标 session 仍存在且状态为 pending。

## 6. MLC 附件模型

### 6.1 数据结构

用户已明确 MLC 附件本质为：

- 原始 md 文件完整路径。
- title。
- description。

前端类型：

```ts
export interface MlcAttachment {
  filePath: string;
  title: string;
  description: string;
}
```

如 UI 需要展示更多辅助信息，可额外保留非提交必需字段：

```ts
export interface MlcAttachment {
  filePath: string;
  title: string;
  description: string;
  workspacePath?: string;
  workspaceName?: string;
  folderName?: string;
  type?: string;
}
```

### 6.2 Session 扩展

```ts
export interface Session {
  // existing fields
  mlcAttachments: MlcAttachment[];
}
```

Store actions：

```ts
addSessionMlcAttachment: (sessionId: string, attachment: MlcAttachment) => void;
removeSessionMlcAttachment: (sessionId: string, filePath: string) => void;
clearSessionMlcAttachments: (sessionId: string) => void;
```

行为约束：

- 仅 pending session 可添加或移除 MLC 附件。
- 按 `filePath` 去重。
- 不读取或注入 Markdown 全文。

### 6.3 Rust 历史持久化

为了 app 重启后历史 session 仍能展示 MLC tags，建议 Rust `SessionDetail` 增加字段：

```rust
#[serde(default)]
pub mlc_attachments: Vec<MlcAttachment>,
```

Rust 类型：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MlcAttachment {
    pub file_path: String,
    pub title: String,
    pub description: String,
}
```

`submit_session_feedback` 增加参数：

```rust
mlc_attachments: Vec<MlcAttachment>
```

保存到 session detail。最终给 agent 的文本仍由前端拼接在 `interactive_feedback` 中。

## 7. MLC 侧栏资料扫描

### 7.1 扫描范围

active workspace 来自：

1. `focusedComposer.projectDirectory`。
2. 当前可视 caller 的工作区 tab 手动选择。
3. 最近一次有效 workspace。

对每个 workspace 扫描：

```text
workspace/.myLastChat/*.md
workspace/.myLastChat/*/*.md
workspace/child-with-.git/.myLastChat/*.md
workspace/child-with-.git/.myLastChat/*/*.md
```

兼容 reference 插件能力：

- 主工作区 `.myLastChat`。
- 含 `.git` 的一级子工作区。
- `.myLastChat` 根目录 md 文件。
- `.myLastChat` 二级非隐藏子文件夹 md 文件。

### 7.2 Markdown frontmatter

兼容字段：

```yaml
---
title: 文档标题
description: 文档描述
workplace: 工作区
project: 项目名称
type: coding | debug | planning | spec | knowledge | note | report
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
favorite: false
tags:
  - tag
solved_lists:
  - item
---
```

解析必须宽容：

- `title` 缺失时 fallback 为文件名。
- `description` 缺失时 fallback 为空字符串。
- `createdAt` 缺失时 fallback 为文件创建时间。
- `updatedAt` 缺失时 fallback 为文件修改时间。
- `type` 允许未知字符串。

### 7.3 Tauri commands

新增 Rust 模块：

```text
app/src-tauri/src/mlc.rs
```

建议命令：

```rust
#[tauri::command]
async fn mlc_list_workspaces(visible_project_directories: Vec<String>) -> Result<Vec<MlcWorkspace>, String>;

#[tauri::command]
async fn mlc_search_documents(request: MlcSearchRequest) -> Result<Vec<MlcDocument>, String>;

#[tauri::command]
async fn mlc_open_document(file_path: String) -> Result<(), String>;
```

第一期可以不做全文读取命令。侧栏列表只需要 metadata 和路径。

路径安全规则：

- 只允许读取传入 workspace 下的 `.myLastChat` 目录。
- 只允许读取发现到的子工作区 `.myLastChat` 目录。
- `file_path` 必须落在允许 roots 内。
- 只处理 `.md` 文件。

## 8. MLC 侧栏 UI 布局

MLC 侧栏需要复刻 my-last-chat 插件的信息布局，使用 React 组件实现。

组件建议：

```text
MlcSidePanel.tsx
MlcToolbar.tsx
MlcWorkspaceTabs.tsx
MlcTypeTabs.tsx
MlcDocumentList.tsx
MlcDocumentItem.tsx
MlcFolderGroup.tsx
MlcResizeHandle.tsx
```

布局：

```text
Header row
  collapse button
  title: My Last Chat
  position toggle
  close button

Search box

Control row
  sort menu
  favorites toggle
  compact/detail view toggle

Workspace tabs

Type tabs

Document list
  time groups
  folder groups
  document items
```

文档 item 展示：

- title。
- description。
- project。
- type。
- tags。
- updated time。
- folder/workspace badge。
- attach button。
- copy path button。
- open file button。

第一期可不做 favorite 写入。如果显示 favorite，只作为只读 metadata 展示。

## 9. 工作区切换规则

侧栏内显示当前可视 caller 中包含的多个工作区。

工作区集合来源：

- 当前 caller 区域实际可视 caller 的 session `projectDirectory`。
- `focusedComposer.projectDirectory` 必须被加入，即使对应 caller 暂时不在可视列。

默认 active workspace：

```text
focusedComposer.projectDirectory
```

用户手动点击 workspace tab 时，侧栏切换列表。下一次用户聚焦某个反馈输入框时，active workspace 自动切到该输入框所属工作区。

## 10. 附件栏 UI 集成

### 10.1 编辑状态

`AttachmentTagBar` 新增 MLC 按钮：

```text
[book icon] MLC
```

点击行为：

1. 写入当前 session 到 `focusedComposer`。
2. 展开 MLC 侧栏。
3. 切换 MLC active workspace 到当前 session 的 `projectDirectory`。

MLC tags 展示：

```text
[book] MLFB 内置开发预览浏览器规划书  x
```

hover preview：

```text
MLFB 内置开发预览浏览器规划书
规划 Tauri 受控 WebView 主线与外部浏览器扩展兜底方案
e:/Dev/my-last-feedback/.myLastChat/MLC_MLFB_内置开发预览浏览器规划书.md
```

### 10.2 只读状态

`ReadonlyTagBar` 同样展示 MLC tags。

只读 tag 支持复制路径，不支持移除。

## 11. 提交格式

提交时按以下顺序拼接 sections：

```md
## User Feedback
...

## User Requirement
...

## Agent Questions Response
...

## Git Action
...

## Attachment: Test Logs
...

## Attachment: Images
1 image(s) attached, please review the accompanying image content.

## Attachment: MLC References
### MLFB 内置开发预览浏览器规划书
- 规划 Tauri 受控 WebView 主线与外部浏览器扩展兜底方案
- e:/Dev/my-last-feedback/.myLastChat/MLC_MLFB_内置开发预览浏览器规划书.md

### XXXX
- xx
- xx

[System] Reminder: You MUST call the interactive_feedback tool again after completing this operation. Do NOT end your turn without invoking interactive_feedback.
```

注意：当前代码把 System Reminder 放在附件前。实现本功能时应调整为最后追加。

MLC formatter：

```ts
function formatMlcReferences(attachments: MlcAttachment[]): string | null {
  if (attachments.length === 0) return null;
  const blocks = attachments.map((item) => [
    `### ${sanitizeMarkdownHeading(item.title || item.filePath)}`,
    `- ${sanitizeMarkdownListText(item.description || "")}`,
    `- ${item.filePath}`,
  ].join("\n"));
  return ["## Attachment: MLC References", ...blocks].join("\n\n");
}
```

title 和 description 需要去除换行，避免破坏 Markdown 结构。

## 12. 与消息队列功能的兼容

后续消息队列功能中，MLC 附件应与图片、日志、Git 操作同等参与 draft。

预期 draft：

```ts
interface FeedbackDraft {
  feedbackText: string;
  testLogText: string;
  images: ImageAttachment[];
  gitAction: GitAction | null;
  mlcAttachments: MlcAttachment[];
}
```

第一期可以只写入 pending session；队列实现时再把同一 attachment action 抽象为写入 active composer target。

## 13. 文件与模块改动清单

### 前端状态

```text
app/src/store/feedbackStore.ts
```

新增：

- `MlcAttachment`。
- `FocusedComposer`。
- `Session.mlcAttachments`。
- MLC side panel UI 状态。
- focusedComposer actions。
- MLC attachment actions。

### 前端组件

```text
app/src/components/MlcSidePanel.tsx
app/src/components/MlcToolbar.tsx
app/src/components/MlcWorkspaceTabs.tsx
app/src/components/MlcTypeTabs.tsx
app/src/components/MlcDocumentList.tsx
app/src/components/MlcDocumentItem.tsx
```

修改：

```text
app/src/components/FeedbackApp.tsx
app/src/components/FeedbackInput.tsx
app/src/components/CallerPanel.tsx
app/src/components/CallerPanelParts.tsx
```

### 后端

```text
app/src-tauri/src/mlc.rs
app/src-tauri/src/lib.rs
app/src-tauri/src/session.rs
```

新增：

- MLC scan commands。
- MLC attachment persistence。
- submit command 参数。

### 样式与 i18n

```text
app/src/index.css
app/src/i18n/*
```

新增 MLC 侧栏、tag、resize handle、空态、列表项样式和翻译。

## 14. 分期计划

### Phase 1：附件链路与提交格式

目标：不依赖完整 MLC 侧栏，也能让 session 保存和提交 MLC 附件。

任务：

- 增加 `MlcAttachment` 类型。
- `Session` 增加 `mlcAttachments`。
- Store 增加 MLC attachment actions。
- `FeedbackInput` 增加 `onFocus` 写入 focusedComposer。
- `AttachmentTagBar` 和 `ReadonlyTagBar` 展示 MLC tags。
- `CallerPanel.handleSubmit` 增加 MLC References section。
- System Reminder 移到最后。

验收：

- 手动构造 MLC attachment 后，pending session 能显示 tag。
- 移除 tag 后不再出现在提交文本。
- 提交文本顺序符合本规划。

### Phase 2：固定可折叠侧栏骨架

目标：让 app 出现可开关、可折叠、可调宽的 MLC side panel。

任务：

- 新增 `MlcSidePanel` 骨架。
- 标题栏新增 MLC 开关按钮。
- 附件栏 MLC 按钮可打开侧栏。
- 实现 left/right position。
- 实现 collapse/expand。
- 实现 resize handle 和宽度持久化。
- caller workspace 使用真实容器宽度计算 auto columns。

验收：

- 打开侧栏后 caller 自动分栏按剩余宽度变化。
- 拖动侧栏宽度后分栏实时更新。
- 折叠侧栏后只扣除折叠宽度。
- 隐藏侧栏后 caller 使用完整宽度。

### Phase 3：资料扫描与列表

目标：MLC 侧栏能读取 `.myLastChat` 文档并展示。

任务：

- Rust 新增只读扫描模块。
- 解析 frontmatter。
- 扫描主工作区与一级 git 子工作区。
- 支持二级子文件夹 md。
- React 侧实现 search/type/workspace/sort UI。
- 文档 item 支持 attach/copy/open。

验收：

- 能读取当前 workspace `.myLastChat` 文档。
- 能读取子工作区 `.myLastChat` 文档。
- 搜索 title/description/tags 生效。
- 点击 attach 后，附件进入 focused session。

### Phase 4：历史恢复与 polish

目标：提交后的 session 历史完整显示 MLC tags。

任务：

- Rust `SessionDetail` 持久化 `mlc_attachments`。
- `load_history` 恢复 MLC attachments。
- readonly UI 支持复制路径。
- 完善 i18n。
- 完善空态和错误状态。

验收：

- app 重启后，responded session 仍显示 MLC tags。
- 扫描失败不会影响 caller 区域使用。
- 没有 focused session 时 attach 禁用。

## 15. 风险与对策

### 15.1 focus 目标丢失

风险：用户点击 MLC 侧栏导致输入框 blur。

对策：不要在 blur 清空 focusedComposer，只在 session 状态变化时清理。

### 15.2 误附加到错误 session

风险：用户忘记当前 focused session。

对策：MLC 侧栏顶部显示当前目标 session 简短提示，例如 caller 名称和 request name；如果目标无效，attach 按钮禁用。

### 15.3 大量文档扫描性能

风险：`.myLastChat` 文档数量大时扫描变慢。

对策：metadata list 和 content 读取分离；第一期不读全文；按 workspace 缓存扫描结果；必要时加刷新按钮。

### 15.4 路径安全

风险：前端传任意路径让后端读取。

对策：后端只接受 workspace roots 下 `.myLastChat` 内 md 文件；open/get 都做路径归一化校验。

### 15.5 UI 侧栏影响 caller 分栏

风险：侧栏占宽后 caller 分栏不准确。

对策：使用 caller workspace 容器真实宽度，而不是 window width。

## 16. 最终验收标准

- MLC 侧栏可在左侧或右侧显示。
- MLC 侧栏可折叠、隐藏、拖拽调整宽度。
- caller 自动分栏依据剩余真实宽度计算。
- MLC 侧栏布局与 my-last-chat 插件一致。
- MLC 侧栏能扫描兼容 my-last-chat 格式的 md 资料文件。
- MLC 侧栏默认显示当前聚焦输入框所在工作区的资料列表。
- 点击资料项能把 MLC attachment 加入当前聚焦输入框所属 session。
- MLC attachment 在编辑和只读状态都以 tag 形式展示。
- 提交文本包含 `## Attachment: MLC References` section。
- System Reminder 位于最终反馈文本最后。
- MLC 不进入 caller 后端管理，不影响 caller merge/rename/remove/pending/unread。

## 17. 结论

固定可折叠 MLC 侧栏是当前最优方案。它保留了 my-last-chat 插件的资料浏览布局，又避免把资料面板混入 caller 系统。

最终用户心智非常简单：

```text
左/右 MLC 侧栏 = 项目资料库
中间 caller 区域 = 反馈会话
当前聚焦哪个反馈输入框，MLC 就把资料附件加到哪个反馈会话
```

这条路线实现成本可控、边界清楚，并且能自然兼容后续消息队列和更完整的资料库管理能力。