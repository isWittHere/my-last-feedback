import { useFeedbackStore } from "../store/feedbackStore";
import { PromptIcon } from "./PromptIcons";

interface PromptButtonsProps {
  onAction?: (content: string) => void;
}

export function PromptButtons({ onAction }: PromptButtonsProps) {
  const prompts = useFeedbackStore((s) => s.prompts);
  const disabledPrompts = useFeedbackStore((s) => s.disabledPrompts);

  const visible = prompts.filter((p) => !disabledPrompts.includes(p.name));
  if (visible.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {visible.map((p) => (
        <button
          key={p.name}
          className="btn btn-prompt"
          title={p.description || p.name}
          onClick={() => onAction?.(p.content)}
        >
          {p.icon && <PromptIcon name={p.icon} />}
          {p.name}
        </button>
      ))}
    </div>
  );
}
