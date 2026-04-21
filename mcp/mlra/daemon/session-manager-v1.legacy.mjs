// ── MLRA Session Manager ──
// Unified management of session alive detection, fault recovery, and standby failover.
// Integrates TranscriptMonitorPool and BudgetTracker.

import { EventEmitter } from "node:events";
import { TranscriptMonitorPool } from "./transcript-monitor-v1.legacy.mjs";
import { BudgetTracker } from "./budget-tracker-v1.legacy.mjs";

/**
 * @typedef {"connected"|"derailed"|"broken"} SessionStatus
 */

/**
 * @typedef {Object} SessionEntry
 * @property {string} callerId
 * @property {string} sessionId
 * @property {string} alias
 * @property {string|null} transcriptDir
 * @property {SessionStatus} status
 * @property {string} registeredAt
 * @property {string} model
 */

/**
 * @typedef {Object} SessionPool
 * @property {string} role
 * @property {SessionEntry|null} primary
 * @property {SessionEntry[]} standbys
 * @property {number} retryCount
 * @property {number} maxRetries
 * @property {number} failoverCount
 */

const DEFAULT_MAX_RETRIES = 3;

export class SessionManager extends EventEmitter {
  /**
   * @param {object} opts
   * @param {number} [opts.budgetLimit=0] - Premium request budget limit (0 = unlimited)
   * @param {number} [opts.maxRetries=3] - Max retries before failover
   */
  constructor({ budgetLimit = 0, maxRetries = DEFAULT_MAX_RETRIES } = {}) {
    super();

    this.maxRetries = maxRetries;

    /** @type {Map<string, SessionPool>} role → SessionPool */
    this.pools = new Map();

    /** @type {Map<string, string>} callerId → role (reverse lookup) */
    this.callerRoles = new Map();

    /** @type {Map<string, SessionEntry>} callerId → SessionEntry (all registered entries) */
    this.entries = new Map();

    // Transcript monitoring
    this.transcriptPool = new TranscriptMonitorPool();
    this.transcriptPool.on("connected", (callerId, sessionId) => {
      this._handleConnected(callerId, sessionId);
    });
    this.transcriptPool.on("derailed", (callerId, sessionId, reason) => {
      this._handleDerailed(callerId, sessionId, reason);
    });

    // Budget tracking
    this.budget = new BudgetTracker(budgetLimit);
    this.budget.onEvent = (event) => this._handleBudgetEvent(event);

    // Hook session notifications — sessions that arrived via Hook TCP
    // but haven't been linked to a callerId yet
    /** @type {Map<string, { sessionId: string, agentName: string, transcriptDir: string, workspace: string }>} */
    this.pendingHookSessions = new Map();
  }

  // ── Hook Session Registration ──

  /**
   * Called when Hook TCP notification arrives (SessionStart).
   * The session may not have called register_LRA yet.
   */
  handleHookNotify(sessionId, agentName, transcriptDir, workspace) {
    console.error(`[SessionManager] Hook notify: session=${sessionId}, agent=${agentName}, dir=${transcriptDir}`);

    // Store for later linking when register_LRA arrives
    this.pendingHookSessions.set(sessionId, { sessionId, agentName, transcriptDir, workspace });

    // Start transcript monitoring immediately
    if (transcriptDir) {
      this.transcriptPool.addSession(sessionId, transcriptDir, null);
    }
  }

  // ── Agent Registration ──

  /**
   * Called when an agent calls register_LRA.
   * Links a callerId to a session and assigns to a role pool.
   */
  registerAgent(callerId, alias, model, workspace) {
    // Try to find matching Hook session by alias (agentName = alias for Hook-registered sessions)
    let matchedSession = null;
    for (const [sid, hookSession] of this.pendingHookSessions) {
      if (hookSession.agentName === alias) {
        matchedSession = hookSession;
        this.pendingHookSessions.delete(sid);
        break;
      }
    }

    const sessionId = matchedSession?.sessionId || null;
    const transcriptDir = matchedSession?.transcriptDir || null;

    // Link callerId to transcript monitor if we have a session
    if (sessionId && transcriptDir) {
      this.transcriptPool.linkCaller(callerId, sessionId);
    }

    const entry = {
      callerId,
      sessionId,
      alias,
      transcriptDir,
      status: "connected",
      registeredAt: new Date().toISOString(),
      model,
    };

    // Store in registry for later pool assignment
    this.entries.set(callerId, entry);

    this.emit("agent_registered", entry);
    return entry;
  }

  /**
   * Assign an agent to a role pool as primary or standby.
   */
  assignToPool(callerId, role, isPrimary = false) {
    const entry = this._findEntryByCallerId(callerId);
    if (!entry) {
      console.error(`[SessionManager] Cannot assign ${callerId} — not registered`);
      return;
    }

    let pool = this.pools.get(role);
    if (!pool) {
      pool = {
        role,
        primary: null,
        standbys: [],
        retryCount: 0,
        maxRetries: this.maxRetries,
        failoverCount: 0,
      };
      this.pools.set(role, pool);
    }

    this.callerRoles.set(callerId, role);

    if (isPrimary || !pool.primary) {
      // If there was already a primary, move it to standbys
      if (pool.primary && pool.primary.callerId !== callerId) {
        pool.standbys.push(pool.primary);
      }
      pool.primary = entry;
    } else {
      // Add as standby (avoid duplicates)
      if (!pool.standbys.some((s) => s.callerId === callerId)) {
        pool.standbys.push(entry);
      }
    }

    console.error(`[SessionManager] Assigned ${callerId} to ${role} as ${isPrimary ? "primary" : "standby"}`);
    this.emit("pool_updated", role, pool);
  }

  // ── TCP Disconnect Handling ──

  /**
   * Called by Daemon when MCP socket closes.
   */
  handleTcpDisconnect(callerId) {
    console.error(`[SessionManager] TCP disconnect: ${callerId}`);
    this._handleDerailed(callerId, null, "tcp_disconnect");
  }

  // ── Internal Event Handlers ──

  _handleConnected(callerId, sessionId) {
    const role = this.callerRoles.get(callerId);
    if (!role) return;

    const pool = this.pools.get(role);
    if (!pool) return;

    if (pool.primary?.callerId === callerId && pool.primary.status !== "connected") {
      pool.primary.status = "connected";
      pool.retryCount = 0;
      console.error(`[SessionManager] ${callerId} reconnected (${role})`);
      this.emit("session_recovered", callerId, role);
      this.emit("pool_updated", role, pool);
    }
  }

  _handleDerailed(callerId, sessionId, reason) {
    const role = this.callerRoles.get(callerId);
    if (!role) {
      console.error(`[SessionManager] Derailed for unknown caller ${callerId} — ignoring`);
      return;
    }

    const pool = this.pools.get(role);
    if (!pool) return;

    // Only handle derailment for the current primary
    if (pool.primary?.callerId !== callerId) {
      console.error(`[SessionManager] Derailed for non-primary ${callerId} in ${role} — ignoring`);
      return;
    }

    pool.primary.status = "derailed";
    pool.retryCount++;

    console.error(`[SessionManager] ${callerId} derailed (${role}), reason=${reason}, retry=${pool.retryCount}/${pool.maxRetries}`);

    this.emit("session_derailed", callerId, role, reason, pool.retryCount, pool.maxRetries);
    this.emit("pool_updated", role, pool);

    // Check if we should retry or failover
    if (pool.retryCount > pool.maxRetries) {
      this._attemptFailover(role, pool);
    } else {
      this._attemptRetry(role, pool, reason);
    }
  }

  _attemptRetry(role, pool, reason) {
    if (reason === "tcp_disconnect") {
      // TCP disconnect — session may be dead, can't re-inject
      console.error(`[SessionManager] TCP disconnect for ${role}, skipping retry, moving to failover`);
      this._attemptFailover(role, pool);
      return;
    }

    // turn_end derailment — session is still alive, try re-injection
    console.error(`[SessionManager] Attempting re-injection for ${role} (${pool.primary.callerId})`);

    // Record retry cost
    const costResult = this.budget.record({
      role,
      sessionAlias: pool.primary.alias,
      model: pool.primary.model,
      reason: "retry",
      details: `Retry re-injection for ${role} (attempt ${pool.retryCount})`,
    });

    if (!costResult.overBudget) {
      // Emit retry request — Daemon will handle actual re-injection
      this.emit("retry_requested", pool.primary.callerId, role, pool.retryCount);
    }
    // If overBudget, budget handler will pause the launcher
  }

  _attemptFailover(role, pool) {
    pool.primary.status = "broken";

    if (pool.standbys.length === 0) {
      console.error(`[SessionManager] No standbys for ${role} — marking broken`);
      this.emit("session_broken", pool.primary.callerId, role);
      this.emit("pool_updated", role, pool);
      return;
    }

    // Pop first standby as new primary
    const newPrimary = pool.standbys.shift();
    const oldPrimary = pool.primary;
    pool.primary = newPrimary;
    pool.primary.status = "connected"; // Optimistic — will be confirmed by transcript
    pool.retryCount = 0;
    pool.failoverCount++;

    console.error(`[SessionManager] Failover: ${role} ${oldPrimary.callerId} → ${newPrimary.callerId}`);

    // Record failover cost
    const costResult = this.budget.record({
      role,
      sessionAlias: newPrimary.alias,
      model: newPrimary.model,
      reason: "failover",
      details: `Failover from ${oldPrimary.alias} to ${newPrimary.alias} for ${role}`,
    });

    if (!costResult.overBudget) {
      // Emit failover request — Daemon will release the standby's register_LRA block
      this.emit("failover_requested", newPrimary.callerId, oldPrimary.callerId, role);
    }

    this.emit("pool_updated", role, pool);
  }

  _handleBudgetEvent(event) {
    // Forward budget events to listeners (Daemon → IPC → Tauri UI)
    this.emit("budget_event", event);

    if (event.type === "budget_exhausted") {
      console.error(`[SessionManager] Budget exhausted: ${event.consumed}/${event.limit}`);
      this.emit("budget_pause_requested");
    }
  }

  // ── Helpers ──

  _findEntryByCallerId(callerId) {
    // Check pools first (most common path)
    for (const pool of this.pools.values()) {
      if (pool.primary?.callerId === callerId) return pool.primary;
      const standby = pool.standbys.find((s) => s.callerId === callerId);
      if (standby) return standby;
    }
    // Check registry (registered but not yet in a pool)
    return this.entries.get(callerId) || null;
  }

  /**
   * Record initial registration cost for a primary agent.
   */
  recordInitialCost(callerId, role, model, alias) {
    this.budget.record({
      role,
      sessionAlias: alias,
      model,
      reason: "initial",
      details: `Initial registration for ${role} (${alias})`,
    });
  }

  // ── Getters ──

  getPool(role) {
    return this.pools.get(role) || null;
  }

  getAllPools() {
    return Object.fromEntries(this.pools);
  }

  getBudgetStatus() {
    return this.budget.toJSON();
  }

  setBudgetLimit(limit) {
    this.budget.setLimit(limit);
  }

  // ── Serialization ──

  toJSON() {
    const pools = {};
    for (const [role, pool] of this.pools) {
      pools[role] = {
        role: pool.role,
        primary: pool.primary ? { ...pool.primary } : null,
        standbys: pool.standbys.map((s) => ({ ...s })),
        retryCount: pool.retryCount,
        maxRetries: pool.maxRetries,
        failoverCount: pool.failoverCount,
      };
    }
    return {
      pools,
      budget: this.budget.toJSON(),
    };
  }

  // ── Cleanup ──

  shutdown() {
    this.transcriptPool.stopAll();
  }
}
