import { useFeedbackStore } from "../store/feedbackStore";
import { promptCommandId } from "../composer/promptCommands";
import { PromptIcon } from "./PromptIcons";

interface PromptButtonsProps {
  onAction?: (commandText: string) => void;
}

export function PromptButtons({ onAction }: PromptButtonsProps) {
  const prompts = useFeedbackStore((s) => s.prompts);
  const disabledPrompts = useFeedbackStore((s) => s.disabledPrompts);

  const visible = prompts
    .map((prompt) => ({ prompt, commandId: promptCommandId(prompt) }))
    .filter(({ prompt, commandId }) => commandId && !disabledPrompts.includes(prompt.name));
  if (visible.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {visible.map(({ prompt, commandId }) => (
        <button
          key={prompt.name}
          className="btn btn-prompt"
          title={prompt.description || prompt.name}
          onClick={() => onAction?.(`/${commandId} `)}
        >
          {prompt.icon && <PromptIcon name={prompt.icon} />}
          {prompt.name}
        </button>
      ))}
    </div>
  );
}
