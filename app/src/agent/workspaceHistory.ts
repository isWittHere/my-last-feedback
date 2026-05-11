import type { AgentSession } from "./types";
import { normalizeWorkspacePath, workspacePathKey } from "../workspace/workspacePaths";

export interface AgentWorkspaceHistoryItem {
  path: string;
  updatedAt: string;
}

interface ProviderWorkspaceHistoryItem {
  cwd?: string | null;
  updatedAt?: string | null;
}

interface ProviderWorkspaceHistoryList {
  sessions: ProviderWorkspaceHistoryItem[];
}

function normalizeTimestamp(value?: string | null): string {
  if (!value) return "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function latestTimestamp(current: string, candidate?: string | null): string {
  const normalized = normalizeTimestamp(candidate);
  if (!normalized) return current;
  if (!current) return normalized;
  return Date.parse(normalized) > Date.parse(current) ? normalized : current;
}

export function getAgentSessionWorkspaceActivityAt(session: AgentSession): string {
  let activityAt = "";
  for (const message of session.messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    activityAt = latestTimestamp(activityAt, message.createdAt);
    activityAt = latestTimestamp(activityAt, message.updatedAt);
    for (const block of message.blocks) {
      activityAt = latestTimestamp(activityAt, block.createdAt);
      activityAt = latestTimestamp(activityAt, block.updatedAt);
    }
  }
  return activityAt;
}

export function collectRecentAgentWorkspaces(
  sessions: AgentSession[],
  providerSessionLists: ProviderWorkspaceHistoryList[],
  limit?: number,
): AgentWorkspaceHistoryItem[] {
  const byWorkspaceKey = new Map<string, AgentWorkspaceHistoryItem>();
  const add = (path: string | null | undefined, updatedAt: string | null | undefined) => {
    const cleanPath = normalizeWorkspacePath(path);
    const key = workspacePathKey(cleanPath);
    const cleanUpdatedAt = normalizeTimestamp(updatedAt);
    if (!cleanPath || !key || !cleanUpdatedAt) return;
    const existing = byWorkspaceKey.get(key);
    if (!existing || Date.parse(cleanUpdatedAt) > Date.parse(existing.updatedAt)) {
      byWorkspaceKey.set(key, { path: cleanPath, updatedAt: cleanUpdatedAt });
    }
  };

  for (const session of sessions) {
    add(session.cwd, getAgentSessionWorkspaceActivityAt(session));
  }
  for (const list of providerSessionLists) {
    for (const session of list.sessions) {
      add(session.cwd, session.updatedAt);
    }
  }

  const workspaces = [...byWorkspaceKey.values()]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return typeof limit === "number" ? workspaces.slice(0, limit) : workspaces;
}