import { useMemo } from "react";
import { useFeedbackStore, type Session } from "../store/feedbackStore";
import { promptCommandSet } from "../composer/promptCommands";
import { augmentReadonlySubmittedFeedback } from "../composer/submittedFeedback";
import { MarkdownContent } from "./MarkdownContent";

export function ReadonlyComposerContent({ session }: { session: Session }) {
  const prompts = useFeedbackStore((state) => state.prompts);
  const disabledPrompts = useFeedbackStore((state) => state.disabledPrompts);
  const callerAlias = useFeedbackStore((state) => state.callers.find((caller) => caller.id === session.callerId)?.alias || null);
  const commandSet = useMemo(() => {
    const visiblePrompts = prompts.filter((prompt) => !disabledPrompts.includes(prompt.name));
    return promptCommandSet(visiblePrompts);
  }, [disabledPrompts, prompts]);
  const markdown = useMemo(
    () => augmentReadonlySubmittedFeedback(session.feedbackText, session, { callerAlias }),
    [callerAlias, session],
  );

  return (
    <MarkdownContent
      markdown={markdown}
      projectDirectory={session.projectDirectory}
      className="readonly-feedback-markdown"
      variant="feedback"
      enableComposerTokens
      composerCommands={commandSet}
    />
  );
}