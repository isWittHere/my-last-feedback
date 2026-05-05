---
title: MLFB 输入框 Placeholder 与 Caller 列数图标化修复规划书
description: 规划 Caller 列数截断、输入框空白占位、中文输入法 composition 问题的统一修复
tags:
  - MLFB
  - UI
  - composer
  - IME
  - settings
project: my-last-feedback
type: planning
workplace: ${workspaceFolder}
solved_lists:
  - 分析 Caller 列数设置项截断根因
  - 分析 Composer 空白时 placeholder 不显示根因
  - 分析中文输入法拼音跟随 placeholder 根因
  - 制定统一修复与验证方案
---

# MLFB 输入框 Placeholder 与 Caller 列数图标化修复规划书

最后更新：2026-05-05

## 1. 背景

本规划记录三个新发现的 UI / 输入体验问题，并制定统一修复方案：

1. `设置 > MLFB > Caller 管理` 中，`Caller 列数` 设置项右侧的 `自动 / 1 / 2 / 3` 选项显示被截断。
2. 反馈输入框中，有时内容视觉上已经为空，但 placeholder 不显示。
3. 中文输入法下，未决定的拼音 composition 文本会跟在 placeholder 提示文本之后，直到中文提交后 placeholder 才消失。

这三个问题虽然表现不同，但其中第 2 和第 3 个都来自 `ComposerEditor` 当前 placeholder 实现方式不够稳健，需要一起处理。

## 2. 问题一：Caller 列数选项被截断

### 2.1 现象

截图表现为：

- `自动` 显示完整。
- `1` 显示完整。
- `2 / 3` 被右侧边界截断或挤出。

### 2.2 当前实现

`CallerManager.tsx` 中使用通用设置按钮组：

```tsx
<div className="settings-btn-group">
  {callerColumnModes.map((mode) => (
    <button className="settings-btn-option">
      {mode === "auto" ? t("callerManager.callerColumnsAuto") : mode}
    </button>
  ))}
</div>
```

相关 CSS：

```css
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.settings-btn-option {
  padding: 4px 12px;
  white-space: nowrap;
}

.cm-col-settings {
  width: 330px;
  flex: 0 0 330px;
  padding: 14px 16px;
}
```

### 2.3 根因

`settings-btn-group` 适用于空间较充足、选项较少或文字较短的设置行。

`Caller 管理` 左侧设置列只有 330px，且该行左侧说明文案较长，右侧四个选项使用文本和较大 padding 后自然会溢出。

这是控件形态与容器宽度不匹配，而不是单纯 CSS bug。

### 2.4 修复目标

- 四个选项在窄列中完整显示。
- 保留 `自动 / 1 / 2 / 3` 的语义。
- 保持点击后与标题栏列数按钮同步。
- 不影响其他 `.settings-btn-group` 使用场景。

### 2.5 推荐方案

为 Caller 列数新增专用紧凑图标 segmented control。

建议：

- 自动：显示一个带 `A` 的小布局图标。
- 1：显示 1 栏布局图标。
- 2：显示 2 栏布局图标。
- 3：显示 3 栏布局图标。

按钮固定尺寸，例如：

```css
.cm-column-mode-button {
  width: 30px;
  height: 28px;
  padding: 0;
}
```

用 `title` 和 `aria-label` 提供完整说明：

- 自动
- 1 列
- 2 列
- 3 列

## 3. 问题二：输入框为空但 placeholder 不显示

### 3.1 当前实现

`ComposerEditor` 是 contenteditable。当前 placeholder 通过伪元素实现：

```tsx
data-empty={value.length === 0 ? "true" : undefined}
data-placeholder={placeholder || undefined}
```

```css
.composer-editor[data-empty="true"]::before {
  content: attr(data-placeholder);
  color: var(--color-text-muted);
  pointer-events: none;
  white-space: pre-wrap;
}
```

### 3.2 根因

placeholder 显示完全依赖：

```ts
value.length === 0
```

但 contenteditable 删除到空时，内部 value 可能不是真正空字符串。需要区分两类情况：用户主动输入的空格应算作输入；浏览器为维持 contenteditable 光标产生的结构性空内容应算作空。

结构性空内容可能是：

- `"\n"`
- `"\n\n"`
- 浏览器残留 `<br>` 被 `serializeRoot()` 序列化成 `"\n"`

当前 `serializeRoot()` 会把 `<br>` 变成换行：

```ts
if (node.tagName === "BR") return "\n";
```

因此视觉上已经空，但 `value.length !== 0`，`data-empty` 不出现，placeholder 隐藏。

### 3.3 修复目标

- 用户输入的空格应视为正在输入，并立即隐藏 placeholder。
- 孤立 `<br>` 或删除后遗留的结构性换行残留应视为空。
- 输入框视觉为空时 placeholder 稳定显示。
- 有真实文本时，前后空格和换行不被误删。
- queued draft 的自定义 placeholder overlay 也受益。

### 3.4 推荐方案

新增两个 helper：

```ts
function isBlankComposerValue(value: string): boolean {
  return value.replace(/\u00a0/g, " ").replace(/\r?\n/g, "").length === 0;
}

function normalizeBlankComposerValue(value: string): string {
  const normalizedValue = value.replace(/\u00a0/g, " ");
  return isBlankComposerValue(normalizedValue) ? "" : normalizedValue;
}
```

处理规则：

- `" "` -> 保持原样，用于隐藏 placeholder
- `"\n"` -> `""`
- `"\n\n"` -> `""`
- `"\u00a0"` -> 规范为空格并保持，用于隐藏 placeholder
- `"hello\n"` -> 保持原样
- `"  hello  "` -> 保持原样

在 `commitValue()`、`handleInput()`、`syncValue()` 等入口使用该规范化逻辑，保证纯空白状态不会继续存进 store。

## 4. 问题三：中文输入法拼音跟在 placeholder 后面

### 4.1 现象

使用中文输入法时，输入未决定拼音，例如 `nihao`，拼音会显示在提示信息文本后面。

只有当中文真正提交后，placeholder 才消失。

### 4.2 根因

中文输入法有 composition 阶段：

- 拼音正在编辑但尚未提交。
- React value 仍然可能为空。
- `data-empty="true"` 仍然存在。
- `::before` placeholder 仍在 contenteditable 内部显示。
- 浏览器 IME 预编辑文本也在 contenteditable 内部显示。

因为 placeholder 是 `::before` 伪内容，它参与 contenteditable 的排版，所以 IME 预编辑文本会跟在 placeholder 后面。

这不是输入法 bug，而是 contenteditable placeholder 实现方式的问题。

### 4.3 修复目标

- 中文输入法 composition 开始时，placeholder 立即隐藏。
- 未决定拼音出现在输入框起始位置，而不是提示文本后面。
- composition 取消后，如果内容仍为空，placeholder 恢复。
- composition 完成后，中文正常写入。

### 4.4 推荐方案

不要再使用 contenteditable 内部 `::before` 作为 placeholder。

改为外层 overlay：

```tsx
<div className="composer-editor-root">
  {showPlaceholder ? (
    <div className="composer-editor-placeholder">...</div>
  ) : null}
  <div contentEditable className="composer-editor" />
</div>
```

新增 `isComposing` state：

```ts
const [isComposing, setIsComposing] = useState(false);
```

显示条件：

```ts
const showPlaceholder = !!placeholder && isBlankComposerValue(value) && !isComposing;
```

其中 `isBlankComposerValue()` 只把结构性空内容视为空；用户输入空格时 placeholder 应立即消失。

composition handlers：

```tsx
onCompositionStart={() => {
  composingRef.current = true;
  setIsComposing(true);
}}

onCompositionEnd={() => {
  composingRef.current = false;
  setIsComposing(false);
  handleInput();
}}
```

CSS：

```css
.composer-editor-placeholder {
  position: absolute;
  pointer-events: none;
  color: var(--color-text-muted);
  white-space: pre-wrap;
}
```

## 5. 统一实施方案

### 5.1 修改 `CallerManager.tsx`

- 添加 `renderCallerColumnModeIcon()`。
- `callerColumnModes` 按当前数据继续使用。
- 每个按钮使用图标而不是文字。
- 保留 `title` 和 `aria-label`。
- 使用专用 class，不污染通用 settings button。

### 5.2 修改 `index.css`

新增：

- `.cm-column-mode-group`
- `.cm-column-mode-button`
- `.cm-column-mode-icon`
- `.composer-editor-placeholder`

移除或停用：

- `.composer-editor[data-empty="true"]::before`

### 5.3 修改 `ComposerEditor.tsx`

新增：

- `isBlankComposerValue()`
- `normalizeBlankComposerValue()`
- `isComposing` state
- overlay placeholder 渲染

调整：

- `commitValue()` 写入前规范化纯空白。
- `handleInput()` 从 DOM 序列化后规范化。
- `syncValue()` 外部同步时规范化。
- `data-empty` 仅保留调试用途或移除。
- `data-placeholder` 不再需要。

## 6. 验证计划

### 6.1 Caller 列数

- `Caller 列数` 四个选项完整显示。
- 中文界面不截断。
- 英文界面不截断。
- 点击自动 / 1 / 2 / 3 后状态正确保存。
- 标题栏列数按钮同步变化。
- 刷新后设置保持。

### 6.2 Placeholder 空白判断

- 输入内容后逐字删除，placeholder 出现。
- Ctrl+A 后 Backspace，placeholder 出现。
- 输入空格后删除，placeholder 出现。
- 输入纯空格，placeholder 消失，表示用户正在输入。
- 输入纯换行，placeholder 出现。
- 输入 `  hello  `，内容保持，不被 trim。
- queued draft 输入框同样稳定显示 placeholder。

### 6.3 中文输入法

- 中文输入法输入拼音时，拼音从输入框起始位置显示。
- 拼音不会跟在提示文本后。
- composition 取消后 placeholder 恢复。
- composition 提交后中文正常显示。
- 中文输入过程中 slash menu 不异常弹出。

### 6.4 回归验证

- `get_errors` 检查相关文件。
- `npm run build`。
- `git diff --check`。

## 7. 风险与应对

### 7.1 Overlay placeholder 与 padding 对齐

风险：overlay placeholder 位置和编辑文本起点不一致。

应对：让 overlay 使用与 editor 相同的 padding 或通过 CSS 变量统一。

### 7.2 contenteditable 选择恢复

风险：normalize 空白后 selection 可能指向旧 offset。

应对：纯空白规范化为空时，selection clamp 到 0。

### 7.3 输入法事件顺序

风险：不同输入法 composition event 顺序略有差异。

应对：compositionStart 立即隐藏 placeholder；compositionEnd 后执行 `handleInput()` 同步最终 DOM。

### 7.4 样式污染

风险：修改 `.settings-btn-option` 会影响其他设置页。

应对：Caller 列数使用专用 class，不改通用按钮。

## 8. 推荐结论

这三个问题应作为一组修复：

- Caller 列数用专用图标控件解决窄列布局问题。
- Composer 统一处理“视觉空白”与纯空白规范化。
- Placeholder 从 contenteditable 伪元素迁移为 overlay，并在 IME composition 阶段隐藏。

这样能同时修复截图中的截断、输入框空白占位不稳定，以及中文输入法拼音跟在提示文本后的问题。