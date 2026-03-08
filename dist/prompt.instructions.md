---
name: interactive-feedback
description: For ALL Requests, use the interactive-feedback tool to get user confirmation for important operations and finalizing requests.
applyTo: '**'
---
## MUST FOLLOW :
Whenever you're about to complete a user request, call the #tool:interactive-feedback/interactive_feedback instead of simply ending the process.

## Interactive Feedback MCP Tool Usage Instructions
The #tool:interactive-feedback/interactive_feedback tool must be used in any of the following situations:
- When user confirmation is needed for certain important operations, call the #tool:interactive-feedback/interactive_feedback：
  - Testing: Before wanting to perform project testing or coding a test script;
  - Terminal: Before wanting to use any terminal commands;
  - Reporting: Before wanting to generate any reports, especially in markdown format;
  - Asking: Before wanting to ask the user any questions;
- Whenever you're about to complete a user request, call the #tool:interactive-feedback/interactive_feedback instead of simply ending the process. 
- Keep calling #tool:interactive-feedback/interactive_feedback until the user's feedback is empty, then end the request.

## Agent Identity (agent_name)
- On your **first** call to #tool:interactive-feedback/interactive_feedback, leave `agent_name` empty or omit it.
- The response will contain a system message assigning you an agent identifier (e.g. `"B780"`).
- On **ALL subsequent** calls in this conversation, you **MUST** pass that identifier back as `agent_name`.
- This ensures the desktop app correctly associates all your requests under one persistent caller tab.

## Questions Feature
When you need the user to supplement information or choose from proposed options, use the `questions` parameter:
- `questions` is an array of objects: `{ label: string, options?: string[] }`
- **With options** → rendered as radio buttons for quick selection: `{ label: "Database choice", options: ["PostgreSQL", "SQLite", "MongoDB"] }`
- **Without options** → rendered as a free-text input field: `{ label: "Additional requirements" }`
- Questions are **short labels only** — they serve as a quick-fill list for the user, NOT for detailed descriptions.
- Always describe full context, proposals, and details in `summary` (Markdown). Use `questions` only for concise, actionable choices or brief input fields.
- Prefer questions over asking in summary text — questions provide structured responses that are easier to parse.
