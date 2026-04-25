// ── MLRA Orchestrator State Machine ──
// Pure logic module — no I/O, no network, fully testable.
//
// Topology: 3 fixed roles (ceo / expert / inspector) + user-authored stage
// pipeline. Stages are generic collaboration units; the only special stage is
// the "closing" stage at the end of every blueprint (CEO solo wrap-up).
//
// No phase, no startMode. The stage object itself carries all variation:
//   stage.exitGateEnabled → whether CEO defensive-lock gate is consulted
//   stage.isClosing       → closing stage (CEO solo, no expert/inspector)
//   stage.promptOverride  → user-edited stage prompt (falls back to
//                           stage.promptExpert / promptInspector / promptCeo)
//   stage.skillRefs       → suggested skills rendered into every message

import { ROLES, REQUIRED_ROLES } from "../protocol/roles.mjs";
import { buildRoutingPrompt, buildInitialPrompt } from "../protocol/prompts.mjs";
import { createHash } from "node:crypto";

/** @typedef {"ceo"|"expert"|"inspector"} Role */

export class Orchestrator {
  constructor() {
    /** @type {"configuring"|"ready"|"running"|"paused"|"completed"|"cancelled"|"awaiting-user"} */
    this.status = "configuring";

    /** @type {string} */
    this.userTask = "";
    /** @type {string|null} */
    this.taskType = null;

    /** @type {object|null} */
    this.blueprint = null;
    this.currentStageIndex = -1;
    this.currentStageId = null;

    /** Submissions accumulated in the current stage. Reset on stage change. */
    this.submitCount = 0;

    /**
     * Registered roles. Key = role (ceo/expert/inspector).
     * At most ONE entry per role at any time.
     * @type {Map<Role, any>}
     */
    this.roles = new Map();

    // Votes for stage exit (reset on each gate trigger / rejection / advance)
    this.votes = { expert: null, inspector: null };

    this.lastSubmitContent = null;

    // CEO Gate — defensive rejection state machine
    this.ceoGate = this._emptyGate();

    // Stagnation detection
    this.sameFeedbackCount = 0;
    this.lastFeedbackHash = null;
    this.maxSameFeedback = 5;

    // Round tracking
    this.rounds = [];
    this.currentRound = null;

    // Control mode
    this.controlMode = "ceo-override";

    this.humanReviewPending = null;

    /** Event callback set by daemon */
    this.onEvent = null;
  }

  _emptyGate() {
    return {
      active: false,
      /** @type {"stage_gate"|"arbitration"|"stagnation_arbitration"|null} */
      type: null,
      round: 0,
      minDefensiveRounds: 2,
      requiredConsecutive: 2,
      consecutiveApprovals: 0,
      materials: null,
      history: [],
    };
  }

  _getStages() {
    const stages = Array.isArray(this.blueprint?.stages) ? this.blueprint.stages : [];
    return stages.filter(Boolean);
  }

  _getCurrentStage() {
    const stages = this._getStages();
    if (this.currentStageId) {
      const byId = stages.find((stage) => stage.id === this.currentStageId);
      if (byId) return byId;
    }
    if (this.currentStageIndex >= 0 && stages[this.currentStageIndex]) {
      return stages[this.currentStageIndex];
    }
    return null;
  }

  _isClosingStage(stage) {
    return Boolean(stage && stage.isClosing === true);
  }

  _selectStartStage() {
    // Always the first non-closing stage.
    const stages = this._getStages();
    const nextStage = stages.find((stage) => !this._isClosingStage(stage)) || stages[0] || null;
    if (!nextStage) return null;
    this.currentStageId = nextStage.id;
    this.currentStageIndex = stages.findIndex((stage) => stage.id === nextStage.id);
    this.submitCount = 0;
    return nextStage;
  }

  _selectNextStage() {
    const stages = this._getStages();
    if (stages.length === 0) return null;
    const currentIndex = stages.findIndex((stage) => stage.id === this.currentStageId);
    if (currentIndex === -1 || currentIndex + 1 >= stages.length) return null;
    const nextStage = stages[currentIndex + 1];
    this.currentStageId = nextStage.id;
    this.currentStageIndex = currentIndex + 1;
    this.submitCount = 0;
    return nextStage;
  }

  _buildStageEntryInstructions(stage, carriedContent = "") {
    if (this._isClosingStage(stage)) {
      // Closing stage: CEO solo. Expert/Inspector receive nothing.
      const instruction = buildInitialPrompt(ROLES.CEO, this.userTask, stage, { carriedContent });
      return [{ role: ROLES.CEO, instruction }];
    }
    const instructions = [];
    for (const role of [ROLES.EXPERT, ROLES.INSPECTOR]) {
      if (!this.roles.has(role)) continue;
      const instruction = buildInitialPrompt(role, this.userTask, stage, { carriedContent });
      instructions.push({ role, instruction });
    }
    return instructions;
  }

  _applyRoleStatusesForStage(stage) {
    if (this._isClosingStage(stage)) {
      for (const role of [ROLES.EXPERT, ROLES.INSPECTOR]) {
        if (this.roles.has(role)) this.roles.get(role).status = "blocked";
      }
      if (this.roles.has(ROLES.CEO)) this.roles.get(ROLES.CEO).status = "idle";
    } else {
      for (const role of [ROLES.EXPERT, ROLES.INSPECTOR]) {
        if (this.roles.has(role)) this.roles.get(role).status = "idle";
      }
      if (this.roles.has(ROLES.CEO)) this.roles.get(ROLES.CEO).status = "blocked";
    }
  }

  transitionToStage(stage, carriedContent = "") {
    const prevStage = this._getCurrentStage();
    // If stage is different from current, update currentStageId/Index.
    const stages = this._getStages();
    const idx = stages.findIndex((s) => s.id === stage.id);
    if (idx >= 0) {
      this.currentStageId = stage.id;
      this.currentStageIndex = idx;
      this.submitCount = 0;
    }
    this._applyRoleStatusesForStage(stage);
    if (prevStage && prevStage.id !== stage.id) {
      this._emit({
        type: "stage_transition",
        from: { id: prevStage.id, name: prevStage.name, isClosing: this._isClosingStage(prevStage) },
        to:   { id: stage.id,     name: stage.name,     isClosing: this._isClosingStage(stage) },
      });
    }
    return { instructions: this._buildStageEntryInstructions(stage, carriedContent) };
  }

  // ── Role Registration ──

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

  unregisterRole(role) {
    if (!this.roles.has(role)) return { ok: true };
    this.roles.delete(role);
    this._emit({ type: "role_disconnected", role });
    return { ok: true };
  }

  // ── Orchestration Lifecycle ──

  /** @returns {{ ready: boolean, missing: Role[] }} */
  checkStartReady() {
    const missing = REQUIRED_ROLES.filter((r) => !this.roles.has(r));
    return { ready: missing.length === 0, missing };
  }

  /**
   * Start orchestration. Requires all 3 roles connected and a blueprint
   * with at least one non-closing stage.
   *
   * @param {string} userTask
   * @param {object} blueprint
   * @param {string|null} [taskType]
   */
  startOrchestration(userTask, blueprint, taskType = null) {
    const readiness = this.checkStartReady();
    if (!readiness.ready) {
      return { error: `Cannot start: missing roles ${readiness.missing.join(", ")}` };
    }

    this.status = "running";
    this.userTask = userTask;
    this.taskType = taskType;
    this.blueprint = blueprint || null;
    const activeStage = this._selectStartStage();
    if (!activeStage) {
      return { error: "Blueprint has no enabled non-closing stage" };
    }

    this._emit({ type: "status_change", status: "running" });
    this._applyRoleStatusesForStage(activeStage);
    this._emit({
      type: "stage_transition",
      from: null,
      to: { id: activeStage.id, name: activeStage.name, isClosing: this._isClosingStage(activeStage) },
    });

    const instructions = this._buildStageEntryInstructions(activeStage);
    return { instructions };
  }

  // ── Submit Handling ──

  /**
   * Expert submit. In non-closing stages routes to Inspector. In closing
   * stages it is rejected.
   *
   * @param {string} content
   */
  handleExpertSubmit(content) {
    const entry = this.roles.get(ROLES.EXPERT);
    if (!entry) return { error: "Expert role not connected" };
    if (this.status !== "running") return { error: `Orchestration not running (status: ${this.status})` };

    const stage = this._getCurrentStage();
    if (this._isClosingStage(stage)) {
      return { error: "Expert submissions are not accepted during the closing stage" };
    }

    this._trackSubmit(ROLES.EXPERT, content);

    if (this._needsHumanReview(ROLES.EXPERT)) {
      this.humanReviewPending = {
        role: ROLES.EXPERT,
        originalContent: content,
        targetRole: ROLES.INSPECTOR,
      };
      return { action: "human_review", role: ROLES.EXPERT, content };
    }

    return this._routeExpertSubmit(content);
  }

  /**
   * Inspector submit. In non-closing stages always routes back to Expert.
   * In closing stages it is rejected.
   */
  handleInspectorSubmit(content) {
    const entry = this.roles.get(ROLES.INSPECTOR);
    if (!entry) return { error: "Inspector role not connected" };
    if (this.status !== "running") return { error: `Orchestration not running (status: ${this.status})` };

    const stage = this._getCurrentStage();
    if (this._isClosingStage(stage)) {
      return { error: "Inspector submissions are not accepted during the closing stage" };
    }

    this._trackSubmit(ROLES.INSPECTOR, content);

    if (this._needsHumanReview(ROLES.INSPECTOR)) {
      this.humanReviewPending = {
        role: ROLES.INSPECTOR,
        originalContent: content,
        targetRole: ROLES.EXPERT,
      };
      return { action: "human_review", role: ROLES.INSPECTOR, content };
    }

    return this._routeToExpert(content);
  }

  _trackSubmit(role, content) {
    const entry = this.roles.get(role);
    if (entry) entry.status = "blocked";
    this.lastSubmitContent = content;
    this.submitCount += 1;
    this._endCurrentRound();
    this._startRound(role);
    this._checkStagnation(content);
  }

  _needsHumanReview(role) {
    switch (this.controlMode) {
      case "autopilot": return false;
      case "ceo-override": return role === ROLES.CEO;
      default: return false;
    }
  }

  approveHumanReview(modifiedContent) {
    if (!this.humanReviewPending) return { error: "No pending review" };
    const { role, originalContent } = this.humanReviewPending;
    const content = modifiedContent || originalContent;
    this.humanReviewPending = null;
    if (role === ROLES.EXPERT) return this._routeExpertSubmit(content);
    if (role === ROLES.INSPECTOR) return this._routeToExpert(content);
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

  _routeExpertSubmit(content) {
    if (!this.roles.has(ROLES.INSPECTOR)) {
      return { error: "Inspector role not connected" };
    }
    const { prefix, suffix } = buildRoutingPrompt(ROLES.EXPERT, ROLES.INSPECTOR, this._getCurrentStage());
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
    const { prefix, suffix } = buildRoutingPrompt(ROLES.INSPECTOR, ROLES.EXPERT, this._getCurrentStage());
    return {
      action: "route",
      targetRole: ROLES.EXPERT,
      content: `${prefix}\n\n${content}\n\n${suffix}`,
    };
  }

  // ── Voting ──

  handleExpertVote(vote, reason) {
    if (!this.roles.has(ROLES.EXPERT)) return { error: "Expert role not connected" };
    const stage = this._getCurrentStage();
    if (this._isClosingStage(stage)) return { error: "Voting is not available during the closing stage" };
    this.votes.expert = { vote, reason };
    return this._resolveVotes();
  }

  handleInspectorVote(vote, reason) {
    if (!this.roles.has(ROLES.INSPECTOR)) return { error: "Inspector role not connected" };
    const stage = this._getCurrentStage();
    if (this._isClosingStage(stage)) return { error: "Voting is not available during the closing stage" };
    this.votes.inspector = { vote, reason };
    return this._resolveVotes();
  }

  _resolveVotes() {
    if (!this.votes.expert || !this.votes.inspector) {
      return { status: "recorded", message: "投票已记录，等待对方投票" };
    }
    if (this.votes.expert.vote === "pass" && this.votes.inspector.vote === "pass") {
      this._emit({ type: "votes_passed" });
      return { status: "passed", message: "投票通过，进入阶段出口审批" };
    }
    const rejectReason = this.votes.expert.vote === "reject"
      ? this.votes.expert.reason
      : this.votes.inspector.reason;
    this.votes = { expert: null, inspector: null };
    return { status: "rejected", message: `投票未通过: ${rejectReason}` };
  }

  // ── Stage advancement & gate ──

  /**
   * Called by daemon when votes_passed event fires. Depending on the current
   * stage's exitGateEnabled, either trigger the CEO gate or advance directly.
   */
  triggerStageExit(materials) {
    const stage = this._getCurrentStage();
    if (!stage) return { action: "noop" };

    if (stage.exitGateEnabled !== false && this.roles.has(ROLES.CEO)) {
      // Gate enabled AND CEO connected — trigger defensive-lock gate.
      this.ceoGate = {
        active: true,
        type: "stage_gate",
        round: 0,
        minDefensiveRounds: 2,
        requiredConsecutive: 2,
        consecutiveApprovals: 0,
        materials,
        history: [],
      };
      const { prefix, suffix } = buildRoutingPrompt("orchestrator", ROLES.CEO, stage, {
        routingReason: "stage_gate",
      });
      return {
        action: "wake_ceo",
        content: `${prefix}\n\n## 原始任务\n\n${this.userTask}\n\n## 阶段产出\n\n${materials}\n\n${suffix}`,
      };
    }
    // Gate disabled or no CEO — advance directly.
    return this._advanceStage(materials);
  }

  _advanceStage(carriedContent) {
    this.votes = { expert: null, inspector: null };
    this._emit({ type: "stage_advance", stageId: this.currentStageId });

    const nextStage = this._selectNextStage();
    if (!nextStage) {
      // No next stage — workflow complete.
      this.status = "completed";
      this._emit({ type: "status_change", status: "completed" });
      return { action: "complete" };
    }
    return { action: "transition_to_stage", stage: nextStage, materials: carriedContent };
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

    // Defensive gate step 1 — mandatory re-review rounds
    if (gate.round <= gate.minDefensiveRounds) {
      this._emit({
        type: "ceo_gate_defensive",
        gateType: gate.type,
        round: gate.round,
        minDefensiveRounds: gate.minDefensiveRounds,
      });
      const { prefix, suffix } = buildRoutingPrompt("orchestrator", ROLES.CEO, this._getCurrentStage(), {
        routingReason: "defensive_review",
      });
      return {
        action: "wake_ceo",
        content: `${prefix}\n\n[需要进一步验证]\n\n## 审查材料\n\n${gate.materials}\n\n${suffix}`,
      };
    }

    // Defensive gate step 2 — consecutive confirmations
    gate.consecutiveApprovals++;
    if (gate.consecutiveApprovals < gate.requiredConsecutive) {
      this._emit({
        type: "ceo_gate_consecutive",
        gateType: gate.type,
        round: gate.round,
        consecutiveApprovals: gate.consecutiveApprovals,
        requiredConsecutive: gate.requiredConsecutive,
      });
      const { prefix, suffix } = buildRoutingPrompt("orchestrator", ROLES.CEO, this._getCurrentStage(), {
        routingReason: "consecutive_confirm",
      });
      return {
        action: "wake_ceo",
        content: `${prefix}\n\n[最终通过前确认]\n\n## 审查材料\n\n${gate.materials}\n\n${suffix}`,
      };
    }

    // Defensive gate step 3 — gate fully passed
    const gateType = gate.type;
    const materials = gate.materials;
    this.ceoGate = this._emptyGate();

    if (gateType === "stage_gate") {
      this._emit({ type: "ceo_gate_resolved", gateType, verdict: "approved" });
      return this._advanceStage(materials);
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

    this.ceoGate.consecutiveApprovals = 0;
    this.ceoGate = this._emptyGate();

    if (gateType === "stage_gate") {
      this.votes = { expert: null, inspector: null };
      this._emit({ type: "ceo_gate_resolved", gateType, verdict: "rejected", reason });

      for (const role of [ROLES.EXPERT, ROLES.INSPECTOR]) {
        if (!this.roles.has(role)) continue;
        const { prefix, suffix } = buildRoutingPrompt(ROLES.CEO, role, this._getCurrentStage(), {
          routingReason: "rejection",
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
      const { prefix, suffix } = buildRoutingPrompt(ROLES.CEO, role, this._getCurrentStage(), {
        routingReason: "arbitration",
      });
      routeTargets.push({
        targetRole: role,
        content: `${prefix}\n\n${reason}\n\n${suffix}`,
      });
    }
    return { action: "route_multiple", targets: routeTargets };
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
          this.rounds.slice(-this.maxSameFeedback).map((r) => r.role).filter(Boolean)
        )];
        this._emit({
          type: "stagnation_detected",
          count: this.sameFeedbackCount,
          stalledRoles,
          stageId: this.currentStageId,
          submitCount: this.submitCount,
          totalRounds: this.rounds.length,
        });
      }
    } else {
      this.sameFeedbackCount = 0;
      this.lastFeedbackHash = hash;
    }
  }

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

    const { prefix, suffix } = buildRoutingPrompt("orchestrator", ROLES.CEO, this._getCurrentStage(), {
      routingReason: "stagnation_arbitration",
    });

    return {
      action: "wake_ceo",
      content: `${prefix}\n\n## 停滞信息\n- **当前阶段**: ${this._getCurrentStage()?.name || "(未知)"}\n- **状态**: 最近提交缺少实质进展，需要裁定下一步。\n\n## 原始任务\n\n${this.userTask}\n\n## 最近提交内容\n\n${this.lastSubmitContent || "(无)"}\n\n${suffix}`,
    };
  }

  // ── Round Tracking ──

  _startRound(role) {
    this.currentRound = {
      id: `round_${Date.now()}`,
      role,
      stageId: this.currentStageId,
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
      taskType: this.taskType,
      controlMode: this.controlMode,
      blueprintRuntime: this.blueprint
        ? {
            name: this.blueprint.name || null,
            templateId: this.blueprint.templateId || null,
            currentStageId: this.currentStageId,
            currentStageIndex: this.currentStageIndex,
            totalStages: this._getStages().length,
            submitCount: this.submitCount,
            currentStage: currentStage
              ? {
                  id: currentStage.id,
                  name: currentStage.name,
                  isClosing: this._isClosingStage(currentStage),
                  exitGateEnabled: currentStage.exitGateEnabled !== false,
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
    };
  }
}
