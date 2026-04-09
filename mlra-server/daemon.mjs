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
import { MSG } from "./protocol.mjs";

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
        const response = await this._handleMcpMessage(msg, socket);
        if (response !== undefined) {
          socket.write(JSON.stringify(response) + "\n");
        }
        // Track connection after registration
        if (msg.type === MSG.AGENT_REGISTER && !callerId) {
          callerId = msg.callerId;
          this.connections.set(callerId, { socket, rl });
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
        const { callerId, alias, workspace } = msg;
        const result = this.orchestrator.registerAgent(callerId, alias, workspace);
        if (result.error) {
          return { type: MSG.ERROR, callerId, message: result.error };
        }

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
        const { callerId } = msg;
        const result = this.orchestrator.handleCheckOrders(callerId);
        return { type: MSG.ORDERS_STATUS, callerId, orders: result.orders };
      }

      case MSG.AGENT_AWAIT_ORDER: {
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

      default:
        return { type: MSG.ERROR, message: `Unknown message type: ${msg.type}` };
    }
  }

  /**
   * Route content to a target agent by releasing their blocked call.
   */
  _routeToAgent(targetCallerId, content) {
    const released = this.router.release(targetCallerId, content);
    if (!released) {
      console.error(`[MLRA-Daemon] Warning: target agent ${targetCallerId} is not blocked`);
      // The agent may not have called submit yet. Queue the message.
      // For now, log warning. TODO: implement message queue.
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
        }
        // Push updated status to Tauri
        this.ipcBridge.send({
          type: MSG.MLRA_ORCHESTRATION_STATUS,
          state: this.orchestrator.toJSON(),
        });
        break;
      }

      case MSG.MLRA_START_ORCHESTRATION: {
        const { userTask } = msg;
        const result = this.orchestrator.startOrchestration(userTask || "");
        if (result.error) {
          console.error("[MLRA-Daemon] Start error:", result.error);
          break;
        }
        // Release register_LRA blocks for planning agents
        for (const { callerId, instruction } of result.instructions) {
          this.router.release(callerId, instruction);
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
        this.ipcBridge.send({
          type: MSG.MLRA_ORCHESTRATION_STATUS,
          state: this.orchestrator.toJSON(),
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
      case "round_start":
      case "round_end":
        this.ipcBridge.send({
          type: MSG.MLRA_ROUND_EVENT,
          event: event.type === "round_start" ? "start" : "end",
          round: event.round,
        });
        break;
      case "votes_passed":
        // Trigger CEO gate (or auto-transition if no CEO)
        this._handleVotesPassed();
        break;
      case "stagnation_detected":
        console.error(`[MLRA-Daemon] Stagnation detected (${event.count} same feedbacks)`);
        // TODO: trigger CEO intervention
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

  _handleVotesPassed() {
    // Both planning agents voted pass → CEO gate or direct transition
    const ceoId = this.orchestrator._findAgentByRole("ceo");
    if (ceoId) {
      // TODO: Trigger CEO defensive rejection cycle
      console.error("[MLRA-Daemon] Votes passed, triggering CEO gate...");
    } else {
      // No CEO, auto-transition to implementation
      console.error("[MLRA-Daemon] Votes passed, no CEO, transitioning to implementation...");
      // TODO: Collect final plan document from last expert submit
      const result = this.orchestrator.transitionToImplementation("(规划书占位符)");
      if (result.instructions) {
        for (const { callerId, instruction } of result.instructions) {
          this.router.release(callerId, instruction);
        }
      }
    }
  }

  // ── Shutdown ──

  _shutdown() {
    console.error("[MLRA-Daemon] Shutting down...");
    this.router.cancelAll("Daemon shutting down");
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
