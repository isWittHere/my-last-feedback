import type {
  OpenCodeAgentInfo,
  OpenCodeBusEvent,
  OpenCodeCommandInfo,
  OpenCodeCommandRequest,
  OpenCodeFileDiff,
  OpenCodeForkRequest,
  OpenCodeHealthResponse,
  OpenCodeHttpClientOptions,
  OpenCodePermissionReplyBody,
  OpenCodePermissionRequest,
  OpenCodeMessage,
  OpenCodePermissionRule,
  OpenCodePermissionReply,
  OpenCodePromptRequest,
  OpenCodeProviderResponse,
  OpenCodeRequestOptions,
  OpenCodeSessionInfo,
  OpenCodeSessionStatusMap,
  OpenCodeSseCollectorHandlers,
  OpenCodeSummarizeRequest,
  OpenCodeTodoItem,
  OpenCodeVcsDiffMode,
  OpenCodeVcsInfo,
} from "./httpTypes";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function authHeader(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function buildUrl(baseUrl: string, route: string, query: OpenCodeRequestOptions["query"] = {}): URL {
  const url = new URL(route, `${normalizeBaseUrl(baseUrl)}/`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

function unwrapEvent(raw: unknown): OpenCodeBusEvent {
  const rawObject = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const payload = typeof rawObject.payload === "object" && rawObject.payload !== null ? (rawObject.payload as Record<string, unknown>) : rawObject;
  const properties = typeof payload.properties === "object" && payload.properties !== null ? (payload.properties as Record<string, unknown>) : {};
  return {
    raw,
    type: typeof payload.type === "string" ? payload.type : "unknown",
    properties,
  };
}

const SSE_FLUSH_FRAME_MS = 16;

function eventProperties(event: OpenCodeBusEvent): Record<string, unknown> {
  return typeof event.properties === "object" && event.properties !== null ? event.properties as Record<string, unknown> : {};
}

function eventPart(properties: Record<string, unknown>): Record<string, unknown> | undefined {
  return typeof properties.part === "object" && properties.part !== null ? properties.part as Record<string, unknown> : undefined;
}

function sseEventKey(event: OpenCodeBusEvent): string | undefined {
  const properties = eventProperties(event);
  if (event.type === "session.status") return `session.status:${String(properties.sessionID || "")}`;
  if (event.type === "lsp.updated") return "lsp.updated";
  if (event.type !== "message.part.updated") return undefined;
  const part = eventPart(properties);
  const messageId = String(part?.messageID || properties.messageID || "");
  const partId = String(part?.id || properties.partID || "");
  return messageId && partId ? `message.part.updated:${messageId}:${partId}` : undefined;
}

function sseDeltaKey(event: OpenCodeBusEvent): string | undefined {
  const properties = eventProperties(event);
  if (event.type === "message.part.updated") {
    const part = eventPart(properties);
    const messageId = String(part?.messageID || properties.messageID || "");
    const partId = String(part?.id || properties.partID || "");
    return messageId && partId ? `${messageId}:${partId}` : undefined;
  }
  if (event.type === "message.part.delta") {
    const messageId = String(properties.messageID || "");
    const partId = String(properties.partID || "");
    return messageId && partId ? `${messageId}:${partId}` : undefined;
  }
  return undefined;
}

function partUpdateHasTextSnapshot(event: OpenCodeBusEvent): boolean {
  const part = eventPart(eventProperties(event));
  if (!part) return false;
  return [part.text, part.summary, part.content].some((value) => typeof value === "string" && value.length > 0);
}

export class OpenCodeHttpClient {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly directory?: string;

  constructor(options: OpenCodeHttpClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.username = options.auth.username;
    this.password = options.auth.password;
    this.directory = options.directory;
  }

  get url(): string {
    return this.baseUrl;
  }

  withDirectory(directory: string): OpenCodeHttpClient {
    return new OpenCodeHttpClient({
      baseUrl: this.baseUrl,
      auth: { username: this.username, password: this.password },
      directory,
    });
  }

  async request<T>(route: string, options: OpenCodeRequestOptions = {}): Promise<T> {
    const query = { ...(this.directory ? { directory: this.directory } : {}), ...(options.query || {}) };
    const response = await fetch(buildUrl(this.baseUrl, route, query), {
      method: options.method || "GET",
      headers: {
        Authorization: authHeader(this.username, this.password),
        Accept: options.accept || "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    const data = contentType.includes("application/json") && text ? JSON.parse(text) : text;
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    return data as T;
  }

  health(): Promise<OpenCodeHealthResponse> {
    return this.request<OpenCodeHealthResponse>("/global/health", { query: {} });
  }

  providers(): Promise<OpenCodeProviderResponse> {
    return this.request<OpenCodeProviderResponse>("/provider");
  }

  config(): Promise<unknown> {
    return this.request<unknown>("/config");
  }

  agents(): Promise<OpenCodeAgentInfo[]> {
    return this.request<OpenCodeAgentInfo[]>("/agent");
  }

  commands(): Promise<OpenCodeCommandInfo[]> {
    return this.request<OpenCodeCommandInfo[]>("/command");
  }

  vcs(): Promise<OpenCodeVcsInfo> {
    return this.request<OpenCodeVcsInfo>("/vcs");
  }

  vcsDiff(mode: OpenCodeVcsDiffMode): Promise<OpenCodeFileDiff[]> {
    return this.request<OpenCodeFileDiff[]>("/vcs/diff", { query: { mode } });
  }

  permissions(): Promise<OpenCodePermissionRequest[]> {
    return this.request<OpenCodePermissionRequest[]>("/permission");
  }

  listSessions(): Promise<OpenCodeSessionInfo[]> {
    return this.request<OpenCodeSessionInfo[]>("/session");
  }

  sessionStatuses(): Promise<OpenCodeSessionStatusMap> {
    return this.request<OpenCodeSessionStatusMap>("/session/status");
  }

  createSession(): Promise<OpenCodeSessionInfo> {
    return this.request<OpenCodeSessionInfo>("/session", { method: "POST", body: {} });
  }

  updateSession(sessionId: string, body: Partial<OpenCodeSessionInfo> & { permission?: OpenCodePermissionRule[] }): Promise<OpenCodeSessionInfo> {
    return this.request<OpenCodeSessionInfo>(`/session/${encodeURIComponent(sessionId)}`, { method: "PATCH", body });
  }

  deleteSession(sessionId: string): Promise<boolean> {
    return this.request<boolean>(`/session/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  }

  forkSession(sessionId: string, body: OpenCodeForkRequest): Promise<OpenCodeSessionInfo> {
    return this.request<OpenCodeSessionInfo>(`/session/${encodeURIComponent(sessionId)}/fork`, { method: "POST", body });
  }

  messages(sessionId: string): Promise<OpenCodeMessage[]> {
    return this.request<OpenCodeMessage[]>(`/session/${encodeURIComponent(sessionId)}/message`);
  }

  todos(sessionId: string): Promise<OpenCodeTodoItem[]> {
    return this.request<OpenCodeTodoItem[]>(`/session/${encodeURIComponent(sessionId)}/todo`);
  }

  sessionDiff(sessionId: string): Promise<OpenCodeFileDiff[]> {
    return this.request<OpenCodeFileDiff[]>(`/session/${encodeURIComponent(sessionId)}/diff`);
  }

  promptAsync(sessionId: string, body: OpenCodePromptRequest): Promise<boolean> {
    return this.request<boolean>(`/session/${encodeURIComponent(sessionId)}/prompt_async`, { method: "POST", body });
  }

  command(sessionId: string, body: OpenCodeCommandRequest): Promise<OpenCodeMessage> {
    return this.request<OpenCodeMessage>(`/session/${encodeURIComponent(sessionId)}/command`, { method: "POST", body });
  }

  summarizeSession(sessionId: string, body: OpenCodeSummarizeRequest): Promise<boolean> {
    return this.request<boolean>(`/session/${encodeURIComponent(sessionId)}/summarize`, { method: "POST", body });
  }

  abort(sessionId: string): Promise<boolean> {
    return this.request<boolean>(`/session/${encodeURIComponent(sessionId)}/abort`, { method: "POST" });
  }

  respondPermission(sessionId: string, permissionId: string, response: OpenCodePermissionReply): Promise<boolean> {
    return this.request<boolean>(`/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`, {
      method: "POST",
      body: { response },
    });
  }

  replyPermission(permissionId: string, body: OpenCodePermissionReplyBody): Promise<boolean> {
    return this.request<boolean>(`/permission/${encodeURIComponent(permissionId)}/reply`, { method: "POST", body });
  }

  openEvents(handlers: OpenCodeSseCollectorHandlers = {}): OpenCodeSseConnection {
    return new OpenCodeSseConnection({
      baseUrl: this.baseUrl,
      route: "/event",
      query: this.directory ? { directory: this.directory } : {},
      auth: { username: this.username, password: this.password },
      handlers,
    });
  }

  openGlobalEvents(handlers: OpenCodeSseCollectorHandlers = {}): OpenCodeSseConnection {
    return new OpenCodeSseConnection({
      baseUrl: this.baseUrl,
      route: "/global/event",
      query: {},
      auth: { username: this.username, password: this.password },
      handlers,
    });
  }
}

interface OpenCodeSseConnectionOptions {
  baseUrl: string;
  route: string;
  query: Record<string, string>;
  auth: { username: string; password: string };
  handlers: OpenCodeSseCollectorHandlers;
}

export class OpenCodeSseConnection {
  private readonly options: OpenCodeSseConnectionOptions;
  private readonly controller = new AbortController();
  private started = false;
  private eventQueue: OpenCodeBusEvent[] = [];
  private coalescedEvents = new Map<string, number>();
  private staleDeltaKeys = new Set<string>();
  private flushTimer: number | undefined;

  constructor(options: OpenCodeSseConnectionOptions) {
    this.options = options;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.run();
  }

  stop(): void {
    this.controller.abort();
    this.flushEvents();
  }

  private async run(): Promise<void> {
    try {
      const response = await fetch(buildUrl(this.options.baseUrl, this.options.route, this.options.query), {
        headers: {
          Authorization: authHeader(this.options.auth.username, this.options.auth.password),
          Accept: "text/event-stream",
        },
        signal: this.controller.signal,
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      if (!response.body) throw new Error("OpenCode SSE response has no body");
      this.options.handlers.onOpen?.();
      await this.readStream(response.body.getReader());
      this.flushEvents();
      this.options.handlers.onClose?.();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        this.options.handlers.onClose?.();
        return;
      }
      this.options.handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async readStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() || "";
      for (const chunk of chunks) this.handleChunk(chunk);
    }
  }

  private handleChunk(chunk: string): void {
    const data = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    try {
      this.enqueueEvent(unwrapEvent(JSON.parse(data)));
    } catch (error) {
      this.options.handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private enqueueEvent(event: OpenCodeBusEvent): void {
    const key = sseEventKey(event);
    if (key) {
      const existingIndex = this.coalescedEvents.get(key);
      if (existingIndex !== undefined) {
        this.eventQueue[existingIndex] = event;
      } else {
        this.coalescedEvents.set(key, this.eventQueue.length);
        this.eventQueue.push(event);
      }
      if (event.type === "message.part.updated" && partUpdateHasTextSnapshot(event)) {
        const deltaKey = sseDeltaKey(event);
        if (deltaKey) this.staleDeltaKeys.add(deltaKey);
      }
    } else {
      this.eventQueue.push(event);
    }
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== undefined) return;
    this.flushTimer = window.setTimeout(() => this.flushEvents(), SSE_FLUSH_FRAME_MS);
  }

  private flushEvents(): void {
    if (this.flushTimer !== undefined) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.eventQueue.length === 0) return;
    const events = this.eventQueue;
    const staleDeltaKeys = this.staleDeltaKeys.size > 0 ? new Set(this.staleDeltaKeys) : undefined;
    this.eventQueue = [];
    this.coalescedEvents.clear();
    this.staleDeltaKeys.clear();
    for (const event of events) {
      if (event.type === "message.part.delta" && staleDeltaKeys?.has(sseDeltaKey(event) || "")) continue;
      this.options.handlers.onEvent?.(event);
    }
  }
}
