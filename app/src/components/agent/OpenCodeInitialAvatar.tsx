import type { CSSProperties } from "react";
import { IdenticonAvatar } from "../IdenticonAvatar";

interface OpenCodeInitialAvatarProps {
  size: number;
  color?: string;
  emptyColor?: string;
  className?: string;
  style?: CSSProperties;
}

const OPENCODE_HOLLOW_SQUARE_GRID = [
  [false, false, false, false, false],
  [false, true, true, true, false],
  [false, true, false, true, false],
  [false, true, true, true, false],
  [false, false, false, false, false],
];

export function OpenCodeInitialAvatar({ size, color = "#f7f7f7", emptyColor, className, style }: OpenCodeInitialAvatarProps) {
  return (
    <IdenticonAvatar
      alias="opencode"
      color={color}
      emptyColor={emptyColor}
      grid={OPENCODE_HOLLOW_SQUARE_GRID}
      size={size}
      className={className}
      style={style}
    />
  );
}