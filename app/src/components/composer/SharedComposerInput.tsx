import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ComposerEditor, type ComposerEditorHandle } from "./ComposerEditor";
import { Icon, MlcLogoIcon } from "../Icons";
import { ImageTag, MlcAttachmentTag, WebAttachmentTag } from "../CallerPanelParts";
import type { ImageAttachment, MlcAttachment, WebAttachment } from "../../store/feedbackStore";
import type { PromptCommandOption } from "../../composer/promptCommands";

interface TextRange {
  start: number;
  end: number;
}

interface InsertComposerTextEventDetail {
  callerId: string;
  sessionId?: string;
  kind: string;
  text: string;
}

export interface SharedComposerInputProps {
  id: string;
  value: string;
  projectDirectory: string;
  placeholder: string;
  placeholderContent?: ReactNode;
  commands: PromptCommandOption[];
  readOnly?: boolean;
  images: ImageAttachment[];
  mlcAttachments: MlcAttachment[];
  webAttachments: WebAttachment[];
  onChange: (value: string) => void;
  onFocus?: () => void;
  onEditorKeyDown?: (event: KeyboardEvent<HTMLDivElement>, selection: TextRange) => void;
  onAddImage: (image: ImageAttachment) => void;
  onRemoveImage: (path: string) => void;
  onClearImages: () => void;
  onRemoveMlcAttachment: (filePath: string) => void;
  onClearMlcAttachments: () => void;
  onRemoveWebAttachment: (attachmentId: string) => void;
  onSubmit: () => void;
  attachmentActionButtons?: ReactNode;
  attachmentMiddleTags?: ReactNode;
  hasAttachmentMiddleTags?: boolean;
  expandedAttachmentPanels?: ReactNode;
  bottomLeftSlot?: ReactNode;
  submitControl?: ReactNode;
  editorContainerClassName?: string;
  editorClassName?: string;
  editorStyle?: CSSProperties;
  insertEventTarget?: {
    callerId: string;
    sessionId?: string;
    kind: string;
  };
}

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];

function isImageFile(file: File): boolean {
  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return file.type.startsWith("image/") || IMAGE_EXTENSIONS.includes(extension);
}

function fileToImageAttachment(file: File): Promise<ImageAttachment | null> {
  if (!isImageFile(file)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve({
      name: file.name,
      path: `blob:${file.name}:${Date.now()}`,
      sizeKB: file.size / 1024,
      dataUrl: event.target?.result as string,
    });
    reader.readAsDataURL(file);
  });
}

export function SharedComposerInput({
  id,
  value,
  projectDirectory,
  placeholder,
  placeholderContent,
  commands,
  readOnly,
  images,
  mlcAttachments,
  webAttachments,
  onChange,
  onFocus,
  onEditorKeyDown,
  onAddImage,
  onRemoveImage,
  onClearImages,
  onRemoveMlcAttachment,
  onClearMlcAttachments,
  onRemoveWebAttachment,
  onSubmit,
  attachmentActionButtons,
  attachmentMiddleTags,
  hasAttachmentMiddleTags,
  expandedAttachmentPanels,
  bottomLeftSlot,
  submitControl,
  editorContainerClassName,
  editorClassName,
  editorStyle,
  insertEventTarget,
}: SharedComposerInputProps) {
  const { t } = useTranslation();
  const editorRef = useRef<ComposerEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const hasAttachmentTags = images.length > 0 || Boolean(hasAttachmentMiddleTags) || mlcAttachments.length > 0 || webAttachments.length > 0;

  useEffect(() => {
    editorRef.current?.focus();
  }, [id]);

  useEffect(() => {
    if (!insertEventTarget) return;
    const handleInsertText = (event: Event) => {
      const detail = (event as CustomEvent<InsertComposerTextEventDetail>).detail;
      if (!detail?.text) return;
      if (detail.kind !== insertEventTarget.kind) return;
      if (detail.callerId !== insertEventTarget.callerId) return;
      if (insertEventTarget.sessionId && detail.sessionId !== insertEventTarget.sessionId) return;
      editorRef.current?.insertText(detail.text);
    };
    window.addEventListener("mlfb-insert-feedback-text", handleInsertText);
    return () => window.removeEventListener("mlfb-insert-feedback-text", handleInsertText);
  }, [insertEventTarget]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    if (readOnly) return;
    for (const file of Array.from(files)) {
      const image = await fileToImageAttachment(file);
      if (image) onAddImage(image);
    }
  }, [onAddImage, readOnly]);

  const openImagePicker = useCallback(() => {
    if (readOnly) return;
    requestAnimationFrame(() => fileInputRef.current?.click());
  }, [readOnly]);

  const handlePaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    const files = Array.from(items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (files.length === 0) return;
    event.preventDefault();
    void addFiles(files.map((file) => new File([file], `clipboard_${Date.now()}.png`, { type: file.type })));
  }, [addFiles]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    setDragOver(false);
    if (event.dataTransfer.files.length === 0) return;
    event.preventDefault();
    void addFiles(event.dataTransfer.files);
  }, [addFiles]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>, _selection: TextRange) => {
    onEditorKeyDown?.(event, _selection);
    if (event.defaultPrevented) return;
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  }, [onEditorKeyDown, onSubmit]);

  return (
    <div className="agent-composer-frame">
      <div
        className="agent-composer-attachment-area"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={dragOver ? { outline: "2px dashed var(--color-primary)", outlineOffset: -2 } : undefined}
      >
        <div className="attachment-action-row px-3 pt-1.5 pb-0.5">
          <button type="button" className="btn" title={t("images.dropHint", "Drop or paste images")} onClick={openImagePicker}>
            <Icon name="image" size={12} />
            <span className="attachment-action-label">{t("images.attach", "Attach")}</span>
            {images.length > 0 && (
              <span className="attachment-action-meta" style={{ color: "var(--color-text-muted)" }}>{images.length}</span>
            )}
          </button>
          {attachmentActionButtons}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={IMAGE_EXTENSIONS.join(",")}
            className="hidden"
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </div>
        {hasAttachmentTags && (
          <div className="attachment-tag-row flex flex-wrap gap-1 px-3 pb-1 overflow-y-auto" style={{ maxHeight: 78 }}>
            {images.length > 0 && (
              <div className="attachment-tag attachment-tag-danger" onClick={onClearImages} title={t("images.clearAll", "Clear all images")}>
                <Icon name="trash" size={10} />
                <Icon name="image" size={10} />
              </div>
            )}
            {images.map((image) => <ImageTag key={image.path} img={image} onRemove={() => onRemoveImage(image.path)} />)}
            {attachmentMiddleTags}
            {mlcAttachments.length > 0 && (
              <div className="attachment-tag attachment-tag-danger" onClick={onClearMlcAttachments} title={t("mlc.clearAll", "Clear all MLC")}>
                <Icon name="trash" size={10} />
                <MlcLogoIcon size={10} />
              </div>
            )}
            {mlcAttachments.map((attachment) => <MlcAttachmentTag key={attachment.filePath} attachment={attachment} onRemove={() => onRemoveMlcAttachment(attachment.filePath)} />)}
            {webAttachments.map((attachment) => <WebAttachmentTag key={attachment.id} attachment={attachment} onRemove={() => onRemoveWebAttachment(attachment.id)} />)}
          </div>
        )}
        {expandedAttachmentPanels}
      </div>
      <ComposerEditor
        ref={editorRef}
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={onFocus}
        readOnly={readOnly}
        placeholder={placeholder}
        placeholderContent={placeholderContent}
        className={editorClassName || "input-area agent-composer-input"}
        containerClassName={editorContainerClassName || "agent-composer-editor-host"}
        projectDirectory={projectDirectory}
        commands={commands}
        style={editorStyle || { height: "100%", minHeight: 0, overflowY: "auto", overflowX: "hidden", overscrollBehaviorY: "contain" }}
      />
      <div className="agent-composer-actions" data-preview-overlay>
        {bottomLeftSlot}
        <div className="flex-1" />
        {submitControl ?? (
          <button type="button" className="agent-send-button" onClick={onSubmit} disabled={!value.trim()} title={t("agentConsole.send", "Send")}>
            <Icon name="send" size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
