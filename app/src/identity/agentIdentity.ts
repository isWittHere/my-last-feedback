import { getFriendlyName } from "./friendlyName";

export type AgentIdentityLanguage = "en" | "zh";
export type AgentIdentitySource = "mlfb" | "opencode" | "mlra" | "unknown";

export interface AgentGlyphIdentityInput {
  agentName?: string | null;
  id?: string | null;
  fallbackId?: string | null;
}

export interface AgentGlyphIdentity {
  agentName: string;
  nickname: string;
  avatarSeed: string;
}

export function agentIdentityLanguage(language?: string | null): AgentIdentityLanguage {
  return language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function agentSourceLabel(source?: AgentIdentitySource | null): string {
  if (source === "opencode") return "Opencode";
  if (source === "mlra") return "MLRA";
  if (source === "unknown") return "Agent";
  return "MLFB";
}

export function formatAgentTargetLabel(args: { source?: AgentIdentitySource | null; targetName?: string | null }): string {
  const sourceLabel = agentSourceLabel(args.source);
  const targetName = args.targetName?.trim() || "";
  return targetName ? `${sourceLabel} ${targetName}` : sourceLabel;
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function deriveAgentNameFromId(id?: string | null): string {
  const seed = id?.trim() || "agent";
  return hashString(seed).toString(16).padStart(8, "0").slice(0, 4).toUpperCase();
}

export function normalizeAgentName(agentName?: string | null): string {
  const cleanName = agentName?.trim().toUpperCase() || "";
  if (!cleanName) return "";
  return /^[A-Z0-9]{4}$/.test(cleanName) ? cleanName : deriveAgentNameFromId(cleanName);
}

export function resolveAgentName(input: AgentGlyphIdentityInput): string {
  return normalizeAgentName(input.agentName) || deriveAgentNameFromId(input.id || input.fallbackId || "agent");
}

export function resolveAgentGlyphIdentity(input: AgentGlyphIdentityInput, language: AgentIdentityLanguage = "en"): AgentGlyphIdentity {
  const agentName = resolveAgentName(input);
  return {
    agentName,
    nickname: getFriendlyName(agentName, language),
    avatarSeed: agentName,
  };
}

export function agentNickname(alias?: string | null, language: AgentIdentityLanguage = "en", fallbackName?: string | null): string {
  const cleanAlias = normalizeAgentName(alias);
  if (cleanAlias) return getFriendlyName(cleanAlias, language);
  return fallbackName?.trim() || "";
}
