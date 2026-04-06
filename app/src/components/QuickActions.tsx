import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./Icons";

interface QuickActionsProps {
  onAction: (quickAction: string) => void;
}

const ACTIONS = [
  { key: "start", text: "Start the task", icon: <Icon name="play" size={12} /> },
  { key: "analyze", text: "Please analyze the user requirements or perform a deeper analysis", icon: <Icon name="search" size={12} /> },
  { key: "fix", text: "Please find the root cause and fix the issue", icon: <Icon name="wrench" size={12} /> },
  { key: "explain", text: "Please explain this to me in detail first", icon: <Icon name="message" size={12} /> },
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
