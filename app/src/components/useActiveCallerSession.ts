import { useFeedbackStore } from "../store/feedbackStore";
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
  const callers = useFeedbackStore((s) => s.callers);
  const sessions = useFeedbackStore((s) => s.sessions);

  const callerId = override ? override.callerId : storeCallerId;
  const sessionId = override ? override.sessionId : storeSessionId;

  const caller: Caller | null = callerId
    ? callers.find((c) => c.id === callerId) || null
    : null;

  const session: Session | null = sessionId
    ? sessions.find((s) => s.id === sessionId) || null
    : null;

  return { callerId, sessionId, caller, session };
}
