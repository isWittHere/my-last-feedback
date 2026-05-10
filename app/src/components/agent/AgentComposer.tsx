import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { readText as readClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { useAgentStore } from "../../store/agentStore";
import { useFeedbackStore, type DockColumnId, type DockTabId, type GitActionType } from "../../store/feedbackStore";
import { workspacePathKey } from "../../workspace/workspacePaths";
import { hasAgentComposerContent } from "../../agent/composer";
import { getEnabledOpenCodeModels, useOpenCodeSettings } from "../../openCodeSettings";
import type { AgentChoiceOption, AgentSession } from "../../agent/types";
import { Icon, MlcLogoIcon } from "../Icons";
import type { PromptCommandOption } from "../../composer/promptCommands";
import { SharedComposerInput } from "../composer/SharedComposerInput";
import { GIT_ACTION_TYPES, GitActionOptionIcon, GitActionTag, TestLogTag, gitActionLabelKey } from "../CallerPanelParts";
import { useAgentSessionVisualIdentity } from "./useAgentSessionVisualIdentity";

const AGENT_COMPOSER_CALLER_ID = "agent-console";
const DOCK_COLUMN_IDS: DockColumnId[] = ["leftSidebar", "leftPage", "rightPage", "rightSidebar"];

function AgentSelectButton({ label, value, options, onSelect }: { label: string; value: string; options: AgentChoiceOption[]; onSelect: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);
  const displayValue = selected?.label || value;
  return (
    <div
      className="agent-composer-select-wrap"
      onBlur={(event) => {
        const nextFocus = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(nextFocus)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button type="button" className="btn agent-composer-select" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${displayValue}`}>
        <span className="agent-composer-select-label">{label}</span>
        <span className="agent-composer-select-value">{displayValue}</span>
        <Icon name="chevron-down" size={10} />
      </button>
      {open && (
        <div className="agent-composer-select-menu" role="listbox" data-preview-overlay>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === value ? "active" : ""}
              role="option"
              aria-selected={option.id === value}
              onClick={() => {
                onSelect(option.id);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.id === value ? <Icon name="check" size={11} /> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  const ensureAgentCommands = useAgentStore((state) => state.ensureAgentCommands);
  const dockLayout = useFeedbackStore((state) => state.dockLayout);
  const setFocusedComposer = useFeedbackStore((state) => state.setFocusedComposer);
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
  const hasContent = hasAgentComposerContent(session);

  const findDockColumnForTab = useCallback((tabId: DockTabId): DockColumnId | null => (
    DOCK_COLUMN_IDS.find((columnId) => dockLayout.columns[columnId].tabIds.includes(tabId)) || null
  ), [dockLayout.columns]);

  const focusAgentComposer = useCallback(() => {
    setFocusedComposer({
      callerId: AGENT_COMPOSER_CALLER_ID,
      sessionId: session.id,
      projectDirectory: session.cwd,
      workspaceKey: session.workspaceKey || workspacePathKey(session.cwd),
      ownerAlias: session.ownerAlias || "",
      kind: "agent",
      focusedAt: new Date().toISOString(),
    });
    void ensureAgentCommands(session.id);
  }, [ensureAgentCommands, session.cwd, session.id, setFocusedComposer]);

  useEffect(() => {
    if (!session.draft.trimStart().startsWith("/")) return;
    if ((session.availableCommands?.length || 0) > 0) return;
    if (session.availableCommandsLoading) return;
    void ensureAgentCommands(session.id);
  }, [ensureAgentCommands, session.availableCommands?.length, session.availableCommandsLoading, session.draft, session.id]);

  const openResourcesPanel = useCallback(() => {
    focusAgentComposer();
    setMlcActiveWorkspacePath(session.cwd);
    const resourcesColumnId = findDockColumnForTab("resources");
    const targetColumnId = resourcesColumnId || "rightSidebar";
    if (!resourcesColumnId) moveDockTabToColumn("resources", targetColumnId);
    setDockColumnCollapsed(targetColumnId, false);
    setDockActiveTab(targetColumnId, "resources");
  }, [findDockColumnForTab, focusAgentComposer, moveDockTabToColumn, session.cwd, setDockActiveTab, setDockColumnCollapsed, setMlcActiveWorkspacePath]);

  const openMlcPanel = useCallback(() => {
    focusAgentComposer();
    setMlcActiveWorkspacePath(session.cwd);
    const mlcColumnId = findDockColumnForTab("mlc");
    const targetColumnId = mlcColumnId || "rightSidebar";
    if (!mlcColumnId) moveDockTabToColumn("mlc", targetColumnId);
    setDockColumnCollapsed(targetColumnId, false);
    setDockActiveTab(targetColumnId, "mlc");
  }, [findDockColumnForTab, focusAgentComposer, moveDockTabToColumn, session.cwd, setDockActiveTab, setDockColumnCollapsed, setMlcActiveWorkspacePath]);

  const openPreviewPanel = useCallback(() => {
    focusAgentComposer();
    const previewColumnId = findDockColumnForTab("previewBrowser");
    const previewInfoColumnId = findDockColumnForTab("previewInfo");
    const targetColumnId = previewColumnId && previewColumnId !== previewInfoColumnId ? previewColumnId : "leftPage";
    if (previewColumnId !== targetColumnId) moveDockTabToColumn("previewBrowser", targetColumnId);
    const infoTargetColumnId = previewInfoColumnId && previewInfoColumnId !== targetColumnId ? previewInfoColumnId : "rightSidebar";
    if (previewInfoColumnId !== infoTargetColumnId) moveDockTabToColumn("previewInfo", infoTargetColumnId);
    setDockColumnCollapsed(targetColumnId, false);
    setDockColumnCollapsed(infoTargetColumnId, false);
    setDockActiveTab(targetColumnId, "previewBrowser");
    if (infoTargetColumnId !== targetColumnId) setDockActiveTab(infoTargetColumnId, "previewInfo");
  }, [findDockColumnForTab, focusAgentComposer, moveDockTabToColumn, setDockActiveTab, setDockColumnCollapsed]);

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
          background: showTestLog ? "var(--color-primary)" : undefined,
          borderColor: showTestLog ? "var(--color-primary)" : undefined,
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
          background: showGitPanel ? "var(--color-primary)" : undefined,
          borderColor: showGitPanel ? "var(--color-primary)" : undefined,
          color: showGitPanel ? "#fff" : undefined,
        }}
        onClick={() => setShowGitPanel((current) => !current)}
        title={t("gitAction.buttonTooltipNoTimer", "Git Action")}
      >
        <Icon name="git-commit" size={12} />
        <span className="attachment-action-label">{t("gitAction.button", "Git Action")}</span>
      </button>
      <button type="button" className="btn" title={t("resources.openPanel", "Open project resources")} onClick={openResourcesPanel}>
        <Icon name="folder" size={12} />
        <span className="attachment-action-label">{t("resources.button", "Resources")}</span>
      </button>
      <button type="button" className="btn" title={t("previewBrowser.openPanel", "Open preview browser")} onClick={openPreviewPanel}>
        <Icon name="globe" size={12} />
        <span className="attachment-action-label">{t("previewBrowser.button", "Preview")}</span>
        {session.webAttachments.length > 0 && (
          <span className="attachment-action-meta" style={{ color: "var(--color-text-muted)" }}>{session.webAttachments.length}</span>
        )}
      </button>
      <button type="button" className="btn" title={t("mlc.openPanel", "Open My Last Chat references")} onClick={openMlcPanel}>
        <MlcLogoIcon size={12} />
        <span className="attachment-action-label">{t("mlc.button", "MLC")}</span>
        {session.mlcAttachments.length > 0 && (
          <span className="attachment-action-meta" style={{ color: "var(--color-text-muted)" }}>{session.mlcAttachments.length}</span>
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
                    background: isSelected ? "var(--color-primary)" : undefined,
                    borderColor: isSelected ? "var(--color-primary)" : undefined,
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

  const modeOptions = session.availableModes || [];
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
      {modeOptions.length > 0 ? <AgentSelectButton label={t("agentConsole.mode", "Mode")} value={session.modeId || modeOptions[0].id} options={modeOptions} onSelect={(mode) => setSessionMode(session.id, mode)} /> : null}
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
