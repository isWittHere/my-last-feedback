import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useFeedbackStore, IMAGE_MAX_COUNT, IMAGE_MAX_SIZE_MB, IMAGE_MAX_TOTAL_MB } from "../store/feedbackStore";
import { useShallow } from "zustand/react/shallow";
import type { ImageAttachment } from "../store/feedbackStore";
import { useActiveCallerSession } from "./useActiveCallerSession";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];
const THUMBNAIL_SIZE = 64;

function isImageFile(name: string): boolean {
  const ext = name.toLowerCase().slice(name.lastIndexOf("."));
  return IMAGE_EXTENSIONS.includes(ext);
}

async function fileToAttachment(file: File): Promise<ImageAttachment | null> {
  if (!isImageFile(file.name)) return null;
  const sizeKB = file.size / 1024;
  if (sizeKB / 1024 > IMAGE_MAX_SIZE_MB) return null;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve({
        path: `blob:${file.name}:${Date.now()}`,
        name: file.name,
        sizeKB,
        dataUrl: e.target?.result as string,
      });
    };
    reader.readAsDataURL(file);
  });
}

interface RenderParts {
  controls: React.ReactNode;
  thumbnails: React.ReactNode;
  fileInput: React.ReactNode;
  dropProps: {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
    isDragOver: boolean;
  };
}

export function ImageAttachmentWidget({ children, renderLayout }: {
  children?: React.ReactNode;
  renderLayout?: (parts: RenderParts) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const appMode = useFeedbackStore((s) => s.appMode);
  const { session: activeSession } = useActiveCallerSession();
  const { images: legacyImages, addImage, removeImage, addSessionImage, removeSessionImage } = useFeedbackStore(useShallow((s) => ({
    images: s.images,
    addImage: s.addImage,
    removeImage: s.removeImage,
    addSessionImage: s.addSessionImage,
    removeSessionImage: s.removeSessionImage,
  })));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const isPersistent = appMode === "persistent";
  const images = isPersistent ? (activeSession?.images || []) : legacyImages;

  const handleRemove = (path: string) => {
    if (isPersistent && activeSession) {
      removeSessionImage(activeSession.id, path);
    } else {
      removeImage(path);
    }
  };

  const handleAdd = (img: ImageAttachment) => {
    if (isPersistent && activeSession) {
      addSessionImage(activeSession.id, img);
    } else {
      addImage(img);
    }
  };

  const canAdd = images.length < IMAGE_MAX_COUNT;
  const totalMB = images.reduce((acc, i) => acc + i.sizeKB / 1024, 0);

  // Toast notification for upload errors
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const errors: string[] = [];
      let currentCount = images.length;
      let currentTotalMB = images.reduce((acc, i) => acc + i.sizeKB / 1024, 0);

      for (const file of Array.from(files)) {
        if (currentCount >= IMAGE_MAX_COUNT) {
          errors.push(t("images.errorMaxCount", { max: IMAGE_MAX_COUNT, defaultValue: `Max {{max}} images` }));
          break;
        }
        const fileMB = file.size / 1024 / 1024;
        if (!isImageFile(file.name)) {
          errors.push(t("images.errorInvalidType", { name: file.name, defaultValue: `"{{name}}" is not a supported image format` }));
          continue;
        }
        if (fileMB > IMAGE_MAX_SIZE_MB) {
          errors.push(t("images.errorFileSize", { name: file.name, max: IMAGE_MAX_SIZE_MB, defaultValue: `"{{name}}" exceeds {{max}} MB limit` }));
          continue;
        }
        if (currentTotalMB + fileMB > IMAGE_MAX_TOTAL_MB) {
          errors.push(t("images.errorTotalSize", { max: IMAGE_MAX_TOTAL_MB, defaultValue: `Total size exceeds {{max}} MB limit` }));
          break;
        }
        const attachment = await fileToAttachment(file);
        if (attachment) {
          handleAdd(attachment);
          currentCount++;
          currentTotalMB += fileMB;
        }
      }
      if (errors.length > 0) {
        showToast(errors.join("\n"));
      }
    },
    [images, handleAdd, showToast, t]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const sizeLabel = totalMB >= 1
    ? `${totalMB.toFixed(1)} MB`
    : `${(totalMB * 1024).toFixed(0)} KB`;

  const controlsNode = (
    <div
      className="flex items-center gap-2"
    >
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={!canAdd}
        className="btn"
        style={{
          fontSize: 11,
          padding: "3px 10px",
          background: "#2a2d42",
          borderColor: "#3a3f5c",
          opacity: canAdd ? 1 : 0.4,
          cursor: canAdd ? "pointer" : "not-allowed",
        }}
        title={t("images.dropHint", { max: IMAGE_MAX_COUNT })}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
        {t("images.attach")}
        {images.length > 0 && (
          <span style={{ color: "var(--color-text-muted)", marginLeft: 2 }}>
            {images.length}/{IMAGE_MAX_COUNT} · {sizeLabel}
          </span>
        )}
      </button>
      {children}
    </div>
  );

  const thumbnailsNode = images.length > 0 ? (
    <div
      className="flex gap-2 overflow-x-auto py-1 px-1 rounded-lg shrink-0"
      style={{
        background: dragOver ? "var(--color-primary-subtle, #2a2d42)" : "var(--color-bg-input)",
        minHeight: THUMBNAIL_SIZE + 28,
      }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {images.map((img) => (
        <ImageThumb key={img.path} img={img} onRemove={handleRemove} />
      ))}
    </div>
  ) : null;

  const fileInputNode = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      accept={IMAGE_EXTENSIONS.join(",")}
      className="hidden"
      onChange={(e) => e.target.files && handleFiles(e.target.files)}
    />
  );

  const toastNode = toast ? createPortal(
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#1e1e2e",
        border: "1px solid #ef4444",
        borderRadius: 6,
        padding: "8px 16px",
        color: "#fca5a5",
        fontSize: 12,
        whiteSpace: "pre-line",
        zIndex: 99999,
        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        maxWidth: "80vw",
        pointerEvents: "none",
      }}
    >
      {toast}
    </div>,
    document.body
  ) : null;

  if (renderLayout) {
    return <>{renderLayout({
      controls: controlsNode,
      thumbnails: thumbnailsNode,
      fileInput: fileInputNode,
      dropProps: {
        onDragOver: (e: React.DragEvent) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragOver(true);
          }
        },
        onDragLeave: () => setDragOver(false),
        onDrop: handleDrop,
        isDragOver: dragOver,
      },
    })}{toastNode}</>;
  }

  return (
    <div className="flex flex-col gap-1">
      {controlsNode}
      {thumbnailsNode}
      {fileInputNode}
      {toastNode}
    </div>
  );
}

function ImageThumb({ img, onRemove }: { img: ImageAttachment; onRemove: (path: string) => void }) {
  const size = img.sizeKB >= 1024
    ? `${(img.sizeKB / 1024).toFixed(1)} MB`
    : `${img.sizeKB.toFixed(0)} KB`;

  return (
    <div
      className="group relative flex-shrink-0 flex flex-col items-center gap-0.5"
      style={{ width: THUMBNAIL_SIZE + 4 }}
      title={`${img.name}\n${size}`}
    >
      <div
        className="flex items-center justify-center overflow-hidden rounded"
        style={{
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          background: "#12121a",
          border: "1px solid var(--color-border)",
          position: "relative",
        }}
      >
        {img.dataUrl ? (
          <img src={img.dataUrl} alt={img.name} className="object-cover w-full h-full" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
        )}
        <button
          onClick={() => onRemove(img.path)}
          className="absolute top-0.5 right-0.5 items-center justify-center rounded-sm hidden group-hover:flex"
          style={{
            width: 16, height: 16,
            background: "var(--color-danger)",
            border: "none",
            color: "#fff",
            fontSize: 9,
            cursor: "pointer",
            lineHeight: 1,
          }}
          title="Remove"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <span
        className="text-center truncate w-full"
        style={{ color: "var(--color-text-muted)", fontSize: 9 }}
      >
        {img.name.length > 10 ? img.name.slice(0, 9) + "…" : img.name}
      </span>
    </div>
  );
}
