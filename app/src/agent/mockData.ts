import type { AgentContentBlock, AgentMessage, AgentSession } from "./types";

const MOCK_CREATED_AT = "2026-05-06T09:00:00.000Z";

function processOrigin(groupId: string) {
  return { phase: "process" as const, placement: "standalone" as const, groupId, group_id: groupId };
}

function resultOrigin() {
  return { phase: "result" as const, placement: "standalone" as const };
}

const MOCK_AGENT_CONSOLE_DIFF = `diff --git a/app/src/components/agent/AgentProcessGroup.tsx b/app/src/components/agent/AgentProcessGroup.tsx
index 3f2c8ac..9a7f1de 100644
--- a/app/src/components/agent/AgentProcessGroup.tsx
+++ b/app/src/components/agent/AgentProcessGroup.tsx
@@ -78,11 +78,17 @@ function StepDetail({ step, projectDirectory }: StepDetailProps) {
-  if (step.kind === "tool") return <pre>{JSON.stringify(step.args, null, 2)}</pre>;
-  if (step.kind === "task_list") return <TaskList tasks={step.tasks} />;
+  if (step.kind === "tool") {
+    return <ToolCallDetail args={step.args} result={step.result} />;
+  }
+  if (step.kind === "task_list") {
+    return <TaskList tasks={step.tasks} compact={false} />;
+  }
   return null;
 }
@@ -132,6 +138,10 @@ export function AgentProcessGroup(props: AgentProcessGroupProps) {
   const [activeIndex, setActiveIndex] = useState(0);
+  const [showTopShadow, setShowTopShadow] = useState(false);
+  const [showBottomShadow, setShowBottomShadow] = useState(false);
+  const scrollRef = useRef<HTMLDivElement>(null);
+
   const visibleSteps = useMemo(() => buildAgentProcessSteps(props.blocks), [props.blocks]);
   return <ProcessTabs steps={visibleSteps} activeIndex={activeIndex} />;
 }
diff --git a/app/src/index.css b/app/src/index.css
index 16c43af..6b7241c 100644
--- a/app/src/index.css
+++ b/app/src/index.css
@@ -2014,9 +2014,14 @@
 .agent-process-step-detail {
-  padding: 10px;
-  max-height: none;
-  overflow: visible;
+  position: relative;
+  padding: 8px 10px;
+  max-height: 260px;
+  overflow: auto;
+  scrollbar-width: thin;
 }
+
+.agent-process-step-detail.has-shadow-bottom::after {
+  opacity: 1;
+}`;

export function createMockAssistantBlocks(prompt = "实现 ACP Agent Console 静态面板"): AgentContentBlock[] {
  return [
    {
      id: "mock-thinking-1",
      type: "thinking",
      content: `### 方向校准

我先把目标拆成三层，而不是直接画一个新的聊天页：

1. **消息阅读层**：继续使用 MLFB 的 Markdown、头像行、间距和正文密度。
2. **过程观察层**：复刻 CBZWW 的 process block 流，包含摘要、tab/timeline、工具参数和结果。
3. **未来协议层**：ACP 事件只负责映射为 block，不直接决定 UI 风格。

> 这一步的判断是：用户不是要一个“新 agent 产品页”，而是要 MLFB 里面自然长出来的 agent 记录面板。`,
      status: "completed",
      origin: processOrigin("mock-run-1"),
      createdAt: MOCK_CREATED_AT,
    },
    {
      id: "mock-thinking-2",
      type: "thinking",
      content: `### 视觉约束

| 项目 | 采用 | 避免 |
| --- | --- | --- |
| 正文 | MLFB MarkdownContent | 另做一套 prose |
| 用户输入 | 右侧紧凑气泡 | MLFB 说话行重复展示 |
| Agent 过程 | CBZWW block stream | 大卡片堆叠 |
| 工具参数 | key/value 结构化展示 | 整段裸 JSON |

接下来优先检查真实源码的组件边界，再写 mock 覆盖复杂内容。`,
      status: "completed",
      origin: processOrigin("mock-run-1"),
      createdAt: MOCK_CREATED_AT,
    },
    {
      id: "mock-tool-1",
      type: "tool_call",
      name: "read_reference_ui",
      label: "读取 CBZWW 过程链组件",
      status: "completed",
      args: {
        files: ["ChatMessage.tsx", "ProcessGroup.tsx", "ThinkingBlock.tsx", "ToolCallBlock.tsx"],
        intent: "extract visual behavior",
        checks: { grouping: true, streaming: true, hoverCaret: true, perStepScroll: true },
      },
      result: JSON.stringify({ output: "确认需要复刻摘要行、tab/timeline、工具参数/结果、流式自动展开和结束折叠。箭头默认隐藏，hover 所在组时显示，展开只负责旋转。", execution_time_ms: 47, tool_calls_count: 1 }),
      origin: processOrigin("mock-run-1"),
      createdAt: MOCK_CREATED_AT,
    },
    {
      id: "mock-tool-2",
      type: "tool_call",
      name: "inspect_mlfb_renderer",
      label: "对齐 MLFB Markdown 与说话行",
      status: "completed",
      args: {
        files: ["SummaryPanel.tsx", "MarkdownContent.tsx", "index.css"],
        intent: "preserve host style",
        markdownCases: ["table", "blockquote", "code fence", "task list", "inline code", "resource link"],
      },
      result: JSON.stringify({ output: "确认应复用 IdenticonAvatar、XXX 说、MarkdownContent、.prose 与 caller color 变量。", stdout: "不要替换为 CBZWW 的完整聊天页外壳。" }),
      origin: processOrigin("mock-run-1"),
      createdAt: MOCK_CREATED_AT,
    },
    {
      id: "mock-tool-3",
      type: "tool_call",
      name: "draft_block_contract",
      label: "整理 block 映射草案",
      status: "completed",
      args: {
        processBlockTypes: ["thinking", "tool_call", "task_list", "artifact", "file_change", "permission"],
        resultBlockTypes: ["text", "task_list", "error"],
        origin: { phase: "process | result", placement: "standalone | inline", group_id: "mock-run-1" },
      },
      result: JSON.stringify({ output: "block contract 可以覆盖 Phase 1 的静态 UI，也能向后兼容 ACP JSON-RPC 事件映射。" }),
      origin: processOrigin("mock-run-1"),
      createdAt: MOCK_CREATED_AT,
    },
    {
      id: "mock-tasks-1",
      type: "task_list",
      title: "UI 对齐任务",
      tasks: [
        { id: "task-1", title: "消息外壳回到 MLFB 的说话记录", status: "completed" },
        { id: "task-2", title: "过程链复刻 CBZWW block 流样式", status: "completed" },
        { id: "task-3", title: "工具参数改为结构化 key/value", status: "completed" },
        { id: "task-4", title: "流式 step 内部滚动与阴影", status: "in-progress" },
        { id: "task-5", title: "后续接入真实 ACP provider", status: "not-started" },
      ],
      origin: processOrigin("mock-run-1"),
      createdAt: MOCK_CREATED_AT,
    },
    {
      id: "mock-artifact-1",
      type: "artifact",
      title: "验收说明片段",
      kind: "markdown",
      content: `#### 可视验收点

- 摘要行 hover 时才显示箭头。
- Timeline 展开后箭头紧跟标题文字。
- Tab 中长结果只滚动当前 block，不撑爆整条消息。

\`\`\`ts
type AgentBlockPhase = "process" | "result";
type AgentBlockPlacement = "inline" | "standalone";
\`\`\``,
      origin: processOrigin("mock-run-1"),
      createdAt: MOCK_CREATED_AT,
    },
    {
      id: "mock-file-change-1",
      type: "file_change",
      path: "app/src/components/agent/AgentProcessGroup.tsx",
      changeType: "edit",
      status: "applied",
      summary: "对齐 CBZWW 的 process block 展示行为。",
      origin: processOrigin("mock-run-1"),
      createdAt: MOCK_CREATED_AT,
    },
    {
      id: "mock-file-change-2",
      type: "file_change",
      path: "app/src/index.css",
      changeType: "edit",
      status: "applied",
      summary: "补充 process step 内部滚动、阴影和紧凑间距。",
      origin: processOrigin("mock-run-1"),
      createdAt: MOCK_CREATED_AT,
    },
    {
      id: "mock-diff-artifact-1",
      type: "artifact",
      title: "Agent Console UI diff",
      kind: "diff",
      content: MOCK_AGENT_CONSOLE_DIFF,
      origin: processOrigin("mock-run-1"),
      createdAt: MOCK_CREATED_AT,
    },
    {
      id: "mock-result-1",
      type: "text",
      content: `## ${prompt}

这版 mock 主要用于压测 **MLFB Markdown 正文** 与 **CBZWW 过程链** 是否能自然融合。

> 判断标准不是“像一个独立聊天应用”，而是“像 MLFB 里的一段 agent 工作记录”。

### 当前结论

- 用户输入与 agent 输出按 MLFB 的 Markdown 阅读方式穿插呈现。
- Agent 的中间过程折叠为一条 CBZWW 风格的 block stream，默认展示摘要，展开后查看思考、工具调用和任务状态。
- ACP 后端事件后续只需要映射成这些过程块与最终 Markdown 输出。

### 渲染覆盖面

| 能力 | Mock 覆盖 | 备注 |
| --- | --- | --- |
| GFM 表格 | 是 | 用于检查列宽和 prose 间距 |
| 任务列表 | 是 | 同时覆盖 process 与 result 两处 |
| 代码块 | 是 | 检查复制按钮、字体和背景 |
| 引用块 | 是 | 用于正文层级感 |

### 示例代码

\`\`\`tsx
<AgentProcessGroup
  blocks={processBlocks}
  isStreaming={message.status === "streaming"}
  projectDirectory={session.cwd}
/>
\`\`\`

### 后续检查清单

- [x] Markdown 保持 MLFB 阅读体验
- [x] 过程链保留 CBZWW 的 block 流结构
- [x] 箭头 hover 显隐与位置对齐参考实现
- [ ] 接入真实 ACP stdout JSON-RPC 事件

参考入口可以从 [README](README.md) 和 [BUILD](BUILD.md) 继续向后端阶段推进。`,
      origin: resultOrigin(),
      createdAt: MOCK_CREATED_AT,
    },
  ];
}

function createMockStreamingAssistantBlocks(): AgentContentBlock[] {
  return [
    {
      id: "mock-stream-thinking-1",
      type: "thinking",
      content: "我先确认这次修改不是继续增加装饰动画，而是让 mock 能暴露真实状态：完成态、流式态、长参数、长结果、长 Markdown 都要能看出来。",
      status: "completed",
      origin: processOrigin("mock-run-stream"),
      createdAt: MOCK_CREATED_AT,
    },
    {
      id: "mock-stream-tool-1",
      type: "tool_call",
      name: "generate_rich_mock_payload",
      label: "生成富文本与流式过程样例",
      status: "completed",
      args: {
        include: ["markdown table", "blockquote", "task list", "code fence", "long thinking", "nested tool args"],
        targetFiles: ["mockData.ts", "AgentProcessGroup.tsx"],
      },
      result: JSON.stringify({ output: "已生成完成态 mock，并准备追加一段流式中的长 thinking step。" }),
      origin: processOrigin("mock-run-stream"),
      createdAt: MOCK_CREATED_AT,
    },
    {
      id: "mock-permission-block-1",
      type: "permission",
      requestId: "mock-permission-1",
      title: "允许 Agent 运行构建验证命令",
      toolCallId: "mock-stream-tool-1",
      status: "pending",
      options: [
        { id: "allow-once", label: "允许一次", kind: "allow_once" },
        { id: "allow-session", label: "本 session 允许", kind: "allow_session" },
        { id: "allow-always", label: "始终允许", kind: "allow_always" },
        { id: "reject-once", label: "拒绝", kind: "reject_once" },
      ],
      origin: processOrigin("mock-run-stream"),
      createdAt: MOCK_CREATED_AT,
    },
    {
      id: "mock-stream-thinking-2",
      type: "thinking",
      content: `### 正在检查流式 step 的单块滚动

这段内容刻意写得更长，用来观察最新 step 内部限高、自动滚底和上下阴影，而不是让整条 timeline 变成滚动容器。

检查项：

1. 最新 step 展开后，只有当前详情区域出现滚动。
2. 顶部阴影只在内容向下滚过之后出现。
3. 底部阴影只在还有内容未显示时出现。
4. 新内容追加时自动滚到底部。
5. 流式结束后，过程区会回到可折叠的完成态。

模拟追加内容：

- 第 1 段：确认滚动容器只包裹 step detail。
- 第 2 段：确认箭头仍然贴近 step label。
- 第 3 段：确认 hover 显隐不受滚动阴影影响。
- 第 4 段：确认长 Markdown 不破坏 MLFB 的 prose 样式。
- 第 5 段：确认工具卡片和思考块在同一 process group 中仍然保持一致间距。

\`\`\`txt
stream event -> process.thinking.delta
stream event -> process.tool_call.completed
stream event -> result.text.delta
\`\`\`

现在仍处于 running 状态，因此这块应该保持展开，并在内容较长时只让本 step 内部滚动。`,
      status: "running",
      origin: processOrigin("mock-run-stream"),
      createdAt: MOCK_CREATED_AT,
    },
  ];
}

export function createMockAgentSession(): AgentSession {
  const userMessage: AgentMessage = {
    id: "mock-user-1",
    role: "user",
    status: "complete",
    blocks: [
      {
        id: "mock-user-text-1",
        type: "text",
        content: "请开始实现 ACP Agent Console 的第一阶段静态面板。",
        origin: resultOrigin(),
        createdAt: MOCK_CREATED_AT,
      },
    ],
    createdAt: MOCK_CREATED_AT,
  };

  const assistantMessage: AgentMessage = {
    id: "mock-assistant-1",
    role: "assistant",
    status: "complete",
    modelId: "opencode/mock",
    blocks: createMockAssistantBlocks(),
    createdAt: MOCK_CREATED_AT,
  };

  const followupUserMessage: AgentMessage = {
    id: "mock-user-2",
    role: "user",
    status: "complete",
    blocks: [
      {
        id: "mock-user-text-2",
        type: "text",
        content: "注意：不要另起一套聊天产品风格。Markdown 渲染、头像行和整体尺度都要像 MLFB。",
        origin: resultOrigin(),
        createdAt: MOCK_CREATED_AT,
      },
    ],
    createdAt: MOCK_CREATED_AT,
  };

  const followupAssistantMessage: AgentMessage = {
    id: "mock-assistant-2",
    role: "assistant",
    status: "complete",
    modelId: "opencode/mock",
    blocks: createMockAssistantBlocks("按 MLFB 外壳 + CBZWW 过程链重构 Phase 1"),
    createdAt: MOCK_CREATED_AT,
  };

  const richMockUserMessage: AgentMessage = {
    id: "mock-user-3",
    role: "user",
    status: "complete",
    blocks: [
      {
        id: "mock-user-text-3",
        type: "text",
        content: `现在请补一组更复杂的 mock：

- 富文本正文要覆盖表格、引用、代码块、任务列表。
- 思考过程要能展示多 step、长内容、运行中状态。
- 工具参数要包含数组、对象、布尔值和长字符串。
- 流式态只限制当前 step 的高度。`,
        origin: resultOrigin(),
        createdAt: MOCK_CREATED_AT,
      },
    ],
    createdAt: MOCK_CREATED_AT,
  };

  const streamingAssistantMessage: AgentMessage = {
    id: "mock-assistant-3",
    role: "assistant",
    status: "streaming",
    modelId: "opencode/mock",
    blocks: createMockStreamingAssistantBlocks(),
    createdAt: MOCK_CREATED_AT,
  };

  return {
    id: "agent-session-mock",
    providerId: "opencode",
    title: "OpenCode ACP Console",
    cwd: "e:/Dev/my-last-feedback",
    modelId: "claude-sonnet",
    modeId: "plan",
    availableModels: [
      { id: "claude-sonnet", label: "Claude Sonnet", description: "Mock 200k context model for navigation preview" },
      { id: "gpt-4.1", label: "GPT-4.1", description: "Mock 1M context model for navigation preview" },
    ],
    availableModes: [
      { id: "plan", label: "Plan", description: "Draft and review the plan before editing" },
      { id: "build", label: "Build", description: "Implement changes in the workspace" },
    ],
    providerRuntime: {
      processId: "mock-acp-preview",
      command: "opencode",
      args: ["acp"],
      initialized: true,
      protocolVersion: 1,
      agentInfo: { name: "OpenCode", version: "mock" },
    },
    status: "running",
    draft: "",
    testLogText: "",
    gitAction: null,
    images: [],
    mlcAttachments: [
      { filePath: ".myLastChat/MLC_MLFB ACP Agent Console统一施工规划书.md", title: "ACP 施工规划书", description: "Agent Console 统一施工规划参考" },
    ],
    webAttachments: [],
    messages: [userMessage, assistantMessage, followupUserMessage, followupAssistantMessage, richMockUserMessage, streamingAssistantMessage],
    pendingPermissionIds: ["mock-permission-1"],
    diagnostics: [
      {
        id: "mock-diag-1",
        level: "info",
        message: "Phase 1 使用 mock 数据，尚未启动真实 ACP provider。",
        createdAt: MOCK_CREATED_AT,
      },
    ],
    createdAt: MOCK_CREATED_AT,
    updatedAt: MOCK_CREATED_AT,
  };
}