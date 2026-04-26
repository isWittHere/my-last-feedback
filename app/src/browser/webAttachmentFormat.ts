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

function formatElementAttachment(attachment: WebAttachment): string | null {
  const element = attachment.element;
  if (!element) return null;
  const lines = [
    `### Selected Element`,
    "",
    `- URL: ${cleanLine(attachment.sourceUrl || element.sourceUrl)}`,
    `- Page: ${cleanLine(attachment.pageTitle) || "Untitled"}`,
    `- Captured: ${attachment.capturedAt}`,
    `- Selector: ${cleanLine(element.selector)}`,
    `- Locator: ${cleanLine(formatLocator(element))}`,
    `- Text: ${cleanLine(element.text) || "(empty)"}`,
    `- Tag: ${cleanLine(element.tagName)}`,
  ];
  if (element.role) lines.push(`- Role: ${cleanLine(element.role)}`);
  if (element.ariaLabel) lines.push(`- Aria label: ${cleanLine(element.ariaLabel)}`);
  if (element.href) lines.push(`- Href: ${cleanLine(element.href)}`);
  if (element.src) lines.push(`- Src: ${cleanLine(element.src)}`);
  if (element.htmlSnippet) {
    lines.push("", fence(element.htmlSnippet, "html"));
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
