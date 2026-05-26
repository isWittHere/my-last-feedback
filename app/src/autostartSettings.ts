import { invoke } from "@tauri-apps/api/core";
import type { TFunction } from "i18next";

const AUTOSTART_DEV_DISABLED = "AUTOSTART_DEV_DISABLED";

export function getAutostart() {
  return invoke<boolean>("get_autostart");
}

export function setAutostartEnabled(enabled: boolean) {
  return invoke<void>("set_autostart", { enabled });
}

export function formatAutostartError(t: TFunction, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message === AUTOSTART_DEV_DISABLED) {
    return t(
      "settings.autostartDevDisabled",
      "Launch at startup is disabled in development builds. Use a packaged release build to enable it."
    );
  }
  return t("settings.autostartUpdateFailed", "Could not update launch at startup: {{message}}", {
    message: message || t("settings.autostartUnknownError", "unknown error"),
  });
}