import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentConsoleSettings } from "../../agentConsoleSettings";
import { getAgentSessionIdentity } from "../../agent/sessionIdentity";
import type { AgentContentBlock, AgentMessage, AgentProviderMessagePart, AgentSession, AgentSubmittedAttachmentTag } from "../../agent/types";
import { splitAgentMessageBlocks } from "../../agent/steps";
import { useAgentStore } from "../../store/agentStore";
import { MarkdownContent } from "../MarkdownContent";
import { Icon } from "../Icons";
import { IdenticonAvatar } from "../IdenticonAvatar";
import { AgentProcessGroup } from "./AgentProcessGroup";
import { OpenCodeInitialAvatar } from "./OpenCodeInitialAvatar";

function blockText(block: AgentContentBlock): string {
  if (block.type === "text") return block.content;
  if (block.type === "error") return block.message;
  if (block.type === "artifact") return block.content;
  return "";
}

function blocksText(blocks: AgentContentBlock[]): string {
  return blocks.map(blockText).filter(Boolean).join("\n\n");
}

function providerPromptText(parts: AgentProviderMessagePart[] | undefined): string {
  return (parts || [])
    .filter((part) => part.type === "text" && !part.synthetic && !part.ignored && typeof part.text === "string")
    .map((part) => part.text || "")
    .join("\n\n")
    .trim();
}

function extractPromptSection(markdown: string): string {
  const trimmedMarkdown = markdown.trim();
  const promptHeading = /^##\s+(?:User Prompt|User Feedback|用户提示|用户反馈)\s*\n/i.exec(trimmedMarkdown);
  if (!promptHeading) return "";
  const contentStart = promptHeading[0].length;
  const nextSectionIndex = trimmedMarkdown.slice(contentStart).search(/\n##\s+/);
  const contentEnd = nextSectionIndex >= 0 ? contentStart + nextSectionIndex : trimmedMarkdown.length;
  return trimmedMarkdown.slice(contentStart, contentEnd).trim();
}

function userDisplayText(message: AgentMessage, resultBlocks: AgentContentBlock[]): string {
  const draft = message.composerDraft?.trim();
  if (draft) return draft;
  const providerText = providerPromptText(message.providerParts);
  if (providerText) return providerText;
  const rawText = blocksText(resultBlocks).trim();
  return extractPromptSection(rawText) || rawText;
}

function userSubmittedText(message: AgentMessage, resultBlocks: AgentContentBlock[]): string {
  return message.submittedMarkdown?.trim() || blocksText(resultBlocks).trim();
}

function ResultBlocks({ blocks, projectDirectory }: { blocks: AgentContentBlock[]; projectDirectory: string }) {
  return (
    <div className="agent-result-blocks">
      {blocks.map((block) => {
        if (block.type === "text") {
          return <MarkdownContent key={block.id} markdown={block.content} projectDirectory={projectDirectory} className="agent-message-markdown" variant="feedback" enableComposerTokens />;
        }
        if (block.type === "error") {
          return <div key={block.id} className="agent-error-block"><Icon name="warning" size={13} />{block.message}</div>;
        }
        if (block.type === "task_list") {
          return (
            <div key={block.id} className="agent-inline-task-list">
              {block.tasks.map((task) => (
                <div key={task.id} className="agent-inline-task-row" data-status={task.status}>
                  <Icon name={task.status === "completed" ? "check" : task.status === "in-progress" ? "spinner" : "minus"} size={12} />
                  <span>{task.title}</span>
                </div>
              ))}
            </div>
          );
        }
        const text = blockText(block);
        return text ? <pre key={block.id}>{text}</pre> : null;
      })}
    </div>
  );
}

function actorInfo(session: AgentSession, message: AgentMessage, language: "en" | "zh"): { alias: string; color: string; says: string; avatarKind: "opencode" | "identicon" } {
  if (message.role === "user") return { alias: "You", color: "#7c8cff", says: "你说:", avatarKind: "identicon" };
  if (message.role === "system") return { alias: "System", color: "#f59e0b", says: "系统:", avatarKind: "identicon" };
  const identity = getAgentSessionIdentity(session, language);
  return { alias: identity.code || identity.name, color: identity.color, says: `${identity.name} 说:`, avatarKind: identity.code ? "identicon" : "opencode" };
}

function AgentMessageActions({ session, message, copyText, disabled, canShowFullInfo, fullInfoOpen, onToggleFullInfo }: { session: AgentSession; message: AgentMessage; copyText: string; disabled?: boolean; canShowFullInfo?: boolean; fullInfoOpen?: boolean; onToggleFullInfo?: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const forkAgentSessionFromMessage = useAgentStore((state) => state.forkAgentSessionFromMessage);
  const canActOnUserMessage = message.role === "user" && Boolean(session.providerSessionId);
  const canCopy = Boolean(copyText.trim()) && !disabled;

  const copy = () => {
    if (!canCopy) return;
    const write = navigator.clipboard?.writeText(copyText);
    if (!write) return;
    void write.then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  if (!canCopy && !canActOnUserMessage && !canShowFullInfo) return null;

  return (
    <div className="agent-message-actions" aria-label={t("agentConsole.messageActions", "Message actions")}>
      {canActOnUserMessage && (
        <button type="button" className="agent-message-action" onClick={() => void forkAgentSessionFromMessage(session.id, message.id)} title={t("agentConsole.forkFromMessage", "Fork from message")} disabled={disabled}>
          <Icon name="git-branch" size={12} />
        </button>
      )}
      {canCopy && (
        <button type="button" className="agent-message-action" onClick={copy} title={copied ? t("agentConsole.messageCopied", "Copied") : message.role === "assistant" ? t("agentConsole.copyResponse", "Copy response") : t("agentConsole.copyMessage", "Copy message")}>
          <Icon name={copied ? "check" : "copy"} size={12} />
        </button>
      )}
      {canShowFullInfo && (
        <button type="button" className={`agent-message-action${fullInfoOpen ? " active" : ""}`} onClick={onToggleFullInfo} title={fullInfoOpen ? t("agentConsole.hideFullUserMessage", "Hide original message") : t("agentConsole.showFullUserMessage", "Show original message")} aria-pressed={fullInfoOpen}>
          <Icon name="file-text" size={12} />
        </button>
      )}
    </div>
  );
}

function attachmentIconName(kind: AgentSubmittedAttachmentTag["kind"]): string {
  if (kind === "image") return "image";
  if (kind === "test-log") return "terminal";
  if (kind === "git") return "git-commit";
  if (kind === "mlc") return "book";
  if (kind === "web") return "globe";
  return "paperclip";
}

function AgentUserAttachmentTags({ tags }: { tags?: AgentSubmittedAttachmentTag[] }) {
  const { t } = useTranslation();
  if (!tags || tags.length === 0) return null;

  const fallbackLabels: Record<AgentSubmittedAttachmentTag["kind"], string> = {
    image: t("agentConsole.attachmentImage", "Image"),
    "test-log": t("agentConsole.attachmentTestLog", "Test log"),
    git: t("agentConsole.attachmentGit", "Git action"),
    mlc: t("agentConsole.attachmentMlc", "MLC reference"),
    web: t("agentConsole.attachmentWeb", "Web capture"),
    resource: t("agentConsole.attachmentResource", "Resource"),
  };

  return (
    <div className="agent-user-attachment-tags" aria-label={t("agentConsole.attachmentTags", "Attachments")}>
      {tags.map((tag) => {
        const label = tag.label?.trim() || fallbackLabels[tag.kind];
        const detail = tag.detail?.trim();
        return (
          <span key={tag.id} className="agent-user-attachment-tag" data-kind={tag.kind} title={[label, detail].filter(Boolean).join(" - ")}>
            <Icon name={attachmentIconName(tag.kind)} size={11} />
            <span>{label}</span>
          </span>
        );
      })}
    </div>
  );
}

export function AgentMessageItem({ session, message, projectDirectory }: { session: AgentSession; message: AgentMessage; projectDirectory: string }) {
  const { i18n, t } = useTranslation();
  const [fullInfoOpen, setFullInfoOpen] = useState(false);
  const { showMessageSpeakerLine } = useAgentConsoleSettings();
  const { processBlocks, resultBlocks } = splitAgentMessageBlocks(message);
  const { alias, color, says, avatarKind } = actorInfo(session, message, i18n.language.startsWith("zh") ? "zh" : "en");
  const userText = message.role === "user" ? userDisplayText(message, resultBlocks) : "";
  const submittedText = message.role === "user" ? userSubmittedText(message, resultBlocks) : "";
  const hasFullInfo = Boolean(submittedText.trim()) && submittedText.trim() !== userText.trim();
  const assistantText = useMemo(() => message.role === "assistant" ? resultBlocks.map(blockText).filter(Boolean).join("\n\n") : "", [message.role, resultBlocks]);
  const isStreaming = message.status === "streaming";

  if (message.role === "user") {
    return (
      <article className={`agent-message agent-message-${message.role}`} data-role={message.role} data-msg-id={message.id} data-status={message.status}>
        <div className="agent-message-user-shell" style={{ "--agent-actor-color": color } as CSSProperties}>
          <div className="agent-message-user-stack">
            <div className="agent-message-user-row">
              <AgentMessageActions session={session} message={message} copyText={userText} disabled={isStreaming} canShowFullInfo={hasFullInfo} fullInfoOpen={fullInfoOpen} onToggleFullInfo={() => setFullInfoOpen((open) => !open)} />
              <div className="agent-message-main">
                {showMessageSpeakerLine && (
                  <header className="agent-message-speaker">
                    {avatarKind === "opencode" ? <OpenCodeInitialAvatar size={22} /> : <IdenticonAvatar alias={alias} color={color} size={22} />}
                    <span>{says}</span>
                  </header>
                )}
                {userText.trim() ? <MarkdownContent markdown={userText} projectDirectory={projectDirectory} className="agent-user-markdown" variant="feedback" enableComposerTokens /> : <span className="agent-user-empty-prompt">{t("agentConsole.attachmentOnlyPrompt", "Attachment-only prompt")}</span>}
              </div>
            </div>
            <AgentUserAttachmentTags tags={message.submittedAttachmentTags} />
            {hasFullInfo && fullInfoOpen && (
              <div className="agent-message-full-popover" role="dialog" aria-label={t("agentConsole.fullUserMessage", "Original message")}>
                <header className="agent-message-full-popover-header">
                  <span>{t("agentConsole.fullUserMessage", "Original message")}</span>
                  <button type="button" className="agent-message-action" onClick={() => setFullInfoOpen(false)} title={t("agentConsole.closeFullUserMessage", "Close original message")}>
                    <Icon name="close" size={12} />
                  </button>
                </header>
                <div className="agent-message-full-popover-body">
                  <MarkdownContent markdown={submittedText} projectDirectory={projectDirectory} className="agent-message-full-markdown" variant="feedback" enableComposerTokens />
                </div>
              </div>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={`agent-message agent-message-${message.role}`} data-role={message.role} data-msg-id={message.id} data-status={message.status}>
      <div className="agent-message-main" style={{ "--agent-actor-color": color } as CSSProperties}>
        {showMessageSpeakerLine && (
          <header className="agent-message-speaker">
            {avatarKind === "opencode" ? <OpenCodeInitialAvatar size={22} /> : <IdenticonAvatar alias={alias} color={color} size={22} />}
            <span>{says}</span>
          </header>
        )}
        <AgentProcessGroup blocks={processBlocks} messageId={message.id} isStreaming={isStreaming} projectDirectory={projectDirectory} />
        <ResultBlocks blocks={resultBlocks} projectDirectory={projectDirectory} />
        <AgentMessageActions session={session} message={message} copyText={assistantText} disabled={isStreaming} />
      </div>
    </article>
  );
}