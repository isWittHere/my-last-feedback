---
title: Markdown渲染能力说明
description: 记录MLFB共享Markdown渲染器当前支持的数学公式与Mermaid图表能力，以及暂缓HTML和上下标扩展的原因
workplace: ${workspaceFolder}
project: my-last-feedback
type: knowledge
tags:
  - markdown
  - renderer
  - mermaid
  - math
solved_lists:
  - 为共享Markdown渲染器启用数学公式渲染
  - 为Mermaid fenced code block启用图表渲染
  - 保持raw HTML和非GFM上下标语法暂缓
---

# Markdown渲染能力说明

## 1. 范围

共享渲染入口是 `app/src/components/MarkdownContent.tsx`。

它被以下界面复用：

- 提交反馈只读视图
- MLC 预览
- Agent 聊天结果
- Agent 过程详情

## 2. 已启用能力

### 2.1 GFM

通过 `remark-gfm` 启用 GitHub Flavored Markdown。

### 2.2 软换行

通过 `remark-breaks` 保留常见聊天文本换行体验。

### 2.3 数学公式

通过 `remark-math` 与 `rehype-katex` 渲染数学公式。

示例：

```md
Inline math: $\mu$ and $\sigma$.

$$
f(x) = \frac{1}{\sigma\sqrt{2\pi}} e^{-\frac{1}{2}\left(\frac{x-\mu}{\sigma}\right)^2}
$$
```

### 2.4 Mermaid图表

`mermaid` 与 `mmd` fenced code block 会被渲染为图表。

示例：

````md
```mermaid
graph TD
  A --> B
```
````

Mermaid runtime 使用动态加载，仅在实际出现图表时加载。

## 3. 暂缓能力

### 3.1 Raw HTML

Raw HTML 继续保持禁用。

原因：

- 需要 `rehype-raw` 才能解析。
- 安全支持还需要维护 `rehype-sanitize` schema。
- Agent 或用户输入中的任意 HTML 会带来安全与布局风险。
- 当前收益不足以覆盖复杂度。

### 3.2 下标与上标扩展语法

GFM 不定义 `H~2~O` 或 `2^10^` 语法。

原因：

- 需要额外插件或自定义转换。
- 容易误伤普通文本。
- 当前可以用数学公式更明确表达。

建议写法：

```md
$H_2O$
$2^{10}$
```