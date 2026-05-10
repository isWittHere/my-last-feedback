import { formatAgentTargetLabel } from "../identity/agentIdentity";
import { normalizeWorkspacePath, workspaceBasename, workspacePathKey } from "./workspacePaths";

export type WorkspaceTargetSource = "mlfb" | "opencode";

export interface WorkspacePathCandidate<Source extends string = string> {
  path: string;
  label: string;
  source: Source;
  callerName?: string;
  lastUsedAt?: string | null;
}

export interface WorkspaceOption {
  path: string;
  name: string;
  ownerName?: string;
}

export function workspaceTargetSourceForComposerKind(kind?: string | null): WorkspaceTargetSource {
  return kind === "agent" ? "opencode" : "mlfb";
}

export function formatWorkspaceTargetLabel(args: { source: WorkspaceTargetSource; ownerName?: string | null }): string {
  const targetName = args.ownerName?.trim() || "";
  return formatAgentTargetLabel({ source: args.source, targetName });
}

export function pushWorkspacePathCandidate<Source extends string>(
  candidates: WorkspacePathCandidate<Source>[],
  seen: Set<string>,
  candidate: Omit<WorkspacePathCandidate<Source>, "path" | "label"> & { path?: string | null; label?: string | null },
) {
  const cleanPath = normalizeWorkspacePath(candidate.path);
  if (!cleanPath) return;
  const key = workspacePathKey(cleanPath);
  if (!key || seen.has(key)) return;
  seen.add(key);
  candidates.push({
    ...candidate,
    path: cleanPath,
    label: candidate.label || workspaceBasename(cleanPath) || cleanPath,
  });
}

export function buildWorkspaceOptions(args: {
  targetWorkspacePath?: string | null;
  targetOwnerName?: string | null;
  workspacePaths: Iterable<string>;
}): WorkspaceOption[] {
  const map = new Map<string, WorkspaceOption>();
  const addPath = (path?: string | null, name?: string | null, ownerName?: string | null) => {
    const cleanPath = normalizeWorkspacePath(path);
    if (!cleanPath) return;
    const key = workspacePathKey(cleanPath);
    if (!key || map.has(key)) return;
    map.set(key, {
      path: cleanPath,
      name: name || workspaceBasename(cleanPath) || cleanPath,
      ...(ownerName ? { ownerName } : {}),
    });
  };

  addPath(args.targetWorkspacePath, workspaceBasename(args.targetWorkspacePath), args.targetOwnerName);
  for (const path of args.workspacePaths) addPath(path, workspaceBasename(path));
  return Array.from(map.values());
}
