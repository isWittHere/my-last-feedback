import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getOpenCodeDefaultPermissionRules, getOpenCodePermissionPresetId, OPEN_CODE_PERMISSION_DEFINITIONS, OPEN_CODE_PERMISSION_PRESETS, type OpenCodePermissionAction } from "../../openCodeSettings";
import type { AgentOpenCodePermissionRule, AgentSession } from "../../agent/types";
import { useAgentStore } from "../../store/agentStore";
import { Icon } from "../Icons";
import { SettingsSegmentedControl } from "../SettingsSegmentedControl";

const OPEN_CODE_PERMISSION_ACTIONS: OpenCodePermissionAction[] = ["allow", "ask", "deny"];

function effectivePermissionAction(rules: AgentOpenCodePermissionRule[], permission: string, fallback: OpenCodePermissionAction): OpenCodePermissionAction {
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    const rule = rules[index];
    if (rule.permission === permission && rule.pattern === "*") return rule.action;
  }
  return fallback;
}

export function AgentPermissionIndicator({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const updateOpenCodeSessionPermission = useAgentStore((state) => state.updateOpenCodeSessionPermission);
  const applyOpenCodeSessionPermissionPreset = useAgentStore((state) => state.applyOpenCodeSessionPermissionPreset);
  const resetOpenCodeSessionPermissions = useAgentStore((state) => state.resetOpenCodeSessionPermissions);

  const currentRules = useMemo<AgentOpenCodePermissionRule[]>(() => {
    return session.openCodePermissionRules && session.openCodePermissionRules.length > 0
      ? session.openCodePermissionRules
      : getOpenCodeDefaultPermissionRules();
  }, [session.openCodePermissionRules]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  if (session.providerId !== "opencode" || !session.providerSessionId) return null;

  const actionLabel = (action: OpenCodePermissionAction) => {
    if (action === "allow") return t("agentConsole.permissionAllow", "Allow");
    if (action === "deny") return t("agentConsole.permissionDeny", "Deny");
    return t("agentConsole.permissionAsk", "Ask");
  };

  const actionIcon = (action: OpenCodePermissionAction) => {
    if (action === "allow") return "check";
    if (action === "deny") return "circle-x";
    return "warning";
  };

  const handleActionChange = (permission: string, action: OpenCodePermissionAction) => {
    void updateOpenCodeSessionPermission(session.id, permission, action);
  };

  const activePresetId = getOpenCodePermissionPresetId(currentRules);

  return (
    <div ref={rootRef} className={`agent-permission-indicator-wrap${open ? " open" : ""}`}>
      <button
        type="button"
        className={`agent-console-topbar-action agent-permission-indicator${open ? " active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        title={t("agentConsole.sessionPermissions", "Session permissions")}
        aria-expanded={open}
        aria-label={t("agentConsole.sessionPermissions", "Session permissions")}
      >
        <Icon name="shield" size={13} />
      </button>
      {open && (
        <div className="agent-permission-popover" data-preview-overlay>
          <div className="agent-permission-popover-head">
            <span>{t("agentConsole.sessionPermissions", "Session permissions")}</span>
            {session.openCodePermissionUpdating && <strong>{t("agentConsole.permissionUpdating", "Updating")}</strong>}
          </div>
          <div className="agent-permission-preset-list" aria-label={t("agentConsole.permissionPresets", "Permission presets")}>
            {OPEN_CODE_PERMISSION_PRESETS.map((preset) => {
              const isActive = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`agent-permission-preset${isActive ? " active" : ""}`}
                  onClick={() => void applyOpenCodeSessionPermissionPreset(session.id, preset.id)}
                  disabled={session.openCodePermissionUpdating}
                  aria-pressed={isActive}
                >
                  <Icon name={preset.icon} size={12} />
                  <span>{t(preset.labelKey, preset.defaultLabel)}</span>
                </button>
              );
            })}
          </div>
          <div className="agent-permission-list">
            {OPEN_CODE_PERMISSION_DEFINITIONS.map((definition) => {
              const currentAction = effectivePermissionAction(currentRules, definition.permission, definition.defaultAction);
              return (
                <div key={definition.permission} className="agent-permission-item">
                  <div className="agent-permission-info">
                    <Icon name={definition.icon} size={12} />
                    <span>{t(definition.labelKey, definition.defaultLabel)}</span>
                  </div>
                  <SettingsSegmentedControl
                    ariaLabel={t(definition.labelKey, definition.defaultLabel)}
                    value={currentAction}
                    onChange={(action) => handleActionChange(definition.permission, action as OpenCodePermissionAction)}
                    disabled={session.openCodePermissionUpdating}
                    className="agent-permission-actions"
                    options={OPEN_CODE_PERMISSION_ACTIONS.map((action) => ({
                      id: action,
                      label: actionLabel(action),
                      icon: <Icon name={actionIcon(action)} size={11} />,
                      variant: action,
                    }))}
                  />
                </div>
              );
            })}
          </div>
          {session.openCodePermissionError && <div className="agent-permission-error">{session.openCodePermissionError}</div>}
          <button
            type="button"
            className="agent-permission-reset"
            onClick={() => void resetOpenCodeSessionPermissions(session.id)}
            disabled={session.openCodePermissionUpdating}
          >
            <Icon name="refresh" size={12} />
            <span>{t("agentConsole.restoreDefaultPermissions", "Restore defaults")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
