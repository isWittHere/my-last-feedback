import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getFriendlyName } from "./friendlyName";

/** Convenience hook — wraps getFriendlyName with the current i18n locale. */
export function useFriendlyName() {
  const { i18n } = useTranslation();
  const lang = i18n.language === "zh" ? "zh" : "en";
  return useCallback((alias: string) => getFriendlyName(alias, lang), [lang]);
}
