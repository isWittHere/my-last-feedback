import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../store/feedbackStore";
import { Icon } from "./Icons";
import { useActiveCallerSession } from "./useActiveCallerSession";
import { IdenticonAvatar } from "./IdenticonAvatar";
import { useCopyToClipboard } from "./useCopyToClipboard";
import { useFriendlyName } from "./useFriendlyName";
import { useIsLightTheme } from "./useIsLightTheme";
import type { QuestionItem } from "../store/feedbackStore";

SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("py", python);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("shell", bash);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("md", markdown);
SyntaxHighlighter.registerLanguage("rust", rust);
SyntaxHighlighter.registerLanguage("rs", rust);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("yml", yaml);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("tsx", tsx);

/** Copy-to-clipboard button inside code blocks */
function CopyButton({ text }: { text: string }) {
  const { copied, copy } = useCopyToClipboard(1800);
  return (
    <button onClick={() => copy(text)} className="code-copy-btn" title="Copy">
      {copied ? <Icon name="check" size={14} /> : <Icon name="copy" size={14} />}
    </button>
  );
}

/** Custom code renderer with syntax highlighting */
function CodeBlock({
  className,
  children,
  ...rest
}: ComponentProps<"code"> & { node?: unknown }) {
  const { node: _node, ...filteredRest } = rest as Record<string, unknown>;
  const match = /language-(\w+)/.exec(className || "");
  const codeStr = String(children).replace(/\n$/, "");
  const isLight = useIsLightTheme();

  if (match) {
    return (
      <div className="code-block-wrapper">
        <div className="code-block-header">
          <span className="code-block-lang">{match[1]}</span>
          <CopyButton text={codeStr} />
        </div>
        <SyntaxHighlighter
          style={isLight ? oneLight : oneDark}
          language={match[1]}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: "0 0 4px 4px",
            fontSize: "0.85em",
            background: isLight ? "#fafafa" : "#181818",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {codeStr}
        </SyntaxHighlighter>
      </div>
    );
  }

  return (
    <code className={className} {...filteredRest}>
      {children}
    </code>
  );
}

/** Custom link renderer: web links open in browser, local paths open in file explorer / VS Code */
function LinkRenderer({
  href,
  children,
  projectDirectory,
  ...rest
}: ComponentProps<"a"> & { node?: unknown; projectDirectory?: string }) {
  const { node: _node, ...filteredRest } = rest as Record<string, unknown>;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!href) return;
      e.preventDefault();

      const isWeb = href.startsWith("http://") || href.startsWith("https://");
      const isFileUrl = href.startsWith("file://");
      // Windows absolute path (C:\...) or Unix absolute path (/...)
      const isAbsolutePath = /^[a-zA-Z]:[/\\]/.test(href) || href.startsWith("/");

      if (isWeb) {
        import("@tauri-apps/plugin-opener")
          .then(({ openUrl }) => openUrl(href))
          .catch(() => window.open(href, "_blank", "noopener,noreferrer"));
      } else if (isFileUrl || isAbsolutePath) {
        const path = isFileUrl
          ? decodeURIComponent(href.replace(/^file:\/\/\/?/, ""))
          : href;
        import("@tauri-apps/plugin-opener")
          .then(({ openPath }) => openPath(path))
          .catch(() => window.open(href, "_blank", "noopener,noreferrer"));
      } else {
        // Relative path — try to resolve against projectDirectory
        const base = projectDirectory || "";
        const resolved = base ? `${base}/${href}`.replace(/\\/g, "/") : href;
        import("@tauri-apps/plugin-opener")
          .then(({ openPath }) => openPath(resolved))
          .catch(() => window.open(href, "_blank", "noopener,noreferrer"));
      }
    },
    [href, projectDirectory],
  );

  return (
    <a href={href} onClick={handleClick} style={{ cursor: "pointer" }} {...filteredRest}>
      {children}
    </a>
  );
}

/** Questions form rendered at the bottom of the summary panel */
function QuestionsForm({
  questions,
  sessionId,
  isReadonly,
  callerColor,
  callerAlias,
  onAnswerChange,
  onToggleOption,
  onFillTemplate,
}: {
  questions: QuestionItem[];
  sessionId: string;
  isReadonly: boolean;
  callerColor: string | null;
  callerAlias: string;
  onAnswerChange: (sessionId: string, index: number, answer: string) => void;
  onToggleOption: (sessionId: string, index: number, option: string) => void;
  onFillTemplate: () => void;
}) {
  const { t } = useTranslation();
  const friendlyName = useFriendlyName();
  const borderColor = callerColor || "var(--color-border)";

  return (
    <div
      className="questions-form"
      style={{ borderTop: `1px solid ${borderColor}44`, marginTop: 12, paddingTop: 10 }}
    >
      <div className="questions-form-header" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {callerAlias ? (
          <>
            <IdenticonAvatar alias={callerAlias} color={callerColor || "#888"} size={22} />
            <span style={{ fontSize: 14, lineHeight: "22px", color: "var(--color-text-muted)" }}>
              <span style={{ fontWeight: 600, color: callerColor || "var(--color-text-primary)", fontFamily: "'Cascadia Code', 'Consolas', 'SF Mono', 'Monaco', monospace" }}>{friendlyName(callerAlias)} ({callerAlias})</span>
              {" "}{t("questions.titleWithAlias_suffix", "asks you:")}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, color: callerColor || "var(--color-text-primary)" }}>
            {t("questions.title", "Agent Questions")}
          </span>
        )}
        {!isReadonly && (
          <button
            className="questions-fill-btn"
            onClick={(e) => { e.stopPropagation(); onFillTemplate(); }}
            title={t("questions.fillTemplate", "Fill template to feedback")}
          >
            <Icon name="arrow-down-right" size={12} />
          </button>
        )}
      </div>

      <div className="questions-list">
        {questions.map((q, i) => (
          <div key={i} className="questions-item">
            {/* Row 1: number + label + option chips */}
            <div className="questions-item-header">
              <span className="questions-row-num">{i + 1}</span>
              <span className="questions-label">{q.label}</span>
              {q.options && q.options.length > 0 && (
                <div className="questions-chips">
                  {q.options.map((opt, j) => {
                    const isSelected = (q.selectedOptions || []).includes(opt);
                    return (
                      <button
                        key={j}
                        className={`questions-chip${isSelected ? " active" : ""}`}
                        style={isSelected ? { background: callerColor || "var(--color-primary)", borderColor: callerColor || "var(--color-primary)", color: "#fff" } : undefined}
                        disabled={isReadonly}
                        onClick={() => {
                          if (!isReadonly) {
                            onToggleOption(sessionId, i, opt);
                          }
                        }}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Row 2: answer textarea (full width, auto-resizing) */}
            <textarea
              className="questions-input"
              value={q.answer}
              readOnly={isReadonly}
              rows={1}
              placeholder={isReadonly ? "" : t("questions.inputPlaceholder", { label: q.label })}
              onChange={(e) => {
                if (!isReadonly) {
                  onAnswerChange(sessionId, i, e.target.value);
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.max(el.scrollHeight, 28) + "px";
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Parse headings from raw markdown text */
interface HeadingEntry { level: number; text: string; index: number; }

function parseHeadings(md: string): HeadingEntry[] {
  const result: HeadingEntry[] = [];
  const lines = md.split("\n");
  let inCodeBlock = false;
  let idx = 0;
  for (const line of lines) {
    // Toggle code block state on fenced code markers
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const m = /^(#{1,4})\s+(.+)$/.exec(line);
    if (m) {
      result.push({ level: m[1].length, text: m[2].trim(), index: idx++ });
    }
  }
  return result;
}

/** Minimap-style heading navigation bar (lines only, no text) */
function HeadingNavBar({
  headings,
  scrollContainerRef,
  activeIndex,
}: {
  headings: HeadingEntry[];
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  activeIndex: number;
}) {
  if (headings.length === 0) return null;

  const handleClick = (h: HeadingEntry) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    // Find the matching heading element inside the prose
    const allHeadings = container.querySelectorAll("h1, h2, h3, h4");
    const target = allHeadings[h.index] as HTMLElement | undefined;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Width based on heading level: h1=100%, h2=70%, h3=45%, h4=25%
  const widthMap: Record<number, string> = { 1: "100%", 2: "70%", 3: "45%", 4: "25%" };
  const thicknessMap: Record<number, number> = { 1: 3, 2: 2, 3: 2, 4: 1 };

  return (
    <div className="heading-nav-bar">
      {headings.map((h, i) => (
        <button
          key={i}
          className={`heading-nav-line${i === activeIndex ? " active" : ""}`}
          style={{
            width: widthMap[h.level] || "25%",
            height: thicknessMap[h.level] || 1,
          }}
          title={h.text}
          onClick={() => handleClick(h)}
        />
      ))}
    </div>
  );
}

export function SummaryPanel() {
  const { t } = useTranslation();
  const friendlyName = useFriendlyName();
  const appMode = useFeedbackStore((s) => s.appMode);
  const legacySummary = useFeedbackStore((s) => s.summary);
  const { session: activeSession, caller } = useActiveCallerSession();
  const updateSessionAnswer = useFeedbackStore((s) => s.updateSessionAnswer);
  const toggleSessionOption = useFeedbackStore((s) => s.toggleSessionOption);
  const updateSessionField = useFeedbackStore((s) => s.updateSessionField);

  const legacyProjectDirectory = useFeedbackStore((s) => s.projectDirectory);

  const summary = appMode === "persistent"
    ? (activeSession?.summary || "")
    : legacySummary;

  const projectDirectory = appMode === "persistent"
    ? (activeSession?.projectDirectory || "")
    : legacyProjectDirectory;

  const questions = activeSession?.questions || [];
  const isReadonly = activeSession?.status === "responded" || activeSession?.status === "cancelled";

  const activeCallerColor = caller?.color || null;

  // Build a subtle tinted background from the caller's color
  const isLightTheme = useIsLightTheme();
  const panelBg = activeCallerColor
    ? `${activeCallerColor}${isLightTheme ? "0d" : "1a"}`  // light: ~5%, dark: ~10%
    : undefined;

  const { copied, copy: copyMarkdown } = useCopyToClipboard(1800);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeHeadingIdx, setActiveHeadingIdx] = useState(0);

  const headings = useMemo(() => parseHeadings(summary), [summary]);

  // Track which heading is currently in view
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || headings.length === 0) return;
    const onScroll = () => {
      const hEls = container.querySelectorAll("h1, h2, h3, h4");
      let active = 0;
      for (let i = 0; i < hEls.length; i++) {
        const rect = hEls[i].getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        if (rect.top - cRect.top <= 40) active = i;
      }
      setActiveHeadingIdx(active);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [headings]);

  const handleFillTemplate = useCallback(() => {
    if (!activeSession || questions.length === 0) return;
    const template = questions.map((q, i) => `${i + 1}. ${q.label}\n`).join("\n");
    updateSessionField(activeSession.id, "feedbackText", template);
  }, [activeSession, questions, updateSessionField]);

  const handleCopyMarkdown = useCallback(() => {
    if (summary) copyMarkdown(summary);
  }, [summary, copyMarkdown]);

  // Memoised link renderer that carries the current projectDirectory context
  const LinkRendererWithDir = useMemo(
    () =>
      (props: ComponentProps<"a"> & { node?: unknown }) => (
        <LinkRenderer {...props} projectDirectory={projectDirectory} />
      ),
    [projectDirectory],
  );

  return (
    <div
      className="group/summary relative flex flex-col h-full min-h-0 min-w-0"
      style={{
        ...(panelBg ? { background: panelBg } : {}),
        "--caller-color": activeCallerColor || "var(--color-primary)",
      } as React.CSSProperties}
    >
      {/* Content — user-select enabled for text selection */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pt-1 pb-12 min-w-0" style={{ userSelect: "text" }}>
        {summary ? (
          <>
            {/* Agent identity header */}
            {appMode === "persistent" && caller && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0 4px" }}>
                <IdenticonAvatar alias={caller.alias || caller.name} color={caller.color} size={22} />
                <span style={{ fontSize: 14, lineHeight: "22px", color: "var(--color-text-muted)" }}>
                  <span style={{ fontWeight: 600, color: caller.color }}>{caller.alias ? friendlyName(caller.alias) : caller.name.charAt(0).toUpperCase()}</span>
                  {" "}{t("summary.says", "says:")}
                </span>
              </div>
            )}
            <div className="prose" style={{ userSelect: "text" }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{ code: CodeBlock, a: LinkRendererWithDir }}
              >
                {summary}
              </ReactMarkdown>
            </div>
          </>
        ) : (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "var(--color-text-muted)" }}
          >
            <span className="text-xs italic">{t("summary.empty")}</span>
          </div>
        )}

        {/* Agent Questions Form */}
        {questions.length > 0 && (
          <QuestionsForm
            questions={questions}
            sessionId={activeSession?.id || ""}
            isReadonly={isReadonly}
            callerColor={activeCallerColor}
            callerAlias={caller?.alias || ""}
            onAnswerChange={updateSessionAnswer}
            onToggleOption={toggleSessionOption}
            onFillTemplate={handleFillTemplate}
          />
        )}
      </div>

      {/* Heading minimap nav bar — right side */}
      {summary && headings.length > 0 && (
        <HeadingNavBar
          headings={headings}
          scrollContainerRef={scrollRef}
          activeIndex={activeHeadingIdx}
        />
      )}

      {/* Floating copy button — bottom right, semi-transparent, visible on hover */}
      {summary && (
        <button
          onClick={handleCopyMarkdown}
          className="absolute bottom-2 right-2 items-center justify-center rounded hidden group-hover/summary:flex"
          style={{
            width: 28,
            height: 28,
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-muted)",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          title={copied ? "Copied!" : "Copy Markdown"}
        >
          {copied ? (
            <Icon name="check" size={14} color="var(--color-success)" />
          ) : (
            <Icon name="copy" size={14} />
          )}
        </button>
      )}
    </div>
  );
}
