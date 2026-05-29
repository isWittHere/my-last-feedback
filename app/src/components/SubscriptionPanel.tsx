import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useSubscriptionStore, type SubscriptionGroupState, type SubscriptionGroupConfig } from "../store/subscriptionStore";
import { type ChannelMonitor, type TokenUsage, type BalanceInfo } from "../services/subscriptionScrapers";
import { Icon, ProviderIcon } from "./Icons";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

function formatLastFetched(timestamp: number | null): string {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  if (diff < 10_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function usageBarPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}

function formatBalance(value: number): string {
  return `$${value.toFixed(2)}`;
}

function GroupConfigForm({
  group,
  onSave,
  onCancel,
  formId,
  onValidityChange,
}: {
  group: Pick<SubscriptionGroupState, "workspaceId" | "authCookie" | "refreshIntervalSeconds" | "name">;
  onSave: (config: Pick<SubscriptionGroupConfig, "workspaceId" | "authCookie" | "refreshIntervalSeconds" | "name">) => void;
  onCancel: () => void;
  formId?: string;
  onValidityChange?: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  const [workspaceId, setWorkspaceId] = useState(group.workspaceId);
  const [authCookie, setAuthCookie] = useState(group.authCookie);
  const [interval, setInterval] = useState(String(group.refreshIntervalSeconds));

  const canSave = workspaceId.trim().length > 0 && authCookie.trim().length > 0;

  useEffect(() => {
    onValidityChange?.(canSave);
  }, [canSave, onValidityChange]);

  const handleSave = () => {
    const intervalSecs = Math.max(10, parseInt(interval, 10) || 60);
    onSave({ workspaceId: workspaceId.trim(), authCookie: authCookie.trim(), refreshIntervalSeconds: intervalSecs, name: group.name || t("subscriptions.opencodeGo", "OpenCode Go") });
  };

  return (
    <form className="subscription-config-form" id={formId} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
      <label className="subscription-config-field">
        <span>{t("subscriptions.workspaceId", "Workspace ID")}</span>
        <input value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} placeholder="wrk_..." />
      </label>
      <label className="subscription-config-field">
        <span>{t("subscriptions.authCookie", "Auth Cookie")}</span>
        <input type="password" value={authCookie} onChange={(e) => setAuthCookie(e.target.value)} placeholder="auth=..." />
      </label>
      <label className="subscription-config-field">
        <span>{t("subscriptions.refreshInterval", "Refresh interval (s)")}</span>
        <input type="number" min={10} value={interval} onChange={(e) => setInterval(e.target.value)} />
      </label>
      <div className="subscription-config-actions">
        <button type="submit" className="subscription-config-save" disabled={!canSave}>
          <Icon name="check" size={12} />
          {t("common.save", "Save")}
        </button>
        <button type="button" className="subscription-config-cancel" onClick={onCancel}>
          <Icon name="close" size={12} />
          {t("common.cancel", "Cancel")}
        </button>
      </div>
    </form>
  );
}

function DeepseekConfigForm({
  group,
  onSave,
  onCancel,
  formId,
  onValidityChange,
}: {
  group: Pick<SubscriptionGroupState, "authCookie" | "refreshIntervalSeconds" | "name">;
  onSave: (config: Pick<SubscriptionGroupConfig, "authCookie" | "refreshIntervalSeconds" | "name">) => void;
  onCancel: () => void;
  formId?: string;
  onValidityChange?: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState(group.authCookie);
  const [interval, setInterval] = useState(String(group.refreshIntervalSeconds));

  const canSave = apiKey.trim().length > 0;

  useEffect(() => {
    onValidityChange?.(canSave);
  }, [canSave, onValidityChange]);

  const handleSave = () => {
    const intervalSecs = Math.max(10, parseInt(interval, 10) || 60);
    onSave({ authCookie: apiKey.trim(), refreshIntervalSeconds: intervalSecs, name: group.name || t("subscriptions.deepseek", "DeepSeek") });
  };

  return (
    <form className="subscription-config-form" id={formId} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
      <label className="subscription-config-field">
        <span>{t("subscriptions.apiKey", "API Key")}</span>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
      </label>
      <label className="subscription-config-field">
        <span>{t("subscriptions.refreshInterval", "Refresh interval (s)")}</span>
        <input type="number" min={10} value={interval} onChange={(e) => setInterval(e.target.value)} />
      </label>
      <div className="subscription-config-actions">
        <button type="submit" className="subscription-config-save" disabled={!canSave}>
          <Icon name="check" size={12} />
          {t("common.save", "Save")}
        </button>
        <button type="button" className="subscription-config-cancel" onClick={onCancel}>
          <Icon name="close" size={12} />
          {t("common.cancel", "Cancel")}
        </button>
      </div>
    </form>
  );
}

function ToiotoConfigForm({
  group,
  onSave,
  onCancel,
  formId,
  onValidityChange,
}: {
  group: Pick<SubscriptionGroupState, "authCookie" | "refreshIntervalSeconds" | "name">;
  onSave: (config: Pick<SubscriptionGroupConfig, "authCookie" | "refreshIntervalSeconds" | "name">) => void;
  onCancel: () => void;
  formId?: string;
  onValidityChange?: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  const [jwt, setJwt] = useState(group.authCookie);
  const [interval, setInterval] = useState(String(group.refreshIntervalSeconds));

  const canSave = jwt.trim().length > 0;

  useEffect(() => {
    onValidityChange?.(canSave);
  }, [canSave, onValidityChange]);

  const handleSave = () => {
    const intervalSecs = Math.max(10, parseInt(interval, 10) || 60);
    onSave({ authCookie: jwt.trim(), refreshIntervalSeconds: intervalSecs, name: group.name || t("subscriptions.toioto", "Toioto") });
  };

  return (
    <form className="subscription-config-form" id={formId} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
      <label className="subscription-config-field">
        <span>{t("subscriptions.jwt", "JWT Token")}</span>
        <input type="password" value={jwt} onChange={(e) => setJwt(e.target.value)} placeholder="eyJ..." />
      </label>
      <label className="subscription-config-field">
        <span>{t("subscriptions.refreshInterval", "Refresh interval (s)")}</span>
        <input type="number" min={10} value={interval} onChange={(e) => setInterval(e.target.value)} />
      </label>
      <div className="subscription-config-actions">
        <button type="submit" className="subscription-config-save" disabled={!canSave}>
          <Icon name="check" size={12} />
          {t("common.save", "Save")}
        </button>
        <button type="button" className="subscription-config-cancel" onClick={onCancel}>
          <Icon name="close" size={12} />
          {t("common.cancel", "Cancel")}
        </button>
      </div>
    </form>
  );
}

function ToiotoDisplay({ group }: { group: SubscriptionGroupState }) {
  const { t } = useTranslation();
  const data = group.toioto;
  if (!data) {
    return (
      <div className="subscription-usage-empty">
        {group.lastFetched ? t("subscriptions.noData", "No usage data available") : ""}
      </div>
    );
  }

  return (
    <div className="subscription-toioto-display">
      <div className="subscription-toioto-balance">
        <span className="subscription-toioto-balance-amount">{formatBalance(data.balance)}</span>
        <span className="subscription-toioto-balance-label">{t("subscriptions.balance", "Balance")}</span>
      </div>
      <div className="subscription-toioto-meta">
        <span className="subscription-toioto-meta-item">
          {t("subscriptions.concurrency", "Concurrency")}: {data.concurrency}
        </span>
        <span className="subscription-toioto-meta-item">
          RPM: {data.rpmLimit}
        </span>
        <span className="subscription-toioto-meta-item">
          {t("subscriptions.totalRecharged", "Recharged")}: {formatBalance(data.totalRecharged)}
        </span>
      </div>
    </div>
  );
}

function DeepseekDisplay({ group }: { group: SubscriptionGroupState }) {
  const { t } = useTranslation();
  const data = group.deepseek;
  if (!data) {
    return (
      <div className="subscription-usage-empty">
        {group.lastFetched ? t("subscriptions.noData", "No usage data available") : ""}
      </div>
    );
  }

  const info = data.balanceInfos[0];
  if (!info) {
    return (
      <div className="subscription-usage-empty">
        {t("subscriptions.noData", "No usage data available")}
      </div>
    );
  }

  return (
    <div className="subscription-toioto-display">
      <div className="subscription-toioto-balance">
        <span className="subscription-toioto-balance-amount">￥{info.totalBalance}</span>
        <span className="subscription-toioto-balance-label">{t("subscriptions.balance", "Balance")}</span>
      </div>
      <div className="subscription-toioto-meta">
        <span className="subscription-toioto-meta-item">
          {t("subscriptions.grantedBalance", "Granted")}: ￥{info.grantedBalance}
        </span>
        <span className="subscription-toioto-meta-item">
          {t("subscriptions.toppedUpBalance", "Topped up")}: ￥{info.toppedUpBalance}
        </span>
      </div>
      {!data.isAvailable && (
        <div className="subscription-deepseek-unavailable">
          {t("subscriptions.balanceUnavailable", "No available balance")}
        </div>
      )}
    </div>
  );
}

function UsageDisplay({ group }: { group: SubscriptionGroupState }) {
  const { t } = useTranslation();
  const windows = [
    { key: "rolling" as const, label: t("subscriptions.rolling", "Rolling") },
    { key: "weekly" as const, label: t("subscriptions.weekly", "Weekly") },
    { key: "monthly" as const, label: t("subscriptions.monthly", "Monthly") },
  ];

  return (
    <div className="subscription-usage-display">
      {windows.map(({ key, label }) => {
        const data = group[key];
        if (!data) return null;
        return (
          <div key={key} className="subscription-usage-window">
            <div className="subscription-usage-header">
              <span className="subscription-usage-label">{label} <span className="subscription-usage-reset-inline">{t("subscriptions.resetsIn", "Resets in {{time}}").replace("{{time}}", formatDuration(data.resetInSec))}</span></span>
              <span className="subscription-usage-pct">{usageBarPercent(data.usagePercent)}</span>
            </div>
            <div className="subscription-usage-bar-track">
              <div className="subscription-usage-bar-fill" style={{ width: usageBarPercent(data.usagePercent) }} />
            </div>
          </div>
        );
      })}
      {!group.rolling && !group.weekly && !group.monthly && group.lastFetched ? (
        <div className="subscription-usage-empty">{t("subscriptions.noData", "No usage data available")}</div>
      ) : null}
    </div>
  );
}

function channelWorstStatus(monitors: ChannelMonitor[] | null | undefined): "ok" | "degraded" | "failed" {
  if (!monitors || monitors.length === 0) return "ok";
  let worst: "ok" | "degraded" | "failed" = "ok";
  for (const ch of monitors) {
    const models = [ch.primaryStatus, ...(ch.extraModels ?? []).map((m) => m.status as string)];
    for (const s of models) {
      if (s === "failed" || s === "error") return "failed";
      if (s === "degraded") worst = "degraded";
    }
  }
  return worst;
}

function ChannelStatusTooltip({ monitors }: { monitors: ChannelMonitor[] }) {
  return (
    <div className="subscription-status-tooltip">
      {monitors.map((ch) => (
        <div key={ch.id} className="subscription-status-channel">
          <div className="subscription-status-channel-name">{ch.name}</div>
          {[
            { model: ch.primaryModel, status: ch.primaryStatus, latency: ch.primaryLatencyMs },
            ...(ch.extraModels ?? []).map((m) => ({ model: m.model, status: m.status, latency: m.latencyMs })),
          ].map((m) => (
            <div key={m.model} className="subscription-status-model">
              {m.status === "failed" || m.status === "error" ? (
                <Icon name="circle-x" size={10} style={{ color: "#ef4444" }} />
              ) : m.status === "degraded" ? (
                <Icon name="warning" size={10} style={{ color: "#f59e0b" }} />
              ) : (
                <Icon name="check" size={10} style={{ color: "var(--color-primary)" }} />
              )}
              <span className={`subscription-status-model-name${m.status !== "operational" ? ` subscription-status-model-name--${m.status}` : ""}`}>
                {m.model}
              </span>
              <span className="subscription-status-model-latency">{m.latency}ms</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function providerDisplayName(type: string): string {
  const names: Record<string, string> = {
    "opencode-go": "OpenCode Go",
    toioto: "Toioto",
    deepseek: "DeepSeek",
    zhipu: "GLM 智谱",
    mimo: "小米 MIMO",
    minimax: "MINIMAX",
    codex: "Codex",
    claude: "Claude",
    kimi: "KIMI",
  };
  return names[type] || type;
}

function usageColor(pct: number): string {
  if (pct >= 80) return "#ef4444";
  if (pct >= 60) return "#f59e0b";
  return "var(--color-primary)";
}

function UsageRing({ percent, size = 12 }: { percent: number; size?: number }) {
  const r = (size / 2) - 1.5;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, percent));
  const offset = circumference - (pct / 100) * circumference;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-bg-input)" strokeWidth="1.5" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={usageColor(pct)} strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function UsageOverviewTooltip({ group }: { group: SubscriptionGroupState }) {
  const { t } = useTranslation();
  const windows = [
    { key: "rolling" as const, label: t("subscriptions.rolling", "Rolling") },
    { key: "weekly" as const, label: t("subscriptions.weekly", "Weekly") },
    { key: "monthly" as const, label: t("subscriptions.monthly", "Monthly") },
  ];

  return (
    <div className="subscription-status-tooltip">
      <div className="subscription-status-channel">
      {windows.map(({ key, label }) => {
        const data = group[key];
        const pct = data ? Math.round(data.usagePercent) : 0;
        return (
          <div key={key} className="subscription-status-model">
            <span className="subscription-status-model-name" style={{ minWidth: 48 }}>{label}</span>
            <div className="subscription-usage-bar-track" style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--color-bg-input)" }}>
              <div
                className="subscription-usage-bar-fill"
                style={{ height: "100%", borderRadius: 2, background: usageColor(pct), width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <span className="subscription-status-model-latency" style={{ minWidth: 32, textAlign: "right" }}>{pct}%</span>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function ApiKeyConfigForm({
  group,
  onSave,
  onCancel,
  formId,
  onValidityChange,
}: {
  group: Pick<SubscriptionGroupState, "authCookie" | "refreshIntervalSeconds" | "name">;
  onSave: (config: Pick<SubscriptionGroupConfig, "authCookie" | "refreshIntervalSeconds" | "name">) => void;
  onCancel: () => void;
  formId?: string;
  onValidityChange?: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState(group.authCookie);
  const [interval, setInterval] = useState(String(group.refreshIntervalSeconds));

  const canSave = apiKey.trim().length > 0;

  useEffect(() => {
    onValidityChange?.(canSave);
  }, [canSave, onValidityChange]);

  const handleSave = () => {
    const intervalSecs = Math.max(10, parseInt(interval, 10) || 60);
    onSave({ authCookie: apiKey.trim(), refreshIntervalSeconds: intervalSecs, name: group.name });
  };

  return (
    <form className="subscription-config-form" id={formId} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
      <label className="subscription-config-field">
        <span>{t("subscriptions.apiKey", "API Key")}</span>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
      </label>
      <label className="subscription-config-field">
        <span>{t("subscriptions.refreshInterval", "Refresh interval (s)")}</span>
        <input type="number" min={10} value={interval} onChange={(e) => setInterval(e.target.value)} />
      </label>
      <div className="subscription-config-actions">
        <button type="submit" className="subscription-config-save" disabled={!canSave}>
          <Icon name="check" size={12} />
          {t("common.save", "Save")}
        </button>
        <button type="button" className="subscription-config-cancel" onClick={onCancel}>
          <Icon name="close" size={12} />
          {t("common.cancel", "Cancel")}
        </button>
      </div>
    </form>
  );
}

function AuthTokenConfigForm({
  group,
  onSave,
  onCancel,
  formId,
  onValidityChange,
}: {
  group: Pick<SubscriptionGroupState, "authCookie" | "refreshIntervalSeconds" | "name">;
  onSave: (config: Pick<SubscriptionGroupConfig, "authCookie" | "refreshIntervalSeconds" | "name">) => void;
  onCancel: () => void;
  formId?: string;
  onValidityChange?: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  const [token, setToken] = useState(group.authCookie);
  const [interval, setInterval] = useState(String(group.refreshIntervalSeconds));

  const canSave = token.trim().length > 0;

  useEffect(() => {
    onValidityChange?.(canSave);
  }, [canSave, onValidityChange]);

  const handleSave = () => {
    const intervalSecs = Math.max(10, parseInt(interval, 10) || 60);
    onSave({ authCookie: token.trim(), refreshIntervalSeconds: intervalSecs, name: group.name });
  };

  return (
    <form className="subscription-config-form" id={formId} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
      <label className="subscription-config-field">
        <span>{t("subscriptions.authToken", "Auth Token")}</span>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="eyJ..." />
      </label>
      <label className="subscription-config-field">
        <span>{t("subscriptions.refreshInterval", "Refresh interval (s)")}</span>
        <input type="number" min={10} value={interval} onChange={(e) => setInterval(e.target.value)} />
      </label>
      <div className="subscription-config-actions">
        <button type="submit" className="subscription-config-save" disabled={!canSave}>
          <Icon name="check" size={12} />
          {t("common.save", "Save")}
        </button>
        <button type="button" className="subscription-config-cancel" onClick={onCancel}>
          <Icon name="close" size={12} />
          {t("common.cancel", "Cancel")}
        </button>
      </div>
    </form>
  );
}

function TokenUsageDisplay({ usage }: { usage: TokenUsage[] | null | undefined }) {
  const { t } = useTranslation();
  if (!usage || usage.length === 0) {
    return <div className="subscription-usage-empty">{t("subscriptions.noData", "No usage data available")}</div>;
  }

  return (
    <div className="subscription-usage-display">
      {usage.map((w) => (
        <div key={w.label} className="subscription-usage-window">
          <div className="subscription-usage-header">
            <span className="subscription-usage-label">{w.label}</span>
            <span className="subscription-usage-pct">{usageBarPercent(w.usagePercent)}</span>
          </div>
          <div className="subscription-usage-bar-track">
            <div className="subscription-usage-bar-fill" style={{ width: usageBarPercent(w.usagePercent) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BalanceDisplay({ balance }: { balance: BalanceInfo | null | undefined }) {
  const { t } = useTranslation();
  if (!balance) {
    return <div className="subscription-usage-empty">{t("subscriptions.noData", "No usage data available")}</div>;
  }

  return (
    <div className="subscription-toioto-display">
      <div className="subscription-toioto-balance">
        <span className="subscription-toioto-balance-amount">{balance.currency}{balance.total}</span>
        <span className="subscription-toioto-balance-label">{t("subscriptions.balance", "Balance")}</span>
      </div>
      {balance.items && balance.items.length > 0 && (
        <div className="subscription-toioto-meta">
          {balance.items.map((item) => (
            <span key={item.label} className="subscription-toioto-meta-item">
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SubscriptionGroupCard({
  group,
  index,
  onRefresh,
  onReorder,
}: {
  group: SubscriptionGroupState;
  index: number;
  onRefresh: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const { t } = useTranslation();
  const removeGroup = useSubscriptionStore((s) => s.removeGroup);
  const updateGroup = useSubscriptionStore((s) => s.updateGroup);
  const showCollapsedBar = useSubscriptionStore((s) => s.showCollapsedProgressBar);
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(!group.enabled);
  const [dragOver, setDragOver] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (!isNaN(from) && from !== index) onReorder(from, index);
  };
  const [showChanTooltip, setShowChanTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const [showUsageTooltip, setShowUsageTooltip] = useState(false);
  const [usageTooltipPos, setUsageTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const autoRefreshCleanupRef = useRef<(() => void) | null>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const usageTooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!showChanTooltip || !statusRef.current || !tooltipRef.current) return;
    const statusRect = statusRef.current.getBoundingClientRect();
    const tipRect = tooltipRef.current.getBoundingClientRect();
    const margin = 4;
    let left = statusRect.right + 6;
    let top = statusRect.top;
    if (left + tipRect.width > window.innerWidth - margin) {
      left = statusRect.left - tipRect.width - 6;
    }
    left = Math.max(margin, left);
    if (top + tipRect.height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - tipRect.height - margin);
    }
    setTooltipPos({ left, top });
  }, [showChanTooltip, group.channelMonitors]);

  useLayoutEffect(() => {
    if (!showUsageTooltip || !statusRef.current || !usageTooltipRef.current) return;
    const statusRect = statusRef.current.getBoundingClientRect();
    const tipRect = usageTooltipRef.current.getBoundingClientRect();
    const margin = 4;
    let left = statusRect.right + 6;
    let top = statusRect.top;
    if (left + tipRect.width > window.innerWidth - margin) {
      left = statusRect.left - tipRect.width - 6;
    }
    left = Math.max(margin, left);
    if (top + tipRect.height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - tipRect.height - margin);
    }
    setUsageTooltipPos({ left, top });
  }, [showUsageTooltip, group.rolling, group.weekly, group.monthly]);

  const startAutoRefresh = useSubscriptionStore((s) => s.startAutoRefresh);

  useEffect(() => {
    if (autoRefreshCleanupRef.current) {
      autoRefreshCleanupRef.current();
      autoRefreshCleanupRef.current = null;
    }
    if (group.enabled) {
      autoRefreshCleanupRef.current = startAutoRefresh(group.id);
    }
    return () => {
      if (autoRefreshCleanupRef.current) {
        autoRefreshCleanupRef.current();
        autoRefreshCleanupRef.current = null;
      }
    };
  }, [group.id, group.enabled, group.refreshIntervalSeconds, startAutoRefresh]);

  const handleSaveConfig = (config: Pick<SubscriptionGroupConfig, "workspaceId" | "authCookie" | "refreshIntervalSeconds" | "name">) => {
    updateGroup(group.id, config);
    setEditing(false);
  };

  const handleSaveToiotoConfig = (config: Pick<SubscriptionGroupConfig, "authCookie" | "refreshIntervalSeconds" | "name">) => {
    updateGroup(group.id, config);
    setEditing(false);
  };

  const handleSaveDeepseekConfig = (config: Pick<SubscriptionGroupConfig, "authCookie" | "refreshIntervalSeconds" | "name">) => {
    updateGroup(group.id, config);
    setEditing(false);
  };

  const handleSaveApiKeyConfig = (config: Pick<SubscriptionGroupConfig, "authCookie" | "refreshIntervalSeconds" | "name">) => {
    updateGroup(group.id, config);
    setEditing(false);
  };

  const handleSaveAuthTokenConfig = (config: Pick<SubscriptionGroupConfig, "authCookie" | "refreshIntervalSeconds" | "name">) => {
    updateGroup(group.id, config);
    setEditing(false);
  };

  return (
    <>
      <section
        className={`subscription-group${collapsed ? " collapsed" : ""}${dragOver ? " subscription-group-dragover" : ""}`}
        draggable="true"
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
      <button type="button" className="subscription-group-header" onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed}>
        <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={12} className="subscription-group-caret" />
        <ProviderIcon provider={group.type} size={16} className="subscription-group-provider-icon" />
        <span className="subscription-group-name">{group.name || providerDisplayName(group.type)}</span>
        {group.type === "opencode-go" && group.monthly && (
          <span className="subscription-group-monthly-pct">
            {t("subscriptions.used", "已使用")} <span style={{ fontWeight: 700, color: usageColor(group.monthly.usagePercent) }}>{Math.round(group.monthly.usagePercent)}%</span>
          </span>
        )}
        {group.type === "toioto" && group.toioto && (
          <span className={`subscription-group-balance${group.toioto.balance < 5 ? " low" : ""}`}>
            {formatBalance(group.toioto.balance)}
          </span>
        )}
        {group.type === "deepseek" && group.deepseek && group.deepseek.balanceInfos[0] && (
          <span className={`subscription-group-balance${Number(group.deepseek.balanceInfos[0].totalBalance) < 1 ? " low" : ""}`}>
            ￥{group.deepseek.balanceInfos[0].totalBalance}
          </span>
        )}
        {(group.type === "zhipu" || group.type === "minimax" || group.type === "codex" || group.type === "claude") && group[group.type] && group[group.type]![0] && (
          <span className="subscription-group-monthly-pct">
            {t("subscriptions.used", "已使用")} <span style={{ fontWeight: 700, color: usageColor(group[group.type]![0].usagePercent) }}>{Math.round(group[group.type]![0].usagePercent)}%</span>
          </span>
        )}
        {(group.type === "mimo" || group.type === "kimi") && group[group.type] && (
          <span className={`subscription-group-balance${Number(group[group.type]!.total) < 1 ? " low" : ""}`}>
            {group[group.type]!.currency}{group[group.type]!.total}
          </span>
        )}
        <span
          ref={statusRef}
          className="subscription-group-status"
          onMouseEnter={() => {
            if (group.type === "toioto" && group.channelMonitors) setShowChanTooltip(true);
            if (group.type === "opencode-go" && (group.rolling || group.weekly || group.monthly)) setShowUsageTooltip(true);
          }}
          onMouseLeave={() => { setShowChanTooltip(false); setShowUsageTooltip(false); }}
        >
          {group.loading ? (
            <Icon name="spinner" size={12} className="animate-spin" />
          ) : group.error ? (
            <Icon name="circle-x" size={12} style={{ color: "var(--color-danger, #ef4444)" }} />
          ) : group.type === "toioto" && group.channelMonitors ? (
            (() => {
              const worst = channelWorstStatus(group.channelMonitors);
              if (worst === "failed") return <Icon name="circle-x" size={12} style={{ color: "#ef4444" }} />;
              if (worst === "degraded") return <Icon name="warning" size={12} style={{ color: "#f59e0b" }} />;
              return <Icon name="check" size={12} style={{ color: "var(--color-success, #22c55e)" }} />;
            })()
          ) : group.type === "opencode-go" && group.monthly ? (
            <UsageRing percent={group.monthly.usagePercent} size={12} />
          ) : (group.type === "zhipu" || group.type === "minimax" || group.type === "codex" || group.type === "claude") && group[group.type] && group[group.type]![0] ? (
            <UsageRing percent={group[group.type]![0].usagePercent} size={12} />
          ) : group.lastFetched ? (
            <Icon name="check" size={12} style={{ color: "var(--color-success, #22c55e)" }} />
          ) : (
            <Icon name="minus" size={12} style={{ color: "var(--color-text-muted)" }} />
          )}
        </span>
        {showCollapsedBar && collapsed && group.type === "opencode-go" && group.monthly && (
          <div
            className="subscription-group-collapsed-bar"
            style={{
              width: `${Math.min(100, Math.max(0, group.monthly.usagePercent))}%`,
              background: usageColor(group.monthly.usagePercent),
            }}
          />
        )}
      </button>
      <div className="subscription-group-body" aria-hidden={collapsed}>
        {group.enabled && group.lastFetched ? (
          <div className="subscription-group-meta">
            <span className="subscription-group-updated">
              {t("subscriptions.updated", "Updated")}: {formatLastFetched(group.lastFetched)}
            </span>
            {group.enabled && (
              <span className="subscription-group-interval">
                {t("subscriptions.every", "Every")} {group.refreshIntervalSeconds}s
              </span>
            )}
            {group.type === "toioto" && group.toioto?.email && (
              <span className="subscription-group-meta-item">{group.toioto.email}</span>
            )}
          </div>
        ) : null}

        {group.error ? (
          <div className="subscription-group-error">
            <Icon name="warning" size={12} />
            {group.error}
          </div>
        ) : null}

        {editing ? (
          group.type === "toioto" ? (
            <ToiotoConfigForm group={group} onSave={handleSaveToiotoConfig} onCancel={() => setEditing(false)} />
          ) : group.type === "deepseek" ? (
            <DeepseekConfigForm group={group} onSave={handleSaveDeepseekConfig} onCancel={() => setEditing(false)} />
          ) : group.type === "zhipu" || group.type === "minimax" || group.type === "kimi" ? (
            <ApiKeyConfigForm group={group} onSave={handleSaveApiKeyConfig} onCancel={() => setEditing(false)} />
          ) : group.type === "mimo" || group.type === "codex" || group.type === "claude" ? (
            <AuthTokenConfigForm group={group} onSave={handleSaveAuthTokenConfig} onCancel={() => setEditing(false)} />
          ) : (
            <GroupConfigForm group={group} onSave={handleSaveConfig} onCancel={() => setEditing(false)} />
          )
        ) : group.type === "toioto" ? (
          <ToiotoDisplay group={group} />
        ) : group.type === "deepseek" ? (
          <DeepseekDisplay group={group} />
        ) : group.type === "zhipu" ? (
          <TokenUsageDisplay usage={group.zhipu} />
        ) : group.type === "minimax" ? (
          <TokenUsageDisplay usage={group.minimax} />
        ) : group.type === "codex" ? (
          <TokenUsageDisplay usage={group.codex} />
        ) : group.type === "claude" ? (
          <TokenUsageDisplay usage={group.claude} />
        ) : group.type === "mimo" ? (
          <BalanceDisplay balance={group.mimo} />
        ) : group.type === "kimi" ? (
          <BalanceDisplay balance={group.kimi} />
        ) : (
          <UsageDisplay group={group} />
        )}

        <div className="subscription-group-actions">
          <button
            type="button"
            className="subscription-group-action-btn"
            onClick={() => onRefresh(group.id)}
            disabled={group.loading || !group.enabled}
            title={t("subscriptions.refresh", "Refresh now")}
          >
            <Icon name={group.loading ? "spinner" : "refresh"} size={12} />
            <span>{t("subscriptions.refresh", "Refresh")}</span>
          </button>
          <button
            type="button"
            className="subscription-group-action-btn"
            onClick={() => setEditing((v) => !v)}
            title={t("subscriptions.configure", "Configure")}
          >
            <Icon name="gear" size={12} />
            <span>{t("subscriptions.configure", "Configure")}</span>
          </button>
          <button
            type="button"
            className="subscription-group-action-btn subscription-group-action-toggle"
            onClick={() => updateGroup(group.id, { enabled: !group.enabled })}
            title={group.enabled ? t("subscriptions.disable", "Disable") : t("subscriptions.enable", "Enable")}
          >
            <Icon name={group.enabled ? "pause" : "play"} size={12} />
          </button>
          <button
            type="button"
            className="subscription-group-action-btn subscription-group-action-delete"
            onClick={() => removeGroup(group.id)}
            title={t("subscriptions.remove", "Remove")}
          >
            <Icon name="trash" size={12} />
          </button>
        </div>
      </div>
    </section>

      {showChanTooltip && group.channelMonitors && createPortal(
        <div
          ref={tooltipRef}
          className="subscription-status-tooltip-container"
          style={tooltipPos ?? { left: -9999, top: 0 }}
        >
          <ChannelStatusTooltip monitors={group.channelMonitors} />
        </div>,
        document.body,
      )}

      {showUsageTooltip && (group.rolling || group.weekly || group.monthly) && createPortal(
        <div
          ref={usageTooltipRef}
          className="subscription-status-tooltip-container"
          style={usageTooltipPos ?? { left: -9999, top: 0 }}
        >
          <UsageOverviewTooltip group={group} />
        </div>,
        document.body,
      )}
    </>
  );
}

export function SubscriptionPanel() {
  const { t } = useTranslation();
  const groups = useSubscriptionStore((s) => s.groups);
  const addGroup = useSubscriptionStore((s) => s.addGroup);
  const refreshGroup = useSubscriptionStore((s) => s.refreshGroup);
  const refreshAll = useSubscriptionStore((s) => s.refreshAll);
  const reorderGroups = useSubscriptionStore((s) => s.reorderGroups);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showNewToiotoForm, setShowNewToiotoForm] = useState(false);
  const [showNewDeepseekForm, setShowNewDeepseekForm] = useState(false);
  const [showNewApiKeyForm, setShowNewApiKeyForm] = useState<string | null>(null);
  const [addFormValid, setAddFormValid] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        addBtnRef.current &&
        !addBtnRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  const openForm = (type: "opencode-go" | "toioto" | "deepseek" | "zhipu" | "mimo" | "minimax" | "codex" | "claude" | "kimi") => {
    setShowDropdown(false);
    setShowNewForm(false);
    setShowNewToiotoForm(false);
    setShowNewDeepseekForm(false);
    setShowNewApiKeyForm(null);
    if (type === "opencode-go") {
      setShowNewForm(true);
    } else if (type === "toioto") {
      setShowNewToiotoForm(true);
    } else if (type === "deepseek") {
      setShowNewDeepseekForm(true);
    } else {
      setShowNewApiKeyForm(type);
    }
  };

  const handleRefreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setRefreshing(false);
    }
  }, [refreshAll]);

  const handleAddGroup = (config: Pick<SubscriptionGroupConfig, "workspaceId" | "authCookie" | "refreshIntervalSeconds" | "name">) => {
    addGroup({
      ...config,
      type: "opencode-go",
      workspaceId: config.workspaceId || "",
      enabled: true,
    });
    setShowNewForm(false);
  };

  const handleAddToiotoGroup = (config: Pick<SubscriptionGroupConfig, "authCookie" | "refreshIntervalSeconds" | "name">) => {
    addGroup({
      type: "toioto",
      workspaceId: "",
      ...config,
      enabled: true,
    });
    setShowNewToiotoForm(false);
  };

  const handleAddDeepseekGroup = (config: Pick<SubscriptionGroupConfig, "authCookie" | "refreshIntervalSeconds" | "name">) => {
    addGroup({
      type: "deepseek",
      workspaceId: "",
      ...config,
      enabled: true,
    });
    setShowNewDeepseekForm(false);
  };

  const handleAddApiKeyGroup = (type: string) => (config: Pick<SubscriptionGroupConfig, "authCookie" | "refreshIntervalSeconds" | "name">) => {
    addGroup({
      type: type as SubscriptionGroupState["type"],
      workspaceId: "",
      ...config,
      enabled: true,
    });
    setShowNewApiKeyForm(null);
  };

  return (
    <div className="subscription-panel">
      <div className="subscription-toolbar">
        <button
          type="button"
          ref={addBtnRef}
          className="subscription-new-button"
          onClick={() => setShowDropdown((v) => !v)}
        >
          <Icon name="plus" size={12} />
          <span>{t("subscriptions.addGroup", "Add subscription")}</span>
        </button>
        {groups.length > 0 && (
          <button
            type="button"
            className="subscription-refresh-button"
            onClick={() => void handleRefreshAll()}
            disabled={refreshing}
            title={t("subscriptions.refreshAll", "Refresh all")}
          >
            <Icon name={refreshing ? "spinner" : "refresh"} size={12} />
          </button>
        )}
      </div>

      {showNewForm && (
        <div className="subscription-new-form">
          <div className="subscription-new-form-header">
            <span className="subscription-new-form-header-title">
              <ProviderIcon provider="opencode-go" size={16} /> {t("subscriptions.addOpenCodeGo", "Add OpenCode Go")}
            </span>
            <div className="subscription-config-actions">
              <button type="submit" form="add-form-opencode-go" className="subscription-config-save" disabled={!addFormValid}>
                <Icon name="check" size={12} /> {t("common.save", "Save")}
              </button>
              <button type="button" className="subscription-config-cancel" onClick={() => setShowNewForm(false)}>
                <Icon name="close" size={12} /> {t("common.cancel", "Cancel")}
              </button>
            </div>
          </div>
          <GroupConfigForm
            formId="add-form-opencode-go"
            group={{ workspaceId: "", authCookie: "", refreshIntervalSeconds: 60, name: t("subscriptions.opencodeGo", "OpenCode Go") }}
            onSave={handleAddGroup}
            onCancel={() => setShowNewForm(false)}
            onValidityChange={setAddFormValid}
          />
        </div>
      )}

      {showNewToiotoForm && (
        <div className="subscription-new-form">
          <div className="subscription-new-form-header">
            <span className="subscription-new-form-header-title">
              <ProviderIcon provider="toioto" size={16} /> {t("subscriptions.addToioto", "Add Toioto")}
            </span>
            <div className="subscription-config-actions">
              <button type="submit" form="add-form-toioto" className="subscription-config-save" disabled={!addFormValid}>
                <Icon name="check" size={12} /> {t("common.save", "Save")}
              </button>
              <button type="button" className="subscription-config-cancel" onClick={() => setShowNewToiotoForm(false)}>
                <Icon name="close" size={12} /> {t("common.cancel", "Cancel")}
              </button>
            </div>
          </div>
          <ToiotoConfigForm
            formId="add-form-toioto"
            group={{ authCookie: "", refreshIntervalSeconds: 120, name: t("subscriptions.toioto", "Toioto") }}
            onSave={handleAddToiotoGroup}
            onCancel={() => setShowNewToiotoForm(false)}
            onValidityChange={setAddFormValid}
          />
        </div>
      )}

      {showNewDeepseekForm && (
        <div className="subscription-new-form">
          <div className="subscription-new-form-header">
            <span className="subscription-new-form-header-title">
              <ProviderIcon provider="deepseek" size={16} /> {t("subscriptions.addDeepseek", "Add DeepSeek")}
            </span>
            <div className="subscription-config-actions">
              <button type="submit" form="add-form-deepseek" className="subscription-config-save" disabled={!addFormValid}>
                <Icon name="check" size={12} /> {t("common.save", "Save")}
              </button>
              <button type="button" className="subscription-config-cancel" onClick={() => setShowNewDeepseekForm(false)}>
                <Icon name="close" size={12} /> {t("common.cancel", "Cancel")}
              </button>
            </div>
          </div>
          <DeepseekConfigForm
            formId="add-form-deepseek"
            group={{ authCookie: "", refreshIntervalSeconds: 120, name: t("subscriptions.deepseek", "DeepSeek") }}
            onSave={handleAddDeepseekGroup}
            onCancel={() => setShowNewDeepseekForm(false)}
            onValidityChange={setAddFormValid}
          />
        </div>
      )}

      {showNewApiKeyForm && (
        <div className="subscription-new-form">
          <div className="subscription-new-form-header">
            <span className="subscription-new-form-header-title">
              <ProviderIcon provider={showNewApiKeyForm} size={16} /> {t(`subscriptions.add${providerDisplayName(showNewApiKeyForm).replace(/\s/g, "")}`, `Add ${providerDisplayName(showNewApiKeyForm)}`)}
            </span>
            <div className="subscription-config-actions">
              <button type="submit" form={`add-form-${showNewApiKeyForm}`} className="subscription-config-save" disabled={!addFormValid}>
                <Icon name="check" size={12} /> {t("common.save", "Save")}
              </button>
              <button type="button" className="subscription-config-cancel" onClick={() => setShowNewApiKeyForm(null)}>
                <Icon name="close" size={12} /> {t("common.cancel", "Cancel")}
              </button>
            </div>
          </div>
          <ApiKeyConfigForm
            formId={`add-form-${showNewApiKeyForm}`}
            group={{ authCookie: "", refreshIntervalSeconds: 120, name: providerDisplayName(showNewApiKeyForm) }}
            onSave={handleAddApiKeyGroup(showNewApiKeyForm)}
            onCancel={() => setShowNewApiKeyForm(null)}
            onValidityChange={setAddFormValid}
          />
        </div>
      )}

      <div className="subscription-groups">
        {groups.length === 0 && !showNewForm && !showNewToiotoForm && !showNewDeepseekForm ? (
          <div className="subscription-empty">
            <Icon name="dollar-sign" size={24} />
            <div>{t("subscriptions.empty", "No subscriptions configured")}</div>
          </div>
        ) : (
          groups.map((group, idx) => (
            <SubscriptionGroupCard key={group.id} group={group} index={idx} onRefresh={refreshGroup} onReorder={reorderGroups} />
          ))
        )}
      </div>

      {showDropdown &&
        createPortal(
          <div
            ref={dropdownRef}
            className="app-select-panel"
            role="listbox"
            aria-label={t("subscriptions.addGroup", "Add subscription")}
            style={
              addBtnRef.current
                ? (() => {
                    const rect = addBtnRef.current.getBoundingClientRect();
                return { position: "fixed", minWidth: 0, maxWidth: "unset", left: rect.left, top: rect.bottom + 4 };
              })()
            : { position: "fixed", minWidth: 0, maxWidth: "unset" }
            }
          >
            <button
              type="button"
              className="app-select-option"
              role="option"
              aria-selected={false}
              onClick={() => openForm("opencode-go")}
            >
              <ProviderIcon provider="opencode-go" size={13} />
              <span className="app-select-option-text">
                <span className="app-select-option-label">{t("subscriptions.opencodeGo", "OpenCode Go")}</span>
              </span>
            </button>
            <button
              type="button"
              className="app-select-option"
              role="option"
              aria-selected={false}
              onClick={() => openForm("toioto")}
            >
              <ProviderIcon provider="toioto" size={13} />
              <span className="app-select-option-text">
                <span className="app-select-option-label">{t("subscriptions.toioto", "Toioto")}</span>
              </span>
            </button>
            <button
              type="button"
              className="app-select-option"
              role="option"
              aria-selected={false}
              onClick={() => openForm("deepseek")}
            >
              <ProviderIcon provider="deepseek" size={13} />
              <span className="app-select-option-text">
                <span className="app-select-option-label">{t("subscriptions.deepseek", "DeepSeek")}</span>
              </span>
            </button>
            <button type="button" className="app-select-option" role="option" aria-selected={false} onClick={() => openForm("zhipu")}>
              <ProviderIcon provider="zhipu" size={13} />
              <span className="app-select-option-text"><span className="app-select-option-label">GLM 智谱</span></span>
            </button>
            <button type="button" className="app-select-option" role="option" aria-selected={false} onClick={() => openForm("mimo")}>
              <ProviderIcon provider="mimo" size={13} />
              <span className="app-select-option-text"><span className="app-select-option-label">小米 MIMO</span></span>
            </button>
            <button type="button" className="app-select-option" role="option" aria-selected={false} onClick={() => openForm("minimax")}>
              <ProviderIcon provider="minimax" size={13} />
              <span className="app-select-option-text"><span className="app-select-option-label">MINIMAX</span></span>
            </button>
            <button type="button" className="app-select-option" role="option" aria-selected={false} onClick={() => openForm("codex")}>
              <ProviderIcon provider="codex" size={13} />
              <span className="app-select-option-text"><span className="app-select-option-label">Codex</span></span>
            </button>
            <button type="button" className="app-select-option" role="option" aria-selected={false} onClick={() => openForm("claude")}>
              <ProviderIcon provider="claude" size={13} />
              <span className="app-select-option-text"><span className="app-select-option-label">Claude</span></span>
            </button>
            <button type="button" className="app-select-option" role="option" aria-selected={false} onClick={() => openForm("kimi")}>
              <ProviderIcon provider="kimi" size={13} />
              <span className="app-select-option-text"><span className="app-select-option-label">KIMI</span></span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
