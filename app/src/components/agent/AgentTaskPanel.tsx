import { useMemo, useState } from "react";
import { useAgentConsoleSettings } from "../../agentConsoleSettings";
import type { AgentSession, AgentTaskItem } from "../../agent/types";
import { Icon } from "../Icons";

function latestTasks(session: AgentSession): AgentTaskItem[] {
  for (let messageIndex = session.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = session.messages[messageIndex];
    for (let blockIndex = message.blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const block = message.blocks[blockIndex];
      if (block.type === "task_list" && block.taskListState !== "pending") return block.tasks;
    }
  }
  return [];
}

function taskIconName(status: AgentTaskItem["status"]): string {
  if (status === "completed") return "check";
  if (status === "in-progress") return "spinner";
  return "minus";
}

function taskPriorityLabel(priority: AgentTaskItem["priority"]): string {
  if (priority === "high") return "高";
  if (priority === "medium") return "中";
  if (priority === "low") return "低";
  return "";
}

export function AgentTaskPanel({ session }: { session: AgentSession }) {
  const [expanded, setExpanded] = useState(false);
  const { taskPanelTemplateStyle } = useAgentConsoleSettings();
  const tasks = useMemo(() => latestTasks(session), [session]);

  if (tasks.length === 0) return null;

  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const inProgressTask = tasks.find((task) => task.status === "in-progress");

  return (
    <section className="agent-task-panel" data-expanded={expanded}>
      <div className="agent-task-panel-inner">
        <button type="button" className="agent-task-panel-toggle" onClick={() => setExpanded((value) => !value)}>
          <Icon name="chevron-right" size={13} className="agent-task-panel-caret" />
          <span>{`待办事项(${completedCount}/${tasks.length})`}</span>
          {!expanded && inProgressTask && <span className="agent-task-panel-current">· {inProgressTask.title}</span>}
        </button>
        <div className="agent-task-panel-body-shell" aria-hidden={!expanded}>
          <div className="agent-task-panel-body-clip">
            <div className="agent-task-panel-body" data-template={taskPanelTemplateStyle}>
              {tasks.map((task) => (
                <div key={task.id} className="agent-task-panel-row" data-status={task.status}>
                  <Icon name={taskIconName(task.status)} size={13} />
                  <span>{task.title}</span>
                  {task.priority && <span className="agent-task-priority" data-priority={task.priority} title={taskPriorityLabel(task.priority)} aria-label={taskPriorityLabel(task.priority)} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
