import { create } from "zustand";

// ── Agent Role Types ──

export type AgentRole = "expert" | "inspector" | "ceo" | "worker";
export type LauncherStatus = "configuring" | "running" | "paused" | "completed" | "cancelled";
export type AgentSlotStatus = "active" | "standby" | "idle";
export type WorkerStatus = "ready" | "working" | "broken";
export type PhaseView = "planning" | "implementation";

// ── Role Colors ──

export const ROLE_COLORS: Record<AgentRole | "workerPool", string> = {
  expert: "#3B82F6",
  inspector: "#F59E0B",
  ceo: "#8B5CF6",
  worker: "#06B6D4",
  workerPool: "#06B6D4",
};

// ── Registered Agent (before role assignment) ──

export interface RegisteredAgent {
  id: string;          // caller ID from MLFB
  alias: string;       // 4-char alias
  clientName: string;  // MCP client name
  model: string;       // detected model name
  workspace: string;   // project directory
  assignedRole: AgentRole | null;
  registeredAt: string;
}

// ── Agent Slots (after orchestration starts) ──

export interface AgentSlot {
  id: string;
  role: "expert" | "inspector" | "ceo";
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

export interface Launcher {
  id: string;
  name: string;
  status: LauncherStatus;
  currentPhase: PhaseView;
  createdAt: string;
  updatedAt: string;

  // Registered agents (configuring phase)
  registeredAgents: RegisteredAgent[];

  // Agent slots (after orchestration starts)
  agents: {
    expert: AgentSlot | null;
    inspector: AgentSlot | null;
    ceo: AgentSlot | null;
    workers: WorkerSlot[];
  };

  planningSessionIds: string[];
  implementationSessionIds: string[];
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
  pauseLauncher: (id: string) => void;
  resumeLauncher: (id: string) => void;
  deleteLauncher: (id: string) => void;
  renameLauncher: (id: string, name: string) => void;

  // Actions — Agent registration & role assignment
  addRegisteredAgent: (launcherId: string, agent: RegisteredAgent) => void;
  assignRole: (launcherId: string, agentId: string, role: AgentRole | null) => void;
  removeRegisteredAgent: (launcherId: string, agentId: string) => void;

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

function createEmptyAgentSlot(role: "expert" | "inspector" | "ceo", agent: RegisteredAgent): AgentSlot {
  const roleNames: Record<string, string> = {
    expert: "专家",
    inspector: "监察",
    ceo: "CEO",
  };
  return {
    id: agent.id,
    role,
    displayName: roleNames[role],
    model: agent.model,
    status: role === "ceo" ? "standby" : "active",
    color: ROLE_COLORS[role],
    activeSessionId: null,
    sessionIds: [],
  };
}

export const useMLRAStore = create<MLRAState>((set, get) => ({
  launchers: [],
  activeLauncherId: null,
  launcherSidebarOpen: false,

  phaseView: "planning",
  columnOrder: ["expert", "inspector", "ceo", "workers"],
  layoutMode: "auto",

  // ── Launcher CRUD ──

  createLauncher: (name) => {
    const id = generateId();
    const launcher: Launcher = {
      id,
      name,
      status: "configuring",
      currentPhase: "planning",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      registeredAgents: [],
      agents: { expert: null, inspector: null, ceo: null, workers: [] },
      planningSessionIds: [],
      implementationSessionIds: [],
    };
    set((s) => ({
      launchers: [...s.launchers, launcher],
      activeLauncherId: id,
    }));
    return id;
  },

  switchLauncher: (id) => set({ activeLauncherId: id }),

  pauseLauncher: (id) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === id ? { ...l, status: "paused" as const, updatedAt: new Date().toISOString() } : l
      ),
    })),

  resumeLauncher: (id) =>
    set((s) => ({
      launchers: s.launchers.map((l) =>
        l.id === id && l.status === "paused"
          ? { ...l, status: "running" as const, updatedAt: new Date().toISOString() }
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

  assignRole: (launcherId, agentId, role) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId) return l;
        // If role is already assigned to another agent, unassign it first
        const updatedAgents = l.registeredAgents.map((a) => {
          if (a.id === agentId) return { ...a, assignedRole: role };
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

  // ── Start orchestration ──

  startOrchestration: (launcherId) =>
    set((s) => ({
      launchers: s.launchers.map((l) => {
        if (l.id !== launcherId || l.status !== "configuring") return l;

        const expertAgent = l.registeredAgents.find((a) => a.assignedRole === "expert");
        const inspectorAgent = l.registeredAgents.find((a) => a.assignedRole === "inspector");
        const ceoAgent = l.registeredAgents.find((a) => a.assignedRole === "ceo");
        const workerAgents = l.registeredAgents.filter((a) => a.assignedRole === "worker");

        return {
          ...l,
          status: "running" as const,
          updatedAt: new Date().toISOString(),
          agents: {
            expert: expertAgent ? createEmptyAgentSlot("expert", expertAgent) : null,
            inspector: inspectorAgent ? createEmptyAgentSlot("inspector", inspectorAgent) : null,
            ceo: ceoAgent ? createEmptyAgentSlot("ceo", ceoAgent) : null,
            workers: workerAgents.map((a) => ({
              id: a.id,
              role: "Worker",
              displayName: `Worker ${a.alias}`,
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
