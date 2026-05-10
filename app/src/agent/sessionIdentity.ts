import { resolveAgentGlyphIdentity } from "../identity/agentIdentity";
import type { AgentProviderId, AgentSession } from "./types";

export interface AgentSessionIdentity {
  providerName: string;
  name: string;
  code: string | null;
  avatarSeed: string;
  color: string;
}

interface AgentSessionIdentityOptions {
  color?: string | null;
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

function colorFromCode(code: string, options?: AgentSessionIdentityOptions): string {
  return options?.color?.trim() || AVATAR_COLORS[hashString(code) % AVATAR_COLORS.length];
}

export function getAgentSessionIdentity(session: AgentSession, language: "en" | "zh" = "en", options?: AgentSessionIdentityOptions): AgentSessionIdentity {
  const providerName = formatProviderName(session.providerRuntime?.agentInfo?.name || session.providerId);
  const glyph = resolveAgentGlyphIdentity({ agentName: session.agentName, id: session.id, fallbackId: session.providerSessionId }, language);
  return {
    providerName,
    name: glyph.nickname,
    code: glyph.agentName,
    avatarSeed: glyph.avatarSeed,
    color: colorFromCode(glyph.agentName, options),
  };
}

export function getAgentProviderSessionIdentity(providerId: AgentProviderId, providerSessionId: string, language: "en" | "zh" = "en", providerName = formatProviderName(providerId), options?: AgentSessionIdentityOptions): AgentSessionIdentity {
  const glyph = resolveAgentGlyphIdentity({ id: `${providerId}:${providerSessionId}`, fallbackId: providerSessionId }, language);
  return {
    providerName,
    name: glyph.nickname,
    code: glyph.agentName,
    avatarSeed: glyph.avatarSeed,
    color: colorFromCode(glyph.agentName, options),
  };
}