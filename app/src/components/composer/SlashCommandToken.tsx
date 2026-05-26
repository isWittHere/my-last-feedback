import { Icon } from "../Icons";

export function SlashCommandToken({ raw, matched }: { raw: string; matched: boolean }) {
  return (
    <span className={`composer-command-token${matched ? "" : " unmatched"}`} title={matched ? raw : `${raw} (unknown command)`}>
      <Icon name="terminal" size={11} />
      <span>{raw}</span>
    </span>
  );
}