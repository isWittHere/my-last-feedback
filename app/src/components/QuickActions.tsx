import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface QuickActionsProps {
  onAction: (quickAction: string) => void;
}

const ACTIONS = [
  { key: "start", text: "Start the task", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg> },
  { key: "analyze", text: "Please analyze the user requirements or perform a deeper analysis", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg> },
  { key: "fix", text: "Please find the root cause and fix the issue", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg> },
  { key: "explain", text: "Please explain this to me in detail first", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg> },
] as const;

export function QuickActions({ onAction }: QuickActionsProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const fullWidthRef = useRef(0);

  useEffect(() => {
    const row = containerRef.current?.parentElement;
    if (!row) return;

    const check = () => {
      const available = row.clientWidth;

      if (!compact) {
        // Measure the natural single-line width of the row
        const needed = row.scrollWidth;
        if (needed > available) {
          fullWidthRef.current = needed;
          setCompact(true);
        }
      } else {
        // Restore text only if there's clearly enough room
        if (fullWidthRef.current > 0 && available >= fullWidthRef.current) {
          setCompact(false);
        }
      }
    };

    const ro = new ResizeObserver(() => check());
    ro.observe(row);
    requestAnimationFrame(check);
    return () => ro.disconnect();
  }, [compact]);

  return (
    <div ref={containerRef} className="flex items-center gap-1.5">
      {ACTIONS.map((a) => (
        <button
          key={a.key}
          className="btn"
          style={{ minHeight: 34, minWidth: 34, fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: compact ? 0 : 4, whiteSpace: "nowrap", flexShrink: 0 }}
          title={t(`quickActions.${a.key}`)}
          onClick={() => onAction(a.text)}
        >
          {a.icon}
          {!compact && t(`quickActions.${a.key}`)}
        </button>
      ))}
    </div>
  );
}
