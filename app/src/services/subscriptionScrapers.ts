import { invoke } from "@tauri-apps/api/core";

interface ScrapedWindowUsage {
  usagePercent: number;
  resetInSec: number;
}

export interface NormalizedUsage {
  usagePercent: number;
  resetInSec: number;
  percentRemaining: number;
  resetTimeIso: string;
}

export interface OpenCodeGoResult {
  success: true;
  rolling?: NormalizedUsage;
  weekly?: NormalizedUsage;
  monthly?: NormalizedUsage;
}

export interface OpenCodeGoError {
  success: false;
  error: string;
}

export type OpenCodeGoResponse = OpenCodeGoResult | OpenCodeGoError;

const NUMBER_PATTERN = String.raw`(-?\d+(?:\.\d+)?)`;

const WINDOW_PATTERNS = [
  ["rolling", "rollingUsage"],
  ["weekly", "weeklyUsage"],
  ["monthly", "monthlyUsage"],
] as const;

function buildWindowPatterns(prefix: string) {
  const pctFirst = new RegExp(
    `${prefix}:\\$R\\[\\d+\\]=\\{[^}]*usagePercent:${NUMBER_PATTERN}[^}]*resetInSec:${NUMBER_PATTERN}[^}]*\\}`,
  );
  const resetFirst = new RegExp(
    `${prefix}:\\$R\\[\\d+\\]=\\{[^}]*resetInSec:${NUMBER_PATTERN}[^}]*usagePercent:${NUMBER_PATTERN}[^}]*\\}`,
  );
  return { pctFirst, resetFirst };
}

function parseWindowUsage(
  html: string,
  rePctFirst: RegExp,
  reResetFirst: RegExp,
): ScrapedWindowUsage | null {
  const pctMatch = rePctFirst.exec(html);
  if (pctMatch) {
    const usagePercent = Number(pctMatch[1]);
    const resetInSec = Number(pctMatch[2]);
    if (Number.isFinite(usagePercent) && Number.isFinite(resetInSec)) {
      return { usagePercent, resetInSec };
    }
  }
  const resetMatch = reResetFirst.exec(html);
  if (resetMatch) {
    const resetInSec = Number(resetMatch[1]);
    const usagePercent = Number(resetMatch[2]);
    if (Number.isFinite(usagePercent) && Number.isFinite(resetInSec)) {
      return { usagePercent, resetInSec };
    }
  }
  return null;
}

function normalizeWindowUsage(window: ScrapedWindowUsage, now: number): NormalizedUsage {
  const usagePercent = Math.max(0, window.usagePercent);
  const resetInSec = Math.max(0, window.resetInSec);
  return {
    usagePercent,
    resetInSec,
    percentRemaining: 100 - usagePercent,
    resetTimeIso: new Date(now + resetInSec * 1000).toISOString(),
  };
}

export async function fetchOpenCodeGoUsage(
  workspaceId: string,
  authCookie: string,
): Promise<OpenCodeGoResponse> {
  try {
    const url = `https://opencode.ai/workspace/${encodeURIComponent(workspaceId)}/go`;
    const html = await invoke<string>("fetch_dashboard_html", { request: { url, authCookie } });
    const now = Date.now();
    const result: Record<string, NormalizedUsage> = {};

    for (const [, prefix] of WINDOW_PATTERNS) {
      const { pctFirst, resetFirst } = buildWindowPatterns(prefix);
      const parsed = parseWindowUsage(html, pctFirst, resetFirst);
      if (parsed) {
        result[prefix.replace("Usage", "").toLowerCase()] = normalizeWindowUsage(parsed, now);
      }
    }

    if (Object.keys(result).length === 0) {
      return { success: false, error: "Could not parse any usage data from the dashboard page." };
    }

    return { success: true, ...result } as OpenCodeGoResult;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
