import { useTranslation } from "react-i18next";
import type { AgentPermissionBlock, AgentSessionFileDiff } from "../../agent/types";

export interface AgentUiDiffFile {
  path: string;
  patch: string;
  additions: number;
  deletions: number;
  status?: "added" | "deleted" | "modified" | "create" | "edit" | "delete" | "unknown";
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
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

export function AgentDiffPatchList({ files, emptyLabel }: { files: AgentUiDiffFile[]; emptyLabel?: string }) {
  const { t } = useTranslation();
  if (files.length === 0) return <div className="agent-diff-patch-empty">{emptyLabel || t("agentConsole.noDiffFiles", "No changed files")}</div>;
  return (
    <div className="agent-diff-patch-list">
      {files.map((file) => (
        <details key={`${file.path}-${file.patch.length}`} className="agent-diff-patch-file" open={files.length === 1}>
          <summary className="agent-diff-patch-summary">
            <span className="agent-diff-patch-path">{file.path}</span>
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
