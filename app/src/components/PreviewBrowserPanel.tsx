import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { usePreviewBrowserStore, type PreviewBrowserTab } from "../store/previewBrowserStore";
import { useFeedbackStore } from "../store/feedbackStore";
import { Icon } from "./Icons";

function displayUrl(url: string): string {
  return url === "about:blank" ? "" : url;
}

function consoleVisible(tab: PreviewBrowserTab, filter: "all" | "warnings-errors" | "errors") {
  if (filter === "errors") return tab.consoleEntries.filter((entry) => entry.level === "error");
  if (filter === "warnings-errors") return tab.consoleEntries.filter((entry) => entry.level === "warn" || entry.level === "error");
  return tab.consoleEntries;
}

function bestLocator(tab: PreviewBrowserTab): string {
  const element = tab.selectedElement;
  if (!element) return "";
  return element.locatorCandidates.find((item) => item.kind.startsWith("playwright") || item.kind === "testid")?.value
    || element.locatorCandidates[0]?.value
    || element.selector;
}

function formatConsoleTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function shortUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname}`;
  } catch {
    return value;
  }
}

function copyText(value: string) {
  void navigator.clipboard?.writeText(value).catch(() => undefined);
}

function screenshotSrc(filePath: string | undefined): string | null {
  if (!filePath) return null;
  return convertFileSrc(filePath);
}

export function PreviewBrowserPanel() {
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousActiveTabRef = useRef<string | null>(null);
  const tabs = usePreviewBrowserStore((state) => state.tabs);
  const activeTabId = usePreviewBrowserStore((state) => state.activeTabId);
  const pickerMode = usePreviewBrowserStore((state) => state.pickerMode);
  const inspectorMode = usePreviewBrowserStore((state) => state.inspectorMode);
  const consoleFilter = usePreviewBrowserStore((state) => state.consoleFilter);
  const createTab = usePreviewBrowserStore((state) => state.createTab);
  const closeTab = usePreviewBrowserStore((state) => state.closeTab);
  const setActiveTab = usePreviewBrowserStore((state) => state.setActiveTab);
  const navigate = usePreviewBrowserStore((state) => state.navigate);
  const reload = usePreviewBrowserStore((state) => state.reload);
  const goBack = usePreviewBrowserStore((state) => state.goBack);
  const goForward = usePreviewBrowserStore((state) => state.goForward);
  const setBounds = usePreviewBrowserStore((state) => state.setBounds);
  const hideTab = usePreviewBrowserStore((state) => state.hideTab);
  const startPicker = usePreviewBrowserStore((state) => state.startPicker);
  const stopPicker = usePreviewBrowserStore((state) => state.stopPicker);
  const clearConsole = usePreviewBrowserStore((state) => state.clearConsole);
  const setInspectorMode = usePreviewBrowserStore((state) => state.setInspectorMode);
  const setConsoleFilter = usePreviewBrowserStore((state) => state.setConsoleFilter);
  const attachSelectedElement = usePreviewBrowserStore((state) => state.attachSelectedElement);
  const attachConsoleSnapshot = usePreviewBrowserStore((state) => state.attachConsoleSnapshot);
  const handleTabUpdated = usePreviewBrowserStore((state) => state.handleTabUpdated);
  const handleLoadStarted = usePreviewBrowserStore((state) => state.handleLoadStarted);
  const handleLoadFinished = usePreviewBrowserStore((state) => state.handleLoadFinished);
  const handleLoadError = usePreviewBrowserStore((state) => state.handleLoadError);
  const handlePickerReady = usePreviewBrowserStore((state) => state.handlePickerReady);
  const handlePickerCancelled = usePreviewBrowserStore((state) => state.handlePickerCancelled);
  const handleElementPicked = usePreviewBrowserStore((state) => state.handleElementPicked);
  const handleConsoleEntry = usePreviewBrowserStore((state) => state.handleConsoleEntry);
  const focusedComposer = useFeedbackStore((state) => state.focusedComposer);
  const [addressDraft, setAddressDraft] = useState("");
  const [attachNotice, setAttachNotice] = useState<string | null>(null);

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) || null, [activeTabId, tabs]);
  const visibleConsoleEntries = activeTab ? consoleVisible(activeTab, consoleFilter) : [];
  const consoleCounts = useMemo(() => {
    const entries = activeTab?.consoleEntries || [];
    return {
      errors: entries.filter((entry) => entry.level === "error").length,
      warnings: entries.filter((entry) => entry.level === "warn").length,
      total: entries.length,
    };
  }, [activeTab?.consoleEntries]);

  useEffect(() => {
    if (tabs.length === 0) void createTab();
  }, [createTab, tabs.length]);

  useEffect(() => {
    setAddressDraft(displayUrl(activeTab?.pendingUrl || activeTab?.url || ""));
  }, [activeTab?.id, activeTab?.pendingUrl, activeTab?.url]);

  useEffect(() => {
    const subscriptions = [
      listen<any>("preview-tab-updated", (event) => handleTabUpdated(event.payload)),
      listen<any>("preview-load-started", (event) => handleLoadStarted(event.payload)),
      listen<any>("preview-load-finished", (event) => handleLoadFinished(event.payload)),
      listen<any>("preview-load-error", (event) => handleLoadError(event.payload)),
      listen<any>("preview-picker-ready", (event) => handlePickerReady(event.payload)),
      listen<any>("preview-picker-cancelled", (event) => handlePickerCancelled(event.payload)),
      listen<any>("preview-element-picked", (event) => handleElementPicked(event.payload)),
      listen<any>("preview-console-entry", (event) => handleConsoleEntry(event.payload)),
    ];
    let disposed = false;
    let unlistenFns: Array<() => void> = [];
    void Promise.all(subscriptions).then((resolved) => {
      if (disposed) resolved.forEach((dispose) => dispose());
      else unlistenFns = resolved;
    });
    return () => {
      disposed = true;
      unlistenFns.forEach((dispose) => dispose());
    };
  }, [handleConsoleEntry, handleElementPicked, handleLoadError, handleLoadFinished, handleLoadStarted, handlePickerCancelled, handlePickerReady, handleTabUpdated]);

  const syncBounds = useCallback((visible = true) => {
    if (!activeTab || !viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const isVisible = visible && rect.width > 20 && rect.height > 20;
    void setBounds(activeTab.id, {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }, isVisible);
  }, [activeTab, setBounds]);

  useEffect(() => {
    const previous = previousActiveTabRef.current;
    if (previous && previous !== activeTabId) void hideTab(previous);
    previousActiveTabRef.current = activeTabId;
    syncBounds(true);
  }, [activeTabId, hideTab, syncBounds]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => syncBounds(true));
    observer.observe(element);
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

  const submitAddress = (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeTab || !addressDraft.trim()) return;
    void navigate(activeTab.id, addressDraft.trim());
  };

  const handleCreateTab = () => { void createTab(); };
  const handleCloseTab = (tabId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    void closeTab(tabId);
  };
  const handleAttachElement = () => {
    if (!activeTab) return;
    const ok = attachSelectedElement(activeTab.id);
    setAttachNotice(ok ? t("previewBrowser.attachedElement", "Element attached") : t("previewBrowser.noTarget", "Focus a feedback input first"));
  };
  const handleAttachConsole = () => {
    if (!activeTab) return;
    const ok = attachConsoleSnapshot(activeTab.id);
    setAttachNotice(ok ? t("previewBrowser.attachedConsole", "Console attached") : t("previewBrowser.noTarget", "Focus a feedback input first"));
  };

  useEffect(() => {
    if (!attachNotice) return;
    const timer = window.setTimeout(() => setAttachNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [attachNotice]);

  return (
    <div className="preview-browser-panel">
      <div className="preview-browser-tab-strip" role="tablist" aria-label={t("previewBrowser.tabs", "Browser tabs")}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <button key={tab.id} type="button" className={`preview-browser-tab${isActive ? " active" : ""}`} onClick={() => setActiveTab(tab.id)} role="tab" aria-selected={isActive}>
              <Icon name="globe" size={13} />
              <span>{tab.title || tab.url || t("previewBrowser.newTab", "New tab")}</span>
              <span className={`preview-browser-tab-status ${tab.status}`} />
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

      <div className="preview-browser-toolbar">
        <button type="button" className="preview-browser-icon-button" onClick={() => activeTab && void goBack(activeTab.id)} disabled={!activeTab?.canGoBack} title={t("previewBrowser.back", "Back")}>
          <Icon name="chevron-left" size={15} />
        </button>
        <button type="button" className="preview-browser-icon-button" onClick={() => activeTab && void goForward(activeTab.id)} disabled={!activeTab?.canGoForward} title={t("previewBrowser.forward", "Forward")}>
          <Icon name="chevron-right" size={15} />
        </button>
        <button type="button" className="preview-browser-icon-button" onClick={() => activeTab && void reload(activeTab.id)} disabled={!activeTab} title={t("previewBrowser.reload", "Reload")}>
          <Icon name="refresh" size={14} />
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
      </div>

      <div ref={viewportRef} className="preview-browser-viewport">
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

      <div className="preview-browser-inspector">
        <div className="preview-browser-inspector-tabs">
          <button type="button" className={inspectorMode === "selected" ? "active" : ""} onClick={() => setInspectorMode("selected")}>
            <Icon name="aim" size={12} />
            {t("previewBrowser.selected", "Selected")}
          </button>
          <button type="button" className={inspectorMode === "console" ? "active" : ""} onClick={() => setInspectorMode("console")}>
            <Icon name="terminal" size={12} />
            {t("previewBrowser.console", "Console")}
            {activeTab?.consoleEntries.length ? <span>{activeTab.consoleEntries.length}</span> : null}
          </button>
          {attachNotice ? <span className="preview-browser-attach-notice">{attachNotice}</span> : focusedComposer ? <span className="preview-browser-target">{t("previewBrowser.targetReady", "Target ready")}</span> : <span className="preview-browser-target muted">{t("previewBrowser.noTarget", "Focus a feedback input first")}</span>}
        </div>

        {inspectorMode === "selected" ? (
          <div className="preview-browser-selected">
            {activeTab?.selectedElement ? (
              <>
                <div className="preview-browser-selected-main">
                  <Icon name="aim" size={15} />
                  <div>
                    <strong>{activeTab.selectedElement.text || activeTab.selectedElement.selector}</strong>
                    <span>{activeTab.selectedElement.tagName} · {activeTab.selectedElement.selector}</span>
                  </div>
                </div>
                <div className="preview-browser-selected-details">
                  {activeTab.selectedElement.screenshot?.status === "ready" ? (
                    <div className="preview-browser-screenshot">
                      {screenshotSrc(activeTab.selectedElement.screenshot.filePath) ? <img src={screenshotSrc(activeTab.selectedElement.screenshot.filePath) || undefined} alt="" /> : null}
                      <span>{activeTab.selectedElement.screenshot.width}x{activeTab.selectedElement.screenshot.height}</span>
                    </div>
                  ) : activeTab.selectedElement.screenshot?.status === "failed" ? (
                    <div className="preview-browser-screenshot failed"><span>{t("previewBrowser.screenshotUnavailable", "Screenshot unavailable")}</span><code>{activeTab.selectedElement.screenshot.error}</code></div>
                  ) : null}
                  <div>
                    <span>Selector</span>
                    <code>{activeTab.selectedElement.selector}</code>
                    <button type="button" onClick={() => copyText(activeTab.selectedElement!.selector)}><Icon name="copy" size={11} /></button>
                  </div>
                  <div>
                    <span>Locator</span>
                    <code>{bestLocator(activeTab)}</code>
                    <button type="button" onClick={() => copyText(bestLocator(activeTab))}><Icon name="copy" size={11} /></button>
                  </div>
                  {activeTab.selectedElement.locatorCandidates.length ? (
                    <details>
                      <summary>Locator candidates</summary>
                      <div className="preview-browser-locator-list">
                        {activeTab.selectedElement.locatorCandidates.map((candidate) => (
                          <button type="button" key={`${candidate.kind}-${candidate.value}`} onClick={() => copyText(candidate.value)}>
                            <span>{candidate.confidence}</span>
                            <code>{candidate.value}</code>
                          </button>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  {activeTab.selectedElement.attributes && Object.keys(activeTab.selectedElement.attributes).length ? (
                    <details>
                      <summary>Attributes</summary>
                      <div className="preview-browser-kv-list">
                        {Object.entries(activeTab.selectedElement.attributes).map(([key, value]) => (
                          <div key={key}><span>{key}</span><code>{value}</code></div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  {activeTab.selectedElement.styleSummary && Object.keys(activeTab.selectedElement.styleSummary).length ? (
                    <details>
                      <summary>Styles</summary>
                      <div className="preview-browser-kv-list">
                        {Object.entries(activeTab.selectedElement.styleSummary).map(([key, value]) => (
                          <div key={key}><span>{key}</span><code>{value}</code></div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  {activeTab.selectedElement.href ? <div><span>Href</span><code>{activeTab.selectedElement.href}</code><button type="button" onClick={() => copyText(activeTab.selectedElement!.href || "")}><Icon name="copy" size={11} /></button></div> : null}
                  {activeTab.selectedElement.htmlSnippet ? <details><summary>HTML</summary><pre>{activeTab.selectedElement.htmlSnippet}</pre></details> : null}
                </div>
                <div className="preview-browser-selected-actions">
                  <button type="button" onClick={handleAttachElement}><Icon name="paperclip" size={12} />{t("previewBrowser.attachElement", "Attach element")}</button>
                </div>
              </>
            ) : (
              <div className="preview-browser-inspector-empty">{pickerMode === "arming" ? t("previewBrowser.pickerArming", "Starting picker...") : pickerMode === "active" ? t("previewBrowser.pickHint", "Click an element in the page") : t("previewBrowser.noSelection", "No element selected")}</div>
            )}
          </div>
        ) : (
          <div className="preview-browser-console">
            <div className="preview-browser-console-tools">
              <select value={consoleFilter} onChange={(event) => setConsoleFilter(event.target.value as "all" | "warnings-errors" | "errors")}>
                <option value="warnings-errors">{t("previewBrowser.filterWarnError", "Warnings + errors")} ({consoleCounts.warnings + consoleCounts.errors})</option>
                <option value="errors">{t("previewBrowser.filterErrors", "Errors")} ({consoleCounts.errors})</option>
                <option value="all">{t("previewBrowser.filterAll", "All")} ({consoleCounts.total})</option>
              </select>
              <button type="button" onClick={() => activeTab && clearConsole(activeTab.id)} disabled={!activeTab?.consoleEntries.length}>{t("previewBrowser.clearConsole", "Clear")}</button>
              <button type="button" onClick={handleAttachConsole} disabled={!visibleConsoleEntries.length}><Icon name="paperclip" size={12} />{t("previewBrowser.attachConsole", "Attach console")}</button>
            </div>
            <div className="preview-browser-console-list">
              {visibleConsoleEntries.length === 0 ? <div className="preview-browser-inspector-empty">{t("previewBrowser.noConsole", "No console entries")}</div> : visibleConsoleEntries.map((entry) => (
                <div key={entry.id} className={`preview-browser-console-entry ${entry.level}`}>
                  <span>{entry.level}</span>
                  <div>
                    <code>{entry.message}</code>
                    <small>{formatConsoleTime(entry.timestamp)} · {shortUrl(entry.sourceUrl)}{entry.line ? `:${entry.line}${entry.column ? `:${entry.column}` : ""}` : ""}</small>
                    {entry.stack ? <pre>{entry.stack}</pre> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
