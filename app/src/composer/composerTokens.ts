import { resourceLinkInfo, type ResourceKind } from "./resourceLinks";

export type ComposerInlineToken =
  | { type: "text"; value: string; start: number; end: number }
  | { type: "url"; value: string; start: number; end: number }
  | { type: "color"; value: string; start: number; end: number }
  | { type: "slashCommand"; raw: string; command: string; matched: boolean; start: number; end: number };

export type ComposerTextToken = ComposerInlineToken
  | { type: "resourceLink"; raw: string; label: string; href: string; kind: ResourceKind; start: number; end: number };

interface TokenCandidate {
  type: "url" | "color" | "slashCommand" | "resourceLink";
  value: string;
  start: number;
  end: number;
  priority: number;
  raw?: string;
  command?: string;
  matched?: boolean;
  label?: string;
  href?: string;
  kind?: ResourceKind;
}

const RESOURCE_LINK_RE = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
const COLOR_RE = /#(?:[0-9a-fA-F]{3}){1,2}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/g;
const SLASH_COMMAND_RE = /(^|[\s([{])\/([\p{L}\p{N}_-][\p{L}\p{N}_-]*)/gu;

function collectRegexCandidates(text: string, regex: RegExp, type: TokenCandidate["type"], priority: number): TokenCandidate[] {
  const matches: TokenCandidate[] = [];
  let match: RegExpExecArray | null;
  regex.lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      type,
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
      priority,
    });
  }
  return matches;
}

function collectSlashCandidates(text: string, knownCommands?: ReadonlySet<string>): TokenCandidate[] {
  const matches: TokenCandidate[] = [];
  let match: RegExpExecArray | null;
  SLASH_COMMAND_RE.lastIndex = 0;
  while ((match = SLASH_COMMAND_RE.exec(text)) !== null) {
    const prefix = match[1] || "";
    const command = match[2] || "";
    const start = match.index + prefix.length;
    const raw = `/${command}`;
    matches.push({
      type: "slashCommand",
      raw,
      value: raw,
      command,
      matched: knownCommands ? knownCommands.has(command.toLowerCase()) : true,
      start,
      end: start + raw.length,
      priority: 3,
    });
  }
  return matches;
}

export function parseComposerInlineTokens(text: string, knownCommands?: ReadonlySet<string>): ComposerInlineToken[] {
  const candidates = [
    ...collectRegexCandidates(text, URL_RE, "url", 1),
    ...collectRegexCandidates(text, COLOR_RE, "color", 2),
    ...collectSlashCandidates(text, knownCommands),
  ].sort((left, right) => left.start - right.start || left.priority - right.priority || right.end - left.end);

  const accepted: TokenCandidate[] = [];
  let coveredEnd = -1;
  for (const candidate of candidates) {
    if (candidate.start < coveredEnd) continue;
    accepted.push(candidate);
    coveredEnd = candidate.end;
  }

  const tokens: ComposerInlineToken[] = [];
  let offset = 0;
  for (const token of accepted) {
    if (token.start > offset) tokens.push({ type: "text", value: text.slice(offset, token.start), start: offset, end: token.start });
    if (token.type === "slashCommand") {
      tokens.push({ type: "slashCommand", raw: token.raw || token.value, command: token.command || "", matched: Boolean(token.matched), start: token.start, end: token.end });
    } else if (token.type === "url") {
      tokens.push({ type: "url", value: token.value, start: token.start, end: token.end });
    } else {
      tokens.push({ type: "color", value: token.value, start: token.start, end: token.end });
    }
    offset = token.end;
  }
  if (offset < text.length) tokens.push({ type: "text", value: text.slice(offset), start: offset, end: text.length });
  return tokens;
}

function collectResourceLinkCandidates(text: string, projectDirectory?: string): TokenCandidate[] {
  const matches: TokenCandidate[] = [];
  let match: RegExpExecArray | null;
  RESOURCE_LINK_RE.lastIndex = 0;
  while ((match = RESOURCE_LINK_RE.exec(text)) !== null) {
    const raw = match[0];
    const label = match[1] || "resource";
    const href = match[2] || "";
    const resource = resourceLinkInfo(label, href, projectDirectory);
    if (!resource) continue;
    matches.push({
      type: "resourceLink",
      value: raw,
      raw,
      label: resource.label,
      href: resource.normalizedHref,
      kind: resource.kind,
      start: match.index,
      end: match.index + raw.length,
      priority: 0,
    });
  }
  return matches;
}

export function parseComposerTextTokens(text: string, options: { knownCommands?: ReadonlySet<string>; projectDirectory?: string } = {}): ComposerTextToken[] {
  const candidates = [
    ...collectResourceLinkCandidates(text, options.projectDirectory),
    ...collectRegexCandidates(text, URL_RE, "url", 1),
    ...collectRegexCandidates(text, COLOR_RE, "color", 2),
    ...collectSlashCandidates(text, options.knownCommands),
  ].sort((left, right) => left.start - right.start || left.priority - right.priority || right.end - left.end);

  const accepted: TokenCandidate[] = [];
  let coveredEnd = -1;
  for (const candidate of candidates) {
    if (candidate.start < coveredEnd) continue;
    accepted.push(candidate);
    coveredEnd = candidate.end;
  }

  const tokens: ComposerTextToken[] = [];
  let offset = 0;
  for (const token of accepted) {
    if (token.start > offset) tokens.push({ type: "text", value: text.slice(offset, token.start), start: offset, end: token.start });
    if (token.type === "resourceLink") {
      tokens.push({ type: "resourceLink", raw: token.raw || token.value, label: token.label || token.value, href: token.href || "", kind: token.kind || "file", start: token.start, end: token.end });
    } else if (token.type === "slashCommand") {
      tokens.push({ type: "slashCommand", raw: token.raw || token.value, command: token.command || "", matched: Boolean(token.matched), start: token.start, end: token.end });
    } else if (token.type === "url") {
      tokens.push({ type: "url", value: token.value, start: token.start, end: token.end });
    } else {
      tokens.push({ type: "color", value: token.value, start: token.start, end: token.end });
    }
    offset = token.end;
  }
  if (offset < text.length) tokens.push({ type: "text", value: text.slice(offset), start: offset, end: text.length });
  return tokens;
}