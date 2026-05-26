import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AgentSession } from "../../agent/types";
import { useAgentStore } from "../../store/agentStore";
import { AgentComposer } from "./AgentComposer";
import { AgentCurrentStatusRow } from "./AgentCurrentStatusRow";
import { AgentMessageTimeline } from "./AgentMessageTimeline";
import { AgentTaskPanel } from "./AgentTaskPanel";

const INPUT_DEFAULT = 0.28;
const INPUT_AUTO_MAX = 0.58;
const PANEL_MIN_SIZE = 0.08;

function AgentStatusPanelSlot({ session }: { session: AgentSession }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const updateHeight = () => setHeight(node.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [session.id]);

  const open = height > 0;

  return (
    <div className="agent-session-status-stack" data-open={open ? "true" : "false"} aria-hidden={open ? undefined : true}>
      <div ref={innerRef} className="agent-session-status-stack-inner">
        <AgentCurrentStatusRow session={session} />
        <AgentTaskPanel session={session} />
      </div>
    </div>
  );
}

export function AgentConsolePanel() {
  const activeSession = useAgentStore((state) => state.getActiveSession());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputPanelRef = useRef<HTMLDivElement>(null);
  const [panelSizes, setPanelSizes] = useState([1 - INPUT_DEFAULT, INPUT_DEFAULT]);
  const panelSizesRef = useRef(panelSizes);
  const resizingRef = useRef<{ index: number; startY: number; startSizes: number[] } | null>(null);
  const userResizedRef = useRef(false);

  panelSizesRef.current = panelSizes;

  const handleMouseDown = useCallback((index: number, event: React.MouseEvent) => {
    event.preventDefault();
    userResizedRef.current = true;
    resizingRef.current = { index, startY: event.clientY, startSizes: [...panelSizesRef.current] };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current || !containerRef.current) return;
      const { index: currentIndex, startY, startSizes } = resizingRef.current;
      const containerHeight = containerRef.current.getBoundingClientRect().height;
      if (containerHeight <= 0) return;
      const delta = (moveEvent.clientY - startY) / containerHeight;
      const combined = startSizes[currentIndex] + startSizes[currentIndex + 1];
      let previous = startSizes[currentIndex] + delta;
      let next = startSizes[currentIndex + 1] - delta;
      if (previous < PANEL_MIN_SIZE) {
        previous = PANEL_MIN_SIZE;
        next = combined - PANEL_MIN_SIZE;
      }
      if (next < PANEL_MIN_SIZE) {
        next = PANEL_MIN_SIZE;
        previous = combined - PANEL_MIN_SIZE;
      }
      const newSizes = [...startSizes];
      newSizes[currentIndex] = previous;
      newSizes[currentIndex + 1] = next;
      setPanelSizes(newSizes);
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  useEffect(() => {
    if (!activeSession || userResizedRef.current) return;
    const panel = inputPanelRef.current;
    const container = containerRef.current;
    if (!panel || !container) return;
    const composerInput = panel.querySelector<HTMLElement>("[data-composer-input='true']");
    if (!composerInput) return;
    const containerHeight = container.getBoundingClientRect().height;
    if (containerHeight <= 0) return;
    const extraPixels = composerInput.scrollHeight - composerInput.clientHeight;
    if (extraPixels <= 4) return;
    const nextInputSize = Math.min(panelSizes[1] + extraPixels / containerHeight, INPUT_AUTO_MAX);
    if (nextInputSize > panelSizes[1]) {
      setPanelSizes([1 - nextInputSize, nextInputSize]);
    }
  }, [activeSession, activeSession?.draft, activeSession?.testLogText, activeSession?.gitAction, activeSession?.images.length, activeSession?.mlcAttachments.length, activeSession?.webAttachments.length, panelSizes]);

  if (!activeSession) return null;

  return (
    <div className="agent-console-panel">
      <div ref={containerRef} className="agent-console-resizable-body">
        <div className="agent-console-timeline-region panel-card" style={{ flex: `0 0 calc(${panelSizes[0] * 100}% - 1px)`, minHeight: 48 }}>
          <AgentMessageTimeline session={activeSession} />
          <AgentStatusPanelSlot session={activeSession} />
        </div>
        <div className="resize-handle" onMouseDown={(event) => handleMouseDown(0, event)} />
        <div ref={inputPanelRef} className="agent-console-input-region panel-card panel-feedback panel-feedback-editable" data-tooltip-placement="top" style={{ flex: `0 0 ${panelSizes[1] * 100}%`, minHeight: 92, position: "relative" }}>
          <div className="agent-composer-area">
            <AgentComposer session={activeSession} />
          </div>
        </div>
      </div>
    </div>
  );
}