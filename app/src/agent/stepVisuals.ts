import type { AgentStepStatus, AgentStepTone, AgentTokenStatKind } from "./steps";

export interface AgentStepVisualInput {
  kind: AgentTokenStatKind;
  status?: AgentStepStatus;
  tone?: AgentStepTone;
  label?: string;
  args?: Record<string, unknown>;
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
  const fileChangeBlock = input.blocks?.find((block) => block.type === "file_change" && typeof block.path === "string");
  const blockTarget = typeof fileChangeBlock?.path === "string" ? fileChangeBlock.path.trim() : "";
  return blockTarget || undefined;
}

export function basenameResourcePath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export function getAgentStepVisualDescriptor(input: AgentStepVisualInput): AgentStepVisualDescriptor {
  if (input.status === "failed") return { iconName: "circle-x", labelKey: "agentConsole.stepTypes.error", defaultLabel: "Error step" };

  if (input.tone === "document_read") return { iconName: "eye", labelKey: "agentConsole.stepTypes.fileRead", defaultLabel: "File read" };
  if (input.tone === "document_search") return { iconName: "search", labelKey: "agentConsole.stepTypes.search", defaultLabel: "Search" };
  if (input.tone === "document_change") return { iconName: "edit", labelKey: "agentConsole.stepTypes.fileEdit", defaultLabel: "File edit" };
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