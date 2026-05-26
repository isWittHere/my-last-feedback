import { useMemo } from "react";

/**
 * Generate a 5×5 left-right symmetric identicon from a string key.
 * Returns a 5×5 boolean grid where true = filled block.
 *
 * Algorithm:
 * - Hash the key into a numeric value (FNV-1a style)
 * - Use 15 bits to determine the left-half + center column (3 cols × 5 rows)
 * - Mirror left half to right half for symmetry
 */
function generateGrid(key: string): boolean[][] {
  // Simple FNV-1a hash to get a numeric seed
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  // Second round for better distribution
  let hash2 = hash;
  for (let i = 0; i < key.length; i++) {
    hash2 ^= key.charCodeAt(key.length - 1 - i);
    hash2 = (hash2 * 0x01000193) >>> 0;
  }

  const bits = hash | (hash2 << 16);
  const grid: boolean[][] = [];

  for (let row = 0; row < 5; row++) {
    const r: boolean[] = [false, false, false, false, false];
    for (let col = 0; col < 3; col++) {
      const bitIndex = row * 3 + col;
      const filled = ((bits >> bitIndex) & 1) === 1;
      r[col] = filled;
      // Mirror: col 0 → col 4, col 1 → col 3, col 2 stays center
      if (col < 2) {
        r[4 - col] = filled;
      }
    }
    grid.push(r);
  }

  return grid;
}

interface IdenticonAvatarProps {
  /** The alias string used to generate the unique pattern */
  alias: string;
  /** The caller theme color for filled blocks */
  color: string;
  /** Size in pixels (the avatar is always square) */
  size: number;
  /** Optional CSS class */
  className?: string;
  /** Optional inline style */
  style?: React.CSSProperties;
}

export function IdenticonAvatar({ alias, color, size, className, style }: IdenticonAvatarProps) {
  const grid = useMemo(() => generateGrid(alias), [alias]);

  // Use integer viewBox (5×5) to avoid subpixel gaps between cells
  const emptyColor = `${color}26`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 5 5"
      className={className}
      style={{ borderRadius: 2, flexShrink: 0, display: "block", ...style }}
      shapeRendering="crispEdges"
    >
      {/* Background */}
      <rect width={5} height={5} fill={emptyColor} rx={0.4} />
      {/* Filled blocks */}
      {grid.map((row, rowIdx) =>
        row.map((filled, colIdx) =>
          filled ? (
            <rect
              key={`${rowIdx}-${colIdx}`}
              x={colIdx}
              y={rowIdx}
              width={1}
              height={1}
              fill={color}
            />
          ) : null
        )
      )}
    </svg>
  );
}
