---
title: MLFB OpenCode权限预设与request_type五类型发行摘要
description: OpenCode权限预设、设置UI、request_type五类型与0.6.0发布续接
workplace: ${workspaceFolder}
project: my-last-feedback
type: coding
tags:
  - MLFB
  - OpenCode
  - request_type
  - release
solved_lists:
  - 分析OpenCode权限规则与bash命令细粒度控制
  - 实现默认、可控自动、超控自动三档权限预设
  - 新增bash override权限等级并映射到OpenCode规则
  - 调整设置页与会话权限面板的预设按钮和颜色状态
  - 修复MLFB/MLRA切换器样式并移除hover title提示
  - 将interactive_feedback request_type收敛为五种类型
  - 清理prompt与README中的旧request_type说明
---

# MLFB OpenCode权限预设与request_type五类型发行摘要

## 1. Previous Conversation

本轮会话先围绕 OpenCode 权限系统展开。用户要求在会话权限管理面板和设置页面增加预设配置，并明确要求参考 `ref-repos/opencode-1.14.33/` 分析 OpenCode 对命令执行的细粒度权限控制。分析发现 OpenCode 原生 permission rule 是 `{ permission, pattern, action }`，`action` 仅支持 `allow | ask | deny`，规则匹配使用最后匹配优先。OpenCode bash 工具通过 tree-sitter 解析 Bash/PowerShell 命令，提取完整命令 pattern 与 `cmd *` 形式的 prefix pattern，并对外部目录路径额外触发 `external_directory` 权限。

随后用户将预设要求调整为“默认 / 可控自动 / 超控自动”，并要求按钮使用与常规设置选项统一的样式、从右到左排列。最终实现方向是：MLFB UI 层自定义 `override`，但 OpenCode 原生仍通过规则列表表达。默认模式偏保守，可控自动允许常规编辑、命令、网页、技能但对危险命令询问，超控自动允许常规删除等非极端危险操作，只对极端危险命令询问。

中段会话集中在设置页与会话权限弹窗的 UI polish。包括权限预设按钮宽度、颜色、排列方向，顶部盾牌按钮随当前 session 权限 tone 变色，override 紫色 active 状态，以及设置页 OpenCode 默认权限预设移动到标题行右侧。期间出现一次错误的大范围 CSS 改动：我误把长文本 segmented control 的问题理解为需要让卡片横跨整行，用户明确要求撤销。之后改为局部分析 flex 收缩根因，并根据用户建议调整卡片列宽，但又发现硬最小宽度会导致窗口溢出，最终回到更保守的局部修复思路。

后段会话转入 MLFB 顶部 `MLFB / MLRA` 切换器。用户指出我把方向搞反：需求是让 MLFB 切换器改成和设置选项一样，而不是让设置选项模仿切换器。之后已将 `.app-view-toggle` 和 `.app-view-toggle-btn` 改成设置页 segmented control 的视觉语言，并修正 active hover 权重差异。用户又要求移除 hover tip，已删除两个切换按钮的原生 `title` 属性。

最新主线是 interactive-feedback 的 `request_type` 收敛。用户要求将 request_type 减少为 5 种：`analysis`、`completion`、`planning`、`document`、`default`，并指定色卡顺延：analysis 使用原紫色卡，completion 使用原青色卡，planning 使用原粉色卡，document 使用原 `document_completed` 色卡，default 使用原灰色卡。用户还要求不做历史兼容，非这些类型直接视为 `default`，并修改 `dist/prompt.instructions.md`。实现后用户指出提示词里还有残留，随后继续清理了打包目录 prompt 和 README 中的旧说明。

## 2. Current Work

当前工作是用户重新确认继续执行原先被暂停的任务：

> 好的，根据历史所有对话过程生成性的会话摘要 /compact 。现在升级到0.6.0，并构建新发布包

在此之前已经发生的重要状态：

- 已通过 interactive feedback 暂停过一次摘要、升级、构建流程，等待用户新需求。
- 已完成 request_type 五类型收敛与提示文档清理。
- 已按 `/compact` 规则查询 MyLastChat 历史摘要，发现多个相关但没有一个同时覆盖本轮 OpenCode 权限预设、设置 UI、request_type 五类型收敛和 0.6.0 发布任务的高度相关摘要，因此创建了当前新摘要文件。
- 之前根据定时提醒做过一次备份提交：`b5d54cb chore: backup before 0.6.0 release`，排除了 `ref-repos/`。
- 需要继续完成版本升级到 `0.6.0` 与构建新发布包。

## 3. Key Technical Concepts

- OpenCode permission rule：`{ permission, pattern, action }`。
- OpenCode 原生 action：`allow | ask | deny`，没有 `override`。
- OpenCode 规则匹配是最后匹配优先，因此预设 rule 顺序很重要。
- OpenCode bash tool 会解析 shell AST，提取完整命令与 prefix wildcard pattern。
- `cmd *` 尾部 wildcard 可匹配 `cmd` 和 `cmd args`。
- MLFB `override` 是 UI 语义，通过生成 OpenCode permission rules 实现。
- `SettingsSegmentedControl` 是通用设置页 segmented 控件，支持 `default | allow | override | ask | deny | danger` variant。
- request_type 现在只保留 `analysis | completion | planning | document | default`。
- request_type 不再做旧类型兼容映射；旧值如 `explanation`、`question`、`analysis_report`、`document_completed`、`verification_completed` 会被归一化为 `default`。
- session topbar 色卡由 `Sidebar.tsx` 的 `getTopbarStatsColor` 与 `.session-topbar-type-*` CSS 共同控制。
- 项目版本升级需要同步 `package.json`、`app/package.json`、`app/src-tauri/Cargo.toml`。
- 发布包脚本位于 `scripts/`，Windows 构建通常使用 `scripts/package-win.sh` 或 package scripts。
- `ref-repos/` 是参考仓库，git 操作必须排除，不能提交。

## 4. Relevant Files and Code

### `mcp/mlfb/tools/interactive-feedback.mjs`

- MCP tool schema 与说明来源。
- `REQUEST_TYPE_VALUES` 已从 8 种旧类型收敛为 5 种：

```js
const REQUEST_TYPE_VALUES = [
  "analysis",
  "completion",
  "planning",
  "document",
  "default",
];
```

- `request_type` schema 改为 `z.string()`，handler 使用 `normalizeRequestType`，未知值返回 `default`，避免 zod enum 在进入 handler 前拒绝旧值。

### `mcp/mlfb/app-ipc.mjs`

- MCP 到 Tauri app 的 IPC payload 出口。
- 已同步五类型集合，并将非集合值归一化为 `default`。

```js
function normalizeRequestType(requestType) {
  if (typeof requestType === "string" && REQUEST_TYPE_VALUES.has(requestType)) return requestType;
  return "default";
}
```

### `app/src/store/feedbackStore.ts`

- 前端 session request type 类型源。
- `REQUEST_TYPES` 现在只包含五种新类型；历史旧值加载后进入 `default`。

### `app/src/components/Sidebar.tsx`

- request type 显示标签与 topbar 色卡映射。
- 当前映射：
  - `analysis` -> `var(--stats-nav-tertiary)`，原紫色卡。
  - `completion` -> `var(--stats-nav-primary)`，原青色卡。
  - `planning` -> `var(--stats-nav-secondary)`，原粉色卡。
  - `document` -> `var(--stats-nav-document)`，原文档色卡。
  - `default` -> `var(--stats-nav-neutral)`，原灰色卡。

### `app/src/index.css`

- session topbar 文档类条纹色卡选择器已切换到新类型：

```css
.session-topbar-type-document:not(.session-topbar-item-pending):not(.session-topbar-item-cancelled) {
  background-color: var(--session-topbar-card-bg, var(--stats-nav-document));
  background-image: repeating-linear-gradient(...);
}
```

- MLFB/MLRA 顶部切换器已改为设置页 segmented 风格，并移除 title hover tip 对应的 JSX 属性。

### `app/src/components/FeedbackApp.tsx`

- 顶部 `MLFB / MLRA` 切换按钮已移除 `title={...}`，避免原生 hover tip。

### `app/src/i18n/locales/zh.json` 与 `app/src/i18n/locales/en.json`

- `sidebar.requestType` 只保留五种新标签：`analysis`、`planning`、`completion`、`document`、`default`。

### `dist/prompt.instructions.md`

- 根部 dist prompt 已更新为五类型说明。
- 明确写入：非列表值视为 `default`，旧类型名不做兼容映射。

### `dist/win-x64/my-last-feedback/prompt.instructions.md`

- 打包目录中的 prompt 副本也已清理旧 request_type 枚举。

### `README.md` 与 `README_zh.md`

- 工具说明中的 request_type 残留已清理。
- 参数类型说明从旧 `enum` 改为 `string`，并说明其他值视为 `default`。

### `app/src/openCodeSettings.ts`

- 权限预设与 rule 转换核心。
- 关键类型包括 `OpenCodePermissionSettingAction = OpenCodePermissionAction | "override"` 与 `OpenCodePermissionPresetId = "default" | "controlledAuto" | "overrideAuto"`。
- 包含 bash 风险 pattern、preset rules、`openCodePermissionActionToRules`、`getOpenCodePermissionPresetId` 等逻辑。

### `app/src/components/SettingsDialog.tsx`

- 设置页 OpenCode 权限预设、默认权限动作、Agent approval settings 等 UI。
- 用户曾撤销过我对该文件的某些错误改动，继续修改前必须重新读取当前内容。

### `app/src/components/agent/AgentPermissionIndicator.tsx`

- 会话顶栏权限盾牌按钮和弹窗。
- 使用当前 session rules 推导 `permissionTone`，并显示 preset segmented control。

### `app/src/store/agentStore.ts`

- OpenCode session permission update 与 preset application 的 store 层。
- 使用 `openCodePermissionActionToRules` 和 `getOpenCodePermissionPresetRules`。

## 5. Problem Solving

- 分析 OpenCode bash 权限根因：不是单一命令开关，而是 pattern rule 列表与 AST 提取结合。
- 解决 `override` 语义落地：不改 OpenCode 原生 action，而是在 MLFB 侧生成不同风险层级的 allow/ask rules。
- 解决 session permission merge 后 preset 检测问题：因为 OpenCode HTTP update 是 merge rules，所以 preset active 检测需要容忍 tail match。
- 处理设置页 segmented control 挤压问题过程中出现过误判：错误地改为卡片横跨整行，用户要求撤销。后续定位到 flex 收缩与列宽/控件宽度的局部问题。
- 纠正 MLFB/MLRA 切换器样式方向：最终是 `app-view-toggle` 模仿设置页 segmented control，而不是反过来。
- 修复 active hover 权重问题：`.app-view-toggle-btn:hover` 权重高于 `.app-view-toggle-active`，需改成 `.app-view-toggle-btn.app-view-toggle-active`。
- 收敛 request_type：MCP schema 从 enum 改成 string + normalize，以满足“未知直接 default”的要求。
- 清理提示词残留：最初只改了根部 dist prompt，后续补充清理打包目录 prompt 和 README 文档。
- 诊断结果：相关 JS/TS/TSX/JSON/Markdown 文件无错误；CSS 只有项目既有 `@theme` unknown at-rule 提示。

## 6. Pending Tasks and Next Steps

- 继续完成用户最新明确任务：

> 好的，根据历史所有对话过程生成性的会话摘要 /compact 。现在升级到0.6.0，并构建新发布包

- 已完成本摘要创建。下一步需要升级版本：
  - 检查并修改 `package.json`。
  - 检查并修改 `app/package.json`。
  - 检查并修改 `app/src-tauri/Cargo.toml`。
  - 如存在 lockfile 或版本引用，按现有仓库模式处理。

- 版本升级后执行构建发布包：
  - 先读取 `package.json`、`app/package.json`、`BUILD.md`、`scripts/package-win.sh`，确认正确命令。
  - 按仓库指南优先使用既有脚本构建 Windows 发布包。
  - 构建前后避免纳入 `ref-repos/`。

- 构建完成后需要汇报：
  - 摘要文件已创建还是更新，以及路径。
  - 版本升级涉及文件。
  - 构建命令与结果。
  - 生成的发布包路径。

- 完成前必须再次调用 `interactive_feedback`，使用 `agent_name="B70F"`。
