import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../store/feedbackStore";
import { CallerContext } from "./CallerContext";
import type { CallerOverride } from "./CallerContext";
import { SummaryPanel } from "./SummaryPanel";
import { FeedbackInput } from "./FeedbackInput";
import { ImageAttachmentWidget } from "./ImageAttachmentWidget";
import { QuickActions } from "./QuickActions";
import { Sidebar } from "./Sidebar";
import { invoke } from "@tauri-apps/api/core";
import { useActiveCallerSession } from "./useActiveCallerSession";
import { Icon } from "./Icons";
import { TransferSubmitSplit } from "./TransferSubmitSplit";
import { AttachmentTagBar, ReadonlyTagBar } from "./CallerPanelParts";
import { ReadonlyComposerContent } from "./ReadonlyComposerContent";
import { PromptButtons } from "./PromptButtons";
import { getNotificationSettings } from "../notificationSettings";
import { buildSubmittedFeedback } from "../composer/submittedFeedback";

/**
 * Self-contained panel for a single caller.
 * Provides CallerContext so all children read this caller's active session.
 */
export function CallerPanel({ callerId }: { callerId: string }) {
  const sessions = useFeedbackStore((s) => s.sessions);
  const callers = useFeedbackStore((s) => s.callers);
  const caller = callers.find((c) => c.id === callerId) || null;

  const callerSessions = useMemo(
    () => sessions.filter((s) => s.callerId === callerId),
    [sessions, callerId]
  );

  // Initialize with a sensible default (latest pending, or last session)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => {
    const initial = sessions.filter((s) => s.callerId === callerId);
    if (initial.length === 0) return null;
    const latestPending = [...initial].reverse().find((s) => s.status === "pending");
    return latestPending?.id || initial[initial.length - 1].id;
  });
  const sessionListMode = useFeedbackStore((s) => s.sessionListMode);
  const setSessionListMode = useFeedbackStore((s) => s.setSessionListMode);
  const isTopbarMode = sessionListMode === "topbarCompact" || sessionListMode === "topbarStats";

  useEffect(() => {
    // If current selection no longer exists, pick a new one
    if (selectedSessionId && !callerSessions.find((s) => s.id === selectedSessionId)) {
      if (callerSessions.length > 0) {
        const latestPending = [...callerSessions].reverse().find((s) => s.status === "pending");
        setSelectedSessionId(latestPending?.id || callerSessions[callerSessions.length - 1].id);
      } else {
        setSelectedSessionId(null);
      }
    }
    // If nothing selected but sessions exist, pick one
    if (!selectedSessionId && callerSessions.length > 0) {
      const latestPending = [...callerSessions].reverse().find((s) => s.status === "pending");
      setSelectedSessionId(latestPending?.id || callerSessions[callerSessions.length - 1].id);
    }
  }, [callerSessions, selectedSessionId]);

  // Auto-select newly arriving pending session
  const prevSessionCountRef = useRef(callerSessions.length);
  useEffect(() => {
    if (callerSessions.length > prevSessionCountRef.current) {
      const latest = callerSessions[callerSessions.length - 1];
      if (latest.status === "pending" && getNotificationSettings().autoFocusNewRequest) {
        setSelectedSessionId(latest.id);
      }
    }
    prevSessionCountRef.current = callerSessions.length;
  }, [callerSessions]);

  const override: CallerOverride = useMemo(
    () => ({
      callerId,
      sessionId: selectedSessionId,
      setSessionId: setSelectedSessionId,
    }),
    [callerId, selectedSessionId]
  );

  return (
    <CallerContext.Provider value={override}>
      <div className="caller-panel" style={caller?.color ? { borderColor: `${caller.color}44`, '--caller-color': caller.color } as React.CSSProperties : undefined}>
        <div className={`caller-panel-body${sessionListMode === "topbarCompact" || sessionListMode === "topbarStats" ? " caller-panel-body-topbar" : ` caller-panel-body-${sessionListMode}`}`}>
          {!isTopbarMode && <Sidebar mode={sessionListMode} onModeChange={setSessionListMode} />}
          <CallerContent topbarSlot={isTopbarMode ? <Sidebar mode={sessionListMode} onModeChange={setSessionListMode} /> : null} />
        </div>
      </div>
    </CallerContext.Provider>
  );
}

/** The right-side content area for one caller column */
function CallerContent({ topbarSlot }: { topbarSlot?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { session: activeSession, caller } = useActiveCallerSession();
  const callerColor = caller?.color || 'var(--color-primary)';

  // Panel resize state — 2 panels: summary + input area
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRootRef = useRef<HTMLDivElement>(null);
  const feedbackPanelRef = useRef<HTMLDivElement>(null);
  const readonlyTagsRef = useRef<HTMLDivElement>(null);
  const readonlyMarkdownRef = useRef<HTMLDivElement>(null);
  const INPUT_DEFAULT = 0.25;
  const INPUT_AUTO_MAX = 0.55;
  const [panelSizes, setPanelSizes] = useState([1 - INPUT_DEFAULT, INPUT_DEFAULT]);
  const panelSizesRef = useRef(panelSizes);
  panelSizesRef.current = panelSizes;
  const resizingRef = useRef<{ index: number; startY: number; startSizes: number[] } | null>(null);
  const draftResizingRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const userResizedRef = useRef(false);
  const DRAFT_DEFAULT_HEIGHT = 230;
  const DRAFT_MIN_HEIGHT = 136;
  const DRAFT_MAX_HEIGHT = 460;
  const [queuedDraftHeight, setQueuedDraftHeight] = useState(() => {
    try {
      const stored = localStorage.getItem("mlf-queued-draft-height");
      return stored ? Number(stored) : DRAFT_DEFAULT_HEIGHT;
    } catch { return DRAFT_DEFAULT_HEIGHT; }
  });

  const handleMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      userResizedRef.current = true;
      resizingRef.current = { index, startY: e.clientY, startSizes: [...panelSizesRef.current] };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizingRef.current || !containerRef.current) return;
        const { index: idx, startY, startSizes } = resizingRef.current;
        const containerH = containerRef.current.getBoundingClientRect().height;
        const delta = (ev.clientY - startY) / containerH;
        const minSize = 0.08;
        const combined = startSizes[idx] + startSizes[idx + 1];
        let newA = startSizes[idx] + delta;
        let newB = startSizes[idx + 1] - delta;
        if (newA < minSize) { newA = minSize; newB = combined - minSize; }
        if (newB < minSize) { newB = minSize; newA = combined - minSize; }
        const newSizes = [...startSizes];
        newSizes[idx] = newA;
        newSizes[idx + 1] = newB;
        setPanelSizes(newSizes);
      };

      const handleMouseUp = () => {
        resizingRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [] // stable callback — uses refs internally
  );

  const handleDraftResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draftResizingRef.current = { startY: e.clientY, startHeight: queuedDraftHeight };

    const handleMouseMove = (ev: MouseEvent) => {
      const draftResize = draftResizingRef.current;
      if (!draftResize) return;
      const rootH = contentRootRef.current?.getBoundingClientRect().height ?? window.innerHeight;
      const maxHeight = Math.max(DRAFT_MIN_HEIGHT, Math.min(DRAFT_MAX_HEIGHT, rootH - 120));
      const nextHeight = Math.max(DRAFT_MIN_HEIGHT, Math.min(maxHeight, draftResize.startHeight + draftResize.startY - ev.clientY));
      setQueuedDraftHeight(nextHeight);
      try { localStorage.setItem("mlf-queued-draft-height", String(nextHeight)); } catch {}
    };

    const handleMouseUp = () => {
      draftResizingRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [queuedDraftHeight]);

  // Auto-expand feedback panel based on textarea content
  const isReadonly = activeSession?.status === "responded" || activeSession?.status === "cancelled";
  const sessionFeedback = activeSession?.feedbackText || "";
  const sessionTestLog = activeSession?.testLogText || "";
  const sessionImageCount = activeSession?.images?.length ?? 0;
  const sessionMlcAttachmentCount = activeSession?.mlcAttachments?.length ?? 0;
  const sessionWebAttachmentCount = activeSession?.webAttachments?.length ?? 0;
  const hasQuestionAnswers = !!(activeSession?.questions?.some(
    (q) => q.answer.trim() || (q.selectedOptions && q.selectedOptions.length > 0)
  ));
  const hasContent = !!(sessionFeedback.trim() || sessionTestLog.trim() || sessionImageCount > 0 || sessionMlcAttachmentCount > 0 || sessionWebAttachmentCount > 0 || hasQuestionAnswers || activeSession?.gitAction);
  const feedbackText = sessionFeedback;
  const [readonlyContentAtTop, setReadonlyContentAtTop] = useState(true);
  const [readonlyPanelMaxHeight, setReadonlyPanelMaxHeight] = useState<number | null>(null);
  const prompts = useFeedbackStore((state) => state.prompts);
  const disabledPrompts = useFeedbackStore((state) => state.disabledPrompts);
  const showPromptButtons = useFeedbackStore((state) => state.showPromptButtons);
  const showTransferSubmitUi = useFeedbackStore((state) => state.showTransferSubmitUi);
  const updateSessionField = useFeedbackStore((state) => state.updateSessionField);
  const visiblePrompts = useMemo(
    () => prompts.filter((prompt) => !disabledPrompts.includes(prompt.name)),
    [disabledPrompts, prompts],
  );

  useEffect(() => {
    setReadonlyContentAtTop(true);
  }, [activeSession?.id, isReadonly]);

  const handleReadonlyContentScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const atTop = event.currentTarget.scrollTop <= 2;
    setReadonlyContentAtTop((current) => current === atTop ? current : atTop);
  }, []);

  const handlePromptButtonCommand = useCallback((commandText: string) => {
    if (!activeSession || activeSession.status !== "pending") return;
    if (!commandText.trim()) return;
    if (feedbackText.startsWith(commandText)) return;
    updateSessionField(activeSession.id, "feedbackText", `${commandText}${feedbackText}`);
  }, [activeSession, feedbackText, updateSessionField]);

  useLayoutEffect(() => {
    if (!isReadonly) {
      setReadonlyPanelMaxHeight(null);
      return;
    }

    const measureReadonlyContent = () => {
      const tagsHeight = readonlyTagsRef.current?.getBoundingClientRect().height ?? 0;
      const markdownHeight = readonlyMarkdownRef.current?.scrollHeight ?? 0;
      const bottomPadding = 8;
      const nextHeight = Math.max(48, Math.ceil(tagsHeight + markdownHeight + bottomPadding));
      setReadonlyPanelMaxHeight((current) => current === nextHeight ? current : nextHeight);
    };

    measureReadonlyContent();

    const observer = new ResizeObserver(measureReadonlyContent);
    if (readonlyTagsRef.current) observer.observe(readonlyTagsRef.current);
    if (readonlyMarkdownRef.current) observer.observe(readonlyMarkdownRef.current);
    window.addEventListener("resize", measureReadonlyContent);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureReadonlyContent);
    };
  }, [activeSession?.id, isReadonly, hasContent, sessionFeedback, sessionTestLog, sessionImageCount, sessionMlcAttachmentCount, sessionWebAttachmentCount, hasQuestionAnswers, activeSession?.gitAction]);

  useEffect(() => {
    if (userResizedRef.current || isReadonly) return;
    const panel = feedbackPanelRef.current;
    const container = containerRef.current;
    if (!panel || !container) return;
    const composerInput = panel.querySelector<HTMLElement>("[data-composer-input='true']");
    if (!composerInput) return;
    const containerH = container.getBoundingClientRect().height;
    if (containerH <= 0) return;
    const scrollH = composerInput.scrollHeight;
    const clientH = composerInput.clientHeight;
    if (scrollH > clientH + 4) {
      const extraPx = scrollH - clientH;
      const extraRatio = extraPx / containerH;
      const newInput = Math.min(panelSizes[1] + extraRatio, INPUT_AUTO_MAX);
      if (newInput > panelSizes[1]) {
        setPanelSizes([1 - newInput, newInput]);
      }
    }
  }, [feedbackText, panelSizes, isReadonly]);

  // Test log visibility toggle
  const [showTestLog, setShowTestLog] = useState(false);
  const testLogRef = useRef<HTMLTextAreaElement>(null);

  // Git panel visibility toggle
  const [showGitPanel, setShowGitPanel] = useState(false);

  // Auto-expand input panel when test log opens
  useEffect(() => {
    if (!showTestLog || userResizedRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const containerH = container.getBoundingClientRect().height;
    if (containerH <= 0) return;
    // Add ~140px worth of space for the test log editor
    const extraRatio = 140 / containerH;
    const newInput = Math.min(panelSizes[1] + extraRatio, INPUT_AUTO_MAX);
    if (newInput > panelSizes[1]) {
      setPanelSizes([1 - newInput, newInput]);
    }
  }, [showTestLog]); // only react to showTestLog toggle

  // Submit handler
  const [sessionSubmitting, setSessionSubmitting] = useState(false);
  // Transfer-submit state: when set, the next submit will one-shot override
  // the agent_name in the MCP [System] notice. Reset after each submit / on
  // session switch.
  const [transferAlias, setTransferAlias] = useState<string | null>(null);
  const [transferPopoverOpen, setTransferPopoverOpen] = useState(false);
  const [transferDraft, setTransferDraft] = useState("");
  const completeSessionWithSubmittedFeedback = useFeedbackStore((s) => s.completeSessionWithSubmittedFeedback);
  const pushMessageHistory = useFeedbackStore((s) => s.pushMessageHistory);

  // Reset transfer state when the active session changes
  useEffect(() => {
    setTransferAlias(null);
    setTransferPopoverOpen(false);
    setTransferDraft("");
  }, [activeSession?.id]);

  useEffect(() => {
    if (showTransferSubmitUi) return;
    setTransferAlias(null);
    setTransferPopoverOpen(false);
    setTransferDraft("");
  }, [showTransferSubmitUi]);

  const handleSubmit = useCallback(
    async (quickAction?: string) => {
      if (!activeSession || activeSession.status !== "pending" || sessionSubmitting) return;
      setSessionSubmitting(true);
      const effectiveTransferAlias = showTransferSubmitUi ? transferAlias : null;

      const submittedFeedback = buildSubmittedFeedback(activeSession, {
        prompts: visiblePrompts,
        quickAction,
        callerAlias: caller?.alias || null,
        transferAlias: effectiveTransferAlias,
        language: i18n.language,
      });
      const finalFeedback = submittedFeedback.markdown;
      const historyText = submittedFeedback.historyText;
      const imageList = submittedFeedback.imageList;

      try {
        await invoke("submit_session_feedback", {
          sessionId: activeSession.id,
          feedbackText: finalFeedback,
          commandLogs: activeSession.commandLogs,
          images: imageList,
          mlcAttachments: activeSession.mlcAttachments || [],
          webAttachments: activeSession.webAttachments || [],
          transferToAlias: effectiveTransferAlias,
        });
        pushMessageHistory(activeSession.callerId, historyText);
        completeSessionWithSubmittedFeedback(activeSession.id, finalFeedback);
        submittedFeedback.afterSubmit?.();
        // Clear transfer state after successful submit
        setTransferAlias(null);
        setTransferPopoverOpen(false);
        setTransferDraft("");
      } catch (e) {
        console.error("Submit failed:", e);
      } finally {
        setSessionSubmitting(false);
      }
    },
    [activeSession, caller?.alias, i18n.language, sessionSubmitting, completeSessionWithSubmittedFeedback, pushMessageHistory, showTransferSubmitUi, transferAlias, visiblePrompts]
  );

  // Ctrl+Enter shortcut — scoped to this panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
        const container = containerRef.current;
        if (!container || !container.contains(document.activeElement)) return;
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSubmit]);

  if (!activeSession) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: "var(--color-text-muted)" }}>
        <span className="text-sm">{t("session.waitingForRequest", "Waiting for feedback request...")}</span>
      </div>
    );
  }

  return (
    <div ref={contentRootRef} className="flex-1 flex flex-col min-h-0 min-w-0">
      {/* 2 resizable panels: summary (top) + input area (bottom) */}
      <div ref={containerRef} className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden" style={{ gap: 0 }}>
        {/* Summary panel */}
        <div className="overflow-hidden flex flex-col panel-card" style={{ flex: isReadonly ? `1 1 calc(${panelSizes[0] * 100}% - 1px)` : `0 0 calc(${panelSizes[0] * 100}% - 1px)`, minHeight: 48 }}>
          <SummaryPanel topbarSlot={topbarSlot} />
        </div>
        <div className="resize-handle" onMouseDown={(e) => handleMouseDown(0, e)} />
        {/* Input area: attachments + feedback */}
        <div ref={feedbackPanelRef} className={`flex flex-col panel-card panel-feedback${isReadonly ? "" : " panel-feedback-editable"}`} data-tooltip-placement="top" style={{ flex: isReadonly ? `0 1 ${panelSizes[1] * 100}%` : `0 0 ${panelSizes[1] * 100}%`, minHeight: 48, maxHeight: isReadonly && readonlyPanelMaxHeight ? readonlyPanelMaxHeight : undefined, position: "relative" }}>
          {isReadonly ? (
            <>
              {/* Readonly tag bar: fixed, not scrollable */}
              <div ref={readonlyTagsRef} className="shrink-0">
                <ReadonlyTagBar session={activeSession} />
              </div>
              {/* Scrollable feedback text */}
              <div className="flex-1 min-h-0" style={{ position: "relative" }}>
                <ReadonlyStatusBadge status={activeSession.status as "responded" | "cancelled"} compact={!readonlyContentAtTop} />
                <div className="h-full overflow-y-auto px-3 pb-2" onScroll={handleReadonlyContentScroll}>
                  <div ref={readonlyMarkdownRef}>
                    {hasContent && <ReadonlyComposerContent session={activeSession} />}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <ImageAttachmentWidget renderLayout={({ controls, fileInput, dropProps }) => (
              <div
                className="flex flex-col flex-1 min-h-0"
                onDragOver={dropProps.onDragOver}
                onDragLeave={dropProps.onDragLeave}
                onDrop={dropProps.onDrop}
                style={dropProps.isDragOver ? { outline: "2px dashed var(--color-primary)", outlineOffset: -2 } : undefined}
              >
                {/* Tag-based attachment bar */}
                <AttachmentTagBar
                  controls={controls}
                  fileInput={fileInput}
                  showTestLog={showTestLog}
                  setShowTestLog={setShowTestLog}
                  testLogRef={testLogRef}
                  callerColor={callerColor}
                  showGitPanel={showGitPanel}
                  setShowGitPanel={setShowGitPanel}
                />
                {/* Feedback text area — independent, fills remaining space */}
                <FeedbackInput />
              </div>
            )} />
          )}
        </div>
      </div>

      {/* Bottom fused area: buttons only */}
      {!isReadonly && (
        <div className="flex flex-col gap-1.5 px-3 pb-2 pt-2 shrink-0" data-tooltip-placement="top" style={{ background: "var(--color-bg-input-raised)" }}>
          {showPromptButtons ? <PromptButtons onAction={handlePromptButtonCommand} /> : null}
          <div className="flex items-center gap-2">
            <QuickActions onAction={handleSubmit} />
            <div className="flex-1" />
            <TransferSubmitSplit
              color={callerColor}
              disabled={sessionSubmitting || !hasContent}
              submitting={sessionSubmitting}
              transferEnabled={showTransferSubmitUi}
              transferAlias={transferAlias}
              popoverOpen={transferPopoverOpen}
              draft={transferDraft}
              setDraft={setTransferDraft}
              onSubmit={() => handleSubmit()}
              onOpenPopover={() => {
                setTransferDraft(transferAlias ?? "");
                setTransferPopoverOpen(true);
              }}
              onClosePopover={() => setTransferPopoverOpen(false)}
              onConfirmTransfer={(alias) => {
                setTransferAlias(alias);
                setTransferPopoverOpen(false);
              }}
              onCancelTransfer={() => setTransferAlias(null)}
            />
          </div>
        </div>
      )}

      {isReadonly && (
        <>
          <div className="resize-handle" onMouseDown={handleDraftResizeMouseDown} />
          <QueuedDraftComposer callerId={activeSession.callerId} callerColor={callerColor} sessionStatus={activeSession.status as "responded" | "cancelled"} height={queuedDraftHeight} />
        </>
      )}
    </div>
  );
}

function ReadonlyStatusBadge({ status, compact = false }: { status: "responded" | "cancelled"; compact?: boolean }) {
  const { t } = useTranslation();
  const isCancelled = status === "cancelled";
  const label = isCancelled
    ? t("session.cancelled", "Client disconnected — session cancelled")
    : t("session.responded", "Feedback already submitted (read-only)");
  const motion = "180ms cubic-bezier(0.2, 0.8, 0.2, 1)";
  const textMotion = "320ms cubic-bezier(0.2, 0.8, 0.2, 1)";

  return (
    <div
      aria-label={label}
      title={label}
      style={{
        position: "absolute",
        top: 8,
        right: 10,
        zIndex: 5,
        display: "inline-flex",
        alignItems: "center",
        gap: 0,
        justifyContent: "center",
        maxWidth: "calc(100% - 20px)",
        minWidth: compact ? 50 : 0,
        padding: compact ? "4px 8px" : "4px 9px",
        borderRadius: 6,
        border: "1px solid var(--color-border)",
        background: "color-mix(in srgb, var(--color-bg-surface) 92%, transparent)",
        color: isCancelled ? "#ef4444" : "var(--color-text-muted)",
        boxShadow: "none",
        fontSize: 12,
        lineHeight: 1.2,
        pointerEvents: "none",
        transition: `min-width ${motion}, padding ${motion}, background-color ${motion}, border-color ${motion}`,
      }}
    >
      {isCancelled ? (
        <Icon name="close" size={13} color="#ef4444" strokeWidth={2.5} />
      ) : (
        <Icon name="check" size={13} color="var(--color-success)" strokeWidth={2.5} />
      )}
      {!isCancelled && (
        <span
          aria-hidden={!compact}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: compact ? 13 : 0,
            maxWidth: compact ? 13 : 0,
            marginLeft: compact ? 5 : 0,
            opacity: compact ? 1 : 0,
            overflow: "hidden",
            transform: compact ? "translateX(0) scale(1)" : "translateX(-4px) scale(0.92)",
            transition: `width ${motion}, max-width ${motion}, margin-left ${motion}, opacity 140ms ease, transform ${motion}`,
            willChange: "width, opacity, transform",
          }}
        >
          <Icon name="eye" size={13} color="var(--color-text-muted)" strokeWidth={2.2} />
        </span>
      )}
      <span
        className="truncate"
        style={{
          display: "inline-block",
          maxWidth: compact ? 0 : 320,
          marginLeft: compact ? 0 : 5,
          opacity: compact ? 0 : 1,
          overflow: "hidden",
          whiteSpace: "nowrap",
          transform: compact ? "translateX(4px)" : "translateX(0)",
          transition: `max-width ${textMotion}, margin-left ${textMotion}, opacity 260ms ease, transform ${textMotion}`,
          willChange: "max-width, opacity, transform",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function QueuedDraftComposer({ callerId, callerColor, height }: { callerId: string; callerColor: string; sessionStatus: "responded" | "cancelled"; height: number }) {
  const [showTestLog, setShowTestLog] = useState(false);
  const [showGitPanel, setShowGitPanel] = useState(false);
  const testLogRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="flex flex-col shrink-0" data-tooltip-placement="top" style={{ background: "var(--color-bg-input-raised)", height, minHeight: 136 }}>
      <div className="flex flex-col flex-1 min-h-0">
        <ImageAttachmentWidget queuedCallerId={callerId} renderLayout={({ controls, fileInput, dropProps }) => (
          <div
            className="flex flex-col flex-1 min-h-0"
            onDragOver={dropProps.onDragOver}
            onDragLeave={dropProps.onDragLeave}
            onDrop={dropProps.onDrop}
            style={dropProps.isDragOver ? { outline: "2px dashed var(--color-primary)", outlineOffset: -2 } : undefined}
          >
            <AttachmentTagBar
              controls={controls}
              fileInput={fileInput}
              showTestLog={showTestLog}
              setShowTestLog={setShowTestLog}
              testLogRef={testLogRef}
              callerColor={callerColor}
              showGitPanel={showGitPanel}
              setShowGitPanel={setShowGitPanel}
              queuedCallerId={callerId}
            />
            <FeedbackInput queuedCallerId={callerId} />
          </div>
        )} />
      </div>
    </div>
  );
}
