// mcp/common/caller-info.mjs
// Unified caller-identity extraction for MCP servers.
//
// Produces:
//   { sessionId, workspacePath, folderName, clientName, clientVersion, alias }
//
// Sources (by priority):
//   sessionId      = basename(process.env.VSCODE_TARGET_SESSION_LOG)      [may be null]
//   workspacePath  = provided argument → listRoots[0]                       [may be null]
//   folderName     = listRoots matching workspacePath → listRoots[0]        [may be null]
//                    → workspacePath basename → clientName
//   clientName     = server.getClientVersion().name → env.MLF_CALLER_NAME → "Unknown"
//   alias          = md5(sessionId).slice(0,4).toUpperCase()                (aligned with hook)
//                    → md5(folderName:clientName).slice(0,4).toUpperCase() fallback
//
// This aligns with `~/.copilot/hooks/scripts/inject-agent-name.mjs` which
// injects `agent_name = md5(session_id).slice(0,4).toUpperCase()` via
// PostToolUse additionalContext. When sessionId is present, the alias this
// helper produces is guaranteed to match the hook-injected agent_name.

import { basename } from "node:path";
import { createHash } from "node:crypto";

/**
 * @typedef {Object} CallerInfo
 * @property {string|null} sessionId       VS Code session id (log basename) or null.
 * @property {string|null} workspacePath   Normalized POSIX path or null.
 * @property {string} folderName           Workspace folder name or client fallback.
 * @property {string} clientName           MCP client name (e.g. "claude-code").
 * @property {string} clientVersion
 * @property {string} alias                4-char uppercase hex identifier.
 */

/**
 * Extract caller identity from VS Code env + MCP handshake + optional argument.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} mcpServer
 * @param {Object} [opts]
 * @param {string} [opts.workspaceHint]   Caller-provided workspace path (optional).
 * @param {string} [opts.fallbackClientEnvVar="MLF_CALLER_NAME"]
 * @returns {Promise<CallerInfo>}
 */
export async function resolveCallerInfo(mcpServer, opts = {}) {
  const fallbackClientEnvVar = opts.fallbackClientEnvVar ?? "MLF_CALLER_NAME";

  // ── 1. Client name/version from MCP handshake ──
  let clientName;
  let clientVersion;
  try {
    const info = mcpServer.server?.getClientVersion?.();
    if (info?.name) {
      clientName = info.name;
      clientVersion = info.version;
    }
  } catch {}
  clientName = clientName || process.env[fallbackClientEnvVar] || "Unknown Client";
  clientVersion = clientVersion || "0.0.0";

  // ── 2. Session ID from env ──
  const logPath = process.env.VSCODE_TARGET_SESSION_LOG;
  const sessionId = logPath ? basename(logPath) : null;

  // ── 3. Workspace path + folder name from listRoots ──
  const hintNorm = opts.workspaceHint
    ? normalizeWorkspacePath(opts.workspaceHint)
    : null;

  let workspacePath = hintNorm;
  let folderName = null;

  try {
    const result = await mcpServer.server?.listRoots?.();
    const roots = result?.roots ?? [];
    if (roots.length) {
      // Prefer a root matching the caller-provided hint.
      let matched = null;
      if (hintNorm) {
        for (const r of roots) {
          const p = rootUriToPath(r.uri);
          if (p && p.toLowerCase() === hintNorm.toLowerCase()) {
            matched = { root: r, path: p };
            break;
          }
        }
      }
      const chosen = matched ?? { root: roots[0], path: rootUriToPath(roots[0].uri) };
      workspacePath = workspacePath ?? chosen.path;
      folderName = chosen.root.name || (chosen.path ? basename(chosen.path) : null);
    }
  } catch {
    // listRoots not supported → fall through to hint-only path.
  }

  if (!folderName && workspacePath) {
    folderName = basename(workspacePath);
  }
  if (!folderName) {
    folderName = clientName;
  }

  // ── 4. Deterministic alias ──
  const alias = deriveAlias({ sessionId, folderName, clientName });

  return {
    sessionId,
    workspacePath,
    folderName,
    clientName,
    clientVersion,
    alias,
  };
}

/**
 * Derive the 4-char uppercase hex alias.
 * Matches the hook formula `md5(session_id).slice(0,4).toUpperCase()`
 * when sessionId is present; falls back to workspace+client hash otherwise.
 *
 * @param {Object} args
 * @param {string|null} [args.sessionId]
 * @param {string} args.folderName
 * @param {string} args.clientName
 * @returns {string}
 */
export function deriveAlias({ sessionId, folderName, clientName }) {
  const key = sessionId || `${folderName}:${clientName}`;
  return createHash("md5").update(key).digest("hex").slice(0, 4).toUpperCase();
}

function rootUriToPath(uri) {
  if (!uri) return null;
  try {
    const stripped = uri.replace(/^file:\/\/\//, "");
    return normalizeWorkspacePath(decodeURIComponent(stripped));
  } catch {
    return null;
  }
}

export function normalizeWorkspacePath(value) {
  if (!value) return null;
  const slashed = value
    .trim()
    .replace(/^\\\\\?\\UNC\\/i, "//")
    .replace(/^\\\\\?\\/i, "")
    .replace(/^\/\/\?\/UNC\//i, "//")
    .replace(/^\/\/\?\//i, "")
    .replace(/\\/g, "/");
  const withoutTrailing = slashed.replace(/\/+$/g, "");
  const trimmed = /^[A-Za-z]:$/.test(withoutTrailing) && slashed.startsWith(`${withoutTrailing}/`) ? `${withoutTrailing}/` : withoutTrailing;
  const normalized = trimmed
    .replace(/^([A-Za-z]):(?=\/|$)/, (_, drive) => `${drive.toUpperCase()}:`);
  return normalized || null;
}
