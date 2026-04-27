export type ComposerInlineToken =
  | { type: "text"; value: string; start: number; end: number }
  | { type: "url"; value: string; start: number; end: number }
  | { type: "color"; value: string; start: number; end: number }
  | { type: "slashCommand"; raw: string; command: string; matched: boolean; start: number; end: number };

interface TokenCandidate {
  type: "url" | "color" | "slashCommand";
  value: string;
  start: number;
  end: number;
  priority: number;
  raw?: string;
  command?: string;
  matched?: boolean;
}

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