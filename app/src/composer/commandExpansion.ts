import { parseComposerTextTokens } from "./composerTokens";
import { promptCommandMap, promptCommandSet, type PromptCommandLike } from "./promptCommands";

function uniqueMatchedCommands(text: string, prompts: PromptCommandLike[]): string[] {
  const knownCommands = promptCommandSet(prompts);
  const seen = new Set<string>();
  const commands: string[] = [];
  for (const token of parseComposerTextTokens(text, { knownCommands })) {
    if (token.type !== "slashCommand" || !token.matched) continue;
    const id = token.command.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    commands.push(id);
  }
  return commands;
}

export function formatSlashCommandExpansions(text: string, prompts: PromptCommandLike[]): string | null {
  const commandIds = uniqueMatchedCommands(text, prompts);
  if (commandIds.length === 0) return null;
  const commands = promptCommandMap(prompts);
  const sections = commandIds
    .map((id) => {
      const prompt = commands.get(id);
      if (!prompt?.content.trim()) return null;
      return [`### /${id}`, prompt.content.trim()].join("\n\n");
    })
    .filter(Boolean);
  if (sections.length === 0) return null;
  return ["## Slash Command Expansions", ...sections].join("\n\n");
}
