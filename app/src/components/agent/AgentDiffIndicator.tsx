import { useMemo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { getAgentDiffColorPreset, useAgentConsoleSettings } from "../../agentConsoleSettings";
import { formatDiffStatCount, getAgentDiffStatsSummary } from "../../agent/diffStats";
import type { AgentSession } from "../../agent/types";
import { useAgentStore } from "../../store/agentStore";
import { AgentDiffPatchList, sessionDiffFilesToUiFiles } from "./AgentDiffViewer";

type DiffMiniSegment = "add" | "delete" | "empty";

function buildDiffSegments(additions: number, deletions: number, slots: number): DiffMiniSegment[] {
  const total = additions + deletions;
  if (total <= 0) return Array.from({ length: slots }, () => "empty");
  let addSlots = Math.round((additions / total) * slots);
  let deleteSlots = slots - addSlots;
  if (additions > 0 && addSlots === 0) {
    addSlots = 1;
    deleteSlots = slots - 1;
  }
  if (deletions > 0 && deleteSlots === 0) {
    deleteSlots = 1;
    addSlots = slots - 1;
  }
  return [
    ...Array.from({ length: addSlots }, () => "add" as const),
    ...Array.from({ length: deleteSlots }, () => "delete" as const),
  ];
}

export function AgentDiffIndicator({ session }: { session: AgentSession }) {
  const { t } = useTranslation();
  const { diffIndicatorMode, diffVisual } = useAgentConsoleSettings();
  const refreshAgentSessionDiff = useAgentStore((state) => state.refreshAgentSessionDiff);
  const summary = useMemo(() => getAgentDiffStatsSummary(session), [session]);
  const realDiffFiles = useMemo(() => sessionDiffFilesToUiFiles(session.sessionDiffs), [session.sessionDiffs]);
  const colorPreset = getAgentDiffColorPreset(diffVisual.colorPresetId);
  const diffVisualStyle = {
    "--agent-diff-add-color": colorPreset.additions,
    "--agent-diff-delete-color": colorPreset.deletions,
    "--agent-diff-add-text-offset-x": `${diffVisual.additionsOffsetX}px`,
    "--agent-diff-add-text-offset-y": `${diffVisual.additionsOffsetY}px`,
    "--agent-diff-delete-text-offset-x": `${diffVisual.deletionsOffsetX}px`,
    "--agent-diff-delete-text-offset-y": `${diffVisual.deletionsOffsetY}px`,
  } as CSSProperties;
  const compactAdditions = summary.additions;
  const compactDeletions = summary.deletions;
  const compactLabel = `+${formatDiffStatCount(compactAdditions)} -${formatDiffStatCount(compactDeletions)}`;
  const miniSegments = buildDiffSegments(compactAdditions, compactDeletions, 12);
  const panelSegments = buildDiffSegments(compactAdditions, compactDeletions, 48);

  if (diffIndicatorMode === "hidden") return null;
  if (summary.changedFiles === 0 && summary.fileChangeBlocks === 0 && summary.additions === 0 && summary.deletions === 0 && !session.sessionDiffLoading && !session.sessionDiffError) return null;
  const refreshDiff = () => {
    if (!session.providerSessionId || session.sessionDiffLoading) return;
    void refreshAgentSessionDiff(session.id);
  };

  return (
    <div className="agent-diff-indicator-wrap" style={diffVisualStyle}>
      <button type="button" className={`agent-diff-indicator${diffIndicatorMode === "text" ? " agent-diff-indicator-text-only" : ""}`} onClick={refreshDiff} aria-label={`${t("agentConsole.diffStats", "Diff statistics")} ${compactLabel}`}>
        <span className="agent-diff-indicator-text" aria-hidden="true">
          <span className="agent-diff-indicator-add">+{formatDiffStatCount(compactAdditions)}</span>
          <span className="agent-diff-indicator-delete">-{formatDiffStatCount(compactDeletions)}</span>
        </span>
        {diffIndicatorMode === "textAndGraphic" && (
          <span className="agent-diff-indicator-mini" aria-hidden="true">
            {miniSegments.map((segment, index) => <span key={`${segment}-${index}`} className={`agent-diff-mini-square agent-diff-mini-square-${segment}`} />)}
          </span>
        )}
      </button>
      <div className="agent-diff-popover" data-preview-overlay>
        <div className="agent-diff-popover-head">
          <span>{t("agentConsole.diffSpace", "Diff activity")}</span>
          <div className="agent-diff-popover-summary">
            {session.sessionDiffLoading && <span>{t("agentConsole.diffLoading", "Loading")}</span>}
            <span>{t("agentConsole.changedFilesShort", "Files")} <strong>{summary.changedFiles}</strong></span>
            <span>{t("agentConsole.fileChangesShort", "Changes")} <strong>{summary.fileChangeBlocks}</strong></span>
            <span className="agent-diff-summary-add">+{summary.additions}</span>
            <span className="agent-diff-summary-delete">-{summary.deletions}</span>
          </div>
        </div>
        {session.sessionDiffError && <div className="agent-diff-panel-error">{session.sessionDiffError}</div>}
        <div className="agent-diff-panel-squares" aria-label={t("agentConsole.diffHeatmap", "Diff blocks")}>
          {panelSegments.map((segment, index) => <span key={`${segment}-${index}`} className={`agent-diff-panel-square agent-diff-panel-square-${segment}`} />)}
        </div>
        <div className="agent-diff-file-list" aria-label={t("agentConsole.diffFiles", "Changed files")}>
          {summary.files.length > 0 ? summary.files.map((file) => {
            const fileSegments = buildDiffSegments(file.additions, file.deletions, 10);
            return (
              <div key={file.path} className="agent-diff-file-row">
                <div className="agent-diff-file-main">
                  <span className={`agent-diff-file-kind agent-diff-file-kind-${file.changeType}`}>{t(`agentConsole.fileChangeType.${file.changeType}`, file.changeType)}</span>
                  <span className="agent-diff-file-name">{file.path}</span>
                </div>
                <div className="agent-diff-file-meter" aria-hidden="true">
                  {fileSegments.map((segment, index) => <span key={`${file.path}-${segment}-${index}`} className={`agent-diff-file-square agent-diff-file-square-${segment}`} />)}
                </div>
                <div className="agent-diff-file-stats">
                  <span className="agent-diff-file-add">+{formatDiffStatCount(file.additions)}</span>
                  <span className="agent-diff-file-delete">-{formatDiffStatCount(file.deletions)}</span>
                </div>
              </div>
            );
          }) : <div className="agent-diff-file-empty">{t("agentConsole.noDiffFiles", "No changed files")}</div>}
        </div>
        {realDiffFiles.length > 0 && <AgentDiffPatchList files={realDiffFiles} />}
      </div>
    </div>
  );
}
