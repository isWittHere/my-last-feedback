import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./Icons";

interface TransferSubmitSplitProps {
  color: string;
  disabled: boolean;
  submitting: boolean;
  transferAlias: string | null;
  popoverOpen: boolean;
  draft: string;
  setDraft: (s: string) => void;
  onSubmit: () => void;
  onOpenPopover: () => void;
  onClosePopover: () => void;
  onConfirmTransfer: (alias: string) => void;
  onCancelTransfer: () => void;
}

/** Alias format = 4 uppercase hex chars (matches `generateAlias()` in server.mjs). */
const ALIAS_REGEX = /^[0-9A-F]{4}$/;
/** Raw-input sanitizer: strips non-hex characters and uppercases. */
const sanitizeAlias = (s: string) => s.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 4);

/**
 * Split submit button.
 *
 *  Default state:       [chevron] [send]
 *  Transfer configured: [close]   [alias chip] [arrow-right-left]
 *
 * Clicking the chevron opens a popover for entering a target `agent_name`.
 * Confirming a valid alias enters transfer mode; the next submit will include
 * `transferToAlias` in the Tauri payload which causes the MCP server to
 * inject a "TRANSFERRED" [System] notice instead of the normal "confirmed" one.
 */
export function TransferSubmitSplit(props: TransferSubmitSplitProps) {
  const { t } = useTranslation();
  const {
    color,
    disabled,
    submitting,
    transferAlias,
    popoverOpen,
    draft,
    setDraft,
    onSubmit,
    onOpenPopover,
    onClosePopover,
    onConfirmTransfer,
    onCancelTransfer,
  } = props;

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close popover on outside click / Escape
  useEffect(() => {
    if (!popoverOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      onClosePopover();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClosePopover();
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [popoverOpen, onClosePopover]);

  // Autofocus the input when the popover opens
  useEffect(() => {
    if (popoverOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [popoverOpen]);

  const validation = useMemo(() => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      return { ok: false as const, reason: "empty" as const };
    }
    if (!ALIAS_REGEX.test(trimmed)) {
      return { ok: false as const, reason: "format" as const };
    }
    return { ok: true as const, reason: null };
  }, [draft]);

  const handleConfirm = () => {
    if (!validation.ok) return;
    onConfirmTransfer(draft.trim());
  };

  const isTransfer = !!transferAlias;
  const bg = disabled ? "var(--color-bg-elevated)" : color;
  const border = disabled ? "var(--color-border)" : color;
  const commonMainStyle: React.CSSProperties = {
    height: 34,
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    width: 34,
    background: bg,
    borderColor: border,
    color: "#fff",
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    pointerEvents: disabled ? "none" : "auto",
  };

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      {/* Left aux control: chevron (default) or close (×) in transfer mode */}
      {isTransfer ? (
        <button
          onClick={onCancelTransfer}
          className="btn"
          title={t("transfer.cancel", "Cancel transfer")}
          style={{
            width: 26,
            height: 34,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            borderRight: "none",
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-muted)",
          }}
        >
          <Icon name="close" size={13} strokeWidth={2.5} />
        </button>
      ) : (
        <button
          onClick={popoverOpen ? onClosePopover : onOpenPopover}
          disabled={submitting}
          className="btn"
          title={t("transfer.open", "Transfer submit")}
          style={{
            width: 20,
            height: 34,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            borderRight: "none",
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            background: popoverOpen ? "var(--color-bg-elevated)" : "transparent",
            color: "var(--color-text-muted)",
            opacity: submitting ? 0.4 : 1,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          <Icon name="chevron-down" size={10} className="app-disclosure-icon" />
        </button>
      )}

      {/* Target alias chip (only in transfer mode) */}
      {isTransfer && (
        <div
          style={{
            height: 34,
            display: "inline-flex",
            alignItems: "center",
            padding: "0 8px",
            borderTop: "1px solid var(--color-border)",
            borderBottom: "1px solid var(--color-border)",
            background: "var(--color-bg-elevated)",
            color: "var(--color-text)",
            fontSize: 11,
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
            gap: 5,
            maxWidth: 120,
          }}
          title={t("transfer.to", "Transfer to {{alias}}", { alias: transferAlias })}
        >
          <Icon name="arrow-right" size={11} color={color} strokeWidth={2.5} />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontWeight: 600,
            }}
          >
            {transferAlias}
          </span>
        </div>
      )}

      {/* Main submit button */}
      <button
        onClick={onSubmit}
        disabled={disabled}
        className="btn"
        title={isTransfer ? t("transfer.submitTo", "Transfer and submit (Ctrl+Enter) to {{alias}}", { alias: transferAlias }) : t("feedback.submit", "Send Feedback (Ctrl+Enter)")}
        style={{
          ...commonMainStyle,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
        }}
      >
        {submitting ? (
          <Icon name="spinner" size={15} style={{ animation: "spin 1s linear infinite" }} />
        ) : isTransfer ? (
          <Icon name="arrow-right-left" size={15} />
        ) : (
          <Icon name="send" size={15} />
        )}
      </button>

      {/* Popover */}
      {popoverOpen && (
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: 40,
            minWidth: 240,
            padding: 10,
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.4 }}>
            {t("transfer.descriptionPrefix", "Transfer identity: after submitting, tell Agent to change")} <code>agent_name</code> {t("transfer.descriptionSuffix", "to this value")}
          </div>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(sanitizeAlias(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleConfirm();
              }
            }}
            placeholder={t("transfer.aliasPlaceholder", "4 hex characters, e.g. A1B2")}
            spellCheck={false}
            autoComplete="off"
            maxLength={4}
            style={{
              padding: "6px 8px",
              background: "var(--color-bg-input)",
              border: `1px solid ${validation.reason === "format" ? "#ef4444" : "var(--color-border)"}`,
              borderRadius: 4,
              color: "var(--color-text)",
              fontSize: 13,
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              outline: "none",
            }}
          />
          <div
            style={{
              fontSize: 10,
              color: validation.reason === "format" ? "#ef4444" : "var(--color-text-muted)",
              minHeight: 14,
              lineHeight: 1.3,
            }}
          >
            {validation.reason === "format"
              ? t("transfer.formatError", "Invalid format: must be 4 characters [0-9A-F]")
              : t("transfer.formatHint", "Format: 4 uppercase hexadecimal characters")}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button
              onClick={onClosePopover}
              className="btn"
              style={{
                padding: "4px 10px",
                fontSize: 11,
                background: "transparent",
                color: "var(--color-text-muted)",
              }}
            >
              {t("sidebar.cancel", "Cancel")}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!validation.ok}
              className="btn"
              style={{
                padding: "4px 10px",
                fontSize: 11,
                background: validation.ok ? color : "var(--color-bg-input)",
                borderColor: validation.ok ? color : "var(--color-border)",
                color: validation.ok ? "#fff" : "var(--color-text-muted)",
                opacity: validation.ok ? 1 : 0.5,
                cursor: validation.ok ? "pointer" : "not-allowed",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Icon name="check" size={11} strokeWidth={2.5} />
              {t("common.confirm", "Confirm")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
