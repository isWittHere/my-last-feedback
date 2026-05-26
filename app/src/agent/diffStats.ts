import type { AgentContentBlock, AgentSession } from "./types";

export type AgentDiffFileChangeType = "create" | "edit" | "delete" | "unknown";

export interface AgentDiffFileStat {
  path: string;
  changeType: AgentDiffFileChangeType;
  additions: number;
  deletions: number;
}

export interface AgentDiffStatsSummary {
  changedFiles: number;
  fileChangeBlocks: number;
  createdFiles: number;
  editedFiles: number;
  deletedFiles: number;
  additions: number;
  deletions: number;
  diffArtifacts: number;
  estimated: boolean;
  files: AgentDiffFileStat[];
}

function ensureFileStat(files: Map<string, AgentDiffFileStat>, path: string): AgentDiffFileStat {
  const existing = files.get(path);
  if (existing) return existing;
  const created = { path, changeType: "unknown" as const, additions: 0, deletions: 0 };
  files.set(path, created);
  return created;
}

function parseDiffFilePath(line: string): string | null {
  const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
  if (!match) return null;
  return match[2];
}

function mergeChangeType(previous: AgentDiffFileChangeType, next: AgentDiffFileChangeType): AgentDiffFileChangeType {
  if (previous === "unknown") return next;
  if (next === "unknown" || previous === next) return previous;
  return "edit";
}

function changeTypeFromStatus(status: "added" | "deleted" | "modified" | undefined): AgentDiffFileChangeType {
  if (status === "added") return "create";
  if (status === "deleted") return "delete";
  if (status === "modified") return "edit";
  return "unknown";
}

function countDiffLines(content: string, files: Map<string, AgentDiffFileStat>): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  let currentFile: AgentDiffFileStat | null = null;
  for (const line of content.split(/\r?\n/)) {
    const diffPath = parseDiffFilePath(line);
    if (diffPath) {
      currentFile = ensureFileStat(files, diffPath);
      continue;
    }
    if (line.startsWith("new file mode")) {
      if (currentFile) currentFile.changeType = mergeChangeType(currentFile.changeType, "create");
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      if (currentFile) currentFile.changeType = mergeChangeType(currentFile.changeType, "delete");
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      additions += 1;
      if (currentFile) currentFile.additions += 1;
    } else if (line.startsWith("-")) {
      deletions += 1;
      if (currentFile) currentFile.deletions += 1;
    }
  }
  return { additions, deletions };
}

function visitBlock(block: AgentContentBlock, files: Map<string, AgentDiffFileStat>, summary: AgentDiffStatsSummary) {
  if (block.type === "file_change") {
    const file = ensureFileStat(files, block.path);
    file.changeType = mergeChangeType(file.changeType, block.changeType);
    summary.fileChangeBlocks += 1;
    if (block.changeType === "create") summary.createdFiles += 1;
    else if (block.changeType === "delete") summary.deletedFiles += 1;
    else summary.editedFiles += 1;
    return;
  }

  if (block.type === "artifact" && block.kind === "diff") {
    const counts = countDiffLines(block.content, files);
    summary.additions += counts.additions;
    summary.deletions += counts.deletions;
    summary.diffArtifacts += 1;
  }
}

export function getAgentDiffStatsSummary(session: AgentSession): AgentDiffStatsSummary {
  const files = new Map<string, AgentDiffFileStat>();
  const summary: AgentDiffStatsSummary = {
    changedFiles: 0,
    fileChangeBlocks: 0,
    createdFiles: 0,
    editedFiles: 0,
    deletedFiles: 0,
    additions: 0,
    deletions: 0,
    diffArtifacts: 0,
    estimated: false,
    files: [],
  };

  if (session.sessionDiffs && session.sessionDiffs.length > 0) {
    for (const diff of session.sessionDiffs) {
      const file = ensureFileStat(files, diff.file);
      file.additions = diff.additions;
      file.deletions = diff.deletions;
      file.changeType = changeTypeFromStatus(diff.status);
      summary.additions += diff.additions;
      summary.deletions += diff.deletions;
    }
    summary.files = Array.from(files.values()).sort((left, right) => {
      const leftTotal = left.additions + left.deletions;
      const rightTotal = right.additions + right.deletions;
      return rightTotal - leftTotal || left.path.localeCompare(right.path);
    });
    summary.changedFiles = summary.files.length;
    summary.estimated = false;
    return summary;
  }

  for (const message of session.messages) {
    for (const block of message.blocks) visitBlock(block, files, summary);
  }

  summary.files = Array.from(files.values()).sort((left, right) => {
    const leftTotal = left.additions + left.deletions;
    const rightTotal = right.additions + right.deletions;
    return rightTotal - leftTotal || left.path.localeCompare(right.path);
  });
  summary.changedFiles = summary.files.length;
  summary.estimated = summary.diffArtifacts === 0 && summary.fileChangeBlocks > 0;
  return summary;
}

export function formatDiffStatCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}
