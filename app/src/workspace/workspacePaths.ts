export function cleanDisplayPath(value: string): string {
  return value.trim().replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
}

export function normalizeWorkspacePath(value?: string | null): string | null {
  if (!value) return null;
  const normalized = cleanDisplayPath(value).replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized || null;
}

export function workspacePathKey(value?: string | null): string {
  return normalizeWorkspacePath(value)?.toLowerCase() || "";
}

export function sameWorkspacePath(left?: string | null, right?: string | null): boolean {
  return workspacePathKey(left) === workspacePathKey(right);
}

export function workspaceBasename(value?: string | null): string {
  const normalized = normalizeWorkspacePath(value);
  if (!normalized) return value || "";
  return normalized.split("/").filter(Boolean).pop() || normalized;
}

export function decodeWorkspaceHref(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function normalizeResourcePath(value: string): string {
  return decodeWorkspaceHref(value).replace(/^file:\/\/\/?/i, "").replace(/\\/g, "/");
}

export function isAbsoluteWorkspacePath(value: string): boolean {
  return /^[A-Za-z]:\//.test(value) || value.startsWith("/") || value.startsWith("//");
}

export function joinWorkspacePath(base: string, relativePath: string): string {
  const normalizedBase = normalizeWorkspacePath(base) || "";
  const normalizedRelative = normalizeResourcePath(relativePath).replace(/^\/+/, "");
  return normalizedBase ? `${normalizedBase}/${normalizedRelative}` : normalizedRelative;
}
