export interface PromptCommandLike {
  name: string;
  command?: string;
  description?: string;
  content?: string;
  icon?: string;
}

export interface PromptCommandOption {
  id: string;
  name: string;
  description: string;
  content: string;
  icon: string;
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

export function promptCommandOptions(prompts: PromptCommandLike[]): PromptCommandOption[] {
  return prompts
    .map((prompt) => ({
      id: promptCommandId(prompt),
      name: prompt.name,
      description: prompt.description || "",
      content: prompt.content || "",
      icon: prompt.icon || "terminal",
    }))
    .filter((prompt) => Boolean(prompt.id));
}

export function promptCommandMap(prompts: PromptCommandLike[]): Map<string, PromptCommandOption> {
  return new Map(promptCommandOptions(prompts).map((prompt) => [prompt.id, prompt]));
}