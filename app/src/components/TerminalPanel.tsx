import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../store/feedbackStore";
import { useTerminalStore, type TerminalPathCandidate, type TerminalPathSource } from "../store/terminalStore";
import { getTerminalSettings, terminalShellToCommand, TERMINAL_SETTINGS_EVENT, type TerminalSettings } from "../terminalSettings";
import { Icon } from "./Icons";
import { useIsLightTheme } from "./useIsLightTheme";

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

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function getTerminalTheme(theme: AppTheme): ITheme {
  return { ...XTERM_THEMES[theme] };
}

function sourceLabel(source: TerminalPathSource, translate: (key: string, defaultValue: string) => string, callerName?: string): string {
  if (source === "recent") return translate("terminal.pathSourceRecent", "Recent terminal");
  if (source === "activeSession") return translate("terminal.pathSourceActiveSession", "Active session");
  if (source === "workspace") return translate("terminal.pathSourceWorkspace", "Workspace");
  if (source === "caller") return callerName ? `${translate("terminal.pathSourceCaller", "Caller")}: ${callerName}` : translate("terminal.pathSourceCaller", "Caller");
  return translate("terminal.pathSourceFallback", "Fallback");
}

function pushCandidate(candidates: TerminalPathCandidate[], seen: Set<string>, candidate: TerminalPathCandidate) {
  const cleanPath = candidate.path.trim();
  if (!cleanPath) return;
  const key = normalizePath(cleanPath);
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push({ ...candidate, path: cleanPath, label: candidate.label || basename(cleanPath) });
}

export function TerminalPanel() {
  const { t } = useTranslation();
  const isLightTheme = useIsLightTheme();
  const terminalTheme: AppTheme = isLightTheme ? "light" : "dark";
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activeTerminalIdRef = useRef<string | null>(null);
  const renderedOutputRef = useRef<{ tabId: string | null; baseLength: number; endLength: number; generation: number }>({ tabId: null, baseLength: 0, endLength: 0, generation: 0 });
  const suppressedTerminalDataWritesRef = useRef(0);
  const pathMenuRef = useRef<HTMLDivElement>(null);
  const [pathMenuOpen, setPathMenuOpen] = useState(false);
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettings>(getTerminalSettings);

  const tabs = useTerminalStore((state) => state.tabs);
  const activeTabId = useTerminalStore((state) => state.activeTabId);
  const recentPaths = useTerminalStore((state) => state.recentPaths);
  const lastUsedCwd = useTerminalStore((state) => state.lastUsedCwd);
  const createTerminalTab = useTerminalStore((state) => state.createTerminalTab);
  const restartTerminalTab = useTerminalStore((state) => state.restartTerminalTab);
  const closeTerminalTab = useTerminalStore((state) => state.closeTerminalTab);
  const killTerminalTab = useTerminalStore((state) => state.killTerminalTab);
  const clearTerminalOutput = useTerminalStore((state) => state.clearTerminalOutput);
  const setActiveTerminalTab = useTerminalStore((state) => state.setActiveTerminalTab);

  const activeSessionProjectDirectory = useFeedbackStore((state) => state.sessions.find((session) => session.id === state.activeSessionId)?.projectDirectory || "");
  const activeSessionCallerId = useFeedbackStore((state) => state.sessions.find((session) => session.id === state.activeSessionId)?.callerId || "");
  const activeSessionCreatedAt = useFeedbackStore((state) => state.sessions.find((session) => session.id === state.activeSessionId)?.createdAt || "");
  const callerNamesKey = useFeedbackStore((state) => state.callers.map((caller) => `${caller.id}\t${caller.name}`).join("\n"));
  const recentSessionPathsKey = useFeedbackStore((state) => state.sessions.map((session) => `${session.id}\t${session.projectDirectory}\t${session.callerId}\t${session.createdAt}`).join("\n"));
  const focusedComposer = useFeedbackStore((state) => state.focusedComposer);
  const activeWorkspacePath = useFeedbackStore((state) => state.mlcActiveWorkspacePath || "");

  const activeTab = tabs.find((tab) => tab.id === activeTabId) || null;
  const callerNames = useMemo(() => new Map(callerNamesKey.split("\n").filter(Boolean).map((line) => {
    const [id, name] = line.split("\t");
    return [id, name || id] as const;
  })), [callerNamesKey]);
  const recentSessionCandidates = useMemo(() => recentSessionPathsKey
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, projectDirectory, callerId, createdAt] = line.split("\t");
      return { id, projectDirectory, callerId, createdAt };
    }), [recentSessionPathsKey]);

  const pathCandidates = useMemo(() => {
    const candidates: TerminalPathCandidate[] = [];
    const seen = new Set<string>();
    for (const path of recentPaths) pushCandidate(candidates, seen, path);
    if (activeTab?.cwd) pushCandidate(candidates, seen, { path: activeTab.cwd, label: basename(activeTab.cwd), source: "recent" });
    if (lastUsedCwd) pushCandidate(candidates, seen, { path: lastUsedCwd, label: basename(lastUsedCwd), source: "recent" });
    if (activeSessionProjectDirectory) {
      pushCandidate(candidates, seen, {
        path: activeSessionProjectDirectory,
        label: basename(activeSessionProjectDirectory),
        source: "activeSession",
        callerName: callerNames.get(activeSessionCallerId),
        lastUsedAt: activeSessionCreatedAt,
      });
    }
    if (focusedComposer?.projectDirectory) {
      pushCandidate(candidates, seen, {
        path: focusedComposer.projectDirectory,
        label: basename(focusedComposer.projectDirectory),
        source: "caller",
        callerName: callerNames.get(focusedComposer.callerId),
        lastUsedAt: focusedComposer.focusedAt,
      });
    }
    if (activeWorkspacePath) pushCandidate(candidates, seen, { path: activeWorkspacePath, label: basename(activeWorkspacePath), source: "workspace" });
    for (const session of [...recentSessionCandidates].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 10)) {
      pushCandidate(candidates, seen, {
        path: session.projectDirectory,
        label: basename(session.projectDirectory),
        source: "caller",
        callerName: callerNames.get(session.callerId),
        lastUsedAt: session.createdAt,
      });
    }
    return candidates;
  }, [activeSessionCallerId, activeSessionCreatedAt, activeSessionProjectDirectory, activeTab?.cwd, activeWorkspacePath, callerNames, focusedComposer, lastUsedCwd, recentPaths, recentSessionCandidates]);

  const defaultCwd = lastUsedCwd || pathCandidates[0]?.path || null;

  useEffect(() => {
    activeTerminalIdRef.current = activeTab?.terminalId || null;
  }, [activeTab?.terminalId]);

  useEffect(() => {
    const handleSettingsChanged = (event: Event) => {
      const detail = (event as CustomEvent<TerminalSettings>).detail;
      setTerminalSettings(detail || getTerminalSettings());
    };
    window.addEventListener(TERMINAL_SETTINGS_EVENT, handleSettingsChanged);
    return () => window.removeEventListener(TERMINAL_SETTINGS_EVENT, handleSettingsChanged);
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) terminal.options.theme = getTerminalTheme(terminalTheme);
  }, [terminalTheme]);

  useEffect(() => {
    if (!pathMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (pathMenuRef.current?.contains(event.target as Node)) return;
      setPathMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPathMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pathMenuOpen]);

  const terminalSizeOptions = useCallback(() => {
    const terminal = terminalRef.current;
    return terminal && terminal.cols > 0 && terminal.rows > 0 ? { cols: terminal.cols, rows: terminal.rows } : undefined;
  }, []);

  const fitAndResize = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;
    try {
      fitAddon.fit();
      const terminalId = activeTerminalIdRef.current;
      if (terminalId && terminal.cols > 0 && terminal.rows > 0) {
        void invoke("terminal_resize", { terminalId, cols: terminal.cols, rows: terminal.rows }).catch(() => undefined);
      }
    } catch {}
  }, []);

  const finishSuppressedTerminalDataWrite = useCallback(() => {
    window.setTimeout(() => {
      suppressedTerminalDataWritesRef.current = Math.max(0, suppressedTerminalDataWritesRef.current - 1);
    }, 0);
  }, []);

  const writeTerminalOutput = useCallback((terminal: Terminal, output: string, suppressTerminalData = false) => {
    if (!output) return;
    if (!suppressTerminalData) {
      terminal.write(output);
      return;
    }
    suppressedTerminalDataWritesRef.current += 1;
    try {
      terminal.write(output, finishSuppressedTerminalDataWrite);
    } catch {
      finishSuppressedTerminalDataWrite();
    }
  }, [finishSuppressedTerminalDataWrite]);

  const resetAndReplayTerminalOutput = useCallback((terminal: Terminal, output: string) => {
    suppressedTerminalDataWritesRef.current += 1;
    try {
      terminal.reset();
      terminal.clear();
      if (output) terminal.write(output, finishSuppressedTerminalDataWrite);
      else finishSuppressedTerminalDataWrite();
    } catch {
      finishSuppressedTerminalDataWrite();
    }
  }, [finishSuppressedTerminalDataWrite]);

  const createFromPath = useCallback(async (cwd: string | null, source: TerminalPathSource = "recent") => {
    await createTerminalTab(cwd, { ...terminalSizeOptions(), source, shell: terminalShellToCommand(terminalSettings.defaultShell) });
    setPathMenuOpen(false);
    window.setTimeout(() => terminalRef.current?.focus(), 0);
  }, [createTerminalTab, terminalSettings.defaultShell, terminalSizeOptions]);

  const createDefaultTerminal = useCallback(() => {
    if (!defaultCwd && pathCandidates.length === 0) {
      setActiveTerminalTab(null);
      return;
    }
    void createFromPath(defaultCwd, "recent");
  }, [createFromPath, defaultCwd, pathCandidates.length, setActiveTerminalTab]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !activeTab) return;

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
    renderedOutputRef.current = { tabId: null, baseLength: 0, endLength: 0, generation: activeTab.outputGeneration };
    if (activeTab.output) {
      writeTerminalOutput(terminal, activeTab.output, true);
      renderedOutputRef.current = {
        tabId: activeTab.id,
        baseLength: activeTab.outputBaseLength,
        endLength: activeTab.outputBaseLength + activeTab.output.length,
        generation: activeTab.outputGeneration,
      };
    }

    const dataDisposable = terminal.onData((data) => {
      if (suppressedTerminalDataWritesRef.current > 0) return;
      const terminalId = activeTerminalIdRef.current;
      if (terminalId) void invoke("terminal_write", { terminalId, data }).catch(() => undefined);
    });

    const resizeObserver = new ResizeObserver(() => fitAndResize());
    resizeObserver.observe(host);
    fitAndResize();

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      renderedOutputRef.current = { tabId: null, baseLength: 0, endLength: 0, generation: 0 };
      suppressedTerminalDataWritesRef.current = 0;
    };
  }, [Boolean(activeTab), fitAndResize, terminalTheme, writeTerminalOutput]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !activeTab) return;
    const rendered = renderedOutputRef.current;
    const output = activeTab.output || "";
    const baseLength = activeTab.outputBaseLength || 0;
    const endLength = baseLength + output.length;
    if (rendered.tabId !== activeTab.id || rendered.generation !== activeTab.outputGeneration || rendered.endLength < baseLength) {
      resetAndReplayTerminalOutput(terminal, output);
      renderedOutputRef.current = { tabId: activeTab.id, baseLength, endLength, generation: activeTab.outputGeneration };
      return;
    }
    if (endLength > rendered.endLength) {
      const start = Math.max(0, rendered.endLength - baseLength);
      writeTerminalOutput(terminal, output.slice(start));
      renderedOutputRef.current = { tabId: activeTab.id, baseLength, endLength, generation: activeTab.outputGeneration };
    }
  }, [activeTab?.id, activeTab?.output, activeTab?.outputBaseLength, activeTab?.outputGeneration, resetAndReplayTerminalOutput, writeTerminalOutput]);

  useEffect(() => {
    fitAndResize();
  }, [activeTab?.terminalId, fitAndResize]);

  const copySelection = useCallback(() => {
    const selectedText = terminalRef.current?.getSelection() || "";
    if (selectedText) void navigator.clipboard?.writeText(selectedText);
  }, []);

  const restartActiveTab = useCallback(() => {
    if (!activeTab) return;
    terminalRef.current?.clear();
    renderedOutputRef.current = { tabId: activeTab.id, baseLength: 0, endLength: 0, generation: activeTab.outputGeneration + 1 };
    void restartTerminalTab(activeTab.id, { ...terminalSizeOptions(), shell: terminalShellToCommand(terminalSettings.defaultShell) });
  }, [activeTab, restartTerminalTab, terminalSettings.defaultShell, terminalSizeOptions]);

  const clearActiveTab = useCallback(() => {
    if (!activeTab) return;
    terminalRef.current?.clear();
    renderedOutputRef.current = { tabId: activeTab.id, baseLength: 0, endLength: 0, generation: activeTab.outputGeneration + 1 };
    clearTerminalOutput(activeTab.id);
  }, [activeTab, clearTerminalOutput]);

  const scrollWorkspaceTabs = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    if (container.scrollWidth <= container.clientWidth) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;
    container.scrollLeft += delta;
    event.preventDefault();
  }, []);

  const closeTabFromMouseDown = useCallback((event: ReactMouseEvent<HTMLButtonElement>, tabId: string) => {
    if (event.button !== 1) return;
    if (!terminalSettings.middleClickClosesTab) return;
    event.preventDefault();
    event.stopPropagation();
    void closeTerminalTab(tabId);
  }, [closeTerminalTab, terminalSettings.middleClickClosesTab]);

  const renderPathButton = (candidate: TerminalPathCandidate, compact = false) => (
    <button key={`${candidate.source}-${candidate.path}`} type="button" className={compact ? "terminal-path-menu-item" : "terminal-home-path-item"} onClick={() => void createFromPath(candidate.path, candidate.source)} title={candidate.path}>
      <Icon name={candidate.source === "workspace" ? "folder-open" : candidate.source === "activeSession" ? "message" : "folder"} size={compact ? 12 : 14} />
      <span className="terminal-path-main">
        <span>{candidate.label || basename(candidate.path)}</span>
        <small>{candidate.path}</small>
      </span>
      <em>{sourceLabel(candidate.source, t, candidate.callerName)}</em>
    </button>
  );

  return (
    <div className="terminal-panel" data-terminal-theme={terminalTheme}>
      <div className="terminal-tab-strip" data-preview-overlay>
        <button type="button" className={`terminal-workspace-tab home${!activeTab ? " active" : ""}`} onClick={() => setActiveTerminalTab(null)} title={t("terminal.home", "Terminal home")}>
          <Icon name="folder-open" size={13} />
        </button>
        <div className="terminal-workspace-tabs" role="tablist" aria-label={t("terminal.tabs", "Terminal tabs")} onWheel={scrollWorkspaceTabs}>
          {tabs.map((tab) => (
            <button key={tab.id} type="button" className={`terminal-workspace-tab${tab.id === activeTabId ? " active" : ""}`} onClick={() => setActiveTerminalTab(tab.id)} onMouseDown={(event) => closeTabFromMouseDown(event, tab.id)} title={tab.cwd} role="tab" aria-selected={tab.id === activeTabId}>
              <span className="terminal-tab-status" data-status={tab.status} />
              <small>{tab.title}</small>
              <span className="terminal-tab-close" role="button" tabIndex={-1} onClick={(event) => { event.stopPropagation(); void closeTerminalTab(tab.id); }} title={t("terminal.closeTab", "Close tab")}>
                <Icon name="close" size={10} />
              </span>
            </button>
          ))}
        </div>
        <div ref={pathMenuRef} className="terminal-new-tab-split">
          <button type="button" className="terminal-tool-button" onClick={createDefaultTerminal} title={t("terminal.newTab", "New terminal")}>
            <Icon name="plus" size={13} />
          </button>
          <button type="button" className="terminal-tool-button" onClick={() => setPathMenuOpen((value) => !value)} title={t("terminal.choosePath", "Choose path")}>
            <Icon name="chevron-down" size={13} />
          </button>
          {pathMenuOpen ? (
            <div className="terminal-path-menu" data-preview-overlay>
              {pathCandidates.length > 0 ? pathCandidates.slice(0, 8).map((candidate) => renderPathButton(candidate, true)) : (
                <div className="terminal-path-empty">{t("terminal.noPathCandidates", "No recent paths")}</div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {activeTab ? (
        <>
          <div className="terminal-toolbar" data-preview-overlay>
            <div className="terminal-status-pill" data-status={activeTab.status} title={activeTab.cwd || undefined}>
              <Icon name="terminal" size={12} />
              <span>{activeTab.shell ? basename(activeTab.shell) : t("terminal.title", "Terminal")}</span>
            </div>
            <div className="terminal-cwd" title={activeTab.cwd || ""}>{basename(activeTab.cwd || t("terminal.noCwd", "No workspace"))}</div>
            {activeTab.error ? <div className="terminal-error-text" title={activeTab.error}>{activeTab.error}</div> : null}
            <button type="button" className="terminal-tool-button" onClick={restartActiveTab} title={t("terminal.restart", "Restart")}>
              <Icon name="refresh" size={13} />
            </button>
            <button type="button" className="terminal-tool-button" onClick={clearActiveTab} title={t("terminal.clear", "Clear")}>
              <Icon name="trash" size={13} />
            </button>
            <button type="button" className="terminal-tool-button" onClick={copySelection} title={t("terminal.copySelection", "Copy selection")}>
              <Icon name="copy" size={13} />
            </button>
            <button type="button" className="terminal-tool-button danger" onClick={() => void killTerminalTab(activeTab.id)} title={t("terminal.kill", "Kill")} disabled={!activeTab.terminalId}>
              <Icon name="close" size={13} />
            </button>
          </div>
          <div ref={hostRef} className="terminal-host" />
        </>
      ) : (
        <div className="terminal-home" data-preview-overlay>
          <div className="terminal-home-actions">
            <button type="button" className="terminal-home-primary" onClick={createDefaultTerminal} disabled={!defaultCwd && pathCandidates.length === 0}>
              <Icon name="plus" size={14} />
              <span>{t("terminal.newTab", "New terminal")}</span>
            </button>
            {defaultCwd ? <small title={defaultCwd}>{basename(defaultCwd)}</small> : null}
          </div>
          <div className="terminal-home-list">
            {pathCandidates.length > 0 ? pathCandidates.slice(0, 10).map((candidate) => renderPathButton(candidate)) : (
              <div className="terminal-home-empty">{t("terminal.noPathCandidates", "No recent paths")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
