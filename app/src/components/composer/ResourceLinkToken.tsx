import { useCallback } from "react";
import { Icon } from "../Icons";
import { useFeedbackStore } from "../../store/feedbackStore";
import type { ResourceKind } from "../../composer/resourceLinks";
import { CatppuccinResourceIcon } from "../CatppuccinResourceIcon";

export function ResourceLinkToken({ label, href, kind }: { label: string; href: string; kind: ResourceKind }) {
  const resourceIconTheme = useFeedbackStore((state) => state.resourceIconTheme);
  const openResource = useCallback(() => {
    import("@tauri-apps/plugin-opener")
      .then(({ openPath }) => openPath(href))
      .catch(() => navigator.clipboard.writeText(href).catch(() => {}));
  }, [href]);

  return (
    <span
      className="readonly-resource-tag"
      role="button"
      tabIndex={0}
      data-tooltip={`${kind === "folder" ? "Folder" : "File"}\n${href}`}
      data-tooltip-placement="top"
      onClick={openResource}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openResource();
        }
      }}
    >
      {resourceIconTheme === "catppuccin" ? (
        <CatppuccinResourceIcon entry={{ name: label, relativePath: href, kind }} size={12} className="readonly-resource-icon" />
      ) : (
        <Icon name={kind === "folder" ? "folder" : "file-text"} size={11} />
      )}
      <span>{label}</span>
    </span>
  );
}