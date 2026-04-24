import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

// ── Agent Role Types ──

export type AgentRole =
  | "planning-expert"
  | "planning-inspector"
  | "execution-expert"
  | "execution-inspector"
  | "ceo"
  | "worker";
export type ControlMode = "autopilot" | "ceo-override";
export type LauncherStatus = "configuring" | "ready" | "running" | "paused" | "completed" | "cancelled";
export type AgentSlotStatus = "active" | "standby" | "idle";
export type WorkerStatus = "ready" | "working" | "broken";
export type PhaseView = "planning" | "execution";
export type StartMode = "full" | "direct-execution";

export type BlueprintTemplateId = "standard" | "direct-execution" | "architecture" | "bugfix" | "audit";
export type StageRoleTarget = "expert" | "inspector";
export type StageSkillKey =
  | "intent_classification"
  | "codebase_assessment"
  | "submit_plan_draft"
  | "review_plan"
  | "submit_phase_report"
  | "review_phase"
  | "re_verify"
  | "decision_levels"
  | "ceo_verdict"
  | "hallucination_check"
  | "vote_discipline"
  | "failure_recovery";

export interface GlobalPolicy {
  defaultSkillMode: "template" | "manual" | "merged";
  ceoStrictness: "strict" | "balanced" | "custom";
  requireProjectSurvey: boolean;
  allowDirectExecutionWithoutPlanning: boolean;
}

export interface StageBlueprint {
  id: string;
  order: number;
  enabled: boolean;
  name: string;
  phaseType: PhaseView;
  objective: string;
  description: string;
  openerTarget: StageRoleTarget;
  openerPrompt: string;
  reviewerPrompt: string;
  ceoGatePrompt: string;
  recommendedSkills: StageSkillKey[];
  completionRule: string;
  templateSource: BlueprintTemplateId | null;
}

export interface WorkflowBlueprint {
  version: 1;
  templateId: BlueprintTemplateId | null;
  name: string;
  description: string;
  startMode: StartMode;
  initialTask: string;
  globalPolicy: GlobalPolicy;
  stages: StageBlueprint[];
}

export interface BlueprintRuntimeSummary {
  name: string | null;
  templateId: BlueprintTemplateId | null;
  currentStageId: string | null;
  currentStageIndex: number;
  totalStages: number;
  currentStage: {
    id: string;
    name: string;
    phaseType: PhaseView;
    openerTarget: StageRoleTarget;
  } | null;
}

export const BLUEPRINT_TEMPLATE_OPTIONS: Array<{ id: BlueprintTemplateId; label: string; description: string }> = [
  { id: "standard", label: "标准全链路", description: "需求澄清 → 规划 → 实施 → 终审" },
  { id: "direct-execution", label: "直接执行", description: "跳过完整规划，先分析后实施" },
  { id: "architecture", label: "架构设计", description: "以方案构思和门控评审为主" },
  { id: "bugfix", label: "缺陷修复", description: "定位问题 → 修复 → 回归 → 终审" },
  { id: "audit", label: "审计复核", description: "以审查、举证和判定为主" },
];

export const STAGE_SKILL_OPTIONS: Array<{ key: StageSkillKey; label: string }> = [
  { key: "intent_classification", label: "需求分类" },
  { key: "codebase_assessment", label: "代码库勘察" },
  { key: "submit_plan_draft", label: "规划提交" },
  { key: "review_plan", label: "规划审查" },
  { key: "submit_phase_report", label: "阶段报告" },
  { key: "review_phase", label: "阶段审查" },
  { key: "re_verify", label: "再验证" },
  { key: "decision_levels", label: "决策分级" },
  { key: "ceo_verdict", label: "CEO 裁决" },
  { key: "hallucination_check", label: "幻觉检查" },
  { key: "vote_discipline", label: "投票纪律" },
  { key: "failure_recovery", label: "失败恢复" },
];

// ── Session Pool Types ──

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
  type: "planning_gate" | "final_review" | "arbitration" | null;
  round: number;
  minDefensiveRounds: number;
  consecutiveApprovals: number;
  requiredConsecutive: number;
  history: Array<{ round: number; verdict: string; reason: string }>;
}

// ── Role Colors ──

export const ROLE_COLORS: Record<string, string> = {
  "planning-expert": "#06B6D4",
  "planning-inspector": "#06B6D4",
  "execution-expert": "#818CF8",
  "execution-inspector": "#818CF8",
  ceo: "#F59E0B",
  worker: "#64748B",
  workerPool: "#64748B",
};

// ── Registered Agent (before role assignment) ──

export interface RegisteredAgent {
  id: string;          // caller ID from MLFB
  alias: string;       // 4-char alias
  clientName: string;  // MCP client name
  model: string;       // detected model name
  workspace: string;   // project directory
  assignedRole: AgentRole | null;
  workerRole: string;  // custom routing role when assignedRole === "worker"
  registeredAt: string;
}

// ── Agent Slots (after orchestration starts) ──

export interface AgentSlot {
  id: string;
  role: string;          // AgentRole excluding "worker"
  displayName: string;
  model: string;
  status: AgentSlotStatus;
  color: string;
  activeSessionId: string | null;
  sessionIds: string[];
}

export interface WorkerSlot {
  id: string;
  role: string;          // e.g. "前端外包" / "后端外包"
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
  startedAt: string;
  endedAt: string | null;
}

export interface Launcher {
  id: string;
  name: string;
  status: LauncherStatus;
  currentPhase: PhaseView;
  controlMode: ControlMode;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  pausedAt: string | null;
  pausedElapsed: number; // total ms spent in paused state

  // Registered agents (configuring phase)
  registeredAgents: RegisteredAgent[];

  // Agent slots (after orchestration starts)
  agents: {
    "planning-expert": AgentSlot | null;
    "planning-inspector": AgentSlot | null;
    "execution-expert": AgentSlot | null;
    "execution-inspector": AgentSlot | null;
    ceo: AgentSlot | null;
    workers: WorkerSlot[];
  };

  planningSessionIds: string[];
  implementationSessionIds: string[];
  roundHistory: RoundRecord[];

  // Session pools & budget
  sessionPools: Record<string, SessionPool>;
  budget: BudgetStatus | null;

  // Start mode & CEO gate
  startMode: StartMode | null;
  ceoGate: CeoGateStatus | null;

  // Task description & type
  taskType: string | null;
  userTask: string;
  blueprint: WorkflowBlueprint;
  blueprintRuntime: BlueprintRuntimeSummary | null;
  blueprintDirty: boolean;
  selectedStageId: string | null;

  // Agent self-reported progress (display-only)
  lastProgress: string | null;
}

// ── Store ──

export interface MLRAState {
  // Launcher management
  launchers: Launcher[];
  activeLauncherId: string | null;
  launcherSidebarOpen: boolean;

  // View state
  phaseView: PhaseView;
  columnOrder: string[];
  layoutMode: "auto" | 1 | 2 | 3 | 4;

  // Actions — Launcher CRUD
  createLauncher: (name: string) => string;
  switchLauncher: (id: string) => void;
  setControlMode: (id: string, mode: ControlMode) => void;
  deleteLauncher: (id: string) => void;
  renameLauncher: (id: string, name: string) => void;

  // Actions — Agent registration & role assignment
  addRegisteredAgent: (launcherId: string, agent: RegisteredAgent) => void;
  assignRole: (launcherId: string, agentId: string, role: AgentRole | null, workerRole?: string) => void;
  removeRegisteredAgent: (launcherId: string, agentId: string) => void;
  setWorkerRole: (launcherId: string, agentId: string, workerRole: string) => void;
  setTaskType: (launcherId: string, taskType: string | null) => void;
  setUserTask: (launcherId: string, userTask: string) => void;
  updateBlueprintMeta: (launcherId: string, patch: Partial<Pick<WorkflowBlueprint, "name" | "description" | "initialTask" | "startMode">>) => void;
  applyBlueprintTemplate: (launcherId: string, templateId: BlueprintTemplateId) => void;
  selectBlueprintStage: (launcherId: string, stageId: string | null) => void;
  addBlueprintStage: (launcherId: string) => void;
  updateBlueprintStage: (launcherId: string, stageId: string, patch: Partial<Omit<StageBlueprint, "id" | "order">>) => void;
  removeBlueprintStage: (launcherId: string, stageId: string) => void;
  moveBlueprintStage: (launcherId: string, stageId: string, direction: -1 | 1) => void;
  duplicateBlueprintStage: (launcherId: string, stageId: string) => void;
  validateBlueprint: (launcherId: string) => string[];

  // Actions — Start orchestration
  startOrchestration: (launcherId: string, startMode: StartMode) => void;

  // Actions — View
  setPhaseView: (phase: PhaseView) => void;
  setColumnOrder: (order: string[]) => void;
  setLayoutMode: (mode: "auto" | 1 | 2 | 3 | 4) => void;
  toggleLauncherSidebar: () => void;

  // Actions — Daemon communication (sends to MLRA daemon via Tauri IPC)
  sendToDaemon: (msg: Record<string, unknown>) => Promise<void>;
  daemonAssignRole: (launcherId: string, agentId: string, role: AgentRole | null) => void;
  daemonStartOrchestration: (launcherId: string, userTask: string, startMode: StartMode, taskType?: string, blueprint?: WorkflowBlueprint) => void;
  daemonSetControlMode: (mode: ControlMode) => void;
  daemonReviewApproved: (content: string) => void;
  daemonReviewRejected: (reason: string) => void;
  daemonTerminate: () => void;
  daemonSetBudget: (limit: number) => void;
  daemonIncreaseBudget: (amount: number) => void;
  daemonInjectMessage: (callerId: string, content: string) => void;

  // Actions — Handle incoming MLRA daemon messages
  handleDaemonMessage: (raw: string) => void;

  // Getters
  getActiveLauncher: () => Launcher | null;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function normalizeStageOrder(stages: StageBlueprint[]): StageBlueprint[] {
  return stages.map((stage, index) => ({ ...stage, order: index }));
}

function createStageBlueprint(templateSource: BlueprintTemplateId | null, partial: Partial<Omit<StageBlueprint, "id" | "order">> = {}): StageBlueprint {
  return {
    id: generateId(),
    order: 0,
    enabled: partial.enabled ?? true,
    name: partial.name ?? "新阶段",
    phaseType: partial.phaseType ?? "planning",
    objective: partial.objective ?? "定义本阶段的核心目标",
    description: partial.description ?? "",
    openerTarget: partial.openerTarget ?? "expert",
    openerPrompt: partial.openerPrompt ?? "请先根据当前阶段目标建立工作框架，再开始提交。",
    reviewerPrompt: partial.reviewerPrompt ?? "请根据本阶段目标和完成标准进行独立审查。",
    ceoGatePrompt: partial.ceoGatePrompt ?? "仅在该阶段产物满足目标、证据充分且风险被充分揭示时批准通过。",
    recommendedSkills: partial.recommendedSkills ?? [],
    completionRule: partial.completionRule ?? "当当前阶段目标已完成、关键风险已暴露且产出可进入下一阶段时视为完成。",
    templateSource,
  };
}

export function createBlueprintFromTemplate(templateId: BlueprintTemplateId, launcherName: string): WorkflowBlueprint {
  const basePolicy: GlobalPolicy = {
    defaultSkillMode: "merged",
    ceoStrictness: "strict",
    requireProjectSurvey: true,
    allowDirectExecutionWithoutPlanning: templateId === "direct-execution",
  };

  const templates: Record<BlueprintTemplateId, Omit<WorkflowBlueprint, "version" | "name" | "initialTask">> = {
    standard: {
      templateId: "standard",
      description: "从任务理解、规划、实施到 CEO 终审的标准工作流。",
      startMode: "full",
      globalPolicy: basePolicy,
      stages: normalizeStageOrder([
        createStageBlueprint("standard", {
          name: "需求理解与边界澄清",
          phaseType: "planning",
          objective: "先明确任务边界、约束、风险和信息缺口。",
          openerTarget: "expert",
          openerPrompt: "先读取 AGENTS.md 和关键实现，再产出问题边界、假设、风险与执行建议。",
          reviewerPrompt: "检查边界定义是否遗漏关键上下文、风险和依赖。",
          ceoGatePrompt: "只有当问题边界清晰、风险和关键假设已明确时，才允许进入正式规划。",
          recommendedSkills: ["intent_classification", "codebase_assessment", "decision_levels"],
          completionRule: "边界、假设、风险和目标已形成可审查文本。",
        }),
        createStageBlueprint("standard", {
          name: "规划草案",
          phaseType: "planning",
          objective: "产出可执行的实施规划。",
          openerTarget: "expert",
          openerPrompt: "基于现状和任务目标产出一份可执行规划书，要求阶段明确、路径清晰、风险可追踪。",
          reviewerPrompt: "重点审查方案结构、遗漏项、依赖关系和失败路径。",
          ceoGatePrompt: "只有当方案具备明确阶段划分、验收标准和风险控制时才可批准。",
          recommendedSkills: ["submit_plan_draft", "review_plan", "vote_discipline"],
          completionRule: "规划书已达到双方可投票的成熟度。",
        }),
        createStageBlueprint("standard", {
          name: "实施执行",
          phaseType: "execution",
          objective: "按规划逐步实施并完成本地验证。",
          openerTarget: "expert",
          openerPrompt: "根据已批准规划分阶段落地，完成每一阶段后提交报告与验证结果。",
          reviewerPrompt: "不要相信报告自述，必须回到真实代码和输出验证。",
          ceoGatePrompt: "只有当代码改动、验证证据和风险披露均充分时，才允许终审通过。",
          recommendedSkills: ["submit_phase_report", "review_phase", "re_verify", "failure_recovery"],
          completionRule: "所有实现阶段完成并通过审查，具备最终 CEO 终审条件。",
        }),
      ]),
    },
    "direct-execution": {
      templateId: "direct-execution",
      description: "跳过完整规划对峙，先做快速分析后直接实施。",
      startMode: "direct-execution",
      globalPolicy: { ...basePolicy, allowDirectExecutionWithoutPlanning: true },
      stages: normalizeStageOrder([
        createStageBlueprint("direct-execution", {
          name: "执行前快速分析",
          phaseType: "execution",
          objective: "快速建立实现路径和风险清单。",
          openerTarget: "expert",
          openerPrompt: "先做最小必要分析，直接形成执行路径、关键风险和验证计划，然后开始实施。",
          reviewerPrompt: "确认快速分析没有遗漏高风险依赖或回滚问题。",
          ceoGatePrompt: "仅在直接执行带来的风险仍可控时批准继续。",
          recommendedSkills: ["codebase_assessment", "submit_phase_report", "re_verify"],
          completionRule: "执行路径明确且已准备开始实施。",
        }),
        createStageBlueprint("direct-execution", {
          name: "分阶段实施与终审",
          phaseType: "execution",
          objective: "完成改动、验证和 CEO 最终决策。",
          openerTarget: "expert",
          openerPrompt: "按阶段完成实际改动和验证，并在结束时准备接受最终审查。",
          reviewerPrompt: "逐阶段核对实际实现、测试结果和风险说明。",
          ceoGatePrompt: "只有当最终产出与验证足够扎实时才可通过。",
          recommendedSkills: ["submit_phase_report", "review_phase", "ceo_verdict"],
          completionRule: "所有改动完成、验证完成，并通过 CEO 终审。",
        }),
      ]),
    },
    architecture: {
      templateId: "architecture",
      description: "以调研、方案候选和 CEO 门控为主的架构设计流。",
      startMode: "full",
      globalPolicy: basePolicy,
      stages: normalizeStageOrder([
        createStageBlueprint("architecture", {
          name: "现状调研",
          phaseType: "planning",
          objective: "建立架构现状、约束和改造边界。",
          openerTarget: "expert",
          openerPrompt: "先调研当前架构、模块边界、关键约束和历史包袱。",
          reviewerPrompt: "检查调研是否覆盖关键模块、约束和未决风险。",
          ceoGatePrompt: "只有当现状调研足够支持架构决策时才批准进入候选方案。",
          recommendedSkills: ["intent_classification", "codebase_assessment"],
          completionRule: "现状、约束和风险具备可对照基础。",
        }),
        createStageBlueprint("architecture", {
          name: "候选方案与门控",
          phaseType: "planning",
          objective: "形成候选方案并完成门控评审。",
          openerTarget: "expert",
          openerPrompt: "产出候选架构方案、取舍理由和推荐路线。",
          reviewerPrompt: "审查方案取舍、演进成本和落地可行性。",
          ceoGatePrompt: "仅在方案权衡充分、风险透明且推荐路线合理时批准。",
          recommendedSkills: ["submit_plan_draft", "review_plan", "ceo_verdict"],
          completionRule: "候选方案完成并通过 CEO 门控。",
        }),
      ]),
    },
    bugfix: {
      templateId: "bugfix",
      description: "聚焦缺陷定位、修复策略、回归验证和终审。",
      startMode: "full",
      globalPolicy: basePolicy,
      stages: normalizeStageOrder([
        createStageBlueprint("bugfix", {
          name: "缺陷定位",
          phaseType: "planning",
          objective: "稳定复现并找出根因。",
          openerTarget: "expert",
          openerPrompt: "优先建立复现路径、根因假设和影响面。",
          reviewerPrompt: "核查根因是否真实、影响面是否完整。",
          ceoGatePrompt: "只有当根因明确且误判风险可控时才允许进入修复。",
          recommendedSkills: ["codebase_assessment", "decision_levels", "review_plan"],
          completionRule: "复现路径、根因和影响面已经明确。",
        }),
        createStageBlueprint("bugfix", {
          name: "修复与回归",
          phaseType: "execution",
          objective: "完成修复并进行回归验证。",
          openerTarget: "expert",
          openerPrompt: "按最小影响面原则完成修复，并提供验证证据。",
          reviewerPrompt: "核查修复有效性、回归影响和测试覆盖。",
          ceoGatePrompt: "只有当修复证据充分且无明显回归风险时批准通过。",
          recommendedSkills: ["submit_phase_report", "review_phase", "re_verify"],
          completionRule: "缺陷修复完成并通过终审。",
        }),
      ]),
    },
    audit: {
      templateId: "audit",
      description: "以审查、举证和 CEO 判定为主的审计型工作流。",
      startMode: "full",
      globalPolicy: basePolicy,
      stages: normalizeStageOrder([
        createStageBlueprint("audit", {
          name: "审计标准建立",
          phaseType: "planning",
          objective: "先建立审计口径和证据要求。",
          openerTarget: "inspector",
          openerPrompt: "先从审查维度出发定义审计清单、判定标准和证据要求。",
          reviewerPrompt: "确认审计标准没有遗漏关键风险与误判源。",
          ceoGatePrompt: "只有当审计标准可执行、可验证且足够严格时才批准。",
          recommendedSkills: ["review_plan", "decision_levels", "hallucination_check"],
          completionRule: "审计标准和证据框架已经明确。",
        }),
        createStageBlueprint("audit", {
          name: "举证与判定",
          phaseType: "execution",
          objective: "围绕既定标准进行举证、审查和判定。",
          openerTarget: "expert",
          openerPrompt: "根据审计标准收集证据并形成结论性材料。",
          reviewerPrompt: "围绕证据充分性、结论严谨性和遗漏风险做独立复核。",
          ceoGatePrompt: "仅在证据充分、结论严谨且主要风险已揭示时批准。",
          recommendedSkills: ["submit_phase_report", "review_phase", "ceo_verdict"],
          completionRule: "证据链完整且具备 CEO 最终判定条件。",
        }),
      ]),
    },
  };

  const template = templates[templateId];
  return {
    version: 1,
    templateId,
    name: launcherName,
    description: template.description,
    startMode: template.startMode,
    initialTask: "",
    globalPolicy: { ...template.globalPolicy },
    stages: template.stages,
  };
}

function getDefaultBlueprint(launcherName: string): WorkflowBlueprint {
  return createBlueprintFromTemplate("standard", launcherName);
}

function getBlueprintStartStage(blueprint: WorkflowBlueprint, startMode: StartMode): StageBlueprint | null {
  const enabledStages = blueprint.stages.filter((stage) => stage.enabled);
  if (enabledStages.length === 0) return null;
  if (startMode === "direct-execution") {
    return enabledStages.find((stage) => stage.phaseType === "execution") || enabledStages[0];
  }
  return enabledStages[0];
}

function createEmptyAgentSlot(role: Exclude<AgentRole, "worker">, agent: RegisteredAgent): AgentSlot {
  const roleNames: Record<string, string> = {
    "planning-expert": "规划专家",
    "planning-inspector": "规划监察",
    "execution-expert": "实施专家",
    "execution-inspector": "实施监察",
    ceo: "CEO",
  };
  return {
    id: agent.id,
    role: role as AgentSlot["role"],
    displayName: roleNames[role] || role,
    model: agent.model,
    status: role === "ceo" ? "standby" : "active",
    color: ROLE_COLORS[role] || "#64748B",
    activeSessionId: null,
    sessionIds: [],
  };
}

export const useMLRAStore = create<MLRAState>((set, get) => ({
  launchers: [],
  activeLauncherId: null,
  launcherSidebarOpen: false,

  phaseView: "planning",
  columnOrder: ["planning-expert", "planning-inspector", "execution-expert", "execution-inspector", "ceo", "workers"],
  layoutMode: "auto",

  // ── Launcher CRUD ──

  createLauncher: (name) => {
    const id = generateId();
    const blueprint = getDefaultBlueprint(name);
    const launcher: Launcher = {
      id,
      name,
      status: "configuring",
      currentPhase: "planning",
      controlMode: "ceo-override",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      pausedAt: null,
      pausedElapsed: 0,
      registeredAgents: [],
      agents: { "planning-expert": null, "planning-inspector": null, "execution-expert": null, "execution-inspector": null, ceo: null, workers: [] },
      planningSessionIds: [],
      implementationSessionIds: [],
      roundHistory: [],
      sessionPools: {},
      budget: null,
      startMode: null,
      ceoGate: null,
      taskType: null,
      userTask: "",
      blueprint,
      blueprintRuntime: null,
      blueprintDirty: false,
      selectedStageId: blueprint.stages[0]?.id ?? null,
      lastProgress: null,
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
        l.id === id
          ? { ...l, controlMode: mode, updatedAt: new Date().toISOString() }
          : l
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
          ? {
              ...l,
              registeredAgents: [...l.registeredAgents, agent],
              updatedAt: new Date().toISOString(),
            }
          : l
      ),
    })),

  assignRole: (launcherId, agentId, role, workerRole) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;
        // If role is already assigned to another agent, unassign it first
        const updatedAgents = l.registeredAgents.map((a) => {
          if (a.id === agentId) return { ...a, assignedRole: role, workerRole: role === "worker" ? (workerRole ?? a.workerRole) : "" };
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
          ? {
              ...l,
              registeredAgents: l.registeredAgents.filter((a) => a.id !== agentId),
              updatedAt: new Date().toISOString(),
            }
          : l
      ),
    })),

  setWorkerRole: (launcherId, agentId, workerRole) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === launcherId
          ? {
              ...l,
              registeredAgents: l.registeredAgents.map((a) =>
                a.id === agentId ? { ...a, workerRole } : a
              ),
              updatedAt: new Date().toISOString(),
            }
          : l
      ),
    })),

  setTaskType: (launcherId, taskType) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === launcherId
          ? {
              ...l,
              taskType,
              blueprintDirty: true,
              updatedAt: new Date().toISOString(),
            }
          : l
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
      launchers: s.launchers.map((l) =>
        l.id === launcherId ? { ...l, selectedStageId: stageId } : l
      ),
    })),

  addBlueprintStage: (launcherId) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;
        const stage = createStageBlueprint(l.blueprint.templateId, {
          name: `阶段 ${l.blueprint.stages.length + 1}`,
          phaseType: l.blueprint.startMode === "direct-execution" ? "execution" : "planning",
        });
        const stages = normalizeStageOrder([...l.blueprint.stages, stage]);
        return {
          ...l,
          blueprint: { ...l.blueprint, stages },
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
        const stages = l.blueprint.stages.map((stage) =>
          stage.id === stageId ? { ...stage, ...patch } : stage
        );
        return {
          ...l,
          blueprint: { ...l.blueprint, stages },
          blueprintDirty: true,
          updatedAt: new Date().toISOString(),
        };
      }),
    })),

  removeBlueprintStage: (launcherId, stageId) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;
        const stages = normalizeStageOrder(l.blueprint.stages.filter((stage) => stage.id !== stageId));
        return {
          ...l,
          blueprint: { ...l.blueprint, stages },
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
        const stages = [...l.blueprint.stages];
        const index = stages.findIndex((stage) => stage.id === stageId);
        const targetIndex = index + direction;
        if (index === -1 || targetIndex < 0 || targetIndex >= stages.length) return l;
        const [stage] = stages.splice(index, 1);
        stages.splice(targetIndex, 0, stage);
        return {
          ...l,
          blueprint: { ...l.blueprint, stages: normalizeStageOrder(stages) },
          blueprintDirty: true,
          updatedAt: new Date().toISOString(),
        };
      }),
    })),

  duplicateBlueprintStage: (launcherId, stageId) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;
        const index = l.blueprint.stages.findIndex((stage) => stage.id === stageId);
        if (index === -1) return l;
        const source = l.blueprint.stages[index];
        const clone = createStageBlueprint(l.blueprint.templateId, {
          ...source,
          name: `${source.name}（副本）`,
        });
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

  validateBlueprint: (launcherId) => {
    const launcher = get().launchers.find((item) => item.id === launcherId);
    if (!launcher) return ["Launcher 不存在"];
    const errors: string[] = [];
    const enabledStages = launcher.blueprint.stages.filter((stage) => stage.enabled);
    if (!launcher.blueprint.initialTask.trim() && !launcher.userTask.trim() && !launcher.name.trim()) {
      errors.push("请填写任务描述");
    }
    if (enabledStages.length === 0) {
      errors.push("至少启用一个阶段");
    }
    enabledStages.forEach((stage, index) => {
      if (!stage.name.trim()) errors.push(`阶段 ${index + 1} 缺少名称`);
      if (!stage.openerPrompt.trim()) errors.push(`阶段 ${stage.name || index + 1} 缺少开场提示词`);
      if (!stage.ceoGatePrompt.trim()) errors.push(`阶段 ${stage.name || index + 1} 缺少 CEO 审批提示词`);
    });
    return errors;
  },

  // ── Start orchestration ──

  startOrchestration: (launcherId, startMode) => {
    const launcher = get().launchers.find((l) => l.id === launcherId);
    if (!launcher || (launcher.status !== "configuring" && launcher.status !== "ready")) return;
    const blueprintErrors = get().validateBlueprint(launcherId);
    if (blueprintErrors.length > 0) return;
    const blueprint = {
      ...launcher.blueprint,
      startMode,
      initialTask: launcher.userTask || launcher.blueprint.initialTask || launcher.name,
    };
    const startStage = getBlueprintStartStage(blueprint, startMode);

    // Notify daemon (v2 mlra_start IPC)
    get().daemonStartOrchestration(launcherId, blueprint.initialTask, startMode, launcher.taskType || undefined, blueprint);

    // Update local state — v2 mode (no registeredAgents) starts with empty
    // agent slots that get auto-populated by mlra_role_connected events.
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;

        const planningExpert = l.registeredAgents.find((a) => a.assignedRole === "planning-expert");
        const planningInspector = l.registeredAgents.find((a) => a.assignedRole === "planning-inspector");
        const executionExpert = l.registeredAgents.find((a) => a.assignedRole === "execution-expert");
        const executionInspector = l.registeredAgents.find((a) => a.assignedRole === "execution-inspector");
        const ceoAgent = l.registeredAgents.find((a) => a.assignedRole === "ceo");
        const workerAgents = l.registeredAgents.filter((a) => a.assignedRole === "worker");

        return {
          ...l,
          status: "running" as const,
          startMode,
          updatedAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          pausedAt: null,
          pausedElapsed: 0,
          roundHistory: [],
          currentPhase: startStage?.phaseType || (startMode === "direct-execution" ? "execution" as const : "planning" as const),
          blueprint,
          blueprintDirty: false,
          selectedStageId: startStage?.id ?? l.selectedStageId,
          agents: {
            "planning-expert": planningExpert ? createEmptyAgentSlot("planning-expert", planningExpert) : l.agents["planning-expert"],
            "planning-inspector": planningInspector ? createEmptyAgentSlot("planning-inspector", planningInspector) : l.agents["planning-inspector"],
            "execution-expert": executionExpert ? createEmptyAgentSlot("execution-expert", executionExpert) : l.agents["execution-expert"],
            "execution-inspector": executionInspector ? createEmptyAgentSlot("execution-inspector", executionInspector) : l.agents["execution-inspector"],
            ceo: ceoAgent ? createEmptyAgentSlot("ceo", ceoAgent) : l.agents.ceo,
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
    set({ phaseView: startStage?.phaseType || (startMode === "direct-execution" ? "execution" : "planning") });
  },

  // ── View ──

  setPhaseView: (phase) => set({ phaseView: phase }),
  setColumnOrder: (order) => set({ columnOrder: order }),
  setLayoutMode: (mode) => set({ layoutMode: mode }),
  toggleLauncherSidebar: () => set((s) => ({ launcherSidebarOpen: !s.launcherSidebarOpen })),

  // ── Daemon communication ──

  sendToDaemon: async (msg) => {
    try {
      await invoke("send_to_mlra_daemon", { message: JSON.stringify(msg) });
    } catch (e) {
      console.error("[MLRA] sendToDaemon failed:", e);
    }
  },

  daemonAssignRole: (launcherId, agentId, role) => {
    // v1 shim — v2 no longer supports pre-assignment; kept for UI compatibility
    get().sendToDaemon({ type: "mlra_assign_role", launcherId, agentId, role });
  },

  daemonStartOrchestration: (launcherId, userTask, startMode, taskType, blueprint) => {
    // v2 MLRA_START — launcherId/agent assignment dropped (roles are fixed at MCP spawn)
    get().sendToDaemon({
      type: "mlra_start",
      config: { userTask, startMode, taskType: taskType || null, launcherId, blueprint },
    });
  },

  daemonSetControlMode: (mode) => {
    get().sendToDaemon({ type: "mlra_set_control_mode", mode });
  },

  daemonReviewApproved: (content) => {
    get().sendToDaemon({ type: "mlra_review_approved", content });
  },

  daemonReviewRejected: (reason) => {
    get().sendToDaemon({ type: "mlra_review_rejected", reason });
  },

  daemonTerminate: () => {
    get().sendToDaemon({ type: "mlra_terminate" });
  },

  daemonSetBudget: (limit) => {
    get().sendToDaemon({ type: "mlra_set_budget", limit });
  },

  daemonIncreaseBudget: (amount) => {
    get().sendToDaemon({ type: "mlra_increase_budget", amount });
  },

  daemonInjectMessage: (callerId, content) => {
    get().sendToDaemon({ type: "mlra_inject_message", callerId, content });
  },

  // ── Handle incoming daemon messages ──

  handleDaemonMessage: (raw) => {
    try {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case "mlra_agent_registered": {
          // A new agent registered on the daemon — update registeredAgents
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
          // Full state sync from daemon — data is nested under msg.state
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          const state = msg.state || msg; // Support both nested and flat
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              return {
                ...l,
                status: state.status || l.status,
                currentPhase: state.blueprintRuntime?.currentStage?.phaseType || state.phase || l.currentPhase,
                controlMode: state.controlMode || l.controlMode,
                startMode: state.startMode || l.startMode,
                ceoGate: state.ceoGate || l.ceoGate,
                blueprintRuntime: state.blueprintRuntime || l.blueprintRuntime,
                selectedStageId: state.blueprintRuntime?.currentStageId || l.selectedStageId,
                lastProgress: state.lastProgress !== undefined ? state.lastProgress : l.lastProgress,
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          if (state.phase) set({ phaseView: state.phase });
          break;
        }
        case "mlra_round_event": {
          // Round start/end events — update roundHistory for timer stats
          const launcher = get().getActiveLauncher();
          if (!launcher || !msg.round) break;
          const round = msg.round as { id: string; role: string; startedAt: string; endedAt: string | null };
          if (msg.event === "start") {
            set((s) => ({
              launchers: s.launchers.map((l) => {
                if (l.id !== launcher.id) return l;
                // Add new round (avoid duplicates)
                const exists = l.roundHistory.some((r) => r.id === round.id);
                if (exists) return l;
                return {
                  ...l,
                  roundHistory: [...l.roundHistory, { id: round.id, role: round.role, startedAt: round.startedAt, endedAt: null }],
                };
              }),
            }));
          } else if (msg.event === "end") {
            set((s) => ({
              launchers: s.launchers.map((l) => {
                if (l.id !== launcher.id) return l;
                return {
                  ...l,
                  roundHistory: l.roundHistory.map((r) =>
                    r.id === round.id ? { ...r, endedAt: round.endedAt || new Date().toISOString() } : r
                  ),
                };
              }),
            }));
          }
          break;
        }
        case "mlra_human_review": {
          // Daemon requests human review — could trigger UI notification
          console.log("[MLRA] Human review requested:", msg.content);
          break;
        }
        case "mlra_session_derailed": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          console.warn(`[MLRA] Session derailed: ${msg.callerId} (${msg.role}), reason=${msg.reason}, retry=${msg.retryCount}/${msg.maxRetries}`);
          // Agent slot status update is handled via orchestration_status sync
          break;
        }
        case "mlra_session_recovered": {
          console.log(`[MLRA] Session recovered: ${msg.callerId} (${msg.role})`);
          break;
        }
        case "mlra_session_failover": {
          console.warn(`[MLRA] Failover: ${msg.role} ${msg.oldCallerId} → ${msg.newCallerId}`);
          break;
        }
        case "mlra_session_broken": {
          console.error(`[MLRA] Session broken (no standbys): ${msg.callerId} (${msg.role})`);
          break;
        }
        case "mlra_session_pool_update": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          const pool = msg.pool as SessionPool;
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              return {
                ...l,
                sessionPools: { ...l.sessionPools, [pool.role]: pool },
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          break;
        }
        case "mlra_budget_update": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              return {
                ...l,
                budget: msg.budget as BudgetStatus,
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          break;
        }
        case "mlra_budget_pause": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              return {
                ...l,
                status: "paused" as const,
                budget: msg.budget as BudgetStatus,
                pausedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          break;
        }
        case "mlra_ceo_gate_status": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              return {
                ...l,
                ceoGate: msg.ceoGate as CeoGateStatus,
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          break;
        }
        case "mlra_phase_change": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              return {
                ...l,
                currentPhase: msg.to as PhaseView,
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          set({ phaseView: msg.to as PhaseView });
          break;
        }

        // ── v2 events ──
        case "mlra_role_connected": {
          // v2: role-keyed connections (ceo/expert/inspector).
          // Bridge to v1 4-slot model: expert fills both planning-expert +
          // execution-expert; inspector fills both; ceo fills ceo.
          console.log(`[MLRA v2] Role connected: ${msg.role} (${msg.clientName})`);
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          const v2Role = msg.role as "ceo" | "expert" | "inspector";
          const makeSlot = (v1role: Exclude<AgentRole, "worker">): AgentSlot => ({
            id: `v2-${v2Role}`,
            role: v1role,
            displayName: ({
              "planning-expert": "规划专家",
              "planning-inspector": "规划监察",
              "execution-expert": "执行专家",
              "execution-inspector": "执行监察",
              ceo: "CEO",
            } as Record<string, string>)[v1role] || v1role,
            model: msg.model || "",
            status: v1role === "ceo" ? "standby" : "active",
            color: ROLE_COLORS[v1role] || "#64748B",
            activeSessionId: null,
            sessionIds: [],
          });
          const targets: Array<Exclude<AgentRole, "worker">> =
            v2Role === "ceo"
              ? ["ceo"]
              : v2Role === "expert"
              ? ["planning-expert", "execution-expert"]
              : ["planning-inspector", "execution-inspector"];
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              const next = { ...l.agents };
              for (const t of targets) {
                next[t] = makeSlot(t);
              }
              return { ...l, agents: next, updatedAt: new Date().toISOString() };
            }),
          }));
          break;
        }
        case "mlra_role_disconnected": {
          console.log(`[MLRA v2] Role disconnected: ${msg.role}`);
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          const v2Role = msg.role as "ceo" | "expert" | "inspector";
          const targets: Array<Exclude<AgentRole, "worker">> =
            v2Role === "ceo"
              ? ["ceo"]
              : v2Role === "expert"
              ? ["planning-expert", "execution-expert"]
              : ["planning-inspector", "execution-inspector"];
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              const next = { ...l.agents };
              for (const t of targets) next[t] = null;
              return { ...l, agents: next, updatedAt: new Date().toISOString() };
            }),
          }));
          break;
        }
        case "mlra_gate_status": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          if (msg.ceoGate) {
            set((s) => ({
              launchers: s.launchers.map((l) =>
                l.id === launcher.id
                  ? { ...l, ceoGate: msg.ceoGate as CeoGateStatus, updatedAt: new Date().toISOString() }
                  : l
              ),
            }));
          }
          break;
        }
        case "mlra_workflow_paused": {
          console.log(`[MLRA v2] Workflow paused: ${msg.reason}`);
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
          console.log("[MLRA v2] Workflow complete");
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
