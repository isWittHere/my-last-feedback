import { useMemo, useState } from "react";
import type { AgentSession, AgentTaskItem } from "../../agent/types";
import { Icon } from "../Icons";

function latestTasks(session: AgentSession): AgentTaskItem[] {
  for (let messageIndex = session.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = session.messages[messageIndex];
    for (let blockIndex = message.blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const block = message.blocks[blockIndex];
      if (block.type === "task_list" && block.tasks.length > 0) return block.tasks;
    }
  }
  return [];
}

function taskIconName(status: AgentTaskItem["status"]): string {
  if (status === "completed") return "check";
  if (status === "in-progress") return "spinner";
  return "minus";
}

export function AgentTaskPanel({ session }: { session: AgentSession }) {
  const [expanded, setExpanded] = useState(false);
  const tasks = useMemo(() => latestTasks(session), [session]);

  if (tasks.length === 0) return null;

  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const inProgressTask = tasks.find((task) => task.status === "in-progress");

  return (
    <section className="agent-task-panel" data-expanded={expanded}>
      <div className="agent-task-panel-inner">
        <button type="button" className="agent-task-panel-toggle" onClick={() => setExpanded((value) => !value)}>
          <Icon name="chevron-right" size={12} className="agent-task-panel-caret" />
          <span>{`待办事项(${completedCount}/${tasks.length})`}</span>
          {!expanded && inProgressTask && <span className="agent-task-panel-current">· {inProgressTask.title}</span>}
        </button>
        {expanded && (
          <div className="agent-task-panel-body">
            {tasks.map((task) => (
              <div key={task.id} className="agent-task-panel-row" data-status={task.status}>
                <Icon name={taskIconName(task.status)} size={15} />
                <span>{task.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
