import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { readText as readClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { useAgentStore } from "../../store/agentStore";
import { useFeedbackStore, type DockColumnId, type DockTabId, type GitActionType } from "../../store/feedbackStore";
import { sameWorkspacePath, workspacePathKey } from "../../workspace/workspacePaths";
import { hasAgentComposerContent } from "../../agent/composer";
import { getEnabledOpenCodeModels, useOpenCodeSettings } from "../../openCodeSettings";
import type { AgentChoiceOption, AgentSession } from "../../agent/types";
import { Icon, MlcLogoIcon } from "../Icons";
import type { PromptCommandOption } from "../../composer/promptCommands";
import { SharedComposerInput } from "../composer/SharedComposerInput";
import { GIT_ACTION_TYPES, GitActionOptionIcon, GitActionTag, TestLogTag, gitActionLabelKey } from "../CallerPanelParts";
import { useAgentSessionVisualIdentity } from "./useAgentSessionVisualIdentity";

type AgentSelectMenuOption = AgentChoiceOption & { dividerAfter?: boolean };

const AGENT_COMPOSER_CALLER_ID = "agent-console";
const DOCK_COLUMN_IDS: DockColumnId[] = ["leftSidebar", "leftPage", "rightPage", "rightSidebar"];

function collectSessionUserPromptHistory(session: AgentSession): string[] {
  const history: string[] = [];
  for (const message of session.messages) {
    if (message.role !== "user") continue;
    const text = (message.composerDraft || message.blocks
      .filter((block) => block.type === "text")
      .map((block) => block.content)
      .join("\n\n")).trim();
    if (!text) continue;
    const existingIndex = history.indexOf(text);
    if (existingIndex >= 0) history.splice(existingIndex, 1);
    history.push(text);
  }
  return history;
}

function AgentSelectButton({ label, value, options, onSelect, onOpen }: { label: string; value: string; options: AgentSelectMenuOption[]; onSelect: (value: string) => void; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value);
  const displayValue = selected?.label || value;
  const updatePanelPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const maxWidth = Math.max(220, window.innerWidth - margin * 2);
    const width = Math.min(420, Math.max(220, Math.min(rect.width, maxWidth)));
    const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin));
    const maxHeight = Math.min(320, Math.max(180, window.innerHeight - margin * 2));
    const belowTop = rect.bottom + 6;
    const top = belowTop + maxHeight <= window.innerHeight - margin
      ? belowTop
      : Math.max(margin, rect.top - 6 - maxHeight);
    setPanelStyle({ left, top, width, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handleLayoutChange = () => updatePanelPosition();
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleLayoutChange);
    window.addEventListener("scroll", handleLayoutChange, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleLayoutChange);
      window.removeEventListener("scroll", handleLayoutChange, true);
    };
  }, [open, updatePanelPosition]);

  useLayoutEffect(() => {
    if (open) updatePanelPosition();
  }, [open, options.length, updatePanelPosition]);

  const panel = open ? createPortal(
    <div ref={panelRef} className="agent-new-session-workspace-panel agent-composer-select-panel" style={panelStyle} role="listbox" aria-label={label}>
      {options.map((option) => (
        <div key={option.id} className="agent-composer-select-item">
          <button
            type="button"
            className={`agent-new-session-workspace-option${option.id === value ? " selected" : ""}`}
            role="option"
            aria-selected={option.id === value}
            onClick={() => {
              onSelect(option.id);
              setOpen(false);
            }}
          >
            <span className="agent-new-session-workspace-option-label">{option.label}</span>
            {option.description ? <span className="agent-new-session-workspace-option-time">{option.description}</span> : null}
          </button>
          {option.dividerAfter ? <div className="agent-composer-select-divider" aria-hidden="true" /> : null}
        </div>
      ))}
    </div>,
    document.body,
  ) : null;

  return (
    <div className="agent-composer-select-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="btn agent-composer-select"
        onClick={() => setOpen((current) => {
          const next = !current;
          if (next) onOpen?.();
          return next;
        })}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${displayValue}`}
      >
        <span className="agent-composer-select-value">{displayValue}</span>
        <Icon name="chevron-down" size={10} />
      </button>
      {panel}
    </div>
  );
}

function modeMenuOptions(options: AgentChoiceOption[]): AgentSelectMenuOption[] {
  const hasSecondaryGroup = options.some((option) => option.id !== "build" && option.id !== "plan");
  if (!hasSecondaryGroup) return options;
  const dividerAnchorId = options.some((option) => option.id === "plan") ? "plan" : options.some((option) => option.id === "build") ? "build" : undefined;
  if (!dividerAnchorId) return options;
  return options.map((option) => ({
    ...option,
    dividerAfter: option.id === dividerAnchorId,
  }));
}

export function AgentComposer({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const testLogRef = useRef<HTMLTextAreaElement>(null);
  const branchInputRef = useRef<HTMLInputElement>(null);
  const [showTestLog, setShowTestLog] = useState(false);
  const [showGitPanel, setShowGitPanel] = useState(false);
  const updateDraft = useAgentStore((state) => state.updateDraft);
  const setSessionMode = useAgentStore((state) => state.setSessionMode);
  const setSessionModel = useAgentStore((state) => state.setSessionModel);
  const addImage = useAgentStore((state) => state.addImage);
  const removeImage = useAgentStore((state) => state.removeImage);
  const clearImages = useAgentStore((state) => state.clearImages);
  const removeMlcAttachment = useAgentStore((state) => state.removeMlcAttachment);
  const clearMlcAttachments = useAgentStore((state) => state.clearMlcAttachments);
  const removeWebAttachment = useAgentStore((state) => state.removeWebAttachment);
  const updateTestLog = useAgentStore((state) => state.updateTestLog);
  const setGitAction = useAgentStore((state) => state.setGitAction);
  const updateGitBranchName = useAgentStore((state) => state.updateGitBranchName);
  const sendAgentPrompt = useAgentStore((state) => state.sendAgentPrompt);
  const abortAgentPrompt = useAgentStore((state) => state.abortAgentPrompt);
  const appendAgentDiagnostic = useAgentStore((state) => state.appendAgentDiagnostic);
  const ensureAgentModes = useAgentStore((state) => state.ensureAgentModes);
  const ensureAgentCommands = useAgentStore((state) => state.ensureAgentCommands);
  const dockLayout = useFeedbackStore((state) => state.dockLayout);
  const setFocusedComposer = useFeedbackStore((state) => state.setFocusedComposer);
  const mlcActiveWorkspacePath = useFeedbackStore((state) => state.mlcActiveWorkspacePath);
  const setMlcActiveWorkspacePath = useFeedbackStore((state) => state.setMlcActiveWorkspacePath);
  const setDockActiveTab = useFeedbackStore((state) => state.setDockActiveTab);
  const setDockColumnCollapsed = useFeedbackStore((state) => state.setDockColumnCollapsed);
  const moveDockTabToColumn = useFeedbackStore((state) => state.moveDockTabToColumn);
  useOpenCodeSettings();
  const sessionIdentity = useAgentSessionVisualIdentity(session);
  const commandOptions = useMemo(() => {
    return (session.availableCommands || []).map((command): PromptCommandOption => ({
      id: command.id,
      name: command.label || command.id,
      description: command.description || "OpenCode command",
      content: `/${command.id} `,
      icon: "terminal",
    }));
  }, [session.availableCommands]);
  const userPromptHistory = useMemo(() => collectSessionUserPromptHistory(session), [session.messages]);
  const hasContent = hasAgentComposerContent(session);

  const findDockColumnForTab = useCallback((tabId: DockTabId): DockColumnId | null => (
    DOCK_COLUMN_IDS.find((columnId) => dockLayout.columns[columnId].tabIds.includes(tabId)) || null
  ), [dockLayout.columns]);

  const mlcDockColumnId = findDockColumnForTab("mlc");
  const resourcesDockColumnId = findDockColumnForTab("resources");
  const previewDockColumnId = findDockColumnForTab("previewBrowser");
  const previewInfoDockColumnId = findDockColumnForTab("previewInfo");
  const isMlcButtonActive = !!mlcDockColumnId
    && !dockLayout.columns[mlcDockColumnId].collapsed
    && dockLayout.columns[mlcDockColumnId].activeTabId === "mlc"
    && !!session.cwd
    && sameWorkspacePath(mlcActiveWorkspacePath, session.cwd);
  const isResourceButtonActive = !!resourcesDockColumnId
    && !dockLayout.columns[resourcesDockColumnId].collapsed
    && dockLayout.columns[resourcesDockColumnId].activeTabId === "resources"
    && !!session.cwd
    && sameWorkspacePath(mlcActiveWorkspacePath, session.cwd);
  const isPreviewButtonActive = !!previewDockColumnId
    && !dockLayout.columns[previewDockColumnId].collapsed
    && dockLayout.columns[previewDockColumnId].activeTabId === "previewBrowser";

  const focusAgentComposer = useCallback(() => {
    setFocusedComposer({
      callerId: AGENT_COMPOSER_CALLER_ID,
      sessionId: session.id,
      projectDirectory: session.cwd,
      workspaceKey: session.workspaceKey || workspacePathKey(session.cwd),
      kind: "agent",
      focusedAt: new Date().toISOString(),
    });
    void ensureAgentCommands(session.id);
  }, [ensureAgentCommands, session.cwd, session.id, session.workspaceKey, setFocusedComposer]);

  useEffect(() => {
    if (!session.draft.trimStart().startsWith("/")) return;
    if ((session.availableCommands?.length || 0) > 0) return;
    if (session.availableCommandsLoading) return;
    void ensureAgentCommands(session.id);
  }, [ensureAgentCommands, session.availableCommands?.length, session.availableCommandsLoading, session.draft, session.id]);

  const openResourcesPanel = useCallback(() => {
    if (isResourceButtonActive) {
      if (resourcesDockColumnId) setDockColumnCollapsed(resourcesDockColumnId, true);
      return;
    }
    if (!session.cwd) return;
    focusAgentComposer();
    setMlcActiveWorkspacePath(session.cwd);
    const targetColumnId = resourcesDockColumnId || "rightSidebar";
    if (!resourcesDockColumnId) moveDockTabToColumn("resources", targetColumnId);
    setDockColumnCollapsed(targetColumnId, false);
    setDockActiveTab(targetColumnId, "resources");
  }, [focusAgentComposer, isResourceButtonActive, moveDockTabToColumn, resourcesDockColumnId, session.cwd, setDockActiveTab, setDockColumnCollapsed, setMlcActiveWorkspacePath]);

  const openMlcPanel = useCallback(() => {
    if (isMlcButtonActive) {
      if (mlcDockColumnId) setDockColumnCollapsed(mlcDockColumnId, true);
      return;
    }
    if (!session.cwd) return;
    focusAgentComposer();
    setMlcActiveWorkspacePath(session.cwd);
    const targetColumnId = mlcDockColumnId || "rightSidebar";
    if (!mlcDockColumnId) moveDockTabToColumn("mlc", targetColumnId);
    setDockColumnCollapsed(targetColumnId, false);
    setDockActiveTab(targetColumnId, "mlc");
  }, [focusAgentComposer, isMlcButtonActive, mlcDockColumnId, moveDockTabToColumn, session.cwd, setDockActiveTab, setDockColumnCollapsed, setMlcActiveWorkspacePath]);

  const openPreviewPanel = useCallback(() => {
    if (isPreviewButtonActive) {
      if (previewDockColumnId) setDockColumnCollapsed(previewDockColumnId, true);
      if (previewInfoDockColumnId && previewInfoDockColumnId !== previewDockColumnId) setDockColumnCollapsed(previewInfoDockColumnId, true);
      return;
    }
    focusAgentComposer();
    const targetColumnId = previewDockColumnId && previewDockColumnId !== previewInfoDockColumnId ? previewDockColumnId : "leftPage";
    if (previewDockColumnId !== targetColumnId) moveDockTabToColumn("previewBrowser", targetColumnId);
    const infoTargetColumnId = previewInfoDockColumnId && previewInfoDockColumnId !== targetColumnId ? previewInfoDockColumnId : "rightSidebar";
    if (previewInfoDockColumnId !== infoTargetColumnId) moveDockTabToColumn("previewInfo", infoTargetColumnId);
    setDockColumnCollapsed(targetColumnId, false);
    setDockColumnCollapsed(infoTargetColumnId, false);
    setDockActiveTab(targetColumnId, "previewBrowser");
    if (infoTargetColumnId !== targetColumnId) setDockActiveTab(infoTargetColumnId, "previewInfo");
  }, [focusAgentComposer, isPreviewButtonActive, moveDockTabToColumn, previewDockColumnId, previewInfoDockColumnId, setDockActiveTab, setDockColumnCollapsed]);

  const send = useCallback(() => {
    void sendAgentPrompt(session.id);
  }, [sendAgentPrompt, session.id]);

  const abort = useCallback(() => {
    void abortAgentPrompt(session.id);
  }, [abortAgentPrompt, session.id]);

  const handleAttachLogClick = useCallback(async () => {
    const wasHidden = !showTestLog;
    setShowTestLog((current) => !current);
    if (!wasHidden) return;
    if (!session.testLogText.trim()) {
      try {
        const text = await readClipboardText();
        if (text && text.length > 50) updateTestLog(session.id, text);
      } catch { /* clipboard access denied or empty */ }
    }
    setTimeout(() => testLogRef.current?.focus(), 50);
  }, [session.id, session.testLogText, showTestLog, updateTestLog]);

  const handleGitActionClick = useCallback((type: GitActionType) => {
    const isSelected = session.gitAction?.type === type;
    if (isSelected) {
      setGitAction(session.id, null);
      return;
    }
    setGitAction(session.id, { type, branchName: type === "create-branch" ? "" : undefined });
    if (type === "create-branch") setTimeout(() => branchInputRef.current?.focus(), 50);
  }, [session.gitAction?.type, session.id, setGitAction]);

  const attachmentActionButtons = (
    <>
      <button
        type="button"
        className="btn"
        style={{
          background: showTestLog ? sessionIdentity.color : undefined,
          borderColor: showTestLog ? sessionIdentity.color : undefined,
          color: showTestLog ? "#fff" : undefined,
        }}
        onClick={handleAttachLogClick}
      >
        <Icon name="terminal" size={12} />
        <span className="attachment-action-label">{t("testLog.attach", "Attach Log")}</span>
        {session.testLogText.length > 0 && (
          <span className="attachment-action-meta" style={{ color: showTestLog ? "rgba(255,255,255,0.7)" : "var(--color-text-muted)" }}>{session.testLogText.length}</span>
        )}
      </button>
      <button
        type="button"
        className="btn"
        style={{
          background: showGitPanel ? sessionIdentity.color : undefined,
          borderColor: showGitPanel ? sessionIdentity.color : undefined,
          color: showGitPanel ? "#fff" : undefined,
        }}
        onClick={() => setShowGitPanel((current) => !current)}
        title={t("gitAction.buttonTooltipNoTimer", "Git Action")}
      >
        <Icon name="git-commit" size={12} />
        <span className="attachment-action-label">{t("gitAction.button", "Git Action")}</span>
      </button>
      <button
        type="button"
        className="btn"
        style={{
          background: isResourceButtonActive ? sessionIdentity.color : undefined,
          borderColor: isResourceButtonActive ? sessionIdentity.color : undefined,
          color: isResourceButtonActive ? "#fff" : undefined,
        }}
        title={t("resources.openPanel", "Open project resources")}
        onClick={openResourcesPanel}
      >
        <Icon name="folder" size={12} />
        <span className="attachment-action-label">{t("resources.button", "Resources")}</span>
      </button>
      <button
        type="button"
        className="btn"
        style={{
          background: isPreviewButtonActive ? sessionIdentity.color : undefined,
          borderColor: isPreviewButtonActive ? sessionIdentity.color : undefined,
          color: isPreviewButtonActive ? "#fff" : undefined,
        }}
        title={t("previewBrowser.openPanel", "Open preview browser")}
        onClick={openPreviewPanel}
      >
        <Icon name="globe" size={12} />
        <span className="attachment-action-label">{t("previewBrowser.button", "Preview")}</span>
        {session.webAttachments.length > 0 && (
          <span className="attachment-action-meta" style={{ color: isPreviewButtonActive ? "rgba(255,255,255,0.7)" : "var(--color-text-muted)" }}>{session.webAttachments.length}</span>
        )}
      </button>
      <button
        type="button"
        className="btn"
        style={{
          background: isMlcButtonActive ? sessionIdentity.color : undefined,
          borderColor: isMlcButtonActive ? sessionIdentity.color : undefined,
          color: isMlcButtonActive ? "#fff" : undefined,
        }}
        title={t("mlc.openPanel", "Open My Last Chat references")}
        onClick={openMlcPanel}
      >
        <MlcLogoIcon size={12} />
        <span className="attachment-action-label">{t("mlc.button", "MLC")}</span>
        {session.mlcAttachments.length > 0 && (
          <span className="attachment-action-meta" style={{ color: isMlcButtonActive ? "rgba(255,255,255,0.7)" : "var(--color-text-muted)" }}>{session.mlcAttachments.length}</span>
        )}
      </button>
    </>
  );

  const attachmentMiddleTags = (
    <>
      {(session.testLogText.trim() || showTestLog) && (
        <TestLogTag showTestLog={showTestLog} setShowTestLog={setShowTestLog} testLogRef={testLogRef} testLogText={session.testLogText} callerColor={sessionIdentity.color} />
      )}
      {session.gitAction && (
        <GitActionTag gitAction={session.gitAction} showGitPanel={showGitPanel} setShowGitPanel={setShowGitPanel} callerColor={sessionIdentity.color} onRemove={() => setGitAction(session.id, null)} />
      )}
    </>
  );

  const expandedAttachmentPanels = (
    <>
      {showTestLog && (
        <div className="px-3 pb-1">
          <div
            className="rounded-lg"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-input-raised)",
              maxHeight: 125,
              overflowY: "auto",
            }}
          >
            <textarea
              ref={testLogRef}
              value={session.testLogText}
              onChange={(event) => updateTestLog(session.id, event.target.value)}
              placeholder={t("testLog.placeholder", "Paste test output or logs here...")}
              className="input-area panel-testlog"
              style={{ minHeight: 82, resize: "vertical", border: 0, borderRadius: 0 }}
            />
          </div>
        </div>
      )}
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
              const isSelected = session.gitAction?.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  className="btn"
                  style={{
                    fontSize: 11,
                    padding: "3px 10px",
                    background: isSelected ? sessionIdentity.color : undefined,
                    borderColor: isSelected ? sessionIdentity.color : undefined,
                    color: isSelected ? "#fff" : undefined,
                  }}
                  onClick={() => handleGitActionClick(type)}
                >
                  <GitActionOptionIcon type={type} />
                  {t(`gitAction.${gitActionLabelKey(type)}`)}
                </button>
              );
            })}
            {session.gitAction?.type === "create-branch" && (
              <input
                ref={branchInputRef}
                type="text"
                value={session.gitAction.branchName || ""}
                onChange={(event) => updateGitBranchName(session.id, event.target.value)}
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
    </>
  );

  const modeOptions = useMemo(() => modeMenuOptions(session.availableModes || []), [session.availableModes]);
  const modelOptions = getEnabledOpenCodeModels(session.availableModels || [], session.modelId);
  const effectiveModelId = session.modelId || modelOptions[0]?.id;
  const selectedModel = modelOptions.find((model) => model.id === effectiveModelId) || (effectiveModelId ? session.availableModels?.find((model) => model.id === effectiveModelId) : undefined);
  const imageAttachmentsDisabled = selectedModel?.capabilities?.input?.image !== true;
  const imageAttachmentRejectedReason = t("agentConsole.imageAttachmentRejected", "The selected model does not support image input. The image was not added.");
  const handleImageAttachmentRejected = useCallback((reason: string) => {
    appendAgentDiagnostic(session.id, "warn", reason || imageAttachmentRejectedReason);
  }, [appendAgentDiagnostic, imageAttachmentRejectedReason, session.id]);
  const bottomLeftSlot = modeOptions.length > 0 || modelOptions.length > 0 ? (
    <div className="agent-composer-selectors">
      {modeOptions.length > 0 ? <AgentSelectButton label={t("agentConsole.mode", "Mode")} value={session.modeId || modeOptions[0].id} options={modeOptions} onSelect={(mode) => setSessionMode(session.id, mode)} onOpen={() => { void ensureAgentModes(session.id); }} /> : null}
      {modelOptions.length > 0 ? <AgentSelectButton label={t("agentConsole.model", "Model")} value={session.modelId || modelOptions[0].id} options={modelOptions} onSelect={(model) => setSessionModel(session.id, model)} /> : null}
    </div>
  ) : null;

  const isCancelling = session.status === "cancelling";
  const isRunning = session.status === "running" || isCancelling;
  const sendButtonClassName = `agent-send-button${isRunning ? " agent-send-button-abort" : ""}${isCancelling ? " agent-send-button-cancelling" : ""}`;
  const submitControl = (
    <button type="button" className={sendButtonClassName} onClick={isRunning ? abort : send} disabled={isRunning ? isCancelling : !hasContent} title={isCancelling ? t("agentConsole.status.cancelling", "Cancelling") : isRunning ? t("agentConsole.abort", "Abort") : t("agentConsole.send", "Send")}>
      <Icon name={isRunning ? "circle-x" : "send"} size={15} />
    </button>
  );
  return (
    <>
      {session.draftSource && <div className="agent-draft-source-note">{t("agentConsole.forkDraftSource", "Draft from forked message")}</div>}
      <SharedComposerInput
        id={session.id}
        value={session.draft}
        projectDirectory={session.cwd}
        placeholder={t("agentConsole.placeholder", "Ask the agent to work in this workspace...")}
        commands={commandOptions}
        slashCommandState={{
          loading: session.availableCommandsLoading,
          error: session.availableCommandsError,
          loadingText: t("agentConsole.loadingOpenCodeCommands", "Loading OpenCode commands..."),
          errorText: t("agentConsole.openCodeCommandsLoadFailed", "OpenCode commands failed to load"),
          emptyText: t("agentConsole.noOpenCodeCommands", "No OpenCode commands are available in this project"),
          noMatchesText: t("agentConsole.noMatchingOpenCodeCommands", "No matching OpenCode commands"),
        }}
        images={session.images}
        mlcAttachments={session.mlcAttachments}
        webAttachments={session.webAttachments}
        onChange={(value) => updateDraft(session.id, value)}
        onFocus={focusAgentComposer}
        historyItems={userPromptHistory}
        onAddImage={(image) => addImage(session.id, image)}
        onRemoveImage={(path) => removeImage(session.id, path)}
        onClearImages={() => clearImages(session.id)}
        imageAttachmentsDisabled={imageAttachmentsDisabled}
        imageAttachmentsDisabledReason={imageAttachmentRejectedReason}
        onImageAttachmentRejected={handleImageAttachmentRejected}
        onRemoveMlcAttachment={(filePath) => removeMlcAttachment(session.id, filePath)}
        onClearMlcAttachments={() => clearMlcAttachments(session.id)}
        onRemoveWebAttachment={(attachmentId) => removeWebAttachment(session.id, attachmentId)}
        onSubmit={send}
        attachmentActionButtons={attachmentActionButtons}
        attachmentMiddleTags={attachmentMiddleTags}
        hasAttachmentMiddleTags={Boolean(session.testLogText.trim() || showTestLog || session.gitAction)}
        expandedAttachmentPanels={expandedAttachmentPanels}
        bottomLeftSlot={bottomLeftSlot}
        submitControl={submitControl}
        insertEventTarget={{ callerId: AGENT_COMPOSER_CALLER_ID, sessionId: session.id, kind: "agent" }}
      />
    </>
  );
}
