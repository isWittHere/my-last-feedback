import { useMemo, useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { usePreviewBrowserStore, type PreviewBrowserTab } from "../store/previewBrowserStore";
import { useFeedbackStore } from "../store/feedbackStore";
import { Icon } from "./Icons";

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

export function PreviewBrowserInfoPanel() {
  const { t } = useTranslation();
  const tabs = usePreviewBrowserStore((state) => state.tabs);
  const activeTabId = usePreviewBrowserStore((state) => state.activeTabId);
  const pickerMode = usePreviewBrowserStore((state) => state.pickerMode);
  const inspectorMode = usePreviewBrowserStore((state) => state.inspectorMode);
  const consoleFilter = usePreviewBrowserStore((state) => state.consoleFilter);
  const setInspectorMode = usePreviewBrowserStore((state) => state.setInspectorMode);
  const setConsoleFilter = usePreviewBrowserStore((state) => state.setConsoleFilter);
  const clearConsole = usePreviewBrowserStore((state) => state.clearConsole);
  const attachSelectedElement = usePreviewBrowserStore((state) => state.attachSelectedElement);
  const attachConsoleSnapshot = usePreviewBrowserStore((state) => state.attachConsoleSnapshot);
  const focusedComposer = useFeedbackStore((state) => state.focusedComposer);
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
    if (!attachNotice) return;
    const timer = window.setTimeout(() => setAttachNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [attachNotice]);

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

  return (
    <div className="preview-browser-info-panel">
      <div className="preview-browser-inspector standalone">
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
                      {activeTab.selectedElement.screenshot.dataUrl || screenshotSrc(activeTab.selectedElement.screenshot.filePath) ? <img src={activeTab.selectedElement.screenshot.dataUrl || screenshotSrc(activeTab.selectedElement.screenshot.filePath) || undefined} alt="" /> : null}
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
