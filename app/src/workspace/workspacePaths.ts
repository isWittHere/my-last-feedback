export function cleanDisplayPath(value: string): string {
  return value.trim().replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
}

function normalizeDriveLetter(value: string): string {
  return value.replace(/^([A-Za-z]):(?=\/|$)/, (_, drive: string) => `${drive.toUpperCase()}:`);
}

function trimTrailingWorkspaceSlashes(value: string): string {
  const trimmed = value.replace(/\/+$/g, "");
  if (/^[A-Za-z]:$/.test(trimmed) && value.startsWith(`${trimmed}/`)) return `${trimmed}/`;
  if (!trimmed && value.startsWith("/")) return "/";
  return trimmed;
}

export function normalizeWorkspacePath(value?: string | null): string | null {
  if (!value) return null;
  const normalized = normalizeDriveLetter(trimTrailingWorkspaceSlashes(cleanDisplayPath(value).replace(/\\/g, "/")));
  return normalized || null;
}

export function normalizeWorkspaceKey(value?: string | null): string {
  return normalizeWorkspacePath(value)?.toLowerCase() || "";
}

export function workspacePathKey(value?: string | null): string {
  return normalizeWorkspaceKey(value);
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
  return normalizeDriveLetter(decodeWorkspaceHref(value).replace(/^file:\/\/\/?/i, "").replace(/\\/g, "/"));
}

export function isAbsoluteWorkspacePath(value: string): boolean {
  return /^[A-Za-z]:\//.test(value) || value.startsWith("/") || value.startsWith("//");
}

export function joinWorkspacePath(base: string, relativePath: string): string {
  const normalizedBase = normalizeWorkspacePath(base) || "";
  const normalizedRelative = normalizeResourcePath(relativePath).replace(/^\/+/, "");
  return normalizedBase ? `${normalizedBase}/${normalizedRelative}` : normalizedRelative;
}
