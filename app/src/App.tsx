import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useFeedbackStore } from "./store/feedbackStore";
import { useMLRAStore } from "./store/mlraStore";
import { FeedbackApp } from "./components/FeedbackApp";
import { AppTooltipProvider } from "./components/AppTooltip";
import { TerminalEventBridge } from "./components/TerminalEventBridge";
import { AgentProcessEventBridge } from "./components/agent/AgentProcessEventBridge";
import type { ImageAttachment, Session } from "./store/feedbackStore";
import { getNotificationSettings, hasStoredNotificationSettings, saveNotificationSettings, syncAutoFocusNewRequest } from "./notificationSettings";
import type { FeedbackDraft } from "./store/feedbackStore";

function basename(value: string): string {
  return value.replace(/\\/g, "/").split("/").filter(Boolean).pop() || value;
}

function mapHistoryImage(value: unknown, index: number): ImageAttachment | null {
  if (!value || typeof value !== "object") return null;
  const image = value as Record<string, unknown>;
  const file = typeof image.file === "string" ? image.file : "";
  const originalPath = typeof image.path === "string" ? image.path : "";
  const originalName = typeof image.name === "string" ? image.name : "";
  const path = originalPath || file;
  const type = typeof image.type === "string" ? image.type : "image/png";
  const data = typeof image.data === "string" ? image.data : "";
  const placeholder = image.placeholder === true;
  const name = originalName || (originalPath ? basename(originalPath) : placeholder ? `Image ${index + 1}` : basename(file || `image-${index + 1}`));
  return {
    path: path || name,
    name,
    sizeKB: typeof image.sizeKB === "number" ? image.sizeKB : 0,
    dataUrl: data ? `data:${type};base64,${data}` : undefined,
  };
}

/** Fire taskbar flash + system notification for a new session */
function notifyNewSession(requestName: string, callerName: string) {
  const settings = getNotificationSettings();
  // Taskbar flash (only when window not focused)
  if (settings.taskbarFlash !== false && !document.hasFocus()) {
    getCurrentWindow().requestUserAttention(2).catch(() => {});
  }
  // System notification
  if (settings.systemNotification !== false && !document.hasFocus()) {
    if (Notification.permission === "granted") {
      new Notification(requestName || "New feedback request", {
        body: callerName,
        icon: "/icon.png",
      });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") {
          new Notification(requestName || "New feedback request", {
            body: callerName,
            icon: "/icon.png",
          });
        }
      });
    }
  }
}

interface NewSessionEvent {
  session_id: string;
  caller_id: string;
  caller_name: string;
  caller_color: string;
  caller_client_name: string;
  caller_alias: string;
  request_name: string;
  summary: string;
  project_directory: string;
  questions: Array<{ label: string; options?: string[] }>;
}

function App() {
  useEffect(() => {
    if (hasStoredNotificationSettings()) {
      syncAutoFocusNewRequest(getNotificationSettings().autoFocusNewRequest);
    } else {
      invoke<boolean>("get_auto_focus_new_request")
        .then((enabled) => saveNotificationSettings({ ...getNotificationSettings(), autoFocusNewRequest: enabled }))
        .catch(() => syncAutoFocusNewRequest(getNotificationSettings().autoFocusNewRequest));
    }
    invoke<Record<string, FeedbackDraft>>("load_queued_drafts")
      .then((drafts) => useFeedbackStore.getState().setQueuedDrafts(drafts || {}))
      .catch(() => {});

    invoke<{
      callers: Array<{ id: string; name: string; version: string; color: string; client_name?: string; alias?: string }>;
      sessions: Array<{
        id: string;
        caller_id: string;
        request_name: string;
        summary: string;
        project_directory: string;
        status: string;
        created_at: string;
        feedback_text: string | null;
        command_logs: string | null;
        images: unknown[];
        mlc_attachments?: Array<{ file_path: string; title: string; description: string }>;
        web_attachments?: Session["webAttachments"];
        questions?: Array<{ label: string; options?: string[] }>;
      }>;
    }>("load_history")
      .then((history) => {
        const s = useFeedbackStore.getState();
        for (const c of history.callers) {
          s.addCaller({ ...c, pendingCount: 0, clientName: c.client_name || "", alias: c.alias || "" });
        }
        for (const sess of history.sessions) {
          s.addSession({
            id: sess.id,
            callerId: sess.caller_id,
            requestName: sess.request_name,
            summary: sess.summary,
            projectDirectory: sess.project_directory,
            status: (sess.status === "pending" ? "pending" : sess.status === "cancelled" ? "cancelled" : "responded") as Session["status"],
            createdAt: sess.created_at,
            feedbackText: sess.feedback_text || "",
            testLogText: "",
            images: (sess.images || []).map(mapHistoryImage).filter(Boolean) as ImageAttachment[],
            commandLogs: sess.command_logs || "",
            mlcAttachments: (sess.mlc_attachments || []).map((item) => ({
              filePath: item.file_path,
              title: item.title,
              description: item.description,
            })),
            webAttachments: sess.web_attachments || [],
            questions: (sess.questions || []).map((q: any) => ({
              label: q.label,
              options: q.options,
              selectedOptions: q.selectedOptions || [],
              answer: q.answer || "",
            })),
            gitAction: null,
          }, { attentionMode: "passive", applyQueuedDraft: false });
        }
        for (const c of history.callers) {
          s.updateCallerPendingCount(c.id);
        }
        if (history.callers.length > 0) {
          s.setActiveCaller(history.callers[0].id);
        }
      })
      .catch((e) => console.error("Failed to load history:", e));

    // Load prompt templates
    const reloadPrompts = () => {
      invoke<Array<{ name: string; description: string; content: string; icon: string }>>("load_prompts")
        .then((prompts) => useFeedbackStore.getState().setPrompts(prompts || []))
        .catch((e) => console.error("Failed to load prompts:", e));
    };
    reloadPrompts();

    // Hot reload prompts when window regains focus
    window.addEventListener("focus", reloadPrompts);

    // Listen for new feedback requests from IPC (persistent mode)
    const unlisten = listen<NewSessionEvent>("new-feedback-request", (event) => {
      const data = event.payload;
      const s = useFeedbackStore.getState();

      s.addCaller({
        id: data.caller_id,
        name: data.caller_name,
        version: "",
        color: data.caller_color,
        pendingCount: 0,
        clientName: data.caller_client_name || "",
        alias: data.caller_alias || "",
      });

      const session: Session = {
        id: data.session_id,
        callerId: data.caller_id,
        requestName: data.request_name,
        summary: data.summary,
        projectDirectory: data.project_directory,
        status: "pending",
        createdAt: new Date().toISOString(),
        feedbackText: "",
        testLogText: "",
        images: [],
        commandLogs: "",
        mlcAttachments: [],
        webAttachments: [],
        questions: (data.questions || []).map((q) => ({
          label: q.label,
          options: q.options,
          selectedOptions: [],
          answer: "",
        })),
        gitAction: null,
      };
      const attentionMode = getNotificationSettings().autoFocusNewRequest ? "interrupt" : "passive";
      s.addSession(session, { attentionMode });
      if (attentionMode === "interrupt") {
        s.setActiveCaller(data.caller_id);
        s.setActiveSession(data.session_id);
      }

      // Notify user of new session
      notifyNewSession(data.request_name, data.caller_name);
    });

    // Listen for session cancellations (client disconnected)
    const unlistenCancel = listen<{ session_id: string }>("session-cancelled", (event) => {
      const s = useFeedbackStore.getState();
      s.markSessionCancelled(event.payload.session_id);
    });

    // Listen for MLRA daemon messages
    const unlistenMlra = listen<string>("mlra-message", (event) => {
      useMLRAStore.getState().handleDaemonMessage(event.payload);
    });

    const unlistenMlraDisconnect = listen("mlra-disconnected", () => {
      console.log("[MLRA] Daemon disconnected");
    });

    return () => {
      unlisten.then((fn) => fn());
      unlistenCancel.then((fn) => fn());
      unlistenMlra.then((fn) => fn());
      unlistenMlraDisconnect.then((fn) => fn());
      window.removeEventListener("focus", reloadPrompts);
    };
  }, []);

  return (
    <AppTooltipProvider>
      <TerminalEventBridge />
      <AgentProcessEventBridge />
      <FeedbackApp />
    </AppTooltipProvider>
  );
}

export default App;
