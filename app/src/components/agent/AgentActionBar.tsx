import { useTranslation } from "react-i18next";
import type { AgentSession } from "../../agent/types";
import { useAgentStore } from "../../store/agentStore";
import { Icon } from "../Icons";

export function AgentActionBar({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const resolveMockPermission = useAgentStore((state) => state.resolveMockPermission);
  const pendingPermissionId = session.pendingPermissionIds[0];
  if (!pendingPermissionId) return null;
  return (
    <div className="agent-permission-dock" data-preview-overlay>
      <Icon name="lock" size={13} />
      <span>{t("agentConsole.permissionPending", "Permission request pending")}</span>
      <button type="button" onClick={() => resolveMockPermission(session.id, pendingPermissionId, "once")}>{t("agentConsole.allowOnce", "Allow once")}</button>
      <button type="button" onClick={() => resolveMockPermission(session.id, pendingPermissionId, "reject")}>{t("agentConsole.reject", "Reject")}</button>
    </div>
  );
}