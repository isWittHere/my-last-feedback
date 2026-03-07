import { createContext, useContext } from "react";

/** When provided, components should use this caller/session instead of the store's active ones */
export interface CallerOverride {
  callerId: string;
  sessionId: string | null;
  setSessionId: (id: string) => void;
}

export const CallerContext = createContext<CallerOverride | null>(null);

/** Returns the caller override from context, or null if using global store active state */
export function useCallerOverride() {
  return useContext(CallerContext);
}
