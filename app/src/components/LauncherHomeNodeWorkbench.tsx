import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  BLUEPRINT_TEMPLATE_OPTIONS,
  STAGE_SKILL_OPTIONS,
  createBlueprintFromTemplate,
  useMLRAStore,
  type BlueprintTemplateId,
  type Launcher,
  type StageBlueprint,
  type StageSkillKey,
} from "../store/mlraStore";
import { Icon } from "./Icons";

interface LauncherHomeProps {
  launcher: Launcher | null;
}

type InspectorTab = "basics" | "prompts" | "rules" | "skills";

const STAGE_ICON_OPTIONS = [
  { value: "git-branch", label: "分支" },
  { value: "wrench", label: "扳手" },
  { value: "search", label: "搜索" },
  { value: "message-dot", label: "消息" },
  { value: "check", label: "勾选" },
  { value: "pin", label: "图钉" },
  { value: "robot", label: "机器人" },
  { value: "file-text", label: "文本" },
] as const;

function getStageIssues(stage: StageBlueprint | null): string[] {
  if (!stage) return [];
  const issues: string[] = [];
  if (!stage.name.trim()) issues.push("缺少阶段名称");
  if (!stage.objective.trim()) issues.push("缺少阶段目标");
  if (!stage.openerPrompt.trim()) issues.push("缺少开场提示词");
  if (!stage.reviewerPrompt.trim()) issues.push("缺少审阅提示词");
  if (!stage.ceoGatePrompt.trim()) issues.push("缺少 CEO 审批提示词");
  if (!stage.completionRule.trim()) issues.push("缺少完成标准");
  return issues;
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
    <button className={`mlra-task-type-chip${selected ? " active" : ""}`} onClick={onClick}>
      {label}
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
    <button className={`mlra-inspector-tab${active ? " active" : ""}`} onClick={onClick}>
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}

function BezierConnector() {
  return (
    <svg className="mlra-flow-connector-curve" viewBox="0 0 24 28" preserveAspectRatio="none" aria-hidden="true">
      <path d="M12 0 C12 8 12 20 12 28" />
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
  iconMenuOpen,
  onToggleIconMenu,
  onSelectIcon,
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
  iconMenuOpen: boolean;
  onToggleIconMenu: () => void;
  onSelectIcon: (icon: string) => void;
  onGripPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <article
      className={[
        "mlra-stage-node",
        selected ? "selected" : "",
        !stage.enabled ? "disabled" : "",
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
        <div className="mlra-stage-node-icon-shell">
          <button
            type="button"
            className="mlra-stage-node-icon"
            title="选择阶段图标"
            onClick={(event) => {
              event.stopPropagation();
              onToggleIconMenu();
            }}
          >
            <Icon name={stage.icon} size={14} />
          </button>
        </div>
        <button
          type="button"
          className="mlra-stage-node-order mlra-stage-node-order-handle"
          title={canDrag ? "拖动重排" : "开始编辑后可拖动重排"}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={onGripPointerDown}
        >
          {stage.order + 1}
        </button>
        <div className="mlra-stage-node-main">
          <div className="mlra-stage-node-title-row">
            <span className="mlra-stage-node-title">{stage.name || "未命名阶段"}</span>
          </div>
          <div className="mlra-stage-node-meta">
            <span>{stage.phaseType === "planning" ? "规划" : "执行"}</span>
            <span>{stage.openerTarget === "expert" ? "Expert" : "Inspector"}</span>
            {!stage.enabled ? <span>停用</span> : null}
            {issueCount > 0 ? <span>缺 {issueCount}</span> : null}
            {runtimeState === "current" ? <span>当前</span> : null}
          </div>
        </div>
      </div>

      {iconMenuOpen ? (
        <div className="mlra-stage-icon-panel" onClick={(event) => event.stopPropagation()}>
          {STAGE_ICON_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`mlra-stage-icon-option${option.value === stage.icon ? " active" : ""}`}
              title={option.label}
              onClick={() => onSelectIcon(option.value)}
            >
              <Icon name={option.value} size={14} />
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function LauncherHome({ launcher }: LauncherHomeProps) {
  const createLauncher = useMLRAStore((state) => state.createLauncher);
  const startOrchestration = useMLRAStore((state) => state.startOrchestration);
  const setUserTask = useMLRAStore((state) => state.setUserTask);
  const updateBlueprintMeta = useMLRAStore((state) => state.updateBlueprintMeta);
  const applyBlueprintTemplate = useMLRAStore((state) => state.applyBlueprintTemplate);
  const selectBlueprintStage = useMLRAStore((state) => state.selectBlueprintStage);
  const addBlueprintStage = useMLRAStore((state) => state.addBlueprintStage);
  const updateBlueprintStage = useMLRAStore((state) => state.updateBlueprintStage);
  const removeBlueprintStage = useMLRAStore((state) => state.removeBlueprintStage);
  const moveBlueprintStage = useMLRAStore((state) => state.moveBlueprintStage);
  const duplicateBlueprintStage = useMLRAStore((state) => state.duplicateBlueprintStage);
  const validateBlueprint = useMLRAStore((state) => state.validateBlueprint);

  const [draftName, setDraftName] = useState("");
  const [draftUserTask, setDraftUserTask] = useState("");
  const [draftTemplateId, setDraftTemplateId] = useState<BlueprintTemplateId>("standard");
  const [draftSelectedStageOrder, setDraftSelectedStageOrder] = useState(0);
  const [draggingStageId, setDraggingStageId] = useState<string | null>(null);
  const [stageDropIndex, _setStageDropIndex] = useState<number | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("basics");
  const [editingLauncherName, setEditingLauncherName] = useState(false);
  const [openStageIconMenuId, setOpenStageIconMenuId] = useState<string | null>(null);
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
    () => createBlueprintFromTemplate(draftTemplateId, draftName.trim() || "未命名 Workflow"),
    [draftTemplateId, draftName],
  );
  const workingBlueprint = launcher?.blueprint || previewBlueprint;
  const orderedStages = useMemo(
    () => [...workingBlueprint.stages].sort((left, right) => left.order - right.order),
    [workingBlueprint.stages],
  );

  const selectedStage = launcher
    ? orderedStages.find((stage) => stage.id === launcher.selectedStageId) || orderedStages[0] || null
    : orderedStages[draftSelectedStageOrder] || orderedStages[0] || null;

  const ensureLauncher = useCallback((): string | null => {
    if (launcher) return launcher.id;
    const name = draftName.trim() || "未命名 Workflow";
    const id = createLauncher(name);
    if (draftTemplateId !== "standard") applyBlueprintTemplate(id, draftTemplateId);
    if (draftUserTask.trim()) setUserTask(id, draftUserTask);
    return id;
  }, [launcher, draftName, draftTemplateId, draftUserTask, createLauncher, applyBlueprintTemplate, setUserTask]);

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
    startOrchestration(id, workingBlueprint.startMode);
  }, [ensureLauncher, startOrchestration, workingBlueprint.startMode]);

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

  const toggleSkill = useCallback((skill: StageSkillKey) => {
    if (!selectedStage) return;
    const nextSkills = selectedStage.recommendedSkills.includes(skill)
      ? selectedStage.recommendedSkills.filter((item) => item !== skill)
      : [...selectedStage.recommendedSkills, skill];
    updateSelectedStage({ recommendedSkills: nextSkills });
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
    if (!launcher || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setOpenStageIconMenuId(null);
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

    if (placeholderIndex == null || !draggingStageId) {
      return stages.map((stage) => ({ type: "stage" as const, stage }));
    }

    const items = stages.map((stage) => ({ type: "stage" as const, stage }));
    items.splice(placeholderIndex, 0, { type: "placeholder" as const });
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

  const setStageIcon = useCallback((stage: StageBlueprint, icon: string) => {
    if (launcher) {
      updateBlueprintStage(launcher.id, stage.id, { icon });
      setOpenStageIconMenuId(null);
      return;
    }

    withMaterializedStage(stage.order, (launcherId, stageId) => {
      updateBlueprintStage(launcherId, stageId, { icon });
    });
    setOpenStageIconMenuId(null);
  }, [launcher, updateBlueprintStage, withMaterializedStage]);

  const selectStage = useCallback((stage: StageBlueprint) => {
    setInspectorTab("basics");
    if (launcher) {
      selectBlueprintStage(launcher.id, stage.id);
      return;
    }
    setDraftSelectedStageOrder(stage.order);
  }, [launcher, selectBlueprintStage]);

  const toggleStageEnabled = useCallback((stage: StageBlueprint) => {
    if (launcher) {
      updateBlueprintStage(launcher.id, stage.id, { enabled: !stage.enabled });
      return;
    }
    withMaterializedStage(stage.order, (launcherId, stageId) => {
      updateBlueprintStage(launcherId, stageId, { enabled: !stage.enabled });
    });
  }, [launcher, updateBlueprintStage, withMaterializedStage]);

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

  const addStageInPhase = useCallback((phaseType: StageBlueprint["phaseType"]) => {
    const launcherId = launcher?.id || ensureLauncher();
    if (!launcherId) return;
    addBlueprintStage(launcherId);
    const materialized = useMLRAStore.getState().launchers.find((item) => item.id === launcherId);
    const newestStage = materialized?.blueprint.stages.reduce<StageBlueprint | null>((latest, current) => {
      if (!latest) return current;
      return current.order > latest.order ? current : latest;
    }, null);
    if (!newestStage) return;
    if (newestStage.phaseType !== phaseType) {
      updateBlueprintStage(launcherId, newestStage.id, { phaseType });
    }
    selectBlueprintStage(launcherId, newestStage.id);
    setInspectorTab("basics");
  }, [launcher, ensureLauncher, addBlueprintStage, updateBlueprintStage, selectBlueprintStage]);

  const readiness = useMemo(() => {
    if (!launcher) {
      const missing: string[] = [];
      if (!draftUserTask.trim()) missing.push("请填写任务描述");
      return {
        full: { ready: missing.length === 0, missing },
        direct: { ready: missing.length === 0, missing },
      };
    }

    const fullMissing = validateBlueprint(launcher.id);
    const directMissing = [...fullMissing];
    const planningStages = launcher.blueprint.stages.filter((stage) => stage.enabled && stage.phaseType === "planning");
    const executionStages = launcher.blueprint.stages.filter((stage) => stage.enabled && stage.phaseType === "execution");

    if (planningStages.length === 0) fullMissing.push("全开局模式至少需要一个规划阶段");
    if (executionStages.length === 0) directMissing.push("直接执行模式至少需要一个执行阶段");

    return {
      full: { ready: fullMissing.length === 0, missing: fullMissing },
      direct: { ready: directMissing.length === 0, missing: directMissing },
    };
  }, [launcher, draftUserTask, validateBlueprint]);

  const stageIssuesById = useMemo(
    () => new Map(orderedStages.map((stage) => [stage.id, getStageIssues(stage)])),
    [orderedStages],
  );
  const startReadiness = workingBlueprint.startMode === "direct-execution" ? readiness.direct : readiness.full;
  const selectedStageIssues = getStageIssues(selectedStage);
  const runtimeStageId = launcher?.blueprintRuntime?.currentStageId || null;
  const runtimeStageIndex = launcher?.blueprintRuntime?.currentStageIndex ?? -1;
  const launcherDisplayName = hasLauncher ? launcher.name : draftName.trim() || "未命名 Workflow";

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
      <div className="mlra-home-config">
        <div className="mlra-node-workbench">
          <div className="mlra-workbench-main">
            <div className="mlra-flow-surface">
              <div className="mlra-flow-surface-head">
                <div className="mlra-flow-surface-head-row">
                  {editingLauncherName ? (
                    <div className="mlra-task-desc-row mlra-flow-title-row">
                      <input
                        type="text"
                        autoFocus
                        placeholder="例如：登录系统重构蓝图"
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

                <div className="mlra-flow-surface-actions mlra-flow-surface-actions-row">
                  <button className="mlra-lane-add-btn" disabled={!startReadiness.ready} onClick={handleStart}>开始</button>
                </div>
              </div>

              <div className="mlra-flow-line-shell">
                {orderedStages.length === 0 ? (
                  <div className="mlra-flow-empty">还没有阶段。先在顶部加一个节点。</div>
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
                              <div className="mlra-flow-connector" aria-hidden="true">
                                <BezierConnector />
                              </div>
                            ) : null}
                          </div>
                        );
                      }

                      const stage = item.stage;
                      const issues = stageIssuesById.get(stage.id) || [];
                      const runtimeState = runtimeStageId === stage.id
                        ? "current"
                        : runtimeStageIndex >= 0 && runtimeStageIndex > stage.order
                          ? "completed"
                          : "idle";
                      return (
                        <div key={stage.id} className="mlra-flow-node-group">
                          <BlueprintNode
                            stage={stage}
                            selected={selectedStage?.id === stage.id}
                            dragging={false}
                            dropTarget={false}
                            runtimeState={runtimeState}
                            translateY={0}
                            issueCount={issues.length}
                            canDrag={!!launcher}
                            onSelect={() => selectStage(stage)}
                            iconMenuOpen={openStageIconMenuId === stage.id}
                            onToggleIconMenu={() => setOpenStageIconMenuId((current) => current === stage.id ? null : stage.id)}
                            onSelectIcon={(icon) => setStageIcon(stage, icon)}
                            onGripPointerDown={(event) => handleStageGripPointerDown(event, stage.id)}
                            onPointerMove={handleStagePointerMove}
                            onPointerUp={handleStagePointerUp}
                          />
                          {!isLast ? (
                            <div className="mlra-flow-connector" aria-hidden="true">
                              <BezierConnector />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mlra-flow-floating-actions">
                <button className="mlra-lane-add-btn" onClick={() => addStageInPhase("planning")}>+ 规划</button>
                <button className="mlra-lane-add-btn" onClick={() => addStageInPhase("execution")}>+ 执行</button>
              </div>
            </div>
          </div>

          <div className="mlra-node-workbench-divider" aria-hidden="true" />

          <aside className="mlra-inspector-rail mlra-stage-editor-panel">
            <div className="mlra-stage-editor-scroll">
              <DetailSection>
                <div className="mlra-task-type-row">
                  <label className="mlra-task-label">蓝图模板</label>
                  <div className="mlra-task-type-chips">
                    {BLUEPRINT_TEMPLATE_OPTIONS.map((template) => {
                      const active = hasLauncher ? launcher.blueprint.templateId === template.id : draftTemplateId === template.id;
                      return (
                        <button
                          key={template.id}
                          className={`mlra-task-type-chip${active ? " active" : ""}`}
                          title={template.description}
                          onClick={() => {
                            if (launcher) applyBlueprintTemplate(launcher.id, template.id);
                            else setDraftTemplateId(template.id);
                          }}
                        >
                          {template.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mlra-task-desc-row">
                  <label className="mlra-task-label">任务描述</label>
                  <textarea
                    className="mlra-task-desc-input"
                    placeholder="描述这次工作要解决什么。"
                    value={hasLauncher ? launcher.blueprint.initialTask : draftUserTask}
                    onChange={(event) => handleUserTaskChange(event.target.value)}
                    rows={4}
                  />
                </div>

                <div className="mlra-task-desc-row">
                  <label className="mlra-task-label">蓝图描述</label>
                  <textarea
                    className="mlra-task-desc-input"
                    placeholder="概括这条 workflow 的用途。"
                    value={hasLauncher ? launcher.blueprint.description : ""}
                    onChange={(event) => {
                      if (launcher) updateBlueprintMeta(launcher.id, { description: event.target.value });
                    }}
                    rows={4}
                  />
                </div>
              </DetailSection>

              {!selectedStage ? (
                <div className="mlra-config-empty mlra-empty-state-large">
                  <span>从左侧选择一个阶段后，在这里编辑它。</span>
                </div>
              ) : (
                <>
                  <section className="mlra-selected-stage-card">
                    <div className="mlra-selected-stage-card-top">
                      <div className="mlra-selected-stage-order">{selectedStage.order + 1}</div>
                      <div className="mlra-selected-stage-main">
                        <div className="mlra-selected-stage-title-row">
                          <span className="mlra-selected-stage-title">{selectedStage.name}</span>
                        </div>
                        {(selectedStage.objective || selectedStage.description) ? <p className="mlra-selected-stage-summary">{selectedStage.objective || selectedStage.description}</p> : null}
                      </div>
                    </div>
                    <div className="mlra-selected-stage-meta-row">
                      <span>{selectedStage.phaseType === "planning" ? "规划" : "执行"}</span>
                      <span>开场角色：{selectedStage.openerTarget === "expert" ? "Expert" : "Inspector"}</span>
                      {!selectedStage.enabled ? <span>停用</span> : null}
                      {selectedStageIssues.length > 0 ? <span>缺 {selectedStageIssues.length}</span> : null}
                    </div>
                    <div className="mlra-workbench-toolbar">
                      <button className="mlra-lane-add-btn" onClick={() => toggleStageEnabled(selectedStage)}>
                        {selectedStage.enabled ? "停用" : "启用"}
                      </button>
                      <button className="mlra-lane-add-btn" onClick={() => duplicateStage(selectedStage)}>复制</button>
                      <button className="mlra-lane-add-btn" onClick={() => removeStage(selectedStage)}>删除</button>
                    </div>
                  </section>

                  <div className="mlra-inspector-tabs">
                    <InspectorTabButton active={inspectorTab === "basics"} icon="file-text" label="基本信息" onClick={() => setInspectorTab("basics")} />
                    <InspectorTabButton active={inspectorTab === "prompts"} icon="message-dot" label="提示词" onClick={() => setInspectorTab("prompts")} />
                    <InspectorTabButton active={inspectorTab === "rules"} icon="check" label="规则" onClick={() => setInspectorTab("rules")} />
                    <InspectorTabButton active={inspectorTab === "skills"} icon="robot" label="技能" onClick={() => setInspectorTab("skills")} />
                  </div>

                  {inspectorTab === "basics" ? (
                    <>
                      <DetailSection title="身份与路由">
                        <div className="mlra-editor-grid two-up">
                          <div className="mlra-task-desc-row">
                            <label className="mlra-task-label">阶段图标</label>
                            <select
                              className="mlra-task-desc-input"
                              value={selectedStage.icon}
                              onChange={(event) => updateSelectedStage({ icon: event.target.value })}
                            >
                              {STAGE_ICON_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>

                          <div className="mlra-task-desc-row">
                            <label className="mlra-task-label">阶段名称</label>
                            <input
                              className="mlra-task-desc-input"
                              value={selectedStage.name}
                              onChange={(event) => updateSelectedStage({ name: event.target.value })}
                            />
                          </div>

                          <div className="mlra-task-desc-row">
                            <label className="mlra-task-label">阶段类型</label>
                            <select
                              className="mlra-task-desc-input"
                              value={selectedStage.phaseType}
                              onChange={(event) => updateSelectedStage({ phaseType: event.target.value as StageBlueprint["phaseType"] })}
                            >
                              <option value="planning">规划</option>
                              <option value="execution">执行</option>
                            </select>
                          </div>
                        </div>

                        <div className="mlra-task-type-row">
                          <label className="mlra-task-label">开场目标 Agent</label>
                          <div className="mlra-task-type-chips">
                            <button
                              className={`mlra-task-type-chip${selectedStage.openerTarget === "expert" ? " active" : ""}`}
                              onClick={() => updateSelectedStage({ openerTarget: "expert" })}
                            >
                              Expert
                            </button>
                            <button
                              className={`mlra-task-type-chip${selectedStage.openerTarget === "inspector" ? " active" : ""}`}
                              onClick={() => updateSelectedStage({ openerTarget: "inspector" })}
                            >
                              Inspector
                            </button>
                          </div>
                        </div>

                        <label className="mlra-stage-enable-row">
                          <input
                            type="checkbox"
                            checked={selectedStage.enabled}
                            onChange={(event) => updateSelectedStage({ enabled: event.target.checked })}
                          />
                          启用该节点
                        </label>
                      </DetailSection>

                      <DetailSection title="阶段意图与上下文">
                        <div className="mlra-task-desc-row">
                          <label className="mlra-task-label">阶段目标</label>
                          <textarea
                            className="mlra-task-desc-input"
                            rows={4}
                            value={selectedStage.objective}
                            onChange={(event) => updateSelectedStage({ objective: event.target.value })}
                          />
                        </div>

                        <div className="mlra-task-desc-row">
                          <label className="mlra-task-label">阶段说明</label>
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
                    <DetailSection title="阶段提示词">
                      <div className="mlra-task-desc-row">
                        <label className="mlra-task-label">开场提示词</label>
                        <textarea
                          className="mlra-task-desc-input"
                          rows={6}
                          value={selectedStage.openerPrompt}
                          onChange={(event) => updateSelectedStage({ openerPrompt: event.target.value })}
                        />
                      </div>

                      <div className="mlra-task-desc-row">
                        <label className="mlra-task-label">审阅提示词</label>
                        <textarea
                          className="mlra-task-desc-input"
                          rows={6}
                          value={selectedStage.reviewerPrompt}
                          onChange={(event) => updateSelectedStage({ reviewerPrompt: event.target.value })}
                        />
                      </div>

                      <div className="mlra-task-desc-row">
                        <label className="mlra-task-label">CEO 审批提示词</label>
                        <textarea
                          className="mlra-task-desc-input"
                          rows={6}
                          value={selectedStage.ceoGatePrompt}
                          onChange={(event) => updateSelectedStage({ ceoGatePrompt: event.target.value })}
                        />
                      </div>
                    </DetailSection>
                  ) : null}

                  {inspectorTab === "rules" ? (
                    <DetailSection title="审批与完成标准">
                      <div className="mlra-task-desc-row">
                        <label className="mlra-task-label">完成标准</label>
                        <textarea
                          className="mlra-task-desc-input"
                          rows={5}
                          value={selectedStage.completionRule}
                          onChange={(event) => updateSelectedStage({ completionRule: event.target.value })}
                        />
                      </div>

                      <div className="mlra-inspector-checklist">
                        {selectedStageIssues.length === 0 ? (
                          <div className="mlra-inspector-check success">
                            <Icon name="circle-check" size={14} />
                            关键字段已经补全，这个节点可以独立表达它的意图和门控标准。
                          </div>
                        ) : (
                          selectedStageIssues.map((issue) => (
                            <div key={issue} className="mlra-inspector-check warning">
                              <Icon name="info" size={14} />
                              {issue}
                            </div>
                          ))
                        )}
                      </div>
                    </DetailSection>
                  ) : null}

                  {inspectorTab === "skills" ? (
                    <DetailSection title="推荐技能包">
                      <div className="mlra-task-type-row" style={{ alignItems: "flex-start" }}>
                        <label className="mlra-task-label">技能选择</label>
                        <div className="mlra-task-type-chips mlra-skill-pack-grid">
                          {STAGE_SKILL_OPTIONS.map((skill) => (
                            <SkillToggle
                              key={skill.key}
                              label={skill.label}
                              selected={selectedStage.recommendedSkills.includes(skill.key)}
                              onClick={() => toggleSkill(skill.key)}
                            />
                          ))}
                        </div>
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
              iconMenuOpen={false}
              onToggleIconMenu={() => {}}
              onSelectIcon={() => {}}
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