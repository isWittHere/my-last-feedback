import { workspaceBasename, workspacePathKey } from "../workspace/workspacePaths";

export interface WorkspaceColorCandidate {
  workspaceKey?: string | null;
  workspacePath?: string | null;
  color?: string | null;
  ownerAlias?: string | null;
}

export interface WorkspaceIdentityInput {
  workspacePath?: string | null;
  workspaceKey?: string | null;
  displayName?: string | null;
  color?: string | null;
  candidates?: WorkspaceColorCandidate[];
}

export interface WorkspaceIdentity {
  workspaceKey: string;
  workspacePath: string;
  displayName: string;
  color: string;
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function fallbackWorkspaceColor(workspaceKey: string): string {
  const hue = hashString(workspaceKey || "workspace") % 360;
  return `hsl(${hue} 42% 58%)`;
}

export function resolveWorkspaceIdentity(input: WorkspaceIdentityInput): WorkspaceIdentity {
  const workspacePath = input.workspacePath?.trim() || "";
  const workspaceKey = input.workspaceKey?.trim() || workspacePathKey(workspacePath);
  const matchingCandidate = input.candidates?.find((candidate) => {
    const candidateKey = candidate.workspaceKey?.trim() || workspacePathKey(candidate.workspacePath || "");
    return candidateKey && candidateKey === workspaceKey;
  });
  const color = input.color?.trim() || matchingCandidate?.color?.trim() || fallbackWorkspaceColor(workspaceKey);
  return {
    workspaceKey,
    workspacePath,
    displayName: input.displayName?.trim() || workspaceBasename(workspacePath) || workspacePath || workspaceKey,
    color,
  };
}
