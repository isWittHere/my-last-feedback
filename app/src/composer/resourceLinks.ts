import { isAbsoluteWorkspacePath, joinWorkspacePath, normalizeResourcePath as normalizeWorkspaceResourcePath } from "../workspace/workspacePaths";

export type ResourceKind = "file" | "folder" | "commit";

export interface ResourceLinkInfo {
  label: string;
  href: string;
  normalizedHref: string;
  kind: ResourceKind;
}

export interface GitCommitLinkInfo {
  label: string;
  href: string;
  fullHash: string;
  message: string;
  isLatest: boolean;
}

export function gitCommitLinkInfo(label: string, href: string): GitCommitLinkInfo | null {
  if (!href.startsWith("git:")) return null;
  const rest = href.slice(4);
  const sep = rest.indexOf("|");
  const fullHash = sep >= 0 ? rest.slice(0, sep) : rest;
  try {
    const tail = sep >= 0 ? rest.slice(sep + 1) : "";
    const parts = tail ? tail.split("|") : [];
    const message = parts[0] ? decodeURIComponent(parts[0]) : "";
    const metaRaw = parts[1] || "";
    const meta = new URLSearchParams(metaRaw);
    const isLatest = meta.get("latest") === "1";
    return { label, href, fullHash, message, isLatest };
  } catch {
    return { label, href, fullHash, message: rest.slice(sep + 1), isLatest: false };
  }
}

export function decodeResourceHref(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function normalizeResourcePath(value: string): string {
  return normalizeWorkspaceResourcePath(value);
}

function hasNonFileScheme(value: string): boolean {
  if (/^[A-Za-z]:[\\/]/.test(value)) return false;
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) && !value.toLowerCase().startsWith("file:");
}

export function isLocalResourceHref(value: string, projectDirectory?: string): boolean {
  const normalized = normalizeResourcePath(value);
  if (!normalized || normalized.startsWith("#") || hasNonFileScheme(normalized)) return false;
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/") || normalized.startsWith("//")) return true;
  return Boolean(projectDirectory && !normalized.includes("://"));
}

export function resolveResourceHref(value: string, projectDirectory?: string): string {
  const normalized = normalizeResourcePath(value);
  if (isAbsoluteWorkspacePath(normalized) || !projectDirectory) {
    return normalized;
  }
  return joinWorkspacePath(projectDirectory, normalized);
}

export function resourceKind(label: string, href: string): ResourceKind {
  const normalized = normalizeResourcePath(href);
  return label.endsWith("/") || normalized.endsWith("/") ? "folder" : "file";
}

export function resourceLinkInfo(label: string, href: string, projectDirectory?: string): ResourceLinkInfo | null {
  if (!isLocalResourceHref(href, projectDirectory)) return null;
  return {
    label,
    href,
    normalizedHref: resolveResourceHref(href, projectDirectory),
    kind: resourceKind(label, href),
  };
}
