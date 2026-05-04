import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useTerminalStore } from "../store/terminalStore";

interface TerminalOutputEvent {
  terminalId: string;
  data: string;
}

interface TerminalExitEvent {
  terminalId: string;
  exitCode: number | null;
}

interface TerminalErrorEvent {
  terminalId: string;
  message: string;
}

export function TerminalEventBridge() {
  useEffect(() => {
    let disposed = false;
    let unlistenOutput: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;
    let unlistenError: UnlistenFn | null = null;

    void Promise.all([
      listen<TerminalOutputEvent>("terminal-output", (event) => {
        useTerminalStore.getState().appendTerminalOutput(event.payload.terminalId, event.payload.data);
      }),
      listen<TerminalExitEvent>("terminal-exit", (event) => {
        useTerminalStore.getState().markTerminalExited(event.payload.terminalId, event.payload.exitCode);
      }),
      listen<TerminalErrorEvent>("terminal-error", (event) => {
        useTerminalStore.getState().markTerminalFailed(event.payload.terminalId, event.payload.message);
      }),
    ]).then(([output, exit, error]) => {
      if (disposed) {
        output();
        exit();
        error();
        return;
      }
      unlistenOutput = output;
      unlistenExit = exit;
      unlistenError = error;
      void useTerminalStore.getState().restoreBackendTerminals();
    });

    return () => {
      disposed = true;
      unlistenOutput?.();
      unlistenExit?.();
      unlistenError?.();
    };
  }, []);

  return null;
}
