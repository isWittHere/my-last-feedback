---
title: Git面板hover与compact行高排查续接摘要
description: 记录Git面板hover触发与compact行高排查进展
workplace: ${workspaceFolder}
project: my-last-feedback
type: debug
solved_lists:
  - tooltip触发范围收敛到文本区域
  - 第二行meta文本纳入tooltip触发文本范围
  - 首项连线特例仅保留最近时间组
---

# Git面板hover与compact行高排查续接摘要

## 1. Previous Conversation
本轮从你对 Git 面板异常的观察开始，先是 diff 展示偶发不一致，随后你明确撤销前一根因方向，并改为聚焦 commit 项 hover 详情触发条件。你连续给出更严格边界：
- hover 在附件按钮上不应弹出详情
- 点击附件按钮也不应触发 hover 详情
- 只有 hover 在文本上才显示详情
- 第二行文本也属于“文本”
- 除最近时间组外，其它时间组首项不应套用 compact 首项连线特例

在完成这些后，你继续反馈 compact 下被缩略成单行的项整体仍偏高，要求继续分析根因。

## 2. Current Work
最近完成的工作集中在两条线：
- 触发范围修正：tooltip 从整行 header 下沉到文本容器，附件按钮与其它非文本区域不再触发。
- 时间组连线修正：首项 `::after` 特例仅作用于最近时间组。

在行高问题上，已进行两轮排查：
- 第一轮怀疑 message 与 meta 隐藏后的间距残留；你反馈不是该原因。
- 第二轮调整 compact 项附件容器高度（`.git-commit-attach`），作为新的根因验证方向。

## 3. Key Technical Concepts
- React 事件绑定粒度控制（header vs info 文本容器）
- CSS 选择器作用域收敛（通过 `.git-commit-group-latest` 精确限定）
- compact 视觉密度由 `padding/line-height/child-height` 共同决定
- Git 面板结构：`git-commit-item`、`git-commit-header`、`git-commit-info`、`git-commit-attach`

## 4. Relevant Files and Code
### app/src/components/GitPanel.tsx
- 将 `tooltipProps(commit)` 从 `git-commit-header` 移除。
- 将 `tooltipProps(commit)` 绑定到 `git-commit-info`，覆盖 message + meta 两行文本。
- 分组渲染增加 `groupIndex`，首组增加 `git-commit-group-latest` class。

关键片段：
```tsx
<section
  key={label}
  className={`git-commit-group${groupIndex === 0 ? " git-commit-group-latest" : ""}`}
>
```

```tsx
<div className="git-commit-info" {...tooltipProps(commit)}>
  <div className="git-commit-message truncate">...</div>
  <div className="git-commit-meta ...">...</div>
</div>
```

### app/src/index.css
- 连线特例作用域收敛：
```css
.git-commit-group-latest .git-commit-group-items .git-commit-item:first-child::after { top: 30px; }
.git-commit-group-latest .git-commit-group-items .git-commit-item.git-commit-item-compact:first-child::after { top: 28px; }
```
- compact 行高新方向试修：
```css
.git-commit-item.git-commit-item-compact .git-commit-attach { height: 16px; }
```

## 5. Problem Solving
已解决问题：
- 附件按钮 hover/click 触发详情的问题。
- 第二行文本是否计入“文本触发区”的边界问题。
- 非最近时间组首项误套用连线特例的问题。

仍在排查：
- compact 单行项视觉高度仍偏高是否已被完整修复，需要你最新视觉确认。

## 6. Pending Tasks and Next Steps
- 继续按最小改动策略定位 compact 行高：依次验证 `git-commit-header` 的 `padding-top/padding-bottom`、`git-commit-message line-height`、`git-commit-dot` 尺寸、`git-commit-attach` 高度对最终行盒的贡献。
- 仅在你确认观察结果后再落下一步样式调整，避免偏离你指定根因。

最近任务原话（verbatim）：
- “被缩略的项明明已经没第二行，但是它的整体行高还是太高”
- “我认为不是这个原因”
