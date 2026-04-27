import { forwardRef, useImperativeHandle, useMemo, useRef, type TextareaHTMLAttributes } from "react";
import { parseComposerTextTokens } from "../composer/composerTokens";

interface TokenizedTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  containerClassName?: string;
  projectDirectory?: string;
  composerCommands?: ReadonlySet<string>;
}

export const TokenizedTextarea = forwardRef<HTMLTextAreaElement, TokenizedTextareaProps>(function TokenizedTextarea({
  containerClassName,
  projectDirectory,
  composerCommands,
  className,
  style,
  value,
  onScroll,
  ...textareaProps
}, forwardedRef) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const textValue = typeof value === "string" ? value : String(value || "");
  const tokens = useMemo(
    () => parseComposerTextTokens(textValue, { knownCommands: composerCommands, projectDirectory }),
    [composerCommands, projectDirectory, textValue],
  );

  useImperativeHandle(forwardedRef, () => textareaRef.current as HTMLTextAreaElement);

  return (
    <div className={`tokenized-textarea-root${containerClassName ? ` ${containerClassName}` : ""}`} style={{ minHeight: style?.minHeight, height: style?.height }}>
      <div ref={overlayRef} className={`input-area tokenized-textarea-overlay${className ? ` ${className.replace(/\bflex-1\b/g, "").trim()}` : ""}`} aria-hidden="true" style={style}>
        {tokens.map((token, index) => {
          if (token.type === "resourceLink") {
            return <span key={index} className="composer-edit-token composer-edit-token-resource">{token.raw}</span>;
          }
          if (token.type === "slashCommand") {
            return <span key={index} className={`composer-edit-token composer-edit-token-command${token.matched ? "" : " unmatched"}`}>{token.raw}</span>;
          }
          if (token.type === "color") {
            return <span key={index} className="composer-edit-token composer-edit-token-color">{token.value}</span>;
          }
          return <span key={index}>{token.value}</span>;
        })}
      </div>
      <textarea
        {...textareaProps}
        ref={textareaRef}
        value={value}
        className={`tokenized-textarea-input ${className || ""}`.trim()}
        style={style}
        onScroll={(event) => {
          if (overlayRef.current) {
            overlayRef.current.scrollTop = event.currentTarget.scrollTop;
            overlayRef.current.scrollLeft = event.currentTarget.scrollLeft;
          }
          onScroll?.(event);
        }}
      />
    </div>
  );
});