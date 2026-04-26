import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../store/feedbackStore";
import type { GitActionType, MlcAttachment } from "../store/feedbackStore";
import { useShallow } from "zustand/react/shallow";
import { Icon } from "./Icons";
import { useActiveCallerSession } from "./useActiveCallerSession";
import { readText as readClipboardText } from "@tauri-apps/plugin-clipboard-manager";

/** Attachment tag bar: images + test log + git actions as compact tags */
export function AttachmentTagBar({
  controls,
  fileInput,
  showTestLog,
  setShowTestLog,
  testLogRef,
  callerColor,
  showGitPanel,
  setShowGitPanel,
  queuedCallerId,
}: {
  controls: React.ReactNode;
  fileInput: React.ReactNode;
  showTestLog: boolean;
  setShowTestLog: (fn: (v: boolean) => boolean) => void;
  callerColor: string;
  testLogRef: React.RefObject<HTMLTextAreaElement | null>;
  showGitPanel: boolean;
  setShowGitPanel: (fn: (v: boolean) => boolean) => void;
  queuedCallerId?: string;
}) {
  const { t } = useTranslation();
  const { session: activeSession, caller } = useActiveCallerSession();
  const queuedDraft = useFeedbackStore((s) => queuedCallerId ? s.queuedDraftsByCallerId[queuedCallerId] : null);
  const removeSessionImage = useFeedbackStore((s) => s.removeSessionImage);
  const clearSessionImages = useFeedbackStore((s) => s.clearSessionImages);
  const updateSessionField = useFeedbackStore((s) => s.updateSessionField);
  const setSessionGitAction = useFeedbackStore((s) => s.setSessionGitAction);
  const updateSessionGitBranchName = useFeedbackStore((s) => s.updateSessionGitBranchName);
  const removeQueuedDraftImage = useFeedbackStore((s) => s.removeQueuedDraftImage);
  const clearQueuedDraftImages = useFeedbackStore((s) => s.clearQueuedDraftImages);
  const updateQueuedDraftField = useFeedbackStore((s) => s.updateQueuedDraftField);
  const setQueuedDraftGitAction = useFeedbackStore((s) => s.setQueuedDraftGitAction);
  const updateQueuedDraftGitBranchName = useFeedbackStore((s) => s.updateQueuedDraftGitBranchName);
  const removeSessionMlcAttachment = useFeedbackStore((s) => s.removeSessionMlcAttachment);
  const removeQueuedDraftMlcAttachment = useFeedbackStore((s) => s.removeQueuedDraftMlcAttachment);
  const setFocusedComposer = useFeedbackStore((s) => s.setFocusedComposer);
  const setMlcPanelVisible = useFeedbackStore((s) => s.setMlcPanelVisible);
  const setMlcActiveWorkspacePath = useFeedbackStore((s) => s.setMlcActiveWorkspacePath);
  const targetImages = queuedCallerId ? (queuedDraft?.images || []) : (activeSession?.images || []);
  const targetTestLogText = queuedCallerId ? (queuedDraft?.testLogText || "") : (activeSession?.testLogText || "");
  const targetGitAction = queuedCallerId ? (queuedDraft?.gitAction || null) : (activeSession?.gitAction || null);
  const targetMlcAttachments = queuedCallerId ? (queuedDraft?.mlcAttachments || []) : (activeSession?.mlcAttachments || []);
  const images = targetImages;
  const hasTestLog = !!targetTestLogText.trim();
  const hasGitAction = !!targetGitAction;
  const hasMlcAttachments = targetMlcAttachments.length > 0;
  const hasTags = images.length > 0 || hasTestLog || showTestLog || hasGitAction || hasMlcAttachments;
  const tagAreaRef = useRef<HTMLDivElement>(null);
  const branchInputRef = useRef<HTMLInputElement>(null);

  const handleAttachLogClick = async () => {
    const wasHidden = !showTestLog;
    setShowTestLog((v) => !v);
    if (wasHidden && (activeSession || queuedCallerId)) {
      // Auto-paste clipboard text if > 50 chars and test log is empty
      if (!targetTestLogText.trim()) {
        try {
          const text = await readClipboardText();
          if (text && text.length > 50) {
            if (queuedCallerId) updateQueuedDraftField(queuedCallerId, "testLogText", text);
            else if (activeSession) updateSessionField(activeSession.id, "testLogText", text);
          }
        } catch { /* clipboard access denied or empty */ }
      }
      setTimeout(() => testLogRef.current?.focus(), 50);
    }
  };

  const handleMlcClick = () => {
    if (queuedCallerId) {
      if (!caller) return;
      setFocusedComposer({
        callerId: queuedCallerId,
        projectDirectory: activeSession?.projectDirectory || "",
        kind: "queuedDraft",
        focusedAt: new Date().toISOString(),
      });
      setMlcActiveWorkspacePath(activeSession?.projectDirectory || null);
      setMlcPanelVisible(true);
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
    setMlcActiveWorkspacePath(activeSession.projectDirectory);
    setMlcPanelVisible(true);
  };

  return (
    <div className="shrink-0">
      {/* Button row */}
      <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-0.5">
        {controls}
        <button
          className="btn"
          style={{
            fontSize: 11,
            padding: "3px 10px",
            background: showTestLog ? callerColor : undefined,
            borderColor: showTestLog ? callerColor : undefined,
            color: showTestLog ? "#fff" : undefined,
          }}
          onClick={handleAttachLogClick}
        >
          <Icon name="terminal" size={12} />
          {t("testLog.attach", "附加日志")}
          {targetTestLogText.length > 0 && (
            <span style={{ color: showTestLog ? "rgba(255,255,255,0.7)" : "var(--color-text-muted)", marginLeft: 2 }}>
              {targetTestLogText.length}
            </span>
          )}
        </button>
        <button
          className="btn"
          style={{
            fontSize: 11,
            padding: "3px 10px",
            background: showGitPanel ? callerColor : undefined,
            borderColor: showGitPanel ? callerColor : undefined,
            color: showGitPanel ? "#fff" : undefined,
          }}
          onClick={() => setShowGitPanel((v) => !v)}
        >
          <Icon name="git-branch" size={12} />
          {t("gitAction.button", "Git 操作")}
        </button>
        <button
          className="btn"
          style={{
            fontSize: 11,
            padding: "3px 10px",
            background: hasMlcAttachments ? callerColor : undefined,
            borderColor: hasMlcAttachments ? callerColor : undefined,
            color: hasMlcAttachments ? "#fff" : undefined,
          }}
          disabled={!queuedCallerId && (!activeSession || activeSession.status !== "pending")}
          onClick={handleMlcClick}
          title={t("mlc.openPanel", "Open My Last Chat references")}
        >
          <Icon name="book" size={12} />
          {t("mlc.button", "MLC")}
          {hasMlcAttachments && (
            <span style={{ color: hasMlcAttachments ? "rgba(255,255,255,0.7)" : "var(--color-text-muted)", marginLeft: 2 }}>
              {targetMlcAttachments.length}
            </span>
          )}
        </button>
        {fileInput}
      </div>

      {/* Tag area */}
      {hasTags && (
        <div
          ref={tagAreaRef}
          className="flex flex-wrap gap-1 px-3 pb-1 overflow-y-auto"
          style={{ maxHeight: 78 /* ~3 lines of tags */ }}
        >
          {images.length > 0 && (
            <div
              className="attachment-tag attachment-tag-danger"
              onClick={() => queuedCallerId ? clearQueuedDraftImages(queuedCallerId) : activeSession && clearSessionImages(activeSession.id)}
              title={t("images.clearAll")}
            >
              <Icon name="trash" size={10} />
              <Icon name="image" size={10} />
            </div>
          )}
          {images.map((img) => (
            <ImageTag
              key={img.path}
              img={img}
              onRemove={() => queuedCallerId ? removeQueuedDraftImage(queuedCallerId, img.path) : activeSession && removeSessionImage(activeSession.id, img.path)}
            />
          ))}
          {(hasTestLog || showTestLog) && (
            <TestLogTag
              showTestLog={showTestLog}
              setShowTestLog={setShowTestLog}
              testLogRef={testLogRef}
              testLogText={targetTestLogText}
              callerColor={callerColor}
            />
          )}
          {hasGitAction && (
            <GitActionTag
              gitAction={targetGitAction!}
              showGitPanel={showGitPanel}
              setShowGitPanel={setShowGitPanel}
              callerColor={callerColor}
              onRemove={() => queuedCallerId ? setQueuedDraftGitAction(queuedCallerId, null) : activeSession && setSessionGitAction(activeSession.id, null)}
            />
          )}
          {targetMlcAttachments.map((attachment) => (
            <MlcAttachmentTag
              key={attachment.filePath}
              attachment={attachment}
              onRemove={() => queuedCallerId
                ? removeQueuedDraftMlcAttachment(queuedCallerId, attachment.filePath)
                : activeSession && removeSessionMlcAttachment(activeSession.id, attachment.filePath)}
            />
          ))}
        </div>
      )}

      {/* Expanded test log editor */}
      {showTestLog && (
        <div
          className="px-3 pb-1"
        >
          <div
            className="rounded-lg"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-input)",
              maxHeight: 125,
              overflowY: "auto",
            }}
          >
              <TestLogInput ref={testLogRef} queuedCallerId={queuedCallerId} />
          </div>
        </div>
      )}

      {/* Expanded git action panel */}
      {showGitPanel && (
        <div className="px-3 pb-1">
          <div
            className="rounded-lg flex flex-wrap items-center gap-1.5 p-2"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-input)",
            }}
          >
            {(["commit", "commit-push", "create-branch"] as GitActionType[]).map((type) => {
              const isSelected = targetGitAction?.type === type;
              return (
                <button
                  key={type}
                  className="btn"
                  style={{
                    fontSize: 11,
                    padding: "3px 10px",
                    background: isSelected ? callerColor : undefined,
                    borderColor: isSelected ? callerColor : undefined,
                    color: isSelected ? "#fff" : undefined,
                  }}
                  onClick={() => {
                    if (!activeSession && !queuedCallerId) return;
                    if (isSelected) {
                      if (queuedCallerId) setQueuedDraftGitAction(queuedCallerId, null);
                      else if (activeSession) setSessionGitAction(activeSession.id, null);
                    } else {
                      const action = { type, branchName: type === "create-branch" ? "" : undefined };
                      if (queuedCallerId) setQueuedDraftGitAction(queuedCallerId, action);
                      else if (activeSession) setSessionGitAction(activeSession.id, action);
                      if (type === "create-branch") {
                        setTimeout(() => branchInputRef.current?.focus(), 50);
                      }
                    }
                  }}
                >
                  {t(`gitAction.${type === "commit" ? "commit" : type === "commit-push" ? "commitPush" : "createBranch"}`)}
                </button>
              );
            })}
            {targetGitAction?.type === "create-branch" && (
              <input
                ref={branchInputRef}
                type="text"
                value={targetGitAction.branchName || ""}
                onChange={(e) => queuedCallerId ? updateQueuedDraftGitBranchName(queuedCallerId, e.target.value) : activeSession && updateSessionGitBranchName(activeSession.id, e.target.value)}
                placeholder={t("gitAction.branchPlaceholder", "分支名称（可留空）")}
                className="input-area"
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  height: 26,
                  minWidth: 120,
                  maxWidth: 200,
                  borderRadius: 6,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-bg-base)",
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Image tag with hover preview */
function ImageTag({ img, onRemove, readonly }: { img: import("../store/feedbackStore").ImageAttachment; onRemove: () => void; readonly?: boolean }) {
  const [showPreview, setShowPreview] = useState(false);
  const tagRef = useRef<HTMLDivElement>(null);
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number } | null>(null);
  const size = img.sizeKB >= 1024
    ? `${(img.sizeKB / 1024).toFixed(1)} MB`
    : `${img.sizeKB.toFixed(0)} KB`;

  const handleMouseEnter = () => {
    if (tagRef.current) {
      const rect = tagRef.current.getBoundingClientRect();
      let top = rect.top - 6;
      let left = rect.left;
      setPreviewPos({ top, left });
    }
    setShowPreview(true);
  };

  return (
    <div
      ref={tagRef}
      className="attachment-tag group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowPreview(false)}
    >
      {!readonly && (
        <button
          className="attachment-tag-remove"
          style={{ display: "inline-flex" }}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <Icon name="close-sm" size={10} />
        </button>
      )}
      <img
        src={img.dataUrl}
        alt=""
        style={{ width: 14, height: 14, objectFit: "cover", borderRadius: 2, flexShrink: 0 }}
      />
      <span className="truncate" style={{ maxWidth: 80 }}>{img.name}</span>
      <span style={{ fontSize: 9, color: "var(--color-text-muted)", flexShrink: 0 }}>{size}</span>
      {readonly && (
        <button
          className="attachment-tag-copy"
          onClick={(e) => {
            e.stopPropagation();
            fetch(img.dataUrl!)
              .then((r) => r.blob())
              .then((blob) => {
                const item = new ClipboardItem({ [blob.type]: blob });
                navigator.clipboard.write([item]);
              })
              .catch(() => navigator.clipboard.writeText(img.name));
          }}
          title="Copy image"
        >
          <Icon name="copy" size={10} />
        </button>
      )}

      {/* Hover preview — fixed position to avoid overflow clipping */}
      {showPreview && previewPos && createPortal(
        <div
          className="attachment-preview"
          ref={(el) => {
            if (!el || !tagRef.current) return;
            const rect = tagRef.current.getBoundingClientRect();
            const ph = el.offsetHeight;
            const pw = el.offsetWidth;
            let top = rect.top - ph - 2;
            let left = rect.left;
            if (top < 4) top = rect.bottom + 2;
            if (left + pw > window.innerWidth - 4) left = window.innerWidth - pw - 4;
            if (left < 4) left = 4;
            el.style.top = `${top}px`;
            el.style.left = `${left}px`;
          }}
          style={{
            position: "fixed",
            top: previewPos.top,
            left: previewPos.left,
            zIndex: 9999,
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            padding: 4,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            pointerEvents: "none",
          }}
        >
          <img
            src={img.dataUrl}
            alt={img.name}
            style={{ maxWidth: 300, maxHeight: 300, objectFit: "contain", borderRadius: 4 }}
          />
        </div>,
        document.body
      )}
    </div>
  );
}

/** Test log tag with hover preview */
function TestLogTag({
  showTestLog, setShowTestLog, testLogRef, testLogText, callerColor,
}: {
  showTestLog: boolean;
  setShowTestLog: (fn: (v: boolean) => boolean) => void;
  testLogRef: React.RefObject<HTMLTextAreaElement | null>;
  testLogText: string;
  callerColor: string;
}) {
  const { t } = useTranslation();
  const [showPreview, setShowPreview] = useState(false);
  const tagRef = useRef<HTMLButtonElement>(null);
  const previewText = testLogText.length > 500 ? testLogText.slice(0, 500) + "…" : testLogText;

  return (
    <button
      ref={tagRef}
      className="attachment-tag"
      style={{
        background: showTestLog ? callerColor : undefined,
        borderColor: showTestLog ? callerColor : "var(--color-border)",
        color: showTestLog ? "#fff" : "var(--color-text-secondary)",
      }}
      onClick={() => {
        setShowTestLog((v) => !v);
        if (!showTestLog) setTimeout(() => testLogRef.current?.focus(), 50);
      }}
      onMouseEnter={() => { if (!showTestLog && testLogText.trim()) setShowPreview(true); }}
      onMouseLeave={() => setShowPreview(false)}
    >
      <Icon name="file" size={10} />
      {t("testLog.attach")}
      {testLogText.length > 0 && (
        <span style={{ fontSize: 9, color: showTestLog ? "rgba(255,255,255,0.7)" : "var(--color-text-muted)" }}>
          {testLogText.length}
        </span>
      )}

      {/* Hover preview — fixed position via portal */}
      {showPreview && createPortal(
        <div
          ref={(el) => {
            if (!el || !tagRef.current) return;
            const rect = tagRef.current.getBoundingClientRect();
            const ph = el.offsetHeight;
            const pw = el.offsetWidth;
            let top = rect.top - ph - 2;
            let left = rect.left;
            if (top < 4) top = rect.bottom + 2;
            if (left + pw > window.innerWidth - 4) left = window.innerWidth - pw - 4;
            if (left < 4) left = 4;
            el.style.top = `${top}px`;
            el.style.left = `${left}px`;
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: 9999,
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            padding: "6px 10px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            pointerEvents: "none",
            maxWidth: 400,
            maxHeight: 300,
            overflow: "hidden",
            fontSize: 11,
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            color: "var(--color-text-secondary)",
          }}
        >
          {previewText}
        </div>,
        document.body
      )}
    </button>
  );
}

/** Git action tag in the attachment tag area */
function GitActionTag({
  gitAction,
  showGitPanel,
  setShowGitPanel,
  callerColor,
  onRemove,
}: {
  gitAction: import("../store/feedbackStore").GitAction;
  showGitPanel: boolean;
  setShowGitPanel: (fn: (v: boolean) => boolean) => void;
  callerColor: string;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const labelMap: Record<string, string> = {
    commit: t("gitAction.commit"),
    "commit-push": t("gitAction.commitPush"),
    "create-branch": t("gitAction.createBranch"),
  };
  const label = labelMap[gitAction.type] || gitAction.type;
  const detail = gitAction.type === "create-branch" && gitAction.branchName
    ? `: ${gitAction.branchName}`
    : "";

  return (
    <div
      className="attachment-tag"
      style={{
        background: showGitPanel ? callerColor : undefined,
        borderColor: showGitPanel ? callerColor : "var(--color-border)",
        color: showGitPanel ? "#fff" : "var(--color-text-secondary)",
        cursor: "pointer",
      }}
      onClick={() => setShowGitPanel((v) => !v)}
    >
      <button
        className="attachment-tag-remove"
        style={{
          display: "inline-flex",
          color: showGitPanel ? "rgba(255,255,255,0.85)" : undefined,
        }}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
      >
        <Icon name="close-sm" size={10} />
      </button>
      <Icon name="git-branch" size={10} />
      <span className="truncate" style={{ maxWidth: 140 }}>{label}{detail}</span>
    </div>
  );
}

function MlcAttachmentTag({ attachment, onRemove, readonly }: { attachment: MlcAttachment; onRemove: () => void; readonly?: boolean }) {
  const cleanPath = attachment.filePath.replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
  const title = attachment.title || cleanPath;
  const preview = [title, attachment.description, cleanPath].filter(Boolean).join("\n");

  return (
    <div className="attachment-tag" title={preview} style={{ cursor: readonly ? "default" : "pointer" }}>
      {!readonly && (
        <button
          className="attachment-tag-remove"
          style={{ display: "inline-flex" }}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <Icon name="close-sm" size={10} />
        </button>
      )}
      <Icon name="book" size={10} />
      <span className="truncate" style={{ maxWidth: 160 }}>{title}</span>
      {readonly && (
        <button
          className="attachment-tag-copy"
          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(cleanPath); }}
          title="Copy path"
        >
          <Icon name="copy" size={10} />
        </button>
      )}
    </div>
  );
}

/** Readonly tag bar for responded sessions — image tags with hover, test log tag with expandable preview */
export function ReadonlyTagBar({ session }: { session: import("../store/feedbackStore").Session }) {
  const { t } = useTranslation();
  const [showLog, setShowLog] = useState(false);
  const hasLog = session.testLogText.trim().length > 0;
  const hasGitAction = !!session.gitAction;
  const mlcAttachments = session.mlcAttachments || [];

  const gitLabel = hasGitAction ? ({
    commit: t("gitAction.commit"),
    "commit-push": t("gitAction.commitPush"),
    "create-branch": t("gitAction.createBranch"),
  } as Record<string, string>)[session.gitAction!.type] || session.gitAction!.type : "";
  const gitDetail = hasGitAction && session.gitAction!.type === "create-branch" && session.gitAction!.branchName
    ? `: ${session.gitAction!.branchName}` : "";

  return (
    <div className="shrink-0">
      {/* Tag area */}
      <div className="flex flex-wrap gap-1 px-3 pt-1.5 pb-1 overflow-y-auto" style={{ maxHeight: 78 }}>
        {session.images.map((img) => (
          <ImageTag key={img.path} img={img} onRemove={() => {}} readonly />
        ))}
        {hasLog && (
          <ReadonlyLogTag
            testLogText={session.testLogText}
            expanded={showLog}
            onToggle={() => setShowLog((v) => !v)}
          />
        )}
        {hasGitAction && (
          <div className="attachment-tag" style={{ cursor: "default" }}>
            <Icon name="git-branch" size={10} />
            <span className="truncate" style={{ maxWidth: 140 }}>{gitLabel}{gitDetail}</span>
          </div>
        )}
        {mlcAttachments.map((attachment) => (
          <MlcAttachmentTag key={attachment.filePath} attachment={attachment} onRemove={() => {}} readonly />
        ))}
      </div>
      {/* Expanded test log readonly */}
      {showLog && hasLog && (
        <div className="px-3 pb-1">
          <div
            className="rounded-lg"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-input)",
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            <pre
              className="text-xs px-2 py-1.5 m-0"
              style={{ color: "var(--color-text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-all", opacity: 0.7 }}
            >
              <RichText text={session.testLogText} />
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/** Readonly test log tag with hover preview */
function ReadonlyLogTag({ testLogText, expanded, onToggle }: { testLogText: string; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const [showPreview, setShowPreview] = useState(false);
  const tagRef = useRef<HTMLDivElement>(null);
  const previewText = testLogText.length > 500 ? testLogText.slice(0, 500) + "…" : testLogText;

  return (
    <div
      ref={tagRef}
      className="attachment-tag"
      style={{
        background: expanded ? "var(--color-bg-elevated)" : undefined,
        borderColor: expanded ? "var(--color-border-strong)" : "var(--color-border)",
        cursor: "pointer",
      }}
      onClick={onToggle}
      onMouseEnter={() => { if (!expanded && testLogText.trim()) setShowPreview(true); }}
      onMouseLeave={() => setShowPreview(false)}
    >
      <Icon name="file" size={10} />
      {t("testLog.attach")}
      {testLogText.length > 0 && (
        <span style={{ fontSize: 9, color: "var(--color-text-muted)" }}>{testLogText.length}</span>
      )}
      <button
        className="attachment-tag-copy"
        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(testLogText); }}
        title="Copy log"
      >
        <Icon name="copy" size={10} />
      </button>

      {showPreview && createPortal(
        <div
          ref={(el) => {
            if (!el || !tagRef.current) return;
            const rect = tagRef.current.getBoundingClientRect();
            const ph = el.offsetHeight;
            const pw = el.offsetWidth;
            let top = rect.top - ph - 2;
            let left = rect.left;
            if (top < 4) top = rect.bottom + 2;
            if (left + pw > window.innerWidth - 4) left = window.innerWidth - pw - 4;
            if (left < 4) left = 4;
            el.style.top = `${top}px`;
            el.style.left = `${left}px`;
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: 9999,
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            padding: "6px 10px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            pointerEvents: "none",
            maxWidth: 400,
            maxHeight: 300,
            overflow: "hidden",
            fontSize: 11,
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            color: "var(--color-text-secondary)",
          }}
        >
          {previewText}
        </div>,
        document.body
      )}
    </div>
  );
}

/** Render text with clickable links and color swatches */
export function RichText({ text, style, className }: { text: string; style?: React.CSSProperties; className?: string }) {
  const parts = useMemo(() => {
    const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
    const COLOR_RE = /#(?:[0-9a-fA-F]{3}){1,2}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/g;
    const COMBINED = new RegExp(`(${URL_RE.source})|(${COLOR_RE.source})`, "g");

    const result: { type: "text" | "url" | "color"; value: string }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = COMBINED.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: "text", value: text.slice(lastIndex, match.index) });
      }
      if (match[1]) {
        result.push({ type: "url", value: match[1] });
      } else if (match[2]) {
        result.push({ type: "color", value: match[2] });
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      result.push({ type: "text", value: text.slice(lastIndex) });
    }
    return result;
  }, [text]);

  const handleLinkClick = useCallback((url: string) => {
    import("@tauri-apps/plugin-opener").then(({ openUrl }) => {
      openUrl(url);
    }).catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }, []);

  return (
    <span style={style} className={className}>
      {parts.map((part, i) => {
        if (part.type === "url") {
          return (
            <a
              key={i}
              href="#"
              onClick={(e) => { e.preventDefault(); handleLinkClick(part.value); }}
              style={{
                color: "var(--color-primary)",
                textDecoration: "underline",
                textDecorationColor: "rgba(var(--color-primary-rgb, 99,102,241), 0.4)",
                cursor: "pointer",
                wordBreak: "break-all",
              }}
              title={part.value}
            >
              {part.value}
            </a>
          );
        }
        if (part.type === "color") {
          return (
            <span key={i} style={{ whiteSpace: "nowrap" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  backgroundColor: part.value,
                  border: "1px solid var(--color-border)",
                  verticalAlign: "middle",
                  marginRight: 2,
                }}
              />
              <code style={{ fontSize: "inherit", color: "inherit" }}>{part.value}</code>
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </span>
  );
}

/** Test log textarea */
const TestLogInput = forwardRef<HTMLTextAreaElement, { queuedCallerId?: string }>(function TestLogInput({ queuedCallerId }, forwardedRef) {
  const { t } = useTranslation();
  const { session: activeSession, caller } = useActiveCallerSession();
  const queuedDraft = useFeedbackStore((s) => queuedCallerId ? s.queuedDraftsByCallerId[queuedCallerId] : null);
  const { updateSessionField, addSessionImage, updateQueuedDraftField, addQueuedDraftImage, setFocusedComposer } = useFeedbackStore(useShallow((s) => ({
    updateSessionField: s.updateSessionField,
    addSessionImage: s.addSessionImage,
    updateQueuedDraftField: s.updateQueuedDraftField,
    addQueuedDraftImage: s.addQueuedDraftImage,
    setFocusedComposer: s.setFocusedComposer,
  })));

  const value = queuedCallerId ? (queuedDraft?.testLogText || "") : (activeSession?.testLogText || "");
  const isReadonly = !queuedCallerId && (activeSession?.status === "responded" || activeSession?.status === "cancelled");
  const internalRef = useRef<HTMLTextAreaElement>(null);

  const combinedRef = useCallback((el: HTMLTextAreaElement | null) => {
    (internalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    if (typeof forwardedRef === "function") forwardedRef(el);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  }, [forwardedRef]);

  useEffect(() => {
    if (internalRef.current) {
      internalRef.current.style.height = "auto";
      const h = Math.max(internalRef.current.scrollHeight, 50);
      internalRef.current.style.height = h + "px";
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (queuedCallerId) {
      updateQueuedDraftField(queuedCallerId, "testLogText", e.target.value);
    } else if (activeSession) {
      updateSessionField(activeSession.id, "testLogText", e.target.value);
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
      kind: "testLog",
      focusedAt: new Date().toISOString(),
    });
  }, [activeSession, caller, queuedCallerId, setFocusedComposer]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items || (!activeSession && !queuedCallerId)) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            const namedFile = new File([file], `clipboard_${Date.now()}.png`, { type: file.type });
            const reader = new FileReader();
            reader.onload = (ev) => {
              const img = {
                path: `blob:clipboard:${Date.now()}`,
                name: namedFile.name,
                sizeKB: namedFile.size / 1024,
                dataUrl: ev.target?.result as string,
              };
              if (queuedCallerId) addQueuedDraftImage(queuedCallerId, img);
              else if (activeSession) addSessionImage(activeSession.id, img);
            };
            reader.readAsDataURL(namedFile);
            e.preventDefault();
          }
        }
      }
    },
    [activeSession, addSessionImage, queuedCallerId, addQueuedDraftImage]
  );

  return (
    <textarea
      ref={combinedRef}
      value={value}
      onChange={handleChange}
      onPaste={handlePaste}
      onFocus={handleFocus}
      readOnly={isReadonly}
      placeholder={t("testLog.placeholder")}
      className="input-area"
      style={{
        minHeight: 50,
        overflow: "hidden",
        resize: "none",
        opacity: isReadonly ? 0.6 : 1,
        fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
        fontSize: 11,
        color: "var(--color-text-muted)",
      }}
    />
  );
});
