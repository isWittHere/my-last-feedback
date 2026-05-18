import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { VariableSizeList, type ListChildComponentProps, type ListOnItemsRenderedProps, type ListOnScrollProps } from "react-window";
import { useTranslation } from "react-i18next";
import { useAgentConsoleSettings } from "../../agentConsoleSettings";
import type { AgentContentBlock, AgentProviderMessagePart, AgentSession } from "../../agent/types";
import { useAgentStore } from "../../store/agentStore";
import { Icon, MlcLogoIcon } from "../Icons";
import { AgentMessageItem } from "./AgentMessageItem";
import { AgentNewSessionWorkspacePicker } from "./AgentNewSessionWorkspacePicker";
import { AgentPermissionPanel } from "./AgentPermissionIndicator";
import { AgentSessionHeader } from "./AgentSessionHeader";

const DEFAULT_ROW_HEIGHT = 120;
const ROW_GAP = 16;

type TimelineItem =
  | { type: "node"; key: string; node: ReactNode }
  | { type: "message"; key: string; message: AgentSession["messages"][number] };

interface TimelineRowData {
  items: TimelineItem[];
  session: AgentSession;
  setRowSize: (key: string, size: number, index: number) => void;
}

function blockText(block: AgentContentBlock): string {
  return block.type === "text" ? block.content : "";
}

function blocksText(blocks: AgentContentBlock[]): string {
  return blocks.map(blockText).filter(Boolean).join("\n\n").trim();
}

function providerPromptText(parts: AgentProviderMessagePart[] | undefined): string {
  return (parts || [])
    .filter((part) => part.type === "text" && !part.synthetic && !part.ignored && typeof part.text === "string")
    .map((part) => part.text || "")
    .join("\n\n")
    .trim();
}

function extractPromptSection(markdown: string): string {
  const trimmedMarkdown = markdown.trim();
  const promptHeading = /^##\s+(?:User Prompt|User Feedback|用户提示|用户反馈)\s*\n/i.exec(trimmedMarkdown);
  if (!promptHeading) return "";
  const contentStart = promptHeading[0].length;
  const nextSectionIndex = trimmedMarkdown.slice(contentStart).search(/\n##\s+/);
  const contentEnd = nextSectionIndex >= 0 ? contentStart + nextSectionIndex : trimmedMarkdown.length;
  return trimmedMarkdown.slice(contentStart, contentEnd).trim();
}

function userPromptText(message: AgentSession["messages"][number]): string {
  const draft = message.composerDraft?.trim();
  if (draft) return draft;
  const providerText = providerPromptText(message.providerParts);
  if (providerText) return providerText;
  const submittedPrompt = extractPromptSection(message.submittedMarkdown || "");
  if (submittedPrompt) return submittedPrompt;
  const rawText = blocksText(message.blocks);
  return extractPromptSection(rawText) || rawText;
}

function StickyUserText({ text, mergeLines }: { text: string; mergeLines: boolean }) {
  if (mergeLines) return text.replace(/\s*(?:\r\n|\n|\r)\s*/g, " ").trim();
  return text.split(/\r\n|\n|\r/).map((line, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {line}
    </Fragment>
  ));
}

interface AgentFocusStepEventDetail {
  messageId: string;
  stepId?: string;
}

function HistoryNotice({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const rehydrateSessionHistory = useAgentStore((state) => state.rehydrateSessionHistory);
  const totalCount = session.historyTotalCount ?? session.messages.length;
  const trimmedCount = session.historyTrimmedCount ?? 0;
  const keptCount = Math.max(0, totalCount - trimmedCount);

  if (session.historyState === "loading") {
    return (
      <div className="agent-history-notice" data-variant="loading">
        <Icon name="spinner" size={14} />
        <span>{t("agentConsole.historyRestoring", "Restoring session history...")}</span>
      </div>
    );
  }

  if (session.historyState === "trimmed" && trimmedCount > 0) {
    return (
      <div className="agent-history-notice" data-variant="trimmed">
        <Icon name="info" size={14} />
        <span>{t("agentConsole.historyTrimmed", "Older messages were unloaded. Showing last {{kept}} of {{total}}.", { kept: keptCount, total: totalCount })}</span>
      </div>
    );
  }

  if (session.historyState === "cold") {
    const errorMessage = session.historyError;
    return (
      <div className="agent-history-notice" data-variant="cold">
        <Icon name="info" size={14} />
        <span>{errorMessage
          ? t("agentConsole.historyRestoreFailed", "Failed to restore history: {{error}}", { error: errorMessage })
          : t("agentConsole.historyUnloaded", "History was unloaded to reduce memory.")}</span>
        {session.providerSessionId && (
          <button type="button" className="agent-history-restore" onClick={() => void rehydrateSessionHistory(session.id)}>
            {t("agentConsole.historyRestoreAction", "Restore history")}
          </button>
        )}
      </div>
    );
  }

  return null;
}

function TimelineRow({ index, style, data }: ListChildComponentProps<TimelineRowData>) {
  const { items, session, setRowSize } = data;
  const item = items[index];
  const rowRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const node = rowRef.current;
    if (!node) return;
    const updateSize = () => {
      const height = node.getBoundingClientRect().height;
      setRowSize(item.key, height, index);
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [index, item.key, setRowSize]);

  return (
    <div style={{ ...style, width: "100%" }}>
      <div ref={rowRef} className="agent-message-row" style={{ paddingBottom: ROW_GAP }}>
        {item.type === "message"
          ? <AgentMessageItem session={session} message={item.message} projectDirectory={session.cwd} />
          : item.node}
      </div>
    </div>
  );
}

export function AgentMessageTimeline({ session }: { session: AgentSession }) {
  const { mergeStickyUserMessageLines, showStickyUserMessageBar } = useAgentConsoleSettings();
  const listRef = useRef<VariableSizeList>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stickyUserBarRef = useRef<HTMLButtonElement>(null);
  const stickyUserTextRef = useRef<HTMLSpanElement>(null);
  const stickyUserHeightRef = useRef(0);
  const shouldAutoFollowRef = useRef(true);
  const rowSizeMapRef = useRef(new Map<string, number>());
  const [stickyUserContent, setStickyUserContent] = useState<string | null>(null);
  const [renderedStickyUserContent, setRenderedStickyUserContent] = useState<string | null>(null);
  const [stickyUserMsgId, setStickyUserMsgId] = useState<string | null>(null);
  const [stickyUserHeight, setStickyUserHeight] = useState(0);
  const [stickyUserResizeDirection, setStickyUserResizeDirection] = useState<"growing" | "shrinking" | "stable">("stable");
  const [listHeight, setListHeight] = useState(0);
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);

  const isStreaming = session.messages.some((message) => message.status === "streaming");
  const hasStickyUserContent = Boolean(stickyUserContent);
  const hasRenderedStickyUserContent = Boolean(renderedStickyUserContent);
  const isStickyUserExiting = !hasStickyUserContent && hasRenderedStickyUserContent;
  const isNewOpenCodeSessionPage = session.providerId === "opencode" && !session.providerSessionId && session.messages.length === 0;
  const latestDiagnostic = session.diagnostics[session.diagnostics.length - 1];
  const showTopOverlay = !isNewOpenCodeSessionPage || showStickyUserMessageBar;
  const showHistoryNotice = session.historyState === "loading"
    || session.historyState === "cold"
    || (session.historyState === "trimmed" && (session.historyTrimmedCount ?? 0) > 0);

  const historyNoticeNode = showHistoryNotice ? <HistoryNotice session={session} /> : null;

  const newSessionNode = isNewOpenCodeSessionPage ? (
    <div className="agent-new-session-permission-shell">
      <div className="agent-new-session-top-row">
        <AgentNewSessionWorkspacePicker session={session} />
        {latestDiagnostic ? (
          <div className={`agent-new-session-diagnostic agent-header-diagnostic agent-header-diagnostic-${latestDiagnostic.level}`}>
            <Icon name={latestDiagnostic.level === "error" ? "circle-x" : latestDiagnostic.level === "warn" ? "warning" : "info"} size={12} />
            <span>{latestDiagnostic.message}</span>
          </div>
        ) : null}
      </div>
      <div className="agent-new-session-brand" aria-label="My Last Code">
        <MlcLogoIcon size={34} />
        <span>My Last Code</span>
      </div>
      <AgentPermissionPanel session={session} variant="standalone" />
    </div>
  ) : null;

  const messageStartIndex = (showTopOverlay ? 1 : 0) + (historyNoticeNode ? 1 : 0) + (newSessionNode ? 1 : 0);

  const messageIndexById = useMemo(() => {
    const map = new Map<string, number>();
    session.messages.forEach((message, index) => map.set(message.id, messageStartIndex + index));
    return map;
  }, [messageStartIndex, session.messages]);

  const handleItemsRendered = useCallback((info: ListOnItemsRenderedProps) => {
    setVisibleStartIndex(info.visibleStartIndex);
  }, []);

  const handleListScroll = useCallback((info: ListOnScrollProps) => {
    if (isStreaming) shouldAutoFollowRef.current = checkNearBottom(info.scrollOffset);
  }, [checkNearBottom, isStreaming]);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const updateHeight = () => setListHeight(node.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    shouldAutoFollowRef.current = true;
    scrollToEnd();
  }, [scrollToEnd, session.messages.length]);

  useEffect(() => {
    if (!showStickyUserMessageBar) {
      setStickyUserContent(null);
      setStickyUserMsgId(null);
      return;
    }
    let nextContent: string | null = null;
    let nextMsgId: string | null = null;
    for (let index = Math.min(visibleStartIndex - 1, items.length - 1); index >= 0; index -= 1) {
      const item = items[index];
      if (item.type === "message" && item.message.role === "user") {
        nextContent = userPromptText(item.message);
        nextMsgId = item.message.id;
        break;
      }
    }
    setStickyUserContent((current) => current === nextContent ? current : nextContent);
    setStickyUserMsgId((current) => current === nextMsgId ? current : nextMsgId);
  }, [items, showStickyUserMessageBar, visibleStartIndex]);

  useEffect(() => {
    if (stickyUserContent) {
      setRenderedStickyUserContent(stickyUserContent);
      return;
    }
    if (!renderedStickyUserContent) return;
    const timer = window.setTimeout(() => setRenderedStickyUserContent(null), 220);
    return () => window.clearTimeout(timer);
  }, [renderedStickyUserContent, stickyUserContent]);

  useEffect(() => {
    const element = stickyUserBarRef.current;
    const textElement = stickyUserTextRef.current;
    if (!element || !textElement || !showStickyUserMessageBar || !hasStickyUserContent) {
      stickyUserHeightRef.current = 0;
      setStickyUserResizeDirection("shrinking");
      setStickyUserHeight(0);
      return;
    }
    let frame = 0;
    const updateHeight = () => {
      const style = getComputedStyle(element);
      const verticalChrome = [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth]
        .map((value) => Number.parseFloat(value) || 0)
        .reduce((sum, value) => sum + value, 0);
      const nextHeight = Math.ceil(Math.max(24, textElement.getBoundingClientRect().height + verticalChrome));
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        const currentHeight = stickyUserHeightRef.current;
        setStickyUserResizeDirection(nextHeight < currentHeight ? "shrinking" : nextHeight > currentHeight ? "growing" : "stable");
        stickyUserHeightRef.current = nextHeight;
        setStickyUserHeight(nextHeight);
      });
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(textElement);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [hasStickyUserContent, mergeStickyUserMessageLines, showStickyUserMessageBar, stickyUserContent]);

  const scrollToStickyMessage = useCallback(() => {
    if (!stickyUserMsgId) return;
    const index = messageIndexById.get(stickyUserMsgId);
    if (index == null) return;
    shouldAutoFollowRef.current = false;
    listRef.current?.scrollToItem(index, "start");
  }, [messageIndexById, stickyUserMsgId]);

  const headerNode = showTopOverlay ? (
    <div className="agent-timeline-top-overlay">
      {!isNewOpenCodeSessionPage ? <AgentSessionHeader session={session} /> : null}
      {showStickyUserMessageBar && (
        <div className="agent-sticky-user-slot" data-visible={hasRenderedStickyUserContent} data-resize={stickyUserResizeDirection} style={{ "--agent-sticky-user-height": `${stickyUserHeight}px` } as CSSProperties}>
          <button
            ref={stickyUserBarRef}
            type="button"
            className={`agent-sticky-user-bar${hasRenderedStickyUserContent ? "" : " agent-sticky-user-bar-hidden"}${isStickyUserExiting ? " agent-sticky-user-bar-exiting" : ""}`}
            onClick={scrollToStickyMessage}
            tabIndex={hasStickyUserContent ? 0 : -1}
            aria-hidden={!hasStickyUserContent}
          >
            <span ref={stickyUserTextRef} className="agent-sticky-user-letter-text"><StickyUserText text={renderedStickyUserContent || ""} mergeLines={mergeStickyUserMessageLines} /></span>
          </button>
        </div>
      )}
    </div>
  ) : null;

  const items = useMemo<TimelineItem[]>(() => {
    const next: TimelineItem[] = [];
    if (headerNode) next.push({ type: "node", key: "header", node: headerNode });
    if (historyNoticeNode) next.push({ type: "node", key: "history-notice", node: historyNoticeNode });
    if (newSessionNode) next.push({ type: "node", key: "new-session", node: newSessionNode });
    session.messages.forEach((message) => {
      next.push({ type: "message", key: `message:${message.id}`, message });
    });
    return next;
  }, [headerNode, historyNoticeNode, newSessionNode, session.messages]);

  const setRowSize = useCallback((key: string, size: number, index: number) => {
    const current = rowSizeMapRef.current.get(key);
    if (current === size) return;
    rowSizeMapRef.current.set(key, size);
    listRef.current?.resetAfterIndex(index);
    if (isStreaming && shouldAutoFollowRef.current && index >= items.length - 1) {
      requestAnimationFrame(() => listRef.current?.scrollToItem(items.length - 1, "end"));
    }
  }, [isStreaming, items.length]);

  const getRowSize = useCallback((index: number) => {
    const item = items[index];
    if (!item) return DEFAULT_ROW_HEIGHT;
    return rowSizeMapRef.current.get(item.key) ?? DEFAULT_ROW_HEIGHT;
  }, [items]);

  const itemKey = useCallback((index: number, data: TimelineRowData) => data.items[index].key, []);

  const checkNearBottom = useCallback((scrollOffset?: number) => {
    const container = outerRef.current;
    if (!container) return true;
    const offset = scrollOffset ?? container.scrollTop;
    return container.scrollHeight - offset - container.clientHeight <= 140;
  }, []);

  const scrollToEnd = useCallback((behavior: ScrollBehavior = "auto") => {
    if (items.length === 0) return;
    listRef.current?.scrollToItem(items.length - 1, behavior === "smooth" ? "center" : "end");
  }, [items.length]);

  useEffect(() => {
    const handleFocusMessage = (event: Event) => {
      const detail = (event as CustomEvent<AgentFocusStepEventDetail>).detail;
      if (!detail?.messageId || detail.stepId) return;
      const index = messageIndexById.get(detail.messageId);
      if (index == null) return;
      listRef.current?.scrollToItem(index, "center");
    };
    window.addEventListener("mlfb-agent-focus-step", handleFocusMessage);
    return () => window.removeEventListener("mlfb-agent-focus-step", handleFocusMessage);
  }, [messageIndexById]);

  useEffect(() => {
    if (!isStreaming) return;
    if (shouldAutoFollowRef.current) {
      const frame = requestAnimationFrame(() => scrollToEnd());
      return () => cancelAnimationFrame(frame);
    }
  }, [isStreaming, scrollToEnd, session.messages]);

  const rowData = useMemo<TimelineRowData>(() => ({
    items,
    session,
    setRowSize,
  }), [items, session, setRowSize]);

  return (
    <div ref={containerRef} className="agent-message-timeline-shell">
      {listHeight > 0 && (
        <VariableSizeList
          ref={listRef}
          outerRef={outerRef}
          height={listHeight}
          width="100%"
          itemCount={items.length}
          itemData={rowData}
          itemKey={itemKey}
          itemSize={getRowSize}
          onItemsRendered={handleItemsRendered}
          onScroll={handleListScroll}
          className="agent-message-timeline"
        >
          {TimelineRow}
        </VariableSizeList>
      )}
    </div>
  );
}