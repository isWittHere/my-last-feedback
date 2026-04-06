/** Relative time description (e.g. "3m ago", "2d ago"). */
export function timeAgo(
  dateStr: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return t("sidebar.timeJustNow", { defaultValue: "just now" });
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t("sidebar.timeMinutes", { count: diffMin, defaultValue: "{{count}}m ago" });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t("sidebar.timeHours", { count: diffHr, defaultValue: "{{count}}h ago" });
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return t("sidebar.timeDays", { count: diffDay, defaultValue: "{{count}}d ago" });
  // Show date: M/D
  const d = new Date(dateStr);
  return t("sidebar.timeDate", { month: d.getMonth() + 1, day: d.getDate(), defaultValue: "{{month}}/{{day}}" });
}

export type TimeGroup = "today" | "yesterday" | "lastWeek" | "earlier";

/** Bucket a date string into a time group for session grouping. */
export function getTimeGroup(dateStr: string): TimeGroup {
  const now = new Date();
  const then = new Date(dateStr);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekAgoStart = todayStart - 7 * 86400000;
  const t = then.getTime();
  if (t >= todayStart) return "today";
  if (t >= yesterdayStart) return "yesterday";
  if (t >= weekAgoStart) return "lastWeek";
  return "earlier";
}
