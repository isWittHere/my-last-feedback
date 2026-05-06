import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useAgentStore } from "../../store/agentStore";

interface AgentProcessOutputEvent {
  processId: string;
  data: string;
}

interface AgentProcessExitEvent {
  processId: string;
  exitCode: number | null;
}

interface AgentProcessErrorEvent {
  processId: string;
  message: string;
}

export function AgentProcessEventBridge() {
  useEffect(() => {
    let disposed = false;
    let unlistenOutput: UnlistenFn | null = null;
    let unlistenStderr: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;
    let unlistenError: UnlistenFn | null = null;

    void Promise.all([
      listen<AgentProcessOutputEvent>("agent-process-output", (event) => {
        useAgentStore.getState().receiveAgentProcessOutput(event.payload.processId, event.payload.data);
      }),
      listen<AgentProcessOutputEvent>("agent-process-stderr", (event) => {
        useAgentStore.getState().receiveAgentProcessStderr(event.payload.processId, event.payload.data);
      }),
      listen<AgentProcessExitEvent>("agent-process-exit", (event) => {
        useAgentStore.getState().receiveAgentProcessExit(event.payload.processId, event.payload.exitCode);
      }),
      listen<AgentProcessErrorEvent>("agent-process-error", (event) => {
        useAgentStore.getState().receiveAgentProcessError(event.payload.processId, event.payload.message);
      }),
    ]).then(([output, stderr, exit, error]) => {
      if (disposed) {
        output();
        stderr();
        exit();
        error();
        return;
      }
      unlistenOutput = output;
      unlistenStderr = stderr;
      unlistenExit = exit;
      unlistenError = error;
    });

    return () => {
      disposed = true;
      unlistenOutput?.();
      unlistenStderr?.();
      unlistenExit?.();
      unlistenError?.();
    };
  }, []);

  return null;
}