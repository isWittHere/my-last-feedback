import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentContentBlock, AgentTaskItem } from "../../agent/types";
import { Icon } from "../Icons";
import { MarkdownContent } from "../MarkdownContent";

type ProcessViewMode = "timeline" | "tabs";
type StepKind = "thinking" | "tool" | "task_list" | "artifacts" | "permission" | "error";

interface StepItem {
  kind: StepKind;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  detail?: string;
  args?: Record<string, unknown>;
  result?: string;
  tasks?: AgentTaskItem[];
  blocks?: AgentContentBlock[];
}

function cleanResultForDisplay(raw: string): string {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return raw;
    delete value.todo_list;
    delete value.charts;
    delete value.cards;
    delete value.sandbox_state;
    delete value.execution_time_ms;
    delete value.tool_calls_count;
    if (value.error == null) delete value.error;
    if (Array.isArray(value.progress_logs) && value.progress_logs.length === 0) delete value.progress_logs;
    if (Array.isArray(value.tool_errors) && value.tool_errors.length === 0) delete value.tool_errors;
    for (const key of ["output", "stdout"]) {
      if (typeof value[key] === "string") {
        const cleaned = value[key]
          .replace(/Todo list updated\s*\([^)]*\)\.\s*/g, "")
          .replace(/^\s*\[[xX \-~]\]\s+.+$/gm, "")
          .trim();
        if (cleaned) value[key] = cleaned;
        else delete value[key];
      }
    }
    const keys = Object.keys(value);
    if (keys.length === 1 && (keys[0] === "output" || keys[0] === "stdout")) return String(value[keys[0]]);
    return keys.length > 0 ? JSON.stringify(value, null, 2) : raw;
  } catch {
    return raw;
  }
}

function prettyArgs(args: Record<string, unknown>): string {
  return JSON.stringify(args, null, 2).replace(/("(?:[^"\\]|\\.)*")/g, (match) =>
    match
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r")
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\"),
  );
}

function normalizeResult(result: string): string {
  return cleanResultForDisplay(result).replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatScalar(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return "null";
  return JSON.stringify(value, null, 2);
}

function extractSteps(blocks: AgentContentBlock[]): StepItem[] {
  const steps: StepItem[] = [];
  for (const block of blocks) {
    if (block.type === "thinking") {
      steps.push({ kind: "thinking", label: "思考", status: block.status === "running" ? "running" : "completed", detail: block.content });
      continue;
    }
    if (block.type === "tool_call") {
      steps.push({
        kind: "tool",
        label: block.label || block.title || (typeof block.args?.label === "string" ? block.args.label : block.name),
        status: block.status || "completed",
        args: block.args,
        result: block.result,
      });
      continue;
    }
    if (block.type === "task_list" && block.tasks.length > 0) {
      const completedCount = block.tasks.filter((task) => task.status === "completed").length;
      const hasRunningTask = block.tasks.some((task) => task.status === "in-progress");
      steps.push({
        kind: "task_list",
        label: block.title || `待办事项 (${completedCount}/${block.tasks.length})`,
        status: hasRunningTask ? "running" : "completed",
        tasks: block.tasks,
      });
      continue;
    }
    if (block.type === "artifact" || block.type === "file_change") {
      const lastStep = steps[steps.length - 1];
      if (lastStep?.kind === "artifacts") {
        lastStep.blocks = [...(lastStep.blocks || []), block];
        lastStep.label = `产物 (${lastStep.blocks.length})`;
      } else {
        steps.push({ kind: "artifacts", label: "产物 (1)", status: "completed", blocks: [block] });
      }
      continue;
    }
    if (block.type === "permission") {
      steps.push({
        kind: "permission",
        label: block.title,
        status: block.status === "pending" ? "pending" : "completed",
        detail: block.status === "pending" ? "等待用户确认" : "权限请求已处理",
      });
      continue;
    }
    if (block.type === "error") {
      steps.push({ kind: "error", label: "错误", status: "failed", detail: block.detail || block.message });
    }
  }
  return steps;
}

function stepIconName(step: StepItem): string {
  if (step.kind === "thinking") return "message-dot";
  if (step.kind === "tool") return "wrench";
  if (step.kind === "task_list") return "checklist";
  if (step.kind === "permission") return "lock";
  if (step.kind === "error") return "warning";
  return "file-text";
}

function stepHasContent(step: StepItem): boolean {
  if (step.kind === "thinking") return Boolean(step.detail);
  if (step.kind === "tool") return Boolean(step.args || step.result);
  if (step.kind === "task_list") return Boolean(step.tasks?.length);
  if (step.kind === "artifacts") return Boolean(step.blocks?.length);
  return Boolean(step.detail);
}

function StepDetail({ step, projectDirectory }: { step: StepItem; projectDirectory?: string }) {
  if (step.kind === "thinking" && step.detail) {
    return <MarkdownContent markdown={step.detail} projectDirectory={projectDirectory} className="agent-process-markdown" variant="feedback" enableComposerTokens />;
  }
  if (step.kind === "tool") {
    return (
      <div className="agent-process-pre-card">
        {step.args && (
          <div className="agent-process-pre-section">
            <div className="agent-process-pre-label">参数</div>
            <ToolArgsView args={step.args} />
          </div>
        )}
        {step.result && (
          <div className="agent-process-pre-section">
            <div className="agent-process-pre-label">结果</div>
            <pre>{normalizeResult(step.result)}</pre>
          </div>
        )}
      </div>
    );
  }
  if (step.kind === "task_list" && step.tasks) {
    return (
      <div className="agent-process-task-list">
        {step.tasks.map((task) => (
          <div key={task.id} className="agent-process-task-row" data-status={task.status}>
            <Icon name={task.status === "completed" ? "check" : task.status === "in-progress" ? "spinner" : "minus"} size={12} />
            <span>{task.title}</span>
          </div>
        ))}
      </div>
    );
  }
  if (step.kind === "artifacts" && step.blocks) {
    return (
      <div className="agent-process-artifacts">
        {step.blocks.map((block) => {
          if (block.type === "artifact") {
            return block.kind === "markdown"
              ? <MarkdownContent key={block.id} markdown={block.content} projectDirectory={projectDirectory} className="agent-process-markdown" variant="feedback" enableComposerTokens />
              : <pre key={block.id}>{block.content}</pre>;
          }
          if (block.type === "file_change") {
            return <div key={block.id} className="agent-process-file-change">{block.changeType}: {block.path}</div>;
          }
          return null;
        })}
      </div>
    );
  }
  if ((step.kind === "permission" || step.kind === "error") && step.detail) {
    return <p className="agent-process-detail-note">{step.detail}</p>;
  }
  return null;
}

export function AgentProcessGroup({ blocks, isStreaming = false, projectDirectory }: { blocks: AgentContentBlock[]; isStreaming?: boolean; projectDirectory?: string }) {
  const steps = useMemo(() => extractSteps(blocks), [blocks]);
  const hasBusyStep = steps.some((step) => step.status === "pending" || step.status === "running");
  const [expanded, setExpanded] = useState(isStreaming || hasBusyStep);
  const [mode, setMode] = useState<ProcessViewMode>("tabs");
  const [activeIndex, setActiveIndex] = useState(0);
  const [openSteps, setOpenSteps] = useState<Record<number, boolean>>({});
  const stepScrollRef = useRef<HTMLDivElement>(null);
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const wasStreamingRef = useRef(false);
  const [showStepTopShadow, setShowStepTopShadow] = useState(false);
  const [showStepBottomShadow, setShowStepBottomShadow] = useState(false);
  const [showTabTopShadow, setShowTabTopShadow] = useState(false);
  const [showTabBottomShadow, setShowTabBottomShadow] = useState(false);
  const prevStepsLenRef = useRef(0);
  const autoOpenedIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (isStreaming || hasBusyStep) {
      wasStreamingRef.current = true;
      setExpanded(true);
      return;
    }
    if (wasStreamingRef.current) {
      setOpenSteps((current) => {
        const collapsed: Record<number, boolean> = {};
        Object.keys(current).forEach((key) => {
          collapsed[Number(key)] = false;
        });
        return collapsed;
      });
      setActiveIndex(0);
      setShowStepTopShadow(false);
      setShowStepBottomShadow(false);
      autoOpenedIndexRef.current = null;
      prevStepsLenRef.current = 0;
      const collapseTimer = window.setTimeout(() => setExpanded(false), 300);
      wasStreamingRef.current = false;
      return () => window.clearTimeout(collapseTimer);
    }
  }, [hasBusyStep, isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;
    const count = steps.length;
    if (count !== prevStepsLenRef.current && count > 0) {
      const newIndex = count - 1;
      if (mode === "tabs") {
        setActiveIndex(newIndex);
      } else {
        const previousIndex = autoOpenedIndexRef.current;
        setOpenSteps((current) => {
          const next = { ...current };
          if (previousIndex !== null && previousIndex !== newIndex) next[previousIndex] = false;
          next[newIndex] = true;
          return next;
        });
        autoOpenedIndexRef.current = newIndex;
      }
    }
    prevStepsLenRef.current = count;
  }, [isStreaming, mode, steps.length]);

  useEffect(() => {
    if (activeIndex >= steps.length) setActiveIndex(Math.max(0, steps.length - 1));
  }, [activeIndex, steps.length]);

  const toggleStep = useCallback((index: number) => {
    setOpenSteps((current) => ({ ...current, [index]: !current[index] }));
  }, []);

  const updateStepShadows = useCallback(() => {
    const element = stepScrollRef.current;
    if (!element) return;
    setShowStepTopShadow(element.scrollTop > 0);
    setShowStepBottomShadow(element.scrollHeight - element.scrollTop - element.clientHeight > 1);
  }, []);

  const updateTabShadows = useCallback(() => {
    const element = tabScrollRef.current;
    if (!element) return;
    setShowTabTopShadow(element.scrollTop > 0);
    setShowTabBottomShadow(element.scrollHeight - element.scrollTop - element.clientHeight > 1);
  }, []);

  useEffect(() => {
    const element = stepScrollRef.current;
    if (!element || mode !== "timeline" || !expanded || !isStreaming) {
      setShowStepTopShadow(false);
      setShowStepBottomShadow(false);
      return;
    }
    const resizeObserver = new ResizeObserver(updateStepShadows);
    const frameId = requestAnimationFrame(updateStepShadows);
    element.addEventListener("scroll", updateStepShadows, { passive: true });
    resizeObserver.observe(element);
    return () => {
      cancelAnimationFrame(frameId);
      element.removeEventListener("scroll", updateStepShadows);
      resizeObserver.disconnect();
    };
  }, [blocks, expanded, isStreaming, mode, openSteps, steps.length, updateStepShadows]);

  useEffect(() => {
    const element = tabScrollRef.current;
    if (!element || mode !== "tabs" || !expanded) return;
    element.scrollTop = 0;
    const resizeObserver = new ResizeObserver(updateTabShadows);
    const frameId = requestAnimationFrame(updateTabShadows);
    element.addEventListener("scroll", updateTabShadows, { passive: true });
    resizeObserver.observe(element);
    return () => {
      cancelAnimationFrame(frameId);
      element.removeEventListener("scroll", updateTabShadows);
      resizeObserver.disconnect();
    };
  }, [activeIndex, expanded, mode, steps.length, updateTabShadows]);

  useEffect(() => {
    if (!isStreaming || mode !== "timeline") return;
    const element = stepScrollRef.current;
    if (!element) return;
    const frameId = requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
      updateStepShadows();
    });
    return () => cancelAnimationFrame(frameId);
  }, [blocks, isStreaming, mode, openSteps, steps.length, updateStepShadows]);

  useEffect(() => {
    if (!isStreaming || mode !== "tabs" || activeIndex !== steps.length - 1) return;
    const element = tabScrollRef.current;
    if (!element) return;
    const frameId = requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
      updateTabShadows();
    });
    return () => cancelAnimationFrame(frameId);
  }, [activeIndex, blocks, isStreaming, mode, steps.length, updateTabShadows]);

  if (steps.length === 0) return null;

  const toolCount = steps.filter((step) => step.kind === "tool").length;
  const thinkingCount = steps.filter((step) => step.kind === "thinking").length;
  const artifactCount = steps.reduce((count, step) => count + (step.blocks?.length || 0), 0);
  const taskCount = steps.filter((step) => step.kind === "task_list").length;
  const isSingleThinking = steps.length === 1 && steps[0]?.kind === "thinking" && !isStreaming;
  const summaryParts = [
    toolCount > 0 ? `${toolCount} 个工具` : "",
    thinkingCount > 0 ? `${thinkingCount} 次思考` : "",
    taskCount > 0 ? `${taskCount} 组任务` : "",
    artifactCount > 0 ? `${artifactCount} 个产物` : "",
  ].filter(Boolean);
  const summary = hasBusyStep || isStreaming ? "正在工作..." : isSingleThinking ? "已思考" : summaryParts.length > 0 ? `已使用 ${summaryParts.join("、")}` : "已完成过程记录";
  const activeStep = steps[activeIndex] || steps[0];

  return (
    <section className="agent-process-stream" data-expanded={expanded} data-mode={mode} data-streaming={isStreaming || hasBusyStep}>
      <div className="agent-process-stream-head">
        <button type="button" className="agent-process-summary" onClick={() => setExpanded((value) => !value)}>
          <span>{summary}</span>
          <Icon name="chevron-right" size={12} className="agent-process-caret" />
        </button>
        {steps.length > 1 && !isSingleThinking && (
          <button
            type="button"
            className="agent-process-mode-toggle"
            onClick={() => setMode((value) => value === "timeline" ? "tabs" : "timeline")}
            title={mode === "timeline" ? "切换到标签模式" : "切换到时间线模式"}
          >
            <Icon name={mode === "timeline" ? "rows" : "list"} size={13} />
          </button>
        )}
      </div>
      {expanded && (
        <div className="agent-process-stream-body">
          {isSingleThinking ? (
            <div className="agent-process-single-thinking">
              <StepDetail step={steps[0]} projectDirectory={projectDirectory} />
            </div>
          ) : mode === "timeline" ? (
            <div className="agent-process-timeline-compact">
              <div className="agent-process-timeline-corner" />
              {steps.map((step, index) => {
                const isOpen = openSteps[index] ?? (isStreaming && index === steps.length - 1);
                const isLast = index === steps.length - 1;
                const isStreamingStep = isStreaming && index === steps.length - 1;
                const hasContent = stepHasContent(step);
                return (
                  <div key={`${step.kind}-${index}`} className="agent-process-step-compact" data-kind={step.kind} data-status={step.status} data-has-content={hasContent}>
                    {!isLast && <span className="agent-process-step-line" />}
                    <button type="button" className="agent-process-step-head" onClick={() => hasContent && toggleStep(index)}>
                      <Icon name={stepIconName(step)} size={13} />
                      <span>{step.label}</span>
                      {hasContent && <Icon name="chevron-right" size={11} className="agent-process-step-caret" style={{ transform: isOpen ? "rotate(90deg)" : undefined }} />}
                    </button>
                    {isOpen && hasContent && (
                      <div className="agent-process-step-detail" data-kind={step.kind}>
                        {isStreamingStep ? (
                          <div className="agent-process-scroll-shell" data-kind="step">
                            {showStepTopShadow && <div className="agent-process-edge-shadow agent-process-edge-shadow-top" />}
                            {showStepBottomShadow && <div className="agent-process-edge-shadow agent-process-edge-shadow-bottom" />}
                            <div ref={stepScrollRef} className="agent-process-step-detail-scroll" data-streaming="true">
                              <StepDetail step={step} projectDirectory={projectDirectory} />
                            </div>
                          </div>
                        ) : (
                          <StepDetail step={step} projectDirectory={projectDirectory} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="agent-process-tab-mode">
              <div className="agent-process-step-tabs" role="tablist">
                {steps.map((step, index) => (
                  <button key={`${step.kind}-${index}`} type="button" className={activeIndex === index ? "active" : ""} onClick={() => setActiveIndex(index)}>
                    <Icon name={stepIconName(step)} size={11} />
                    <span>{step.label}</span>
                  </button>
                ))}
              </div>
              {activeStep && (
                <div className="agent-process-scroll-shell" data-kind="tab">
                  {showTabTopShadow && <div className="agent-process-edge-shadow agent-process-edge-shadow-top" />}
                  {showTabBottomShadow && <div className="agent-process-edge-shadow agent-process-edge-shadow-bottom" />}
                  <div ref={tabScrollRef} key={`${activeStep.kind}-${activeIndex}`} className="agent-process-tab-detail" data-kind={activeStep.kind}>
                    <StepDetail step={activeStep} projectDirectory={projectDirectory} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ToolArgsView({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args);
  if (entries.length === 0) return <p className="agent-process-detail-note">无参数</p>;
  return (
    <div className="agent-tool-args">
      {entries.map(([key, value]) => (
        <div key={key} className="agent-tool-arg-row">
          <span className="agent-tool-arg-name">{key}</span>
          <ToolArgValue value={value} />
        </div>
      ))}
    </div>
  );
}

function ToolArgValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <span className="agent-tool-arg-chips">
        {value.map((item, index) => (
          <code key={index} className="agent-tool-arg-chip">{formatScalar(item)}</code>
        ))}
      </span>
    );
  }
  if (isRecord(value)) {
    return <pre className="agent-tool-arg-json">{prettyArgs(value)}</pre>;
  }
  return <code className="agent-tool-arg-value">{formatScalar(value)}</code>;
}