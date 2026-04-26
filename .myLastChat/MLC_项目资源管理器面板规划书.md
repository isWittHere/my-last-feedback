---
title: 项目资源管理器面板规划书
description: 资源面板插入本地文件链接并在只读态渲染为标签
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - UI
  - resource-explorer
  - markdown-link
  - planning
solved_lists:
  - 明确资源管理器面板的第一版产品边界
  - 明确编辑态纯 Markdown、只读态渲染资源 tag 的方案
  - 明确文件和文件夹均以绝对路径 Markdown 链接插入
---

# 项目资源管理器面板规划书

更新时间：2026-04-26

## 1. 背景

当前 MLFB 已经具备 MLC 面板，用于从 My Last Chat 文档库中选择资料并附加到聊天上下文。新的“项目资源管理器面板”目标类似，但资源来源变为当前项目文件夹。

该面板的核心任务不是替代 IDE 文件管理器，而是帮助用户快速把项目内文件或文件夹作为上下文引用插入到当前聊天输入中。

经过讨论后，方案从“编辑态内联 tag 编辑器”调整为更轻、更稳的实现：

- 编辑态不渲染 tag，仍使用普通文本输入框。
- 用户从资源面板点击文件或文件夹行内按钮时，在当前光标位置插入 Markdown 文件链接。
- 提交后的只读态再把这些 Markdown 文件链接渲染为资源 tag。
- 提交给 agent 的真实内容仍然是 Markdown 文本。

## 2. 已确认需求

### 2.1 资源面板职责

资源管理器面板需要：

- 展示当前项目目录的文件树。
- 支持展开和折叠文件夹。
- 支持按 `.gitignore` 过滤文件。
- 文件和文件夹行均提供“插入”按钮。
- 点击插入按钮后，将对应资源的 Markdown 链接插入当前输入框光标位置。
- 面板交互风格参考 MLC 面板。

### 2.2 编辑态行为

编辑态保持纯文本，不进行内联 tag 渲染。

例如用户插入文件后，输入框中显示：

```md
请检查 [App.tsx](E:/Dev/my-last-feedback/app/src/App.tsx) 中的状态逻辑。
```

插入文件夹后，输入框中显示：

```md
请参考 [components/](E:/Dev/my-last-feedback/app/src/components/) 下的组件结构。
```

### 2.3 只读态行为

当 session 已提交或取消后，反馈文本进入只读展示态。此时 `RichText` 渲染层需要识别本地文件 Markdown 链接，并将其渲染为 inline resource tag。

例如：

```md
[App.tsx](E:/Dev/my-last-feedback/app/src/App.tsx)
```

在只读态显示为类似：

```text
[文件 App.tsx]
```

底层文本仍然保持原 Markdown 内容。

### 2.4 路径形式

链接路径使用绝对路径。

推荐统一为 slash 风格：

```md
[App.tsx](E:/Dev/my-last-feedback/app/src/App.tsx)
```

不推荐直接使用 Windows 反斜杠：

```md
[App.tsx](E:\Dev\my-last-feedback\app\src\App.tsx)
```

文件夹链接应在 label 和 href 中保留结尾 `/`：

```md
[components/](E:/Dev/my-last-feedback/app/src/components/)
```

## 3. 非目标

第一版不做以下事项：

- 不把编辑态输入框升级为 CodeMirror 或 contenteditable。
- 不在编辑态把 Markdown 链接显示为 tag。
- 不新增 `resourceAttachments` 数组到 session store。
- 不在提交时自动读取文件内容。
- 不递归展开文件夹内容并注入 prompt。
- 不实现全文搜索。
- 不做复杂右键菜单。

这些能力可作为后续增强。

## 4. 产品交互设计

### 4.1 面板入口

输入框附件按钮行新增“资源管理器”按钮。

建议行为与 MLC 按钮一致：

- 点击按钮打开资源管理器面板。
- 面板打开且绑定当前 workspace 时按钮显示 active 状态。
- 再次点击 active 按钮收起资源管理器面板。
- 面板关闭后按钮恢复普通状态。

建议图标：文件夹、文件树或资源管理器图标。

### 4.2 面板布局

资源管理器面板可复用 MLC 面板的视觉语言：

- 顶部图标 tab 栏。
- 主体为树形列表。
- 每行高度紧凑。
- hover 后显示行内操作按钮。
- hover tip 样式与现有自定义 tooltip 统一。

### 4.3 文件行

文件行展示：

- 文件图标。
- 文件名。
- 可选的相对路径或简短元信息。
- 右侧插入按钮。

点击插入按钮：

```md
[文件名](绝对路径)
```

### 4.4 文件夹行

文件夹行展示：

- 展开箭头。
- 文件夹图标。
- 文件夹名。
- 右侧插入按钮。

点击文件夹主体：展开或折叠。

点击插入按钮：

```md
[文件夹名/](绝对路径/)
```

### 4.5 Hover Tip

文件和文件夹行 hover tip 可展示：

- 类型：文件或文件夹。
- 名称。
- 完整绝对路径。
- 可选：文件大小、修改时间。

第一版可以只展示类型、名称和绝对路径。

## 5. 数据与文本格式

### 5.1 文件树节点

资源面板内部可使用以下结构：

```ts
interface ProjectResourceNode {
  name: string;
  absolutePath: string;
  relativePath: string;
  kind: "file" | "folder";
  childrenLoaded?: boolean;
  children?: ProjectResourceNode[];
  error?: string;
}
```

该结构仅用于面板展示，不进入 session 持久数据。

### 5.2 插入文本

文件插入：

```ts
function formatFileMarkdownLink(node: ProjectResourceNode): string {
  return `[${node.name}](${toMarkdownPath(node.absolutePath)})`;
}
```

文件夹插入：

```ts
function formatFolderMarkdownLink(node: ProjectResourceNode): string {
  return `[${node.name}/](${ensureTrailingSlash(toMarkdownPath(node.absolutePath))})`;
}
```

### 5.3 路径规范化

路径规范化规则：

- Windows `\` 转为 `/`。
- 保留盘符，例如 `E:/`。
- 文件夹 href 末尾加 `/`。
- 空格和特殊字符进行 URL encode。
- label 不 encode，仅用于显示。

示例：

```ts
E:\Dev\my project\src\App.tsx
```

转换为：

```md
[App.tsx](E:/Dev/my%20project/src/App.tsx)
```

## 6. 输入框插入机制

资源面板需要将 Markdown 链接插入当前输入光标位置。

建议沿用现有 focused composer 思路：

- `FeedbackInput` 在 focus 时记录当前 composer。
- 同时保存或暴露当前 textarea ref。
- 资源面板点击插入时，调用插入函数。
- 插入函数维护 selectionStart / selectionEnd。
- 插入后恢复焦点，并将光标移动到插入文本之后。

插入逻辑示例：

```ts
function insertTextAtCursor(textarea: HTMLTextAreaElement, text: string) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const nextValue = value.slice(0, start) + text + value.slice(end);
  const nextCursor = start + text.length;
  return { nextValue, nextCursor };
}
```

需要分别支持：

- 当前 pending session 的 feedback 输入框。
- queued draft 输入框。

## 7. 只读态渲染方案

### 7.1 复用 RichText

现有 `RichText` 已支持：

- 普通文本。
- URL 链接。
- 颜色标签。

它已经具备轻量 inline token renderer 的基础。

建议扩展 token 类型：

```ts
type RichTextPart =
  | { type: "text"; value: string }
  | { type: "url"; value: string }
  | { type: "color"; value: string }
  | { type: "resourceLink"; label: string; href: string; kind: "file" | "folder" | "unknown" };
```

### 7.2 解析顺序

推荐解析顺序：

1. Markdown resource link。
2. 普通 URL。
3. 颜色值。
4. 普通文本。

原因：Markdown link 内部可能包含 URL、盘符、`#abc` 等文本。如果先解析 URL 或颜色，可能破坏完整链接。

### 7.3 Resource Link 判断

可识别以下 href：

```ts
const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:\//;
const UNIX_ABSOLUTE_PATH = /^\//;
```

可选兼容：

```ts
const FILE_PROTOCOL = /^file:\/\//;
```

第一版重点支持 Windows slash 绝对路径。

### 7.4 Tag 渲染

资源 tag 可渲染为：

```tsx
<span className="readonly-resource-tag" data-tooltip={href}>
  <Icon name={kind === "folder" ? "folder" : "file"} />
  <span>{label}</span>
</span>
```

建议行为：

- hover tip 向上出现。
- hover tip 显示完整路径。
- 点击默认复制路径，或后续接入打开文件。

第一版建议点击复制路径，风险最低。

## 8. 文件系统读取方案

### 8.1 懒加载

文件树应懒加载：

- 初始只读取项目根目录一层。
- 展开文件夹时读取该文件夹子项。
- 每个目录可限制最多显示数量，例如 500。
- 超限时显示“项目过大，已截断”。

### 8.2 Ignore 规则

用户已确认希望读取 `.gitignore`。

建议策略：

- 读取项目根 `.gitignore`。
- 叠加固定 ignore 列表。
- 第一版暂不支持子目录 `.gitignore` 级联。

固定 ignore 列表建议包含：

```text
.git
node_modules
target
dist
build
.next
.turbo
.cache
coverage
```

### 8.3 错误处理

文件读取可能失败，常见原因包括：

- 权限不足。
- 路径不存在。
- 符号链接循环。
- 目录过大。

面板中应以内联错误行展示，不建议弹全局错误。

## 9. UI 样式建议

### 9.1 资源面板列表项

视觉上参考 MLC 文档列表项：

- 紧凑行高。
- hover 背景轻微变化。
- 右侧 action button 在 hover 或 focus 时出现。
- 文件夹展开箭头有固定宽度，避免布局跳动。
- 文件和文件夹图标尺寸与 MLC 面板图标一致。

### 9.2 只读资源 tag

只读资源 tag 应与颜色标签和附件 tag 保持同一体系：

- 小圆角。
- inline-flex。
- 与文字基线对齐。
- 背景略高于只读区域背景。
- 文件夹和文件使用不同图标。
- 长 label 截断，完整路径放 hover tip。

## 10. 状态设计

建议新增状态：

```ts
resourcePanelVisible: boolean;
resourcePanelPosition: "left" | "right";
resourceActiveWorkspacePath: string | null;
```

行为参考 MLC：

- 打开面板时绑定当前 workspace。
- 再次点击 active 按钮关闭面板。
- 切换 caller 或 session 时可根据当前 workspace 更新面板内容。

资源树缓存可以组件内维护，不一定进入全局 store。

## 11. 实施阶段

### Phase 1：基础插入能力

- 新增资源面板入口按钮。
- 新增资源面板可见状态。
- 实现项目根目录读取。
- 实现文件夹懒加载。
- 实现点击行内按钮插入 Markdown 绝对路径链接。

### Phase 2：只读态资源 tag 渲染

- 扩展 `RichText` parser。
- 增加 `resourceLink` token。
- 渲染 inline resource tag。
- 增加 hover tip 和复制路径行为。

### Phase 3：Ignore 与边界增强

- 读取 `.gitignore`。
- 加固定 ignore 列表。
- 处理权限错误和目录过大。
- 路径 encode 和 slash 规范化。

### Phase 4：体验增强

- 保持资源面板按钮 active / toggle 行为。
- 文件夹展开状态缓存。
- 可选打开文件行为。
- 可选搜索文件名。

## 12. 测试清单

需要覆盖：

- 在普通 feedback 输入框插入文件链接。
- 在 queued draft 输入框插入文件链接。
- 插入时替换当前选区。
- 插入后光标位置正确。
- 文件夹链接 label 和 href 均带 `/`。
- Windows 路径转 slash。
- 含空格路径被 encode。
- 只读态文件链接渲染为 tag。
- 普通 HTTP URL 仍渲染为普通链接。
- 颜色标签仍正常渲染。
- markdown resource link 不被颜色 parser 误拆。
- `.gitignore` 过滤有效。
- 大目录不会卡死 UI。

## 13. 风险与决策

### 13.1 主要风险

- `.gitignore` 解析复杂度可能超出第一版预期。
- 绝对路径可能暴露本机目录结构，但这是当前已确认选择。
- Markdown link parser 需要避免误伤普通文本。
- 文件树读取需要避免大目录性能问题。

### 13.2 已做出的关键决策

- 不做编辑态 tag 渲染。
- 不新增资源附件数组。
- 使用 Markdown 链接作为真实提交内容。
- 只读态通过 `RichText` 渲染资源 tag。
- 文件夹语义是路径引用。
- 第一版暂不做搜索。
- 使用 `.gitignore` 过滤。
- 使用绝对路径。

## 14. 最终建议

建议按“资源面板插入 Markdown 链接 + 只读态 RichText 渲染 tag”的方案实施。

该方案具备以下优势：

- 改动范围可控。
- 不破坏现有输入框。
- 不增加提交数据结构复杂度。
- 与现有只读颜色标签能力一致。
- 后续仍可升级为编辑态 tag 编辑器。

第一版的成功标准是：用户能从项目文件树中快速选择文件或文件夹，并把它们以 Markdown 链接插入当前聊天；提交后，这些链接在只读区域显示为清晰的资源 tag。