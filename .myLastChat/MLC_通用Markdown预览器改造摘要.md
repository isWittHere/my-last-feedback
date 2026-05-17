---
title: 通用Markdown预览器改造摘要
description: 将 MLC 预览面板扩展为通用 md 预览器，支持资源面板/MLC列表点击预览，并优化 frontmatter 渲染与 header 布局
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
tags:
    - MlcPreviewPanel
    - frontmatter
    - resource-panel
    - markdown-preview
solved_lists:
    - 将 MlcPreviewPanel 改造为通用 md 预览器（支持 source=resource）
    - 资源面板点击 .md 文件触发预览
    - MLC 列表点击文档触发预览（已有，复用）
    - 顶部渲染 YAML frontmatter 原内容
    - 修复 useMemo 早返回前导致的 Hooks 顺序错误
    - frontmatter 改为原生 JSX <table> 渲染（去掉 Key/Value 表头，支持多行换行）
    - 去掉 YAML 列表项前导 "- "
    - frontmatter 表格改为仅上下边框 + 行间虚线分割
    - Header 布局重排：kicker + workspace + folder + time + actions 同行右对齐
---

# 通用Markdown预览器改造摘要

## 1. Previous Conversation

本轮对话的核心需求：把原本只服务于 `.myLastChat/MLC_*.md` 的预览面板（`MlcPreviewPanel`）改造成一个**通用 md 预览器**，让资源管理面板（`ProjectResourcePanel`）与 MLC 列表面板点击 md 文件都能在同一面板预览，并在顶部渲染 YAML frontmatter 原内容。

迭代过程：

1. 后端 `mlc_read_document` 增加 `frontmatterRaw` 返回字段。
2. 前端 `MlcPreviewPanel` 支持 `selectedDocument.source === "resource"` 分支：使用 file-text 图标 + 主题色 + 通用 "Markdown" 标签。
3. `ProjectResourcePanel` 点击 .md 文件时调用 `setSelectedMlcDocument` 并切换 dock 到预览 tab（之前点击是直接插入资源链接）。
4. 处理一系列 UI 细节反馈：
   - 修复 `Rendered more hooks than during the previous render`（useMemo 被放在早返回之后）。
   - frontmatter 用 GFM markdown 表格渲染时 `<br>` 不换行 → 改用原生 JSX `<table>`。
   - 去掉 Key/Value 表头行。
   - 去掉 YAML 列表项前导 `- `。
   - 表格改为仅顶/底实线 + 行间虚线。
   - Header 二行重排：kicker 移到 meta 行最左，三个 actions 按钮移到 meta 行最右。

## 2. Current Work

刚完成 Header 布局重排，进入打包前的状态：

- `MlcPreviewPanel.tsx` 的 JSX 中标题独占一行；下方 `.mlc-preview-meta` 一行内包含 `[kicker] [workspaceName] [folderName?] [time] ............ [actions]`。
- `index.css` 中：
  - `.mlc-preview-meta` 去掉 `overflow: hidden`（否则按钮被裁掉）
  - `.mlc-preview-meta .mlc-preview-actions { margin-left: auto; }` 推到右边
  - `.mlc-preview-meta .mlc-preview-kicker { flex-shrink: 0; margin-right: 2px; }`

下一步用户要求：先 `git` 备份，然后执行 `bash scripts/package-win.sh` 构建新的 win-x64 发行包。

## 3. Key Technical Concepts

- **Tauri 2.0 + React 19 + Zustand**：app/ 目录前端 + Rust 后端
- **Rules of Hooks**：所有 Hook 必须在早返回之前调用
- **react-markdown / GFM 表格限制**：表格必须有表头；单元格内 `<br>` 不会被解析为换行，需要 `rehype-raw` 或改用原生 JSX
- **YAML frontmatter 解析**：通过简单状态机解析顶层键、续行（缩进/dash 列表项）合并
- **dock 导航**：`setSelectedMlcDocument` + `openDockTab("mlc-preview")` 切换预览面板
- **包脚本**：`scripts/package-win.sh` 流程为 `tauri build --no-bundle` → 拷贝 mcp/ + package.json + 模板 + prompts → `npm install --omit=dev`

## 4. Relevant Files and Code

### app/src/components/MlcPreviewPanel.tsx
通用 md 预览器主体。已重写为干净版本：
- `parseFrontmatterRows(raw)` 解析 frontmatter 为 `{key, value}[]`，多行字段用 `\n` 拼接，去除每行前导空白与 `- `。
- 所有 Hook（包括 `frontmatterRows = useMemo(...)`）放在早返回之前。
- 渲染原生 `<table className="mlc-preview-frontmatter-table">`，每行 `<th scope="row">key</th><td>...</td>`，td 内按 `\n` split 后插入 `<br />`。
- Header JSX：
  ```tsx
  <div className="mlc-preview-meta" title={displayedPath}>
    <div className="mlc-preview-kicker">…</div>
    <span>{selectedDocument.workspaceName}</span>
    {selectedDocument.folderName ? <span>{selectedDocument.folderName}</span> : null}
    <span>{formatTime(...)}</span>
    <div className="mlc-preview-actions">…3 buttons…</div>
  </div>
  ```

### app/src/index.css
- `.mlc-preview-frontmatter-table`：`border-top` + `border-bottom` 实线，单元格 `border-bottom: 1px dashed`，左列 `th` 加粗 + 不换行，右列 `td` `word-break: break-word`。
- `.mlc-preview-meta`：去掉 `overflow: hidden`；增加 `.mlc-preview-actions { margin-left: auto }` 与 `.mlc-preview-kicker { flex-shrink: 0; margin-right: 2px }`。

### app/src/components/ProjectResourcePanel.tsx
点击 `.md` 文件时调用 `setSelectedMlcDocument({ source: "resource", … })` 并 `openDockTab("mlc-preview")`。

### app/src-tauri/src/...（mlc_read_document）
返回值新增 `frontmatterRaw` 字段，供前端原样渲染。

## 5. Problem Solving

- **Hooks 顺序错误**：`useMemo(frontmatterTableMd)` 原本被放在 `if (!selectedDocument) return ...` 之后，导致首屏 vs 后续渲染 Hook 数量不同。已把所有 useMemo 提前。
- **`<br>` 在 react-markdown 表格中不换行**：放弃 markdown 路径，改原生 JSX `<table>`。
- **多余 `void escapeTableCell;` 行污染文件**：清理时多次错误叠加，最终选择 `rm` 后 `create_file` 全量重写。
- **按钮被 meta 行 overflow:hidden 裁切**：移除 `.mlc-preview-meta` 的 `overflow: hidden`，配合 `flex-shrink: 0` 与 `margin-left: auto`。

## 6. Pending Tasks and Next Steps

用户最新指令（原文）：

> /compact 之后 /bulid-new-release
> 请你先git备份，然后构建新的发行包。

- 待执行任务：
  1. 当前文件保存（本摘要）
  2. `git add -A`（注意 `ref-repos/` 已被 .gitignore / 规则排除）→ commit
  3. `bash scripts/package-win.sh`
  4. 在 `dist/win-x64` 内打 zip：`tar -acf my-last-feedback-win-x64.zip my-last-feedback/`
  5. 回报构建产物路径与大小
