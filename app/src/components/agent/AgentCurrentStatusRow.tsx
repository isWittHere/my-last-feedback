import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAgentConsoleSettings } from "../../agentConsoleSettings";
import { getApprovalDisplayDescription, isCommandLikeApproval } from "../../agent/approvalDisplay";
import { formatCompactTokenCount } from "../../agent/tokenStats";
import type { AgentApprovalCurrentStatus, AgentCurrentStatus } from "../../agent/currentStatus";
import { getAgentCurrentStatus } from "../../agent/currentStatus";
import type { AgentPermissionOption, AgentSession } from "../../agent/types";
import { useAgentStore } from "../../store/agentStore";
import { Icon } from "../Icons";
import { AgentActivityMatrix, type AgentActivityMatrixPhase } from "./AgentActivityMatrix";
import { AgentDiffPatchList, permissionBlockToDiffFiles } from "./AgentDiffViewer";

const STATUS_ROW_DRAWER_MS = 180;

function AgentStatusDrawer({ children }: { children: ReactNode | null }) {
  const open = children !== null;
  const removalTimerRef = useRef<number | null>(null);
  const [present, setPresent] = useState(open);
  const [renderedChildren, setRenderedChildren] = useState<ReactNode | null>(children);

  useEffect(() => {
    if (removalTimerRef.current) {
      window.clearTimeout(removalTimerRef.current);
      removalTimerRef.current = null;
    }

    if (open) {
      setRenderedChildren(children);
      setPresent(true);
      return;
    }

    if (!present) return;

    removalTimerRef.current = window.setTimeout(() => {
      removalTimerRef.current = null;
      setPresent(false);
      setRenderedChildren(null);
    }, STATUS_ROW_DRAWER_MS);
  }, [children, open, present]);

  useEffect(() => () => {
    if (removalTimerRef.current) window.clearTimeout(removalTimerRef.current);
  }, []);

  if (!present) return null;

  return (
    <div className="agent-current-status-drawer" data-open={open ? "true" : "false"} aria-hidden={open ? undefined : true}>
      <div className="agent-current-status-drawer-content">
        {renderedChildren}
      </div>
    </div>
  );
}

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

function AnimatedStatusText({ className, textKey, children, title }: { className: string; textKey: string; children: ReactNode; title?: string }) {
  return <span key={textKey} className={`${className} agent-status-fade-text`} title={title}>{children}</span>;
}

function AgentApprovalStatusRow({ session, status }: { session: AgentSession; status: AgentApprovalCurrentStatus }) {
  const { t } = useTranslation();
  const { collapseEditApprovalDiffByDefault } = useAgentConsoleSettings();
  const label = status.variant === "apply_edit" ? t("agentConsole.currentStatusApplyEdit", "Apply edits") : t("agentConsole.requestApproval", "Request approval");
  const title = status.title || t("agentConsole.permissionPending", "Permission request pending");
  const isCommandApproval = isCommandLikeApproval({ permission: status.permissionBlock, toolCall: status.toolCall, fallbackTitle: title });
  const displayTitle = isCommandApproval ? getApprovalDisplayDescription({ permission: status.permissionBlock, toolCall: status.toolCall, fallbackTitle: title }) : title;
  const diffSummaryLabel = status.fileSummary && !status.fileSummary.estimated && (status.fileSummary.additions > 0 || status.fileSummary.deletions > 0)
    ? t("agentConsole.currentStatusDiffCompact", "+{{additions}} -{{deletions}}", { additions: status.fileSummary.additions, deletions: status.fileSummary.deletions })
    : null;
  const permissionDiffFiles = useMemo(() => permissionBlockToDiffFiles(status.permissionBlock), [status.permissionBlock]);

  return (
    <section className="agent-approval-row agent-current-status-row" data-status-kind="approval" data-status-variant={status.variant} data-command-approval={isCommandApproval ? "true" : undefined} data-preview-overlay>
      <div className="agent-approval-row-main agent-current-status-row-main">
        <AgentActivityMatrix key="approval" phase="approval" />
        {!isCommandApproval && <Icon name="shield" size={13} />}
        <AnimatedStatusText className="agent-approval-row-label agent-silver-shimmer-text" textKey={label}>{label}</AnimatedStatusText>
        <AnimatedStatusText className="agent-approval-row-title" textKey={displayTitle} title={displayTitle}>{displayTitle}</AnimatedStatusText>
        {diffSummaryLabel && <span className="agent-current-status-diff-meta">{diffSummaryLabel}</span>}
        {status.extraCount > 0 && <span className="agent-approval-row-count">{t("agentConsole.approvalMoreCount", "+{{count}} more", { count: status.extraCount })}</span>}
      </div>
      <AgentApprovalActions sessionId={session.id} requestId={status.requestId} options={status.options} />
      {permissionDiffFiles.length > 0 && (
        <div className="agent-approval-diff-panel">
          <AgentDiffPatchList files={permissionDiffFiles} defaultCollapsed={collapseEditApprovalDiffByDefault} />
        </div>
      )}
    </section>
  );
}

function AgentApprovalWaitingStatusRow({ status }: { status: AgentApprovalCurrentStatus }) {
  const { t } = useTranslation();
  const title = status.title || t("agentConsole.permissionPending", "Permission request pending");
  const isCommandApproval = isCommandLikeApproval({ permission: status.permissionBlock, toolCall: status.toolCall, fallbackTitle: title });
  const displayTitle = isCommandApproval ? getApprovalDisplayDescription({ permission: status.permissionBlock, toolCall: status.toolCall, fallbackTitle: title }) : title;

  return (
    <section className="agent-approval-row agent-current-status-row" data-status-kind="approval-waiting" data-status-variant={status.variant} data-preview-overlay>
      <div className="agent-approval-row-main agent-current-status-row-main">
        <AgentActivityMatrix key="approval" phase="approval" />
        <AnimatedStatusText className="agent-approval-row-label agent-silver-shimmer-text" textKey="waiting-approval">{t("agentConsole.currentStatusWaitingApproval", "Waiting approval")}</AnimatedStatusText>
        <AnimatedStatusText className="agent-approval-row-title" textKey={displayTitle} title={displayTitle}>{displayTitle}</AnimatedStatusText>
      </div>
    </section>
  );
}

function activityPhaseForStatus(status: Exclude<AgentCurrentStatus, AgentApprovalCurrentStatus | null>): AgentActivityMatrixPhase {
  if (status.kind === "tool_running") return "tool";
  return status.kind;
}

function isSessionActivityActive(session: AgentSession): boolean {
  if (session.status === "starting" || session.status === "running" || session.status === "cancelling") return true;
  if (session.pendingPermissionIds.length > 0) return true;
  return session.messages.some((message) => message.role === "assistant" && message.status === "streaming");
}

function AgentSimpleStatusRow({ phase, statusKind, label, detail }: { phase: AgentActivityMatrixPhase; statusKind: string; label: string; detail?: string | null }) {
  return (
    <section className="agent-approval-row agent-current-status-row" data-status-kind={statusKind} data-preview-overlay>
      <div className="agent-approval-row-main agent-current-status-row-main">
        <AgentActivityMatrix key={phase} phase={phase} />
        <AnimatedStatusText className="agent-approval-row-label agent-silver-shimmer-text" textKey={label}>{label}</AnimatedStatusText>
        {detail && <span className="agent-current-status-row-meta">{detail}</span>}
      </div>
    </section>
  );
}

function AgentSettlingStatusRow({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();

  return (
    <section className="agent-approval-row agent-current-status-row" data-status-kind="settle" data-preview-overlay>
      <div className="agent-approval-row-main agent-current-status-row-main">
        <AgentActivityMatrix key="settle" phase="settle" onComplete={onComplete} />
        <AnimatedStatusText className="agent-approval-row-label agent-silver-shimmer-text" textKey="settling">{t("agentConsole.currentStatusSettling", "Finishing")}</AnimatedStatusText>
      </div>
    </section>
  );
}

export function AgentCurrentStatusRow({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const { approvalDisplayMode } = useAgentConsoleSettings();
  const status = useMemo(() => getAgentCurrentStatus(session), [session]);
  const sessionActive = isSessionActivityActive(session);
  const previousSessionActiveRef = useRef(sessionActive);
  const heldPhaseRef = useRef<AgentActivityMatrixPhase | null>(null);
  const [heldPhase, setHeldPhaseState] = useState<AgentActivityMatrixPhase | null>(null);
  const [settling, setSettling] = useState(false);

  const setHeldPhase = (phase: AgentActivityMatrixPhase | null) => {
    heldPhaseRef.current = phase;
    setHeldPhaseState(phase);
  };

  useEffect(() => {
    const previousSessionActive = previousSessionActiveRef.current;

    if (status && status.kind !== "approval") {
      setHeldPhase(activityPhaseForStatus(status));
      setSettling(false);
    } else if (status?.kind === "approval") {
      setHeldPhase("approval");
      setSettling(false);
    } else if (sessionActive) {
      setHeldPhase(heldPhaseRef.current || "thinking");
      setSettling(false);
    } else if (previousSessionActive && heldPhaseRef.current) {
      setHeldPhase(null);
      setSettling(true);
    } else {
      setHeldPhase(null);
      setSettling(false);
    }

    previousSessionActiveRef.current = sessionActive;
  }, [sessionActive, status]);

  let content: ReactNode | null = null;

  if (!status) {
    if (sessionActive && heldPhase) {
      const processingLabel = heldPhase === "approval"
        ? t("agentConsole.currentStatusWaitingApproval", "Waiting approval")
        : t("agentConsole.currentStatusProcessing", "Processing");
      content = <AgentSimpleStatusRow phase={heldPhase} statusKind="processing" label={processingLabel} />;
    } else if (settling) {
      content = <AgentSettlingStatusRow onComplete={() => setSettling(false)} />;
    }
    return <AgentStatusDrawer>{content}</AgentStatusDrawer>;
  }
  if (status.kind === "approval" && approvalDisplayMode === "step") return <AgentStatusDrawer><AgentApprovalWaitingStatusRow status={status} /></AgentStatusDrawer>;
  if (status.kind === "approval") return <AgentStatusDrawer><AgentApprovalStatusRow session={session} status={status} /></AgentStatusDrawer>;
  const statusCopy = status.kind === "thinking"
    ? t("agentConsole.currentStatusThinking", "Thinking")
    : status.kind === "output"
      ? t("agentConsole.currentStatusOutput", "Outputting")
      : t("agentConsole.currentStatusRunningTool", "Running tool");
  const tokenCount = status.kind === "thinking" || status.kind === "output" ? status.tokenCount : 0;
  const tokenLabel = tokenCount > 0 ? t("agentConsole.currentStatusTokenCount", "{{value}} tokens", { value: formatCompactTokenCount(tokenCount) }) : null;
  const detail = status.kind === "tool_running" ? status.label : tokenLabel;
  return <AgentStatusDrawer><AgentSimpleStatusRow phase={activityPhaseForStatus(status)} statusKind={status.kind} label={statusCopy} detail={detail} /></AgentStatusDrawer>;
}