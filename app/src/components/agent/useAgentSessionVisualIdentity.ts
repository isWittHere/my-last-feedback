import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getAgentSessionIdentity, type AgentSessionIdentity } from "../../agent/sessionIdentity";
import type { AgentSession } from "../../agent/types";
import { agentIdentityLanguage } from "../../identity/agentIdentity";
import { resolveWorkspaceIdentity, type WorkspaceColorCandidate } from "../../identity/workspaceIdentity";
import { useFeedbackStore } from "../../store/feedbackStore";
import { workspacePathKey } from "../../workspace/workspacePaths";

function useWorkspaceColorCandidates(): WorkspaceColorCandidate[] {
  const callers = useFeedbackStore((state) => state.callers);
  const sessions = useFeedbackStore((state) => state.sessions);
  return useMemo(() => {
    const callerById = new Map(callers.map((caller) => [caller.id, caller] as const));
    return sessions.map((session) => {
      const caller = callerById.get(session.callerId);
      return {
        workspaceKey: caller?.workspaceKey,
        workspacePath: session.projectDirectory,
        color: caller?.color,
        ownerAlias: caller?.alias,
      };
    });
  }, [callers, sessions]);
}

function matchingOwnerAlias(workspaceKey: string, candidates: WorkspaceColorCandidate[]): string {
  return candidates.find((candidate) => {
    const candidateKey = candidate.workspaceKey?.trim() || workspacePathKey(candidate.workspacePath || "");
    return candidateKey && candidateKey === workspaceKey;
  })?.ownerAlias?.trim() || "";
}

export function useAgentSessionVisualIdentity(session: AgentSession): AgentSessionIdentity {
  const { i18n } = useTranslation();
  const candidates = useWorkspaceColorCandidates();
  const workspaceIdentity = useMemo(() => resolveWorkspaceIdentity({
    workspacePath: session.cwd,
    workspaceKey: session.workspaceKey,
    candidates,
  }), [candidates, session.cwd, session.workspaceKey]);

  return useMemo(() => getAgentSessionIdentity(
    session,
    agentIdentityLanguage(i18n.language),
    { color: workspaceIdentity.color, ownerAlias: session.ownerAlias || matchingOwnerAlias(workspaceIdentity.workspaceKey, candidates) },
  ), [candidates, i18n.language, session, workspaceIdentity.color, workspaceIdentity.workspaceKey]);
}
