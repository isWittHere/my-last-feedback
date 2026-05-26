import catppuccinLatteTheme from "../assets/resource-icons/catppuccin-latte-theme.json";
import catppuccinMochaTheme from "../assets/resource-icons/catppuccin-mocha-theme.json";
import { useIsLightTheme } from "./useIsLightTheme";

interface VscIconTheme {
  file: string;
  folder: string;
  folderExpanded: string;
  fileExtensions: Record<string, string>;
  fileNames: Record<string, string>;
  folderNames: Record<string, string>;
  folderNamesExpanded: Record<string, string>;
  iconDefinitions: Record<string, { iconPath: string }>;
}

export interface CatppuccinResourceEntry {
  name: string;
  relativePath?: string;
  kind: "file" | "folder";
}

interface CatppuccinResourceIconProps {
  entry: CatppuccinResourceEntry;
  expanded?: boolean;
  size?: number;
  className?: string;
}

export type CatppuccinIconFlavor = "latte" | "mocha";

const themes: Record<CatppuccinIconFlavor, VscIconTheme> = {
  latte: catppuccinLatteTheme as VscIconTheme,
  mocha: catppuccinMochaTheme as VscIconTheme,
};
const baseUrl = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const fileExtensionEntries: Record<CatppuccinIconFlavor, Array<[string, string]>> = {
  latte: Object.entries(themes.latte.fileExtensions).sort(([left], [right]) => right.length - left.length),
  mocha: Object.entries(themes.mocha.fileExtensions).sort(([left], [right]) => right.length - left.length),
};
const customFolderIcons: Record<string, string> = {
  ".mylastchat": "folder_messages",
  "z_md": "folder_docs",
};

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function basename(value: string): string {
  return value.replace(/\\/g, "/").split("/").filter(Boolean).pop() || value;
}

function matchesExtension(normalizedPath: string, fileName: string, extension: string): boolean {
  const normalizedExtension = normalizePath(extension).replace(/^\./, "");
  if (!normalizedExtension) return false;

  if (normalizedExtension.includes("/")) {
    const parts = normalizedExtension.split("/").filter(Boolean);
    const suffix = parts.pop();
    const folderPath = parts.join("/");
    if (!suffix || !folderPath) return false;
    const inMatchingFolder = normalizedPath.startsWith(`${folderPath}/`) || normalizedPath.includes(`/${folderPath}/`);
    return inMatchingFolder && (fileName === suffix || fileName.endsWith(`.${suffix}`));
  }

  return fileName === normalizedExtension || fileName.endsWith(`.${normalizedExtension}`);
}

function iconPath(iconName: string, flavor: CatppuccinIconFlavor): string {
  const theme = themes[flavor];
  const definition = theme.iconDefinitions[iconName] || theme.iconDefinitions[theme.file];
  const path = definition?.iconPath.replace(/^\.\//, "") || "icons/_file.svg";
  return `${baseUrl}resource-icons/catppuccin-${flavor}/${path}`;
}

export function resolveCatppuccinResourceIcon(entry: CatppuccinResourceEntry, expanded = false, flavor: CatppuccinIconFlavor = "mocha"): string {
  const theme = themes[flavor];
  const normalizedPath = normalizePath(entry.relativePath || entry.name);
  const fileName = basename(normalizedPath);

  if (entry.kind === "folder") {
    const customFolderIcon = customFolderIcons[fileName];
    if (customFolderIcon) return iconPath(expanded ? `${customFolderIcon}_open` : customFolderIcon, flavor);

    const folderIcon = expanded
      ? theme.folderNamesExpanded[fileName] || theme.folderExpanded
      : theme.folderNames[fileName] || theme.folder;
    return iconPath(folderIcon, flavor);
  }

  const fileNameIcon = theme.fileNames[fileName] || theme.fileNames[normalizedPath];
  if (fileNameIcon) return iconPath(fileNameIcon, flavor);

  const extensionIcon = fileExtensionEntries[flavor].find(([extension]) => matchesExtension(normalizedPath, fileName, extension))?.[1];
  return iconPath(extensionIcon || theme.file, flavor);
}

export function CatppuccinResourceIcon({ entry, expanded, size = 14, className }: CatppuccinResourceIconProps) {
  const flavor: CatppuccinIconFlavor = useIsLightTheme() ? "latte" : "mocha";
  return (
    <img
      src={resolveCatppuccinResourceIcon(entry, expanded, flavor)}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      className={[className, "resource-tree-icon-img"].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
    />
  );
}