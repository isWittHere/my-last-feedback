import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useFeedbackStore } from "./store/feedbackStore";
import { FeedbackApp } from "./components/FeedbackApp";
import type { Session } from "./store/feedbackStore";

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
    const store = useFeedbackStore.getState();

    // Determine app mode from Rust backend
    invoke<string>("get_app_mode")
      .then((mode) => {
        store.setAppMode(mode as "legacy" | "persistent");

        if (mode === "legacy") {
          invoke<{
            summary: string;
            request_name: string;
            project_directory: string;
            output_file: string;
            command_logs: string;
          }>("get_app_args")
            .then((args) => {
              const s = useFeedbackStore.getState();
              s.setSummary(args.summary || "");
              s.setRequestName(args.request_name || "");
              s.setProjectDirectory(args.project_directory || "");
              s.setOutputFile(args.output_file || "");
              s.setCommandLogs(args.command_logs || "");
            })
            .catch((e) => console.error("Failed to get app args:", e));
        } else {
          // Persistent mode: load persisted history (callers + sessions)
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
                  images: [],
                  commandLogs: sess.command_logs || "",
                  questions: (sess.questions || []).map((q: any) => ({
                    label: q.label,
                    options: q.options,
                    selectedOptions: q.selectedOptions || [],
                    answer: q.answer || "",
                  })),
                });
              }
              // Update pending counts for each caller
              for (const c of history.callers) {
                s.updateCallerPendingCount(c.id);
              }
              // Auto-select first caller and its latest session
              if (history.callers.length > 0) {
                const firstCallerId = history.callers[0].id;
                s.setActiveCaller(firstCallerId);
              }
            })
            .catch((e) => console.error("Failed to load history:", e));
        }
      })
      .catch((e) => {
        console.error("Failed to get app mode:", e);
        useFeedbackStore.getState().setAppMode("legacy");
      });

    // Load prompt templates (both modes)
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
        questions: (data.questions || []).map((q) => ({
          label: q.label,
          options: q.options,
          selectedOptions: [],
          answer: "",
        })),
      };
      s.addSession(session);
      s.setActiveCaller(data.caller_id);
      s.setActiveSession(data.session_id);
    });

    // Listen for session cancellations (client disconnected)
    const unlistenCancel = listen<{ session_id: string }>("session-cancelled", (event) => {
      const s = useFeedbackStore.getState();
      s.markSessionCancelled(event.payload.session_id);
    });

    return () => {
      unlisten.then((fn) => fn());
      unlistenCancel.then((fn) => fn());
      window.removeEventListener("focus", reloadPrompts);
    };
  }, []);

  return <FeedbackApp />;
}

export default App;
