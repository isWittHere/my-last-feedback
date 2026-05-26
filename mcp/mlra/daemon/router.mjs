// ── MLRA Message Router ──
// Manages blocking queues keyed by identity (v2: role). Pure logic +
// Promise management, no network I/O.
//
// v2 note: param name `callerId` is retained for API stability, but the
// key is conceptually a role name ("ceo" / "expert" / "inspector").

export class MessageRouter {
  constructor() {
    /**
     * Pending blocking callbacks keyed by identity.
     * @type {Map<string, { resolve: Function, reject: Function, type: string }>}
     */
    this.pending = new Map();

    /**
     * Message queue for identities not currently blocked. When release() is
     * called but the target has no pending callback, the message is queued
     * and delivered on the next block().
     * @type {Map<string, string[]>}
     */
    this.messageQueue = new Map();
  }

  /**
   * Block an agent. Returns a Promise that resolves when release() is called.
   * If there are queued messages, resolves immediately with the first queued message.
   * @param {string} callerId
  * @param {"hello"|"submit"|"certification"|"ceo_verdict"|"human_gate"|"worker_feedback"} type
   * @returns {Promise<string>}
   */
  block(callerId, type) {
    // Check message queue first — deliver immediately if pending
    const queue = this.messageQueue.get(callerId);
    if (queue && queue.length > 0) {
      const content = queue.shift();
      if (queue.length === 0) this.messageQueue.delete(callerId);
      return Promise.resolve(content);
    }

    return new Promise((resolve, reject) => {
      // If already blocked, reject the old one
      if (this.pending.has(callerId)) {
        const old = this.pending.get(callerId);
        old.reject(new Error("Superseded by new blocking call"));
      }
      this.pending.set(callerId, { resolve, reject, type });
    });
  }

  /**
   * Release a blocked agent with content.
   * If the agent is not currently blocked, queues the message for later delivery.
   * @param {string} callerId
   * @param {string} content
   * @returns {boolean} true if released immediately, false if queued
   */
  release(callerId, content) {
    const cb = this.pending.get(callerId);
    if (cb) {
      this.pending.delete(callerId);
      cb.resolve(content);
      return true;
    }
    // Agent not blocked — queue the message
    let queue = this.messageQueue.get(callerId);
    if (!queue) {
      queue = [];
      this.messageQueue.set(callerId, queue);
    }
    queue.push(content);
    console.error(`[Router] Queued message for ${callerId} (queue size: ${queue.length})`);
    return false;
  }

  /**
   * Reject a blocked agent with an error.
   * @param {string} callerId
   * @param {string} reason
   */
  reject(callerId, reason) {
    const cb = this.pending.get(callerId);
    if (!cb) return false;
    this.pending.delete(callerId);
    cb.reject(new Error(reason));
    return true;
  }

  /**
   * Check if an agent is currently blocked.
   */
  isBlocked(callerId) {
    return this.pending.has(callerId);
  }

  /**
   * Get the type of block for an agent.
   */
  getBlockType(callerId) {
    return this.pending.get(callerId)?.type || null;
  }

  /**
   * Cancel all pending callbacks (e.g. on shutdown).
   */
  cancelAll(reason = "Orchestration terminated") {
    for (const [, cb] of this.pending) {
      cb.reject(new Error(reason));
    }
    this.pending.clear();
    this.messageQueue.clear();
  }

  /**
   * Get count of blocked agents.
   */
  get blockedCount() {
    return this.pending.size;
  }
}
