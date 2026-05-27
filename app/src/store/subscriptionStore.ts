import { create } from "zustand";
import { fetchOpenCodeGoUsage, fetchToiotoUsage, fetchChannelMonitors, fetchDeepseekBalance, type NormalizedUsage, type ToiotoUsage, type ChannelMonitor, type DeepseekBalance } from "../services/subscriptionScrapers";

export type SubscriptionGroupType = "opencode-go" | "toioto" | "deepseek";

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
}

interface SubscriptionStore {
  groups: SubscriptionGroupState[];
  addGroup: (config: SubscriptionGroupInput) => void;
  removeGroup: (id: string) => void;
  updateGroup: (id: string, patch: Partial<SubscriptionGroupConfig>) => void;
  refreshGroup: (id: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  startAutoRefresh: (id: string) => () => void;
}

function generateId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const STORAGE_KEY = "mlfb-subscription-groups-v1";

function persistGroups(groups: SubscriptionGroupState[]) {
  const configs = groups.map(({ loading, error, lastFetched, rolling, weekly, monthly, toioto, channelMonitors, deepseek, ...config }) => config);
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
    }));
  } catch {
    return [];
  }
}

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  groups: loadGroups(),

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
    } else if (group.type === "deepseek") {
      if (!group.authCookie.trim()) missingFields.push("API Key");
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

    if (group.type === "opencode-go") {
      const result = await fetchOpenCodeGoUsage(group.workspaceId, group.authCookie);
      if (result.success) {
        set({
          groups: get().groups.map((g) =>
            g.id === id
              ? {
                  ...g,
                  loading: false,
                  error: null,
                  lastFetched: Date.now(),
                  rolling: result.rolling ?? null,
                  weekly: result.weekly ?? null,
                  monthly: result.monthly ?? null,
                }
              : g,
          ),
        });
      } else {
        set({
          groups: get().groups.map((g) =>
            g.id === id ? { ...g, loading: false, error: result.error, lastFetched: Date.now() } : g,
          ),
        });
      }
    } else if (group.type === "toioto") {
      const [result, monitorResult] = await Promise.all([
        fetchToiotoUsage(group.authCookie),
        fetchChannelMonitors(group.authCookie),
      ]);
      if (result.success) {
        set({
          groups: get().groups.map((g) =>
            g.id === id
              ? {
                  ...g,
                  loading: false,
                  error: null,
                  lastFetched: Date.now(),
                  toioto: result.data,
                  channelMonitors: monitorResult.success ? monitorResult.items : g.channelMonitors,
                }
              : g,
          ),
        });
      } else {
        set({
          groups: get().groups.map((g) =>
            g.id === id ? { ...g, loading: false, error: result.error, lastFetched: Date.now() } : g,
          ),
        });
      }
    } else if (group.type === "deepseek") {
      const result = await fetchDeepseekBalance(group.authCookie);
      if (result.success) {
        set({
          groups: get().groups.map((g) =>
            g.id === id
              ? {
                  ...g,
                  loading: false,
                  error: null,
                  lastFetched: Date.now(),
                  deepseek: result.data,
                }
              : g,
          ),
        });
      } else {
        set({
          groups: get().groups.map((g) =>
            g.id === id ? { ...g, loading: false, error: result.error, lastFetched: Date.now() } : g,
          ),
        });
      }
    } else {
      set({
        groups: get().groups.map((g) =>
          g.id === id ? { ...g, loading: false, error: `Unknown subscription type: ${group.type}` } : g,
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
