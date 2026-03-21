import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useFeedbackStore } from "../store/feedbackStore";
import { useTranslation } from "react-i18next";
import { useActiveCallerSession } from "./useActiveCallerSession";
import { useCallerOverride } from "./CallerContext";
import { IdenticonAvatar } from "./IdenticonAvatar";
import { getFriendlyName } from "./friendlyName";

function timeAgo(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return t("sidebar.timeJustNow", { defaultValue: "just now" });
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t("sidebar.timeMinutes", { count: diffMin, defaultValue: "{{count}}m ago" });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t("sidebar.timeHours", { count: diffHr, defaultValue: "{{count}}h ago" });
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return t("sidebar.timeDays", { count: diffDay, defaultValue: "{{count}}d ago" });
  // Show date: M/D
  const d = new Date(dateStr);
  return t("sidebar.timeDate", { month: d.getMonth() + 1, day: d.getDate(), defaultValue: "{{month}}/{{day}}" });
}

type TimeGroup = "today" | "yesterday" | "lastWeek" | "earlier";

function getTimeGroup(dateStr: string): TimeGroup {
  const now = new Date();
  const then = new Date(dateStr);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekAgoStart = todayStart - 7 * 86400000;
  const t = then.getTime();
  if (t >= todayStart) return "today";
  if (t >= yesterdayStart) return "yesterday";
  if (t >= weekAgoStart) return "lastWeek";
  return "earlier";
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
  t,
}: {
  label: string;
  sessions: Array<{ id: string; status: string; requestName: string; createdAt: string }>;
  activeSessionId: string | undefined;
  activeCallerColor: string | null;
  onSelect: (id: string) => void;
  onDelete: (session: { id: string; status: string }) => void;
  onCancel: (sessionId: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="session-group">
      <button
        className="session-group-header"
        onClick={() => setCollapsed(prev => !prev)}
      >
        <svg
          width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
          style={{ transition: "transform 0.15s", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", flexShrink: 0 }}
        >
          <path d="M1 2 L4 5.5 L7 2" />
        </svg>
        <span>{label}</span>
        <span className="session-group-count">{sessions.length}</span>
      </button>
      {!collapsed && sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        const isPending = session.status === "pending";
        const isCancelled = session.status === "cancelled";
        return (
          <button
            key={session.id}
            className={`session-item${isActive ? " session-item-active" : ""}`}
            onClick={() => onSelect(session.id)}
            title={session.requestName}
            style={isActive && activeCallerColor ? { background: `${activeCallerColor}${document.documentElement.getAttribute("data-theme") === "light" ? "0d" : "1a"}` } : undefined}
          >
            {/* Row 1: icon + title */}
            <div className="session-item-row1">
              <span className="session-item-icon">
                {isPending ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><circle cx="12" cy="10" r="1" fill="#f59e0b" /></svg>
                ) : isCancelled ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </span>
              <span className={`session-item-name${isPending ? "" : " session-item-name-responded"}`}>
                {session.requestName || "Untitled"}
              </span>
            </div>
            {/* Row 2: time + action buttons */}
            <div className="session-item-row2">
              <span className="session-item-time">
                {timeAgo(session.createdAt, t)}
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
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
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
                  <svg width="10" height="10" viewBox="0 0 10 10"><line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" strokeWidth="1.2"/><line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" strokeWidth="1.2"/></svg>
                </span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const { t, i18n } = useTranslation();
  const override = useCallerOverride();
  const { callerId: activeCallerId, sessionId: activeSessionId, caller } = useActiveCallerSession();
  const allSessions = useFeedbackStore((s) => s.sessions);
  const setActiveSession = useFeedbackStore((s) => s.setActiveSession);
  const removeSession = useFeedbackStore((s) => s.removeSession);
  const markSessionResponded = useFeedbackStore((s) => s.markSessionResponded);
  const markSessionCancelled = useFeedbackStore((s) => s.markSessionCancelled);
  const activeCallerColor = caller?.color || null;
  const blinkingCallerIds = useFeedbackStore((s) => s.unreadCallerIds);
  const isBlinking = caller ? blinkingCallerIds.includes(caller.id) : false;

  // Copy agent_name on avatar click
  const [avatarCopied, setAvatarCopied] = useState(false);
  const avatarCopyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleAvatarClick = useCallback(() => {
    if (!caller) return;
    const text = `agent_name="${caller.alias || caller.name}".`;
    navigator.clipboard.writeText(text).then(() => {
      setAvatarCopied(true);
      clearTimeout(avatarCopyTimer.current);
      avatarCopyTimer.current = setTimeout(() => setAvatarCopied(false), 1500);
    });
  }, [caller]);

  const handleSelectSession = (id: string) => {
    if (override) {
      override.setSessionId(id);
    } else {
      setActiveSession(id);
    }
  };

  // Custom confirm dialog state for pending session deletion
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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

  return (
    <div className="session-sidebar">
      <div className="session-sidebar-header">
        {caller ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, width: "100%" }}>
            <div
              onClick={handleAvatarClick}
              title={avatarCopied ? t("sidebar.copied", "Copied!") : t("sidebar.clickToCopy", { alias: caller.alias || caller.name, defaultValue: 'Click to copy: agent_name="{{alias}}".' })}
              style={{ cursor: "pointer", position: "relative", flexShrink: 0 }}
            >
              <IdenticonAvatar alias={caller.alias || caller.name} color={caller.color} size={28} style={{ opacity: avatarCopied ? 0.5 : 1, transition: "opacity 0.15s" }} />
              {avatarCopied && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={caller.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: caller.color, whiteSpace: "nowrap" }}>
                  {caller.alias ? getFriendlyName(caller.alias, i18n.language === "zh" ? "zh" : "en") : caller.name.charAt(0).toUpperCase()}
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
      </div>
      <div className="session-sidebar-list">
        {sessions.length === 0 && (
          <div className="session-sidebar-empty">
            {t("sidebar.empty", "No sessions yet")}
          </div>
        )}
        {(() => {
          const sorted = [...sessions].sort((a, b) => {
            const statusOrder: Record<string, number> = { pending: 0, cancelled: 2, responded: 2 };
            const aOrder = statusOrder[a.status] ?? 2;
            const bOrder = statusOrder[b.status] ?? 2;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

          // Group sessions by time
          const groupOrder: TimeGroup[] = ["today", "yesterday", "lastWeek", "earlier"];
          const groupLabels: Record<TimeGroup, string> = {
            today: t("sidebar.groupToday", "Today"),
            yesterday: t("sidebar.groupYesterday", "Yesterday"),
            lastWeek: t("sidebar.groupLastWeek", "Last week"),
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
                t={t}
              />
            ));
        })()}
      </div>

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
