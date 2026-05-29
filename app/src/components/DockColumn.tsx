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
import { PreviewBrowserViewPanel } from "./PreviewBrowserViewPanel";
import { PreviewBrowserInfoPanel } from "./PreviewBrowserInfoPanel";
import { TerminalPanel } from "./TerminalPanel";
import { GitPanel } from "./GitPanel";
import { SubscriptionPanel } from "./SubscriptionPanel";
import { AgentConsolePanel } from "./agent/AgentConsolePanel";
import { AgentSessionManagerPanel } from "./agent/AgentSessionManagerPanel";
import { usePreviewBrowserStore } from "../store/previewBrowserStore";
import { isAgentUiDisabled } from "../agent/agentUiFlags";
import { getPanelTimeoutSettings, PANEL_TIMEOUT_SETTINGS_EVENT, type PanelTimeoutSettings } from "../panelTimeoutSettings";

const DOCK_COLUMN_LABELS: Record<DockColumnId, string> = {
  leftSidebar: "Left sidebar",
  leftPage: "Left page panel",
  rightPage: "Right page panel",
  rightSidebar: "Right sidebar",
};

function isDockColumnId(value: string | undefined): value is DockColumnId {
  return value === "leftSidebar" || value === "leftPage" || value === "rightPage" || value === "rightSidebar";
}

function getDockColumnIdAtPoint(clientX: number, clientY: number): DockColumnId | null {
  const targetElement = document.elementFromPoint(clientX, clientY);
  const targetColumnId = targetElement?.closest<HTMLElement>("[data-dock-column-id]")?.dataset.dockColumnId;
  return isDockColumnId(targetColumnId) ? targetColumnId : null;
}

function dockTabLabel(tabId: DockTabId, translate: (key: string, defaultValue: string) => string): string {
  if (tabId === "mlc") return translate("mlc.title", "My Last Chat");
  if (tabId === "mlcPreview") return translate("mlcPreview.title", "MLC Preview");
  if (tabId === "previewBrowser") return translate("previewBrowser.title", "Preview Browser");
  if (tabId === "previewInfo") return translate("previewBrowser.infoTitle", "Preview Info");
  if (tabId === "agentConsole") return isAgentUiDisabled ? "" : translate("agentConsole.title", "Agent Console");
  if (tabId === "agentSessions") return isAgentUiDisabled ? "" : translate("agentSessions.title", "Sessions");
  if (tabId === "terminal") return translate("terminal.title", "Terminal");
  if (tabId === "git") return translate("git.title", "Git");
  if (tabId === "subscriptions") return translate("subscriptions.title", "Subscriptions");
  return translate("resources.title", "Project resources");
}

function dockTabIcon(tabId: DockTabId): ReactNode {
  if (tabId === "mlc") return <MlcLogoIcon size={16} />;
  if (tabId === "mlcPreview") return <Icon name="file-text" size={16} />;
  if (tabId === "previewBrowser") return <Icon name="globe" size={16} />;
    if (tabId === "previewInfo") return <Icon name="code" size={16} />;
  if (tabId === "agentConsole") return isAgentUiDisabled ? null : <Icon name="robot" size={16} />;
    if (tabId === "agentSessions") return isAgentUiDisabled ? null : <Icon name="message" size={16} />;
  if (tabId === "terminal") return <Icon name="terminal" size={16} />;
  if (tabId === "git") return <Icon name="git-commit" size={16} />;
  if (tabId === "subscriptions") return <Icon name="dollar-sign" size={16} />;
  return <Icon name="folder" size={16} />;
}

function isDockTabId(value: string): value is DockTabId {
  if (value === "agentConsole" || value === "agentSessions") return !isAgentUiDisabled;
  return value === "mlc" || value === "resources" || value === "mlcPreview" || value === "previewBrowser" || value === "previewInfo" || value === "terminal" || value === "git" || value === "subscriptions";
}

function dockColumnTargetIcon(columnId: DockColumnId): ReactNode {
  if (columnId === "leftSidebar") return <Icon name="sidebar" size={15} style={{ transform: "scaleX(-1)" }} />;
  if (columnId === "leftPage") return <Icon name="page-sidebar" size={15} />;
  if (columnId === "rightPage") return <Icon name="page-sidebar" size={15} style={{ transform: "scaleX(-1)" }} />;
  return <Icon name="sidebar" size={15} />;
}

function DockTabContent({ tabId }: { tabId: DockTabId | null }) {
  if (tabId === "mlc") return <MlcSidePanel />;
  if (tabId === "resources") return <ProjectResourcePanel />;
  if (tabId === "mlcPreview") return <MlcPreviewPanel />;
  if (tabId === "previewBrowser") return <PreviewBrowserViewPanel />;
  if (tabId === "previewInfo") return <PreviewBrowserInfoPanel />;
  if (tabId === "agentConsole") return isAgentUiDisabled ? null : <AgentConsolePanel />;
  if (tabId === "agentSessions") return isAgentUiDisabled ? null : <AgentSessionManagerPanel />;
  if (tabId === "terminal") return <TerminalPanel />;
  if (tabId === "git") return <GitPanel />;
  if (tabId === "subscriptions") return <SubscriptionPanel />;
  return null;
}

export function DockColumn({ columnId }: { columnId: DockColumnId }) {
  const { t } = useTranslation();
  const column = useFeedbackStore((state) => state.dockLayout.columns[columnId]);
  const draggingDockTab = useFeedbackStore((state) => state.draggingDockTab);
  const focusedComposer = useFeedbackStore((state) => state.focusedComposer);
  const setActiveWorkspacePath = useFeedbackStore((state) => state.setMlcActiveWorkspacePath);
  const setDockColumnWidth = useFeedbackStore((state) => state.setDockColumnWidth);
  const setDockColumnCollapsed = useFeedbackStore((state) => state.setDockColumnCollapsed);
  const setDockColumnTabBarPosition = useFeedbackStore((state) => state.setDockColumnTabBarPosition);
  const setDockActiveTab = useFeedbackStore((state) => state.setDockActiveTab);
  const moveDockTabToColumn = useFeedbackStore((state) => state.moveDockTabToColumn);
  const startDraggingDockTab = useFeedbackStore((state) => state.startDraggingDockTab);
  const updateDraggingDockTab = useFeedbackStore((state) => state.updateDraggingDockTab);
  const finishDraggingDockTab = useFeedbackStore((state) => state.finishDraggingDockTab);
  const pushNativeWebViewBlocker = useFeedbackStore((state) => state.pushNativeWebViewBlocker);
  const popNativeWebViewBlocker = useFeedbackStore((state) => state.popNativeWebViewBlocker);
  const previewBrowserTabIds = usePreviewBrowserStore((state) => state.tabs.map((tab) => tab.id).join("\n"));
  const hidePreviewBrowserTab = usePreviewBrowserStore((state) => state.hideTab);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const pointerDragRef = useRef<{ tabId: DockTabId; startX: number; startY: number; dragging: boolean } | null>(null);
  const suppressClickTabRef = useRef<DockTabId | null>(null);
  const tabBarMenuRef = useRef<HTMLDivElement>(null);
  const [tabBarMenu, setTabBarMenu] = useState<{ left: number; top: number; tabId: DockTabId } | null>(null);

  const [panelTimeoutSettings, setPanelTimeoutSettings] = useState<PanelTimeoutSettings>(getPanelTimeoutSettings);
  const timeoutMs = panelTimeoutSettings.timeoutHours === 0 ? Infinity : panelTimeoutSettings.timeoutHours * 3600 * 1000;
  const [mountedTabIds, setMountedTabIds] = useState<Set<DockTabId>>(() => new Set(column.tabIds));
  const lastActiveRef = useRef<Map<DockTabId, number>>(new Map());

  useEffect(() => {
    const handleSettingsChanged = (event: Event) => {
      const detail = (event as CustomEvent<PanelTimeoutSettings>).detail;
      if (detail) setPanelTimeoutSettings(detail);
    };
    window.addEventListener(PANEL_TIMEOUT_SETTINGS_EVENT, handleSettingsChanged);
    return () => window.removeEventListener(PANEL_TIMEOUT_SETTINGS_EVENT, handleSettingsChanged);
  }, []);

  useEffect(() => {
    setMountedTabIds((prev) => {
      const next = new Set(prev);
      for (const tabId of column.tabIds) next.add(tabId);
      return next;
    });
  }, [column.tabIds]);

  useEffect(() => {
    if (!column.activeTabId) return;
    lastActiveRef.current.set(column.activeTabId, Date.now());
    setMountedTabIds((prev) => {
      if (prev.has(column.activeTabId!)) return prev;
      const next = new Set(prev);
      next.add(column.activeTabId!);
      return next;
    });
  }, [column.activeTabId]);

  useEffect(() => {
    if (timeoutMs === Infinity) return;
    const prune = () => {
      const now = Date.now();
      const activeTab = column.activeTabId;
      setMountedTabIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const tabId of next) {
          if (tabId === activeTab) continue;
          const lastActive = lastActiveRef.current.get(tabId) ?? 0;
          if (now - lastActive > timeoutMs) {
            next.delete(tabId);
            lastActiveRef.current.delete(tabId);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };
    const interval = setInterval(prune, 30000);
    return () => clearInterval(interval);
  }, [timeoutMs, column.activeTabId]);

  useEffect(() => {
    if (!tabBarMenu) return;
    const blockerKey = `dock-tab-menu-${columnId}`;
    pushNativeWebViewBlocker(blockerKey);
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
      popNativeWebViewBlocker(blockerKey);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [columnId, popNativeWebViewBlocker, pushNativeWebViewBlocker, tabBarMenu]);

  useEffect(() => {
    const ownsPreviewBrowser = column.tabIds.includes("previewBrowser");
    if (!ownsPreviewBrowser) return;
    const previewBrowserVisible = ownsPreviewBrowser && !column.collapsed && column.activeTabId === "previewBrowser";
    if (previewBrowserVisible) return;
    for (const tabId of previewBrowserTabIds.split("\n")) {
      if (tabId) void hidePreviewBrowserTab(tabId);
    }
  }, [column.activeTabId, column.collapsed, column.tabIds, hidePreviewBrowserTab, previewBrowserTabIds]);

  const visualPosition = columnId === "rightPage" || columnId === "rightSidebar" ? "right" : "left";

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
    const showFullLabel = column.tabIds.length === 1;
    return (
      <div
        key={tabId}
        className={`dock-tab-drag-host${showFullLabel ? " full-label" : ""}${draggingDockTab?.tabId === tabId ? " dock-tab-dragging" : ""}`}
        data-preview-overlay
        onPointerDown={(event) => handleTabPointerDown(event, tabId)}
        onPointerMove={handleTabPointerMove}
        onPointerUp={handleTabPointerUp}
        onPointerCancel={handleTabPointerCancel}
      >
        <button
          type="button"
          draggable={false}
          className={`mlc-panel-icon-tab${showFullLabel ? " full-label" : ""}${isActive ? " active" : ""}`}
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
          {showFullLabel ? <span className="mlc-panel-tab-label">{label}</span> : null}
          {!showFullLabel ? <span className="mlc-panel-tab-hover-tip" role="tooltip">{label}</span> : null}
        </button>
      </div>
    );
  };

  const renderPanelTabBar = () => (
    <div className={`mlc-panel-header mlc-panel-icon-tabs-row ${column.tabBarPosition}`}>
      <div className="mlc-panel-icon-tabs" role="tablist" aria-label={t("mlc.panelTabs", "Side panel tabs")}>{column.tabIds.map(renderTab)}</div>
      <button
        type="button"
        className="mlc-panel-tab-row-close"
        onClick={() => setDockColumnCollapsed(columnId, true)}
        aria-label={t("dock.collapsePanel", "Collapse panel")}
        title={t("dock.collapsePanel", "Collapse panel")}
      >
        <Icon name={visualPosition === "right" ? "chevron-right" : "chevron-left"} size={14} />
      </button>
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
      <div className="mlc-resize-handle" data-preview-overlay onMouseDown={handleResizeMouseDown} />
      {draggingDockTab ? <div className="dock-column-target-icon dock-column-target-badge" aria-hidden="true">{dockColumnTargetIcon(columnId)}</div> : null}
      {column.tabBarPosition === "top" ? renderPanelTabBar() : null}
      <div className="dock-tab-panels" style={{ display: "contents" }}>
        {[...mountedTabIds].map((tabId) => {
          const isActive = column.activeTabId === tabId;
          return (
            <div
              key={tabId}
              style={{ display: isActive ? "contents" : "none" }}
            >
              <DockTabContent tabId={tabId} />
            </div>
          );
        })}
      </div>
      {column.tabBarPosition === "bottom" ? renderPanelTabBar() : null}
      {tabBarMenu ? (
        <div ref={tabBarMenuRef} className="mlc-panel-tab-menu dock-tab-menu" data-preview-overlay style={{ left: tabBarMenu.left, top: tabBarMenu.top }} role="menu" onContextMenu={(event) => event.preventDefault()}>
          <button type="button" role="menuitem" onClick={() => moveMenuTab("leftSidebar")} disabled={columnId === "leftSidebar"}>
            <Icon name="sidebar" size={12} />
            <span>{t("dock.moveToLeftSidebar", "Move to left sidebar")}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => moveMenuTab("leftPage")} disabled={columnId === "leftPage"}>
            <Icon name="page-sidebar" size={12} />
            <span>{t("dock.moveToLeftPage", "Move to left page")}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => moveMenuTab("rightPage")} disabled={columnId === "rightPage"}>
            <Icon name="page-sidebar" size={12} style={{ transform: "scaleX(-1)" }} />
            <span>{t("dock.moveToRightPage", "Move to right page")}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => moveMenuTab("rightSidebar")} disabled={columnId === "rightSidebar"}>
            <Icon name="sidebar" size={12} style={{ transform: "scaleX(-1)" }} />
            <span>{t("dock.moveToRightSidebar", "Move to right sidebar")}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => setPanelTabBarPosition(column.tabBarPosition === "top" ? "bottom" : "top")}>
            <Icon name="arrow-down" size={12} style={column.tabBarPosition === "bottom" ? { transform: "rotate(180deg)" } : undefined} />
            <span>{column.tabBarPosition === "top" ? t("mlc.moveTabsToBottom", "Move tabs to bottom") : t("mlc.moveTabsToTop", "Move tabs to top")}</span>
          </button>
        </div>
      ) : null}
    </aside>
  );
}
