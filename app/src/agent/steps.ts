import type { AgentContentBlock, AgentMessage, AgentPermissionBlock, AgentProviderMessagePart, AgentSession, AgentTaskItem, AgentTokenUsage } from "./types";

export type AgentStepKind = "thinking" | "compaction" | "tool" | "task_list" | "artifacts" | "permission" | "error";
export type AgentStepStatus = "pending" | "running" | "completed" | "failed";
export type AgentTokenStatKind = AgentStepKind | "user" | "result" | "model_step";
export type AgentStepTone = "document_change" | "document_read" | "document_search" | "command_execution" | "todo_update" | "artifact_output" | "approval_rejected";
export type AgentDocumentChangeKind = "create" | "edit" | "delete";

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
  metadata?: Record<string, unknown>;
  permissions?: AgentPermissionBlock[];
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
  args?: Record<string, unknown>;
  result?: string;
  metadata?: Record<string, unknown>;
  usage?: AgentTokenUsage;
}

function finiteNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function tokenUsageFromRawTokens(tokens: AgentProviderMessagePart["tokens"], cost?: number): AgentTokenUsage | undefined {
  if (!tokens || typeof tokens !== "object") return undefined;
  const value = tokens as { total?: unknown; input?: unknown; output?: unknown; reasoning?: unknown; cache?: { read?: unknown; write?: unknown } };
  const inputTokens = finiteNonNegativeNumber(value.input) ?? 0;
  const outputTokens = finiteNonNegativeNumber(value.output) ?? 0;
  const reasoningTokens = finiteNonNegativeNumber(value.reasoning) ?? 0;
  const cacheReadTokens = finiteNonNegativeNumber(value.cache?.read) ?? 0;
  const cacheWriteTokens = finiteNonNegativeNumber(value.cache?.write) ?? 0;
  const calculatedTotal = inputTokens + outputTokens + reasoningTokens + cacheReadTokens + cacheWriteTokens;
  const totalTokens = finiteNonNegativeNumber(value.total) || calculatedTotal;
  const contextTokens = inputTokens + cacheReadTokens;
  if (totalTokens <= 0 && contextTokens <= 0) return undefined;
  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: totalTokens > 0 ? totalTokens : contextTokens,
    contextTokens: contextTokens > 0 ? contextTokens : totalTokens,
    ...(cost !== undefined && Number.isFinite(cost) && cost > 0 ? { cost } : {}),
    source: "opencode",
  };
}

function measuredTokenUsagesForMessage(message: AgentMessage): Array<{ id: string; usage: AgentTokenUsage }> {
  const finishPartUsages = (message.providerParts || [])
    .filter((part) => part.type === "step-finish" && part.tokens)
    .map((part, index) => {
      const usage = tokenUsageFromRawTokens(part.tokens, part.cost);
      return usage ? { id: part.id || `step-finish-${index}`, usage } : null;
    })
    .filter((item): item is { id: string; usage: AgentTokenUsage } => Boolean(item));
  if (finishPartUsages.length > 0) return finishPartUsages;
  return message.providerTokenUsage ? [{ id: "model-step", usage: message.providerTokenUsage }] : [];
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
  if (step.kind === "tool") return [step.label, stringifyForStats(step.args), step.result, stringifyForStats(step.metadata), ...(step.permissions || []).map((permission) => permission.title)].filter(Boolean).join("\n");
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

function toolIdentityText(block: Extract<AgentContentBlock, { type: "tool_call" }>): string {
  return [block.name, block.title, block.label].filter(Boolean).join("\n").toLowerCase();
}

function isUserRejectedToolPermission(block: Extract<AgentContentBlock, { type: "tool_call" }>): boolean {
  return [block.title, block.label, block.result]
    .filter(Boolean)
    .join("\n")
    .toLowerCase()
    .includes("the user rejected permission to use this specific tool call.");
}

function isReadToolIdentity(identityText: string): boolean {
  return /\b(read|view|open|cat|list|ls)\b|读取|查看|列出/.test(identityText);
}

function isSearchToolIdentity(identityText: string): boolean {
  return /\b(grep|rg|search|find|glob|scan)\b|搜索|查找|扫描/.test(identityText);
}

function hasArgKey(args: Record<string, unknown> | undefined, names: string[]): boolean {
  if (!args) return false;
  const normalizedNames = new Set(names.map((name) => name.toLowerCase()));
  return Object.keys(args).some((key) => normalizedNames.has(key.toLowerCase()));
}

function isToolCallFailure(block: Extract<AgentContentBlock, { type: "tool_call" }>): boolean {
  if (block.status === "failed") return true;
  if (isUserRejectedToolPermission(block)) return true;
  const identityText = toolIdentityText(block);
  if (block.name.toLowerCase() === "invalid") return true;
  if (/unavailable tool|invalid tool|invalid arguments|model tried to call unavailable tool/.test(identityText)) return true;

  const resultText = [
    block.title,
    block.label,
    block.result,
  ].filter(Boolean).join("\n").toLowerCase();
  return !isReadToolIdentity(identityText) && !isSearchToolIdentity(identityText) && /the arguments provided to the tool are invalid|model tried to call unavailable tool/.test(resultText);
}

function toolStepTone(block: Extract<AgentContentBlock, { type: "tool_call" }>): AgentStepTone | undefined {
  if (isToolCallFailure(block)) return undefined;

  const identityText = toolIdentityText(block);
  const hasPath = hasArgKey(block.args, ["path", "file", "filePath", "filepath"]);
  const hasWritePayload = hasArgKey(block.args, ["content", "oldString", "old_string", "newString", "new_string", "patch", "diff", "edits"]);
  const hasCommandPayload = hasArgKey(block.args, ["command", "cmd", "script"]);

  return /\b(todo|todowrite|todo_write|write_todo|task_list|task list)\b|待办|任务列表/.test(identityText)
    ? "todo_update"
    : /\b(edit|write|patch|apply|modify|replace|update|create|delete|remove|insert)\b|编辑|写入|修改|补丁|应用|创建|删除|新增/.test(identityText) || (hasPath && hasWritePayload)
    ? "document_change"
    : isSearchToolIdentity(identityText)
      ? "document_search"
      : isReadToolIdentity(identityText) || (hasPath && !hasWritePayload && !hasCommandPayload)
        ? "document_read"
        : /\b(bash|shell|terminal|command|run|exec|execute|python|node|npm|pnpm|yarn|cargo|go|pytest|test|build)\b|执行|命令|运行|代码|测试|构建/.test(identityText) || hasCommandPayload
          ? "command_execution"
          : undefined;
}

function artifactStepTone(block: Extract<AgentContentBlock, { type: "artifact" | "file_change" }>): AgentStepTone {
  if (block.type === "file_change" || block.kind === "diff") return "document_change";
  return "artifact_output";
}

function artifactStepLabel(tone: AgentStepTone, count: number): string {
  return tone === "document_change" ? `文件变更 (${count})` : `产物 (${count})`;
}

function isActiveSessionStatus(status: AgentSession["status"]): boolean {
  return status === "starting" || status === "running" || status === "cancelling";
}

function isActiveProcessBlock(block: AgentContentBlock): boolean {
  if (block.type === "thinking") return block.status === "running";
  if (block.type === "compaction") return block.status === "running";
  if (block.type === "tool_call") return block.status === "running" || block.status === "pending";
  if (block.type === "permission") return block.status === "pending";
  return false;
}

function activeProcessBlockId(blocks: AgentContentBlock[], messageIsStreaming: boolean): string | undefined {
  if (!messageIsStreaming) return undefined;
  return [...blocks].reverse().find(isActiveProcessBlock)?.id;
}

function completeIfSuperseded(status: AgentStepStatus, blockId: string, currentActiveBlockId: string | undefined, messageIsStreaming: boolean): AgentStepStatus {
  if (!messageIsStreaming || status === "completed" || status === "failed") return status;
  return blockId === currentActiveBlockId ? status : "completed";
}

function permissionBlocksByToolId(blocks: AgentContentBlock[]): Map<string, AgentPermissionBlock[]> {
  const grouped = new Map<string, AgentPermissionBlock[]>();
  const toolIds = new Set(blocks.filter((block) => block.type === "tool_call").map((block) => block.id));
  blocks.forEach((block, index) => {
    if (block.type !== "permission") return;
    let targetToolId = block.toolCallId && toolIds.has(block.toolCallId) ? block.toolCallId : undefined;
    if (!targetToolId) {
      for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
        const previousBlock = blocks[previousIndex];
        if (previousBlock.type === "tool_call") {
          targetToolId = previousBlock.id;
          break;
        }
      }
    }
    if (!targetToolId) return;
    grouped.set(targetToolId, [...(grouped.get(targetToolId) || []), block]);
  });
  return grouped;
}

function isRejectedPermission(permission: AgentPermissionBlock): boolean {
  if (!permission.selectedOptionId) return false;
  const selectedOption = permission.options.find((option) => option.id === permission.selectedOptionId);
  if (selectedOption?.kind === "reject_once") return true;
  return /reject|deny/i.test(permission.selectedOptionId);
}

export function buildAgentProcessSteps(blocks: AgentContentBlock[], messageId?: string, messageStatus?: AgentMessage["status"]): AgentStepItem[] {
  const steps: AgentStepItem[] = [];
  const messageIsStreaming = messageStatus === "streaming";
  const currentActiveBlockId = activeProcessBlockId(blocks, messageIsStreaming);
  const permissionsByToolId = permissionBlocksByToolId(blocks);
  for (const block of blocks) {
    if (block.type === "thinking") {
      const staleRunningState = Boolean(block.staleRunningState || (!messageIsStreaming && block.status === "running"));
      const status = completeIfSuperseded(block.status === "running" ? "running" : "completed", block.id, currentActiveBlockId, messageIsStreaming);
      steps.push({
        id: block.id,
        messageId,
        blockIds: [block.id],
        kind: "thinking",
        label: "思考",
        status,
        detail: block.content,
        staleRunningState,
      });
      continue;
    }
    if (block.type === "compaction") {
      const status = completeIfSuperseded(block.status === "failed" ? "failed" : block.status === "running" ? "running" : "completed", block.id, currentActiveBlockId, messageIsStreaming);
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
      const permissions = permissionsByToolId.get(block.id);
      const hasPendingPermission = Boolean(permissions?.some((permission) => permission.status === "pending"));
      const hasRejectedPermission = Boolean(permissions?.some(isRejectedPermission));
      const hasRejectedToolPermission = isUserRejectedToolPermission(block);
      const status = hasPendingPermission
        ? "pending"
        : hasRejectedPermission || hasRejectedToolPermission
          ? "failed"
        : completeIfSuperseded(isToolCallFailure(block) ? "failed" : messageIsStreaming ? block.status || "completed" : "completed", block.id, currentActiveBlockId, messageIsStreaming);
      const staleRunningState = Boolean(block.staleRunningState || (block.status !== "failed" && !messageIsStreaming && (block.status === "running" || block.status === "pending")));
      steps.push({
        id: block.id,
        messageId,
        blockIds: [block.id, ...(permissions || []).map((permission) => permission.id)],
        kind: "tool",
        label: block.label || block.title || (typeof block.args?.label === "string" ? block.args.label : block.name),
        status,
        args: block.args,
        result: block.result,
        metadata: block.metadata,
        permissions,
        staleRunningState,
        tone: hasRejectedPermission || hasRejectedToolPermission ? "approval_rejected" : toolStepTone(block),
      });
      continue;
    }
    if (block.type === "task_list" && block.tasks.length > 0) {
      const completedCount = block.tasks.filter((task) => task.status === "completed").length;
      const hasRunningTask = block.tasks.some((task) => task.status === "in-progress");
      const status = completeIfSuperseded(messageStatus === "streaming"
        ? hasRunningTask ? "running" : completedCount < block.tasks.length ? "pending" : "completed"
        : "completed", block.id, currentActiveBlockId, messageIsStreaming);
      steps.push({
        id: block.id,
        messageId,
        blockIds: [block.id],
        kind: "task_list",
        label: `待办更新 (${completedCount}/${block.tasks.length})`,
        status,
        tasks: block.tasks,
      });
      continue;
    }
    if (block.type === "artifact" || block.type === "file_change") {
      const tone = artifactStepTone(block);
      const lastStep = steps[steps.length - 1];
      if (lastStep?.kind === "artifacts" && lastStep.tone === tone) {
        lastStep.blocks = [...(lastStep.blocks || []), block];
        lastStep.blockIds = [...lastStep.blockIds, block.id];
        lastStep.label = artifactStepLabel(tone, lastStep.blocks.length);
      } else {
        steps.push({ id: block.id, messageId, blockIds: [block.id], kind: "artifacts", label: artifactStepLabel(tone, 1), status: "completed", blocks: [block], tone });
      }
      continue;
    }
    if (block.type === "permission") continue;
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
        args: step.args,
        result: step.result,
        metadata: step.metadata,
      });
    }
    const measuredUsages = measuredTokenUsagesForMessage(message);
    measuredUsages.forEach((measured, measuredIndex) => {
      stats.push({
        id: `${message.id}:${measured.id}`,
        messageId: message.id,
        blockIds: message.blocks.map((block) => block.id),
        kind: "model_step",
        label: measuredUsages.length > 1 ? `模型步骤 ${measuredIndex + 1}` : "模型步骤",
        status: message.status === "streaming" ? "running" : message.status === "error" ? "failed" : "completed",
        tokenCount: measured.usage.totalTokens,
        estimated: false,
        index: stats.length,
        target: "message",
        usage: measured.usage,
      });
    });
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