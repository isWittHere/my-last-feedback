import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../store/feedbackStore";
import { useShallow } from "zustand/react/shallow";
import { SummaryPanel } from "./SummaryPanel";
import { FeedbackInput } from "./FeedbackInput";
import { ImageAttachmentWidget } from "./ImageAttachmentWidget";
import { QuickActions } from "./QuickActions";
import { PromptButtons } from "./PromptButtons";
import { CallerTabs } from "./CallerTabs";
import { CallerPanel } from "./CallerPanel";
import { SettingsDialog } from "./SettingsDialog";
import { WelcomeHome } from "./WelcomeHome";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const PANEL_MIN_WIDTH = 520;
const IS_MACOS = navigator.userAgent.includes('Macintosh');

export function FeedbackApp() {
  const { t } = useTranslation();
  const appMode = useFeedbackStore((s) => s.appMode);
  const isPersistent = appMode === "persistent";
  const callers = useFeedbackStore((s) => s.callers);
  const callerOrder = useFeedbackStore((s) => s.callerOrder);
  const hiddenCallerIds = useFeedbackStore((s) => s.hiddenCallerIds);
  const activeCallerId = useFeedbackStore((s) => s.activeCallerId);

  // Window width tracking for responsive multi-column layout
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Visible callers (excluding hidden ones)
  const visibleCallers = useMemo(() => callers.filter(c => !hiddenCallerIds.includes(c.id)), [callers, hiddenCallerIds]);

  // ── Layout mode: auto / 1 / 2 / 3 ──
  const [layoutMode, setLayoutMode] = useState<"auto" | 1 | 2 | 3>("auto");
  const layoutModes: Array<"auto" | 1 | 2 | 3> = ["auto", 1, 2, 3];
  const cycleLayoutMode = useCallback(() => {
    setLayoutMode(prev => {
      const idx = layoutModes.indexOf(prev);
      return layoutModes[(idx + 1) % layoutModes.length];
    });
  }, []);

  // Dynamic parallel: how many columns can fit?
  const autoMaxColumns = Math.max(1, Math.floor(windowWidth / PANEL_MIN_WIDTH));
  const maxColumns = layoutMode === "auto" ? autoMaxColumns : layoutMode;
  const canMultiColumn = isPersistent && visibleCallers.length > 1 && maxColumns >= 2;

  // Column callers = first N from user-ordered list, excluding hidden ones
  const columnCallerIds = useMemo(() => {
    if (!isPersistent || visibleCallers.length <= 1) return [] as string[];
    const order = callerOrder.length > 0 ? callerOrder : callers.map(c => c.id);
    const visibleOrder = order.filter(id => !hiddenCallerIds.includes(id));
    return visibleOrder.slice(0, Math.min(visibleOrder.length, maxColumns));
  }, [callers, callerOrder, hiddenCallerIds, isPersistent, maxColumns, visibleCallers.length]);

  const columnCount = isPersistent && visibleCallers.length > 1 ? Math.min(visibleCallers.length, maxColumns) : 0;
  const useMultiColumn = canMultiColumn && columnCallerIds.length >= 2;

  // Sync columnCount to store so addSession can use it for auto-positioning
  const setVisibleColumnCount = useFeedbackStore((s) => s.setVisibleColumnCount);
  useEffect(() => {
    setVisibleColumnCount(columnCount);
  }, [columnCount, setVisibleColumnCount]);

  // ── Legacy mode fields ──
  const {
    requestName,
    feedbackText,
    testLogText,
    images,
    outputFile,
    commandLogs,
    isSubmitting,
    isSubmitted,
    setSubmitting,
    setSubmitted,
  } = useFeedbackStore(useShallow((s) => ({
    requestName: s.requestName,
    feedbackText: s.feedbackText,
    testLogText: s.testLogText,
    images: s.images,
    outputFile: s.outputFile,
    commandLogs: s.commandLogs,
    isSubmitting: s.isSubmitting,
    isSubmitted: s.isSubmitted,
    setSubmitting: s.setSubmitting,
    setSubmitted: s.setSubmitted,
  })));

  const [alwaysOnTop, setAlwaysOnTop] = useState(true);

  useEffect(() => {
    if (!isPersistent) {
      getCurrentWindow().setAlwaysOnTop(true);
    }
  }, [isPersistent]);

  const toggleAlwaysOnTop = useCallback(async () => {
    const next = !alwaysOnTop;
    await getCurrentWindow().setAlwaysOnTop(next);
    setAlwaysOnTop(next);
  }, [alwaysOnTop]);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Legacy mode: panel resize ──
  const containerRef = useRef<HTMLDivElement>(null);
  const [panelSizes, setPanelSizes] = useState([0.4, 0.4, 0.2]);
  const resizingRef = useRef<{ index: number; startY: number; startSizes: number[] } | null>(null);

  const handleMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      resizingRef.current = { index, startY: e.clientY, startSizes: [...panelSizes] };
      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizingRef.current || !containerRef.current) return;
        const { index: idx, startY, startSizes } = resizingRef.current;
        const containerH = containerRef.current.getBoundingClientRect().height;
        const delta = (ev.clientY - startY) / containerH;
        const newSizes = [...startSizes];
        const minSize = 0.08;
        newSizes[idx] = Math.max(minSize, startSizes[idx] + delta);
        newSizes[idx + 1] = Math.max(minSize, startSizes[idx + 1] - delta);
        const total = newSizes.reduce((a, b) => a + b, 0);
        setPanelSizes(newSizes.map((s) => s / total));
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
    [panelSizes]
  );

  // ── Legacy submit handler ──
  const handleSubmitLegacy = useCallback(
    async (quickAction?: string) => {
      if (isSubmitting || isSubmitted) return;
      setSubmitting(true);

      const sections: string[] = [];
      if (feedbackText.trim()) sections.push(`## User Feedback\n${feedbackText.trim()}`);
      if (quickAction) sections.push(`## User Requirement\n${quickAction}`);
      sections.push("## Reminder\nPlease use the interactive_feedback tool again after completing this operation.");
      if (testLogText.trim()) sections.push(`## Attachment: Test Logs\n${testLogText.trim()}`);
      const imageList = images.map((i) => ({ path: i.path, data_url: i.dataUrl }));
      if (imageList.length > 0) sections.push(`## Attachment: Images\n${imageList.length} image(s) attached, please review the accompanying image content.`);
      const finalFeedback = sections.join("\n\n");

      try {
        await invoke("submit_feedback", { outputFile, feedbackText: finalFeedback, commandLogs, images: imageList });
        setSubmitted(true);
      } catch (e) {
        console.error("Submit failed:", e);
        setSubmitting(false);
      }
    },
    [feedbackText, testLogText, images, outputFile, commandLogs, isSubmitting, isSubmitted, setSubmitting, setSubmitted]
  );

  // Legacy keyboard shortcut
  useEffect(() => {
    if (isPersistent) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        handleSubmitLegacy();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSubmitLegacy, isPersistent]);

  // Legacy mode: show success screen after submit
  if (!isPersistent && isSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4" style={{ background: "var(--color-bg-base)" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="16 8.5 10.5 15 8 12" /></svg>
        <span className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
          Feedback submitted successfully
        </span>
      </div>
    );
  }

  const displayRequestName = isPersistent ? "" : requestName;

  return (
    <div className="flex flex-col h-screen select-none" style={{ background: "var(--color-bg-base)" }}>
      {/* Content wrapper – blurred when settings overlay is open */}
      <div className={`flex flex-col flex-1 min-h-0${settingsOpen ? " content-blurred" : ""}`}>
      {/* Custom title bar */}
      <div
        data-tauri-drag-region
        className="relative flex items-center justify-between px-3 shrink-0 titlebar"
        style={{
          background: "var(--color-bg-surface)",
          borderBottom: "1px solid var(--color-border-subtle)",
          height: 34,
          cursor: "default",
          userSelect: "none",
          ...(IS_MACOS ? { paddingLeft: 78 } : {}),
        }}
      >
        {/* Left: title or request name */}
        <div data-tauri-drag-region className="flex items-center gap-2 min-w-0 flex-shrink-0 z-10" style={{ maxWidth: "30%" }}>
          <svg data-tauri-drag-region width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
            <path d="M4,3L11.995,3L11.995,4L4,4C3.45,4 3,4.45 3,5L3,10C3,10.55 3.45,11.001 4,11.001L6,11.001L6,13.001L8.75,11.001C8.75,11.001 10.744,11.001 12,11C12.265,11.001 12.52,10.895 12.707,10.708C12.895,10.52 13,10.266 13,10.001L13,5.004L14,5.004L14,10.017C14,11.115 13.115,12.008 12.017,12.017C10.625,12.029 9.012,12.042 9.012,12.042L6.59,13.81C5.93,14.291 5,13.82 5,13.001L5,12.001L4,12.001C2.9,12 2,11.1 2,10L2,5C2,3.9 2.9,3.001 4,3Z" fillRule="nonzero"/>
            <g transform="matrix(1,0,0,1,1.4995,1)"><path d="M12.364,0L14.5,2.137L7.637,9L5.5,9L5.5,6.864L12.364,0ZM13.086,2.137L12.364,1.414L6.5,7.278L6.5,8L7.223,8L13.086,2.137Z"/></g>
            <g transform="matrix(6.12323e-17,-1,1,6.12323e-17,-2,15)"><path d="M6,4.487C6,4.218 5.782,4 5.513,4C5.513,4 5.512,4 5.512,4C5.229,4 5,4.229 5,4.512C5,6.126 5,11 5,11L6,11L6,4.487Z"/></g>
          </svg>
          {displayRequestName ? (
            <span data-tauri-drag-region className="text-xs font-semibold truncate" style={{ color: "var(--color-text-primary)" }} title={displayRequestName}>
              {displayRequestName}
            </span>
          ) : (
            <span data-tauri-drag-region className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
              {t("app.title")}
            </span>
          )}
        </div>

        {/* Center: Caller tabs - always visible in persistent mode with multiple callers */}
        {isPersistent && visibleCallers.length > 1 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={IS_MACOS ? { left: 70 } : undefined}>
            <div className="pointer-events-auto">
              <CallerTabs columnCount={columnCount} />
            </div>
          </div>
        )}

        {/* Right: controls */}
        <div className="flex items-center gap-1 shrink-0 z-10 ml-auto">
          {isPersistent && visibleCallers.length > 1 && (
            <>
            <button onClick={() => useFeedbackStore.getState().sortCallersByName()} className="titlebar-btn" title={t("titlebar.sortByWorkspace")}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(-90deg)" }}>
                <line x1="4" y1="6" x2="14" y2="6" /><line x1="4" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="11" y2="18" />
                <polyline points="16 16 19 19 22 16" />
              </svg>
            </button>
            <LayoutModeButton layoutMode={layoutMode} onCycle={cycleLayoutMode} onSelect={setLayoutMode} />
            </>
          )}
          <button onClick={() => setSettingsOpen(true)} className="titlebar-btn" title={t("settings.title")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            onClick={toggleAlwaysOnTop}
            className={`titlebar-btn${alwaysOnTop ? " titlebar-btn-active" : ""}`}
            title={alwaysOnTop ? "Unpin" : "Pin on top"}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill={alwaysOnTop ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 4v6l-2 4v2h10v-2l-2-4V4" /><line x1="12" y1="16" x2="12" y2="22" /><line x1="8" y1="4" x2="16" y2="4" />
            </svg>
          </button>
          {!IS_MACOS && (
            <>
          <button onClick={() => getCurrentWindow().minimize()} className="titlebar-btn" title="Minimize">
            <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
          </button>
          <button onClick={() => getCurrentWindow().toggleMaximize()} className="titlebar-btn" title="Maximize">
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
          </button>
          <button onClick={() => getCurrentWindow().close()} className="titlebar-btn titlebar-close" title="Close">
            <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2"/><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.2"/></svg>
          </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {isPersistent ? (
          useMultiColumn ? (
            /* Multi-column: parallel CallerPanels for column callers */
            columnCallerIds.map((id) => (
              <CallerPanel key={id} callerId={id} />
            ))
          ) : columnCallerIds.length === 1 ? (
            /* Single column with multiple callers: show first from callerOrder */
            <CallerPanel key={columnCallerIds[0]} callerId={columnCallerIds[0]} />
          ) : activeCallerId ? (
            /* Single column: one CallerPanel for the active caller */
            <CallerPanel key={activeCallerId} callerId={activeCallerId} />
          ) : (
            /* No callers yet — show welcome page with key settings */
            <WelcomeHome />
          )
        ) : (
          /* Legacy mode */
          <>
            <div className="sidebar" />
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              <div ref={containerRef} className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden" style={{ gap: 0 }}>
                <div className="overflow-hidden flex flex-col panel-card" style={{ flex: `1 1 ${panelSizes[0] * 100}%`, minHeight: 48 }}>
                  <SummaryPanel />
                </div>
                <div className="resize-handle" onMouseDown={(e) => handleMouseDown(0, e)} />
                <div className="flex flex-col panel-card panel-feedback" style={{ flex: `1 1 ${panelSizes[1] * 100}%`, minHeight: 48 }}>
                  <FeedbackInput />
                </div>
                <div className="resize-handle" onMouseDown={(e) => handleMouseDown(1, e)} />
                <div className="flex flex-col panel-card panel-testlog" style={{ flex: `1 1 ${panelSizes[2] * 100}%`, minHeight: 36 }}>
                  <LegacyTestLogInput />
                </div>
              </div>
              <div className="flex flex-col gap-2 px-3 pb-2 pt-1 shrink-0">
                <ImageAttachmentWidget />
                <PromptButtons />
                <div className="flex items-center gap-2 flex-wrap">
                  <QuickActions onAction={handleSubmitLegacy} />
                  <div className="flex-1" />
                  <button
                    onClick={() => handleSubmitLegacy()}
                    disabled={isSubmitting}
                    className="btn btn-primary"
                    style={{
                      minHeight: 36, minWidth: 140, fontSize: 13,
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                      opacity: isSubmitting ? 0.65 : 1,
                      cursor: isSubmitting ? "not-allowed" : "pointer",
                    }}
                  >
                    {isSubmitting ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                    )}
                    {isSubmitting ? t("feedback.submitting") : t("feedback.submit")}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      </div>{/* end content-blurred wrapper */}

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/** Layout mode toggle button with click-to-cycle and hover dropdown */
type LayoutMode = "auto" | 1 | 2 | 3;

function LayoutModeButton({
  layoutMode,
  onCycle,
  onSelect,
}: {
  layoutMode: LayoutMode;
  onCycle: () => void;
  onSelect: (mode: LayoutMode) => void;
}) {
  const { t } = useTranslation();
  const [showDropdown, setShowDropdown] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleMouseEnter = () => {
    clearTimeout(hideTimer.current);
    setShowDropdown(true);
  };
  const handleMouseLeave = () => {
    hideTimer.current = setTimeout(() => setShowDropdown(false), 200);
  };

  const modeLabel = (m: LayoutMode) => {
    if (m === "auto") return t("titlebar.layoutAuto", "Auto");
    return `${m}`;
  };

  const modeIcon = (m: LayoutMode) => {
    // Simple column icons
    const cols = m === "auto" ? 0 : m;
    if (cols === 0) {
      // Auto: "A" label
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="11" fontWeight="bold" fontFamily="sans-serif">A</text>
        </svg>
      );
    }
    // Draw column dividers inside a rectangle
    const dividers: React.ReactNode[] = [];
    for (let i = 1; i < cols; i++) {
      const x = 3 + (18 / cols) * i;
      dividers.push(<line key={i} x1={x} y1="3" x2={x} y2="21" />);
    }
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        {dividers}
      </svg>
    );
  };

  const allModes: LayoutMode[] = ["auto", 1, 2, 3];

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={onCycle}
        className={`titlebar-btn${layoutMode !== "auto" ? " titlebar-btn-active" : ""}`}
        title={t("titlebar.layoutMode", "Layout: {{mode}}", { mode: modeLabel(layoutMode) })}
      >
        {modeIcon(layoutMode)}
      </button>
      {showDropdown && (
        <div className="layout-dropdown">
          {allModes.map((m) => (
            <button
              key={String(m)}
              className={`layout-dropdown-item${m === layoutMode ? " active" : ""}`}
              onClick={() => { onSelect(m); setShowDropdown(false); }}
            >
              {modeIcon(m)}
              <span>{modeLabel(m)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Legacy-only test log textarea */
function LegacyTestLogInput() {
  const { t } = useTranslation();
  const { testLogText, setTestLogText } = useFeedbackStore(useShallow((s) => ({
    testLogText: s.testLogText,
    setTestLogText: s.setTestLogText,
  })));

  return (
    <textarea
      value={testLogText}
      onChange={(e) => setTestLogText(e.target.value)}
      placeholder={t("testLog.placeholder")}
      className="input-area flex-1"
      style={{ minHeight: 0, height: "100%" }}
    />
  );
}
