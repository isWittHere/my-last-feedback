import { useMemo } from "react";
import { useFeedbackStore, type Session } from "../store/feedbackStore";
import { promptCommandSet } from "../composer/promptCommands";
import { MarkdownContent } from "./MarkdownContent";

export function ReadonlyComposerContent({ session }: { session: Session }) {
  const prompts = useFeedbackStore((state) => state.prompts);
  const disabledPrompts = useFeedbackStore((state) => state.disabledPrompts);
  const commandSet = useMemo(() => {
    const visiblePrompts = prompts.filter((prompt) => !disabledPrompts.includes(prompt.name));
    return promptCommandSet(visiblePrompts);
  }, [disabledPrompts, prompts]);

  return (
    <MarkdownContent
      markdown={session.feedbackText}
      projectDirectory={session.projectDirectory}
      className="readonly-feedback-markdown"
      variant="feedback"
      enableComposerTokens
      composerCommands={commandSet}
    />
  );
}