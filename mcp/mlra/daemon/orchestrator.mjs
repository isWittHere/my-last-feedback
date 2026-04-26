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

const DEFAULT_ORCHESTRATION_POLICY = Object.freeze({
  preset: "autopilot",
  expertSubmit: "auto",
  inspectorSubmit: "auto",
  ceoGateTrigger: "auto-to-ceo",
  ceoVerdict: "auto-release",
});

function normalizePolicy(policy = {}) {
  const next = { ...DEFAULT_ORCHESTRATION_POLICY, ...(policy || {}) };
  if (!["auto", "user-review"].includes(next.expertSubmit)) next.expertSubmit = "auto";
  if (!["auto", "user-review"].includes(next.inspectorSubmit)) next.inspectorSubmit = "auto";
  if (!["auto-to-ceo", "user-replaces-ceo"].includes(next.ceoGateTrigger)) next.ceoGateTrigger = "auto-to-ceo";
  if (!["auto-release", "user-review"].includes(next.ceoVerdict)) next.ceoVerdict = "auto-release";
  if (!next.preset) next.preset = "custom";
  return next;
}

function policyFromControlMode(mode) {
  if (mode === "ceo-override") {
    return normalizePolicy({ preset: "ceo-user", ceoGateTrigger: "user-replaces-ceo" });
  }
  return normalizePolicy({ preset: "autopilot" });
}

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

    this.stageExitReadiness = this._emptyStageExitReadiness();

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

    // Compatibility field. Runtime decisions use orchestrationPolicy.
    this.controlMode = "autopilot";
    this.orchestrationPolicy = normalizePolicy();

    this.humanGate = null;
    this.stageExitPending = this._emptyStageExitPending();

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

  _emptyStageExitReadiness() {
    return {
      deliverableVersion: 0,
      reviewedDeliverableVersion: 0,
      hasDeliverable: false,
      hasReview: false,
      certifications: { expert: null, inspector: null },
    };
  }

  _emptyStageExitPending() {
    return {
      active: false,
      stageId: null,
      materials: null,
      expert: null,
      inspector: null,
    };
  }

  _resetStageExitPending() {
    this.stageExitPending = this._emptyStageExitPending();
    this._emit({ type: "stage_exit_pending_update", stageExitPending: this.stageExitPending });
  }

  _createHumanGate(kind, payload = {}) {
    if (this.humanGate?.active) {
      return { error: `Human gate already active: ${this.humanGate.id}` };
    }
    this.status = "awaiting-user";
    this.humanGate = {
      id: `gate_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      active: true,
      kind,
      title: payload.title || "等待人工确认",
      sourceRole: payload.sourceRole || "orchestrator",
      targetRole: payload.targetRole,
      pendingTool: payload.pendingTool || "interactive_feedback",
      blockedRoles: payload.blockedRoles || [],
      originalContent: payload.originalContent || "",
      draftContent: payload.draftContent ?? payload.originalContent ?? "",
      metadata: payload.metadata || {},
      createdAt: new Date().toISOString(),
    };
    for (const role of this.humanGate.blockedRoles || []) {
      if (this.roles.has(role)) this.roles.get(role).status = "waiting-human-review";
    }
    this._emit({ type: "status_change", status: this.status });
    this._emit({ type: "human_gate_update", humanGate: this.humanGate });
    return { ok: true, gate: this.humanGate };
  }

  _clearHumanGate(id = null) {
    if (id && this.humanGate?.id !== id) return { error: "Human gate id mismatch" };
    this.humanGate = null;
    if (this.status === "awaiting-user") this.status = "running";
    this._emit({ type: "human_gate_update", humanGate: null });
    this._emit({ type: "status_change", status: this.status });
    return { ok: true };
  }

  _recordBlockedCertification(role, reason, certification) {
    if (this.roles.has(role)) this.roles.get(role).status = "waiting-gate";
    this.stageExitPending = {
      ...this.stageExitPending,
      active: true,
      stageId: this.currentStageId,
      materials: this.lastSubmitContent || "(阶段提交)",
      [role]: { blocked: true, reason, certification },
    };
    this._emit({ type: "stage_exit_pending_update", stageExitPending: this.stageExitPending });
  }

  _resetStageExitReadiness() {
    this.votes = { expert: null, inspector: null };
    this.stageExitReadiness = this._emptyStageExitReadiness();
    this._resetStageExitPending();
  }

  _clearStageExitCertifications() {
    this.votes = { expert: null, inspector: null };
    this.stageExitReadiness.certifications = { expert: null, inspector: null };
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
    this._resetStageExitReadiness();
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
    this._resetStageExitReadiness();
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
      if (!prevStage || prevStage.id !== stage.id) this._resetStageExitReadiness();
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
  * @param {object|null} [orchestrationPolicy]
   */
  startOrchestration(userTask, blueprint, taskType = null, orchestrationPolicy = null) {
    const readiness = this.checkStartReady();
    if (!readiness.ready) {
      return { error: `Cannot start: missing roles ${readiness.missing.join(", ")}` };
    }

    this.status = "running";
    this.userTask = userTask;
    this.taskType = taskType;
    this.blueprint = blueprint || null;
    this.orchestrationPolicy = normalizePolicy(orchestrationPolicy || this.orchestrationPolicy);
    this.humanGate = null;
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

    if (this._shouldReviewSubmit(ROLES.EXPERT)) {
      const gate = this._createSubmitHumanGate(ROLES.EXPERT, ROLES.INSPECTOR, "expert_submit", content);
      if (gate.error) return gate;
      return { action: "human_gate", gate: gate.gate };
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

    if (this._shouldReviewSubmit(ROLES.INSPECTOR)) {
      const gate = this._createSubmitHumanGate(ROLES.INSPECTOR, ROLES.EXPERT, "inspector_submit", content);
      if (gate.error) return gate;
      return { action: "human_gate", gate: gate.gate };
    }

    return this._routeToExpert(content);
  }

  _trackSubmit(role, content) {
    const entry = this.roles.get(role);
    if (entry) entry.status = "blocked";
    this.lastSubmitContent = content;
    this.submitCount += 1;
    if (role === ROLES.EXPERT) {
      this.stageExitReadiness.hasDeliverable = true;
      this.stageExitReadiness.deliverableVersion += 1;
      this._clearStageExitCertifications();
    } else if (role === ROLES.INSPECTOR) {
      if (this.stageExitReadiness.hasDeliverable) {
        this.stageExitReadiness.hasReview = true;
        this.stageExitReadiness.reviewedDeliverableVersion = this.stageExitReadiness.deliverableVersion;
      }
      this._clearStageExitCertifications();
    }
    this._endCurrentRound();
    this._startRound(role);
    this._checkStagnation(content);
  }

  _getSubmitPolicy(role) {
    if (role === ROLES.EXPERT) return this.orchestrationPolicy.expertSubmit;
    if (role === ROLES.INSPECTOR) return this.orchestrationPolicy.inspectorSubmit;
    return "auto";
  }

  _shouldReviewSubmit(role) {
    return this._getSubmitPolicy(role) === "user-review";
  }

  _createSubmitHumanGate(sourceRole, targetRole, pendingTool, content) {
    const sourceLabel = sourceRole === ROLES.EXPERT ? "Expert" : "Inspector";
    const targetLabel = targetRole === ROLES.EXPERT ? "Expert" : "Inspector";
    return this._createHumanGate("submit_handoff_review", {
      title: `${sourceLabel} -> ${targetLabel} 待审阅`,
      sourceRole,
      targetRole,
      pendingTool,
      blockedRoles: [sourceRole],
      originalContent: content,
      metadata: { sourceRole, targetRole },
    });
  }

  approveHumanGate(payload = {}) {
    const gate = this.humanGate;
    if (!gate?.active) return { error: "No pending human gate" };
    if (payload.id && gate.id !== payload.id) return { error: "Human gate id mismatch" };
    const content = payload.content ?? gate.draftContent ?? gate.originalContent;

    if (gate.kind === "submit_handoff_review") {
      const sourceRole = gate.sourceRole;
      const clear = this._clearHumanGate(gate.id);
      if (clear.error) return clear;
      if (sourceRole === ROLES.EXPERT) return this._routeExpertSubmit(content);
      if (sourceRole === ROLES.INSPECTOR) return this._routeToExpert(content);
      return { action: "noop" };
    }

    if (gate.kind === "stage_exit_gate_trigger" || gate.kind === "ceo_verdict_review") {
      const verdict = payload.verdict || gate.metadata?.verdict || "approved";
      const reason = payload.reason || content || gate.metadata?.reason || "用户确认通过。";
      const targets = Array.isArray(payload.targets) ? payload.targets : (Array.isArray(gate.metadata?.targets) ? gate.metadata.targets : []);
      const clear = this._clearHumanGate(gate.id);
      if (clear.error) return clear;
      return this.applyCeoVerdict(verdict, reason, targets);
    }

    return { action: "noop" };
  }

  rejectHumanGate(payload = {}) {
    const gate = this.humanGate;
    if (!gate?.active) return { error: "No pending human gate" };
    if (payload.id && gate.id !== payload.id) return { error: "Human gate id mismatch" };
    const reason = payload.reason || "用户退回。";
    const sourceRole = gate.sourceRole;
    const clear = this._clearHumanGate(gate.id);
    if (clear.error) return clear;

    if (gate.kind === "stage_exit_gate_trigger" || gate.kind === "ceo_verdict_review") {
      return this.applyCeoVerdict("rejected", reason, [ROLES.INSPECTOR]);
    }

    return {
      action: "route",
      targetRole: sourceRole,
      content: `[人工审查拒绝] ${reason}\n\n请根据反馈修改后重新提交。`,
    };
  }

  cancelHumanGate(payload = {}) {
    return this.rejectHumanGate({
      id: payload.id,
      reason: payload.reason || "用户取消当前人工门控，请重新整理后继续。",
    });
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

  _hasSubstantiveText(value, minLength = 16) {
    return typeof value === "string" && value.trim().length >= minLength;
  }

  _hasNoKnownConcerns(value) {
    if (typeof value !== "string") return false;
    const text = value.trim().toLowerCase();
    return /^(none|no known|no unresolved|no blocking|nothing known|无|无已知|没有|暂无|无阻塞)/i.test(text);
  }

  _isVagueCertificationReason(reason) {
    if (typeof reason !== "string") return true;
    const text = reason.trim().toLowerCase();
    if (text.length < 12) return true;
    return /^(ok|okay|done|complete|completed|looks good|lgtm|ready|pass|已完成|完成|可以|通过)$/.test(text);
  }

  _validateStageExitCertification(vote, reason, certification) {
    if (vote !== "pass") return { ok: true };

    const failures = [];
    const readiness = this.stageExitReadiness;

    if (!readiness.hasDeliverable) {
      failures.push("no stage deliverable has been submitted yet");
    }
    if (!readiness.hasReview) {
      failures.push("the current stage material has not completed review yet");
    }
    if (readiness.hasDeliverable && readiness.hasReview && readiness.reviewedDeliverableVersion !== readiness.deliverableVersion) {
      failures.push("the latest stage material has changed since the last review");
    }
    if (!certification) {
      failures.push("a structured certification checklist is required");
    } else {
      if (certification.originalRequestSatisfied !== true) failures.push("originalRequestSatisfied must be true");
      if (certification.stageDirectiveSatisfied !== true) failures.push("stageDirectiveSatisfied must be true");
      if (certification.feedbackResolved !== true) failures.push("feedbackResolved must be true");
      if (!this._hasSubstantiveText(certification.directVerificationEvidence, 20)) {
        failures.push("directVerificationEvidence must describe concrete evidence checked directly");
      }
      if (!this._hasNoKnownConcerns(certification.unresolvedConcerns)) {
        failures.push("unresolvedConcerns must explicitly state that no known blocker remains");
      }
      if (!this._hasSubstantiveText(certification.exitRationale, 20)) {
        failures.push("exitRationale must explain why the whole stage can exit");
      }
    }
    if (this._isVagueCertificationReason(reason)) {
      failures.push("reason must be a stage-level rationale, not a vague completion phrase");
    }

    return failures.length > 0
      ? { ok: false, reason: failures.join("; ") }
      : { ok: true };
  }

  _recordStageExitCertification(role, reason, certification) {
    this.stageExitReadiness.certifications[role] = {
      reason,
      certification,
      deliverableVersion: this.stageExitReadiness.deliverableVersion,
    };
  }

  _handleStageExitCertification(role, vote, reason, certification) {
    if (vote === "reject") {
      this._clearStageExitCertifications();
      return {
        status: "not_ready",
        message: `Stage remains active: ${reason || "blocking work remains"}. Continue the stage work and submit the missing material first.`,
      };
    }

    const validation = this._validateStageExitCertification(vote, reason, certification);
    if (!validation.ok) {
      return {
        status: "rejected",
        message: `Stage-exit certification was not accepted: ${validation.reason}. Continue the stage work and submit the missing material first.`,
      };
    }

    this.votes[role] = { vote, reason, certification };
    this._recordStageExitCertification(role, reason, certification);
    this._recordBlockedCertification(role, reason, certification);
    const resolved = this._resolveVotes();
    if (resolved.status === "passed") {
      return {
        action: "stage_exit_ready",
        role,
        materials: this.lastSubmitContent || "(阶段提交)",
        message: resolved.message,
      };
    }
    const targetRole = role === ROLES.EXPERT ? ROLES.INSPECTOR : ROLES.EXPERT;
    return {
      action: "certification_recorded",
      role,
      targetRole,
      content: `[阶段出口认证已记录]\n\n${reason}\n\n请基于当前阶段材料完成你的出口认证；如果仍发现问题，请继续提交审查意见。`,
      message: resolved.message,
    };
  }

  handleExpertVote(vote, reason, certification = null) {
    if (!this.roles.has(ROLES.EXPERT)) return { error: "Expert role not connected" };
    const stage = this._getCurrentStage();
    if (this._isClosingStage(stage)) return { error: "Voting is not available during the closing stage" };
    return this._handleStageExitCertification(ROLES.EXPERT, vote, reason, certification);
  }

  handleInspectorVote(vote, reason, certification = null) {
    if (!this.roles.has(ROLES.INSPECTOR)) return { error: "Inspector role not connected" };
    const stage = this._getCurrentStage();
    if (this._isClosingStage(stage)) return { error: "Voting is not available during the closing stage" };
    return this._handleStageExitCertification(ROLES.INSPECTOR, vote, reason, certification);
  }

  _resolveVotes() {
    if (!this.votes.expert || !this.votes.inspector) {
      return {
        status: "recorded",
        message: "Stage-exit certification recorded. The stage remains active until all exit conditions are satisfied.",
      };
    }
    if (this.votes.expert.vote === "pass" && this.votes.inspector.vote === "pass") {
      return { status: "passed", message: "Stage-exit certifications accepted. Preparing stage-exit review." };
    }
    this._clearStageExitCertifications();
    return {
      status: "not_ready",
      message: "Stage remains active because a stage-exit certification was not accepted. Continue the stage work and submit the missing material first.",
    };
  }

  // ── Stage advancement & gate ──

  /**
    * Called by daemon when both stage-exit certifications are accepted.
    * Depending on the current stage's exitGateEnabled, either trigger the CEO
    * gate or advance directly.
   */
  triggerStageExit(materials) {
    const stage = this._getCurrentStage();
    if (!stage) return { action: "noop" };

    if (stage.exitGateEnabled !== false && (this.roles.has(ROLES.CEO) || this.orchestrationPolicy.ceoGateTrigger === "user-replaces-ceo")) {
      // Gate enabled AND CEO connected — trigger defensive-lock gate.
      this.ceoGate = {
        active: true,
        type: "stage_gate",
        round: 0,
        minDefensiveRounds: this.orchestrationPolicy.ceoGateTrigger === "user-replaces-ceo" ? 0 : 2,
        requiredConsecutive: this.orchestrationPolicy.ceoGateTrigger === "user-replaces-ceo" ? 1 : 2,
        consecutiveApprovals: 0,
        materials,
        history: [],
      };
      const { prefix, suffix } = buildRoutingPrompt("orchestrator", ROLES.CEO, stage, {
        routingReason: "stage_gate",
      });
      const gateContent = `${prefix}\n\n## 原始任务\n\n${this.userTask}\n\n## 阶段产出\n\n${materials}\n\n${suffix}`;

      if (this.orchestrationPolicy.ceoGateTrigger === "user-replaces-ceo") {
        const gate = this._createHumanGate("stage_exit_gate_trigger", {
          title: "阶段出口门控待裁定",
          sourceRole: "orchestrator",
          pendingTool: "ceo_verdict",
          blockedRoles: [ROLES.EXPERT, ROLES.INSPECTOR],
          originalContent: gateContent,
          metadata: { verdict: "approved", targets: [ROLES.INSPECTOR], gateType: "stage_gate" },
        });
        if (gate.error) return gate;
        return { action: "human_gate", gate: gate.gate };
      }

      return {
        action: "wake_ceo",
        content: gateContent,
      };
    }
    // Gate disabled or no CEO — advance directly.
    return this._advanceStage(materials);
  }

  _advanceStage(carriedContent) {
    this._clearStageExitCertifications();
    this._resetStageExitPending();
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

    if (this.orchestrationPolicy.ceoVerdict === "user-review") {
      const gate = this._createHumanGate("ceo_verdict_review", {
        title: "CEO verdict 待确认",
        sourceRole: ROLES.CEO,
        pendingTool: "ceo_verdict",
        blockedRoles: [ROLES.CEO, ROLES.EXPERT, ROLES.INSPECTOR],
        originalContent: reason || "",
        metadata: { verdict, reason, targets, gateType: this.ceoGate.type },
      });
      if (gate.error) return gate;
      return { action: "human_gate", gate: gate.gate };
    }

    return this.applyCeoVerdict(verdict, reason, targets);
  }

  applyCeoVerdict(verdict, reason, targets = []) {
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
      this._clearStageExitCertifications();
      this._resetStageExitPending();
      this._emit({ type: "ceo_gate_resolved", gateType, verdict: "rejected", reason });

      const resolvedTargets = targets.length > 0 ? targets : [ROLES.INSPECTOR];
      for (const role of resolvedTargets) {
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
    this.orchestrationPolicy = policyFromControlMode(mode);
    this._emit({ type: "control_mode_change", mode });
    return { ok: true };
  }

  setOrchestrationPolicy(policy) {
    this.orchestrationPolicy = normalizePolicy(policy);
    this._emit({ type: "orchestration_policy_change", policy: this.orchestrationPolicy });
    return { ok: true, policy: this.orchestrationPolicy };
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
      orchestrationPolicy: this.orchestrationPolicy,
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
      humanGate: this.humanGate,
      stageExitPending: this.stageExitPending,
      stageExitReadiness: this.stageExitReadiness,
    };
  }
}
