import { Icon } from "./Icons";

interface StandbyPlaceholderProps {
  role: string;
  message: string;
}

/**
 * Placeholder shown when an agent column is in standby state.
 * Displays a muted icon and explanation of when the role will activate.
 */
export function StandbyPlaceholder({ role, message }: StandbyPlaceholderProps) {
  return (
    <div className="standby-placeholder">
      <div className="standby-icon">
        <Icon name="pause" size={36} />
      </div>
      <div className="standby-role">{role} (待命)</div>
      <div className="standby-message">{message}</div>
    </div>
  );
}
