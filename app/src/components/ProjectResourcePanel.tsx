import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useFeedbackStore } from "../store/feedbackStore";
import { buildWorkspaceOptions } from "../workspace/workspaceCandidates";
import { cleanDisplayPath, sameWorkspacePath, workspaceBasename, workspacePathKey } from "../workspace/workspacePaths";
import { CatppuccinResourceIcon } from "./CatppuccinResourceIcon";
import { Icon } from "./Icons";

interface ProjectResourceEntry {
  name: string;
  absolutePath: string;
  relativePath: string;
  kind: "file" | "folder";
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
  const focusedComposer = useFeedbackStore((state) => state.focusedComposer);
  const targetCaller = useFeedbackStore((state) => focusedComposer?.callerId ? state.callers.find((caller) => caller.id === focusedComposer.callerId) || null : null);
  const sessionWorkspacePathsKey = useFeedbackStore((state) => {
    const seen = new Set<string>();
    return state.sessions
      .map((session) => session.projectDirectory)
      .filter((path) => {
        if (!path) return false;
        const key = workspacePathKey(path);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join("\n");
  });
  const resourceIconTheme = useFeedbackStore((state) => state.resourceIconTheme);
  const activeWorkspacePath = useFeedbackStore((state) => state.mlcActiveWorkspacePath);
  const setActiveWorkspacePath = useFeedbackStore((state) => state.setMlcActiveWorkspacePath);
  const [workspaceFilterMode, setWorkspaceFilterMode] = useState<"target" | "workspace">("target");
  const [childrenByPath, setChildrenByPath] = useState<Record<string, ProjectResourceEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loadingByPath, setLoadingByPath] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const targetWorkspacePath = focusedComposer?.projectDirectory || "";

  const workspaceOptions = useMemo(() => {
    return buildWorkspaceOptions({
      targetWorkspacePath,
      targetOwnerName: targetCaller?.alias || targetCaller?.name,
      workspacePaths: sessionWorkspacePathsKey.split("\n"),
    });
  }, [sessionWorkspacePathsKey, targetCaller?.alias, targetCaller?.name, targetWorkspacePath]);

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
      setChildrenByPath((current) => ({ ...current, [workspacePathKey(directoryPath)]: entries }));
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

  const loadedDirectoryPaths = useMemo(() => {
    const paths = new Map<string, string>();
    if (workspacePath) paths.set(workspacePathKey(workspacePath), workspacePath);
    for (const entries of Object.values(childrenByPath)) {
      for (const entry of entries) {
        if (entry.kind === "folder" && childrenByPath[workspacePathKey(entry.absolutePath)]) {
          paths.set(workspacePathKey(entry.absolutePath), entry.absolutePath);
        }
      }
    }
    return Array.from(paths.values());
  }, [childrenByPath, workspacePath]);

  const refreshLoadedDirectories = useCallback(() => {
    if (!workspacePath) return;
    const paths = loadedDirectoryPaths.length > 0 ? loadedDirectoryPaths : [workspacePath];
    void Promise.all(paths.map((directoryPath) => loadDirectory(directoryPath)));
  }, [loadDirectory, loadedDirectoryPaths, workspacePath]);

  useEffect(() => {
    setChildrenByPath({});
    setExpanded(new Set());
    setError(null);
    if (workspacePath) loadDirectory(workspacePath);
  }, [loadDirectory, workspacePath]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "hidden") refreshLoadedDirectories();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshLoadedDirectories();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshLoadedDirectories]);

  const toggleFolder = useCallback((entry: ProjectResourceEntry) => {
    const key = workspacePathKey(entry.absolutePath);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!childrenByPath[key]) loadDirectory(entry.absolutePath);
  }, [childrenByPath, loadDirectory]);

  const renderRows = (entries: ProjectResourceEntry[], depth = 0): ReactNode => entries.map((entry) => {
    const key = workspacePathKey(entry.absolutePath);
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

  const rootEntries = childrenByPath[workspacePathKey(workspacePath)] || [];
  const rootLoading = workspacePath && loadingByPath.has(workspacePath);
  const isRefreshing = loadingByPath.size > 0;

  return (
    <>
      <div className="mlc-tabs mlc-workspace-tabs resource-workspace-tabs">
        {targetWorkspacePath ? (
          <button className={`mlc-target-tab${workspaceFilterMode === "target" ? " active" : ""}`} onClick={() => { setWorkspaceFilterMode("target"); setActiveWorkspacePath(targetWorkspacePath); }} data-tooltip={`${t("mlc.target", "Target")}: ${cleanDisplayPath(targetWorkspacePath)}`}>
            <Icon name="aim" size={11} />
            <span>{targetCaller?.alias || targetCaller?.name || workspaceBasename(targetWorkspacePath)}</span>
          </button>
        ) : null}
        {workspaceOptions.map((workspace) => (
          <button key={workspacePathKey(workspace.path)} className={workspaceFilterMode === "workspace" && sameWorkspacePath(workspacePath, workspace.path) ? "active" : ""} onClick={() => { setWorkspaceFilterMode("workspace"); setActiveWorkspacePath(workspace.path); }} data-tooltip={workspace.ownerName ? `${cleanDisplayPath(workspace.path)} · ${workspace.ownerName}` : cleanDisplayPath(workspace.path)}>
            <Icon name="folder" size={11} />
            <span>{workspace.name}</span>
          </button>
        ))}
        <button type="button" onClick={refreshLoadedDirectories} disabled={!workspacePath || isRefreshing} data-tooltip={t("resources.refresh", "Refresh resources")} aria-label={t("resources.refresh", "Refresh resources")}>
          <Icon name={isRefreshing ? "spinner" : "refresh"} size={11} className={isRefreshing ? "animate-spin" : undefined} />
        </button>
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
