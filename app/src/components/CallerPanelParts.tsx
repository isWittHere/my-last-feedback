import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../store/feedbackStore";
import type { DockColumnId, DockTabId, GitActionType, MlcAttachment, WebAttachment } from "../store/feedbackStore";
import { useShallow } from "zustand/react/shallow";
import { Icon, MlcLogoIcon } from "./Icons";
import { useActiveCallerSession } from "./useActiveCallerSession";
import { readText as readClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { webAttachmentLabel } from "../browser/webAttachmentFormat";
import { collectSubmittedResourceLinks, type SubmittedResourceLink } from "../composer/submittedFeedback";
import { CatppuccinResourceIcon } from "./CatppuccinResourceIcon";

const DOCK_COLUMN_IDS: DockColumnId[] = ["leftSidebar", "leftPage", "rightPage", "rightSidebar"];
const GIT_ACTION_TYPES: GitActionType[] = ["commit-before", "commit", "commit-push", "create-branch"];

function gitActionLabelKey(type: GitActionType) {
  if (type === "commit-before") return "commitBefore";
  if (type === "commit-push") return "commitPush";
  if (type === "create-branch") return "createBranch";
  return "commit";
}

function GitActionOptionIcon({ type, size = 12 }: { type: GitActionType; size?: number }) {
  const iconPairs: Record<GitActionType, [string, string]> = {
    "commit-before": ["git-commit", "arrow-right"],
    commit: ["clock", "git-commit"],
    "commit-push": ["git-commit", "arrow-up"],
    "create-branch": ["git-branch", "arrow-right"],
  };
  const [primaryIcon, secondaryIcon] = iconPairs[type];
  return (
    <span className="git-action-icon-pair" aria-hidden="true">
      <Icon name={primaryIcon} size={size} />
      <Icon name={secondaryIcon} size={Math.max(9, size - 2)} />
    </span>
  );
}

function clampFloatingValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function overlapsRect(left: number, top: number, width: number, height: number, rect: DOMRect, margin = 8) {
  return left < rect.right + margin
    && left + width > rect.left - margin
    && top < rect.bottom + margin
    && top + height > rect.top - margin;
}

function placeFloatingPreview(anchorRect: DOMRect, width: number, height: number) {
  const viewportPadding = 4;
  const maxLeft = window.innerWidth - width - viewportPadding;
  const maxTop = window.innerHeight - height - viewportPadding;
  const clamp = (position: { top: number; left: number }) => ({
    top: clampFloatingValue(position.top, viewportPadding, Math.max(viewportPadding, maxTop)),
    left: clampFloatingValue(position.left, viewportPadding, Math.max(viewportPadding, maxLeft)),
  });
  const candidates = [
    clamp({ top: anchorRect.top - height - 2, left: anchorRect.left }),
    clamp({ top: anchorRect.bottom + 2, left: anchorRect.left }),
    clamp({ top: anchorRect.top, left: anchorRect.right + 8 }),
    clamp({ top: anchorRect.top, left: anchorRect.left - width - 8 }),
  ];
  const webviewRects = Array.from(document.querySelectorAll<HTMLElement>(".preview-browser-webview-mount"))
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  return candidates.find((position) => !webviewRects.some((rect) => overlapsRect(position.left, position.top, width, height, rect))) || candidates[0];
}

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
  const clearSessionMlcAttachments = useFeedbackStore((s) => s.clearSessionMlcAttachments);
  const clearQueuedDraftMlcAttachments = useFeedbackStore((s) => s.clearQueuedDraftMlcAttachments);
  const removeSessionWebAttachment = useFeedbackStore((s) => s.removeSessionWebAttachment);
  const removeQueuedDraftWebAttachment = useFeedbackStore((s) => s.removeQueuedDraftWebAttachment);
  const setFocusedComposer = useFeedbackStore((s) => s.setFocusedComposer);
  const mlcActiveWorkspacePath = useFeedbackStore((s) => s.mlcActiveWorkspacePath);
  const dockLayout = useFeedbackStore((s) => s.dockLayout);
  const setDockActiveTab = useFeedbackStore((s) => s.setDockActiveTab);
  const setDockColumnCollapsed = useFeedbackStore((s) => s.setDockColumnCollapsed);
  const moveDockTabToColumn = useFeedbackStore((s) => s.moveDockTabToColumn);
  const setMlcActiveWorkspacePath = useFeedbackStore((s) => s.setMlcActiveWorkspacePath);
  const targetImages = queuedCallerId ? (queuedDraft?.images || []) : (activeSession?.images || []);
  const targetTestLogText = queuedCallerId ? (queuedDraft?.testLogText || "") : (activeSession?.testLogText || "");
  const targetGitAction = queuedCallerId ? (queuedDraft?.gitAction || null) : (activeSession?.gitAction || null);
  const targetMlcAttachments = queuedCallerId ? (queuedDraft?.mlcAttachments || []) : (activeSession?.mlcAttachments || []);
  const targetWebAttachments = queuedCallerId ? (queuedDraft?.webAttachments || []) : (activeSession?.webAttachments || []);
  const images = targetImages;
  const hasTestLog = !!targetTestLogText.trim();
  const hasGitAction = !!targetGitAction;
  const hasMlcAttachments = targetMlcAttachments.length > 0;
  const findDockColumnForTab = (tabId: DockTabId): DockColumnId | null => DOCK_COLUMN_IDS.find((columnId) => dockLayout.columns[columnId].tabIds.includes(tabId)) || null;
  const mlcDockColumnId = findDockColumnForTab("mlc");
  const resourcesDockColumnId = findDockColumnForTab("resources");
  const previewDockColumnId = findDockColumnForTab("previewBrowser");
  const previewInfoDockColumnId = findDockColumnForTab("previewInfo");
  const isMlcButtonActive = !!mlcDockColumnId && !dockLayout.columns[mlcDockColumnId].collapsed && dockLayout.columns[mlcDockColumnId].activeTabId === "mlc" && !!activeSession?.projectDirectory && mlcActiveWorkspacePath === activeSession.projectDirectory;
  const isResourceButtonActive = !!resourcesDockColumnId && !dockLayout.columns[resourcesDockColumnId].collapsed && dockLayout.columns[resourcesDockColumnId].activeTabId === "resources" && !!activeSession?.projectDirectory && mlcActiveWorkspacePath === activeSession.projectDirectory;
  const isPreviewButtonActive = !!previewDockColumnId && !dockLayout.columns[previewDockColumnId].collapsed && dockLayout.columns[previewDockColumnId].activeTabId === "previewBrowser";
  const hasWebAttachments = targetWebAttachments.length > 0;
  const hasTags = images.length > 0 || hasTestLog || showTestLog || hasGitAction || hasMlcAttachments || hasWebAttachments;
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

  const handleResourceClick = () => {
    if (isResourceButtonActive) {
      if (resourcesDockColumnId) setDockColumnCollapsed(resourcesDockColumnId, true);
      return;
    }
    const projectDirectory = activeSession?.projectDirectory || "";
    if (!projectDirectory || !caller) return;
    setFocusedComposer({
      callerId: queuedCallerId || caller.id,
      sessionId: queuedCallerId ? undefined : activeSession?.id,
      projectDirectory,
      kind: queuedCallerId ? "queuedDraft" : "feedback",
      focusedAt: new Date().toISOString(),
    });
    setMlcActiveWorkspacePath(projectDirectory);
    const targetColumnId = resourcesDockColumnId || "rightSidebar";
    if (!resourcesDockColumnId) moveDockTabToColumn("resources", targetColumnId);
    setDockColumnCollapsed(targetColumnId, false);
    setDockActiveTab(targetColumnId, "resources");
  };

  const handleMlcClick = () => {
    if (isMlcButtonActive) {
      if (mlcDockColumnId) setDockColumnCollapsed(mlcDockColumnId, true);
      return;
    }
    if (queuedCallerId) {
      if (!caller) return;
      setFocusedComposer({
        callerId: queuedCallerId,
        projectDirectory: activeSession?.projectDirectory || "",
        kind: "queuedDraft",
        focusedAt: new Date().toISOString(),
      });
      setMlcActiveWorkspacePath(activeSession?.projectDirectory || null);
      const targetColumnId = mlcDockColumnId || "rightSidebar";
      if (!mlcDockColumnId) moveDockTabToColumn("mlc", targetColumnId);
      setDockColumnCollapsed(targetColumnId, false);
      setDockActiveTab(targetColumnId, "mlc");
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
    const targetColumnId = mlcDockColumnId || "rightSidebar";
    if (!mlcDockColumnId) moveDockTabToColumn("mlc", targetColumnId);
    setDockColumnCollapsed(targetColumnId, false);
    setDockActiveTab(targetColumnId, "mlc");
  };

  const handlePreviewClick = () => {
    if (isPreviewButtonActive) {
      if (previewDockColumnId) setDockColumnCollapsed(previewDockColumnId, true);
      if (previewInfoDockColumnId && previewInfoDockColumnId !== previewDockColumnId) setDockColumnCollapsed(previewInfoDockColumnId, true);
      return;
    }
    if (queuedCallerId) {
      if (caller) {
        setFocusedComposer({
          callerId: queuedCallerId,
          projectDirectory: activeSession?.projectDirectory || "",
          kind: "queuedDraft",
          focusedAt: new Date().toISOString(),
        });
      }
    } else if (activeSession && activeSession.status === "pending" && caller) {
      setFocusedComposer({
        callerId: caller.id,
        sessionId: activeSession.id,
        projectDirectory: activeSession.projectDirectory,
        kind: "feedback",
        focusedAt: new Date().toISOString(),
      });
    }
    const targetColumnId = previewDockColumnId && previewDockColumnId !== previewInfoDockColumnId ? previewDockColumnId : "leftPage";
    if (previewDockColumnId !== targetColumnId) moveDockTabToColumn("previewBrowser", targetColumnId);
    const infoTargetColumnId = previewInfoDockColumnId && previewInfoDockColumnId !== targetColumnId ? previewInfoDockColumnId : "rightSidebar";
    if (previewInfoDockColumnId !== infoTargetColumnId) moveDockTabToColumn("previewInfo", infoTargetColumnId);
    setDockColumnCollapsed(targetColumnId, false);
    setDockColumnCollapsed(infoTargetColumnId, false);
    setDockActiveTab(targetColumnId, "previewBrowser");
    if (infoTargetColumnId !== targetColumnId) setDockActiveTab(infoTargetColumnId, "previewInfo");
  };

  return (
    <div className="shrink-0">
      {/* Button row */}
      <div className="attachment-action-row px-3 pt-1.5 pb-0.5">
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
          <span className="attachment-action-label">{t("testLog.attach", "Attach Log")}</span>
          {targetTestLogText.length > 0 && (
            <span className="attachment-action-meta" style={{ color: showTestLog ? "rgba(255,255,255,0.7)" : "var(--color-text-muted)" }}>
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
          <Icon name="git-commit" size={12} />
          <span className="attachment-action-label">{t("gitAction.button", "Git Action")}</span>
        </button>
        <button
          className="btn"
          style={{
            fontSize: 11,
            padding: "3px 10px",
            background: isResourceButtonActive ? callerColor : undefined,
            borderColor: isResourceButtonActive ? callerColor : undefined,
            color: isResourceButtonActive ? "#fff" : undefined,
          }}
          disabled={!queuedCallerId && (!activeSession || activeSession.status !== "pending")}
          onClick={handleResourceClick}
          title={t("resources.openPanel", "Open project resources")}
        >
          <Icon name="folder" size={12} />
          <span className="attachment-action-label">{t("resources.button", "Resources")}</span>
        </button>
        <button
          className="btn"
          style={{
            fontSize: 11,
            padding: "3px 10px",
            background: isPreviewButtonActive ? callerColor : undefined,
            borderColor: isPreviewButtonActive ? callerColor : undefined,
            color: isPreviewButtonActive ? "#fff" : undefined,
          }}
          disabled={!queuedCallerId && (!activeSession || activeSession.status !== "pending")}
          onClick={handlePreviewClick}
          title={t("previewBrowser.openPanel", "Open preview browser")}
        >
          <Icon name="globe" size={12} />
          <span className="attachment-action-label">{t("previewBrowser.button", "Preview")}</span>
          {hasWebAttachments && (
            <span className="attachment-action-meta" style={{ color: isPreviewButtonActive ? "rgba(255,255,255,0.7)" : "var(--color-text-muted)" }}>
              {targetWebAttachments.length}
            </span>
          )}
        </button>
        <button
          className="btn"
          style={{
            fontSize: 11,
            padding: "3px 10px",
            background: isMlcButtonActive ? callerColor : undefined,
            borderColor: isMlcButtonActive ? callerColor : undefined,
            color: isMlcButtonActive ? "#fff" : undefined,
          }}
          disabled={!queuedCallerId && (!activeSession || activeSession.status !== "pending")}
          onClick={handleMlcClick}
          title={t("mlc.openPanel", "Open My Last Chat references")}
        >
          <MlcLogoIcon size={12} />
          <span className="attachment-action-label">{t("mlc.button", "MLC")}</span>
          {hasMlcAttachments && (
            <span className="attachment-action-meta" style={{ color: isMlcButtonActive ? "rgba(255,255,255,0.7)" : "var(--color-text-muted)" }}>
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
          className="attachment-tag-row flex flex-wrap gap-1 px-3 pb-1 overflow-y-auto"
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
          {hasMlcAttachments && (
            <div
              className="attachment-tag attachment-tag-danger"
              onClick={() => queuedCallerId ? clearQueuedDraftMlcAttachments(queuedCallerId) : activeSession && clearSessionMlcAttachments(activeSession.id)}
              title={t("mlc.clearAll", "Clear all MLC")}
            >
              <Icon name="trash" size={10} />
              <MlcLogoIcon size={10} />
            </div>
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
          {targetWebAttachments.map((attachment) => (
            <WebAttachmentTag
              key={attachment.id}
              attachment={attachment}
              onRemove={() => queuedCallerId
                ? removeQueuedDraftWebAttachment(queuedCallerId, attachment.id)
                : activeSession && removeSessionWebAttachment(activeSession.id, attachment.id)}
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
              background: "var(--color-bg-input-raised)",
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
              background: "var(--color-bg-input-raised)",
            }}
          >
            {GIT_ACTION_TYPES.map((type) => {
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
                  <GitActionOptionIcon type={type} />
                  {t(`gitAction.${gitActionLabelKey(type)}`)}
                </button>
              );
            })}
            {targetGitAction?.type === "create-branch" && (
              <input
                ref={branchInputRef}
                type="text"
                value={targetGitAction.branchName || ""}
                onChange={(e) => queuedCallerId ? updateQueuedDraftGitBranchName(queuedCallerId, e.target.value) : activeSession && updateSessionGitBranchName(activeSession.id, e.target.value)}
                placeholder={t("gitAction.branchPlaceholder", "Branch name (optional)")}
                className="input-area"
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  height: 26,
                  minWidth: 120,
                  maxWidth: 200,
                  borderRadius: 6,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-bg-input-raised)",
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
  const { t } = useTranslation();
  const [showPreview, setShowPreview] = useState(false);
  const tagRef = useRef<HTMLDivElement>(null);
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number } | null>(null);
  const hasImageData = Boolean(img.dataUrl);
  const size = img.sizeKB <= 0
    ? t("images.stored", "stored")
    : img.sizeKB >= 1024
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
      data-preview-overlay
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
      {hasImageData ? (
        <img
          src={img.dataUrl}
          alt=""
          style={{ width: 14, height: 14, objectFit: "cover", borderRadius: 2, flexShrink: 0 }}
        />
      ) : (
        <Icon name="image" size={12} />
      )}
      <span className="truncate" style={{ maxWidth: 80 }}>{img.name}</span>
      <span style={{ fontSize: 9, color: "var(--color-text-muted)", flexShrink: 0 }}>{size}</span>
      {readonly && (
        <button
          className="attachment-tag-copy"
          onClick={(e) => {
            e.stopPropagation();
            if (!img.dataUrl) {
              navigator.clipboard.writeText(img.name);
              return;
            }
            fetch(img.dataUrl)
              .then((r) => r.blob())
              .then((blob) => {
                const item = new ClipboardItem({ [blob.type]: blob });
                navigator.clipboard.write([item]);
              })
              .catch(() => navigator.clipboard.writeText(img.name));
          }}
          title={t("images.copy", "Copy image")}
        >
          <Icon name="copy" size={10} />
        </button>
      )}

      {/* Hover preview — fixed position to avoid overflow clipping */}
      {hasImageData && showPreview && previewPos && createPortal(
        <div
          className="attachment-preview"
          data-preview-overlay
          ref={(el) => {
            if (!el || !tagRef.current) return;
            const rect = tagRef.current.getBoundingClientRect();
            const ph = el.offsetHeight;
            const pw = el.offsetWidth;
            const position = placeFloatingPreview(rect, pw, ph);
            el.style.top = `${position.top}px`;
            el.style.left = `${position.left}px`;
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
      data-preview-overlay
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
          data-preview-overlay
          ref={(el) => {
            if (!el || !tagRef.current) return;
            const rect = tagRef.current.getBoundingClientRect();
            const ph = el.offsetHeight;
            const pw = el.offsetWidth;
            const position = placeFloatingPreview(rect, pw, ph);
            el.style.top = `${position.top}px`;
            el.style.left = `${position.left}px`;
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
    "commit-before": t("gitAction.commitBefore"),
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
      data-preview-overlay
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
      <GitActionOptionIcon type={gitAction.type} size={11} />
      <span className="truncate" style={{ maxWidth: 140 }}>{label}{detail}</span>
    </div>
  );
}

function MlcAttachmentTag({ attachment, onRemove, readonly }: { attachment: MlcAttachment; onRemove: () => void; readonly?: boolean }) {
  const { t } = useTranslation();
  const cleanPath = attachment.filePath.replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
  const tagRef = useRef<HTMLDivElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number } | null>(null);
  const title = attachment.title || cleanPath;

  const handleMouseEnter = () => {
    if (tagRef.current) {
      const rect = tagRef.current.getBoundingClientRect();
      setPreviewPos({ top: rect.top - 6, left: rect.left });
    }
    setShowPreview(true);
  };

  return (
    <div
      ref={tagRef}
      className="attachment-tag"
      data-preview-overlay
      style={{ cursor: readonly ? "default" : "pointer" }}
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
      <Icon name="book" size={10} />
      <span className="truncate" style={{ maxWidth: 160 }}>{title}</span>
      {readonly && (
        <button
          className="attachment-tag-copy"
          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(cleanPath); }}
          title={t("mlc.copyPath", "Copy path")}
        >
          <Icon name="copy" size={10} />
        </button>
      )}
      {showPreview && previewPos && createPortal(
        <div
          className="mlc-custom-tooltip"
          data-preview-overlay
          ref={(el) => {
            if (!el || !tagRef.current) return;
            const rect = tagRef.current.getBoundingClientRect();
            const tooltipHeight = el.offsetHeight;
            const tooltipWidth = el.offsetWidth;
            const position = placeFloatingPreview(rect, tooltipWidth, tooltipHeight);
            el.style.top = `${position.top}px`;
            el.style.left = `${position.left}px`;
          }}
          style={{ top: previewPos.top, left: previewPos.left, zIndex: 9999 }}
        >
          <div className="mlc-tooltip-doc">
            <div className="mlc-tooltip-title">{title}</div>
            {attachment.description ? <div className="mlc-tooltip-desc">{attachment.description}</div> : null}
            <div className="mlc-tooltip-path">{cleanPath}</div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function WebAttachmentTag({ attachment, onRemove, readonly }: { attachment: WebAttachment; onRemove: () => void; readonly?: boolean }) {
  const title = webAttachmentLabel(attachment);
  const detail = attachment.kind === "console"
    ? `${attachment.consoleEntries?.length || 0} entries`
    : attachment.element?.selector || attachment.sourceUrl;
  const tagRef = useRef<HTMLDivElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number } | null>(null);
  const handleMouseEnter = () => {
    if (tagRef.current) {
      const rect = tagRef.current.getBoundingClientRect();
      setPreviewPos({ top: rect.top - 6, left: rect.left });
    }
    setShowPreview(true);
  };
  return (
    <div
      ref={tagRef}
      className="attachment-tag"
      data-preview-overlay
      style={{ cursor: readonly ? "default" : "pointer" }}
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
      <Icon name={attachment.kind === "console" ? "terminal" : "globe"} size={10} />
      <span className="truncate" style={{ maxWidth: 160 }}>{title}</span>
      {showPreview && previewPos && createPortal(
        <div
          className="mlc-custom-tooltip"
          data-preview-overlay
          ref={(el) => {
            if (!el || !tagRef.current) return;
            const rect = tagRef.current.getBoundingClientRect();
            const tooltipHeight = el.offsetHeight;
            const tooltipWidth = el.offsetWidth;
            const position = placeFloatingPreview(rect, tooltipWidth, tooltipHeight);
            el.style.top = `${position.top}px`;
            el.style.left = `${position.left}px`;
          }}
          style={{ top: previewPos.top, left: previewPos.left, zIndex: 9999 }}
        >
          <div className="mlc-tooltip-doc">
            <div className="mlc-tooltip-title">{title}</div>
            <div className="mlc-tooltip-desc">{attachment.sourceUrl}</div>
            <div className="mlc-tooltip-path">{detail}</div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/** Readonly tag bar for responded sessions — image tags with hover, test log tag with expandable preview */
export function ReadonlyTagBar({ session }: { session: import("../store/feedbackStore").Session }) {
  const { t } = useTranslation();
  const [showLog, setShowLog] = useState(false);
  const [showCommandLogs, setShowCommandLogs] = useState(false);
  const hasLog = session.testLogText.trim().length > 0;
  const hasCommandLogs = session.commandLogs.trim().length > 0;
  const hasGitAction = !!session.gitAction;
  const mlcAttachments = session.mlcAttachments || [];
  const webAttachments = session.webAttachments || [];
  const resourceLinks = collectSubmittedResourceLinks(session.feedbackText, session.projectDirectory);
  const hasTags = session.images.length > 0 || hasLog || hasCommandLogs || hasGitAction || mlcAttachments.length > 0 || webAttachments.length > 0 || resourceLinks.length > 0;

  const gitLabel = hasGitAction ? ({
    "commit-before": t("gitAction.commitBefore"),
    commit: t("gitAction.commit"),
    "commit-push": t("gitAction.commitPush"),
    "create-branch": t("gitAction.createBranch"),
  } as Record<string, string>)[session.gitAction!.type] || session.gitAction!.type : "";
  const gitDetail = hasGitAction && session.gitAction!.type === "create-branch" && session.gitAction!.branchName
    ? `: ${session.gitAction!.branchName}` : "";

  if (!hasTags) return null;

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
        {hasCommandLogs && (
          <ReadonlyCommandLogsTag
            commandLogs={session.commandLogs}
            expanded={showCommandLogs}
            onToggle={() => setShowCommandLogs((v) => !v)}
          />
        )}
        {hasGitAction && (
          <div className="attachment-tag" data-preview-overlay style={{ cursor: "default" }}>
            <Icon name="git-branch" size={10} />
            <span className="truncate" style={{ maxWidth: 140 }}>{gitLabel}{gitDetail}</span>
          </div>
        )}
        {mlcAttachments.map((attachment) => (
          <MlcAttachmentTag key={attachment.filePath} attachment={attachment} onRemove={() => {}} readonly />
        ))}
        {webAttachments.map((attachment) => (
          <WebAttachmentTag key={attachment.id} attachment={attachment} onRemove={() => {}} readonly />
        ))}
        {resourceLinks.map((link) => (
          <ResourceAttachmentTag key={`${link.kind}:${link.href}:${link.label}`} link={link} />
        ))}
      </div>
      {/* Expanded test log readonly */}
      {showLog && hasLog && (
        <div className="px-3 pb-1">
          <div
            className="rounded-lg"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-readonly, var(--color-bg-input))",
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            <pre
              className="text-xs px-2 py-1.5 m-0"
              style={{ color: "var(--color-text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-all", opacity: 0.9 }}
            >
              <RichText text={session.testLogText} />
            </pre>
          </div>
        </div>
      )}
      {showCommandLogs && hasCommandLogs && (
        <div className="px-3 pb-1">
          <div
            className="rounded-lg"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-readonly, var(--color-bg-input))",
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            <pre
              className="text-xs px-2 py-1.5 m-0"
              style={{ color: "var(--color-text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-all", opacity: 0.9 }}
            >
              <RichText text={session.commandLogs} />
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function ResourceAttachmentTag({ link }: { link: SubmittedResourceLink }) {
  const { t } = useTranslation();
  const resourceIconTheme = useFeedbackStore((state) => state.resourceIconTheme);
  const openResource = () => {
    import("@tauri-apps/plugin-opener")
      .then(({ openPath }) => openPath(link.href))
      .catch(() => navigator.clipboard.writeText(link.href).catch(() => {}));
  };
  return (
    <div
      className="attachment-tag"
      data-preview-overlay
      style={{ cursor: "pointer" }}
      title={link.href}
      onClick={openResource}
    >
      {resourceIconTheme === "catppuccin" ? (
        <CatppuccinResourceIcon entry={{ name: link.label, relativePath: link.href, kind: link.kind }} size={12} className="attachment-resource-icon" />
      ) : (
        <Icon name={link.kind === "folder" ? "folder" : "file-text"} size={10} />
      )}
      <span className="truncate" style={{ maxWidth: 160 }}>{link.label}</span>
      <button
        className="attachment-tag-copy"
        onClick={(event) => {
          event.stopPropagation();
          navigator.clipboard.writeText(link.href);
        }}
        title={t("resources.copyPath", "Copy path")}
      >
        <Icon name="copy" size={10} />
      </button>
    </div>
  );
}

function ReadonlyCommandLogsTag({ commandLogs, expanded, onToggle }: { commandLogs: string; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <button className="attachment-tag" data-preview-overlay onClick={onToggle}>
      <Icon name="terminal" size={10} />
      {t("commandLogs.attach", "Command Logs")}
      <span style={{ fontSize: 9, color: "var(--color-text-muted)" }}>
        {commandLogs.length}
      </span>
      <Icon name="chevron-down" size={8} style={{ transform: expanded ? "rotate(180deg)" : undefined }} />
    </button>
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
      data-preview-overlay
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
        title={t("testLog.copy", "Copy log")}
      >
        <Icon name="copy" size={10} />
      </button>

      {showPreview && createPortal(
        <div
          data-preview-overlay
          ref={(el) => {
            if (!el || !tagRef.current) return;
            const rect = tagRef.current.getBoundingClientRect();
            const ph = el.offsetHeight;
            const pw = el.offsetWidth;
            const position = placeFloatingPreview(rect, pw, ph);
            el.style.top = `${position.top}px`;
            el.style.left = `${position.left}px`;
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

type RichTextPart =
  | { type: "text"; value: string }
  | { type: "url"; value: string }
  | { type: "color"; value: string }
  | { type: "resourceLink"; label: string; href: string; kind: "file" | "folder" };

function decodeResourceHref(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function normalizeResourcePath(value: string): string {
  return decodeResourceHref(value).replace(/\\/g, "/");
}

function isLocalResourceHref(value: string): boolean {
  const normalized = normalizeResourcePath(value);
  return /^[A-Za-z]:\//.test(normalized) || /^\//.test(normalized);
}

function resourceKind(label: string, href: string): "file" | "folder" {
  const normalized = normalizeResourcePath(href);
  return label.endsWith("/") || normalized.endsWith("/") ? "folder" : "file";
}

/** Render text with clickable links, color swatches and readonly resource tags */
export function RichText({ text, style, className }: { text: string; style?: React.CSSProperties; className?: string }) {
  const resourceIconTheme = useFeedbackStore((state) => state.resourceIconTheme);
  const parts = useMemo(() => {
    const RESOURCE_LINK_RE = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
    const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
    const COLOR_RE = /#(?:[0-9a-fA-F]{3}){1,2}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/g;
    const COMBINED = new RegExp(`(${RESOURCE_LINK_RE.source})|(${URL_RE.source})|(${COLOR_RE.source})`, "g");

    const result: RichTextPart[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = COMBINED.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: "text", value: text.slice(lastIndex, match.index) });
      }
      if (match[1]) {
        const label = match[2];
        const href = match[3];
        if (isLocalResourceHref(href)) {
          result.push({ type: "resourceLink", label, href: normalizeResourcePath(href), kind: resourceKind(label, href) });
        } else {
          result.push({ type: "text", value: match[1] });
        }
      } else if (match[4]) {
        result.push({ type: "url", value: match[4] });
      } else if (match[5]) {
        result.push({ type: "color", value: match[5] });
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
        if (part.type === "resourceLink") {
          const copyPath = () => navigator.clipboard.writeText(part.href).catch(() => {});
          return (
            <span
              key={i}
              className="readonly-resource-tag"
              role="button"
              tabIndex={0}
              data-tooltip={`${part.kind === "folder" ? "Folder" : "File"}\n${part.href}`}
              data-tooltip-placement="top"
              onClick={copyPath}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  copyPath();
                }
              }}
            >
              {resourceIconTheme === "catppuccin" ? (
                <CatppuccinResourceIcon entry={{ name: part.label, relativePath: part.href, kind: part.kind }} size={12} className="readonly-resource-icon" />
              ) : (
                <Icon name={part.kind === "folder" ? "folder" : "file-text"} size={11} />
              )}
              <span>{part.label}</span>
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
