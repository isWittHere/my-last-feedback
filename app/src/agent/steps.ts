import type { AgentContentBlock, AgentMessage, AgentSession, AgentTaskItem } from "./types";

export type AgentStepKind = "thinking" | "compaction" | "tool" | "task_list" | "artifacts" | "permission" | "error";
export type AgentStepStatus = "pending" | "running" | "completed" | "failed";
export type AgentTokenStatKind = AgentStepKind | "user" | "result";
export type AgentStepTone = "document_change" | "document_read" | "command_execution";

export interface AgentStepItem {
  id: string;
  messageId?: string;
  blockIds: string[];
  kind: AgentStepKind;
  label: string;
  status: AgentStepStatus;
  detail?: string;
  args?: Record<string, unknown>;
  result?: string;
  tasks?: AgentTaskItem[];
  blocks?: AgentContentBlock[];
  staleRunningState?: boolean;
  tone?: AgentStepTone;
}

export interface AgentStepTokenStat {
  id: string;
  messageId: string;
  blockIds: string[];
  kind: AgentTokenStatKind;
  label: string;
  status: AgentStepStatus;
  tokenCount: number;
  estimated: boolean;
  index: number;
  target: "message" | "step";
  stepId?: string;
  staleRunningState?: boolean;
  tone?: AgentStepTone;
}

function stringifyForStats(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function estimateTokenCount(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  let asciiCharacters = 0;
  let nonAsciiCharacters = 0;
  for (const character of Array.from(normalized.replace(/\s+/g, " "))) {
    if (character.trim().length === 0) continue;
    if (character.charCodeAt(0) <= 0x7f) asciiCharacters += 1;
    else nonAsciiCharacters += 1;
  }
  return Math.max(1, Math.ceil(asciiCharacters / 4) + nonAsciiCharacters);
}

function tokenTextForStep(step: AgentStepItem): string {
  if (step.kind === "thinking" || step.kind === "compaction") return [step.label, step.detail].filter(Boolean).join("\n");
  if (step.kind === "tool") return [step.label, stringifyForStats(step.args), step.result].filter(Boolean).join("\n");
  if (step.kind === "task_list") return [step.label, ...(step.tasks || []).map((task) => task.title)].join("\n");
  if (step.kind === "permission" || step.kind === "error") return [step.label, step.detail].filter(Boolean).join("\n");
  return [
    step.label,
    ...(step.blocks || []).map((block) => {
      if (block.type === "artifact") return [block.title, block.content].join("\n");
      if (block.type === "file_change") return [block.path, block.summary].filter(Boolean).join("\n");
      return "";
    }),
  ].filter(Boolean).join("\n");
}

function tokenTextForBlocks(blocks: AgentContentBlock[]): string {
  return blocks.map((block) => {
    if (block.type === "text") return block.content;
    if (block.type === "thinking") return block.content;
    if (block.type === "compaction") return block.content || "上下文压缩";
    if (block.type === "tool_call") return [block.label || block.title || block.name, stringifyForStats(block.args), block.result].filter(Boolean).join("\n");
    if (block.type === "task_list") return [block.title, ...block.tasks.map((task) => task.title)].filter(Boolean).join("\n");
    if (block.type === "artifact") return [block.title, block.content].join("\n");
    if (block.type === "file_change") return [block.path, block.summary].filter(Boolean).join("\n");
    if (block.type === "permission") return block.title;
    if (block.type === "citation") return block.sources.map((source) => `${source.title} ${source.uri}`).join("\n");
    if (block.type === "error") return [block.message, block.detail].filter(Boolean).join("\n");
    return "";
  }).filter(Boolean).join("\n");
}

function toolStepTone(block: Extract<AgentContentBlock, { type: "tool_call" }>): AgentStepTone | undefined {
  const searchableText = [
    block.name,
    block.title,
    block.label,
    stringifyForStats(block.args),
  ].filter(Boolean).join("\n").toLowerCase();
  return /\b(edit|write|patch|apply|modify|replace|update|create|delete|remove|insert)\b|编辑|写入|修改|补丁|应用|创建|删除|新增/.test(searchableText)
    ? "document_change"
    : /\b(bash|shell|terminal|command|run|exec|execute|python|node|npm|pnpm|yarn|cargo|go|pytest|test|build)\b|执行|命令|运行|代码|测试|构建/.test(searchableText)
      ? "command_execution"
      : /\b(read|view|open|cat|grep|search|find|list|ls|glob|scan)\b|读取|查看|搜索|查找|列出|扫描/.test(searchableText)
        ? "document_read"
        : undefined;
}

function isActiveSessionStatus(status: AgentSession["status"]): boolean {
  return status === "starting" || status === "running" || status === "cancelling";
}

export function buildAgentProcessSteps(blocks: AgentContentBlock[], messageId?: string, messageStatus?: AgentMessage["status"]): AgentStepItem[] {
  const steps: AgentStepItem[] = [];
  const messageIsStreaming = messageStatus === "streaming";
  for (const block of blocks) {
    if (block.type === "thinking") {
      const staleRunningState = Boolean(block.staleRunningState || (!messageIsStreaming && block.status === "running"));
      steps.push({
        id: block.id,
        messageId,
        blockIds: [block.id],
        kind: "thinking",
        label: "思考",
        status: messageIsStreaming && block.status === "running" ? "running" : "completed",
        detail: block.content,
        staleRunningState,
      });
      continue;
    }
    if (block.type === "compaction") {
      const status: AgentStepStatus = block.status === "failed" ? "failed" : messageIsStreaming && block.status === "running" ? "running" : "completed";
      const staleRunningState = Boolean(block.staleRunningState || (block.status !== "failed" && !messageIsStreaming && block.status === "running"));
      steps.push({
        id: block.id,
        messageId,
        blockIds: [block.id],
        kind: "compaction",
        label: status === "running" ? "正在压缩上下文" : status === "failed" ? "上下文压缩失败" : "上下文已压缩",
        status,
        detail: block.content,
        staleRunningState,
      });
      continue;
    }
    if (block.type === "tool_call") {
      const status: AgentStepStatus = block.status === "failed" ? "failed" : messageIsStreaming ? block.status || "completed" : "completed";
      const staleRunningState = Boolean(block.staleRunningState || (block.status !== "failed" && !messageIsStreaming && (block.status === "running" || block.status === "pending")));
      steps.push({
        id: block.id,
        messageId,
        blockIds: [block.id],
        kind: "tool",
        label: block.label || block.title || (typeof block.args?.label === "string" ? block.args.label : block.name),
        status,
        args: block.args,
        result: block.result,
        staleRunningState,
        tone: toolStepTone(block),
      });
      continue;
    }
    if (block.type === "task_list" && block.tasks.length > 0) {
      const completedCount = block.tasks.filter((task) => task.status === "completed").length;
      const hasRunningTask = block.tasks.some((task) => task.status === "in-progress");
      const status: AgentStepStatus = messageStatus === "streaming"
        ? hasRunningTask ? "running" : completedCount < block.tasks.length ? "pending" : "completed"
        : "completed";
      steps.push({
        id: block.id,
        messageId,
        blockIds: [block.id],
        kind: "task_list",
        label: block.title || `待办事项 (${completedCount}/${block.tasks.length})`,
        status,
        tasks: block.tasks,
      });
      continue;
    }
    if (block.type === "artifact" || block.type === "file_change") {
      const lastStep = steps[steps.length - 1];
      if (lastStep?.kind === "artifacts") {
        lastStep.blocks = [...(lastStep.blocks || []), block];
        lastStep.blockIds = [...lastStep.blockIds, block.id];
        lastStep.label = `产物 (${lastStep.blocks.length})`;
      } else {
        steps.push({ id: block.id, messageId, blockIds: [block.id], kind: "artifacts", label: "产物 (1)", status: "completed", blocks: [block], tone: "document_change" });
      }
      continue;
    }
    if (block.type === "permission") {
      steps.push({
        id: block.id,
        messageId,
        blockIds: [block.id],
        kind: "permission",
        label: block.title,
        status: block.status === "pending" ? "pending" : "completed",
        detail: block.status === "pending" ? "等待用户确认" : "权限请求已处理",
      });
      continue;
    }
    if (block.type === "error") {
      steps.push({ id: block.id, messageId, blockIds: [block.id], kind: "error", label: "错误", status: "failed", detail: block.detail || block.message });
    }
  }
  return steps;
}

export function splitAgentMessageBlocks(message: AgentMessage): { processBlocks: AgentContentBlock[]; resultBlocks: AgentContentBlock[] } {
  if (message.role !== "assistant") return { processBlocks: [], resultBlocks: message.blocks };
  return {
    processBlocks: message.blocks.filter((block) => block.origin.phase === "process"),
    resultBlocks: message.blocks.filter((block) => block.origin.phase === "result"),
  };
}

export function collectAgentStepTokenStats(session: AgentSession): AgentStepTokenStat[] {
  const stats: AgentStepTokenStat[] = [];
  for (const message of session.messages) {
    if (message.role === "user") {
      const tokenCount = estimateTokenCount(tokenTextForBlocks(message.blocks));
      if (tokenCount > 0) {
        stats.push({
          id: `${message.id}:user`,
          messageId: message.id,
          blockIds: message.blocks.map((block) => block.id),
          kind: "user",
          label: "用户输入",
          status: "completed",
          tokenCount,
          estimated: true,
          index: stats.length,
          target: "message",
        });
      }
      continue;
    }
    if (message.role !== "assistant") continue;
    const { processBlocks, resultBlocks } = splitAgentMessageBlocks(message);
    const effectiveMessageStatus = isActiveSessionStatus(session.status) ? message.status : "complete";
    const steps = buildAgentProcessSteps(processBlocks, message.id, effectiveMessageStatus);
    for (const step of steps) {
      stats.push({
        id: `${message.id}:${step.id}`,
        messageId: message.id,
        blockIds: step.blockIds,
        kind: step.kind,
        label: step.label,
        status: step.status,
        tokenCount: estimateTokenCount(tokenTextForStep(step)),
        estimated: true,
        index: stats.length,
        target: "step",
        stepId: step.id,
        staleRunningState: step.staleRunningState,
        tone: step.tone,
      });
    }
    const resultTokenCount = estimateTokenCount(tokenTextForBlocks(resultBlocks));
    if (resultTokenCount > 0) {
      stats.push({
        id: `${message.id}:result`,
        messageId: message.id,
        blockIds: resultBlocks.map((block) => block.id),
        kind: "result",
        label: "Agent 输出",
        status: message.status === "streaming" ? "running" : message.status === "error" ? "failed" : "completed",
        tokenCount: resultTokenCount,
        estimated: true,
        index: stats.length,
        target: "message",
      });
    }
  }
  return stats;
}