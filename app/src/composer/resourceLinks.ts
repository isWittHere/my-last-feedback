export type ResourceKind = "file" | "folder";

export interface ResourceLinkInfo {
  label: string;
  href: string;
  normalizedHref: string;
  kind: ResourceKind;
}

export function decodeResourceHref(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function normalizeResourcePath(value: string): string {
  return decodeResourceHref(value).replace(/^file:\/\/\/?/i, "").replace(/\\/g, "/");
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
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/") || normalized.startsWith("//") || !projectDirectory) {
    return normalized;
  }
  return `${projectDirectory.replace(/\\/g, "/").replace(/\/+$/g, "")}/${normalized.replace(/^\/+/, "")}`;
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