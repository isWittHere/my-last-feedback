import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentConsoleSettings, type AgentApprovalDisplayMode, type AgentProcessStepDefaultMode, type AgentTodoUpdateDisplayMode } from "../../agentConsoleSettings";
import { getApprovalDisplayDescription, isCommandLikeApproval } from "../../agent/approvalDisplay";
import type { AgentContentBlock } from "../../agent/types";
import { buildAgentProcessSteps, type AgentStepItem } from "../../agent/steps";
import { basenameResourcePath, getAgentStepDisplayLabel, getAgentStepTarget, getAgentStepTypeLabel, getAgentStepVisualDescriptor } from "../../agent/stepVisuals";
import { useFeedbackStore } from "../../store/feedbackStore";
import { CatppuccinResourceIcon } from "../CatppuccinResourceIcon";
import { Icon } from "../Icons";
import { MarkdownContent } from "../MarkdownContent";
import { AgentApprovalActions } from "./AgentCurrentStatusRow";

type ProcessViewMode = AgentProcessStepDefaultMode;

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

function collapseConsecutiveBlankLines(text: string): string {
  return text.replace(/(?:[ \t]*\n){3,}/g, "\n\n");
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

function stepIconName(step: AgentStepItem): string {
  return getAgentStepVisualDescriptor(step).iconName;
}

function stepHasContent(step: AgentStepItem, options?: { todoUpdateDisplayMode?: AgentTodoUpdateDisplayMode; approvalDisplayMode?: AgentApprovalDisplayMode }): boolean {
  if (step.kind === "thinking") return Boolean(step.detail);
  if (step.kind === "compaction") return true;
  if (step.kind === "tool") return Boolean(step.args || step.result || (options?.approvalDisplayMode !== "statusPanel" && step.permissions?.length));
  if (step.kind === "task_list") return options?.todoUpdateDisplayMode === "countOnly" ? false : Boolean(step.tasks?.length);
  if (step.kind === "artifacts") return Boolean(step.blocks?.length);
  return Boolean(step.detail);
}

function AgentProcessFileTag({ path }: { path: string }) {
  const resourceIconTheme = useFeedbackStore((state) => state.resourceIconTheme);
  const label = basenameResourcePath(path);
  return (
    <span className="readonly-resource-tag agent-process-file-tag" data-tooltip={`File\n${path}`} data-tooltip-placement="top">
      {resourceIconTheme === "catppuccin" ? (
        <CatppuccinResourceIcon entry={{ name: label, relativePath: path, kind: "file" }} size={12} className="readonly-resource-icon" />
      ) : (
        <Icon name="file-text" size={11} />
      )}
      <span>{label}</span>
    </span>
  );
}

function StepHeadLabel({ step, fallbackLabel }: { step: AgentStepItem; fallbackLabel: string }) {
  const { t } = useTranslation();
  const target = getAgentStepTarget(step);
  if (target && (step.tone === "document_change" || step.tone === "document_read")) {
    return (
      <>
        <span className="agent-process-step-label-text">{getAgentStepTypeLabel(step, t)}</span>
        <AgentProcessFileTag path={target} />
      </>
    );
  }
  return <span className="agent-process-step-label-text">{getAgentStepDisplayLabel(step, t, fallbackLabel)}</span>;
}

function stepHasFileTarget(step: AgentStepItem): boolean {
  return Boolean(getAgentStepTarget(step) && (step.tone === "document_change" || step.tone === "document_read"));
}

function isRejectedPermission(permission: NonNullable<AgentStepItem["permissions"]>[number]): boolean {
  if (!permission.selectedOptionId) return false;
  const selectedOption = permission.options.find((option) => option.id === permission.selectedOptionId);
  if (selectedOption?.kind === "reject_once") return true;
  return /reject|deny/i.test(permission.selectedOptionId);
}

function AgentProcessAttachedApproval({ step, permission, sessionId }: { step: AgentStepItem; permission: NonNullable<AgentStepItem["permissions"]>[number]; sessionId?: string }) {
  const { t } = useTranslation();
  const isPending = permission.status === "pending";
  const isRejected = isRejectedPermission(permission);
  const isCommandApproval = isCommandLikeApproval({ permission, args: step.args, tone: step.tone, fallbackTitle: step.label });
  const description = isCommandApproval ? getApprovalDisplayDescription({ permission, args: step.args, tone: step.tone, fallbackTitle: step.label }) : permission.title;
  const statusLabel = isRejected
    ? t("agentConsole.stepTypes.approvalRejected", "Approval rejected")
    : isPending
      ? t("agentConsole.requestApproval", "Request approval")
      : isCommandApproval
        ? t("agentConsole.permissionApprovedShort", "Approved")
        : t("agentConsole.permissionResolved", "Permission request resolved");
  return (
    <div className="agent-process-attached-approval" data-status={permission.status} data-rejected={isRejected ? "true" : undefined} data-compact={isCommandApproval ? "true" : undefined}>
      <div className="agent-process-attached-approval-main">
        {!isCommandApproval && <Icon name={isRejected ? "circle-x" : isPending ? "shield" : "check"} size={13} />}
        <span className={isPending ? "agent-silver-shimmer-text" : undefined}>{statusLabel}</span>
        <span className="agent-process-attached-approval-title" title={description}>{description}</span>
      </div>
      {isPending && sessionId ? (
        <AgentApprovalActions sessionId={sessionId} requestId={permission.requestId} options={permission.options} />
      ) : !isRejected && !isCommandApproval ? (
        <span className="agent-process-attached-approval-state">{t("agentConsole.permissionResolvedShort", "已处理")}</span>
      ) : null}
    </div>
  );
}

function StepDetail({ step, projectDirectory, sessionId, approvalDisplayMode = "all", collapseOutputBlankLines = false }: { step: AgentStepItem; projectDirectory?: string; sessionId?: string; approvalDisplayMode?: AgentApprovalDisplayMode; collapseOutputBlankLines?: boolean }) {
  if (step.kind === "thinking" && step.detail) {
    return <MarkdownContent markdown={step.detail} projectDirectory={projectDirectory} className="agent-process-markdown" variant="feedback" enableComposerTokens />;
  }
  if (step.kind === "compaction") {
    return step.detail
      ? <MarkdownContent markdown={step.detail} projectDirectory={projectDirectory} className="agent-process-markdown" variant="feedback" enableComposerTokens />
      : <p className="agent-process-detail-note">{step.status === "running" ? "正在压缩上下文" : step.status === "failed" ? "上下文压缩失败" : "上下文已压缩"}</p>;
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
            <pre>{collapseOutputBlankLines ? collapseConsecutiveBlankLines(normalizeResult(step.result)) : normalizeResult(step.result)}</pre>
          </div>
        )}
        {approvalDisplayMode !== "statusPanel" && step.permissions?.map((permission) => (
          <div key={permission.id} className="agent-process-pre-section agent-process-pre-section-approval">
            <AgentProcessAttachedApproval step={step} permission={permission} sessionId={sessionId} />
          </div>
        ))}
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
            {task.priority && <span className="agent-task-priority" data-priority={task.priority}>{task.priority === "high" ? "高" : task.priority === "medium" ? "中" : "低"}</span>}
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

interface AgentFocusStepEventDetail {
  messageId: string;
  stepId?: string;
}

export function AgentProcessGroup({ blocks, messageId, sessionId, isStreaming = false, projectDirectory, staleActivityNotice }: { blocks: AgentContentBlock[]; messageId?: string; sessionId?: string; isStreaming?: boolean; projectDirectory?: string; staleActivityNotice?: string }) {
  const { t } = useTranslation();
  const { approvalDisplayMode, collapseConsecutiveOutputBlankLines, processStepDefaultMode, timelineStreamingStepMode, todoUpdateDisplayMode } = useAgentConsoleSettings();
  const steps = useMemo(() => buildAgentProcessSteps(blocks, messageId, isStreaming ? "streaming" : "complete"), [blocks, messageId, isStreaming]);
  const staleStepTooltip = t("agentConsole.staleProcessStepTooltip", "This process state was still marked running.");
  const hasBusyStep = steps.some((step) => step.status === "pending" || step.status === "running");
  const [expanded, setExpanded] = useState(isStreaming || hasBusyStep);
  const [mode, setMode] = useState<ProcessViewMode>(processStepDefaultMode);
  const [activeIndex, setActiveIndex] = useState(0);
  const [openSteps, setOpenSteps] = useState<Record<number, boolean>>({});
  const groupRef = useRef<HTMLElement>(null);
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
      setExpanded(mode === "timeline" && timelineStreamingStepMode === "hidden" ? false : true);
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
  }, [hasBusyStep, isStreaming, mode, timelineStreamingStepMode]);

  useEffect(() => {
    if (!isStreaming) return;
    if (mode === "timeline" && timelineStreamingStepMode === "hidden") {
      setOpenSteps({});
      prevStepsLenRef.current = steps.length;
      return;
    }
    const count = steps.length;
    if (count !== prevStepsLenRef.current && count > 0) {
      const newIndex = count - 1;
      if (mode === "tabs") {
        setActiveIndex(newIndex);
      } else if (timelineStreamingStepMode === "expandAll") {
        setOpenSteps(Object.fromEntries(steps.map((step, stepIndex) => [stepIndex, stepHasContent(step, { approvalDisplayMode, todoUpdateDisplayMode })])));
        autoOpenedIndexRef.current = newIndex;
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
  }, [approvalDisplayMode, isStreaming, mode, steps, steps.length, timelineStreamingStepMode, todoUpdateDisplayMode]);

  useEffect(() => {
    if (activeIndex >= steps.length) setActiveIndex(Math.max(0, steps.length - 1));
  }, [activeIndex, steps.length]);

  useEffect(() => {
    setMode(processStepDefaultMode);
  }, [messageId, processStepDefaultMode]);

  useEffect(() => {
    if (!messageId) return;
    const handleFocusStep = (event: Event) => {
      const detail = (event as CustomEvent<AgentFocusStepEventDetail>).detail;
      if (!detail || detail.messageId !== messageId) return;
      if (!detail.stepId) return;
      const targetStepId = detail.stepId;
      const targetIndex = steps.findIndex((step) => step.id === targetStepId || step.blockIds.includes(targetStepId));
      if (targetIndex < 0) return;
      setExpanded(true);
      setActiveIndex(targetIndex);
      setOpenSteps((current) => ({ ...current, [targetIndex]: true }));
      requestAnimationFrame(() => {
        groupRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    };
    window.addEventListener("mlfb-agent-focus-step", handleFocusStep);
    return () => window.removeEventListener("mlfb-agent-focus-step", handleFocusStep);
  }, [messageId, steps]);

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
  const compactionCount = steps.filter((step) => step.kind === "compaction").length;
  const artifactCount = steps.reduce((count, step) => count + (step.blocks?.length || 0), 0);
  const taskCount = steps.filter((step) => step.kind === "task_list").length;
  const isSingleInlineProcess = steps.length === 1 && (steps[0]?.kind === "thinking" || steps[0]?.kind === "compaction") && !isStreaming;
  const summaryParts = [
    toolCount > 0 ? `${toolCount} 个工具` : "",
    thinkingCount > 0 ? `${thinkingCount} 次思考` : "",
    compactionCount > 0 ? `${compactionCount} 次压缩` : "",
    taskCount > 0 ? `${taskCount} 组任务` : "",
    artifactCount > 0 ? `${artifactCount} 个产物` : "",
  ].filter(Boolean);
  const singleInlineProcessLabel = steps[0]?.kind === "thinking" && steps[0]?.status === "completed"
    ? t("agentConsole.singleThinkingCompleted", "已思考")
    : steps[0]?.label;
  const summary = hasBusyStep || isStreaming ? "正在工作..." : isSingleInlineProcess ? singleInlineProcessLabel : summaryParts.length > 0 ? `已使用 ${summaryParts.join("、")}` : "已完成过程记录";
  const activeStep = steps[activeIndex] || steps[0];
  const effectiveApprovalDisplayMode = mode === "timeline" ? approvalDisplayMode : "all";
  const effectiveTodoUpdateDisplayMode = mode === "timeline" ? todoUpdateDisplayMode : "panel";

  return (
    <section ref={groupRef} className="agent-process-stream" data-expanded={expanded} data-mode={mode} data-streaming={isStreaming || hasBusyStep}>
      <div className="agent-process-stream-head">
        <button type="button" className="agent-process-summary" onClick={() => setExpanded((value) => !value)}>
          <span className={hasBusyStep || isStreaming ? "agent-silver-shimmer-text" : undefined}>{summary}</span>
          <Icon name="chevron-right" size={12} className="agent-process-caret" />
        </button>
        {steps.length > 1 && !isSingleInlineProcess && (
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
      {staleActivityNotice ? (
        <p className="agent-process-stale-note">
          <Icon name="info" size={13} />
          <span>{staleActivityNotice}</span>
        </p>
      ) : null}
      {expanded && (
        <div className="agent-process-stream-body">
          {isSingleInlineProcess ? (
            <div className="agent-process-single-thinking" data-kind={steps[0].kind}>
              <StepDetail step={steps[0]} projectDirectory={projectDirectory} sessionId={sessionId} approvalDisplayMode={effectiveApprovalDisplayMode} collapseOutputBlankLines={collapseConsecutiveOutputBlankLines} />
            </div>
          ) : mode === "timeline" ? (
            <div className="agent-process-timeline-compact">
              <div className="agent-process-timeline-corner" />
              {steps.map((step, index) => {
                const isOpen = openSteps[index] ?? (isStreaming && timelineStreamingStepMode !== "hidden" && (timelineStreamingStepMode === "expandAll" || index === steps.length - 1));
                const isLast = index === steps.length - 1;
                const isStreamingStep = isStreaming && index === steps.length - 1;
                const hasContent = stepHasContent(step, { approvalDisplayMode: effectiveApprovalDisplayMode, todoUpdateDisplayMode: effectiveTodoUpdateDisplayMode });
                const hasFileTarget = stepHasFileTarget(step);
                return (
                  <div key={`${step.kind}-${index}`} className="agent-process-step-compact" data-kind={step.kind} data-status={step.status} data-has-content={hasContent}>
                    {!isLast && <span className="agent-process-step-line" />}
                    <button type="button" className="agent-process-step-head" data-has-file-target={hasFileTarget ? "true" : undefined} onClick={() => hasContent && toggleStep(index)}>
                      <Icon name={stepIconName(step)} size={13} />
                      <StepHeadLabel step={step} fallbackLabel={step.label} />
                      {step.staleRunningState && (
                        <span className="agent-process-stale-step-icon">
                          <Icon name="circle-warning" size={13} />
                          <span className="agent-process-stale-step-tip">{staleStepTooltip}</span>
                        </span>
                      )}
                      {hasContent && <Icon name="chevron-right" size={11} className="agent-process-step-caret" style={{ transform: isOpen ? "rotate(90deg)" : undefined }} />}
                    </button>
                    {isOpen && hasContent && (
                      <div className="agent-process-step-detail" data-kind={step.kind}>
                        <div className="agent-process-scroll-shell" data-kind="step">
                          {isStreamingStep && showStepTopShadow && <div className="agent-process-edge-shadow agent-process-edge-shadow-top" />}
                          {isStreamingStep && showStepBottomShadow && <div className="agent-process-edge-shadow agent-process-edge-shadow-bottom" />}
                          <div ref={isStreamingStep ? stepScrollRef : undefined} className="agent-process-step-detail-scroll" data-streaming={isStreamingStep ? "true" : undefined}>
                            <StepDetail step={step} projectDirectory={projectDirectory} sessionId={sessionId} approvalDisplayMode={effectiveApprovalDisplayMode} collapseOutputBlankLines={collapseConsecutiveOutputBlankLines} />
                          </div>
                        </div>
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
                  <button key={`${step.kind}-${index}`} type="button" className={activeIndex === index ? "active" : ""} data-has-file-target={stepHasFileTarget(step) ? "true" : undefined} onClick={() => setActiveIndex(index)}>
                    <Icon name={stepIconName(step)} size={11} />
                    <StepHeadLabel step={step} fallbackLabel={step.label} />
                    {step.staleRunningState && (
                      <span className="agent-process-stale-step-icon">
                        <Icon name="circle-warning" size={13} />
                        <span className="agent-process-stale-step-tip">{staleStepTooltip}</span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {activeStep && (
                <div className="agent-process-scroll-shell" data-kind="tab">
                  {showTabTopShadow && <div className="agent-process-edge-shadow agent-process-edge-shadow-top" />}
                  {showTabBottomShadow && <div className="agent-process-edge-shadow agent-process-edge-shadow-bottom" />}
                  <div ref={tabScrollRef} key={`${activeStep.kind}-${activeIndex}`} className="agent-process-tab-detail" data-kind={activeStep.kind}>
                    <StepDetail step={activeStep} projectDirectory={projectDirectory} sessionId={sessionId} approvalDisplayMode={effectiveApprovalDisplayMode} collapseOutputBlankLines={collapseConsecutiveOutputBlankLines} />
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