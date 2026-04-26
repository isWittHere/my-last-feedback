import { Icon } from "./Icons";

type MLRARole = "expert" | "inspector" | "ceo";

const ROLE_ICON: Record<MLRARole, string> = {
  expert: "message-dot",
  inspector: "eye",
  ceo: "flag",
};

interface MLRARoleIconProps {
  role: MLRARole;
  color: string;
  size: number;
}

export function MLRARoleIcon({ role, color, size }: MLRARoleIconProps) {
  return (
    <span
      className="mlra-role-icon"
      style={{
        width: size,
        height: size,
        background: `${color}24`,
        color,
      }}
      aria-hidden="true"
    >
      <Icon name={ROLE_ICON[role]} size={Math.max(10, Math.round(size * 0.68))} strokeWidth={2.2} />
    </span>
  );
}