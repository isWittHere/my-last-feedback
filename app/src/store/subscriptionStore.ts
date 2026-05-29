import { create } from "zustand";
import {
  fetchOpenCodeGoUsage, fetchToiotoUsage, fetchChannelMonitors, fetchDeepseekBalance,
  fetchZhipuUsage, fetchMinimaxUsage, fetchKimiBalance, fetchClaudeUsage, fetchCodexUsage,
  fetchMimoUsage,
  type NormalizedUsage, type ToiotoUsage, type ChannelMonitor, type DeepseekBalance,
  type TokenUsage, type BalanceInfo,
} from "../services/subscriptionScrapers";

export type SubscriptionGroupType = "opencode-go" | "toioto" | "deepseek" | "zhipu" | "mimo" | "minimax" | "codex" | "claude" | "kimi";

export interface SubscriptionGroupConfig {
  id: string;
  name: string;
  type: SubscriptionGroupType;
  authCookie: string;
  workspaceId: string;
  refreshIntervalSeconds: number;
  enabled: boolean;
}

export type SubscriptionGroupInput = Omit<SubscriptionGroupConfig, "id">;

export interface SubscriptionGroupState extends SubscriptionGroupConfig {
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
  rolling?: NormalizedUsage | null;
  weekly?: NormalizedUsage | null;
  monthly?: NormalizedUsage | null;
  toioto?: ToiotoUsage | null;
  channelMonitors?: ChannelMonitor[] | null;
  deepseek?: DeepseekBalance | null;
  zhipu?: TokenUsage[] | null;
  mimo?: BalanceInfo | null;
  minimax?: TokenUsage[] | null;
  codex?: TokenUsage[] | null;
  claude?: TokenUsage[] | null;
  kimi?: BalanceInfo | null;
}

interface SubscriptionStore {
  groups: SubscriptionGroupState[];
  showCollapsedProgressBar: boolean;
  setShowCollapsedProgressBar: (v: boolean) => void;
  addGroup: (config: SubscriptionGroupInput) => void;
  removeGroup: (id: string) => void;
  updateGroup: (id: string, patch: Partial<SubscriptionGroupConfig>) => void;
  reorderGroups: (fromIndex: number, toIndex: number) => void;
  refreshGroup: (id: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  startAutoRefresh: (id: string) => () => void;
}

function generateId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const STORAGE_KEY = "mlfb-subscription-groups-v1";

function persistGroups(groups: SubscriptionGroupState[]) {
  const configs = groups.map(({ loading, error, lastFetched, rolling, weekly, monthly, toioto, channelMonitors, deepseek, zhipu, mimo, minimax, codex, claude, kimi, ...config }) => config);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  } catch {}
}

function loadGroups(): SubscriptionGroupState[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const configs: SubscriptionGroupConfig[] = JSON.parse(raw);
    return configs.map((config) => ({
      ...config,
      loading: false,
      error: null,
      lastFetched: null,
      rolling: null,
      weekly: null,
      monthly: null,
      toioto: null,
      channelMonitors: null,
      deepseek: null,
      zhipu: null,
      mimo: null,
      minimax: null,
      codex: null,
      claude: null,
      kimi: null,
    }));
  } catch {
    return [];
  }
}

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  groups: loadGroups(),
  showCollapsedProgressBar: true,

  setShowCollapsedProgressBar: (v) => set({ showCollapsedProgressBar: v }),

  addGroup: (input) => {
    const group: SubscriptionGroupState = {
      ...input,
      id: generateId(),
      loading: false,
      error: null,
      lastFetched: null,
      rolling: null,
      weekly: null,
      monthly: null,
      toioto: null,
      channelMonitors: null,
      deepseek: null,
      zhipu: null,
      mimo: null,
      minimax: null,
      codex: null,
      claude: null,
      kimi: null,
    };
    const groups = [...get().groups, group];
    set({ groups });
    persistGroups(groups);
  },

  removeGroup: (id) => {
    const groups = get().groups.filter((g) => g.id !== id);
    set({ groups });
    persistGroups(groups);
  },

  reorderGroups: (fromIndex, toIndex) => {
    const groups = [...get().groups];
    const [moved] = groups.splice(fromIndex, 1);
    groups.splice(toIndex, 0, moved);
    set({ groups });
    persistGroups(groups);
  },

  updateGroup: (id, patch) => {
    const groups = get().groups.map((g) => (g.id === id ? { ...g, ...patch, error: null } : g));
    set({ groups });
    persistGroups(groups);
  },

  refreshGroup: async (id) => {
    const group = get().groups.find((g) => g.id === id);
    if (!group) return;

    const missingFields: string[] = [];
    if (group.type === "opencode-go") {
      if (!group.workspaceId.trim()) missingFields.push("Workspace ID");
      if (!group.authCookie.trim()) missingFields.push("Auth Cookie");
    } else if (group.type === "toioto") {
      if (!group.authCookie.trim()) missingFields.push("JWT Token");
    } else if (group.type === "deepseek" || group.type === "zhipu" || group.type === "minimax" || group.type === "kimi") {
      if (!group.authCookie.trim()) missingFields.push("API Key");
    } else if (group.type === "mimo" || group.type === "codex" || group.type === "claude") {
      if (!group.authCookie.trim()) missingFields.push("Auth Token");
    }

    if (missingFields.length > 0) {
      set({
        groups: get().groups.map((g) =>
          g.id === id ? { ...g, error: `${missingFields.join(" and ")} required` } : g,
        ),
      });
      return;
    }

    set({
      groups: get().groups.map((g) => (g.id === id ? { ...g, loading: true, error: null } : g)),
    });

    try {
      if (group.type === "opencode-go") {
        const r = await fetchOpenCodeGoUsage(group.workspaceId, group.authCookie);
        if (r.success) {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: null, lastFetched: Date.now(), rolling: r.rolling ?? null, weekly: r.weekly ?? null, monthly: r.monthly ?? null } : g) });
        } else {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: r.error, lastFetched: Date.now() } : g) });
        }
      } else if (group.type === "toioto") {
        const [usageResult, monitorResult] = await Promise.all([
          fetchToiotoUsage(group.authCookie), fetchChannelMonitors(group.authCookie),
        ]);
        if (usageResult.success) {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: null, lastFetched: Date.now(), toioto: usageResult.data, channelMonitors: monitorResult.success ? monitorResult.items : g.channelMonitors } : g) });
        } else {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: usageResult.error, lastFetched: Date.now() } : g) });
        }
      } else if (group.type === "deepseek") {
        const r = await fetchDeepseekBalance(group.authCookie);
        if (r.success) {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: null, lastFetched: Date.now(), deepseek: r.data } : g) });
        } else {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: r.error, lastFetched: Date.now() } : g) });
        }
      } else if (group.type === "zhipu") {
        const r = await fetchZhipuUsage(group.authCookie);
        if (r.success) {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: null, lastFetched: Date.now(), zhipu: r.data } : g) });
        } else {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: r.error, lastFetched: Date.now() } : g) });
        }
      } else if (group.type === "mimo") {
        const r = await fetchMimoUsage(group.authCookie);
        if (r.success) {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: null, lastFetched: Date.now(), mimo: r.data } : g) });
        } else {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: r.error, lastFetched: Date.now() } : g) });
        }
      } else if (group.type === "minimax") {
        const r = await fetchMinimaxUsage(group.authCookie);
        if (r.success) {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: null, lastFetched: Date.now(), minimax: r.data } : g) });
        } else {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: r.error, lastFetched: Date.now() } : g) });
        }
      } else if (group.type === "codex") {
        const r = await fetchCodexUsage(group.authCookie);
        if (r.success) {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: null, lastFetched: Date.now(), codex: r.data } : g) });
        } else {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: r.error, lastFetched: Date.now() } : g) });
        }
      } else if (group.type === "claude") {
        const r = await fetchClaudeUsage(group.authCookie);
        if (r.success) {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: null, lastFetched: Date.now(), claude: r.data } : g) });
        } else {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: r.error, lastFetched: Date.now() } : g) });
        }
      } else if (group.type === "kimi") {
        const r = await fetchKimiBalance(group.authCookie);
        if (r.success) {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: null, lastFetched: Date.now(), kimi: r.data } : g) });
        } else {
          set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: r.error, lastFetched: Date.now() } : g) });
        }
      } else {
        set({ groups: get().groups.map((g) => g.id === id ? { ...g, loading: false, error: `Unknown subscription type: ${group.type}`, lastFetched: Date.now() } : g) });
      }
    } catch (err) {
      set({
        groups: get().groups.map((g) =>
          g.id === id ? { ...g, loading: false, error: err instanceof Error ? err.message : String(err), lastFetched: Date.now() } : g,
        ),
      });
    }
  },

  refreshAll: async () => {
    const ids = get().groups.filter((g) => g.enabled).map((g) => g.id);
    await Promise.all(ids.map((id) => get().refreshGroup(id)));
  },

  startAutoRefresh: (id) => {
    const scheduleNext = () => {
      const group = get().groups.find((g) => g.id === id);
      if (!group || !group.enabled) return;
      return window.setTimeout(() => {
        get().refreshGroup(id).finally(() => {
          scheduleNext();
        });
      }, group.refreshIntervalSeconds * 1000);
    };
    const timerId = scheduleNext();
    return () => {
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  },
}));
