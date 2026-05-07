import { getAgentDiffStatsSummary, type AgentDiffFileStat } from "./diffStats";
import { collectAgentStepTokenStats } from "./steps";
import type { AgentPermissionBlock, AgentPermissionOption, AgentSession, AgentToolCallBlock } from "./types";

export interface AgentEditFileSummary {
  changedFiles: number;
  additions: number;
  deletions: number;
  estimated: boolean;
  primaryPath?: string;
  files: AgentDiffFileStat[];
}

export interface AgentApprovalCurrentStatus {
  kind: "approval";
  variant: "tool" | "apply_edit";
  requestId: string;
  title: string;
  options: AgentPermissionOption[];
  extraCount: number;
  permissionBlock?: AgentPermissionBlock;
  fileSummary?: AgentEditFileSummary;
}

export interface AgentThinkingCurrentStatus {
  kind: "thinking";
  label: string;
  tokenCount: number;
  estimated: boolean;
}

export interface AgentOutputCurrentStatus {
  kind: "output";
  label: string;
  tokenCount: number;
  estimated: boolean;
}

export interface AgentToolRunningCurrentStatus {
  kind: "tool_running";
  label: string;
  toolName?: string;
}

export type AgentCurrentStatus = AgentApprovalCurrentStatus | AgentToolRunningCurrentStatus | AgentThinkingCurrentStatus | AgentOutputCurrentStatus | null;

function collectPermissionBlocks(session: AgentSession): AgentPermissionBlock[] {
  const blocks: AgentPermissionBlock[] = [];
  for (const message of session.messages) {
    for (const block of message.blocks) {
      if (block.type === "permission") blocks.push(block);
    }
  }
  return blocks;
}

function getPendingPermissionBlocks(session: AgentSession): AgentPermissionBlock[] {
  const permissionBlocks = collectPermissionBlocks(session);
  if (session.pendingPermissionIds.length > 0) {
    return session.pendingPermissionIds
      .map((requestId) => permissionBlocks.find((block) => block.requestId === requestId))
      .filter((block): block is AgentPermissionBlock => Boolean(block));
  }
  return permissionBlocks.filter((block) => block.status === "pending");
}

function findPermissionToolCall(session: AgentSession, permissionBlock: AgentPermissionBlock): AgentToolCallBlock | null {
  if (!permissionBlock.toolCallId) return null;
  for (const message of session.messages) {
    for (const block of message.blocks) {
      if (block.type === "tool_call" && block.id === permissionBlock.toolCallId) return block;
    }
  }
  return null;
}

function stringifyPermissionToolArgs(toolCall: AgentToolCallBlock | null): string {
  if (!toolCall?.args) return "";
  try {
    return JSON.stringify(toolCall.args);
  } catch {
    return "";
  }
}

function isEditPermission(session: AgentSession, permissionBlock: AgentPermissionBlock): boolean {
  const toolCall = findPermissionToolCall(session, permissionBlock);
  const searchableText = [
    permissionBlock.title,
    toolCall?.name,
    toolCall?.title,
    toolCall?.label,
    stringifyPermissionToolArgs(toolCall),
  ].filter(Boolean).join("\n").toLowerCase();
  return /\b(edit|apply|patch|write|modify|replace|update|delete|create|diff)\b|编辑|应用|修改|写入|补丁|删除|创建|变更/.test(searchableText);
}

function getEditFileSummary(session: AgentSession): AgentEditFileSummary | undefined {
  const diffSummary = getAgentDiffStatsSummary(session);
  if (diffSummary.changedFiles <= 0) return undefined;
  return {
    changedFiles: diffSummary.changedFiles,
    additions: diffSummary.additions,
    deletions: diffSummary.deletions,
    estimated: diffSummary.estimated,
    primaryPath: diffSummary.files[0]?.path,
    files: diffSummary.files,
  };
}

function getPermissionFileSummary(permissionBlock: AgentPermissionBlock | undefined): AgentEditFileSummary | undefined {
  const metadata = permissionBlock?.metadata;
  if (!metadata) return undefined;
  const files = Array.isArray(metadata.files) ? metadata.files : [];
  const normalized = files
    .map((item) => (typeof item === "object" && item !== null ? item as Record<string, unknown> : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const path = typeof item.relativePath === "string" ? item.relativePath : typeof item.filePath === "string" ? item.filePath : "";
      const type = item.type;
      return {
        path,
        changeType: type === "add" ? "create" as const : type === "delete" ? "delete" as const : type === "update" || type === "move" ? "edit" as const : "unknown" as const,
        additions: typeof item.additions === "number" ? item.additions : 0,
        deletions: typeof item.deletions === "number" ? item.deletions : 0,
      };
    })
    .filter((item) => item.path);
  if (normalized.length > 0) {
    return {
      changedFiles: normalized.length,
      additions: normalized.reduce((sum, item) => sum + item.additions, 0),
      deletions: normalized.reduce((sum, item) => sum + item.deletions, 0),
      estimated: false,
      primaryPath: normalized[0]?.path,
      files: normalized,
    };
  }
  const filepath = typeof metadata.filepath === "string" ? metadata.filepath : permissionBlock?.patterns?.[0];
  if (!filepath || typeof metadata.diff !== "string") return undefined;
  return {
    changedFiles: 1,
    additions: 0,
    deletions: 0,
    estimated: true,
    primaryPath: filepath,
    files: [{ path: filepath, changeType: "edit", additions: 0, deletions: 0 }],
  };
}

function getApprovalStatus(session: AgentSession): AgentApprovalCurrentStatus | null {
  const pendingPermissionBlocks = getPendingPermissionBlocks(session);
  const pendingPermissionBlock = pendingPermissionBlocks[0];
  const fallbackRequestId = session.pendingPermissionIds[0];
  const requestId = pendingPermissionBlock?.requestId || fallbackRequestId;
  if (!requestId) return null;

  const variant = pendingPermissionBlock && isEditPermission(session, pendingPermissionBlock) ? "apply_edit" : "tool";
  const fileSummary = variant === "apply_edit" ? getPermissionFileSummary(pendingPermissionBlock) || getEditFileSummary(session) : undefined;

  return {
    kind: "approval",
    variant,
    requestId,
    title: pendingPermissionBlock?.title || "",
    options: pendingPermissionBlock?.options || [],
    extraCount: Math.max(session.pendingPermissionIds.length, pendingPermissionBlocks.length) - 1,
    permissionBlock: pendingPermissionBlock,
    fileSummary,
  };
}

function getRunningActivityStatus(session: AgentSession): Exclude<AgentCurrentStatus, AgentApprovalCurrentStatus | null> | null {
  if (session.status !== "starting" && session.status !== "running" && session.status !== "cancelling") return null;
  const stats = collectAgentStepTokenStats(session);
  for (let index = stats.length - 1; index >= 0; index -= 1) {
    const stat = stats[index];
    if (stat.status !== "running") continue;
    if (stat.kind === "tool") return { kind: "tool_running", label: stat.label };
    if (stat.kind === "thinking") return { kind: "thinking", label: stat.label, tokenCount: stat.tokenCount, estimated: stat.estimated };
    if (stat.kind === "result") return { kind: "output", label: stat.label, tokenCount: stat.tokenCount, estimated: stat.estimated };
  }
  return null;
}

export function getAgentCurrentStatus(session: AgentSession): AgentCurrentStatus {
  return getApprovalStatus(session) || getRunningActivityStatus(session);
}