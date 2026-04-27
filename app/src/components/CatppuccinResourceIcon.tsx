import catppuccinMochaTheme from "../assets/resource-icons/catppuccin-mocha-theme.json";

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

const theme = catppuccinMochaTheme as VscIconTheme;
const baseUrl = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const iconAssetBase = `${baseUrl}resource-icons/catppuccin-mocha/`;
const fileExtensionEntries = Object.entries(theme.fileExtensions).sort(([left], [right]) => right.length - left.length);

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

function iconPath(iconName: string): string {
  const definition = theme.iconDefinitions[iconName] || theme.iconDefinitions[theme.file];
  const path = definition?.iconPath.replace(/^\.\//, "") || "icons/_file.svg";
  return `${iconAssetBase}${path}`;
}

export function resolveCatppuccinResourceIcon(entry: CatppuccinResourceEntry, expanded = false): string {
  const normalizedPath = normalizePath(entry.relativePath || entry.name);
  const fileName = basename(normalizedPath);

  if (entry.kind === "folder") {
    const folderIcon = expanded
      ? theme.folderNamesExpanded[fileName] || theme.folderExpanded
      : theme.folderNames[fileName] || theme.folder;
    return iconPath(folderIcon);
  }

  const fileNameIcon = theme.fileNames[fileName] || theme.fileNames[normalizedPath];
  if (fileNameIcon) return iconPath(fileNameIcon);

  const extensionIcon = fileExtensionEntries.find(([extension]) => matchesExtension(normalizedPath, fileName, extension))?.[1];
  return iconPath(extensionIcon || theme.file);
}

export function CatppuccinResourceIcon({ entry, expanded, size = 14, className }: CatppuccinResourceIconProps) {
  return (
    <img
      src={resolveCatppuccinResourceIcon(entry, expanded)}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      className={[className, "resource-tree-icon-img"].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
    />
  );
}