import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BLUEPRINT_TEMPLATE_OPTIONS,
  ORCHESTRATION_PRESETS,
  STAGE_TEMPLATE_OPTIONS,
  createBlueprintFromTemplate,
  customizeOrchestrationPolicy,
  getCeoGateMode,
  getDefaultOrchestrationPolicy,
  getStageTemplatePromptDefaults,
  isClosingStage,
  setPolicyCeoGateMode,
  useMLRAStore,
  type BlueprintTemplateId,
  type CeoGateMode,
  type Launcher,
  type OrchestrationPolicy,
  type StageBlueprint,
  type StageTemplateId,
  type SubmitReleasePolicy,
  type WorkflowBlueprint,
} from "../store/mlraStore";
import { Icon } from "./Icons";

interface LauncherHomeProps {
  launcher: Launcher | null;
}

type InspectorTab = "basics" | "prompts" | "rules" | "skills";

type StartCondition = {
  id: string;
  label: string;
  passed: boolean;
};

const STAGE_ICON_OPTIONS = [
  { value: "git-branch", label: "Branch" },
  { value: "wrench", label: "Tool" },
  { value: "search", label: "Search" },
  { value: "message-dot", label: "Message" },
  { value: "check", label: "Check" },
  { value: "pin", label: "Pin" },
  { value: "robot", label: "Robot" },
  { value: "flag", label: "Closing" },
  { value: "file-text", label: "Text" },
] as const;

const BUILTIN_SKILL_OPTIONS = [
  "submit_plan_draft",
  "review_plan",
  "submit_phase_report",
  "review_phase",
  "ceo_verdict",
  "re_verify",
  "decision_levels",
  "hallucination_check",
  "failure_recovery",
  "vote_discipline",
] as const;

function getStageTemplateLabel(templateId: StageTemplateId | null, translate: (key: string, defaultValue: string) => string): string {
  if (!templateId) return translate("mlra.stageTemplate.custom", "Custom");
  const match = STAGE_TEMPLATE_OPTIONS.find((option) => option.id === templateId);
  return match ? translate(`mlra.stageTemplate.${match.id}.label`, match.label) : translate("mlra.stageTemplate.custom", "Custom");
}

function getStageIssues(stage: StageBlueprint | null, translate: (key: string, defaultValue: string) => string): string[] {
  if (!stage) return [];
  const issues: string[] = [];
  if (!stage.name.trim()) issues.push(translate("mlra.stage.issueMissingName", "Missing stage name"));
  return issues;
}

function getStartConditions(blueprint: WorkflowBlueprint, taskText: string, translate: (key: string, defaultValue: string) => string): StartCondition[] {
  const stages = [...blueprint.stages].sort((left, right) => left.order - right.order);
  const nonClosingStages = stages.filter((stage) => !isClosingStage(stage));
  const lastNonClosingStage = nonClosingStages[nonClosingStages.length - 1] || null;
  const lastStage = stages[stages.length - 1] || null;

  return [
    {
      id: "task",
      label: translate("mlra.start.conditionTask", "Task description is filled"),
      passed: taskText.trim().length > 0,
    },
    {
      id: "stage-count",
      label: translate("mlra.start.conditionStageCount", "Contains at least one normal stage"),
      passed: nonClosingStages.length > 0,
    },
    {
      id: "stage-names",
      label: translate("mlra.start.conditionStageNames", "All stages have names"),
      passed: stages.length > 0 && stages.every((stage) => stage.name.trim().length > 0),
    },
    {
      id: "final-gate",
      label: translate("mlra.start.conditionFinalGate", "The last normal stage has exit gate enabled"),
      passed: !!lastNonClosingStage?.exitGateEnabled,
    },
    {
      id: "closing",
      label: translate("mlra.start.conditionClosing", "Blueprint ends with a closing summary stage"),
      passed: !!lastStage && isClosingStage(lastStage),
    },
  ];
}

function getStagePromptDefaults(stage: StageBlueprint): Pick<StageBlueprint, "promptExpert" | "promptInspector" | "promptCeo"> {
  const templateDefaults = getStageTemplatePromptDefaults(stage.templateId);
  return {
    promptExpert: stage.promptExpert || templateDefaults.promptExpert || stage.promptOverride || "",
    promptInspector: stage.promptInspector || templateDefaults.promptInspector || stage.promptOverride || "",
    promptCeo: stage.promptCeo || templateDefaults.promptCeo || stage.promptOverride || "",
  };
}

function DetailSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="mlra-editor-section">
      {title ? (
        <div className="mlra-editor-section-head">
          <h3 className="mlra-editor-section-title">{title}</h3>
        </div>
      ) : null}
      <div className="mlra-editor-section-body">{children}</div>
    </section>
  );
}

function SkillToggle({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`mlra-task-type-chip mlra-skill-tag${selected ? " active" : ""}`} onClick={onClick}>
      {label}
      {selected ? <Icon name="check" size={12} /> : null}
    </button>
  );
}

function InspectorTabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <div className={`mlra-inspector-tab-slot${active ? " active" : ""}`}>
      <button className={`mlra-inspector-tab${active ? " active" : ""}`} onClick={onClick}>
        <Icon name={icon} size={14} />
        {label}
      </button>
    </div>
  );
}

function PolicyOptionButton<T extends string>({
  active,
  label,
  description,
  icon,
  value,
  onSelect,
}: {
  active: boolean;
  label: string;
  description?: string;
  icon?: string;
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      className={`mlra-policy-option${active ? " active" : ""}`}
      title={description || label}
      onClick={() => onSelect(value)}
    >
      {icon ? <Icon name={icon} size={12} /> : null}
      <span className="mlra-policy-option-label">{label}</span>
    </button>
  );
}

function PolicyControlRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; description?: string; icon?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="mlra-policy-control-row">
      <span className="mlra-policy-control-label">{label}</span>
      <div className="mlra-policy-control-options">
        {options.map((option) => (
          <PolicyOptionButton
            key={option.value}
            active={option.value === value}
            label={option.label}
            description={option.description}
            icon={option.icon}
            value={option.value}
            onSelect={onChange}
          />
        ))}
      </div>
    </div>
  );
}

function CustomSelect<T extends string>({
  value,
  options,
  onChange,
  layout = "list",
  compact = false,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; description?: string; icon?: string }>;
  onChange: (value: T) => void;
  layout?: "list" | "grid";
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!open) return;
    const handle = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div className={`mlra-custom-select${compact ? " mlra-custom-select--compact" : ""}`} ref={ref}>
      {compact ? (
        <button
          type="button"
          className={`mlra-custom-select-trigger-compact${open ? " open" : ""}`}
          onClick={() => setOpen((v) => !v)}
          title={currentOption?.label}
        >
          {currentOption?.icon ? <Icon name={currentOption.icon} size={14} /> : <span>?</span>}
        </button>
      ) : (
        <button
          type="button"
          className={`mlra-custom-select-trigger${open ? " open" : ""}`}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="mlra-custom-select-label">
            {currentOption?.icon ? <Icon name={currentOption.icon} size={13} /> : null}
            {currentOption?.label ?? "—"}
          </span>
          <Icon name="chevron-down" size={11} className="app-disclosure-icon" />
        </button>
      )}
      {open && (
        layout === "grid" ? (
          <div className="mlra-custom-select-panel mlra-custom-select-panel-grid">
            {options.map((opt) => (
              <button
                key={opt.value || "__empty__"}
                type="button"
                className={`mlra-custom-select-opt-grid${opt.value === value ? " selected" : ""}`}
                title={opt.label}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.icon ? <Icon name={opt.icon} size={16} /> : <span>{opt.label[0]}</span>}
              </button>
            ))}
          </div>
        ) : (
          <div className="mlra-custom-select-panel">
            {options.map((opt) => (
              <button
                key={opt.value || "__empty__"}
                type="button"
                className={`mlra-custom-select-option${opt.value === value ? " selected" : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.icon ? <Icon name={opt.icon} size={13} /> : null}
                <div className="mlra-custom-select-option-content">
                  <span className="mlra-custom-select-option-label">{opt.label}</span>
                  {opt.description ? <span className="mlra-custom-select-option-desc">{opt.description}</span> : null}
                </div>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function StraightConnector() {
  return (
    <svg className="mlra-flow-connector-line" viewBox="0 0 2 28" preserveAspectRatio="none" aria-hidden="true">
      <line x1="1" y1="0" x2="1" y2="28" />
    </svg>
  );
}

function BlueprintNode({
  stage,
  selected,
  dragging,
  dropTarget,
  runtimeState,
  translateY,
  issueCount,
  canDrag,
  onSelect,
  onGripPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  stage: StageBlueprint;
  selected: boolean;
  dragging: boolean;
  dropTarget: boolean;
  runtimeState: "idle" | "current" | "completed";
  translateY: number;
  issueCount: number;
  canDrag: boolean;
  onSelect: () => void;
  onGripPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const { t } = useTranslation();
  return (
    <article
      className={[
        "mlra-stage-node",
        selected ? "selected" : "",
        dragging ? "dragging" : "",
        dropTarget ? "drop-target" : "",
        runtimeState,
      ].filter(Boolean).join(" ")}
      onClick={onSelect}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        transform: `translateY(${translateY}px)`,
        transition: dragging ? "none" : "transform 0.2s ease, border-color 0.15s ease, opacity 0.15s ease, background 0.15s ease",
        zIndex: dragging ? 10 : 1,
      }}
    >
      <div className="mlra-stage-node-top">
        <button
          type="button"
          className="mlra-stage-node-order-zone mlra-stage-node-order-handle"
          title={canDrag ? t("mlra.stage.dragReorder", "Drag to reorder") : t("mlra.stage.dragAfterEdit", "Start editing before dragging to reorder")}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={onGripPointerDown}
        >
          <span className="mlra-stage-node-order">{stage.order + 1}</span>
        </button>
        <div className="mlra-stage-node-divider" aria-hidden="true" />
        <div className="mlra-stage-node-content">
          <div className="mlra-stage-node-icon-shell">
            <div className="mlra-stage-node-icon" aria-hidden="true">
              <Icon name={stage.icon} size={14} />
            </div>
          </div>
          <div className="mlra-stage-node-main">
            <div className="mlra-stage-node-title-row">
              <span className="mlra-stage-node-title">{stage.name || t("mlra.stage.untitled", "Untitled stage")}</span>
            </div>
            <div className="mlra-stage-node-meta">
              <span>{getStageTemplateLabel(stage.templateId, t)}</span>
              {issueCount > 0 ? <span>{t("mlra.stage.issueCount", "{{count}} issue(s)", { count: issueCount })}</span> : null}
              {runtimeState === "current" ? <span>{t("mlra.stage.current", "Current")}</span> : null}
            </div>
          </div>
        </div>
      </div>

    </article>
  );
}

export function LauncherHome({ launcher }: LauncherHomeProps) {
  const { t } = useTranslation();
  const createLauncher = useMLRAStore((state) => state.createLauncher);
  const startOrchestration = useMLRAStore((state) => state.startOrchestration);
  const setUserTask = useMLRAStore((state) => state.setUserTask);
  const setOrchestrationPolicy = useMLRAStore((state) => state.setOrchestrationPolicy);
  const updateBlueprintMeta = useMLRAStore((state) => state.updateBlueprintMeta);
  const applyBlueprintTemplate = useMLRAStore((state) => state.applyBlueprintTemplate);
  const selectBlueprintStage = useMLRAStore((state) => state.selectBlueprintStage);
  const addBlueprintStage = useMLRAStore((state) => state.addBlueprintStage);
  const updateBlueprintStage = useMLRAStore((state) => state.updateBlueprintStage);
  const removeBlueprintStage = useMLRAStore((state) => state.removeBlueprintStage);
  const moveBlueprintStage = useMLRAStore((state) => state.moveBlueprintStage);
  const duplicateBlueprintStage = useMLRAStore((state) => state.duplicateBlueprintStage);

  const [draftName, setDraftName] = useState("");
  const [draftUserTask, setDraftUserTask] = useState("");
  const [draftTemplateId, setDraftTemplateId] = useState<BlueprintTemplateId>("standard");
  const [draftOrchestrationPolicy, setDraftOrchestrationPolicy] = useState(getDefaultOrchestrationPolicy);
  const [draftSelectedStageOrder, setDraftSelectedStageOrder] = useState(0);
  const [draggingStageId, setDraggingStageId] = useState<string | null>(null);
  const [stageDropIndex, _setStageDropIndex] = useState<number | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("basics");
  const [editingLauncherName, setEditingLauncherName] = useState(false);
  const [dragGhost, setDragGhost] = useState<{
    stageId: string;
    top: number;
    left: number;
    width: number;
    height: number;
    pointerOffsetX: number;
    pointerOffsetY: number;
  } | null>(null);
  const stageDropIndexRef = useRef<number | null>(null);
  const flowListRef = useRef<HTMLDivElement>(null);
  const flowRectsRef = useRef<{ top: number; height: number }[]>([]);
  const dragStageSourceIdRef = useRef<string | null>(null);
  const didStageDragRef = useRef(false);
  const pointerStartYRef = useRef(0);
  const dragGhostSnapshotRef = useRef<{
    stageId: string;
    top: number;
    left: number;
    width: number;
    height: number;
    pointerOffsetX: number;
    pointerOffsetY: number;
  } | null>(null);

  const setStageDropIndex = useCallback((value: number | null) => {
    stageDropIndexRef.current = value;
    _setStageDropIndex(value);
  }, []);

  const hasLauncher = !!launcher;
  const previewBlueprint = useMemo(
    () => createBlueprintFromTemplate(draftTemplateId, draftName.trim() || t("mlra.workflow.untitled", "Untitled workflow")),
    [draftTemplateId, draftName, t],
  );
  const workingBlueprint = launcher?.blueprint || previewBlueprint;
  const orderedStages = useMemo(
    () => [...workingBlueprint.stages].sort((left, right) => left.order - right.order),
    [workingBlueprint.stages],
  );

  const selectedStage = launcher
    ? orderedStages.find((stage) => stage.id === launcher.selectedStageId) || orderedStages[0] || null
    : orderedStages[draftSelectedStageOrder] || orderedStages[0] || null;

  const skillOptions = useMemo(() => {
    const builtin = new Set<string>(BUILTIN_SKILL_OPTIONS);
    const extras: string[] = [];
    const addExtra = (skill: string) => {
      if (!skill || builtin.has(skill) || extras.includes(skill)) return;
      extras.push(skill);
    };
    orderedStages.forEach((stage) => stage.skillRefs.forEach(addExtra));
    selectedStage?.skillRefs.forEach(addExtra);
    return [...BUILTIN_SKILL_OPTIONS, ...extras];
  }, [orderedStages, selectedStage]);

  const ensureLauncher = useCallback((): string | null => {
    if (launcher) return launcher.id;
    const name = draftName.trim() || t("mlra.workflow.untitled", "Untitled workflow");
    const id = createLauncher(name);
    if (draftTemplateId !== "standard") applyBlueprintTemplate(id, draftTemplateId);
    if (draftUserTask.trim()) setUserTask(id, draftUserTask);
    setOrchestrationPolicy(id, draftOrchestrationPolicy);
    return id;
  }, [launcher, draftName, draftTemplateId, draftUserTask, draftOrchestrationPolicy, createLauncher, applyBlueprintTemplate, setUserTask, setOrchestrationPolicy, t]);

  const commitName = useCallback(() => {
    if (!draftName.trim()) return;
    ensureLauncher();
  }, [draftName, ensureLauncher]);

  const handleUserTaskChange = useCallback((value: string) => {
    if (launcher) updateBlueprintMeta(launcher.id, { initialTask: value });
    else setDraftUserTask(value);
  }, [launcher, updateBlueprintMeta]);

  const handleStart = useCallback(() => {
    const id = ensureLauncher();
    if (!id) return;
    startOrchestration(id);
  }, [ensureLauncher, startOrchestration]);

  const updateSelectedStage = useCallback((patch: Partial<Omit<StageBlueprint, "id" | "order">>) => {
    if (!selectedStage) return;
    if (launcher) {
      updateBlueprintStage(launcher.id, selectedStage.id, patch);
      return;
    }
    const id = ensureLauncher();
    if (!id) return;
    const materialized = useMLRAStore.getState().launchers.find((item) => item.id === id);
    const nextStage = materialized?.blueprint.stages.find((stage) => stage.order === selectedStage.order);
    if (!nextStage) return;
    updateBlueprintStage(id, nextStage.id, patch);
  }, [launcher, selectedStage, updateBlueprintStage, ensureLauncher]);

  const toggleSkill = useCallback((skill: string) => {
    if (!selectedStage) return;
    const nextSkills = selectedStage.skillRefs.includes(skill)
      ? selectedStage.skillRefs.filter((item) => item !== skill)
      : [...selectedStage.skillRefs, skill];
    updateSelectedStage({ skillRefs: nextSkills });
  }, [selectedStage, updateSelectedStage]);

  const moveStageToIndex = useCallback((stageId: string, targetIndex: number) => {
    if (!launcher) return;
    const stage = launcher.blueprint.stages.find((item) => item.id === stageId);
    if (!stage || stage.order === targetIndex) return;
    if (stage.order < targetIndex) {
      for (let index = stage.order; index < targetIndex; index += 1) {
        moveBlueprintStage(launcher.id, stageId, 1);
      }
      return;
    }
    for (let index = stage.order; index > targetIndex; index -= 1) {
      moveBlueprintStage(launcher.id, stageId, -1);
    }
  }, [launcher, moveBlueprintStage]);

  const handleStagePointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!dragStageSourceIdRef.current) return;
    event.stopPropagation();
    if (!didStageDragRef.current) {
      if (Math.abs(event.clientY - pointerStartYRef.current) < 3) return;
      didStageDragRef.current = true;
      setDraggingStageId(dragStageSourceIdRef.current);
      if (dragGhostSnapshotRef.current) {
        setDragGhost({
          ...dragGhostSnapshotRef.current,
          left: event.clientX - dragGhostSnapshotRef.current.pointerOffsetX,
          top: event.clientY - dragGhostSnapshotRef.current.pointerOffsetY,
        });
      }
    }
    if (didStageDragRef.current && dragGhostSnapshotRef.current) {
      setDragGhost((current) => current ? {
        ...current,
        left: event.clientX - current.pointerOffsetX,
        top: event.clientY - current.pointerOffsetY,
      } : current);
    }
    const rects = flowRectsRef.current;
    if (rects.length === 0) return;
    const pointerY = event.clientY;
    let insertAt = rects.length;
    for (let index = 0; index < rects.length; index += 1) {
      const midY = rects[index].top + rects[index].height / 2;
      if (pointerY < midY) {
        insertAt = index;
        break;
      }
    }
    setStageDropIndex(insertAt);
  }, [setStageDropIndex]);

  const handleStagePointerUp = useCallback((_event: ReactPointerEvent<HTMLElement>) => {
    const sourceId = dragStageSourceIdRef.current;
    const wasDrag = didStageDragRef.current;
    const currentDropIndex = stageDropIndexRef.current;

    dragStageSourceIdRef.current = null;
    dragGhostSnapshotRef.current = null;
    didStageDragRef.current = false;
    setDraggingStageId(null);
    setDragGhost(null);
    setStageDropIndex(null);

    if (!launcher || !sourceId || !wasDrag || currentDropIndex == null) return;

    const sourceIndex = orderedStages.findIndex((stage) => stage.id === sourceId);
    if (sourceIndex === -1) return;

    const targetIndex = currentDropIndex > sourceIndex ? currentDropIndex - 1 : currentDropIndex;
    const boundedTargetIndex = Math.max(0, Math.min(targetIndex, orderedStages.length - 1));
    if (boundedTargetIndex === sourceIndex) return;
    moveStageToIndex(sourceId, boundedTargetIndex);
  }, [launcher, moveStageToIndex, orderedStages, setStageDropIndex]);

  const handleStageGripPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>, stageId: string) => {
    if (event.button !== 0) return;
    if (!launcher) {
      // Auto-create launcher so subsequent drag attempts work with real stage IDs
      ensureLauncher();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragStageSourceIdRef.current = stageId;
    didStageDragRef.current = false;
    pointerStartYRef.current = event.clientY;
    const stageCard = event.currentTarget.closest(".mlra-stage-node") as HTMLElement | null;
    if (stageCard) {
      const rect = stageCard.getBoundingClientRect();
      dragGhostSnapshotRef.current = {
        stageId,
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        pointerOffsetX: event.clientX - rect.left,
        pointerOffsetY: event.clientY - rect.top,
      };
    }
    if (flowListRef.current) {
      const stageItems = flowListRef.current.querySelectorAll<HTMLElement>(".mlra-stage-node");
      flowRectsRef.current = Array.from(stageItems).map((item) => {
        const rect = item.getBoundingClientRect();
        return { top: rect.top, height: rect.height };
      });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [launcher]);

  const draggingStageIndex = draggingStageId
    ? orderedStages.findIndex((stage) => stage.id === draggingStageId)
    : -1;

  const draggingStage = draggingStageId
    ? orderedStages.find((stage) => stage.id === draggingStageId) || null
    : null;

  const placeholderIndex = useMemo(() => {
    if (draggingStageIndex === -1 || stageDropIndex == null) return null;
    return stageDropIndex > draggingStageIndex ? stageDropIndex - 1 : stageDropIndex;
  }, [draggingStageIndex, stageDropIndex]);

  const flowVisualItems = useMemo(() => {
    const stages = draggingStageId
      ? orderedStages.filter((stage) => stage.id !== draggingStageId)
      : orderedStages;

    type FlowItem = { type: "stage"; stage: StageBlueprint } | { type: "placeholder" };
    const items: FlowItem[] = stages.map((stage) => ({ type: "stage", stage }));
    if (placeholderIndex != null && draggingStageId) {
      items.splice(placeholderIndex, 0, { type: "placeholder" });
    }
    return items;
  }, [draggingStageId, orderedStages, placeholderIndex]);

  const withMaterializedStage = useCallback((order: number, action: (launcherId: string, stageId: string) => void) => {
    const id = ensureLauncher();
    if (!id) return;
    const materialized = useMLRAStore.getState().launchers.find((item) => item.id === id);
    const stage = materialized?.blueprint.stages.find((item) => item.order === order);
    if (!stage) return;
    action(id, stage.id);
  }, [ensureLauncher]);

  const selectStage = useCallback((stage: StageBlueprint) => {
    if (launcher) {
      selectBlueprintStage(launcher.id, stage.id);
      return;
    }
    setDraftSelectedStageOrder(stage.order);
  }, [launcher, selectBlueprintStage]);

  const duplicateStage = useCallback((stage: StageBlueprint) => {
    if (launcher) {
      duplicateBlueprintStage(launcher.id, stage.id);
      return;
    }
    withMaterializedStage(stage.order, (launcherId, stageId) => {
      duplicateBlueprintStage(launcherId, stageId);
    });
  }, [launcher, duplicateBlueprintStage, withMaterializedStage]);

  const removeStage = useCallback((stage: StageBlueprint) => {
    if (launcher) {
      removeBlueprintStage(launcher.id, stage.id);
      return;
    }
    withMaterializedStage(stage.order, (launcherId, stageId) => {
      removeBlueprintStage(launcherId, stageId);
    });
  }, [launcher, removeBlueprintStage, withMaterializedStage]);

  const addStageAfter = useCallback((stage: StageBlueprint) => {
    if (launcher) {
      addBlueprintStage(launcher.id, null, stage.id);
      setInspectorTab("basics");
      return;
    }
    withMaterializedStage(stage.order, (launcherId, stageId) => {
      addBlueprintStage(launcherId, null, stageId);
      setInspectorTab("basics");
    });
  }, [launcher, addBlueprintStage, withMaterializedStage]);

  const startConditions = useMemo(
    () => getStartConditions(
      workingBlueprint,
      launcher ? launcher.userTask || launcher.blueprint.initialTask : draftUserTask,
      t,
    ),
    [workingBlueprint, launcher, draftUserTask, t],
  );
  const startReadiness = useMemo(() => {
    const missing = startConditions.filter((condition) => !condition.passed).map((condition) => condition.label);
    return { ready: missing.length === 0, missing };
  }, [startConditions]);
  const passedStartConditionCount = startConditions.filter((condition) => condition.passed).length;

  const stageIssuesById = useMemo(
    () => new Map(orderedStages.map((stage) => [stage.id, getStageIssues(stage, t)])),
    [orderedStages, t],
  );
  const runtimeStageId = launcher?.blueprintRuntime?.currentStageId || null;
  const runtimeStageIndex = launcher?.blueprintRuntime?.currentStageIndex ?? -1;
  const launcherDisplayName = hasLauncher ? launcher.name : draftName.trim() || t("mlra.workflow.untitled", "Untitled workflow");
  const currentOrchestrationPolicy = launcher?.orchestrationPolicy || draftOrchestrationPolicy;

  const updateOrchestrationPolicy = useCallback((nextPolicy: OrchestrationPolicy) => {
    if (launcher) {
      setOrchestrationPolicy(launcher.id, nextPolicy);
      return;
    }
    setDraftOrchestrationPolicy(nextPolicy);
  }, [launcher, setOrchestrationPolicy]);

  const updateSubmitPolicy = useCallback((role: "expertSubmit" | "inspectorSubmit", value: SubmitReleasePolicy) => {
    updateOrchestrationPolicy(customizeOrchestrationPolicy(currentOrchestrationPolicy, { [role]: value }));
  }, [currentOrchestrationPolicy, updateOrchestrationPolicy]);

  const updateCeoPolicy = useCallback((mode: CeoGateMode) => {
    updateOrchestrationPolicy(setPolicyCeoGateMode(currentOrchestrationPolicy, mode));
  }, [currentOrchestrationPolicy, updateOrchestrationPolicy]);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
      <div className="mlra-home-config">
        <div className="mlra-node-workbench">
          <aside className="mlra-workbench-config-rail">
            <div className="mlra-workbench-config-scroll">
              <DetailSection>
                <div className="mlra-task-type-row">
                  <label className="mlra-task-label">{t("mlra.workflow.template", "Blueprint template")}</label>
                  <div className="mlra-task-type-chips">
                    {BLUEPRINT_TEMPLATE_OPTIONS.map((template) => {
                      const active = hasLauncher ? launcher.blueprint.templateId === template.id : draftTemplateId === template.id;
                      return (
                        <button
                          key={template.id}
                          className={`mlra-task-type-chip mlra-skill-tag${active ? " active" : ""}`}
                          title={t(`mlra.blueprintTemplate.${template.id}.description`, template.description)}
                          onClick={() => {
                            if (launcher) applyBlueprintTemplate(launcher.id, template.id);
                            else setDraftTemplateId(template.id);
                          }}
                        >
                          {t(`mlra.blueprintTemplate.${template.id}.label`, template.label)}
                          {active ? <Icon name="check" size={12} /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mlra-task-desc-row">
                  <label className="mlra-task-label">{t("mlra.workflow.taskDescription", "Task description")}</label>
                  <textarea
                    className="mlra-task-desc-input"
                    placeholder={t("mlra.workflow.taskPlaceholder", "Describe what this work should solve.")}
                    value={hasLauncher ? launcher.blueprint.initialTask : draftUserTask}
                    onChange={(event) => handleUserTaskChange(event.target.value)}
                    rows={4}
                  />
                </div>

                <div className="mlra-task-type-row">
                  <label className="mlra-task-label">{t("mlra.workflow.orchestration", "Orchestration policy")}</label>
                  <div className="mlra-task-type-chips">
                    {ORCHESTRATION_PRESETS.map((preset) => {
                      const active = currentOrchestrationPolicy.preset === preset.id;
                      return (
                        <button
                          key={preset.id}
                          className={`mlra-task-type-chip mlra-skill-tag${active ? " active" : ""}`}
                          title={t(`mlra.orchestration.${preset.id}.description`, preset.description)}
                          onClick={() => {
                            const nextPolicy = { ...preset.policy };
                            updateOrchestrationPolicy(nextPolicy);
                          }}
                        >
                          <Icon name={preset.icon} size={12} />
                          {t(`mlra.orchestration.${preset.id}.label`, preset.label)}
                          {active ? <Icon name="check" size={12} /> : null}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mlra-policy-control-list">
                    <PolicyControlRow
                      label="Expert submit"
                      value={currentOrchestrationPolicy.expertSubmit}
                      options={[
                        { value: "auto", label: t("mlra.policy.auto", "Auto"), icon: "play", description: t("mlra.policy.expertAutoDesc", "Expert automatically advances after submitting.") },
                        { value: "user-review", label: t("mlra.policy.manual", "Manual"), icon: "users", description: t("mlra.policy.expertManualDesc", "Expert waits for manual confirmation, edits, or rollback after submitting.") },
                      ]}
                      onChange={(value) => updateSubmitPolicy("expertSubmit", value)}
                    />
                    <PolicyControlRow
                      label="Inspector submit"
                      value={currentOrchestrationPolicy.inspectorSubmit}
                      options={[
                        { value: "auto", label: t("mlra.policy.auto", "Auto"), icon: "play", description: t("mlra.policy.inspectorAutoDesc", "Inspector automatically advances after submitting.") },
                        { value: "user-review", label: t("mlra.policy.manual", "Manual"), icon: "users", description: t("mlra.policy.inspectorManualDesc", "Inspector waits for manual confirmation, edits, or rollback after submitting.") },
                      ]}
                      onChange={(value) => updateSubmitPolicy("inspectorSubmit", value)}
                    />
                    <PolicyControlRow
                      label="CEO gate"
                      value={getCeoGateMode(currentOrchestrationPolicy)}
                      options={[
                        { value: "auto", label: t("mlra.policy.auto", "Auto"), icon: "play", description: t("mlra.policy.ceoAutoDesc", "CEO reviews and releases the verdict automatically.") },
                        { value: "user", label: t("mlra.policy.manual", "Manual"), icon: "users", description: t("mlra.policy.ceoManualDesc", "The stage gate is decided directly by the user without waiting for an automatic CEO verdict.") },
                        { value: "review", label: t("mlra.policy.semiAuto", "Semi-auto"), icon: "eye", description: t("mlra.policy.ceoReviewDesc", "CEO reviews first, then the verdict waits for user confirmation.") },
                      ]}
                      onChange={updateCeoPolicy}
                    />
                  </div>
                </div>
              </DetailSection>
            </div>
          </aside>

          <div className="mlra-node-workbench-divider" aria-hidden="true" />

          <div className="mlra-workbench-main">
            <div className="mlra-flow-surface">
              <div className="mlra-flow-surface-head">
                <div className="mlra-flow-surface-head-row">
                  <div className="mlra-flow-title-slot">
                    {editingLauncherName ? (
                      <div className="mlra-task-desc-row mlra-flow-title-row">
                        <input
                          type="text"
                          autoFocus
                          placeholder={t("mlra.workflow.namePlaceholder", "Example: Login system refactor blueprint")}
                          value={hasLauncher ? launcher.name : draftName}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (launcher) updateBlueprintMeta(launcher.id, { name: value });
                            else setDraftName(value);
                          }}
                          onBlur={() => {
                            if (!launcher) commitName();
                            setEditingLauncherName(false);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              if (!launcher) commitName();
                              setEditingLauncherName(false);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setEditingLauncherName(false);
                            }
                          }}
                          className="mlra-task-desc-input mlra-inline-name-input"
                        />
                      </div>
                    ) : (
                      <button type="button" className="mlra-inline-name-header" onClick={() => setEditingLauncherName(true)}>
                        {launcherDisplayName}
                      </button>
                    )}
                  </div>
                  <div className={`mlra-start-control${startReadiness.ready ? " ready" : " blocked"}`}>
                    <button
                      className="mlra-lane-add-btn mlra-start-btn"
                      disabled={!startReadiness.ready}
                      onClick={handleStart}
                      aria-describedby="mlra-start-readiness-popover"
                    >
                      <Icon name={startReadiness.ready ? "play" : "info"} size={13} />
                      <span>{t("quickActions.start", "Start")}</span>
                      <span className="mlra-start-count">{passedStartConditionCount}/{startConditions.length}</span>
                    </button>
                    <div className="mlra-start-readiness-popover" id="mlra-start-readiness-popover" role="tooltip">
                      <div className="mlra-start-readiness-title">
                        {startReadiness.ready ? t("mlra.start.ready", "Ready to start") : t("mlra.start.blocked", "Resolve these before starting")}
                      </div>
                      <ul className="mlra-start-readiness-list">
                        {startConditions.map((condition) => (
                          <li key={condition.id} className={condition.passed ? "passed" : "missing"}>
                            <Icon name={condition.passed ? "circle-check" : "circle-x"} size={13} />
                            <span>{condition.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mlra-flow-line-shell">
                {orderedStages.length === 0 ? (
                  <div className="mlra-flow-empty">{t("mlra.stage.empty", "No stages yet. Add a node first.")}</div>
                ) : (
                  <div className="mlra-flow-line" ref={flowListRef} onPointerMove={handleStagePointerMove} onPointerUp={handleStagePointerUp}>
                    {flowVisualItems.map((item, index) => {
                      const isLast = index === flowVisualItems.length - 1;

                      if (item.type === "placeholder") {
                        return (
                          <div key="__placeholder__" className="mlra-flow-node-group">
                            <div
                              className="mlra-stage-drop-placeholder"
                              style={{
                                width: dragGhost?.width ?? 220,
                                height: dragGhost?.height ?? 52,
                              }}
                            />
                            {!isLast ? (
                              <div className="mlra-stage-connector">
                                <StraightConnector />
                              </div>
                            ) : null}
                          </div>
                        );
                      }

                      const stage = item.stage;
                      const issues = stageIssuesById.get(stage.id) || [];
                      const stageSelected = selectedStage?.id === stage.id;
                      const stageClosing = isClosingStage(stage);
                      const runtimeState = runtimeStageId === stage.id
                        ? "current"
                        : runtimeStageIndex >= 0 && runtimeStageIndex > stage.order
                          ? "completed"
                          : "idle";
                      return (
                        <div key={stage.id} className="mlra-flow-node-group">
                          <div className="mlra-flow-node-row">
                            <BlueprintNode
                              stage={stage}
                              selected={stageSelected}
                              dragging={false}
                              dropTarget={false}
                              runtimeState={runtimeState}
                              translateY={0}
                              issueCount={issues.length}
                              canDrag={!!launcher}
                              onSelect={() => selectStage(stage)}
                              onGripPointerDown={(event) => handleStageGripPointerDown(event, stage.id)}
                              onPointerMove={handleStagePointerMove}
                              onPointerUp={handleStagePointerUp}
                            />
                            {stageSelected ? (
                              <div className="mlra-stage-card-actions" aria-label={t("mlra.stage.actions", "Stage actions")}>
                                <button
                                  type="button"
                                  className="mlra-flow-fab"
                                  onClick={() => duplicateStage(stage)}
                                  disabled={stageClosing}
                                  title={stageClosing ? t("mlra.stage.cannotCopyClosing", "The closing stage cannot be copied") : t("mlra.stage.copy", "Copy stage")}
                                  aria-label={t("mlra.stage.copy", "Copy stage")}
                                >
                                  <Icon name="copy" size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="mlra-flow-fab danger"
                                  onClick={() => removeStage(stage)}
                                  disabled={stageClosing}
                                  title={stageClosing ? t("mlra.stage.cannotDeleteClosing", "The closing stage cannot be deleted") : t("mlra.stage.delete", "Delete stage")}
                                  aria-label={t("mlra.stage.delete", "Delete stage")}
                                >
                                  <Icon name="trash" size={13} />
                                </button>
                              </div>
                            ) : null}
                          </div>
                          {!isLast ? (
                            <div className="mlra-stage-connector">
                              <StraightConnector />
                              {!isClosingStage(stage) ? (
                                <div className="mlra-stage-connector-actions">
                                  <button
                                    type="button"
                                    className={`mlra-stage-gate-toggle${stage.exitGateEnabled ? " active" : ""}`}
                                    title={stage.exitGateEnabled ? t("mlra.gate.disableTitle", "Disable exit gate") : t("mlra.gate.enableTitle", "Enable CEO exit gate")}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      event.preventDefault();
                                      if (launcher) {
                                        updateBlueprintStage(launcher.id, stage.id, { exitGateEnabled: !stage.exitGateEnabled });
                                      } else {
                                        withMaterializedStage(stage.order, (launcherId, stageId) => {
                                          const freshStage = useMLRAStore.getState().launchers
                                            .find((l) => l.id === launcherId)?.blueprint.stages.find((s) => s.id === stageId);
                                          if (!freshStage) return;
                                          updateBlueprintStage(launcherId, stageId, { exitGateEnabled: !freshStage.exitGateEnabled });
                                        });
                                      }
                                    }}
                                  >
                                    <Icon name={stage.exitGateEnabled ? "lock" : "arrow-down"} size={12} />
                                    <span>{stage.exitGateEnabled ? t("mlra.gate.gated", "Gated") : t("mlra.gate.direct", "Direct")}</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="mlra-stage-gate-add-btn"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      addStageAfter(stage);
                                    }}
                                    title={t("mlra.stage.addHere", "Add stage here")}
                                    aria-label={t("mlra.stage.addHere", "Add stage here")}
                                  >
                                    <Icon name="plus" size={12} />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>

          <div className="mlra-node-workbench-divider" aria-hidden="true" />

          <aside className="mlra-inspector-rail mlra-stage-editor-panel">
            {selectedStage ? (
              <>
                <div className="mlra-inspector-identity-row">
                  <div className="mlra-selected-stage-order">{selectedStage.order + 1}</div>
                  <CustomSelect
                    value={selectedStage.icon as string}
                    options={STAGE_ICON_OPTIONS.map((opt) => ({ value: opt.value as string, label: t(`mlra.stageIcon.${opt.value}`, opt.label), icon: opt.value as string }))}
                    onChange={(value) => updateSelectedStage({ icon: value })}
                    layout="grid"
                    compact
                  />
                  <input
                    className="mlra-field-input mlra-inspector-stage-name-input"
                    aria-label={t("mlra.stage.name", "Stage name")}
                    value={selectedStage.name}
                    onChange={(event) => updateSelectedStage({ name: event.target.value })}
                  />
                  {isClosingStage(selectedStage) ? (
                    <span className="mlra-stage-meta-pill mlra-inspector-gate-pill"><Icon name="flag" size={12} /> {t("mlra.stage.closing", "Closing stage")}</span>
                  ) : (
                    <button
                      type="button"
                      className={`mlra-stage-meta-pill mlra-inspector-gate-pill${selectedStage.exitGateEnabled ? " active" : ""}`}
                      onClick={() => updateSelectedStage({ exitGateEnabled: !selectedStage.exitGateEnabled })}
                      title={selectedStage.exitGateEnabled ? t("mlra.gate.disableTitle", "Disable exit gate") : t("mlra.gate.enableTitle", "Enable CEO exit gate")}
                    >
                      <Icon name={selectedStage.exitGateEnabled ? "lock" : "arrow-right"} size={12} />
                      {selectedStage.exitGateEnabled ? t("mlra.gate.gated", "Gated") : t("mlra.gate.direct", "Direct")}
                    </button>
                  )}
                </div>
                <div className="mlra-inspector-tabs">
                  <InspectorTabButton active={inspectorTab === "basics"} icon="file-text" label={t("mlra.inspector.basics", "Basics")} onClick={() => setInspectorTab("basics")} />
                  <InspectorTabButton active={inspectorTab === "prompts"} icon="message-dot" label={t("mlra.inspector.prompts", "Prompts")} onClick={() => setInspectorTab("prompts")} />
                  <InspectorTabButton active={inspectorTab === "rules"} icon="check" label={t("mlra.inspector.rules", "Rules")} onClick={() => setInspectorTab("rules")} />
                  <InspectorTabButton active={inspectorTab === "skills"} icon="robot" label={t("mlra.inspector.skills", "Skills")} onClick={() => setInspectorTab("skills")} />
                </div>
              </>
            ) : null}
            <div className="mlra-stage-editor-scroll">
              {!selectedStage ? (
                <div className="mlra-config-empty mlra-empty-state-large">
                  <span>{t("mlra.inspector.empty", "Select a stage on the left to edit it here.")}</span>
                </div>
              ) : (
                <>
                  {inspectorTab === "basics" ? (
                    <>
                      <DetailSection title={t("mlra.inspector.identityTemplate", "Identity and template")}>
                        {!isClosingStage(selectedStage) && (
                          <div className="mlra-task-desc-row">
                            <label className="mlra-task-label">{t("mlra.stage.template", "Stage template")}</label>
                            <CustomSelect
                              value={(selectedStage.templateId || "") as string}
                              options={[
                                { value: "", label: t("mlra.stageTemplate.custom", "Custom"), description: t("mlra.stageTemplate.customDesc", "Do not use a preset template") },
                                ...STAGE_TEMPLATE_OPTIONS.filter((opt) => !opt.isClosing).map((opt) => ({
                                  value: opt.id as string,
                                  label: t(`mlra.stageTemplate.${opt.id}.label`, opt.label),
                                  description: t(`mlra.stageTemplate.${opt.id}.description`, opt.description),
                                })),
                              ]}
                              onChange={(value) => updateSelectedStage({ templateId: (value || null) as StageTemplateId | null })}
                            />
                          </div>
                        )}
                      </DetailSection>

                      <DetailSection>
                        <div className="mlra-task-desc-row">
                          <label className="mlra-task-label">{t("mlra.stage.description", "Stage description")}</label>
                          <textarea
                            className="mlra-task-desc-input"
                            rows={4}
                            value={selectedStage.description}
                            onChange={(event) => updateSelectedStage({ description: event.target.value })}
                          />
                        </div>
                      </DetailSection>
                    </>
                  ) : null}

                  {inspectorTab === "prompts" ? (
                    <DetailSection title={t("mlra.inspector.rolePrompts", "Role prompts")}>
                      {isClosingStage(selectedStage) ? (
                        <div className="mlra-task-desc-row">
                          <label className="mlra-task-label">{t("mlra.prompts.ceo", "CEO prompt")}</label>
                          <textarea
                            className="mlra-task-desc-input"
                            rows={10}
                            value={getStagePromptDefaults(selectedStage).promptCeo}
                            onChange={(event) => updateSelectedStage({ promptCeo: event.target.value, promptOverride: "" })}
                          />
                        </div>
                      ) : (
                        <>
                          <div className="mlra-task-desc-row">
                              <label className="mlra-task-label">{t("mlra.prompts.expert", "Expert prompt")}</label>
                            <textarea
                              className="mlra-task-desc-input"
                              rows={8}
                              value={getStagePromptDefaults(selectedStage).promptExpert}
                              onChange={(event) => updateSelectedStage({ promptExpert: event.target.value, promptOverride: "" })}
                            />
                          </div>
                          <div className="mlra-task-desc-row">
                              <label className="mlra-task-label">{t("mlra.prompts.inspector", "Inspector prompt")}</label>
                            <textarea
                              className="mlra-task-desc-input"
                              rows={8}
                              value={getStagePromptDefaults(selectedStage).promptInspector}
                              onChange={(event) => updateSelectedStage({ promptInspector: event.target.value, promptOverride: "" })}
                            />
                          </div>
                        </>
                      )}
                    </DetailSection>
                  ) : null}

                  {inspectorTab === "rules" ? (
                    <DetailSection title={t("mlra.gate.title", "Exit gate") }>
                      {isClosingStage(selectedStage) ? (
                        <div className="mlra-inspector-check success">
                          <Icon name="info" size={14} />
                          {t("mlra.gate.closingInfo", "The closing stage does not run a CEO exit gate. CEO summarizes and then waits for the user response.")}
                        </div>
                      ) : (
                        <>
                          <div className="mlra-gate-switch-row">
                            <div className="mlra-gate-switch-copy">
                              <span>{t("mlra.gate.defensiveLock", "CEO defensive gate")}</span>
                              <small>{selectedStage.exitGateEnabled ? t("mlra.gate.enabledDesc", "When enabled, stage exit requires CEO approval") : t("mlra.gate.disabledDesc", "When disabled, passing exit certification advances directly")}</small>
                            </div>
                            <button
                              type="button"
                              className={`mlra-gate-switch${selectedStage.exitGateEnabled ? " active" : ""}`}
                              role="switch"
                              aria-checked={selectedStage.exitGateEnabled}
                              onClick={() => updateSelectedStage({ exitGateEnabled: !selectedStage.exitGateEnabled })}
                            >
                              <span className="mlra-gate-switch-knob" />
                            </button>
                          </div>
                          <div className="mlra-task-desc-row">
                            <label className="mlra-task-label">{t("mlra.gate.prompt", "Gate rule prompt")}</label>
                            <textarea
                              className="mlra-task-desc-input"
                              rows={6}
                              value={selectedStage.exitGatePrompt ?? ""}
                              onChange={(event) => updateSelectedStage({ exitGatePrompt: event.target.value })}
                              placeholder={t("mlra.gate.promptPlaceholder", "Add CEO exit gate rules, pass criteria, or risks that must be checked for this stage")}
                            />
                          </div>
                        </>
                      )}
                    </DetailSection>
                  ) : null}

                  {inspectorTab === "skills" ? (
                    <DetailSection title={t("mlra.inspector.skillPackages", "Skill packages")}>
                      <div className="mlra-skill-selected-row">
                        <div className="mlra-skill-selected-meta">
                          <span className="mlra-skill-selected-kicker">{t("mlra.skills.selected", "Selected skills")}</span>
                          <strong>{selectedStage.skillRefs.length ? t("mlra.skills.count", "{{count}} skills", { count: selectedStage.skillRefs.length }) : t("mlra.skills.none", "No skills selected")}</strong>
                        </div>
                        <div className="mlra-skill-selected-list">
                          {selectedStage.skillRefs.length ? (
                            selectedStage.skillRefs.map((skill) => (
                              <span key={skill} className="mlra-task-type-chip mlra-skill-tag active mlra-skill-selected-tag">
                                {skill}
                              </span>
                            ))
                          ) : (
                            <span className="mlra-skill-empty-text">{t("mlra.skills.emptyHint", "Click tags below to add skills")}</span>
                          )}
                        </div>
                      </div>
                      <div className="mlra-skill-option-row" aria-label={t("mlra.skills.options", "Skill options")}>
                        {skillOptions.map((skill) => (
                          <SkillToggle
                            key={skill}
                            label={skill}
                            selected={selectedStage.skillRefs.includes(skill)}
                            onClick={() => toggleSkill(skill)}
                          />
                        ))}
                      </div>
                    </DetailSection>
                  ) : null}
                </>
              )}
            </div>
          </aside>
        </div>

        {dragGhost && draggingStage ? (
          <div
            className="mlra-stage-drag-ghost"
            style={{
              top: dragGhost.top,
              left: dragGhost.left,
              width: dragGhost.width,
            }}
          >
            <BlueprintNode
              stage={draggingStage}
              selected={selectedStage?.id === draggingStage.id}
              dragging
              dropTarget={false}
              runtimeState={runtimeStageId === draggingStage.id ? "current" : "idle"}
              translateY={0}
              issueCount={stageIssuesById.get(draggingStage.id)?.length ?? 0}
              canDrag={false}
              onSelect={() => {}}
              onGripPointerDown={() => {}}
              onPointerMove={() => {}}
              onPointerUp={() => {}}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}