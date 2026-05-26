import type { AgentSession } from "./types";

export function hasAgentComposerContent(session: AgentSession): boolean {
  return Boolean(
    session.draft.trim()
    || session.testLogText.trim()
    || session.gitAction
    || session.images.length > 0
    || session.mlcAttachments.length > 0
    || session.webAttachments.length > 0
  );
}