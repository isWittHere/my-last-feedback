import { create } from "zustand";

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

/** Generate mock round history for UI development */
function generateMockRounds(): RoundRecord[] {
  const rounds: RoundRecord[] = [];
  let mainCursor = Date.now() - 12 * 60 * 1000; // started ~12 min ago

  // Main agent sequence (planning-expert, planning-inspector, ceo, execution-expert, execution-inspector)
  const mainSequence: string[] = ["planning-expert", "planning-inspector", "planning-expert", "ceo", "execution-expert", "execution-inspector", "ceo", "execution-expert"];
  // Workers run in parallel, overlapping with main agents
  const workerStartOffsets: { afterMainIdx: number; delayMs: number; durMs: number }[] = [
    { afterMainIdx: 0, delayMs: 5000, durMs: 40000 },
    { afterMainIdx: 1, delayMs: 3000, durMs: 25000 },
    { afterMainIdx: 3, delayMs: 2000, durMs: 55000 },
    { afterMainIdx: 5, delayMs: 8000, durMs: 30000 },
  ];

  const mainStarts: number[] = [];
  for (let i = 0; i < mainSequence.length; i++) {
    const dur = 20000 + Math.floor(Math.random() * 60000); // 20s-80s
    mainStarts.push(mainCursor);
    rounds.push({
      id: `mock-main-${i}`,
      role: mainSequence[i],
      startedAt: new Date(mainCursor).toISOString(),
      endedAt: new Date(mainCursor + dur).toISOString(),
    });
    mainCursor += dur; // no gap between main rounds — sequential
  }

  // Create parallel worker rounds
  for (let w = 0; w < workerStartOffsets.length; w++) {
    const cfg = workerStartOffsets[w];
    const wStart = mainStarts[cfg.afterMainIdx] + cfg.delayMs;
    rounds.push({
      id: `mock-worker-${w}`,
      role: "worker",
      startedAt: new Date(wStart).toISOString(),
      endedAt: new Date(wStart + cfg.durMs).toISOString(),
    });
  }

  return rounds;
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

  startOrchestration: (launcherId) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId || (l.status !== "configuring" && l.status !== "ready")) return l;

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
          roundHistory: generateMockRounds(),
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
    })),

  // ── View ──

  setPhaseView: (phase) => set({ phaseView: phase }),
  setColumnOrder: (order) => set({ columnOrder: order }),
  setLayoutMode: (mode) => set({ layoutMode: mode }),
  toggleLauncherSidebar: () => set((s) => ({ launcherSidebarOpen: !s.launcherSidebarOpen })),

  // ── Getters ──

  getActiveLauncher: () => {
    const { launchers, activeLauncherId } = get();
    return launchers.find((l) => l.id === activeLauncherId) || null;
  },
}));
