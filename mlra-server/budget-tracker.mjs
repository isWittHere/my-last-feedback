// ── MLRA Budget Tracker ──
// Tracks premium request consumption across all agents.
// Automatically pauses launcher when budget is exhausted.

/**
 * Default model multiplier table.
 * Source: VS Code Copilot debug-logs/models.json billing.multiplier
 */
const DEFAULT_MULTIPLIERS = {
  "claude-opus-4.6-fast": 30,
  "claude-opus-4.6": 3,
  "claude-sonnet-4": 1,
  "claude-sonnet-4-thinking": 1,
  "gpt-4.1": 1,
  "gpt-4o": 1,
  "gpt-5.4": 1,    // TBD — assume 1x until confirmed
  "o4-mini": 1,
  "gemini-2.5-pro": 1,
};

export class BudgetTracker {
  /**
   * @param {number} limit - Premium request budget limit (0 = unlimited)
   * @param {number} warningThreshold - Warning threshold (0-1, e.g. 0.8 = 80%)
   */
  constructor(limit = 0, warningThreshold = 0.8) {
    this.limit = limit;
    this.warningThreshold = warningThreshold;
    this.consumed = 0;
    /** @type {ConsumptionRecord[]} */
    this.records = [];
    /** @type {((event: object) => void)|null} */
    this.onEvent = null;
  }

  /**
   * Set budget limit.
   * @param {number} limit - 0 = unlimited
   */
  setLimit(limit) {
    this.limit = limit;
    this._emit({ type: "budget_limit_changed", limit, consumed: this.consumed });
  }

  /**
   * Record a consumption event.
   * @param {object} params
   * @param {string} params.role - Agent role
   * @param {string} params.sessionAlias - 4-char alias
   * @param {string} params.model - Model ID (e.g. "claude-opus-4.6")
   * @param {"initial"|"retry"|"failover"} params.reason - Why this cost occurred
   * @param {string} [params.details] - Human-readable description
   * @param {number} [params.multiplier] - Override multiplier (auto-detected from model if omitted)
   * @returns {{ consumed: number, limit: number, overBudget: boolean, warning: boolean }}
   */
  record({ role, sessionAlias, model, reason, details, multiplier }) {
    const mult = multiplier ?? this._getMultiplier(model);
    this.consumed += mult;

    const record = {
      timestamp: new Date().toISOString(),
      role,
      sessionAlias,
      model,
      multiplier: mult,
      reason,
      details: details || `${reason}: ${role} (${sessionAlias})`,
    };
    this.records.push(record);

    const status = {
      consumed: this.consumed,
      limit: this.limit,
      overBudget: this.limit > 0 && this.consumed >= this.limit,
      warning: this.isWarning(),
      record,
    };

    this._emit({ type: "budget_consumed", ...status });

    if (status.overBudget) {
      this._emit({ type: "budget_exhausted", consumed: this.consumed, limit: this.limit });
    } else if (status.warning) {
      this._emit({ type: "budget_warning", consumed: this.consumed, limit: this.limit });
    }

    return status;
  }

  /**
   * Check if we can proceed (under budget).
   */
  canProceed() {
    return this.limit === 0 || this.consumed < this.limit;
  }

  /**
   * Check if in warning zone.
   */
  isWarning() {
    return this.limit > 0 && this.consumed >= this.limit * this.warningThreshold;
  }

  /**
   * Remaining budget.
   */
  remaining() {
    return this.limit > 0 ? Math.max(0, this.limit - this.consumed) : Infinity;
  }

  /**
   * Get multiplier for a model.
   * @param {string} model
   * @returns {number}
   */
  _getMultiplier(model) {
    // Exact match
    if (DEFAULT_MULTIPLIERS[model] !== undefined) return DEFAULT_MULTIPLIERS[model];
    // Partial match (e.g. "claude-opus-4.6-fast-20250514" → "claude-opus-4.6-fast")
    for (const [key, mult] of Object.entries(DEFAULT_MULTIPLIERS)) {
      if (model.startsWith(key)) return mult;
    }
    // Unknown model — assume 1x
    return 1;
  }

  _emit(event) {
    if (this.onEvent) this.onEvent(event);
  }

  /**
   * Serialize for UI/persistence.
   */
  toJSON() {
    return {
      limit: this.limit,
      warningThreshold: this.warningThreshold,
      consumed: this.consumed,
      remaining: this.remaining(),
      canProceed: this.canProceed(),
      isWarning: this.isWarning(),
      records: this.records,
    };
  }

  /**
   * Restore from serialized state.
   */
  static fromJSON(json) {
    const tracker = new BudgetTracker(json.limit, json.warningThreshold);
    tracker.consumed = json.consumed || 0;
    tracker.records = json.records || [];
    return tracker;
  }
}
