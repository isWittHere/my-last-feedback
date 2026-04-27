export interface PromptCommandLike {
  name: string;
  command?: string;
}

export function slugifyPromptCommand(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function promptCommandId(prompt: PromptCommandLike): string {
  const explicit = prompt.command?.trim();
  return explicit ? slugifyPromptCommand(explicit) : slugifyPromptCommand(prompt.name);
}

export function promptCommandSet(prompts: PromptCommandLike[]): Set<string> {
  return new Set(prompts.map(promptCommandId).filter(Boolean));
}