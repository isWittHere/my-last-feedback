import type { AgentSession } from "../../agent/types";
import { Icon } from "../Icons";
import { AgentContextIndicator } from "./AgentContextIndicator";
import { AgentDiffIndicator } from "./AgentDiffIndicator";

export function AgentHeaderDetailsRow({ session }: { session: AgentSession }) {
  const latestDiagnostic = session.diagnostics[session.diagnostics.length - 1];

  return (
    <div className="agent-console-header-details agent-header-glass-panel">
      <div className="agent-console-header-details-main">
        <div className="agent-header-path">
          <Icon name="folder" size={12} />
          <span>{session.cwd}</span>
        </div>
        <AgentDiffIndicator session={session} />
        <AgentContextIndicator session={session} />
      </div>
      {latestDiagnostic ? (
        <div className={`agent-header-diagnostic agent-header-diagnostic-${latestDiagnostic.level}`}>
          <Icon name={latestDiagnostic.level === "error" ? "circle-x" : latestDiagnostic.level === "warn" ? "warning" : "info"} size={12} />
          <span>{latestDiagnostic.message}</span>
        </div>
      ) : null}
    </div>
  );
}