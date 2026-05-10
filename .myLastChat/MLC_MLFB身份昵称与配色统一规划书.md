---
title: MLFB 身份昵称与配色统一规划书
description: 统一 agent 昵称、头像、caller 与 workspace 配色
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - MLFB
  - identity
  - workspace
  - ui
solved_lists:
  - 分析 agent 昵称来源分散问题
  - 分析 caller/session/workspace 配色不统一问题
  - 规划前端身份 helper 与后端 workspace registry 演进
---

# MLFB 身份昵称与配色统一规划书

## 1. 背景

MLFB 当前已经开始统一 workspace path 的管理逻辑，但 agent 身份展示和颜色分配仍然分散在多个层级：

- MCP 层负责生成或传递 `agent_name` / `alias`。
- Rust 后端负责注册 caller，并按 caller/workspace name 分配颜色。
- 前端多个组件各自决定显示 `caller.name`、`caller.alias`、`getFriendlyName(caller.alias)` 或 workspace basename。
- Agent Console / Opencode session 只携带 cwd/provider/session 信息，缺少显式 MLFB agent identity。
- Avatar 图案、caller 色、workspace 色、timed Git 色、MLC/Resource target tab 色与标签还没有统一来源。

这会导致用户看到的同一个 agent 在不同位置呈现出不同名称或颜色。例如：

- 有的位置显示 raw alias：`A58E` 或 `TEST`。
- 有的位置显示 caller.name 或 workspace folder name。
- 有的位置显示神话昵称：`宙斯`。
- 有的位置无法知道 Opencode 属于哪个 MLFB caller，只能通过 workspace path 反查。
- 同一 workspace 的多个 caller 有时共享颜色，有时可能因为手动改色或推断路径不同而分裂。

本规划目标是建立统一身份模型，让 MLFB、Opencode、MLRA 以及未来更多来源都遵循同一套身份、昵称、头像和颜色规则。

## 2. 当前术语澄清

### 2.1 alias / agent_name

`alias` 是 MLFB 当前在前端存储的字段，本质上对应 MCP tool 要求 agent 带回的 `agent_name`。

典型值是 4 字符大写十六进制或大写字母数字标识，例如：

```text
A58E
```

它应被视为 agent 身份主键，而不是最终展示文本。

### 2.2 agent nickname

agent nickname 是通过 alias 派生的神话昵称。

当前实现位于：

```text
app/src/components/friendlyName.ts
```

核心函数：

```ts
getFriendlyName(agentId, lang)
```

示例：

```text
A58E -> 宙斯
```

未来该能力不应继续放在 components 语义下，而应属于 identity 层。

### 2.3 caller.name

`caller.name` 当前语义混杂：

- 可能是 workspace/folder name。
- 可能被 UI rename。
- 可能被当作分组名或显示名。

它不应再作为 agent nickname 的主来源。

### 2.4 clientName

`clientName` 表示调用来源或客户端，例如 VS Code、Copilot、Claude Code、Opencode 等。

它适合用于诊断或次级信息，不适合作为 agent 昵称。

### 2.5 workspaceKey

workspaceKey 是对 workspace path 归一化后的稳定 key。

前端当前已有：

```text
app/src/workspace/workspacePaths.ts
```

其中：

```ts
workspacePathKey(path)
```

未来 workspace 配色和 workspace 归属都应以它为基础。

## 3. 当前问题

### 3.1 昵称生成分散

当前多个组件直接或间接使用：

```ts
getFriendlyName(caller.alias)
```

但另一些组件使用：

```ts
caller.alias || caller.name
caller.name || caller.alias
workspaceBasename(path)
```

结果是同一个 agent 在不同位置可能显示不同文本。

### 3.2 helper 层级不合理

`friendlyName.ts` 位于 components 目录，但它不是 UI component，而是 identity 规则。

这会导致：

- 非组件逻辑不方便复用。
- workspace helper 如果要使用昵称，会不自然地反向 import components。
- 新功能容易重复实现昵称逻辑。

### 3.3 workspace target label 只是局部拼接

当前 target tab 已经修正为：

```text
MLFB 宙斯
Opencode 宙斯
```

但这是局部实现。未来应由统一函数生成：

```ts
formatWorkspaceTargetLabel(identity)
```

### 3.4 配色按 caller.name，而不是 workspaceKey

Rust 后端当前按 `caller.name` 复用颜色。

这存在风险：

- 相同 basename 的不同路径可能共用颜色。
- rename 可能改变或混淆颜色语义。
- workspace path 统一化后，颜色仍未接入 workspacePathKey。

### 3.5 手动改色没有 workspace 级传播

`update_caller_color` 当前只更新单个 caller。

如果产品语义是“caller 颜色本身表示 workspace”，那么手动改色应作用于 workspace identity，并同步所有同 workspaceKey 的 caller 与 panel。

### 3.6 Opencode 缺少 owner identity

Agent Console / Opencode session 当前主要携带：

- providerId
- providerSessionId
- cwd
- title

它没有显式保存：

- ownerAlias
- ownerNickname
- workspaceColorKey

因此 MLC/Resource 只能通过 cwd 反查 MLFB caller。这是临时方案，不是可靠架构。

## 4. 目标模型

### 4.1 AgentIdentity

AgentIdentity 表示“是谁”。

建议类型：

```ts
export interface AgentIdentity {
  alias: string;
  nickname: string;
  displayLabel: string;
  avatarSeed: string;
  clientName?: string;
  source: AgentIdentitySource;
}

export type AgentIdentitySource = "mlfb" | "opencode" | "mlra" | "unknown";
```

规则：

- `alias` 是身份主键。
- `nickname` 由 alias 派生。
- `displayLabel` 默认可为 `nickname` 或 `nickname (alias)`。
- `avatarSeed` 默认使用 alias。
- 没有 alias 时才 fallback 到 session id / workspaceKey / caller id。

### 4.2 WorkspaceIdentity

WorkspaceIdentity 表示“在哪个工作区”。

建议类型：

```ts
export interface WorkspaceIdentity {
  workspaceKey: string;
  workspacePath: string;
  displayName: string;
  color: string;
  ownerAlias?: string;
  ownerNickname?: string;
}
```

规则：

- `workspaceKey` 由 `workspacePathKey(path)` 得出。
- `displayName` 优先 workspace folder name，后续可支持用户自定义。
- `color` 由 workspaceKey 稳定生成或后端 registry 持久化。
- 同 workspaceKey 的 MLFB caller、Opencode session、Terminal、MLC、Resource、timed Git 应共享颜色。

### 4.3 TargetLabel

目标 tab 应通过统一函数格式化。

建议类型：

```ts
export type WorkspaceTargetSource = "mlfb" | "opencode" | "mlra" | "unknown";

export function formatWorkspaceTargetLabel(args: {
  source: WorkspaceTargetSource;
  agent?: AgentIdentity | null;
  workspace?: WorkspaceIdentity | null;
}): string;
```

规则：

- MLFB + agent nickname：`MLFB 宙斯`
- Opencode + agent nickname：`Opencode 宙斯`
- MLRA + role/nickname：`MLRA CEO 宙斯` 或后续定义
- 无 agent nickname：fallback 到 workspace displayName

## 5. 推荐文件结构

### 5.1 前端 identity 层

新增：

```text
app/src/identity/agentIdentity.ts
app/src/identity/workspaceIdentity.ts
app/src/identity/identityLabels.ts
```

或先简化为：

```text
app/src/identity/identity.ts
```

### 5.2 迁移 friendlyName

当前：

```text
app/src/components/friendlyName.ts
app/src/components/useFriendlyName.ts
```

建议迁移为：

```text
app/src/identity/friendlyName.ts
app/src/identity/useAgentIdentity.ts
```

短期兼容策略：

- 先新增 identity 版本。
- components 里的旧文件 re-export 新实现。
- 逐步把 import 迁到 identity 层。

## 6. 前端第一阶段实施计划

第一阶段只统一显示层，不改后端 schema。

### 6.1 新建 identity helper

新增：

```ts
agentNickname(alias, lang)
resolveAgentIdentity(input, lang)
formatAgentDisplayLabel(identity, mode)
formatWorkspaceTargetLabel(input)
```

### 6.2 替换高频昵称入口

优先替换：

- FeedbackInput placeholder。
- CallerManager caller row。
- SummaryPanel questions header。
- MlcSidePanel target tab。
- ProjectResourcePanel target tab。

### 6.3 统一 avatar seed

统一使用：

```ts
identity.avatarSeed
```

避免各处自行决定 `caller.alias || caller.id`。

### 6.4 保留现有 UI 行为

第一阶段只抽象规则，不大改视觉。

不改：

- 后端颜色生成。
- caller 数据结构。
- 手动改色逻辑。
- AgentSession schema。

## 7. 第二阶段：workspace color 前端统一

### 7.1 workspace color resolver

新增：

```ts
resolveWorkspaceColor(workspacePath, knownCallers, fallback)
```

使用顺序：

1. 后端 caller.color，如果能按 workspaceKey 匹配。
2. 前端稳定生成色，基于 workspaceKey。
3. 默认 primary color。

### 7.2 替换 callerColor 使用点

逐步替换：

- CallerPanel border。
- Sidebar active item。
- SummaryPanel。
- MLC/Resources active target。
- timed Git countdown。
- Agent Console composer。

### 7.3 明确语义

未来推荐语义：

```text
agent nickname 表示人
workspace color 表示工作区
source label 表示入口/通道
```

即：

- `宙斯` 是人。
- `#abc123` 是 workspace 色。
- `MLFB` / `Opencode` 是来源。

## 8. 第三阶段：后端 workspace registry

### 8.1 新增持久化结构

建议历史文件中增加：

```json
{
  "workspaces": {
    "e:/dev/my-last-feedback": {
      "path": "E:\\Dev\\my-last-feedback",
      "displayName": "my-last-feedback",
      "color": "#..."
    }
  }
}
```

### 8.2 caller 注册时绑定 workspaceKey

`ensure_caller` 需要能拿到 project_directory 或 workspacePath。

当前 caller 注册只有：

```rust
ensure_caller(name, version, client_name, alias)
```

未来应扩展为：

```rust
ensure_caller(name, version, client_name, alias, workspace_path)
```

或传入结构体，避免参数继续膨胀。

### 8.3 颜色迁移

迁移规则：

1. 对历史 session 的 projectDirectory 计算 workspaceKey。
2. 将同 workspaceKey 的 caller color 聚合为 workspace color。
3. 如果冲突，优先最近活跃 caller 或保留第一个并记录迁移日志。
4. caller.color 可继续缓存，但来源是 workspace registry。

## 9. 第四阶段：Opencode owner 显式化

### 9.1 AgentSession 增加 owner 字段

建议：

```ts
ownerAlias?: string;
workspaceKey?: string;
```

### 9.2 创建 Agent session 时写入 ownerAlias

当从 MLFB caller 上下文打开 Agent Console 或创建 session 时，写入当前 caller alias。

### 9.3 fallback 逻辑

如果历史 session 没有 ownerAlias：

1. 通过 workspaceKey 反查最近 MLFB caller alias。
2. 再 fallback 到 workspace basename。
3. 最后 fallback 到 provider label。

## 10. 验收标准

### 10.1 昵称一致

同一个 alias 在所有位置显示同一个 nickname：

- Caller list。
- Feedback placeholder。
- Questions header。
- MLC target tab。
- Resource target tab。
- Submitted payload routing 辅助显示。
- Agent Console 关联显示。

### 10.2 颜色一致

同一个 workspaceKey 在所有位置使用同一 workspace color：

- caller panel border。
- session avatar color。
- MLC/Resource active tab。
- timed Git countdown。
- Opencode session target。

### 10.3 语义不混淆

UI 中不再把以下字段混作同一概念：

- agent alias
- agent nickname
- clientName
- workspace name
- workspace path
- caller rename name

### 10.4 兼容历史数据

历史 caller/session 不丢失：

- 没有 alias 时 fallback 到 name/id。
- 没有 workspacePath 时 fallback 到 caller.color。
- 没有 ownerAlias 的 Opencode session 可以通过 workspaceKey 反查。

## 11. 立即实施建议

当前最适合立即做 Phase 1：

1. 新建 `app/src/identity/friendlyName.ts`。
2. 新建 `app/src/identity/agentIdentity.ts`。
3. 让 `components/friendlyName.ts` re-export identity 实现，保持兼容。
4. 替换 MLC/Resource target tab 当前直接 import `components/friendlyName.ts` 的做法。
5. 替换 FeedbackInput、CallerManager、SummaryPanel 的昵称生成入口。
6. 构建验证并提交。

这一阶段收益大、风险低，而且能立刻阻止“哪里用 name，哪里用 alias，哪里用 nickname”的继续扩散。
