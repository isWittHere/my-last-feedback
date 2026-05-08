import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useFeedbackStore } from "../store/feedbackStore";
import type { Session } from "../store/feedbackStore";
import { useTranslation } from "react-i18next";
import { useActiveCallerSession } from "./useActiveCallerSession";
import { useCallerOverride } from "./CallerContext";
import { IdenticonAvatar } from "./IdenticonAvatar";
import { Icon } from "./Icons";
import { collectSubmittedResourceLinks } from "../composer/submittedFeedback";
import { useCopyToClipboard } from "./useCopyToClipboard";
import { useFriendlyName } from "./useFriendlyName";
import { useIsLightTheme } from "./useIsLightTheme";
import { timeAgo, getTimeGroup } from "./timeUtils";
import type { TimeGroup } from "./timeUtils";
import { SESSION_LIST_MODE_OPTIONS, type SessionListMode } from "../sessionNavigationSettings";
import { SessionNavigationModeIcon } from "./SessionNavigationModeIcon";
import { SettingsSegmentedControl } from "./SettingsSegmentedControl";

function sortSessionsForNavigation(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const statusOrder: Record<string, number> = { pending: 0, cancelled: 2, responded: 2 };
    const order = (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2);
    return order !== 0 ? order : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function hasSessionAttachments(session: Session): boolean {
  return session.images.length > 0
    || session.testLogText.trim().length > 0
    || !!session.gitAction
    || session.commandLogs.trim().length > 0
    || (session.mlcAttachments || []).length > 0
    || (session.webAttachments || []).length > 0
    || collectSubmittedResourceLinks(session.feedbackText, session.projectDirectory).length > 0;
}

const TOPBAR_ITEM_MIN_WIDTH = 14;
const TOPBAR_ITEM_MAX_WIDTH = 44;
const TOPBAR_ITEM_MIN_HEIGHT = 8;
const TOPBAR_ITEM_MAX_HEIGHT = 22;
const TOPBAR_ITEM_HEIGHT_CHAR_LIMIT = 1200;
const TOPBAR_ITEM_WIDTH_CHAR_LIMIT = 12000;

function countSummaryCharacters(session: Session): number {
  return Array.from(session.summary.replace(/\s+/g, "")).length;
}

function getTopbarItemShape(session: Session) {
  const characterCount = countSummaryCharacters(session);
  const heightProgress = Math.min(characterCount, TOPBAR_ITEM_HEIGHT_CHAR_LIMIT) / TOPBAR_ITEM_HEIGHT_CHAR_LIMIT;
  const height = Math.round(TOPBAR_ITEM_MIN_HEIGHT + (TOPBAR_ITEM_MAX_HEIGHT - TOPBAR_ITEM_MIN_HEIGHT) * heightProgress);
  let width = TOPBAR_ITEM_MIN_WIDTH;

  if (characterCount > TOPBAR_ITEM_HEIGHT_CHAR_LIMIT) {
    const widthProgress = Math.min(
      characterCount - TOPBAR_ITEM_HEIGHT_CHAR_LIMIT,
      TOPBAR_ITEM_WIDTH_CHAR_LIMIT - TOPBAR_ITEM_HEIGHT_CHAR_LIMIT
    ) / (TOPBAR_ITEM_WIDTH_CHAR_LIMIT - TOPBAR_ITEM_HEIGHT_CHAR_LIMIT);
    width = Math.round(TOPBAR_ITEM_MIN_WIDTH + (TOPBAR_ITEM_MAX_WIDTH - TOPBAR_ITEM_MIN_WIDTH) * widthProgress);
  }

  return { characterCount, width, height };
}

function formatCharacterCount(count: number): string {
  return count.toLocaleString();
}

function SessionStatusIcon({ session, size = 12 }: { session: Session; size?: number }) {
  if (session.status === "pending") return <Icon name="message-dot" size={size} color="#f59e0b" fill="none" />;
  if (session.status === "cancelled") return <Icon name="close" size={size} color="#ef4444" strokeWidth={2.5} />;
  return <Icon name="check" size={size} color="var(--color-success)" strokeWidth={2.5} />;
}

function getRequestTypeLabel(requestType: Session["requestType"], t: (key: string, defaultValue: string) => string): string {
  switch (requestType) {
    case "explanation":
      return t("sidebar.requestType.explanation", "Explanation");
    case "question":
      return t("sidebar.requestType.question", "Question");
    case "planning":
      return t("sidebar.requestType.planning", "Planning");
    case "completion":
      return t("sidebar.requestType.completion", "Completion");
    case "analysis_report":
      return t("sidebar.requestType.analysisReport", "Analysis report");
    case "document_completed":
      return t("sidebar.requestType.documentCompleted", "Document completed");
    case "verification_completed":
      return t("sidebar.requestType.verificationCompleted", "Verification completed");
    case "default":
    default:
      return t("sidebar.requestType.default", "Default");
  }
}

function getTopbarStatsColor(session: Session): string {
  if (session.status === "pending") return "var(--stats-nav-warning)";
  if (session.status === "cancelled") return "var(--stats-nav-error)";

  switch (session.requestType) {
    case "explanation":
      return "var(--stats-nav-tertiary)";
    case "question":
    case "planning":
      return "var(--stats-nav-secondary)";
    case "completion":
      return "var(--stats-nav-primary)";
    case "analysis_report":
      return "var(--stats-nav-tertiary)";
    case "document_completed":
      return "var(--stats-nav-document)";
    case "verification_completed":
      return "var(--stats-nav-primary)";
    case "default":
    default:
      return "var(--stats-nav-neutral)";
  }
}

function getTopbarStatsCallerColor(activeCallerColor: string | null): string {
  return activeCallerColor || "var(--stats-nav-neutral)";
}

/** Collapsible session group with sticky header */
function SessionGroup({
  label,
  sessions,
  activeSessionId,
  activeCallerColor,
  onSelect,
  onDelete,
  onCancel,
  onContextMenu,
  t,
}: {
  label: string;
  sessions: Session[];
  activeSessionId: string | undefined;
  activeCallerColor: string | null;
  onSelect: (id: string) => void;
  onDelete: (session: { id: string; status: string }) => void;
  onCancel: (sessionId: string) => void;
  onContextMenu: (event: React.MouseEvent, session: Session) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isLight = useIsLightTheme();

  return (
    <div className="session-group">
      <button
        className="session-group-header"
        onClick={() => setCollapsed(prev => !prev)}
      >
        <Icon name="chevron-down" size={8} className="app-disclosure-icon" style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }} />
        <span>{label}</span>
        <span className="session-group-count">{sessions.length}</span>
      </button>
      {!collapsed && sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        const isPending = session.status === "pending";
        const isCancelled = session.status === "cancelled";
        const resourceLinks = collectSubmittedResourceLinks(session.feedbackText, session.projectDirectory);
        return (
          <button
            key={session.id}
            className={`session-item${isActive ? " session-item-active" : ""}`}
            onClick={() => onSelect(session.id)}
            onContextMenu={(event) => onContextMenu(event, session)}
            style={isActive && activeCallerColor ? { background: `${activeCallerColor}${isLight ? "0d" : "1a"}` } : undefined}
          >
            {/* Row 1: icon + title */}
            <div className="session-item-row1">
              <span className="session-item-icon">
                {isPending ? (
                  <Icon name="message-dot" size={11} color="#f59e0b" fill="none" />
                ) : isCancelled ? (
                  <Icon name="close" size={11} color="#ef4444" strokeWidth={2.5} />
                ) : (
                  <Icon name="check" size={11} color="var(--color-success)" strokeWidth={2.5} />
                )}
              </span>
              <span className={`session-item-name${isPending ? "" : " session-item-name-responded"}`}>
                {session.requestName || "Untitled"}
              </span>
            </div>
            {/* Row 2: time + tags + action buttons */}
            <div className="session-item-row2">
              <span className="session-item-time">
                {timeAgo(session.createdAt, t)}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 4, flexShrink: 0 }}>
                {session.images.length > 0 && (
                  <span title={t("images.attachments")}>
                    <Icon name="image" size={10} color="var(--color-text-muted)" />
                  </span>
                )}
                {session.testLogText.trim().length > 0 && (
                  <span title={t("testLog.attach")}>
                    <Icon name="file" size={10} color="var(--color-text-muted)" />
                  </span>
                )}
                {session.gitAction && (
                  <span title={t("gitAction.button")}>
                    <Icon name="git-branch" size={10} color="var(--color-text-muted)" />
                  </span>
                )}
                {session.commandLogs.trim().length > 0 && (
                  <span title={t("commandLogs.attach", { defaultValue: "Command logs" })}>
                    <Icon name="terminal" size={10} color="var(--color-text-muted)" />
                  </span>
                )}
                {(session.mlcAttachments || []).length > 0 && (
                  <span title={t("mlc.button", { defaultValue: "MLC" })}>
                    <Icon name="book" size={10} color="var(--color-text-muted)" />
                  </span>
                )}
                {(session.webAttachments || []).length > 0 && (
                  <span title={t("previewBrowser.button", { defaultValue: "Preview" })}>
                    <Icon name="globe" size={10} color="var(--color-text-muted)" />
                  </span>
                )}
                {resourceLinks.length > 0 && (
                  <span title={t("resources.button", { defaultValue: "Resources" })}>
                    <Icon name="file-text" size={10} color="var(--color-text-muted)" />
                  </span>
                )}
              </span>
              <span className="session-item-actions">
                {isPending && (
                  <span
                    className="session-item-cancel"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancel(session.id);
                    }}
                    title={t("sidebar.markCancelled", { defaultValue: "Mark as cancelled" })}
                  >
                    <Icon name="circle-x" size={10} />
                  </span>
                )}
                <span
                  className="session-item-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(session);
                  }}
                  title={t("sidebar.delete", { defaultValue: "Delete" })}
                >
                  <Icon name="close-sm" size={10} />
                </span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function Sidebar({ mode, onModeChange }: { mode: SessionListMode; onModeChange: (mode: SessionListMode) => void }) {
  const { t } = useTranslation();
  const friendlyName = useFriendlyName();
  const override = useCallerOverride();
  const isLight = useIsLightTheme();
  const { callerId: activeCallerId, sessionId: activeSessionId, caller } = useActiveCallerSession();
  const allSessions = useFeedbackStore((s) => s.sessions);
  const setActiveSession = useFeedbackStore((s) => s.setActiveSession);
  const removeSession = useFeedbackStore((s) => s.removeSession);
  const markSessionResponded = useFeedbackStore((s) => s.markSessionResponded);
  const markSessionCancelled = useFeedbackStore((s) => s.markSessionCancelled);
  const activeCallerColor = caller?.color || null;
  const blinkingCallerIds = useFeedbackStore((s) => s.unreadCallerIds);
  const showAttachmentDots = useFeedbackStore((s) => s.showSessionNavigationAttachmentDots);
  const useColorCards = useFeedbackStore((s) => s.useSessionNavigationColorCards);
  const isBlinking = caller ? blinkingCallerIds.includes(caller.id) : false;
  const isRail = mode === "rail";
  const isTopbarCompact = mode === "topbarCompact";
  const isTopbarStats = mode === "topbarStats";
  const isTopbar = isTopbarCompact || isTopbarStats;
  const modeKind = isTopbar ? "topbar" : "sidebar";
  const previousModeKindRef = useRef(modeKind);
  const [disableKindTransition, setDisableKindTransition] = useState(false);
  const isCrossKindSwitch = previousModeKindRef.current !== modeKind;
  const modeTransitionClass = isCrossKindSwitch || disableKindTransition ? " session-sidebar-no-transition" : "";
  const [modeMenu, setModeMenu] = useState<{ left: number; top: number } | null>(null);
  const [sessionItemMenu, setSessionItemMenu] = useState<{ session: Session; left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (previousModeKindRef.current === modeKind) return;
    previousModeKindRef.current = modeKind;
    setDisableKindTransition(true);
    const frame = window.requestAnimationFrame(() => setDisableKindTransition(false));
    return () => window.cancelAnimationFrame(frame);
  }, [modeKind]);

  const handleModeContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setSessionItemMenu(null);
    setModeMenu({
      left: Math.min(Math.max(8, event.clientX), Math.max(8, window.innerWidth - 196)),
      top: Math.min(Math.max(8, event.clientY), Math.max(8, window.innerHeight - 128)),
    });
  }, []);

  const handleSessionItemContextMenu = useCallback((event: React.MouseEvent, session: Session) => {
    event.preventDefault();
    event.stopPropagation();
    setHoveredItem(null);
    setModeMenu(null);
    setSessionItemMenu({
      session,
      left: Math.min(Math.max(8, event.clientX), Math.max(8, window.innerWidth - 188)),
      top: Math.min(Math.max(8, event.clientY), Math.max(8, window.innerHeight - 118)),
    });
  }, []);

  const selectMode = useCallback((nextMode: SessionListMode) => {
    onModeChange(nextMode);
    setModeMenu(null);
  }, [onModeChange]);

  useEffect(() => {
    if (!modeMenu && !sessionItemMenu) return;
    const close = () => {
      setModeMenu(null);
      setSessionItemMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", close);
    };
  }, [modeMenu, sessionItemMenu]);

  // Copy agent_name on avatar click
  const { copied: avatarCopied, copy: copyAvatar } = useCopyToClipboard();
  const handleAvatarClick = useCallback(() => {
    if (!caller) return;
    const text = `agent_name="${caller.alias || caller.name}".`;
    copyAvatar(text);
  }, [caller, copyAvatar]);

  const handleSelectSession = (id: string) => {
    if (override) {
      override.setSessionId(id);
    } else {
      setActiveSession(id);
    }
  };

  // Custom confirm dialog state for pending session deletion
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Collapsed item hover popup
  const [hoveredItem, setHoveredItem] = useState<{ session: Session; top: number; left: number; placement: "right" | "bottom" } | null>(null);
  const handleCollapsedMouseEnter = useCallback((e: React.MouseEvent, session: Session) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHoveredItem({ session, top: rect.top + rect.height / 2, left: rect.right + 6, placement: "right" });
  }, []);
  const handleTopbarMouseEnter = useCallback((e: React.MouseEvent, session: Session) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHoveredItem({ session, top: rect.bottom + 6, left: Math.min(rect.left, Math.max(8, window.innerWidth - 220)), placement: "bottom" });
  }, []);
  const handleCollapsedMouseLeave = useCallback(() => setHoveredItem(null), []);

  const handleDeleteClick = useCallback((session: { id: string; status: string }) => {
    if (session.status === "pending") {
      setPendingDeleteId(session.id);
    } else {
      // For responded and cancelled sessions, just remove directly
      removeSession(session.id);
    }
  }, [removeSession]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    try {
      await invoke("submit_session_feedback", {
        sessionId: pendingDeleteId,
        feedbackText: "",
        commandLogs: "",
        images: [],
        mlcAttachments: [],
        webAttachments: [],
      });
      markSessionResponded(pendingDeleteId);
    } catch (e) {
      console.error("Failed to submit empty feedback:", e);
    }
    removeSession(pendingDeleteId);
    setPendingDeleteId(null);
  }, [pendingDeleteId, removeSession, markSessionResponded]);

  const sessions = useMemo(
    () => activeCallerId ? allSessions.filter((sess) => sess.callerId === activeCallerId) : [],
    [allSessions, activeCallerId]
  );
  const compactSessions = useMemo(() => sortSessionsForNavigation(sessions), [sessions]);

  const handleTopbarWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    if (container.scrollWidth <= container.clientWidth) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;
    container.scrollLeft += delta;
    event.preventDefault();
  }, []);

  const hoverPopup = hoveredItem && createPortal(
    <div
      className="session-collapsed-popup"
      style={{
        position: "fixed",
        top: hoveredItem.top,
        left: hoveredItem.left,
        transform: hoveredItem.placement === "right" ? "translateY(-50%)" : undefined,
        display: "block",
      }}
    >
      <div className="session-collapsed-popup-title">{hoveredItem.session.requestName || "Untitled"}</div>
      <div className="session-collapsed-popup-type">{getRequestTypeLabel(hoveredItem.session.requestType, t)}</div>
      <div className="session-collapsed-popup-meta">
        <span>{timeAgo(hoveredItem.session.createdAt, t)}</span>
        <span>{t("sidebar.summaryCharacters", { count: countSummaryCharacters(hoveredItem.session) })}</span>
        {hoveredItem.session.images.length > 0 && (
          <Icon name="image" size={10} />
        )}
        {hoveredItem.session.testLogText.trim().length > 0 && (
          <Icon name="file" size={10} />
        )}
        {hoveredItem.session.gitAction && (
          <Icon name="git-branch" size={10} />
        )}
        {hoveredItem.session.commandLogs.trim().length > 0 && (
          <Icon name="terminal" size={10} />
        )}
        {(hoveredItem.session.mlcAttachments || []).length > 0 && (
          <Icon name="book" size={10} />
        )}
        {(hoveredItem.session.webAttachments || []).length > 0 && (
          <Icon name="globe" size={10} />
        )}
        {collectSubmittedResourceLinks(hoveredItem.session.feedbackText, hoveredItem.session.projectDirectory).length > 0 && (
          <Icon name="file-text" size={10} />
        )}
      </div>
    </div>,
    document.body
  );

  const modeMenuPortal = modeMenu && createPortal(
    <div
      className="session-mode-menu"
      data-preview-overlay
      style={{ left: modeMenu.left, top: modeMenu.top }}
      role="menu"
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <SettingsSegmentedControl
        ariaLabel={t("settings.sessionNavigationMode", "Navigation display mode")}
        value={mode}
        onChange={(value) => selectMode(value as SessionListMode)}
        className="settings-segmented-icon-only settings-segmented-visual-options settings-session-nav-options"
        options={SESSION_LIST_MODE_OPTIONS.map((option) => ({
          id: option.mode,
          label: t(option.labelKey, option.defaultLabel),
          icon: <SessionNavigationModeIcon mode={option.mode} />,
          ariaLabel: `${t("settings.sessionNavigationMode", "Navigation display mode")}: ${t(option.labelKey, option.defaultLabel)}`,
        }))}
      />
    </div>,
    document.body
  );

  const sessionItemMenuPortal = sessionItemMenu && createPortal(
    <div
      className="mlc-panel-tab-menu session-item-menu"
      data-preview-overlay
      style={{ left: sessionItemMenu.left, top: sessionItemMenu.top }}
      role="menu"
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          handleSelectSession(sessionItemMenu.session.id);
          setSessionItemMenu(null);
        }}
      >
        <Icon name="arrow-right" size={12} />
        <span>{t("sidebar.openSession", "Open session")}</span>
      </button>
      {sessionItemMenu.session.status === "pending" ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            markSessionCancelled(sessionItemMenu.session.id);
            setSessionItemMenu(null);
          }}
        >
          <Icon name="circle-x" size={12} />
          <span>{t("sidebar.markCancelled")}</span>
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="session-item-menu-danger"
        onClick={() => {
          handleDeleteClick(sessionItemMenu.session);
          setSessionItemMenu(null);
        }}
      >
        <Icon name="trash" size={12} />
        <span>{t("sidebar.delete")}</span>
      </button>
    </div>,
    document.body
  );

  if (isTopbar) {
    return (
      <div className={`session-sidebar session-sidebar-topbar session-sidebar-topbar-${isTopbarStats ? "stats" : "compact"}${modeTransitionClass}`} onContextMenu={handleModeContextMenu}>
        <div className="session-topbar-caller">
          {caller ? (
            <>
              <div
                onClick={handleAvatarClick}
                data-tooltip={avatarCopied ? t("sidebar.copied", "Copied!") : t("sidebar.clickToCopy", { alias: caller.alias || caller.name, defaultValue: 'Click to copy: agent_name="{{alias}}".' })}
                aria-label={avatarCopied ? t("sidebar.copied", "Copied!") : t("sidebar.clickToCopy", { alias: caller.alias || caller.name, defaultValue: 'Click to copy: agent_name="{{alias}}".' })}
                className="session-topbar-avatar"
              >
                <IdenticonAvatar alias={caller.alias || caller.name} color={caller.color} size={18} style={{ opacity: avatarCopied ? 0.5 : 1, transition: "opacity 0.15s" }} />
                {avatarCopied && (
                  <Icon name="check" size={10} color={caller.color} strokeWidth={3} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
                )}
              </div>
              <span className="session-topbar-caller-name" style={{ color: caller.color }}>
                {caller.alias ? friendlyName(caller.alias) : caller.name.charAt(0).toUpperCase()}
              </span>
              {caller.pendingCount > 0 && (
                <span className={`session-topbar-pending${isBlinking ? " caller-tab-badge-new" : ""}`}>{caller.pendingCount}</span>
              )}
            </>
          ) : (
            <span className="session-topbar-caller-name">{t("sidebar.history", "History")}</span>
          )}
        </div>
        <div className="session-topbar-list" onWheel={handleTopbarWheel}>
          {compactSessions.length === 0 ? (
            <div className="session-topbar-empty">{t("sidebar.empty", "No sessions yet")}</div>
          ) : compactSessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const shape = isTopbarStats ? getTopbarItemShape(session) : null;
            return (
              isTopbarStats ? (
                <button
                  key={session.id}
                  type="button"
                  className={`session-topbar-item session-topbar-item-${session.status} session-topbar-type-${session.requestType}${isActive ? " active" : ""}`}
                  onClick={() => handleSelectSession(session.id)}
                  onContextMenu={(event) => handleSessionItemContextMenu(event, session)}
                  onMouseEnter={(event) => handleTopbarMouseEnter(event, session)}
                  onMouseLeave={handleCollapsedMouseLeave}
                  aria-label={`${session.requestName || "Untitled"}, ${formatCharacterCount(shape!.characterCount)} chars`}
                  style={{
                    width: shape!.width,
                    minWidth: shape!.width,
                    height: shape!.height,
                    "--session-topbar-card-bg": useColorCards ? getTopbarStatsColor(session) : getTopbarStatsCallerColor(activeCallerColor),
                  } as CSSProperties}
                >
                  {showAttachmentDots && hasSessionAttachments(session) && <span className="session-topbar-attachment-dot" />}
                </button>
              ) : (
                <button
                  key={session.id}
                  type="button"
                  className={`session-topbar-compact-item${isActive ? " active" : ""}`}
                  onClick={() => handleSelectSession(session.id)}
                  onContextMenu={(event) => handleSessionItemContextMenu(event, session)}
                  onMouseEnter={(event) => handleTopbarMouseEnter(event, session)}
                  onMouseLeave={handleCollapsedMouseLeave}
                  aria-label={session.requestName || "Untitled"}
                  style={isActive && activeCallerColor ? { background: `${activeCallerColor}1a` } : undefined}
                >
                  <SessionStatusIcon session={session} size={11} />
                  {showAttachmentDots && hasSessionAttachments(session) && <span className="session-topbar-attachment-dot" />}
                </button>
              )
            );
          })}
        </div>
        {hoverPopup}
        {modeMenuPortal}
        {sessionItemMenuPortal}
      </div>
    );
  }

  return (
    <div className={`session-sidebar${isRail ? " session-sidebar-collapsed" : ""}${modeTransitionClass}`} onContextMenu={handleModeContextMenu}>
      <div
        className="session-sidebar-header"
      >
        {isRail ? (
          <button
            onClick={() => onModeChange("expanded")}
            className="titlebar-btn"
            style={{ width: 22, height: 22, padding: 0 }}
            title={t("sidebar.expand", "Expand sidebar")}
          >
            <Icon name="chevron-right" size={11} />
          </button>
        ) : (
          /* Expanded header */
          <>
        {caller ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, width: "100%" }}>
            <div
              onClick={handleAvatarClick}
              data-tooltip={avatarCopied ? t("sidebar.copied", "Copied!") : t("sidebar.clickToCopy", { alias: caller.alias || caller.name, defaultValue: 'Click to copy: agent_name="{{alias}}".' })}
              aria-label={avatarCopied ? t("sidebar.copied", "Copied!") : t("sidebar.clickToCopy", { alias: caller.alias || caller.name, defaultValue: 'Click to copy: agent_name="{{alias}}".' })}
              style={{ cursor: "pointer", position: "relative", flexShrink: 0 }}
            >
              <IdenticonAvatar alias={caller.alias || caller.name} color={caller.color} size={28} style={{ opacity: avatarCopied ? 0.5 : 1, transition: "opacity 0.15s" }} />
              {avatarCopied && (
                <Icon name="check" size={14} color={caller.color} strokeWidth={3} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: caller.color, whiteSpace: "nowrap" }}>
                  {caller.alias ? friendlyName(caller.alias) : caller.name.charAt(0).toUpperCase()}
                </span>
                {caller.alias && (
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>({caller.alias})</span>
                )}
                {caller.pendingCount > 0 && (
                  caller.pendingCount > 4 ? (
                    <span
                      style={{
                        background: "#f59e0b",
                        color: "#1a1a1a",
                        fontSize: 9,
                        fontWeight: 700,
                        minWidth: 14,
                        height: 14,
                        borderRadius: 7,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 4px",
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      {caller.pendingCount}
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
                      {Array.from({ length: caller.pendingCount }, (_, i) => (
                        <span
                          key={i}
                          className={isBlinking ? "caller-tab-badge-new" : undefined}
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            background: "#f59e0b",
                          }}
                        />
                      ))}
                    </span>
                  )
                )}
              </div>
              <span style={{ fontSize: 10, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {caller.name}
              </span>
            </div>
          </div>
        ) : (
          t("sidebar.history", "History")
        )}
            <button
              onClick={() => onModeChange("rail")}
              className="titlebar-btn"
              style={{ width: 22, height: 22, padding: 0, marginLeft: "auto", flexShrink: 0 }}
              title={t("sidebar.collapse", "Collapse sidebar")}
            >
            <Icon name="chevron-left" size={11} />
            </button>
          </>
        )}
      </div>
      <div className="session-sidebar-list">
        {isRail ? (
          (() => {
            return compactSessions.map((s) => {
              const isActive = s.id === activeSessionId;
              return (
                <div key={s.id} className="session-collapsed-item"
                  onMouseEnter={(e) => handleCollapsedMouseEnter(e, s)}
                  onMouseLeave={handleCollapsedMouseLeave}
                >
                  <button
                    onClick={() => handleSelectSession(s.id)}
                    onContextMenu={(event) => handleSessionItemContextMenu(event, s)}
                    className={`session-item${isActive ? " session-item-active" : ""}`}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: "6px 0", minHeight: 24, margin: "0", borderRadius: 4, position: "relative",
                      ...(isActive && activeCallerColor ? { background: `${activeCallerColor}1a` } : {}),
                    }}
                  >
                    <SessionStatusIcon session={s} size={12} />
                    {showAttachmentDots && hasSessionAttachments(s) && <span className="session-rail-attachment-dot" />}
                  </button>
                </div>
              );
            });
          })()
        ) : (
          <>
        {sessions.length === 0 && (
          <div className="session-sidebar-empty">
            {t("sidebar.empty", "No sessions yet")}
          </div>
        )}
        {(() => {
          const sorted = compactSessions;

          // Group sessions by time
          const groupOrder: TimeGroup[] = ["today", "yesterday", "lastWeek", "earlier"];
          const groupLabels: Record<TimeGroup, string> = {
            today: t("sidebar.groupToday", "Today"),
            yesterday: t("sidebar.groupYesterday", "Yesterday"),
            lastWeek: t("sidebar.groupLastWeek", "Past week"),
            earlier: t("sidebar.groupEarlier", "Earlier"),
          };

          const groups = new Map<TimeGroup, typeof sorted>();
          for (const s of sorted) {
            const g = getTimeGroup(s.createdAt);
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g)!.push(s);
          }

          return groupOrder
            .filter(g => groups.has(g))
            .map(g => (
              <SessionGroup
                key={g}
                label={groupLabels[g]}
                sessions={groups.get(g)!}
                activeSessionId={activeSessionId ?? undefined}
                activeCallerColor={activeCallerColor}
                onSelect={handleSelectSession}
                onDelete={handleDeleteClick}
                onCancel={markSessionCancelled}
                onContextMenu={handleSessionItemContextMenu}
                t={t}
              />
            ));
        })()}
          </>
        )}
      </div>

      {hoverPopup}
      {modeMenuPortal}
      {sessionItemMenuPortal}

      {/* Custom confirm dialog for pending session deletion */}
      {pendingDeleteId && (() => {
        const pendingSession = sessions.find((s) => s.id === pendingDeleteId);
        const callerName = caller?.name || "Unknown";
        const requestName = pendingSession?.requestName || "Untitled";
        const callerBg = caller?.color || undefined;
        const callerBorder = caller?.color ? `${caller.color}66` : "var(--color-border)";
        return createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 99999,
            }}
            onClick={() => setPendingDeleteId(null)}
          >
            <div
              style={{
                background: "var(--color-bg-elevated)",
                border: `1px solid ${callerBorder}`,
                borderRadius: 8,
                padding: "16px 20px",
                maxWidth: 320,
                boxShadow: callerBg
                  ? `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${callerBg}33`
                  : "0 8px 32px rgba(0,0,0,0.5)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: caller?.color || "var(--color-text-primary)", marginBottom: 6 }}>
                {t("sidebar.deleteAttempt", { caller: callerName, request: requestName, defaultValue: "Removing {{caller}}'s \"{{request}}\"" })}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
                {t("sidebar.confirmDelete")}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  className="btn"
                  style={{ fontSize: 12, padding: "4px 14px", minWidth: 72 }}
                  onClick={() => setPendingDeleteId(null)}
                >
                  {t("sidebar.cancel")}
                </button>
                <button
                  className="btn"
                  style={{
                    fontSize: 12,
                    padding: "4px 14px",
                    minWidth: 72,
                    background: "#ef4444",
                    borderColor: "#ef4444",
                    color: "#fff",
                  }}
                  onClick={handleConfirmDelete}
                >
                  {t("sidebar.confirmBtn")}
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
