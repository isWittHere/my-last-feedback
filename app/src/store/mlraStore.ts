import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

// ── Agent Role Types ──

export type AgentRole =
  | "planning-expert"
  | "planning-inspector"
  | "execution-expert"
  | "execution-inspector"
  | "ceo"
  | "worker";
export type ControlMode = "autopilot" | "ceo-override" | "full-override";
export type LauncherStatus = "configuring" | "ready" | "running" | "paused" | "completed" | "cancelled";
export type AgentSlotStatus = "active" | "standby" | "idle";
export type WorkerStatus = "ready" | "working" | "broken";
export type PhaseView = "planning" | "implementation";
export type StartMode = "full" | "direct-execution";

// ── Session Pool Types ──

export interface SessionPoolEntry {
  callerId: string;
  alias: string;
  status: "connected" | "derailed" | "broken";
}

export interface SessionPool {
  role: string;
  primary: SessionPoolEntry | null;
  standbys: SessionPoolEntry[];
  retryCount: number;
  maxRetries: number;
  failoverCount: number;
}

export interface BudgetStatus {
  limit: number;
  consumed: number;
  remaining: number;
  warningThreshold: number;
  canProceed: boolean;
  isWarning: boolean;
  records: Array<{
    timestamp: string;
    multiplier: number;
    role: string;
    reason: string;
    details: string;
  }>;
}

export interface CeoGateStatus {
  active: boolean;
  type: "planning_gate" | "final_review" | "arbitration" | null;
  round: number;
  minDefensiveRounds: number;
  consecutiveApprovals: number;
  requiredConsecutive: number;
  history: Array<{ round: number; verdict: string; reason: string }>;
}

// ── Role Colors ──

export const ROLE_COLORS: Record<string, string> = {
  "planning-expert": "#06B6D4",
  "planning-inspector": "#06B6D4",
  "execution-expert": "#818CF8",
  "execution-inspector": "#818CF8",
  ceo: "#F59E0B",
  worker: "#64748B",
  workerPool: "#64748B",
};

// ── Registered Agent (before role assignment) ──

export interface RegisteredAgent {
  id: string;          // caller ID from MLFB
  alias: string;       // 4-char alias
  clientName: string;  // MCP client name
  model: string;       // detected model name
  workspace: string;   // project directory
  assignedRole: AgentRole | null;
  workerRole: string;  // custom routing role when assignedRole === "worker"
  registeredAt: string;
}

// ── Agent Slots (after orchestration starts) ──

export interface AgentSlot {
  id: string;
  role: string;          // AgentRole excluding "worker"
  displayName: string;
  model: string;
  status: AgentSlotStatus;
  color: string;
  activeSessionId: string | null;
  sessionIds: string[];
}

export interface WorkerSlot {
  id: string;
  role: string;          // e.g. "前端外包" / "后端外包"
  displayName: string;
  model: string;
  status: WorkerStatus;
  currentTask: string | null;
  taskHistory: string[];
  activeSessionId: string | null;
  sessionIds: string[];
}

// ── Launcher ──

export interface RoundRecord {
  id: string;
  role: string;
  startedAt: string;
  endedAt: string | null;
}

export interface Launcher {
  id: string;
  name: string;
  status: LauncherStatus;
  currentPhase: PhaseView;
  controlMode: ControlMode;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  pausedAt: string | null;
  pausedElapsed: number; // total ms spent in paused state

  // Registered agents (configuring phase)
  registeredAgents: RegisteredAgent[];

  // Agent slots (after orchestration starts)
  agents: {
    "planning-expert": AgentSlot | null;
    "planning-inspector": AgentSlot | null;
    "execution-expert": AgentSlot | null;
    "execution-inspector": AgentSlot | null;
    ceo: AgentSlot | null;
    workers: WorkerSlot[];
  };

  planningSessionIds: string[];
  implementationSessionIds: string[];
  roundHistory: RoundRecord[];

  // Session pools & budget
  sessionPools: Record<string, SessionPool>;
  budget: BudgetStatus | null;

  // Start mode & CEO gate
  startMode: StartMode | null;
  ceoGate: CeoGateStatus | null;

  // Task description & type
  taskType: string | null;
  userTask: string;
}

// ── Store ──

export interface MLRAState {
  // Launcher management
  launchers: Launcher[];
  activeLauncherId: string | null;
  launcherSidebarOpen: boolean;

  // View state
  phaseView: PhaseView;
  columnOrder: string[];
  layoutMode: "auto" | 1 | 2 | 3 | 4;

  // Actions — Launcher CRUD
  createLauncher: (name: string) => string;
  switchLauncher: (id: string) => void;
  setControlMode: (id: string, mode: ControlMode) => void;
  deleteLauncher: (id: string) => void;
  renameLauncher: (id: string, name: string) => void;

  // Actions — Agent registration & role assignment
  addRegisteredAgent: (launcherId: string, agent: RegisteredAgent) => void;
  assignRole: (launcherId: string, agentId: string, role: AgentRole | null, workerRole?: string) => void;
  removeRegisteredAgent: (launcherId: string, agentId: string) => void;
  setWorkerRole: (launcherId: string, agentId: string, workerRole: string) => void;
  setTaskType: (launcherId: string, taskType: string | null) => void;
  setUserTask: (launcherId: string, userTask: string) => void;

  // Actions — Start orchestration
  startOrchestration: (launcherId: string, startMode: StartMode) => void;

  // Actions — View
  setPhaseView: (phase: PhaseView) => void;
  setColumnOrder: (order: string[]) => void;
  setLayoutMode: (mode: "auto" | 1 | 2 | 3 | 4) => void;
  toggleLauncherSidebar: () => void;

  // Actions — Daemon communication (sends to MLRA daemon via Tauri IPC)
  sendToDaemon: (msg: Record<string, unknown>) => Promise<void>;
  daemonAssignRole: (launcherId: string, agentId: string, role: AgentRole | null) => void;
  daemonStartOrchestration: (launcherId: string, userTask: string, startMode: StartMode, taskType?: string) => void;
  daemonSetControlMode: (mode: ControlMode) => void;
  daemonReviewApproved: (content: string) => void;
  daemonReviewRejected: (reason: string) => void;
  daemonTerminate: () => void;
  daemonSetBudget: (limit: number) => void;
  daemonIncreaseBudget: (amount: number) => void;
  daemonInjectMessage: (callerId: string, content: string) => void;

  // Actions — Handle incoming MLRA daemon messages
  handleDaemonMessage: (raw: string) => void;

  // Getters
  getActiveLauncher: () => Launcher | null;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function createEmptyAgentSlot(role: Exclude<AgentRole, "worker">, agent: RegisteredAgent): AgentSlot {
  const roleNames: Record<string, string> = {
    "planning-expert": "规划专家",
    "planning-inspector": "规划监察",
    "execution-expert": "实施专家",
    "execution-inspector": "实施监察",
    ceo: "CEO",
  };
  return {
    id: agent.id,
    role: role as AgentSlot["role"],
    displayName: roleNames[role] || role,
    model: agent.model,
    status: role === "ceo" ? "standby" : "active",
    color: ROLE_COLORS[role] || "#64748B",
    activeSessionId: null,
    sessionIds: [],
  };
}

export const useMLRAStore = create<MLRAState>((set, get) => ({
  launchers: [],
  activeLauncherId: null,
  launcherSidebarOpen: false,

  phaseView: "planning",
  columnOrder: ["planning-expert", "planning-inspector", "execution-expert", "execution-inspector", "ceo", "workers"],
  layoutMode: "auto",

  // ── Launcher CRUD ──

  createLauncher: (name) => {
    const id = generateId();
    const launcher: Launcher = {
      id,
      name,
      status: "configuring",
      currentPhase: "planning",
      controlMode: "ceo-override",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      pausedAt: null,
      pausedElapsed: 0,
      registeredAgents: [],
      agents: { "planning-expert": null, "planning-inspector": null, "execution-expert": null, "execution-inspector": null, ceo: null, workers: [] },
      planningSessionIds: [],
      implementationSessionIds: [],
      roundHistory: [],
      sessionPools: {},
      budget: null,
      startMode: null,
      ceoGate: null,
      taskType: null,
      userTask: "",
    };
    set((s) => ({
      launchers: [...s.launchers, launcher],
      activeLauncherId: id,
    }));
    return id;
  },

  switchLauncher: (id) => set({ activeLauncherId: id }),

  setControlMode: (id, mode) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === id
          ? { ...l, controlMode: mode, updatedAt: new Date().toISOString() }
          : l
      ),
    })),

  deleteLauncher: (id) =>
    set((s) => ({
      launchers: s.launchers.filter((l) => l.id !== id),
      activeLauncherId: s.activeLauncherId === id ? null : s.activeLauncherId,
    })),

  renameLauncher: (id, name) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === id ? { ...l, name, updatedAt: new Date().toISOString() } : l
      ),
    })),

  // ── Agent registration ──

  addRegisteredAgent: (launcherId, agent) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === launcherId
          ? {
              ...l,
              registeredAgents: [...l.registeredAgents, agent],
              updatedAt: new Date().toISOString(),
            }
          : l
      ),
    })),

  assignRole: (launcherId, agentId, role, workerRole) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;
        // If role is already assigned to another agent, unassign it first
        const updatedAgents = l.registeredAgents.map((a) => {
          if (a.id === agentId) return { ...a, assignedRole: role, workerRole: role === "worker" ? (workerRole ?? a.workerRole) : "" };
          if (role && a.assignedRole === role && role !== "worker") {
            return { ...a, assignedRole: null };
          }
          return a;
        });
        return { ...l, registeredAgents: updatedAgents, updatedAt: new Date().toISOString() };
      }),
    })),

  removeRegisteredAgent: (launcherId, agentId) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === launcherId
          ? {
              ...l,
              registeredAgents: l.registeredAgents.filter((a) => a.id !== agentId),
              updatedAt: new Date().toISOString(),
            }
          : l
      ),
    })),

  setWorkerRole: (launcherId, agentId, workerRole) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === launcherId
          ? {
              ...l,
              registeredAgents: l.registeredAgents.map((a) =>
                a.id === agentId ? { ...a, workerRole } : a
              ),
              updatedAt: new Date().toISOString(),
            }
          : l
      ),
    })),

  setTaskType: (launcherId, taskType) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === launcherId ? { ...l, taskType, updatedAt: new Date().toISOString() } : l
      ),
    })),

  setUserTask: (launcherId, userTask) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === launcherId ? { ...l, userTask, updatedAt: new Date().toISOString() } : l
      ),
    })),

  // ── Start orchestration ──

  startOrchestration: (launcherId, startMode) => {
    const launcher = get().launchers.find((l) => l.id === launcherId);
    if (!launcher || (launcher.status !== "configuring" && launcher.status !== "ready")) return;

    // Notify daemon
    get().daemonStartOrchestration(launcherId, launcher.userTask || launcher.name, startMode, launcher.taskType || undefined);

    // Update local state
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;

        const planningExpert = l.registeredAgents.find((a) => a.assignedRole === "planning-expert");
        const planningInspector = l.registeredAgents.find((a) => a.assignedRole === "planning-inspector");
        const executionExpert = l.registeredAgents.find((a) => a.assignedRole === "execution-expert");
        const executionInspector = l.registeredAgents.find((a) => a.assignedRole === "execution-inspector");
        const ceoAgent = l.registeredAgents.find((a) => a.assignedRole === "ceo");
        const workerAgents = l.registeredAgents.filter((a) => a.assignedRole === "worker");

        return {
          ...l,
          status: "running" as const,
          startMode,
          updatedAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          pausedAt: null,
          pausedElapsed: 0,
          roundHistory: [],
          currentPhase: startMode === "direct-execution" ? "implementation" as const : "planning" as const,
          agents: {
            "planning-expert": planningExpert ? createEmptyAgentSlot("planning-expert", planningExpert) : null,
            "planning-inspector": planningInspector ? createEmptyAgentSlot("planning-inspector", planningInspector) : null,
            "execution-expert": executionExpert ? createEmptyAgentSlot("execution-expert", executionExpert) : null,
            "execution-inspector": executionInspector ? createEmptyAgentSlot("execution-inspector", executionInspector) : null,
            ceo: ceoAgent ? createEmptyAgentSlot("ceo", ceoAgent) : null,
            workers: workerAgents.map((a) => ({
              id: a.id,
              role: a.workerRole || "Worker",
              displayName: a.workerRole ? `${a.workerRole} (${a.alias})` : `Worker ${a.alias}`,
              model: a.model,
              status: "ready" as const,
              currentTask: null,
              taskHistory: [],
              activeSessionId: null,
              sessionIds: [],
            })),
          },
        };
      }),
    }));
  },

  // ── View ──

  setPhaseView: (phase) => set({ phaseView: phase }),
  setColumnOrder: (order) => set({ columnOrder: order }),
  setLayoutMode: (mode) => set({ layoutMode: mode }),
  toggleLauncherSidebar: () => set((s) => ({ launcherSidebarOpen: !s.launcherSidebarOpen })),

  // ── Daemon communication ──

  sendToDaemon: async (msg) => {
    try {
      await invoke("send_to_mlra_daemon", { message: JSON.stringify(msg) });
    } catch (e) {
      console.error("[MLRA] sendToDaemon failed:", e);
    }
  },

  daemonAssignRole: (launcherId, agentId, role) => {
    get().sendToDaemon({ type: "mlra_assign_role", launcherId, agentId, role });
  },

  daemonStartOrchestration: (launcherId, userTask, startMode, taskType) => {
    get().sendToDaemon({ type: "mlra_start_orchestration", launcherId, userTask, startMode, taskType: taskType || null });
  },

  daemonSetControlMode: (mode) => {
    get().sendToDaemon({ type: "mlra_set_control_mode", controlMode: mode });
  },

  daemonReviewApproved: (content) => {
    get().sendToDaemon({ type: "mlra_review_approved", content });
  },

  daemonReviewRejected: (reason) => {
    get().sendToDaemon({ type: "mlra_review_rejected", reason });
  },

  daemonTerminate: () => {
    get().sendToDaemon({ type: "mlra_terminate" });
  },

  daemonSetBudget: (limit) => {
    get().sendToDaemon({ type: "mlra_set_budget", limit });
  },

  daemonIncreaseBudget: (amount) => {
    get().sendToDaemon({ type: "mlra_increase_budget", amount });
  },

  daemonInjectMessage: (callerId, content) => {
    get().sendToDaemon({ type: "mlra_inject_message", callerId, content });
  },

  // ── Handle incoming daemon messages ──

  handleDaemonMessage: (raw) => {
    try {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case "mlra_agent_registered": {
          // A new agent registered on the daemon — update registeredAgents
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          const existing = launcher.registeredAgents.find((a) => a.id === msg.callerId);
          if (existing) break;
          get().addRegisteredAgent(launcher.id, {
            id: msg.callerId,
            alias: msg.alias || "",
            clientName: msg.clientName || "",
            model: msg.model || "",
            workspace: msg.workspace || "",
            assignedRole: null,
            workerRole: "",
            registeredAt: new Date().toISOString(),
          });
          break;
        }
        case "mlra_orchestration_status": {
          // Full state sync from daemon — data is nested under msg.state
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          const state = msg.state || msg; // Support both nested and flat
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              return {
                ...l,
                status: state.status || l.status,
                currentPhase: state.phase || l.currentPhase,
                controlMode: state.controlMode || l.controlMode,
                startMode: state.startMode || l.startMode,
                ceoGate: state.ceoGate || l.ceoGate,
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          if (state.phase) set({ phaseView: state.phase });
          break;
        }
        case "mlra_round_event": {
          // Round start/end events — update roundHistory for timer stats
          const launcher = get().getActiveLauncher();
          if (!launcher || !msg.round) break;
          const round = msg.round as { id: string; role: string; startedAt: string; endedAt: string | null };
          if (msg.event === "start") {
            set((s) => ({
              launchers: s.launchers.map((l) => {
                if (l.id !== launcher.id) return l;
                // Add new round (avoid duplicates)
                const exists = l.roundHistory.some((r) => r.id === round.id);
                if (exists) return l;
                return {
                  ...l,
                  roundHistory: [...l.roundHistory, { id: round.id, role: round.role, startedAt: round.startedAt, endedAt: null }],
                };
              }),
            }));
          } else if (msg.event === "end") {
            set((s) => ({
              launchers: s.launchers.map((l) => {
                if (l.id !== launcher.id) return l;
                return {
                  ...l,
                  roundHistory: l.roundHistory.map((r) =>
                    r.id === round.id ? { ...r, endedAt: round.endedAt || new Date().toISOString() } : r
                  ),
                };
              }),
            }));
          }
          break;
        }
        case "mlra_human_review": {
          // Daemon requests human review — could trigger UI notification
          console.log("[MLRA] Human review requested:", msg.content);
          break;
        }
        case "mlra_session_derailed": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          console.warn(`[MLRA] Session derailed: ${msg.callerId} (${msg.role}), reason=${msg.reason}, retry=${msg.retryCount}/${msg.maxRetries}`);
          // Agent slot status update is handled via orchestration_status sync
          break;
        }
        case "mlra_session_recovered": {
          console.log(`[MLRA] Session recovered: ${msg.callerId} (${msg.role})`);
          break;
        }
        case "mlra_session_failover": {
          console.warn(`[MLRA] Failover: ${msg.role} ${msg.oldCallerId} → ${msg.newCallerId}`);
          break;
        }
        case "mlra_session_broken": {
          console.error(`[MLRA] Session broken (no standbys): ${msg.callerId} (${msg.role})`);
          break;
        }
        case "mlra_session_pool_update": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          const pool = msg.pool as SessionPool;
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              return {
                ...l,
                sessionPools: { ...l.sessionPools, [pool.role]: pool },
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          break;
        }
        case "mlra_budget_update": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              return {
                ...l,
                budget: msg.budget as BudgetStatus,
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          break;
        }
        case "mlra_budget_pause": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              return {
                ...l,
                status: "paused" as const,
                budget: msg.budget as BudgetStatus,
                pausedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          break;
        }
        case "mlra_ceo_gate_status": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              return {
                ...l,
                ceoGate: msg.ceoGate as CeoGateStatus,
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          break;
        }
        case "mlra_phase_change": {
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              return {
                ...l,
                currentPhase: msg.to as PhaseView,
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          set({ phaseView: msg.to as PhaseView });
          break;
        }
        default:
          console.log("[MLRA] Unhandled daemon message:", msg.type);
      }
    } catch (e) {
      console.error("[MLRA] Failed to parse daemon message:", e);
    }
  },

  // ── Getters ──

  getActiveLauncher: () => {
    const { launchers, activeLauncherId } = get();
    return launchers.find((l) => l.id === activeLauncherId) || null;
  },
}));
