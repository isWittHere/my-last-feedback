import type {
  AgentContentBlock,
  AgentCompactionBlock,
  AgentErrorBlock,
  AgentPermissionBlock,
  AgentTaskItem,
  AgentTaskListBlock,
  AgentTextBlock,
  AgentThinkingBlock,
  AgentToolCallBlock,
} from "../types";
import type { OpenCodeBusEvent, OpenCodeErrorInfo, OpenCodeMessageInfo, OpenCodeMessagePart, OpenCodeTodoItem } from "./httpTypes";

export type OpenCodeNormalizedEvent =
  | OpenCodeNormalizedBlockEvent
  | OpenCodeNormalizedTextDeltaEvent
  | OpenCodeNormalizedPermissionEvent
  | OpenCodeNormalizedPermissionReplyEvent
  | OpenCodeNormalizedSessionDiffEvent
  | OpenCodeNormalizedSessionCompactedEvent
  | OpenCodeNormalizedSessionStatusEvent
  | OpenCodeNormalizedSessionErrorEvent
  | OpenCodeNormalizedMessageEvent
  | OpenCodeNormalizedTodoEvent
  | OpenCodeNormalizedUnknownEvent;

export interface OpenCodeNormalizedBlockEvent {
  type: "block.updated";
  sessionId?: string;
  messageId?: string;
  partId?: string;
  block: AgentContentBlock;
  raw: OpenCodeBusEvent;
}

export interface OpenCodeNormalizedTextDeltaEvent {
  type: "text.delta";
  sessionId?: string;
  messageId?: string;
  partId?: string;
  field?: string;
  delta: string;
  phase: "process" | "result";
  raw: OpenCodeBusEvent;
}

export interface OpenCodeNormalizedPermissionEvent {
  type: "permission.asked";
  sessionId?: string;
  requestId: string;
  block: AgentPermissionBlock;
  raw: OpenCodeBusEvent;
}

export interface OpenCodeNormalizedPermissionReplyEvent {
  type: "permission.replied";
  sessionId?: string;
  requestId: string;
  reply?: string;
  raw: OpenCodeBusEvent;
}

export interface OpenCodeNormalizedSessionDiffEvent {
  type: "session.diff";
  sessionId?: string;
  diff: Array<{ file: string; patch: string; additions: number; deletions: number; status?: "added" | "deleted" | "modified" }>;
  raw: OpenCodeBusEvent;
}

export interface OpenCodeNormalizedSessionCompactedEvent {
  type: "session.compacted";
  sessionId?: string;
  raw: OpenCodeBusEvent;
}

export interface OpenCodeNormalizedSessionStatusEvent {
  type: "session.status";
  sessionId?: string;
  status: "idle" | "running" | "retry" | "unknown";
  rawStatus?: unknown;
  raw: OpenCodeBusEvent;
}

export interface OpenCodeNormalizedSessionErrorEvent {
  type: "session.error";
  sessionId?: string;
  error: OpenCodeErrorInfo;
  block: AgentErrorBlock;
  raw: OpenCodeBusEvent;
}

export interface OpenCodeNormalizedMessageEvent {
  type: "message.updated";
  sessionId?: string;
  messageId?: string;
  role?: string;
  status: "streaming" | "complete" | "error";
  modelId?: string;
  info?: OpenCodeMessageInfo;
  raw: OpenCodeBusEvent;
}

export interface OpenCodeNormalizedTodoEvent {
  type: "todo.updated";
  sessionId?: string;
  block: AgentTaskListBlock;
  raw: OpenCodeBusEvent;
}

export interface OpenCodeNormalizedUnknownEvent {
  type: "unknown";
  eventType: string;
  raw: OpenCodeBusEvent;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asFileDiff(value: unknown): OpenCodeNormalizedSessionDiffEvent["diff"][number] | null {
  const item = asRecord(value);
  const file = asString(item.file);
  const patch = asString(item.patch);
  const additions = asNumber(item.additions);
  const deletions = asNumber(item.deletions);
  const status = asString(item.status);
  if (!file || patch === undefined || additions === undefined || deletions === undefined) return null;
  return {
    file,
    patch,
    additions,
    deletions,
    ...(status === "added" || status === "deleted" || status === "modified" ? { status } : {}),
  };
}

function timestampFromMs(value: unknown): string {
  const time = asNumber(value);
  if (!time) return new Date().toISOString();
  return new Date(time).toISOString();
}

function blockOrigin(groupId?: string) {
  return {
    phase: "process" as const,
    placement: "inline" as const,
    ...(groupId ? { groupId } : {}),
  };
}

function stringifyOutput(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeToolStatus(status: string | undefined, error?: string, output?: unknown, time?: Record<string, unknown>): AgentToolCallBlock["status"] {
  if (error || status === "error" || status === "failed") return "failed";
  if (status === "completed" || time?.end || time?.completed || output !== undefined) return "completed";
  if (status === "running") return "running";
  return "pending";
}

function permissionOptions() {
  return [
    { id: "once", label: "Allow once", kind: "allow_once" as const },
    { id: "always", label: "Allow in session", kind: "allow_session" as const },
    { id: "reject", label: "Reject", kind: "reject_once" as const },
  ];
}

function normalizeMessageStatus(info: Record<string, unknown>): "streaming" | "complete" | "error" {
  if (info.error) return "error";
  const time = asRecord(info.time);
  if (time.completed || info.finish) return "complete";
  return "streaming";
}

export function normalizeOpenCodeEvent(event: OpenCodeBusEvent): OpenCodeNormalizedEvent[] {
  if (event.type === "message.part.updated") {
    const part = asRecord(event.properties.part) as OpenCodeMessagePart;
    const block = normalizeOpenCodePart(part);
    if (!block) return [];
    return [
      {
        type: "block.updated",
        sessionId: asString(event.properties.sessionID) || asString(part.sessionID),
        messageId: asString(part.messageID),
        partId: asString(event.properties.partID) || asString(part.id),
        block,
        raw: event,
      },
    ];
  }

  if (event.type === "message.part.delta") {
    const field = asString(event.properties.field);
    const part = asRecord(event.properties.part);
    const partType = asString(part.type);
    const delta = asString(event.properties.delta) || "";
    if (!delta) return [];
    return [
      {
        type: "text.delta",
        sessionId: asString(event.properties.sessionID),
        messageId: asString(event.properties.messageID) || asString(part.messageID),
        partId: asString(event.properties.partID) || asString(part.id),
        field,
        delta,
        phase: field === "text" && partType !== "reasoning" ? "result" : "process",
        raw: event,
      },
    ];
  }

  if (event.type === "permission.asked") {
    const block = normalizePermissionAsked(event);
    return [
      {
        type: "permission.asked",
        sessionId: asString(event.properties.sessionID),
        requestId: block.requestId,
        block,
        raw: event,
      },
    ];
  }

  if (event.type === "permission.replied") {
    return [
      {
        type: "permission.replied",
        sessionId: asString(event.properties.sessionID),
        requestId: asString(event.properties.requestID) || asString(event.properties.permissionID) || asString(event.properties.id) || "",
        reply: asString(event.properties.reply) || asString(event.properties.response),
        raw: event,
      },
    ];
  }

  if (event.type === "session.diff") {
    const rawDiff = Array.isArray(event.properties.diff) ? event.properties.diff : [];
    const diff = rawDiff.map(asFileDiff).filter((item): item is OpenCodeNormalizedSessionDiffEvent["diff"][number] => Boolean(item));
    return [
      {
        type: "session.diff",
        sessionId: asString(event.properties.sessionID),
        diff,
        raw: event,
      },
    ];
  }

  if (event.type === "session.compacted") {
    return [
      {
        type: "session.compacted",
        sessionId: asString(event.properties.sessionID),
        raw: event,
      },
    ];
  }

  if (event.type === "session.status") {
    const status = asRecord(event.properties.status);
    const type = asString(status.type);
    return [
      {
        type: "session.status",
        sessionId: asString(event.properties.sessionID),
        status: type === "idle" ? "idle" : type === "busy" ? "running" : type === "retry" ? "retry" : "unknown",
        rawStatus: event.properties.status,
        raw: event,
      },
    ];
  }

  if (event.type === "session.idle") {
    return [
      {
        type: "session.status",
        sessionId: asString(event.properties.sessionID),
        status: "idle",
        rawStatus: { type: "idle" },
        raw: event,
      },
    ];
  }

  if (event.type === "session.error") {
    const error = asRecord(event.properties.error) as OpenCodeErrorInfo;
    return [
      {
        type: "session.error",
        sessionId: asString(event.properties.sessionID),
        error,
        block: normalizeSessionError(event, error),
        raw: event,
      },
    ];
  }

  if (event.type === "message.updated") {
    const info = asRecord(event.properties.info) as OpenCodeMessageInfo;
    return [
      {
        type: "message.updated",
        sessionId: asString(event.properties.sessionID) || asString(info.sessionID),
        messageId: asString(info.id),
        role: asString(info.role),
        status: normalizeMessageStatus(info),
        modelId: [asString(info.providerID), asString(info.modelID)].filter(Boolean).join("/") || undefined,
        info,
        raw: event,
      },
    ];
  }

  if (event.type === "todo.updated") {
    return [
      {
        type: "todo.updated",
        sessionId: asString(event.properties.sessionID),
        block: normalizeTodo(event),
        raw: event,
      },
    ];
  }

  return [{ type: "unknown", eventType: event.type, raw: event }];
}

export function normalizeOpenCodePart(part: OpenCodeMessagePart): AgentContentBlock | null {
  if (part.type === "tool") return normalizeToolPart(part);
  if (part.type === "text") return normalizeTextPart(part);
  if (part.type === "reasoning") return normalizeReasoningPart(part);
  if (part.type === "compaction") return normalizeCompactionPart(part);
  return null;
}

function normalizeCompactionPart(part: OpenCodeMessagePart): AgentCompactionBlock {
  const state = asRecord(part.state);
  const time = asRecord(part.time);
  const content = asString(part.text) || asString(part.content) || asString(part.summary) || asString(state.text) || asString(state.content) || asString(state.summary);
  return {
    id: asString(part.id) || `compaction-${asString(part.messageID) || "part"}`,
    type: "compaction",
    origin: blockOrigin(asString(part.messageID)),
    createdAt: timestampFromMs(time.start || time.created),
    updatedAt: time.end || time.completed ? timestampFromMs(time.end || time.completed) : undefined,
    status: time.end || time.completed ? "completed" : "running",
    auto: asBoolean(part.auto),
    overflow: asBoolean(part.overflow),
    ...(content ? { content } : {}),
  };
}

function normalizeToolPart(part: OpenCodeMessagePart): AgentToolCallBlock | AgentTaskListBlock {
  const state = asRecord(part.state);
  const time = asRecord(state.time || part.time);
  const input = asRecord(state.input ?? part.input);
  const toolName = asString(part.tool) || "tool";
  const status = asString(state.status) || asString(part.status);
  const outputValue = state.output !== undefined ? state.output : part.output;
  const output = stringifyOutput(outputValue);
  const error = asString(state.error) || asString(part.error);
  if (toolName === "todowrite") {
    const metadata = asRecord(state.metadata || part.metadata);
    const todos = Array.isArray(input.todos)
      ? input.todos
      : Array.isArray(metadata.todos)
        ? metadata.todos
        : parseJsonArray(outputValue);
    const block = normalizeOpenCodeTodos(todos, asString(part.sessionID));
    return {
      ...block,
      id: asString(part.callID) || asString(part.id) || block.id,
      origin: blockOrigin(asString(part.messageID)),
      createdAt: timestampFromMs(time.start),
      updatedAt: timestampFromMs(time.end || time.start),
      title: asString(state.title) || asString(part.title) || block.title,
    };
  }
  return {
    id: asString(part.callID) || asString(part.id) || `tool-${toolName}`,
    type: "tool_call",
    origin: blockOrigin(asString(part.messageID)),
    createdAt: timestampFromMs(time.start),
    updatedAt: timestampFromMs(time.end || time.start),
    name: toolName,
    title: asString(state.title) || asString(part.title) || toolName,
    label: asString(state.title) || asString(part.title) || toolName,
    status: normalizeToolStatus(status, error, outputValue, time),
    args: input,
    result: error || output,
  };
}

function normalizeTextPart(part: OpenCodeMessagePart): AgentTextBlock {
  const time = asRecord(part.time);
  return {
    id: asString(part.id) || `text-${asString(part.messageID) || "part"}`,
    type: "text",
    origin: { phase: "result", placement: "inline" },
    createdAt: timestampFromMs(time.start),
    updatedAt: time.end || time.completed ? timestampFromMs(time.end || time.completed) : undefined,
    content: asString(part.text) || asString(part.content) || "",
  };
}

function normalizeReasoningPart(part: OpenCodeMessagePart): AgentThinkingBlock {
  const state = asRecord(part.state);
  const time = asRecord(state.time || part.time);
  const status = asString(part.status) || asString(state.status);
  const completed = status === "completed" || Boolean(time.end || time.completed);
  return {
    id: asString(part.id) || `reasoning-${asString(part.messageID) || "part"}`,
    type: "thinking",
    origin: blockOrigin(asString(part.messageID)),
    createdAt: timestampFromMs(time.start),
    updatedAt: time.end || time.completed ? timestampFromMs(time.end || time.completed) : undefined,
    content: asString(part.text) || asString(part.summary) || asString(state.text) || asString(state.summary) || "",
    status: completed ? "completed" : "running",
  };
}

function normalizePermissionAsked(event: OpenCodeBusEvent): AgentPermissionBlock {
  const tool = asRecord(event.properties.tool);
  const metadata = asRecord(event.properties.metadata);
  const permission = asString(event.properties.permission) || "permission";
  const patterns = Array.isArray(event.properties.patterns) ? event.properties.patterns.filter((item): item is string => typeof item === "string") : [];
  const title = `${permission}${patterns.length ? ` ${patterns.join(", ")}` : ""}`;
  return {
    id: asString(event.properties.id) || `permission-${permission}`,
    type: "permission",
    origin: blockOrigin(asString(tool.messageID)),
    createdAt: new Date().toISOString(),
    requestId: asString(event.properties.id) || "",
    permission,
    title,
    patterns,
    metadata,
    toolCallId: asString(tool.callID),
    status: "pending",
    options: permissionOptions(),
  };
}

function normalizeSessionError(event: OpenCodeBusEvent, error: OpenCodeErrorInfo): AgentErrorBlock {
  return {
    id: `session-error-${asString(event.properties.sessionID) || Date.now().toString(36)}`,
    type: "error",
    origin: { phase: "process", placement: "standalone" },
    createdAt: new Date().toISOString(),
    message: error.message || error.name || "OpenCode session error",
    detail: stringifyOutput(error.data),
  };
}

function normalizeTodo(event: OpenCodeBusEvent): AgentTaskListBlock {
  const todos = Array.isArray(event.properties.todos) ? event.properties.todos : Array.isArray(event.properties.todo) ? event.properties.todo : [];
  return normalizeOpenCodeTodos(todos, asString(event.properties.sessionID));
}

export function normalizeOpenCodeTodos(todos: unknown[], sessionId?: string): AgentTaskListBlock {
  const tasks = todos.map(normalizeTodoItem).filter((task) => task.title.trim());
  return {
    id: `todo-${sessionId || "session"}`,
    type: "task_list",
    origin: { phase: "process", placement: "standalone" },
    createdAt: new Date().toISOString(),
    title: tasks.length > 0 ? `${tasks.length} todos` : "Todo",
    tasks,
  };
}

function normalizeTodoItem(item: unknown, index: number): AgentTaskItem {
  const todo = asRecord(item) as OpenCodeTodoItem;
  const status = asString(todo.status);
  const priority = asString(todo.priority);
  return {
    id: asString(todo.id) || `todo-${index}`,
    title: asString(todo.title) || asString(todo.content) || "Untitled task",
    status: status === "completed" ? "completed" : status === "in_progress" || status === "in-progress" ? "in-progress" : "not-started",
    priority: priority === "high" || priority === "medium" || priority === "low" ? priority : undefined,
  };
}
