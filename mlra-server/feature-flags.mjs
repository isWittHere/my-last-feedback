// ── MLRA Feature Flags ──
// Central switch board for features that can be enabled/disabled without code removal.
// Keep flipping a flag as the single-point change to activate/deactivate a subsystem.

/**
 * Worker sub-agent system.
 * When false:
 *   - Main agents (experts/inspectors/CEO) see no worker-related tools (order, check_orders,
 *     await_order_finish, submit_feedback are not registered on MCP server).
 *   - START_MODE_REQUIREMENTS.minWorkers is effectively 0 (main-agent-only orchestration).
 *   - Daemon handlers for worker messages return an error as a secondary safety net.
 *   - UI does not render the WorkerPoolColumn.
 *
 * All worker-related code (orchestrator.workerOrders, router.blockAwaitOrder,
 * daemon message handlers, UI components) is kept intact for future re-activation.
 */
export const WORKER_ENABLED = false;

/**
 * Reusable notice embedded into main-agent initial prompts when WORKER_ENABLED is false.
 * Explicitly forbids hallucinating delegation.
 */
export const NO_WORKER_NOTICE =
  "You must complete all execution work personally. No sub-agents or delegation are available in this session. Do not claim to have delegated tasks, dispatched workers, or assigned sub-work — any such statement is hallucination and will be rejected by reviewers.";
