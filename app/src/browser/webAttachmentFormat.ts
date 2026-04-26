import type { WebAttachment, WebConsoleEntry, PickedElement } from "../store/feedbackStore";

function cleanLine(value: string | undefined): string {
  return (value || "").replace(/[\r\n]+/g, " ").trim();
}

function fence(value: string, language: string): string {
  return [`\`\`\`${language}`, value.trim(), "```"].join("\n");
}

function formatLocator(element: PickedElement): string {
  return element.locatorCandidates.find((item) => item.kind.startsWith("playwright") || item.kind === "testid")?.value
    || element.locatorCandidates[0]?.value
    || element.selector;
}

function formatBox(element: PickedElement): string | null {
  if (!element.rect) return null;
  const box = `x=${Math.round(element.rect.x)} y=${Math.round(element.rect.y)} w=${Math.round(element.rect.width)} h=${Math.round(element.rect.height)}`;
  if (!element.viewport) return box;
  return `${box}, viewport=${Math.round(element.viewport.width)}x${Math.round(element.viewport.height)}`;
}

function compactEntries(values: Record<string, string> | undefined, max: number): string[] {
  return Object.entries(values || {})
    .filter(([, value]) => value != null && String(value).trim() !== "")
    .slice(0, max)
    .map(([key, value]) => `- ${key}: ${cleanLine(value)}`);
}

function formatScreenshot(element: PickedElement): string | null {
  const screenshot = element.screenshot;
  if (!screenshot) return null;
  if (screenshot.status === "ready") {
    return `- Screenshot: ${screenshot.fileName || screenshot.filePath || "attached element crop"}`;
  }
  return `- Screenshot: unavailable${screenshot.error ? ` (${cleanLine(screenshot.error)})` : ""}`;
}

function formatElementAttachment(attachment: WebAttachment): string | null {
  const element = attachment.element;
  if (!element) return null;
  const lines = [
    `### Selected Element`,
    "",
    `- URL: ${cleanLine(attachment.sourceUrl || element.sourceUrl)}`,
    `- Page: ${cleanLine(attachment.pageTitle) || "Untitled"}`,
    `- Captured: ${attachment.capturedAt}`,
    `- Text: ${cleanLine(element.text) || "(empty)"}`,
    `- Tag: ${cleanLine(element.tagName)}`,
    `- Selector: ${cleanLine(element.selector)}`,
    `- Best locator: ${cleanLine(formatLocator(element))}`,
  ];
  if (element.role) lines.push(`- Role: ${cleanLine(element.role)}`);
  if (element.ariaLabel) lines.push(`- Aria label: ${cleanLine(element.ariaLabel)}`);
  if (element.href) lines.push(`- Href: ${cleanLine(element.href)}`);
  if (element.src) lines.push(`- Src: ${cleanLine(element.src)}`);
  const box = formatBox(element);
  if (box) lines.push(`- Box: ${box}`);
  const screenshot = formatScreenshot(element);
  if (screenshot) lines.push(screenshot);
  const attributeLines = compactEntries(element.attributes, 8);
  if (attributeLines.length > 0) {
    lines.push("", "Attributes:", ...attributeLines);
  }
  if (element.htmlSnippet) {
    lines.push("", fence(element.htmlSnippet, "html"));
  }
  const styleLines = compactEntries(element.styleSummary, 12);
  if (styleLines.length > 0) {
    lines.push("", "Styles:", ...styleLines);
  }
  return lines.join("\n");
}

function formatConsoleEntry(entry: WebConsoleEntry): string {
  const location = entry.line ? ` (${entry.line}${entry.column ? `:${entry.column}` : ""})` : "";
  const stack = entry.stack ? `\n${entry.stack}` : "";
  return `[${entry.level}] ${entry.message}${location}${stack}`;
}

function formatConsoleAttachment(attachment: WebAttachment): string | null {
  const entries = attachment.consoleEntries || [];
  if (entries.length === 0) return null;
  const body = entries.map(formatConsoleEntry).join("\n");
  return [
    `### Console Snapshot`,
    "",
    `- URL: ${cleanLine(attachment.sourceUrl)}`,
    `- Page: ${cleanLine(attachment.pageTitle) || "Untitled"}`,
    `- Captured: ${attachment.capturedAt}`,
    `- Entries: ${entries.length}`,
    "",
    fence(body, "text"),
  ].join("\n");
}

export function formatWebAttachments(attachments: WebAttachment[] | undefined): string | null {
  const blocks = (attachments || [])
    .map((attachment) => attachment.kind === "element" ? formatElementAttachment(attachment) : formatConsoleAttachment(attachment))
    .filter(Boolean) as string[];
  if (blocks.length === 0) return null;
  return ["## Attachment: Web Preview", ...blocks].join("\n\n");
}

export function webAttachmentLabel(attachment: WebAttachment): string {
  if (attachment.kind === "console") {
    const count = attachment.consoleEntries?.length || 0;
    return `Console ${count}`;
  }
  const element = attachment.element;
  const text = cleanLine(element?.text) || cleanLine(element?.ariaLabel) || cleanLine(element?.selector) || "Element";
  return text.length > 26 ? `${text.slice(0, 26)}...` : text;
}
