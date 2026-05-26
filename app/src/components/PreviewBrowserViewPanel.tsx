import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { usePreviewBrowserStore } from "../store/previewBrowserStore";
import { useFeedbackStore } from "../store/feedbackStore";
import { Icon } from "./Icons";

function displayUrl(url: string): string {
  return url === "about:blank" ? "" : url;
}

export function PreviewBrowserViewPanel() {
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLDivElement>(null);
  const webviewMountRef = useRef<HTMLDivElement>(null);
  const previousActiveTabRef = useRef<string | null>(null);
  const tabs = usePreviewBrowserStore((state) => state.tabs);
  const activeTabId = usePreviewBrowserStore((state) => state.activeTabId);
  const pickerMode = usePreviewBrowserStore((state) => state.pickerMode);
  const inspectorMode = usePreviewBrowserStore((state) => state.inspectorMode);
  const createTab = usePreviewBrowserStore((state) => state.createTab);
  const ensureInitialTab = usePreviewBrowserStore((state) => state.ensureInitialTab);
  const closeTab = usePreviewBrowserStore((state) => state.closeTab);
  const setActiveTab = usePreviewBrowserStore((state) => state.setActiveTab);
  const navigate = usePreviewBrowserStore((state) => state.navigate);
  const reload = usePreviewBrowserStore((state) => state.reload);
  const setZoom = usePreviewBrowserStore((state) => state.setZoom);
  const goBack = usePreviewBrowserStore((state) => state.goBack);
  const goForward = usePreviewBrowserStore((state) => state.goForward);
  const setBounds = usePreviewBrowserStore((state) => state.setBounds);
  const hideTab = usePreviewBrowserStore((state) => state.hideTab);
  const startPicker = usePreviewBrowserStore((state) => state.startPicker);
  const stopPicker = usePreviewBrowserStore((state) => state.stopPicker);
  const setInspectorMode = usePreviewBrowserStore((state) => state.setInspectorMode);
  const draggingDockTab = useFeedbackStore((state) => state.draggingDockTab);
  const nativeWebViewBlocked = useFeedbackStore((state) => Object.keys(state.nativeWebViewBlockers).length > 0);
  const [addressDraft, setAddressDraft] = useState("");

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) || null, [activeTabId, tabs]);

  useEffect(() => {
    if (tabs.length === 0) void ensureInitialTab();
  }, [ensureInitialTab, tabs.length]);

  useEffect(() => {
    setAddressDraft(displayUrl(activeTab?.pendingUrl || activeTab?.url || ""));
  }, [activeTab?.id, activeTab?.pendingUrl, activeTab?.url]);

  const syncBounds = useCallback((visible = true) => {
    if (!activeTab || !webviewMountRef.current) return;
    const rect = webviewMountRef.current.getBoundingClientRect();
    const isVisible = visible && !draggingDockTab && !nativeWebViewBlocked && rect.width > 20 && rect.height > 20;
    void setBounds(activeTab.id, {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    }, isVisible);
  }, [activeTab?.id, draggingDockTab, nativeWebViewBlocked, setBounds]);

  useEffect(() => {
    syncBounds(!draggingDockTab && !nativeWebViewBlocked);
  }, [draggingDockTab, nativeWebViewBlocked, syncBounds]);

  useEffect(() => {
    const previous = previousActiveTabRef.current;
    if (previous && previous !== activeTabId) void hideTab(previous);
    previousActiveTabRef.current = activeTabId;
    syncBounds(true);
  }, [activeTabId, hideTab, syncBounds]);

  useEffect(() => {
    const viewportElement = viewportRef.current;
    const mountElement = webviewMountRef.current;
    if (!viewportElement || !mountElement) return;
    const observer = new ResizeObserver(() => syncBounds(true));
    observer.observe(viewportElement);
    observer.observe(mountElement);
    const handleWindowResize = () => syncBounds(true);
    window.addEventListener("resize", handleWindowResize);
    const frame = window.requestAnimationFrame(() => syncBounds(true));
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      window.cancelAnimationFrame(frame);
    };
  }, [syncBounds]);

  useEffect(() => {
    return () => {
      for (const tab of usePreviewBrowserStore.getState().tabs) void usePreviewBrowserStore.getState().hideTab(tab.id);
    };
  }, []);

  const submitAddress = (event: FormEvent) => {
    event.preventDefault();
    if (!activeTab || !addressDraft.trim()) return;
    void navigate(activeTab.id, addressDraft.trim());
  };

  const handleCreateTab = () => { void createTab(); };
  const handleCloseTab = (tabId: string, event: ReactMouseEvent) => {
    event.stopPropagation();
    void closeTab(tabId);
  };

  return (
    <div className="preview-browser-panel view-only">
      <div className="preview-browser-tab-strip" role="tablist" aria-label={t("previewBrowser.tabs", "Browser tabs")}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <button key={tab.id} type="button" className={`preview-browser-tab${isActive ? " active" : ""}`} onClick={() => setActiveTab(tab.id)} role="tab" aria-selected={isActive}>
              <Icon name={tab.status === "loading" ? "spinner" : tab.status === "error" ? "warning" : "globe"} size={13} className={tab.status === "loading" ? "preview-browser-spin" : undefined} />
              <span>{tab.title || tab.url || t("previewBrowser.newTab", "New tab")}</span>
              <span className="preview-browser-tab-close" onClick={(event) => handleCloseTab(tab.id, event)} aria-label={t("previewBrowser.closeTab", "Close tab")}>
                <Icon name="close-sm" size={9} />
              </span>
            </button>
          );
        })}
        <button type="button" className="preview-browser-new-tab" onClick={handleCreateTab} aria-label={t("previewBrowser.newTab", "New tab")}>
          <Icon name="plus" size={13} />
        </button>
      </div>

      <div className="preview-browser-toolbar" data-tooltip-placement="top">
        <button type="button" className="preview-browser-icon-button" onClick={() => activeTab && void goBack(activeTab.id)} disabled={!activeTab || activeTab.url === "about:blank"} title={t("previewBrowser.back", "Back")}>
          <Icon name="chevron-left" size={15} />
        </button>
        <button type="button" className="preview-browser-icon-button" onClick={() => activeTab && void goForward(activeTab.id)} disabled={!activeTab || activeTab.url === "about:blank"} title={t("previewBrowser.forward", "Forward")}>
          <Icon name="chevron-right" size={15} />
        </button>
        <button type="button" className="preview-browser-icon-button" onClick={() => activeTab && void reload(activeTab.id)} disabled={!activeTab || activeTab.url === "about:blank"} title={t("previewBrowser.reload", "Reload")}>
          <Icon name="refresh" size={14} className={activeTab?.status === "loading" ? "preview-browser-spin" : undefined} />
        </button>
        <form className="preview-browser-address-form" onSubmit={submitAddress}>
          <Icon name="globe" size={13} />
          <input value={addressDraft} onChange={(event) => setAddressDraft(event.target.value)} placeholder={t("previewBrowser.addressPlaceholder", "Enter URL...")} />
        </form>
        <button type="button" className={`preview-browser-icon-button${pickerMode !== "off" ? " active" : ""}`} onClick={() => activeTab && (pickerMode === "off" ? void startPicker(activeTab.id) : void stopPicker(activeTab.id))} disabled={!activeTab || activeTab.url === "about:blank"} title={t("previewBrowser.pickElement", "Pick element")}>
          <Icon name="aim" size={14} />
        </button>
        <button type="button" className={`preview-browser-icon-button${inspectorMode === "console" ? " active" : ""}`} onClick={() => setInspectorMode(inspectorMode === "console" ? "selected" : "console")} title={t("previewBrowser.console", "Console")}>
          <Icon name="terminal" size={14} />
        </button>
        <div className="preview-browser-zoom-control" aria-label={t("previewBrowser.zoom", "Zoom")}>
          <button type="button" onClick={() => activeTab && void setZoom(activeTab.id, activeTab.zoom - 0.1)} disabled={!activeTab || activeTab.zoom <= 0.5} title={t("previewBrowser.zoomOut", "Zoom out")}>
            <Icon name="minus" size={12} />
          </button>
          <button type="button" className="preview-browser-zoom-value" onClick={() => activeTab && void setZoom(activeTab.id, 1)} disabled={!activeTab} title={t("previewBrowser.resetZoom", "Reset zoom")}>
            {Math.round((activeTab?.zoom || 1) * 100)}%
          </button>
          <button type="button" onClick={() => activeTab && void setZoom(activeTab.id, activeTab.zoom + 0.1)} disabled={!activeTab || activeTab.zoom >= 2} title={t("previewBrowser.zoomIn", "Zoom in")}>
            <Icon name="plus" size={12} />
          </button>
        </div>
      </div>

      <div ref={viewportRef} className="preview-browser-viewport expanded">
        <div ref={webviewMountRef} className="preview-browser-webview-mount" />
        {!activeTab ? (
          <div className="preview-browser-empty"><Icon name="globe" size={28} /><span>{t("previewBrowser.empty", "Open a preview tab")}</span></div>
        ) : activeTab.status === "error" ? (
          <div className="preview-browser-error">
            <Icon name="globe" size={32} />
            <h3>{t("previewBrowser.loadFailed", "Unable to load page")}</h3>
            <p>{activeTab.errorMessage}</p>
            <code>{activeTab.url}</code>
          </div>
        ) : activeTab.url === "about:blank" ? (
          <div className="preview-browser-empty"><Icon name="globe" size={28} /><span>{t("previewBrowser.blank", "Enter a URL to start previewing")}</span></div>
        ) : null}
      </div>
    </div>
  );
}
