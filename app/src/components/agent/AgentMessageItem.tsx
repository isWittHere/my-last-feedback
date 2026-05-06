import type { CSSProperties } from "react";
import type { AgentContentBlock, AgentMessage } from "../../agent/types";
import { splitAgentMessageBlocks } from "../../agent/steps";
import { MarkdownContent } from "../MarkdownContent";
import { Icon } from "../Icons";
import { IdenticonAvatar } from "../IdenticonAvatar";
import { AgentProcessGroup } from "./AgentProcessGroup";

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

function actorInfo(message: AgentMessage): { alias: string; color: string; says: string } {
  if (message.role === "user") return { alias: "You", color: "#7c8cff", says: "你说:" };
  if (message.role === "system") return { alias: "System", color: "#f59e0b", says: "系统:" };
  return { alias: message.modelId || "OpenCode", color: "#0d9488", says: `${message.modelId || "OpenCode"} 说:` };
}

export function AgentMessageItem({ message, projectDirectory }: { message: AgentMessage; projectDirectory: string }) {
  const { processBlocks, resultBlocks } = splitAgentMessageBlocks(message);
  const { alias, color, says } = actorInfo(message);
  const userText = message.role === "user" ? resultBlocks.map(blockText).join("\n\n") : "";
  const isStreaming = message.status === "streaming";

  return (
    <article className={`agent-message agent-message-${message.role}`} data-role={message.role} data-msg-id={message.id} data-status={message.status}>
      <div className="agent-message-main" style={{ "--agent-actor-color": color } as CSSProperties}>
        <header className="agent-message-speaker">
          <IdenticonAvatar alias={alias} color={color} size={22} />
          <span>{says}</span>
        </header>
        {message.role === "user" ? (
          <MarkdownContent markdown={userText} projectDirectory={projectDirectory} className="agent-user-markdown" variant="feedback" enableComposerTokens />
        ) : (
          <>
            <AgentProcessGroup blocks={processBlocks} messageId={message.id} isStreaming={isStreaming} projectDirectory={projectDirectory} />
            <ResultBlocks blocks={resultBlocks} projectDirectory={projectDirectory} />
          </>
        )}
      </div>
    </article>
  );
}