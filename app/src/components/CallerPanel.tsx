import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../store/feedbackStore";
import { CallerContext } from "./CallerContext";
import type { CallerOverride } from "./CallerContext";
import { SummaryPanel } from "./SummaryPanel";
import { FeedbackInput } from "./FeedbackInput";
import { ImageAttachmentWidget } from "./ImageAttachmentWidget";
import { QuickActions } from "./QuickActions";
import { PromptButtons } from "./PromptButtons";
import { Sidebar } from "./Sidebar";
import { invoke } from "@tauri-apps/api/core";
import { useActiveCallerSession } from "./useActiveCallerSession";
import { Icon } from "./Icons";
import { AttachmentTagBar, ReadonlyTagBar, RichText } from "./CallerPanelParts";

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
      if (latest.status === "pending") {
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
        <div className="caller-panel-body">
          <Sidebar />
          <CallerContent />
        </div>
      </div>
    </CallerContext.Provider>
  );
}

/** The right-side content area for one caller column */
function CallerContent() {
  const { t } = useTranslation();
  const { session: activeSession, caller } = useActiveCallerSession();
  const callerColor = caller?.color || 'var(--color-primary)';

  // Panel resize state — 2 panels: summary + input area
  const containerRef = useRef<HTMLDivElement>(null);
  const feedbackPanelRef = useRef<HTMLDivElement>(null);
  const INPUT_DEFAULT = 0.25;
  const INPUT_AUTO_MAX = 0.55;
  const [panelSizes, setPanelSizes] = useState([1 - INPUT_DEFAULT, INPUT_DEFAULT]);
  const panelSizesRef = useRef(panelSizes);
  panelSizesRef.current = panelSizes;
  const resizingRef = useRef<{ index: number; startY: number; startSizes: number[] } | null>(null);
  const userResizedRef = useRef(false);

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

  // Auto-expand feedback panel based on textarea content
  const isReadonly = activeSession?.status === "responded" || activeSession?.status === "cancelled";
  const sessionFeedback = activeSession?.feedbackText || "";
  const sessionTestLog = activeSession?.testLogText || "";
  const sessionImageCount = activeSession?.images?.length ?? 0;
  const hasQuestionAnswers = !!(activeSession?.questions?.some(
    (q) => q.answer.trim() || (q.selectedOptions && q.selectedOptions.length > 0)
  ));
  const hasContent = !!(sessionFeedback.trim() || sessionTestLog.trim() || sessionImageCount > 0 || hasQuestionAnswers || activeSession?.gitAction);
  const feedbackText = sessionFeedback;
  useEffect(() => {
    if (userResizedRef.current || isReadonly) return;
    const panel = feedbackPanelRef.current;
    const container = containerRef.current;
    if (!panel || !container) return;
    const textarea = panel.querySelector("textarea");
    if (!textarea) return;
    const containerH = container.getBoundingClientRect().height;
    if (containerH <= 0) return;
    const scrollH = textarea.scrollHeight;
    const clientH = textarea.clientHeight;
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
  const markSessionResponded = useFeedbackStore((s) => s.markSessionResponded);
  const updateSessionField = useFeedbackStore((s) => s.updateSessionField);

  const handleSubmit = useCallback(
    async (quickAction?: string) => {
      if (!activeSession || activeSession.status !== "pending" || sessionSubmitting) return;
      setSessionSubmitting(true);

      const sections: string[] = [];
      if (activeSession.feedbackText.trim()) {
        sections.push(`## User Feedback\n${activeSession.feedbackText.trim()}`);
      }
      if (quickAction) {
        sections.push(`## User Requirement\n${quickAction}`);
      }

      // Agent questions response as Markdown table
      const answeredQuestions = activeSession.questions?.filter(
        (q) => q.answer.trim() || (q.selectedOptions && q.selectedOptions.length > 0)
      );
      if (answeredQuestions && answeredQuestions.length > 0) {
        const tableRows = activeSession.questions.map((q, i) => {
          const selected = q.selectedOptions && q.selectedOptions.length > 0 ? q.selectedOptions.join(", ") : "\u2014";
          const answer = q.answer.trim() || "\u2014";
          return `| ${i + 1} | ${q.label} | ${selected} | ${answer} |`;
        });
        sections.push(
          `## Agent Questions Response\n\n| # | Question | Selected | Answer |\n|---|----------|----------|--------|\n${tableRows.join("\n")}`
        );
      }

      // Git action instruction
      if (activeSession.gitAction) {
        const gitMessages: Record<string, string> = {
          commit: "Please execute git add and git commit to backup the current changes.",
          "commit-push": "Please execute git add, git commit, and git push to backup and push the current changes.",
          "create-branch": activeSession.gitAction.branchName
            ? `Please create a new branch "${activeSession.gitAction.branchName}" and switch to it.`
            : "Please create a new branch and switch to it.",
        };
        sections.push(`## Git Action\n${gitMessages[activeSession.gitAction.type]}`);
      }

      sections.push(
        "## Reminder\nPlease use the interactive_feedback tool again after completing this operation."
      );
      if (activeSession.testLogText.trim()) {
        sections.push(`## Attachment: Test Logs\n${activeSession.testLogText.trim()}`);
      }
      const imageList = activeSession.images.map((i) => ({ path: i.path, data_url: i.dataUrl }));
      if (imageList.length > 0) {
        sections.push(
          `## Attachment: Images\n${imageList.length} image(s) attached, please review the accompanying image content.`
        );
      }
      const finalFeedback = sections.join("\n\n");

      // Save the quick action text into feedbackText for history display
      if (quickAction && !activeSession.feedbackText.trim()) {
        updateSessionField(activeSession.id, "feedbackText", quickAction);
      } else if (quickAction) {
        updateSessionField(activeSession.id, "feedbackText", activeSession.feedbackText.trim() + "\n\n" + quickAction);
      }

      try {
        await invoke("submit_session_feedback", {
          sessionId: activeSession.id,
          feedbackText: finalFeedback,
          commandLogs: activeSession.commandLogs,
          images: imageList,
        });
        markSessionResponded(activeSession.id);
      } catch (e) {
        console.error("Submit failed:", e);
      } finally {
        setSessionSubmitting(false);
      }
    },
    [activeSession, sessionSubmitting, markSessionResponded, updateSessionField]
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
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      {/* 2 resizable panels: summary (top) + input area (bottom) */}
      <div ref={containerRef} className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden" style={{ gap: 0 }}>
        {/* Summary panel */}
        <div className="overflow-hidden flex flex-col panel-card" style={{ flex: `0 0 calc(${panelSizes[0] * 100}% - 1px)`, minHeight: 48 }}>
          <SummaryPanel />
        </div>
        <div className="resize-handle" onMouseDown={(e) => handleMouseDown(0, e)} />
        {/* Input area: attachments + feedback */}
        <div ref={feedbackPanelRef} className="flex flex-col panel-card panel-feedback" style={{ flex: `0 0 ${panelSizes[1] * 100}%`, minHeight: 48 }}>
          {isReadonly ? (
            <>
              {/* Readonly tag bar: fixed, not scrollable */}
              {(activeSession.images.length > 0 || activeSession.testLogText.trim() || activeSession.gitAction) && (
                <ReadonlyTagBar session={activeSession} />
              )}
              {/* Scrollable feedback text */}
              {activeSession.feedbackText && (
                <div className="flex-1 overflow-y-auto min-h-0 px-3 pb-2">
                  <div
                    style={{ fontSize: 13, color: "var(--color-text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-all", opacity: 0.7, userSelect: "text", cursor: "text" }}
                  >
                    <RichText text={activeSession.feedbackText} />
                  </div>
                </div>
              )}
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
        <div className="flex flex-col gap-1.5 px-3 pb-2 pt-2 shrink-0" style={{ background: "var(--color-bg-input)" }}>
          <PromptButtons onAction={handleSubmit} />
          <div className="flex items-center gap-2">
            <QuickActions onAction={handleSubmit} />
            <div className="flex-1" />
            <button
              onClick={() => handleSubmit()}
              disabled={sessionSubmitting || !hasContent}
              className="btn"
              title="Submit (Ctrl+Enter)"
              style={{
                width: 34,
                height: 34,
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                background: (sessionSubmitting || !hasContent) ? "var(--color-bg-elevated)" : callerColor,
                borderColor: (sessionSubmitting || !hasContent) ? "var(--color-border)" : callerColor,
                color: "#fff",
                opacity: (sessionSubmitting || !hasContent) ? 0.4 : 1,
                cursor: (sessionSubmitting || !hasContent) ? "not-allowed" : "pointer",
                pointerEvents: (sessionSubmitting || !hasContent) ? "none" : "auto",
              }}
            >
              {sessionSubmitting ? (
                <Icon name="spinner" size={15} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <Icon name="send" size={15} />
              )}
            </button>
          </div>
        </div>
      )}

      {isReadonly && (
        <div className="readonly-status-bar flex items-center justify-center py-3 shrink-0" style={{ color: activeSession?.status === "cancelled" ? "#ef4444" : "var(--color-text-muted)", fontSize: 12 }}>
          {activeSession?.status === "cancelled" ? (
            <Icon name="close" size={14} color="#ef4444" strokeWidth={2.5} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
          ) : (
            <Icon name="check" size={14} color="var(--color-success)" strokeWidth={2.5} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
          )}
          {activeSession?.status === "cancelled"
            ? t("session.cancelled", "Client disconnected — session cancelled")
            : "Feedback already submitted (read-only)"}
        </div>
      )}
    </div>
  );
}
