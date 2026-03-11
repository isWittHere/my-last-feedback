import { useRef, useState, useCallback } from "react";
import { useFeedbackStore } from "../store/feedbackStore";
import { useShallow } from "zustand/react/shallow";
import { useTranslation } from "react-i18next";
import { IdenticonAvatar } from "./IdenticonAvatar";

interface CallerTabsProps {
  columnCount?: number;
}

export function CallerTabs({ columnCount }: CallerTabsProps = {}) {
  const { t } = useTranslation();
  const { callers, callerOrder, activeCallerId, setActiveCaller, setCallerOrder, blinkingCallerIds, sessions, hiddenCallerIds } = useFeedbackStore(useShallow((s) => ({
    callers: s.callers,
    callerOrder: s.callerOrder,
    activeCallerId: s.activeCallerId,
    setActiveCaller: s.setActiveCaller,
    setCallerOrder: s.setCallerOrder,
    blinkingCallerIds: s.unreadCallerIds,
    sessions: s.sessions,
    hiddenCallerIds: s.hiddenCallerIds,
  })));

  const [dropIndex, _setDropIndex] = useState<number | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const setDropIndex = (v: number | null) => { dropIndexRef.current = v; _setDropIndex(v); };
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoveredCallerId, setHoveredCallerId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragSrcId = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** Snapshot of each tab's original left-edge & width (before transforms) */
  const tabRectsRef = useRef<{ left: number; width: number }[]>([]);

  if (callers.length === 0) return null;

  const allOrderedCallers = callerOrder.length > 0
    ? callerOrder.map(id => callers.find(c => c.id === id)).filter(Boolean) as typeof callers
    : callers;

  // Filter out hidden callers from tab display
  const orderedCallers = allOrderedCallers.filter(c => !hiddenCallerIds.includes(c.id));

  if (orderedCallers.length === 0) return null;

  const showDivider = columnCount != null && columnCount > 0 && columnCount < orderedCallers.length;
  const srcIndex = draggingId ? orderedCallers.findIndex(c => c.id === draggingId) : -1;

  const handleDragStart = (e: React.DragEvent, callerId: string) => {
    dragSrcId.current = callerId;
    setDraggingId(callerId);
    setHoveredCallerId(null);
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", callerId);
    // Snapshot tab positions before any transforms
    if (containerRef.current) {
      const buttons = containerRef.current.querySelectorAll<HTMLElement>(".caller-tab");
      tabRectsRef.current = Array.from(buttons).map(btn => {
        const r = btn.getBoundingClientRect();
        return { left: r.left, width: r.width };
      });
    }
    // Use a transparent drag image to hide the default ghost
    const ghost = document.createElement("div");
    ghost.style.opacity = "0";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => ghost.remove());
  };

  /** Container-level dragOver: calculate drop index from mouse X vs snapshotted tab positions */
  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rects = tabRectsRef.current;
    if (rects.length === 0) return;
    const mouseX = e.clientX;
    // Find insertion point based on original (pre-transform) positions
    let insertAt = rects.length; // default: after last tab
    for (let i = 0; i < rects.length; i++) {
      const midX = rects[i].left + rects[i].width / 2;
      if (mouseX < midX) {
        insertAt = i;
        break;
      }
    }
    setDropIndex(insertAt);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragEnd = () => {
    const srcId = dragSrcId.current;
    const currentDropIndex = dropIndexRef.current;
    dragSrcId.current = null;
    setDraggingId(null);
    setDropIndex(null);
    if (!srcId || currentDropIndex == null) return;

    const order = [...(callerOrder.length > 0 ? callerOrder : callers.map(c => c.id))];
    const srcIdx = order.indexOf(srcId);
    if (srcIdx === -1) return;

    order.splice(srcIdx, 1);
    const adjustedIdx = currentDropIndex > srcIdx ? currentDropIndex - 1 : currentDropIndex;
    order.splice(adjustedIdx, 0, srcId);
    setCallerOrder(order);
  };

  /** Compute translateX using snapshotted pixel positions for accurate animation */
  const getTranslateX = (index: number): number => {
    if (srcIndex === -1 || dropIndex == null) return 0;
    const rects = tabRectsRef.current;
    if (rects.length !== orderedCallers.length) return 0;

    const effectiveDrop = dropIndex > srcIndex ? dropIndex - 1 : dropIndex;

    // Build target slot mapping: current DOM index → visual slot index
    let targetSlot = index;
    if (index === srcIndex) {
      targetSlot = effectiveDrop;
    } else if (srcIndex < effectiveDrop) {
      if (index > srcIndex && index <= effectiveDrop) targetSlot = index - 1;
    } else if (srcIndex > effectiveDrop) {
      if (index >= effectiveDrop && index < srcIndex) targetSlot = index + 1;
    }

    // Use actual pixel positions from snapshot for precise offset
    return rects[targetSlot].left - rects[index].left;
  };

  // Build render items: tabs with divider in flex flow
  const renderItems: React.ReactNode[] = [];
  orderedCallers.forEach((caller, index) => {
    // Insert divider before the tab at columnCount position
    if (showDivider && index === columnCount) {
      renderItems.push(
        <div
          key="__divider__"
          style={{
            width: 1,
            height: 18,
            background: "var(--color-border)",
            margin: "0 3px",
            flexShrink: 0,
          }}
        />
      );
    }

        const isColumn = columnCount ? index < columnCount : caller.id === activeCallerId;
    const aliasKey = caller.alias || caller.name;
    const isDragging = draggingId === caller.id;
    const tx = getTranslateX(index);
    const isHovered = hoveredCallerId === caller.id;

    // Get workspace path from the most recent session for this caller
    const callerSessions = sessions.filter(s => s.callerId === caller.id);
    const latestSession = callerSessions[callerSessions.length - 1];
    const workspace = latestSession?.projectDirectory || "";

    renderItems.push(
      <button
        key={caller.id}
        draggable
        onDragStart={(e) => handleDragStart(e, caller.id)}
        onDragEnd={handleDragEnd}
        onClick={() => setActiveCaller(caller.id)}
        onMouseEnter={() => {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = setTimeout(() => setHoveredCallerId(caller.id), 400);
        }}
        onMouseLeave={() => {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
          setHoveredCallerId(null);
        }}
        className="caller-tab"
        style={{
          background: isDragging ? `${caller.color}cc` : `${caller.color}22`,
          borderColor: isDragging ? caller.color : isColumn ? caller.color : "transparent",
          cursor: isDragging ? "grabbing" : "grab",
          opacity: 1,
          boxShadow: isDragging ? `0 0 8px ${caller.color}88` : "none",
          transform: `translateX(${tx}px)`,
          transition: draggingId ? "transform 0.2s ease, opacity 0.15s" : "none",
          margin: "0 1.5px",
          zIndex: isDragging ? 10 : isHovered ? 20 : 1,
        }}
      >
        <IdenticonAvatar alias={aliasKey} color={caller.color} size={16} />
        {caller.pendingCount > 0 && (
          caller.pendingCount > 4 ? (
            <span className={`caller-tab-badge-num${blinkingCallerIds.includes(caller.id) ? " caller-tab-badge-new" : ""}`}>{caller.pendingCount}</span>
          ) : (
            <span className="caller-tab-badges">
              {Array.from({ length: caller.pendingCount }, (_, i) => (
                <span key={i} className={`caller-tab-badge${blinkingCallerIds.includes(caller.id) ? " caller-tab-badge-new" : ""}`} />
              ))}
            </span>
          )
        )}
        {isHovered && (
          <div className="caller-tab-tooltip">
            <div className="caller-tab-tooltip-name" style={{ color: caller.color }}>{caller.name}</div>
            {caller.alias && (
              <div className="caller-tab-tooltip-row">
                <span className="caller-tab-tooltip-label">{t("tooltip.alias")}</span>
                <span style={{ fontFamily: "'Cascadia Code', 'Consolas', 'SF Mono', 'Monaco', monospace" }}>{caller.alias}</span>
              </div>
            )}
            {caller.clientName && (
              <div className="caller-tab-tooltip-row">
                <span className="caller-tab-tooltip-label">{t("tooltip.client")}</span>
                <span>{caller.clientName}</span>
              </div>
            )}
            {workspace && (
              <div className="caller-tab-tooltip-row">
                <span className="caller-tab-tooltip-label">{t("tooltip.workspace")}</span>
                <span className="caller-tab-tooltip-path">{workspace}</span>
              </div>
            )}
            {caller.version && (
              <div className="caller-tab-tooltip-row">
                <span className="caller-tab-tooltip-label">{t("tooltip.version")}</span>
                <span>{caller.version}</span>
              </div>
            )}
          </div>
        )}
      </button>
    );
  });

  return (
    <div
      ref={containerRef}
      className="flex items-center"
      style={{ gap: 0 }}
      onDragOver={handleContainerDragOver}
      onDrop={handleDrop}
    >
      {renderItems}
    </div>
  );
}
