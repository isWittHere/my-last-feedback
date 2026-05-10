import { getFriendlyName } from "./friendlyName";

export type AgentIdentityLanguage = "en" | "zh";
export type AgentIdentitySource = "mlfb" | "opencode" | "mlra" | "unknown";

export interface AgentIdentityInput {
  alias?: string | null;
  fallbackName?: string | null;
  clientName?: string | null;
  source?: AgentIdentitySource;
  id?: string | null;
}

export interface AgentIdentity {
  alias: string;
  nickname: string;
  displayLabel: string;
  avatarSeed: string;
  clientName?: string;
  source: AgentIdentitySource;
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

export function agentNickname(alias?: string | null, language: AgentIdentityLanguage = "en", fallbackName?: string | null): string {
  const cleanAlias = alias?.trim();
  if (cleanAlias) return getFriendlyName(cleanAlias, language);
  return fallbackName?.trim() || "";
}

export function agentAvatarSeed(input: Pick<AgentIdentityInput, "alias" | "id" | "fallbackName" | "clientName">): string {
  return input.alias?.trim() || input.id?.trim() || input.fallbackName?.trim() || input.clientName?.trim() || "agent";
}

export function resolveAgentIdentity(input: AgentIdentityInput, language: AgentIdentityLanguage = "en"): AgentIdentity {
  const alias = input.alias?.trim() || "";
  const fallbackName = input.fallbackName?.trim() || "";
  const nickname = agentNickname(alias, language, fallbackName);
  const avatarSeed = agentAvatarSeed(input);
  return {
    alias,
    nickname,
    displayLabel: alias && nickname ? `${nickname} (${alias})` : nickname || alias || avatarSeed,
    avatarSeed,
    ...(input.clientName?.trim() ? { clientName: input.clientName.trim() } : {}),
    source: input.source || "unknown",
  };
}
