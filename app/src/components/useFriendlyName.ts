import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { agentIdentityLanguage, agentNickname } from "../identity/agentIdentity";

/** Convenience hook for legacy callers that only need the generated agent nickname. */
export function useFriendlyName() {
  const { i18n } = useTranslation();
  const lang = agentIdentityLanguage(i18n.language);
  return useCallback((alias: string) => agentNickname(alias, lang), [lang]);
}
