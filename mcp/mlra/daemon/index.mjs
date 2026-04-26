// ── MLRA Orchestrator Daemon ──
// Central process that manages all orchestration state.
//
// Protocol (see ../protocol/messages.mjs):
//   - MCP server → daemon: ROLE_HELLO / ROLE_BYE / EXPERT_SUBMIT / EXPERT_VOTE
//                          / INSPECTOR_SUBMIT / INSPECTOR_VOTE / CEO_VERDICT
//                          / GET_TASK_CONTEXT
//   - App UI → daemon:     MLRA_START / MLRA_CANCEL / MLRA_STATUS
//   - Daemon → MCP server: RESOLVE / ERROR
//   - Daemon → App UI:     MLRA_ROLE_CONNECTED / MLRA_STAGE_CHANGE / ...
//
// Connections are keyed by ROLE (ceo/expert/inspector). At most 1 connection
// per role at any time.

import { createServer } from "node:net";
import { createInterface } from "node:readline";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Orchestrator } from "./orchestrator.mjs";
import { MessageRouter } from "./router.mjs";
import { IpcBridge } from "./ipc-bridge.mjs";
import { MSG } from "../protocol/messages.mjs";
import { ROLES } from "../protocol/roles.mjs";

// ── Port config (ports 19871-19880 prod / 19881-19890 dev) ──

const IS_DEV = process.env.MLRA_DEV === "1";
const PORT_START = IS_DEV ? 19881 : 19871;
const PORT_END = IS_DEV ? 19890 : 19880;

function lockFilePath() {
  return join(
    tmpdir(),
    IS_DEV ? "my-long-running-agent-dev.port" : "my-long-running-agent.port",
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
     * Active MCP server connections — keyed by role.
     * @type {Map<import("../protocol/roles.mjs").ROLES[keyof ROLES], { socket: import("net").Socket, rl: import("readline").Interface }>}
     */
    this.connections = new Map();

    // Wire orchestrator events to IPC bridge
    this.orchestrator.onEvent = (event) => this._handleOrchestratorEvent(event);
  }

  async start() {
    this.server = await this._bindServer();
    console.error(`[MLRA-Daemon] v2 listening on port ${this.port}`);

    writeFileSync(lockFilePath(), String(this.port));
    console.error(`[MLRA-Daemon] Lock file written: ${lockFilePath()}`);

    // Non-blocking Tauri IPC connect (retries internally)
    this._connectToTauri();
    this.ipcBridge.onMessage = (msg) => this._handleTauriMessage(msg);

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
      console.error("[MLRA-Daemon] Tauri app not running, will retry in 5s...");
      setTimeout(() => this._connectToTauri(), 5000);
    }
  }

  // ── MCP Server Connection Handling ──

  _handleMcpConnection(socket) {
    console.error("[MLRA-Daemon] New MCP server connection");
    const rl = createInterface({ input: socket });

    /** @type {string|null} */
    let connRole = null;

    rl.on("line", async (line) => {
      try {
        const msg = JSON.parse(line.trim());

        // Track role binding on first ROLE_HELLO
        if (msg.type === MSG.ROLE_HELLO && !connRole && msg.role) {
          // Reject duplicate role connections
          if (this.connections.has(msg.role)) {
            socket.write(JSON.stringify({ type: MSG.ERROR, reqId: msg.reqId, message: `Role already connected: ${msg.role}` }) + "\n");
            return;
          }
          connRole = msg.role;
          this.connections.set(connRole, { socket, rl });
        }

        const response = await this._handleMcpMessage(msg, connRole);
        if (response !== undefined) {
          if (msg.reqId && !response.reqId) response.reqId = msg.reqId;
          socket.write(JSON.stringify(response) + "\n");
        }
      } catch (e) {
        console.error("[MLRA-Daemon] Error handling MCP message:", e.message);
        try {
          socket.write(JSON.stringify({ type: MSG.ERROR, message: e.message }) + "\n");
        } catch {}
      }
    });

    socket.on("close", () => {
      console.error("[MLRA-Daemon] MCP server disconnected:", connRole || "unknown");
      if (connRole) {
        this.connections.delete(connRole);
        this.router.reject(connRole, "Role disconnected");
        if (this.orchestrator.humanGate?.active && this.orchestrator.humanGate.blockedRoles?.includes(connRole)) {
          this.orchestrator._clearHumanGate(this.orchestrator.humanGate.id);
        }
        if (this.orchestrator.stageExitPending?.[connRole]?.blocked) {
          this.orchestrator._clearStageExitCertifications();
          this.orchestrator._resetStageExitPending();
        }
        this.orchestrator.unregisterRole(connRole);
        this.ipcBridge.send({ type: MSG.MLRA_ROLE_DISCONNECTED, role: connRole });
      }
    });

    socket.on("error", (err) => {
      console.error("[MLRA-Daemon] MCP socket error:", err.message);
    });
  }

  /**
   * Handle a message from an MCP Server process.
   * Blocking calls (hello, submit, verdict) resolve later via the router.
   */
  async _handleMcpMessage(msg, connRole) {
    switch (msg.type) {
      // ── ROLE_HELLO ──
      case MSG.ROLE_HELLO: {
        const { role, workspace, model, clientName } = msg;
        const result = this.orchestrator.registerRole(role, { workspace, model, clientName });
        if (result.error) return { type: MSG.ERROR, message: result.error };

        this.ipcBridge.send({
          type: MSG.MLRA_ROLE_CONNECTED,
          role,
          workspace: workspace || null,
          model: model || "unknown",
          clientName: clientName || "unknown",
        });

        console.error(`[MLRA-Daemon] Role connected: ${role}, blocking until workflow start...`);
        try {
          const instruction = await this.router.block(role, "hello");
          return { type: MSG.RESOLVE, content: instruction };
        } catch (e) {
          return { type: MSG.ERROR, message: e.message };
        }
      }

      case MSG.ROLE_BYE: {
        return { type: MSG.RESOLVE, content: "bye" };
      }

      // ── EXPERT_SUBMIT ──
      case MSG.EXPERT_SUBMIT: {
        const { content } = msg;
        console.error(`[MLRA-Daemon] expert_submit`);
        const decision = this.orchestrator.handleExpertSubmit(content);
        return await this._followDecision(decision, ROLES.EXPERT);
      }

      // ── INSPECTOR_SUBMIT ──
      case MSG.INSPECTOR_SUBMIT: {
        const { content } = msg;
        console.error(`[MLRA-Daemon] inspector_submit`);
        const decision = this.orchestrator.handleInspectorSubmit(content, {});
        return await this._followDecision(decision, ROLES.INSPECTOR);
      }

      // ── EXPERT_VOTE ──
      case MSG.EXPERT_VOTE: {
        const { vote, reason, certification } = msg;
        const decision = this.orchestrator.handleExpertVote(vote, reason, certification);
        return await this._followCertificationDecision(decision, ROLES.EXPERT);
      }

      // ── INSPECTOR_VOTE ──
      case MSG.INSPECTOR_VOTE: {
        const { vote, reason, certification } = msg;
        const decision = this.orchestrator.handleInspectorVote(vote, reason, certification);
        return await this._followCertificationDecision(decision, ROLES.INSPECTOR);
      }

      // ── CEO_VERDICT ──
      case MSG.CEO_VERDICT: {
        const { verdict, reason, targets } = msg;
        console.error(`[MLRA-Daemon] ceo_verdict: ${verdict}`);
        const decision = this.orchestrator.handleCeoVerdict(verdict, reason, targets || []);
        if (decision.error) return { type: MSG.ERROR, message: decision.error };

        if (decision.action === "human_gate") {
          this._pushStatus();
          try {
            const nextMaterials = await this.router.block(ROLES.CEO, "ceo_verdict");
            return { type: MSG.RESOLVE, content: nextMaterials };
          } catch (e) {
            return { type: MSG.ERROR, message: e.message };
          }
        }

        this._executeCeoDecision(decision);

        this.ipcBridge.send({
          type: MSG.MLRA_GATE_STATUS,
          ceoGate: this.orchestrator.ceoGate,
        });
        this._pushStatus();

        if (decision.action === "complete") {
          return { type: MSG.RESOLVE, content: "编排已完成。" };
        }

        // CEO goes back to sleep
        try {
          const nextMaterials = await this.router.block(ROLES.CEO, "ceo_verdict");
          return { type: MSG.RESOLVE, content: nextMaterials };
        } catch (e) {
          return { type: MSG.ERROR, message: e.message };
        }
      }

      // ── GET_TASK_CONTEXT ──
      case MSG.GET_TASK_CONTEXT: {
        if (!connRole || !this.orchestrator.roles.has(connRole)) {
          return { type: MSG.ERROR, message: "Role not connected" };
        }
        const stage = this.orchestrator._getCurrentStage();
        const taskContext = [
          `## 原始用户请求\n\n${this.orchestrator.userTask || "(未设置)"}`,
          `## 任务类型\n\n${this.orchestrator.taskType || "未指定"}`,
          `## 当前阶段\n\n${stage?.name || "未指定"}${stage?.isClosing ? " (closing)" : ""}`,
          `## 本阶段提交次数\n\n${this.orchestrator.submitCount}`,
          `## 工作流蓝图\n\n${this.orchestrator.blueprint?.name || "未指定"}`,
        ].join("\n\n");
        return { type: MSG.RESOLVE, content: taskContext };
      }

      default:
        // Admin / IPC passthrough from test scripts (mlra_* prefix)
        if (typeof msg.type === "string" && msg.type.startsWith("mlra_")) {
          this._handleTauriMessage(msg);
          return undefined;
        }
        return { type: MSG.ERROR, message: `Unknown message type: ${msg.type}` };
    }
  }

  /**
   * Follow an orchestrator routing decision: route/wake/route_multiple, then
   * block the submitter until their next instruction arrives.
   *
   * @param {object} decision
   * @param {string} submitterRole
   */
  async _followDecision(decision, submitterRole) {
    if (decision.error) return { type: MSG.ERROR, message: decision.error };

    if (decision.action === "human_gate") {
      this._pushStatus();
      try {
        const instruction = await this.router.block(submitterRole, "human_gate");
        return { type: MSG.RESOLVE, content: instruction };
      } catch (e) {
        return { type: MSG.ERROR, message: e.message };
      }
    }

    if (decision.action === "route") {
      this._routeTo(decision.targetRole, decision.content);
      return await this._blockForNext(submitterRole);
    }

    if (decision.action === "wake_ceo") {
      this._routeTo(ROLES.CEO, decision.content);
      return await this._blockForNext(submitterRole);
    }

    if (decision.action === "route_multiple") {
      for (const t of decision.targets) {
        this._routeTo(t.targetRole, t.content);
      }
      return await this._blockForNext(submitterRole);
    }

    if (decision.action === "complete") {
      this._pushStatus();
      return { type: MSG.RESOLVE, content: "任务完成。" };
    }

    return { type: MSG.ERROR, message: `Unknown decision: ${decision.action}` };
  }

  async _followCertificationDecision(decision, role) {
    if (decision.error) return { type: MSG.ERROR, message: decision.error };

    if (decision.action === "certification_recorded") {
      this._routeTo(decision.targetRole, decision.content);
      this._pushStatus();
      try {
        const instruction = await this.router.block(role, "certification");
        return { type: MSG.RESOLVE, content: instruction };
      } catch (e) {
        return { type: MSG.ERROR, message: e.message };
      }
    }

    if (decision.action === "stage_exit_ready") {
      const stageDecision = this.orchestrator.triggerStageExit(decision.materials);
      console.error(`[MLRA-Daemon] Stage exit ready → ${stageDecision.action}`);
      this._executeCeoDecision(stageDecision);
      this._pushStatus();
      try {
        const instruction = await this.router.block(role, "certification");
        return { type: MSG.RESOLVE, content: instruction };
      } catch (e) {
        return { type: MSG.ERROR, message: e.message };
      }
    }

    return { type: MSG.RESOLVE, content: JSON.stringify(decision) };
  }

  async _blockForNext(role) {
    try {
      const instruction = await this.router.block(role, "submit");
      return { type: MSG.RESOLVE, content: instruction };
    } catch (e) {
      return { type: MSG.ERROR, message: e.message };
    }
  }

  _routeTo(targetRole, content) {
    const released = this.router.release(targetRole, content);
    if (!released) {
      console.error(`[MLRA-Daemon] Queued message for role=${targetRole} (not currently blocked)`);
    }
  }

  // ── Tauri IPC Message Handling ──

  _handleTauriMessage(msg) {
    console.error("[MLRA-Daemon] Tauri message:", msg.type);

    switch (msg.type) {
      case MSG.MLRA_START: {
        const { userTask, taskType, blueprint, orchestrationPolicy } = msg.config || msg;
        const result = this.orchestrator.startOrchestration(
          userTask || "",
          blueprint || null,
          taskType || null,
          orchestrationPolicy || null,
        );
        if (result.error) {
          console.error("[MLRA-Daemon] Start error:", result.error);
          this.ipcBridge.send({ type: MSG.ERROR, message: result.error });
          break;
        }
        for (const { role, instruction } of result.instructions) {
          this.router.release(role, instruction);
        }
        this._pushStatus();
        break;
      }

      case MSG.MLRA_CANCEL: {
        this.orchestrator.cancelOrchestration("Orchestration cancelled by user");
        this.router.cancelAll("Orchestration cancelled by user");
        this._pushStatus();
        break;
      }

      case MSG.MLRA_STATUS: {
        this._pushStatus();
        break;
      }

      case MSG.MLRA_HUMAN_GATE_APPROVE: {
        const result = this.orchestrator.approveHumanGate(msg);
        if (result.error) { console.error(result.error); break; }
        this._executeCeoDecision(result);
        if (result.action === "complete" && this.router.isBlocked(ROLES.CEO)) {
          this.router.release(ROLES.CEO, "编排已完成。");
        }
        this._pushStatus();
        break;
      }

      case MSG.MLRA_HUMAN_GATE_REJECT: {
        const result = this.orchestrator.rejectHumanGate(msg);
        if (result.error) { console.error(result.error); break; }
        this._executeCeoDecision(result);
        this._pushStatus();
        break;
      }

      case MSG.MLRA_HUMAN_GATE_CANCEL: {
        const result = this.orchestrator.cancelHumanGate(msg);
        if (result.error) { console.error(result.error); break; }
        this._executeCeoDecision(result);
        this._pushStatus();
        break;
      }

      case "mlra_set_control_mode": {
        this.orchestrator.setControlMode(msg.mode);
        this._pushStatus();
        break;
      }

      case MSG.MLRA_SET_ORCHESTRATION_POLICY: {
        this.orchestrator.setOrchestrationPolicy(msg.policy || {});
        this._pushStatus();
        break;
      }

      default:
        console.error(`[MLRA-Daemon] Unhandled Tauri message: ${msg.type}`);
    }
  }

  // ── Orchestrator Event Forwarding ──

  _handleOrchestratorEvent(event) {
    switch (event.type) {
      case "status_change":
        this._pushStatus();
        break;
      case "role_connected":
      case "role_disconnected":
        this._pushStatus();
        break;
      case "role_status_change":
        this._pushStatus();
        break;
      case "round_start":
        this.ipcBridge.send({ type: "mlra_round_event", event: "start", round: event.round });
        break;
      case "round_end":
        this.ipcBridge.send({ type: "mlra_round_event", event: "end", round: event.round });
        break;
      case "human_gate_update":
        this.ipcBridge.send({ type: MSG.MLRA_HUMAN_GATE_UPDATE, humanGate: event.humanGate || null });
        this._pushStatus();
        break;
      case "stage_exit_pending_update":
        this._pushStatus();
        break;
      case "orchestration_policy_change":
      case "control_mode_change":
        this._pushStatus();
        break;
      case "stagnation_detected":
        this._handleStagnation(event);
        break;
      case "stage_transition":
        this.ipcBridge.send({
          type: MSG.MLRA_STAGE_CHANGE,
          stageFrom: event.from,
          stageTo: event.to,
        });
        break;
      case "ceo_gate_defensive":
      case "ceo_gate_consecutive":
      case "ceo_gate_resolved":
        this.ipcBridge.send({ type: MSG.MLRA_GATE_STATUS, event: event.type, ...event });
        break;
    }
  }

  _handleStagnation(event) {
    const decision = this.orchestrator.triggerStagnationArbitration(event);
    console.error(`[MLRA-Daemon] Stagnation arbitration → ${decision.action}`);
    if (decision.action === "noop" && decision.reason === "no_ceo_for_arbitration") {
      this.ipcBridge.send({
        type: MSG.MLRA_WORKFLOW_PAUSED,
        reason: "stagnation_no_ceo",
        stalledRoles: event.stalledRoles,
        count: event.count,
      });
      return;
    }
    this._executeCeoDecision(decision);
    this._pushStatus();
  }

  _executeCeoDecision(decision) {
    switch (decision.action) {
      case "wake_ceo":
        this._routeTo(ROLES.CEO, decision.content);
        break;

      case "transition_to_stage": {
        console.error("[MLRA-Daemon] Advancing to next stage");
        const result = this.orchestrator.transitionToStage(decision.stage, decision.materials);
        for (const { role, instruction } of result.instructions || []) {
          this.router.release(role, instruction);
        }
        this._pushStatus();
        break;
      }

      case "route_multiple":
        for (const t of decision.targets) {
          this._routeTo(t.targetRole, t.content);
        }
        break;

      case "route":
        this._routeTo(decision.targetRole, decision.content);
        break;

      case "human_gate":
        this._pushStatus();
        break;

      case "complete":
        console.error("[MLRA-Daemon] Orchestration complete");
        this.ipcBridge.send({ type: MSG.MLRA_WORKFLOW_COMPLETE });
        this._pushStatus();
        break;

      case "arbitration_resolved":
        console.error("[MLRA-Daemon] Arbitration resolved");
        break;

      case "noop":
        break;

      default:
        console.error(`[MLRA-Daemon] Unknown CEO decision action: ${decision.action}`);
    }
  }

  _pushStatus() {
    this.ipcBridge.send({
      type: "mlra_orchestration_status",
      state: this.orchestrator.toJSON(),
    });
  }

  // ── Shutdown ──

  _shutdown() {
    console.error("[MLRA-Daemon] Shutting down...");
    this.router.cancelAll("Daemon shutting down");
    this.ipcBridge.disconnect();
    if (this.server) this.server.close();
    try { unlinkSync(lockFilePath()); } catch {}
    process.exit(0);
  }
}

// ── Entry Point ──

const daemon = new OrchestratorDaemon();
daemon.start().catch((err) => {
  console.error("[MLRA-Daemon] Fatal:", err.message);
  process.exit(1);
});
