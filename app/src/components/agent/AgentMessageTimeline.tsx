import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useAgentConsoleSettings } from "../../agentConsoleSettings";
import type { AgentContentBlock, AgentProviderMessagePart, AgentSession } from "../../agent/types";
import { MlcLogoIcon } from "../Icons";
import { AgentMessageItem } from "./AgentMessageItem";
import { AgentNewSessionWorkspacePicker } from "./AgentNewSessionWorkspacePicker";
import { AgentPermissionPanel } from "./AgentPermissionIndicator";
import { AgentSessionHeader } from "./AgentSessionHeader";

const STICKY_USER_SCROLL_TOP_EXTRA_OFFSET = -38;

function animateScrollTop(element: HTMLElement, targetTop: number) {
  const startTop = element.scrollTop;
  const distance = targetTop - startTop;
  if (Math.abs(distance) < 1) {
    element.scrollTop = targetTop;
    return;
  }
  const duration = Math.min(420, Math.max(180, Math.abs(distance) * 0.28));
  const startTime = performance.now();

  const step = (timestamp: number) => {
    const elapsed = timestamp - startTime;
    const progress = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.scrollTop = startTop + distance * eased;
    if (progress < 1) requestAnimationFrame(step);
    else element.scrollTop = targetTop;
  };

  requestAnimationFrame(step);
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

export function AgentMessageTimeline({ session }: { session: AgentSession }) {
  const { mergeStickyUserMessageLines, showStickyUserMessageBar } = useAgentConsoleSettings();
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topOverlayRef = useRef<HTMLDivElement>(null);
  const stickyUserBarRef = useRef<HTMLButtonElement>(null);
  const stickyUserTextRef = useRef<HTMLSpanElement>(null);
  const stickyUserHeightRef = useRef(0);
  const messagesRef = useRef(session.messages);
  const shouldAutoFollowRef = useRef(true);
  const [stickyUserContent, setStickyUserContent] = useState<string | null>(null);
  const [renderedStickyUserContent, setRenderedStickyUserContent] = useState<string | null>(null);
  const [stickyUserMsgId, setStickyUserMsgId] = useState<string | null>(null);
  const [stickyUserHeight, setStickyUserHeight] = useState(0);
  const [stickyUserResizeDirection, setStickyUserResizeDirection] = useState<"growing" | "shrinking" | "stable">("stable");
  const isStreaming = session.messages.some((message) => message.status === "streaming");
  const hasStickyUserContent = Boolean(stickyUserContent);
  const hasRenderedStickyUserContent = Boolean(renderedStickyUserContent);
  const isStickyUserExiting = !hasStickyUserContent && hasRenderedStickyUserContent;

  messagesRef.current = session.messages;

  const checkNearBottom = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight <= 140;
  }, []);

  const scrollToEnd = useCallback((behavior: ScrollBehavior = "auto") => {
    endRef.current?.scrollIntoView({ block: "end", behavior });
  }, []);

  useEffect(() => {
    shouldAutoFollowRef.current = true;
    scrollToEnd();
  }, [session.messages.length, scrollToEnd]);

  useEffect(() => {
    const handleFocusMessage = (event: Event) => {
      const detail = (event as CustomEvent<AgentFocusStepEventDetail>).detail;
      if (!detail?.messageId || detail.stepId) return;
      const container = scrollRef.current;
      if (!container) return;
      const target = container.querySelector(`[data-msg-id="${CSS.escape(detail.messageId)}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener("mlfb-agent-focus-step", handleFocusMessage);
    return () => window.removeEventListener("mlfb-agent-focus-step", handleFocusMessage);
  }, []);

  const updateStickyUserMessage = useCallback(() => {
    if (!showStickyUserMessageBar) {
      setStickyUserContent(null);
      setStickyUserMsgId(null);
      return;
    }
    const container = scrollRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const overlayHeight = topOverlayRef.current?.getBoundingClientRect().height ?? 0;
    const stickyThreshold = containerRect.top + overlayHeight + 8;
    const userElements = container.querySelectorAll('[data-role="user"]');
    let nextContent: string | null = null;
    let nextMsgId: string | null = null;

    userElements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.bottom < stickyThreshold) {
        const msgId = element.getAttribute("data-msg-id");
        const message = messagesRef.current.find((item) => item.id === msgId);
        if (message) {
          nextContent = userPromptText(message);
          nextMsgId = message.id;
        }
      }
    });

    setStickyUserContent((current) => current === nextContent ? current : nextContent);
    setStickyUserMsgId((current) => current === nextMsgId ? current : nextMsgId);
  }, [showStickyUserMessageBar]);

  useEffect(() => {
    if (!showStickyUserMessageBar) {
      setStickyUserContent(null);
      setStickyUserMsgId(null);
    }
  }, [showStickyUserMessageBar]);

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
    const container = scrollRef.current;
    if (!container || !stickyUserMsgId) return;
    const firstUserMessage = messagesRef.current.find((message) => message.role === "user");
    if (firstUserMessage?.id === stickyUserMsgId) {
      shouldAutoFollowRef.current = false;
      animateScrollTop(container, 0);
      return;
    }
    const target = container.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(stickyUserMsgId)}"]`);
    if (!target) return;
    const bubble = target.querySelector<HTMLElement>(".agent-message-main") || target;
    const containerRect = container.getBoundingClientRect();
    const targetRect = bubble.getBoundingClientRect();
    const overlayHeight = topOverlayRef.current?.getBoundingClientRect().height ?? 0;
    const nextScrollTop = container.scrollTop + targetRect.top - containerRect.top - overlayHeight + STICKY_USER_SCROLL_TOP_EXTRA_OFFSET;
    container.scrollTo({ top: Math.max(0, nextScrollTop), behavior: "smooth" });
  }, [stickyUserMsgId]);

  const handleTimelineScroll = useCallback(() => {
    updateStickyUserMessage();
    if (isStreaming) shouldAutoFollowRef.current = checkNearBottom();
  }, [checkNearBottom, isStreaming, updateStickyUserMessage]);

  useEffect(() => {
    const frame = requestAnimationFrame(updateStickyUserMessage);
    return () => cancelAnimationFrame(frame);
  }, [session.messages, updateStickyUserMessage]);

  useEffect(() => {
    if (!isStreaming) return;
    if (shouldAutoFollowRef.current) {
      const frame = requestAnimationFrame(() => scrollToEnd());
      return () => cancelAnimationFrame(frame);
    }
  }, [isStreaming, scrollToEnd, session.messages]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !isStreaming) return;
    shouldAutoFollowRef.current = checkNearBottom();
    let frame = 0;
    const followContentGrowth = () => {
      if (!shouldAutoFollowRef.current) return;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        scrollToEnd();
      });
    };
    const observer = new MutationObserver(followContentGrowth);
    observer.observe(container, { childList: true, characterData: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [checkNearBottom, isStreaming, scrollToEnd]);

  return (
    <div className="agent-message-timeline" ref={scrollRef} onScroll={handleTimelineScroll}>
      <div className="agent-timeline-top-overlay" ref={topOverlayRef}>
        <AgentSessionHeader session={session} />
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
      {session.providerId === "opencode" && session.messages.length === 0 && (
        <div className="agent-new-session-permission-shell">
          <div className="agent-new-session-brand" aria-label="My Last Code">
            <MlcLogoIcon size={34} />
            <span>My Last Code</span>
          </div>
          <AgentNewSessionWorkspacePicker session={session} />
          <AgentPermissionPanel session={session} variant="standalone" />
        </div>
      )}
      {session.messages.map((message) => (
        <AgentMessageItem key={message.id} session={session} message={message} projectDirectory={session.cwd} />
      ))}
      <div ref={endRef} />
    </div>
  );
}