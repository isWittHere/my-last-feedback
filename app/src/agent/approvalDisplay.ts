import type { AgentPermissionBlock, AgentToolCallBlock } from "./types";
import type { AgentStepTone } from "./steps";

export interface AgentApprovalDisplayInput {
  permission?: AgentPermissionBlock;
  args?: Record<string, unknown>;
  toolCall?: AgentToolCallBlock | null;
  tone?: AgentStepTone;
  fallbackTitle?: string;
}

function firstString(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function metadataValue(permission: AgentPermissionBlock | undefined, key: string): unknown {
  return permission?.metadata?.[key];
}

function argValue(input: AgentApprovalDisplayInput, key: string): unknown {
  return input.args?.[key] ?? input.toolCall?.args?.[key];
}

function shellWords(value: string): string[] {
  return value.match(/"[^"]+"|'[^']+'|\S+/g)?.map((word) => word.replace(/^(["'])(.*)\1$/, "$2")) || [];
}

function firstTwoWords(value: string): string {
  return shellWords(value).slice(0, 2).join(" ").trim();
}

function explicitDescription(input: AgentApprovalDisplayInput): string | undefined {
  return firstString([
    metadataValue(input.permission, "description"),
    argValue(input, "description"),
  ]);
}

function commandText(input: AgentApprovalDisplayInput): string | undefined {
  return firstString([
    metadataValue(input.permission, "command"),
    metadataValue(input.permission, "cmd"),
    metadataValue(input.permission, "script"),
    metadataValue(input.permission, "pattern"),
    argValue(input, "command"),
    argValue(input, "cmd"),
    argValue(input, "script"),
    input.permission?.title,
    input.fallbackTitle,
    input.toolCall?.label,
    input.toolCall?.title,
    input.toolCall?.name,
  ]);
}

export function getApprovalDisplayDescription(input: AgentApprovalDisplayInput): string {
  const description = explicitDescription(input);
  if (description) return description;
  const command = commandText(input);
  if (!command) return "";
  return firstTwoWords(command) || command;
}

export function isCommandLikeApproval(input: AgentApprovalDisplayInput): boolean {
  if (input.tone === "command_execution" || input.tone === "approval_rejected") return true;
  if (firstString([metadataValue(input.permission, "command"), metadataValue(input.permission, "cmd"), metadataValue(input.permission, "script"), argValue(input, "command"), argValue(input, "cmd"), argValue(input, "script")])) return true;
  const searchableText = [
    input.permission?.title,
    input.fallbackTitle,
    input.toolCall?.name,
    input.toolCall?.title,
    input.toolCall?.label,
  ].filter(Boolean).join("\n").toLowerCase();
  return /\b(bash|shell|terminal|command|cmd|run|exec|execute|python|node|npm|pnpm|yarn|cargo|go|pytest|websearch|webfetch|rm|mkdir|cp|mv)\b|执行|命令|运行/.test(searchableText);
}