import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useFeedbackStore, type MlcAttachment } from "../store/feedbackStore";
import { useAgentStore } from "../store/agentStore";
import { Icon, MlcLogoIcon } from "./Icons";
import { MarkdownHeadingNav, parseMarkdownHeadings } from "./MarkdownHeadingNav";
import { MarkdownContent } from "./MarkdownContent";
import { getMlcTypeColor, getMlcTypeConfig, getMlcTypeLabel } from "./mlcTypeConfig";
import { useIsLightTheme } from "./useIsLightTheme";
import { cleanDisplayPath } from "../workspace/workspacePaths";

interface MlcDocumentContent {
  filePath: string;
  title: string;
  markdown: string;
  frontmatterRaw: string;
  updatedAt: string;
}

interface FrontmatterRow {
  key: string;
  value: string;
}

function parseFrontmatterRows(raw: string): FrontmatterRow[] {
  const lines = raw.split(/\r?\n/);
  const rows: FrontmatterRow[] = [];
  let current: FrontmatterRow | null = null;
  const topLevel = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/;
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = /^(\S[^:]*?):\s*(.*)$/.exec(line);
    const isTop = !line.startsWith(" ") && !line.startsWith("\t") && topLevel.test(line);
    if (isTop && m) {
      if (current) rows.push(current);
      current = { key: m[1].trim(), value: m[2].trim() };
    } else if (current) {
      current.value += (current.value ? "\n" : "") + line.replace(/^\s+/, "").replace(/^-\s+/, "");
    }
  }
  if (current) rows.push(current);
  return rows;
}

function formatTime(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export function MlcPreviewPanel() {
  const { t } = useTranslation();
  const isLightTheme = useIsLightTheme();
  const selectedDocument = useFeedbackStore((state) => state.selectedMlcDocument);
  const mlcPreviewShowYaml = useFeedbackStore((state) => state.mlcPreviewShowYaml);
  const focusedComposer = useFeedbackStore((state) => state.focusedComposer);
  const addSessionMlcAttachment = useFeedbackStore((state) => state.addSessionMlcAttachment);
  const addQueuedDraftMlcAttachment = useFeedbackStore((state) => state.addQueuedDraftMlcAttachment);
  const addAgentMlcAttachment = useAgentStore((state) => state.addMlcAttachment);
  const [content, setContent] = useState<MlcDocumentContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeHeadingIndex, setActiveHeadingIndex] = useState(0);
  const headings = useMemo(() => parseMarkdownHeadings(content?.markdown || ""), [content?.markdown]);
  const frontmatterRaw = content?.frontmatterRaw?.trim() || "";
  const frontmatterRows = useMemo(() => parseFrontmatterRows(frontmatterRaw), [frontmatterRaw]);

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
    invoke<MlcDocumentContent>("mlc_read_document", {
      filePath: selectedDocument.filePath,
      workspacePath: selectedDocument.workspacePath || null,
    })
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
    if (focusedComposer.kind === "agent" && focusedComposer.sessionId) addAgentMlcAttachment(focusedComposer.sessionId, attachment);
    else if (focusedComposer.kind === "queuedDraft") addQueuedDraftMlcAttachment(focusedComposer.callerId, attachment);
    else if (focusedComposer.sessionId) addSessionMlcAttachment(focusedComposer.sessionId, attachment);
  }, [addAgentMlcAttachment, addQueuedDraftMlcAttachment, addSessionMlcAttachment, focusedComposer, selectedDocument]);

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
  const isResource = selectedDocument.source === "resource";
  const typeConfig = isResource ? undefined : getMlcTypeConfig(selectedDocument.type);
  const typeColor = isResource
    ? "var(--color-primary)"
    : getMlcTypeColor(selectedDocument.type, isLightTheme) || "var(--color-primary)";
  const typeLabel = isResource
    ? t("mlcPreview.markdownFile", "Markdown")
    : getMlcTypeLabel(selectedDocument.type);
  const typeIconName = isResource ? "file-text" : (typeConfig?.icon || "file-text");

  return (
    <div className="mlc-preview-panel" style={{ "--caller-color": typeColor, "--mlc-preview-accent": typeColor } as CSSProperties}>
      <div className="mlc-preview-header">
        <div className="mlc-preview-title-block">
          <div className="mlc-preview-title" title={selectedDocument.title}>{content?.title || selectedDocument.title}</div>
          <div className="mlc-preview-meta" title={displayedPath}>
            <div className="mlc-preview-kicker">
              <Icon name={typeIconName} size={13} color={typeColor} />
              <span>{typeLabel || t("mlcPreview.document", "Document")}</span>
            </div>
            <span>{selectedDocument.workspaceName}</span>
            {selectedDocument.folderName ? <span>{selectedDocument.folderName}</span> : null}
            <span>{formatTime(content?.updatedAt || selectedDocument.updatedAt)}</span>
            <div className="mlc-preview-actions">
              <button type="button" onClick={handleCopyPath} title={t("mlc.copyPath", "Copy link")}> <Icon name="copy" size={13} /> </button>
              <button type="button" onClick={handleAttach} disabled={!focusedComposer} title={t("mlc.insertToChat", "Insert to chat")}> <Icon name="arrow-bend-down-right" size={13} /> </button>
              <button type="button" onClick={loadDocument} title={t("mlcPreview.refresh", "Refresh")}> <Icon name="spinner" size={13} /> </button>
            </div>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="mlc-preview-body">
        {loading ? (
          <div className="mlc-preview-state"><Icon name="spinner" size={24} className="animate-spin" /><div>{t("mlc.loading", "Loading...")}</div></div>
        ) : error ? (
          <div className="mlc-preview-state error"><Icon name="circle-x" size={24} /><div>{error}</div></div>
        ) : content ? (
          <>
            {frontmatterRows.length > 0 && mlcPreviewShowYaml ? (
              <div className="mlc-preview-frontmatter" aria-label={t("mlcPreview.frontmatter", "Frontmatter")}>
                <table className="mlc-preview-frontmatter-table">
                  <tbody>
                    {frontmatterRows.map((row) => (
                      <tr key={row.key}>
                        <th scope="row">{row.key}</th>
                        <td>
                          {row.value.split(/\r?\n/).map((line, idx, arr) => (
                            <span key={idx}>
                              {line}
                              {idx < arr.length - 1 ? <br /> : null}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <MarkdownContent markdown={content.markdown || `# ${content.title}`} projectDirectory={selectedDocument.workspacePath} className="mlc-preview-markdown" />
          </>
        ) : null}
      </div>
      {content && headings.length > 0 ? <MarkdownHeadingNav headings={headings} scrollContainerRef={scrollRef} activeIndex={activeHeadingIndex} /> : null}
    </div>
  );
}
