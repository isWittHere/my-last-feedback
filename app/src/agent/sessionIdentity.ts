import { getFriendlyName } from "../identity/friendlyName";
import type { AgentProviderId, AgentSession } from "./types";

export interface AgentSessionIdentity {
  providerName: string;
  name: string;
  code: string | null;
  color: string;
  ownerAlias?: string;
}

interface AgentSessionIdentityOptions {
  color?: string | null;
  ownerAlias?: string | null;
}

const AVATAR_COLORS = [
  "#0d9488",
  "#2563eb",
  "#7c3aed",
  "#c2410c",
  "#b45309",
  "#4d7c0f",
  "#be123c",
  "#0369a1",
  "#9333ea",
  "#15803d",
];

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function formatProviderName(value: string): string {
  if (value.toLowerCase() === "opencode") return "OpenCode";
  return value || "Agent";
}

function codeFromSeed(seed: string): string {
  return hashString(seed).toString(16).padStart(8, "0").slice(0, 4).toUpperCase();
}

function colorFromCode(code: string, options?: AgentSessionIdentityOptions): string {
  return options?.color?.trim() || AVATAR_COLORS[hashString(code) % AVATAR_COLORS.length];
}

function identityFromOwnerAlias(providerName: string, ownerAlias: string, language: "en" | "zh", options?: AgentSessionIdentityOptions): AgentSessionIdentity {
  return {
    providerName,
    name: getFriendlyName(ownerAlias, language),
    code: ownerAlias,
    color: colorFromCode(ownerAlias, options),
    ownerAlias,
  };
}

export function getAgentSessionIdentity(session: AgentSession, language: "en" | "zh" = "en", options?: AgentSessionIdentityOptions): AgentSessionIdentity {
  const providerName = formatProviderName(session.providerRuntime?.agentInfo?.name || session.providerId);
  const ownerAlias = options?.ownerAlias?.trim() || session.ownerAlias?.trim() || "";
  if (ownerAlias) return identityFromOwnerAlias(providerName, ownerAlias, language, options);

  if (!session.providerSessionId || session.providerSessionState === "provisional") {
    const code = codeFromSeed(`local:${session.id}:${session.workspaceKey || session.cwd || session.ownerAlias || "agent"}`);
    return {
      providerName,
      name: "My Last Code",
      code,
      color: colorFromCode(code, options),
    };
  }

  return getAgentProviderSessionIdentity(session.providerId, session.providerSessionId, language, providerName, options);
}

export function getAgentProviderSessionIdentity(providerId: AgentProviderId, providerSessionId: string, language: "en" | "zh" = "en", providerName = formatProviderName(providerId), options?: AgentSessionIdentityOptions): AgentSessionIdentity {
  const ownerAlias = options?.ownerAlias?.trim() || "";
  if (ownerAlias) return identityFromOwnerAlias(providerName, ownerAlias, language, options);

  const code = codeFromSeed(`${providerId}:${providerSessionId}`);
  return {
    providerName,
    name: getFriendlyName(code, language),
    code,
    color: colorFromCode(code, options),
  };
}