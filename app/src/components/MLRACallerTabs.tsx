import { useRef, useState, useCallback } from "react";
import { useMLRAStore, ROLE_COLORS, resolveRuntimeRoleSlotKey } from "../store/mlraStore";
import { IdenticonAvatar } from "./IdenticonAvatar";

interface MLRACallerTabsProps {
  columnCount?: number;
}

interface RoleTabDef {
  id: string;
  label: string;
  color: string;
}

/**
 * MLRA role tabs — reuses CallerTabs drag-to-reorder pattern.
 * Shows 3 runtime role tabs for expert / inspector / ceo.
 */
export function MLRACallerTabs({ columnCount }: MLRACallerTabsProps = {}) {
  const columnOrder = useMLRAStore((s) => s.columnOrder);
  const setColumnOrder = useMLRAStore((s) => s.setColumnOrder);
  const activeLauncher = useMLRAStore((s) => s.getActiveLauncher());
  const phaseView = useMLRAStore((s) => s.phaseView);

  const [dropIndex, _setDropIndex] = useState<number | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const setDropIndex = (v: number | null) => { dropIndexRef.current = v; _setDropIndex(v); };
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragSrcId = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRectsRef = useRef<{ left: number; width: number }[]>([]);
  const didDragRef = useRef(false);
  const pointerStartX = useRef(0);

  const phaseTabs: RoleTabDef[] = [
    { id: "expert", label: "Expert", color: phaseView === "planning" ? ROLE_COLORS["planning-expert"] : ROLE_COLORS["execution-expert"] },
    { id: "inspector", label: "Inspector", color: phaseView === "planning" ? ROLE_COLORS["planning-inspector"] : ROLE_COLORS["execution-inspector"] },
    { id: "ceo", label: "CEO", color: ROLE_COLORS.ceo },
  ];
  const defaultOrder = phaseTabs.map((t) => t.id);

  // ── Drag handlers (all hooks must be before any early return) ──

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragSrcId.current) return;
    e.stopPropagation();
    if (!didDragRef.current) {
      if (Math.abs(e.clientX - pointerStartX.current) < 3) return;
      didDragRef.current = true;
      setDraggingId(dragSrcId.current);
      setHoveredTabId(null);
      if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    }
    const rects = tabRectsRef.current;
    if (rects.length === 0) return;
    const mouseX = e.clientX;
    let insertAt = rects.length;
    for (let i = 0; i < rects.length; i++) {
      const midX = rects[i].left + rects[i].width / 2;
      if (mouseX < midX) { insertAt = i; break; }
    }
    setDropIndex(insertAt);
  }, []);

  const handlePointerUp = useCallback((_e: React.PointerEvent) => {
    const srcId = dragSrcId.current;
    const wasDrag = didDragRef.current;
    const currentDropIndex = dropIndexRef.current;
    dragSrcId.current = null;
    didDragRef.current = false;
    setDraggingId(null);
    setDropIndex(null);

    if (!srcId || !wasDrag || currentDropIndex == null) return;

    const currentOrder = [...((columnOrder.length > 0 ? columnOrder : defaultOrder).filter((item) => defaultOrder.includes(item)))];
    const srcIdx = currentOrder.indexOf(srcId);
    if (srcIdx === -1) return;

    currentOrder.splice(srcIdx, 1);
    const adjustedIdx = currentDropIndex > srcIdx ? currentDropIndex - 1 : currentDropIndex;
    currentOrder.splice(adjustedIdx, 0, srcId);
    setColumnOrder(currentOrder);
  }, [columnOrder, defaultOrder, setColumnOrder]);

  // ── Early return AFTER all hooks ──
  if (!activeLauncher || activeLauncher.status === "configuring") return null;

  const order = columnOrder.length > 0
    ? columnOrder.filter((id) => phaseTabs.some((t) => t.id === id))
    : defaultOrder;
  const orderedTabs = order
    .map((id) => phaseTabs.find((t) => t.id === id))
    .filter(Boolean) as RoleTabDef[];

  const showDivider = columnCount != null && columnCount > 0 && columnCount < orderedTabs.length;
  const srcIndex = draggingId ? orderedTabs.findIndex((t) => t.id === draggingId) : -1;

  // Determine status for each role
  const getSlotStatus = (roleId: string): string | null => {
    if (!activeLauncher) return null;
    const slotKey = resolveRuntimeRoleSlotKey(roleId as "expert" | "inspector" | "ceo", phaseView);
    const slot = activeLauncher.agents[slotKey as keyof typeof activeLauncher.agents];
    if (!slot || Array.isArray(slot)) return null;
    return slot.status ?? null;
  };

  const handlePointerDown = (e: React.PointerEvent, tabId: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragSrcId.current = tabId;
    didDragRef.current = false;
    pointerStartX.current = e.clientX;
    if (containerRef.current) {
      const buttons = containerRef.current.querySelectorAll<HTMLElement>(".caller-tab");
      tabRectsRef.current = Array.from(buttons).map((btn) => {
        const r = btn.getBoundingClientRect();
        return { left: r.left, width: r.width };
      });
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const getTranslateX = (index: number): number => {
    if (srcIndex === -1 || dropIndex == null) return 0;
    const rects = tabRectsRef.current;
    if (rects.length !== orderedTabs.length) return 0;

    const effectiveDrop = dropIndex > srcIndex ? dropIndex - 1 : dropIndex;
    let targetSlot = index;
    if (index === srcIndex) {
      targetSlot = effectiveDrop;
    } else if (srcIndex < effectiveDrop) {
      if (index > srcIndex && index <= effectiveDrop) targetSlot = index - 1;
    } else if (srcIndex > effectiveDrop) {
      if (index >= effectiveDrop && index < srcIndex) targetSlot = index + 1;
    }
    return rects[targetSlot].left - rects[index].left;
  };

  // ── Render ──

  const renderItems: React.ReactNode[] = [];
  orderedTabs.forEach((tab, index) => {
    if (showDivider && index === columnCount) {
      renderItems.push(
        <div
          key="__divider__"
          style={{ width: 1, height: 18, background: "var(--color-border)", margin: "0 3px", flexShrink: 0 }}
        />
      );
    }

    const isDragging = draggingId === tab.id;
    const tx = getTranslateX(index);
    const isHovered = hoveredTabId === tab.id;
    const status = getSlotStatus(tab.id);

    renderItems.push(
      <button
        key={tab.id}
        onPointerDown={(e) => handlePointerDown(e, tab.id)}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => {
          handlePointerUp(e);
        }}
        onMouseEnter={() => {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = setTimeout(() => setHoveredTabId(tab.id), 400);
        }}
        onMouseLeave={() => {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
          setHoveredTabId(null);
        }}
        className="caller-tab"
        style={{
          background: isDragging ? `${tab.color}cc` : `${tab.color}22`,
          borderColor: isDragging ? tab.color : `${tab.color}66`,
          cursor: isDragging ? "grabbing" : "grab",
          opacity: status === "standby" ? 0.5 : 1,
          boxShadow: isDragging ? `0 0 8px ${tab.color}88` : "none",
          transform: `translateX(${tx}px)`,
          transition: draggingId ? "transform 0.2s ease, opacity 0.15s" : "none",
          margin: "0 1.5px",
          zIndex: isDragging ? 10 : isHovered ? 20 : 1,
        }}
      >
        <IdenticonAvatar alias={tab.label} color={tab.color} size={16} />
        {isHovered && (
          <div className="caller-tab-tooltip">
            <div className="caller-tab-tooltip-name" style={{ color: tab.color }}>{tab.label}</div>
            <div className="caller-tab-tooltip-row">
              <span className="caller-tab-tooltip-label">状态</span>
              <span>{status === "active" ? "活跃" : status === "standby" ? "待命" : "空闲"}</span>
            </div>
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
      onPointerMove={handlePointerMove}
    >
      {renderItems}
    </div>
  );
}
