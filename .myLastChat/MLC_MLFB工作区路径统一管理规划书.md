---
title: MLFB 工作区路径统一管理规划书
description: 规划统一 WorkspaceContext、焦点追踪、面板同步与最近路径候选机制
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - workspace
  - path
  - focus-context
  - planning
solved_lists:
  - 分析当前 projectDirectory、cwd、workspacePath 分散使用现状
  - 梳理焦点追踪、面板工作区同步、最近路径候选的职责边界
  - 设计 WorkspaceRegistry、FocusTargetContext、PanelWorkspaceState 与 CandidateEngine
  - 制定分阶段迁移与验收方案
---

# MLFB 工作区路径统一管理规划书

最后更新：2026-05-10

## 1. 背景

MLFB 当前已经从一个单一反馈弹窗逐步扩展成多面板桌面工作台：Feedback Composer、MLC 文档侧栏、项目资源树、Agent Console、Agent Sessions、内置终端、Preview Browser 等功能都在不同程度上依赖“当前工作区路径”。

这些路径来自多个入口：

- MCP 工具调用中的 `project_directory`。
- VS Code MCP `listRoots` 推断出的 workspace root。
- Tauri IPC 保存的 session `project_directory`。
- Feedback 前端 store 中的 `Session.projectDirectory`。
- Agent Console 中的 `AgentSession.cwd`。
- Terminal store 中的 `lastUsedCwd`、tab `cwd`、`recentPaths`。
- MLC / Resource 面板中的 `mlcActiveWorkspacePath`。
- OpenCode provider session 中的 `directory` / `cwd`。
- 用户通过目录选择器手动选出的路径。

这些值目前大多以字符串形式在各个组件之间传递。组件会在消费端临时执行 trim、反斜杠替换、去尾斜杠、转小写、basename 提取等处理。随着面板之间的联动变多，这种方式开始暴露出一致性、可维护性和用户体验风险。

本规划的目标是建立一个统一、可扩展、低风险迁移的 Workspace 管理体系，让所有面板都能共享同一套路径身份、焦点上下文、面板选择和最近路径候选逻辑。

## 2. 当前现状

### 2.1 MCP 到前端 session 的路径流

当前主要链路如下：

1. MCP `interactive_feedback` 工具接收 `project_directory`。
2. MCP 层对该字段做首行 trim，并将其作为 workspace hint 传给 caller-info。
3. caller-info 尝试通过 MCP `listRoots` 推断 workspace root、folderName、caller alias。
4. MCP IPC payload 将 `project_directory` 传给 Tauri backend。
5. Tauri IPC/session manager 将 `project_directory` 存为 session detail。
6. 前端 `App.tsx` 加载历史或监听新 session 事件后，将其映射为 `Session.projectDirectory`。

该链路的问题是：各层可以推断或规范化路径，但没有一个统一的“已解析 workspace identity”对象。最终进入前端的大多仍是原始字符串或近似规范化字符串。

### 2.2 Feedback 焦点上下文

当前 `focusedComposer` 承担了两类职责：

- 表示当前附件、MLC 文档、资源链接、Web 附件应该插入到哪个输入目标。
- 携带 `projectDirectory`，被多个面板用于推导当前工作区。

这让“用户聚焦输入框”隐含变成“切换全局工作区”的动作。

### 2.3 MLC / Resource 面板同步

MLC 和 Resource 面板都从以下来源构造 workspace option：

- 当前 `focusedComposer.projectDirectory`。
- 全部历史 `Session.projectDirectory`。
- 全局 `mlcActiveWorkspacePath`。

它们都支持类似 target / workspace 的 UI 概念，但 store 层没有记录“当前面板是在跟随焦点，还是用户手动 pin 到某个 workspace”。因此后续焦点变化、Dock tab 切换、资源面板按钮点击都可能覆盖用户的手动选择。

### 2.4 Terminal 与 Agent Sessions 候选路径

TerminalPanel 会从以下来源构造新终端候选路径：

- terminal recent paths。
- active terminal tab cwd。
- terminal lastUsedCwd。
- active feedback session projectDirectory。
- focusedComposer projectDirectory。
- mlcActiveWorkspacePath。
- 历史 request sessions。

AgentSessionManagerPanel 也有类似逻辑，但排序和来源略有不同：

- active agent session cwd。
- terminal lastUsedCwd。
- terminal recent paths。
- focusedComposer projectDirectory。
- mlcActiveWorkspacePath。
- agent sessions。
- provider sessions。
- 历史 request sessions。

这些候选逻辑是各组件自己拼装的。未来如果想统一“当前 caller 路径作为过渡”“最近使用路径优先级”“面板当前路径优先级”，就需要在多个组件重复修改。

### 2.5 后端路径处理

Rust 后端目前有局部路径处理：

- Resource command 会 canonicalize workspace 与 directory，并校验 directory 在 workspace 内。
- MLC search 会 canonicalize workspace path，并扫描 `.myLastChat`。
- Terminal 和 Agent Process 会在启动时 resolve cwd，若无效则回退到 current_dir / HOME / temp。
- select_directory 返回用户选择的路径。

这些处理都发生在各自命令内部，且不负责把 canonical path 回写到一个统一 workspace registry。

## 3. 核心问题

### 3.1 路径身份不是一等对象

目前系统只有 path string，没有 Workspace record。结果是同一个工作区可能以多种形式存在：

- `E:\Dev\my-last-feedback`
- `E:/Dev/my-last-feedback`
- `e:/dev/my-last-feedback`
- `E:/Dev/my-last-feedback/`
- `\\?\E:\Dev\my-last-feedback`

这些路径在不同位置可能被视为相同，也可能被视为不同。

### 3.2 语义命名混用

当前字段名包括：

- `projectDirectory`
- `project_directory`
- `workspacePath`
- `workspace_path`
- `cwd`
- `directory`

这些字段有时表示 workspace root，有时表示进程工作目录，有时表示资源浏览目录，有时表示 provider session directory。没有统一语义会让后续维护者难以判断某个路径是否可以安全传给文件系统、是否可以作为 workspace identity、是否可以作为 UI active key。

### 3.3 全局 active workspace 过载

`mlcActiveWorkspacePath` 名义上属于 MLC，实际上被 MLC、Resource、Terminal、Agent Sessions、DockColumn 共用。它既表示当前 workspace，又表示面板选择，又会被焦点变化修改。

这类全局单值在多面板工作台里很容易产生抢状态：用户在 Resource 面板手动选择 workspace 后，切换 Dock tab 或聚焦另一个输入框可能把它改掉。

### 3.4 Focus 与 panel selection 缺少边界

Focus 的语义应是“当前操作目标”。Panel selection 的语义应是“这个面板现在看哪里”。Recent 的语义应是“可作为默认值的候选”。

当前这些语义互相写入，导致状态传播方向不清晰。

### 3.5 候选路径排序无法统一体验

Terminal、Agent Sessions、MLC、Resource 都需要候选路径，但它们目前各自实现排序。不同面板对“最近使用”“当前 caller”“当前 active session”“focused composer”的优先级不一致。

这会造成用户体验上的轻微但持续的割裂：刚在某个 caller 下工作，打开不同面板时默认路径可能不一致。

## 4. 设计目标

### 4.1 统一路径身份

任何进入系统的 workspace path 都应注册成 Workspace record，并拥有稳定 id。

### 4.2 明确状态职责

系统必须区分以下概念：

- 当前输入/附件目标。
- 当前面板 workspace 选择。
- 最近使用 workspace。
- caller 与 workspace 的关联。
- agent / terminal 的实际 cwd。

### 4.3 支持智能同步

MLC、Resource 等面板默认应能跟随当前输入焦点，但用户手动选择 workspace 后应允许保持 pinned，不被后续焦点变化覆盖。

### 4.4 统一候选路径策略

最近路径、当前 caller、active request、agent cwd、terminal cwd、provider cwd 应由统一 CandidateEngine 汇总，组件只指定 intent。

### 4.5 渐进迁移

避免一次性大改所有 store 和组件。优先引入 helper 和 selector，再逐步替换状态结构。

## 5. 非目标

以下内容不作为本规划第一阶段目标：

- 不立即重写所有 session 数据结构。
- 不要求历史数据迁移到 workspace id 后才能使用。
- 不改变 MCP tool schema 中的 `project_directory` 参数名。
- 不改变 OpenCode server 的 directory / cwd 语义。
- 不一次性重构所有 MLC、Terminal、Agent UI。

## 6. 目标架构

### 6.1 WorkspaceRegistry

WorkspaceRegistry 是统一工作区索引，负责登记、去重、展示和记录来源。

建议模型：

```ts
export type WorkspaceSourceKind =
  | "request"
  | "caller"
  | "focusedComposer"
  | "panel"
  | "terminal"
  | "agent"
  | "provider"
  | "selected"
  | "history";

export interface WorkspaceRecord {
  id: string;
  path: string;
  canonicalPath?: string | null;
  displayName: string;
  normalizedKey: string;
  sources: WorkspaceSourceKind[];
  callerIds: string[];
  sessionIds: string[];
  lastSeenAt: string;
  lastUsedAt?: string | null;
  valid?: boolean | null;
}
```

`id` 可以先使用 normalized path key，后续如果引入后端 canonical path，可以迁移为 canonical key。

### 6.2 FocusTargetContext

FocusTargetContext 只负责描述当前插入、附件、提交目标。

建议模型：

```ts
export type FocusTargetKind = "feedback" | "testLog" | "question" | "queuedDraft" | "agent";

export interface FocusTargetContext {
  callerId: string;
  sessionId?: string;
  kind: FocusTargetKind;
  workspaceId?: string | null;
  focusedAt: string;
}
```

这可以从当前 `focusedComposer` 演进而来。第一阶段可继续保存 `projectDirectory`，同时派生 workspace id。后续再切换为 workspace id。

### 6.3 PanelWorkspaceState

每个面板应有自己的 workspace selection，不再共享一个 `mlcActiveWorkspacePath`。

建议模型：

```ts
export type WorkspacePanelId = "mlc" | "resources" | "terminal" | "agentSessions" | "preview";

export type PanelWorkspaceMode =
  | "followFocus"
  | "pinned"
  | "recentFallback"
  | "explicit";

export interface PanelWorkspaceState {
  panelId: WorkspacePanelId;
  mode: PanelWorkspaceMode;
  workspaceId?: string | null;
  updatedAt: string;
}
```

模式语义：

- `followFocus`: 面板跟随当前 FocusTargetContext。
- `pinned`: 用户手动选择过 workspace，焦点变化不覆盖。
- `recentFallback`: 没有焦点时使用最近或 caller fallback。
- `explicit`: 由明确操作打开，例如从某个 session 的资源按钮打开。

### 6.4 WorkspaceCandidateEngine

CandidateEngine 负责根据 intent 生成候选列表。

建议模型：

```ts
export type WorkspaceCandidateIntent =
  | "resourceBrowse"
  | "mlcSearch"
  | "terminalNew"
  | "agentNewSession"
  | "previewAttach";

export interface WorkspaceCandidate {
  workspaceId: string;
  path: string;
  label: string;
  source: WorkspaceSourceKind;
  score: number;
  callerName?: string;
  lastUsedAt?: string | null;
}
```

不同 intent 使用不同排序策略，而不是各组件手写。

## 7. 状态更新规则

### 7.1 焦点变化规则

当用户聚焦 FeedbackInput、Question input、AgentComposer 时：

1. 注册该路径对应 WorkspaceRecord。
2. 更新 FocusTargetContext。
3. 只更新处于 `followFocus` 模式的面板 workspace。
4. 不覆盖 `pinned` 或 `explicit` 模式面板。

### 7.2 面板手动选择规则

当用户在 MLC / Resource workspace tab 中点击某个 workspace：

1. 注册或确认 WorkspaceRecord。
2. 更新当前面板的 PanelWorkspaceState 为 `pinned`。
3. 记录 workspace usage。
4. 不修改 FocusTargetContext。

当用户点击 target tab：

1. 将当前面板 mode 改回 `followFocus`。
2. 当前 workspace 由 FocusTargetContext 派生。

### 7.3 Dock tab 切换规则

Dock tab 切换不应直接写全局 active workspace。

更合理的行为是：

- 如果目标面板没有选择状态，则初始化为 `followFocus` 或 `recentFallback`。
- 如果目标面板已经 pinned，则保留 pinned workspace。

### 7.4 最近路径规则

最近路径不应只属于 Terminal。

WorkspaceRegistry 应记录：

- `lastSeenAt`: 该 workspace 最近出现在系统中的时间。
- `lastUsedAt`: 用户明确使用该 workspace 的时间。
- `usageByIntent`: 可选，用于区分 terminal / resource / agent 使用记录。

Terminal 可继续保留自身 tab 状态，但 recent workspace 应逐步迁移到统一 registry。

### 7.5 Caller 路径规则

系统应维护 caller -> workspace index。

建议派生数据：

```ts
interface CallerWorkspaceIndexEntry {
  callerId: string;
  latestWorkspaceId?: string | null;
  pendingWorkspaceIds: string[];
  historicalWorkspaceIds: string[];
}
```

这样 CallerTabs、TerminalPanel、AgentSessionManagerPanel 不需要各自扫描 sessions。

## 8. 候选排序策略

### 8.1 Resource Browse

目标：快速插入当前上下文相关文件。

建议优先级：

1. 当前 panel pinned workspace。
2. 当前 focused target workspace。
3. 当前 active request workspace。
4. 当前 caller latest workspace。
5. 最近 resource browse workspace。
6. 历史 request workspace。

### 8.2 MLC Search

目标：优先展示当前上下文知识库，同时允许跨 workspace 搜索。

建议优先级：

1. 当前 panel pinned workspace。
2. 当前 focused target workspace。
3. 当前 caller latest workspace。
4. 所有可见 caller workspace。
5. 历史 workspace。

MLC 可以继续一次加载多个 workspace 的文档，但 active filter 应来自 PanelWorkspaceState。

### 8.3 Terminal New

目标：打开一个用户预期中的工作目录。

建议优先级：

1. 当前 terminal panel pinned workspace。
2. active terminal tab cwd。
3. 当前 focused target workspace。
4. 当前 active request workspace。
5. terminal last used workspace。
6. 当前 caller latest workspace。
7. 历史 request workspace。

如果用户刚从某个 caller 的请求里打开终端，应优先使用该 caller workspace；如果用户一直在 terminal 内操作，则 active terminal cwd 可以优先。

### 8.4 Agent New Session

目标：新 Agent 会话应尽可能贴近当前任务上下文。

建议优先级：

1. 当前 focused target workspace。
2. 当前 active agent session cwd。
3. 当前 active request workspace。
4. provider session cwd。
5. terminal last used workspace。
6. 当前 caller latest workspace。
7. 历史 request workspace。

Agent 场景中 focus target 比 terminal recent 更重要，因为用户经常从一个 feedback request 直接创建 Agent session。

### 8.5 Preview Attach

目标：附件归属应该跟随当前输入目标。

建议优先级：

1. FocusTargetContext。
2. 当前 active request。
3. 当前 caller latest。

Preview 不应因为 MLC / Resource 的 pinned workspace 而改变附件目标。

## 9. 分阶段实施计划

### Phase 1：统一 path helper

目标：不改变 store 结构，先收敛重复路径工具。

新增文件建议：

- `app/src/workspace/workspacePaths.ts`

提供函数：

- `normalizeWorkspacePath(value)`
- `workspacePathKey(value)`
- `sameWorkspacePath(left, right)`
- `workspaceBasename(value)`
- `cleanDisplayPath(value)`
- `joinWorkspacePath(base, relative)`
- `resolveWorkspaceResourceHref(href, workspacePath)`

优先替换位置：

- `MlcSidePanel.tsx`
- `ProjectResourcePanel.tsx`
- `TerminalPanel.tsx`
- `AgentSessionManagerPanel.tsx`
- `terminalStore.ts`
- `agentStore.ts` 中 OpenCode directory compare helper
- `resourceLinks.ts`
- `MarkdownContent.tsx`

验收标准：

- 所有高频面板的 path compare 使用同一 key 规则。
- Windows 反斜杠、尾斜杠、大小写比较行为一致。
- UI 行为不发生明显变化。

### Phase 2：引入候选 selector

目标：先统一候选生成，不立即引入新 store。

新增文件建议：

- `app/src/workspace/workspaceCandidates.ts`

输入仍可来自现有 stores：

- feedback sessions。
- focusedComposer。
- mlcActiveWorkspacePath。
- terminal recentPaths / lastUsedCwd。
- agent sessions。
- provider sessions。

输出统一 `WorkspaceCandidate[]`。

优先替换：

- TerminalPanel pathCandidates。
- AgentSessionManagerPanel pathCandidates。
- MlcSidePanel workspaceOptions。
- ProjectResourcePanel workspaceOptions。

验收标准：

- 四个面板候选去重一致。
- callerName、label、lastUsedAt 展示一致。
- 改排序只需要改 selector，不需要改多个组件。

### Phase 3：引入 PanelWorkspaceState

目标：解决 focus 跟随和用户手动选择互相覆盖的问题。

可以先放在 `feedbackStore` 中：

```ts
panelWorkspaceById: Partial<Record<WorkspacePanelId, PanelWorkspaceState>>;
setPanelWorkspace: (...args) => void;
followFocusedWorkspace: (panelId: WorkspacePanelId) => void;
pinPanelWorkspace: (panelId: WorkspacePanelId, workspacePath: string) => void;
```

兼容层：

- 暂时保留 `mlcActiveWorkspacePath`。
- 新 selector 从 panel state 优先读取，缺失时 fallback 到旧字段。
- 写入时同步旧字段，避免一次性破坏旧组件。

验收标准：

- MLC / Resource 默认跟随当前输入焦点。
- 用户手动选择 workspace 后，切换焦点不覆盖该面板。
- 点击 target tab 后恢复跟随焦点。

### Phase 4：引入 WorkspaceRegistry

目标：统一登记路径、caller 关联、recent usage。

新增 store 可选方案：

- 独立 `workspaceStore.ts`。
- 或先合并进 `feedbackStore`，待稳定后拆出。

建议优先独立，因为 Terminal、Agent、Feedback、MLC 都会消费。

动作建议：

- `registerWorkspace(path, metadata)`
- `registerWorkspaceUsage(workspaceId, intent)`
- `registerCallerWorkspace(callerId, workspaceId, sessionId)`
- `getWorkspaceByPath(path)`
- `getWorkspaceCandidates(intent, context)`

验收标准：

- 新 session、历史 session、terminal cwd、agent cwd、provider cwd 都会注册 workspace。
- caller latest workspace 不再由组件扫描 sessions 生成。
- 最近路径可以跨 Terminal / Agent / Resource 共享。

### Phase 5：后端 workspace resolve

目标：后端提供统一 canonical path 能力。

新增 Rust 模块建议：

- `app/src-tauri/src/workspace.rs`

新增 command 建议：

```rust
#[tauri::command]
pub async fn workspace_resolve(path: String) -> Result<WorkspaceResolveResult, String>
```

返回：

- `inputPath`
- `displayPath`
- `canonicalPath`
- `exists`
- `isDirectory`
- `error`

后续命令复用：

- `select_directory`
- `project_list_directory`
- `mlc_search_documents`
- `terminal_create`
- `agent_process_start`

验收标准：

- 同一路径经后端解析后能稳定生成同一个 canonical key。
- Resource 的 outside workspace 校验复用统一 helper。
- Terminal / Agent fallback cwd 也能回写 registry。

### Phase 6：字段语义迁移

目标：逐步减少裸 path string 在 UI 里的传递。

迁移方向：

- `focusedComposer.projectDirectory` -> `focusTarget.workspaceId`。
- `mlcActiveWorkspacePath` -> `panelWorkspaceById`。
- `TerminalPathCandidate.path` -> `workspaceId + path`。
- `AgentSession.cwd` 保留为实际进程 cwd，但同时注册 workspace id。
- `Session.projectDirectory` 保留兼容历史，但新代码优先使用 workspace selector。

验收标准：

- 大部分 UI active 判断不再直接比较 path string。
- 新面板接入 workspace 只需使用 registry 和 candidate engine。
- 旧历史数据仍可正常显示。

## 10. 重点文件改造清单

### 前端路径工具

- `app/src/workspace/workspacePaths.ts`
- `app/src/workspace/workspaceCandidates.ts`
- `app/src/workspace/workspaceTypes.ts`

### Feedback store

- `app/src/store/feedbackStore.ts`
  - 保留 session 数据。
  - 引入 focus target / panel workspace compatibility layer。
  - 减少 `setFocusedComposer` 对 active workspace 的直接覆盖。

### Terminal

- `app/src/store/terminalStore.ts`
  - recent path 去重改用统一 key。
  - 后续将 recent usage 汇入 WorkspaceRegistry。
- `app/src/components/TerminalPanel.tsx`
  - pathCandidates 改用 CandidateEngine。

### Agent

- `app/src/store/agentStore.ts`
  - cwd compare 使用统一 helper。
  - Agent session 创建时注册 workspace。
- `app/src/components/agent/AgentSessionManagerPanel.tsx`
  - pathCandidates 改用 CandidateEngine。
- `app/src/components/agent/AgentComposer.tsx`
  - focusAgentComposer 只更新 FocusTargetContext，不直接污染其它面板 pinned state。

### MLC / Resource

- `app/src/components/MlcSidePanel.tsx`
  - workspaceOptions 改用 selector。
  - 引入 followFocus / pinned 模式。
- `app/src/components/ProjectResourcePanel.tsx`
  - workspaceOptions 改用 selector。
  - directory cache key 使用统一 workspace key。
- `app/src/components/MlcPreviewPanel.tsx`
  - 附件目标继续走 focus target，不从 panel workspace 反推。

### Markdown / Resource link

- `app/src/composer/resourceLinks.ts`
- `app/src/components/MarkdownContent.tsx`
  - 路径 resolve 和 local resource 判断使用统一 helper。

### Backend

- `app/src-tauri/src/workspace.rs`
- `app/src-tauri/src/project_resources.rs`
- `app/src-tauri/src/mlc.rs`
- `app/src-tauri/src/terminal.rs`
- `app/src-tauri/src/agent_process.rs`
- `app/src-tauri/src/lib.rs`

## 11. 兼容策略

### 11.1 历史数据兼容

历史 session 中只有 `project_directory`，没有 workspace id。前端加载历史时应调用 registerWorkspace，并把注册结果作为派生数据使用。

### 11.2 旧字段兼容

第一阶段到第三阶段应保留：

- `Session.projectDirectory`
- `FocusedComposer.projectDirectory`
- `mlcActiveWorkspacePath`
- `AgentSession.cwd`
- `TerminalTabState.cwd`

但新逻辑逐步通过 helper / selector 访问它们，避免到处直接比较。

### 11.3 MCP schema 兼容

MCP 工具参数仍保持 `project_directory`。统一逻辑只改变 app 内部建模，不改变外部工具协议。

### 11.4 OpenCode 兼容

OpenCode runtime 仍需要 cwd/directory。WorkspaceRegistry 不改变 provider API，只负责在 app 内部统一识别和展示路径。

## 12. 风险与缓解

### 12.1 风险：一次性改动过大

缓解：按 helper -> selector -> panel state -> registry -> backend resolve 分阶段迁移。每阶段都保持旧字段兼容。

### 12.2 风险：用户手动选择行为被改变

缓解：引入 `followFocus` / `pinned` 前先明确 UI 规则。MLC / Resource 的 target tab 表示跟随焦点，workspace tab 表示 pinned。

### 12.3 风险：路径 canonicalize 触发文件系统权限或不存在错误

缓解：前端 registry 先允许 unresolved workspace。后端 resolve 失败时保留原 path，并标记 `valid: false`，不阻塞 UI 展示。

### 12.4 风险：Windows 路径边界复杂

缓解：统一 helper 覆盖以下场景：

- drive letter 大小写。
- 反斜杠和正斜杠混用。
- 尾斜杠。
- `\\?\` 与 `\\?\UNC\` 前缀。
- UNC path。
- file URL。

### 12.5 风险：Terminal 与 Agent cwd 不一定等于 workspace root

缓解：模型上区分 `workspace root` 与 `working directory`。第一阶段可把 cwd 当作 workspace candidate，后续增加 `kind: workspaceRoot | workingDirectory`。

## 13. 测试与验证计划

### 13.1 Unit tests

建议覆盖：

- `workspacePathKey`。
- `sameWorkspacePath`。
- `cleanDisplayPath`。
- `resolveWorkspaceResourceHref`。
- CandidateEngine 不同 intent 的排序。
- followFocus / pinned 状态转换。

### 13.2 手工验证场景

#### 场景 A：Feedback -> Resource

1. 打开 caller A 的 pending request。
2. 聚焦反馈输入框。
3. 打开 Resource 面板。
4. 应默认显示 caller A workspace。

#### 场景 B：Resource pinned

1. 在 Resource 面板手动切到 caller B workspace。
2. 聚焦 caller A 输入框。
3. Resource 面板应保持 caller B workspace，除非点击 target tab。

#### 场景 C：MLC follow focus

1. MLC 面板处于 target/followFocus。
2. 聚焦 caller A，然后聚焦 caller B。
3. MLC active workspace 应跟随切换。

#### 场景 D：Terminal default

1. 聚焦 caller A 输入框。
2. 打开 Terminal 新 tab。
3. 应优先使用 caller A workspace，除非 terminal panel 已明确 pinned 或有 active terminal cwd 策略优先。

#### 场景 E：Agent new session

1. 聚焦 caller A 输入框。
2. 打开 Agent Sessions 新会话。
3. 新 Agent session cwd 应使用 caller A workspace。

#### 场景 F：路径格式去重

1. 同一个 workspace 分别以 `E:\Dev\x`、`E:/Dev/x/`、`e:/dev/x` 出现。
2. MLC / Resource / Terminal / Agent 候选里只应出现一项。

### 13.3 Build validation

前端改造阶段建议执行：

```bash
cd app && npm run build
```

涉及 Rust workspace command 后建议执行：

```bash
cd app/src-tauri && cargo check
```

## 14. 验收标准

### 14.1 功能验收

- MLC、Resource、Terminal、Agent Sessions 的候选路径来源一致。
- 同一路径不同格式不会造成重复 workspace tab。
- 用户手动选择某个面板 workspace 后，不会被无关焦点变化覆盖。
- target/followFocus 模式能明确跟随当前输入目标。
- 当前 caller 最新 workspace 可作为统一候选来源。
- Terminal recent 不再是唯一 recent path 体系，未来可被 WorkspaceRegistry 接管。

### 14.2 代码验收

- 高频组件不再各自定义 `normalizePath`、`basename`、`samePath`。
- 候选路径拼装逻辑集中在 selector/helper 中。
- `mlcActiveWorkspacePath` 的直接写入点明显减少，并有迁移计划。
- 后端路径 canonicalize 逻辑逐步集中。

### 14.3 用户体验验收

- 用户能感知到面板会智能跟随当前任务。
- 用户手动切换面板 workspace 后，系统尊重该选择。
- 新终端、新 Agent 会话默认路径更符合当前任务上下文。
- 路径 tab 和 tooltip 展示一致、干净。

## 15. 开放问题

### 15.1 Workspace root 与 working directory 是否分离

Agent 和 Terminal 的 cwd 可能是 workspace 子目录。是否需要第一版就建模：

- workspace root。
- current working directory。
- selected resource directory。

建议：第一版先统一 path identity，第二版再细分 root / cwd。

### 15.2 多根 workspace 如何展示

MCP `listRoots` 可能返回多个 workspace。当前 caller-info 主要选择第一个或 hint match。未来 WorkspaceRegistry 应支持同一 caller 关联多个 workspace。

### 15.3 caller latest workspace 的定义

可以按以下策略之一：

- 最新 session createdAt。
- 最新 pending session。
- 最近 focused session。
- 最近 submitted session。

建议 CandidateEngine 根据 intent 使用不同权重，而不是定义单一绝对 latest。

### 15.4 面板 pinned 状态是否持久化

第一版可只保存在内存。若用户反馈需要保留布局状态，可随 dock layout 一起持久化。

## 16. 推荐下一步

建议从 Phase 1 开始实施：

1. 新建 `app/src/workspace/workspacePaths.ts`。
2. 增加少量 path helper 单元测试。
3. 替换 MLC / Resource / Terminal / Agent Sessions 中重复 normalize/helper。
4. 再推进 CandidateEngine。

这样风险最小，也能为后续 PanelWorkspaceState 和 WorkspaceRegistry 铺好地基。
