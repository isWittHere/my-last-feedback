import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../store/feedbackStore";
import { Icon } from "./Icons";
import { useIsLightTheme } from "./useIsLightTheme";

interface TerminalSessionInfo {
  terminalId: string;
  cwd: string;
  shell: string;
}

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

type TerminalStatus = "idle" | "starting" | "running" | "exited" | "failed";
type AppTheme = "dark" | "light";

const XTERM_THEMES: Record<AppTheme, ITheme> = {
  dark: {
    background: "#111318",
    foreground: "#d8dee9",
    cursor: "#f5c2e7",
    cursorAccent: "#111318",
    selectionBackground: "#45475a",
    selectionForeground: "#ffffff",
    selectionInactiveBackground: "#313442",
    black: "#111318",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#cba6f7",
    cyan: "#94e2d5",
    white: "#d8dee9",
    brightBlack: "#6c7086",
    brightRed: "#eba0ac",
    brightGreen: "#a6e3a1",
    brightYellow: "#f9e2af",
    brightBlue: "#89b4fa",
    brightMagenta: "#f5c2e7",
    brightCyan: "#94e2d5",
    brightWhite: "#f5f5f5",
  },
  light: {
    background: "#f8fafc",
    foreground: "#1f2937",
    cursor: "#0e9d83",
    cursorAccent: "#ffffff",
    selectionBackground: "#bfdbfe",
    selectionForeground: "#111827",
    selectionInactiveBackground: "#e2e8f0",
    black: "#0f172a",
    red: "#b91c1c",
    green: "#047857",
    yellow: "#a16207",
    blue: "#1d4ed8",
    magenta: "#7e22ce",
    cyan: "#0f766e",
    white: "#e5e7eb",
    brightBlack: "#64748b",
    brightRed: "#dc2626",
    brightGreen: "#059669",
    brightYellow: "#ca8a04",
    brightBlue: "#2563eb",
    brightMagenta: "#9333ea",
    brightCyan: "#0891b2",
    brightWhite: "#ffffff",
  },
};

function basename(value: string): string {
  return value.replace(/\\/g, "/").split("/").filter(Boolean).pop() || value;
}

function getTerminalTheme(theme: AppTheme): ITheme {
  return { ...XTERM_THEMES[theme] };
}

export function TerminalPanel() {
  const { t } = useTranslation();
  const isLightTheme = useIsLightTheme();
  const terminalTheme: AppTheme = isLightTheme ? "light" : "dark";
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const cwdRef = useRef<string>("");
  const [sessionInfo, setSessionInfo] = useState<TerminalSessionInfo | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const focusedProjectDirectory = useFeedbackStore((state) => state.focusedComposer?.projectDirectory || "");
  const activeWorkspacePath = useFeedbackStore((state) => state.mlcActiveWorkspacePath || "");
  const activeSessionProjectDirectory = useFeedbackStore((state) => state.sessions.find((session) => session.id === state.activeSessionId)?.projectDirectory || "");
  const preferredCwd = focusedProjectDirectory || activeWorkspacePath || activeSessionProjectDirectory;

  useEffect(() => {
    cwdRef.current = preferredCwd;
  }, [preferredCwd]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) terminal.options.theme = getTerminalTheme(terminalTheme);
  }, [terminalTheme]);

  const fitAndResize = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;
    try {
      fitAddon.fit();
      const terminalId = terminalIdRef.current;
      if (terminalId && terminal.cols > 0 && terminal.rows > 0) {
        void invoke("terminal_resize", { terminalId, cols: terminal.cols, rows: terminal.rows }).catch(() => undefined);
      }
    } catch {}
  }, []);

  const startTerminal = useCallback(async () => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    setStatus("starting");
    setError(null);
    try {
      fitAndResize();
      const info = await invoke<TerminalSessionInfo>("terminal_create", {
        cwd: cwdRef.current || null,
        cols: terminal.cols,
        rows: terminal.rows,
      });
      terminalIdRef.current = info.terminalId;
      setSessionInfo(info);
      setStatus("running");
      window.setTimeout(() => terminal.focus(), 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus("failed");
      setError(message);
      terminal.writeln(`\r\n${message}`);
    }
  }, [fitAndResize]);

  const killTerminal = useCallback(async (silent = false) => {
    const terminalId = terminalIdRef.current;
    terminalIdRef.current = null;
    if (!silent) {
      setSessionInfo(null);
      setStatus("exited");
    }
    if (terminalId) {
      await invoke("terminal_kill", { terminalId }).catch(() => undefined);
    }
  }, []);

  const restartTerminal = useCallback(async () => {
    await killTerminal(true);
    terminalRef.current?.clear();
    await startTerminal();
  }, [killTerminal, startTerminal]);

  const copySelection = useCallback(() => {
    const selectedText = terminalRef.current?.getSelection() || "";
    if (selectedText) void navigator.clipboard?.writeText(selectedText);
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlistenOutput: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;
    let unlistenError: UnlistenFn | null = null;

    void listen<TerminalOutputEvent>("terminal-output", (event) => {
      if (event.payload.terminalId !== terminalIdRef.current) return;
      terminalRef.current?.write(event.payload.data);
    }).then((unlisten) => { if (disposed) unlisten(); else unlistenOutput = unlisten; });

    void listen<TerminalExitEvent>("terminal-exit", (event) => {
      if (event.payload.terminalId !== terminalIdRef.current) return;
      terminalIdRef.current = null;
      setStatus("exited");
      terminalRef.current?.writeln("\r\n[process exited]");
    }).then((unlisten) => { if (disposed) unlisten(); else unlistenExit = unlisten; });

    void listen<TerminalErrorEvent>("terminal-error", (event) => {
      if (event.payload.terminalId !== terminalIdRef.current) return;
      setStatus("failed");
      setError(event.payload.message);
      terminalRef.current?.writeln(`\r\n${event.payload.message}`);
    }).then((unlisten) => { if (disposed) unlisten(); else unlistenError = unlisten; });

    return () => {
      disposed = true;
      unlistenOutput?.();
      unlistenExit?.();
      unlistenError?.();
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const terminal = new Terminal({
      allowTransparency: false,
      cursorBlink: true,
      convertEol: false,
      customGlyphs: true,
      fontFamily: "Consolas, 'Cascadia Mono', 'Courier New', monospace",
      fontSize: 12,
      fontWeight: 400,
      fontWeightBold: 700,
      letterSpacing: 0,
      lineHeight: 1,
      minimumContrastRatio: 4.5,
      scrollback: 5000,
      theme: getTerminalTheme(terminalTheme),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const dataDisposable = terminal.onData((data) => {
      const terminalId = terminalIdRef.current;
      if (terminalId) void invoke("terminal_write", { terminalId, data }).catch(() => undefined);
    });

    const resizeObserver = new ResizeObserver(() => fitAndResize());
    resizeObserver.observe(host);
    void startTerminal();

    return () => {
      void killTerminal(true);
      resizeObserver.disconnect();
      dataDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [fitAndResize, killTerminal, startTerminal]);

  return (
    <div className="terminal-panel" data-terminal-theme={terminalTheme}>
      <div className="terminal-toolbar" data-preview-overlay>
        <div className="terminal-status-pill" data-status={status} title={sessionInfo?.cwd || preferredCwd || undefined}>
          <Icon name="terminal" size={12} />
          <span>{sessionInfo?.shell ? basename(sessionInfo.shell) : t("terminal.title", "Terminal")}</span>
        </div>
        <div className="terminal-cwd" title={sessionInfo?.cwd || preferredCwd || ""}>
          {basename(sessionInfo?.cwd || preferredCwd || t("terminal.noCwd", "No workspace"))}
        </div>
        {error ? <div className="terminal-error-text" title={error}>{error}</div> : null}
        <button type="button" className="terminal-tool-button" onClick={restartTerminal} title={t("terminal.restart", "Restart")}>
          <Icon name="refresh" size={13} />
        </button>
        <button type="button" className="terminal-tool-button" onClick={() => terminalRef.current?.clear()} title={t("terminal.clear", "Clear")}>
          <Icon name="trash" size={13} />
        </button>
        <button type="button" className="terminal-tool-button" onClick={copySelection} title={t("terminal.copySelection", "Copy selection")}>
          <Icon name="copy" size={13} />
        </button>
        <button type="button" className="terminal-tool-button danger" onClick={() => void killTerminal()} title={t("terminal.kill", "Kill") } disabled={!terminalIdRef.current}>
          <Icon name="close" size={13} />
        </button>
      </div>
      <div ref={hostRef} className="terminal-host" />
    </div>
  );
}