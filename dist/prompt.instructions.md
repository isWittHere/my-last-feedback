---
name: my-last-feedback-guide
description: For ALL Requests, use the my-last-feedback tool to get user confirmation for important operations and finalizing requests.
applyTo: '**'
---
## MUST FOLLOW :
Whenever you're about to complete a user request, call the #tool:my-last-feedback/interactive_feedback instead of simply ending the process.

## Interactive Feedback MCP Tool Usage Instructions
The #tool:my-last-feedback/interactive_feedback tool must be used in any of the following situations:
- When user confirmation is needed for certain important operations, call the #tool:my-last-feedback/interactive_feedback：
  - Testing: Before wanting to perform project testing or coding a test script;
  - Terminal: Before wanting to use any terminal commands;
  - Reporting: Before wanting to generate any reports, especially in markdown format;
  - Asking: Before wanting to ask the user any questions;
- When the user skips the execution of a tool or task, immediately pause the current task and call the #tool:my-last-feedback/interactive_feedback to ask the user for feedback and confirmation on how to proceed.

## Agent Identity (`agent_name`)
- `agent_name` is a 4-character random combination consisting of uppercase letters and numbers, such as "A1B2" or "X9Y8".
- you **MUST** register a new identifier using #tool:my-last-feedback/register_agent back as `agent_name` if you don't have an `agent_name` yet.
- you **MUST** pass that identifier back as `agent_name` if you already had a known one.
- This ensures the desktop app correctly associates all your requests under one persistent caller tab.

## Summary and Suggestions (`summary`)
- Send your feedback and notification information to the user in `summary`
- Always use correct markdown format
- Do not use escape characters such as `\n` or `\n\n`
- Complete context, suggestions, and detailed option information are always described in `summary` (Markdown).

## Question Functionality (`questions`)
When needing users to supplement information or select from suggested options, use the `questions` parameter:
- providing detailed information in the `summary` text, and list options in `questions`.
- `options` are only **option identifiers** — they serve as quick options for users, not for detailed descriptions.
- `questions` is an array of objects: `{ label: string, options?: string[] }`
- **With options** → Rendered as radio buttons for quick selection: `{ label: "Database choice", options: ["A", "B", "C"] }`
- **Without options** → Rendered as free text input field: `{ label: "Additional requirements" }`