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

export interface ToiotoUsage {
  balance: number;
  status: string;
  concurrency: number;
  rpmLimit: number;
  totalRecharged: number;
  email: string;
}

export type ToiotoResponse =
  | { success: true; data: ToiotoUsage }
  | { success: false; error: string };

export interface ChannelModelInfo {
  model: string;
  status: string;
  latencyMs: number;
}

export interface ChannelMonitor {
  id: number;
  name: string;
  provider: string;
  groupName: string;
  primaryModel: string;
  primaryStatus: string;
  primaryLatencyMs: number;
  primaryPingLatencyMs: number;
  availability7d: number;
  extraModels: ChannelModelInfo[];
}

export interface ChannelMonitorsResult {
  success: true;
  items: ChannelMonitor[];
}

export type ChannelMonitorsResponse = ChannelMonitorsResult | { success: false; error: string };

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

export async function fetchToiotoUsage(jwt: string): Promise<ToiotoResponse> {
  try {
    const timezone = encodeURIComponent(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    const text = await invoke<string>("fetch_toioto_me", { request: { jwt, timezone } });
    const parsed = JSON.parse(text);
    if (parsed.code !== 0) {
      return { success: false, error: parsed.message || "API error" };
    }
    const d = parsed.data;
    return {
      success: true,
      data: {
        balance: d.balance ?? 0,
        status: d.status ?? "unknown",
        concurrency: d.concurrency ?? 0,
        rpmLimit: d.rpm_limit ?? 0,
        totalRecharged: d.total_recharged ?? 0,
        email: d.email ?? "",
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchChannelMonitors(jwt: string): Promise<ChannelMonitorsResponse> {
  try {
    const timezone = encodeURIComponent(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    const text = await invoke<string>("fetch_toioto_api", { request: { jwt, timezone, path: "channel-monitors" } });
    const parsed = JSON.parse(text);
    if (parsed.code !== 0) {
      return { success: false, error: parsed.message || "API error" };
    }
    const items: ChannelMonitor[] = (parsed.data?.items ?? []).map((item: Record<string, unknown>) => ({
      id: item.id as number,
      name: item.name as string,
      provider: item.provider as string,
      groupName: item.group_name as string,
      primaryModel: item.primary_model as string,
      primaryStatus: item.primary_status as string,
      primaryLatencyMs: item.primary_latency_ms as number,
      primaryPingLatencyMs: item.primary_ping_latency_ms as number,
      availability7d: item.availability_7d as number,
      extraModels: ((item.extra_models as Array<Record<string, unknown>>) ?? []).map((m) => ({
        model: m.model as string,
        status: m.status as string,
        latencyMs: m.latency_ms as number,
      })),
    }));
    return { success: true, items };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
