import mlcLogoSvg from "../assets/my-last-chat.svg?raw";

/**
 * Unified SVG icon library for the entire UI.
 * All icons use a 24×24 viewBox with stroke-based rendering (Lucide-style)
 * unless specified otherwise.
 *
 * Usage:
 *   <Icon name="copy" size={14} />
 *   <Icon name="check" size={12} color="var(--color-success)" />
 */

interface IconDef {
  paths: string;
  viewBox?: string;       // default "0 0 24 24"
  defaultFill?: string;   // default "none"
  defaultStroke?: string;  // default "currentColor"
  defaultStrokeWidth?: number; // default 2
}

const ICONS: Record<string, IconDef> = {
  // ── Actions ──
  plus: {
    paths: '<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />',
  },
  copy: {
    paths: '<rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />',
  },
  check: {
    paths: '<polyline points="20 6 9 17 4 12" />',
  },
  send: {
    paths: '<line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />',
  },
  "arrow-right": {
    paths: '<line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />',
  },
  "arrow-right-left": {
    paths: '<polyline points="17 3 21 7 17 11" /><line x1="21" y1="7" x2="9" y2="7" /><polyline points="7 21 3 17 7 13" /><line x1="15" y1="17" x2="3" y2="17" />',
  },
  edit: {
    paths: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />',
  },
  trash: {
    paths: '<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />',
  },
  "trash-full": {
    paths: '<polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />',
  },
  search: {
    paths: '<circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />',
  },
  play: {
    paths: '<polygon points="5 3 19 12 5 21 5 3" />',
  },
  wrench: {
    paths: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />',
  },
  pin: {
    paths: '<path d="M9 4v6l-2 4v2h10v-2l-2-4V4" /><line x1="12" y1="16" x2="12" y2="22" /><line x1="8" y1="4" x2="16" y2="4" />',
  },

  // ── Content types ──
  message: {
    paths: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />',
  },
  "message-dot": {
    paths: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><circle cx="12" cy="10" r="1" fill="currentColor" />',
  },
  image: {
    paths: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />',
  },
  file: {
    paths: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />',
  },
  terminal: {
    paths: '<polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />',
  },
  code: {
    paths: '<polyline points="8 7 3 12 8 17" /><line x1="14" y1="5" x2="10" y2="19" /><polyline points="16 7 21 12 16 17" />',
  },
  bug: {
    paths: '<path d="M8 2l1.88 1.88" /><path d="M14.12 3.88L16 2" /><path d="M9 7.13V6a3 3 0 0 1 6 0v1.13" /><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Z" /><path d="M12 20v-9" /><path d="M6 13H2" /><path d="M22 13h-4" /><path d="M6.7 17.7 4 20" /><path d="M17.3 17.7 20 20" />',
  },
  checklist: {
    paths: '<path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />',
  },
  "git-branch": {
    paths: '<circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />',
  },
  merge: {
    paths: '<circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M6 21V9a9 9 0 0 0 9 9" />',
  },
  robot: {
    paths: '<rect x="3" y="8" width="18" height="12" rx="2" /><circle cx="9" cy="14" r="1" /><circle cx="15" cy="14" r="1" /><line x1="12" y1="2" x2="12" y2="8" />',
  },

  // ── Status ──
  spinner: {
    paths: '<line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />',
  },
  "circle-check": {
    paths: '<circle cx="12" cy="12" r="10" /><polyline points="16 8.5 10.5 15 8 12" />',
  },
  "circle-x": {
    paths: '<circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />',
  },
  close: {
    paths: '<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />',
  },

  // ── Navigation / UI ──
  eye: {
    paths: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />',
  },
  "eye-off": {
    paths: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" />',
  },
  "arrow-down-right": {
    paths: '<line x1="7" y1="7" x2="17" y2="17" /><polyline points="17 7 17 17 7 17" />',
  },
  "arrow-bend-down-right": {
    paths: '<path d="M4 4v7a4 4 0 0 0 4 4h12" /><polyline points="15 10 20 15 15 20" />',
  },
  folder: {
    paths: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />',
  },
  "folder-open": {
    paths: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />',
  },
  "chevron-down": {
    paths: '<polyline points="6 9 12 15 18 9" />',
  },
  "chevron-right": {
    paths: '<polyline points="9 18 15 12 9 6" />',
  },
  "chevron-left": {
    paths: '<polyline points="15 18 9 12 15 6" />',
  },

  // ── Settings / titlebar ──
  gear: {
    paths: '<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />',
  },
  users: {
    paths: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />',
  },
  sun: {
    paths: '<circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />',
  },
  bell: {
    paths: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />',
  },
  info: {
    paths: '<circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />',
  },
  inbox: {
    paths: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />',
  },
  clock: {
    paths: '<circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />',
  },
  moon: {
    paths: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />',
  },
  "sun-full": {
    paths: '<circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />',
  },
  "file-text": {
    paths: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />',
  },
  "list-tree": {
    paths: '<path d="M21 6H8" /><path d="M21 12H8" /><path d="M21 18H8" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" />',
  },
  "star-empty": {
    paths: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />',
  },
  "star-full": {
    paths: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />',
    defaultFill: "currentColor",
  },
  book: {
    paths: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />',
  },
  sort: {
    paths: '<line x1="4" y1="6" x2="14" y2="6" /><line x1="4" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="11" y2="18" /><polyline points="16 16 19 19 22 16" />',
  },
  sidebar: {
    paths: '<rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />',
  },
  "page-sidebar": {
    paths: '<rect x="3" y="4" width="18" height="16" rx="2" /><line x1="8" y1="4" x2="8" y2="20" /><line x1="12" y1="8" x2="17" y2="8" /><line x1="12" y1="12" x2="18" y2="12" /><line x1="12" y1="16" x2="16" y2="16" />',
  },
  menu: {
    paths: '<line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />',
  },
  pause: {
    paths: '<rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />',
  },
  radio: {
    paths: '<path d="M16.24 7.76a6 6 0 0 1 0 8.49" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M7.76 16.24a6 6 0 0 1 0-8.49" /><path d="M4.93 19.07a10 10 0 0 1 0-14.14" /><circle cx="12" cy="12" r="2" />',
  },
  aim: {
    paths: '<circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" />',
  },

  // ── Window controls (10×10 viewBox) ──
  "win-minimize": {
    paths: '<rect width="10" height="1" fill="currentColor" />',
    viewBox: "0 0 10 1",
    defaultFill: "currentColor",
    defaultStroke: "none",
  },
  "win-maximize": {
    paths: '<rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1" />',
    viewBox: "0 0 10 10",
    defaultStroke: "currentColor",
    defaultStrokeWidth: 1,
  },
  "win-close": {
    paths: '<line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.2" /><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.2" />',
    viewBox: "0 0 10 10",
  },
  "close-sm": {
    paths: '<line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" stroke-width="1.5" /><line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" stroke-width="1.5" />',
    viewBox: "0 0 10 10",
  },

  // ── Stage / workflow ──
  lock: {
    paths: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />',
  },
  flag: {
    paths: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />',
  },
  "arrow-down": {
    paths: '<line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />',
  },
};

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  fill?: string;
}

export function Icon({ name, size = 16, color, strokeWidth, className, style, fill }: IconProps) {
  const def = ICONS[name];
  if (!def) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox={def.viewBox || "0 0 24 24"}
      fill={fill ?? def.defaultFill ?? "none"}
      stroke={color ?? def.defaultStroke ?? "currentColor"}
      strokeWidth={strokeWidth ?? def.defaultStrokeWidth ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: def.paths }}
    />
  );
}

export interface MlcLogoIconProps {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function MlcLogoIcon({ size = 16, color, className, style }: MlcLogoIconProps) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        width: size,
        height: size,
        color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: mlcLogoSvg }}
    />
  );
}
