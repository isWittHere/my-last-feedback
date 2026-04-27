import { formatWebAttachments } from "../browser/webAttachmentFormat";
import type { Session, ImageAttachment, MlcAttachment } from "../store/feedbackStore";
import { parseComposerTextTokens } from "./composerTokens";
import { formatSlashCommandExpansions } from "./commandExpansion";
import type { PromptCommandLike } from "./promptCommands";

export interface SubmittedFeedbackOptions {
  prompts: PromptCommandLike[];
  quickAction?: string;
  callerAlias?: string | null;
  transferAlias?: string | null;
  includeSystemReminder?: boolean;
}

export interface SubmittedFeedbackResult {
  markdown: string;
  historyText: string;
  imageList: Array<{ path: string; data_url?: string }>;
}

export interface SubmittedResourceLink {
  label: string;
  href: string;
  kind: "file" | "folder";
}

const SYSTEM_REMINDER = "[System] Reminder: You MUST call the interactive_feedback tool again after completing this operation. Do NOT end your turn without invoking interactive_feedback.";

function cleanLine(value: string | undefined | null): string {
  return (value || "").replace(/[\r\n]+/g, " ").trim();
}

function tableCell(value: string | undefined | null): string {
  const cleaned = cleanLine(value) || "-";
  return cleaned.replace(/\|/g, "\\|");
}

function fence(value: string, language = "text"): string {
  return [`~~~${language}`, value.trim(), "~~~"].join("\n");
}

function cleanMlcDisplayPath(path: string): string {
  return path.replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
}

function formatMlcReferences(attachments: MlcAttachment[]): string | null {
  if (attachments.length === 0) return null;
  const blocks = attachments.map((item) => {
    const filePath = cleanMlcDisplayPath(item.filePath);
    return [
      `### ${cleanLine(item.title || filePath)}`,
      `- ${cleanLine(item.description || "")}`,
      `- ${cleanLine(filePath)}`,
    ].join("\n");
  });
  return ["## Attachment: MLC References", ...blocks].join("\n\n");
}

function formatImageSummary(images: ImageAttachment[]): string | null {
  if (images.length === 0) return null;
  const rows = images.map((image, index) => {
    const name = cleanLine(image.name || image.path || `image-${index + 1}`);
    const path = cleanLine(image.path);
    const size = Number.isFinite(image.sizeKB) && image.sizeKB > 0 ? `${Math.round(image.sizeKB)} KB` : "unknown size";
    return `- ${name} (${size})${path && path !== name ? ` - ${path}` : ""}`;
  });
  return [
    "## Attachment: Images",
    `${images.length} image(s) attached. Image binary content is returned as separate image payload content; the audit list is below.`,
    "",
    ...rows,
  ].join("\n");
}

function formatQuestionAnswers(session: Session): string | null {
  const answeredQuestions = session.questions?.filter(
    (question) => question.answer.trim() || (question.selectedOptions && question.selectedOptions.length > 0),
  );
  if (!answeredQuestions || answeredQuestions.length === 0) return null;
  const tableRows = session.questions.map((question, index) => {
    const selected = question.selectedOptions && question.selectedOptions.length > 0 ? question.selectedOptions.join(", ") : "-";
    const answer = question.answer.trim() || "-";
    return `| ${index + 1} | ${tableCell(question.label)} | ${tableCell(selected)} | ${tableCell(answer)} |`;
  });
  return [
    "## Agent Questions Response",
    "",
    "| # | Question | Selected | Answer |",
    "|---|----------|----------|--------|",
    ...tableRows,
  ].join("\n");
}

function formatGitAction(session: Session): string | null {
  if (!session.gitAction) return null;
  const gitMessages: Record<string, string> = {
    commit: "Please execute git add and git commit to backup the current changes.",
    "commit-push": "Please execute git add, git commit, and git push to backup and push the current changes.",
    "create-branch": session.gitAction.branchName
      ? `Please create a new branch "${session.gitAction.branchName}" and switch to it.`
      : "Please create a new branch and switch to it.",
  };
  return `## Git Action\n${gitMessages[session.gitAction.type]}`;
}

function formatPayloadRouting(callerAlias?: string | null, transferAlias?: string | null): string | null {
  const rows: string[] = [];
  if (callerAlias && callerAlias.trim()) rows.push(`| caller_alias | ${tableCell(callerAlias)} |`);
  if (transferAlias && transferAlias.trim()) rows.push(`| transfer_to_alias | ${tableCell(transferAlias)} |`);
  if (rows.length === 0) return null;
  return [
    "## Payload Routing",
    "",
    "| Field | Value |",
    "|-------|-------|",
    ...rows,
  ].join("\n");
}

export function collectSubmittedResourceLinks(markdown: string, projectDirectory?: string): SubmittedResourceLink[] {
  const seen = new Set<string>();
  const links: SubmittedResourceLink[] = [];
  for (const token of parseComposerTextTokens(markdown, { projectDirectory })) {
    if (token.type !== "resourceLink") continue;
    const key = `${token.kind}:${token.href}:${token.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ label: token.label, href: token.href, kind: token.kind });
  }
  return links;
}

function formatResourceLinks(markdown: string, projectDirectory?: string): string | null {
  const links = collectSubmittedResourceLinks(markdown, projectDirectory);
  const rows = links.map((link) => `| ${tableCell(link.kind)} | ${tableCell(link.label)} | ${tableCell(link.href)} |`);
  if (rows.length === 0) return null;
  return [
    "## Attachment: Resource Links",
    "",
    "| Type | Label | Path |",
    "|------|-------|------|",
    ...rows,
  ].join("\n");
}

function formatSystemReminder(): string {
  return `## System\n${SYSTEM_REMINDER}`;
}

function appendMissingSection(sections: string[], markdown: string, heading: string, section: string | null) {
  if (!section) return;
  const headingPattern = new RegExp(`(^|\\n)##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  if (!headingPattern.test(markdown)) sections.push(section);
}

export function augmentReadonlySubmittedFeedback(
  markdown: string,
  session: Session,
  options: Pick<SubmittedFeedbackOptions, "callerAlias" | "transferAlias"> = {},
): string {
  const base = markdown.trim();
  const appendedSections: string[] = [];

  appendMissingSection(appendedSections, base, "Attachment: Test Logs", session.testLogText.trim() ? `## Attachment: Test Logs\n${fence(session.testLogText)}` : null);
  appendMissingSection(appendedSections, base, "Attachment: Command Logs", session.commandLogs.trim() ? `## Attachment: Command Logs\n${fence(session.commandLogs)}` : null);
  appendMissingSection(appendedSections, base, "Attachment: Images", formatImageSummary(session.images));
  appendMissingSection(appendedSections, base, "Attachment: Resource Links", formatResourceLinks(base, session.projectDirectory));
  appendMissingSection(appendedSections, base, "Attachment: MLC References", formatMlcReferences(session.mlcAttachments || []));
  appendMissingSection(appendedSections, base, "Attachment: Web Preview", formatWebAttachments(session.webAttachments || []));
  appendMissingSection(appendedSections, base, "Payload Routing", formatPayloadRouting(options.callerAlias, options.transferAlias));

  if (!/\[System\]\s*Reminder/i.test(base) && !/(^|\n)##\s+System\b/i.test(base)) {
    appendedSections.push(formatSystemReminder());
  }

  return [base, ...appendedSections].filter(Boolean).join("\n\n");
}

export function buildSubmittedFeedback(session: Session, options: SubmittedFeedbackOptions): SubmittedFeedbackResult {
  const sections: string[] = [];
  const trimmedFeedback = session.feedbackText.trim();
  const quickAction = options.quickAction?.trim();

  if (trimmedFeedback) {
    sections.push(`## User Feedback\n${trimmedFeedback}`);
    const slashCommandExpansions = formatSlashCommandExpansions(trimmedFeedback, options.prompts);
    if (slashCommandExpansions) sections.push(slashCommandExpansions);
  }
  if (quickAction) sections.push(`## User Requirement\n${quickAction}`);

  const questionAnswers = formatQuestionAnswers(session);
  if (questionAnswers) sections.push(questionAnswers);

  const gitAction = formatGitAction(session);
  if (gitAction) sections.push(gitAction);

  if (session.testLogText.trim()) sections.push(`## Attachment: Test Logs\n${fence(session.testLogText)}`);
  if (session.commandLogs.trim()) sections.push(`## Attachment: Command Logs\n${fence(session.commandLogs)}`);

  const imageSummary = formatImageSummary(session.images);
  if (imageSummary) sections.push(imageSummary);

  const resourceLinks = formatResourceLinks([trimmedFeedback, quickAction].filter(Boolean).join("\n\n"), session.projectDirectory);
  if (resourceLinks) sections.push(resourceLinks);

  const mlcReferences = formatMlcReferences(session.mlcAttachments || []);
  if (mlcReferences) sections.push(mlcReferences);

  const webReferences = formatWebAttachments(session.webAttachments || []);
  if (webReferences) sections.push(webReferences);

  const routing = formatPayloadRouting(options.callerAlias, options.transferAlias);
  if (routing) sections.push(routing);

  if (options.includeSystemReminder !== false) {
    sections.push(formatSystemReminder());
  }

  return {
    markdown: sections.join("\n\n"),
    historyText: [trimmedFeedback, quickAction].filter(Boolean).join("\n\n"),
    imageList: session.images.map((image) => ({ path: image.path, data_url: image.dataUrl })),
  };
}