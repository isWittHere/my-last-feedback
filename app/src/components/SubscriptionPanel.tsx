import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSubscriptionStore, type SubscriptionGroupState, type SubscriptionGroupConfig } from "../store/subscriptionStore";
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
  const autoRefreshCleanupRef = useRef<(() => void) | null>(null);

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

  return (
    <section className={`subscription-group${collapsed ? " collapsed" : ""}`}>
      <button type="button" className="subscription-group-header" onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed}>
        <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={12} className="subscription-group-caret" />
        <span className="subscription-group-name">{group.name || "OpenCode Go"}</span>
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
        <span className="subscription-group-status">
          {group.loading ? (
            <Icon name="spinner" size={12} className="animate-spin" />
          ) : group.error ? (
            <Icon name="circle-x" size={12} style={{ color: "var(--color-danger, #ef4444)" }} />
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
          </div>
        ) : null}

        {group.error ? (
          <div className="subscription-group-error">
            <Icon name="warning" size={12} />
            {group.error}
          </div>
        ) : null}

        {editing ? (
          <GroupConfigForm
            group={group}
            onSave={handleSaveConfig}
            onCancel={() => setEditing(false)}
          />
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
  );
}

export function SubscriptionPanel() {
  const { t } = useTranslation();
  const groups = useSubscriptionStore((s) => s.groups);
  const addGroup = useSubscriptionStore((s) => s.addGroup);
  const refreshGroup = useSubscriptionStore((s) => s.refreshGroup);
  const refreshAll = useSubscriptionStore((s) => s.refreshAll);
  const [showNewForm, setShowNewForm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
      enabled: true,
    });
    setShowNewForm(false);
  };

  return (
    <div className="subscription-panel">
      <div className="subscription-toolbar">
        <button type="button" className="subscription-new-button" onClick={() => setShowNewForm((v) => !v)}>
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

      <div className="subscription-groups">
        {groups.length === 0 && !showNewForm ? (
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
    </div>
  );
}
