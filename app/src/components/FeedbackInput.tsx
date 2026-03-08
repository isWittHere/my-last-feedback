import { useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../store/feedbackStore";
import { useShallow } from "zustand/react/shallow";
import { useActiveCallerSession } from "./useActiveCallerSession";

export function FeedbackInput({ minHeight }: { minHeight?: number } = {}) {
  const { t } = useTranslation();
  const appMode = useFeedbackStore((s) => s.appMode);
  const { session: activeSession, caller } = useActiveCallerSession();
  const { feedbackText, setFeedbackText, updateSessionField, addSessionImage } = useFeedbackStore(useShallow((s) => ({
    feedbackText: s.feedbackText,
    setFeedbackText: s.setFeedbackText,
    updateSessionField: s.updateSessionField,
    addSessionImage: s.addSessionImage,
  })));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isPersistent = appMode === "persistent";
  const value = isPersistent ? (activeSession?.feedbackText || "") : feedbackText;
  const isReadonly = isPersistent && (activeSession?.status === "responded" || activeSession?.status === "cancelled");

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-resize when in scroll mode (minHeight provided)
  useEffect(() => {
    if (minHeight !== undefined && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const h = Math.max(textareaRef.current.scrollHeight, minHeight);
      textareaRef.current.style.height = h + "px";
    }
  }, [value, minHeight]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isPersistent && activeSession) {
      updateSessionField(activeSession.id, "feedbackText", e.target.value);
    } else {
      setFeedbackText(e.target.value);
    }
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
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
              if (isPersistent && activeSession) {
                addSessionImage(activeSession.id, imgData);
              } else {
                useFeedbackStore.getState().addImage(imgData);
              }
            };
            reader.readAsDataURL(namedFile);
            e.preventDefault();
          }
        }
      }
    },
    [isPersistent, activeSession, addSessionImage]
  );

  const placeholderText = isPersistent && caller?.alias
    ? t("feedback.placeholderWithAlias", { alias: caller.alias, defaultValue: "Send feedback to {{alias}}...\nCtrl+Enter to submit, Ctrl+V to paste images" })
    : t("feedback.placeholder");

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={handleChange}
      onPaste={handlePaste}
      readOnly={isReadonly}
      placeholder={placeholderText}
      className={`input-area${minHeight === undefined ? " flex-1" : ""}`}
      style={{
        minHeight: minHeight ?? 0,
        height: minHeight === undefined ? "100%" : undefined,
        overflow: minHeight !== undefined ? "hidden" : undefined,
        resize: minHeight !== undefined ? "none" as const : undefined,
        flexShrink: minHeight !== undefined ? 0 : undefined,
        opacity: isReadonly ? 0.6 : 1,
      }}
    />
  );
}
