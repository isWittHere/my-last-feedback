import { getFriendlyName } from "../components/friendlyName";
import type { AgentSession } from "./types";

export interface AgentSessionIdentity {
  providerName: string;
  name: string;
  code: string | null;
  color: string;
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

export function getAgentSessionIdentity(session: AgentSession, language: "en" | "zh" = "en"): AgentSessionIdentity {
  const providerName = formatProviderName(session.providerRuntime?.agentInfo?.name || session.providerId);
  if (!session.providerSessionId) {
    return {
      providerName,
      name: "opencode",
      code: null,
      color: "var(--color-text)",
    };
  }

  const code = codeFromSeed(`${session.providerId}:${session.providerSessionId}`);
  const colorIndex = hashString(code) % AVATAR_COLORS.length;
  return {
    providerName,
    name: getFriendlyName(code, language),
    code,
    color: AVATAR_COLORS[colorIndex],
  };
}