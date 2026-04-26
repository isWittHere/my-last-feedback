import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMLRAStore, type Launcher } from "../store/mlraStore";
import { Icon } from "./Icons";
import { timeAgo } from "./timeUtils";

interface LauncherSidebarProps {
  onClose: () => void;
}

const STATUS_ICON_NAMES: Record<string, string> = {
  configuring: "gear",
  running: "play",
  paused: "pause",
  completed: "check",
  cancelled: "close",
};

const STATUS_LABELS: Record<string, string> = {
  configuring: "配置中",
  running: "运行中",
  paused: "已暂停",
  completed: "已完成",
  cancelled: "已取消",
  "awaiting-user": "等待响应",
};

/**
 * Launcher management overlay sidebar.
 * Slides in from the left, allows switching/creating/managing launchers.
 */
export function LauncherSidebar({ onClose }: LauncherSidebarProps) {
  const launchers = useMLRAStore((s) => s.launchers);
  const activeLauncherId = useMLRAStore((s) => s.activeLauncherId);
  const switchLauncher = useMLRAStore((s) => s.switchLauncher);
  const createLauncher = useMLRAStore((s) => s.createLauncher);
  const deleteLauncher = useMLRAStore((s) => s.deleteLauncher);

  const [searchQuery, setSearchQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const filteredLaunchers = launchers.filter((l) =>
    !searchQuery || l.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = useCallback(
    (id: string) => {
      switchLauncher(id);
      onClose();
    },
    [switchLauncher, onClose]
  );

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    const id = createLauncher(newName.trim());
    setNewName("");
    setShowCreate(false);
    switchLauncher(id);
    onClose();
  }, [newName, createLauncher, switchLauncher, onClose]);

  return (
    <>
      {/* Backdrop overlay */}
      <div className="launcher-sidebar-overlay" onClick={onClose} />

      {/* Sidebar panel */}
      <div className="launcher-sidebar">
        {/* Header */}
        <div className="launcher-sidebar-header">
          <span className="launcher-sidebar-title">
            <Icon name="sidebar" size={13} />
            Launcher 管理
          </span>
          <button onClick={onClose} className="settings-close-btn">
            <Icon name="win-close" size={10} />
          </button>
        </div>

        {/* Search */}
        <div className="launcher-sidebar-search">
          <input
            type="text"
            placeholder="搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="launcher-sidebar-input"
          />
        </div>

        {/* Launcher list */}
        <div className="launcher-sidebar-list">
          {filteredLaunchers.length === 0 ? (
            <div className="launcher-sidebar-empty">
              {launchers.length === 0 ? "暂无 Launcher" : "无匹配结果"}
            </div>
          ) : (
            filteredLaunchers.map((launcher) => (
              <LauncherSidebarItem
                key={launcher.id}
                launcher={launcher}
                isActive={launcher.id === activeLauncherId}
                onSelect={() => handleSelect(launcher.id)}
                onDelete={() => deleteLauncher(launcher.id)}
              />
            ))
          )}
        </div>

        {/* Create new */}
        <div className="launcher-sidebar-footer">
          {showCreate ? (
            <div className="launcher-sidebar-create-form">
              <input
                type="text"
                placeholder="输入任务描述"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="launcher-sidebar-input"
                autoFocus
              />
              <div className="launcher-sidebar-create-actions">
                <button className="btn btn-primary" onClick={handleCreate} disabled={!newName.trim()}>
                  创建
                </button>
                <button className="btn" onClick={() => setShowCreate(false)}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button className="btn launcher-sidebar-create-btn" onClick={() => setShowCreate(true)}>
              <Icon name="plus" size={12} />
              新建 Launcher
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** Single launcher item in the sidebar */
function LauncherSidebarItem({
  launcher,
  isActive,
  onSelect,
  onDelete,
}: {
  launcher: Launcher;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const renameLauncher = useMLRAStore((s) => s.renameLauncher);
  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(launcher.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue.trim() !== launcher.name) {
      renameLauncher(launcher.id, renameValue.trim());
    }
    setIsRenaming(false);
    setShowMenu(false);
  };

  return (
    <div
      className={`launcher-sidebar-item${isActive ? " launcher-sidebar-item-active" : ""}`}
      onClick={() => { if (!isRenaming) onSelect(); }}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowMenu(!showMenu);
        setConfirmDelete(false);
      }}
    >
      <div className="launcher-sidebar-item-name">
        <span className={`launcher-sidebar-item-indicator${isActive ? " active" : ""}`}>
          <Icon name={isActive ? "circle-check" : "clock"} size={8} />
        </span>
        {isRenaming ? (
          <input
            type="text"
            className="mlra-home-input launcher-sidebar-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") { setIsRenaming(false); setShowMenu(false); }
            }}
            onBlur={handleRenameSubmit}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span onDoubleClick={(e) => { e.stopPropagation(); setIsRenaming(true); setRenameValue(launcher.name); }}>
            {launcher.name}
          </span>
        )}
      </div>
      <div className="launcher-sidebar-item-meta">
        <span className="launcher-sidebar-item-status">
          <Icon name={STATUS_ICON_NAMES[launcher.status]} size={10} /> {STATUS_LABELS[launcher.status]}
        </span>
        {launcher.status !== "configuring" && launcher.blueprintRuntime?.currentStage && (
          <>
            <span className="launcher-sidebar-item-sep">|</span>
            <span>{launcher.blueprintRuntime.currentStage.name}</span>
          </>
        )}
      </div>
      {launcher.blueprintRuntime?.currentStage && (
        <div className="launcher-sidebar-item-time" style={{ color: "var(--color-text-secondary)" }}>
          当前阶段: {launcher.blueprintRuntime.currentStage.name}
        </div>
      )}
      <div className="launcher-sidebar-item-time">
        {timeAgo(launcher.createdAt, t)}
      </div>
      {launcher.status !== "configuring" && (
        <div className="launcher-sidebar-item-agents">
          {launcher.agents.expert && <span style={{ color: "#3B82F6" }}>Expert</span>}
          {launcher.agents.inspector && <span style={{ color: "#F59E0B" }}>Inspector</span>}
          {launcher.agents.ceo && <span style={{ color: "#8B5CF6" }}>CEO</span>}
        </div>
      )}

      {/* Context menu */}
      {showMenu && (
        <div className="launcher-sidebar-item-menu" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setIsRenaming(true); setRenameValue(launcher.name); setShowMenu(false); }}>
            <Icon name="edit" size={10} /> 重命名
          </button>
          {/* pause / resume buttons removed: store no longer exposes pauseLauncher / resumeLauncher */}
          <div className="launcher-sidebar-item-menu-sep" />
          {confirmDelete ? (
            <button className="launcher-sidebar-item-menu-danger" onClick={() => { onDelete(); setShowMenu(false); setConfirmDelete(false); }}>
              <Icon name="trash" size={10} /> 确认删除
            </button>
          ) : (
            <button onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={10} /> 删除
            </button>
          )}
        </div>
      )}
    </div>
  );
}
