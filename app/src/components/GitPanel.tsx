import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../store/feedbackStore";
import { Icon } from "./Icons";
import {
  getGitOperationSettings,
  getTimedGitReminderProgress,
  GIT_OPERATION_SETTINGS_EVENT,
} from "../gitOperationSettings";
import { useGitPanelSettings } from "../gitPanelSettings";
import { resolveWorkspaceIdentity } from "../identity/workspaceIdentity";
import { type AgentUiDiffFile } from "./agent/AgentDiffViewer";

interface GitLogEntry {
  hash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
}

interface GitBranchInfo {
  current: string;
  all: string[];
}

interface GitLogResult {
  branch: GitBranchInfo;
  commits: GitLogEntry[];
}

interface GitChangesBreakdown {
  modified: number;
  added: number;
  deleted: number;
}

function formatCommitDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

function commitGroupLabel(
  dateStr: string,
  translate: (key: string, defaultValue: string) => string,
): string {
  const time = new Date(dateStr).getTime();
  if (!Number.isFinite(time)) return translate("git.groupEarlier", "Earlier");
  const now = new Date();
  const current = new Date(time);
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfCurrent = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate(),
  ).getTime();
  const days = Math.floor((startOfToday - startOfCurrent) / 86400000);
  if (days <= 0) return translate("git.groupToday", "Today");
  if (days === 1) return translate("git.groupYesterday", "Yesterday");
  if (days < 7) return translate("git.groupPastWeek", "Past week");
  return translate("git.groupEarlier", "Earlier");
}

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

type GitDiffSegment = "add" | "delete" | "empty";

function buildGitDiffSegments(
  additions: number,
  deletions: number,
  slots: number,
): GitDiffSegment[] {
  const total = additions + deletions;
  if (total <= 0) return Array.from({ length: slots }, () => "empty");

  let addSlots: number;
  let deleteSlots: number;

  if (additions > 0 && deletions > 0) {
    addSlots = 1;
    deleteSlots = 1;
    const remaining = slots - 2;
    if (remaining > 0) {
      const extraAdd = Math.round((additions / total) * remaining);
      addSlots += extraAdd;
      deleteSlots += remaining - extraAdd;
    }
  } else if (additions > 0) {
    addSlots = slots;
    deleteSlots = 0;
  } else if (deletions > 0) {
    addSlots = 0;
    deleteSlots = slots;
  } else {
    return Array.from({ length: slots }, () => "empty");
  }

  return [
    ...Array.from({ length: addSlots }, () => "add" as const),
    ...Array.from({ length: deleteSlots }, () => "delete" as const),
  ];
}

const STATUS_LETTER: Record<string, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  create: "A",
  edit: "M",
  delete: "D",
};

function statusLetter(status: string | undefined): string {
  return STATUS_LETTER[status ?? ""] ?? "?";
}

function displayDiffPath(path: string, mode: "fullPath" | "fileName"): string {
  if (mode === "fullPath") return path;
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] || path;
}

export function GitPanel() {
  const { t } = useTranslation();
  const sessions = useFeedbackStore((s) => s.sessions);
  const activeSessionId = useFeedbackStore((s) => s.activeSessionId);
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const projectDirectory = activeSession?.projectDirectory || "";
  const focusedComposer = useFeedbackStore((s) => s.focusedComposer);
  const mlcActiveWorkspacePath = useFeedbackStore(
    (s) => s.mlcActiveWorkspacePath,
  );
  const callers = useFeedbackStore((s) => s.callers);
  const gitPanelSettings = useGitPanelSettings();

  const workspacePath =
    mlcActiveWorkspacePath ||
    projectDirectory ||
    focusedComposer?.projectDirectory ||
    "";

  const workspaceColorCandidates = useMemo(() => {
    const callerById = new Map(
      callers.map((caller) => [caller.id, caller] as const),
    );
    return sessions.map((session) => {
      const caller = callerById.get(session.callerId);
      return {
        workspaceKey: caller?.workspaceKey,
        workspacePath: session.projectDirectory,
        color: caller?.color,
      };
    });
  }, [callers, sessions]);

  const workspaceIdentity = useMemo(
    () =>
      resolveWorkspaceIdentity({
        workspacePath,
        candidates: workspaceColorCandidates,
      }),
    [workspacePath, workspaceColorCandidates],
  );

  const [logResult, setLogResult] = useState<GitLogResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    commit: GitLogEntry;
    left: number;
    top: number;
  } | null>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const [gitReminderTick, setGitReminderTick] = useState(0);
  const [changesBreakdown, setChangesBreakdown] =
    useState<GitChangesBreakdown | null>(null);
  const [diffFiles, setDiffFiles] = useState<AgentUiDiffFile[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const changesReqSeqRef = useRef(0);
  const diffReqSeqRef = useRef(0);
  const diffHideTimerRef = useRef<number | null>(null);
  const badgeRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [diffPopover, setDiffPopover] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const lastPopoverSizeRef = useRef<{ width: number; height: number }>({
    width: 420,
    height: 360,
  });

  const positionDiffPopover = useCallback(() => {
    const el = badgeRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const viewportPadding = 8;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const maxAllowedWidth = Math.min(560, viewportWidth - 24);
    const maxAllowedHeight = Math.min(640, Math.floor(viewportHeight * 0.7));
    const predictedWidth = Math.min(
      lastPopoverSizeRef.current.width || 420,
      maxAllowedWidth,
    );
    const predictedHeight = Math.min(
      lastPopoverSizeRef.current.height || 360,
      maxAllowedHeight,
    );

    const spaceLeft = rect.right - viewportPadding;
    const spaceRight = viewportWidth - rect.left - viewportPadding;
    const useRightAnchor = spaceLeft >= spaceRight;
    let left = useRightAnchor ? rect.right - predictedWidth : rect.left;

    const spaceBelow = viewportHeight - rect.bottom - gap - viewportPadding;
    const spaceAbove = rect.top - gap - viewportPadding;
    const useBelow = spaceBelow >= spaceAbove;
    let top = useBelow ? rect.bottom + gap : rect.top - predictedHeight - gap;

    left = Math.max(
      viewportPadding,
      Math.min(left, viewportWidth - predictedWidth - viewportPadding),
    );
    top = Math.max(
      viewportPadding,
      Math.min(top, viewportHeight - predictedHeight - viewportPadding),
    );
    setDiffPopover({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (!diffPopover || !popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    lastPopoverSizeRef.current = { width: rect.width, height: rect.height };
    const clampedLeft = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
    const clampedTop = Math.max(8, Math.min(rect.top, window.innerHeight - rect.height - 8));
    if (clampedLeft !== diffPopover.left || clampedTop !== diffPopover.top) {
      setDiffPopover({ left: clampedLeft, top: clampedTop });
    }
  }, [diffPopover]);

  useEffect(() => {
    if (!diffPopover) return;
    const handleViewportChange = () => positionDiffPopover();
    window.addEventListener("resize", handleViewportChange);
    return () => window.removeEventListener("resize", handleViewportChange);
  }, [diffPopover, positionDiffPopover]);

  const fetchChangesCount = useCallback(async () => {
    if (!workspacePath) return;
    const reqId = ++changesReqSeqRef.current;
    try {
      const breakdown = await invoke<GitChangesBreakdown>(
        "git_changes_breakdown",
        {
          projectDirectory: workspacePath,
        },
      );
      if (reqId !== changesReqSeqRef.current) return;
      setChangesBreakdown(breakdown);
    } catch {
      if (reqId !== changesReqSeqRef.current) return;
      setChangesBreakdown(null);
    }
  }, [workspacePath]);

  const fetchDiff = useCallback(async () => {
    if (!workspacePath) return;
    const reqId = ++diffReqSeqRef.current;
    setDiffLoading(true);
    try {
      const result = await invoke<AgentUiDiffFile[]>("git_diff", {
        projectDirectory: workspacePath,
      });
      if (reqId !== diffReqSeqRef.current) return;
      setDiffFiles(result);
    } catch {
      if (reqId !== diffReqSeqRef.current) return;
      setDiffFiles(null);
    } finally {
      if (reqId !== diffReqSeqRef.current) return;
      setDiffLoading(false);
    }
  }, [workspacePath]);

  const showDiffPopover = useCallback(() => {
    if (diffHideTimerRef.current !== null) {
      window.clearTimeout(diffHideTimerRef.current);
      diffHideTimerRef.current = null;
    }
    positionDiffPopover();
  }, [positionDiffPopover]);

  const hideDiffPopover = useCallback(() => {
    diffHideTimerRef.current = window.setTimeout(() => {
      setDiffPopover(null);
    }, 200);
  }, []);

  const gitOperationSettings = useMemo(
    () => getGitOperationSettings(),
    [gitReminderTick],
  );
  const gitReminderProgress = useMemo(() => {
    if (!workspacePath) return null;
    return getTimedGitReminderProgress(
      workspacePath,
      Date.now(),
      gitOperationSettings,
    );
  }, [workspacePath, gitOperationSettings, gitReminderTick]);

  useEffect(() => {
    const refresh = () => setGitReminderTick((v) => v + 1);
    const intervalId = window.setInterval(refresh, 30_000);
    window.addEventListener(
      GIT_OPERATION_SETTINGS_EVENT,
      refresh as EventListener,
    );
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(
        GIT_OPERATION_SETTINGS_EVENT,
        refresh as EventListener,
      );
    };
  }, []);

  const clearTooltip = useCallback(() => {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setTooltip(null);
  }, []);

  const tooltipProps = useCallback(
    (commit: GitLogEntry) => {
      const estimateTooltipWidth = () => {
        const tooltipEl = document.querySelector(
          ".git-commit-tooltip.mlc-custom-tooltip",
        );
        return tooltipEl?.getBoundingClientRect().width || 320;
      };
      const getPosition = (rect: DOMRect, element: HTMLElement) => {
        const estimatedWidth = estimateTooltipWidth();
        const measureHeight = () => {
          const el = document.querySelector(
            ".git-commit-tooltip.mlc-custom-tooltip",
          );
          return el?.getBoundingClientRect().height || 120;
        };
        const estimatedHeight = measureHeight();
        const gap = 4;
        const viewportPadding = 8;
        const panelSide =
          element.closest("[data-position]")?.getAttribute("data-position") ||
          "right";
        const isPanelLeft = panelSide === "left";
        const topAligned = rect.top - 2;
        const top = Math.max(
          viewportPadding,
          Math.min(
            topAligned,
            window.innerHeight - estimatedHeight - viewportPadding,
          ),
        );
        let left: number;
        if (isPanelLeft) {
          left = rect.right + gap;
          if (left + estimatedWidth > window.innerWidth - viewportPadding)
            left = rect.left - estimatedWidth - gap;
        } else {
          left = rect.left - estimatedWidth - gap;
          if (left < viewportPadding) left = rect.right + gap;
        }
        left = Math.max(
          viewportPadding,
          Math.min(left, window.innerWidth - estimatedWidth - viewportPadding),
        );
        return { left, top };
      };
      return {
        onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
          clearTooltip();
          const element = event.currentTarget;
          const rect = element.getBoundingClientRect();
          tooltipTimerRef.current = window.setTimeout(() => {
            const { left, top } = getPosition(rect, element);
            setTooltip({ commit, left, top });
          }, 400);
        },
        onMouseLeave: clearTooltip,
        onFocus: (event: React.FocusEvent<HTMLElement>) => {
          const element = event.currentTarget;
          const rect = element.getBoundingClientRect();
          const { left, top } = getPosition(rect, element);
          setTooltip({ commit, left, top });
        },
        onBlur: clearTooltip,
      };
    },
    [clearTooltip],
  );

  const fetchGitLog = useCallback(async () => {
    if (!workspacePath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<GitLogResult>("git_log", {
        projectDirectory: workspacePath,
      });
      setLogResult(result);
    } catch (e: unknown) {
      setError(
        typeof e === "string" ? e : (e as Error)?.message || "Unknown error",
      );
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    if (workspacePath) {
      fetchGitLog();
      fetchChangesCount();
      fetchDiff();
    }
  }, [workspacePath, fetchGitLog, fetchChangesCount, fetchDiff]);

  const commits = useMemo(() => logResult?.commits || [], [logResult]);
  const groupedCommits = useMemo(() => {
    const groups = new Map<string, GitLogEntry[]>();
    for (const commit of commits) {
      const label = commitGroupLabel(commit.date, t);
      groups.set(label, [...(groups.get(label) || []), commit]);
    }
    return Array.from(groups.entries());
  }, [commits, t]);

  const addWidthPx = useMemo(() => {
    if (!diffFiles || diffFiles.length === 0) return undefined;
    const maxChars = Math.max(
      ...diffFiles.map((f) => String(f.additions).length + 1),
    );
    return maxChars * 7 + 2;
  }, [diffFiles]);

  const delWidthPx = useMemo(() => {
    if (!diffFiles || diffFiles.length === 0) return undefined;
    const maxChars = Math.max(
      ...diffFiles.map((f) => String(f.deletions).length + 1),
    );
    return maxChars * 7 + 2;
  }, [diffFiles]);

  const handleQuickBackup = useCallback(async () => {
    if (!workspacePath) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const message = `Backup ${ts}`;
    try {
      await invoke("git_quick_backup", {
        projectDirectory: workspacePath,
        message,
      });
    } catch {
      // ignore — git will report "nothing to commit" when there are no changes
    }
    fetchGitLog();
    fetchChangesCount();
    fetchDiff();
    window.dispatchEvent(new CustomEvent("mlfb-git-updated"));
  }, [workspacePath, fetchGitLog, fetchChangesCount, fetchDiff]);

  const handleAttachCommit = useCallback((commit: GitLogEntry) => {
    const fc = useFeedbackStore.getState().focusedComposer;
    if (!fc) return;
    const encodedMessage = encodeURIComponent(commit.message);
    const raw = `[${shortHash(commit.hash)}](git:${commit.hash}|${encodedMessage})`;
    window.dispatchEvent(
      new CustomEvent("mlfb-insert-feedback-text", {
        detail: {
          callerId: fc.callerId,
          sessionId: fc.sessionId,
          kind: fc.kind,
          text: raw,
        },
      }),
    );
  }, []);

  return (
    <div className="git-panel flex flex-col h-full min-h-0">
      <div className="terminal-tab-strip" data-preview-overlay>
        <div
          className="flex-1 flex items-center gap-2 px-3"
          style={{ minWidth: 0 }}
        >
          {logResult?.branch.current && (
            <div className="git-branch-capsule">
              {gitReminderProgress?.enabled ? (
                <span
                  className="git-countdown-pie"
                  style={
                    {
                      "--git-pie-angle": `${Math.round((gitReminderProgress.ready ? 1 : gitReminderProgress.progress) * 360)}deg`,
                      "--git-pie-color": workspaceIdentity.color,
                    } as React.CSSProperties
                  }
                  title={
                    gitReminderProgress.ready
                      ? t(
                          "gitAction.buttonTooltipTimedReady",
                          "Timed Git reminder ready now",
                        )
                      : t(
                          "gitAction.buttonTooltipNextTimed",
                          "Next timed Git reminder in {{count}} min",
                          { count: gitReminderProgress.minutesUntil ?? 0 },
                        )
                  }
                />
              ) : (
                <Icon name="git-branch" size={12} />
              )}
              <span>{logResult.branch.current}</span>
            </div>
          )}
          {changesBreakdown !== null &&
            changesBreakdown.modified +
              changesBreakdown.added +
              changesBreakdown.deleted >
              0 && (
              <div
                ref={badgeRef}
                className="git-diff-indicator-wrap"
                onMouseEnter={showDiffPopover}
                onMouseLeave={hideDiffPopover}
              >
                {changesBreakdown.modified > 0 && (
                  <span className="git-changes-badge git-changes-modified">
                    {changesBreakdown.modified}
                  </span>
                )}
                {changesBreakdown.added > 0 && (
                  <span className="git-changes-badge git-changes-added">
                    {changesBreakdown.added}
                  </span>
                )}
                {changesBreakdown.deleted > 0 && (
                  <span className="git-changes-badge git-changes-deleted">
                    {changesBreakdown.deleted}
                  </span>
                )}
              </div>
            )}
        </div>
        <div className="terminal-new-tab-split">
          <button
            type="button"
            className="terminal-tool-button"
            onClick={handleQuickBackup}
            disabled={
              loading ||
              !workspacePath ||
              (changesBreakdown !== null &&
                changesBreakdown.modified +
                  changesBreakdown.added +
                  changesBreakdown.deleted ===
                  0)
            }
            title={t("git.backup", "Quick Backup")}
            data-tooltip={t("git.backup", "Quick Backup")}
          >
            <Icon name="database" size={13} />
          </button>
          <button
            type="button"
            className="terminal-tool-button"
            onClick={() => {
              fetchGitLog();
              fetchChangesCount();
              fetchDiff();
            }}
            disabled={loading || !workspacePath}
            title={t("git.refresh", "Refresh")}
          >
            <Icon name="refresh" size={13} />
          </button>
        </div>
      </div>
      {error && (
        <div
          className="shrink-0 px-3 py-1 text-xs"
          style={{
            color: "var(--color-error, #ef4444)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "var(--color-text-muted)" }}
          >
            <div className="flex items-center gap-2">
              <Icon name="spinner" size={14} />
              <span className="text-xs">{t("git.loading", "Loading...")}</span>
            </div>
          </div>
        ) : commits.length === 0 && !error ? (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "var(--color-text-muted)" }}
          >
            <span className="text-xs">
              {t("git.noCommits", "No commits found")}
            </span>
          </div>
        ) : (
          <div
            className="git-commit-list"
            style={
              {
                "--git-workspace-color": workspaceIdentity.color,
              } as React.CSSProperties
            }
          >
            {groupedCommits.map(([label, items]) => (
              <section key={label} className="git-commit-group">
                <div className="git-commit-group-header">
                  <span className="git-commit-group-label">{label}</span>
                  <span className="git-commit-group-count">({items.length})</span>
                </div>
                <div className="git-commit-group-items">
                  {items.map((commit) => {
                    const isExpanded = expandedCommit === commit.hash;
                    return (
                      <div key={commit.hash} className="git-commit-item">
                        <button
                          className="git-commit-header"
                          onClick={() =>
                            setExpandedCommit(isExpanded ? null : commit.hash)
                          }
                          {...tooltipProps(commit)}
                        >
                          <div className="git-commit-dot" />
                          <div className="git-commit-info">
                            <div className="git-commit-message truncate">
                              {commit.message}
                            </div>
                            <div className="git-commit-meta">
                              <span className="git-commit-hash">
                                {shortHash(commit.hash)}
                              </span>
                              <span className="git-commit-author">
                                {commit.authorName}
                              </span>
                              <span className="git-commit-date">
                                {formatCommitDate(commit.date)}
                              </span>
                            </div>
                          </div>
                          <div
                            className="git-commit-attach"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAttachCommit(commit);
                            }}
                            title={t("git.attachToChat", "Attach to chat")}
                          >
                            <Icon name="paperclip" size={13} />
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="git-commit-detail">
                            <div className="git-commit-detail-row">
                              <span className="git-commit-detail-label">Hash</span>
                              <code>{commit.hash}</code>
                            </div>
                            <div className="git-commit-detail-row">
                              <span className="git-commit-detail-label">Author</span>
                              <span>
                                {commit.authorName} &lt;{commit.authorEmail}&gt;
                              </span>
                            </div>
                            <div className="git-commit-detail-row">
                              <span className="git-commit-detail-label">Date</span>
                              <span>{commit.date}</span>
                            </div>
                            <div className="git-commit-detail-row">
                              <span className="git-commit-detail-label">Message</span>
                              <span className="git-commit-detail-message">
                                {commit.message}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {tooltip && (
        <div
          className="mlc-custom-tooltip git-commit-tooltip"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <div className="git-commit-tooltip-row">
            <span className="git-commit-tooltip-label">Hash</span>
            <code>{tooltip.commit.hash}</code>
          </div>
          <div className="git-commit-tooltip-row">
            <span className="git-commit-tooltip-label">Author</span>
            <span>
              {tooltip.commit.authorName} &lt;{tooltip.commit.authorEmail}&gt;
            </span>
          </div>
          <div className="git-commit-tooltip-row">
            <span className="git-commit-tooltip-label">Date</span>
            <span>{tooltip.commit.date}</span>
          </div>
          <div className="git-commit-tooltip-row">
            <span className="git-commit-tooltip-label">Message</span>
            <span className="git-commit-tooltip-message">
              {tooltip.commit.message}
            </span>
          </div>
        </div>
      )}

      {diffPopover && (
        <div
          ref={popoverRef}
          className="git-diff-popover"
          style={{ left: diffPopover.left, top: diffPopover.top }}
          onMouseEnter={() => {
            if (diffHideTimerRef.current !== null) {
              window.clearTimeout(diffHideTimerRef.current);
              diffHideTimerRef.current = null;
            }
          }}
          onMouseLeave={hideDiffPopover}
        >
          <div className="git-diff-popover-scroll">
            {diffLoading ? (
              <div className="git-diff-popover-loading">Loading...</div>
            ) : diffFiles && diffFiles.length > 0 ? (
              <div className="git-diff-file-list">
                {diffFiles.map((file) => (
                  <div key={file.path} className="git-diff-file-item">
                    <div className="git-diff-file-header">
                      <span
                        className={`git-diff-status-letter git-diff-status-${statusLetter(file.status)}`}
                      >
                        {statusLetter(file.status)}
                      </span>
                      <span
                        className="git-diff-file-path"
                        onMouseEnter={(e) => {
                          const el = e.currentTarget;
                          if (el.scrollWidth > el.clientWidth) {
                            el.title = file.path;
                          }
                        }}
                      >
                        {displayDiffPath(
                          file.path,
                          gitPanelSettings.diffPathDisplayMode,
                        )}
                      </span>
                      <span className="git-diff-file-meter">
                        {buildGitDiffSegments(
                          file.additions,
                          file.deletions,
                          Math.min(
                            Math.max((file.additions + file.deletions) / 10, 1),
                            12,
                          ),
                        ).map((segment, i) => (
                          <span
                            key={i}
                            className={`git-diff-file-square git-diff-file-square-${segment}`}
                          />
                        ))}
                      </span>
                      <span className="git-diff-file-stats">
                        <span
                          className="git-diff-summary-add"
                          style={{ width: addWidthPx, minWidth: addWidthPx }}
                        >
                          +{file.additions}
                        </span>
                        <span
                          className="git-diff-summary-delete"
                          style={{ width: delWidthPx, minWidth: delWidthPx }}
                        >
                          {statusLetter(file.status) === "A"
                            ? "\u00A0"
                            : `-${file.deletions}`}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : diffFiles && diffFiles.length === 0 ? (
              <div className="git-diff-popover-empty">No changes</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
