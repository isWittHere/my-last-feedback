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
- `agent_name` is a 4-character random combination consisting of uppercase letters and numbers.
- `agent_name` is **REQUIRED** in every #tool:my-last-feedback/interactive_feedback call.
- You **MUST** pass back the exact identifier assigned by hook context or a previous feedback response.
- Do not invent or replace `agent_name`.
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
- **With options** → Rendered as radio buttons for quick selection: `{ label: "Database choice", options: ["XXXXXXXXX", "XXXXXXXXXX", "XXXXXXXXXX"] }`
- **Without options** → Rendered as free text input field: `{ label: "Additional requirements" }`
- 选项使用中文文本

## Don't use XML in `summary` or `questions`

## Request Type (`request_type`)
- `request_type` is **REQUIRED** in every #tool:my-last-feedback/interactive_feedback call. Never omit it.
- Allowed values only: `analysis`, `completion`, `planning`, `document`.

| Request Type | Description |
| --- | --- |
| `analysis` | Use when presenting analysis results, investigation details, reports, explanations, or general notes to the user. |
| `completion` | Use when indicating the completion of a user's order or process. |
| `planning` | Use when outlining plans, next steps, or strategies to the user. |
| `document` | Use for document-related tasks and document completion notices. |

- `request_type` is metadata for categorization and visual display only. It does not change tool behavior, permissions, routing, or available capabilities.
- you can still use `questions` in any request type when you need to ask the user questions or provide selectable options.

## 一次只能调用一个 #tool:my-last-feedback/interactive_feedback 工具，请勿并行调用多个。