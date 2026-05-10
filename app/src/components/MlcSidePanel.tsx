import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useFeedbackStore, type MlcAttachment, type SelectedMlcDocument } from "../store/feedbackStore";
import { useAgentStore } from "../store/agentStore";
import { AppSelect, type AppSelectOption } from "./AppSelect";
import { Icon, MlcLogoIcon } from "./Icons";
import { MLC_TYPE_TABS, getMlcTypeColor, getMlcTypeConfig, getMlcTypeLabel } from "./mlcTypeConfig";
import { useIsLightTheme } from "./useIsLightTheme";
import { buildWorkspaceOptions } from "../workspace/workspaceCandidates";
import { cleanDisplayPath, sameWorkspacePath, workspaceBasename, workspacePathKey } from "../workspace/workspacePaths";

type SortBy = "updated-desc" | "created-desc" | "created-asc" | "title-asc" | "title-desc";
type ViewMode = "detail" | "compact";
type TooltipPlacement = "auto" | "below" | "above";

interface MlcDocument {
  filePath: string;
  fileName: string;
  title: string;
  description: string;
  project: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  favorite: boolean;
  tags: string[];
  folderName?: string | null;
  folderPath?: string | null;
  workspaceName: string;
  workspacePath: string;
}

type MlcTooltipContent =
  | { kind: "text"; text: string }
  | { kind: "document"; document: MlcDocument };

function dateValue(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatTime(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatExactTime(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function groupLabel(value: string, translate: (key: string, defaultValue: string) => string): string {
  const time = dateValue(value);
  if (!time) return translate("mlc.earlier", "Earlier");

  const now = new Date();
  const current = new Date(time);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfCurrent = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  const days = Math.floor((startOfToday - startOfCurrent) / 86400000);
  if (days <= 0) return translate("mlc.today", "Today");
  if (days === 1) return translate("mlc.yesterday", "Yesterday");
  if (days < 7) return translate("mlc.lastWeek", "Past week");
  return translate("mlc.earlier", "Earlier");
}

function documentTooltip(document: MlcDocument): MlcTooltipContent {
  return { kind: "document", document };
}

function toAttachment(document: MlcDocument): MlcAttachment {
  return {
    filePath: cleanDisplayPath(document.filePath),
    title: document.title,
    description: document.description,
  };
}

function toSelectedDocument(document: MlcDocument): SelectedMlcDocument {
  return {
    filePath: cleanDisplayPath(document.filePath),
    fileName: document.fileName,
    title: document.title,
    description: document.description,
    project: document.project,
    type: document.type,
    updatedAt: document.updatedAt,
    workspaceName: document.workspaceName,
    workspacePath: document.workspacePath,
    folderName: document.folderName,
    folderPath: document.folderPath,
  };
}

export function MlcSidePanel() {
  const { t } = useTranslation();
  const isLightTheme = useIsLightTheme();
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
  const activeWorkspacePath = useFeedbackStore((state) => state.mlcActiveWorkspacePath);
  const setActiveWorkspacePath = useFeedbackStore((state) => state.setMlcActiveWorkspacePath);
  const selectedMlcDocument = useFeedbackStore((state) => state.selectedMlcDocument);
  const setSelectedMlcDocument = useFeedbackStore((state) => state.setSelectedMlcDocument);
  const openDockTab = useFeedbackStore((state) => state.openDockTab);
  const addSessionMlcAttachment = useFeedbackStore((state) => state.addSessionMlcAttachment);
  const addQueuedDraftMlcAttachment = useFeedbackStore((state) => state.addQueuedDraftMlcAttachment);
  const addAgentMlcAttachment = useAgentStore((state) => state.addMlcAttachment);

  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("updated-desc");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [workspaceFilterMode, setWorkspaceFilterMode] = useState<"target" | "workspace">("target");
  const [documents, setDocuments] = useState<MlcDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [tooltip, setTooltip] = useState<{ content: MlcTooltipContent; left: number; top: number } | null>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const loadGenerationRef = useRef(0);

  const sortOptions = useMemo<Array<AppSelectOption<SortBy>>>(() => [
    { value: "updated-desc", label: t("mlc.sortUpdated", "Recently Updated"), icon: "clock" },
    { value: "created-desc", label: t("mlc.sortCreatedDesc", "Newest Created"), icon: "clock" },
    { value: "created-asc", label: t("mlc.sortCreatedAsc", "Oldest Created"), icon: "clock" },
    { value: "title-asc", label: t("mlc.sortTitleAsc", "Title A-Z"), icon: "file-text" },
    { value: "title-desc", label: t("mlc.sortTitleDesc", "Title Z-A"), icon: "file-text" },
  ], [t]);

  const targetWorkspacePath = focusedComposer?.projectDirectory || "";

  const workspaceOptions = useMemo(() => {
    return buildWorkspaceOptions({
      targetWorkspacePath,
      targetOwnerName: targetCaller?.alias || targetCaller?.name,
      workspacePaths: sessionWorkspacePathsKey.split("\n"),
    });
  }, [sessionWorkspacePathsKey, targetCaller?.alias, targetCaller?.name, targetWorkspacePath]);

  const activeWorkspace = useMemo(() => {
    if (workspaceFilterMode === "target" && targetWorkspacePath) return targetWorkspacePath;
    return activeWorkspacePath || workspaceOptions[0]?.path || "";
  }, [activeWorkspacePath, targetWorkspacePath, workspaceFilterMode, workspaceOptions]);

  const workspacePathsKey = useMemo(() => workspaceOptions.map((option) => option.path).join("\n"), [workspaceOptions]);

  const loadDocuments = useCallback(() => {
    const workspacePaths = workspacePathsKey.split("\n").filter(Boolean);
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    if (workspacePaths.length === 0) {
      setDocuments([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    invoke<MlcDocument[]>("mlc_search_documents", { request: { workspacePaths } })
      .then((result) => {
        if (loadGenerationRef.current === generation) setDocuments(result);
      })
      .catch((err) => {
        if (loadGenerationRef.current === generation) setError(String(err));
      })
      .finally(() => {
        if (loadGenerationRef.current === generation) setLoading(false);
      });
  }, [workspacePathsKey]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "hidden") loadDocuments();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") loadDocuments();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadDocuments]);

  const filteredDocuments = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    return documents
      .filter((document) => selectedType === "all" || document.type === selectedType)
      .filter((document) => !favoritesOnly || document.favorite)
      .filter((document) => !activeWorkspace || sameWorkspacePath(document.workspacePath, activeWorkspace))
      .filter((document) => {
        if (!trimmedQuery) return true;
        const haystack = [document.title, document.description, document.project, document.type, document.fileName, ...document.tags].join(" ").toLowerCase();
        return haystack.includes(trimmedQuery);
      })
      .sort((left, right) => {
        if (sortBy === "title-asc") return left.title.localeCompare(right.title);
        if (sortBy === "title-desc") return right.title.localeCompare(left.title);
        if (sortBy === "created-asc") return dateValue(left.createdAt) - dateValue(right.createdAt);
        if (sortBy === "created-desc") return dateValue(right.createdAt) - dateValue(left.createdAt);
        return dateValue(right.updatedAt || right.createdAt) - dateValue(left.updatedAt || left.createdAt);
      });
  }, [activeWorkspace, documents, favoritesOnly, query, selectedType, sortBy]);

  const groupedDocuments = useMemo(() => {
    const groups = new Map<string, MlcDocument[]>();
    const translate = (key: string, defaultValue: string) => t(key, defaultValue);
    for (const document of filteredDocuments) {
      const label = groupLabel(document.updatedAt || document.createdAt, translate);
      groups.set(label, [...(groups.get(label) || []), document]);
    }
    return Array.from(groups.entries());
  }, [filteredDocuments, t]);

  const canAttach = Boolean(focusedComposer);

  const handleAttach = useCallback((document: MlcDocument) => {
    if (!focusedComposer) return;
    const attachment = toAttachment(document);
    if (focusedComposer.kind === "agent" && focusedComposer.sessionId) addAgentMlcAttachment(focusedComposer.sessionId, attachment);
    else if (focusedComposer.kind === "queuedDraft") addQueuedDraftMlcAttachment(focusedComposer.callerId, attachment);
    else if (focusedComposer.sessionId) addSessionMlcAttachment(focusedComposer.sessionId, attachment);
  }, [addAgentMlcAttachment, addQueuedDraftMlcAttachment, addSessionMlcAttachment, focusedComposer]);

  const handleSelectDocument = useCallback((document: MlcDocument) => {
    setSelectedMlcDocument(toSelectedDocument(document));
    openDockTab("mlcPreview", "leftPage");
  }, [openDockTab, setSelectedMlcDocument]);

  const handleDelete = useCallback((document: MlcDocument) => {
    if (!window.confirm(t("mlc.deleteConfirm", "Delete \"{{name}}\"?").replace("{{name}}", document.title))) return;
    invoke("mlc_delete_document", { filePath: document.filePath })
      .then(() => {
        setDocuments((current) => current.filter((item) => item.filePath !== document.filePath));
        if (selectedMlcDocument?.filePath === cleanDisplayPath(document.filePath)) setSelectedMlcDocument(null);
      })
      .catch((err) => setError(String(err)));
  }, [selectedMlcDocument?.filePath, setSelectedMlcDocument, t]);

  const handleToggleFavorite = useCallback((document: MlcDocument) => {
    invoke<boolean>("mlc_toggle_favorite", { filePath: document.filePath })
      .then((favorite) => {
        setDocuments((current) => current.map((item) => item.filePath === document.filePath ? { ...item, favorite, updatedAt: new Date().toISOString() } : item));
      })
      .catch((err) => setError(String(err)));
  }, []);

  const toggleGroupCollapsed = useCallback((label: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const clearTooltip = useCallback(() => {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setTooltip(null);
  }, []);

  const tooltipProps = useCallback((content: MlcTooltipContent | string | null, placement: TooltipPlacement = "auto") => {
    const tooltipContent = typeof content === "string" ? { kind: "text" as const, text: content } : content;
    const estimateHeight = (value: MlcTooltipContent): number => {
      if (value.kind === "text") return Math.min(72, 26 + Math.ceil(value.text.length / 52) * 16);
      const document = value.document;
      const titleRows = Math.min(2, Math.max(1, Math.ceil(document.title.length / 46)));
      const descRows = document.description ? Math.min(4, Math.ceil(document.description.length / 54)) : 0;
      const pathRows = Math.min(3, Math.max(1, Math.ceil(cleanDisplayPath(document.filePath).length / 58)));
      return Math.min(260, 74 + titleRows * 18 + descRows * 17 + pathRows * 16);
    };
    const getPosition = (rect: DOMRect) => ({
      left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - 368)),
      top: (() => {
        if (!tooltipContent) return rect.bottom + 6;
        const gap = 6;
        const viewportPadding = 8;
        const estimatedHeight = estimateHeight(tooltipContent);
        const fitsBelow = rect.bottom + gap + estimatedHeight <= window.innerHeight - viewportPadding;
        const fitsAbove = rect.top - gap - estimatedHeight >= viewportPadding;
        const placeAbove = placement === "above" || (placement === "auto" && !fitsBelow && fitsAbove);
        const preferredTop = placeAbove ? rect.top - gap - estimatedHeight : rect.bottom + gap;
        return Math.min(
          Math.max(viewportPadding, preferredTop),
          Math.max(viewportPadding, window.innerHeight - viewportPadding - estimatedHeight),
        );
      })(),
    });
    return {
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
      clearTooltip();
      if (!tooltipContent) return;
      const rect = event.currentTarget.getBoundingClientRect();
      tooltipTimerRef.current = window.setTimeout(() => {
        const { left, top } = getPosition(rect);
        setTooltip({ content: tooltipContent, left, top });
      }, 400);
    },
    onMouseLeave: clearTooltip,
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      if (!tooltipContent) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const { left, top } = getPosition(rect);
      setTooltip({ content: tooltipContent, left, top });
    },
    onBlur: clearTooltip,
  };
  }, [clearTooltip]);

  const renderTooltipContent = (content: MlcTooltipContent) => {
    if (content.kind === "text") return content.text;
    const document = content.document;
    const config = getMlcTypeConfig(document.type);
    const type = getMlcTypeLabel(document.type);
    return (
      <div className="mlc-tooltip-doc">
        <div className="mlc-tooltip-title">{document.title}</div>
        <div className="mlc-tooltip-time">{formatExactTime(document.updatedAt || document.createdAt)}</div>
        <div className="mlc-tooltip-type-tag">
          <Icon name={config?.icon || "message"} size={12} color={getMlcTypeColor(document.type, isLightTheme)} />
          <span>{type}</span>
        </div>
        {document.description ? <div className="mlc-tooltip-desc">{document.description}</div> : null}
        <div className="mlc-tooltip-path">{cleanDisplayPath(document.filePath)}</div>
      </div>
    );
  };

  const renderDocumentActions = (document: MlcDocument) => (
    <div className="mlc-doc-actions">
      <button className="mlc-doc-action-del" onClick={(event) => { event.stopPropagation(); handleDelete(document); }} title={t("mlc.delete", "Delete")}>
        <Icon name="trash" size={12} />
      </button>
      <button className="mlc-doc-action-copy" onClick={(event) => { event.stopPropagation(); navigator.clipboard.writeText(document.filePath); }} title={t("mlc.copyPath", "Copy link")}>
        <Icon name="copy" size={12} />
      </button>
      <button className={`mlc-doc-action-fav${document.favorite ? " active" : ""}`} onClick={(event) => { event.stopPropagation(); handleToggleFavorite(document); }} title={document.favorite ? t("mlc.unfavorite", "Unfavorite") : t("mlc.favorite", "Favorite")}>
        <Icon name={document.favorite ? "star-full" : "star-empty"} size={12} />
      </button>
      <button className="mlc-doc-action-attach" onClick={(event) => { event.stopPropagation(); handleAttach(document); }} disabled={!canAttach} title={t("mlc.insertToChat", "Insert to chat")}>
        <Icon name="arrow-bend-down-right" size={12} />
      </button>
    </div>
  );

  return (
    <>
      <div className="mlc-search-row">
        <Icon name="search" size={13} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("mlc.search", "Search...")} />
      </div>

      <div className="mlc-control-row">
        <AppSelect value={sortBy} options={sortOptions} onChange={setSortBy} ariaLabel={t("mlc.sortUpdated", "Recently Updated")} className="mlc-sort-select" />
        <button className={`mlc-toggle-btn${favoritesOnly ? " active" : ""}`} onClick={() => setFavoritesOnly((value) => !value)} title={t("mlc.favorites", "Favorites")}>
          <Icon name={favoritesOnly ? "star-full" : "star-empty"} size={13} />
        </button>
        <button className="mlc-toggle-btn" onClick={() => setViewMode((mode) => mode === "detail" ? "compact" : "detail")} title={viewMode === "detail" ? t("mlc.compactView", "Compact view") : t("mlc.detailView", "Detailed view")}>
          <Icon name={viewMode === "detail" ? "menu" : "list-tree"} size={13} />
        </button>
        <button className="mlc-toggle-btn" onClick={loadDocuments} disabled={loading} title={t("mlc.refresh", "Refresh")}> 
          <Icon name={loading ? "spinner" : "refresh"} size={13} className={loading ? "animate-spin" : undefined} />
        </button>
      </div>

      <div className="mlc-tabs">
        {MLC_TYPE_TABS.map((tab) => (
          <button key={tab.value} className={selectedType === tab.value ? "active" : ""} onClick={() => setSelectedType(tab.value)} {...tooltipProps(tab.label)}>
            {tab.icon ? <Icon name={tab.icon} size={11} color={getMlcTypeColor(tab.value, isLightTheme)} /> : null}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="mlc-tabs mlc-workspace-tabs">
        {targetWorkspacePath ? (
          <button className={`mlc-target-tab${workspaceFilterMode === "target" ? " active" : ""}`} onClick={() => { setWorkspaceFilterMode("target"); setActiveWorkspacePath(targetWorkspacePath); }} {...tooltipProps(`${t("mlc.target", "Target")}: ${cleanDisplayPath(targetWorkspacePath)}`)}>
            <Icon name="aim" size={11} />
            <span>{targetCaller?.alias || targetCaller?.name || workspaceBasename(targetWorkspacePath)}</span>
          </button>
        ) : null}
        {workspaceOptions.map((workspace) => (
          <button key={workspacePathKey(workspace.path)} className={workspaceFilterMode === "workspace" && sameWorkspacePath(activeWorkspace, workspace.path) ? "active" : ""} onClick={() => { setWorkspaceFilterMode("workspace"); setActiveWorkspacePath(workspace.path); }} {...tooltipProps(workspace.ownerName ? `${cleanDisplayPath(workspace.path)} · ${workspace.ownerName}` : cleanDisplayPath(workspace.path))}>
            <Icon name="folder" size={11} />
            <span>{workspace.name}</span>
          </button>
        ))}
      </div>

      <div className="mlc-list">
        {loading ? (
          <div className="mlc-list-empty"><Icon name="spinner" size={24} className="animate-spin" /><div>{t("mlc.loading", "Loading...")}</div></div>
        ) : error ? (
          <div className="mlc-list-empty"><Icon name="circle-x" size={24} /><div>{error}</div></div>
        ) : groupedDocuments.length === 0 ? (
          <div className="mlc-list-empty"><MlcLogoIcon size={26} /><div>{t("mlc.empty", "No MLC references loaded")}</div></div>
        ) : groupedDocuments.map(([label, items]) => {
          const isCollapsed = collapsedGroups.has(label);
          return (
            <section key={label} className="mlc-group">
              <button type="button" className="mlc-group-header" onClick={() => toggleGroupCollapsed(label)} aria-expanded={!isCollapsed}>
                <Icon name={isCollapsed ? "chevron-right" : "chevron-down"} size={12} />
                <span className="mlc-group-label">{label}</span>
                <span className="mlc-group-count">({items.length})</span>
              </button>
              <div className={`mlc-group-items${isCollapsed ? " collapsed" : ""}`}>
                {items.map((document) => (
                  <article key={document.filePath} className={`mlc-doc-item ${viewMode}${selectedMlcDocument?.filePath === cleanDisplayPath(document.filePath) ? " selected" : ""}`} onClick={() => handleSelectDocument(document)}>
                    <Icon name={getMlcTypeConfig(document.type)?.icon || "message"} size={viewMode === "compact" ? 14 : 18} className="mlc-doc-icon" color={getMlcTypeColor(document.type, isLightTheme)} />
                    <div className="mlc-doc-content">
                      <div className="mlc-doc-title" {...tooltipProps(documentTooltip(document))}>{document.title}</div>
                      {viewMode === "detail" && document.description ? <div className="mlc-doc-desc">{document.description}</div> : null}
                      {viewMode === "detail" && document.tags.length > 0 ? (
                        <div className="mlc-doc-tags">{document.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div>
                      ) : null}
                      {viewMode === "detail" ? (
                        <div className="mlc-doc-footer">
                          <span className="mlc-doc-time" {...tooltipProps(formatExactTime(document.updatedAt || document.createdAt))}>{formatTime(document.updatedAt || document.createdAt)}</span>
                          {renderDocumentActions(document)}
                        </div>
                      ) : null}
                    </div>
                    {viewMode === "compact" ? renderDocumentActions(document) : null}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {tooltip ? <div className="mlc-custom-tooltip" style={{ left: tooltip.left, top: tooltip.top }}>{renderTooltipContent(tooltip.content)}</div> : null}
    </>
  );
}