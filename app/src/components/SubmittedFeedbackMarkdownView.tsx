import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./Icons";
import { MarkdownContent } from "./MarkdownContent";
import {
  getSubmittedViewSettings,
  identifySubmittedViewSection,
  SUBMITTED_VIEW_SETTINGS_EVENT,
  type SubmittedViewSectionId,
  type SubmittedViewSettings,
} from "../submittedViewSettings";

interface SubmittedMarkdownSection {
  id: SubmittedViewSectionId;
  key: string;
  title: string;
  content: string;
}

interface SubmittedFeedbackMarkdownViewProps {
  markdown: string;
  projectDirectory?: string;
  composerCommands?: ReadonlySet<string>;
}

const HEADING_RE = /^##\s+(.+)\s*$/gm;

function splitSubmittedMarkdown(markdown: string): SubmittedMarkdownSection[] {
  const matches = Array.from(markdown.matchAll(HEADING_RE));
  if (matches.length === 0) {
    const trimmed = markdown.trim();
    return trimmed
      ? [{ id: "userFeedback", key: "userFeedback-0", title: "User Feedback", content: trimmed }]
      : [];
  }

  const sections: SubmittedMarkdownSection[] = [];
  const leading = markdown.slice(0, matches[0].index).trim();
  if (leading) {
    sections.push({ id: "userFeedback", key: "userFeedback-leading", title: "User Feedback", content: leading });
  }

  matches.forEach((match, index) => {
    const title = (match[1] || "").trim();
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index || markdown.length : markdown.length;
    const content = markdown.slice(start, end).trim();
    const id = identifySubmittedViewSection(title);
    sections.push({ id, key: `${id}-${index}-${title}`, title, content });
  });

  return sections;
}

function SubmittedMarkdownSectionView({
  section,
  expanded,
  onToggle,
  projectDirectory,
  composerCommands,
}: {
  section: SubmittedMarkdownSection;
  expanded: boolean;
  onToggle: () => void;
  projectDirectory?: string;
  composerCommands?: ReadonlySet<string>;
}) {
  return (
    <section className={`submitted-md-section submitted-md-section-${section.id} submitted-md-section-${expanded ? "expanded" : "collapsed"}`}>
      <h2 className="submitted-md-section-heading">
        <button className="submitted-md-section-header" type="button" onClick={onToggle} aria-expanded={expanded}>
          <span className="submitted-md-section-title">{section.title}</span>
          <Icon name={expanded ? "chevron-down" : "chevron-right"} size={16} />
        </button>
      </h2>
      {expanded && section.content && (
        <MarkdownContent
          markdown={section.content}
          projectDirectory={projectDirectory}
          className="readonly-feedback-markdown submitted-md-section-body"
          variant="feedback"
          enableComposerTokens
          composerCommands={composerCommands}
        />
      )}
    </section>
  );
}

export function SubmittedFeedbackMarkdownView({ markdown, projectDirectory, composerCommands }: SubmittedFeedbackMarkdownViewProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<SubmittedViewSettings>(getSubmittedViewSettings);
  const sections = useMemo(() => splitSubmittedMarkdown(markdown), [markdown]);
  const visibleSections = useMemo(
    () => sections.filter((section) => settings.visibleSections[section.id] !== false),
    [sections, settings.visibleSections],
  );
  const sectionKey = useMemo(() => visibleSections.map((section) => section.key).join("|"), [visibleSections]);
  const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handleSettingsChange = (event: Event) => {
      const detail = (event as CustomEvent<SubmittedViewSettings>).detail;
      setSettings(detail || getSubmittedViewSettings());
    };
    window.addEventListener(SUBMITTED_VIEW_SETTINGS_EVENT, handleSettingsChange);
    return () => window.removeEventListener(SUBMITTED_VIEW_SETTINGS_EVENT, handleSettingsChange);
  }, []);

  useEffect(() => {
    setExpandedByKey((current) => {
      const next: Record<string, boolean> = {};
      visibleSections.forEach((section) => {
        next[section.key] = current[section.key] ?? !settings.collapsedSections[section.id];
      });
      return next;
    });
  }, [sectionKey, settings.collapsedSections, visibleSections]);

  if (visibleSections.length === 0) {
    return <div className="submitted-md-empty">{t("settings.submittedNoVisibleSections", "No submitted feedback sections are visible.")}</div>;
  }

  return (
    <div className="submitted-md-view">
      {visibleSections.map((section) => (
        <SubmittedMarkdownSectionView
          key={section.key}
          section={section}
          expanded={expandedByKey[section.key] ?? !settings.collapsedSections[section.id]}
          onToggle={() => setExpandedByKey((current) => ({ ...current, [section.key]: !(current[section.key] ?? !settings.collapsedSections[section.id]) }))}
          projectDirectory={projectDirectory}
          composerCommands={composerCommands}
        />
      ))}
    </div>
  );
}