// ── MLRA Message Router ──
// Manages blocking queues for agent submit/register calls.
// Pure logic + Promise management, no network I/O.

export class MessageRouter {
  constructor() {
    /**
     * Pending blocking callbacks.
     * callerId → { resolve, reject, type }
     * @type {Map<string, { resolve: Function, reject: Function, type: string }>}
     */
    this.pending = new Map();

    /**
     * Await-order callbacks.
     * `${callerId}:${workerId}` → { resolve, reject }
     * @type {Map<string, { resolve: Function, reject: Function }>}
     */
    this.awaitCallbacks = new Map();
  }

  /**
   * Block an agent. Returns a Promise that resolves when release() is called.
   * @param {string} callerId
   * @param {"register"|"submit"|"worker_feedback"} type
   * @returns {Promise<string>}
   */
  block(callerId, type) {
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
   * @param {string} callerId
   * @param {string} content
   * @returns {boolean} true if released, false if not blocked
   */
  release(callerId, content) {
    const cb = this.pending.get(callerId);
    if (!cb) return false;
    this.pending.delete(callerId);
    cb.resolve(content);
    return true;
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
   * Block an expert waiting for a specific worker order.
   * @param {string} callerId - The expert's caller ID
   * @param {string} workerId - The worker to wait for
   * @returns {Promise<{ result: string, filesModified: string[] }>}
   */
  blockAwaitOrder(callerId, workerId) {
    const key = `${callerId}:${workerId}`;
    return new Promise((resolve, reject) => {
      this.awaitCallbacks.set(key, { resolve, reject });
    });
  }

  /**
   * Release an expert waiting for a worker order.
   * @param {string} callerId - The expert's caller ID
   * @param {string} workerId - The worker that completed
   * @param {{ result: string, filesModified: string[] }} data
   */
  releaseAwaitOrder(callerId, workerId, data) {
    const key = `${callerId}:${workerId}`;
    const cb = this.awaitCallbacks.get(key);
    if (!cb) return false;
    this.awaitCallbacks.delete(key);
    cb.resolve(data);
    return true;
  }

  /**
   * Cancel all pending callbacks (e.g. on shutdown).
   */
  cancelAll(reason = "Orchestration terminated") {
    for (const [, cb] of this.pending) {
      cb.reject(new Error(reason));
    }
    this.pending.clear();
    for (const [, cb] of this.awaitCallbacks) {
      cb.reject(new Error(reason));
    }
    this.awaitCallbacks.clear();
  }

  /**
   * Get count of blocked agents.
   */
  get blockedCount() {
    return this.pending.size;
  }
}
