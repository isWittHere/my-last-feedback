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
  - 修复diff标记、todo清空与重复todo面板
  - 收敛OpenCode会话运行中权限切换语义
  - 完成新session权限面板、My Last Code品牌与会话导航跳转
  - 移除agent可用的default request_type并保留前端旧default色卡展示
  - 追加0.6.1发布前会话摘要
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

---

## 2026-05-09 追加：0.6.1发布前会话摘要

## 1. Previous Conversation

本轮会话从继续 0.6.0 发布任务开始。用户最先指出顶部 diff 标记样式受损，并要求继续之前的任务。随后用户发现 todo 清空动作在当前 UI 中不可见，要求参考 `ref-repos/opencode-1.14.33/` 的 desktop 版本分析 session diff 信息获取和 todo 清除机制。实际处理过程中，先修复了顶部 diff 指示器文字/颜色样式，再修复了空 todo 列表不显示、清空后仍回退到旧任务面板的问题。

之后用户集中反馈 OpenCode Agent 权限体验：新建会话没有权限按钮、session 内切换权限不生效、权限每次回到默认、todo step 面板重复、运行中权限切换时有时单向生效甚至偶发闪退。通过多次阅读 OpenCode 1.14.33 源码，确认 OpenCode 权限规则是 `{ permission, pattern, action }`，`action` 为 `allow | ask | deny`，规则最后匹配优先；同时 OpenCode 在 prompt run 内会读取 session permission 快照，且 `reply: "always"` 会写入 `approved` cache，后续优先级高于 session rules。这解释了“从默认到自动偶尔生效，但从自动回默认不生效”的单向现象。

基于这个结论，产品语义收敛为：不修改 OpenCode，不再宣称同一次 prompt run 内可以可靠热切换权限。MLFB 在 prompt 运行期间禁用权限面板按钮，并移除“切换后自动处理第一个 pending approval”的补救逻辑。新 session 的权限不再继承上一 session，而是使用设置页的默认权限配置；已存在 session 则保持自己的规则。

后续 UI 迭代包括：prompt 运行时权限盾牌按钮背景添加斜纹，运行提示只在 prompt 进行时显示；新 session 首页中央显示权限配置面板；移除“恢复默认权限”按钮；中央权限面板去掉边框和阴影；“会话权限”标题行右侧添加“更多/收起”折叠按钮，standalone 首页默认折叠，顶栏 popover 默认展开；新 session 页加入 MLFB Logo 与 `My Last Code` 品牌；未创建 provider session 前，顶栏 caller 初始名也改为 `My Last Code`；会话管理面板在选中/新建 session 时自动打开 Agent Console。

最新阶段用户要求移除 `default` 类型的 agent-facing `request_type`，并特别点名处理 `dist/prompt.instructions.md`，同时提示解释说明、分析结果都可归为 `analysis`。最初我将未知/旧值如何处理的内部策略写进了 prompt/tool 描述，用户指出这会把 MLFB 的实现策略暴露给 agent。最终修正为：对 agent 公开的契约只列出四类 `analysis`、`completion`、`planning`、`document`，并只给出“解释说明、调查细节、分析结果、报告应使用 `analysis`”这样的分类建议，不再公开内部兼容策略。前端 UI 则保留旧 `default` 展示态和原本中性色卡，仅用于历史/异常数据展示，不作为 agent 可选项。

## 2. Current Work

用户最新明确请求是：

> 好的，根据历史所有对话过程生成性的会话摘要 /compact 。现在升级到0.6.1，并构建新发布包

当前正在执行 `/compact` 阶段。已按规则先查询 MyLastChat 历史摘要：`myLastChat_getLastChatsList`、`myLastChat_searchByTitle`、`myLastChat_searchByMeta` 均已调用。搜索结果中发现现有文件 `.myLastChat/MLC_MLFB OpenCode权限预设与request_type五类型发行摘要.md` 与本轮任务高度相关，因此选择更新该文件，而不是创建新文件。

本段追加摘要用于覆盖从 diff/todo 修复、OpenCode 权限语义收敛、新 session 权限 UI、My Last Code 品牌、request_type 四类型外部契约，到当前准备升级 `0.6.1` 并构建发布包的完整上下文。

## 3. Key Technical Concepts

- Tauri desktop app：React 19 + Vite frontend 位于 `app/src/`，Rust backend 位于 `app/src-tauri/`。
- MCP runtime：Node ESM 文件位于 `mcp/mlfb/`，核心工具是 `mcp/mlfb/tools/interactive-feedback.mjs`。
- Packaged runtime：Windows 分发目录位于 `dist/win-x64/my-last-feedback/`，其中 prompt instructions 和 MCP runtime 需要在发布前同步。
- OpenCode 权限：session permission 在 prompt run 内近似快照；`approved` cache 可覆盖后续 session rule；同一 prompt run 内热切换不可可靠保证。
- MLFB 权限 UI：prompt 运行期间禁用权限面板；新 session 使用设置页默认权限配置；已有 session 保留自身权限规则。
- request_type 外部契约：agent-facing 合法值只允许 `analysis | completion | planning | document`。
- `analysis` 类型语义：解释说明、调查细节、分析结果、报告都应归为 `analysis`。
- 前端展示兼容：`RequestType` 展示态保留旧 `default`，用于历史/异常数据的 Default label 与 `--stats-nav-neutral` 色卡；这不属于 agent 可用枚举。
- 版本升级规则：用户要求升到 `0.6.1`，应同步 `package.json`、`app/package.json`、`app/src-tauri/Cargo.toml`。
- 构建规则：Windows 发布包优先使用既有 `scripts/package-win.sh`；构建前后不要把 `ref-repos/` 纳入 git 操作。

## 4. Relevant Files and Code

### `app/src/components/agent/AgentDiffIndicator.tsx` 与 `app/src/index.css`

- 顶部 diff 指示器使用 CSS 类如 `.agent-diff-indicator-text`、`.agent-diff-indicator-add`、`.agent-diff-indicator-delete`、`.agent-diff-indicator-text-only`。
- 本轮补回了缺失样式，修复顶部 diff 标记受损。

### `app/src/agent/opencode/eventNormalizer.ts`

- 负责把 OpenCode events/message parts 归一化为 MLFB Agent blocks。
- 空 todo 列表现在可形成“待办已清空”语义，不再因为空数组被 UI 忽略。

### `app/src/agent/steps.ts`

- 空 `task_list` block 也生成 step，清空 todo 时不会丢失步骤。

### `app/src/components/agent/AgentProcessGroup.tsx`

- `task_list` step 判断改为允许空任务列表显示。
- 空 todo step 文案为“待办列表已清空”。

### `app/src/components/agent/AgentTaskPanel.tsx`

- 最新 task_list block 即使为空，也会清空侧边 task panel，而不是回退显示旧任务。

### `app/src/components/agent/AgentPermissionIndicator.tsx`

- 导出并复用 `AgentPermissionPanel`。
- `variant="standalone"` 用于新 session 首页中央面板，默认折叠。
- `variant="popover"` 用于顶栏权限按钮弹窗，默认展开。
- prompt 运行期间禁用权限按钮，并显示运行提示。
- 顶栏权限盾牌在运行期间通过背景斜纹表达锁定状态。
- 移除了“恢复默认权限”按钮。

### `app/src/store/agentStore.ts`

- OpenCode session 权限更新、preset 应用和 session 创建逻辑集中在此。
- 新 session 使用设置页默认规则，而不是继承上一个 session。
- 移除了切换权限后自动处理 pending approval 的逻辑。
- `todo.updated` 不再额外插入重复 timeline todo step。

### `app/src/components/agent/AgentMessageTimeline.tsx`

- 新 OpenCode session 且消息为空时显示 MLFB Logo、`My Last Code` 标识和 standalone 权限面板。

### `app/src/agent/sessionIdentity.ts`

- 未创建 provider session 时，caller name 从 `opencode` 改为 `My Last Code`。

### `app/src/components/agent/AgentSessionManagerPanel.tsx`

- 新建、选中、恢复 session 时自动打开 `agentConsole` 面板。

### `mcp/mlfb/tools/interactive-feedback.mjs`

- agent-facing request_type 说明只列四类：`analysis`、`completion`、`planning`、`document`。
- 文案只说明解释/调查/分析结果/报告应使用 `analysis`，不公开内部处理策略。

### `mcp/mlfb/app-ipc.mjs`

- MCP 到 Tauri 的 IPC 出口。
- 可用集合已去掉 agent-facing `default`。

### `app/src-tauri/src/ipc.rs`

- Rust IPC 层接收 MCP 请求。
- 默认 request_type 为 `analysis`。
- 内部仍可处理旧值，但这种策略不写进给 agent 的 prompt/tool 描述。

### `app/src-tauri/src/session.rs`

- 历史 session 缺失 request_type 时默认 `analysis`。

### `app/src/store/feedbackStore.ts`

- `REQUEST_TYPES` 只包含四个 agent-facing 合法类型。
- `RequestType` 展示态额外允许旧 `default`，用于前端历史/异常值展示。
- `normalizeRequestType` 在前端展示层会让旧值/未知值走 `default` UI 展示态。

### `app/src/components/Sidebar.tsx`

- `default` 展示态恢复原本 Default label 与 `--stats-nav-neutral` 色卡兜底。
- `analysis` 使用 `--stats-nav-tertiary`，`planning` 使用 `--stats-nav-secondary`，`completion` 使用 `--stats-nav-primary`，`document` 使用 `--stats-nav-document`。

### `app/src/i18n/locales/zh.json` 与 `app/src/i18n/locales/en.json`

- `sidebar.requestType.default` 已恢复，仅供前端 UI 展示历史/异常值。

### `dist/prompt.instructions.md`

- 用户点名要求处理的 root dist prompt。
- 现在只列四类合法 request_type，并将说明/调查/分析结果/报告归为 `analysis` 的建议写入文档。
- 已移除暴露内部处理策略的句子。

### `dist/win-x64/my-last-feedback/prompt.instructions.md`

- packaged Windows prompt 副本已同步 root dist prompt。

### `dist/win-x64/my-last-feedback/mcp/mlfb/tools/interactive-feedback.mjs`

- packaged MCP runtime 已同步 source MCP tool 的四类型说明。

### `dist/win-x64/my-last-feedback/mcp/mlfb/app-ipc.mjs`

- packaged IPC runtime 已同步去除 agent-facing `default`。

### `scripts/send-test-feedback.mjs`

- 测试脚本 request_type 已改为合法四类型之一。

## 5. Problem Solving

- 修复 diff 标记：补回顶部 diff indicator 的文字与增删颜色样式。
- 修复 todo 清空不可见：让空 task_list 仍然进入 steps 和 task panel，显示清空态。
- 修复重复 todo 面板：避免 `todowrite` tool part 与 `todo.updated` 双重插入 timeline。
- 分析 OpenCode 权限热切换：确认 same prompt run 内权限快照与 `approved` cache 导致切换不可靠。
- 收敛权限产品语义：prompt 运行中禁用权限 UI，移除 pending approval 自动处理，避免制造“热切换立即生效”的错觉。
- 修复新 session 权限体验：新 session 显示权限按钮和中央权限面板，权限来自设置页默认配置。
- 优化权限面板：standalone 默认折叠、popover 默认展开，移除边框/阴影和恢复默认按钮。
- 完成品牌与导航：新 session 页显示 `My Last Code` 与 MLFB Logo，session manager 选择/新建后自动打开 Agent Console。
- 移除 agent-facing `default` request_type：source MCP、IPC、Rust、frontend、i18n、dist prompt、packaged runtime 均已同步。
- 修复 request_type 文案外泄：去掉“非列表/旧值如何处理”的 prompt/tool 说明，只保留合法枚举和分类建议。
- 修复前端 default 色卡回归：将 UI 展示层与 agent-facing 契约拆开，恢复旧 default 展示态和中性色卡。

## 6. Pending Tasks and Next Steps

用户最新任务原文：

> 好的，根据历史所有对话过程生成性的会话摘要 /compact 。现在升级到0.6.1，并构建新发布包

当前已完成：

- 已查询 MyLastChat 历史摘要。
- 已选择更新现有 `.myLastChat/MLC_MLFB OpenCode权限预设与request_type五类型发行摘要.md`。
- 已追加本轮完整会话摘要。

下一步需要继续：

- 将项目版本升级到 `0.6.1`，至少同步：
  - `package.json`
  - `app/package.json`
  - `app/src-tauri/Cargo.toml`
- 检查是否有 lockfile 或 release/package 脚本中的版本引用需要同步。
- 构建新 Windows 发布包，优先使用 `scripts/package-win.sh`。
- 构建完成后确认产物路径，预计位于 `dist/win-x64/` 下。
- 完成前必须调用 `interactive_feedback`，当前 agent identifier 为 `98B5`。

### 构建完成补记

- 已将版本升级到 `0.6.1`。
- 已执行 `bash scripts/package-win.sh`。
- 构建成功，发布目录为 `dist/win-x64/my-last-feedback/`。
- 新发布包为 `dist/win-x64/my-last-feedback-v0.6.1-win-x64.zip`。
- 打包脚本输出显示：zip 约 `12M`，发布目录约 `38M`。
