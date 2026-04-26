import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

// ── Role types (3 fixed roles + dynamic worker) ──

export type RuntimeMainRole = "expert" | "inspector" | "ceo";
export type AgentRole = RuntimeMainRole | "worker";
export type ControlMode = "autopilot" | "ceo-override";
export type SubmitReleasePolicy = "auto" | "user-review";
export type CeoGateTriggerPolicy = "auto-to-ceo" | "user-replaces-ceo";
export type CeoVerdictReleasePolicy = "auto-release" | "user-review";
export type CeoGateMode = "auto" | "user" | "review";
export type OrchestrationPresetId = "autopilot" | "ceo-user" | "ceo-review" | "full-review" | "custom";
export type LauncherStatus =
  | "configuring"
  | "ready"
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "awaiting-user";
export type AgentSlotStatus = "active" | "standby" | "idle" | "blocked" | "waiting-human-review" | "waiting-peer" | "waiting-gate" | "disconnected";
export type WorkerStatus = "ready" | "working" | "broken";

export interface OrchestrationPolicy {
  preset: OrchestrationPresetId;
  expertSubmit: SubmitReleasePolicy;
  inspectorSubmit: SubmitReleasePolicy;
  ceoGateTrigger: CeoGateTriggerPolicy;
  ceoVerdict: CeoVerdictReleasePolicy;
}

export type HumanGateKind = "submit_handoff_review" | "stage_exit_gate_trigger" | "ceo_verdict_review" | "closing_feedback";
export type HumanGateRole = RuntimeMainRole | "orchestrator" | "user";
export type PendingToolName = "expert_submit" | "inspector_submit" | "expert_vote" | "inspector_vote" | "ceo_verdict" | "interactive_feedback";

export interface HumanGateState {
  id: string;
  active: boolean;
  kind: HumanGateKind;
  title: string;
  sourceRole: HumanGateRole;
  targetRole?: HumanGateRole;
  pendingTool: PendingToolName;
  blockedRoles: HumanGateRole[];
  originalContent: string;
  draftContent: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface StageExitPendingSummary {
  active: boolean;
  stageId: string | null;
  materials: string | null;
  expert: { blocked: boolean; reason: string; certification?: unknown } | null;
  inspector: { blocked: boolean; reason: string; certification?: unknown } | null;
}

export interface StageExitReadinessSummary {
  deliverableVersion: number;
  reviewedDeliverableVersion: number;
  hasDeliverable: boolean;
  hasReview: boolean;
  certifications: {
    expert: unknown | null;
    inspector: unknown | null;
  };
}

// ── Blueprint types (stage-flow system) ──

export type BlueprintTemplateId = "standard" | "direct-execution" | "architecture" | "bugfix" | "audit";
export type StageTemplateId = "deliberation" | "delivery" | "closing" | string;

export interface GlobalPolicy {
  defaultSkillMode: "template" | "manual" | "merged";
  ceoStrictness: "strict" | "balanced" | "custom";
  requireProjectSurvey: boolean;
}

/** A single stage in the user-authored pipeline. Generic — no hard-coded
 *  phase/strategy classification. Behaviour driven by isClosing +
 *  exitGateEnabled. */
export interface StageBlueprint {
  id: string;
  order: number;
  icon: string;
  name: string;
  description: string;
  /** Source template (deliberation / delivery / closing / blank). Informational only. */
  templateId: StageTemplateId | null;
  /** If true, final wrap-up stage (CEO solo). Shown greyed + flag icon in UI. */
  isClosing: boolean;
  /** If true, CEO defensive-lock gate runs at stage exit. Ignored on closing. */
  exitGateEnabled: boolean;
  /** Optional user-edited prompt appended to CEO stage-exit gate reviews. */
  exitGatePrompt: string;
  /** Template default role prompts mirrored for UI editing and runtime routing. */
  promptExpert?: string;
  promptInspector?: string;
  promptCeo?: string;
  /** User-edited stage prompt. If empty, orchestrator falls back to the
   *  template's default prompt. */
  promptOverride: string;
  /** Skills suggested to roles while inside this stage. */
  skillRefs: string[];
}

export interface WorkflowBlueprint {
  version: 1;
  templateId: BlueprintTemplateId | null;
  name: string;
  description: string;
  initialTask: string;
  globalPolicy: GlobalPolicy;
  /** Stages in strict order. Last entry MUST have isClosing=true. */
  stages: StageBlueprint[];
}

export interface BlueprintRuntimeSummary {
  name: string | null;
  templateId: BlueprintTemplateId | null;
  currentStageId: string | null;
  currentStageIndex: number;
  totalStages: number;
  submitCount: number;
  currentStage: {
    id: string;
    name: string;
    isClosing: boolean;
    exitGateEnabled: boolean;
  } | null;
}

// ── Session pool / budget / gate (unchanged from previous) ──

export interface SessionPoolEntry {
  callerId: string;
  alias: string;
  status: "connected" | "derailed" | "broken";
}

export interface SessionPool {
  role: string;
  primary: SessionPoolEntry | null;
  standbys: SessionPoolEntry[];
  retryCount: number;
  maxRetries: number;
  failoverCount: number;
}

export interface BudgetStatus {
  limit: number;
  consumed: number;
  remaining: number;
  warningThreshold: number;
  canProceed: boolean;
  isWarning: boolean;
  records: Array<{
    timestamp: string;
    multiplier: number;
    role: string;
    reason: string;
    details: string;
  }>;
}

export interface CeoGateStatus {
  active: boolean;
  type: "stage_gate" | "arbitration" | "stagnation_arbitration" | null;
  round: number;
  minDefensiveRounds: number;
  consecutiveApprovals: number;
  requiredConsecutive: number;
  history: Array<{ round: number; verdict: string; reason: string }>;
}

// ── Role colors (3 keys only) ──

export const ROLE_COLORS: Record<AgentRole | "workerPool", string> = {
  expert: "#06B6D4",
  inspector: "#818CF8",
  ceo: "#F59E0B",
  worker: "#64748B",
  workerPool: "#64748B",
};

// ── Stage template catalog (for UI dropdown) ──

export const STAGE_TEMPLATE_OPTIONS: Array<{ id: StageTemplateId; label: string; description: string; isClosing?: boolean }> = [
  { id: "deliberation", label: "论证评审", description: "草案审阅，适用方案打磨" },
  { id: "delivery", label: "交付验证", description: "实施交付与审查，适用落地验证" },
  { id: "closing", label: "结束汇总", description: "面向用户的最终汇总，蓝图末尾不可删", isClosing: true },
];

export const BLUEPRINT_TEMPLATE_OPTIONS: Array<{ id: BlueprintTemplateId; label: string; description: string }> = [
  { id: "standard", label: "标准全链路", description: "论证 → 交付 → 结束" },
  { id: "direct-execution", label: "直接交付", description: "省略论证，直接进入交付" },
  { id: "architecture", label: "架构设计", description: "方案论证 + 门控评审" },
  { id: "bugfix", label: "缺陷修复", description: "定位 → 修复 → 验证" },
  { id: "audit", label: "审计复核", description: "标准建立 + 举证判定" },
];

// ── Registered agent (before start) ──

export interface RegisteredAgent {
  id: string;
  alias: string;
  clientName: string;
  model: string;
  workspace: string;
  assignedRole: AgentRole | null;
  workerRole: string;
  registeredAt: string;
}

// ── Agent slots (after orchestration starts) ──

export interface AgentSlot {
  id: string;
  role: RuntimeMainRole;
  displayName: string;
  model: string;
  status: AgentSlotStatus;
  color: string;
  activeSessionId: string | null;
  sessionIds: string[];
}

export interface WorkerSlot {
  id: string;
  role: string;
  displayName: string;
  model: string;
  status: WorkerStatus;
  currentTask: string | null;
  taskHistory: string[];
  activeSessionId: string | null;
  sessionIds: string[];
}

// ── Launcher ──

export interface RoundRecord {
  id: string;
  role: string;
  stageId?: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface Launcher {
  id: string;
  name: string;
  status: LauncherStatus;
  controlMode: ControlMode;
  orchestrationPolicy: OrchestrationPolicy;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  pausedAt: string | null;
  pausedElapsed: number;

  registeredAgents: RegisteredAgent[];

  agents: {
    expert: AgentSlot | null;
    inspector: AgentSlot | null;
    ceo: AgentSlot | null;
    workers: WorkerSlot[];
  };

  roundHistory: RoundRecord[];
  sessionPools: Record<string, SessionPool>;
  budget: BudgetStatus | null;
  ceoGate: CeoGateStatus | null;
  humanGate: HumanGateState | null;
  stageExitPending: StageExitPendingSummary | null;
  stageExitReadiness: StageExitReadinessSummary | null;

  taskType: string | null;
  userTask: string;
  blueprint: WorkflowBlueprint;
  blueprintRuntime: BlueprintRuntimeSummary | null;
  blueprintDirty: boolean;
  selectedStageId: string | null;

}

// ── Store interface ──

export interface MLRAState {
  launchers: Launcher[];
  activeLauncherId: string | null;

  columnOrder: string[];
  layoutMode: "auto" | 1 | 2 | 3 | 4;

  // Launcher CRUD
  createLauncher: (name: string) => string;
  switchLauncher: (id: string) => void;
  setControlMode: (id: string, mode: ControlMode) => void;
  setOrchestrationPolicy: (id: string, policy: OrchestrationPolicy) => void;
  deleteLauncher: (id: string) => void;
  renameLauncher: (id: string, name: string) => void;

  // Agent registration & role assignment
  addRegisteredAgent: (launcherId: string, agent: RegisteredAgent) => void;
  assignRole: (launcherId: string, agentId: string, role: AgentRole | null, workerRole?: string) => void;
  removeRegisteredAgent: (launcherId: string, agentId: string) => void;
  setWorkerRole: (launcherId: string, agentId: string, workerRole: string) => void;
  setTaskType: (launcherId: string, taskType: string | null) => void;
  setUserTask: (launcherId: string, userTask: string) => void;

  // Blueprint actions
  updateBlueprintMeta: (launcherId: string, patch: Partial<Pick<WorkflowBlueprint, "name" | "description" | "initialTask">>) => void;
  applyBlueprintTemplate: (launcherId: string, templateId: BlueprintTemplateId) => void;
  selectBlueprintStage: (launcherId: string, stageId: string | null) => void;
  addBlueprintStage: (launcherId: string, templateId?: StageTemplateId | null, afterStageId?: string | null) => void;
  updateBlueprintStage: (launcherId: string, stageId: string, patch: Partial<Omit<StageBlueprint, "id" | "order" | "isClosing">>) => void;
  removeBlueprintStage: (launcherId: string, stageId: string) => void;
  moveBlueprintStage: (launcherId: string, stageId: string, direction: -1 | 1) => void;
  duplicateBlueprintStage: (launcherId: string, stageId: string) => void;
  toggleStageExitGate: (launcherId: string, stageId: string) => void;
  validateBlueprint: (launcherId: string) => string[];

  // Start orchestration
  startOrchestration: (launcherId: string) => void;

  // View
  setColumnOrder: (order: string[]) => void;
  setLayoutMode: (mode: "auto" | 1 | 2 | 3 | 4) => void;

  // Daemon communication
  sendToDaemon: (msg: Record<string, unknown>) => Promise<void>;
  daemonStartOrchestration: (launcherId: string, userTask: string, taskType: string | null, blueprint: WorkflowBlueprint, orchestrationPolicy: OrchestrationPolicy) => void;
  daemonSetControlMode: (mode: ControlMode) => void;
  daemonSetOrchestrationPolicy: (policy: OrchestrationPolicy) => void;
  daemonApproveHumanGate: (payload: { id: string; content?: string; verdict?: string; reason?: string; targets?: string[] }) => void;
  daemonRejectHumanGate: (payload: { id: string; reason: string }) => void;
  daemonCancelHumanGate: (payload: { id: string; reason?: string }) => void;
  daemonCancelOrchestration: () => void;
  daemonTerminate: () => void;
  daemonSetBudget: (limit: number) => void;
  daemonIncreaseBudget: (amount: number) => void;
  daemonInjectMessage: (callerId: string, content: string) => void;

  handleDaemonMessage: (raw: string) => void;

  getActiveLauncher: () => Launcher | null;
}

// ── Helpers ──

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function normalizeStageOrder(stages: StageBlueprint[]): StageBlueprint[] {
  return stages.map((stage, index) => ({ ...stage, order: index }));
}

export function isClosingStage(stage: StageBlueprint | null | undefined): boolean {
  return Boolean(stage && stage.isClosing);
}

function emptyAgents(): Launcher["agents"] {
  return { expert: null, inspector: null, ceo: null, workers: [] };
}

export const ORCHESTRATION_PRESETS: Array<{ id: OrchestrationPresetId; label: string; description: string; icon: string; policy: OrchestrationPolicy }> = [
  {
    id: "autopilot",
    label: "全自动",
    description: "Expert、Inspector 与 CEO 全部自动流转。适合低风险、目标明确、希望尽快完成的任务。",
    icon: "play",
    policy: { preset: "autopilot", expertSubmit: "auto", inspectorSubmit: "auto", ceoGateTrigger: "auto-to-ceo", ceoVerdict: "auto-release" },
  },
  {
    id: "ceo-review",
    label: "审核CEO",
    description: "Expert 与 Inspector 自动流转，CEO 先做门控审核，审核结论再由人工确认释放。适合需要最终把关但不想频繁介入的任务。",
    icon: "eye",
    policy: { preset: "ceo-review", expertSubmit: "auto", inspectorSubmit: "auto", ceoGateTrigger: "auto-to-ceo", ceoVerdict: "user-review" },
  },
  {
    id: "ceo-user",
    label: "接管CEO",
    description: "Expert 与 Inspector 自动流转，阶段门控不交给 CEO 自动裁定，而由人工直接接管。适合关键节点需要你亲自判断的任务。",
    icon: "users",
    policy: { preset: "ceo-user", expertSubmit: "auto", inspectorSubmit: "auto", ceoGateTrigger: "user-replaces-ceo", ceoVerdict: "auto-release" },
  },
  {
    id: "full-review",
    label: "全面接管",
    description: "Expert、Inspector 的 handoff 与 CEO 阶段门控都需要人工确认。适合高风险、需要逐步审查和强控制的任务。",
    icon: "lock",
    policy: { preset: "full-review", expertSubmit: "user-review", inspectorSubmit: "user-review", ceoGateTrigger: "user-replaces-ceo", ceoVerdict: "auto-release" },
  },
];

export function getDefaultOrchestrationPolicy(): OrchestrationPolicy {
  return { ...ORCHESTRATION_PRESETS[0].policy };
}

export function policyFromControlMode(mode: ControlMode): OrchestrationPolicy {
  if (mode === "ceo-override") return { ...(ORCHESTRATION_PRESETS.find((preset) => preset.id === "ceo-user")?.policy ?? ORCHESTRATION_PRESETS[0].policy) };
  return getDefaultOrchestrationPolicy();
}

export function getCeoGateMode(policy: OrchestrationPolicy): CeoGateMode {
  if (policy.ceoGateTrigger === "user-replaces-ceo") return "user";
  if (policy.ceoVerdict === "user-review") return "review";
  return "auto";
}

export function customizeOrchestrationPolicy(policy: OrchestrationPolicy, patch: Partial<OrchestrationPolicy>): OrchestrationPolicy {
  return { ...policy, ...patch, preset: "custom" };
}

export function setPolicyCeoGateMode(policy: OrchestrationPolicy, mode: CeoGateMode): OrchestrationPolicy {
  if (mode === "user") {
    return customizeOrchestrationPolicy(policy, { ceoGateTrigger: "user-replaces-ceo", ceoVerdict: "auto-release" });
  }
  if (mode === "review") {
    return customizeOrchestrationPolicy(policy, { ceoGateTrigger: "auto-to-ceo", ceoVerdict: "user-review" });
  }
  return customizeOrchestrationPolicy(policy, { ceoGateTrigger: "auto-to-ceo", ceoVerdict: "auto-release" });
}

function normalizeAgentStatus(status: unknown): AgentSlotStatus {
  if (status === "blocked") return "blocked";
  if (status === "waiting-human-review") return "waiting-human-review";
  if (status === "waiting-peer") return "waiting-peer";
  if (status === "waiting-gate") return "waiting-gate";
  if (status === "registered") return "idle";
  if (status === "active" || status === "standby" || status === "idle" || status === "disconnected") return status;
  return "idle";
}

// Stage template "presets" — mirror mcp_prompts/stage_templates/*.json.
// In production the MCP daemon is the source of truth; this table is used
// for UI-side blueprint authoring only (prompts will be re-loaded at run
// time from the JSON files).
type BuiltinStageTemplateId = "deliberation" | "delivery" | "closing";

const STAGE_TEMPLATE_PRESETS: Record<BuiltinStageTemplateId, {
  name: string;
  description: string;
  icon: string;
  defaultExitGateEnabled: boolean;
  isClosing: boolean;
  promptExpert?: string;
  promptInspector?: string;
  promptCeo?: string;
  skillRefs: string[];
}> = {
  deliberation: {
    name: "论证评审",
    description: "产出方案草案并根据用户反馈持续完善，直到内容成熟可请求出口评审。",
    icon: "git-branch",
    defaultExitGateEnabled: true,
    isClosing: false,
    promptExpert: "## Stage Mode\ndeliberation\n\n## What to do\nAnalyze the user's task and produce a draft proposal for the user. Use `expert_submit({ content })` for normal drafts, revisions, reports, and risk notes. Treat routed feedback as user feedback and address it thoroughly before resubmitting.\n\n## Stage Exit Certification Rule\nDo not use `expert_vote` as a completion marker for your latest response. Use `expert_vote(vote=\"pass\", ...)` only after a full self-audit confirms the entire stage objective is satisfied, all known feedback is resolved, direct verification evidence exists, and no blocking risk, missing check, open question, or unverified claim remains. If any item is uncertain, continue with `expert_submit({ content })` instead.",
    promptInspector: "## Stage Mode\ndeliberation\n\n## What to do\nReview the provided draft as if the user asked you to audit it. Use `inspector_submit({ content })` for normal reviews, verification notes, and risk reports. Do not mention backend routing.\n\n## Stage Exit Certification Rule\nDo not use `inspector_vote` merely because a review was written. Use `inspector_vote(vote=\"pass\", ...)` only when the reviewed material is complete, directly verified, all known feedback is resolved, and no blocking issue, missing check, unresolved uncertainty, or open user concern remains. If any item is uncertain, continue with `inspector_submit({ content })` instead.",
    skillRefs: ["submit_plan_draft", "review_plan", "re_verify", "decision_levels", "hallucination_check", "vote_discipline"],
  },
  delivery: {
    name: "交付验证",
    description: "完成实际改动、验证结果并整理面向用户的交付说明。",
    icon: "wrench",
    defaultExitGateEnabled: true,
    isClosing: false,
    promptExpert: "## Stage Mode\ndelivery\n\n## What to do\nExecute real code or asset changes for the user and verify them locally. Before claiming completion, walk the re-verify flow. Use `expert_submit({ content })` for normal deliverables, revisions, reports, and risk notes.\n\n## Stage Exit Certification Rule\nDo not use `expert_vote` as a completion marker for your latest response. Use `expert_vote(vote=\"pass\", ...)` only after a full self-audit confirms the entire delivery objective is satisfied, all known feedback is resolved, direct verification evidence exists, and no blocking risk, missing check, open question, or unverified claim remains. If any item is uncertain, continue with `expert_submit({ content })` instead.",
    promptInspector: "## Stage Mode\ndelivery\n\n## What to do\nReview the delivered material for the user. Do not trust the narrative alone: open cited files and verify against actual code or output. Use `inspector_submit({ content })` for normal reviews, verification notes, and risk reports.\n\n## Stage Exit Certification Rule\nDo not use `inspector_vote` merely because a review was written. Use `inspector_vote(vote=\"pass\", ...)` only when the reviewed delivery is complete, directly verified, all known feedback is resolved, and no blocking issue, missing check, unresolved uncertainty, or open user concern remains. If any item is uncertain, continue with `inspector_submit({ content })` instead.",
    skillRefs: ["submit_phase_report", "review_phase", "re_verify", "decision_levels", "hallucination_check", "failure_recovery", "vote_discipline"],
  },
  closing: {
    name: "结束汇总",
    description: "结束阶段：向用户汇总全流程、仓库现状、交付物和验证方式，并等待用户响应。",
    icon: "flag",
    defaultExitGateEnabled: false,
    isClosing: true,
    promptCeo: "## Stage Mode\nclosing\n\n## What to do\nThe workflow has reached its closing stage. Produce the final wrap-up for the user.\n\nCover:\n1. **Task summary** — the user's goal, important decisions, and final outcome.\n2. **Repository snapshot** — files touched, notable changes, and any remaining open ends.\n3. **Deliverables checklist** — concrete artifacts, test evidence, and how the user can verify them.\n\nAfter writing the document, call the blocking feedback tool (`interactive_feedback`) to stand by for the user's response.",
    skillRefs: ["ceo_verdict", "hallucination_check"],
  },
};

function getStagePreset(templateId: StageTemplateId | null): (typeof STAGE_TEMPLATE_PRESETS)[BuiltinStageTemplateId] | null {
  if (!templateId) return null;
  const entry = STAGE_TEMPLATE_PRESETS[templateId as BuiltinStageTemplateId];
  return entry ?? null;
}

export function getStageTemplatePromptDefaults(templateId: StageTemplateId | null): Pick<StageBlueprint, "promptExpert" | "promptInspector" | "promptCeo"> {
  const preset = getStagePreset(templateId);
  return {
    promptExpert: preset?.promptExpert,
    promptInspector: preset?.promptInspector,
    promptCeo: preset?.promptCeo,
  };
}

function createStageBlueprint(templateId: StageTemplateId | null, partial: Partial<Omit<StageBlueprint, "id" | "order">> = {}): StageBlueprint {
  const preset = getStagePreset(templateId);
  return {
    id: generateId(),
    order: 0,
    icon: partial.icon ?? preset?.icon ?? "square",
    name: partial.name ?? preset?.name ?? "新阶段",
    description: partial.description ?? preset?.description ?? "",
    templateId: partial.templateId ?? templateId ?? null,
    isClosing: partial.isClosing ?? preset?.isClosing ?? false,
    exitGateEnabled: partial.exitGateEnabled ?? preset?.defaultExitGateEnabled ?? true,
    exitGatePrompt: partial.exitGatePrompt ?? "",
    promptExpert: partial.promptExpert ?? preset?.promptExpert,
    promptInspector: partial.promptInspector ?? preset?.promptInspector,
    promptCeo: partial.promptCeo ?? preset?.promptCeo,
    promptOverride: partial.promptOverride ?? "",
    skillRefs: partial.skillRefs ?? preset?.skillRefs ?? [],
  };
}

/** Append a closing stage if one doesn't already exist at the end. */
export function appendClosingStage(stages: StageBlueprint[]): StageBlueprint[] {
  const last = stages[stages.length - 1];
  if (last && isClosingStage(last)) return stages;
  const closing = createStageBlueprint("closing", { name: "结束汇总" });
  return normalizeStageOrder([...stages, closing]);
}

export function createBlueprintFromTemplate(templateId: BlueprintTemplateId, launcherName: string): WorkflowBlueprint {
  const basePolicy: GlobalPolicy = {
    defaultSkillMode: "merged",
    ceoStrictness: "strict",
    requireProjectSurvey: true,
  };

  type TemplateDef = {
    description: string;
    stages: Array<Partial<Omit<StageBlueprint, "id" | "order">> & { templateId: StageTemplateId }>;
  };
  const templates: Record<BlueprintTemplateId, TemplateDef> = {
    standard: {
      description: "从论证到交付的标准工作流。",
      stages: [
        { templateId: "deliberation", name: "需求论证", description: "先澄清边界、假设、风险，再形成共识。" },
        { templateId: "deliberation", name: "方案论证", description: "产出可执行规划并打磨到可交付状态。" },
        { templateId: "delivery", name: "落地实施", description: "按规划逐步交付并本地验证。" },
      ],
    },
    "direct-execution": {
      description: "跳过论证，直接进入交付验证。",
      stages: [
        { templateId: "delivery", name: "快速分析与实施", description: "最小必要分析后直接开始实施。" },
      ],
    },
    architecture: {
      description: "聚焦架构候选方案与门控评审。",
      stages: [
        { templateId: "deliberation", name: "现状调研", description: "建立架构现状与改造边界。" },
        { templateId: "deliberation", name: "候选方案", description: "产出候选方案与推荐路线。" },
      ],
    },
    bugfix: {
      description: "缺陷定位、修复与回归验证。",
      stages: [
        { templateId: "deliberation", name: "缺陷定位", description: "稳定复现并找根因。" },
        { templateId: "delivery", name: "修复与回归", description: "最小影响面修复并回归验证。" },
      ],
    },
    audit: {
      description: "审计标准建立与举证判定。",
      stages: [
        { templateId: "deliberation", name: "审计标准建立", description: "明确审计清单与判定标准。" },
        { templateId: "delivery", name: "举证与判定", description: "围绕标准收集证据形成结论。" },
      ],
    },
  };

  const template = templates[templateId];
  const stages = template.stages.map((spec) => createStageBlueprint(spec.templateId, spec));
  return {
    version: 1,
    templateId,
    name: launcherName,
    description: template.description,
    initialTask: "",
    globalPolicy: { ...basePolicy },
    stages: appendClosingStage(normalizeStageOrder(stages)),
  };
}

function getDefaultBlueprint(launcherName: string): WorkflowBlueprint {
  return createBlueprintFromTemplate("standard", launcherName);
}

function getBlueprintStartStage(blueprint: WorkflowBlueprint): StageBlueprint | null {
  return blueprint.stages.find((stage) => !isClosingStage(stage)) || blueprint.stages[0] || null;
}

const ROLE_DISPLAY_NAMES: Record<RuntimeMainRole, string> = {
  expert: "Expert",
  inspector: "Inspector",
  ceo: "CEO",
};

function createAgentSlotFromRegistered(role: RuntimeMainRole, agent: RegisteredAgent): AgentSlot {
  return {
    id: agent.id,
    role,
    displayName: ROLE_DISPLAY_NAMES[role],
    model: agent.model,
    status: role === "ceo" ? "standby" : "active",
    color: ROLE_COLORS[role],
    activeSessionId: null,
    sessionIds: [],
  };
}

function hydrateAgentsFromRegistered(registeredAgents: RegisteredAgent[], agents: Launcher["agents"]): Launcher["agents"] {
  const next = { ...agents };
  for (const role of ["expert", "inspector", "ceo"] as RuntimeMainRole[]) {
    const found = registeredAgents.find((a) => a.assignedRole === role);
    next[role] = found ? createAgentSlotFromRegistered(role, found) : agents[role] ?? null;
  }
  return next;
}

// ── Store ──

export const useMLRAStore = create<MLRAState>((set, get) => ({
  launchers: [],
  activeLauncherId: null,

  columnOrder: ["expert", "inspector", "ceo", "workers"],
  layoutMode: "auto",

  // ── Launcher CRUD ──

  createLauncher: (name) => {
    const id = generateId();
    const blueprint = getDefaultBlueprint(name);
    const launcher: Launcher = {
      id,
      name,
      status: "configuring",
      controlMode: "autopilot",
      orchestrationPolicy: getDefaultOrchestrationPolicy(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      pausedAt: null,
      pausedElapsed: 0,
      registeredAgents: [],
      agents: emptyAgents(),
      roundHistory: [],
      sessionPools: {},
      budget: null,
      ceoGate: null,
      humanGate: null,
      stageExitPending: null,
      stageExitReadiness: null,
      taskType: null,
      userTask: "",
      blueprint,
      blueprintRuntime: null,
      blueprintDirty: false,
      selectedStageId: blueprint.stages[0]?.id ?? null,
    };
    set((s) => ({
      launchers: [...s.launchers, launcher],
      activeLauncherId: id,
    }));
    return id;
  },

  switchLauncher: (id) => set({ activeLauncherId: id }),

  setControlMode: (id, mode) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === id ? { ...l, controlMode: mode, orchestrationPolicy: policyFromControlMode(mode), updatedAt: new Date().toISOString() } : l
      ),
    })),

  setOrchestrationPolicy: (id, policy) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === id ? { ...l, orchestrationPolicy: policy, updatedAt: new Date().toISOString() } : l
      ),
    })),

  deleteLauncher: (id) =>
    set((s) => ({
      launchers: s.launchers.filter((l) => l.id !== id),
      activeLauncherId: s.activeLauncherId === id ? null : s.activeLauncherId,
    })),

  renameLauncher: (id, name) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === id ? { ...l, name, updatedAt: new Date().toISOString() } : l
      ),
    })),

  // ── Agent registration ──

  addRegisteredAgent: (launcherId, agent) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === launcherId
          ? { ...l, registeredAgents: [...l.registeredAgents, agent], updatedAt: new Date().toISOString() }
          : l
      ),
    })),

  assignRole: (launcherId, agentId, role, workerRole) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;
        const updatedAgents = l.registeredAgents.map((a) => {
          if (a.id === agentId) {
            return { ...a, assignedRole: role, workerRole: role === "worker" ? (workerRole ?? a.workerRole) : "" };
          }
          // If role is exclusive (not worker) and already assigned to another agent, unassign it.
          if (role && a.assignedRole === role && role !== "worker") {
            return { ...a, assignedRole: null };
          }
          return a;
        });
        return { ...l, registeredAgents: updatedAgents, updatedAt: new Date().toISOString() };
      }),
    })),

  removeRegisteredAgent: (launcherId, agentId) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === launcherId
          ? { ...l, registeredAgents: l.registeredAgents.filter((a) => a.id !== agentId), updatedAt: new Date().toISOString() }
          : l
      ),
    })),

  setWorkerRole: (launcherId, agentId, workerRole) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === launcherId
          ? {
              ...l,
              registeredAgents: l.registeredAgents.map((a) => (a.id === agentId ? { ...a, workerRole } : a)),
              updatedAt: new Date().toISOString(),
            }
          : l
      ),
    })),

  setTaskType: (launcherId, taskType) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === launcherId ? { ...l, taskType, blueprintDirty: true, updatedAt: new Date().toISOString() } : l
      ),
    })),

  setUserTask: (launcherId, userTask) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === launcherId
          ? {
              ...l,
              userTask,
              blueprint: { ...l.blueprint, initialTask: userTask },
              blueprintDirty: true,
              updatedAt: new Date().toISOString(),
            }
          : l
      ),
    })),

  // ── Blueprint actions ──

  updateBlueprintMeta: (launcherId, patch) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === launcherId
          ? {
              ...l,
              name: patch.name ?? l.name,
              userTask: patch.initialTask ?? l.userTask,
              blueprint: {
                ...l.blueprint,
                ...patch,
                name: patch.name ?? l.blueprint.name,
                initialTask: patch.initialTask ?? l.blueprint.initialTask,
              },
              blueprintDirty: true,
              updatedAt: new Date().toISOString(),
            }
          : l
      ),
    })),

  applyBlueprintTemplate: (launcherId, templateId) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;
        const nextBlueprint = createBlueprintFromTemplate(templateId, l.name);
        nextBlueprint.initialTask = l.userTask;
        return {
          ...l,
          blueprint: nextBlueprint,
          selectedStageId: nextBlueprint.stages[0]?.id ?? null,
          blueprintDirty: true,
          updatedAt: new Date().toISOString(),
        };
      }),
    })),

  selectBlueprintStage: (launcherId, stageId) =>
    set((s) => ({
      launchers: s.launchers.map((l) => (l.id === launcherId ? { ...l, selectedStageId: stageId } : l)),
    })),

  addBlueprintStage: (launcherId, templateId = null, afterStageId = null) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;
        const presetForAdd = getStagePreset(templateId);
        const stage = createStageBlueprint(templateId, {
          name: presetForAdd?.name || `阶段 ${l.blueprint.stages.length}`,
          isClosing: false, // never create closing via add
        });
        // Insert after the requested stage, or before the closing stage by default.
        const withoutClosing = l.blueprint.stages.filter((x) => !isClosingStage(x));
        const closing = l.blueprint.stages.find((x) => isClosingStage(x));
        const insertIndex = afterStageId
          ? withoutClosing.findIndex((item) => item.id === afterStageId) + 1
          : withoutClosing.length;
        const nextNonClosingStages = [...withoutClosing];
        nextNonClosingStages.splice(insertIndex > 0 ? insertIndex : withoutClosing.length, 0, stage);
        const newStages = normalizeStageOrder([...nextNonClosingStages, ...(closing ? [closing] : [])]);
        return {
          ...l,
          blueprint: { ...l.blueprint, stages: closing ? newStages : appendClosingStage(newStages) },
          selectedStageId: stage.id,
          blueprintDirty: true,
          updatedAt: new Date().toISOString(),
        };
      }),
    })),

  updateBlueprintStage: (launcherId, stageId, patch) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;
        const stages = l.blueprint.stages.map((stage) => {
          if (stage.id !== stageId) return stage;
          // Closing stages allow identity/description/prompt edits only;
          // other structural fields must not change for closing.
          if (isClosingStage(stage)) {
            return {
              ...stage,
              ...("icon" in patch ? { icon: patch.icon ?? stage.icon } : {}),
              ...("name" in patch ? { name: patch.name ?? stage.name } : {}),
              ...("description" in patch ? { description: patch.description ?? stage.description } : {}),
              ...("exitGatePrompt" in patch ? { exitGatePrompt: patch.exitGatePrompt ?? stage.exitGatePrompt } : {}),
              ...("promptCeo" in patch ? { promptCeo: patch.promptCeo ?? stage.promptCeo } : {}),
              ...("promptOverride" in patch ? { promptOverride: patch.promptOverride ?? stage.promptOverride } : {}),
            };
          }
          return { ...stage, ...patch };
        });
        return { ...l, blueprint: { ...l.blueprint, stages }, blueprintDirty: true, updatedAt: new Date().toISOString() };
      }),
    })),

  removeBlueprintStage: (launcherId, stageId) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;
        const target = l.blueprint.stages.find((x) => x.id === stageId);
        if (!target || isClosingStage(target)) return l; // cannot remove closing
        const stages = normalizeStageOrder(l.blueprint.stages.filter((stage) => stage.id !== stageId));
        return {
          ...l,
          blueprint: { ...l.blueprint, stages: appendClosingStage(stages) },
          selectedStageId: l.selectedStageId === stageId ? stages[0]?.id ?? null : l.selectedStageId,
          blueprintDirty: true,
          updatedAt: new Date().toISOString(),
        };
      }),
    })),

  moveBlueprintStage: (launcherId, stageId, direction) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;
        const target = l.blueprint.stages.find((x) => x.id === stageId);
        if (!target || isClosingStage(target)) return l; // closing is pinned to end
        const withoutClosing = l.blueprint.stages.filter((x) => !isClosingStage(x));
        const closing = l.blueprint.stages.find((x) => isClosingStage(x));
        const index = withoutClosing.findIndex((stage) => stage.id === stageId);
        const targetIndex = index + direction;
        if (index === -1 || targetIndex < 0 || targetIndex >= withoutClosing.length) return l;
        const [stage] = withoutClosing.splice(index, 1);
        withoutClosing.splice(targetIndex, 0, stage);
        const stages = normalizeStageOrder([...withoutClosing, ...(closing ? [closing] : [])]);
        return { ...l, blueprint: { ...l.blueprint, stages }, blueprintDirty: true, updatedAt: new Date().toISOString() };
      }),
    })),

  duplicateBlueprintStage: (launcherId, stageId) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;
        const index = l.blueprint.stages.findIndex((stage) => stage.id === stageId);
        if (index === -1) return l;
        const source = l.blueprint.stages[index];
        if (isClosingStage(source)) return l; // cannot duplicate closing
        const clone = createStageBlueprint(source.templateId, { ...source, name: `${source.name}（副本）` });
        const stages = [...l.blueprint.stages];
        stages.splice(index + 1, 0, clone);
        return {
          ...l,
          blueprint: { ...l.blueprint, stages: normalizeStageOrder(stages) },
          selectedStageId: clone.id,
          blueprintDirty: true,
          updatedAt: new Date().toISOString(),
        };
      }),
    })),

  toggleStageExitGate: (launcherId, stageId) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;
        const stages = l.blueprint.stages.map((stage) => {
          if (stage.id !== stageId) return stage;
          if (isClosingStage(stage)) return stage;
          return { ...stage, exitGateEnabled: !stage.exitGateEnabled };
        });
        return { ...l, blueprint: { ...l.blueprint, stages }, blueprintDirty: true, updatedAt: new Date().toISOString() };
      }),
    })),

  validateBlueprint: (launcherId) => {
    const launcher = get().launchers.find((item) => item.id === launcherId);
    if (!launcher) return ["Launcher 不存在"];
    const errors: string[] = [];
    const nonClosing = launcher.blueprint.stages.filter((stage) => !isClosingStage(stage));
    if (!launcher.blueprint.initialTask.trim() && !launcher.userTask.trim()) {
      errors.push("请填写任务描述");
    }
    if (nonClosing.length === 0) {
      errors.push("至少需要一个非结束阶段");
    }
    // Last non-closing stage must have exit gate enabled (decision #9)
    const lastNonClosing = nonClosing[nonClosing.length - 1];
    if (lastNonClosing && !lastNonClosing.exitGateEnabled) {
      errors.push(`最后一个普通阶段「${lastNonClosing.name}」必须开启出口 gate`);
    }
    launcher.blueprint.stages.forEach((stage, index) => {
      if (!stage.name.trim()) errors.push(`阶段 ${index + 1} 缺少名称`);
    });
    // Blueprint must end with a closing stage (invariant, but be defensive)
    const last = launcher.blueprint.stages[launcher.blueprint.stages.length - 1];
    if (!last || !isClosingStage(last)) {
      errors.push("蓝图末尾必须为结束阶段");
    }
    return errors;
  },

  // ── Start orchestration ──

  startOrchestration: (launcherId) => {
    const launcher = get().launchers.find((l) => l.id === launcherId);
    if (!launcher || (launcher.status !== "configuring" && launcher.status !== "ready")) return;
    const blueprintErrors = get().validateBlueprint(launcherId);
    if (blueprintErrors.length > 0) return;
    const blueprint: WorkflowBlueprint = {
      ...launcher.blueprint,
      initialTask: launcher.userTask || launcher.blueprint.initialTask || launcher.name,
    };
    const startStage = getBlueprintStartStage(blueprint);

    get().daemonStartOrchestration(launcherId, blueprint.initialTask, launcher.taskType, blueprint, launcher.orchestrationPolicy);

    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;

        const workerAgents = l.registeredAgents.filter((a) => a.assignedRole === "worker");

        return {
          ...l,
          status: "running",
          updatedAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          pausedAt: null,
          pausedElapsed: 0,
          roundHistory: [],
          blueprint,
          blueprintDirty: false,
          selectedStageId: startStage?.id ?? l.selectedStageId,
          agents: {
            ...hydrateAgentsFromRegistered(l.registeredAgents, l.agents),
            workers: workerAgents.map((a) => ({
              id: a.id,
              role: a.workerRole || "Worker",
              displayName: a.workerRole ? `${a.workerRole} (${a.alias})` : `Worker ${a.alias}`,
              model: a.model,
              status: "ready" as const,
              currentTask: null,
              taskHistory: [],
              activeSessionId: null,
              sessionIds: [],
            })),
          },
        };
      }),
    }));
  },

  // ── View ──

  setColumnOrder: (order) => set({ columnOrder: order }),
  setLayoutMode: (mode) => set({ layoutMode: mode }),

  // ── Daemon communication ──

  sendToDaemon: async (msg) => {
    try {
      await invoke("send_to_mlra_daemon", { message: JSON.stringify(msg) });
    } catch (e) {
      console.error("[MLRA] sendToDaemon failed:", e);
    }
  },

  daemonStartOrchestration: (launcherId, userTask, taskType, blueprint, orchestrationPolicy) => {
    get().sendToDaemon({
      type: "mlra_start",
      config: { launcherId, userTask, taskType: taskType || null, blueprint, orchestrationPolicy },
    });
  },

  daemonSetControlMode: (mode) => { get().sendToDaemon({ type: "mlra_set_control_mode", mode }); },
  daemonSetOrchestrationPolicy: (policy) => { get().sendToDaemon({ type: "mlra_set_orchestration_policy", policy }); },
  daemonApproveHumanGate: (payload) => { get().sendToDaemon({ type: "mlra_human_gate_approve", ...payload }); },
  daemonRejectHumanGate: (payload) => { get().sendToDaemon({ type: "mlra_human_gate_reject", ...payload }); },
  daemonCancelHumanGate: (payload) => { get().sendToDaemon({ type: "mlra_human_gate_cancel", ...payload }); },
  daemonCancelOrchestration: () => { get().sendToDaemon({ type: "mlra_cancel" }); },
  daemonTerminate: () => { get().sendToDaemon({ type: "mlra_terminate" }); },
  daemonSetBudget: (limit) => { get().sendToDaemon({ type: "mlra_set_budget", limit }); },
  daemonIncreaseBudget: (amount) => { get().sendToDaemon({ type: "mlra_increase_budget", amount }); },
  daemonInjectMessage: (callerId, content) => { get().sendToDaemon({ type: "mlra_inject_message", callerId, content }); },

  // ── Handle incoming daemon messages ──

  handleDaemonMessage: (raw) => {
    try {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case "mlra_agent_registered": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          const existing = launcher.registeredAgents.find((a) => a.id === msg.callerId);
          if (existing) break;
          get().addRegisteredAgent(launcher.id, {
            id: msg.callerId,
            alias: msg.alias || "",
            clientName: msg.clientName || "",
            model: msg.model || "",
            workspace: msg.workspace || "",
            assignedRole: null,
            workerRole: "",
            registeredAt: new Date().toISOString(),
          });
          break;
        }

        case "mlra_orchestration_status": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          const state = msg.state || msg;
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              const roleState = (state.roles || {}) as Record<RuntimeMainRole, { status?: string; model?: string }>;
              const agents = { ...l.agents };
              for (const role of ["expert", "inspector", "ceo"] as RuntimeMainRole[]) {
                const slot = agents[role];
                const roleInfo = roleState[role];
                if (slot && roleInfo) {
                  agents[role] = {
                    ...slot,
                    model: roleInfo.model || slot.model,
                    status: normalizeAgentStatus(roleInfo.status),
                  };
                }
              }
              return {
                ...l,
                status: state.status || l.status,
                controlMode: state.controlMode || l.controlMode,
                orchestrationPolicy: state.orchestrationPolicy || l.orchestrationPolicy,
                ceoGate: state.ceoGate || l.ceoGate,
                humanGate: state.humanGate || null,
                stageExitPending: state.stageExitPending || null,
                stageExitReadiness: state.stageExitReadiness || l.stageExitReadiness,
                blueprintRuntime: state.blueprintRuntime || l.blueprintRuntime,
                selectedStageId: state.blueprintRuntime?.currentStageId || l.selectedStageId,
                roundHistory: Array.isArray(state.rounds)
                  ? state.rounds.map((round: RoundRecord) => ({
                      id: round.id,
                      role: round.role,
                      stageId: round.stageId ?? null,
                      startedAt: round.startedAt,
                      endedAt: round.endedAt ?? null,
                    }))
                  : l.roundHistory,
                agents,
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          break;
        }

        case "mlra_human_gate_update": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          const humanGate = (msg.humanGate || null) as HumanGateState | null;
          set((s) => ({
            launchers: s.launchers.map((l) =>
              l.id === launcher.id
                ? {
                    ...l,
                    humanGate,
                    status: humanGate?.active ? "awaiting-user" : (l.status === "awaiting-user" ? "running" : l.status),
                    updatedAt: new Date().toISOString(),
                  }
                : l
            ),
          }));
          break;
        }

        case "mlra_round_event": {
          const launcher = get().getActiveLauncher();
          if (!launcher || !msg.round) break;
          const round = msg.round as { id: string; role: string; stageId?: string | null; startedAt: string; endedAt: string | null };
          if (msg.event === "start") {
            set((s) => ({
              launchers: s.launchers.map((l) => {
                if (l.id !== launcher.id) return l;
                const exists = l.roundHistory.some((r) => r.id === round.id);
                if (exists) return l;
                return { ...l, roundHistory: [...l.roundHistory, { id: round.id, role: round.role, stageId: round.stageId ?? null, startedAt: round.startedAt, endedAt: null }] };
              }),
            }));
          } else if (msg.event === "end") {
            set((s) => ({
              launchers: s.launchers.map((l) => {
                if (l.id !== launcher.id) return l;
                return {
                  ...l,
                  roundHistory: l.roundHistory.map((r) => (r.id === round.id ? { ...r, stageId: round.stageId ?? r.stageId ?? null, endedAt: round.endedAt || new Date().toISOString() } : r)),
                };
              }),
            }));
          }
          break;
        }

        case "mlra_session_pool_update": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          const pool = msg.pool as SessionPool;
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              return { ...l, sessionPools: { ...l.sessionPools, [pool.role]: pool }, updatedAt: new Date().toISOString() };
            }),
          }));
          break;
        }

        case "mlra_budget_update": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          set((s) => ({
            launchers: s.launchers.map((l) =>
              l.id === launcher.id ? { ...l, budget: msg.budget as BudgetStatus, updatedAt: new Date().toISOString() } : l
            ),
          }));
          break;
        }

        case "mlra_budget_pause": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          set((s) => ({
            launchers: s.launchers.map((l) =>
              l.id === launcher.id
                ? { ...l, status: "paused", budget: msg.budget as BudgetStatus, pausedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
                : l
            ),
          }));
          break;
        }

        case "mlra_ceo_gate_status":
        case "mlra_gate_status": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          if (msg.ceoGate) {
            set((s) => ({
              launchers: s.launchers.map((l) =>
                l.id === launcher.id ? { ...l, ceoGate: msg.ceoGate as CeoGateStatus, updatedAt: new Date().toISOString() } : l
              ),
            }));
          }
          break;
        }

        case "mlra_stage_change": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          const stageTo = msg.stageTo as { id: string; name: string; isClosing: boolean } | null;
          if (!stageTo) break;
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              const isClosing = Boolean(stageTo.isClosing);
              return {
                ...l,
                selectedStageId: stageTo.id,
                status: isClosing ? "awaiting-user" : l.status,
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          break;
        }

        case "mlra_role_connected": {
          console.log(`[MLRA] Role connected: ${msg.role} (${msg.clientName})`);
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          const role = msg.role as RuntimeMainRole;
          if (!["expert", "inspector", "ceo"].includes(role)) break;
          const slot: AgentSlot = {
            id: `mlra-${role}`,
            role,
            displayName: ROLE_DISPLAY_NAMES[role],
            model: msg.model || "",
            status: role === "ceo" ? "standby" : "active",
            color: ROLE_COLORS[role],
            activeSessionId: null,
            sessionIds: [],
          };
          set((s) => ({
            launchers: s.launchers.map((l) =>
              l.id === launcher.id ? { ...l, agents: { ...l.agents, [role]: slot }, updatedAt: new Date().toISOString() } : l
            ),
          }));
          break;
        }

        case "mlra_role_disconnected": {
          console.log(`[MLRA] Role disconnected: ${msg.role}`);
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          const role = msg.role as RuntimeMainRole;
          if (!["expert", "inspector", "ceo"].includes(role)) break;
          set((s) => ({
            launchers: s.launchers.map((l) =>
              l.id === launcher.id ? { ...l, agents: { ...l.agents, [role]: null }, updatedAt: new Date().toISOString() } : l
            ),
          }));
          break;
        }

        case "mlra_workflow_paused": {
          console.log(`[MLRA] Workflow paused: ${msg.reason}`);
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          set((s) => ({
            launchers: s.launchers.map((l) =>
              l.id === launcher.id ? { ...l, status: "paused", updatedAt: new Date().toISOString() } : l
            ),
          }));
          break;
        }

        case "mlra_workflow_complete": {
          console.log("[MLRA] Workflow complete");
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          set((s) => ({
            launchers: s.launchers.map((l) =>
              l.id === launcher.id ? { ...l, status: "completed", updatedAt: new Date().toISOString() } : l
            ),
          }));
          break;
        }

        default:
          console.log("[MLRA] Unhandled daemon message:", msg.type);
      }
    } catch (e) {
      console.error("[MLRA] Failed to parse daemon message:", e);
    }
  },

  // ── Getters ──

  getActiveLauncher: () => {
    const { launchers, activeLauncherId } = get();
    return launchers.find((l) => l.id === activeLauncherId) || null;
  },
}));
