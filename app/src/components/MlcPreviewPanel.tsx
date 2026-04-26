import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useFeedbackStore, type MlcAttachment } from "../store/feedbackStore";
import { Icon, MlcLogoIcon } from "./Icons";
import { MarkdownHeadingNav, parseMarkdownHeadings } from "./MarkdownHeadingNav";
import { MarkdownContent } from "./MarkdownContent";
import { getMlcTypeColor, getMlcTypeConfig, getMlcTypeLabel } from "./mlcTypeConfig";
import { useIsLightTheme } from "./useIsLightTheme";

interface MlcDocumentContent {
  filePath: string;
  title: string;
  markdown: string;
  updatedAt: string;
}

function formatTime(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function cleanDisplayPath(path: string): string {
  return path.replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
}

export function MlcPreviewPanel() {
  const { t } = useTranslation();
  const isLightTheme = useIsLightTheme();
  const selectedDocument = useFeedbackStore((state) => state.selectedMlcDocument);
  const focusedComposer = useFeedbackStore((state) => state.focusedComposer);
  const addSessionMlcAttachment = useFeedbackStore((state) => state.addSessionMlcAttachment);
  const addQueuedDraftMlcAttachment = useFeedbackStore((state) => state.addQueuedDraftMlcAttachment);
  const [content, setContent] = useState<MlcDocumentContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeHeadingIndex, setActiveHeadingIndex] = useState(0);
  const headings = useMemo(() => parseMarkdownHeadings(content?.markdown || ""), [content?.markdown]);

  const loadDocument = useCallback(() => {
    if (!selectedDocument) {
      setContent(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    invoke<MlcDocumentContent>("mlc_read_document", { filePath: selectedDocument.filePath })
      .then((result) => {
        if (!cancelled) setContent(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setContent(null);
          setError(String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDocument]);

  useEffect(() => loadDocument(), [loadDocument]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || headings.length === 0) return;
    const onScroll = () => {
      const headingElements = container.querySelectorAll("h1, h2, h3, h4");
      let active = 0;
      for (let index = 0; index < headingElements.length; index += 1) {
        const rect = headingElements[index].getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.top - containerRect.top <= 40) active = index;
      }
      setActiveHeadingIndex(active);
    };
    onScroll();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [headings]);

  const handleCopyPath = useCallback(() => {
    if (selectedDocument) navigator.clipboard.writeText(cleanDisplayPath(selectedDocument.filePath));
  }, [selectedDocument]);

  const handleAttach = useCallback(() => {
    if (!selectedDocument || !focusedComposer) return;
    const attachment: MlcAttachment = {
      filePath: cleanDisplayPath(selectedDocument.filePath),
      title: selectedDocument.title,
      description: selectedDocument.description,
    };
    if (focusedComposer.kind === "queuedDraft") addQueuedDraftMlcAttachment(focusedComposer.callerId, attachment);
    else if (focusedComposer.sessionId) addSessionMlcAttachment(focusedComposer.sessionId, attachment);
  }, [addQueuedDraftMlcAttachment, addSessionMlcAttachment, focusedComposer, selectedDocument]);

  if (!selectedDocument) {
    return (
      <div className="mlc-preview-panel">
        <div className="mlc-preview-empty">
          <MlcLogoIcon size={28} />
          <div>{t("mlcPreview.empty", "Select an MLC document to preview")}</div>
        </div>
      </div>
    );
  }

  const displayedPath = cleanDisplayPath(selectedDocument.filePath);
  const typeConfig = getMlcTypeConfig(selectedDocument.type);
  const typeColor = getMlcTypeColor(selectedDocument.type, isLightTheme) || "var(--color-primary)";
  const typeLabel = getMlcTypeLabel(selectedDocument.type);

  return (
    <div className="mlc-preview-panel" style={{ "--caller-color": typeColor, "--mlc-preview-accent": typeColor } as CSSProperties}>
      <div className="mlc-preview-header">
        <div className="mlc-preview-title-block">
          <div className="mlc-preview-kicker">
            <Icon name={typeConfig?.icon || "file-text"} size={13} color={typeColor} />
            <span>{typeLabel || t("mlcPreview.document", "Document")}</span>
          </div>
          <div className="mlc-preview-title" title={selectedDocument.title}>{content?.title || selectedDocument.title}</div>
          <div className="mlc-preview-meta" title={displayedPath}>
            <span>{selectedDocument.workspaceName}</span>
            {selectedDocument.folderName ? <span>{selectedDocument.folderName}</span> : null}
            <span>{formatTime(content?.updatedAt || selectedDocument.updatedAt)}</span>
          </div>
        </div>
        <div className="mlc-preview-actions">
          <button type="button" onClick={handleCopyPath} title={t("mlc.copyPath", "Copy link")}> <Icon name="copy" size={13} /> </button>
          <button type="button" onClick={handleAttach} disabled={!focusedComposer} title={t("mlc.insertToChat", "Insert to chat")}> <Icon name="arrow-bend-down-right" size={13} /> </button>
          <button type="button" onClick={loadDocument} title={t("mlcPreview.refresh", "Refresh")}> <Icon name="spinner" size={13} /> </button>
        </div>
      </div>

      <div ref={scrollRef} className="mlc-preview-body">
        {loading ? (
          <div className="mlc-preview-state"><Icon name="spinner" size={24} className="animate-spin" /><div>{t("mlc.loading", "Loading...")}</div></div>
        ) : error ? (
          <div className="mlc-preview-state error"><Icon name="circle-x" size={24} /><div>{error}</div></div>
        ) : content ? (
          <MarkdownContent markdown={content.markdown || `# ${content.title}`} projectDirectory={selectedDocument.workspacePath} className="mlc-preview-markdown" />
        ) : null}
      </div>
      {content && headings.length > 0 ? <MarkdownHeadingNav headings={headings} scrollContainerRef={scrollRef} activeIndex={activeHeadingIndex} /> : null}
    </div>
  );
}
