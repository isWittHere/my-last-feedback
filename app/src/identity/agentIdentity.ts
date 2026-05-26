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

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5_CONSTANTS = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0);

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function md5WordToHex(word: number): string {
  let hex = "";
  for (let index = 0; index < 4; index += 1) hex += ((word >>> (index * 8)) & 0xff).toString(16).padStart(2, "0");
  return hex;
}

function md5Hex(value: string): string {
  const input = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((input.length + 1 + 8) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;

  const view = new DataView(bytes.buffer);
  const bitLength = input.length * 8;
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000) >>> 0, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < paddedLength; offset += 64) {
    const words = Array.from({ length: 16 }, (_, index) => view.getUint32(offset + index * 4, true));
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let wordIndex: number;
      if (index < 16) {
        f = (b & c) | (~b & d);
        wordIndex = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        wordIndex = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        wordIndex = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        wordIndex = (7 * index) % 16;
      }

      const next = d;
      d = c;
      c = b;
      b = (b + rotateLeft((a + f + MD5_CONSTANTS[index] + words[wordIndex]) >>> 0, MD5_SHIFTS[index])) >>> 0;
      a = next;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return `${md5WordToHex(a0)}${md5WordToHex(b0)}${md5WordToHex(c0)}${md5WordToHex(d0)}`;
}

export function deriveAgentNameFromId(id?: string | null): string {
  const seed = id?.trim() || "agent";
  return md5Hex(seed).slice(0, 4).toUpperCase();
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
