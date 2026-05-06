import type { AgentSession } from "../../agent/types";
import { Icon } from "../Icons";
import { AgentContextIndicator } from "./AgentContextIndicator";
import { AgentDiffIndicator } from "./AgentDiffIndicator";
import { useTranslation } from "react-i18next";

export function AgentHeaderDetailsRow({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const runtime = session.providerRuntime;
  const latestDiagnostic = session.diagnostics.at(-1);
  const runtimeLabel = runtime?.initialized
    ? t("agentConsole.providerInitialized", "ACP initialized")
    : runtime?.processId
      ? t("agentConsole.providerConnected", "ACP connected")
      : t("agentConsole.providerDisconnected", "ACP disconnected");

  return (
    <div className="agent-console-header-details">
      <div className="agent-header-path" title={session.cwd}>
        <Icon name="folder" size={12} />
        <span>{session.cwd}</span>
      </div>
      <div className="agent-header-runtime" title={runtime?.processId || runtimeLabel}>
        <Icon name={runtime?.initialized ? "circle-check" : runtime?.processId ? "terminal" : "robot"} size={12} />
        <span>{runtimeLabel}</span>
        {runtime?.agentInfo?.version ? <span className="agent-header-runtime-version">{runtime.agentInfo.version}</span> : null}
      </div>
      {latestDiagnostic ? (
        <div className={`agent-header-diagnostic agent-header-diagnostic-${latestDiagnostic.level}`} title={latestDiagnostic.message}>
          <Icon name={latestDiagnostic.level === "error" ? "circle-x" : latestDiagnostic.level === "warn" ? "warning" : "info"} size={12} />
          <span>{latestDiagnostic.message}</span>
        </div>
      ) : null}
      <AgentDiffIndicator session={session} />
      <AgentContextIndicator session={session} />
    </div>
  );
}