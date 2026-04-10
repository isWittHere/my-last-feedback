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
     * Message queue for agents not currently blocked.
     * When release() is called but target has no pending callback,
     * messages are queued here and delivered on next block().
     * callerId → string[]
     * @type {Map<string, string[]>}
     */
    this.messageQueue = new Map();

    /**
     * Await-order callbacks.
     * `${callerId}:${workerId}` → { resolve, reject, timer }
     * @type {Map<string, { resolve: Function, reject: Function, timer: ReturnType<typeof setTimeout>|null }>}
     */
    this.awaitCallbacks = new Map();
  }

  /**
   * Block an agent. Returns a Promise that resolves when release() is called.
   * If there are queued messages, resolves immediately with the first queued message.
   * @param {string} callerId
   * @param {"register"|"submit"|"worker_feedback"|"ceo_verdict"} type
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
   * Block an expert waiting for a specific worker order.
   * @param {string} callerId - The expert's caller ID
   * @param {string} workerId - The worker to wait for
   * @param {number} timeoutMs - Timeout in ms (default 30 minutes)
   * @returns {Promise<{ result: string, filesModified: string[] }>}
   */
  blockAwaitOrder(callerId, workerId, timeoutMs = 30 * 60 * 1000) {
    const key = `${callerId}:${workerId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.awaitCallbacks.delete(key);
        reject(new Error(`Worker ${workerId} timed out after ${timeoutMs / 60000} minutes — treating as derailed`));
      }, timeoutMs);
      this.awaitCallbacks.set(key, { resolve, reject, timer });
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
    if (cb.timer) clearTimeout(cb.timer);
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
    this.messageQueue.clear();
    for (const [, cb] of this.awaitCallbacks) {
      if (cb.timer) clearTimeout(cb.timer);
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
