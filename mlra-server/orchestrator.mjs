// ── MLRA Orchestrator State Machine ──
// Pure logic module — no I/O, no network, fully testable.

import { PHASE_AGENTS, buildTailInjection, START_MODES, START_MODE_REQUIREMENTS } from "./protocol.mjs";
import { createHash } from "node:crypto";

// ── Submit Types ──
const SUBMIT_TYPES = [
  "plan_draft",
  "review_result",
  "phase_complete",
  "final_complete",
];

// ── Orchestrator ──

export class Orchestrator {
  constructor() {
    /** @type {string} */
    this.launcherId = "";
    /** @type {"configuring"|"ready"|"running"|"paused"|"completed"|"cancelled"} */
    this.status = "configuring";
    /** @type {"planning"|"implementation"} */
    this.phase = "planning";
    /** @type {string|null} */
    this.currentPhaseId = null;
    /** @type {"full"|"direct-execution"} */
    this.startMode = START_MODES.FULL;

    /** @type {Map<string, AgentEntry>} callerId → AgentEntry */
    this.agents = new Map();

    // Votes (planning confrontation consensus)
    this.votes = { expert: null, inspector: null };

    // Track last submit content for CEO gate materials
    this.lastSubmitContent = null;

    // CEO Gate — defensive rejection state machine
    this.ceoGate = {
      active: false,
      /** @type {"planning_gate"|"final_review"|"arbitration"|null} */
      type: null,
      round: 0,
      minRounds: 2,
      /** @type {string|null} */
      materials: null,
      /** @type {Array<{round: number, verdict: string, reason: string}>} */
      history: [],
    };

    // Defensive rejection
    this.defensiveRejectionCount = 0;
    this.minDefensiveRejections = 2;

    // Stagnation detection
    this.sameFeedbackCount = 0;
    this.lastFeedbackHash = null;
    this.maxSameFeedback = 5;

    // Worker orders
    /** @type {Map<string, OrderEntry>} orderId → OrderEntry */
    this.workerOrders = new Map();

    // Round tracking
    /** @type {RoundRecord[]} */
    this.rounds = [];
    /** @type {RoundRecord|null} */
    this.currentRound = null;

    // Control mode
    /** @type {"autopilot"|"ceo-override"|"full-override"} */
    this.controlMode = "ceo-override";

    // Human review pending
    /** @type {HumanReview|null} */
    this.humanReviewPending = null;

    // Event callback (set by daemon)
    /** @type {((event: object) => void)|null} */
    this.onEvent = null;
  }

  // ── Agent Registration ──

  registerAgent(callerId, alias, workspace) {
    if (this.agents.has(callerId)) {
      return { error: "Agent already registered" };
    }
    this.agents.set(callerId, {
      callerId,
      alias,
      workspace,
      role: null,
      workerRole: "",
      status: "registered",
    });
    this._checkReady();
    return { ok: true };
  }

  assignRole(callerId, role, workerRole = "") {
    const agent = this.agents.get(callerId);
    if (!agent) return { error: "Agent not found" };
    agent.role = role;
    agent.workerRole = workerRole;
    this._checkReady();
    return { ok: true };
  }

  // ── Orchestration Lifecycle ──

  _checkReady() {
    // Readiness depends on startMode — but during configuring we don't check yet.
    // Readiness is checked explicitly via checkStartReady(startMode).
    // Keep minimal check for backward compat: at least 2 agents with roles assigned.
    if (this.status !== "configuring") return;
    const rolesAssigned = [...this.agents.values()].filter((a) => a.role).length;
    if (rolesAssigned >= 2) {
      // Don't auto-transition to ready; let frontend/daemon check explicitly
    }
  }

  /**
   * Check if enough agents are registered and assigned for the given start mode.
   * @param {"full"|"direct-execution"} startMode
   * @returns {{ ready: boolean, missing: string[], workerCount: number }}
   */
  checkStartReady(startMode) {
    const req = START_MODE_REQUIREMENTS[startMode];
    if (!req) return { ready: false, missing: [`Unknown start mode: ${startMode}`], workerCount: 0 };
    const assignedRoles = new Map();
    let workerCount = 0;
    for (const a of this.agents.values()) {
      if (a.role === "worker") workerCount++;
      else if (a.role) assignedRoles.set(a.role, true);
    }
    const missing = req.required.filter((r) => !assignedRoles.has(r));
    const needWorkers = Math.max(0, req.minWorkers - workerCount);
    if (needWorkers > 0) missing.push(`worker ×${needWorkers}`);
    return { ready: missing.length === 0, missing, workerCount };
  }

  /**
   * Start orchestration. Returns initial instructions for each active-phase agent.
   * CEO is NOT released — it stays blocked until a trigger point.
   * @param {string} userTask - The user's original task description
   * @param {"full"|"direct-execution"} startMode
   * @returns {{ callerId: string, instruction: string }[] | { error: string }}
   */
  startOrchestration(userTask, startMode = START_MODES.FULL) {
    const readiness = this.checkStartReady(startMode);
    if (!readiness.ready) {
      return { error: `Cannot start: missing ${readiness.missing.join(", ")}` };
    }

    this.startMode = startMode;
    this.status = "running";
    this.userTask = userTask;

    // Determine initial phase based on start mode
    if (startMode === START_MODES.DIRECT_EXECUTION) {
      this.phase = "implementation";
      this.currentPhaseId = "Phase 1";
    } else {
      this.phase = "planning";
    }

    this._emit({ type: "status_change", status: "running", phase: this.phase });

    // Build initial instructions for active-phase agents (excluding CEO)
    const activeRoles = startMode === START_MODES.DIRECT_EXECUTION
      ? PHASE_AGENTS.implementation
      : PHASE_AGENTS.planning;

    const instructions = [];
    for (const [callerId, agent] of this.agents) {
      // CEO stays blocked — never released at start
      if (agent.role === "ceo") continue;
      // Workers get a standby instruction
      if (agent.role === "worker") {
        agent.status = "idle";
        instructions.push({
          callerId,
          instruction: this._buildInitialInstruction(agent, userTask),
        });
        continue;
      }
      if (activeRoles.includes(agent.role)) {
        const instruction = this._buildInitialInstruction(agent, userTask);
        agent.status = "idle";
        instructions.push({ callerId, instruction });
      }
    }
    return { instructions };
  }

  _buildInitialInstruction(agent, userTask) {
    const tail = buildTailInjection(agent.role, this.phase, this.currentPhaseId);
    if (agent.role === "planning-expert") {
      return `## 当前任务\n\n${userTask}\n\n使用 submit 工具提交你的方案。${tail}`;
    }
    if (agent.role === "planning-inspector") {
      return `等待规划专家提交方案后进行审查。使用 submit 工具提交审查结果。${tail}`;
    }
    if (agent.role === "execution-expert") {
      if (this.startMode === START_MODES.DIRECT_EXECUTION) {
        return `## 当前任务（直接执行模式）\n\n${userTask}\n\n已跳过规划阶段，直接进入实施。\n1. 分析任务并制定执行计划\n2. 使用 order 工具分发工作指令给 Worker\n3. 每个 Phase 完成后使用 submit 工具提交进度报告${tail}`;
      }
      return `等待方案批准后进入实施阶段。使用 order 工具分发工作指令。${tail}`;
    }
    if (agent.role === "execution-inspector") {
      if (this.startMode === START_MODES.DIRECT_EXECUTION) {
        return `## 审查任务（直接执行模式）\n\n原始任务: ${userTask}\n\n已跳过规划阶段。请直接审查执行专家的提交。\n1. 检查代码质量和架构一致性\n2. 使用 submit 工具提交审查结果${tail}`;
      }
      return `等待实施阶段的 Phase 完成后进行审查。使用 submit 工具提交审查结果。${tail}`;
    }
    if (agent.role === "ceo") {
      return `当前待命中，将在关键节点被唤醒进行审查和裁决。${tail}`;
    }
    return `注册成功，等待任务分配。${tail}`;
  }

  // ── Submit Handling ──

  /**
   * Handle agent submit. Returns routing decision.
   * @returns {{ action: "route", targetCallerId: string, content: string } |
   *           { action: "human_review", content: string, submitType: string } |
   *           { action: "vote_recorded" } |
   *           { action: "phase_transition", newPhase: string } |
   *           { action: "complete" } |
   *           { error: string }}
   */
  handleSubmit(callerId, submitType, content, metadata = {}) {
    const agent = this.agents.get(callerId);
    if (!agent || !agent.role) {
      return { error: "Agent not registered or no role assigned" };
    }
    if (this.status !== "running") {
      return { error: `Orchestration not running (status: ${this.status})` };
    }

    // Update agent status
    agent.status = "blocked";

    // Track last submit content for CEO gate materials
    this.lastSubmitContent = content;

    // Track round
    this._endCurrentRound();
    this._startRound(callerId, agent.role);

    // Check stagnation
    this._checkStagnation(content);

    // Determine if human review is needed
    if (this._needsHumanReview(agent.role, submitType)) {
      this.humanReviewPending = {
        callerId,
        originalContent: content,
        submitType,
        targetRole: this._getRouteTarget(agent.role),
      };
      return { action: "human_review", content, submitType, callerId };
    }

    return this._routeSubmit(callerId, agent.role, submitType, content, metadata);
  }

  _needsHumanReview(role, submitType) {
    switch (this.controlMode) {
      case "autopilot":
        return false;
      case "ceo-override":
        // Only pause on CEO review points (e.g. after vote pass, final review)
        return role === "ceo" || submitType === "final_complete";
      case "full-override":
        return true;
      default:
        return false;
    }
  }

  /**
   * Human approved review. Resume routing.
   */
  approveHumanReview(modifiedContent) {
    if (!this.humanReviewPending) {
      return { error: "No pending review" };
    }
    const { callerId, submitType } = this.humanReviewPending;
    const agent = this.agents.get(callerId);
    const content = modifiedContent || this.humanReviewPending.originalContent;
    this.humanReviewPending = null;
    return this._routeSubmit(callerId, agent.role, submitType, content, {});
  }

  rejectHumanReview(reason) {
    if (!this.humanReviewPending) {
      return { error: "No pending review" };
    }
    const { callerId } = this.humanReviewPending;
    this.humanReviewPending = null;
    // Send rejection back to the submitting agent
    return {
      action: "route",
      targetCallerId: callerId,
      content: `[人工审查拒绝] ${reason}\n\n请根据以上反馈修改后重新提交。`,
    };
  }

  _routeSubmit(callerId, role, submitType, content, metadata) {
    const tail = buildTailInjection(
      this._getRouteTarget(role),
      this.phase,
      this.currentPhaseId
    );

    // Planning phase routing
    if (this.phase === "planning") {
      if (role === "planning-expert") {
        const inspectorId = this._findAgentByRole("planning-inspector");
        if (!inspectorId) return { error: "Planning inspector not found" };
        return {
          action: "route",
          targetCallerId: inspectorId,
          content: `[来自工程团队负责人]\n\n请审查以下方案：\n\n${content}${tail}`,
        };
      }
      if (role === "planning-inspector") {
        const expertId = this._findAgentByRole("planning-expert");
        if (!expertId) return { error: "Planning expert not found" };
        return {
          action: "route",
          targetCallerId: expertId,
          content: `[来自工程团队负责人]\n\n审查反馈：\n\n${content}${tail}`,
        };
      }
    }

    // Implementation phase routing
    if (this.phase === "implementation") {
      if (role === "execution-expert" && submitType === "phase_complete") {
        const inspectorId = this._findAgentByRole("execution-inspector");
        if (!inspectorId) return { error: "Execution inspector not found" };
        return {
          action: "route",
          targetCallerId: inspectorId,
          content: `[来自工程团队负责人]\n\n请审查以下Phase完成报告：\n\n${content}${tail}`,
        };
      }
      if (role === "execution-inspector" && submitType === "review_result") {
        const passed = metadata.passed !== false;
        if (passed) {
          // Move to next phase or final review
          return this._advancePhase(content);
        }
        const expertId = this._findAgentByRole("execution-expert");
        if (!expertId) return { error: "Execution expert not found" };
        return {
          action: "route",
          targetCallerId: expertId,
          content: `[来自工程团队负责人]\n\n审查未通过，请修复以下问题：\n\n${content}${tail}`,
        };
      }
      if (submitType === "final_complete") {
        return this._triggerCeoFinalReview(content);
      }
    }

    return { error: `Unhandled submit: role=${role}, type=${submitType}, phase=${this.phase}` };
  }

  _getRouteTarget(role) {
    const targets = {
      "planning-expert": "planning-inspector",
      "planning-inspector": "planning-expert",
      "execution-expert": "execution-inspector",
      "execution-inspector": "execution-expert",
    };
    return targets[role] || role;
  }

  // ── Voting ──

  handleVote(callerId, vote, reason) {
    const agent = this.agents.get(callerId);
    if (!agent) return { error: "Agent not found" };

    if (agent.role === "planning-expert") {
      this.votes.expert = { vote, reason };
    } else if (agent.role === "planning-inspector") {
      this.votes.inspector = { vote, reason };
    } else {
      return { error: "Only planning expert/inspector can vote" };
    }

    // Check if both voted
    if (this.votes.expert && this.votes.inspector) {
      if (this.votes.expert.vote === "pass" && this.votes.inspector.vote === "pass") {
        // Both passed → CEO gate
        this._emit({ type: "votes_passed" });
        return { status: "recorded", message: "投票通过，进入CEO门控审批" };
      }
      // At least one rejected → reset votes, continue confrontation
      const rejectReason = this.votes.expert?.vote === "reject"
        ? this.votes.expert.reason
        : this.votes.inspector.reason;
      this.votes = { expert: null, inspector: null };
      return { status: "rejected", message: `投票未通过: ${rejectReason}` };
    }

    return { status: "recorded", message: "投票已记录，等待对方投票" };
  }

  // ── Worker Management ──

  handleOrder(callerId, workerId, taskDescription, priority = "normal") {
    const agent = this.agents.get(callerId);
    if (!agent || !agent.role.includes("expert")) {
      return { error: "Only experts can issue orders" };
    }

    // Find or assign a worker
    let targetWorker;
    if (workerId) {
      targetWorker = this._findAgentById(workerId);
    } else {
      targetWorker = this._findIdleWorker();
    }
    if (!targetWorker) {
      return { error: "No available worker" };
    }

    const orderId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.workerOrders.set(orderId, {
      workerId: targetWorker.callerId,
      taskDescription,
      priority,
      status: "dispatched",
      result: null,
      requesterId: callerId,
    });
    targetWorker.status = "working";
    this._emit({
      type: "worker_order",
      workerId: targetWorker.callerId,
      orderId,
      taskDescription,
    });

    return {
      action: "route",
      targetCallerId: targetWorker.callerId,
      content: taskDescription,
      orderId,
    };
  }

  handleCheckOrders(callerId) {
    const orders = [];
    for (const [, agent] of this.agents) {
      if (agent.role === "worker") {
        const activeOrder = [...this.workerOrders.values()].find(
          (o) => o.workerId === agent.callerId && o.status !== "completed"
        );
        orders.push({
          worker_id: agent.callerId,
          role: agent.workerRole || "worker",
          status: agent.status,
          current_task: activeOrder?.taskDescription || null,
          recent_history: [],
        });
      }
    }
    return { orders };
  }

  handleWorkerFeedback(callerId, result, filesModified = []) {
    const agent = this.agents.get(callerId);
    if (!agent || agent.role !== "worker") {
      return { error: "Not a worker" };
    }

    // Find the active order for this worker
    const order = [...this.workerOrders.entries()].find(
      ([, o]) => o.workerId === callerId && o.status !== "completed"
    );
    if (order) {
      const [orderId, orderEntry] = order;
      orderEntry.status = "completed";
      orderEntry.result = result;
      agent.status = "idle";

      this._emit({
        type: "worker_completed",
        workerId: callerId,
        orderId,
        result,
        filesModified,
      });

      // Notify the requester if they're waiting (await_order_finish)
      return {
        action: "notify_requester",
        requesterId: orderEntry.requesterId,
        orderId,
        result,
        filesModified,
      };
    }

    agent.status = "idle";
    return { action: "standby" };
  }

  // ── Phase Management ──

  _advancePhase(reviewContent) {
    // TODO: Phase tracking logic
    // For now, signal that the current phase is complete
    this._emit({
      type: "phase_advance",
      phase: this.phase,
      phaseId: this.currentPhaseId,
    });

    const expertId = this._findAgentByRole("execution-expert");
    if (!expertId) return { error: "Execution expert not found" };

    const tail = buildTailInjection("execution-expert", this.phase, this.currentPhaseId);
    return {
      action: "route",
      targetCallerId: expertId,
      content: `[来自工程团队负责人]\n\n当前Phase审查通过。请继续执行下一个Phase。\n\n${reviewContent}${tail}`,
    };
  }

  _triggerCeoFinalReview(content) {
    const ceoId = this._findAgentByRole("ceo");
    if (!ceoId) {
      // No CEO agent, complete directly
      this.status = "completed";
      this._emit({ type: "status_change", status: "completed" });
      return { action: "complete" };
    }

    // Activate CEO gate for final review
    this.ceoGate = {
      active: true,
      type: "final_review",
      round: 0,
      minRounds: 1, // Less defensive for final review
      materials: content,
      history: [],
    };

    const tail = buildTailInjection("ceo", this.phase, null);
    return {
      action: "wake_ceo",
      targetCallerId: ceoId,
      content: `[CEO 终审请求]\n\n以下是全部实施结果的审查报告，请进行最终验证。\n审查后请使用 ceo_verdict 工具提交你的裁决。\n\n${content}${tail}`,
    };
  }

  /**
   * Trigger CEO gate after router_vote passes.
   * Starts the defensive rejection sequence before CEO gets to make a real verdict.
   * @param {string} materials - Vote reasons and plan content
   * @returns {{ action: string, ... }}
   */
  triggerPlanningGate(materials) {
    const ceoId = this._findAgentByRole("ceo");
    if (!ceoId) {
      // No CEO → auto-approve, transition to implementation
      return { action: "auto_transition", materials };
    }

    this.ceoGate = {
      active: true,
      type: "planning_gate",
      round: 0,
      minRounds: 2,
      materials,
      history: [],
    };

    // Start defensive rejection sequence — round 0: wake CEO with review materials
    const tail = buildTailInjection("ceo", "planning", null);
    return {
      action: "wake_ceo",
      targetCallerId: ceoId,
      content: `[CEO 门控审批 — 规划对峙投票已通过]\n\n专家和监察已就方案达成一致。请审查以下材料并做出裁决。\n审查后请使用 ceo_verdict 工具提交你的裁决（approved/rejected）。\n\n## 原始任务\n\n${this.userTask}\n\n## 投票理由\n\n${materials}${tail}`,
    };
  }

  /**
   * Handle CEO verdict from ceo_verdict tool.
   * @returns {{ action: string, ... }}
   */
  handleCeoVerdict(callerId, verdict, reason, targets = []) {
    const agent = this.agents.get(callerId);
    if (!agent || agent.role !== "ceo") {
      return { error: "Not the CEO agent" };
    }
    if (!this.ceoGate.active) {
      return { error: "No active CEO gate" };
    }

    // Record verdict in history
    this.ceoGate.history.push({
      round: this.ceoGate.round,
      verdict,
      reason,
    });

    if (verdict === "approved") {
      return this._handleCeoApproval();
    } else if (verdict === "rejected") {
      return this._handleCeoRejection(reason);
    } else if (verdict === "arbitration") {
      return this._handleCeoArbitration(reason, targets);
    }

    return { error: `Unknown verdict: ${verdict}` };
  }

  _handleCeoApproval() {
    const gateType = this.ceoGate.type;
    this.ceoGate.active = false;

    if (gateType === "planning_gate") {
      // CEO approved planning → transition to implementation
      this._emit({ type: "ceo_gate_resolved", gateType, verdict: "approved" });
      return { action: "transition_to_implementation", materials: this.ceoGate.materials };
    }
    if (gateType === "final_review") {
      // CEO approved final → task complete
      this.status = "completed";
      this._emit({ type: "status_change", status: "completed" });
      this._emit({ type: "ceo_gate_resolved", gateType, verdict: "approved" });
      return { action: "complete" };
    }
    if (gateType === "arbitration") {
      this._emit({ type: "ceo_gate_resolved", gateType, verdict: "approved" });
      return { action: "arbitration_resolved" };
    }
    return { action: "noop" };
  }

  _handleCeoRejection(reason) {
    const gateType = this.ceoGate.type;
    this.ceoGate.round++;

    if (gateType === "planning_gate") {
      // Reset votes, send rejection back to expert+inspector
      this.votes = { expert: null, inspector: null };
      this.ceoGate.active = false;
      this._emit({ type: "ceo_gate_resolved", gateType, verdict: "rejected", reason });

      const expertId = this._findAgentByRole("planning-expert");
      const inspectorId = this._findAgentByRole("planning-inspector");
      const routeTargets = [];
      if (expertId) {
        routeTargets.push({
          targetCallerId: expertId,
          content: `[CEO 裁决: 方案被退回]\n\n${reason}\n\n请根据以上反馈修改方案后重新提交。`,
        });
      }
      if (inspectorId) {
        routeTargets.push({
          targetCallerId: inspectorId,
          content: `[CEO 裁决: 方案被退回]\n\nCEO认为方案存在问题：\n${reason}\n\n请在专家修改方案后重新审查。`,
        });
      }
      return { action: "route_multiple", targets: routeTargets };
    }

    if (gateType === "final_review") {
      this.ceoGate.active = false;
      this._emit({ type: "ceo_gate_resolved", gateType, verdict: "rejected", reason });

      const expertId = this._findAgentByRole("execution-expert");
      const inspectorId = this._findAgentByRole("execution-inspector");
      const routeTargets = [];
      if (expertId) {
        routeTargets.push({
          targetCallerId: expertId,
          content: `[CEO 终审未通过]\n\n${reason}\n\n请根据以上反馈修复后重新提交。`,
        });
      }
      if (inspectorId) {
        routeTargets.push({
          targetCallerId: inspectorId,
          content: `[CEO 终审未通过]\n\nCEO 发现问题：\n${reason}\n\n请在专家修复后重新审查。`,
        });
      }
      return { action: "route_multiple", targets: routeTargets };
    }

    this.ceoGate.active = false;
    return { action: "noop" };
  }

  _handleCeoArbitration(reason, targets) {
    this.ceoGate.active = false;
    this._emit({ type: "ceo_gate_resolved", gateType: "arbitration", verdict: "arbitration", reason });

    const routeTargets = [];
    for (const targetRole of targets) {
      const targetId = this._findAgentByRole(targetRole);
      if (targetId) {
        routeTargets.push({
          targetCallerId: targetId,
          content: `[CEO 仲裁裁决]\n\n${reason}`,
        });
      }
    }
    return { action: "route_multiple", targets: routeTargets };
  }

  /**
   * Transition from planning to implementation phase.
   */
  transitionToImplementation(planDocument) {
    this.phase = "implementation";
    this.currentPhaseId = "Phase 1";

    // Mark planning agents as standby
    for (const [, agent] of this.agents) {
      if (PHASE_AGENTS.planning.includes(agent.role)) {
        agent.status = "standby";
      }
    }

    this._emit({
      type: "phase_transition",
      from: "planning",
      to: "implementation",
    });

    // Build instructions for implementation agents
    const instructions = [];
    for (const [callerId, agent] of this.agents) {
      if (PHASE_AGENTS.implementation.includes(agent.role)) {
        const tail = buildTailInjection(agent.role, "implementation", "Phase 1");
        let instruction;
        if (agent.role === "execution-expert") {
          instruction = `## 角色: 实施专家

规划阶段已完成。以下是最终规划书：

${planDocument}

## 行为指南

1. 按规划书中的 Phase 顺序执行编码
2. 每个 Phase 完成后使用 submit 工具提交完成报告
3. 可使用 order 工具委派子任务给 Worker
4. 可使用 check_orders 查看 Worker 状态
5. 保证每个 Phase 有 git checkpoint${tail}`;
        } else {
          instruction = `## 角色: 实施监察

规划阶段已完成。以下是最终规划书供参考：

${planDocument}

## 审查要点

1. 直接检查仓库代码，不信专家自述
2. 代码质量、架构一致性
3. 测试覆盖
4. 需求逐项对照${tail}`;
        }
        agent.status = "idle";
        instructions.push({ callerId, instruction });
      }
    }
    return { instructions };
  }

  // ── Session Status ──

  /**
   * Set agent session status externally (e.g. from SessionManager).
   * Valid statuses: "derailed", "broken", "registered" (reset after recovery).
   */
  setAgentStatus(callerId, status) {
    const agent = this.agents.get(callerId);
    if (!agent) return { error: "Agent not found" };
    const prev = agent.status;
    agent.status = status;
    this._emit({ type: "agent_status_change", callerId, prev, status, role: agent.role });
    return { ok: true, prev };
  }

  /**
   * Replace a broken/derailed agent with a standby.
   * Transfers role and workerRole from the old agent to the new one.
   */
  failoverAgent(oldCallerId, newCallerId) {
    const oldAgent = this.agents.get(oldCallerId);
    const newAgent = this.agents.get(newCallerId);
    if (!oldAgent) return { error: "Old agent not found" };
    if (!newAgent) return { error: "Standby agent not found" };

    const role = oldAgent.role;
    const workerRole = oldAgent.workerRole;

    oldAgent.status = "broken";
    oldAgent.role = null;

    newAgent.role = role;
    newAgent.workerRole = workerRole;
    newAgent.status = "idle";

    this._emit({
      type: "agent_failover",
      oldCallerId,
      newCallerId,
      role,
    });
    return { ok: true, role };
  }

  // ── Control Mode ──

  setControlMode(mode) {
    if (!["autopilot", "ceo-override", "full-override"].includes(mode)) {
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
        this._emit({ type: "stagnation_detected", count: this.sameFeedbackCount });
      }
    } else {
      this.sameFeedbackCount = 0;
      this.lastFeedbackHash = hash;
    }
  }

  // ── Round Tracking ──

  _startRound(callerId, role) {
    this.currentRound = {
      id: `round_${Date.now()}`,
      callerId,
      role,
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

  // ── Helpers ──

  _findAgentByRole(role) {
    for (const [callerId, agent] of this.agents) {
      if (agent.role === role) return callerId;
    }
    return null;
  }

  _findAgentById(callerId) {
    return this.agents.get(callerId) || null;
  }

  _findIdleWorker() {
    for (const [, agent] of this.agents) {
      if (agent.role === "worker" && (agent.status === "idle" || agent.status === "registered")) {
        return agent;
      }
    }
    return null;
  }

  _emit(event) {
    if (this.onEvent) this.onEvent(event);
  }

  // ── Serialization ──

  toJSON() {
    return {
      launcherId: this.launcherId,
      status: this.status,
      phase: this.phase,
      currentPhaseId: this.currentPhaseId,
      startMode: this.startMode,
      controlMode: this.controlMode,
      agents: Object.fromEntries(
        [...this.agents].map(([k, v]) => [k, { ...v }])
      ),
      votes: this.votes,
      ceoGate: {
        active: this.ceoGate.active,
        type: this.ceoGate.type,
        round: this.ceoGate.round,
        history: this.ceoGate.history,
      },
      rounds: this.rounds,
      humanReviewPending: this.humanReviewPending,
    };
  }
}
