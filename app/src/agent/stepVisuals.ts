import type { AgentDocumentChangeKind, AgentStepStatus, AgentStepTone, AgentTokenStatKind } from "./steps";

export interface AgentStepVisualInput {
  kind: AgentTokenStatKind;
  status?: AgentStepStatus;
  tone?: AgentStepTone;
  label?: string;
  args?: Record<string, unknown>;
  result?: string;
  metadata?: Record<string, unknown>;
  blocks?: Array<{ type?: string; path?: unknown }>;
}

export interface AgentStepVisualDescriptor {
  iconName: string;
  labelKey: string;
  defaultLabel: string;
}

export interface AgentStepDisplayLabelOptions {
  targetDisplay?: "full" | "basename";
}

type TranslateFn = (key: string, defaultValue: string, options?: Record<string, unknown>) => string;

function firstStringArg(args: Record<string, unknown> | undefined, names: string[]): string | undefined {
  if (!args) return undefined;
  const normalizedNames = new Set(names.map((name) => name.toLowerCase()));
  for (const [key, value] of Object.entries(args)) {
    if (!normalizedNames.has(key.toLowerCase()) || typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function parseJsonRecord(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try { return asRecord(JSON.parse(value)); } catch { return {}; }
}

function normalizeChangeType(value: unknown): AgentDocumentChangeKind | undefined {
  if (value === "add" || value === "added" || value === "create") return "create";
  if (value === "delete" || value === "deleted" || value === "remove" || value === "removed") return "delete";
  if (value === "update" || value === "modified" || value === "edit" || value === "move") return "edit";
  return undefined;
}

function summarizeChangeKinds(kinds: AgentDocumentChangeKind[]): AgentDocumentChangeKind | undefined {
  if (kinds.length === 0) return undefined;
  return new Set(kinds).size === 1 ? kinds[0] : "edit";
}

function changeKindFromFiles(value: unknown): AgentDocumentChangeKind | undefined {
  if (!Array.isArray(value)) return undefined;
  return summarizeChangeKinds(value.map((item) => {
    const record = asRecord(item);
    return normalizeChangeType(record.type || record.status || record.changeType);
  }).filter((kind): kind is AgentDocumentChangeKind => Boolean(kind)));
}

function changeKindFromPatchText(patchText: string): AgentDocumentChangeKind | undefined {
  if (!patchText) return undefined;
  const addCount = (patchText.match(/^\*\*\* Add File:/gm) || []).length;
  const deleteCount = (patchText.match(/^\*\*\* Delete File:/gm) || []).length;
  const updateCount = (patchText.match(/^\*\*\* (Update File|Move to):/gm) || []).length;
  if (addCount || deleteCount || updateCount) {
    const kinds: AgentDocumentChangeKind[] = [];
    if (addCount) kinds.push(...Array.from({ length: addCount }, () => "create" as const));
    if (deleteCount) kinds.push(...Array.from({ length: deleteCount }, () => "delete" as const));
    if (updateCount) kinds.push(...Array.from({ length: updateCount }, () => "edit" as const));
    return summarizeChangeKinds(kinds);
  }
  if (/^@@ -0,0 \+\d+/m.test(patchText)) return "create";
  if (/^@@ -\d+(?:,\d+)? \+0,0/m.test(patchText)) return "delete";
  return undefined;
}

function changeKindFromResultSummary(result: string | undefined): AgentDocumentChangeKind | undefined {
  if (!result) return undefined;
  const summaryLines = result.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[ADM]\s+/.test(line));
  if (summaryLines.length === 0) return undefined;
  return summarizeChangeKinds(summaryLines.map((line) => line.startsWith("A ") ? "create" : line.startsWith("D ") ? "delete" : "edit"));
}

function changeKindFromCommand(command: string | undefined): AgentDocumentChangeKind | undefined {
  if (!command) return undefined;
  const normalized = command.trim().replace(/\s+/g, " ").toLowerCase();
  if (/^(?:rm|del|erase|unlink)\b/.test(normalized)) return "delete";
  if (/^remove-item\b/.test(normalized)) return "delete";
  if (/^(?:cmd(?:\.exe)?\s+\/c\s+)(?:del|erase)\b/.test(normalized)) return "delete";
  if (/^(?:powershell(?:\.exe)?|pwsh(?:\.exe)?)\b.*\bremove-item\b/.test(normalized)) return "delete";
  return undefined;
}

export function getAgentDocumentChangeKind(input: AgentStepVisualInput): AgentDocumentChangeKind {
  const metadata = input.metadata || {};
  const fileDiff = asRecord(metadata.filediff);
  const resultRecord = parseJsonRecord(input.result);
  return changeKindFromFiles(metadata.files)
    || changeKindFromFiles(resultRecord.files)
    || normalizeChangeType(metadata.type || metadata.status || metadata.changeType)
    || (metadata.exists === false ? "create" : undefined)
    || (metadata.exists === true ? "edit" : undefined)
    || changeKindFromPatchText(typeof metadata.diff === "string" ? metadata.diff : "")
    || changeKindFromPatchText(typeof metadata.patch === "string" ? metadata.patch : "")
    || changeKindFromPatchText(typeof fileDiff.patch === "string" ? fileDiff.patch : "")
    || changeKindFromPatchText(typeof input.args?.patchText === "string" ? input.args.patchText : "")
    || changeKindFromResultSummary(input.result)
    || changeKindFromCommand(typeof input.args?.command === "string" ? input.args.command : undefined)
    || "edit";
}

function conciseToolName(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const firstSegment = label.trim().split(/\s+/)[0];
  if (!firstSegment) return undefined;
  const normalized = firstSegment.split(/[./]/).pop() || firstSegment;
  if (!normalized) return undefined;
  if (normalized === "grep_search") return "grep";
  if (normalized === "file_search") return "file search";
  if (normalized === "semantic_search") return "semantic search";
  return normalized.replace(/_/g, " ");
}

export function getAgentStepTarget(input: AgentStepVisualInput): string | undefined {
  const argTarget = firstStringArg(input.args, ["path", "file", "filePath", "filepath"]);
  if (argTarget) return argTarget;
  const metadataTarget = firstStringArg(input.metadata, ["relativePath", "filePath", "filepath", "path", "file"]);
  if (metadataTarget) return metadataTarget;
  const firstMetadataFile = Array.isArray(input.metadata?.files) ? asRecord(input.metadata.files[0]) : {};
  const metadataFileTarget = firstStringArg(firstMetadataFile, ["relativePath", "filePath", "filepath", "path", "file"]);
  if (metadataFileTarget) return metadataFileTarget;
  const fileChangeBlock = input.blocks?.find((block) => block.type === "file_change" && typeof block.path === "string");
  const blockTarget = typeof fileChangeBlock?.path === "string" ? fileChangeBlock.path.trim() : "";
  return blockTarget || undefined;
}

export function basenameResourcePath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export function getAgentStepVisualDescriptor(input: AgentStepVisualInput): AgentStepVisualDescriptor {
  if (input.tone === "approval_rejected") return { iconName: "circle-x", labelKey: "agentConsole.stepTypes.approvalRejected", defaultLabel: "Approval rejected" };
  if (input.status === "failed") return { iconName: "circle-x", labelKey: "agentConsole.stepTypes.error", defaultLabel: "Error step" };

  if (input.tone === "document_read") return { iconName: "eye", labelKey: "agentConsole.stepTypes.fileRead", defaultLabel: "File read" };
  if (input.tone === "document_search") return { iconName: "search", labelKey: "agentConsole.stepTypes.search", defaultLabel: "Search" };
  if (input.tone === "document_change") {
    const changeKind = getAgentDocumentChangeKind(input);
    if (changeKind === "create") return { iconName: "file-plus", labelKey: "agentConsole.stepTypes.fileCreate", defaultLabel: "File create" };
    if (changeKind === "delete") return { iconName: "trash", labelKey: "agentConsole.stepTypes.fileDelete", defaultLabel: "File delete" };
    return { iconName: "edit", labelKey: "agentConsole.stepTypes.fileEdit", defaultLabel: "File edit" };
  }
  if (input.tone === "command_execution") return { iconName: "terminal", labelKey: "agentConsole.stepTypes.commandExecution", defaultLabel: "Command execution" };
  if (input.tone === "todo_update") return { iconName: "checklist", labelKey: "agentConsole.stepTypes.todoUpdate", defaultLabel: "Todo update" };
  if (input.tone === "artifact_output") return { iconName: "file-text", labelKey: "agentConsole.stepTypes.artifactOutput", defaultLabel: "Artifact output" };

  if (input.kind === "user") return { iconName: "message", labelKey: "agentConsole.stepTypes.userInput", defaultLabel: "User input" };
  if (input.kind === "result") return { iconName: "robot", labelKey: "agentConsole.stepTypes.agentOutput", defaultLabel: "Agent output" };
  if (input.kind === "thinking") return { iconName: "message-dot", labelKey: "agentConsole.stepTypes.thinking", defaultLabel: "Thinking process" };
  if (input.kind === "compaction") return { iconName: "list-tree", labelKey: "agentConsole.stepTypes.contextCompaction", defaultLabel: "Context compaction" };
  if (input.kind === "tool") return { iconName: "wrench", labelKey: "agentConsole.stepTypes.tool", defaultLabel: "Tool call" };
  if (input.kind === "task_list") return { iconName: "checklist", labelKey: "agentConsole.stepTypes.taskList", defaultLabel: "Task list" };
  if (input.kind === "permission") return { iconName: "shield", labelKey: "agentConsole.stepTypes.permission", defaultLabel: "Permission request" };
  if (input.kind === "error") return { iconName: "warning", labelKey: "agentConsole.stepTypes.error", defaultLabel: "Error step" };
  return { iconName: "file-text", labelKey: "agentConsole.stepTypes.artifactOutput", defaultLabel: "Artifact output" };
}

export function getAgentStepTypeLabel(input: AgentStepVisualInput, t: TranslateFn): string {
  const descriptor = getAgentStepVisualDescriptor(input);
  const typeLabel = t(descriptor.labelKey, descriptor.defaultLabel);
  if (input.tone === "document_search") {
    const command = conciseToolName(input.label);
    if (command) return t("agentConsole.stepTypeWithCommand", "{{type}} {{command}}", { type: typeLabel, command });
  }
  return typeLabel;
}

export function getAgentStepDisplayLabel(input: AgentStepVisualInput, t: TranslateFn, fallbackLabel: string, options: AgentStepDisplayLabelOptions = {}): string {
  const typeLabel = getAgentStepTypeLabel(input, t);
  if (input.tone === "document_change" || input.tone === "document_read") {
    const target = getAgentStepTarget(input);
    if (target) {
      const displayTarget = options.targetDisplay === "basename" ? basenameResourcePath(target) : target;
      return t("agentConsole.stepTypeWithTarget", "{{type}} {{target}}", { type: typeLabel, target: displayTarget });
    }
  }
  if (input.tone === "document_search" || input.tone === "todo_update") return typeLabel;
  return fallbackLabel || typeLabel;
}