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
- `agent_name` is **REQUIRED** in every #tool:my-last-feedback/interactive_feedback call.
- If a hook context or previous feedback response already provided an `agent_name`, you **MUST** pass that exact identifier back.
- If you do not have an `agent_name` yet, generate one 4-character uppercase alphanumeric identifier once, then reuse it in all later calls.
- This ensures the desktop app correctly associates all your requests under one persistent caller tab.

## Request Type (`request_type`)
- `request_type` is **REQUIRED** in every #tool:my-last-feedback/interactive_feedback call. Never omit it.
- Allowed values only:
  - `explanation`: explaining current work or context
  - `question`: asking the user to choose or provide information
  - `completion`: reporting that the requested task is complete
  - `analysis_report`: reporting analysis findings or investigation details
  - `document_completed`: reporting that a document/report file has been completed
  - `verification_completed`: reporting that checks, tests, or validation have completed
  - `default`: fallback only when none of the above fits
- Pick the narrowest matching value. When a fix, implementation, or requested task is finished, use `completion`; use `verification_completed` only when the user's request is specifically to verify, check, or test something. For asking what to do next, use `question`.

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

## Required Call Shape
Before every #tool:my-last-feedback/interactive_feedback call, verify these fields are present:
- `project_directory`: full project path
- `summary`: standard Markdown with actual line breaks
- `request_name`: concise title shown in the window title bar
- `request_type`: one of the allowed values above
- `agent_name`: the persistent 4-character identifier

Example field choices:
- `request_name`: `Confirm implementation result`
- `request_type`: `completion`
- `agent_name`: `A1B2`

Example `summary` content must be written with actual Markdown line breaks:
```markdown
## Completed
- Updated the implementation.
- Validation passed.
```