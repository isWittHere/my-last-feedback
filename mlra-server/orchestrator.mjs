// ── MLRA Orchestrator State Machine ──
// Pure logic module — no I/O, no network, fully testable.

import { PHASE_AGENTS, buildTailInjection } from "./protocol.mjs";
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

    /** @type {Map<string, AgentEntry>} callerId → AgentEntry */
    this.agents = new Map();

    // Votes (planning confrontation consensus)
    this.votes = { expert: null, inspector: null };

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
    if (this.status !== "configuring") return;
    // Need at minimum: planning-expert + planning-inspector
    const roles = new Set();
    for (const a of this.agents.values()) {
      if (a.role) roles.add(a.role);
    }
    if (roles.has("planning-expert") && roles.has("planning-inspector")) {
      this.status = "ready";
      this._emit({ type: "status_change", status: "ready" });
    }
  }

  /**
   * Start orchestration. Returns initial instructions for each active-phase agent.
   * @param {string} userTask - The user's original task description
   * @returns {{ callerId: string, instruction: string }[]}
   */
  startOrchestration(userTask) {
    if (this.status !== "ready") {
      return { error: `Cannot start: status is ${this.status}` };
    }
    this.status = "running";
    this.phase = "planning";
    this.userTask = userTask;
    this._emit({ type: "status_change", status: "running", phase: "planning" });

    // Build initial instructions for planning-phase agents
    const instructions = [];
    for (const [callerId, agent] of this.agents) {
      if (PHASE_AGENTS.planning.includes(agent.role)) {
        const instruction = this._buildInitialInstruction(agent, userTask);
        agent.status = "idle"; // Will become "working" when resolve is sent
        instructions.push({ callerId, instruction });
      }
    }
    return { instructions };
  }

  _buildInitialInstruction(agent, userTask) {
    const tail = buildTailInjection(agent.role, this.phase, this.currentPhaseId);
    if (agent.role === "planning-expert") {
      return `## 角色: 规划专家

你已成功注册到 MLRA 多 Agent 编排系统。

## 你的任务

以下是需要完成的任务：

${userTask}

## 行为指南

1. 分析任务需求，设计详细的实施方案
2. 你的方案将被规划监察审查
3. 使用 submit 工具提交你的方案
4. 根据审查反馈修改方案，直到双方达成共识
5. 达成共识后使用 router_vote 投票${tail}`;
    }
    if (agent.role === "planning-inspector") {
      return `## 角色: 规划监察

你已成功注册到 MLRA 多 Agent 编排系统。

## 你的职责

等待规划专家提交方案后进行审查。你将收到方案内容。

## 审查要点

1. 需求覆盖度 — 是否所有需求都被方案覆盖
2. 技术可行性 — 方案的技术路线是否可行
3. 边缘场景 — 是否考虑了边缘情况
4. 过度设计 — 是否存在不必要的复杂性

## 行为指南

1. 使用 submit 工具提交你的审查结果
2. 审查通过时说明理由，不通过时列出具体问题
3. 达成共识后使用 router_vote 投票${tail}`;
    }
    if (agent.role === "ceo") {
      return `## 角色: CEO

你已成功注册到 MLRA 多 Agent 编排系统。当前待命中，将在关键节点被唤醒进行审查和裁决。${tail}`;
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

    const tail = buildTailInjection("ceo", this.phase, null);
    return {
      action: "route",
      targetCallerId: ceoId,
      content: `[CEO 终审请求]\n\n以下是全部实施结果的审查报告，请进行最终验证：\n\n${content}${tail}`,
    };
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
      controlMode: this.controlMode,
      agents: Object.fromEntries(
        [...this.agents].map(([k, v]) => [k, { ...v }])
      ),
      votes: this.votes,
      rounds: this.rounds,
      humanReviewPending: this.humanReviewPending,
    };
  }
}
