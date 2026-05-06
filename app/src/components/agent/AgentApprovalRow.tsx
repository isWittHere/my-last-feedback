import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentPermissionBlock, AgentPermissionOption, AgentSession } from "../../agent/types";
import { useAgentStore } from "../../store/agentStore";
import { Icon } from "../Icons";

function collectPermissionBlocks(session: AgentSession): AgentPermissionBlock[] {
  const blocks: AgentPermissionBlock[] = [];
  for (const message of session.messages) {
    for (const block of message.blocks) {
      if (block.type === "permission") blocks.push(block);
    }
  }
  return blocks;
}

function getPendingPermissionBlocks(session: AgentSession): AgentPermissionBlock[] {
  const permissionBlocks = collectPermissionBlocks(session);
  if (session.pendingPermissionIds.length > 0) {
    return session.pendingPermissionIds
      .map((requestId) => permissionBlocks.find((block) => block.requestId === requestId))
      .filter((block): block is AgentPermissionBlock => Boolean(block));
  }
  return permissionBlocks.filter((block) => block.status === "pending");
}

export function AgentApprovalRow({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const [allowMenuOpen, setAllowMenuOpen] = useState(false);
  const allowMenuRef = useRef<HTMLDivElement>(null);
  const resolveMockPermission = useAgentStore((state) => state.resolveMockPermission);
  const pendingPermissionBlocks = useMemo(() => getPendingPermissionBlocks(session), [session]);
  const pendingPermissionBlock = pendingPermissionBlocks[0];
  const fallbackRequestId = session.pendingPermissionIds[0];
  const requestId = pendingPermissionBlock?.requestId || fallbackRequestId;

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

  if (!requestId) return null;

  const fallbackOptions: AgentPermissionOption[] = [
    { id: "once", label: t("agentConsole.allowOnce", "Allow once"), kind: "allow_once" },
    { id: "session", label: t("agentConsole.allowSession", "Allow for this session"), kind: "allow_session" },
    { id: "always", label: t("agentConsole.allowAlways", "Always allow"), kind: "allow_always" },
    { id: "reject", label: t("agentConsole.reject", "Reject"), kind: "reject_once" },
  ];
  const options = pendingPermissionBlock?.options.length ? pendingPermissionBlock.options : fallbackOptions;
  const allowOptions = options.filter((option) => option.kind === "allow_once" || option.kind === "allow_session" || option.kind === "allow_always");
  const primaryAllowOption = allowOptions.find((option) => option.kind === "allow_once") || allowOptions[0];
  const secondaryAllowOptions = allowOptions.filter((option) => option.id !== primaryAllowOption?.id);
  const rejectOption = options.find((option) => option.kind === "reject_once");
  const extraCount = Math.max(session.pendingPermissionIds.length, pendingPermissionBlocks.length) - 1;
  const resolve = (optionId: string) => {
    setAllowMenuOpen(false);
    resolveMockPermission(session.id, requestId, optionId);
  };

  return (
    <section className="agent-approval-row" data-preview-overlay>
      <div className="agent-approval-row-main">
        <Icon name="shield" size={13} />
        <span className="agent-approval-row-label agent-silver-shimmer-text">{t("agentConsole.requestApproval", "Request approval")}</span>
        <span className="agent-approval-row-title">{pendingPermissionBlock?.title || t("agentConsole.permissionPending", "Permission request pending")}</span>
        {extraCount > 0 && <span className="agent-approval-row-count">{t("agentConsole.approvalMoreCount", "+{{count}} more", { count: extraCount })}</span>}
      </div>
      <div className="agent-approval-row-actions">
        {rejectOption && (
          <button type="button" className="agent-approval-action-reject" onClick={() => resolve(rejectOption.id)}>
            {rejectOption.label}
          </button>
        )}
        {primaryAllowOption && (
          <div ref={allowMenuRef} className="agent-approval-allow-wrap" data-preview-overlay>
            <div className="agent-approval-split-button">
              <button type="button" className="agent-approval-action-allow-main" onClick={() => resolve(primaryAllowOption.id)} title={primaryAllowOption.label}>
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
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}