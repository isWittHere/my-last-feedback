import { formatWebAttachments } from "../browser/webAttachmentFormat";
import type { Session, ImageAttachment, MlcAttachment } from "../store/feedbackStore";
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

  const mlcReferences = formatMlcReferences(session.mlcAttachments || []);
  if (mlcReferences) sections.push(mlcReferences);

  const webReferences = formatWebAttachments(session.webAttachments || []);
  if (webReferences) sections.push(webReferences);

  const routing = formatPayloadRouting(options.callerAlias, options.transferAlias);
  if (routing) sections.push(routing);

  if (options.includeSystemReminder !== false) {
    sections.push(
      "[System] Reminder: You MUST call the interactive_feedback tool again after completing this operation. Do NOT end your turn without invoking interactive_feedback.",
    );
  }

  return {
    markdown: sections.join("\n\n"),
    historyText: [trimmedFeedback, quickAction].filter(Boolean).join("\n\n"),
    imageList: session.images.map((image) => ({ path: image.path, data_url: image.dataUrl })),
  };
}