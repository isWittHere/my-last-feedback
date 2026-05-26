---
title: MLC Markdown预览面板规划书
description: 规划MLC文档点选预览与Markdown渲染复用方案
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLC
  - Dock
  - Markdown
  - UI
  - Tauri
solved_lists:
  - 明确MLC预览面板的产品定位
  - 明确复用agent消息Markdown渲染逻辑
  - 明确dock接入与数据流方案
  - 明确后端读取命令与安全边界
---

# MLC Markdown预览面板规划书

## 1. 背景

当前 MLFB 已引入 MLC 面板，用于在项目工作区中搜索、筛选、收藏、附加 `.myLastChat` 知识文档。MLC 面板当前的核心职责是“发现与管理文档元数据”，并不承担正文阅读。

随着三栏 dock 系统引入，界面已经具备更灵活的面板停靠能力：

- `leftSidebar`
- `leftPage`
- `rightSidebar`

这使得 MLC 文档阅读可以从原有列表面板中解耦出来，成为一个独立可停靠、可拖动、可折叠的预览面板。

用户提出的新需求是：在点选 MLC 列表项后，新增一个面板渲染并预览该文档的 Markdown 内容。

本规划目标是定义该功能的产品边界、技术架构、数据流、交互细节、渲染复用方案、安全边界与实施步骤。

## 2. 目标

### 2.1 产品目标

新增一个 MLC Markdown 预览面板，使用户可以在应用内快速阅读 MLC 文档正文，而不必跳转到系统编辑器或文件管理器。

首版目标：

- 点击 MLC 列表项即可选中文档。
- 自动打开或激活 MLC 预览面板。
- 预览面板渲染该文档 Markdown 正文。
- 复用现有 agent 消息的 Markdown 渲染逻辑。
- 预览面板使用本 app 的青色主题色。
- 预览面板作为 dock tab 接入三栏系统。

### 2.2 技术目标

- 不重复实现 Markdown renderer。
- 将 `SummaryPanel` 中已有 Markdown 渲染逻辑抽为共享组件。
- 后端按需读取单个 MLC 文档正文，不在列表搜索时批量返回正文。
- 安全读取 `.myLastChat` 范围内的 Markdown 文件。
- 保持 MLC 列表、资源管理器、dock 容器之间的职责清晰。

## 3. 非目标

首版不做以下内容：

- 不实现 Markdown 编辑器。
- 不在预览面板中直接修改文档。
- 不实现双栏 diff、历史版本或文件比较。
- 不引入新的 Markdown 渲染体系。
- 不把所有 MLC 文档正文预加载到前端。
- 不把预览面板做成 MLC 面板内部嵌套卡片。
- 不为通用任意 Markdown 文件提供独立阅读器能力。

未来可扩展但不在首版范围内：

- Rendered / Source 双模式切换。
- 文档大纲目录。
- 搜索当前文档正文。
- 编辑并保存 MLC 文档。
- 多文档标签页预览。

## 4. 当前基础

### 4.1 MLC 面板现状

现有文件：

- `app/src/components/MlcSidePanel.tsx`

当前 MLC 面板通过 Tauri command 加载文档列表：

- `mlc_search_documents`

前端收到的 `MlcDocument` 是元数据结构，包含：

- `filePath`
- `fileName`
- `title`
- `description`
- `project`
- `type`
- `createdAt`
- `updatedAt`
- `favorite`
- `tags`
- `folderName`
- `folderPath`
- `workspaceName`
- `workspacePath`

当前不包含 Markdown 正文。

### 4.2 后端 MLC 模块现状

现有文件：

- `app/src-tauri/src/mlc.rs`

已存在命令：

- `mlc_search_documents`
- `mlc_toggle_favorite`
- `mlc_delete_document`

`parse_document` 会读取 Markdown 文件内容并解析 YAML frontmatter，但最终只返回文档元数据。

### 4.3 Markdown 渲染现状

现有文件：

- `app/src/components/SummaryPanel.tsx`
- `app/src/index.css`

`SummaryPanel` 已具备完整的 agent 消息 Markdown 渲染能力：

- `ReactMarkdown`
- `remark-gfm`
- `remark-breaks`
- Prism 代码高亮
- 代码块复制按钮
- 本地路径与网页链接点击处理
- `.prose` 正文样式
- 明暗主题代码块样式

这部分应抽为共享组件，供 SummaryPanel 和 MLC 预览面板共用。

### 4.4 Dock 系统现状

现有核心文件：

- `app/src/store/feedbackStore.ts`
- `app/src/components/DockColumn.tsx`
- `app/src/components/FeedbackApp.tsx`

当前 dock tab 类型包含：

- `mlc`
- `resources`

新增预览面板需要扩展为：

- `mlc`
- `resources`
- `mlcPreview`

## 5. 核心设计原则

### 5.1 列表负责选择，预览负责阅读

MLC 面板继续负责列表、筛选、收藏、附加等工作流。

MLC 预览面板只负责展示当前选中文档正文，不承担文档管理主职责。

### 5.2 正文按需读取

文档列表不携带正文，避免列表搜索导致大量文件内容进入前端状态。

用户点选某个文档后，预览面板再调用后端读取该单个文件。

### 5.3 渲染逻辑复用

预览面板必须复用 agent 消息 Markdown 渲染逻辑。

不新增第二套 Markdown 样式，不复制 `SummaryPanel` 中的 renderer 代码。

### 5.4 青色主题统一

预览面板的状态强调使用本 app 的青色主色：

- `var(--color-primary)`
- `var(--color-primary-hover)`
- `var(--color-primary-dim)`

不使用 caller color，也不使用 dock active 的 `--color-accent` 作为主要表达。

### 5.5 Dock tab 一等接入

`mlcPreview` 应当和 MLC、资源面板一样是 dock tab：

- 可右键移动到三栏。
- 可拖拽到三栏。
- 可由顶栏对应栏按钮折叠/展开。
- 可在 dock tabbar 中激活。

## 6. 用户故事

### 6.1 快速阅读 MLC 文档

作为用户，我希望点击 MLC 列表项后，在应用内直接看到该文档的 Markdown 渲染结果。

验收：

- 点击列表项主体后，预览面板打开。
- 面板显示该文档标题和正文。
- Markdown 标题、列表、表格、代码块、链接正常渲染。

### 6.2 保留现有附加工作流

作为用户，我希望 MLC 文档仍然可以一键附加到聊天输入，不被预览行为干扰。

验收：

- 点击附加按钮不会触发预览选择之外的副作用。
- 附加按钮仍然写入当前 focused composer。

### 6.3 在 dock 中自由摆放预览面板

作为用户，我希望预览面板和 MLC 面板一样可以拖到左侧栏、左页面栏或右侧栏。

验收：

- `mlcPreview` tab 可拖动。
- 右键菜单可移动 `mlcPreview` 到三栏。
- 目标区域高亮与图标标识正常。

### 6.4 使用一致的 Markdown 阅读体验

作为用户，我希望 MLC 预览中的 Markdown 和 agent 消息中的 Markdown 呈现一致。

验收：

- 代码块样式和复制按钮一致。
- 链接打开逻辑一致。
- 表格、blockquote、列表样式一致。

## 7. 信息架构

### 7.1 新增 dock tab

新增 tab id：

```ts
export type SidePanelTab = "mlc" | "resources" | "mlcPreview";
```

显示名建议：

- 中文：预览
- 英文：Preview

图标建议：

- 首版使用现有 `file-text`
- 后续可新增 `preview` 图标

### 7.2 面板组成

`MlcPreviewPanel` 建议结构：

```text
MlcPreviewPanel
├─ Header / Metadata Bar
│  ├─ 文档标题
│  ├─ 类型 tag
│  ├─ 工作区/文件夹摘要
│  └─ 操作按钮：打开、复制路径、附加、刷新
├─ Body
│  ├─ Empty State
│  ├─ Loading State
│  ├─ Error State
│  └─ MarkdownContent
└─ Optional Footer / Status
   └─ 文件路径、更新时间或读取状态
```

### 7.3 状态分类

预览面板至少需要四种状态：

1. 空态：尚未选中文档。
2. 加载态：正在读取文件。
3. 错误态：文件读取失败或路径非法。
4. 内容态：成功渲染 Markdown 正文。

## 8. 数据模型

### 8.1 前端选中文档状态

建议在 `feedbackStore.ts` 中新增轻量状态：

```ts
export interface SelectedMlcDocument {
  filePath: string;
  fileName: string;
  title: string;
  description: string;
  project: string;
  type: string;
  updatedAt: string;
  workspaceName: string;
  workspacePath: string;
  folderName?: string | null;
  folderPath?: string | null;
}
```

Store 字段：

```ts
selectedMlcDocument: SelectedMlcDocument | null;
setSelectedMlcDocument: (document: SelectedMlcDocument | null) => void;
```

不建议把正文放进全局 store。

原因：

- 正文可能较大。
- 正文是预览面板局部加载结果。
- 切换文档时可以由 `MlcPreviewPanel` 自己管理 loading/error/content。

### 8.2 后端正文返回结构

建议新增：

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MlcDocumentContent {
    pub file_path: String,
    pub title: String,
    pub markdown: String,
    pub updated_at: String,
}
```

Tauri command：

```rust
#[tauri::command]
pub async fn mlc_read_document(file_path: String) -> Result<MlcDocumentContent, String>
```

### 8.3 Markdown 正文处理

建议返回去除 YAML frontmatter 后的正文。

原因：

- frontmatter 是元数据，不是阅读正文。
- 元数据已经由列表和预览 header 展示。
- 阅读体验更接近最终文档内容。

可选后续能力：

- 增加 Source 模式显示完整源文件，包括 frontmatter。

## 9. 交互设计

### 9.1 MLC 列表项点击

建议行为：

- 单击列表项主体：选中文档并打开预览面板。
- 单击 action buttons：执行对应 action，并阻止事件冒泡。
- 双击列表项或点击“打开文件”按钮：用系统方式打开 Markdown 文件。

需要调整当前行为：

当前标题点击会直接 `handleOpen(document.filePath)`。

改造后建议：

- 列表项主体 click：`handleSelectDocument(document)`
- 标题 click 不再单独打开文件
- 打开文件放入 action button

如果必须保留标题打开行为，则会和“点选预览”冲突，不推荐。

### 9.2 自动打开预览 tab

当用户选中 MLC 文档时：

1. 更新 `selectedMlcDocument`。
2. 确保 `mlcPreview` 存在于 dock layout。
3. 激活 `mlcPreview` 所在栏。
4. 如果 `mlcPreview` 不存在，首选加入 `leftPage`。

伪流程：

```ts
setSelectedMlcDocument(toSelectedDocument(document));
ensureDockTab("mlcPreview", preferredColumnId);
setDockActiveTab(columnId, "mlcPreview");
```

建议新增 store action：

```ts
openDockTab(tabId: DockTabId, preferredColumnId: DockColumnId): void;
```

它负责：

- 如果 tab 已存在，激活所在栏。
- 如果 tab 不存在，加入首选栏。
- 确保目标栏未折叠。
- 持久化 dock layout。

这比在 MLC 面板中手写多段 dock 查找逻辑更干净。

### 9.3 左侧区域归一化影响

当前 dock 有规则：

- 如果 `leftSidebar` 为空而 `leftPage` 有 tab，则归并到 `leftSidebar`。

因此首版将 `mlcPreview` 放入 `leftPage` 时可能出现：

- 若左侧栏为空，则预览被归并到左侧栏。
- 若左侧栏已有 MLC，则预览作为左页面栏出现。

这符合“左侧栏和左页面栏在一者为空时视为左侧栏”的语义。

## 10. Markdown 渲染复用方案

### 10.1 抽出 MarkdownContent

新增文件：

- `app/src/components/MarkdownContent.tsx`

职责：

- 接收 Markdown 字符串。
- 使用 `ReactMarkdown` 渲染。
- 启用 `remarkGfm` 与 `remarkBreaks`。
- 使用 Prism 高亮代码块。
- 提供代码复制按钮。
- 提供链接打开逻辑。

建议接口：

```ts
export interface MarkdownContentProps {
  markdown: string;
  projectDirectory?: string;
  className?: string;
}
```

### 10.2 SummaryPanel 改造

`SummaryPanel` 不再直接持有 Markdown renderer 的细节。

改为：

```tsx
<MarkdownContent markdown={summary} projectDirectory={session?.projectDirectory} />
```

这样 SummaryPanel 继续负责：

- agent identity header
- questions form
- test log
- 图片展示
- copy summary 按钮

MarkdownContent 负责正文渲染。

### 10.3 MlcPreviewPanel 使用

`MlcPreviewPanel` 中：

```tsx
<MarkdownContent
  markdown={content.markdown}
  projectDirectory={selectedDocument.workspacePath}
  className="mlc-preview-markdown"
/>
```

链接解析时，文档中的相对链接可以按 `workspacePath` 解析。

如果希望更精确，也可以后续改为以 `folderPath` 或文档所在目录解析。

## 11. 视觉设计

### 11.1 总体风格

MLC 预览面板应保持工具型、阅读型界面，不做大 hero、不做卡片嵌套卡片。

推荐风格：

- 顶部 metadata bar 紧凑。
- 正文区域宽度自适应 dock column。
- 使用 `.prose` 保持 Markdown 可读性。
- 色彩只在状态和关键分隔处使用青色。

### 11.2 青色主题使用位置

使用变量：

- `var(--color-primary)`
- `var(--color-primary-hover)`
- `var(--color-primary-dim)`

建议样式：

- 当前选中文档列表项：左边 2px 青色条或 inset outline。
- 预览 header：细青色边线或图标背景。
- loading spinner：青色。
- action button active/hover：青色弱背景。
- 错误态不使用青色，应使用现有错误色或 muted 色。

### 11.3 列表项选中态

建议类名：

```css
.mlc-doc-item.selected
```

表现：

- `background: color-mix(in srgb, var(--color-primary) 10%, transparent)`
- `box-shadow: inset 2px 0 0 var(--color-primary)`
- 标题颜色略提亮

### 11.4 预览面板布局样式

建议类名：

- `.mlc-preview-panel`
- `.mlc-preview-header`
- `.mlc-preview-title`
- `.mlc-preview-meta`
- `.mlc-preview-actions`
- `.mlc-preview-body`
- `.mlc-preview-empty`
- `.mlc-preview-error`
- `.mlc-preview-markdown`

## 12. 后端读取与安全边界

### 12.1 读取命令

新增命令：

```rust
mlc_read_document(file_path: String)
```

命令步骤：

1. canonicalize 输入路径。
2. 校验文件存在。
3. 校验扩展名为 `.md` 或 `.markdown`。
4. 校验路径属于 `.myLastChat` 目录。
5. 校验文件大小不超过限制。
6. 读取 UTF-8 文本。
7. 解析 frontmatter。
8. 返回去掉 frontmatter 的 markdown 正文和必要元数据。

### 12.2 文件大小限制

建议首版限制：

- 1MB 或 2MB

理由：

- MLC 文档通常是摘要、规划、知识条目，不应过大。
- 防止超大文件导致 UI 卡顿。
- 后续可提示“文件过大，点击用外部编辑器打开”。

### 12.3 `.myLastChat` 范围校验

当前 `canonical_markdown_file` 只检查是否是 Markdown 文件。

新增读取正文时建议增强：

- 输入文件的祖先目录中必须存在 `.myLastChat`。
- 或者文件路径必须位于某个已发现的 MLC storage root 下。

更严谨的方案：

- 前端传 `workspacePath`。
- 后端根据 workspacePath 计算 `.myLastChat` storage root。
- 校验 filePath 在该 root 内。

命令签名可选：

```rust
pub async fn mlc_read_document(file_path: String, workspace_path: Option<String>) -> Result<MlcDocumentContent, String>
```

首版可先传 `filePath`，但建议实现祖先 `.myLastChat` 检查。

## 13. Dock 接入方案

### 13.1 类型扩展

更新：

```ts
export type SidePanelTab = "mlc" | "resources" | "mlcPreview";
```

### 13.2 normalize 逻辑

`normalizeDockColumn` 需要允许 `mlcPreview`。

但缺失 tab 自动补偿逻辑不应强行补 `mlcPreview`。

推荐：

- 必备默认 tab：`mlc`、`resources`
- 按需 tab：`mlcPreview`

如果本地布局里有 `mlcPreview`，保留。

如果没有，不自动加入，直到用户选择 MLC 文档。

### 13.3 DockColumn 渲染

更新：

- `dockTabLabel`
- `dockTabIcon`
- `DockTabContent`

新增：

```tsx
if (tabId === "mlcPreview") return <MlcPreviewPanel />;
```

### 13.4 拖拽与右键菜单

当前拖拽、右键移动逻辑已基本按 `DockTabId` 泛化。

需要注意：

- 判断有效 tab 的地方不能硬编码 `mlc` 或 `resources`。
- 拖拽 preview label/icon 需要支持 `mlcPreview`。
- 目标区域高亮无需特别改。

## 14. 前端组件拆分建议

### 14.1 新增 MarkdownContent

文件：

- `app/src/components/MarkdownContent.tsx`

来源：

- 从 `SummaryPanel.tsx` 提取通用 Markdown renderer。

### 14.2 新增 MlcPreviewPanel

文件：

- `app/src/components/MlcPreviewPanel.tsx`

职责：

- 读取 `selectedMlcDocument`。
- 调用 `mlc_read_document`。
- 展示 loading/error/empty/content。
- 使用 `MarkdownContent` 渲染正文。
- 提供顶部操作按钮。

### 14.3 修改 MlcSidePanel

职责变化：

- 增加列表项选中态。
- 点击列表项选中文档并打开预览 tab。
- 删除当前选中文档后清空选择。

### 14.4 修改 feedbackStore

新增：

- `selectedMlcDocument`
- `setSelectedMlcDocument`
- `openDockTab`

扩展：

- `DockTabId`
- dock normalize
- dock missing default tab 逻辑

## 15. 用户操作流程

### 15.1 首次预览

1. 用户打开 MLC 面板。
2. 用户点击某个文档列表项。
3. Store 保存 `selectedMlcDocument`。
4. dock 打开 `mlcPreview` tab。
5. `MlcPreviewPanel` 调用 `mlc_read_document`。
6. 成功后使用 `MarkdownContent` 渲染正文。

### 15.2 切换预览文档

1. 用户点击另一个 MLC 列表项。
2. Store 更新 `selectedMlcDocument`。
3. 预览面板保持打开。
4. `MlcPreviewPanel` 取消或忽略旧请求结果。
5. 加载并展示新文档。

### 15.3 删除当前文档

1. 用户在 MLC 面板删除当前选中文档。
2. 文档列表移除该项。
3. 如果删除的是 `selectedMlcDocument`，清空选择。
4. 预览面板进入空态。

### 15.4 预览面板关闭或移动

关闭/折叠/移动预览面板不清空选中文档。

理由：

- 用户可能只是调整布局。
- 再次打开预览时应仍显示当前选择。

## 16. 错误处理

### 16.1 文件不存在

可能原因：

- 文档被外部删除。
- 路径失效。

表现：

- 错误态显示“文件不存在或无法读取”。
- 提供刷新 MLC 列表按钮可选。

### 16.2 文件过大

表现：

- 错误态显示“文件过大，无法在预览中打开”。
- 提供外部打开按钮。

### 16.3 非 MLC 路径

表现：

- 错误态显示“该文件不属于 MLC 存储目录”。
- 不渲染正文。

### 16.4 Markdown 渲染异常

`ReactMarkdown` 一般不会抛出常规内容异常，但组件层仍应保证：

- `markdown || ""`
- 渲染失败不影响整个 app。

## 17. 测试与验证计划

### 17.1 静态诊断

检查文件：

- `feedbackStore.ts`
- `DockColumn.tsx`
- `MlcSidePanel.tsx`
- `MlcPreviewPanel.tsx`
- `MarkdownContent.tsx`
- `SummaryPanel.tsx`
- `mlc.rs`
- `lib.rs`
- `index.css`

### 17.2 构建验证

建议运行：

- 前端 TypeScript build
- Tauri Rust build 或 cargo check

具体命令按项目现有 package scripts 决定。

### 17.3 运行时验证

手动验证：

- 点击 MLC 列表项后预览打开。
- 切换不同文档，内容更新。
- Markdown 标题、列表、表格、代码块正常。
- 代码块复制按钮可用。
- 文档中的网页链接可打开。
- 文档中的本地路径链接可打开。
- 删除当前文档后预览清空。
- `mlcPreview` tab 可拖动到三栏。
- 顶栏按钮显示与折叠逻辑正常。

## 18. 实施阶段

### Phase 1：抽取共享 MarkdownContent

任务：

- 新建 `MarkdownContent.tsx`。
- 从 `SummaryPanel.tsx` 迁移 Markdown renderer。
- `SummaryPanel` 改用 `MarkdownContent`。

验收：

- SummaryPanel 渲染效果不退化。
- 代码块复制、链接打开仍可用。

### Phase 2：后端读取正文

任务：

- 新增 `MlcDocumentContent`。
- 新增 `mlc_read_document`。
- 注册 Tauri command。
- 实现 frontmatter 剥离。
- 实现文件大小与路径安全校验。

验收：

- 给定 MLC 文件路径可返回正文。
- 非 Markdown 或非 MLC 路径被拒绝。
- 大文件被拒绝并返回明确错误。

### Phase 3：前端选中状态与预览面板

任务：

- Store 新增 `selectedMlcDocument`。
- 新建 `MlcPreviewPanel`。
- 接入 loading/error/empty/content 状态。
- 使用 `MarkdownContent` 渲染。

验收：

- 选中文档后可显示正文。
- 切换文档时不会出现旧请求覆盖新内容。

### Phase 4：Dock 接入

任务：

- 扩展 `DockTabId`。
- 更新 tab label/icon/content。
- 新增 `openDockTab` action。
- MLC 列表项点击时打开预览 tab。

验收：

- `mlcPreview` 可出现在 dock tabbar。
- 可拖拽、右键移动。
- 顶栏按钮逻辑正常。

### Phase 5：视觉与交互抛光

任务：

- 列表项 selected 样式。
- 预览 header 青色主题样式。
- 空态、错误态、loading 样式。
- 操作按钮 tooltip 与 hover 状态。

验收：

- 预览面板看起来属于 MLC 体系。
- 视觉密度符合工具型界面。
- 青色强调清晰但不喧宾夺主。

## 19. 风险与应对

### 19.1 SummaryPanel 抽取引入回归

风险：

- agent 消息 Markdown 渲染受影响。

应对：

- 抽取前后保持组件接口和渲染输出一致。
- 优先做机械迁移，不在同一阶段改变样式。

### 19.2 DockTabId 扩展遗漏硬编码

风险：

- 现有地方硬编码 `mlc` 或 `resources`，导致 `mlcPreview` 无法拖拽或无法保存。

应对：

- 引入 `KNOWN_DOCK_TABS` 常量。
- 所有 tab 校验统一使用该常量。

### 19.3 路径读取安全不足

风险：

- 预览命令读取任意 Markdown 文件。

应对：

- 校验 `.myLastChat` 祖先目录。
- 限制文件大小。
- 只允许 markdown 扩展。

### 19.4 Markdown 内容过宽

风险：

- 表格、代码块撑开 dock column。

应对：

- 复用 `.prose` 当前表格与代码块滚动策略。
- `MlcPreviewPanel` body 设置 `min-width: 0` 与 `overflow-x: hidden`。
- 代码块内部按现有 SummaryPanel 策略换行或滚动。

## 20. 验收清单

功能验收：

- [ ] MLC 列表项可选中。
- [ ] 选中文档后打开 `mlcPreview` tab。
- [ ] 预览面板显示文档 metadata。
- [ ] 预览面板渲染 Markdown 正文。
- [ ] Markdown 渲染复用 agent 消息逻辑。
- [ ] 代码块复制可用。
- [ ] 链接打开可用。
- [ ] 当前选中文档有明显青色选中态。
- [ ] 预览面板使用青色主题强调。
- [ ] `mlcPreview` 可拖拽到三栏。
- [ ] `mlcPreview` 可通过右键菜单移动。
- [ ] 删除当前文档后预览清空。

安全验收：

- [ ] 非 Markdown 文件无法读取。
- [ ] 非 `.myLastChat` 路径无法读取。
- [ ] 超大文件无法读取并显示明确错误。
- [ ] 读取失败不会导致 app 崩溃。

回归验收：

- [ ] SummaryPanel Markdown 渲染不退化。
- [ ] MLC 附加按钮不受影响。
- [ ] MLC 收藏、删除、复制路径不受影响。
- [ ] 资源管理器面板不受影响。
- [ ] dock tab 拖拽与顶栏按钮不退化。

## 21. 推荐首版定义

首版交付建议锁定为：

- 一个新 dock tab：`mlcPreview`。
- 一个共享 Markdown renderer：`MarkdownContent`。
- 一个后端读取命令：`mlc_read_document`。
- MLC 列表单击选中并打开预览。
- 去 frontmatter 的 rendered Markdown 正文。
- 青色主题的 selected 与 header 强调。

这个范围完整覆盖用户当前需求，同时避免把预览面板扩大成编辑器或通用文件浏览器。

## 22. 后续扩展方向

后续可考虑：

- Source 模式。
- 文档内搜索。
- 标题大纲导航。
- 一键复制 rendered text 或 source markdown。
- 在预览面板中显示 frontmatter metadata 折叠区。
- 支持从资源管理器点选 Markdown 文件进入通用 Markdown 预览。
- 支持预览面板记住滚动位置。

## 23. 结论

MLC Markdown 预览面板应作为 dock 系统中的第三个一等 tab 实现，而不是嵌入 MLC 列表内部。它的渲染能力应通过抽取现有 agent 消息 Markdown renderer 来复用，视觉主题使用 app 的青色主色，正文读取由后端按需、安全地提供。

按该方案实施，可以同时满足以下要求：

- 点选 MLC 文档即可预览 Markdown。
- 与 agent 消息 Markdown 渲染体验一致。
- 与三栏 dock 系统一致。
- 与现有 MLC 管理和附件工作流解耦。
- 安全、可维护、可渐进扩展。
