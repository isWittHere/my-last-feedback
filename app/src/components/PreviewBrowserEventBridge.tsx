import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { usePreviewBrowserStore } from "../store/previewBrowserStore";

export function PreviewBrowserEventBridge() {
  const handleTabUpdated = usePreviewBrowserStore((state) => state.handleTabUpdated);
  const handleLoadStarted = usePreviewBrowserStore((state) => state.handleLoadStarted);
  const handleLoadFinished = usePreviewBrowserStore((state) => state.handleLoadFinished);
  const handleLoadError = usePreviewBrowserStore((state) => state.handleLoadError);
  const handlePickerReady = usePreviewBrowserStore((state) => state.handlePickerReady);
  const handlePickerCancelled = usePreviewBrowserStore((state) => state.handlePickerCancelled);
  const handleElementPicked = usePreviewBrowserStore((state) => state.handleElementPicked);
  const handleConsoleEntry = usePreviewBrowserStore((state) => state.handleConsoleEntry);

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
  }, [
    handleConsoleEntry,
    handleElementPicked,
    handleLoadError,
    handleLoadFinished,
    handleLoadStarted,
    handlePickerCancelled,
    handlePickerReady,
    handleTabUpdated,
  ]);

  return null;
}
