import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useFeedbackStore } from "../store/feedbackStore";
import { CatppuccinResourceIcon } from "./CatppuccinResourceIcon";
import { Icon } from "./Icons";

interface ProjectResourceEntry {
  name: string;
  absolutePath: string;
  relativePath: string;
  kind: "file" | "folder";
}

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/]/g, "\\]");
}

function encodeMarkdownPath(path: string, kind: "file" | "folder"): string {
  const normalized = (kind === "folder" ? ensureTrailingSlash(path) : path).replace(/\\/g, "/");
  return normalized
    .split("/")
    .map((segment, index) => {
      if (!segment) return segment;
      if (index === 0 && /^[A-Za-z]:$/.test(segment)) return segment;
      return encodeURIComponent(segment);
    })
    .join("/");
}

function formatMarkdownLink(entry: ProjectResourceEntry): string {
  const label = escapeMarkdownLabel(entry.kind === "folder" ? ensureTrailingSlash(entry.name) : entry.name);
  const sourcePath = entry.relativePath || entry.absolutePath;
  const href = encodeMarkdownPath(sourcePath, entry.kind);
  return `[${label}](${href})`;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/g, "").toLowerCase();
}

function normalizePathForCompare(path: string): string {
  return path.replace(/^\\\\\?\\/, "").replace(/\\/g, "/").replace(/\/+$/g, "").toLowerCase();
}

function cleanDisplayPath(path: string): string {
  return path.replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
}

function samePath(left: string, right: string): boolean {
  return normalizePathForCompare(left) === normalizePathForCompare(right);
}

function insertResourceLink(text: string) {
  const focusedComposer = useFeedbackStore.getState().focusedComposer;
  if (!focusedComposer) return;
  window.dispatchEvent(new CustomEvent("mlfb-insert-feedback-text", {
    detail: {
      callerId: focusedComposer.callerId,
      sessionId: focusedComposer.sessionId,
      kind: focusedComposer.kind,
      text,
    },
  }));
}

const TREE_BASE_INDENT = 4;
const TREE_INDENT_STEP = 12;
const TREE_GUIDE_OFFSET = 10;

function resourceTreeRowStyle(depth: number): CSSProperties {
  return { paddingLeft: TREE_BASE_INDENT + depth * TREE_INDENT_STEP };
}

function resourceTreeChildrenStyle(depth: number): CSSProperties {
  return { marginLeft: TREE_GUIDE_OFFSET + depth * TREE_INDENT_STEP };
}

function resourceTreeChildrenContentStyle(depth: number): CSSProperties {
  return {
    marginLeft: -(TREE_GUIDE_OFFSET + depth * TREE_INDENT_STEP),
  };
}

export function ProjectResourcePanel() {
  const { t } = useTranslation();
  const callers = useFeedbackStore((state) => state.callers);
  const sessions = useFeedbackStore((state) => state.sessions);
  const focusedComposer = useFeedbackStore((state) => state.focusedComposer);
  const resourceIconTheme = useFeedbackStore((state) => state.resourceIconTheme);
  const activeWorkspacePath = useFeedbackStore((state) => state.mlcActiveWorkspacePath);
  const setActiveWorkspacePath = useFeedbackStore((state) => state.setMlcActiveWorkspacePath);
  const [workspaceFilterMode, setWorkspaceFilterMode] = useState<"target" | "workspace">("target");
  const [childrenByPath, setChildrenByPath] = useState<Record<string, ProjectResourceEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loadingByPath, setLoadingByPath] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const targetCaller = callers.find((caller) => caller.id === focusedComposer?.callerId) || null;
  const targetWorkspacePath = focusedComposer?.projectDirectory || "";

  const workspaceOptions = useMemo(() => {
    const map = new Map<string, { path: string; name: string; ownerName?: string }>();
    const addPath = (path: string, name?: string, ownerName?: string) => {
      if (!path) return;
      const key = normalizePathForCompare(path);
      if (!map.has(key)) map.set(key, { path, name: name || basename(path), ownerName });
    };
    addPath(targetWorkspacePath, basename(targetWorkspacePath), targetCaller?.alias || targetCaller?.name);
    for (const session of sessions) addPath(session.projectDirectory, basename(session.projectDirectory));
    return Array.from(map.values());
  }, [sessions, targetCaller?.alias, targetCaller?.name, targetWorkspacePath]);

  const workspacePath = useMemo(() => {
    if (workspaceFilterMode === "target" && targetWorkspacePath) return targetWorkspacePath;
    return activeWorkspacePath || workspaceOptions[0]?.path || "";
  }, [activeWorkspacePath, targetWorkspacePath, workspaceFilterMode, workspaceOptions]);

  useEffect(() => {
    if (focusedComposer?.projectDirectory && !activeWorkspacePath) {
      setActiveWorkspacePath(focusedComposer.projectDirectory);
    }
  }, [activeWorkspacePath, focusedComposer?.projectDirectory, setActiveWorkspacePath]);

  const loadDirectory = useCallback(async (directoryPath: string) => {
    if (!workspacePath) return;
    setLoadingByPath((current) => new Set(current).add(directoryPath));
    setError(null);
    try {
      const entries = await invoke<ProjectResourceEntry[]>("project_list_directory", {
        request: { workspacePath, directoryPath },
      });
      setChildrenByPath((current) => ({ ...current, [normalizePath(directoryPath)]: entries }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingByPath((current) => {
        const next = new Set(current);
        next.delete(directoryPath);
        return next;
      });
    }
  }, [workspacePath]);

  useEffect(() => {
    setChildrenByPath({});
    setExpanded(new Set());
    setError(null);
    if (workspacePath) loadDirectory(workspacePath);
  }, [loadDirectory, workspacePath]);

  const toggleFolder = useCallback((entry: ProjectResourceEntry) => {
    const key = normalizePath(entry.absolutePath);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!childrenByPath[key]) loadDirectory(entry.absolutePath);
  }, [childrenByPath, loadDirectory]);

  const renderRows = (entries: ProjectResourceEntry[], depth = 0): ReactNode => entries.map((entry) => {
    const key = normalizePath(entry.absolutePath);
    const isFolder = entry.kind === "folder";
    const isExpanded = expanded.has(key);
    const children = childrenByPath[key] || [];
    const isLoading = loadingByPath.has(entry.absolutePath);
    const rowStyle = resourceTreeRowStyle(depth);
    return (
      <div key={entry.absolutePath}>
        <div className="resource-tree-row" style={rowStyle}>
          <button
            type="button"
            className="resource-tree-disclosure"
            onClick={() => isFolder && toggleFolder(entry)}
            disabled={!isFolder}
            aria-label={isExpanded ? t("resources.collapse", "Collapse") : t("resources.expand", "Expand")}
          >
            {isFolder ? <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={14} /> : null}
          </button>
          {resourceIconTheme === "catppuccin" ? (
            <CatppuccinResourceIcon entry={entry} expanded={isExpanded} size={14} className="resource-tree-icon" />
          ) : (
            <Icon name={isFolder ? (isExpanded ? "folder-open" : "folder") : "file-text"} size={14} className="resource-tree-icon" />
          )}
          <button type="button" className="resource-tree-name" onClick={() => isFolder ? toggleFolder(entry) : insertResourceLink(formatMarkdownLink(entry))}>
            {entry.name}
          </button>
          {isLoading ? <Icon name="spinner" size={12} className="animate-spin" /> : null}
          <button type="button" className="resource-tree-insert" onClick={() => insertResourceLink(formatMarkdownLink(entry))} title={t("resources.insert", "Insert link")}> 
            <Icon name="arrow-bend-down-right" size={12} />
          </button>
        </div>
        {isFolder && isExpanded && children.length > 0 ? (
          <div className="resource-tree-children" style={resourceTreeChildrenStyle(depth)}>
            <div className="resource-tree-children-content" style={resourceTreeChildrenContentStyle(depth)}>
              {renderRows(children, depth + 1)}
            </div>
          </div>
        ) : null}
      </div>
    );
  });

  const rootEntries = childrenByPath[normalizePath(workspacePath)] || [];
  const rootLoading = workspacePath && loadingByPath.has(workspacePath);

  return (
    <>
      <div className="mlc-tabs mlc-workspace-tabs resource-workspace-tabs">
        {targetWorkspacePath ? (
          <button className={`mlc-target-tab${workspaceFilterMode === "target" ? " active" : ""}`} onClick={() => { setWorkspaceFilterMode("target"); setActiveWorkspacePath(targetWorkspacePath); }} data-tooltip={`${t("mlc.target", "Target")}: ${cleanDisplayPath(targetWorkspacePath)}`}>
            <Icon name="aim" size={11} />
            <span>{targetCaller?.alias || targetCaller?.name || basename(targetWorkspacePath)}</span>
          </button>
        ) : null}
        {workspaceOptions.map((workspace) => (
          <button key={normalizePathForCompare(workspace.path)} className={workspaceFilterMode === "workspace" && samePath(workspacePath, workspace.path) ? "active" : ""} onClick={() => { setWorkspaceFilterMode("workspace"); setActiveWorkspacePath(workspace.path); }} data-tooltip={workspace.ownerName ? `${cleanDisplayPath(workspace.path)} · ${workspace.ownerName}` : cleanDisplayPath(workspace.path)}>
            <Icon name="folder" size={11} />
            <span>{workspace.name}</span>
          </button>
        ))}
      </div>

      <div className="mlc-list resource-tree-list">
        {!workspacePath ? (
          <div className="mlc-list-empty"><Icon name="folder" size={24} /><div>{t("resources.noWorkspace", "No workspace")}</div></div>
        ) : rootLoading ? (
          <div className="mlc-list-empty"><Icon name="spinner" size={24} className="animate-spin" /><div>{t("resources.loading", "Loading files...")}</div></div>
        ) : error ? (
          <div className="mlc-list-empty"><Icon name="circle-x" size={24} /><div>{error}</div></div>
        ) : rootEntries.length === 0 ? (
          <div className="mlc-list-empty"><Icon name="folder" size={24} /><div>{t("resources.empty", "No files")}</div></div>
        ) : renderRows(rootEntries)}
      </div>
    </>
  );
}
