import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentConsoleSettings } from "../../agentConsoleSettings";
import { getApprovalDisplayDescription, isCommandLikeApproval } from "../../agent/approvalDisplay";
import { formatCompactTokenCount } from "../../agent/tokenStats";
import type { AgentApprovalCurrentStatus, AgentCurrentStatus, AgentEditFileSummary } from "../../agent/currentStatus";
import { getAgentCurrentStatus } from "../../agent/currentStatus";
import type { AgentPermissionOption, AgentSession } from "../../agent/types";
import { useAgentStore } from "../../store/agentStore";
import { Icon } from "../Icons";
import { AgentDiffPatchList, permissionBlockToDiffFiles } from "./AgentDiffViewer";

function permissionOptionLabel(t: ReturnType<typeof useTranslation>["t"], option: AgentPermissionOption): string {
  if (option.kind === "allow_once") return t("agentConsole.allowOnce", "Allow once");
  if (option.kind === "allow_session") return t("agentConsole.allowSession", "Allow for this session");
  if (option.kind === "allow_always") return t("agentConsole.allowAlways", "Always allow");
  return t("agentConsole.reject", "Reject");
}

export function AgentApprovalActions({ sessionId, requestId, options }: { sessionId: string; requestId: string; options: AgentPermissionOption[] }) {
  const { t } = useTranslation();
  const [allowMenuOpen, setAllowMenuOpen] = useState(false);
  const allowMenuRef = useRef<HTMLDivElement>(null);
  const resolveAgentPermission = useAgentStore((state) => state.resolveAgentPermission);

  useEffect(() => {
    if (!allowMenuOpen) return;
    const closeIfOutside = (target: EventTarget | null) => {
      if (allowMenuRef.current && target instanceof Node && !allowMenuRef.current.contains(target)) setAllowMenuOpen(false);
    };
    const handleMouseDown = (event: MouseEvent) => closeIfOutside(event.target);
    const handleFocusIn = (event: FocusEvent) => closeIfOutside(event.target);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAllowMenuOpen(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [allowMenuOpen]);

  const fallbackOptions: AgentPermissionOption[] = [
    { id: "once", label: "", kind: "allow_once" },
    { id: "session", label: "", kind: "allow_session" },
    { id: "always", label: "", kind: "allow_always" },
    { id: "reject", label: "", kind: "reject_once" },
  ];
  const resolvedOptions = options.length ? options : fallbackOptions;
  const allowOptions = resolvedOptions.filter((option) => option.kind === "allow_once" || option.kind === "allow_session" || option.kind === "allow_always");
  const primaryAllowOption = allowOptions.find((option) => option.kind === "allow_once") || allowOptions[0];
  const secondaryAllowOptions = allowOptions.filter((option) => option.id !== primaryAllowOption?.id);
  const rejectOption = resolvedOptions.find((option) => option.kind === "reject_once");
  const resolve = (optionId: string) => {
    setAllowMenuOpen(false);
    resolveAgentPermission(sessionId, requestId, optionId);
  };

  return (
    <div className="agent-approval-row-actions agent-current-status-row-actions">
      {rejectOption && (
        <button type="button" className="agent-approval-action-reject" onClick={() => resolve(rejectOption.id)}>
          {permissionOptionLabel(t, rejectOption)}
        </button>
      )}
      {primaryAllowOption && (
        <div ref={allowMenuRef} className="agent-approval-allow-wrap" data-preview-overlay>
          <div className="agent-approval-split-button">
            <button type="button" className="agent-approval-action-allow-main" onClick={() => resolve(primaryAllowOption.id)} title={permissionOptionLabel(t, primaryAllowOption)}>
              {t("agentConsole.allow", "Allow")}
            </button>
            <button type="button" className="agent-approval-action-allow-caret" onClick={() => setAllowMenuOpen((value) => !value)} title={t("agentConsole.moreAllowOptions", "More allow options")}>
              <Icon name="chevron-down" size={13} />
            </button>
          </div>
          {allowMenuOpen && secondaryAllowOptions.length > 0 && (
            <div className="app-select-panel agent-approval-allow-menu" data-preview-overlay>
              {secondaryAllowOptions.map((option) => (
                <button key={option.id} type="button" className="app-select-option" onClick={() => resolve(option.id)}>
                  {permissionOptionLabel(t, option)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatFileSummary(t: ReturnType<typeof useTranslation>["t"], fileSummary: AgentEditFileSummary): string {
  if (fileSummary.primaryPath) return fileSummary.primaryPath;
  return t("agentConsole.currentStatusFilesChanged", "{{count}} files", { count: fileSummary.changedFiles });
}

function AgentApprovalStatusRow({ session, status }: { session: AgentSession; status: AgentApprovalCurrentStatus }) {
  const { t } = useTranslation();
  const label = status.variant === "apply_edit" ? t("agentConsole.currentStatusApplyEdit", "Apply edits") : t("agentConsole.requestApproval", "Request approval");
  const title = status.title || t("agentConsole.permissionPending", "Permission request pending");
  const isCommandApproval = isCommandLikeApproval({ permission: status.permissionBlock, toolCall: status.toolCall, fallbackTitle: title });
  const displayTitle = isCommandApproval ? getApprovalDisplayDescription({ permission: status.permissionBlock, toolCall: status.toolCall, fallbackTitle: title }) : title;
  const fileSummaryLabel = status.fileSummary ? formatFileSummary(t, status.fileSummary) : null;
  const diffSummaryLabel = status.fileSummary && !status.fileSummary.estimated && (status.fileSummary.additions > 0 || status.fileSummary.deletions > 0)
    ? t("agentConsole.currentStatusDiffCompact", "+{{additions}} -{{deletions}}", { additions: status.fileSummary.additions, deletions: status.fileSummary.deletions })
    : null;
  const permissionDiffFiles = useMemo(() => permissionBlockToDiffFiles(status.permissionBlock), [status.permissionBlock]);

  return (
    <section className="agent-approval-row agent-current-status-row" data-status-kind="approval" data-status-variant={status.variant} data-command-approval={isCommandApproval ? "true" : undefined} data-preview-overlay>
      <div className="agent-approval-row-main agent-current-status-row-main">
        {!isCommandApproval && <Icon name="shield" size={13} />}
        <span className="agent-approval-row-label agent-silver-shimmer-text">{label}</span>
        <span className="agent-approval-row-title" title={displayTitle}>{displayTitle}</span>
        {fileSummaryLabel && <span className="agent-current-status-file-chip" title={fileSummaryLabel}>{fileSummaryLabel}</span>}
        {diffSummaryLabel && <span className="agent-current-status-diff-meta">{diffSummaryLabel}</span>}
        {status.extraCount > 0 && <span className="agent-approval-row-count">{t("agentConsole.approvalMoreCount", "+{{count}} more", { count: status.extraCount })}</span>}
      </div>
      <AgentApprovalActions sessionId={session.id} requestId={status.requestId} options={status.options} />
      {permissionDiffFiles.length > 0 && (
        <div className="agent-approval-diff-panel">
          <AgentDiffPatchList files={permissionDiffFiles} />
        </div>
      )}
    </section>
  );
}

function AgentActivityStatusRow({ status }: { status: Exclude<AgentCurrentStatus, AgentApprovalCurrentStatus | null> }) {
  const { t } = useTranslation();
  const statusCopy = status.kind === "thinking"
    ? t("agentConsole.currentStatusThinking", "Thinking")
    : status.kind === "output"
      ? t("agentConsole.currentStatusOutput", "Outputting")
      : t("agentConsole.currentStatusRunningTool", "Running tool");
  const tokenCount = status.kind === "thinking" || status.kind === "output" ? status.tokenCount : 0;
  const tokenLabel = tokenCount > 0 ? t("agentConsole.currentStatusTokenCount", "{{value}} tokens", { value: formatCompactTokenCount(tokenCount) }) : null;
  const detail = status.kind === "tool_running" ? status.label : tokenLabel;
  const iconName = status.kind === "thinking" ? "spinner" : status.kind === "output" ? "message-dot" : "wrench";

  return (
    <section className="agent-approval-row agent-current-status-row" data-status-kind={status.kind} data-preview-overlay>
      <div className="agent-approval-row-main agent-current-status-row-main">
        <Icon name={iconName} size={13} className="agent-current-status-row-icon" />
        <span className="agent-approval-row-label agent-silver-shimmer-text">{statusCopy}</span>
        {detail && <span className="agent-current-status-row-meta">{detail}</span>}
      </div>
    </section>
  );
}

export function AgentCurrentStatusRow({ session }: { session: AgentSession }) {
  const { approvalDisplayMode, processStepDefaultMode } = useAgentConsoleSettings();
  const status = useMemo(() => getAgentCurrentStatus(session), [session]);

  if (!status) return null;
  if (status.kind === "approval" && processStepDefaultMode === "timeline" && approvalDisplayMode === "step") return null;
  if (status.kind === "approval") return <AgentApprovalStatusRow session={session} status={status} />;
  return <AgentActivityStatusRow status={status} />;
}