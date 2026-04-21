// ── MLRA Orchestrator Daemon ──
// Central process that manages all orchestration state.
// MCP Server processes connect via TCP to communicate with the Daemon.
// Daemon connects to MLFB Tauri App for UI integration.

import { createServer } from "node:net";
import { createInterface } from "node:readline";
import { writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Orchestrator } from "./orchestrator.mjs";
import { MessageRouter } from "./router.mjs";
import { IpcBridge } from "./ipc-bridge.mjs";
import { SessionManager } from "./session-manager.mjs";
import { MSG } from "./legacy-protocol.mjs";
import { WORKER_ENABLED } from "./feature-flags.mjs";

// ── Port config ──

const IS_DEV = process.env.MLRA_DEV === "1";
const PORT_START = IS_DEV ? 19881 : 19871;
const PORT_END = IS_DEV ? 19890 : 19880;

function lockFilePath() {
  return join(
    tmpdir(),
    IS_DEV ? "my-long-running-agent-dev.port" : "my-long-running-agent.port"
  );
}

// ── Daemon ──

class OrchestratorDaemon {
  constructor() {
    this.orchestrator = new Orchestrator();
    this.router = new MessageRouter();
    this.ipcBridge = new IpcBridge({ isDev: IS_DEV });
    this.sessionManager = new SessionManager();
    this.server = null;
    this.port = null;

    /**
     * Active MCP server connections.
     * callerId → { socket, rl }
     * @type {Map<string, { socket: import("net").Socket, rl: import("readline").Interface }>}
     */
    this.connections = new Map();

    // Wire orchestrator events to IPC bridge
    this.orchestrator.onEvent = (event) => this._handleOrchestrationEvent(event);

    // Wire SessionManager events
    this._wireSessionManagerEvents();
  }

  async start() {
    // 1. Bind TCP server for MCP Server processes
    this.server = await this._bindServer();
    console.error(`[MLRA-Daemon] Listening on port ${this.port}`);

    // 2. Write lock file
    writeFileSync(lockFilePath(), String(this.port));
    console.error(`[MLRA-Daemon] Lock file written: ${lockFilePath()}`);

    // 3. Connect to MLFB Tauri App (non-blocking, retry later if not running)
    this._connectToTauri();

    // 4. Setup IPC message handler (from Tauri App)
    this.ipcBridge.onMessage = (msg) => this._handleTauriMessage(msg);

    // 5. Handle shutdown
    process.on("SIGINT", () => this._shutdown());
    process.on("SIGTERM", () => this._shutdown());
  }

  async _bindServer() {
    for (let port = PORT_START; port <= PORT_END; port++) {
      try {
        const server = createServer((socket) => this._handleMcpConnection(socket));
        await new Promise((resolve, reject) => {
          server.listen(port, "127.0.0.1", () => resolve());
          server.on("error", reject);
        });
        this.port = port;
        return server;
      } catch {
        continue;
      }
    }
    throw new Error(`Could not bind to any port in range ${PORT_START}-${PORT_END}`);
  }

  async _connectToTauri() {
    const connected = await this.ipcBridge.connect();
    if (!connected) {
      console.error("[MLRA-Daemon] Tauri app not running, will retry...");
      // Retry every 5 seconds
      setTimeout(() => this._connectToTauri(), 5000);
    }
  }

  // ── MCP Server Connection Handling ──

  _handleMcpConnection(socket) {
    console.error("[MLRA-Daemon] New MCP server connection");
    const rl = createInterface({ input: socket });
    let callerId = null;

    rl.on("line", async (line) => {
      try {
        const msg = JSON.parse(line.trim());

        // Track connection BEFORE blocking (so socket.close knows callerId)
        if (msg.type === MSG.AGENT_REGISTER && !callerId && msg.callerId) {
          callerId = msg.callerId;
          this.connections.set(callerId, { socket, rl });
        }

        const response = await this._handleMcpMessage(msg, socket);
        if (response !== undefined) {
          socket.write(JSON.stringify(response) + "\n");
        }
      } catch (e) {
        console.error("[MLRA-Daemon] Error handling MCP message:", e.message);
        socket.write(JSON.stringify({ type: MSG.ERROR, message: e.message }) + "\n");
      }
    });

    socket.on("close", () => {
      console.error("[MLRA-Daemon] MCP server disconnected:", callerId || "unknown");
      if (callerId) {
        this.connections.delete(callerId);
        // Cancel any pending blocking calls for this agent
        this.router.reject(callerId, "Agent disconnected");
        // Notify SessionManager of TCP disconnect
        this.sessionManager.handleTcpDisconnect(callerId);
      }
    });

    socket.on("error", (err) => {
      console.error("[MLRA-Daemon] MCP socket error:", err.message);
    });
  }

  /**
   * Handle a message from an MCP Server process.
   * For blocking calls (register, submit, worker_feedback), the response is sent
   * later via the router. For non-blocking calls, the response is returned immediately.
   */
  async _handleMcpMessage(msg, socket) {
    switch (msg.type) {
      case MSG.AGENT_REGISTER: {
        const { callerId, alias, workspace, model } = msg;
        const result = this.orchestrator.registerAgent(callerId, alias, workspace);
        if (result.error) {
          return { type: MSG.ERROR, callerId, message: result.error };
        }

        // Register with SessionManager (links transcript monitoring)
        this.sessionManager.registerAgent(callerId, alias, model || "unknown", workspace);

        // Notify Tauri UI
        this.ipcBridge.send({
          type: MSG.MLRA_AGENT_REGISTERED,
          callerId,
          alias,
          workspace,
        });

        // Block until orchestration starts and initial instruction is ready
        console.error(`[MLRA-Daemon] Agent registered: ${callerId} (${alias}), blocking...`);
        try {
          const instruction = await this.router.block(callerId, "register");
          return { type: MSG.RESOLVE, callerId, content: instruction };
        } catch (e) {
          return { type: MSG.ERROR, callerId, message: e.message };
        }
      }

      case MSG.AGENT_SUBMIT: {
        const { callerId, submitType, content, metadata } = msg;
        console.error(`[MLRA-Daemon] Submit from ${callerId}: type=${submitType}`);

        const decision = this.orchestrator.handleSubmit(callerId, submitType, content, metadata);

        if (decision.error) {
          return { type: MSG.ERROR, callerId, message: decision.error };
        }

        if (decision.action === "human_review") {
          // Push to Tauri UI for human review
          this.ipcBridge.send({
            type: MSG.MLRA_HUMAN_REVIEW,
            callerId: decision.callerId,
            content: decision.content,
            submitType: decision.submitType,
          });
          // Block until human approves/rejects
          try {
            const instruction = await this.router.block(callerId, "submit");
            return { type: MSG.RESOLVE, callerId, content: instruction };
          } catch (e) {
            return { type: MSG.ERROR, callerId, message: e.message };
          }
        }

        if (decision.action === "route") {
          // Route to target agent
          this._routeToAgent(decision.targetCallerId, decision.content);
          // Block submitter until their next instruction arrives
          try {
            const instruction = await this.router.block(callerId, "submit");
            return { type: MSG.RESOLVE, callerId, content: instruction };
          } catch (e) {
            return { type: MSG.ERROR, callerId, message: e.message };
          }
        }

        if (decision.action === "wake_ceo") {
          // Wake the CEO by releasing their blocked call
          this.router.release(decision.targetCallerId, decision.content);
          // Block submitter until next instruction
          try {
            const instruction = await this.router.block(callerId, "submit");
            return { type: MSG.RESOLVE, callerId, content: instruction };
          } catch (e) {
            return { type: MSG.ERROR, callerId, message: e.message };
          }
        }

        if (decision.action === "route_multiple") {
          // Route to multiple targets
          for (const t of decision.targets) {
            this._routeToAgent(t.targetCallerId, t.content);
          }
          // Block submitter
          try {
            const instruction = await this.router.block(callerId, "submit");
            return { type: MSG.RESOLVE, callerId, content: instruction };
          } catch (e) {
            return { type: MSG.ERROR, callerId, message: e.message };
          }
        }

        if (decision.action === "complete") {
          return { type: MSG.RESOLVE, callerId, content: "任务完成。" };
        }

        return { type: MSG.ERROR, callerId, message: "Unknown routing decision" };
      }

      case MSG.AGENT_VOTE: {
        const { callerId, vote, reason } = msg;
        const result = this.orchestrator.handleVote(callerId, vote, reason);
        // Vote is quick-return, not blocking
        return { type: MSG.RESOLVE, callerId, content: JSON.stringify(result) };
      }

      case MSG.AGENT_ORDER: {
        if (!WORKER_ENABLED) {
          return { type: MSG.ERROR, callerId: msg.callerId, message: "Worker subsystem is dormant. Delegation is not available." };
        }
        const { callerId, workerId, taskDescription, priority } = msg;
        const result = this.orchestrator.handleOrder(callerId, workerId, taskDescription, priority);

        if (result.error) {
          return { type: MSG.ERROR, callerId, message: result.error };
        }

        if (result.action === "route") {
          // Route task to worker (releases worker's submit_feedback block)
          this._routeToAgent(result.targetCallerId, result.content);
          // Return immediately to expert (non-blocking)
          return {
            type: MSG.RESOLVE,
            callerId,
            content: JSON.stringify({ worker_id: result.targetCallerId, status: "dispatched", orderId: result.orderId }),
          };
        }

        return { type: MSG.ERROR, callerId, message: "Could not dispatch order" };
      }

      case MSG.AGENT_CHECK_ORDERS: {
        if (!WORKER_ENABLED) {
          return { type: MSG.ORDERS_STATUS, callerId: msg.callerId, orders: [] };
        }
        const { callerId } = msg;
        const result = this.orchestrator.handleCheckOrders(callerId);
        return { type: MSG.ORDERS_STATUS, callerId, orders: result.orders };
      }

      case MSG.AGENT_AWAIT_ORDER: {
        if (!WORKER_ENABLED) {
          return { type: MSG.ERROR, callerId: msg.callerId, message: "Worker subsystem is dormant." };
        }
        const { callerId, workerId } = msg;
        console.error(`[MLRA-Daemon] ${callerId} awaiting worker ${workerId}`);
        try {
          const data = await this.router.blockAwaitOrder(callerId, workerId);
          return { type: MSG.RESOLVE, callerId, content: JSON.stringify(data) };
        } catch (e) {
          return { type: MSG.ERROR, callerId, message: e.message };
        }
      }

      case MSG.WORKER_SUBMIT_FEEDBACK: {
        if (!WORKER_ENABLED) {
          return { type: MSG.ERROR, callerId: msg.callerId, message: "Worker subsystem is dormant." };
        }
        const { callerId, result, filesModified } = msg;
        const decision = this.orchestrator.handleWorkerFeedback(callerId, result, filesModified);

        if (decision.error) {
          return { type: MSG.ERROR, callerId, message: decision.error };
        }

        if (decision.action === "notify_requester") {
          // Notify requester if they're awaiting
          this.router.releaseAwaitOrder(decision.requesterId, callerId, {
            result: decision.result,
            filesModified: decision.filesModified,
          });
        }

        // Block worker until next task
        try {
          const nextTask = await this.router.block(callerId, "worker_feedback");
          return { type: MSG.RESOLVE, callerId, content: nextTask };
        } catch (e) {
          return { type: MSG.ERROR, callerId, message: e.message };
        }
      }

      case MSG.CEO_VERDICT: {
        const { callerId, verdict, reason, targets } = msg;
        console.error(`[MLRA-Daemon] CEO verdict: ${verdict} from ${callerId}`);

        const decision = this.orchestrator.handleCeoVerdict(callerId, verdict, reason, targets);

        if (decision.error) {
          return { type: MSG.ERROR, callerId, message: decision.error };
        }

        // Execute the decision
        this._executeCeoDecision(decision);

        // Push updated status to Tauri
        this.ipcBridge.send({
          type: MSG.MLRA_CEO_GATE_STATUS,
          ceoGate: this.orchestrator.ceoGate,
        });
        this.ipcBridge.send({
          type: MSG.MLRA_ORCHESTRATION_STATUS,
          state: this.orchestrator.toJSON(),
        });

        // If task is complete, release CEO immediately
        if (decision.action === "complete") {
          return { type: MSG.RESOLVE, callerId, content: "编排已完成。" };
        }

        // CEO goes back to sleep — block until next trigger point
        try {
          const nextMaterials = await this.router.block(callerId, "ceo_verdict");
          return { type: MSG.RESOLVE, callerId, content: nextMaterials };
        } catch (e) {
          return { type: MSG.ERROR, callerId, message: e.message };
        }
      }

      case MSG.GET_TASK_CONTEXT: {
        const { callerId } = msg;
        // Only main agents can request task context — workers are denied
        const agent = this.orchestrator.agents.get(callerId);
        if (!agent) {
          return { type: MSG.ERROR, callerId, message: "Agent not registered" };
        }
        if (agent.role === "worker") {
          return { type: MSG.ERROR, callerId, message: "Worker 不可使用此工具。请通过专家委派的任务描述获取所需信息。" };
        }
        const taskContext = [
          `## 原始用户请求\n\n${this.orchestrator.userTask || "(未设置)"}`,
          `## 任务类型\n\n${this.orchestrator.taskType || "未指定"}`,
          `## 当前阶段\n\n${this.orchestrator.phase}`,
          `## 启动模式\n\n${this.orchestrator.startMode}`,
        ].join("\n\n");
        return { type: MSG.RESOLVE, callerId, content: taskContext };
      }

      default:
        // ── Hook TCP Notification ──
        if (msg.type === MSG.SESSION_HOOK_NOTIFY) {
          const { session_id, agent_name, transcript_dir, workspace } = msg;
          this.sessionManager.handleHookNotify(session_id, agent_name, transcript_dir, workspace);
          return undefined; // Fire-and-forget, no response
        }
        // ── Admin messages (mlra_* prefix) routed to Tauri handler ──
        // Allows test scripts and CLI tools to control the daemon directly
        if (msg.type?.startsWith("mlra_")) {
          this._handleTauriMessage(msg);
          return undefined;
        }
        return { type: MSG.ERROR, message: `Unknown message type: ${msg.type}` };
    }
  }

  /**
   * Route content to a target agent by releasing their blocked call.
   */
  _routeToAgent(targetCallerId, content) {
    const released = this.router.release(targetCallerId, content);
    if (!released) {
      console.error(`[MLRA-Daemon] Message queued for agent ${targetCallerId} (not currently blocked)`);
    }
  }

  // ── Tauri Message Handling ──

  _handleTauriMessage(msg) {
    console.error("[MLRA-Daemon] Tauri message:", msg.type);

    switch (msg.type) {
      case MSG.MLRA_ASSIGN_ROLE: {
        const { callerId, role, workerRole } = msg;
        const result = this.orchestrator.assignRole(callerId, role, workerRole);
        if (result.error) {
          console.error("[MLRA-Daemon] Role assignment error:", result.error);
        } else if (role) {
          // Assign to SessionManager pool — first agent per role becomes primary
          const existingPool = this.sessionManager.getPool(role);
          const isPrimary = !existingPool || !existingPool.primary;
          this.sessionManager.assignToPool(callerId, role, isPrimary);
        }
        // Push updated status to Tauri
        this.ipcBridge.send({
          type: MSG.MLRA_ORCHESTRATION_STATUS,
          state: this.orchestrator.toJSON(),
        });
        break;
      }

      case MSG.MLRA_START_ORCHESTRATION: {
        const { userTask, startMode, taskType } = msg;
        const result = this.orchestrator.startOrchestration(userTask || "", startMode || "full", taskType || null);
        if (result.error) {
          console.error("[MLRA-Daemon] Start error:", result.error);
          break;
        }
        // Release register_LRA blocks for active-phase agents (NOT CEO) & record initial budget cost
        for (const { callerId, instruction } of result.instructions) {
          this.router.release(callerId, instruction);
          const agent = this.orchestrator.agents.get(callerId);
          if (agent) {
            this.sessionManager.recordInitialCost(callerId, agent.role, "unknown", agent.alias);
          }
        }
        // Push status
        this.ipcBridge.send({
          type: MSG.MLRA_ORCHESTRATION_STATUS,
          state: this.orchestrator.toJSON(),
        });
        break;
      }

      case MSG.MLRA_SET_CONTROL_MODE: {
        const { mode } = msg;
        this.orchestrator.setControlMode(mode);
        this.ipcBridge.send({
          type: MSG.MLRA_ORCHESTRATION_STATUS,
          state: this.orchestrator.toJSON(),
        });
        break;
      }

      case MSG.MLRA_REVIEW_APPROVED: {
        const { content } = msg;
        const result = this.orchestrator.approveHumanReview(content);
        if (result.error) {
          console.error("[MLRA-Daemon] Approve error:", result.error);
          break;
        }
        if (result.action === "route") {
          this._routeToAgent(result.targetCallerId, result.content);
        }
        break;
      }

      case MSG.MLRA_REVIEW_REJECTED: {
        const { reason } = msg;
        const result = this.orchestrator.rejectHumanReview(reason);
        if (result.error) {
          console.error("[MLRA-Daemon] Reject error:", result.error);
          break;
        }
        if (result.action === "route") {
          this._routeToAgent(result.targetCallerId, result.content);
        }
        break;
      }

      case MSG.MLRA_INJECT_MESSAGE: {
        const { callerId, content } = msg;
        this._routeToAgent(callerId, content);
        break;
      }

      case MSG.MLRA_TERMINATE: {
        console.error("[MLRA-Daemon] Termination requested");
        this.orchestrator.status = "cancelled";
        this.router.cancelAll("Orchestration terminated by user");
        this.sessionManager.shutdown();
        this.ipcBridge.send({
          type: MSG.MLRA_ORCHESTRATION_STATUS,
          state: this.orchestrator.toJSON(),
        });
        break;
      }

      case MSG.MLRA_SET_BUDGET: {
        const { limit } = msg;
        this.sessionManager.setBudgetLimit(limit);
        this.ipcBridge.send({
          type: MSG.MLRA_BUDGET_UPDATE,
          budget: this.sessionManager.getBudgetStatus(),
        });
        break;
      }

      case MSG.MLRA_INCREASE_BUDGET: {
        const { amount } = msg;
        const currentLimit = this.sessionManager.budget.limit;
        this.sessionManager.setBudgetLimit(currentLimit + amount);
        this.ipcBridge.send({
          type: MSG.MLRA_BUDGET_UPDATE,
          budget: this.sessionManager.getBudgetStatus(),
        });
        break;
      }
    }
  }

  // ── Orchestration Event Handling ──

  _handleOrchestrationEvent(event) {
    console.error("[MLRA-Daemon] Orchestration event:", event.type);

    // Forward relevant events to Tauri UI
    switch (event.type) {
      case "status_change":
        this.ipcBridge.send({
          type: MSG.MLRA_ORCHESTRATION_STATUS,
          state: this.orchestrator.toJSON(),
        });
        break;
      case "agent_status_change":
        // Status sync only — typed notifications (derailed/broken/recovered) are
        // emitted by SessionManager events wired in _wireSessionManagerEvents()
        this.ipcBridge.send({
          type: MSG.MLRA_ORCHESTRATION_STATUS,
          state: this.orchestrator.toJSON(),
        });
        break;
      case "agent_failover":
        this.ipcBridge.send({
          type: MSG.MLRA_SESSION_FAILOVER,
          oldCallerId: event.oldCallerId,
          newCallerId: event.newCallerId,
          role: event.role,
        });
        this.ipcBridge.send({
          type: MSG.MLRA_ORCHESTRATION_STATUS,
          state: this.orchestrator.toJSON(),
        });
        break;
      case "round_start":
      case "round_end":
        this.ipcBridge.send({
          type: MSG.MLRA_ROUND_EVENT,
          event: event.type === "round_start" ? "start" : "end",
          round: event.round,
        });
        break;
      case "votes_passed":
        // Planning agents voted pass → trigger CEO planning gate
        this._handleVotesPassed();
        break;
      case "implementation_votes_passed":
        // Implementation agents voted pass → trigger CEO final review
        this._handleImplementationVotesPassed();
        break;
      case "stagnation_detected":
        console.error(`[MLRA-Daemon] Stagnation detected (${event.count} same feedbacks, roles: ${event.stalledRoles?.join(", ")})`);
        this._handleStagnation(event);
        break;
      case "phase_transition":
        this.ipcBridge.send({
          type: MSG.MLRA_PHASE_CHANGE,
          from: event.from,
          to: event.to,
        });
        break;
    }
  }

  // ── SessionManager Event Wiring ──

  _wireSessionManagerEvents() {
    this.sessionManager.on("session_derailed", (callerId, role, reason, retryCount, maxRetries) => {
      console.error(`[MLRA-Daemon] Session derailed: ${callerId} (${role}), reason=${reason}`);
      this.orchestrator.setAgentStatus(callerId, "derailed");
      this.ipcBridge.send({
        type: MSG.MLRA_SESSION_DERAILED,
        callerId,
        role,
        reason,
        retryCount,
        maxRetries,
      });
    });

    this.sessionManager.on("session_recovered", (callerId, role) => {
      console.error(`[MLRA-Daemon] Session recovered: ${callerId} (${role})`);
      this.orchestrator.setAgentStatus(callerId, "idle");
      this.ipcBridge.send({
        type: MSG.MLRA_SESSION_RECOVERED,
        callerId,
        role,
      });
    });

    this.sessionManager.on("retry_requested", (callerId, role, retryCount) => {
      console.error(`[MLRA-Daemon] Retry requested: ${callerId} (${role}), attempt ${retryCount}`);
      // Re-inject instruction to get agent back on track
      this._reinjectAgent(callerId, role);
    });

    this.sessionManager.on("failover_requested", (newCallerId, oldCallerId, role) => {
      console.error(`[MLRA-Daemon] Failover: ${role} ${oldCallerId} → ${newCallerId}`);
      this.orchestrator.failoverAgent(oldCallerId, newCallerId);
      // Release the standby's register_LRA block with recovery context
      this._activateStandby(newCallerId, oldCallerId, role);
    });

    this.sessionManager.on("session_broken", (callerId, role) => {
      console.error(`[MLRA-Daemon] Session broken (no standbys): ${callerId} (${role})`);
      this.orchestrator.setAgentStatus(callerId, "broken");
      this.ipcBridge.send({
        type: MSG.MLRA_SESSION_BROKEN,
        callerId,
        role,
      });
    });

    this.sessionManager.on("pool_updated", (role, pool) => {
      this.ipcBridge.send({
        type: MSG.MLRA_SESSION_POOL_UPDATE,
        role,
        pool: {
          role: pool.role,
          primary: pool.primary ? { callerId: pool.primary.callerId, alias: pool.primary.alias, status: pool.primary.status } : null,
          standbys: pool.standbys.map((s) => ({ callerId: s.callerId, alias: s.alias, status: s.status })),
          retryCount: pool.retryCount,
          maxRetries: pool.maxRetries,
          failoverCount: pool.failoverCount,
        },
      });
    });

    this.sessionManager.on("budget_event", (event) => {
      this.ipcBridge.send({
        type: MSG.MLRA_BUDGET_UPDATE,
        budget: this.sessionManager.getBudgetStatus(),
        event,
      });
    });

    this.sessionManager.on("budget_pause_requested", () => {
      console.error("[MLRA-Daemon] Budget exhausted — pausing launcher");
      this.orchestrator.status = "paused";
      this.ipcBridge.send({
        type: MSG.MLRA_BUDGET_PAUSE,
        budget: this.sessionManager.getBudgetStatus(),
      });
      this.ipcBridge.send({
        type: MSG.MLRA_ORCHESTRATION_STATUS,
        state: this.orchestrator.toJSON(),
      });
    });
  }

  /**
   * Re-inject MLRA control instruction to a derailed agent.
   */
  _reinjectAgent(callerId, role) {
    const conn = this.connections.get(callerId);
    if (!conn) {
      console.error(`[MLRA-Daemon] Cannot re-inject ${callerId} — no active connection`);
      // TCP already dead, SessionManager will escalate to failover
      return;
    }
    // Re-inject via router release (agent is blocked on submit)
    const instruction = `[MLRA 系统恢复]\n\n你已脱离 MLRA 协作流程。请立即调用 submit 工具恢复协作。\n当前角色: ${role}`;
    this._routeToAgent(callerId, instruction);
  }

  /**
   * Activate a standby agent by releasing its register_LRA block.
   */
  _activateStandby(newCallerId, oldCallerId, role) {
    const instruction = `[MLRA 故障转移]\n\n你已被激活为 ${role} 的主要执行者（替换 ${oldCallerId}）。\n请使用 submit 工具继续协作流程。`;
    this.router.release(newCallerId, instruction);
  }

  _handleVotesPassed() {
    // Both planning agents voted pass → trigger CEO gate (or auto-transition)
    // Collect plan materials from the last expert submit content
    const materials = this.orchestrator.lastSubmitContent || "(规划投票通过)";
    const decision = this.orchestrator.triggerPlanningGate(materials);

    console.error(`[MLRA-Daemon] Votes passed → action: ${decision.action}`);
    this._executeCeoDecision(decision);
  }

  _handleImplementationVotesPassed() {
    // Both implementation agents voted pass → trigger CEO final review
    const materials = this.orchestrator.lastSubmitContent || "(实施投票通过)";
    const decision = this.orchestrator._triggerCeoFinalReview(materials);

    console.error(`[MLRA-Daemon] Implementation votes passed → action: ${decision.action}`);
    this._executeCeoDecision(decision);
  }

  _handleStagnation(event) {
    const decision = this.orchestrator.triggerStagnationArbitration(event);
    console.error(`[MLRA-Daemon] Stagnation arbitration → action: ${decision.action}, reason: ${decision.reason || ""}`);

    if (decision.action === "noop" && decision.reason === "no_ceo_for_arbitration") {
      // No CEO available → push stagnation alert to UI for human review
      this.ipcBridge.send({
        type: MSG.MLRA_ORCHESTRATION_STATUS,
        state: this.orchestrator.toJSON(),
        alert: {
          level: "warning",
          message: `停滞检测: ${event.count} 次相同提交，无CEO可仲裁，需人工介入`,
          stalledRoles: event.stalledRoles,
        },
      });
      return;
    }

    this._executeCeoDecision(decision);

    // Push state update
    this.ipcBridge.send({
      type: MSG.MLRA_ORCHESTRATION_STATUS,
      state: this.orchestrator.toJSON(),
    });
  }

  /**
   * Execute a CEO gate decision (from handleCeoVerdict or triggerPlanningGate).
   * Handles all possible action types returned by the orchestrator.
   */
  _executeCeoDecision(decision) {
    switch (decision.action) {
      case "wake_ceo": {
        // Release CEO's blocked register_LRA or ceo_verdict call
        this.router.release(decision.targetCallerId, decision.content);
        break;
      }

      case "auto_transition": {
        // No CEO present → transition directly to implementation
        console.error("[MLRA-Daemon] No CEO, auto-transitioning to implementation...");
        const result = this.orchestrator.transitionToImplementation(decision.materials);
        if (result.instructions) {
          for (const { callerId, instruction } of result.instructions) {
            this.router.release(callerId, instruction);
          }
        }
        this.ipcBridge.send({
          type: MSG.MLRA_ORCHESTRATION_STATUS,
          state: this.orchestrator.toJSON(),
        });
        break;
      }

      case "transition_to_implementation": {
        // CEO approved planning → transition to implementation phase
        console.error("[MLRA-Daemon] CEO approved, transitioning to implementation...");
        const result = this.orchestrator.transitionToImplementation(decision.materials);
        if (result.instructions) {
          for (const { callerId, instruction } of result.instructions) {
            this.router.release(callerId, instruction);
          }
        }
        this.ipcBridge.send({
          type: MSG.MLRA_ORCHESTRATION_STATUS,
          state: this.orchestrator.toJSON(),
        });
        break;
      }

      case "route_multiple": {
        // Release multiple agents (e.g., CEO rejected → send back to expert + inspector)
        for (const t of decision.targets) {
          this.router.release(t.targetCallerId, t.content);
        }
        break;
      }

      case "complete": {
        // Task is fully complete
        console.error("[MLRA-Daemon] Orchestration complete.");
        this.ipcBridge.send({
          type: MSG.MLRA_ORCHESTRATION_STATUS,
          state: this.orchestrator.toJSON(),
        });
        break;
      }

      case "arbitration_resolved": {
        console.error("[MLRA-Daemon] CEO arbitration resolved.");
        break;
      }

      case "noop":
        break;

      default:
        console.error(`[MLRA-Daemon] Unknown CEO decision action: ${decision.action}`);
    }
  }

  // ── Shutdown ──

  _shutdown() {
    console.error("[MLRA-Daemon] Shutting down...");
    this.router.cancelAll("Daemon shutting down");
    this.sessionManager.shutdown();
    this.ipcBridge.disconnect();
    if (this.server) this.server.close();
    try {
      unlinkSync(lockFilePath());
    } catch {}
    process.exit(0);
  }
}

// ── Entry Point ──

const daemon = new OrchestratorDaemon();
daemon.start().catch((err) => {
  console.error("[MLRA-Daemon] Fatal:", err.message);
  process.exit(1);
});
