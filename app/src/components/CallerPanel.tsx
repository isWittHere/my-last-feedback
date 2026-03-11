import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../store/feedbackStore";
import { useShallow } from "zustand/react/shallow";
import { CallerContext } from "./CallerContext";
import type { CallerOverride } from "./CallerContext";
import { SummaryPanel } from "./SummaryPanel";
import { FeedbackInput } from "./FeedbackInput";
import { ImageAttachmentWidget } from "./ImageAttachmentWidget";
import { QuickActions } from "./QuickActions";
import { PromptButtons } from "./PromptButtons";
import { Sidebar } from "./Sidebar";
import { invoke } from "@tauri-apps/api/core";
import { readText as readClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { useActiveCallerSession } from "./useActiveCallerSession";

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

/** Attachment tag bar: images + test log as compact tags */
function AttachmentTagBar({
  controls,
  fileInput,
  showTestLog,
  setShowTestLog,
  testLogRef,
  callerColor,
}: {
  controls: React.ReactNode;
  fileInput: React.ReactNode;
  showTestLog: boolean;
  setShowTestLog: (fn: (v: boolean) => boolean) => void;
  callerColor: string;
  testLogRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const { t } = useTranslation();
  const { session: activeSession } = useActiveCallerSession();
  const removeSessionImage = useFeedbackStore((s) => s.removeSessionImage);
  const clearSessionImages = useFeedbackStore((s) => s.clearSessionImages);
  const updateSessionField = useFeedbackStore((s) => s.updateSessionField);
  const images = activeSession?.images || [];
  const hasTestLog = !!(activeSession?.testLogText?.trim());
  const hasTags = images.length > 0 || hasTestLog || showTestLog;
  const tagAreaRef = useRef<HTMLDivElement>(null);

  const handleAttachLogClick = async () => {
    const wasHidden = !showTestLog;
    setShowTestLog((v) => !v);
    if (wasHidden && activeSession) {
      // Auto-paste clipboard text if > 50 chars and test log is empty
      if (!activeSession.testLogText?.trim()) {
        try {
          const text = await readClipboardText();
          if (text && text.length > 50) {
            updateSessionField(activeSession.id, "testLogText", text);
          }
        } catch { /* clipboard access denied or empty */ }
      }
      setTimeout(() => testLogRef.current?.focus(), 50);
    }
  };

  return (
    <div className="shrink-0">
      {/* Button row */}
      <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-0.5">
        {controls}
        <button
          className="btn"
          style={{
            fontSize: 11,
            padding: "3px 10px",
            background: showTestLog ? callerColor : undefined,
            borderColor: showTestLog ? callerColor : undefined,
            color: showTestLog ? "#fff" : undefined,
          }}
          onClick={handleAttachLogClick}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
          {t("testLog.attach", "附加日志")}
          {(activeSession?.testLogText?.length ?? 0) > 0 && (
            <span style={{ color: showTestLog ? "rgba(255,255,255,0.7)" : "var(--color-text-muted)", marginLeft: 2 }}>
              {activeSession!.testLogText!.length}
            </span>
          )}
        </button>
        {fileInput}
      </div>

      {/* Tag area */}
      {hasTags && (
        <div
          ref={tagAreaRef}
          className="flex flex-wrap gap-1 px-3 pb-1 overflow-y-auto"
          style={{ maxHeight: 78 /* ~3 lines of tags */ }}
        >
          {images.length > 0 && (
            <div
              className="attachment-tag attachment-tag-danger"
              onClick={() => activeSession && clearSessionImages(activeSession.id)}
              title={t("images.clearAll")}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
            </div>
          )}
          {images.map((img) => (
            <ImageTag
              key={img.path}
              img={img}
              onRemove={() => activeSession && removeSessionImage(activeSession.id, img.path)}
            />
          ))}
          {(hasTestLog || showTestLog) && (
            <TestLogTag
              showTestLog={showTestLog}
              setShowTestLog={setShowTestLog}
              testLogRef={testLogRef}
              testLogText={activeSession?.testLogText || ""}
              callerColor={callerColor}
            />
          )}
        </div>
      )}

      {/* Expanded test log editor */}
      {showTestLog && (
        <div
          className="px-3 pb-1"
        >
          <div
            className="rounded-lg"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-input)",
              maxHeight: 125,
              overflowY: "auto",
            }}
          >
            <TestLogInput ref={testLogRef} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Image tag with hover preview */
function ImageTag({ img, onRemove, readonly }: { img: import("../store/feedbackStore").ImageAttachment; onRemove: () => void; readonly?: boolean }) {
  const [showPreview, setShowPreview] = useState(false);
  const tagRef = useRef<HTMLDivElement>(null);
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number } | null>(null);
  const size = img.sizeKB >= 1024
    ? `${(img.sizeKB / 1024).toFixed(1)} MB`
    : `${img.sizeKB.toFixed(0)} KB`;

  const handleMouseEnter = () => {
    if (tagRef.current) {
      const rect = tagRef.current.getBoundingClientRect();
      // Show above the tag; clamp to viewport
      let top = rect.top - 6;
      let left = rect.left;
      // Will be adjusted after render (preview measured), but start here
      setPreviewPos({ top, left });
    }
    setShowPreview(true);
  };

  return (
    <div
      ref={tagRef}
      className="attachment-tag group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowPreview(false)}
    >
      {!readonly && (
        <button
          className="attachment-tag-remove"
          style={{ display: "inline-flex" }}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5"/><line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" strokeWidth="1.5"/></svg>
        </button>
      )}
      <img
        src={img.dataUrl}
        alt=""
        style={{ width: 14, height: 14, objectFit: "cover", borderRadius: 2, flexShrink: 0 }}
      />
      <span className="truncate" style={{ maxWidth: 80 }}>{img.name}</span>
      <span style={{ fontSize: 9, color: "var(--color-text-muted)", flexShrink: 0 }}>{size}</span>
      {readonly && (
        <button
          className="attachment-tag-copy"
          onClick={(e) => {
            e.stopPropagation();
            // Copy image data to clipboard
            fetch(img.dataUrl!)
              .then((r) => r.blob())
              .then((blob) => {
                const item = new ClipboardItem({ [blob.type]: blob });
                navigator.clipboard.write([item]);
              })
              .catch(() => navigator.clipboard.writeText(img.name));
          }}
          title="Copy image"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        </button>
      )}

      {/* Hover preview — fixed position to avoid overflow clipping */}
      {showPreview && previewPos && createPortal(
        <div
          className="attachment-preview"
          ref={(el) => {
            if (!el || !tagRef.current) return;
            const rect = tagRef.current.getBoundingClientRect();
            const ph = el.offsetHeight;
            const pw = el.offsetWidth;
            let top = rect.top - ph - 2;
            let left = rect.left;
            // Clamp to viewport
            if (top < 4) top = rect.bottom + 2;
            if (left + pw > window.innerWidth - 4) left = window.innerWidth - pw - 4;
            if (left < 4) left = 4;
            el.style.top = `${top}px`;
            el.style.left = `${left}px`;
          }}
          style={{
            position: "fixed",
            top: previewPos.top,
            left: previewPos.left,
            zIndex: 9999,
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            padding: 4,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            pointerEvents: "none",
          }}
        >
          <img
            src={img.dataUrl}
            alt={img.name}
            style={{ maxWidth: 300, maxHeight: 300, objectFit: "contain", borderRadius: 4 }}
          />
        </div>,
        document.body
      )}
    </div>
  );
}

/** Test log tag with hover preview */
function TestLogTag({
  showTestLog, setShowTestLog, testLogRef, testLogText, callerColor,
}: {
  showTestLog: boolean;
  setShowTestLog: (fn: (v: boolean) => boolean) => void;
  testLogRef: React.RefObject<HTMLTextAreaElement | null>;
  testLogText: string;
  callerColor: string;
}) {
  const { t } = useTranslation();
  const [showPreview, setShowPreview] = useState(false);
  const tagRef = useRef<HTMLButtonElement>(null);
  const previewText = testLogText.length > 500 ? testLogText.slice(0, 500) + "…" : testLogText;

  return (
    <button
      ref={tagRef}
      className="attachment-tag"
      style={{
        background: showTestLog ? callerColor : undefined,
        borderColor: showTestLog ? callerColor : "var(--color-border)",
        color: showTestLog ? "#fff" : "var(--color-text-secondary)",
      }}
      onClick={() => {
        setShowTestLog((v) => !v);
        if (!showTestLog) setTimeout(() => testLogRef.current?.focus(), 50);
      }}
      onMouseEnter={() => { if (!showTestLog && testLogText.trim()) setShowPreview(true); }}
      onMouseLeave={() => setShowPreview(false)}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
      {t("testLog.attach")}
      {testLogText.length > 0 && (
        <span style={{ fontSize: 9, color: showTestLog ? "rgba(255,255,255,0.7)" : "var(--color-text-muted)" }}>
          {testLogText.length}
        </span>
      )}

      {/* Hover preview — fixed position via portal */}
      {showPreview && createPortal(
        <div
          ref={(el) => {
            if (!el || !tagRef.current) return;
            const rect = tagRef.current.getBoundingClientRect();
            const ph = el.offsetHeight;
            const pw = el.offsetWidth;
            let top = rect.top - ph - 2;
            let left = rect.left;
            if (top < 4) top = rect.bottom + 2;
            if (left + pw > window.innerWidth - 4) left = window.innerWidth - pw - 4;
            if (left < 4) left = 4;
            el.style.top = `${top}px`;
            el.style.left = `${left}px`;
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: 9999,
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            padding: "6px 10px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            pointerEvents: "none",
            maxWidth: 400,
            maxHeight: 300,
            overflow: "hidden",
            fontSize: 11,
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            color: "var(--color-text-secondary)",
          }}
        >
          {previewText}
        </div>,
        document.body
      )}
    </button>
  );
}

/** Readonly tag bar for responded sessions — image tags with hover, test log tag with expandable preview */
function ReadonlyTagBar({ session }: { session: import("../store/feedbackStore").Session }) {
  const [showLog, setShowLog] = useState(false);
  const hasLog = session.testLogText.trim().length > 0;

  return (
    <div className="shrink-0">
      {/* Tag area */}
      <div className="flex flex-wrap gap-1 px-3 pt-1.5 pb-1 overflow-y-auto" style={{ maxHeight: 78 }}>
        {session.images.map((img) => (
          <ImageTag key={img.path} img={img} onRemove={() => {}} readonly />
        ))}
        {hasLog && (
          <ReadonlyLogTag
            testLogText={session.testLogText}
            expanded={showLog}
            onToggle={() => setShowLog((v) => !v)}
          />
        )}
      </div>
      {/* Expanded test log readonly */}
      {showLog && hasLog && (
        <div className="px-3 pb-1">
          <div
            className="rounded-lg"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-input)",
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            <pre
              className="text-xs px-2 py-1.5 m-0"
              style={{ color: "var(--color-text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-all", opacity: 0.7 }}
            >
              <RichText text={session.testLogText} />
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/** Readonly test log tag with hover preview */
function ReadonlyLogTag({ testLogText, expanded, onToggle }: { testLogText: string; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const [showPreview, setShowPreview] = useState(false);
  const tagRef = useRef<HTMLDivElement>(null);
  const previewText = testLogText.length > 500 ? testLogText.slice(0, 500) + "…" : testLogText;

  return (
    <div
      ref={tagRef}
      className="attachment-tag"
      style={{
        background: expanded ? "var(--color-bg-elevated)" : undefined,
        borderColor: expanded ? "var(--color-border-strong)" : "var(--color-border)",
        cursor: "pointer",
      }}
      onClick={onToggle}
      onMouseEnter={() => { if (!expanded && testLogText.trim()) setShowPreview(true); }}
      onMouseLeave={() => setShowPreview(false)}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
      {t("testLog.attach")}
      {testLogText.length > 0 && (
        <span style={{ fontSize: 9, color: "var(--color-text-muted)" }}>{testLogText.length}</span>
      )}
      <button
        className="attachment-tag-copy"
        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(testLogText); }}
        title="Copy log"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      </button>

      {showPreview && createPortal(
        <div
          ref={(el) => {
            if (!el || !tagRef.current) return;
            const rect = tagRef.current.getBoundingClientRect();
            const ph = el.offsetHeight;
            const pw = el.offsetWidth;
            let top = rect.top - ph - 2;
            let left = rect.left;
            if (top < 4) top = rect.bottom + 2;
            if (left + pw > window.innerWidth - 4) left = window.innerWidth - pw - 4;
            if (left < 4) left = 4;
            el.style.top = `${top}px`;
            el.style.left = `${left}px`;
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: 9999,
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            padding: "6px 10px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            pointerEvents: "none",
            maxWidth: 400,
            maxHeight: 300,
            overflow: "hidden",
            fontSize: 11,
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            color: "var(--color-text-secondary)",
          }}
        >
          {previewText}
        </div>,
        document.body
      )}
    </div>
  );
}

/** Render text with clickable links and color swatches */
function RichText({ text, style, className }: { text: string; style?: React.CSSProperties; className?: string }) {
  // Match URLs and hex/rgb color codes
  const parts = useMemo(() => {
    const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
    const COLOR_RE = /#(?:[0-9a-fA-F]{3}){1,2}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/g;
    // Combined regex
    const COMBINED = new RegExp(`(${URL_RE.source})|(${COLOR_RE.source})`, "g");

    const result: { type: "text" | "url" | "color"; value: string }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = COMBINED.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: "text", value: text.slice(lastIndex, match.index) });
      }
      if (match[1]) {
        result.push({ type: "url", value: match[1] });
      } else if (match[2]) {
        result.push({ type: "color", value: match[2] });
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      result.push({ type: "text", value: text.slice(lastIndex) });
    }
    return result;
  }, [text]);

  const handleLinkClick = useCallback((url: string) => {
    import("@tauri-apps/plugin-opener").then(({ openUrl }) => {
      openUrl(url);
    }).catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }, []);

  return (
    <span style={style} className={className}>
      {parts.map((part, i) => {
        if (part.type === "url") {
          return (
            <a
              key={i}
              href="#"
              onClick={(e) => { e.preventDefault(); handleLinkClick(part.value); }}
              style={{
                color: "var(--color-primary)",
                textDecoration: "underline",
                textDecorationColor: "rgba(var(--color-primary-rgb, 99,102,241), 0.4)",
                cursor: "pointer",
                wordBreak: "break-all",
              }}
              title={part.value}
            >
              {part.value}
            </a>
          );
        }
        if (part.type === "color") {
          return (
            <span key={i} style={{ whiteSpace: "nowrap" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  backgroundColor: part.value,
                  border: "1px solid var(--color-border)",
                  verticalAlign: "middle",
                  marginRight: 2,
                }}
              />
              <code style={{ fontSize: "inherit", color: "inherit" }}>{part.value}</code>
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </span>
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
  const hasContent = !!(sessionFeedback.trim() || sessionTestLog.trim() || sessionImageCount > 0 || hasQuestionAnswers);
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

  // Ctrl+Enter shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
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
              {(activeSession.images.length > 0 || activeSession.testLogText.trim()) && (
                <ReadonlyTagBar session={activeSession} />
              )}
              {/* Scrollable feedback text */}
              {activeSession.feedbackText && (
                <div className="flex-1 overflow-y-auto min-h-0 px-3 pb-2">
                  <div
                    style={{ fontSize: 13, color: "var(--color-text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-all", opacity: 0.7 }}
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
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" /></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              )}
            </button>
          </div>
        </div>
      )}

      {isReadonly && (
        <div className="flex items-center justify-center py-3 shrink-0" style={{ color: activeSession?.status === "cancelled" ? "#ef4444" : "var(--color-text-muted)", fontSize: 12 }}>
          {activeSession?.status === "cancelled" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }}><polyline points="20 6 9 17 4 12" /></svg>
          )}
          {activeSession?.status === "cancelled"
            ? t("session.cancelled", "Client disconnected — session cancelled")
            : "Feedback already submitted (read-only)"}
        </div>
      )}
    </div>
  );
}

/** Test log textarea */
const TestLogInput = forwardRef<HTMLTextAreaElement>(function TestLogInput(_props, forwardedRef) {
  const { t } = useTranslation();
  const { session: activeSession } = useActiveCallerSession();
  const { updateSessionField, addSessionImage } = useFeedbackStore(useShallow((s) => ({
    updateSessionField: s.updateSessionField,
    addSessionImage: s.addSessionImage,
  })));

  const value = activeSession?.testLogText || "";
  const isReadonly = activeSession?.status === "responded" || activeSession?.status === "cancelled";
  const internalRef = useRef<HTMLTextAreaElement>(null);

  const combinedRef = useCallback((el: HTMLTextAreaElement | null) => {
    (internalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    if (typeof forwardedRef === "function") forwardedRef(el);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  }, [forwardedRef]);

  useEffect(() => {
    if (internalRef.current) {
      internalRef.current.style.height = "auto";
      const h = Math.max(internalRef.current.scrollHeight, 50);
      internalRef.current.style.height = h + "px";
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (activeSession) {
      updateSessionField(activeSession.id, "testLogText", e.target.value);
    }
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items || !activeSession) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            const namedFile = new File([file], `clipboard_${Date.now()}.png`, { type: file.type });
            const reader = new FileReader();
            reader.onload = (ev) => {
              addSessionImage(activeSession.id, {
                path: `blob:clipboard:${Date.now()}`,
                name: namedFile.name,
                sizeKB: namedFile.size / 1024,
                dataUrl: ev.target?.result as string,
              });
            };
            reader.readAsDataURL(namedFile);
            e.preventDefault();
          }
        }
      }
    },
    [activeSession, addSessionImage]
  );

  return (
    <textarea
      ref={combinedRef}
      value={value}
      onChange={handleChange}
      onPaste={handlePaste}
      readOnly={isReadonly}
      placeholder={t("testLog.placeholder")}
      className="input-area"
      style={{
        minHeight: 50,
        overflow: "hidden",
        resize: "none",
        opacity: isReadonly ? 0.6 : 1,
        fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
        fontSize: 11,
        color: "var(--color-text-muted)",
      }}
    />
  );
});
