---
title: OpenCode无ACP实装与Agent会话UI重构续接摘要
description: 记录OpenCode无ACP落地、Agent会话UI重构与最新设置扩展状态
workplace: e:\Dev\my-last-feedback
project: my-last-feedback
type: coding
solved_lists:
  - 完成 OpenCode HTTP/SSE 替换 ACP 活路径并删除 app/src/agent/acp
  - 完成 Agent Console 会话管理器统一会话列表与自动加载
  - 完成 OpenCode agents/models/todos/history 恢复与流式去重修复
  - 完成 Markdown 数学公式与 Mermaid 渲染接入
  - 完成 Agent Chat 与会话管理器独立设置页
---

# OpenCode无ACP实装与Agent会话UI重构续接摘要

## 1. Previous Conversation
本轮对话最初围绕“继续完成 ACP 实施的下一规划，准备开发真实的 ACP 连接”展开，但很快根据对 OpenCode 官方实现路径的验证结论发生战略转向：不再把 OpenCode 作为 ACP provider 接入，而是直接采用 OpenCode CLI/server 的 HTTP + SSE 通道，并逐步删除仓库内所有 ACP 活路径与相关命名。

随后工作流分成四个连续阶段：

1. 协议与能力验证阶段
   - 独立探测 OpenCode HTTP API、SSE、session create/list/rename/delete、prompt_async、tool lifecycle、permission asked、abort。
   - 结论是 OpenCode 官方可行路径是 HTTP/SSE，而不是 ACP。

2. 基础设施替换阶段
   - 新建 OpenCode HTTP client、server runtime、event normalizer、types、barrel exports。
   - 在 agentStore 中接入启动本地 OpenCode server、建立 SSE 连接、发送 prompt、会话恢复、会话重命名/删除、权限应答、abort。

3. 去 ACP 与 UI 统一阶段
   - 移除 store 内部 ACP runtime/client/list/load/prompt fallback。
   - 删除 app/src/agent/acp 目录与 provider 中旧 ACP 常量。
   - 将可见文案、Settings key/class、Session Manager 行为从 ACP 时代的“provider 生命周期/能力探测”模式，逐步改成 OpenCode 会话中心模式。

4. 深化 UI/交互重构阶段
   - Session Manager 从“Frontend sessions / Provider sessions + 刷新/启动/停止 provider”改成统一会话列表、自动加载、左侧栏风格。
   - Header 去掉 session dots、启动/停止 provider 暗示、runtime 诊断中心式信息。
   - Composer 改成直接发送与中止当前运行，模型/agent 选择更贴近 OpenCode。
   - 继续扩展 Markdown 能力、Agent 设置项、历史恢复与 todo/todowrite 展示质量。

整个会话中，用户持续强调一个核心方向：不要把 OpenCode 的内部适配层或 provider 生命周期暴露给用户，要把 UI 还原成围绕“会话、对话、任务、结果”的正常产品体验。

## 2. Current Work
在收到本次 compact 请求之前，最近一段连续工作集中在“继续清理 Agent Console 导航栏/顶部区域的配置与显示方式”，并且已经做出以下最新状态：

1. Agent 设置页结构已经继续拆分
   - Agent 分组下已经不再只保留一个 Agent Console 页面，而是拆出：
     - agentConsole：导航栏/顶栏视觉相关设置
     - agentChat：聊天行为设置
     - agentSessionManager：会话管理器设置
     - openCode：OpenCode 模型库设置

2. Agent 会话管理器设置已落地
   - 新增“自动清理空会话”开关。
   - 新增“立即清理空会话”按钮与清理状态提示。
   - 清理逻辑已经扩展到：
     - 清理本地空 AgentSession
     - 对远端 OpenCode session 调用 messages(sessionId)，以 messages.length === 0 判定空会话后再执行 deleteSession
   - 这一步是为了解决标题为 “New session - 时间戳” 的远端空会话无法被本地判定清理的问题。

3. Agent 历史恢复与过程显示已经被修正
   - 恢复会话时会读取 OpenCode messages 与 todos。
   - 连续 assistant 历史消息会合并回同一条 MLFB assistant message，避免过程时间线被拆碎。
   - todowrite 不再只作为普通 tool_call 展示，而会归一化成 task_list block。
   - SSE delta / part updated 之间的重复文本问题已通过 partId 绑定和缓冲清理处理。

4. Markdown 渲染能力已增强
   - MarkdownContent 接入 remark-math + rehype-katex + KaTeX CSS。
   - Mermaid fenced code block 已通过动态 import("mermaid") 渲染为 SVG。
   - 正常 Mermaid 渲染时不再包裹代码块外壳。
   - 同时明确记录：没有开放 HTML 渲染，也没有做上下标扩展。

5. 最新且尚未完成收口的一步
   - 最近最后一段实际工作是在 Agent 顶部/导航栏设置里继续增加两个可配置项：
     - 默认展开顶栏第二行
     - 显示顶部粘滞用户消息行
   - 这些字段已经可以在当前代码中看到：

```ts
export interface AgentConsoleSettings {
  diffIndicatorMode: AgentTopbarIndicatorMode;
  contextIndicatorMode: AgentTopbarIndicatorMode;
  smoothStreamingOutput: boolean;
  autoCleanupEmptySessions: boolean;
  processStepDefaultMode: AgentProcessStepDefaultMode;
  showMessageSpeakerLine: boolean;
  defaultExpandHeaderDetails: boolean;
  showStickyUserMessageBar: boolean;
  diffVisual: AgentDiffVisualSettings;
}
```

   - 当时我在准备做最后一轮 focused verification。离开点的原话是：

> “第一轮检查通过了，没有类型诊断和空白错误。我再跑一次前端构建，确保设置持久化字段和两个新 hook 接入没有隐藏的编译问题。”

也就是说，最近的主线任务已经做完实现，待续接时最自然的下一步是对这两个新设置相关改动做一次最终构建与实际 UI 验证。

## 3. Key Technical Concepts
- Tauri + React + TypeScript + Zustand
- OpenCode CLI/server HTTP API
- SSE 事件流与本地流式文本平滑输出
- OpenCode session create/list/status/message/todo/prompt_async/abort/permissions
- Basic Auth + 本地随机端口运行 opencode serve
- Agent Console 自定义 block 协议
- normalizeOpenCodeEvent / normalizeOpenCodePart / normalizeOpenCodeTodos
- 历史 assistant message 合并恢复
- todowrite -> task_list 归一化
- Agent Chat / Agent Session Manager / Agent Console 分页设置结构
- localStorage 持久化 AgentConsoleSettings 与 OpenCodeSettings
- 自动清理本地空会话 + 远端空会话
- Markdown 扩展：remark-gfm、remark-breaks、remark-math、rehype-katex
- Mermaid 动态加载渲染
- Session Manager 向 MLFB 左侧栏风格靠拢
- 移除 ACP 协议实现、可见文案与设置命名
- Windows + MINGW64 环境下反复执行 npm run build 验证
- ES2020 限制下避免 Array.at 等较新 API
- 当前仓库存在历史 Vite warning：大 chunk 与动态导入提示，但不阻断构建

## 4. Relevant Files and Code
### app/src/store/agentStore.ts
- 当前最核心的状态与运行时编排文件。
- 已完成：
  - OpenCode HTTP runtime map 与 server 启动
  - prompt_async / abort / permissions / sessions / restore / rename / delete
  - OpenCode providers + agents -> availableModels / availableModes
  - normalizeOpenCodeTodos 接入
  - cleanupEmptySessions 远端空会话清理
- 关键片段：

```ts
const openCodeHttpRuntimes = new Map<string, AgentOpenCodeHttpRuntimeEntry>();

function choicesFromOpenCodeAgents(agents: OpenCodeAgentInfo[]): AgentChoiceOption[] {
  const visiblePrimaryAgents = agents.filter((agent) => !agent.hidden && (agent.mode === "primary" || agent.mode === "all"));
  const visibleAgents = visiblePrimaryAgents.length > 0 ? visiblePrimaryAgents : agents.filter((agent) => !agent.hidden);
  return visibleAgents
    .map((agent) => toChoiceOption(agent.name, agent.name, agent.description, agent))
    .filter((option): option is AgentChoiceOption => Boolean(option));
}
```

- 重要现状：store 已完全摆脱 ACP 活路径，但内部仍保留 providerSessionLists / providerSessionId 等数据名，更多是历史兼容层而非用户可见语义。

### app/src/agent/opencode/httpClient.ts
- OpenCode HTTP API 封装。
- 已覆盖：health、providers、config、agents、listSessions、sessionStatuses、create/update/delete session、messages、todos、promptAsync、abort、respondPermission、openEvents、openGlobalEvents。
- 这是所有前端能力与 OpenCode 通信的入口。

### app/src/agent/opencode/httpTypes.ts
- OpenCode HTTP/SSE 类型定义。
- 当前应继续作为后续补 agent/config/context usage 时的第一落点。

### app/src/agent/opencode/serverRuntime.ts
- 负责启动本地 opencode serve，并等待健康检查通过。
- 依赖从 ACP types 已迁移到通用 processTypes。

### app/src/agent/opencode/eventNormalizer.ts
- 当前无 ACP 时代以来最关键的归一化层之一。
- 负责把 SSE / 历史消息 part 映射到 Agent UI block。
- 已新增对 todo/todowrite 与 tool/status/error 的处理。

### app/src/agent/processTypes.ts
- 从原 ACP types 中拆出的通用进程类型。
- 使 OpenCode runtime 不再依赖 ACP 协议模块。

### app/src/components/agent/AgentSessionManagerPanel.tsx
- 最近几轮重构最频繁的 UI 文件之一。
- 当前状态：
  - 统一会话列表
  - 自动加载 provider sessions
  - 顶部左侧“新建会话”，右侧手动刷新
  - 时间分组 Today/Yesterday/Last week/Earlier
  - 行样式向 MLFB Sidebar 的 session-item 靠拢
  - 行 hover 只保留 rename/delete
  - avatar hover 显示昵称/编码/session id
  - 时间与 folder 显示已对齐，并支持 title 展示完整时间和路径
- 关键片段：

```tsx
<div className="agent-session-manager-toolbar">
  <button type="button" className="agent-session-manager-new-button" onClick={() => createNewSession()}>
    <Icon name="plus" size={12} />
    <span>{t("agentSessions.newSession", "New session")}</span>
  </button>
  <button
    type="button"
    className="agent-session-manager-refresh-button"
    onClick={() => void runAction("refresh", async () => {
      autoLoadedProvidersRef.current.clear();
      await Promise.all(providers.map((providerId) => refreshProviderSessions(providerId)));
    })}
  >
    <Icon name="refresh" size={12} />
  </button>
</div>
```

### app/src/components/agent/AgentSessionHeader.tsx
- 现在已经非常收敛：
  - 不再显示 session dots
  - 不再显示 start/stop provider 按钮
  - 只保留 caller identity、token stats、diff/context indicator、expand details 按钮
  - 读取 defaultExpandHeaderDetails 设置

### app/src/components/agent/AgentHeaderDetailsRow.tsx
- 曾经承载 runtime transport/status 文案。
- 最近方向是进一步减弱 provider/runtime 暴露，保留对用户真正有价值的信息。

### app/src/components/agent/AgentComposer.tsx
- 已改成：
  - 运行中发送按钮变为红色 abort
  - mode/model 选择器不再强依赖 runtime initialized
  - 继续通过 bottomLeftSlot 提供 OpenCode model/agent 选择
- 当前 bottomLeftSlot 仍是后续继续优化聊天主路径的重要位置。

### app/src/components/SettingsDialog.tsx
- 最新大变更集中区。
- 当前已拆出：agentConsole、agentChat、agentSessionManager、openCode 等 Agent 子页。
- 会话管理器设置与清理按钮已接入 useAgentStore.cleanupEmptySessions。
- 本次 compact 前的最后工作，就是在这里继续加入：
  - 默认展开顶栏第二行
  - 顶部粘滞用户消息行

### app/src/agentConsoleSettings.ts
- Agent 设置持久化源。
- 当前已经包含：
  - autoCleanupEmptySessions
  - defaultExpandHeaderDetails
  - showStickyUserMessageBar
  - smoothStreamingOutput
  - processStepDefaultMode
  - showMessageSpeakerLine
  - diffIndicatorMode / contextIndicatorMode / diffVisual

### app/src/components/MarkdownContent.tsx
- 近期新增的重要渲染能力文件。
- 已接入：
  - remarkMath
  - rehypeKatex
  - KaTeX CSS
  - MermaidBlock 动态渲染
- 关键片段：

```tsx
<ReactMarkdown
  remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
  rehypePlugins={[rehypeKatex]}
  components={{ code: CodeBlock, a: LinkRendererWithDir, p: ParagraphRenderer, li: ListItemRenderer, td: TableCellRenderer, th: TableHeaderRenderer }}
>
  {markdown}
</ReactMarkdown>
```

### app/src/index.css
- 承载大量 Agent Console / Session Manager / Mermaid 渲染样式。
- 注意：本文件在本轮中被用户/格式化器/其他自动工具动过，续接前应重新读取相关区段。

### app/src/i18n/locales/en.json
### app/src/i18n/locales/zh.json
- 最近反复发生结构性变更。
- 已包含 agentChat / agentSessionManager / cleanup / sticky user bar / default expand header 等文案。
- 这两个文件也被额外编辑过，续接前应重新读取相应区块，避免覆盖。

### app/src/agent/acp/client.ts
### app/src/agent/acp/lineBuffer.ts
### app/src/agent/acp/types.ts
- 已删除。
- 这是无 ACP 迁移的一条重要完成线。

### .myLastChat/MLC_Markdown渲染能力说明.md
- 已存在的 MLC 文档。
- 用于记录为何接入数学与 Mermaid、为何暂缓 HTML / 上下标支持。

## 5. Problem Solving
已经解决的核心问题如下：

1. OpenCode 能力路径判断错误
- 早期假设是真实接入 ACP。
- 通过独立 probe 验证，确认 OpenCode 官方可用路径是 HTTP/SSE，ACP 只是旧兼容层或不完整路径。
- 因而整套实现转向 HTTP/SSE，并逐步清除 ACP。

2. store 内 ACP 活路径与残留引用
- 多轮构建曾暴露未使用 ACP import、AcpClient、session list normalize、old fallback helper 等错误。
- 通过渐进删除和每轮 `npm run build` 收口，最终删除了 app/src/agent/acp 目录并迁移 process types。

3. Session Manager 被 ACP 时代“provider 生命周期”绑架
- 用户明确指出：
  - “当前区分前端session和provider session毫无意义。”
  - “现在依然需要用户刷新才能获得session列表，似乎依旧存在‘启动’这个过程。”
  - “我不理解当前‘停止provider’按钮有什么含义，我认为是毫无意义的，它暗示我们当前依然需要启动。”
- 之后连续重构为：
  - 自动加载 session
  - 统一会话列表
  - 去掉 start/stop provider 的主路径暴露
  - Session Manager 向左侧栏记录列表靠拢

4. 历史恢复与流式显示不稳定
- 历史 assistant message 被拆散、tool step 丢失、todo 恢复不完整、todowrite 只显示 JSON。
- 通过：
  - 合并连续 assistant messages
  - normalizeOpenCodeTodos
  - todowrite -> task_list block
  - delta / updated 去重
  解决了大部分恢复与流式质量问题。

5. 空会话清理不生效
- 表面原因是清理只处理本地 session，不处理远端 OpenCode session。
- 根因是 OpenCode 默认 session 标题为 “New session - 时间戳”，标题无法判断是否为空；必须请求 `/session/:id/message`。
- 解决方式：cleanupEmptySessions 现在远端逐个检查 messages.length === 0 后才 delete。

6. Markdown 渲染能力不足
- 数学公式、Mermaid 图表无法自然显示。
- 已接入 KaTeX 与 Mermaid。
- 同时保持安全边界：未开启 HTML 渲染，未扩展上下标。

7. 设置页结构混乱
- 用户指出“聊天行为不应该混在 Agent Console 显示页里”“会话管理器应该是独立设置页”。
- 现在已经拆页处理，设置结构更接近真实功能边界。

## 6. Pending Tasks and Next Steps
以下是仍然待续接或自然应该继续验证的工作项：

- 完成最近顶部导航栏设置改动的最终 focused validation
  - 直接引用最近离开点：

> “第一轮检查通过了，没有类型诊断和空白错误。我再跑一次前端构建，确保设置持久化字段和两个新 hook 接入没有隐藏的编译问题。”

  - 这意味着续接时第一步应是：
    1. 在 app 下运行一次 `npm run build`
    2. 跑 `get_errors app`
    3. 手动验证 SettingsDialog 中这两项是否真实驱动 UI：
       - `defaultExpandHeaderDetails`
       - `showStickyUserMessageBar`

- 对最新 Agent 顶部/聊天行为做一次实际 UI 验证
  - 确认 Header 默认展开行为与设置同步。
  - 确认粘滞用户消息行只在滚动越过最近用户消息时出现。
  - 确认相关样式没有被 index.css 的近期外部变更覆盖。

- 检查 Session Manager 自动加载与统一列表是否仍需进一步简化
  - 当前顶层仍保留 provider 维度 section，但已不再强调 provider 生命周期。
  - 如果用户继续要求“像左侧栏一样”，可以进一步考虑是否直接移除 provider section 容器，只保留一份全局统一时间分组列表。

- 继续审查内部历史命名债务
  - 当前可见 UI 已摆脱 ACP，但 store 内部仍存在：
    - providerSessionLists
    - providerSessionId
    - providerSessionState
  - 如果后续要继续“彻底从概念层摆脱 provider 适配层”，可以评估是否要把这些内部字段重命名成更通用的 remoteSession / opencodeSession 语义。

- 若继续 Agent UI 体验优化，优先顺序建议为：
  1. 完成顶部导航设置最终验证
  2. 手动验证 session restore / rename / delete / cleanupEmptySessions
  3. 再继续清理 HeaderDetailsRow 与 SessionManager 中剩余技术味较强的信息

- 最近用户明确推动方向的原话，后续应持续遵守：

> “我认为当前区分前端session和provider session毫无意义。”

> “现在依然需要用户刷新才能获得session列表，似乎依旧存在‘启动’这个过程。”

> “我不理解当前‘停止provider’按钮有什么含义，我认为是毫无意义的，它暗示我们当前依然需要启动。”

这些话表明，后续所有 Agent UI 设计都应继续遵循：
- 主路径围绕“会话/消息/任务/结果”而不是“provider/runtime”
- 自动连接应默认发生，不应成为显式用户动作
- 设置分组要按用户心智组织，而不是按底层实现层次组织
