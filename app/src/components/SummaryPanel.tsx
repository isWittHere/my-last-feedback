import { useCallback, useRef, useState, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
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
import { useActiveCallerSession } from "./useActiveCallerSession";

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
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="code-copy-btn"
      title="Copy"
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
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

  if (match) {
    return (
      <div className="code-block-wrapper">
        <div className="code-block-header">
          <span className="code-block-lang">{match[1]}</span>
          <CopyButton text={codeStr} />
        </div>
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: "0 0 4px 4px",
            fontSize: "0.85em",
            background: "#181818",
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

export function SummaryPanel() {
  const { t } = useTranslation();
  const appMode = useFeedbackStore((s) => s.appMode);
  const legacySummary = useFeedbackStore((s) => s.summary);
  const { session: activeSession, caller } = useActiveCallerSession();

  const summary = appMode === "persistent"
    ? (activeSession?.summary || "")
    : legacySummary;

  const activeCallerColor = caller?.color || null;

  // Build a subtle dark-tinted background from the caller's color
  const panelBg = activeCallerColor
    ? `${activeCallerColor}1a`  // ~10% opacity tint
    : undefined;

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleCopyMarkdown = useCallback(() => {
    if (!summary) return;
    navigator.clipboard.writeText(summary).then(() => {
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
    });
  }, [summary]);

  return (
    <div className="group/summary relative flex flex-col h-full min-h-0 min-w-0" style={panelBg ? { background: panelBg } : undefined}>
      {/* Content — user-select enabled for text selection */}
      <div className="flex-1 overflow-y-auto px-3 pt-1 pb-2 min-w-0" style={{ userSelect: "text" }}>
        {summary ? (
          <div className="prose" style={{ userSelect: "text" }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={{ code: CodeBlock }}
            >
              {summary}
            </ReactMarkdown>
          </div>
        ) : (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "var(--color-text-muted)" }}
          >
            <span className="text-xs italic">{t("summary.empty")}</span>
          </div>
        )}
      </div>

      {/* Floating copy button — bottom right, semi-transparent, visible on hover */}
      {summary && (
        <button
          onClick={handleCopyMarkdown}
          className="absolute bottom-2 right-2 items-center justify-center rounded hidden group-hover/summary:flex"
          style={{
            width: 28,
            height: 28,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "var(--color-text-muted)",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          title={copied ? "Copied!" : "Copy Markdown"}
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          )}
        </button>
      )}
    </div>
  );
}
