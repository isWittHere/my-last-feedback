---
title: 自定义Prompt斜杠命令、文件链接高亮与只读Markdown渲染规划书
description: 规划统一 Composer 内容系统、只读 markdown、斜杠命令与文件链接高亮
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - prompt
  - slash-command
  - composer
  - resource-link
  - planning
solved_lists:
  - 分析现有 PromptButtons、FeedbackInput、ProjectResourcePanel 与 RichText 链路
  - 明确文件附件高亮指的是编辑态 markdown 资源链接 token 渲染
  - 明确只读模式应复用现有 MarkdownContent 并增强特殊 token 渲染
  - 形成统一 Composer 内容系统的分阶段实施方案与验收标准
---

# 自定义Prompt斜杠命令、文件链接高亮与只读Markdown渲染规划书

## 1. 背景与目标

当前 My Last Feedback 的自定义 prompt 功能以底部按钮形式呈现。随着 `mcp_prompts/*.prompt.md` 长期积累，按钮数量会越来越多，占用输入区底部空间，也会增加用户寻找 prompt 的成本。

新的目标是把自定义 prompt 从“常驻按钮”升级为“斜杠命令”：用户在反馈输入框中输入 `/` 后出现候选列表，继续输入 prompt 名称即可过滤候选，点击或键盘确认后把命令插入到光标位置。输入框中的斜杠命令文本需要以特殊背景色渲染，让用户明确知道这是一段可识别命令。

同时，项目资源文件插入功能已经会把文件以 markdown 链接格式插入到反馈输入光标处，例如：

```md
[FeedbackInput.tsx](E:/Dev/my-last-feedback/app/src/components/FeedbackInput.tsx)
```

这类文件链接在编辑态也需要被渲染为特殊背景 token。这里的“附件高亮”不是指现有图片、日志、MLC、Web Preview 的 tag bar 附件，而是指 Resources 面板插入到正文中的特殊文件链接文本。

因此，本次改进的核心不是单独改 prompt 或附件，而是给反馈输入框引入一套通用的“编辑态 token 渲染机制”，支持：

- slash command token：如 `/compact`。
- file link token：如 `[file.ts](E:/path/file.ts)`。
- 后续可扩展更多轻量 token，如 `@document`、`#tag`、颜色值、URL 等。

在后续讨论中，又进一步明确了一个同样重要的目标：已提交后的只读反馈区域也应按 markdown 渲染，而不是继续使用轻量 `RichText` 正则渲染。只读区域应复用本 app 已有的完善 markdown 渲染能力，并在 markdown 基础上叠加文件链接、slash command、颜色值等特殊内容渲染。

因此，本规划最终抽象为统一的 Composer 内容系统：同一份用户反馈文本，在编辑态和只读态共享语法识别和特殊 token 规则，但使用不同渲染器。

```txt
Raw feedbackText
  -> composer tokenizer / semantic classifier
  -> editable renderer 或 readonly markdown renderer
  -> submit transformer
```

## 2. 当前实现梳理

### 2.1 自定义 Prompt 加载链路

当前 prompt 数据来自 Tauri Rust 命令 `load_prompts`：

- 扫描 exe 同级或当前工作目录下的 `mcp_prompts/`。
- 读取文件名以 `.prompt.md` 结尾的 markdown 文件。
- 解析 YAML front matter 中的 `name`、`description`、`icon`。
- 返回前端 `PromptItem[]`。
- 前端在应用启动和窗口 focus 时 reload prompts，并写入 `useFeedbackStore.prompts`。

现有 `PromptItem` 结构为：

```ts
export interface PromptItem {
  name: string;
  description: string;
  content: string;
  icon: string;
}
```

当前 `PromptButtons` 会过滤 `disabledPrompts`，并把可见 prompt 渲染成按钮。点击按钮后直接调用 `handleSubmit(prompt.content)`，即“点击即提交”。

### 2.2 主输入框链路

主反馈输入框由 `FeedbackInput` 实现，底层是原生 `textarea`。

它承担的行为包括：

- active session 与 queued draft 两种写入目标。
- 自动 focus。
- 自动高度。
- 粘贴图片转图片附件。
- 监听 `mlfb-insert-feedback-text` 事件，把文本插入当前光标范围。
- ArrowUp / ArrowDown 切换消息历史。
- Escape 恢复历史草稿。
- readonly 状态处理。

由于原生 `textarea` 无法对局部文本应用不同背景样式，所以不能只靠 CSS 在当前控件内渲染局部 token。必须新增视觉渲染层，或替换为富文本编辑器。

### 2.3 文件资源插入链路

文件资源插入由 `ProjectResourcePanel` 完成：

- 文件或文件夹 entry 被格式化成 markdown 链接。
- label 使用文件名或文件夹名。
- href 使用绝对路径并对路径段 encode。
- 通过 `mlfb-insert-feedback-text` 事件插入当前 focused composer 的光标位置。

当前插入后，编辑态中用户看到的是完整 markdown 文本。只读态中，`RichText` 已能识别本地 markdown link 并渲染为 `readonly-resource-tag`。

### 2.4 只读 RichText 链路

`RichText` 当前会解析：

- URL。
- 颜色值。
- 本地资源 markdown link。

其中本地资源 link 会被渲染为带背景的 `readonly-resource-tag`，点击后复制路径。

这说明资源链接高亮的解析规则已经有雏形，但只存在于只读展示，尚未抽象为可复用 tokenizer，也没有用于编辑态。

### 2.5 已提交反馈只读展示链路

当前已提交反馈区域位于下方 Feedback Panel。当 session 状态为 `responded` 或 `cancelled` 时，界面会显示：

- `ReadonlyStatusBadge`。
- `ReadonlyTagBar`，展示图片、测试日志、Git action、MLC attachment、Web attachment。
- `feedbackText` 的只读展示。
- 下方 queued draft composer，用于对同一 caller 准备下一条反馈。

其中 `feedbackText` 当前不是完整 markdown 渲染，而是：

```tsx
<RichText text={activeSession.feedbackText} />
```

外层只提供 `whiteSpace: pre-wrap` 和 `wordBreak: break-all`。因此它只能渲染 URL、颜色值和本地资源链接，不能正确渲染 markdown 标题、列表、表格、代码块、task list、blockquote 等内容。

### 2.6 App 内已有 MarkdownContent 能力

本 app 已有 `MarkdownContent` 组件，并在以下位置使用：

- `SummaryPanel`：渲染 agent 发来的 summary。
- `MlcPreviewPanel`：渲染 My Last Chat 文档。

它已经具备：

- `react-markdown`。
- `remark-gfm`。
- `remark-breaks`。
- markdown 标题、列表、表格、task list 等基础结构。
- fenced code block。
- Prism 语法高亮。
- 代码块复制按钮。
- markdown link 点击打开。
- `projectDirectory` 参与相对路径解析。

因此只读反馈区不应另写一套 markdown renderer，也不应把 `RichText` 扩展成半个 markdown parser。正确方向是复用并增强 `MarkdownContent`。

## 3. 需求定义

### 3.1 功能需求

1. 用户在反馈输入框输入 `/` 后，应弹出 prompt 候选列表。
2. 用户继续输入时，候选列表根据输入内容实时过滤。
3. 用户可用鼠标点击候选项完成命令输入。
4. 用户可用键盘完成候选选择：ArrowUp、ArrowDown、Enter、Tab、Escape。
5. 已插入的斜杠命令在编辑态显示特殊背景色。
6. Resources 面板插入的 markdown 文件链接在编辑态显示特殊背景色。
7. 文件链接 token 不改变提交语义，仍作为原 markdown link 保留在用户反馈文本中。
8. 斜杠命令 token 在提交时应展开为对应 prompt content，或以结构化 section 附加到最终反馈内容。
9. disabled prompt 不应出现在斜杠命令候选框中。
10. 原有 `FeedbackInput` 的基础行为不能退化：图片粘贴、历史消息、queued draft、readonly、自动高度、光标插入都应继续工作。
11. 已提交反馈只读区域应完整渲染 markdown。
12. 只读反馈中的本地文件链接应渲染成特殊 resource token，而不是普通链接。
13. 只读反馈中的 slash command、颜色值等特殊内容应使用统一 token 规则增强渲染。
14. SummaryPanel 与 MlcPreviewPanel 的现有 markdown 渲染不应被新逻辑意外改变。

### 3.2 非目标

本规划不建议在第一阶段完成以下内容：

- 不直接引入完整富文本编辑器。
- 不把图片、测试日志、MLC、Web Preview 的 tag bar 附件合并进正文 token。
- 不移除旧 PromptButtons，第一阶段应保留或通过设置隐藏，降低迁移风险。
- 不实现复杂 markdown 所见即所得编辑。
- 不改变 Resources 面板插入 markdown link 的底层文本格式。
- 不默认把测试日志按 markdown 渲染。测试日志应保留 pre/log 语义，只做必要的轻量增强。

## 4. 设计原则

### 4.1 文本仍是唯一真实数据源

`feedbackText` 继续保存纯字符串。文件链接和斜杠命令都只是字符串中的特殊片段。

这样可以保持：

- 提交链路简单。
- 历史记录可读。
- 剪贴板行为自然。
- Undo / redo 仍由浏览器 textarea 处理。
- 不需要为 token 引入复杂持久化结构。

### 4.2 编辑态渲染与提交语义解耦

tokenizer 负责识别和渲染，不直接决定提交如何展开。

提交层单独处理：

- file link：原样保留在 `## User Feedback`。
- slash command：根据 command id 找到 prompt content，生成独立 prompt section。
- unknown slash command：按普通文本保留，不展开。

### 4.3 先复用 textarea，再评估富文本

当前 `FeedbackInput` 行为较多，直接切换到 `contentEditable` 会放大风险。第一阶段建议使用 textarea + overlay 方案。

overlay 方案的核心是：

- textarea 仍负责输入、选区、粘贴、历史。
- overlay 负责把同一份文本渲染为 token 背景。
- 两者同步滚动、尺寸、字体、padding。

### 4.4 共享 tokenizer，避免规则漂移

目前 `RichText` 内部已经有资源链接解析逻辑。建议抽成共享模块，让编辑态和只读态使用同一套规则。

目标是：

- 编辑态识别为文件 token 的内容，只读态也应识别。
- Resources 插入的格式只维护一套解析规则。
- 后续加入 slash command 后，提交解析也能复用同一 tokenizer。

### 4.5 MarkdownContent 是只读渲染基础

只读反馈区域应复用现有 `MarkdownContent`，并通过 props 启用 composer 特殊 token。

建议方向：

```tsx
<MarkdownContent
  markdown={session.feedbackText}
  projectDirectory={session.projectDirectory}
  variant="feedback"
  enableComposerTokens
/>
```

默认情况下，`SummaryPanel` 和 `MlcPreviewPanel` 可以继续使用当前行为，不启用 composer token，避免 slash command 等输入语义污染知识文档或 agent summary。

### 4.6 共通点放在语义层，不强行共用 DOM 渲染器

主输入区和只读区处理同一份内容，但它们不应强行共用同一个 React DOM 组件。

编辑态需要：

- textarea 光标模型。
- selection。
- IME。
- 粘贴图片。
- undo / redo。
- 历史消息。

只读态需要：

- 完整 markdown。
- 标题、列表、表格。
- 代码块高亮和复制。
- 可点击/可复制特殊 token。

因此应共享：

- tokenizer。
- resource link 判断。
- prompt command id 规则。
- token 视觉原语。
- 提交展开逻辑。

但渲染器分为：

- `TokenizedTextarea`：编辑态。
- `ReadonlyComposerContent` / `MarkdownContent`：只读态。

## 5. 统一 Composer 内容系统

### 5.1 总体结构

建议将用户反馈内容视为 Composer Content，而不是普通 textarea 字符串。

```txt
feedbackText: string
  -> composerTokens.ts
  -> EditableComposer / ReadonlyComposerContent
  -> submit transformer
```

其中 store 仍只保存纯字符串，所有结构化语义都在渲染或提交时派生。

### 5.2 纯逻辑模块

建议新增：

```txt
app/src/composer/composerTokens.ts
app/src/composer/promptCommands.ts
app/src/composer/resourceLinks.ts
```

职责：

- 判断 href 是否本地资源。
- normalize / decode resource href。
- 判断 resource kind 是 file 还是 folder。
- 解析 markdown resource link。
- 解析 slash command。
- 解析颜色值。
- 派生 prompt command id。
- 提交时展开 slash command。

### 5.3 视觉原语组件

建议新增或抽出：

```txt
app/src/components/composer/ResourceLinkToken.tsx
app/src/components/composer/SlashCommandToken.tsx
app/src/components/composer/ColorToken.tsx
```

只读态可以直接使用这些组件，提供点击、复制、tooltip 等行为。

编辑态 overlay 可以复用同一套 CSS class，但不一定复用完整交互组件。第一阶段编辑态 token 只做背景，不做点击 chip。

### 5.4 只读渲染器

建议新增轻包装：

```txt
app/src/components/ReadonlyComposerContent.tsx
```

职责：

- 接收 session 或 markdown + projectDirectory。
- 调用增强版 `MarkdownContent`。
- 开启 feedback 专用 composer token。
- 提供只读反馈区专用 className。

这样 `CallerPanel` 不需要直接处理 markdown 和 token 细节。

### 5.5 编辑态渲染器

建议新增：

```txt
app/src/components/TokenizedTextarea.tsx
```

它与 `ReadonlyComposerContent` 共享 tokenizer，但渲染方式不同：textarea + overlay。

## 6. 只读 Markdown 渲染设计

### 6.1 MarkdownContent 增强

建议扩展 props：

```ts
export interface MarkdownContentProps {
  markdown: string;
  projectDirectory?: string;
  className?: string;
  variant?: "summary" | "mlcPreview" | "feedback";
  enableComposerTokens?: boolean;
}
```

默认 `enableComposerTokens` 为 false，保持现有 SummaryPanel 和 MlcPreviewPanel 行为。

只读 feedback 使用 `enableComposerTokens`。

### 6.2 Link renderer 分流

现有 `MarkdownContent` 的 `LinkRenderer` 已负责打开 web URL、file URL、绝对路径和相对路径。

增强后应分流：

- Web link：普通 `<a>`，保持现有打开行为。
- file URL：渲染 `ResourceLinkToken`。
- Windows / Unix absolute path：渲染 `ResourceLinkToken`。
- projectDirectory 下的相对路径：可渲染 `ResourceLinkToken`。
- 其他相对链接：保持普通 link 或按现有路径打开逻辑处理。

### 6.3 Text node 增强

当 `enableComposerTokens` 为 true 时，可对普通文本节点做轻量 tokenization：

- slash command：渲染 `SlashCommandToken`。
- color literal：渲染 `ColorToken`。
- 裸 URL：可选，若 markdown renderer 未自动 linkify，再考虑增强。

注意：不要在 code block 或 inline code 中做 tokenization。

### 6.4 代码块保持现有实现

`MarkdownContent` 已有 `CodeBlock`，支持语言标识、Prism 语法高亮和复制按钮。这应直接复用。

只读 feedback 改用 `MarkdownContent` 后，应自然获得这些能力。

### 6.5 Test Log 例外

`testLogText` 不建议默认 markdown 渲染。

日志通常是终端输出或测试输出，里面的 `#`、`|`、`_`、反引号等可能不是 markdown 语义。测试日志应继续以 pre/log 形式显示。

如果需要增强，可以只复用轻量 token：URL、文件链接、颜色值，而不是完整 markdown。

## 7. 交互设计

## 5. 交互设计

### 5.1 Slash Command 触发

触发条件：

- 当前输入框聚焦。
- 当前 selection 是光标而不是范围选择。
- 光标前的当前 token 以 `/` 开头。
- `/` 位于文本开头、行首、或空白字符之后。
- 当前不在中文输入法 composition 过程中。

示例：

```txt
/
/compact
请先 /compact
```

不建议触发的情况：

```txt
http://example.com/a/b
path/to/file
abc/def
```

### 5.2 Slash Command 候选框

候选框展示字段：

- icon：沿用 prompt 的 `icon`。
- command：推荐显示 `/command-id`。
- name：prompt display name。
- description：prompt 描述。

过滤规则：

- 用户输入 `/com` 时优先匹配 command id。
- 其次匹配 name。
- 再匹配 description。
- 匹配大小写不敏感。
- disabled prompt 被排除。

排序建议：

1. command id 前缀匹配。
2. name 前缀匹配。
3. command id 包含匹配。
4. name / description 包含匹配。
5. 原始 prompt 加载顺序。

键盘交互：

- ArrowDown：下一个候选。
- ArrowUp：上一个候选。
- Enter：选中候选。
- Tab：选中候选。
- Escape：关闭候选框。
- 鼠标点击：选中候选。

选中后行为：

- 替换当前 `/query` 范围，而不是追加到末尾。
- 插入标准 command token 文本。
- 光标移动到 token 后。
- 可按规则补一个空格。

### 5.3 文件链接 token 渲染

Resources 面板插入后，底层真实文本保持：

```md
[FeedbackInput.tsx](E:/Dev/my-last-feedback/app/src/components/FeedbackInput.tsx)
```

编辑态视觉可以有两种显示策略。

策略 A：保留完整文本，给整段 markdown link 加背景。

优点：实现最简单，光标和文本宽度最不容易错位。

缺点：视觉仍然有些长。

策略 B：视觉上显示为 chip，如 `FeedbackInput.tsx`，底层仍是完整 markdown link。

优点：体验最好。

缺点：textarea overlay 中视觉文本宽度和真实文本宽度不同，会导致光标、选择和换行错位，除非改用真正富文本编辑器。

第一阶段强烈建议采用策略 A：不隐藏 markdown link 的任何字符，只对整段加背景。这样不破坏 textarea 的光标模型。

### 5.4 Slash Command token 渲染

斜杠命令也建议第一阶段保留原始文本，例如 `/compact`，只添加背景、边框和前景色。

不要在 overlay 中把 `/compact` 替换成图标 + 名称 chip，因为这同样会造成视觉宽度与真实文本宽度不一致。

### 5.5 PromptButtons 过渡

PromptButtons 当前是“点击即提交”，slash command 是“插入命令，然后用户提交”。二者语义不同。

推荐过渡方案：

- 第一阶段保留 PromptButtons。
- 设置里新增显示开关，默认仍显示或在 prompts 数量较少时显示。
- Slash command 稳定后，再考虑默认隐藏 PromptButtons。

也可以把 PromptButtons 改成“点击插入 slash command”，但这会改变老用户习惯，应放到后续阶段。

## 8. 数据与命令标识设计

### 6.1 PromptItem 扩展

当前 prompt 只有 `name`，但 name 不适合作为长期稳定命令 id，因为它可能：

- 包含空格。
- 包含中文。
- 包含大小写差异。
- 后续被用户重命名。
- 与其他 prompt 重名。

建议扩展 prompt front matter：

```yaml
---
name: Compact
command: compact
description: Compact current conversation
icon: archive
---
```

前端类型扩展为：

```ts
export interface PromptItem {
  name: string;
  command?: string;
  description: string;
  content: string;
  icon: string;
}
```

兼容策略：

- 如果 front matter 有 `command`，使用它。
- 否则由 `name` 派生 slug。
- 如果 slug 冲突，追加短后缀或保留加载顺序生成唯一 id。
- UI 可提示用户 command 冲突，但第一阶段可先自动去重。

### 6.2 Command Slug 规则

推荐 slug 规则：

- trim。
- lower case。
- 空格和下划线转 `-`。
- 移除不适合命令的标点。
- 连续 `-` 合并。
- 允许中文时保留中文字符，但建议示例 prompt 使用 ASCII command。

示例：

| name | command |
| --- | --- |
| Compact | compact |
| Knowledge Maker | knowledge-maker |
| Re Verify | re-verify |
| 创建摘要 | 创建摘要 |

更稳的长期方案是鼓励 prompt 文件显式写 `command`。

## 9. Tokenizer 设计

### 7.1 模块位置

建议新增：

```txt
app/src/composer/composerTokens.ts
app/src/composer/commandIds.ts
```

也可以放在 `app/src/components/` 下，但 tokenizer 更偏纯逻辑，单独目录更清晰。

### 7.2 Token 类型

建议类型：

```ts
export type ComposerToken =
  | { type: "text"; value: string; start: number; end: number }
  | { type: "fileLink"; raw: string; label: string; href: string; kind: "file" | "folder"; start: number; end: number }
  | { type: "slashCommand"; raw: string; command: string; matched: boolean; promptName?: string; start: number; end: number };
```

每个 token 都保留 `start` 和 `end`，方便：

- 候选框替换当前 query。
- 提交时定位 slash command。
- 调试和测试。

### 7.3 文件链接解析规则

第一阶段只识别 markdown link：

```regex
\[([^\]\n]+)\]\(([^)\n]+)\)
```

识别后需要判断 href 是否本地资源：

- Windows drive path：`E:/...`。
- UNC path：`//server/share/...` 或 `\\server\share\...`，实际文本中可能已 normalize 为 `/`。
- Unix absolute path：`/...`。
- 工作区相对路径：可选，建议第一阶段先不强行识别，避免普通 markdown 相对链接误判。

href decode：

- 对 href 使用 `decodeURIComponent`，失败时保留原值。
- 统一 `\` 为 `/`。
- folder 判断沿用 label 或 href 是否以 `/` 结尾。

### 7.4 Slash Command 解析规则

可先识别简单形式：

```regex
(^|\s)/(\S*)
```

但正式实现不建议完全依赖全局 regex，应按字符扫描，以避免 URL、路径、markdown 链接内误判。

识别条件：

- `/` 前是文本开头或 whitespace。
- `/` 后允许字母、数字、中文、`-`、`_`。
- 遇到 whitespace、换行或标点结束。
- 如果 slash 位于 markdown link href 内，不识别为命令。

### 7.5 Token 优先级

文件链接优先于 slash command。

原因：markdown link href 里可能包含 `/`，如果先解析 slash command 会误判路径片段。

建议流程：

1. 扫描 markdown link，生成 protected ranges。
2. 在非 protected ranges 中扫描 slash command。
3. 合并成按 start 排序的 tokens。
4. 未命中的区间补 text token。

## 10. 编辑态组件设计

### 8.1 TokenizedTextarea

建议新增组件：

```txt
app/src/components/TokenizedTextarea.tsx
```

职责：

- 接收 `value`、`onChange`、`onKeyDown`、`onPaste`、`onFocus` 等 textarea 原有 props。
- 接收 tokenizer 所需的 prompts。
- 渲染 overlay token layer。
- 渲染真实 textarea。
- 同步 scroll。
- 暴露 ref，使 `FeedbackInput` 仍可控制 focus、selection、height。

### 8.2 DOM 结构

建议结构：

```tsx
<div className="tokenized-textarea-root">
  <div className="tokenized-textarea-overlay" aria-hidden="true">
    {renderTokens(tokens)}
  </div>
  <textarea className="input-area tokenized-textarea-input" />
  <SlashCommandMenu />
</div>
```

### 8.3 样式要求

overlay 与 textarea 必须严格共享：

- font-family。
- font-size。
- line-height。
- padding。
- border width。
- white-space。
- word-break。
- letter-spacing。
- tab-size。

建议用 CSS class 统一，而不是大量 inline style 分散维护。

### 8.4 可见文字策略

由于 overlay 和 textarea 显示同一份文本，会出现文字叠加。

推荐方式：

- overlay 渲染背景和透明或低对比文字。
- textarea 仍渲染真实文字。
- token 背景位于 textarea 背后。
- textarea 背景透明。

这样可以避免 caret 不可见、selection 不自然等问题。

如果发现 token 背景被 textarea selection 覆盖，应接受浏览器默认 selection 优先级，这比自定义 selection 更稳定。

### 8.5 Scroll 同步

textarea onScroll 时：

```ts
overlay.scrollTop = textarea.scrollTop;
overlay.scrollLeft = textarea.scrollLeft;
```

如果输入框自动高度且不滚动，仍保留同步逻辑，避免未来样式变化。

### 8.6 Slash 菜单定位

候选框需要出现在当前 `/query` 附近。textarea 本身不能直接给字符位置 DOM rect，需使用 caret mirror 技术。

建议实现 `getTextareaCaretRect(textarea, position)`：

- 创建隐藏 mirror div。
- 复制 textarea 的 font、padding、border、width、white-space、line-height 等样式。
- 写入 position 前的文本。
- 插入 marker span。
- 获取 marker rect。
- 换算到 viewport 或 root container 坐标。

候选框可使用 `position: fixed` 或 root 内 absolute。考虑 dock 面板 overflow，优先使用 portal 到 `document.body`，并做视口边界 clamp。

## 11. SlashCommandMenu 设计

建议新增：

```txt
app/src/components/SlashCommandMenu.tsx
```

Props：

```ts
interface SlashCommandMenuProps {
  open: boolean;
  query: string;
  anchorRect: DOMRect | null;
  items: SlashCommandItem[];
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (item: SlashCommandItem) => void;
  onClose: () => void;
}
```

Item：

```ts
interface SlashCommandItem {
  command: string;
  prompt: PromptItem;
}
```

样式：

- 使用 app 现有 popover/menu 风格。
- 每项高度稳定，适合键盘高亮。
- 图标使用现有 `PromptIcon`。
- 不在 UI 内写过多说明，只显示必要信息：command、name、description。

## 12. 提交展开设计

### 10.1 当前提交行为

当前 `CallerPanel` 在 `handleSubmit` 中组装 sections：

- `## User Feedback`
- `## User Requirement`，来自 quickAction。
- questions table。
- git action。
- test logs。
- images。
- MLC references。
- web references。
- system reminder。

PromptButtons 当前通过 `quickAction` 直接追加 prompt content。

### 10.2 Slash 命令展开方案

建议新增：

```ts
function expandSlashCommands(text: string, prompts: PromptItem[]): {
  displayText: string;
  userText: string;
  commands: Array<{ command: string; prompt: PromptItem; raw: string }>;
  unknownCommands: string[];
}
```

提交时：

- `userText` 进入 `## User Feedback`。
- 命中的 slash commands 进入独立 section。
- 文件链接仍留在 `userText` 中。

### 10.3 是否从 User Feedback 中移除 slash command

有两种方案。

方案 A：保留 slash command 原文。

```md
## User Feedback
/compact 请总结本轮上下文

## Slash Command: compact
[prompt content]
```

优点：历史和提交内容完全可追溯。

缺点：agent 会同时看到 `/compact` 和展开内容，略有重复。

方案 B：从 User Feedback 中移除命中的 slash command。

```md
## User Feedback
请总结本轮上下文

## Slash Command: compact
[prompt content]
```

优点：最终反馈更干净。

缺点：历史展示和提交文本不完全一致。

推荐方案 B，但消息历史保存仍保留用户原始输入。这样 agent 收到的内容更明确，用户历史仍可读。

### 10.4 多命令规则

允许多个 slash command：

```txt
/compact /re-verify 请复核本轮修改
```

提交时按出现顺序展开：

```md
## Slash Command: compact

[compact content]

## Slash Command: re-verify

[re-verify content]

## User Feedback

请复核本轮修改
```

同一个命令重复出现时，第一阶段可以允许重复展开，后续可考虑去重。

### 10.5 Unknown Command

如果用户输入 `/unknown`，但没有匹配 prompt：

- 编辑态可以用 warning 样式或普通 command 样式弱提示。
- 提交时不展开。
- 原样保留在 User Feedback。

## 13. 文件链接提交语义

文件链接不需要额外 section，也不应该变成 MLC attachment 状态。

原因：

- 用户明确是把文件附件以特殊链接格式插入正文。
- 这类链接本来就是用户反馈文本的一部分。
- 当前只读 RichText 已能把它渲染为 resource tag。

提交时示例：

```md
## User Feedback
请检查 [FeedbackInput.tsx](E:/Dev/my-last-feedback/app/src/components/FeedbackInput.tsx) 的输入渲染。
```

agent 端会收到 markdown link，具备路径上下文。

## 14. 分阶段实施计划

### Phase 0：准备与回归基线

目标：锁定当前行为，避免后续改输入框时回归。

任务：

- 梳理 `FeedbackInput` 当前输入行为清单。
- 确认 Resources 插入文件链接的格式。
- 确认只读 `RichText` 文件链接渲染规则。
- 记录 PromptButtons 当前“点击即提交”行为。

产出：

- 当前行为 checklist。
- 后续手测用例列表。

### Phase 1：共享 Composer Token 与资源链接逻辑

目标：把文件链接解析从 `RichText` 中抽出，形成可复用 tokenizer。

任务：

- 新增 `composerTokens.ts`。
- 实现 markdown local file link 解析。
- 实现 slash command 初步解析，但此阶段可以不接 UI。
- 为 token 保留 `start`、`end`、`raw`。
- 抽出当前 `RichText` 中的 resource link、color、URL 识别能力。
- 准备给 `MarkdownContent` 和编辑态 overlay 复用。

验收：

- 资源链接判断逻辑可被单元测试覆盖。
- 本地文件 link、folder link、web link 能正确分类。
- slash command 不会误识别 markdown link href 中的路径片段。

### Phase 2：增强 MarkdownContent 与只读反馈渲染

目标：让已提交 feedbackText 使用完整 markdown 渲染，并叠加 composer 特殊 token。

任务：

- 扩展 `MarkdownContentProps`，增加 `variant` 与 `enableComposerTokens`。
- 增强 `LinkRenderer`，本地资源 link 渲染为 `ResourceLinkToken`。
- 增强普通文本节点，支持 slash command 和颜色值 token。
- 新增 `ReadonlyComposerContent` 包装组件。
- 将 `CallerPanel` 中已提交 feedbackText 的 `RichText` 替换为 `ReadonlyComposerContent`。
- 保持 SummaryPanel 与 MlcPreviewPanel 默认行为不变。

验收：

- 已提交反馈中的 markdown 标题正常渲染。
- 列表、task list、表格、blockquote 正常渲染。
- 代码块有语法高亮和复制按钮。
- 本地文件 link 显示为 resource token。
- slash command 显示为 command token。
- 颜色值显示为 swatch。
- SummaryPanel 与 MlcPreviewPanel 不出现意外样式或语义变化。

### Phase 3：TokenizedTextarea 编辑态高亮

目标：让编辑态输入框中的文件 markdown link 显示高亮背景。

任务：

- 新增 `TokenizedTextarea`。
- 保留 textarea 作为真实输入源。
- 增加 overlay token layer。
- 同步 scroll、font、padding、line-height。
- 在 `FeedbackInput` 中替换原始 textarea 渲染。
- 确保 queued draft placeholder 仍正常。

验收：

- Resources 插入 `[label](path)` 后立即显示高亮背景。
- 粘贴图片仍能生成图片附件。
- 上下方向键历史仍可用。
- Escape 恢复草稿仍可用。
- Ctrl+Enter 提交仍可用。
- readonly session 不受影响。

### Phase 4：Slash Command 候选框

目标：输入 `/` 后显示 prompt 候选列表并可插入命令。

任务：

- 给 prompt 派生 command id。
- 可选：Rust 端解析 `command` front matter。
- 新增 `SlashCommandMenu`。
- 实现 query range 检测。
- 实现 caret mirror 定位。
- 实现键盘选择和鼠标点击。
- 选中后替换当前 `/query`。
- disabled prompts 不出现在候选。

验收：

- `/` 触发候选框。
- `/com` 过滤到 compact 等匹配项。
- 点击候选可插入 `/compact`。
- Enter / Tab 可插入。
- Escape 关闭。
- URL 和路径中的 `/` 不误触发。

### Phase 5：Slash Command 提交展开

目标：提交时把 slash command 转成 prompt content。

任务：

- 在提交链路中解析 `feedbackText`。
- 命中 prompt 的 command 生成 `## Slash Command: command` section。
- 从 agent-facing `## User Feedback` 中移除命中的 command token。
- message history 保存用户原始输入。
- PromptButtons 保持兼容。

验收：

- 输入 `/compact 请总结` 后提交，agent 收到 compact prompt content 与“请总结”。
- 文件链接仍原样保留。
- 未知 `/xxx` 不展开且保留原文。
- 多个命令按出现顺序展开。

### Phase 6：PromptButtons 过渡优化

目标：减少长期按钮堆积，同时不打断老用户。

任务：

- 设置中加入 PromptButtons 显示开关。
- 可选：当 prompt 数量超过阈值时默认折叠按钮。
- 可选：PromptButtons 点击行为改为“插入命令”而不是“立即提交”，但需明确迁移提示。

验收：

- prompt 数量多时 UI 不拥挤。
- 老入口仍可恢复。
- 设置项有中英文文案。

## 15. 关键文件影响范围

预计新增：

- `app/src/composer/composerTokens.ts`
- `app/src/composer/resourceLinks.ts`
- `app/src/composer/commandIds.ts`
- `app/src/components/ReadonlyComposerContent.tsx`
- `app/src/components/TokenizedTextarea.tsx`
- `app/src/components/SlashCommandMenu.tsx`
- `app/src/components/composer/ResourceLinkToken.tsx`
- `app/src/components/composer/SlashCommandToken.tsx`
- `app/src/components/composer/ColorToken.tsx`

预计修改：

- `app/src/components/FeedbackInput.tsx`：接入 tokenized textarea 和 slash menu。
- `app/src/components/CallerPanel.tsx`：提交时展开 slash commands。
- `app/src/components/MarkdownContent.tsx`：增强只读 markdown 的特殊 token 渲染。
- `app/src/components/CallerPanelParts.tsx`：抽出或缩减 `RichText` 的特殊 token 解析职责。
- `app/src/components/ProjectResourcePanel.tsx`：可选优化插入链接后的空格处理。
- `app/src/components/PromptButtons.tsx`：后续阶段做过渡调整。
- `app/src/store/feedbackStore.ts`：扩展 `PromptItem.command?`。
- `app/src-tauri/src/lib.rs`：可选解析 prompt front matter 中的 `command`。
- `app/src/index.css`：新增 tokenized textarea、command menu、token 背景样式。
- `app/src/i18n/locales/zh.json` 与 `app/src/i18n/locales/en.json`：新增设置和提示文案。

## 16. 样式设计建议

### 14.1 Token 颜色

建议区分两类 token：

- slash command：使用 primary 色系背景，代表主动指令。
- file link：使用 resource/file 色系背景，代表上下文引用。

示例：

```css
.composer-token-command {
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-primary) 18%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 38%, transparent);
}

.composer-token-file {
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-bg-elevated) 72%, transparent);
  box-shadow: inset 0 0 0 1px var(--color-border);
}
```

### 14.2 Menu 尺寸

候选框建议：

- 宽度 280 到 360 px。
- 最大高度 260 px。
- item 高度稳定。
- 超出滚动。
- 跟随当前 app theme。

### 14.3 不改变字符宽度

第一阶段 token 只增加背景，不替换显示文本，不插入图标到 overlay 文本流中。这样最大程度保证 textarea 光标与视觉文本对齐。

## 17. 可访问性与输入法

### 15.1 键盘访问

- slash menu item 使用 `role="option"`。
- menu 使用 `role="listbox"`。
- active item 使用 `aria-selected`。
- textarea 可通过 `aria-controls` 关联 menu。

### 15.2 IME 输入

需要处理 composition 事件：

- `compositionstart` 时暂停 slash query 替换。
- `compositionend` 后再重新计算候选。
- composition 期间 Enter 不应被 slash menu 截获。

### 15.3 Screen Reader

overlay 设置 `aria-hidden="true"`。

真实 textarea 保持原始可访问性。

候选项选中时可以通过 active descendant 或简单 focus 管理增强，但第一阶段不必过度复杂。

## 18. 风险与缓解

### 18.1 MarkdownContent 增强影响已有页面

风险：增强 `MarkdownContent` 时影响 SummaryPanel 或 MlcPreviewPanel。

缓解：

- 新增 `enableComposerTokens` 开关，默认 false。
- SummaryPanel 和 MlcPreviewPanel 不改调用参数。
- 只在只读 feedback 区开启新能力。

### 18.2 RichText 与 MarkdownContent 职责重叠

风险：继续同时维护两套特殊 token 渲染，规则漂移。

缓解：

- 把判断逻辑抽到 composer 纯逻辑模块。
- `RichText` 后续只用于 test log 等纯文本增强场景。
- feedback readonly 使用 `MarkdownContent`。

### 18.3 Test Log 被错误 Markdown 化

风险：日志中的符号被 markdown 误解析，破坏原始输出。

缓解：

- testLogText 保持 pre/log 展示。
- 不默认使用 `MarkdownContent` 渲染日志。

### 18.4 Overlay 错位

风险：overlay 文本与 textarea 真实文本在换行、滚动、字体上不完全一致。

缓解：

- token 第一阶段不改变文字内容，只加背景。
- 统一 CSS class，避免 inline style 分叉。
- 在 Windows 缩放、不同字体、长路径、中文文本下手测。

### 18.5 Slash Command 误触发

风险：URL、路径、markdown href 中的 `/` 被识别为命令。

缓解：

- `/` 前必须是文本开头、行首或 whitespace。
- markdown link range 先保护。
- URL range 先保护。

### 18.6 Prompt Name 不稳定

风险：用户重命名 prompt 后，历史中的 slash command 找不到。

缓解：

- 支持 `command` front matter。
- 文档中建议用户显式设置 `command`。
- 未命中 command 时原样保留，不阻断提交。

### 18.7 提交流程重复或混乱

风险：slash command 原文和展开 content 同时存在导致 agent 误读。

缓解：

- agent-facing User Feedback 移除已命中的 command token。
- 展开内容放入独立 section。
- 历史仍保存用户原始输入。

### 18.8 现有 PromptButtons 行为变化

风险：老用户习惯点击按钮立即提交。

缓解：

- 第一阶段不改变 PromptButtons。
- 后续再提供设置开关或迁移选项。

## 19. 测试与验收清单

### 19.1 Tokenizer 单元测试

- 识别 `[file.ts](E:/a/b/file.ts)`。
- 识别 `[My File.ts](E:/a/My%20File.ts)`。
- 识别 folder link `[src/](E:/a/src/)`。
- 不把 `[docs](https://example.com)` 当本地文件。
- 不把 markdown href 内的 `/abc` 当 slash command。
- 识别 `/compact`。
- 识别中文命令 `/创建摘要`。
- 不识别 `https://x/y` 中的 `/y`。
- 不识别 `abc/def`。

### 19.2 只读 Markdown 渲染手测

- 已提交反馈中的 `# 标题` 渲染为标题。
- `- item` 渲染为列表。
- `1. item` 渲染为有序列表。
- `- [ ] task` 渲染为 task list。
- markdown 表格正常显示。
- fenced code block 正常高亮并显示复制按钮。
- inline code 正常显示。
- blockquote 正常显示。
- `[file.ts](E:/path/file.ts)` 渲染为 resource token。
- `[docs](https://example.com)` 保持普通 web link。
- `/compact` 渲染为 command token。
- `#ff0000` 渲染为 color token。
- code block 内的 `/compact` 不渲染为 command token。

### 19.3 编辑态手测

- 从 Resources 面板插入文件链接，输入框立即显示背景高亮。
- 在链接前后继续输入，光标位置正确。
- 长路径换行后背景仍覆盖正确。
- 滚动输入框后背景同步。
- 粘贴图片仍生成图片附件。
- ArrowUp / ArrowDown 历史仍工作。
- queued draft 输入仍工作。

### 19.4 Slash Menu 手测

- 输入 `/` 打开候选。
- 输入 `/com` 过滤候选。
- ArrowDown / ArrowUp 切换高亮。
- Enter / Tab 插入命令。
- Escape 关闭候选。
- 鼠标点击插入命令。
- disabled prompt 不显示。
- URL 和路径不误触发。

### 19.5 提交手测

- 只有普通文本：提交不变。
- 只有文件链接：提交保留 markdown link。
- slash command + 普通文本：提交展开 prompt content。
- 多个 slash command：按顺序展开。
- unknown slash command：原样保留，不展开。
- PromptButtons 点击提交仍保持兼容。

## 20. 文档与用户提示

需要更新的文档：

- `README.md`
- `README_zh.md`
- `BUILD.md` 中关于 `mcp_prompts/` 的描述，若加入 `command` front matter。

需要说明：

- 如何创建 `.prompt.md`。
- `command` 字段的推荐写法。
- 如何用 `/` 调用 prompt。
- Resources 文件链接插入后的视觉高亮只是编辑辅助，提交仍是 markdown link。

示例 prompt：

```md
---
name: Compact
command: compact
description: Create a compact session summary
icon: archive
---

请创建一个完整、结构化、可供后续会话恢复上下文的摘要。
```

## 21. 推荐实施路线总结

推荐按以下顺序推进：

1. 先做共享 composer token / resource link 逻辑。
2. 增强 MarkdownContent，修复已提交反馈只读 markdown 渲染。
3. 再做编辑态文件链接高亮。
4. 然后做 slash command 菜单。
5. 最后做提交展开和 PromptButtons 过渡。

这个顺序的好处是：

- 先解决已提交反馈区域渲染不完整的问题，收益最大且风险相对低。
- 提前验证特殊 token 在 markdown 只读态下的设计。
- 再让编辑态 overlay 复用同一个 token 规则和样式。
- 让 slash command 复用同一个 token 渲染系统。
- 避免一开始就同时改输入、菜单、提交三条链路。
- 每个阶段都有清晰验收点，方便回退和定位问题。

最终目标是建立统一 Composer 内容系统：编辑态看起来支持结构化命令和文件引用，只读态完整支持 markdown 和特殊内容渲染，但底层仍保持纯文本、可复制、可提交、易调试。