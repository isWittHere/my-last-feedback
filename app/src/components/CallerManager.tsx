import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../store/feedbackStore";
import { useShallow } from "zustand/react/shallow";
import { IdenticonAvatar } from "./IdenticonAvatar";

interface WorkspaceGroup {
  name: string;
  callerIds: string[];
}

export function CallerManager() {
  const { t } = useTranslation();
  const { callers, sessions, renameCaller, mergeCallers, hiddenCallerIds, toggleCallerHidden } = useFeedbackStore(
    useShallow((s) => ({
      callers: s.callers,
      sessions: s.sessions,
      renameCaller: s.renameCaller,
      mergeCallers: s.mergeCallers,
      hiddenCallerIds: s.hiddenCallerIds,
      toggleCallerHidden: s.toggleCallerHidden,
    }))
  );

  // Group callers by workspace name
  const groups: WorkspaceGroup[] = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of callers) {
      const ids = map.get(c.name) || [];
      ids.push(c.id);
      map.set(c.name, ids);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, callerIds]) => ({ name, callerIds }));
  }, [callers]);

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
    <div className="settings-section" style={{ gap: 0 }}>
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

      {/* Groups */}
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
              <svg
                width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}
              >
                <path d="M1.5 2l2.5 3.5L6.5 2z" />
              </svg>
              <span className="cm-group-name">{group.name}</span>
              <span className="cm-group-count">{groupCallerCount}</span>
              <span className="cm-group-count">{groupSessionCount}</span>
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
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Avatar */}
                  <div className="cm-col-avatar">
                    <IdenticonAvatar alias={caller.alias || caller.id} color={caller.color} size={20} />
                  </div>

                  {/* Alias + Client stacked */}
                  <div className="cm-col-info">
                    <span className="cm-row-alias" style={{ color: caller.color }}>{caller.alias || "—"}</span>
                    <span className="cm-row-client">{caller.clientName || "—"}</span>
                  </div>

                  {/* Sessions */}
                  <div className="cm-col-sessions">
                    {counts.pending > 0 && <span className="cm-badge-pending">{counts.pending}</span>}
                    <span className="cm-badge-total">{counts.total}</span>
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
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button className="cm-action-btn" title={t("callerManager.merge")} onClick={(e) => { e.stopPropagation(); setMergeSource(cid); setMergeTarget(null); setMergeConfirm(false); }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M6 21V9a9 9 0 0 0 9 9" />
                          </svg>
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
  );
}
