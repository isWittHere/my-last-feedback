import { Children, useCallback, type ComponentProps, type ReactNode } from "react";
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
import { parseComposerInlineTokens } from "../composer/composerTokens";
import { resourceLinkInfo } from "../composer/resourceLinks";
import { ColorToken } from "./composer/ColorToken";
import { ResourceLinkToken } from "./composer/ResourceLinkToken";
import { SlashCommandToken } from "./composer/SlashCommandToken";

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
  variant?: "summary" | "mlcPreview" | "feedback";
  enableComposerTokens?: boolean;
  composerCommands?: ReadonlySet<string>;
}

type MarkdownAnchorProps = ComponentProps<"a"> & { node?: unknown };
type MarkdownParagraphProps = ComponentProps<"p"> & { node?: unknown };
type MarkdownListItemProps = ComponentProps<"li"> & { node?: unknown };
type MarkdownTableCellProps = ComponentProps<"td"> & { node?: unknown };
type MarkdownTableHeaderProps = ComponentProps<"th"> & { node?: unknown };

function stripMarkdownNodeProp<T extends Record<string, unknown>>(props: T): Omit<T, "node"> {
  const { node: _node, ...rest } = props;
  return rest;
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
  enableComposerTokens,
  ...rest
}: MarkdownAnchorProps & { projectDirectory?: string; enableComposerTokens?: boolean }) {
  const filteredRest = stripMarkdownNodeProp(rest as Record<string, unknown>);
  const label = Children.toArray(children).map((child) => typeof child === "string" ? child : "").join("") || href || "resource";
  const resource = href && enableComposerTokens ? resourceLinkInfo(label, href, projectDirectory) : null;

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

  if (resource) {
    return <ResourceLinkToken label={resource.label} href={resource.normalizedHref} kind={resource.kind} />;
  }

  return (
    <a href={href} onClick={handleClick} style={{ cursor: "pointer" }} {...filteredRest}>
      {children}
    </a>
  );
}

function renderComposerInlineText(text: string, commands?: ReadonlySet<string>): ReactNode[] {
  return parseComposerInlineTokens(text, commands).map((token, index) => {
    if (token.type === "url") {
      return <a key={index} href={token.value}>{token.value}</a>;
    }
    if (token.type === "color") {
      return <ColorToken key={index} value={token.value} />;
    }
    if (token.type === "slashCommand") {
      return <SlashCommandToken key={index} raw={token.raw} matched={token.matched} />;
    }
    return token.value;
  });
}

function renderComposerChildren(children: ReactNode, commands?: ReadonlySet<string>): ReactNode {
  return Children.toArray(children).flatMap((child, index) => {
    if (typeof child === "string") return renderComposerInlineText(child, commands).map((node, childIndex) => <span key={`${index}-${childIndex}`}>{node}</span>);
    return child;
  });
}

export function MarkdownContent({ markdown, projectDirectory, className, variant, enableComposerTokens, composerCommands }: MarkdownContentProps) {
  const LinkRendererWithDir = useCallback(
    (props: ComponentProps<"a"> & { node?: unknown }) => (
      <LinkRenderer {...props} projectDirectory={projectDirectory} enableComposerTokens={enableComposerTokens} />
    ),
    [enableComposerTokens, projectDirectory],
  );

  const ParagraphRenderer = useCallback(
    ({ children, ...rest }: MarkdownParagraphProps) => <p {...stripMarkdownNodeProp(rest as Record<string, unknown>)}>{enableComposerTokens ? renderComposerChildren(children, composerCommands) : children}</p>,
    [composerCommands, enableComposerTokens],
  );

  const ListItemRenderer = useCallback(
    ({ children, ...rest }: MarkdownListItemProps) => <li {...stripMarkdownNodeProp(rest as Record<string, unknown>)}>{enableComposerTokens ? renderComposerChildren(children, composerCommands) : children}</li>,
    [composerCommands, enableComposerTokens],
  );

  const TableCellRenderer = useCallback(
    ({ children, ...rest }: MarkdownTableCellProps) => <td {...stripMarkdownNodeProp(rest as Record<string, unknown>)}>{enableComposerTokens ? renderComposerChildren(children, composerCommands) : children}</td>,
    [composerCommands, enableComposerTokens],
  );

  const TableHeaderRenderer = useCallback(
    ({ children, ...rest }: MarkdownTableHeaderProps) => <th {...stripMarkdownNodeProp(rest as Record<string, unknown>)}>{enableComposerTokens ? renderComposerChildren(children, composerCommands) : children}</th>,
    [composerCommands, enableComposerTokens],
  );

  const rootClassName = ["prose", className, variant ? `prose-${variant}` : null].filter(Boolean).join(" ");

  return (
    <div className={rootClassName} style={{ userSelect: "text" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{ code: CodeBlock, a: LinkRendererWithDir, p: ParagraphRenderer, li: ListItemRenderer, td: TableCellRenderer, th: TableHeaderRenderer }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
