import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useAgentConsoleSettings } from "../../agentConsoleSettings";
import type { AgentContentBlock, AgentProviderMessagePart, AgentSession } from "../../agent/types";
import { useAgentStore } from "../../store/agentStore";
import { Icon, MlcLogoIcon } from "../Icons";
import { AgentMessageItem } from "./AgentMessageItem";
import { AgentNewSessionWorkspacePicker } from "./AgentNewSessionWorkspacePicker";
import { AgentPermissionPanel } from "./AgentPermissionIndicator";
import { AgentSessionHeader } from "./AgentSessionHeader";

const DEFAULT_WINDOW_SIZE = 80;
const LOAD_BATCH_SIZE = 80;

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

export function AgentMessageTimeline({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const { mergeStickyUserMessageLines, showStickyUserMessageBar } = useAgentConsoleSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyUserBarRef = useRef<HTMLButtonElement>(null);
  const stickyUserTextRef = useRef<HTMLSpanElement>(null);
  const stickyUserHeightRef = useRef(0);
  const shouldAutoFollowRef = useRef(true);
  const [stickyUserContent, setStickyUserContent] = useState<string | null>(null);
  const [renderedStickyUserContent, setRenderedStickyUserContent] = useState<string | null>(null);
  const [stickyUserMsgId, setStickyUserMsgId] = useState<string | null>(null);
  const [stickyUserHeight, setStickyUserHeight] = useState(0);
  const [stickyUserResizeDirection, setStickyUserResizeDirection] = useState<"growing" | "shrinking" | "stable">("stable");
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const [windowSize, setWindowSize] = useState(() => Math.min(session.messages.length, DEFAULT_WINDOW_SIZE));

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

  const totalMessages = session.messages.length;
  const hiddenCount = Math.max(0, totalMessages - windowSize);
  const visibleMessages = useMemo(() => session.messages.slice(-windowSize), [session.messages, windowSize]);

  const checkNearBottom = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight <= 140;
  }, []);

  const scrollToEnd = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = scrollRef.current;
    if (!container) return;
    const top = container.scrollHeight - container.clientHeight;
    container.scrollTo({ top: Math.max(0, top), behavior });
  }, []);

  const handleTimelineScroll = useCallback(() => {
    if (isStreaming) shouldAutoFollowRef.current = checkNearBottom();
    const container = scrollRef.current;
    if (!container) return;
    const messageElements = container.querySelectorAll('[data-role="user"]');
    if (messageElements.length === 0) {
      setVisibleStartIndex(0);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    let nextStartIndex = 0;
    for (let index = 0; index < messageElements.length; index += 1) {
      const rect = messageElements[index].getBoundingClientRect();
      if (rect.bottom >= containerRect.top) {
        nextStartIndex = index;
        break;
      }
    }
    setVisibleStartIndex(nextStartIndex + messageStartIndex + hiddenCount);
  }, [checkNearBottom, hiddenCount, isStreaming, messageStartIndex]);

  const handleLoadMore = useCallback(() => {
    const container = scrollRef.current;
    if (!container) {
      setWindowSize((current) => Math.min(totalMessages, current + LOAD_BATCH_SIZE));
      return;
    }
    const prevScrollHeight = container.scrollHeight;
    const prevScrollTop = container.scrollTop;
    setWindowSize((current) => Math.min(totalMessages, current + LOAD_BATCH_SIZE));
    requestAnimationFrame(() => {
      const nextScrollHeight = container.scrollHeight;
      container.scrollTop = prevScrollTop + (nextScrollHeight - prevScrollHeight);
    });
  }, [totalMessages]);

  useEffect(() => {
    shouldAutoFollowRef.current = true;
    scrollToEnd();
  }, [scrollToEnd, session.messages.length]);

  useEffect(() => {
    setWindowSize((current) => Math.min(totalMessages, Math.max(current, Math.min(DEFAULT_WINDOW_SIZE, totalMessages))));
  }, [totalMessages]);

  useEffect(() => {
    setWindowSize(Math.min(totalMessages, DEFAULT_WINDOW_SIZE));
  }, [session.id, totalMessages]);

  useEffect(() => {
    if (!showStickyUserMessageBar) {
      setStickyUserContent(null);
      setStickyUserMsgId(null);
      return;
    }
    let nextContent: string | null = null;
    let nextMsgId: string | null = null;
    const scanIndex = Math.min(visibleStartIndex - 1 - messageStartIndex, visibleMessages.length - 1);
    for (let index = scanIndex; index >= 0; index -= 1) {
      const message = visibleMessages[index];
      if (message.role === "user") {
        nextContent = userPromptText(message);
        nextMsgId = message.id;
        break;
      }
    }
    setStickyUserContent((current) => current === nextContent ? current : nextContent);
    setStickyUserMsgId((current) => current === nextMsgId ? current : nextMsgId);
  }, [messageStartIndex, showStickyUserMessageBar, visibleMessages, visibleStartIndex]);

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
    if (hiddenCount > 0) {
      const messageIndex = index - messageStartIndex;
      if (messageIndex >= 0 && messageIndex < totalMessages - visibleMessages.length) {
        const needed = totalMessages - messageIndex;
        setWindowSize((current) => Math.max(current, needed));
      }
    }
    const container = scrollRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(stickyUserMsgId)}"]`);
    if (!target) return;
    const bubble = target.querySelector<HTMLElement>(".agent-message-main") || target;
    const containerRect = container.getBoundingClientRect();
    const targetRect = bubble.getBoundingClientRect();
    const overlayHeight = container.querySelector<HTMLElement>(".agent-timeline-top-overlay")?.getBoundingClientRect().height ?? 0;
    const nextScrollTop = container.scrollTop + targetRect.top - containerRect.top - overlayHeight - 8;
    container.scrollTo({ top: Math.max(0, nextScrollTop), behavior: "smooth" });
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

  useEffect(() => {
    const handleFocusMessage = (event: Event) => {
      const detail = (event as CustomEvent<AgentFocusStepEventDetail>).detail;
      if (!detail?.messageId || detail.stepId) return;
      const container = scrollRef.current;
      if (!container) return;
      const target = container.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(detail.messageId)}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
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

  return (
    <div ref={containerRef} className="agent-message-timeline-shell">
      <div ref={scrollRef} className="agent-message-timeline" onScroll={handleTimelineScroll}>
        {headerNode}
        {historyNoticeNode}
        {newSessionNode}
        {hiddenCount > 0 && !isNewOpenCodeSessionPage && (
          <button type="button" className="agent-history-load-more" onClick={handleLoadMore}>
            {t("agentConsole.historyLoadMore", "Load older messages ({{count}} hidden)", { count: hiddenCount })}
          </button>
        )}
        {visibleMessages.map((message) => (
          <AgentMessageItem key={message.id} session={session} message={message} projectDirectory={session.cwd} />
        ))}
      </div>
    </div>
  );
}