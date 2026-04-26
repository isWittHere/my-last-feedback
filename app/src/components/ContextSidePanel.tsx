import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFeedbackStore, type SidePanelTab } from "../store/feedbackStore";
import { Icon, MlcLogoIcon } from "./Icons";
import { MlcSidePanel } from "./MlcSidePanel";
import { ProjectResourcePanel } from "./ProjectResourcePanel";

type TabBarPosition = "top" | "bottom";

export function ContextSidePanel() {
  const { t } = useTranslation();
  const position = useFeedbackStore((state) => state.mlcPanelPosition);
  const width = useFeedbackStore((state) => state.mlcPanelWidth);
  const activeTab = useFeedbackStore((state) => state.sidePanelActiveTab);
  const focusedComposer = useFeedbackStore((state) => state.focusedComposer);
  const activeWorkspacePath = useFeedbackStore((state) => state.mlcActiveWorkspacePath);
  const setWidth = useFeedbackStore((state) => state.setMlcPanelWidth);
  const setActiveTab = useFeedbackStore((state) => state.setSidePanelActiveTab);
  const setActiveWorkspacePath = useFeedbackStore((state) => state.setMlcActiveWorkspacePath);

  const [tabBarPosition, setTabBarPosition] = useState<TabBarPosition>(() => {
    try {
      return localStorage.getItem("mlfb-mlc-tab-bar-position") === "bottom" ? "bottom" : "top";
    } catch {
      return "top";
    }
  });
  const [tabBarMenu, setTabBarMenu] = useState<{ left: number; top: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const tabBarMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusedComposer?.projectDirectory && !activeWorkspacePath) {
      setActiveWorkspacePath(focusedComposer.projectDirectory);
    }
  }, [activeWorkspacePath, focusedComposer?.projectDirectory, setActiveWorkspacePath]);

  useEffect(() => {
    if (!tabBarMenu) return;
    const handlePointerDown = (event: MouseEvent) => {
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

  const handleResizeMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    resizeRef.current = { startX: event.clientX, startWidth: width };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const resize = resizeRef.current;
      if (!resize) return;
      const delta = position === "right" ? resize.startX - moveEvent.clientX : moveEvent.clientX - resize.startX;
      setWidth(resize.startWidth + delta);
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
  }, [position, setWidth, width]);

  const handleTabBarContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setTabBarMenu({
      left: Math.min(Math.max(8, event.clientX), Math.max(8, window.innerWidth - 176)),
      top: Math.min(Math.max(8, event.clientY), Math.max(8, window.innerHeight - 44)),
    });
  }, []);

  const setPanelTabBarPosition = useCallback((nextPosition: TabBarPosition) => {
    setTabBarPosition(nextPosition);
    setTabBarMenu(null);
    try { localStorage.setItem("mlfb-mlc-tab-bar-position", nextPosition); } catch {}
  }, []);

  const switchTab = useCallback((tab: SidePanelTab) => {
    setActiveTab(tab);
    if (focusedComposer?.projectDirectory) setActiveWorkspacePath(focusedComposer.projectDirectory);
  }, [focusedComposer?.projectDirectory, setActiveTab, setActiveWorkspacePath]);

  const renderTab = (tab: SidePanelTab, label: string, icon: ReactNode) => {
    const isActive = activeTab === tab;
    return (
      <button
        type="button"
        className={`mlc-panel-icon-tab${isActive ? " active" : ""}`}
        role="tab"
        aria-selected={isActive}
        aria-label={label}
        onClick={() => switchTab(tab)}
        onContextMenu={handleTabBarContextMenu}
      >
        {icon}
        <span className="mlc-panel-tab-hover-tip" role="tooltip">{label}</span>
      </button>
    );
  };

  const renderPanelTabBar = () => (
    <div className={`mlc-panel-header mlc-panel-icon-tabs-row ${tabBarPosition}`} onContextMenu={handleTabBarContextMenu}>
      <div className="mlc-panel-icon-tabs" role="tablist" aria-label={t("mlc.panelTabs", "Side panel tabs")}>
        {renderTab("mlc", t("mlc.title", "My Last Chat"), <MlcLogoIcon size={16} />)}
        {renderTab("resources", t("resources.title", "Project resources"), <Icon name="folder" size={16} />)}
      </div>
    </div>
  );

  return (
    <aside className="mlc-panel context-side-panel" data-position={position} data-tab-bar-position={tabBarPosition} style={{ width }}>
      <div className="mlc-resize-handle" onMouseDown={handleResizeMouseDown} />
      {tabBarPosition === "top" ? renderPanelTabBar() : null}
      {activeTab === "mlc" ? <MlcSidePanel /> : <ProjectResourcePanel />}
      {tabBarPosition === "bottom" ? renderPanelTabBar() : null}
      {tabBarMenu ? (
        <div ref={tabBarMenuRef} className="mlc-panel-tab-menu" style={{ left: tabBarMenu.left, top: tabBarMenu.top }} role="menu" onContextMenu={(event) => event.preventDefault()}>
          <button type="button" role="menuitem" onClick={() => setPanelTabBarPosition(tabBarPosition === "top" ? "bottom" : "top")}>
            <Icon name="arrow-down" size={12} style={tabBarPosition === "bottom" ? { transform: "rotate(180deg)" } : undefined} />
            <span>{tabBarPosition === "top" ? t("mlc.moveTabsBottom", "Move tabs to bottom") : t("mlc.moveTabsTop", "Move tabs to top")}</span>
          </button>
        </div>
      ) : null}
    </aside>
  );
}
