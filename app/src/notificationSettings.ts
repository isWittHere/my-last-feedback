import { invoke } from "@tauri-apps/api/core";

export interface NotificationSettings {
  taskbarFlash: boolean;
  systemNotification: boolean;
  persistentUnread: boolean;
  autoFocusNewRequest: boolean;
}

export function getNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem("mlf-notification-settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        taskbarFlash: parsed.taskbarFlash !== false,
        systemNotification: parsed.systemNotification !== false,
        persistentUnread: parsed.persistentUnread !== false,
        autoFocusNewRequest: parsed.autoFocusNewRequest !== false,
      };
    }
  } catch {}
  return { taskbarFlash: true, systemNotification: true, persistentUnread: true, autoFocusNewRequest: true };
}

export function saveNotificationSettings(settings: NotificationSettings) {
  try { localStorage.setItem("mlf-notification-settings", JSON.stringify(settings)); } catch {}
}

export function syncAutoFocusNewRequest(enabled: boolean) {
  invoke("set_auto_focus_new_request", { enabled }).catch(() => {});
}

export function hasStoredNotificationSettings(): boolean {
  try { return localStorage.getItem("mlf-notification-settings") !== null; } catch { return false; }
}