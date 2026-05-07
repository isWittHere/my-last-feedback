---
title: MLFB OpenCode权限管理规划书
description: 规划 OpenCode 默认权限与实时 session 权限管理
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - OpenCode
  - Agent Console
  - permission
  - settings
solved_lists:
  - 分析 OpenCode bash 工具缺失的根因
  - 确认 OpenCode 支持运行中修改 session permission
  - 制定默认权限设置页与实时权限面板方案
---

# MLFB OpenCode权限管理规划书

## 1. 背景

当前 MLFB 的 OpenCode 集成使用 OpenCode HTTP/SSE no-ACP 模式。MLFB 保留自己的 Agent UI，通过 OpenCode serve 提供模型、工具、权限审批、文件修改、diff、上下文压缩等能力。

近期排查发现：OpenCode 模型在用户询问“你可以执行 cli 命令吗”时回答不能执行命令，原因不是 OpenCode 缺少命令工具，而是 MLFB 在创建 OpenCode session 后应用了一组硬编码的只读权限规则，其中明确设置：

```ts
{ permission: "bash", pattern: "*", action: "deny" }
```

OpenCode 在把工具列表发送给模型前，会根据 session permission 过滤 disabled tools。当 `bash` 被设置为 `deny` 且 pattern 为 `*` 时，模型实际收到的工具列表里没有 `bash`，因此它会正确地回答自己不能执行 CLI 命令。

用户希望将这类权限控制产品化：

1. 在设置页面的 OpenCode 设置中添加“默认授权方式列表”，用于管理新 session 的默认权限。
2. 如果 OpenCode 支持用户在使用 session 的过程中修改权限，则在 Agent 顶栏添加一个按钮，用于弹出实时权限管理面板。

经对照 OpenCode 参考实现，OpenCode 支持通过 `PATCH /session/:sessionID` 修改 `permission`，并会将新规则 merge 到当前 session permission。因此实时权限管理面板可行。

## 2. 目标

### 2.1 产品目标

- 让用户能够在 OpenCode 设置页配置新建 session 的默认工具授权方式。
- 让用户能够在 Agent 会话运行过程中查看并调整当前 session 的有效权限。
- 恢复 OpenCode 的命令执行能力，同时保留安全审批边界。
- 避免继续在代码中硬编码 `bash: deny` 这类策略。
- 权限 UI 要清晰、克制、可扫描，不引入复杂或花哨的交互。

### 2.2 工程目标

- 将 OpenCode permission rules 从 `agentStore.ts` 中的固定函数迁移到 `openCodeSettings.ts` 的标准化配置。
- 新建 session 时读取 OpenCode 设置中的默认权限规则。
- 当前 session 权限修改通过已有 OpenCode HTTP client 的 `updateSession` 调用完成。
- UI 状态应能立即反映用户修改，并在失败时显示 diagnostic。
- 保持中英文 i18n。
- 不改变现有 permission asked 审批流，只补充默认策略和当前 session 策略管理。

## 3. 非目标

- 不恢复 OpenCode revert/unrevert/edit-retry 等危险回滚能力。
- 不实现任意高级规则编辑器，例如复杂 glob pattern 列表、正则规则、命令白名单脚本等。
- 不把 MLFB 内置 Terminal Panel 和 OpenCode `bash` 工具混为一个功能。
- 不让设置页修改自动影响已经运行中的 session，除非用户在实时权限面板中显式修改。
- 不绕过 OpenCode 自身 permission asked 事件和审批流程。

## 4. OpenCode 权限语义

### 4.1 Permission Rule 结构

MLFB 当前已有类型：

```ts
export interface OpenCodePermissionRule {
  permission: string;
  pattern: string;
  action: "allow" | "deny" | "ask";
}
```

OpenCode 接受的 session permission 是规则数组，常用结构为：

```ts
{ permission: "bash", pattern: "*", action: "ask" }
```

### 4.2 规则覆盖语义

OpenCode 更新 session 时，会把当前 permission 与新传入的 permission merge。

OpenCode 判断工具是否 disabled 时，会查找最后一个匹配 permission 的规则；如果最后有效规则是 `pattern: "*"` 且 `action: "deny"`，该工具会从模型可用工具列表中移除。

因此实时权限面板不需要删除旧规则，只要追加同 permission、同 pattern 的新规则，就可以覆盖旧规则的有效结果。

### 4.3 `ask` 与工具可见性

`ask` 不会让工具从模型工具列表消失。模型可以调用该工具，OpenCode 再发出 permission request，MLFB 现有审批 UI 负责展示和响应。

这正适合 `bash`、`edit` 等高风险能力的默认策略。

### 4.4 权限 key 与工具关系

OpenCode 内置工具和权限 key 并不总是一一对应：

- `bash` 控制命令执行工具。
- `edit` 会覆盖 edit/write/apply_patch 一类写文件工具。
- `read`、`glob`、`grep`、`list` 负责读文件和搜索。
- `external_directory` 控制是否允许访问外部目录。
- `task` 控制子任务/子 agent 能力。
- `webfetch`、`websearch` 控制网页读取和搜索。
- `skill` 控制技能加载。

第一版 UI 应展示稳定、高价值的常用权限，不需要暴露所有 OpenCode 内部或实验性权限。

## 5. 默认权限设置页设计

### 5.1 入口

位置：设置对话框 -> OpenCode tab。

现有 OpenCode tab 当前只包含模型库。应在模型库上方或下方新增一个独立 section：

```text
OpenCode 默认权限
用于新建 OpenCode 会话。已有会话可在 Agent 顶栏单独调整。
```

### 5.2 默认权限项

建议第一版固定展示以下权限：

| 权限 | UI 名称 | 默认动作 | 说明 |
| --- | --- | --- | --- |
| `glob` | 文件匹配 | `allow` | 查找文件路径，低风险 |
| `grep` | 内容搜索 | `allow` | 搜索文件内容，低风险 |
| `read` | 读取文件 | `allow` | 读取工作区文件，必要能力 |
| `list` | 列出目录 | `allow` | 浏览工作区结构，必要能力 |
| `edit` | 修改文件 | `ask` | 写入类操作需要审批 |
| `bash` | 命令执行 | `ask` | 允许模型请求执行命令，但每次审批 |
| `task` | 子任务 | `ask` | 避免自动扩散执行范围 |
| `webfetch` | 读取网页 | `ask` | 可能访问外部内容 |
| `websearch` | 网页搜索 | `ask` | 可能产生外部网络请求 |
| `external_directory` | 外部目录 | `deny` | 默认禁止离开工作区 |
| `skill` | 技能加载 | `ask` | 加载额外指令前保留控制 |

### 5.3 控件形式

每个权限项使用三段式 segmented control：

```text
允许 | 询问 | 拒绝
```

对应值：

```ts
"allow" | "ask" | "deny"
```

不建议第一版使用复杂表格编辑器。固定权限列表更利于安全理解，也避免用户写出 OpenCode 不接受的规则。

### 5.4 设置保存模型

扩展 `OpenCodeSettings`：

```ts
export type OpenCodePermissionAction = "allow" | "ask" | "deny";

export interface OpenCodePermissionPresetItem {
  permission: string;
  action: OpenCodePermissionAction;
}

export interface OpenCodeSettings {
  models: OpenCodeModelSettings[];
  preferredModelId?: string;
  defaultPermissionPreset: OpenCodePermissionPresetItem[];
}
```

保存时转换为 OpenCode rule：

```ts
preset.map((item) => ({
  permission: item.permission,
  pattern: "*",
  action: item.action,
}))
```

内部也可以直接存 `OpenCodePermissionRule[]`。但从 UI 稳定性看，存 preset item 更好：第一版只支持 `pattern: "*"`，避免用户看见还不能编辑的 pattern。

### 5.5 默认值兼容

`normalizeSettings()` 必须兼容老 localStorage 数据。旧设置没有 `defaultPermissionPreset` 时，应自动补齐默认值。

推荐默认策略：

```ts
const DEFAULT_PERMISSION_PRESET = [
  { permission: "glob", action: "allow" },
  { permission: "grep", action: "allow" },
  { permission: "read", action: "allow" },
  { permission: "list", action: "allow" },
  { permission: "edit", action: "ask" },
  { permission: "bash", action: "ask" },
  { permission: "task", action: "ask" },
  { permission: "webfetch", action: "ask" },
  { permission: "websearch", action: "ask" },
  { permission: "external_directory", action: "deny" },
  { permission: "skill", action: "ask" },
];
```

关键变化是 `bash` 从 `deny` 改为 `ask`。

## 6. 新建 Session 权限应用

### 6.1 当前问题

当前 `agentStore.ts` 中存在：

```ts
function openCodeReadOnlyPermissionRules(): OpenCodePermissionRule[] {
  return [
    { permission: "glob", pattern: "*", action: "allow" },
    { permission: "grep", pattern: "*", action: "allow" },
    { permission: "read", pattern: "*", action: "allow" },
    { permission: "list", pattern: "*", action: "allow" },
    { permission: "external_directory", pattern: "*", action: "deny" },
    { permission: "edit", pattern: "*", action: "ask" },
    { permission: "bash", pattern: "*", action: "deny" },
  ];
}
```

该函数名也不再准确，因为目标不是固定只读，而是用户可配置的默认权限。

### 6.2 目标改造

在 `openCodeSettings.ts` 增加导出函数：

```ts
export function getOpenCodeDefaultPermissionRules(): OpenCodePermissionRule[]
```

`agentStore.ts` 创建 provider session 后改为：

```ts
const permissionRules = getOpenCodeDefaultPermissionRules();
await httpRuntime.runtime.client.updateSession(providerSessionId, { permission: permissionRules });
```

并将本地 `AgentSession` 更新为：

```ts
openCodePermissionRules: permissionRules
```

### 6.3 应用时机

需要覆盖两个创建 providerSessionId 的路径：

1. 执行 OpenCode slash command 前创建 session。
2. 普通 prompt 发送前创建 session。

如果未来还有 fork/restore/import session 路径，也应统一调用同一个 helper，避免遗漏。

## 7. 实时权限管理面板

### 7.1 可行性结论

OpenCode 支持 session 运行中修改 permission。MLFB 已有 HTTP client：

```ts
updateSession(sessionId, { permission })
```

可以直接用于实时权限更新。

### 7.2 顶栏入口

位置：Agent 顶栏动作区，与 diff/context/展开按钮同级。

显示条件：

```ts
session.providerId === "opencode" && Boolean(session.providerSessionId)
```

如果 session 还没有 providerSessionId，可隐藏或禁用。推荐隐藏，减少无效控件。

按钮图标：盾牌类图标。现有 `Icon` 组件如果支持 `shield`，直接使用；若不支持，需要先扩展图标集。

按钮 tooltip：

```text
权限
Manage permissions
```

### 7.3 面板内容

点击按钮弹出 popover。结构建议：

```text
当前会话权限
这些设置立即作用于当前 OpenCode 会话。

文件匹配      允许 询问 拒绝
内容搜索      允许 询问 拒绝
读取文件      允许 询问 拒绝
列出目录      允许 询问 拒绝
修改文件      允许 询问 拒绝
命令执行      允许 询问 拒绝
子任务        允许 询问 拒绝
读取网页      允许 询问 拒绝
网页搜索      允许 询问 拒绝
外部目录      允许 询问 拒绝
技能加载      允许 询问 拒绝
```

底部可选显示：

- “恢复默认权限”按钮：将当前 session 权限设为设置页默认值。
- “应用中...”状态：正在 PATCH OpenCode。
- 失败文案：显示为 session diagnostic 或面板内短错误。

### 7.4 当前有效权限计算

本地 session 保存：

```ts
openCodePermissionRules?: OpenCodePermissionRule[];
```

实时面板读取当前 session 保存的规则。若为空，回退到设置页默认规则。

有效 action 计算：

```ts
function effectiveAction(rules, permission) {
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    const rule = rules[index];
    if (rule.permission === permission && rule.pattern === "*") return rule.action;
  }
  return defaultActionForPermission(permission);
}
```

虽然 OpenCode 支持 wildcard permission，但第一版 UI 仅处理固定 permission key，保持可预测。

### 7.5 修改当前 session

新增 store action：

```ts
updateOpenCodeSessionPermission(sessionId: string, permission: string, action: OpenCodePermissionAction): Promise<void>
```

或批量版本：

```ts
updateOpenCodeSessionPermissions(sessionId: string, preset: OpenCodePermissionPresetItem[]): Promise<void>
```

建议第一版做单项即时更新，交互更直接。

调用逻辑：

1. 找到本地 session。
2. 确认 providerId 为 OpenCode。
3. 确认 providerSessionId 存在。
4. 生成一条新 rule：

```ts
{ permission, pattern: "*", action }
```

5. 调用 `client.updateSession(providerSessionId, { permission: [rule] })`。
6. 本地把 rule 追加到 `openCodePermissionRules`。
7. 写入 diagnostic，例如：

```text
OpenCode permission updated: bash -> ask
```

失败时不修改本地权限，并写入 warning/error。

### 7.6 运行中修改的行为边界

- 修改权限不会中断正在运行的模型调用。
- 新权限通常影响后续工具列表解析或后续工具调用审批。
- 如果模型当前调用已经触发 permission request，用户仍需通过现有审批 UI 响应该 request。
- 如果将 `bash` 从 `deny` 改为 `ask`，模型在下一次可用工具解析中才会看到 `bash`。
- 若希望马上让模型知道权限变化，用户可发送下一条消息；第一版无需自动注入系统提示。

## 8. 审批流关系

MLFB 已有 pending permission UI，包括：

- allow once
- allow for this session
- always allow
- reject

这套 UI 响应 OpenCode 发出的具体 permission request。

新的权限管理面板负责“默认策略”和“当前 session 策略”，不是替代具体审批弹窗。

两者关系：

- 默认设置页：决定新 session 初始权限。
- 顶栏权限面板：调整当前 session 后续策略。
- 当前状态审批条：处理已发生的具体工具请求。

例如：

1. 默认 `bash: ask`。
2. 模型请求运行 `npm test`。
3. OpenCode 发出 permission request。
4. MLFB 当前状态条显示命令审批。
5. 用户可允许一次、允许本 session、永久允许或拒绝。
6. 如果用户希望提前改变策略，可在顶栏权限面板把 `bash` 改为 `allow` 或 `deny`。

## 9. UI 风格与交互要求

### 9.1 设置页

- 使用现有 settings section、settings row、settings toggle/button group 风格。
- 权限项列表应紧凑，不使用大卡片堆叠。
- 每行左侧是权限名称和短说明，右侧是三段选择。
- `allow`、`ask`、`deny` 不使用过强颜色，避免页面显得像告警面板。
- 可在 section 顶部显示当前摘要，例如 “命令执行：询问”。

### 9.2 顶栏 popover

- 与 `AgentDiffIndicator` 和 `AgentContextIndicator` 的 popover 风格一致。
- 控件需要固定尺寸，避免切换后布局跳动。
- 不使用 hover-only 作为唯一入口；点击按钮打开。
- 如果面板需要关闭，点击外部或再次点击按钮关闭。
- 面板在窄屏下应限制宽度并允许内部滚动。

### 9.3 i18n

至少新增中英文 key：

- `settings.openCodePermissions`
- `settings.openCodePermissionsDesc`
- `settings.openCodePermissionAllow`
- `settings.openCodePermissionAsk`
- `settings.openCodePermissionDeny`
- `settings.openCodePermissionBash`
- `settings.openCodePermissionEdit`
- `agentConsole.permissions`
- `agentConsole.sessionPermissions`
- `agentConsole.restoreDefaultPermissions`
- `agentConsole.permissionUpdateFailed`

## 10. 数据结构建议

### 10.1 `openCodeSettings.ts`

新增：

```ts
export type OpenCodePermissionAction = "allow" | "ask" | "deny";

export interface OpenCodePermissionPresetItem {
  permission: string;
  action: OpenCodePermissionAction;
}

export interface OpenCodePermissionDefinition {
  permission: string;
  labelKey: string;
  defaultLabel: string;
  descriptionKey: string;
  defaultDescription: string;
  defaultAction: OpenCodePermissionAction;
  risk: "low" | "medium" | "high";
}
```

导出：

```ts
export const OPEN_CODE_PERMISSION_DEFINITIONS: OpenCodePermissionDefinition[];
export function getOpenCodeDefaultPermissionPreset(): OpenCodePermissionPresetItem[];
export function getOpenCodeDefaultPermissionRules(): OpenCodePermissionRule[];
export function setOpenCodeDefaultPermissionAction(permission: string, action: OpenCodePermissionAction): OpenCodeSettings;
export function openCodePermissionPresetToRules(preset: OpenCodePermissionPresetItem[]): OpenCodePermissionRule[];
```

### 10.2 `AgentSession`

新增字段：

```ts
openCodePermissionRules?: OpenCodePermissionRule[];
openCodePermissionUpdating?: boolean;
openCodePermissionError?: string;
```

如果希望减少 session 类型和 OpenCode 类型耦合，可在 `agent/types.ts` 定义轻量结构：

```ts
export interface AgentPermissionRuleState {
  permission: string;
  pattern: string;
  action: "allow" | "ask" | "deny";
}
```

但当前项目已有 `OpenCodePermissionRule`，直接引用也可接受。

### 10.3 Store action

在 `AgentStoreState` 增加：

```ts
updateOpenCodeSessionPermission: (sessionId: string, permission: string, action: OpenCodePermissionAction) => Promise<void>;
resetOpenCodeSessionPermissions: (sessionId: string) => Promise<void>;
```

实现上调用 `httpRuntime.runtime.client.updateSession`。

## 11. API 与同步细节

### 11.1 新建 session 初始化

如果 `updateSession(... permission)` 成功：

- 本地保存相同规则。
- diagnostic 可继续保持简洁，不一定每次记录所有权限。

如果失败：

- 保持 session 可用。
- 添加 warning diagnostic：

```text
Failed to apply OpenCode permissions: ...
```

现有代码已有类似 warning，可沿用。

### 11.2 实时修改当前 session

成功响应返回 `OpenCodeSessionInfo`，其中可能包含 merged permission。应优先使用返回值中的 `permission` 更新本地：

```ts
const updated = await client.updateSession(providerSessionId, { permission: [rule] });
const nextRules = Array.isArray(updated.permission) ? updated.permission : [...currentRules, rule];
```

这样能更贴近 OpenCode 真实状态。

### 11.3 session restore

`refreshAgentSession` 或恢复已有 OpenCode session 时，如果 provider session info 包含 `permission`，应同步到本地 `openCodePermissionRules`。

如果当前 client 没有单 session get，可以在已有 providerSessions 列表里匹配 providerSessionId。

### 11.4 merge 膨胀问题

由于 OpenCode 每次更新 permission 都 merge，频繁切换会导致 session permission 历史规则增长。

第一版可接受，因为规则数很小。但 UI 显示时要计算有效规则，不要逐条显示历史。

后续如果 OpenCode 提供 replace semantics 或支持清理，可再优化。

## 12. 风险与决策点

### 12.1 默认 `bash` 应该是什么

推荐默认 `bash: ask`。

原因：

- `deny` 会让模型完全看不到命令执行能力，影响 Agent 编程体验。
- `allow` 风险太高，尤其是安装依赖、删除文件、修改系统状态等命令。
- `ask` 能让模型提出命令请求，同时保留用户审批。

### 12.2 默认 `edit` 应该是什么

推荐默认 `edit: ask`。

这延续现有文件编辑审批逻辑，也符合用户对 diff 审批的需求。

### 12.3 默认 `webfetch` / `websearch`

推荐默认 `ask`。

如果未来希望更流畅，可提供“网络访问默认允许”的用户选项，但第一版不要直接放宽。

### 12.4 顶栏按钮是否总是显示

推荐仅对 OpenCode active session 显示。

非 OpenCode provider 当前不存在；preview mode 不显示，避免设置预览里出现无效按钮。

### 12.5 是否需要区分设置页默认和当前 session

必须区分。

设置页是模板，当前 session 是实例。修改模板不应静默影响运行中的 session，避免权限在用户不注意时变化。

## 13. 实施步骤

### Phase 1：设置模型

- 修改 `app/src/openCodeSettings.ts`。
- 增加权限定义、默认 preset、normalize 兼容逻辑。
- 增加 set/get helper。
- 保持旧 localStorage 数据兼容。

### Phase 2：设置页 UI

- 修改 `app/src/components/SettingsDialog.tsx`。
- 在 OpenCode tab 添加默认权限 section。
- 添加三段式 action 控件。
- 补充中英文 i18n。
- 复用现有 settings 样式，必要时在 `app/src/index.css` 增加少量 class。

### Phase 3：新建 session 使用默认权限

- 修改 `app/src/store/agentStore.ts`。
- 替换 `openCodeReadOnlyPermissionRules()`。
- 两处创建 providerSessionId 的逻辑使用 `getOpenCodeDefaultPermissionRules()`。
- 成功后将权限存入本地 session。

### Phase 4：session 当前权限状态

- 修改 `app/src/agent/types.ts` 增加当前 OpenCode 权限字段。
- 修改 session factory 默认值。
- 修改 provider session restore/refresh 逻辑，尽可能同步 OpenCode 返回的 permission。

### Phase 5：实时权限 store action

- 在 `AgentStoreState` 增加实时更新权限 action。
- 调用 OpenCode `updateSession`。
- 成功时更新本地 `openCodePermissionRules`。
- 失败时记录 diagnostic。
- 增加 reset to defaults action。

### Phase 6：顶栏权限面板

- 新增组件，例如：

```text
app/src/components/agent/AgentPermissionIndicator.tsx
```

- 放入 `AgentSessionHeader` 顶栏 actions。
- 展开详情行中也可显示，和 diff/context 保持一致。
- 使用固定权限列表和 segmented control。
- 支持恢复默认。

### Phase 7：验证与整理

- 运行 TypeScript/Vite 构建。
- 手动验证新 session 默认权限。
- 手动验证将 `bash` 改为 ask 后模型能看到命令工具。
- 手动验证运行中把 `bash` 切换为 deny 后后续工具不可用。
- 手动验证 edit 审批和 diff 审批不回退。

## 14. 验证计划

### 14.1 构建验证

```text
cd app && npm run build
```

### 14.2 设置页验证

- 打开设置页 OpenCode tab。
- 能看到默认权限列表。
- 切换权限后关闭再打开，状态保持。
- 旧 localStorage 无权限字段时能正常填充默认值。

### 14.3 新 session 验证

- 默认 `bash: ask`。
- 新建 OpenCode session，询问“你可以执行 CLI 命令吗”。
- 期望模型不再回答“我没有 bash 工具”。
- 请求执行安全命令时，应出现 permission request。

### 14.4 实时面板验证

- 已有 OpenCode session 顶栏显示权限按钮。
- 修改 `bash` 为 deny，发送下一条消息要求执行命令。
- 期望模型看不到或无法使用 bash。
- 修改 `bash` 为 ask，再发送命令请求。
- 期望触发 permission request。
- 点击恢复默认后，当前 session 回到设置页默认策略。

### 14.5 回归验证

- 文件编辑仍触发审批。
- permission approval row 仍能 allow once/session/always/reject。
- diff indicator 与 context indicator 顶栏布局不被挤压。
- 预览模式不显示无效实时权限按钮。

## 15. 推荐第一版默认方案

第一版推荐采用以下产品策略：

```text
新 session 默认：bash ask、edit ask、external_directory deny、读搜索 allow、网络 ask、task ask、skill ask。
当前 session：允许用户在顶栏即时调整，并可恢复设置页默认。
```

这能解决“OpenCode 缺少命令执行能力”的核心问题，同时保留用户对高风险操作的明确控制。

## 16. 后续增强

第一版完成后，可以考虑：

- 为 `bash` 增加命令模式提示，例如“允许后仍会展示具体命令审批”。
- 增加“只读模式 / 安全开发模式 / 自动化模式”预设。
- 支持按 workspace 保存不同默认权限。
- 支持高级规则，例如特定 path、特定命令 pattern。
- 在会话创建页显示当前默认权限摘要。
- 对 `allow` 风险操作增加二次确认。
