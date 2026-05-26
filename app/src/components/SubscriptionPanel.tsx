import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useSubscriptionStore, type SubscriptionGroupState, type SubscriptionGroupConfig } from "../store/subscriptionStore";
import { type ChannelMonitor } from "../services/subscriptionScrapers";
import { Icon } from "./Icons";

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
}: {
  group: Pick<SubscriptionGroupState, "workspaceId" | "authCookie" | "refreshIntervalSeconds" | "name">;
  onSave: (config: Pick<SubscriptionGroupConfig, "workspaceId" | "authCookie" | "refreshIntervalSeconds" | "name">) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [workspaceId, setWorkspaceId] = useState(group.workspaceId);
  const [authCookie, setAuthCookie] = useState(group.authCookie);
  const [interval, setInterval] = useState(String(group.refreshIntervalSeconds));

  const handleSave = () => {
    const intervalSecs = Math.max(10, parseInt(interval, 10) || 60);
    onSave({ workspaceId: workspaceId.trim(), authCookie: authCookie.trim(), refreshIntervalSeconds: intervalSecs, name: group.name || t("subscriptions.opencodeGo", "OpenCode Go") });
  };

  return (
    <div className="subscription-config-form">
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
        <button type="button" className="subscription-config-save" onClick={handleSave}>
          <Icon name="check" size={12} />
          {t("common.save", "Save")}
        </button>
        <button type="button" className="subscription-config-cancel" onClick={onCancel}>
          <Icon name="close" size={12} />
          {t("common.cancel", "Cancel")}
        </button>
      </div>
    </div>
  );
}

function ToiotoConfigForm({
  group,
  onSave,
  onCancel,
}: {
  group: Pick<SubscriptionGroupState, "authCookie" | "refreshIntervalSeconds" | "name">;
  onSave: (config: Pick<SubscriptionGroupConfig, "authCookie" | "refreshIntervalSeconds" | "name">) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [jwt, setJwt] = useState(group.authCookie);
  const [interval, setInterval] = useState(String(group.refreshIntervalSeconds));

  const handleSave = () => {
    const intervalSecs = Math.max(10, parseInt(interval, 10) || 60);
    onSave({ authCookie: jwt.trim(), refreshIntervalSeconds: intervalSecs, name: group.name || t("subscriptions.toioto", "Toioto") });
  };

  return (
    <div className="subscription-config-form">
      <label className="subscription-config-field">
        <span>{t("subscriptions.jwt", "JWT Token")}</span>
        <input type="password" value={jwt} onChange={(e) => setJwt(e.target.value)} placeholder="eyJ..." />
      </label>
      <label className="subscription-config-field">
        <span>{t("subscriptions.refreshInterval", "Refresh interval (s)")}</span>
        <input type="number" min={10} value={interval} onChange={(e) => setInterval(e.target.value)} />
      </label>
      <div className="subscription-config-actions">
        <button type="button" className="subscription-config-save" onClick={handleSave}>
          <Icon name="check" size={12} />
          {t("common.save", "Save")}
        </button>
        <button type="button" className="subscription-config-cancel" onClick={onCancel}>
          <Icon name="close" size={12} />
          {t("common.cancel", "Cancel")}
        </button>
      </div>
    </div>
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
              <span className="subscription-usage-label">{label}</span>
              <span className="subscription-usage-pct">{usageBarPercent(data.usagePercent)}</span>
              <span className="subscription-usage-remaining">
                {t("subscriptions.remaining", "{{pct}} remaining").replace("{{pct}}", usageBarPercent(data.percentRemaining))}
              </span>
            </div>
            <div className="subscription-usage-bar-track">
              <div className="subscription-usage-bar-fill" style={{ width: usageBarPercent(data.usagePercent) }} />
            </div>
            <div className="subscription-usage-reset">
              {t("subscriptions.resetsIn", "Resets in {{time}}").replace("{{time}}", formatDuration(data.resetInSec))}
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
      if (s === "failed") return "failed";
      if (s === "degraded" || s === "error") worst = "degraded";
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
              {m.status === "failed" ? (
                <Icon name="circle-x" size={10} style={{ color: "#ef4444" }} />
              ) : m.status === "degraded" || m.status === "error" ? (
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

function SubscriptionGroupCard({
  group,
  onRefresh,
}: {
  group: SubscriptionGroupState;
  onRefresh: (id: string) => void;
}) {
  const { t } = useTranslation();
  const removeGroup = useSubscriptionStore((s) => s.removeGroup);
  const updateGroup = useSubscriptionStore((s) => s.updateGroup);
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(!group.enabled);
  const [showChanTooltip, setShowChanTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const autoRefreshCleanupRef = useRef<(() => void) | null>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

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

  return (
    <>
      <section className={`subscription-group${collapsed ? " collapsed" : ""}`}>
      <button type="button" className="subscription-group-header" onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed}>
        <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={12} className="subscription-group-caret" />
        <span className="subscription-group-name">{group.name || (group.type === "toioto" ? "Toioto" : "OpenCode Go")}</span>
        {group.type === "opencode-go" && (
          <div className="subscription-group-minibars">
            <div className="subscription-group-minibar">
              <div className="subscription-group-minibar-fill" style={{ width: group.rolling ? usageBarPercent(group.rolling.usagePercent) : "0%" }} />
            </div>
            <div className="subscription-group-minibar">
              <div className="subscription-group-minibar-fill" style={{ width: group.weekly ? usageBarPercent(group.weekly.usagePercent) : "0%" }} />
            </div>
            <div className="subscription-group-minibar">
              <div className="subscription-group-minibar-fill" style={{ width: group.monthly ? usageBarPercent(group.monthly.usagePercent) : "0%" }} />
            </div>
          </div>
        )}
        {group.type === "toioto" && group.toioto && (
          <span className={`subscription-group-balance${group.toioto.balance < 5 ? " low" : ""}`}>
            {formatBalance(group.toioto.balance)}
          </span>
        )}
        <span
          ref={statusRef}
          className="subscription-group-status"
          onMouseEnter={() => group.type === "toioto" && group.channelMonitors && setShowChanTooltip(true)}
          onMouseLeave={() => setShowChanTooltip(false)}
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
          ) : group.lastFetched ? (
            <Icon name="check" size={12} style={{ color: "var(--color-success, #22c55e)" }} />
          ) : (
            <Icon name="minus" size={12} style={{ color: "var(--color-text-muted)" }} />
          )}
        </span>
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
            <ToiotoConfigForm
              group={group}
              onSave={handleSaveToiotoConfig}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <GroupConfigForm
              group={group}
              onSave={handleSaveConfig}
              onCancel={() => setEditing(false)}
            />
          )
        ) : group.type === "toioto" ? (
          <ToiotoDisplay group={group} />
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
    </>
  );
}

export function SubscriptionPanel() {
  const { t } = useTranslation();
  const groups = useSubscriptionStore((s) => s.groups);
  const addGroup = useSubscriptionStore((s) => s.addGroup);
  const refreshGroup = useSubscriptionStore((s) => s.refreshGroup);
  const refreshAll = useSubscriptionStore((s) => s.refreshAll);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showNewToiotoForm, setShowNewToiotoForm] = useState(false);
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

  const openForm = (type: "opencode-go" | "toioto") => {
    setShowDropdown(false);
    if (type === "opencode-go") {
      setShowNewToiotoForm(false);
      setShowNewForm((v) => !v);
    } else {
      setShowNewForm(false);
      setShowNewToiotoForm((v) => !v);
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
          <div className="subscription-new-form-header">{t("subscriptions.addOpenCodeGo", "Add OpenCode Go")}</div>
          <GroupConfigForm
            group={{ workspaceId: "", authCookie: "", refreshIntervalSeconds: 60, name: t("subscriptions.opencodeGo", "OpenCode Go") }}
            onSave={handleAddGroup}
            onCancel={() => setShowNewForm(false)}
          />
        </div>
      )}

      {showNewToiotoForm && (
        <div className="subscription-new-form">
          <div className="subscription-new-form-header">{t("subscriptions.addToioto", "Add Toioto")}</div>
          <ToiotoConfigForm
            group={{ authCookie: "", refreshIntervalSeconds: 120, name: t("subscriptions.toioto", "Toioto") }}
            onSave={handleAddToiotoGroup}
            onCancel={() => setShowNewToiotoForm(false)}
          />
        </div>
      )}

      <div className="subscription-groups">
        {groups.length === 0 && !showNewForm && !showNewToiotoForm ? (
          <div className="subscription-empty">
            <Icon name="dollar-sign" size={24} />
            <div>{t("subscriptions.empty", "No subscriptions configured")}</div>
          </div>
        ) : (
          groups.map((group) => (
            <SubscriptionGroupCard key={group.id} group={group} onRefresh={refreshGroup} />
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
              <Icon name="dollar-sign" size={13} />
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
              <Icon name="dollar-sign" size={13} />
              <span className="app-select-option-text">
                <span className="app-select-option-label">{t("subscriptions.toioto", "Toioto")}</span>
              </span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
