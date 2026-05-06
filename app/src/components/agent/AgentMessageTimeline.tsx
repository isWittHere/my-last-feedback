import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentSession } from "../../agent/types";
import { AgentMessageItem } from "./AgentMessageItem";

function messageText(message: AgentSession["messages"][number]): string {
  return message.blocks
    .map((block) => block.type === "text" ? block.content : "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

  interface AgentFocusStepEventDetail {
    messageId: string;
    stepId?: string;
  }

export function AgentMessageTimeline({ session }: { session: AgentSession }) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(session.messages);
  const shouldAutoFollowRef = useRef(true);
  const [stickyUserContent, setStickyUserContent] = useState<string | null>(null);
  const [stickyUserMsgId, setStickyUserMsgId] = useState<string | null>(null);
  const isStreaming = session.messages.some((message) => message.status === "streaming");

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
    const container = scrollRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const userElements = container.querySelectorAll('[data-role="user"]');
    let nextContent: string | null = null;
    let nextMsgId: string | null = null;

    userElements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.bottom < containerRect.top + 8) {
        const msgId = element.getAttribute("data-msg-id");
        const message = messagesRef.current.find((item) => item.id === msgId);
        if (message) {
          nextContent = messageText(message);
          nextMsgId = message.id;
        }
      }
    });

    setStickyUserContent((current) => current === nextContent ? current : nextContent);
    setStickyUserMsgId((current) => current === nextMsgId ? current : nextMsgId);
  }, []);

  const scrollToStickyMessage = useCallback(() => {
    const container = scrollRef.current;
    if (!container || !stickyUserMsgId) return;
    const target = container.querySelector(`[data-msg-id="${CSS.escape(stickyUserMsgId)}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      <div className="agent-sticky-user-anchor">
        {stickyUserContent && (
          <button type="button" className="agent-sticky-user-bar" onClick={scrollToStickyMessage} title={stickyUserContent}>
            <span>{stickyUserContent}</span>
          </button>
        )}
      </div>
      {session.messages.map((message) => (
        <AgentMessageItem key={message.id} session={session} message={message} projectDirectory={session.cwd} />
      ))}
      <div ref={endRef} />
    </div>
  );
}