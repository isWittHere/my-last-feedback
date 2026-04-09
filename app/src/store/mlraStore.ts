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

  // Actions — Start orchestration
  startOrchestration: (launcherId: string) => void;

  // Actions — View
  setPhaseView: (phase: PhaseView) => void;
  setColumnOrder: (order: string[]) => void;
  setLayoutMode: (mode: "auto" | 1 | 2 | 3 | 4) => void;
  toggleLauncherSidebar: () => void;

  // Actions — Daemon communication (sends to MLRA daemon via Tauri IPC)
  sendToDaemon: (msg: Record<string, unknown>) => Promise<void>;
  daemonAssignRole: (launcherId: string, agentId: string, role: AgentRole | null) => void;
  daemonStartOrchestration: (launcherId: string, userTask: string) => void;
  daemonSetControlMode: (mode: ControlMode) => void;
  daemonReviewApproved: (content: string) => void;
  daemonReviewRejected: (reason: string) => void;
  daemonTerminate: () => void;

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

  // ── Start orchestration ──

  startOrchestration: (launcherId) => {
    const launcher = get().launchers.find((l) => l.id === launcherId);
    if (!launcher || (launcher.status !== "configuring" && launcher.status !== "ready")) return;

    // Notify daemon
    get().daemonStartOrchestration(launcherId, launcher.name);

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
          updatedAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          pausedAt: null,
          pausedElapsed: 0,
          roundHistory: [],
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

  daemonStartOrchestration: (launcherId, userTask) => {
    get().sendToDaemon({ type: "mlra_start_orchestration", launcherId, userTask });
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
          // Full state sync from daemon
          const launcher = get().getActiveLauncher();
          if (!launcher) break;
          set((s) => ({
            launchers: s.launchers.map((l) => {
              if (l.id !== launcher.id) return l;
              return {
                ...l,
                status: msg.status || l.status,
                currentPhase: msg.phase || l.currentPhase,
                controlMode: msg.controlMode || l.controlMode,
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          if (msg.phase) set({ phaseView: msg.phase });
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
