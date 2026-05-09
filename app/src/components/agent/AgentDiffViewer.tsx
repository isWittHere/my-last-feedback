import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { getAgentDiffColorPreset, useAgentConsoleSettings } from "../../agentConsoleSettings";
import type { AgentPermissionBlock, AgentSessionFileDiff } from "../../agent/types";

export interface AgentUiDiffFile {
  path: string;
  patch: string;
  additions: number;
  deletions: number;
  status?: "added" | "deleted" | "modified" | "create" | "edit" | "delete" | "unknown";
}

type DiffPatchSegment = "add" | "delete" | "empty";

function buildDiffPatchSegments(additions: number, deletions: number, slots: number): DiffPatchSegment[] {
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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function parseJsonRecord(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try { return asRecord(JSON.parse(value)); } catch { return {}; }
}

function firstString(record: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const value = record[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

function countPatchLines(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}

function permissionFileStatus(type: unknown): AgentUiDiffFile["status"] {
  if (type === "add") return "create";
  if (type === "delete") return "delete";
  if (type === "update" || type === "move") return "edit";
  return "unknown";
}

function diffFileFromRecord(value: unknown): AgentUiDiffFile | null {
  const record = asRecord(value);
  const path = firstString(record, ["relativePath", "filePath", "filepath", "path", "file"]);
  const patch = firstString(record, ["patch", "diff"]);
  if (!path || !patch) return null;
  const counts = countPatchLines(patch);
  return {
    path,
    patch,
    additions: typeof record.additions === "number" ? record.additions : counts.additions,
    deletions: typeof record.deletions === "number" ? record.deletions : counts.deletions,
    status: permissionFileStatus(record.type || record.status || record.changeType),
  };
}

function diffFilesFromArray(value: unknown): AgentUiDiffFile[] {
  return Array.isArray(value) ? value.map(diffFileFromRecord).filter((file): file is AgentUiDiffFile => Boolean(file)) : [];
}

function patchFromTextChange(path: string, oldText: string, newText: string): string {
  const oldLines = oldText ? oldText.split(/\r?\n/) : [];
  const newLines = newText ? newText.split(/\r?\n/) : [];
  return [
    `Index: ${path}`,
    "===================================================================",
    `--- ${path}`,
    `+++ ${path}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join("\n");
}

export function sessionDiffFilesToUiFiles(files: AgentSessionFileDiff[] | undefined): AgentUiDiffFile[] {
  return (files || []).map((file) => ({
    path: file.file,
    patch: file.patch,
    additions: file.additions,
    deletions: file.deletions,
    status: file.status,
  })).filter((file) => file.path && file.patch);
}

export function permissionBlockToDiffFiles(block: AgentPermissionBlock | undefined): AgentUiDiffFile[] {
  const metadata = block?.metadata;
  if (!metadata) return [];
  const rawFiles = Array.isArray(metadata.files) ? metadata.files : [];
  const files = rawFiles.map((item) => {
    const record = asRecord(item);
    const patch = typeof record.patch === "string" ? record.patch : "";
    const counts = countPatchLines(patch);
    return {
      path: typeof record.relativePath === "string" ? record.relativePath : typeof record.filePath === "string" ? record.filePath : "",
      patch,
      additions: typeof record.additions === "number" ? record.additions : counts.additions,
      deletions: typeof record.deletions === "number" ? record.deletions : counts.deletions,
      status: permissionFileStatus(record.type),
    };
  }).filter((file) => file.path && file.patch);
  if (files.length > 0) return files;

  const patch = typeof metadata.diff === "string" ? metadata.diff : "";
  if (!patch) return [];
  const counts = countPatchLines(patch);
  const path = typeof metadata.filepath === "string" ? metadata.filepath : block?.patterns?.[0] || "diff";
  return [{ path, patch, additions: counts.additions, deletions: counts.deletions, status: "edit" }];
}

export function toolCallToDiffFiles(args: Record<string, unknown> | undefined, result: string | undefined, metadata: Record<string, unknown> | undefined): AgentUiDiffFile[] {
  const argsRecord = asRecord(args);
  const metadataRecord = asRecord(metadata);
  const resultRecord = parseJsonRecord(result);
  const arrayFiles = [
    ...diffFilesFromArray(metadataRecord.files),
    ...(diffFileFromRecord(metadataRecord.filediff) ? [diffFileFromRecord(metadataRecord.filediff) as AgentUiDiffFile] : []),
    ...diffFilesFromArray(argsRecord.files),
    ...diffFilesFromArray(argsRecord.edits),
    ...diffFilesFromArray(resultRecord.files),
    ...diffFilesFromArray(resultRecord.edits),
  ];
  if (arrayFiles.length > 0) return arrayFiles;

  const path = firstString(argsRecord, ["relativePath", "filePath", "filepath", "path", "file"])
    || firstString(metadataRecord, ["relativePath", "filePath", "filepath", "path", "file"])
    || firstString(resultRecord, ["relativePath", "filePath", "filepath", "path", "file"]);
  const patch = firstString(metadataRecord, ["patch", "diff"]) || firstString(argsRecord, ["patch", "diff"]) || firstString(resultRecord, ["patch", "diff"]);
  if (path && patch) {
    const counts = countPatchLines(patch);
    return [{ path, patch, additions: counts.additions, deletions: counts.deletions, status: "edit" }];
  }

  const oldText = firstString(argsRecord, ["oldString", "old_string", "oldText", "old_text"]);
  const newText = firstString(argsRecord, ["newString", "new_string", "newText", "new_text", "content"]);
  if (path && !oldText && newText && metadataRecord.exists === true) return [];
  if (path && (oldText || newText)) {
    const syntheticPatch = patchFromTextChange(path, oldText, newText);
    const counts = countPatchLines(syntheticPatch);
    return [{ path, patch: syntheticPatch, additions: counts.additions, deletions: counts.deletions, status: oldText ? "edit" : "create" }];
  }

  return [];
}

function DiffLine({ line, index }: { line: string; index: number }) {
  const kind = line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")
    ? "meta"
    : line.startsWith("+")
      ? "add"
      : line.startsWith("-")
        ? "delete"
        : "context";
  return <div className={`agent-diff-code-line agent-diff-code-line-${kind}`}><span className="agent-diff-line-number">{index + 1}</span><span className="agent-diff-line-text">{line || " "}</span></div>;
}

export function AgentDiffPatchList({ files, emptyLabel, defaultCollapsed = false }: { files: AgentUiDiffFile[]; emptyLabel?: string; defaultCollapsed?: boolean }) {
  const { t } = useTranslation();
  const { diffVisual } = useAgentConsoleSettings();
  const colorPreset = getAgentDiffColorPreset(diffVisual.colorPresetId);
  const diffVisualStyle = {
    "--agent-diff-add-color": colorPreset.additions,
    "--agent-diff-delete-color": colorPreset.deletions,
  } as CSSProperties;
  if (files.length === 0) return <div className="agent-diff-patch-empty">{emptyLabel || t("agentConsole.noDiffFiles", "No changed files")}</div>;
  return (
    <div className="agent-diff-patch-list" style={diffVisualStyle}>
      {files.map((file) => (
        <details key={`${file.path}-${file.patch.length}`} className="agent-diff-patch-file" open={!defaultCollapsed && files.length === 1}>
          <summary className="agent-diff-patch-summary">
            <span className="agent-diff-patch-path">{file.path}</span>
            <span className="agent-diff-patch-meter" aria-hidden="true">
              {buildDiffPatchSegments(file.additions, file.deletions, 12).map((segment, index) => <span key={`${file.path}-${segment}-${index}`} className={`agent-diff-patch-square agent-diff-patch-square-${segment}`} />)}
            </span>
            <span className="agent-diff-patch-stats"><span className="agent-diff-summary-add">+{file.additions}</span><span className="agent-diff-summary-delete">-{file.deletions}</span></span>
          </summary>
          <div className="agent-diff-code-block">
            {file.patch.split(/\r?\n/).map((line, index) => <DiffLine key={`${index}-${line}`} line={line} index={index} />)}
          </div>
        </details>
      ))}
    </div>
  );
}
