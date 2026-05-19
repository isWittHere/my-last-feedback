import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../store/feedbackStore";
import { Icon } from "./Icons";
import {
  getGitOperationSettings,
  getTimedGitReminderProgress,
  GIT_OPERATION_SETTINGS_EVENT,
} from "../gitOperationSettings";
import { resolveWorkspaceIdentity } from "../identity/workspaceIdentity";
import {
  AgentDiffPatchList,
  type AgentUiDiffFile,
} from "./agent/AgentDiffViewer";

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

function shortHash(hash: string): string {
  return hash.slice(0, 7);
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
  const [changesCount, setChangesCount] = useState<number | null>(null);
  const [diffFiles, setDiffFiles] = useState<AgentUiDiffFile[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const diffHideTimerRef = useRef<number | null>(null);
  const badgeRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [diffPopover, setDiffPopover] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const positionDiffPopover = useCallback(() => {
    const el = badgeRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const right = window.innerWidth - rect.right;
    const popoverWidth = Math.min(360, window.innerWidth - 24);
    let left: number;
    if (rect.left + popoverWidth > window.innerWidth - 8) {
      left = window.innerWidth - popoverWidth - 8;
    } else {
      left =
        rect.right + right >= popoverWidth
          ? rect.right - popoverWidth
          : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8));
    }
    const top = rect.bottom + gap;
    setDiffPopover({ left, top });
  }, []);

  const fetchChangesCount = useCallback(async () => {
    if (!workspacePath) return;
    try {
      const count = await invoke<number>("git_changes_count", {
        projectDirectory: workspacePath,
      });
      setChangesCount(count);
    } catch {
      setChangesCount(null);
    }
  }, [workspacePath]);

  const fetchDiff = useCallback(async () => {
    if (!workspacePath) return;
    setDiffLoading(true);
    try {
      const result = await invoke<AgentUiDiffFile[]>("git_diff", {
        projectDirectory: workspacePath,
      });
      setDiffFiles(result);
    } catch {
      setDiffFiles(null);
    } finally {
      setDiffLoading(false);
    }
  }, [workspacePath]);

  const showDiffPopover = useCallback(() => {
    if (diffHideTimerRef.current !== null) {
      window.clearTimeout(diffHideTimerRef.current);
      diffHideTimerRef.current = null;
    }
    positionDiffPopover();
    fetchDiff();
  }, [fetchDiff, positionDiffPopover]);

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
    }
  }, [workspacePath, fetchGitLog, fetchChangesCount]);

  const commits = useMemo(() => logResult?.commits || [], [logResult]);

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
                      ? "Timed Git reminder ready"
                      : `Next timed Git reminder in ${gitReminderProgress.minutesUntil ?? 0} min`
                  }
                />
              ) : (
                <Icon name="git-branch" size={12} />
              )}
              <span>{logResult.branch.current}</span>
            </div>
          )}
          {changesCount !== null && changesCount > 0 && (
            <div
              ref={badgeRef}
              className="git-diff-indicator-wrap"
              onMouseEnter={showDiffPopover}
              onMouseLeave={hideDiffPopover}
            >
              <span className="git-changes-badge">{changesCount}</span>
            </div>
          )}
        </div>
        <div className="terminal-new-tab-split">
          <button
            type="button"
            className="terminal-tool-button"
            onClick={() => {
              fetchGitLog();
              fetchChangesCount();
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
          <div className="git-commit-list">
            {commits.map((commit) => {
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
              <AgentDiffPatchList files={diffFiles} />
            ) : diffFiles && diffFiles.length === 0 ? (
              <div className="git-diff-popover-empty">No changes</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
