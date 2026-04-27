import { useEffect, useRef, useCallback, useMemo, type ClipboardEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../store/feedbackStore";
import { useShallow } from "zustand/react/shallow";
import { useActiveCallerSession } from "./useActiveCallerSession";
import { useFriendlyName } from "./useFriendlyName";
import { promptCommandOptions } from "../composer/promptCommands";
import { ComposerEditor, type ComposerEditorHandle } from "./composer/ComposerEditor";

interface InsertFeedbackTextEventDetail {
  callerId: string;
  sessionId?: string;
  kind: string;
  text: string;
}

export function FeedbackInput({ minHeight, queuedCallerId }: { minHeight?: number; queuedCallerId?: string } = {}) {
  const { t } = useTranslation();
  const friendlyName = useFriendlyName();
  const { session: activeSession, caller } = useActiveCallerSession();
  const queuedDraft = useFeedbackStore((s) => queuedCallerId ? s.queuedDraftsByCallerId[queuedCallerId] : null);
  const prompts = useFeedbackStore((s) => s.prompts);
  const disabledPrompts = useFeedbackStore((s) => s.disabledPrompts);
  const { updateSessionField, addSessionImage, updateQueuedDraftField, addQueuedDraftImage, setFocusedComposer } = useFeedbackStore(useShallow((s) => ({
    updateSessionField: s.updateSessionField,
    addSessionImage: s.addSessionImage,
    updateQueuedDraftField: s.updateQueuedDraftField,
    addQueuedDraftImage: s.addQueuedDraftImage,
    setFocusedComposer: s.setFocusedComposer,
  })));
  const editorRef = useRef<ComposerEditorHandle>(null);
  const historyIndexRef = useRef<number | null>(null);
  const historyScratchRef = useRef("");

  const value = queuedCallerId ? (queuedDraft?.feedbackText || "") : (activeSession?.feedbackText || "");
  const isReadonly = !queuedCallerId && (activeSession?.status === "responded" || activeSession?.status === "cancelled");
  const composerCommands = useMemo(() => {
    const visiblePrompts = prompts.filter((prompt) => !disabledPrompts.includes(prompt.name));
    return promptCommandOptions(visiblePrompts);
  }, [disabledPrompts, prompts]);

  useEffect(() => {
    editorRef.current?.focus();
  }, []);

  // Auto-resize when in scroll mode (minHeight provided)
  useEffect(() => {
    const editor = editorRef.current?.getElement();
    if (minHeight !== undefined && editor) {
      editor.style.height = "auto";
      const h = Math.max(editor.scrollHeight, minHeight);
      editor.style.height = h + "px";
    }
  }, [value, minHeight]);

  const handleChange = (nextValue: string) => {
    historyIndexRef.current = null;
    if (queuedCallerId) {
      updateQueuedDraftField(queuedCallerId, "feedbackText", nextValue);
    } else if (activeSession) {
      updateSessionField(activeSession.id, "feedbackText", nextValue);
    }
  };

  const handleFocus = useCallback(() => {
    if (queuedCallerId) {
      if (!caller) return;
      setFocusedComposer({
        callerId: queuedCallerId,
        projectDirectory: activeSession?.projectDirectory || "",
        kind: "queuedDraft",
        focusedAt: new Date().toISOString(),
      });
      return;
    }
    if (!activeSession || activeSession.status !== "pending" || !caller) return;
    setFocusedComposer({
      callerId: caller.id,
      sessionId: activeSession.id,
      projectDirectory: activeSession.projectDirectory,
      kind: "feedback",
      focusedAt: new Date().toISOString(),
    });
  }, [activeSession, caller, queuedCallerId, setFocusedComposer]);

  const setCurrentValue = useCallback((nextValue: string) => {
    if (queuedCallerId) {
      updateQueuedDraftField(queuedCallerId, "feedbackText", nextValue);
    } else if (activeSession) {
      updateSessionField(activeSession.id, "feedbackText", nextValue);
    }
    const pos = nextValue.length;
    editorRef.current?.syncValue(nextValue, { start: pos, end: pos });
  }, [activeSession, queuedCallerId, updateQueuedDraftField, updateSessionField]);

  useEffect(() => {
    const handleInsertText = (event: Event) => {
      const detail = (event as CustomEvent<InsertFeedbackTextEventDetail>).detail;
      if (!detail?.text) return;
      const matchesQueuedDraft = !!queuedCallerId && detail.kind === "queuedDraft" && detail.callerId === queuedCallerId;
      const matchesSession = !queuedCallerId && !!activeSession && detail.kind === "feedback" && detail.sessionId === activeSession.id;
      if (!matchesQueuedDraft && !matchesSession) return;

      editorRef.current?.insertText(detail.text);
    };

    window.addEventListener("mlfb-insert-feedback-text", handleInsertText);
    return () => window.removeEventListener("mlfb-insert-feedback-text", handleInsertText);
  }, [activeSession, queuedCallerId]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>, selection: { start: number; end: number }) => {
    if (isReadonly || (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Escape")) return;
    const callerId = queuedCallerId || activeSession?.callerId || caller?.id;
    if (!callerId) return;

    if (e.key === "Escape" && historyIndexRef.current !== null) {
      e.preventDefault();
      setCurrentValue(historyScratchRef.current);
      historyIndexRef.current = null;
      return;
    }

    if (selection.start !== selection.end) return;
    const before = value.slice(0, selection.start);
    const after = value.slice(selection.end);
    const atFirstLine = !before.includes("\n");
    const atLastLine = !after.includes("\n");
    const history = useFeedbackStore.getState().getMessageHistory(callerId);
    if (history.length === 0) return;

    if (e.key === "ArrowUp" && atFirstLine) {
      e.preventDefault();
      if (historyIndexRef.current === null) {
        historyScratchRef.current = value;
        historyIndexRef.current = history.length - 1;
      } else {
        historyIndexRef.current = Math.max(0, historyIndexRef.current - 1);
      }
      setCurrentValue(history[historyIndexRef.current] || "");
    } else if (e.key === "ArrowDown" && historyIndexRef.current !== null && atLastLine) {
      e.preventDefault();
      const nextIndex = historyIndexRef.current + 1;
      if (nextIndex >= history.length) {
        setCurrentValue(historyScratchRef.current);
        historyIndexRef.current = null;
      } else {
        historyIndexRef.current = nextIndex;
        setCurrentValue(history[nextIndex] || "");
      }
    }
  }, [activeSession, caller, isReadonly, queuedCallerId, setCurrentValue, value]);

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            const namedFile = new File([file], `clipboard_${Date.now()}.png`, { type: file.type });
            const reader = new FileReader();
            reader.onload = (ev) => {
              const imgData = {
                path: `blob:clipboard:${Date.now()}`,
                name: namedFile.name,
                sizeKB: namedFile.size / 1024,
                dataUrl: ev.target?.result as string,
              };
              if (queuedCallerId) {
                addQueuedDraftImage(queuedCallerId, imgData);
              } else if (activeSession) {
                addSessionImage(activeSession.id, imgData);
              }
            };
            reader.readAsDataURL(namedFile);
            e.preventDefault();
          }
        }
      }
    },
    [activeSession, addSessionImage, queuedCallerId, addQueuedDraftImage]
  );

  const aliasLabel = caller?.alias ? `${friendlyName(caller.alias)} (${caller.alias})` : caller?.name || "AI";
  const placeholderText = queuedCallerId
    ? ""
    : caller?.alias
      ? t("feedback.placeholderWithAlias", { alias: aliasLabel, defaultValue: "Send feedback to {{alias}}...\nCtrl+Enter to submit, Ctrl+V to paste images" })
      : t("feedback.placeholder");
  const draftPlaceholderLine = t("feedback.draftPlaceholderLine", {
    alias: aliasLabel,
    defaultValue: "Prepare feedback for {{alias}} (draft)...",
  });
  const draftPasteHint = t("feedback.draftPasteHint", "Ctrl+V to paste images");

  const editor = (
    <ComposerEditor
      ref={editorRef}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onFocus={handleFocus}
      readOnly={isReadonly}
      placeholder={placeholderText}
      className="input-area"
      containerClassName={minHeight === undefined ? "flex-1" : undefined}
      projectDirectory={activeSession?.projectDirectory || ""}
      commands={composerCommands}
      style={{
        minHeight: minHeight ?? 0,
        height: minHeight === undefined ? "100%" : undefined,
        overflow: minHeight !== undefined ? "hidden" : undefined,
        resize: minHeight !== undefined ? "none" as const : undefined,
        flexShrink: minHeight !== undefined ? 0 : undefined,
        opacity: isReadonly ? 0.6 : 1,
        userSelect: isReadonly ? "text" : undefined,
        cursor: isReadonly ? "text" : undefined,
      }}
    />
  );

  if (queuedCallerId) {
    return (
      <div className={minHeight === undefined ? "relative flex-1 min-h-0" : "relative"} style={{ width: "100%" }}>
        {editor}
        {!value && (
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 10,
              right: 10,
              pointerEvents: "none",
              color: "var(--color-text-muted)",
              fontSize: 13,
              lineHeight: 1.6,
              zoom: "var(--zoom-input, 1)",
            }}
          >
            <div style={{ fontWeight: 700 }}>{draftPlaceholderLine}</div>
            <div>{draftPasteHint}</div>
          </div>
        )}
      </div>
    );
  }

  return editor;
}
