import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../store/feedbackStore";
import { useShallow } from "zustand/react/shallow";
import { IdenticonAvatar } from "./IdenticonAvatar";
import { useFriendlyName } from "./useFriendlyName";
import { Icon } from "./Icons";

interface WorkspaceGroup {
  name: string;
  callerIds: string[];
}

export function CallerManager() {
  const { t } = useTranslation();
  const friendlyName = useFriendlyName();
  const {
    callers, sessions, renameCaller, mergeCallers, hiddenCallerIds, toggleCallerHidden,
    removeCaller, removeEmptyCallers,
    maxSessionsPerCaller, setMaxSessionsPerCaller,
    autoRemoveEmptyCallers, setAutoRemoveEmptyCallers,
    autoHideInactiveHours, setAutoHideInactiveHours,
  } = useFeedbackStore(
    useShallow((s) => ({
      callers: s.callers,
      sessions: s.sessions,
      renameCaller: s.renameCaller,
      mergeCallers: s.mergeCallers,
      hiddenCallerIds: s.hiddenCallerIds,
      toggleCallerHidden: s.toggleCallerHidden,
      removeCaller: s.removeCaller,
      removeEmptyCallers: s.removeEmptyCallers,
      maxSessionsPerCaller: s.maxSessionsPerCaller,
      setMaxSessionsPerCaller: s.setMaxSessionsPerCaller,
      autoRemoveEmptyCallers: s.autoRemoveEmptyCallers,
      setAutoRemoveEmptyCallers: s.setAutoRemoveEmptyCallers,
      autoHideInactiveHours: s.autoHideInactiveHours,
      setAutoHideInactiveHours: s.setAutoHideInactiveHours,
    }))
  );

  // Group callers by workspace name
  const groups: WorkspaceGroup[] = useMemo(() => {
    // Compute latest session time per caller
    const latestActivity: Record<string, number> = {};
    for (const s of sessions) {
      const t = new Date(s.createdAt).getTime();
      if (!latestActivity[s.callerId] || t > latestActivity[s.callerId]) {
        latestActivity[s.callerId] = t;
      }
    }

    const map = new Map<string, string[]>();
    for (const c of callers) {
      const ids = map.get(c.name) || [];
      ids.push(c.id);
      map.set(c.name, ids);
    }
    return Array.from(map.entries())
      .map(([name, callerIds]) => ({
        name,
        callerIds: callerIds.sort((a, b) => (latestActivity[b] || 0) - (latestActivity[a] || 0)),
      }))
      .sort((a, b) => {
        const aMax = Math.max(0, ...a.callerIds.map((id) => latestActivity[id] || 0));
        const bMax = Math.max(0, ...b.callerIds.map((id) => latestActivity[id] || 0));
        return bMax - aMax;
      });
  }, [callers, sessions]);

  // Collapsed state per group
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = useCallback((name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback((callerId: string) => {
    const caller = callers.find((c) => c.id === callerId);
    if (!caller) return;
    setRenamingId(callerId);
    setRenameValue(caller.name);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }, [callers]);

  const commitRename = useCallback(async () => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    const caller = callers.find((c) => c.id === renamingId);
    if (caller && caller.name !== renameValue.trim()) {
      await renameCaller(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  }, [renamingId, renameValue, callers, renameCaller]);

  // Merge state
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [mergeConfirm, setMergeConfirm] = useState(false);

  const handleMerge = useCallback(async () => {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) return;
    await mergeCallers(mergeSource, mergeTarget);
    setMergeSource(null);
    setMergeTarget(null);
    setMergeConfirm(false);
  }, [mergeSource, mergeTarget, mergeCallers]);

  // Drag-and-drop: drag a caller to another workspace group
  const [dragCallerId, setDragCallerId] = useState<string | null>(null);
  const [dropTargetGroup, setDropTargetGroup] = useState<string | null>(null);

  // Remove caller state
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [cleanMessage, setCleanMessage] = useState<string | null>(null);

  const handleRemoveCaller = useCallback(async () => {
    if (!removeConfirmId) return;
    await removeCaller(removeConfirmId);
    setRemoveConfirmId(null);
  }, [removeConfirmId, removeCaller]);

  const handleCleanEmpty = useCallback(async () => {
    const removed = await removeEmptyCallers();
    if (removed.length > 0) {
      setCleanMessage(t("callerManager.cleanEmptyDone", { count: removed.length }));
    } else {
      setCleanMessage(t("callerManager.cleanEmptyNone"));
    }
    setTimeout(() => setCleanMessage(null), 3000);
  }, [removeEmptyCallers, t]);

  const handleDragStart = useCallback((e: React.DragEvent, callerId: string) => {
    setDragCallerId(callerId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", callerId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, groupName: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetGroup(groupName);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTargetGroup(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetGroupName: string) => {
    e.preventDefault();
    setDropTargetGroup(null);
    if (!dragCallerId) return;
    const caller = callers.find((c) => c.id === dragCallerId);
    if (!caller || caller.name === targetGroupName) {
      setDragCallerId(null);
      return;
    }
    await renameCaller(dragCallerId, targetGroupName);
    setDragCallerId(null);
  }, [dragCallerId, callers, renameCaller]);

  const handleDragEnd = useCallback(() => {
    setDragCallerId(null);
    setDropTargetGroup(null);
  }, []);

  // Session counts per caller
  const sessionCounts = useMemo(() => {
    const counts: Record<string, { total: number; pending: number }> = {};
    for (const c of callers) {
      counts[c.id] = { total: 0, pending: 0 };
    }
    for (const s of sessions) {
      if (!counts[s.callerId]) counts[s.callerId] = { total: 0, pending: 0 };
      counts[s.callerId].total++;
      if (s.status === "pending") counts[s.callerId].pending++;
    }
    return counts;
  }, [callers, sessions]);

  if (callers.length === 0) {
    return (
      <div className="settings-section" style={{ padding: "24px 0", textAlign: "center" }}>
        <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
          {t("callerManager.empty")}
        </span>
      </div>
    );
  }

  return (
    <div className="cm-two-col">
      {/* Left column: Settings */}
      <div className="cm-col-settings">
        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-label">{t("callerManager.maxSessionsPerCaller")}</span>
              <span className="settings-sublabel">{t("callerManager.maxSessionsHint")}</span>
            </div>
            <input
              type="number"
              min={0}
              max={9999}
              value={maxSessionsPerCaller}
              onChange={(e) => setMaxSessionsPerCaller(Math.max(0, parseInt(e.target.value) || 0))}
              className="cm-number-input"
            />
          </div>
          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-label">{t("callerManager.autoHideInactive")}</span>
              <span className="settings-sublabel">{t("callerManager.autoHideInactiveHint")}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="number"
                min={0}
                max={9999}
                value={autoHideInactiveHours}
                onChange={(e) => setAutoHideInactiveHours(Math.max(0, parseInt(e.target.value) || 0))}
                className="cm-number-input"
              />
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{t("callerManager.hours")}</span>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-label">{t("callerManager.autoRemoveEmpty")}</span>
              <span className="settings-sublabel">{t("callerManager.autoRemoveEmptyHint")}</span>
            </div>
            <button
              className={`settings-toggle${autoRemoveEmptyCallers ? " settings-toggle-on" : ""}`}
              onClick={() => setAutoRemoveEmptyCallers(!autoRemoveEmptyCallers)}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-label">{t("callerManager.cleanEmpty")}</span>
            </div>
            <button className="settings-btn-option" style={{ fontSize: 10, padding: "2px 8px" }} onClick={handleCleanEmpty}>
              {t("callerManager.cleanEmptyBtn")}
            </button>
          </div>
          {cleanMessage && <span style={{ fontSize: 10, color: "var(--color-text-secondary)", padding: "2px 0" }}>{cleanMessage}</span>}
        </div>
      </div>

      {/* Right column: Caller list */}
      <div className="cm-col-list">
      {/* Merge bar */}
      {mergeSource && !mergeConfirm && (
        <div className="cm-merge-bar">
          <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
            {t("callerManager.mergeSelectTarget")}
          </span>
          <button className="settings-btn-option" onClick={() => { setMergeSource(null); setMergeTarget(null); setMergeConfirm(false); }}>
            {t("callerManager.cancel")}
          </button>
        </div>
      )}

      {/* Merge confirm dialog */}
      {mergeConfirm && mergeSource && mergeTarget && (
        <div className="cm-merge-confirm">
          <span style={{ fontSize: 11 }}>
            {t("callerManager.mergeConfirmText", {
              source: callers.find((c) => c.id === mergeSource)?.alias || mergeSource,
              target: callers.find((c) => c.id === mergeTarget)?.alias || mergeTarget,
            })}
          </span>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button className="settings-btn-option danger active" style={{ border: "1px solid var(--color-border)", borderRadius: 4 }} onClick={handleMerge}>
              {t("callerManager.mergeConfirm")}
            </button>
            <button className="settings-btn-option" style={{ border: "1px solid var(--color-border)", borderRadius: 4 }} onClick={() => { setMergeSource(null); setMergeTarget(null); setMergeConfirm(false); }}>
              {t("callerManager.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Remove caller confirm dialog */}
      {removeConfirmId && (() => {
        const caller = callers.find((c) => c.id === removeConfirmId);
        const count = sessionCounts[removeConfirmId]?.total || 0;
        return (
          <div className="cm-merge-confirm">
            <span style={{ fontSize: 11 }}>
              {t("callerManager.removeConfirmText", {
                name: caller?.alias || caller?.name || removeConfirmId,
                count,
              })}
            </span>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button className="settings-btn-option danger active" style={{ border: "1px solid var(--color-border)", borderRadius: 4 }} onClick={handleRemoveCaller}>
                {t("callerManager.removeConfirm")}
              </button>
              <button className="settings-btn-option" style={{ border: "1px solid var(--color-border)", borderRadius: 4 }} onClick={() => setRemoveConfirmId(null)}>
                {t("callerManager.cancel")}
              </button>
            </div>
          </div>
        );
      })()}

      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.name);
        const groupCallerCount = group.callerIds.length;
        const groupSessionCount = group.callerIds.reduce((acc, id) => acc + (sessionCounts[id]?.total || 0), 0);
        const isDropTarget = dropTargetGroup === group.name;

        return (
          <div
            key={group.name}
            className={`cm-group${isDropTarget ? " cm-group-drop-target" : ""}`}
            onDragOver={(e) => handleDragOver(e, group.name)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, group.name)}
          >
            {/* Group header row */}
            <button className="cm-group-header" onClick={() => toggleCollapse(group.name)}>
              {isCollapsed ? (
                <Icon name="folder" size={12} style={{ flexShrink: 0 }} />
              ) : (
                <Icon name="folder-open" size={12} style={{ flexShrink: 0 }} />
              )}
              <span className="cm-group-name">{group.name}</span>
              <span className="cm-group-count">
                <Icon name="robot" size={9} strokeWidth={2.5} />
                {groupCallerCount}
              </span>
              <span className="cm-group-count">
                <Icon name="message" size={9} strokeWidth={2.5} />
                {groupSessionCount}
              </span>
            </button>

            {/* Caller rows */}
            {!isCollapsed && group.callerIds.map((cid) => {
              const caller = callers.find((c) => c.id === cid);
              if (!caller) return null;
              const counts = sessionCounts[cid] || { total: 0, pending: 0 };
              const isHidden = hiddenCallerIds.includes(cid);
              const isMergeSource = mergeSource === cid;
              const isMergeSelectable = mergeSource && mergeSource !== cid && !mergeConfirm;
              const isDragging = dragCallerId === cid;

              return (
                <div
                  key={cid}
                  className={`cm-row${isMergeSource ? " cm-row-merge-source" : ""}${isDragging ? " cm-row-dragging" : ""}${isHidden ? " cm-row-hidden" : ""}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, cid)}
                  onDragEnd={handleDragEnd}
                  onClick={() => {
                    if (isMergeSelectable) {
                      setMergeTarget(cid);
                      setMergeConfirm(true);
                    }
                  }}
                  style={isMergeSelectable ? { cursor: "pointer", background: "rgba(59, 130, 246, 0.06)" } : undefined}
                >
                  {/* Hide/Show toggle — leftmost */}
                  <div className="cm-col-visibility">
                    <button className="cm-action-btn" title={t(isHidden ? "callerManager.show" : "callerManager.hide")} onClick={(e) => { e.stopPropagation(); toggleCallerHidden(cid); }}>
                      {isHidden ? (
                        <Icon name="eye-off" size={11} />
                      ) : (
                        <Icon name="eye" size={11} />
                      )}
                    </button>
                  </div>

                  {/* Avatar */}
                  <div className="cm-col-avatar">
                    <IdenticonAvatar alias={caller.alias || caller.id} color={caller.color} size={20} />
                  </div>

                  {/* Alias + Sessions + Client stacked */}
                  <div className="cm-col-info">
                    <div className="cm-row-alias-line">
                      <span className="cm-row-alias" style={{ color: caller.color }}>
                        {caller.alias
                          ? friendlyName(caller.alias)
                          : "—"}
                      </span>
                      {caller.alias && <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>({caller.alias})</span>}
                      {counts.pending > 0 && <span className="cm-badge-pending" style={{ background: caller.color }}>
                        <Icon name="message" size={9} strokeWidth={2.5} />
                        {counts.pending}
                      </span>}
                      <span className="cm-badge-total">
                        <Icon name="message" size={9} strokeWidth={2.5} />
                        {counts.total}
                      </span>
                    </div>
                    <span className="cm-row-client">{caller.clientName || "—"}</span>
                  </div>

                  {/* Actions (rename, merge) */}
                  <div className="cm-col-actions">
                    {renamingId === cid ? (
                      <input
                        ref={renameInputRef}
                        className="cm-rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onBlur={commitRename}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="cm-row-actions">
                        <button className="cm-action-btn" title={t("callerManager.rename")} onClick={(e) => { e.stopPropagation(); startRename(cid); }}>
                          <Icon name="edit" size={11} />
                        </button>
                        <button className="cm-action-btn" title={t("callerManager.merge")} onClick={(e) => { e.stopPropagation(); setMergeSource(cid); setMergeTarget(null); setMergeConfirm(false); }}>
                          <Icon name="merge" size={11} />
                        </button>
                        <button className="cm-action-btn" title={t("callerManager.remove")} onClick={(e) => { e.stopPropagation(); setRemoveConfirmId(cid); }}>
                          <Icon name="trash-full" size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      </div>
    </div>
  );
}
