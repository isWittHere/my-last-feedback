import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface TooltipState {
  text: string;
  x: number;
  y: number;
  placement: "top" | "bottom";
}

const TOOLTIP_MARGIN = 8;
const TOOLTIP_OFFSET = 8;

function clamp(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2;
  return Math.min(Math.max(value, min), max);
}

function findTooltipElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>("[data-tooltip], [title]");
}

function getTooltipText(element: HTMLElement): string {
  return element.getAttribute("data-tooltip") || element.getAttribute("title") || "";
}

function silenceNativeTitle(element: HTMLElement) {
  const title = element.getAttribute("title");
  if (!title) return;
  element.dataset.nativeTitle = title;
  element.removeAttribute("title");
}

function restoreNativeTitle(element: HTMLElement | null) {
  if (!element?.dataset.nativeTitle) return;
  element.setAttribute("title", element.dataset.nativeTitle);
  delete element.dataset.nativeTitle;
}

function createTooltipState(element: HTMLElement, text: string, tooltipWidth = 0, tooltipHeight = 0): TooltipState {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const targetCenterX = rect.left + rect.width / 2;
  const halfWidth = tooltipWidth > 0 ? tooltipWidth / 2 : 0;
  const x = halfWidth > 0
    ? clamp(targetCenterX, TOOLTIP_MARGIN + halfWidth, viewportWidth - TOOLTIP_MARGIN - halfWidth)
    : targetCenterX;
  const showTop = tooltipHeight > 0
    ? rect.bottom + TOOLTIP_OFFSET + tooltipHeight + TOOLTIP_MARGIN > viewportHeight && rect.top - TOOLTIP_OFFSET - tooltipHeight - TOOLTIP_MARGIN > 0
    : rect.bottom + 52 > viewportHeight && rect.top > 52;
  return {
    text,
    x,
    y: showTop ? rect.top - TOOLTIP_OFFSET : rect.bottom + TOOLTIP_OFFSET,
    placement: showTop ? "top" : "bottom",
  };
}

export function AppTooltipProvider({ children }: { children: ReactNode }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [activeElement, setActiveElement] = useState<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!tooltip || !activeElement || !tooltipRef.current) return;
    const nextTooltip = createTooltipState(activeElement, tooltip.text, tooltipRef.current.offsetWidth, tooltipRef.current.offsetHeight);
    if (
      Math.abs(nextTooltip.x - tooltip.x) > 0.5 ||
      Math.abs(nextTooltip.y - tooltip.y) > 0.5 ||
      nextTooltip.placement !== tooltip.placement
    ) {
      setTooltip(nextTooltip);
    }
  }, [tooltip, activeElement]);

  useEffect(() => {
    const show = (event: Event) => {
      const element = findTooltipElement(event.target);
      if (!element) return;
      const text = getTooltipText(element).trim();
      if (!text) return;
      restoreNativeTitle(activeElement);
      silenceNativeTitle(element);
      setActiveElement(element);
      setTooltip(createTooltipState(element, text));
    };

    const hide = (event?: Event) => {
      if (event instanceof PointerEvent && activeElement && event.relatedTarget instanceof Node && activeElement.contains(event.relatedTarget)) return;
      restoreNativeTitle(activeElement);
      setActiveElement(null);
      setTooltip(null);
    };

    const refresh = () => {
      if (!activeElement) return;
      const text = getTooltipText(activeElement).trim() || activeElement.dataset.nativeTitle || "";
      if (!text) {
        hide();
        return;
      }
      setTooltip(createTooltipState(activeElement, text));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };

    document.addEventListener("pointerover", show, true);
    document.addEventListener("focusin", show, true);
    document.addEventListener("pointerout", hide, true);
    document.addEventListener("focusout", hide, true);
    window.addEventListener("scroll", refresh, true);
    window.addEventListener("resize", refresh);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      restoreNativeTitle(activeElement);
      document.removeEventListener("pointerover", show, true);
      document.removeEventListener("focusin", show, true);
      document.removeEventListener("pointerout", hide, true);
      document.removeEventListener("focusout", hide, true);
      window.removeEventListener("scroll", refresh, true);
      window.removeEventListener("resize", refresh);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeElement]);

  return (
    <>
      {children}
      {tooltip ? (
        <div
          ref={tooltipRef}
          className={`app-tooltip app-tooltip-${tooltip.placement}`}
          style={{ left: tooltip.x, top: tooltip.y }}
          role="tooltip"
        >
          {tooltip.text}
        </div>
      ) : null}
    </>
  );
}