import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentConsoleSettings } from "../../agentConsoleSettings";
import { getAgentSessionIdentity } from "../../agent/sessionIdentity";
import type { AgentContentBlock, AgentMessage, AgentSession } from "../../agent/types";
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

function AgentMessageActions({ session, message, copyText, disabled }: { session: AgentSession; message: AgentMessage; copyText: string; disabled?: boolean }) {
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

  if (!canCopy && !canActOnUserMessage) return null;

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
    </div>
  );
}

export function AgentMessageItem({ session, message, projectDirectory }: { session: AgentSession; message: AgentMessage; projectDirectory: string }) {
  const { i18n } = useTranslation();
  const { showMessageSpeakerLine } = useAgentConsoleSettings();
  const { processBlocks, resultBlocks } = splitAgentMessageBlocks(message);
  const { alias, color, says, avatarKind } = actorInfo(session, message, i18n.language.startsWith("zh") ? "zh" : "en");
  const userText = message.role === "user" ? resultBlocks.map(blockText).join("\n\n") : "";
  const assistantText = useMemo(() => message.role === "assistant" ? resultBlocks.map(blockText).filter(Boolean).join("\n\n") : "", [message.role, resultBlocks]);
  const isStreaming = message.status === "streaming";

  return (
    <article className={`agent-message agent-message-${message.role}`} data-role={message.role} data-msg-id={message.id} data-status={message.status}>
      <div className="agent-message-main" style={{ "--agent-actor-color": color } as CSSProperties}>
        {showMessageSpeakerLine && (
          <header className="agent-message-speaker">
            {avatarKind === "opencode" ? <OpenCodeInitialAvatar size={22} /> : <IdenticonAvatar alias={alias} color={color} size={22} />}
            <span>{says}</span>
          </header>
        )}
        {message.role === "user" ? (
          <>
            <MarkdownContent markdown={userText} projectDirectory={projectDirectory} className="agent-user-markdown" variant="feedback" enableComposerTokens />
            <AgentMessageActions session={session} message={message} copyText={userText} disabled={isStreaming} />
          </>
        ) : (
          <>
            <AgentProcessGroup blocks={processBlocks} messageId={message.id} isStreaming={isStreaming} projectDirectory={projectDirectory} />
            <ResultBlocks blocks={resultBlocks} projectDirectory={projectDirectory} />
            <AgentMessageActions session={session} message={message} copyText={assistantText} disabled={isStreaming} />
          </>
        )}
      </div>
    </article>
  );
}