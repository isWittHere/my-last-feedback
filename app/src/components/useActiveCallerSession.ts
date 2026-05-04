import { applySessionTextDraft, useFeedbackStore } from "../store/feedbackStore";
import { useCallerOverride } from "./CallerContext";
import type { Session, Caller } from "../store/feedbackStore";

/**
 * Returns the effective callerId, sessionId, caller, and session.
 * Uses CallerContext override if present, otherwise falls back to the global store active state.
 */
export function useActiveCallerSession() {
  const override = useCallerOverride();
  const storeCallerId = useFeedbackStore((s) => s.activeCallerId);
  const storeSessionId = useFeedbackStore((s) => s.activeSessionId);

  const callerId = override ? override.callerId : storeCallerId;
  const sessionId = override ? override.sessionId : storeSessionId;

  const caller: Caller | null = useFeedbackStore((s) => callerId ? s.callers.find((c) => c.id === callerId) || null : null);
  const baseSession: Session | null = useFeedbackStore((s) => sessionId ? s.sessions.find((item) => item.id === sessionId) || null : null);
  const sessionDraft = useFeedbackStore((s) => sessionId ? s.sessionDraftsById[sessionId] || null : null);

  const session: Session | null = baseSession ? applySessionTextDraft(baseSession, sessionDraft) : null;

  return { callerId, sessionId, caller, session };
}
