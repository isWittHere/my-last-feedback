import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { readSessionListMode, readShowSessionNavigationAttachmentDots, readUseSessionNavigationColorCards, saveSessionListMode, saveShowSessionNavigationAttachmentDots, saveUseSessionNavigationColorCards, type SessionListMode } from "../sessionNavigationSettings";
import { isAgentUiDisabled } from "../agent/agentUiFlags";
import { normalizeWorkspacePath, sameWorkspacePath, workspacePathKey } from "../workspace/workspacePaths";

export interface ImageAttachment {
  path: string;
  name: string;
  sizeKB: number;
  dataUrl?: string;
}

export interface PromptItem {
  name: string;
  description: string;
  content: string;
  icon: string;
}

export type CallerColumnMode = "auto" | 1 | 2 | 3;

// ── Multi-session types ──

export type SessionStatus = "pending" | "responded" | "cancelled";

export const REQUEST_TYPES = [
  "analysis",
  "completion",
  "planning",
  "document",
] as const;

export type RequestType = typeof REQUEST_TYPES[number] | "default";

export function normalizeRequestType(value: unknown): RequestType {
  if (typeof value === "string" && (REQUEST_TYPES as readonly string[]).includes(value)) return value as RequestType;
  if (value === "default") return "default";
  return "default";
}

export interface QuestionItem {
  label: string;
  options?: string[];
  selectedOptions: string[];
  answer: string;
}

export interface Caller {
  id: string;
  name: string;
  version: string;
  color: string;
  workspaceKey?: string;
  pendingCount: number;
  clientName?: string;
  alias?: string;
}

export type GitActionType = "commit-before" | "commit" | "commit-push" | "create-branch";

export interface GitAction {
  type: GitActionType;
  branchName?: string;
}

export interface MlcAttachment {
  filePath: string;
  title: string;
  description: string;
}

export interface LocatorCandidate {
  kind: "css" | "playwright-role" | "playwright-label" | "playwright-text" | "testid" | "xpath";
  value: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface PickedElement {
  sourceUrl: string;
  frameUrl?: string;
  tagName: string;
  text: string;
  role?: string;
  ariaLabel?: string;
  title?: string;
  href?: string;
  src?: string;
  id?: string;
  className?: string;
  name?: string;
  placeholder?: string;
  inputType?: string;
  selector: string;
  selectorType: "id" | "testid" | "data-testid" | "data-test" | "data-cy" | "aria-label" | "name" | "placeholder" | "class" | "role" | "aria" | "css" | "nth";
  locatorCandidates: LocatorCandidate[];
  attributes?: Record<string, string>;
  domPath?: string;
  xpath?: string;
  styleSummary?: Record<string, string>;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  viewport?: {
    width: number;
    height: number;
  };
  screenshot?: ElementScreenshotRef;
  htmlSnippet?: string;
  capturedAt: string;
}

export interface ElementScreenshotRef {
  id: string;
  kind: "element" | "context";
  fileName?: string;
  filePath?: string;
  dataUrl?: string;
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
  sizeKB?: number;
  sizeKb?: number;
  devicePixelRatio: number;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  capturedAt: string;
  status: "ready" | "failed";
  error?: string;
}

export interface WebConsoleEntry {
  id: string;
  level: "log" | "info" | "warn" | "error" | "debug";
  message: string;
  args: string[];
  sourceUrl: string;
  line?: number;
  column?: number;
  stack?: string;
  timestamp: string;
}

export interface WebAttachment {
  id: string;
  kind: "element" | "console";
  sourceUrl: string;
  pageTitle: string;
  capturedAt: string;
  element?: PickedElement;
  consoleEntries?: WebConsoleEntry[];
}

export type ComposerFocusKind = "feedback" | "testLog" | "question" | "queuedDraft" | "agent";

export interface FocusedComposer {
  callerId: string;
  sessionId?: string;
  projectDirectory: string;
  workspaceKey?: string;
  kind: ComposerFocusKind;
  focusedAt: string;
}

export type MlcPanelPosition = "left" | "right";
export type SidePanelTab = "mlc" | "resources" | "mlcPreview" | "previewBrowser" | "previewInfo" | "agentConsole" | "agentSessions" | "terminal";
export type DockColumnId = "leftSidebar" | "leftPage" | "rightPage" | "rightSidebar";
export type DockTabId = SidePanelTab;
export type DockTabBarPosition = "top" | "bottom";

export type SelectedMlcDocumentSource = "mlc" | "resource";

export interface SelectedMlcDocument {
  filePath: string;
  fileName: string;
  title: string;
  description: string;
  project: string;
  type: string;
  updatedAt: string;
  workspaceName: string;
  workspacePath: string;
  folderName?: string | null;
  folderPath?: string | null;
  source?: SelectedMlcDocumentSource;
}

export interface DockColumnState {
  tabIds: DockTabId[];
  activeTabId: DockTabId | null;
  width: number;
  tabBarPosition: DockTabBarPosition;
  collapsed: boolean;
}

export interface DockLayoutState {
  columns: Record<DockColumnId, DockColumnState>;
}

export interface DraggingDockTabState {
  tabId: DockTabId;
  sourceColumnId: DockColumnId;
  pointerX: number;
  pointerY: number;
  targetColumnId: DockColumnId | null;
}

export type NewRequestAttentionMode = "interrupt" | "passive";

export interface AddSessionOptions {
  attentionMode?: NewRequestAttentionMode;
  applyQueuedDraft?: boolean;
}

export interface FeedbackDraft {
  feedbackText: string;
  testLogText: string;
  images: ImageAttachment[];
  gitAction: GitAction | null;
  mlcAttachments: MlcAttachment[];
  webAttachments: WebAttachment[];
  updatedAt: string;
}

export type SessionDraftField = "feedbackText" | "testLogText" | "commandLogs";

export type SessionTextDraft = Pick<Session, SessionDraftField>;

export interface Session {
  id: string;
  callerId: string;
  requestName: string;
  requestType: RequestType;
  summary: string;
  projectDirectory: string;
  status: SessionStatus;
  createdAt: string;
  // User input (editable when pending, readonly when responded)
  feedbackText: string;
  testLogText: string;
  images: ImageAttachment[];
  commandLogs: string;
  mlcAttachments: MlcAttachment[];
  webAttachments: WebAttachment[];
  // Agent questions
  questions: QuestionItem[];
  // Git action
  gitAction: GitAction | null;
}

export interface FeedbackState {
  prompts: PromptItem[];

  setPrompts: (prompts: PromptItem[]) => void;

  // Prompt visibility
  disabledPrompts: string[];
  showPromptButtons: boolean;
  showTransferSubmitUi: boolean;
  resourceIconTheme: ResourceIconTheme;
  mlcPreviewShowYaml: boolean;
  sessionListMode: SessionListMode;
  showSessionNavigationAttachmentDots: boolean;
  useSessionNavigationColorCards: boolean;
  setDisabledPrompts: (names: string[]) => void;
  setShowPromptButtons: (value: boolean) => void;
  setShowTransferSubmitUi: (value: boolean) => void;
  setResourceIconTheme: (theme: ResourceIconTheme) => void;
  setMlcPreviewShowYaml: (value: boolean) => void;
  setSessionListMode: (mode: SessionListMode) => void;
  setShowSessionNavigationAttachmentDots: (value: boolean) => void;
  setUseSessionNavigationColorCards: (value: boolean) => void;
  togglePromptDisabled: (name: string) => void;

  // ── Persistent mode fields ──
  callers: Caller[];
  callerOrder: string[]; // user-controlled display order of caller IDs
  unreadCallerIds: string[]; // callers with unread new sessions
  hiddenCallerIds: string[]; // callers hidden from top bar tabs
  callerColumnMode: CallerColumnMode;
  visibleColumnCount: number; // how many callers are visible in the window columns
  sessions: Session[];
  sessionDraftsById: Record<string, SessionTextDraft>;
  activeCallerId: string | null;
  activeSessionId: string | null;
  queuedDraftsByCallerId: Record<string, FeedbackDraft>;
  messageHistoryByCallerId: Record<string, string[]>;
  focusedComposer: FocusedComposer | null;
  mlcActiveWorkspacePath: string | null;
  selectedMlcDocument: SelectedMlcDocument | null;
  dockLayout: DockLayoutState;
  draggingDockTab: DraggingDockTabState | null;
  nativeWebViewBlockers: Record<string, number>;

  // Persistent mode actions
  addCaller: (caller: Caller) => void;
  updateCallerColor: (id: string, color: string) => void;
  setActiveCaller: (id: string) => void;
  setCallerOrder: (order: string[]) => void;
  sortCallersByName: () => void;
  renameCaller: (callerId: string, newName: string) => Promise<void>;
  mergeCallers: (sourceId: string, targetId: string) => Promise<void>;
  clearAllHistory: () => Promise<void>;
  addSession: (session: Session, options?: AddSessionOptions) => void;
  setActiveSession: (id: string) => void;
  updateSessionField: (sessionId: string, field: SessionDraftField, value: string) => void;
  addSessionImage: (sessionId: string, img: ImageAttachment) => void;
  removeSessionImage: (sessionId: string, path: string) => void;
  clearSessionImages: (sessionId: string) => void;
  addSessionMlcAttachment: (sessionId: string, attachment: MlcAttachment) => void;
  removeSessionMlcAttachment: (sessionId: string, filePath: string) => void;
  clearSessionMlcAttachments: (sessionId: string) => void;
  addSessionWebAttachment: (sessionId: string, attachment: WebAttachment) => void;
  removeSessionWebAttachment: (sessionId: string, attachmentId: string) => void;
  clearSessionWebAttachments: (sessionId: string) => void;
  setSessionGitAction: (sessionId: string, action: GitAction | null) => void;
  updateSessionGitBranchName: (sessionId: string, branchName: string) => void;
  completeSessionWithSubmittedFeedback: (sessionId: string, feedbackText: string) => void;
  markSessionResponded: (sessionId: string) => void;
  markSessionCancelled: (sessionId: string) => void;
  removeSession: (sessionId: string) => void;
  removeCaller: (callerId: string) => Promise<void>;
  removeEmptyCallers: () => Promise<string[]>;
  maxSessionsPerCaller: number;
  setMaxSessionsPerCaller: (value: number) => void;
  autoRemoveEmptyCallers: boolean;
  setAutoRemoveEmptyCallers: (value: boolean) => void;
  autoHideInactiveHours: number;
  setAutoHideInactiveHours: (value: number) => void;
  hideInactiveCallers: () => void;
  updateSessionAnswer: (sessionId: string, questionIndex: number, answer: string) => void;
  toggleSessionOption: (sessionId: string, questionIndex: number, option: string) => void;
  updateCallerPendingCount: (callerId: string) => void;
  markCallerRead: (callerId: string) => void;
  toggleCallerHidden: (callerId: string) => void;
  unhideCaller: (callerId: string) => void;
  trimCallerSessions: (callerId: string) => Promise<void>;
  setCallerColumnMode: (mode: CallerColumnMode) => void;
  setVisibleColumnCount: (count: number) => void;
  setQueuedDrafts: (drafts: Record<string, FeedbackDraft>) => void;
  getQueuedDraft: (callerId: string) => FeedbackDraft;
  updateQueuedDraftField: (callerId: string, field: "feedbackText" | "testLogText", value: string) => void;
  addQueuedDraftImage: (callerId: string, img: ImageAttachment) => void;
  removeQueuedDraftImage: (callerId: string, path: string) => void;
  clearQueuedDraftImages: (callerId: string) => void;
  addQueuedDraftMlcAttachment: (callerId: string, attachment: MlcAttachment) => void;
  removeQueuedDraftMlcAttachment: (callerId: string, filePath: string) => void;
  clearQueuedDraftMlcAttachments: (callerId: string) => void;
  addQueuedDraftWebAttachment: (callerId: string, attachment: WebAttachment) => void;
  removeQueuedDraftWebAttachment: (callerId: string, attachmentId: string) => void;
  clearQueuedDraftWebAttachments: (callerId: string) => void;
  setQueuedDraftGitAction: (callerId: string, action: GitAction | null) => void;
  updateQueuedDraftGitBranchName: (callerId: string, branchName: string) => void;
  clearQueuedDraft: (callerId: string) => void;
  applyQueuedDraftToSession: (callerId: string, sessionId: string) => void;
  pushMessageHistory: (callerId: string, text: string) => void;
  getMessageHistory: (callerId: string) => string[];
  clearMessageHistory: (callerId?: string) => void;
  setFocusedComposer: (focus: FocusedComposer) => void;
  clearFocusedComposer: (sessionId?: string) => void;
  setMlcActiveWorkspacePath: (path: string | null) => void;
  setSelectedMlcDocument: (document: SelectedMlcDocument | null) => void;
  setDockColumnWidth: (columnId: DockColumnId, width: number) => void;
  setDockColumnCollapsed: (columnId: DockColumnId, collapsed: boolean) => void;
  setDockColumnTabBarPosition: (columnId: DockColumnId, position: DockTabBarPosition) => void;
  setDockActiveTab: (columnId: DockColumnId, tabId: DockTabId | null) => void;
  moveDockTabToColumn: (tabId: DockTabId, targetColumnId: DockColumnId, targetIndex?: number) => void;
  openDockTab: (tabId: DockTabId, preferredColumnId: DockColumnId) => void;
  startDraggingDockTab: (tabId: DockTabId, sourceColumnId: DockColumnId, pointerX: number, pointerY: number, targetColumnId?: DockColumnId | null) => void;
  updateDraggingDockTab: (pointerX: number, pointerY: number, targetColumnId: DockColumnId | null) => void;
  finishDraggingDockTab: () => void;
  pushNativeWebViewBlocker: (key: string) => void;
  popNativeWebViewBlocker: (key: string) => void;

  // Derived getters
  getActiveCaller: () => Caller | null;
  getActiveCallerSessions: () => Session[];
  getActiveSession: () => Session | null;
}

const IMAGE_MAX_COUNT = 5;
const IMAGE_MAX_SIZE_MB = 5;
const IMAGE_MAX_TOTAL_MB = 20;
const MESSAGE_HISTORY_MAX = 50;
const MLC_PANEL_DEFAULT_WIDTH = 320;
const MLC_PANEL_MIN_WIDTH = 240;
const MLC_PANEL_MAX_WIDTH = 520;
const MLC_PAGE_PANEL_MAX_WIDTH = 720;
const DOCK_LAYOUT_STORAGE_KEY = "mlfb-dock-layout-v1";
const CALLER_COLUMN_MODE_STORAGE_KEY = "mlf-caller-column-mode";

export type ResourceIconTheme = "default" | "catppuccin";

function parseCallerColumnMode(value: string | null): CallerColumnMode {
  if (value === "1") return 1;
  if (value === "2") return 2;
  if (value === "3") return 3;
  return "auto";
}

function loadCallerColumnMode(): CallerColumnMode {
  try { return parseCallerColumnMode(localStorage.getItem(CALLER_COLUMN_MODE_STORAGE_KEY)); } catch { return "auto"; }
}

function loadResourceIconTheme(): ResourceIconTheme {
  try {
    const stored = localStorage.getItem("mlfb-resource-icon-theme");
    if (stored === "catppuccin" || stored === "catppuccin-mocha") return "catppuccin";
    return "default";
  } catch { return "default"; }
}

function normalizeProjectDirectory(value?: string | null): string {
  return normalizeWorkspacePath(value) || "";
}

function normalizeCallerWorkspaceKey(value?: string | null): string {
  return workspacePathKey(value);
}

function normalizeCallerInfo(caller: Caller): Caller {
  return {
    ...caller,
    workspaceKey: normalizeCallerWorkspaceKey(caller.workspaceKey),
  };
}

function normalizeSessionWorkspace(session: Session): Session {
  return {
    ...session,
    projectDirectory: normalizeProjectDirectory(session.projectDirectory),
  };
}

function normalizeFocusedComposer(focus: FocusedComposer): FocusedComposer {
  const projectDirectory = normalizeProjectDirectory(focus.projectDirectory);
  return {
    ...focus,
    projectDirectory,
    workspaceKey: workspacePathKey(focus.workspaceKey) || workspacePathKey(projectDirectory),
  };
}

function latestWorkspaceKeyForCaller(callerId: string, sessions: Session[]): string {
  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const session = sessions[index];
    if (session.callerId !== callerId) continue;
    const key = workspacePathKey(session.projectDirectory);
    if (key) return key;
  }
  return "";
}

function callerWorkspaceKey(caller: Caller, sessions: Session[]): string {
  return workspacePathKey(caller.workspaceKey) || latestWorkspaceKeyForCaller(caller.id, sessions);
}

function syncCallerWorkspaceColors(
  callers: Caller[],
  sessions: Session[],
  preferred?: { workspaceKey?: string | null; color?: string | null },
): Caller[] {
  const colorByWorkspace = new Map<string, string>();
  const preferredKey = workspacePathKey(preferred?.workspaceKey);
  const preferredColor = preferred?.color?.trim();
  if (preferredKey && preferredColor) colorByWorkspace.set(preferredKey, preferredColor);
  for (const caller of callers) {
    const key = callerWorkspaceKey(caller, sessions);
    const color = caller.color?.trim();
    if (key && color && !colorByWorkspace.has(key)) colorByWorkspace.set(key, color);
  }
  return callers.map((caller) => {
    const key = callerWorkspaceKey(caller, sessions);
    const color = key ? colorByWorkspace.get(key) : undefined;
    return {
      ...caller,
      workspaceKey: key || caller.workspaceKey,
      color: color || caller.color,
    };
  });
}

const DOCK_COLUMN_IDS: DockColumnId[] = ["leftSidebar", "leftPage", "rightPage", "rightSidebar"];
const AGENT_DOCK_TABS: DockTabId[] = ["agentConsole", "agentSessions"];
const CORE_DOCK_TABS: DockTabId[] = ["mlc", "resources", "mlcPreview", "previewBrowser", "previewInfo", "terminal"];
const KNOWN_DOCK_TABS: DockTabId[] = isAgentUiDisabled
  ? CORE_DOCK_TABS
  : [...CORE_DOCK_TABS, ...AGENT_DOCK_TABS];
const DEFAULT_DOCK_TABS: DockTabId[] = isAgentUiDisabled
  ? ["mlc", "mlcPreview", "resources", "previewBrowser", "previewInfo", "terminal"]
  : ["mlc", "mlcPreview", "resources", "previewBrowser", "previewInfo", "agentConsole", "agentSessions", "terminal"];

function isDockTabId(value: unknown): value is DockTabId {
  return typeof value === "string" && KNOWN_DOCK_TABS.includes(value as DockTabId);
}

function isAgentDockTab(tabId: DockTabId): boolean {
  return tabId === "agentConsole" || tabId === "agentSessions";
}

function dockColumnMaxWidth(columnId?: DockColumnId): number {
  return columnId === "leftPage" || columnId === "rightPage"
    ? MLC_PAGE_PANEL_MAX_WIDTH
    : MLC_PANEL_MAX_WIDTH;
}

function clampDockWidth(width: number, columnId?: DockColumnId): number {
  return Math.min(dockColumnMaxWidth(columnId), Math.max(MLC_PANEL_MIN_WIDTH, width));
}

function createDockColumn(overrides: Partial<DockColumnState> = {}): DockColumnState {
  return {
    tabIds: [],
    activeTabId: null,
    width: MLC_PANEL_DEFAULT_WIDTH,
    tabBarPosition: "top",
    collapsed: false,
    ...overrides,
  };
}

function normalizeDockColumn(columnId: DockColumnId, value: Partial<DockColumnState> | null | undefined): DockColumnState {
  const tabIds = Array.isArray(value?.tabIds)
    ? value.tabIds.filter(isDockTabId)
    : [];
  const activeTabId = value?.activeTabId && tabIds.includes(value.activeTabId) ? value.activeTabId : tabIds[0] || null;
  return createDockColumn({
    tabIds,
    activeTabId,
    width: clampDockWidth(Number(value?.width) || MLC_PANEL_DEFAULT_WIDTH, columnId),
    tabBarPosition: value?.tabBarPosition === "bottom" ? "bottom" : "top",
    collapsed: Boolean(value?.collapsed),
  });
}

function persistDockLayout(layout: DockLayoutState): void {
  try { localStorage.setItem(DOCK_LAYOUT_STORAGE_KEY, JSON.stringify(layout)); } catch {}
}

function migrateLegacyDockLayout(): DockLayoutState {
  let legacyPosition: MlcPanelPosition = "right";
  let legacyVisible = false;
  let legacyWidth = MLC_PANEL_DEFAULT_WIDTH;
  let legacyActiveTab: DockTabId = "mlc";
  let legacyTabBarPosition: DockTabBarPosition = "top";
  try {
    legacyPosition = localStorage.getItem("mlfb-mlc-panel-position") === "left" ? "left" : "right";
    legacyVisible = localStorage.getItem("mlfb-mlc-panel-visible") === "true";
    const storedWidth = Number(localStorage.getItem("mlfb-mlc-panel-width"));
    if (Number.isFinite(storedWidth) && storedWidth > 0) legacyWidth = clampDockWidth(storedWidth);
    legacyActiveTab = localStorage.getItem("mlfb-side-panel-active-tab") === "resources" ? "resources" : "mlc";
    legacyTabBarPosition = localStorage.getItem("mlfb-mlc-tab-bar-position") === "bottom" ? "bottom" : "top";
  } catch {}

  const targetColumnId: DockColumnId = legacyPosition === "left" ? "leftSidebar" : "rightSidebar";
  const columns: DockLayoutState["columns"] = {
    leftSidebar: createDockColumn(),
    leftPage: createDockColumn(),
    rightPage: createDockColumn(),
    rightSidebar: createDockColumn(),
  };
  columns[targetColumnId] = createDockColumn({
    tabIds: ["mlc", "mlcPreview", "resources", "previewBrowser", "previewInfo"],
    activeTabId: legacyActiveTab,
    width: legacyWidth,
    tabBarPosition: legacyTabBarPosition,
    collapsed: !legacyVisible,
  });
  columns.rightPage = createDockColumn({
    tabIds: isAgentUiDisabled ? ["terminal"] : ["agentConsole", "agentSessions", "terminal"],
    activeTabId: isAgentUiDisabled ? "terminal" : "agentConsole",
    width: legacyWidth,
    tabBarPosition: legacyTabBarPosition,
    collapsed: false,
  });
  for (const columnId of DOCK_COLUMN_IDS) columns[columnId].tabBarPosition = legacyTabBarPosition;
  return { columns };
}

function loadDockLayout(): DockLayoutState {
  try {
    const stored = localStorage.getItem(DOCK_LAYOUT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<DockLayoutState>;
      const columns: DockLayoutState["columns"] = {
        leftSidebar: normalizeDockColumn("leftSidebar", parsed.columns?.leftSidebar),
        leftPage: normalizeDockColumn("leftPage", parsed.columns?.leftPage),
        rightPage: normalizeDockColumn("rightPage", parsed.columns?.rightPage),
        rightSidebar: normalizeDockColumn("rightSidebar", parsed.columns?.rightSidebar),
      };
      const seen = new Set<DockTabId>();
      for (const columnId of DOCK_COLUMN_IDS) {
        const column = columns[columnId];
        column.tabIds = column.tabIds.filter((tabId) => {
          if (seen.has(tabId)) return false;
          seen.add(tabId);
          return true;
        });
        if (column.activeTabId && !column.tabIds.includes(column.activeTabId)) column.activeTabId = column.tabIds[0] || null;
      }
      for (const tabId of DEFAULT_DOCK_TABS) {
        if (seen.has(tabId)) continue;
        const fallbackColumnId = tabId === "terminal" || tabId === "agentConsole" || tabId === "agentSessions"
          ? "rightPage"
          : tabId === "mlcPreview" || tabId === "previewBrowser"
          ? DOCK_COLUMN_IDS.find((columnId) => columns[columnId].tabIds.includes("mlc")) || "rightSidebar"
          : tabId === "previewInfo"
            ? "rightSidebar"
          : "rightSidebar";
        columns[fallbackColumnId].tabIds.push(tabId);
      }
      for (const columnId of DOCK_COLUMN_IDS) {
        const column = columns[columnId];
        if (!column.activeTabId || !column.tabIds.includes(column.activeTabId)) column.activeTabId = column.tabIds[0] || null;
      }
      const tabBarPosition: DockTabBarPosition = DOCK_COLUMN_IDS.some((columnId) => columns[columnId].tabBarPosition === "bottom")
        ? "bottom"
        : "top";
      for (const columnId of DOCK_COLUMN_IDS) columns[columnId].tabBarPosition = tabBarPosition;
      return { columns };
    }
  } catch {}
  return migrateLegacyDockLayout();
}

function emptyDraft(): FeedbackDraft {
  return {
    feedbackText: "",
    testLogText: "",
    images: [],
    gitAction: null,
    mlcAttachments: [],
    webAttachments: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDraft(draft: Partial<FeedbackDraft> | null | undefined): FeedbackDraft {
  return {
    ...emptyDraft(),
    ...(draft || {}),
    images: draft?.images || [],
    mlcAttachments: draft?.mlcAttachments || [],
    webAttachments: draft?.webAttachments || [],
  };
}

function isDraftEmpty(draft: FeedbackDraft): boolean {
  return !draft.feedbackText.trim()
    && !draft.testLogText.trim()
    && draft.images.length === 0
    && draft.mlcAttachments.length === 0
    && draft.webAttachments.length === 0
    && !draft.gitAction;
}

export function applySessionTextDraft(session: Session, draft: SessionTextDraft | null | undefined): Session {
  return draft ? { ...session, ...draft } : session;
}

function removeSessionTextDraft(drafts: Record<string, SessionTextDraft>, sessionId: string): Record<string, SessionTextDraft> {
  if (!drafts[sessionId]) return drafts;
  const next = { ...drafts };
  delete next[sessionId];
  return next;
}

function createSessionTextDraft(session: Session): SessionTextDraft {
  return {
    feedbackText: session.feedbackText,
    testLogText: session.testLogText,
    commandLogs: session.commandLogs,
  };
}

function loadMessageHistory(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem("mlf-message-history-by-caller");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveMessageHistory(history: Record<string, string[]>) {
  try { localStorage.setItem("mlf-message-history-by-caller", JSON.stringify(history)); } catch {}
}

function persistQueuedDrafts(drafts: Record<string, FeedbackDraft>) {
  invoke("save_queued_drafts", { drafts }).catch((e: unknown) =>
    console.error("Failed to persist queued drafts:", e)
  );
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  // Prompt templates
  prompts: [],
  setPrompts: (prompts) => set({ prompts }),

  // Prompt visibility
  disabledPrompts: (() => {
    try {
      const stored = localStorage.getItem("mlf-disabled-prompts");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  })(),
  showPromptButtons: (() => {
    try {
      return localStorage.getItem("mlf-show-prompt-buttons") === "true";
    } catch { return false; }
  })(),
  showTransferSubmitUi: (() => {
    try {
      const stored = localStorage.getItem("mlf-show-transfer-submit-ui");
      return stored == null ? true : stored === "true";
    } catch { return true; }
  })(),
  resourceIconTheme: loadResourceIconTheme(),
  mlcPreviewShowYaml: (() => {
    try {
      const stored = localStorage.getItem("mlf-mlc-preview-show-yaml");
      return stored == null ? true : stored === "true";
    } catch { return true; }
  })(),
  sessionListMode: readSessionListMode(),
  showSessionNavigationAttachmentDots: readShowSessionNavigationAttachmentDots(),
  useSessionNavigationColorCards: readUseSessionNavigationColorCards(),
  setDisabledPrompts: (names) => {
    set({ disabledPrompts: names });
    try { localStorage.setItem("mlf-disabled-prompts", JSON.stringify(names)); } catch {}
  },
  setShowPromptButtons: (value) => {
    set({ showPromptButtons: value });
    try { localStorage.setItem("mlf-show-prompt-buttons", String(value)); } catch {}
  },
  setShowTransferSubmitUi: (value) => {
    set({ showTransferSubmitUi: value });
    try { localStorage.setItem("mlf-show-transfer-submit-ui", String(value)); } catch {}
  },
  setResourceIconTheme: (theme) => {
    set({ resourceIconTheme: theme });
    try { localStorage.setItem("mlfb-resource-icon-theme", theme); } catch {}
  },
  setMlcPreviewShowYaml: (value) => {
    set({ mlcPreviewShowYaml: value });
    try { localStorage.setItem("mlf-mlc-preview-show-yaml", String(value)); } catch {}
  },
  setSessionListMode: (mode) => {
    set({ sessionListMode: mode });
    saveSessionListMode(mode);
  },
  setShowSessionNavigationAttachmentDots: (value) => {
    set({ showSessionNavigationAttachmentDots: value });
    saveShowSessionNavigationAttachmentDots(value);
  },
  setUseSessionNavigationColorCards: (value) => {
    set({ useSessionNavigationColorCards: value });
    saveUseSessionNavigationColorCards(value);
  },
  togglePromptDisabled: (name) => {
    const { disabledPrompts } = get();
    const next = disabledPrompts.includes(name)
      ? disabledPrompts.filter((n) => n !== name)
      : [...disabledPrompts, name];
    set({ disabledPrompts: next });
    try { localStorage.setItem("mlf-disabled-prompts", JSON.stringify(next)); } catch {}
  },

  // ── Persistent mode defaults ──
  callers: [],
  callerOrder: [],
  unreadCallerIds: [],
  callerColumnMode: loadCallerColumnMode(),
  visibleColumnCount: 0,
  hiddenCallerIds: (() => {
    try {
      const stored = localStorage.getItem("mlf-hidden-callers");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  })(),
  maxSessionsPerCaller: (() => {
    try {
      const stored = localStorage.getItem("mlf-max-sessions-per-caller");
      return stored ? Number(stored) : 200;
    } catch { return 200; }
  })(),
  autoRemoveEmptyCallers: (() => {
    try {
      const stored = localStorage.getItem("mlf-auto-remove-empty-callers");
      return stored === "true";
    } catch { return false; }
  })(),
  autoHideInactiveHours: (() => {
    try {
      const stored = localStorage.getItem("mlf-auto-hide-inactive-hours");
      return stored ? Number(stored) : 18;
    } catch { return 18; }
  })(),
  sessions: [],
  sessionDraftsById: {},
  activeCallerId: null,
  activeSessionId: null,
  queuedDraftsByCallerId: {},
  messageHistoryByCallerId: loadMessageHistory(),
  focusedComposer: null,
  mlcActiveWorkspacePath: null,
  selectedMlcDocument: null,
  dockLayout: loadDockLayout(),
  draggingDockTab: null,
  nativeWebViewBlockers: {},

  addCaller: (caller) => {
    const normalizedCaller = normalizeCallerInfo(caller);
    const { callers, callerOrder, sessions } = get();
    const existing = callers.find((c) => c.id === normalizedCaller.id);
    if (existing) {
      // Update caller metadata that may arrive after the initial registration.
      const needsUpdate = (!existing.clientName && normalizedCaller.clientName)
        || (!existing.alias && normalizedCaller.alias)
        || (!!normalizedCaller.color && existing.color !== normalizedCaller.color)
        || (!!normalizedCaller.workspaceKey && existing.workspaceKey !== normalizedCaller.workspaceKey);
      if (needsUpdate) {
        const nextCallers = callers.map((c) => c.id === normalizedCaller.id ? {
          ...c,
          clientName: c.clientName || normalizedCaller.clientName,
          alias: c.alias || normalizedCaller.alias,
          workspaceKey: normalizedCaller.workspaceKey || c.workspaceKey,
          color: normalizedCaller.color || c.color,
        } : c);
        set({ callers: syncCallerWorkspaceColors(nextCallers, sessions, { workspaceKey: normalizedCaller.workspaceKey || existing.workspaceKey, color: normalizedCaller.color || existing.color }) });
      }
      return;
    }
    const nextOrder = callerOrder.includes(normalizedCaller.id)
      ? callerOrder
      : [...callerOrder, normalizedCaller.id];
    set({ callers: syncCallerWorkspaceColors([...callers, normalizedCaller], sessions, { workspaceKey: normalizedCaller.workspaceKey, color: normalizedCaller.color }), callerOrder: nextOrder });
  },

  updateCallerColor: (id, color) => {
    set((state) => ({
      callers: (() => {
        const target = state.callers.find((caller) => caller.id === id);
        const workspaceKey = target ? callerWorkspaceKey(target, state.sessions) : "";
        const updated = state.callers.map((caller) => caller.id === id ? { ...caller, color } : caller);
        return syncCallerWorkspaceColors(updated, state.sessions, { workspaceKey, color });
      })(),
    }));
  },

  setActiveCaller: (id) => {
    set({ activeCallerId: id });
    // Mark caller as read when user navigates to it
    get().markCallerRead(id);
    // Auto-select the latest pending session for this caller
    const { sessions } = get();
    const callerSessions = sessions.filter((s) => s.callerId === id);
    const pending = callerSessions.filter((s) => s.status === "pending");
    if (pending.length > 0) {
      set({ activeSessionId: pending[pending.length - 1].id });
    } else if (callerSessions.length > 0) {
      set({ activeSessionId: callerSessions[callerSessions.length - 1].id });
    } else {
      set({ activeSessionId: null });
    }
  },

  setCallerOrder: (order) => {
    set({ callerOrder: order });
    invoke("update_caller_order", { order }).catch((e: unknown) =>
      console.error("Failed to persist caller order:", e)
    );
  },

  sortCallersByName: () => {
    const { callers, callerOrder } = get();
    const order = callerOrder.length > 0
      ? [...callerOrder]
      : callers.map((c) => c.id);
    const callerMap = new Map(callers.map((c) => [c.id, c]));
    // Group by workspace name, preserving original relative order within each group
    // Map insertion order = first-appearance order of each workspace
    const groups = new Map<string, string[]>();
    for (const id of order) {
      const name = callerMap.get(id)?.name ?? "";
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(id);
    }
    const nextOrder = [...groups.values()].flat();
    get().setCallerOrder(nextOrder);
  },

  renameCaller: async (callerId, newName) => {
    await invoke("rename_caller", { callerId, newName });
    set((state) => ({
      callers: state.callers.map((c) =>
        c.id === callerId ? { ...c, name: newName } : c
      ),
    }));
  },

  mergeCallers: async (sourceId, targetId) => {
    await invoke("merge_callers", { sourceId, targetId });
    const { callers, callerOrder, hiddenCallerIds, sessions, activeCallerId, activeSessionId, queuedDraftsByCallerId } = get();
    const targetCaller = callers.find((c) => c.id === targetId);
    const targetAlias = targetCaller?.alias || "";
    // Move all sessions from source to target; inject [System] notice into pending sessions
    const updatedSessions = sessions.map((s) => {
      if (s.callerId !== sourceId) return s;
      const moved = { ...s, callerId: targetId };
      if (moved.status === "pending" && targetAlias) {
        moved.summary = `[System] Agent merged: your identifier has been updated to agent_name="${targetAlias}". Use this in ALL subsequent interactive_feedback calls.\n\n${moved.summary}`;
      }
      return moved;
    });
    // Remove source caller
    const newCallers = callers.filter((c) => c.id !== sourceId);
    const newCallerOrder = callerOrder.filter((id) => id !== sourceId);
    const newHiddenCallerIds = hiddenCallerIds.filter((id) => id !== sourceId);
    try { localStorage.setItem("mlf-hidden-callers", JSON.stringify(newHiddenCallerIds)); } catch {}
    const newActiveCallerId = activeCallerId === sourceId ? targetId : activeCallerId;
    let newActiveSessionId = activeSessionId;
    const newQueuedDrafts = { ...queuedDraftsByCallerId };
    const sourceDraft = newQueuedDrafts[sourceId];
    if (sourceDraft) {
      const targetDraft = newQueuedDrafts[targetId];
      if (targetDraft) {
        newQueuedDrafts[targetId] = {
          feedbackText: [targetDraft.feedbackText.trim(), sourceDraft.feedbackText.trim()].filter(Boolean).join("\n\n"),
          testLogText: [targetDraft.testLogText.trim(), sourceDraft.testLogText.trim()].filter(Boolean).join("\n\n"),
          images: [...targetDraft.images, ...sourceDraft.images].slice(0, IMAGE_MAX_COUNT),
          gitAction: targetDraft.gitAction || sourceDraft.gitAction,
          mlcAttachments: [...(targetDraft.mlcAttachments || []), ...(sourceDraft.mlcAttachments || [])],
          webAttachments: [...(targetDraft.webAttachments || []), ...(sourceDraft.webAttachments || [])],
          updatedAt: new Date().toISOString(),
        };
      } else {
        newQueuedDrafts[targetId] = sourceDraft;
      }
      delete newQueuedDrafts[sourceId];
    }
    persistQueuedDrafts(newQueuedDrafts);
    // If active session belonged to source, keep it (it's now under target)
    set({
      callers: newCallers,
      callerOrder: newCallerOrder,
      hiddenCallerIds: newHiddenCallerIds,
      sessions: updatedSessions,
      activeCallerId: newActiveCallerId,
      activeSessionId: newActiveSessionId,
      queuedDraftsByCallerId: newQueuedDrafts,
    });
  },

  clearAllHistory: async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("clear_all_history");
    try { localStorage.removeItem("mlf-hidden-callers"); } catch {}
    saveMessageHistory({});
    persistQueuedDrafts({});
    set({
      callers: [],
      callerOrder: [],
      hiddenCallerIds: [],
      sessions: [],
      sessionDraftsById: {},
      activeCallerId: null,
      activeSessionId: null,
      unreadCallerIds: [],
      queuedDraftsByCallerId: {},
      messageHistoryByCallerId: {},
      focusedComposer: null,
    });
  },

  addSession: (session, options) => {
    const normalizedSession = normalizeSessionWorkspace({
      ...session,
      requestType: normalizeRequestType(session.requestType),
      mlcAttachments: session.mlcAttachments || [],
      webAttachments: session.webAttachments || [],
    });
    const attentionMode = options?.attentionMode ?? "interrupt";
    const shouldInterrupt = attentionMode !== "passive";
    const wasHidden = get().hiddenCallerIds.includes(normalizedSession.callerId);
    let inserted = false;
    set((state) => {
      // Idempotent upsert: if a session with the same id already exists,
      // replace it (covers StrictMode double-invoke of load_history and any
      // other duplicate-add path). Otherwise append.
      const idx = state.sessions.findIndex((s) => s.id === normalizedSession.id);
      if (idx >= 0) {
        const next = state.sessions.slice();
        next[idx] = normalizedSession;
        return { sessions: next, callers: syncCallerWorkspaceColors(state.callers, next) };
      }
      inserted = true;
      const next = [...state.sessions, normalizedSession];
      return { sessions: next, callers: syncCallerWorkspaceColors(state.callers, next) };
    });
    if (inserted && normalizedSession.status === "pending" && options?.applyQueuedDraft !== false) {
      get().applyQueuedDraftToSession(normalizedSession.callerId, normalizedSession.id);
    }
    // Auto-unhide caller when a new pending session arrives
    if (shouldInterrupt && normalizedSession.status === "pending") {
      get().unhideCaller(normalizedSession.callerId);
    }
    // Move caller to visible columns' last position if it was outside the visible window
    if (shouldInterrupt && normalizedSession.status === "pending") {
      const { callerOrder, hiddenCallerIds, visibleColumnCount, callers } = get();
      if (visibleColumnCount > 0) {
        const order = callerOrder.length > 0 ? callerOrder : callers.map(c => c.id);
        const visibleOrder = order.filter(id => !hiddenCallerIds.includes(id));
        const posInVisible = visibleOrder.indexOf(normalizedSession.callerId);
        // Only move if caller exists and is outside the visible columns
        if (posInVisible >= visibleColumnCount || (wasHidden && posInVisible === -1)) {
          // Remove from current position and insert at the last visible column position
          const newOrder = order.filter(id => id !== normalizedSession.callerId);
          // Find the index in newOrder where the (visibleColumnCount-1)th visible caller is
          let visibleSeen = 0;
          let insertAfterIdx = -1;
          for (let i = 0; i < newOrder.length; i++) {
            if (!hiddenCallerIds.includes(newOrder[i])) {
              visibleSeen++;
              if (visibleSeen === visibleColumnCount) {
                insertAfterIdx = i;
                break;
              }
            }
          }
          if (insertAfterIdx === -1) {
            // Less visible callers than columnCount, just append
            newOrder.push(normalizedSession.callerId);
          } else {
            newOrder.splice(insertAfterIdx, 0, normalizedSession.callerId);
          }
          get().setCallerOrder(newOrder);
        }
      }
    }
    // Update pending count for the caller
    get().updateCallerPendingCount(normalizedSession.callerId);
    // Auto-trim sessions per caller if limit is set
    get().trimCallerSessions(normalizedSession.callerId);
    // Auto-remove empty callers if enabled
    if (get().autoRemoveEmptyCallers) {
      get().removeEmptyCallers();
    }
    // Auto-hide inactive callers
    get().hideInactiveCallers();
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  updateSessionField: (sessionId, field, value) => {
    set((state) => {
      const session = state.sessions.find((s) => s.id === sessionId);
      if (!session || session.status !== "pending") return {};
      const currentDraft = state.sessionDraftsById[sessionId] || createSessionTextDraft(session);
      return {
        sessionDraftsById: {
          ...state.sessionDraftsById,
          [sessionId]: { ...currentDraft, [field]: value },
        },
      };
    });
  },

  addSessionImage: (sessionId, img) => {
    const { sessions } = get();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || session.status !== "pending") return;
    if (session.images.length >= IMAGE_MAX_COUNT) return;
    if (img.sizeKB / 1024 > IMAGE_MAX_SIZE_MB) return;
    const totalMB = session.images.reduce((acc, i) => acc + i.sizeKB / 1024, 0);
    if (totalMB + img.sizeKB / 1024 > IMAGE_MAX_TOTAL_MB) return;
    if (session.images.find((i) => i.path === img.path)) return;
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, images: [...s.images, img] }
          : s
      ),
    }));
  },

  removeSessionImage: (sessionId, path) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, images: s.images.filter((i) => i.path !== path) }
          : s
      ),
    }));
  },

  clearSessionImages: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, images: [] } : s
      ),
    }));
  },

  addSessionMlcAttachment: (sessionId, attachment) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session || session.status !== "pending") return;
    const normalized = {
      filePath: attachment.filePath,
      title: attachment.title || attachment.filePath,
      description: attachment.description || "",
    };
    if (!normalized.filePath || (session.mlcAttachments || []).some((item) => item.filePath === normalized.filePath)) return;
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, mlcAttachments: [...(s.mlcAttachments || []), normalized] }
          : s
      ),
    }));
  },

  removeSessionMlcAttachment: (sessionId, filePath) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId && s.status === "pending"
          ? { ...s, mlcAttachments: (s.mlcAttachments || []).filter((item) => item.filePath !== filePath) }
          : s
      ),
    }));
  },

  clearSessionMlcAttachments: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId && s.status === "pending" ? { ...s, mlcAttachments: [] } : s
      ),
    }));
  },

  addSessionWebAttachment: (sessionId, attachment) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session || session.status !== "pending") return;
    if ((session.webAttachments || []).some((item) => item.id === attachment.id)) return;
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, webAttachments: [...(s.webAttachments || []), attachment] }
          : s
      ),
    }));
  },

  removeSessionWebAttachment: (sessionId, attachmentId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId && s.status === "pending"
          ? { ...s, webAttachments: (s.webAttachments || []).filter((item) => item.id !== attachmentId) }
          : s
      ),
    }));
  },

  clearSessionWebAttachments: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId && s.status === "pending" ? { ...s, webAttachments: [] } : s
      ),
    }));
  },

  setSessionGitAction: (sessionId, action) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId && s.status === "pending"
          ? { ...s, gitAction: action }
          : s
      ),
    }));
  },

  updateSessionGitBranchName: (sessionId, branchName) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId && s.status === "pending" && s.gitAction?.type === "create-branch"
          ? { ...s, gitAction: { ...s.gitAction, branchName } }
          : s
      ),
    }));
  },

  completeSessionWithSubmittedFeedback: (sessionId, feedbackText) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...applySessionTextDraft(s, state.sessionDraftsById[sessionId]), feedbackText, status: "responded" as const } : s
      ),
      sessionDraftsById: removeSessionTextDraft(state.sessionDraftsById, sessionId),
      focusedComposer: state.focusedComposer?.sessionId === sessionId ? null : state.focusedComposer,
    }));
    const session = get().sessions.find((s) => s.id === sessionId);
    if (session) {
      get().updateCallerPendingCount(session.callerId);
    }
  },

  markSessionResponded: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...applySessionTextDraft(s, state.sessionDraftsById[sessionId]), status: "responded" as const } : s
      ),
      sessionDraftsById: removeSessionTextDraft(state.sessionDraftsById, sessionId),
      focusedComposer: state.focusedComposer?.sessionId === sessionId ? null : state.focusedComposer,
    }));
    // Find the caller and update pending count
    const session = get().sessions.find((s) => s.id === sessionId);
    if (session) {
      get().updateCallerPendingCount(session.callerId);
    }
  },

  markSessionCancelled: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status: "cancelled" as const } : s
      ),
      sessionDraftsById: removeSessionTextDraft(state.sessionDraftsById, sessionId),
      focusedComposer: state.focusedComposer?.sessionId === sessionId ? null : state.focusedComposer,
    }));
    invoke("cancel_session", { sessionId }).catch((e: unknown) =>
      console.error("Failed to persist cancelled session:", e)
    );
    const session = get().sessions.find((s) => s.id === sessionId);
    if (session) {
      get().updateCallerPendingCount(session.callerId);
    }
  },

  updateSessionAnswer: (sessionId, questionIndex, answer) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              questions: s.questions.map((q, i) =>
                i === questionIndex ? { ...q, answer } : q
              ),
            }
          : s
      ),
    }));
  },

  toggleSessionOption: (sessionId, questionIndex, option) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              questions: s.questions.map((q, i) => {
                if (i !== questionIndex) return q;
                const sel = q.selectedOptions || [];
                const has = sel.includes(option);
                return { ...q, selectedOptions: has ? sel.filter((o) => o !== option) : [...sel, option] };
              }),
            }
          : s
      ),
    }));
  },

  removeSession: (sessionId) => {
    const { sessions, activeSessionId, callers, callerOrder } = get();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const remaining = sessions.filter((s) => s.id !== sessionId);
    set((state) => ({
      sessions: remaining,
      sessionDraftsById: removeSessionTextDraft(state.sessionDraftsById, sessionId),
      focusedComposer: state.focusedComposer?.sessionId === sessionId ? null : state.focusedComposer,
    }));
    // If we removed the active session, select another one from the same caller
    if (activeSessionId === sessionId) {
      const callerSessions = remaining.filter((s) => s.callerId === session.callerId);
      if (callerSessions.length > 0) {
        set({ activeSessionId: callerSessions[callerSessions.length - 1].id });
      } else {
        set({ activeSessionId: null });
      }
    }
    // Remove caller if no sessions remain for it
    const callerHasSessions = remaining.some((s) => s.callerId === session.callerId);
    if (!callerHasSessions) {
      const newCallers = callers.filter((c) => c.id !== session.callerId);
      const newCallerOrder = callerOrder.filter((id) => id !== session.callerId);
      const wasActive = get().activeCallerId === session.callerId;
      // Switch to next available caller if the deleted one was active
      const newActiveCallerId = wasActive
        ? (newCallerOrder.length > 0 ? newCallerOrder[0] : null)
        : get().activeCallerId;
      // Also set activeSessionId for the new caller
      let newActiveSessionId = get().activeSessionId;
      if (wasActive && newActiveCallerId) {
        const nextCallerSessions = remaining.filter((s) => s.callerId === newActiveCallerId);
        newActiveSessionId = nextCallerSessions.length > 0
          ? nextCallerSessions[nextCallerSessions.length - 1].id
          : null;
      }
      const newQueuedDrafts = Object.fromEntries(Object.entries(get().queuedDraftsByCallerId).filter(([id]) => id !== session.callerId));
      persistQueuedDrafts(newQueuedDrafts);
      set({
        callers: newCallers,
        callerOrder: newCallerOrder,
        activeCallerId: newActiveCallerId,
        activeSessionId: newActiveSessionId,
        queuedDraftsByCallerId: newQueuedDrafts,
      });
    } else {
      // Update pending count
      get().updateCallerPendingCount(session.callerId);
    }
    // Sync deletion to backend persistence
    invoke("remove_session", { sessionId }).catch((e: unknown) =>
      console.error("Failed to remove session from backend:", e)
    );
  },

  updateCallerPendingCount: (callerId) => {
    const { sessions, callers } = get();
    const count = sessions.filter(
      (s) => s.callerId === callerId && s.status === "pending"
    ).length;
    const oldCount = callers.find((c) => c.id === callerId)?.pendingCount ?? 0;
    set((state) => ({
      callers: state.callers.map((c) =>
        c.id === callerId ? { ...c, pendingCount: count } : c
      ),
      // Only add to unread if count actually increased
      unreadCallerIds: count > oldCount
        ? [...new Set([...state.unreadCallerIds, callerId])]
        : state.unreadCallerIds,
    }));
    // Auto-clear when persistent unread is disabled
    if (count > oldCount) {
      try {
        const raw = localStorage.getItem("mlf-notification-settings");
        const settings = raw ? JSON.parse(raw) : {};
        if (settings.persistentUnread === false) {
          setTimeout(() => get().markCallerRead(callerId), 3000);
        }
      } catch {}
    }
  },
  markCallerRead: (callerId) => {
    set((state) => ({
      unreadCallerIds: state.unreadCallerIds.filter((id) => id !== callerId),
    }));
  },
  toggleCallerHidden: (callerId) => {
    const { hiddenCallerIds } = get();
    const next = hiddenCallerIds.includes(callerId)
      ? hiddenCallerIds.filter((id) => id !== callerId)
      : [...hiddenCallerIds, callerId];
    set({ hiddenCallerIds: next });
    try { localStorage.setItem("mlf-hidden-callers", JSON.stringify(next)); } catch {}
  },
  unhideCaller: (callerId) => {
    const { hiddenCallerIds } = get();
    if (!hiddenCallerIds.includes(callerId)) return;
    const next = hiddenCallerIds.filter((id) => id !== callerId);
    set({ hiddenCallerIds: next });
    try { localStorage.setItem("mlf-hidden-callers", JSON.stringify(next)); } catch {}
  },

  removeCaller: async (callerId) => {
    await invoke("remove_caller", { callerId });
    const { callers, callerOrder, hiddenCallerIds, sessions, activeCallerId, queuedDraftsByCallerId, messageHistoryByCallerId } = get();
    const remaining = sessions.filter((s) => s.callerId !== callerId);
    const newCallers = callers.filter((c) => c.id !== callerId);
    const newCallerOrder = callerOrder.filter((id) => id !== callerId);
    const newHiddenCallerIds = hiddenCallerIds.filter((id) => id !== callerId);
    try { localStorage.setItem("mlf-hidden-callers", JSON.stringify(newHiddenCallerIds)); } catch {}
    const wasActive = activeCallerId === callerId;
    const newActiveCallerId = wasActive
      ? (newCallerOrder.length > 0 ? newCallerOrder[0] : null)
      : activeCallerId;
    let newActiveSessionId = get().activeSessionId;
    if (wasActive && newActiveCallerId) {
      const nextCallerSessions = remaining.filter((s) => s.callerId === newActiveCallerId);
      newActiveSessionId = nextCallerSessions.length > 0
        ? nextCallerSessions[nextCallerSessions.length - 1].id
        : null;
    } else if (wasActive) {
      newActiveSessionId = null;
    }
    const newQueuedDrafts = Object.fromEntries(Object.entries(queuedDraftsByCallerId).filter(([id]) => id !== callerId));
    persistQueuedDrafts(newQueuedDrafts);
    set({
      callers: newCallers,
      callerOrder: newCallerOrder,
      hiddenCallerIds: newHiddenCallerIds,
      sessions: remaining,
      activeCallerId: newActiveCallerId,
      activeSessionId: newActiveSessionId,
      queuedDraftsByCallerId: newQueuedDrafts,
      messageHistoryByCallerId: Object.fromEntries(Object.entries(messageHistoryByCallerId).filter(([id]) => id !== callerId)),
      focusedComposer: get().focusedComposer?.callerId === callerId ? null : get().focusedComposer,
    });
    saveMessageHistory(get().messageHistoryByCallerId);
  },

  removeEmptyCallers: async () => {
    const removedIds: string[] = await invoke("remove_empty_callers");
    if (removedIds.length === 0) return removedIds;
    const { callers, callerOrder, hiddenCallerIds, activeCallerId, queuedDraftsByCallerId, messageHistoryByCallerId } = get();
    const removedSet = new Set(removedIds);
    const newCallers = callers.filter((c) => !removedSet.has(c.id));
    const newCallerOrder = callerOrder.filter((id) => !removedSet.has(id));
    const newHiddenCallerIds = hiddenCallerIds.filter((id) => !removedSet.has(id));
    try { localStorage.setItem("mlf-hidden-callers", JSON.stringify(newHiddenCallerIds)); } catch {}
    const newActiveCallerId = activeCallerId && removedSet.has(activeCallerId)
      ? (newCallerOrder.length > 0 ? newCallerOrder[0] : null)
      : activeCallerId;
    const newQueuedDrafts = Object.fromEntries(Object.entries(queuedDraftsByCallerId).filter(([id]) => !removedSet.has(id)));
    persistQueuedDrafts(newQueuedDrafts);
    set({
      callers: newCallers,
      callerOrder: newCallerOrder,
      hiddenCallerIds: newHiddenCallerIds,
      activeCallerId: newActiveCallerId,
      queuedDraftsByCallerId: newQueuedDrafts,
      messageHistoryByCallerId: Object.fromEntries(Object.entries(messageHistoryByCallerId).filter(([id]) => !removedSet.has(id))),
      focusedComposer: get().focusedComposer && removedSet.has(get().focusedComposer!.callerId) ? null : get().focusedComposer,
    });
    saveMessageHistory(get().messageHistoryByCallerId);
    return removedIds;
  },

  setMaxSessionsPerCaller: (value) => {
    set({ maxSessionsPerCaller: value });
    try { localStorage.setItem("mlf-max-sessions-per-caller", String(value)); } catch {}
  },

  setAutoRemoveEmptyCallers: (value) => {
    set({ autoRemoveEmptyCallers: value });
    try { localStorage.setItem("mlf-auto-remove-empty-callers", String(value)); } catch {}
  },

  setAutoHideInactiveHours: (value) => {
    set({ autoHideInactiveHours: value });
    try { localStorage.setItem("mlf-auto-hide-inactive-hours", String(value)); } catch {}
  },

  hideInactiveCallers: () => {
    const { autoHideInactiveHours, callers, sessions, hiddenCallerIds } = get();
    if (autoHideInactiveHours <= 0) return;
    const now = Date.now();
    const thresholdMs = autoHideInactiveHours * 60 * 60 * 1000;
    for (const caller of callers) {
      if (hiddenCallerIds.includes(caller.id)) continue;
      const callerSessions = sessions.filter((s) => s.callerId === caller.id);
      if (callerSessions.length === 0) continue; // empty callers handled by autoRemoveEmptyCallers
      const latestTime = Math.max(...callerSessions.map((s) => new Date(s.createdAt).getTime()));
      if (now - latestTime > thresholdMs) {
        get().toggleCallerHidden(caller.id);
      }
    }
  },

  trimCallerSessions: async (callerId) => {
    const { maxSessionsPerCaller, sessions } = get();
    if (maxSessionsPerCaller <= 0) return;
    const callerSessionCount = sessions.filter((s) => s.callerId === callerId).length;
    if (callerSessionCount <= maxSessionsPerCaller) return;
    const removed: number = await invoke("trim_caller_sessions", { callerId, maxPerCaller: maxSessionsPerCaller });
    if (removed > 0) {
      // Reload sessions from backend would be complex; instead trim locally
      const callerSessions = sessions
        .filter((s) => s.callerId === callerId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      // Non-pending first, then pending
      const nonPending = callerSessions.filter((s) => s.status !== "pending");
      const pending = callerSessions.filter((s) => s.status === "pending");
      const ordered = [...nonPending, ...pending];
      const toRemoveIds = new Set(ordered.slice(0, removed).map((s) => s.id));
      const remaining = sessions.filter((s) => !toRemoveIds.has(s.id));
      const { activeSessionId } = get();
      set({
        sessions: remaining,
        activeSessionId: activeSessionId && toRemoveIds.has(activeSessionId)
          ? (remaining.filter((s) => s.callerId === callerId).pop()?.id ?? null)
          : activeSessionId,
      });
    }
  },

  setCallerColumnMode: (mode) => {
    set({ callerColumnMode: mode });
    try { localStorage.setItem(CALLER_COLUMN_MODE_STORAGE_KEY, String(mode)); } catch {}
  },

  setVisibleColumnCount: (count) => set({ visibleColumnCount: count }),

  setQueuedDrafts: (drafts) => set({
    queuedDraftsByCallerId: Object.fromEntries(
      Object.entries(drafts || {}).map(([callerId, draft]) => [callerId, normalizeDraft(draft)])
    ),
  }),

  getQueuedDraft: (callerId) => normalizeDraft(get().queuedDraftsByCallerId[callerId]),

  updateQueuedDraftField: (callerId, field, value) => {
    set((state) => {
      const draft = state.queuedDraftsByCallerId[callerId] || emptyDraft();
      const next = {
        queuedDraftsByCallerId: {
          ...state.queuedDraftsByCallerId,
          [callerId]: { ...draft, [field]: value, updatedAt: new Date().toISOString() },
        },
      };
      persistQueuedDrafts(next.queuedDraftsByCallerId);
      return next;
    });
  },

  addQueuedDraftImage: (callerId, img) => {
    const draft = get().getQueuedDraft(callerId);
    if (draft.images.length >= IMAGE_MAX_COUNT) return;
    if (img.sizeKB / 1024 > IMAGE_MAX_SIZE_MB) return;
    const totalMB = draft.images.reduce((acc, i) => acc + i.sizeKB / 1024, 0);
    if (totalMB + img.sizeKB / 1024 > IMAGE_MAX_TOTAL_MB) return;
    if (draft.images.find((i) => i.path === img.path)) return;
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, images: [...draft.images, img], updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  removeQueuedDraftImage: (callerId, path) => {
    const draft = get().getQueuedDraft(callerId);
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, images: draft.images.filter((i) => i.path !== path), updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  clearQueuedDraftImages: (callerId) => {
    const draft = get().getQueuedDraft(callerId);
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, images: [], updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  addQueuedDraftMlcAttachment: (callerId, attachment) => {
    const draft = get().getQueuedDraft(callerId);
    if (draft.mlcAttachments.find((item) => item.filePath === attachment.filePath)) return;
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, mlcAttachments: [...draft.mlcAttachments, attachment], updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  removeQueuedDraftMlcAttachment: (callerId, filePath) => {
    const draft = get().getQueuedDraft(callerId);
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, mlcAttachments: draft.mlcAttachments.filter((item) => item.filePath !== filePath), updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  clearQueuedDraftMlcAttachments: (callerId) => {
    const draft = get().getQueuedDraft(callerId);
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, mlcAttachments: [], updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  addQueuedDraftWebAttachment: (callerId, attachment) => {
    const draft = get().getQueuedDraft(callerId);
    if (draft.webAttachments.find((item) => item.id === attachment.id)) return;
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, webAttachments: [...draft.webAttachments, attachment], updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  removeQueuedDraftWebAttachment: (callerId, attachmentId) => {
    const draft = get().getQueuedDraft(callerId);
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, webAttachments: draft.webAttachments.filter((item) => item.id !== attachmentId), updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  clearQueuedDraftWebAttachments: (callerId) => {
    const draft = get().getQueuedDraft(callerId);
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, webAttachments: [], updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  setQueuedDraftGitAction: (callerId, action) => {
    const draft = get().getQueuedDraft(callerId);
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, gitAction: action, updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  updateQueuedDraftGitBranchName: (callerId, branchName) => {
    const draft = get().getQueuedDraft(callerId);
    if (draft.gitAction?.type !== "create-branch") return;
    set((state) => {
      const next = {
        ...state.queuedDraftsByCallerId,
        [callerId]: { ...draft, gitAction: { ...draft.gitAction!, branchName }, updatedAt: new Date().toISOString() },
      };
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  clearQueuedDraft: (callerId) => {
    set((state) => {
      const next = { ...state.queuedDraftsByCallerId };
      delete next[callerId];
      persistQueuedDrafts(next);
      return { queuedDraftsByCallerId: next };
    });
  },

  applyQueuedDraftToSession: (callerId, sessionId) => {
    const rawDraft = get().queuedDraftsByCallerId[callerId];
    const draft = normalizeDraft(rawDraft);
    if (!draft || isDraftEmpty(draft)) return;
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId && s.status === "pending"
          ? {
              ...s,
              feedbackText: draft.feedbackText,
              testLogText: draft.testLogText,
              images: draft.images,
              gitAction: draft.gitAction,
              mlcAttachments: draft.mlcAttachments,
              webAttachments: draft.webAttachments,
            }
          : s
      ),
    }));
    get().clearQueuedDraft(callerId);
  },

  pushMessageHistory: (callerId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    set((state) => {
      const current = state.messageHistoryByCallerId[callerId] || [];
      const withoutSame = current.filter((item) => item !== trimmed);
      const nextForCaller = [...withoutSame, trimmed].slice(-MESSAGE_HISTORY_MAX);
      const next = { ...state.messageHistoryByCallerId, [callerId]: nextForCaller };
      saveMessageHistory(next);
      return { messageHistoryByCallerId: next };
    });
  },

  getMessageHistory: (callerId) => get().messageHistoryByCallerId[callerId] || [],

  clearMessageHistory: (callerId) => {
    set((state) => {
      const next = { ...state.messageHistoryByCallerId };
      if (callerId) delete next[callerId];
      else for (const key of Object.keys(next)) delete next[key];
      saveMessageHistory(next);
      return { messageHistoryByCallerId: next };
    });
  },

  setFocusedComposer: (focus) => {
    const normalizedFocus = normalizeFocusedComposer(focus);
    const current = get().focusedComposer;
    const nextWorkspacePath = normalizedFocus.projectDirectory || null;
    const sameTarget = current
      && current.callerId === normalizedFocus.callerId
      && current.sessionId === normalizedFocus.sessionId
      && sameWorkspacePath(current.projectDirectory, normalizedFocus.projectDirectory)
      && current.kind === normalizedFocus.kind;
    if (sameTarget && sameWorkspacePath(get().mlcActiveWorkspacePath, nextWorkspacePath)) return;
    set({ focusedComposer: normalizedFocus, mlcActiveWorkspacePath: nextWorkspacePath });
  },

  clearFocusedComposer: (sessionId) => {
    set((state) => ({
      focusedComposer: !sessionId || state.focusedComposer?.sessionId === sessionId ? null : state.focusedComposer,
    }));
  },

  setMlcActiveWorkspacePath: (path) => set({ mlcActiveWorkspacePath: normalizeWorkspacePath(path) }),

  setSelectedMlcDocument: (document) => set({ selectedMlcDocument: document }),

  setDockColumnWidth: (columnId, width) => {
    set((state) => {
      const dockLayout: DockLayoutState = {
        columns: {
          ...state.dockLayout.columns,
          [columnId]: {
            ...state.dockLayout.columns[columnId],
            width: clampDockWidth(width, columnId),
          },
        },
      };
      persistDockLayout(dockLayout);
      return { dockLayout };
    });
  },

  setDockColumnCollapsed: (columnId, collapsed) => {
    set((state) => {
      const dockLayout: DockLayoutState = {
        columns: {
          ...state.dockLayout.columns,
          [columnId]: {
            ...state.dockLayout.columns[columnId],
            collapsed,
          },
        },
      };
      persistDockLayout(dockLayout);
      return { dockLayout };
    });
  },

  setDockColumnTabBarPosition: (columnId, position) => {
    set((state) => {
      void columnId;
      const dockLayout: DockLayoutState = {
        columns: {
          leftSidebar: {
            ...state.dockLayout.columns.leftSidebar,
            tabBarPosition: position,
          },
          leftPage: {
            ...state.dockLayout.columns.leftPage,
            tabBarPosition: position,
          },
          rightPage: {
            ...state.dockLayout.columns.rightPage,
            tabBarPosition: position,
          },
          rightSidebar: {
            ...state.dockLayout.columns.rightSidebar,
            tabBarPosition: position,
          },
        },
      };
      persistDockLayout(dockLayout);
      return { dockLayout };
    });
  },

  setDockActiveTab: (columnId, tabId) => {
    set((state) => {
      if (isAgentUiDisabled && tabId && isAgentDockTab(tabId)) return {};
      const column = state.dockLayout.columns[columnId];
      const activeTabId = tabId && column.tabIds.includes(tabId) ? tabId : column.tabIds[0] || null;
      const dockLayout: DockLayoutState = {
        columns: {
          ...state.dockLayout.columns,
          [columnId]: { ...column, activeTabId },
        },
      };
      persistDockLayout(dockLayout);
      return { dockLayout };
    });
  },

  moveDockTabToColumn: (tabId, targetColumnId, targetIndex) => {
    set((state) => {
      if (isAgentUiDisabled && isAgentDockTab(tabId)) return {};
      const nextColumns: DockLayoutState["columns"] = {
        leftSidebar: { ...state.dockLayout.columns.leftSidebar, tabIds: [...state.dockLayout.columns.leftSidebar.tabIds] },
        leftPage: { ...state.dockLayout.columns.leftPage, tabIds: [...state.dockLayout.columns.leftPage.tabIds] },
        rightPage: { ...state.dockLayout.columns.rightPage, tabIds: [...state.dockLayout.columns.rightPage.tabIds] },
        rightSidebar: { ...state.dockLayout.columns.rightSidebar, tabIds: [...state.dockLayout.columns.rightSidebar.tabIds] },
      };

      let sourceColumnId: DockColumnId | null = null;
      let sourceIndex = -1;

      for (const columnId of DOCK_COLUMN_IDS) {
        const column = nextColumns[columnId];
        const existingIndex = column.tabIds.indexOf(tabId);
        if (existingIndex === -1) continue;
        sourceColumnId = columnId;
        sourceIndex = existingIndex;
        column.tabIds.splice(existingIndex, 1);
        if (column.activeTabId === tabId) {
          column.activeTabId = column.tabIds[existingIndex] || column.tabIds[existingIndex - 1] || column.tabIds[0] || null;
        }
      }

      const targetColumn = nextColumns[targetColumnId];
      let insertIndex = typeof targetIndex === "number" ? targetIndex : targetColumn.tabIds.length;
      if (sourceColumnId === targetColumnId && sourceIndex !== -1 && insertIndex > sourceIndex) insertIndex -= 1;
      insertIndex = Math.max(0, Math.min(insertIndex, targetColumn.tabIds.length));
      targetColumn.tabIds.splice(insertIndex, 0, tabId);
      targetColumn.activeTabId = tabId;
      targetColumn.collapsed = false;

      const dockLayout = { columns: nextColumns };
      persistDockLayout(dockLayout);
      return {
        dockLayout,
      };
    });
  },

  openDockTab: (tabId, preferredColumnId) => {
    set((state) => {
      if (isAgentUiDisabled && isAgentDockTab(tabId)) return {};
      const nextColumns: DockLayoutState["columns"] = {
        leftSidebar: { ...state.dockLayout.columns.leftSidebar, tabIds: [...state.dockLayout.columns.leftSidebar.tabIds] },
        leftPage: { ...state.dockLayout.columns.leftPage, tabIds: [...state.dockLayout.columns.leftPage.tabIds] },
        rightPage: { ...state.dockLayout.columns.rightPage, tabIds: [...state.dockLayout.columns.rightPage.tabIds] },
        rightSidebar: { ...state.dockLayout.columns.rightSidebar, tabIds: [...state.dockLayout.columns.rightSidebar.tabIds] },
      };
      let targetColumnId: DockColumnId | null = null;
      for (const columnId of DOCK_COLUMN_IDS) {
        if (nextColumns[columnId].tabIds.includes(tabId)) {
          targetColumnId = columnId;
          break;
        }
      }
      targetColumnId ||= preferredColumnId;
      const targetColumn = nextColumns[targetColumnId];
      if (!targetColumn.tabIds.includes(tabId)) targetColumn.tabIds.push(tabId);
      targetColumn.activeTabId = tabId;
      targetColumn.collapsed = false;
      const dockLayout = { columns: nextColumns };
      persistDockLayout(dockLayout);
      return { dockLayout };
    });
  },

  startDraggingDockTab: (tabId, sourceColumnId, pointerX, pointerY, targetColumnId = null) => {
    if (isAgentUiDisabled && isAgentDockTab(tabId)) return;
    set({ draggingDockTab: { tabId, sourceColumnId, pointerX, pointerY, targetColumnId } });
  },
  updateDraggingDockTab: (pointerX, pointerY, targetColumnId) => set((state) => state.draggingDockTab
    ? { draggingDockTab: { ...state.draggingDockTab, pointerX, pointerY, targetColumnId } }
    : {}),
  finishDraggingDockTab: () => set({ draggingDockTab: null }),

  pushNativeWebViewBlocker: (key) => set((state) => ({
    nativeWebViewBlockers: {
      ...state.nativeWebViewBlockers,
      [key]: (state.nativeWebViewBlockers[key] || 0) + 1,
    },
  })),

  popNativeWebViewBlocker: (key) => set((state) => {
    const current = state.nativeWebViewBlockers[key] || 0;
    if (current <= 1) {
      const nativeWebViewBlockers = { ...state.nativeWebViewBlockers };
      delete nativeWebViewBlockers[key];
      return { nativeWebViewBlockers };
    }
    return { nativeWebViewBlockers: { ...state.nativeWebViewBlockers, [key]: current - 1 } };
  }),

  // Derived getters
  getActiveCaller: () => {
    const { callers, activeCallerId } = get();
    return callers.find((c) => c.id === activeCallerId) || null;
  },

  getActiveCallerSessions: () => {
    const { sessions, activeCallerId } = get();
    if (!activeCallerId) return [];
    return sessions.filter((s) => s.callerId === activeCallerId);
  },

  getActiveSession: () => {
    const { sessions, activeSessionId } = get();
    if (!activeSessionId) return null;
    return sessions.find((s) => s.id === activeSessionId) || null;
  },
}));

export { IMAGE_MAX_COUNT, IMAGE_MAX_SIZE_MB, IMAGE_MAX_TOTAL_MB };
