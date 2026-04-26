import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  useFeedbackStore,
  type DockColumnId,
  type DockTabId,
  type DockTabBarPosition,
} from "../store/feedbackStore";
import { Icon, MlcLogoIcon } from "./Icons";
import { MlcSidePanel } from "./MlcSidePanel";
import { MlcPreviewPanel } from "./MlcPreviewPanel";
import { ProjectResourcePanel } from "./ProjectResourcePanel";

const DOCK_COLUMN_LABELS: Record<DockColumnId, string> = {
  leftSidebar: "Left sidebar",
  leftPage: "Left page panel",
  rightSidebar: "Right sidebar",
};

function isDockColumnId(value: string | undefined): value is DockColumnId {
  return value === "leftSidebar" || value === "leftPage" || value === "rightSidebar";
}

function getDockColumnIdAtPoint(clientX: number, clientY: number): DockColumnId | null {
  const targetElement = document.elementFromPoint(clientX, clientY);
  const targetColumnId = targetElement?.closest<HTMLElement>("[data-dock-column-id]")?.dataset.dockColumnId;
  return isDockColumnId(targetColumnId) ? targetColumnId : null;
}

function dockTabLabel(tabId: DockTabId, translate: (key: string, defaultValue: string) => string): string {
  if (tabId === "mlc") return translate("mlc.title", "My Last Chat");
  if (tabId === "mlcPreview") return translate("mlcPreview.title", "MLC Preview");
  return translate("resources.title", "Project resources");
}

function dockTabIcon(tabId: DockTabId): ReactNode {
  if (tabId === "mlc") return <MlcLogoIcon size={16} />;
  if (tabId === "mlcPreview") return <Icon name="file-text" size={16} />;
  return <Icon name="folder" size={16} />;
}

function isDockTabId(value: string): value is DockTabId {
  return value === "mlc" || value === "resources" || value === "mlcPreview";
}

function dockColumnTargetIcon(columnId: DockColumnId): ReactNode {
  if (columnId === "leftSidebar") return <Icon name="sidebar" size={15} style={{ transform: "scaleX(-1)" }} />;
  if (columnId === "leftPage") return <Icon name="page-sidebar" size={15} />;
  return <Icon name="sidebar" size={15} />;
}

function DockTabContent({ tabId }: { tabId: DockTabId | null }) {
  if (tabId === "mlc") return <MlcSidePanel />;
  if (tabId === "resources") return <ProjectResourcePanel />;
  if (tabId === "mlcPreview") return <MlcPreviewPanel />;
  return null;
}

export function DockColumn({ columnId }: { columnId: DockColumnId }) {
  const { t } = useTranslation();
  const column = useFeedbackStore((state) => state.dockLayout.columns[columnId]);
  const draggingDockTab = useFeedbackStore((state) => state.draggingDockTab);
  const focusedComposer = useFeedbackStore((state) => state.focusedComposer);
  const activeWorkspacePath = useFeedbackStore((state) => state.mlcActiveWorkspacePath);
  const setActiveWorkspacePath = useFeedbackStore((state) => state.setMlcActiveWorkspacePath);
  const setDockColumnWidth = useFeedbackStore((state) => state.setDockColumnWidth);
  const setDockColumnTabBarPosition = useFeedbackStore((state) => state.setDockColumnTabBarPosition);
  const setDockActiveTab = useFeedbackStore((state) => state.setDockActiveTab);
  const moveDockTabToColumn = useFeedbackStore((state) => state.moveDockTabToColumn);
  const startDraggingDockTab = useFeedbackStore((state) => state.startDraggingDockTab);
  const updateDraggingDockTab = useFeedbackStore((state) => state.updateDraggingDockTab);
  const finishDraggingDockTab = useFeedbackStore((state) => state.finishDraggingDockTab);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const pointerDragRef = useRef<{ tabId: DockTabId; startX: number; startY: number; dragging: boolean } | null>(null);
  const suppressClickTabRef = useRef<DockTabId | null>(null);
  const tabBarMenuRef = useRef<HTMLDivElement>(null);
  const [tabBarMenu, setTabBarMenu] = useState<{ left: number; top: number; tabId: DockTabId } | null>(null);

  useEffect(() => {
    if (focusedComposer?.projectDirectory && !activeWorkspacePath) {
      setActiveWorkspacePath(focusedComposer.projectDirectory);
    }
  }, [activeWorkspacePath, focusedComposer?.projectDirectory, setActiveWorkspacePath]);

  useEffect(() => {
    if (!tabBarMenu) return;
    const handlePointerDown = (event: globalThis.MouseEvent) => {
      if (tabBarMenuRef.current?.contains(event.target as Node)) return;
      setTabBarMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTabBarMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [tabBarMenu]);

  const visualPosition = columnId === "rightSidebar" ? "right" : "left";

  const handleResizeMouseDown = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    resizeRef.current = { startX: event.clientX, startWidth: column.width };

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const resize = resizeRef.current;
      if (!resize) return;
      const delta = visualPosition === "right" ? resize.startX - moveEvent.clientX : moveEvent.clientX - resize.startX;
      setDockColumnWidth(columnId, resize.startWidth + delta);
    };
    const handleMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [column.width, columnId, setDockColumnWidth, visualPosition]);

  const handleDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    const tabId = draggingDockTab?.tabId || event.dataTransfer.getData("text/plain") as DockTabId;
    if (isDockTabId(tabId)) moveDockTabToColumn(tabId, columnId);
    finishDraggingDockTab();
  }, [columnId, draggingDockTab?.tabId, finishDraggingDockTab, moveDockTabToColumn]);

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleTabContextMenu = useCallback((event: ReactMouseEvent, tabId: DockTabId) => {
    event.preventDefault();
    setTabBarMenu({
      tabId,
      left: Math.min(Math.max(8, event.clientX), Math.max(8, window.innerWidth - 208)),
      top: Math.min(Math.max(8, event.clientY), Math.max(8, window.innerHeight - 164)),
    });
  }, []);

  const setPanelTabBarPosition = useCallback((position: DockTabBarPosition) => {
    setDockColumnTabBarPosition(columnId, position);
    setTabBarMenu(null);
  }, [columnId, setDockColumnTabBarPosition]);

  const switchTab = useCallback((tabId: DockTabId) => {
    setDockActiveTab(columnId, tabId);
    if (focusedComposer?.projectDirectory) setActiveWorkspacePath(focusedComposer.projectDirectory);
  }, [columnId, focusedComposer?.projectDirectory, setActiveWorkspacePath, setDockActiveTab]);

  const moveMenuTab = useCallback((targetColumnId: DockColumnId) => {
    if (!tabBarMenu) return;
    moveDockTabToColumn(tabBarMenu.tabId, targetColumnId);
    setTabBarMenu(null);
  }, [moveDockTabToColumn, tabBarMenu]);

  const handleTabPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>, tabId: DockTabId) => {
    if (event.button !== 0) return;
    pointerDragRef.current = { tabId, startX: event.clientX, startY: event.clientY, dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handleTabPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pointerDrag = pointerDragRef.current;
    if (!pointerDrag) return;
    const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
    if (!pointerDrag.dragging && distance >= 4) {
      pointerDrag.dragging = true;
      startDraggingDockTab(pointerDrag.tabId, columnId, event.clientX, event.clientY, getDockColumnIdAtPoint(event.clientX, event.clientY));
      document.body.style.cursor = "grabbing";
    }
    if (pointerDrag.dragging) {
      updateDraggingDockTab(event.clientX, event.clientY, getDockColumnIdAtPoint(event.clientX, event.clientY));
      event.preventDefault();
    }
  }, [columnId, startDraggingDockTab, updateDraggingDockTab]);

  const handleTabPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pointerDrag = pointerDragRef.current;
    if (!pointerDrag) return;
    pointerDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!pointerDrag.dragging) {
      switchTab(pointerDrag.tabId);
      return;
    }

    const targetColumnId = getDockColumnIdAtPoint(event.clientX, event.clientY);
    if (targetColumnId) moveDockTabToColumn(pointerDrag.tabId, targetColumnId);
    document.body.style.cursor = "";
    suppressClickTabRef.current = pointerDrag.tabId;
    window.setTimeout(() => { suppressClickTabRef.current = null; }, 0);
    finishDraggingDockTab();
    event.preventDefault();
    event.stopPropagation();
  }, [finishDraggingDockTab, moveDockTabToColumn, switchTab]);

  const handleTabPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointerDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.style.cursor = "";
    finishDraggingDockTab();
  }, [finishDraggingDockTab]);

  const renderTab = (tabId: DockTabId) => {
    const isActive = column.activeTabId === tabId;
    const label = dockTabLabel(tabId, t);
    return (
      <div
        key={tabId}
        className={`dock-tab-drag-host${draggingDockTab?.tabId === tabId ? " dock-tab-dragging" : ""}`}
        onPointerDown={(event) => handleTabPointerDown(event, tabId)}
        onPointerMove={handleTabPointerMove}
        onPointerUp={handleTabPointerUp}
        onPointerCancel={handleTabPointerCancel}
      >
        <button
          type="button"
          draggable={false}
          className={`mlc-panel-icon-tab${isActive ? " active" : ""}`}
          role="tab"
          aria-selected={isActive}
          aria-label={label}
          onClick={() => {
            if (suppressClickTabRef.current === tabId) return;
            switchTab(tabId);
          }}
          onContextMenu={(event) => handleTabContextMenu(event, tabId)}
        >
          {dockTabIcon(tabId)}
          <span className="mlc-panel-tab-hover-tip" role="tooltip">{label}</span>
        </button>
      </div>
    );
  };

  const renderPanelTabBar = () => (
    <div className={`mlc-panel-header mlc-panel-icon-tabs-row ${column.tabBarPosition}`}>
      <div className="mlc-panel-icon-tabs" role="tablist" aria-label={t("mlc.panelTabs", "Side panel tabs")}>{column.tabIds.map(renderTab)}</div>
    </div>
  );

  if ((column.tabIds.length === 0 || column.collapsed) && !draggingDockTab) return null;

  const isDropTarget = draggingDockTab?.targetColumnId === columnId;

  if (column.tabIds.length === 0 || column.collapsed) {
    return (
      <aside
        className={`dock-column-drop-zone${isDropTarget ? " dock-column-drop-target" : ""}`}
        data-column-id={columnId}
        data-dock-column-id={columnId}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        aria-label={DOCK_COLUMN_LABELS[columnId]}
      >
        <div className="dock-column-target-icon" aria-hidden="true">{dockColumnTargetIcon(columnId)}</div>
      </aside>
    );
  }

  return (
    <aside
      className={`mlc-panel context-side-panel dock-column${isDropTarget ? " dock-column-drop-target" : ""}`}
      data-position={visualPosition}
      data-column-id={columnId}
      data-dock-column-id={columnId}
      data-tab-bar-position={column.tabBarPosition}
      style={{ width: column.width }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="mlc-resize-handle" onMouseDown={handleResizeMouseDown} />
      {draggingDockTab ? <div className="dock-column-target-icon dock-column-target-badge" aria-hidden="true">{dockColumnTargetIcon(columnId)}</div> : null}
      {column.tabBarPosition === "top" ? renderPanelTabBar() : null}
      <DockTabContent tabId={column.activeTabId} />
      {column.tabBarPosition === "bottom" ? renderPanelTabBar() : null}
      {tabBarMenu ? (
        <div ref={tabBarMenuRef} className="mlc-panel-tab-menu dock-tab-menu" style={{ left: tabBarMenu.left, top: tabBarMenu.top }} role="menu" onContextMenu={(event) => event.preventDefault()}>
          <button type="button" role="menuitem" onClick={() => moveMenuTab("leftSidebar")} disabled={columnId === "leftSidebar"}>
            <Icon name="sidebar" size={12} />
            <span>{t("dock.moveToLeftSidebar", "Move to left sidebar")}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => moveMenuTab("leftPage")} disabled={columnId === "leftPage"}>
            <Icon name="sidebar" size={12} />
            <span>{t("dock.moveToLeftPage", "Move to left page")}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => moveMenuTab("rightSidebar")} disabled={columnId === "rightSidebar"}>
            <Icon name="sidebar" size={12} style={{ transform: "scaleX(-1)" }} />
            <span>{t("dock.moveToRightSidebar", "Move to right sidebar")}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => setPanelTabBarPosition(column.tabBarPosition === "top" ? "bottom" : "top")}>
            <Icon name="arrow-down" size={12} style={column.tabBarPosition === "bottom" ? { transform: "rotate(180deg)" } : undefined} />
            <span>{column.tabBarPosition === "top" ? t("mlc.moveTabsBottom", "Move tabs to bottom") : t("mlc.moveTabsTop", "Move tabs to top")}</span>
          </button>
        </div>
      ) : null}
    </aside>
  );
}
