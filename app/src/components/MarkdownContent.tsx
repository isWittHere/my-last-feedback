import { useCallback, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { useTranslation } from "react-i18next";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import markdownLanguage from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import { Icon } from "./Icons";
import { useCopyToClipboard } from "./useCopyToClipboard";
import { useIsLightTheme } from "./useIsLightTheme";

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
SyntaxHighlighter.registerLanguage("markdown", markdownLanguage);
SyntaxHighlighter.registerLanguage("md", markdownLanguage);
SyntaxHighlighter.registerLanguage("rust", rust);
SyntaxHighlighter.registerLanguage("rs", rust);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("yml", yaml);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("tsx", tsx);

export interface MarkdownContentProps {
  markdown: string;
  projectDirectory?: string;
  className?: string;
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const { copied, copy } = useCopyToClipboard(1800);
  return (
    <button onClick={() => copy(text)} className="code-copy-btn" title={t("common.copy", "Copy")}>
      {copied ? <Icon name="check" size={14} /> : <Icon name="copy" size={14} />}
    </button>
  );
}

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

function LinkRenderer({
  href,
  children,
  projectDirectory,
  ...rest
}: ComponentProps<"a"> & { node?: unknown; projectDirectory?: string }) {
  const { node: _node, ...filteredRest } = rest as Record<string, unknown>;

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (!href) return;
      event.preventDefault();

      const isWeb = href.startsWith("http://") || href.startsWith("https://");
      const isFileUrl = href.startsWith("file://");
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

export function MarkdownContent({ markdown, projectDirectory, className }: MarkdownContentProps) {
  const LinkRendererWithDir = useCallback(
    (props: ComponentProps<"a"> & { node?: unknown }) => (
      <LinkRenderer {...props} projectDirectory={projectDirectory} />
    ),
    [projectDirectory],
  );

  return (
    <div className={className ? `prose ${className}` : "prose"} style={{ userSelect: "text" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{ code: CodeBlock, a: LinkRendererWithDir }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
