import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  BLUEPRINT_TEMPLATE_OPTIONS,
  STAGE_SKILL_OPTIONS,
  createBlueprintFromTemplate,
  useMLRAStore,
  type BlueprintTemplateId,
  type Launcher,
  type StageBlueprint,
  type StageSkillKey,
  type StartMode,
} from "../store/mlraStore";
import { Icon } from "./Icons";

interface LauncherHomeProps {
  launcher: Launcher | null;
}

function DetailSection({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section className="mlra-editor-section">
      <div className="mlra-editor-section-head">
        {eyebrow ? <span className="mlra-editor-section-eyebrow">{eyebrow}</span> : null}
        <h3 className="mlra-editor-section-title">{title}</h3>
      </div>
      <div className="mlra-editor-section-body">{children}</div>
    </section>
  );
}

function BlueprintStageCard({
  stage,
  selected,
  dragging,
  dropTarget,
  onSelect,
  onToggleEnabled,
  onMove,
  onDuplicate,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDrop,
}: {
  stage: StageBlueprint;
  selected: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onSelect: () => void;
  onToggleEnabled: () => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDrop: () => void;
}) {
  const promptCount = [stage.openerPrompt, stage.reviewerPrompt, stage.ceoGatePrompt, stage.completionRule]
    .filter((item) => item.trim().length > 0)
    .length;

  return (
    <div
      className={`mlra-stage-card${selected ? " selected" : ""}${!stage.enabled ? " disabled" : ""}${dragging ? " dragging" : ""}${dropTarget ? " drop-target" : ""}`}
      onClick={onSelect}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        onDragEnter();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <div className="mlra-stage-card-top">
        <div className="mlra-stage-card-grip" title="拖动排序">
          <Icon name="sort" size={14} />
        </div>
        <div className="mlra-stage-card-order">{stage.order + 1}</div>
        <div className="mlra-stage-card-main">
          <div className="mlra-stage-card-title-row">
            <span className="mlra-stage-card-title">{stage.name}</span>
            <span className={`mlra-stage-badge ${stage.phaseType}`}>{stage.phaseType === "planning" ? "规划" : "执行"}</span>
            <span className="mlra-stage-badge subtle">{stage.openerTarget === "expert" ? "Expert 先发" : "Inspector 先发"}</span>
            {!stage.enabled && <span className="mlra-stage-badge danger">已停用</span>}
          </div>
          <div className="mlra-stage-card-summary">
            {stage.objective || stage.description || "还没有定义阶段目标，建议先写清楚阶段产出和审批标准。"}
          </div>
        </div>
        <div className="mlra-stage-card-actions">
          <button className="mlra-config-role-btn" onClick={(e) => { e.stopPropagation(); onMove(-1); }}>上移</button>
          <button className="mlra-config-role-btn" onClick={(e) => { e.stopPropagation(); onMove(1); }}>下移</button>
          <button className="mlra-config-role-btn" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>复制</button>
          <button className="mlra-config-role-btn" onClick={(e) => { e.stopPropagation(); onToggleEnabled(); }}>
            {stage.enabled ? "禁用" : "启用"}
          </button>
          <button className="mlra-config-remove" style={{ opacity: 1, position: "static" }} onClick={(e) => { e.stopPropagation(); onRemove(); }}>
            删除
          </button>
        </div>
      </div>
      <div className="mlra-stage-card-footer">
        <span>提示词 {promptCount}/4</span>
        <span>技能 {stage.recommendedSkills.length}</span>
        <span>{stage.completionRule.trim() ? "审批标准已定义" : "审批标准待补全"}</span>
      </div>
    </div>
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

export function LauncherHome({ launcher }: LauncherHomeProps) {
  const createLauncher = useMLRAStore((s) => s.createLauncher);
  const startOrchestration = useMLRAStore((s) => s.startOrchestration);
  const setUserTask = useMLRAStore((s) => s.setUserTask);
  const updateBlueprintMeta = useMLRAStore((s) => s.updateBlueprintMeta);
  const applyBlueprintTemplate = useMLRAStore((s) => s.applyBlueprintTemplate);
  const selectBlueprintStage = useMLRAStore((s) => s.selectBlueprintStage);
  const addBlueprintStage = useMLRAStore((s) => s.addBlueprintStage);
  const updateBlueprintStage = useMLRAStore((s) => s.updateBlueprintStage);
  const removeBlueprintStage = useMLRAStore((s) => s.removeBlueprintStage);
  const moveBlueprintStage = useMLRAStore((s) => s.moveBlueprintStage);
  const duplicateBlueprintStage = useMLRAStore((s) => s.duplicateBlueprintStage);
  const validateBlueprint = useMLRAStore((s) => s.validateBlueprint);

  const [draftName, setDraftName] = useState("");
  const [draftUserTask, setDraftUserTask] = useState("");
  const [draftTemplateId, setDraftTemplateId] = useState<BlueprintTemplateId>("standard");
  const [draftSelectedStageOrder, setDraftSelectedStageOrder] = useState(0);
  const [draggingStageId, setDraggingStageId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  const hasLauncher = !!launcher;
  const previewBlueprint = useMemo(
    () => createBlueprintFromTemplate(draftTemplateId, draftName.trim() || "未命名 Workflow"),
    [draftTemplateId, draftName],
  );
  const workingBlueprint = launcher?.blueprint || previewBlueprint;
  const selectedStage = launcher
    ? launcher.blueprint.stages.find((stage) => stage.id === launcher.selectedStageId) || launcher.blueprint.stages[0] || null
    : workingBlueprint.stages[draftSelectedStageOrder] || workingBlueprint.stages[0] || null;

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

  const handleStart = useCallback((mode: StartMode) => {
    const id = ensureLauncher();
    if (!id) return;
    startOrchestration(id, mode);
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

  const withMaterializedStage = useCallback((order: number, action: (launcherId: string, stageId: string) => void) => {
    const id = ensureLauncher();
    if (!id) return;
    const materialized = useMLRAStore.getState().launchers.find((item) => item.id === id);
    const stage = materialized?.blueprint.stages.find((item) => item.order === order);
    if (!stage) return;
    action(id, stage.id);
  }, [ensureLauncher]);

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
  }, [launcher, draftName, draftUserTask, validateBlueprint]);

  const stageStats = useMemo(() => {
    const stages = workingBlueprint.stages;
    const enabledStages = stages.filter((stage) => stage.enabled);
    return {
      total: stages.length,
      enabled: enabledStages.length,
      planning: enabledStages.filter((stage) => stage.phaseType === "planning").length,
      execution: enabledStages.filter((stage) => stage.phaseType === "execution").length,
    };
  }, [workingBlueprint]);

  const readinessTone = readiness.full.ready ? "ready" : "warning";
  const blueprintLabel = hasLauncher
    ? BLUEPRINT_TEMPLATE_OPTIONS.find((item) => item.id === launcher.blueprint.templateId)?.label || "自定义"
    : BLUEPRINT_TEMPLATE_OPTIONS.find((item) => item.id === draftTemplateId)?.label || "自定义";
  const blueprintDescription = hasLauncher
    ? launcher.blueprint.description || "把阶段目标、Prompt Stack 和审批标准做成一次性可执行的 workflow。"
    : previewBlueprint.description || "先选模板，再通过拖拽与分段编辑编排这次 MLRA v2 工作流。";

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto">
      <div className="mlra-home-config">
        <section className="mlra-orchestrator-hero">
          <div className="mlra-orchestrator-hero-main">
            <div className="mlra-config-title-row mlra-orchestrator-title-row" style={{ marginBottom: 0 }}>
              <div className="mlra-home-icon mlra-orchestrator-icon">
                <Icon name="clock" size={20} style={{ opacity: 0.8 }} />
              </div>
              <div className="mlra-orchestrator-heading">
                <span className="mlra-config-title">
                  {hasLauncher ? `${launcher.name} · 阶段编排器` : "Launcher Workflow Blueprint"}
                </span>
                <p className="mlra-home-desc mlra-orchestrator-desc">{blueprintDescription}</p>
              </div>
              <div className={`mlra-orchestrator-status ${readinessTone}`}>
                <span className="mlra-orchestrator-status-dot" />
                {readiness.full.ready ? "可直接按蓝图启动" : "仍有关键阶段缺口"}
              </div>
            </div>
            <div className="mlra-orchestrator-meta-row">
              <span className="mlra-orchestrator-meta-pill">模板: {blueprintLabel}</span>
              <span className="mlra-orchestrator-meta-pill">阶段: {stageStats.enabled}/{stageStats.total}</span>
              <span className="mlra-orchestrator-meta-pill">规划 / 执行: {stageStats.planning} / {stageStats.execution}</span>
            </div>
          </div>
        </section>

        <div className="mlra-home-two-col">
          <div className="mlra-home-col-left">
            <section className="mlra-workflow-panel">
              <div className="mlra-workflow-panel-head">
                <div>
                  <span className="mlra-home-col-title">启动面板</span>
                  <p className="mlra-workflow-panel-desc">先定义任务，再选模板与工作流策略，最后从合适的入口起跑。</p>
                </div>
              </div>

              <div className="mlra-task-config mlra-launcher-meta-card">
                <div className="mlra-editor-grid two-up">
                  <div className="mlra-task-desc-row">
                    <label className="mlra-task-label">Launcher 名称</label>
                    <input
                      type="text"
                      placeholder="例如：登录系统重构蓝图"
                      value={hasLauncher ? launcher.name : draftName}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (launcher) updateBlueprintMeta(launcher.id, { name: value });
                        else setDraftName(value);
                      }}
                      onBlur={() => { if (!launcher) commitName(); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !launcher) {
                          e.preventDefault();
                          commitName();
                        }
                      }}
                      className="mlra-task-desc-input"
                      style={{ flex: 1 }}
                    />
                  </div>

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
                </div>

                <div className="mlra-editor-grid">
                  <div className="mlra-task-desc-row">
                    <label className="mlra-task-label">任务描述</label>
                    <textarea
                      className="mlra-task-desc-input"
                      placeholder="描述用户任务，例如：重构登录系统，补上 MFA、错误恢复与审计能力..."
                      value={hasLauncher ? launcher.blueprint.initialTask : draftUserTask}
                      onChange={(e) => handleUserTaskChange(e.target.value)}
                      rows={4}
                    />
                  </div>

                  <div className="mlra-task-desc-row">
                    <label className="mlra-task-label">蓝图描述</label>
                    <textarea
                      className="mlra-task-desc-input"
                      placeholder="概括这份 workflow blueprint 的适用场景、节奏和风险约束..."
                      value={hasLauncher ? launcher.blueprint.description : ""}
                      onChange={(e) => {
                        if (launcher) updateBlueprintMeta(launcher.id, { description: e.target.value });
                      }}
                      rows={4}
                    />
                  </div>
                </div>
              </div>

              <div className="mlra-launch-dock">
                <div className="mlra-launch-dock-actions">
                  <button
                    className="btn btn-primary mlra-start-btn"
                    disabled={!readiness.full.ready}
                    onClick={() => handleStart("full")}
                    title={readiness.full.ready ? "按蓝图从第一个启用阶段启动" : `缺少: ${readiness.full.missing.join(", ")}`}
                  >
                    <Icon name="send" size={14} />
                    全开局
                  </button>
                  <button
                    className="btn mlra-start-btn mlra-start-btn-direct"
                    disabled={!readiness.direct.ready}
                    onClick={() => handleStart("direct-execution")}
                    title={readiness.direct.ready ? "跳到蓝图中的第一个执行阶段" : `缺少: ${readiness.direct.missing.join(", ")}`}
                  >
                    <Icon name="arrow-right" size={14} />
                    直接执行
                  </button>
                </div>

                <div className="mlra-launch-dock-summary">
                  {readiness.full.ready && readiness.direct.ready
                    ? "蓝图已可启动。全开局会从第一个启用阶段推进，直接执行会跳到第一个执行阶段。"
                    : `当前缺口: ${Array.from(new Set([...readiness.full.missing, ...readiness.direct.missing])).join("，")}`}
                </div>
              </div>
            </section>

            <section className="mlra-workflow-panel">
              <div className="mlra-workflow-panel-head">
                <div>
                  <span className="mlra-home-col-title">Workflow 轨道</span>
                  <p className="mlra-workflow-panel-desc">拖动卡片重排阶段顺序，点击卡片在右侧编辑完整 Prompt Stack 与审批规则。</p>
                </div>
                <span className="mlra-home-col-count">{workingBlueprint.stages.length}</span>
              </div>

              <div className="mlra-workflow-canvas">
                <div className="mlra-workflow-legend">
                  <span><i className="planning" />规划阶段负责定边界与方案</span>
                  <span><i className="execution" />执行阶段负责落地与验证</span>
                </div>

                <div className="mlra-stage-list">
                  {workingBlueprint.stages.map((stage) => (
                      <BlueprintStageCard
                        key={stage.id}
                        stage={stage}
                        selected={selectedStage?.order === stage.order}
                        dragging={draggingStageId === stage.id}
                        dropTarget={dragOverStageId === stage.id && draggingStageId !== stage.id}
                        onSelect={() => {
                          if (launcher) selectBlueprintStage(launcher.id, stage.id);
                          else setDraftSelectedStageOrder(stage.order);
                        }}
                        onToggleEnabled={() => {
                          if (launcher) updateBlueprintStage(launcher.id, stage.id, { enabled: !stage.enabled });
                          else withMaterializedStage(stage.order, (launcherId, materializedStageId) => {
                            updateBlueprintStage(launcherId, materializedStageId, { enabled: !stage.enabled });
                          });
                        }}
                        onMove={(direction) => {
                          if (launcher) moveBlueprintStage(launcher.id, stage.id, direction);
                        }}
                        onDuplicate={() => {
                          if (launcher) duplicateBlueprintStage(launcher.id, stage.id);
                          else withMaterializedStage(stage.order, (launcherId, materializedStageId) => {
                            duplicateBlueprintStage(launcherId, materializedStageId);
                          });
                        }}
                        onRemove={() => {
                          if (launcher) removeBlueprintStage(launcher.id, stage.id);
                          else withMaterializedStage(stage.order, (launcherId, materializedStageId) => {
                            removeBlueprintStage(launcherId, materializedStageId);
                          });
                        }}
                        onDragStart={() => {
                          setDraggingStageId(stage.id);
                          setDragOverStageId(stage.id);
                        }}
                        onDragEnd={() => {
                          setDraggingStageId(null);
                          setDragOverStageId(null);
                        }}
                        onDragEnter={() => setDragOverStageId(stage.id)}
                        onDrop={() => {
                          if (launcher && draggingStageId && draggingStageId !== stage.id) {
                            moveStageToIndex(draggingStageId, stage.order);
                          }
                          setDraggingStageId(null);
                          setDragOverStageId(null);
                        }}
                      />
                    ))}
                </div>

                <div className="mlra-stage-list-footer">
                  <div className="mlra-stage-list-tip">
                    {launcher ? "拖动排序后，daemon 会按新的阶段顺序决定下一步推进路径。" : "当前展示的是模板预览，开始编辑时会自动物化为可运行的 launcher。"}
                  </div>
                  <button className="btn btn-primary" onClick={() => {
                    if (launcher) addBlueprintStage(launcher.id);
                    else {
                      const id = ensureLauncher();
                      if (id) addBlueprintStage(id);
                    }
                  }}>
                    + 新增阶段
                  </button>
                </div>
              </div>
            </section>
          </div>

          <div className="mlra-home-col-right">
            <section className="mlra-workflow-panel mlra-stage-editor-panel">
              <div className="mlra-workflow-panel-head">
                <div>
                  <span className="mlra-home-col-title">阶段编辑器</span>
                  <p className="mlra-workflow-panel-desc">把一个阶段拆成身份路由、目标说明、Prompt Stack 和 CEO 审批契约四层来配置。</p>
                </div>
                <span className="mlra-home-col-count">{selectedStage ? `Stage ${selectedStage.order + 1}` : 0}</span>
              </div>

              {!selectedStage ? (
                <div className="mlra-config-empty mlra-empty-state-large">
                  <Icon name="radio" size={24} style={{ opacity: 0.35 }} />
                  <span>从左侧选择一个阶段后，这里会切换成完整的阶段工作台。</span>
                </div>
              ) : (
                <div className="mlra-stage-editor-scroll">
                  <DetailSection title="身份与路由">
                    <div className="mlra-editor-grid two-up">
                      <div className="mlra-task-desc-row">
                        <label className="mlra-task-label">阶段名称</label>
                        <input
                          className="mlra-task-desc-input"
                          value={selectedStage.name}
                          onChange={(e) => updateSelectedStage({ name: e.target.value })}
                        />
                      </div>

                      <div className="mlra-task-desc-row">
                        <label className="mlra-task-label">阶段类型</label>
                        <select
                          className="mlra-task-desc-input"
                          value={selectedStage.phaseType}
                          onChange={(e) => updateSelectedStage({ phaseType: e.target.value as StageBlueprint["phaseType"] })}
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
                        onChange={(e) => updateSelectedStage({ enabled: e.target.checked })}
                      />
                      启用该阶段
                    </label>
                  </DetailSection>

                  <DetailSection title="阶段意图与上下文">
                    <div className="mlra-task-desc-row">
                      <label className="mlra-task-label">阶段目标</label>
                      <textarea
                        className="mlra-task-desc-input"
                        rows={3}
                        value={selectedStage.objective}
                        onChange={(e) => updateSelectedStage({ objective: e.target.value })}
                      />
                    </div>

                    <div className="mlra-task-desc-row">
                      <label className="mlra-task-label">阶段说明</label>
                      <textarea
                        className="mlra-task-desc-input"
                        rows={3}
                        value={selectedStage.description}
                        onChange={(e) => updateSelectedStage({ description: e.target.value })}
                      />
                    </div>
                  </DetailSection>

                  <DetailSection title="阶段提示词编排">
                    <div className="mlra-task-desc-row">
                      <label className="mlra-task-label">开场提示词</label>
                      <textarea
                        className="mlra-task-desc-input"
                        rows={5}
                        value={selectedStage.openerPrompt}
                        onChange={(e) => updateSelectedStage({ openerPrompt: e.target.value })}
                      />
                    </div>

                    <div className="mlra-task-desc-row">
                      <label className="mlra-task-label">审阅提示词</label>
                      <textarea
                        className="mlra-task-desc-input"
                        rows={5}
                        value={selectedStage.reviewerPrompt}
                        onChange={(e) => updateSelectedStage({ reviewerPrompt: e.target.value })}
                      />
                    </div>

                    <div className="mlra-task-desc-row">
                      <label className="mlra-task-label">CEO 审批提示词</label>
                      <textarea
                        className="mlra-task-desc-input"
                        rows={5}
                        value={selectedStage.ceoGatePrompt}
                        onChange={(e) => updateSelectedStage({ ceoGatePrompt: e.target.value })}
                      />
                    </div>
                  </DetailSection>

                  <DetailSection title="完成标准与推荐技能">
                    <div className="mlra-task-desc-row">
                      <label className="mlra-task-label">完成标准</label>
                      <textarea
                        className="mlra-task-desc-input"
                        rows={4}
                        value={selectedStage.completionRule}
                        onChange={(e) => updateSelectedStage({ completionRule: e.target.value })}
                      />
                    </div>

                    <div className="mlra-task-type-row" style={{ alignItems: "flex-start" }}>
                      <label className="mlra-task-label">推荐 Skills</label>
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
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
