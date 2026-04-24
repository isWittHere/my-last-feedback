// ── MLRA Orchestrator State Machine (v2) ──
// Pure logic module — no I/O, no network, fully testable.
//
// v2 topology: 3 dedicated roles (ceo / expert / inspector) + phase state.
// Phases (planning / execution) are internal state, NOT role identity.
// No worker, no launcher, no callerId/alias bookkeeping. Each role has at
// most one connection at any time.

import { ROLES, PHASES, START_MODES, REQUIRED_ROLES_BY_START_MODE } from "../protocol/roles.mjs";
import { buildRoutingPrompt, buildInitialPrompt } from "../protocol/prompts.mjs";
import { createHash } from "node:crypto";

const COLLABORATION_MODES = Object.freeze({
  DELIBERATION: PHASES.PLANNING,
  DELIVERY: PHASES.EXECUTION,
});

const ENTRY_STRATEGIES = Object.freeze({
  FROM_START: START_MODES.FULL,
  DELIVERY_FIRST: START_MODES.DIRECT_EXECUTION,
});

// ── Submit types from Expert ──
const EXPERT_SUBMIT_TYPES = Object.freeze(["plan_draft", "phase_complete"]);

/** @typedef {"ceo"|"expert"|"inspector"} Role */
/** @typedef {"planning"|"execution"} Phase */

export class Orchestrator {
  constructor() {
    /** @type {"configuring"|"ready"|"running"|"paused"|"completed"|"cancelled"} */
    this.status = "configuring";

    /** @type {Phase} */
    this.phase = COLLABORATION_MODES.DELIBERATION;

    /** @type {"full"|"direct-execution"} */
    this.startMode = ENTRY_STRATEGIES.FROM_START;

    /** @type {string} */
    this.userTask = "";
    /** @type {string|null} */
    this.taskType = null;

    /** @type {object|null} */
    this.blueprint = null;
    this.currentStageIndex = -1;
    this.currentStageId = null;

    /**
     * Registered roles. Key = role (ceo/expert/inspector).
     * At most ONE entry per role at any time.
     * @type {Map<Role, RoleEntry>}
     */
    this.roles = new Map();

    // Votes for planning / execution consensus (reset on each gate)
    this.votes = { expert: null, inspector: null };

    this.lastSubmitContent = null;
    this.lastProgress = null;

    // CEO Gate — defensive rejection state machine
    this.ceoGate = this._emptyGate();

    // Stagnation detection
    this.sameFeedbackCount = 0;
    this.lastFeedbackHash = null;
    this.maxSameFeedback = 5;

    // Round tracking
    /** @type {RoundRecord[]} */
    this.rounds = [];
    /** @type {RoundRecord|null} */
    this.currentRound = null;

    // Control mode: "autopilot" = no human review; "ceo-override" = pause on CEO verdicts
    this.controlMode = "ceo-override";

    /** @type {HumanReview|null} */
    this.humanReviewPending = null;

    /** Event callback set by daemon */
    this.onEvent = null;
  }

  get collaborationMode() {
    return this.phase;
  }

  set collaborationMode(mode) {
    this.phase = mode;
  }

  get entryStrategy() {
    return this.startMode;
  }

  set entryStrategy(strategy) {
    this.startMode = strategy;
  }

  _isDeliveryMode(mode = this.collaborationMode) {
    return mode === COLLABORATION_MODES.DELIVERY;
  }

  _isDeliveryFirstEntry(strategy = this.entryStrategy) {
    return strategy === ENTRY_STRATEGIES.DELIVERY_FIRST;
  }

  _isDeliveryStage(stage) {
    return stage?.phaseType === COLLABORATION_MODES.DELIVERY;
  }

  _setCollaborationMode(nextMode) {
    const previousMode = this.collaborationMode;
    this.collaborationMode = nextMode;
    if (previousMode !== this.collaborationMode) {
      this._emit({ type: "phase_transition", from: previousMode, to: this.collaborationMode });
    }
    return this.collaborationMode;
  }

  describeCollaborationMode(mode = this.collaborationMode) {
    return mode === COLLABORATION_MODES.DELIBERATION ? "deliberation" : "delivery";
  }

  describeEntryStrategy(strategy = this.entryStrategy) {
    return strategy === ENTRY_STRATEGIES.DELIVERY_FIRST ? "delivery-first" : "from-start";
  }

  _emptyGate() {
    return {
      active: false,
      /** @type {"planning_gate"|"final_review"|"arbitration"|"stagnation_arbitration"|null} */
      type: null,
      round: 0,
      minDefensiveRounds: 2,
      requiredConsecutive: 2,
      consecutiveApprovals: 0,
      materials: null,
      history: [],
    };
  }

  _getEnabledStages() {
    const stages = Array.isArray(this.blueprint?.stages) ? this.blueprint.stages : [];
    return stages.filter((stage) => stage && stage.enabled !== false);
  }

  _getCurrentStage() {
    const stages = this._getEnabledStages();
    if (this.currentStageId) {
      const byId = stages.find((stage) => stage.id === this.currentStageId);
      if (byId) return byId;
    }
    if (this.currentStageIndex >= 0 && stages[this.currentStageIndex]) {
      return stages[this.currentStageIndex];
    }
    return null;
  }

  _selectStageForStart(startMode) {
    const stages = this._getEnabledStages();
    if (stages.length === 0) return null;
    const nextStage = this._isDeliveryFirstEntry(startMode)
      ? stages.find((stage) => this._isDeliveryStage(stage)) || stages[0]
      : stages[0];
    this.currentStageId = nextStage.id;
    this.currentStageIndex = stages.findIndex((stage) => stage.id === nextStage.id);
    return nextStage;
  }

  _selectFirstExecutionStage() {
    const stages = this._getEnabledStages();
    const nextStage = stages.find((stage) => this._isDeliveryStage(stage)) || null;
    if (!nextStage) return null;
    this.currentStageId = nextStage.id;
    this.currentStageIndex = stages.findIndex((stage) => stage.id === nextStage.id);
    return nextStage;
  }

  _selectNextExecutionStage() {
    const stages = this._getEnabledStages().filter((stage) => this._isDeliveryStage(stage));
    if (stages.length === 0) return null;
    const currentIndex = stages.findIndex((stage) => stage.id === this.currentStageId);
    if (currentIndex === -1 || currentIndex + 1 >= stages.length) return null;
    const nextStage = stages[currentIndex + 1];
    this.currentStageId = nextStage.id;
    const enabledStages = this._getEnabledStages();
    this.currentStageIndex = enabledStages.findIndex((stage) => stage.id === nextStage.id);
    return nextStage;
  }

  _selectNextStage() {
    const stages = this._getEnabledStages();
    if (stages.length === 0) return null;
    const currentIndex = stages.findIndex((stage) => stage.id === this.currentStageId);
    if (currentIndex === -1 || currentIndex + 1 >= stages.length) return null;
    const nextStage = stages[currentIndex + 1];
    this.currentStageId = nextStage.id;
    this.currentStageIndex = currentIndex + 1;
    return nextStage;
  }

  _buildStageEntryInstruction(stage, carriedContent = "") {
    const openerRole = stage?.openerTarget === "inspector" ? ROLES.INSPECTOR : ROLES.EXPERT;
    const intro = buildInitialPrompt(openerRole, this.userTask, stage.phaseType, {
      isDirectExecution: this._isDeliveryFirstEntry(),
      stage,
    });
    const carried = carriedContent ? `\n\n## Previous Stage Output\n\n${carriedContent}` : "";
    return {
      role: openerRole,
      instruction: `${intro}${carried}`,
    };
  }

  transitionToStage(stage, carriedContent = "") {
    this._setCollaborationMode(stage.phaseType);

    const entryInstruction = this._buildStageEntryInstruction(stage, carriedContent);
    for (const role of [ROLES.EXPERT, ROLES.INSPECTOR]) {
      if (!this.roles.has(role)) continue;
      const entry = this.roles.get(role);
      entry.status = role === entryInstruction.role ? "idle" : "blocked";
    }

    return { instructions: [entryInstruction] };
  }

  // ── Role Registration ──

  /**
   * Register a role connection. v2: role is declared at connect time — no
   * separate assignRole step. Rejects duplicates for the same role.
   *
   * @param {Role} role
   * @param {{ workspace?: string, model?: string, clientName?: string }} [meta]
   * @returns {{ ok: true } | { error: string }}
   */
  registerRole(role, meta = {}) {
    if (!Object.values(ROLES).includes(role)) {
      return { error: `Unknown role: ${role}` };
    }
    if (this.roles.has(role)) {
      return { error: `Role already connected: ${role}` };
    }
    this.roles.set(role, {
      role,
      workspace: meta.workspace || null,
      model: meta.model || "unknown",
      clientName: meta.clientName || "unknown",
      status: "registered",
    });
    this._emit({ type: "role_connected", role });
    return { ok: true };
  }

  /**
   * Unregister a role (connection lost).
   * @param {Role} role
   */
  unregisterRole(role) {
    if (!this.roles.has(role)) return { ok: true };
    this.roles.delete(role);
    this._emit({ type: "role_disconnected", role });
    return { ok: true };
  }

  // ── Orchestration Lifecycle ──

  /**
   * @param {"full"|"direct-execution"} startMode
   * @returns {{ ready: boolean, missing: Role[] }}
   */
  checkStartReady(startMode) {
    const required = REQUIRED_ROLES_BY_START_MODE[startMode];
    if (!required) return { ready: false, missing: [] };
    const missing = required.filter((r) => !this.roles.has(r));
    return { ready: missing.length === 0, missing };
  }

  /**
   * Start orchestration. Returns initial prompts for active-phase roles
   * (CEO is NOT released — it stays blocked until a gate trigger).
   *
   * @param {string} userTask
   * @param {"full"|"direct-execution"} [startMode]
   * @param {string|null} [taskType]
   * @returns {{ instructions: {role: Role, instruction: string}[] } | { error: string }}
   */
  startOrchestration(userTask, startMode = START_MODES.FULL, taskType = null, blueprint = null) {
    const readiness = this.checkStartReady(startMode);
    if (!readiness.ready) {
      return { error: `Cannot start: missing roles ${readiness.missing.join(", ")}` };
    }

    this.entryStrategy = startMode;
    this.status = "running";
    this.userTask = userTask;
    this.taskType = taskType;
    this.blueprint = blueprint || null;
    const activeStage = this._selectStageForStart(startMode);
    this._setCollaborationMode(
      activeStage?.phaseType || (this._isDeliveryFirstEntry(startMode) ? COLLABORATION_MODES.DELIVERY : COLLABORATION_MODES.DELIBERATION),
    );

    this._emit({ type: "status_change", status: "running", phase: this.collaborationMode });

    const instructions = [];
    for (const [role, entry] of this.roles) {
      if (role === ROLES.CEO) continue; // CEO stays blocked
      if (activeStage) {
        const openerRole = activeStage.openerTarget === "inspector" ? ROLES.INSPECTOR : ROLES.EXPERT;
        if (role !== openerRole) {
          entry.status = "blocked";
          continue;
        }
      }
      entry.status = "idle";
      instructions.push({
        role,
        instruction: buildInitialPrompt(role, userTask, this.collaborationMode, {
          isDirectExecution: this._isDeliveryFirstEntry(startMode),
          stage: activeStage,
        }),
      });
    }
    return { instructions };
  }

  // ── Submit Handling ──

  /**
   * @param {"plan_draft"|"phase_complete"} submitType
   * @param {string} content
   * @param {{ progress?: string }} [metadata]
   * @returns {RoutingDecision}
   */
  handleExpertSubmit(submitType, content, metadata = {}) {
    if (!EXPERT_SUBMIT_TYPES.includes(submitType)) {
      return { error: `Invalid expert submit type: ${submitType}` };
    }
    const entry = this.roles.get(ROLES.EXPERT);
    if (!entry) return { error: "Expert role not connected" };
    if (this.status !== "running") return { error: `Orchestration not running (status: ${this.status})` };

    this._trackSubmit(ROLES.EXPERT, content, metadata);

    if (this._needsHumanReview(ROLES.EXPERT, submitType)) {
      this.humanReviewPending = {
        role: ROLES.EXPERT,
        submitType,
        originalContent: content,
        targetRole: ROLES.INSPECTOR,
      };
      return { action: "human_review", role: ROLES.EXPERT, submitType, content };
    }

    return this._routeExpertSubmit(submitType, content, metadata);
  }

  /**
   * @param {{ passed: boolean }} meta
   * @param {string} content
   * @returns {RoutingDecision}
   */
  handleInspectorSubmit(content, metadata = {}) {
    const entry = this.roles.get(ROLES.INSPECTOR);
    if (!entry) return { error: "Inspector role not connected" };
    if (this.status !== "running") return { error: `Orchestration not running (status: ${this.status})` };

    this._trackSubmit(ROLES.INSPECTOR, content, metadata);

    if (this._needsHumanReview(ROLES.INSPECTOR, "inspector_submit")) {
      this.humanReviewPending = {
        role: ROLES.INSPECTOR,
        submitType: "inspector_submit",
        originalContent: content,
        targetRole: ROLES.EXPERT,
      };
      return { action: "human_review", role: ROLES.INSPECTOR, submitType: "inspector_submit", content };
    }

    const passed = metadata.passed === true;

    // During execution phase: if Inspector passes → advance Phase; if rejects → send back to Expert
    if (this._isDeliveryMode()) {
      if (passed) return this._advancePhase(content);
    }
    return this._routeToExpert(content);
  }

  _trackSubmit(role, content, metadata) {
    const entry = this.roles.get(role);
    if (entry) entry.status = "blocked";
    this.lastSubmitContent = content;
    if (metadata.progress) this.lastProgress = metadata.progress;
    this._endCurrentRound();
    this._startRound(role);
    this._checkStagnation(content);
  }

  _needsHumanReview(role, _submitType) {
    switch (this.controlMode) {
      case "autopilot": return false;
      case "ceo-override": return role === ROLES.CEO;
      default: return false;
    }
  }

  approveHumanReview(modifiedContent) {
    if (!this.humanReviewPending) return { error: "No pending review" };
    const { role, submitType, originalContent } = this.humanReviewPending;
    const content = modifiedContent || originalContent;
    this.humanReviewPending = null;
    if (role === ROLES.EXPERT) return this._routeExpertSubmit(submitType, content, {});
    if (role === ROLES.INSPECTOR) {
      if (this._isDeliveryMode()) {
        return this._routeToExpert(content);
      }
      return this._routeToExpert(content);
    }
    return { action: "noop" };
  }

  rejectHumanReview(reason) {
    if (!this.humanReviewPending) return { error: "No pending review" };
    const { role } = this.humanReviewPending;
    this.humanReviewPending = null;
    return {
      action: "route",
      targetRole: role,
      content: `[人工审查拒绝] ${reason}\n\n请根据反馈修改后重新提交。`,
    };
  }

  _routeExpertSubmit(submitType, content, metadata) {
    // Always routes Expert → Inspector regardless of submit type / phase
    if (!this.roles.has(ROLES.INSPECTOR)) {
      return { error: "Inspector role not connected" };
    }
    const { prefix, suffix } = buildRoutingPrompt(ROLES.EXPERT, ROLES.INSPECTOR, this.collaborationMode, {
      stage: this._getCurrentStage(),
    });
    return {
      action: "route",
      targetRole: ROLES.INSPECTOR,
      content: `${prefix}\n\n${content}\n\n${suffix}`,
    };
  }

  _routeToExpert(content) {
    if (!this.roles.has(ROLES.EXPERT)) {
      return { error: "Expert role not connected" };
    }
    const { prefix, suffix } = buildRoutingPrompt(ROLES.INSPECTOR, ROLES.EXPERT, this.collaborationMode, {
      stage: this._getCurrentStage(),
    });
    return {
      action: "route",
      targetRole: ROLES.EXPERT,
      content: `${prefix}\n\n${content}\n\n${suffix}`,
    };
  }

  // ── Voting ──

  handleExpertVote(vote, reason) {
    if (!this.roles.has(ROLES.EXPERT)) return { error: "Expert role not connected" };
    this.votes.expert = { vote, reason };
    return this._resolveVotes();
  }

  handleInspectorVote(vote, reason) {
    if (!this.roles.has(ROLES.INSPECTOR)) return { error: "Inspector role not connected" };
    this.votes.inspector = { vote, reason };
    return this._resolveVotes();
  }

  _resolveVotes() {
    if (!this.votes.expert || !this.votes.inspector) {
      return { status: "recorded", message: "投票已记录，等待对方投票" };
    }
    if (this.votes.expert.vote === "pass" && this.votes.inspector.vote === "pass") {
      const gateType = this._isDeliveryMode() ? "execution_votes_passed" : "votes_passed";
      this._emit({ type: gateType });
      const gateLabel = this._isDeliveryMode() ? "CEO 终审" : "CEO 门控审批";
      return { status: "passed", message: `投票通过，进入${gateLabel}` };
    }
    const rejectReason = this.votes.expert.vote === "reject"
      ? this.votes.expert.reason
      : this.votes.inspector.reason;
    this.votes = { expert: null, inspector: null };
    return { status: "rejected", message: `投票未通过: ${rejectReason}` };
  }

  // ── Phase transitions ──

  _advancePhase(reviewContent) {
    this._emit({ type: "phase_advance", phase: this.collaborationMode });
    if (!this.roles.has(ROLES.EXPERT)) return { error: "Expert role not connected" };
    const nextStage = this._isDeliveryMode() ? this._selectNextStage() : null;
    if (nextStage && this._isDeliveryStage(nextStage)) {
      const entryInstruction = this._buildStageEntryInstruction(nextStage, reviewContent);
      return {
        action: "route",
        targetRole: entryInstruction.role,
        content: entryInstruction.instruction,
      };
    }
    const { prefix, suffix } = buildRoutingPrompt("orchestrator", ROLES.EXPERT, this.collaborationMode, {
      routingReason: "phase_advance",
      stage: this._getCurrentStage(),
    });
    return {
      action: "route",
      targetRole: ROLES.EXPERT,
      content: `${prefix}\n\n${reviewContent}\n\n${suffix}`,
    };
  }

  _triggerCeoFinalReview(content) {
    if (!this.roles.has(ROLES.CEO)) {
      this.status = "completed";
      this._emit({ type: "status_change", status: "completed" });
      return { action: "complete" };
    }
    this.ceoGate = {
      active: true,
      type: "final_review",
      round: 0,
      minDefensiveRounds: 2,
      requiredConsecutive: 2,
      consecutiveApprovals: 0,
      materials: content,
      history: [],
    };
    const { prefix, suffix } = buildRoutingPrompt("orchestrator", ROLES.CEO, this.phase, {
    const { prefix, suffix } = buildRoutingPrompt("orchestrator", ROLES.CEO, this.collaborationMode, {
      routingReason: "final_review",
      stage: this._getCurrentStage(),
    });
    return {
      action: "wake_ceo",
      content: `${prefix}\n\n## 原始任务\n\n${this.userTask}\n\n## 实施报告\n\n${content}\n\n${suffix}`,
    };
  }

  triggerPlanningGate(materials) {
    if (!this.roles.has(ROLES.CEO)) {
      const nextStage = this._selectNextStage();
      if (nextStage && !this._isDeliveryStage(nextStage)) {
        return { action: "auto_transition_stage", stage: nextStage, materials };
      }
      return { action: "auto_transition", materials };
    }
    this.ceoGate = {
      active: true,
      type: "planning_gate",
      round: 0,
      minDefensiveRounds: 2,
      requiredConsecutive: 2,
      consecutiveApprovals: 0,
      materials,
      history: [],
    };
    const { prefix, suffix } = buildRoutingPrompt("orchestrator", ROLES.CEO, PHASES.PLANNING, {
    const { prefix, suffix } = buildRoutingPrompt("orchestrator", ROLES.CEO, COLLABORATION_MODES.DELIBERATION, {
      routingReason: "planning_gate",
      stage: this._getCurrentStage(),
    });
    return {
      action: "wake_ceo",
      content: `${prefix}\n\n## 原始任务\n\n${this.userTask}\n\n## 投票理由\n\n${materials}\n\n${suffix}`,
    };
  }

  // ── CEO Verdict Handling ──

  handleCeoVerdict(verdict, reason, targets = []) {
    if (!this.roles.has(ROLES.CEO)) return { error: "CEO role not connected" };
    if (!this.ceoGate.active) return { error: "No active CEO gate" };

    this.ceoGate.history.push({ round: this.ceoGate.round, verdict, reason });

    if (verdict === "approved") return this._handleCeoApproval();
    if (verdict === "rejected") return this._handleCeoRejection(reason, targets);
    if (verdict === "arbitration") return this._handleCeoArbitration(reason, targets);
    return { error: `Unknown verdict: ${verdict}` };
  }

  _handleCeoApproval() {
    const gate = this.ceoGate;
    gate.round++;

    // Phase 1: defensive rounds — force downgrade
    if (gate.round <= gate.minDefensiveRounds) {
      this._emit({
        type: "ceo_gate_defensive",
        gateType: gate.type,
        round: gate.round,
        minDefensiveRounds: gate.minDefensiveRounds,
      });
      const { prefix, suffix } = buildRoutingPrompt("orchestrator", ROLES.CEO, this.collaborationMode, {
        routingReason: "defensive_review",
        stage: this._getCurrentStage(),
      });
      return {
        action: "wake_ceo",
        content: `${prefix}\n\n[驳斥锁 — 第 ${gate.round}/${gate.minDefensiveRounds} 轮防御审查]\n\n## 审查材料\n\n${gate.materials}\n\n${suffix}`,
      };
    }

    // Phase 2: consecutive approvals
    gate.consecutiveApprovals++;
    if (gate.consecutiveApprovals < gate.requiredConsecutive) {
      this._emit({
        type: "ceo_gate_consecutive",
        gateType: gate.type,
        round: gate.round,
        consecutiveApprovals: gate.consecutiveApprovals,
        requiredConsecutive: gate.requiredConsecutive,
      });
      const { prefix, suffix } = buildRoutingPrompt("orchestrator", ROLES.CEO, this.collaborationMode, {
        routingReason: "consecutive_confirm",
        stage: this._getCurrentStage(),
      });
      return {
        action: "wake_ceo",
        content: `${prefix}\n\n[连续确认 — 第 ${gate.consecutiveApprovals}/${gate.requiredConsecutive} 次]\n\n## 审查材料\n\n${gate.materials}\n\n${suffix}`,
      };
    }

    // Phase 3: fully passed
    const gateType = gate.type;
    this.ceoGate = this._emptyGate();

    if (gateType === "planning_gate") {
      this._emit({ type: "ceo_gate_resolved", gateType, verdict: "approved" });
      const nextStage = this._selectNextStage();
      if (nextStage && !this._isDeliveryStage(nextStage)) {
        return { action: "transition_to_stage", stage: nextStage, materials: gate.materials };
      }
      return { action: "transition_to_execution", materials: gate.materials };
    }
    if (gateType === "final_review") {
      this.status = "completed";
      this._emit({ type: "status_change", status: "completed" });
      this._emit({ type: "ceo_gate_resolved", gateType, verdict: "approved" });
      return { action: "complete" };
    }
    if (gateType === "arbitration" || gateType === "stagnation_arbitration") {
      this._emit({ type: "ceo_gate_resolved", gateType, verdict: "approved" });
      return { action: "arbitration_resolved" };
    }
    return { action: "noop" };
  }

  _handleCeoRejection(reason, targets = []) {
    const gateType = this.ceoGate.type;
    const routeTargets = [];

    // Reset consecutive counter on rejection
    this.ceoGate.consecutiveApprovals = 0;
    this.ceoGate = this._emptyGate();

    if (gateType === "planning_gate" || gateType === "final_review") {
      // Reset votes (planning gate only)
      if (gateType === "planning_gate") this.votes = { expert: null, inspector: null };
      this._emit({ type: "ceo_gate_resolved", gateType, verdict: "rejected", reason });

      for (const role of [ROLES.EXPERT, ROLES.INSPECTOR]) {
        if (!this.roles.has(role)) continue;
        const { prefix, suffix } = buildRoutingPrompt(ROLES.CEO, role, this.collaborationMode, {
          routingReason: "rejection",
          stage: this._getCurrentStage(),
        });
        routeTargets.push({
          targetRole: role,
          content: `${prefix}\n\n${reason}\n\n${suffix}`,
        });
      }
      return { action: "route_multiple", targets: routeTargets };
    }

    if (gateType === "stagnation_arbitration") {
      this._emit({ type: "ceo_gate_resolved", gateType, verdict: "rejected", reason });
      this.sameFeedbackCount = 0;
      this.lastFeedbackHash = null;
      const resolvedTargets = targets.length > 0 ? targets : [ROLES.EXPERT, ROLES.INSPECTOR];
      return this._handleCeoArbitration(reason, resolvedTargets);
    }

    return { action: "noop" };
  }

  _handleCeoArbitration(reason, targets) {
    this.ceoGate = this._emptyGate();
    this._emit({ type: "ceo_gate_resolved", gateType: "arbitration", verdict: "arbitration", reason });

    const routeTargets = [];
    for (const role of targets) {
      if (!this.roles.has(role)) continue;
      const { prefix, suffix } = buildRoutingPrompt(ROLES.CEO, role, this.collaborationMode, {
        routingReason: "arbitration",
        stage: this._getCurrentStage(),
      });
      routeTargets.push({
        targetRole: role,
        content: `${prefix}\n\n${reason}\n\n${suffix}`,
      });
    }
    return { action: "route_multiple", targets: routeTargets };
  }

  /**
   * Transition from planning to execution phase.
   * Returns instructions for the Expert (and Inspector if connected).
   */
  transitionToExecution(planDocument) {
    const nextStage = this._selectFirstExecutionStage();
    if (nextStage) {
      return this.transitionToStage(nextStage, planDocument);
    }
    this._setCollaborationMode(nextStage?.phaseType || COLLABORATION_MODES.DELIVERY);

    const instructions = [];
    const openerRole = nextStage?.openerTarget === "inspector" ? ROLES.INSPECTOR : ROLES.EXPERT;
    for (const role of [ROLES.EXPERT, ROLES.INSPECTOR]) {
      if (!this.roles.has(role)) continue;
      if (nextStage && role !== openerRole) continue;
      const { prefix, suffix } = buildRoutingPrompt("orchestrator", role, COLLABORATION_MODES.DELIVERY, {
        routingReason: "transition",
        stage: nextStage,
      });
      const entry = this.roles.get(role);
      entry.status = "idle";
      const stageDirective = nextStage?.openerPrompt
        ? `\n\n## Stage Opening Directive\n${nextStage.openerPrompt}`
        : "";
      instructions.push({
        role,
        instruction: `${prefix}${stageDirective}\n\n${planDocument}\n\n${suffix}`,
      });
    }
    return { instructions };
  }

  // ── Control mode ──

  setControlMode(mode) {
    if (!["autopilot", "ceo-override"].includes(mode)) {
      return { error: `Invalid mode: ${mode}` };
    }
    this.controlMode = mode;
    this._emit({ type: "control_mode_change", mode });
    return { ok: true };
  }

  // ── Stagnation Detection ──

  _checkStagnation(content) {
    const hash = createHash("md5").update(content).digest("hex").slice(0, 16);
    if (hash === this.lastFeedbackHash) {
      this.sameFeedbackCount++;
      if (this.sameFeedbackCount >= this.maxSameFeedback) {
        const stalledRoles = [...new Set(
          this.rounds.slice(-this.maxSameFeedback).map(r => r.role).filter(Boolean)
        )];
        this._emit({
          type: "stagnation_detected",
          count: this.sameFeedbackCount,
          stalledRoles,
          phase: this.collaborationMode,
          totalRounds: this.rounds.length,
        });
      }
    } else {
      this.sameFeedbackCount = 0;
      this.lastFeedbackHash = hash;
    }
  }

  /**
   * Called by daemon when stagnation_detected event fires.
   * @param {{ count: number, stalledRoles: Role[], phase: Phase, totalRounds: number }} stagnationData
   */
  triggerStagnationArbitration(stagnationData) {
    if (!this.roles.has(ROLES.CEO)) {
      return { action: "noop", reason: "no_ceo_for_arbitration", stagnationData };
    }
    if (this.ceoGate.active) {
      return { action: "noop", reason: "ceo_gate_already_active" };
    }

    this.ceoGate = {
      active: true,
      type: "stagnation_arbitration",
      round: 0,
      minDefensiveRounds: 0,
      requiredConsecutive: 1,
      consecutiveApprovals: 0,
      materials: JSON.stringify(stagnationData),
      history: [],
    };

    const { prefix, suffix } = buildRoutingPrompt("orchestrator", ROLES.CEO, this.collaborationMode, {
      routingReason: "stagnation_arbitration",
      stage: this._getCurrentStage(),
    });

    const stalledRolesStr = stagnationData.stalledRoles.join("、");

    return {
      action: "wake_ceo",
      content: `${prefix}\n\n## 停滞信息\n- **协作模式**: ${this.describeCollaborationMode()}\n- **连续相同提交**: ${stagnationData.count} 次\n- **停滞角色**: ${stalledRolesStr}\n- **已完成轮次**: ${stagnationData.totalRounds}\n\n## 原始任务\n\n${this.userTask}\n\n## 最近提交内容\n\n${this.lastSubmitContent || "(无)"}\n\n${suffix}`,
    };
  }

  // ── Round Tracking ──

  _startRound(role) {
    this.currentRound = {
      id: `round_${Date.now()}`,
      role,
      phase: this.collaborationMode,
      startedAt: new Date().toISOString(),
      endedAt: null,
    };
    this.rounds.push(this.currentRound);
    this._emit({ type: "round_start", round: this.currentRound });
  }

  _endCurrentRound() {
    if (this.currentRound && !this.currentRound.endedAt) {
      this.currentRound.endedAt = new Date().toISOString();
      this._emit({ type: "round_end", round: this.currentRound });
    }
  }

  // ── External status updates ──

  setRoleStatus(role, status) {
    const entry = this.roles.get(role);
    if (!entry) return { error: "Role not connected" };
    const prev = entry.status;
    entry.status = status;
    this._emit({ type: "role_status_change", role, prev, status });
    return { ok: true, prev };
  }

  // ── Helpers ──

  _emit(event) {
    if (this.onEvent) this.onEvent(event);
  }

  // ── Serialization ──

  toJSON() {
    const currentStage = this._getCurrentStage();
    return {
      status: this.status,
      phase: this.phase,
      collaborationMode: this.collaborationMode,
      startMode: this.startMode,
      entryStrategy: this.entryStrategy,
      taskType: this.taskType,
      controlMode: this.controlMode,
      blueprintRuntime: this.blueprint
        ? {
            name: this.blueprint.name || null,
            templateId: this.blueprint.templateId || null,
            currentStageId: this.currentStageId,
            currentStageIndex: this.currentStageIndex,
            totalStages: this._getEnabledStages().length,
            currentStage: currentStage
              ? {
                  id: currentStage.id,
                  name: currentStage.name,
                  phaseType: currentStage.phaseType,
                  openerTarget: currentStage.openerTarget,
                }
              : null,
          }
        : null,
      roles: Object.fromEntries([...this.roles].map(([k, v]) => [k, { ...v }])),
      votes: this.votes,
      ceoGate: {
        active: this.ceoGate.active,
        type: this.ceoGate.type,
        round: this.ceoGate.round,
        minDefensiveRounds: this.ceoGate.minDefensiveRounds,
        requiredConsecutive: this.ceoGate.requiredConsecutive,
        consecutiveApprovals: this.ceoGate.consecutiveApprovals,
        history: this.ceoGate.history,
      },
      rounds: this.rounds,
      humanReviewPending: this.humanReviewPending,
      lastProgress: this.lastProgress,
    };
  }
}
