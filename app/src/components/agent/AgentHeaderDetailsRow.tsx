import type { AgentSession } from "../../agent/types";
import { Icon } from "../Icons";
import { AgentContextIndicator } from "./AgentContextIndicator";
import { AgentDiffIndicator } from "./AgentDiffIndicator";

export function AgentHeaderDetailsRow({ session }: { session: AgentSession }) {
  return (
    <div className="agent-console-header-details">
      <div className="agent-header-path" title={session.cwd}>
        <Icon name="folder" size={12} />
        <span>{session.cwd}</span>
      </div>
      <AgentDiffIndicator session={session} />
      <AgentContextIndicator session={session} />
    </div>
  );
}